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
 * Results Retrieval for All Job Types
 * GET /api/v1/process/result/{jobId}
 */
exports.handler = async (event) => {
  const startTime = Date.now();
  const observability = ObservabilityService.createForFunction('result', event);
  const sessionId = event.requestContext?.requestId || 'unknown';
  const sourceIp = event.requestContext?.identity?.sourceIp;
  const userAgent = event.headers?.['User-Agent'];

  try {
    const userId = getUserIdFromEvent(event);
    const jobId = event.pathParameters?.jobId;

    if (!userId) {
      const unifiedError = createUnifiedError(new Error('Missing authentication'), {
        service: 'result',
        operation: 'authentication',
        category: ERROR_CATEGORIES.BUSINESS
      });
      
      await auditService.logAuditEvent({
        eventType: 'access_control',
        eventSubtype: 'unauthenticated_result_access',
        userId: 'unauthenticated',
        eventDetails: {
          correlationId: unifiedError.correlationId,
          jobId: event.pathParameters?.jobId
        },
        dataClassification: 'security_event'
      }).catch(() => {});
      
      return createErrorResponse(401, 'MISSING_AUTHENTICATION', 'Invalid or missing authentication', 'Please sign in to retrieve results');
    }

    if (!jobId) {
      const unifiedError = createUnifiedError(new Error('Missing job ID'), {
        service: 'result',
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
      
      return createErrorResponse(400, 'MISSING_JOB_ID', 'Missing job ID', 'Please provide a valid job ID to retrieve results');
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

    // Enhanced audit logging for result request
    await auditService.logAuditEvent({
      eventType: 'document_processing',
      eventSubtype: 'result_request',
      userId: userId,
      eventDetails: {
        jobId: jobId
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      userAgent: userAgent,
      dataClassification: 'medical_phi'
    });

    // Get results from S3 outgoing folder
    const jobResults = await getJobResultsFromS3(jobId);
    
    if (!jobResults) {
      await auditService.logAuditEvent({
        eventType: 'document_processing',
        eventSubtype: 'result_job_not_found',
        userId: userId,
        eventDetails: { jobId: jobId },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'medical_phi'
      });
      return createErrorResponse(404, 'RESULTS_NOT_FOUND', 'Results not found', 'The results for this job are not yet available or do not exist');
    }

    // Check if job failed
    if (jobResults.status === 'failed') {
      await auditService.logAuditEvent({
        eventType: 'document_processing',
        eventSubtype: 'result_failed_retrieved',
        userId: userId,
        eventDetails: {
          jobId: jobId,
          errorCode: jobResults.error?.code
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'system_error'
      });

      return createErrorResponse(500, 
        jobResults.error?.code || 'PROCESSING_FAILED',
        jobResults.error?.message || 'Processing failed',
        jobResults.error?.user_action || 'Please try again or contact support'
      );
    }

    // Success audit logging
    await auditService.logAuditEvent({
      eventType: 'document_processing',
      eventSubtype: 'result_retrieved',
      userId: userId,
      eventDetails: {
        jobId: jobId,
        resultType: jobResults.result_type || 'unknown'
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      userAgent: userAgent,
      dataClassification: 'medical_phi'
    });

    // Parse and format results based on job type
    const parsedResults = parseJobResults(jobId, jobResults);

    // Track user journey for results viewed
    await observability.trackUserJourney(userId, 'results_viewed', {
      jobId: jobId,
      jobType: jobId.split('_')[0],
      resultType: jobResults.result_type || 'unknown'
    });

    // Return the results
    return createResponse(200, {
      success: true,
      job_id: jobId,
      ...parsedResults
    });

  } catch (error) {
    console.error('Result retrieval error:', sanitizeError(error));

    const userId = getUserIdFromEvent(event) || 'unknown';
    const jobId = event.pathParameters?.jobId || 'unknown';

    await observability.trackError(error, 'result_retrieval', userId);

    const errorContext = {
      service: 'result',
      operation: 'result_retrieval',
      userId: userId,
      jobId: jobId
    };
    const unifiedError = createUnifiedError(error, errorContext);

    await auditService.logAuditEvent({
      eventType: 'document_processing',
      eventSubtype: 'result_retrieval_error',
      userId: userId,
      eventDetails: {
        correlationId: unifiedError.correlationId,
        errorCategory: unifiedError.category,
        recoveryStrategy: unifiedError.recoveryStrategy,
        jobId: jobId,
        error: sanitizeError(error).message?.substring(0, 100) || 'Unknown error'
      },
      dataClassification: 'system_error'
    }).catch(() => {});

    // Use categorized error response
    if (unifiedError.category === ERROR_CATEGORIES.VALIDATION) {
      return createErrorResponse(400, 'VALIDATION_ERROR', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.BUSINESS) {
      return createErrorResponse(403, 'ACCESS_DENIED', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.EXTERNAL) {
      return createErrorResponse(503, 'SERVICE_UNAVAILABLE', 'External service failure', 'Our results service is temporarily unavailable. Please try again shortly');
    } else {
      return createErrorResponse(500, 'RESULT_RETRIEVAL_FAILED', 'Failed to retrieve results', 'We had trouble getting your results. Please try again');
    }
  }
};


/**
 * Validate job ID format and ownership
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
 * Get job results from S3 outgoing folder
 */
async function getJobResultsFromS3(jobId) {
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
      // Results not ready yet
      return null;
    }
    
    console.error('Error retrieving job results from S3:', error);
    throw new Error(`Failed to retrieve job results: ${error.message}`);
  }
}

/**
 * Parse and format job results based on job type
 */
function parseJobResults(jobId, rawResults) {
  const jobType = getJobTypeFromId(jobId);
  
  switch (jobType) {
    case 'result':
      return parseMedicalAnalysisResults(rawResults);
    case 'report':
      return parseHealthDataReportResults(rawResults);
    case 'chat':
      return parseChatResults(rawResults);
    default:
      // Return raw results for unknown types
      return rawResults;
  }
}

/**
 * Get job type from job ID prefix
 */
function getJobTypeFromId(jobId) {
  const prefix = jobId.split('_')[0];
  return prefix; // 'result', 'chat', 'report'
}

/**
 * Parse medical analysis results (result_ jobs)
 */
function parseMedicalAnalysisResults(rawResults) {
  try {
    // Extract shared structure
    const baseResult = {
      title: rawResults.title || 'Medical Analysis Results',
      confidence_score: rawResults.extraction_metadata?.confidence_score || 5,
      summary: rawResults.extraction_metadata?.summary || 'Medical analysis completed',
      medical_flags: rawResults.extraction_metadata?.medical_flags || [],
      generated_at: rawResults.generated_at || new Date().toISOString()
    };

    // Extract structured data for results
    if (rawResults.lab_results || rawResults.vitals) {
      baseResult.structured_data = {
        lab_results: rawResults.lab_results || [],
        vitals: rawResults.vitals || []
      };
    }

    // Include markdown content if present
    if (rawResults.markdown_content) {
      baseResult.markdown_content = rawResults.markdown_content;
    }

    return baseResult;
  } catch (error) {
    console.error('Error parsing medical analysis results:', error);
    return rawResults; // Return raw results if parsing fails
  }
}

/**
 * Parse health data report results (report_ jobs)
 */
function parseHealthDataReportResults(rawResults) {
  try {
    // Extract shared structure for reports
    const baseResult = {
      title: rawResults.title || 'Health Data Report',
      confidence_score: rawResults.metadata?.confidence_score || rawResults.confidence || 5,
      summary: rawResults.summary || 'Health data analysis completed',
      generated_at: rawResults.generated_at || new Date().toISOString()
    };

    // Include report content
    if (rawResults.report_content) {
      baseResult.report_content = rawResults.report_content;
    }

    // Include additional report-specific fields
    if (rawResults.health_summary) {
      baseResult.health_summary = rawResults.health_summary;
    }

    if (rawResults.trend_analysis) {
      baseResult.trend_analysis = rawResults.trend_analysis;
    }

    if (rawResults.clinical_recommendations) {
      baseResult.clinical_recommendations = rawResults.clinical_recommendations;
    }

    return baseResult;
  } catch (error) {
    console.error('Error parsing health data report results:', error);
    return rawResults; // Return raw results if parsing fails
  }
}

/**
 * Parse chat results (chat_ jobs)
 */
function parseChatResults(rawResults) {
  try {
    // Chat results structure (from chat-status.js)
    const baseResult = {
      chat_id: rawResults.chat_response?.chat_id || rawResults.chat_id,
      content_id: rawResults.chat_response?.content_id || rawResults.content_id,
      original_message: rawResults.chat_response?.original_message || rawResults.original_message,
      ai_response: rawResults.chat_response?.ai_response || rawResults.ai_response,
      metadata: rawResults.chat_response?.metadata || rawResults.metadata || {},
      generated_at: rawResults.generated_at || new Date().toISOString()
    };

    return baseResult;
  } catch (error) {
    console.error('Error parsing chat results:', error);
    return rawResults; // Return raw results if parsing fails
  }
}