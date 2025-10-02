const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  sanitizeError,
  withRetry,
  s3,
  categorizeError,
  createUnifiedError,
  ERROR_CATEGORIES
} = require('../shared/utils');
const { auditService } = require('../shared/audit-service');
const { ObservabilityService } = require('../shared/observability-service');

/**
 * Unified Status Tracking for All Job Types
 * GET /api/v1/process/status/{jobId}
 */
exports.handler = async (event) => {
  const startTime = Date.now();
  const observability = ObservabilityService.createForFunction('status', event);
  const sessionId = event.requestContext?.requestId || 'unknown';
  const sourceIp = event.requestContext?.identity?.sourceIp;
  const userAgent = event.headers?.['User-Agent'];

  try {
    const userId = getUserIdFromEvent(event);
    const jobId = event.pathParameters?.jobId;

    if (!userId) {
      const unifiedError = createUnifiedError(new Error('Missing authentication'), {
        service: 'status',
        operation: 'authentication',
        category: ERROR_CATEGORIES.BUSINESS
      });
      
      await auditService.logAuditEvent({
        eventType: 'access_control',
        eventSubtype: 'unauthenticated_status_access',
        userId: 'unauthenticated',
        eventDetails: {
          correlationId: unifiedError.correlationId,
          jobId: event.pathParameters?.jobId
        },
        dataClassification: 'security_event'
      }).catch(() => {});
      
      return createErrorResponse(401, 'MISSING_AUTHENTICATION', 'Invalid or missing authentication', 'Please sign in to check status');
    }

    if (!jobId) {
      const unifiedError = createUnifiedError(new Error('Missing job ID'), {
        service: 'status',
        operation: 'input_validation',
        userId: userId,
        category: ERROR_CATEGORIES.VALIDATION
      });
      
      await auditService.logAuditEvent({
        eventType: 'validation',
        eventSubtype: 'missing_job_id',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId
        },
        dataClassification: 'validation_error'
      }).catch(() => {});
      
      return createErrorResponse(400, 'MISSING_JOB_ID', 'Missing job ID', 'Please provide a valid job ID to check status');
    }

    // Validate job ID format and ownership
    const jobIdValidation = validateJobIdOwnership(jobId, userId);
    if (!jobIdValidation.valid) {
      await auditService.logAuditEvent({
        eventType: 'security_violation',
        eventSubtype: 'invalid_job_access_attempt',
        userId: userId,
        eventDetails: {
          jobId: jobId,
          reason: jobIdValidation.reason
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'security_event'
      });
      
      return createErrorResponse(jobIdValidation.statusCode, jobIdValidation.errorCode, jobIdValidation.message, jobIdValidation.userMessage);
    }

    // Enhanced audit logging
    await auditService.logAuditEvent({
      eventType: 'document_processing',
      eventSubtype: 'status_check',
      userId: userId,
      eventDetails: {
        jobId: jobId
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      userAgent: userAgent,
      dataClassification: 'medical_phi'
    });

    // Track status check request
    await observability.trackUserJourney(userId, 'status_check_requested', {
      jobId: jobId,
      jobType: jobId.split('_')[0]
    });

    // Check outgoing folder first (highest priority)
    const outgoingResponse = await getJobResponseFromS3(jobId);
    
    if (outgoingResponse) {
      // Response is ready - check if successful or failed
      if (outgoingResponse.status === 'failed') {
        await auditService.logAuditEvent({
          eventType: 'document_processing',
          eventSubtype: 'status_failed_retrieved',
          userId: userId,
          eventDetails: {
            jobId: jobId,
            errorCode: outgoingResponse.error?.code
          },
          sessionId: sessionId,
          sourceIp: sourceIp,
          dataClassification: 'system_error'
        });

        return createErrorResponse(500, 
          outgoingResponse.error?.code || 'PROCESSING_FAILED',
          outgoingResponse.error?.message || 'Processing failed',
          outgoingResponse.error?.user_action || 'Please try again or contact support'
        );
      }

      // Successful completion
      return createResponse(200, {
        success: true,
        status: 'complete',
        job_id: jobId,
        message: 'Processing completed successfully'
      });
    }

    // Check incoming folder for processing status
    const incomingExists = await checkJobExistsInS3('incoming', jobId);
    
    if (incomingExists) {
      // Still processing
      return createResponse(202, {
        success: true,
        status: 'processing',
        job_id: jobId,
        message: 'Job is being processed',
        estimated_completion_seconds: 30
      });
    }

    // Neither incoming nor outgoing exists - job not found
    await auditService.logAuditEvent({
      eventType: 'document_processing',
      eventSubtype: 'status_job_not_found',
      userId: userId,
      eventDetails: {
        jobId: jobId
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      dataClassification: 'medical_phi'
    });

    return createErrorResponse(404, 'JOB_NOT_FOUND', 'Job not found', 'The requested job does not exist or has expired');

  } catch (error) {
    console.error('Status check error:', sanitizeError(error));

    const userId = getUserIdFromEvent(event) || 'unknown';
    const jobId = event.pathParameters?.jobId || 'unknown';

    await observability.trackError(error, 'status_check', userId);

    const errorContext = {
      service: 'status',
      operation: 'status_check',
      userId: userId,
      jobId: jobId
    };
    const unifiedError = createUnifiedError(error, errorContext);

    await auditService.logAuditEvent({
      eventType: 'document_processing',
      eventSubtype: 'status_check_error',
      userId: userId,
      eventDetails: {
        correlationId: unifiedError.correlationId,
        errorCategory: unifiedError.category,
        recoveryStrategy: unifiedError.recoveryStrategy,
        jobId: jobId,
        error: sanitizeError(error).message?.substring(0, 100) || 'Unknown error'
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      userAgent: userAgent,
      dataClassification: 'system_error'
    }).catch(() => {});

    // Use categorized error response
    if (unifiedError.category === ERROR_CATEGORIES.VALIDATION) {
      return createErrorResponse(400, 'VALIDATION_ERROR', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.BUSINESS) {
      return createErrorResponse(403, 'ACCESS_DENIED', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.EXTERNAL) {
      return createErrorResponse(503, 'SERVICE_UNAVAILABLE', 'External service failure', 'Our status service is temporarily unavailable. Please try again shortly');
    } else {
      return createErrorResponse(500, 'STATUS_CHECK_FAILED', 'Failed to retrieve processing status', 'We had trouble checking your processing status. Please try again');
    }
  }
};



/**
 * Validate job ID format and ownership (from chat-status.js)
 */
function validateJobIdOwnership(jobId, userId) {
  try {
    // Job ID format: {prefix}_{user_id}_{timestamp}_{random}
    const parts = jobId.split('_');
    
    if (parts.length !== 4) {
      return {
        valid: false,
        statusCode: 400,
        errorCode: 'INVALID_JOB_ID_FORMAT',
        message: 'Invalid job ID format',
        userMessage: 'Invalid job ID. Please check your request.',
        reason: 'invalid_format'
      };
    }

    const [prefix, jobUserId, timestamp, random] = parts;
    
    // Validate prefix
    const validPrefixes = ['result', 'chat', 'report'];
    if (!validPrefixes.includes(prefix)) {
      return {
        valid: false,
        statusCode: 400,
        errorCode: 'INVALID_JOB_ID_PREFIX',
        message: 'Invalid job ID prefix',
        userMessage: 'Invalid job ID format.',
        reason: 'invalid_prefix'
      };
    }
    
    if (jobUserId !== userId) {
      return {
        valid: false,
        statusCode: 404,
        errorCode: 'INVALID_JOB_ID',
        message: 'Job ID not found or invalid format',
        userMessage: "Job not found or access denied.",
        reason: 'ownership_mismatch'
      };
    }

    // Check if timestamp is reasonable (not too old or in future)
    const timestampNum = parseInt(timestamp);
    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
    const oneHourInFuture = now + (60 * 60 * 1000);

    if (isNaN(timestampNum) || timestampNum < twentyFourHoursAgo || timestampNum > oneHourInFuture) {
      return {
        valid: false,
        statusCode: 404,
        errorCode: 'EXPIRED_JOB_ID',
        message: 'Job ID expired or invalid timestamp',
        userMessage: 'This job has expired. Please start a new request.',
        reason: 'expired_timestamp'
      };
    }

    return { valid: true };

  } catch (error) {
    return {
      valid: false,
      statusCode: 400,
      errorCode: 'INVALID_JOB_ID',
      message: 'Invalid job ID format',
      userMessage: 'Invalid job ID. Please check your request.',
      reason: 'validation_error'
    };
  }
}

/**
 * Get job response from S3 outgoing folder
 */
async function getJobResponseFromS3(jobId) {
  try {
    const s3Key = `outgoing/${jobId}`;
    
    const params = {
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key
    };

    const result = await withRetry(
      () => s3.getObject(params).promise(),
      3,
      500,
      `S3 getObject for job ${jobId}`
    );
    
    return JSON.parse(result.Body.toString());

  } catch (error) {
    if (error.code === 'NoSuchKey') {
      // Response not ready yet
      return null;
    }
    
    console.error('Error retrieving job response from S3:', error);
    throw new Error(`Failed to retrieve job response: ${error.message}`);
  }
}

/**
 * Check if job exists in S3 folder
 */
async function checkJobExistsInS3(folder, jobId) {
  try {
    const s3Key = `${folder}/${jobId}`;
    
    const params = {
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key
    };

    await withRetry(
      () => s3.headObject(params).promise(),
      3,
      500,
      `S3 headObject check for ${folder}/${jobId}`
    );
    return true;

  } catch (error) {
    if (error.code === 'NotFound' || error.code === 'NoSuchKey') {
      return false;
    }
    
    console.error('Error checking S3 object existence:', error);
    throw new Error(`Failed to check S3 object: ${error.message}`);
  }
}