const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  sanitizeError,
  generateJobId,
  s3,
} = require('../shared/utils');
const { DocumentJobService } = require('../shared/document-database');
const { auditService } = require('../shared/audit-service');
const { bedrockService } = require('../shared/bedrock-service');
const { query } = require('../shared/database');
const crypto = require('crypto');

/**
 * Premium Doctor Report Generation using AWS Bedrock Claude
 * POST /api/v1/process/doctor-report
 */
exports.handler = async (event) => {
  try {
    const userId = getUserIdFromEvent(event);

    if (!userId) {
      return createErrorResponse(401, 'MISSING_AUTHENTICATION', 'Invalid or missing authentication', 'Please sign in to generate doctor reports');
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'INVALID_JSON', 'Invalid JSON in request body', 'Please provide valid JSON data');
    }

    const { 
      document_id, 
      report_type = 'medical_summary',
      content_type = 'result',  // 'result' for document reports, 'report' for health data reports
      health_data    // For health data reports, Flutter app sends the exported health data
    } = body;

    // Validate request based on content type
    if (content_type === 'result' && !document_id) {
      return createErrorResponse(400, 'MISSING_DOCUMENT_ID', 'Missing document_id', 'Please provide a valid document_id for report generation');
    }
    
    if (content_type === 'report' && !health_data) {
      return createErrorResponse(400, 'MISSING_HEALTH_DATA', 'Missing health_data', 'Please provide health data for report generation');
    }

    // Enhanced audit logging
    await auditService.logAuditEvent({
      eventType: 'premium_feature',
      eventSubtype: content_type === 'report' ? 'health_data_report_request' : 'doctor_report_request',
      userId: userId,
      eventDetails: {
        documentId: document_id,
        reportType: report_type,
        contentType: content_type
      },
      dataClassification: 'medical_phi'
    });

    // Document-specific validation (only for document reports)
    if (content_type === 'result') {
      // For this implementation, we'll use job_id instead of document_id
      // since we don't have a separate documents table
      const jobId = document_id;
      
      // Get job record using PostgreSQL service
      const jobRecord = await DocumentJobService.getJob(jobId, userId);
      
      if (!jobRecord) {
        await auditService.logAuditEvent({
          eventType: 'premium_feature',
          eventSubtype: 'doctor_report_job_not_found',
          userId: userId,
          eventDetails: { jobId: jobId },
          dataClassification: 'medical_phi'
        });
        
        return createErrorResponse(404, 'DOCUMENT_NOT_FOUND', 'Document not found', 'The specified document could not be found or you do not have access to it');
      }

      // Check if processing is complete
      if (jobRecord.status !== 'completed') {
        return createErrorResponse(400, 'PROCESSING_INCOMPLETE', 'Document processing not complete', 'Please wait for document analysis to complete before generating reports');
      }
    }

    // Check user's premium status
    const isPremiumUser = await checkPremiumStatus(userId);
    if (!isPremiumUser) {
      return createErrorResponse(403, 'PREMIUM_REQUIRED', 'Premium subscription required for doctor reports', 'Upgrade to premium to generate professional medical reports');
    }

    let bedrockResult;
    let jobId;

    if (content_type === 'report') {
      // Health Data Report Flow - Generate new job and store health data in S3
      jobId = generateJobId();
      const correlationId = crypto.randomUUID();
      
      // Store health data in temporary S3 storage (same pattern as document uploads)
      const s3Key = `reports/${userId}/${jobId}/health_data_export.json`;
      const healthDataString = JSON.stringify(health_data);
      
      const uploadParams = {
        Bucket: process.env.TEMP_BUCKET_NAME,
        Key: s3Key,
        Body: healthDataString,
        ContentType: 'application/json',
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: process.env.KMS_KEY_ID,
        Metadata: {
          'original-filename': `health_data_export_${new Date().toISOString().split('T')[0]}.json`,
          'user-id': userId,
          'file-type': 'json',
          'upload-timestamp': Date.now().toString(),
          'job-id': jobId,
          'content-type': 'report',
          'job-type': 'doctor_report'
        },
        Tagging: 'Classification=PHI-Temporary&AutoDelete=true',
      };

      await s3.upload(uploadParams).promise();

      // Create job record in processing_jobs table (same pattern as uploads)
      const jobData = {
        jobId,
        userId,
        originalFilename: `health_data_export_${new Date().toISOString().split('T')[0]}.json`,
        sanitizedFilename: `health_data_export_${jobId}.json`,
        fileType: 'json',
        fileSize: healthDataString.length,
        s3Bucket: process.env.TEMP_BUCKET_NAME,
        s3Key,
        userAgent: event.headers?.['User-Agent'],
        sourceIp: event.requestContext?.identity?.sourceIp,
        sessionId: event.requestContext?.requestId,
        correlationId: correlationId
      };

      await DocumentJobService.createJob(jobData);
      
      // Enhanced processing started audit
      await auditService.logAuditEvent({
        eventType: 'premium_feature',
        eventSubtype: 'doctor_report_processing_started',
        userId: userId,
        eventDetails: {
          jobId: jobId,
          reportType: report_type,
          healthDataSizeKB: Math.round(healthDataString.length / 1024)
        },
        dataClassification: 'medical_phi'
      });

      // Update status to processing
      await DocumentJobService.updateJobStatus(jobId, 'processing', {
        processingStartedAt: Date.now(),
      }, userId);

      // Process with Bedrock synchronously (same pattern as document processing)
      const bedrockResult = await bedrockService.generateHealthDataReport(health_data, {
        userId: userId,
        reportType: report_type,
        jobId: jobId
      });

      // Handle Bedrock processing failure
      if (!bedrockResult.success) {
        await DocumentJobService.updateJobStatus(jobId, 'failed', {
          failedAt: Date.now(),
          errorMessage: bedrockResult.error.message,
        }, userId);

        return createErrorResponse(500, bedrockResult.error.code, bedrockResult.error.message, bedrockResult.error.user_action);
      }

      // Store results using unified approach
      await DocumentJobService.storeResultsToS3(jobId, {
        markdown_content: bedrockResult.report.report_content || bedrockResult.report.response_content || '',
        report_metadata: {
          title: bedrockResult.report.title || 'Doctor Report',
          summary: bedrockResult.report.summary || 'Comprehensive medical analysis report',
          confidence_score: bedrockResult.metadata.confidence_score || 8,
          report_type: report_type
        },
        jobMetadata: {
          aiModelUsed: bedrockResult.metadata.model_used,
          processingTimeMs: bedrockResult.metadata.processing_time_ms,
          token_usage: bedrockResult.metadata.token_usage,
          cost_estimate: bedrockResult.metadata.cost_estimate_cents
        }
      }, userId);

      // Update job status to completed
      await DocumentJobService.updateJobStatus(jobId, 'completed', {
        completedAt: Date.now(),
        processingDuration: bedrockResult.metadata.processing_time_ms,
      }, userId);

      // Clean up input health data file immediately after successful processing
      await cleanupS3File(s3Key);

      // Enhanced processing completed audit
      await auditService.logAuditEvent({
        eventType: 'premium_feature',
        eventSubtype: 'doctor_report_completed',
        userId: userId,
        eventDetails: {
          jobId: jobId,
          reportType: report_type,
          processingDurationMs: bedrockResult.metadata.processing_time_ms,
          tokenUsage: bedrockResult.metadata.token_usage,
          costCents: bedrockResult.metadata.cost_estimate_cents
        },
        dataClassification: 'medical_phi'
      });

      // Return success response with results (same pattern as document processing)
      return createResponse(200, {
        success: true,
        job_id: jobId,
        status: 'completed',
        message: 'Doctor report generated successfully.',
        processing_metadata: {
          model_used: bedrockResult.metadata.model_used,
          processing_time_ms: bedrockResult.metadata.processing_time_ms,
          token_usage: bedrockResult.metadata.token_usage,
          cost_estimate_cents: bedrockResult.metadata.cost_estimate_cents
        }
      });
    } else {
      // Document Report Flow (existing) - this remains synchronous as it uses existing results
      jobId = document_id;
      
      // Get existing analysis results
      const analysisResults = await DocumentJobService.getResults(jobId, userId);
      if (!analysisResults) {
        return createErrorResponse(404, 'ANALYSIS_NOT_FOUND', 'Analysis results not found', 'No analysis results available for this document');
      }

      // Generate comprehensive medical report using Bedrock (synchronous for document reports)
      const bedrockResult = await bedrockService.generateDoctorReport(analysisResults, {
        userId: userId,
        reportType: report_type,
        jobId: jobId
      });

      // Handle Bedrock processing failure for document reports
      if (!bedrockResult.success) {
        await auditService.logAuditEvent({
          eventType: 'premium_feature',
          eventSubtype: 'doctor_report_generation_failed',
          userId: userId,
          eventDetails: {
            jobId: jobId,
            errorCode: bedrockResult.error.code,
            errorCategory: bedrockResult.error.category
          },
          dataClassification: 'medical_phi'
        });

        return createErrorResponse(500, bedrockResult.error.code, bedrockResult.error.message, bedrockResult.error.user_action);
      }

      // Store report generation record for billing/tracking
      await storeReportRecord(userId, jobId, report_type, bedrockResult.metadata);

      // Enhanced success audit logging
      await auditService.logAuditEvent({
        eventType: 'premium_feature',
        eventSubtype: 'doctor_report_generated',
        userId: userId,
        eventDetails: {
          jobId: jobId,
          reportType: report_type,
          reportLength: bedrockResult.report.report_content?.length || 0,
          processingTimeMs: bedrockResult.metadata.processing_time_ms,
          tokenUsage: bedrockResult.metadata.token_usage,
          costCents: bedrockResult.metadata.cost_estimate_cents
        },
        dataClassification: 'medical_phi'
      });

      // Return synchronous response for document reports
      return createResponse(200, {
        success: true,
        report: {
          type: report_type,
          content: bedrockResult.report.report_content || bedrockResult.report.response_content,
          clinical_recommendations: bedrockResult.report.clinical_recommendations || bedrockResult.report.recommendations,
          disclaimers: bedrockResult.report.disclaimers,
          metadata: {
            generation_timestamp: new Date().toISOString(),
            model_used: bedrockResult.metadata.model_used,
            processing_time_ms: bedrockResult.metadata.processing_time_ms,
            token_usage: bedrockResult.metadata.token_usage,
            cost_estimate_cents: bedrockResult.metadata.cost_estimate_cents
          }
        },
        generated_at: new Date().toISOString(),
        document_info: {
          job_id: jobId,
          original_filename: analysisResults.originalFileName,
          processed_at: new Date(analysisResults.completedAt).toISOString(),
          ai_confidence: bedrockResult.metadata?.confidence_score || 'high'
        }
      });
    }

  } catch (error) {
    console.error('Doctor report error:', sanitizeError(error));
    
    const userId = getUserIdFromEvent(event) || 'unknown';
    
    // Mark job as failed if we have a jobId
    if (jobId) {
      try {
        await DocumentJobService.updateJobStatus(jobId, 'failed', {
          failedAt: Date.now(),
          errorMessage: sanitizeError(error).message?.substring(0, 500) || 'Unknown processing error',
        }, userId);

        await auditService.logAuditEvent({
          eventType: 'premium_feature',
          eventSubtype: 'doctor_report_processing_error',
          userId: userId,
          eventDetails: {
            jobId: jobId,
            error: sanitizeError(error).message?.substring(0, 100) || 'Unknown error'
          },
          dataClassification: 'system_error'
        });
      } catch (auditError) {
        console.error('Error logging processing failure:', auditError);
      }
    }
    
    return createErrorResponse(500, 'REPORT_GENERATION_FAILED', 'Failed to generate doctor report', 'An error occurred while generating your medical report. Please try again or contact support.');
  }
};

