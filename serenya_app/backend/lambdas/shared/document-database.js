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
        SELECT create_processing_job($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as job_uuid
      `, [
        jobId,
        userId,
        encryptedData.original_filename,
        encryptedData.sanitized_filename,
        fileType,
        fileSize,
        s3Bucket,
        s3Key,
        userAgent,
        sourceIp
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
   * Store processing results with encryption
   */
  async storeResults(jobId, results, userId = null) {
    try {
      // Get job record
      const job = await this.getJob(jobId, userId);
      if (!job) {
        throw new Error('Job not found');
      }

      // Create encryption context for results
      const encryptionContext = {
        userId: job.user_id,
        jobId: jobId,
        dataType: 'processing_results'
      };

      // Encrypt sensitive result data
      const encryptedResults = await encryptFields({
        interpretation_text: results.interpretationText,
        detailed_interpretation: results.detailedInterpretation,
        medical_flags: JSON.stringify(results.medicalFlags || []),
        recommendations: JSON.stringify(results.recommendations || []),
        disclaimers: JSON.stringify(results.disclaimers || []),
        safety_warnings: JSON.stringify(results.safetyWarnings || [])
      }, [
        'interpretation_text',
        'detailed_interpretation', 
        'medical_flags',
        'recommendations',
        'disclaimers',
        'safety_warnings'
      ], process.env.KMS_KEY_ID, encryptionContext);

      // Store results
      const resultRecord = await query(`
        INSERT INTO processing_results (
          job_id, confidence_score, interpretation_text, detailed_interpretation,
          medical_flags, recommendations, disclaimers, safety_warnings,
          ai_model_used, ai_processing_time_ms, ai_token_usage, ai_cost_estimate,
          extracted_text_length, text_extraction_method, text_extraction_confidence,
          data_classification
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id
      `, [
        job.id, // Use internal UUID
        results.confidenceScore,
        encryptedResults.interpretation_text,
        encryptedResults.detailed_interpretation,
        encryptedResults.medical_flags,
        encryptedResults.recommendations,
        encryptedResults.disclaimers,
        encryptedResults.safety_warnings,
        results.aiModelUsed || 'claude-3-sonnet-20240229',
        results.processingTimeMs,
        JSON.stringify(results.tokenUsage || {}),
        results.costEstimate || 0,
        results.extractedTextLength,
        results.textExtractionMethod,
        results.textExtractionConfidence,
        'medical_phi'
      ]);

      // Log result storage event
      await this.logJobEvent({
        jobUuid: job.id,
        eventType: 'processing',
        eventSubtype: 'results_stored',
        eventStatus: 'success',
        eventMessage: 'Processing results stored successfully',
        eventDetails: {
          confidenceScore: results.confidenceScore,
          flagsCount: (results.medicalFlags || []).length,
          recommendationsCount: (results.recommendations || []).length
        },
        userId: job.user_id
      });

      return resultRecord.rows[0].id;

    } catch (error) {
      throw new Error(`Failed to store results: ${error.message}`);
    }
  },

  /**
   * Get processing results with decryption
   */
  async getResults(jobId, userId = null) {
    try {
      const job = await this.getJob(jobId, userId);
      if (!job) {
        throw new Error('Job not found');
      }

      const result = await query(`
        SELECT * FROM processing_results 
        WHERE job_id = $1
      `, [job.id]);

      if (!result.rows[0]) {
        return null;
      }

      const encryptedResults = result.rows[0];

      // Decrypt sensitive fields
      const decryptedResults = await decryptFields(encryptedResults, [
        'interpretation_text',
        'detailed_interpretation',
        'medical_flags', 
        'recommendations',
        'disclaimers',
        'safety_warnings'
      ]);

      return {
        ...decryptedResults,
        medicalFlags: JSON.parse(decryptedResults.medical_flags || '[]'),
        recommendations: JSON.parse(decryptedResults.recommendations || '[]'),
        disclaimers: JSON.parse(decryptedResults.disclaimers || '[]'),
        safetyWarnings: JSON.parse(decryptedResults.safety_warnings || '[]'),
        aiTokenUsage: JSON.parse(encryptedResults.ai_token_usage || '{}')
      };

    } catch (error) {
      throw new Error(`Failed to retrieve results: ${error.message}`);
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