const { query, transaction } = require('./database');
const { auditService } = require('./audit-service');
const { securityMonitoring } = require('./security-monitoring');
const { encryptFields, decryptFields } = require('./encryption');
const crypto = require('crypto');

/**
 * Enhanced Document Processing Database Service
 * Integrates with PostgreSQL, audit logging, and security monitoring
 * Replaces DynamoDB with PostgreSQL for architectural consistency
 */

/**
 * Job Management Service for Document Processing
 */
const DocumentJobService = {
  
  /**
   * Create a new processing job with comprehensive audit logging
   */
  async createJob(jobData) {
    const {
      jobId,
      userId,
      originalFilename,
      sanitizedFilename,
      fileType,
      fileSize,
      s3Bucket,
      s3Key,
      userAgent,
      sourceIp,
      fileChecksum,
      encryptionKeyId
    } = jobData;

    try {
      // Create encryption context for sensitive job data
      const encryptionContext = {
        userId: userId,
        jobId: jobId,
        dataType: 'processing_job'
      };

      // Encrypt sensitive filename information
      const encryptedData = await encryptFields({
        original_filename: originalFilename,
        sanitized_filename: sanitizedFilename
      }, ['original_filename', 'sanitized_filename'], 
      process.env.KMS_KEY_ID, encryptionContext);

      // Create job record using stored procedure
      const result = await query(`
        SELECT create_processing_job($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) as job_uuid
      `, [
        jobId,
        userId,
        encryptedData.original_filename,
        encryptedData.sanitized_filename,
        fileType,
        fileSize,
        s3Bucket,
        s3Key,
        fileChecksum,
        encryptionKeyId,
        userAgent,
        sourceIp,
        jobData.sessionId,
        jobData.correlationId
      ]);

      const jobUuid = result.rows[0].job_uuid;

      // Log comprehensive audit event
      await auditService.logAuditEvent({
        eventType: 'document_processing',
        eventSubtype: 'job_created',
        userId: userId,
        eventDetails: {
          jobId: jobId,
          fileType: fileType,
          fileSizeKB: Math.round(fileSize / 1024),
          securityValidated: true,
          encryptionEnabled: true
        },
        sessionId: jobData.sessionId,
        sourceIp: sourceIp,
        userAgent: userAgent,
        dataClassification: 'medical_phi',
        gdprLawfulBasis: 'consent',
        retentionYears: 7
      });

      // Log job creation event
      await this.logJobEvent({
        jobUuid: jobUuid,
        eventType: 'upload',
        eventSubtype: 'job_created',
        eventStatus: 'success',
        eventMessage: 'Processing job created successfully',
        userId: userId,
        sessionId: jobData.sessionId,
        sourceIp: sourceIp,
        userAgent: userAgent,
        correlationId: jobData.correlationId
      });

      return {
        jobUuid: jobUuid,
        jobId: jobId,
        status: 'uploaded',
        createdAt: new Date().toISOString()
      };

    } catch (error) {
      // Log audit failure
      await auditService.logAuditEvent({
        eventType: 'document_processing',
        eventSubtype: 'job_creation_failed',
        userId: userId,
        eventDetails: {
          jobId: jobId,
          error: error.message.substring(0, 100)
        },
        sessionId: jobData.sessionId,
        sourceIp: sourceIp,
        dataClassification: 'medical_phi'
      });

      throw error;
    }
  },

  /**
   * Get job record with decryption
   */
  async getJob(jobId, userId = null) {
    try {
      let jobQuery = `
        SELECT * FROM processing_jobs 
        WHERE job_id = $1
      `;
      let queryParams = [jobId];

      // Add user verification if provided
      if (userId) {
        jobQuery += ` AND user_id = $2`;
        queryParams.push(userId);
      }

      const result = await query(jobQuery, queryParams);
      
      if (!result.rows[0]) {
        return null;
      }

      const job = result.rows[0];

      // Decrypt sensitive fields
      const decryptedJob = await decryptFields(job, [
        'original_filename', 
        'sanitized_filename'
      ]);

      return {
        ...decryptedJob,
        jobId: job.job_id,
        userId: job.user_id,
        status: job.status,
        fileType: job.file_type,
        fileSize: job.file_size,
        uploadedAt: job.uploaded_at,
        processingStartedAt: job.processing_started_at,
        completedAt: job.completed_at,
        retryCount: job.retry_count,
        errorMessage: job.error_message,
        progressPercentage: job.progress_percentage
      };

    } catch (error) {
      throw new Error(`Failed to retrieve job: ${error.message}`);
    }
  },

  /**
   * Update job status with comprehensive tracking
   */
  async updateJobStatus(jobId, status, additionalData = {}, userId = null) {
    try {
      // Update job status using stored procedure
      await query(`
        SELECT update_job_status($1, $2, $3, $4) as success
      `, [
        jobId,
        status,
        additionalData.errorMessage || null,
        additionalData.retryCount || null
      ]);

      // Get job UUID for event logging
      const job = await this.getJob(jobId, userId);
      if (!job) {
        throw new Error('Job not found');
      }

      // Log status change event
      await this.logJobEvent({
        jobUuid: job.id,
        eventType: 'processing',
        eventSubtype: `status_${status}`,
        eventStatus: status === 'failed' ? 'error' : 'success',
        eventMessage: `Job status updated to ${status}`,
        eventDetails: {
          previousStatus: job.status,
          newStatus: status,
          retryCount: additionalData.retryCount,
          processingDurationMs: additionalData.processingDurationMs
        },
        userId: job.user_id,
        correlationId: additionalData.correlationId
      });

      // Log audit event for status changes
      await auditService.logAuditEvent({
        eventType: 'document_processing',
        eventSubtype: `job_${status}`,
        userId: job.user_id,
        eventDetails: {
          jobId: jobId,
          status: status,
          retryCount: additionalData.retryCount || 0,
          errorCode: additionalData.errorCode
        },
        dataClassification: 'medical_phi'
      });

      // Trigger security monitoring for failed jobs
      if (status === 'failed' || status === 'timeout') {
        await securityMonitoring.processingFailure(
          job.user_id,
          jobId,
          job.source_ip,
          job.user_agent,
          additionalData.correlationId || 'unknown',
          additionalData.errorMessage || 'Processing failed'
        );
      }

      return true;

    } catch (error) {
      throw new Error(`Failed to update job status: ${error.message}`);
    }
  },

  /**
   * Store processing results in S3 (no database storage per architecture)
   */
  async storeResultsToS3(jobId, results, userId = null) {
    try {
      // Get job record
      const job = await this.getJob(jobId, userId);
      if (!job) {
        throw new Error('Job not found');
      }

      // Results are stored in S3 by the processing service
      // This method is for updating job status with S3 location
      const s3ResultKey = `results/${job.user_id}/${jobId}/result.json`;
      
      // Update job record with S3 result location
      await query(`
        UPDATE processing_jobs 
        SET 
          s3_result_bucket = $1,
          s3_result_key = $2,
          confidence_score = $3,
          ai_model_used = $4,
          ai_processing_time_ms = $5,
          extracted_text_length = $6,
          text_extraction_method = $7
        WHERE job_id = $8
      `, [
        process.env.TEMP_BUCKET_NAME,
        s3ResultKey,
        results.confidenceScore,
        results.aiModelUsed || 'claude-3-sonnet-20240229',
        results.processingTimeMs,
        results.extractedTextLength,
        results.textExtractionMethod,
        jobId
      ]);

      // Log result storage event
      await this.logJobEvent({
        jobUuid: job.id,
        eventType: 'processing',
        eventSubtype: 'results_stored',
        eventStatus: 'success',
        eventMessage: 'Processing results stored in S3',
        eventDetails: {
          confidenceScore: results.confidenceScore,
          s3ResultKey: s3ResultKey,
          flagsCount: (results.medicalFlags || []).length,
          recommendationsCount: (results.recommendations || []).length
        },
        userId: job.user_id
      });

      return s3ResultKey;

    } catch (error) {
      throw new Error(`Failed to store results to S3: ${error.message}`);
    }
  },

  /**
   * Get S3 location for processing results (client fetches from S3 directly)
   */
  async getResultsLocation(jobId, userId = null) {
    try {
      const job = await this.getJob(jobId, userId);
      if (!job) {
        throw new Error('Job not found');
      }

      // Return S3 location for client to fetch results
      if (job.s3_result_bucket && job.s3_result_key) {
        return {
          bucket: job.s3_result_bucket,
          key: job.s3_result_key,
          confidenceScore: job.confidence_score,
          aiModelUsed: job.ai_model_used,
          processingTimeMs: job.ai_processing_time_ms,
          extractedTextLength: job.extracted_text_length,
          textExtractionMethod: job.text_extraction_method
        };
      }

      return null;

    } catch (error) {
      throw new Error(`Failed to get results location: ${error.message}`);
    }
  },

  /**
   * Log job-specific events with comprehensive context
   */
  async logJobEvent(eventData) {
    const {
      jobUuid,
      eventType,
      eventSubtype,
      eventStatus,
      eventMessage,
      eventDetails = {},
      userId,
      sessionId,
      sourceIp,
      userAgent,
      correlationId,
      processingTimeMs
    } = eventData;

    try {
      // Create privacy-safe user hash
      const userIdHash = crypto.createHash('sha256')
        .update(userId.toString())
        .digest('hex');

      await query(`
        INSERT INTO processing_job_events (
          job_id, event_type, event_subtype, event_status,
          event_message, event_details, user_id_hash,
          session_id, correlation_id, user_agent, source_ip,
          processing_time_ms, data_classification
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        jobUuid,
        eventType,
        eventSubtype,
        eventStatus,
        eventMessage,
        JSON.stringify(eventDetails),
        userIdHash,
        sessionId,
        correlationId,
        userAgent,
        sourceIp,
        processingTimeMs,
        'medical_phi'
      ]);

    } catch (error) {
      console.error('Job event logging failed:', error);
      // Don't throw - event logging failure shouldn't break job processing
    }
  },

  /**
   * Get jobs requiring retry
   */
  async getRetryableJobs() {
    try {
      const result = await query(`
        SELECT job_id, retry_count, scheduled_retry_at 
        FROM processing_jobs 
        WHERE status = 'retrying' 
          AND scheduled_retry_at <= CURRENT_TIMESTAMP
          AND retry_count < max_retries
        ORDER BY scheduled_retry_at ASC
        LIMIT 100
      `);

      return result.rows;

    } catch (error) {
      throw new Error(`Failed to get retryable jobs: ${error.message}`);
    }
  },

  /**
   * Cleanup expired jobs
   */
  async cleanupExpiredJobs() {
    try {
      const result = await query(`SELECT cleanup_expired_jobs() as deleted_count`);
      const deletedCount = result.rows[0].deleted_count;

      // Log cleanup operation
      await auditService.logAuditEvent({
        eventType: 'system_maintenance',
        eventSubtype: 'job_cleanup',
        userId: 'system',
        eventDetails: {
          deletedJobsCount: deletedCount,
          cleanupReason: 'ttl_expired'
        },
        dataClassification: 'system_operation'
      });

      return deletedCount;

    } catch (error) {
      throw new Error(`Failed to cleanup expired jobs: ${error.message}`);
    }
  }
};

/**
 * Security validation service for document processing
 */
const DocumentSecurityService = {
  
  /**
   * Record security validation results
   */
  async recordSecurityValidation(jobId, validationResults) {
    try {
      await query(`
        UPDATE processing_jobs 
        SET 
          security_scan_passed = $1,
          magic_number_validated = $2,
          file_integrity_verified = $3
        WHERE job_id = $4
      `, [
        validationResults.securityScanPassed,
        validationResults.magicNumberValidated,
        validationResults.fileIntegrityVerified,
        jobId
      ]);

      // Log security validation
      await auditService.logAuditEvent({
        eventType: 'security_validation',
        eventSubtype: 'document_scan',
        userId: validationResults.userId,
        eventDetails: {
          jobId: jobId,
          scanResults: validationResults,
          securityPassed: validationResults.securityScanPassed
        },
        dataClassification: 'security_event'
      });

    } catch (error) {
      throw new Error(`Failed to record security validation: ${error.message}`);
    }
  },

  /**
   * Check for suspicious upload patterns
   */
  async detectSuspiciousActivity(userId, sourceIp, userAgent) {
    try {
      // Check for rapid uploads from same user/IP
      const recentUploads = await query(`
        SELECT COUNT(*) as upload_count
        FROM processing_jobs 
        WHERE user_id = $1 
          AND created_at > CURRENT_TIMESTAMP - INTERVAL '5 minutes'
      `, [userId]);

      const uploadCount = parseInt(recentUploads.rows[0].upload_count);
      
      if (uploadCount > 10) {
        await securityMonitoring.suspiciousActivity(
          userId,
          'rapid_uploads',
          sourceIp,
          userAgent,
          'system',
          `${uploadCount} uploads in 5 minutes`
        );
        
        return {
          suspicious: true,
          reason: 'rapid_uploads',
          count: uploadCount
        };
      }

      return { suspicious: false };

    } catch (error) {
      console.error('Suspicious activity detection failed:', error);
      return { suspicious: false, error: true };
    }
  }
};

module.exports = {
  DocumentJobService,
  DocumentSecurityService
};