/**
 * Clean up S3 file after processing
 */
async function cleanupS3File(s3Key) {
  try {
    await s3.deleteObject({
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key,
    }).promise();
    
    console.log(`Cleaned up S3 file: ${s3Key}`);
  } catch (error) {
    console.error('S3 cleanup error:', error);
    // Don't throw - file will be cleaned up by lifecycle policy
  }
}

/**
 * Check premium subscription status
 */
async function checkPremiumStatus(userId) {
  try {
    // For now, allow all users to generate reports
    // In production, this would check subscription status from the users table
    
    // Get user's report generation count for basic rate limiting
    const reportCount = await getUserReportCount(userId);
    
    // Allow 1 free report per user per month, then require premium
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    return reportCount < 1; // First report is free for demo purposes
    
  } catch (error) {
    console.error('Premium status check error:', error);
    return false;
  }
}

/**
 * Get user's report generation count for current month
 */
async function getUserReportCount(userId) {
  try {
    // This would be implemented with proper subscription tracking
    // For now, return 0 to allow report generation
    const currentMonth = new Date().toISOString().substring(0, 7);
    
    // Query from report generation tracking (would be implemented in DocumentJobService)
    // const reportCount = await DocumentJobService.getMonthlyReportCount(userId, currentMonth);
    
    return 0; // Allow reports for demo
  } catch (error) {
    console.error('Error getting report count:', error);
    return 0;
  }
}

/**
 * Store report generation record for billing/tracking
 */
async function storeReportRecord(userId, jobId, reportType, metadata) {
  try {
    // Update job record with report generation info
    await DocumentJobService.updateJobStatus(jobId, 'completed', {
      reportGeneratedAt: Date.now(),
      reportType: reportType,
      reportTokenUsage: metadata.token_usage,
      reportCostCents: metadata.cost_estimate_cents,
      reportProcessingTimeMs: metadata.processing_time_ms
    }, userId);

    console.log(`Doctor report generated for user ${userId}, job ${jobId}, type ${reportType}`);
    console.log(`Report cost: ${metadata.cost_estimate_cents} cents, tokens: ${JSON.stringify(metadata.token_usage)}`);
  } catch (error) {
    console.error('Error storing report record:', error);
    // Don't throw - report was generated successfully
  }
}