const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  sanitizeError,
  s3,
} = require('../shared/utils');
const { auditService } = require('../shared/audit-service');

/**
 * Chat Status API - Poll for chat response completion
 * GET /api/chat/jobs/{job_id}/status
 */
exports.handler = async (event) => {
  try {
    const userId = getUserIdFromEvent(event);

    if (!userId) {
      return createErrorResponse(401, 'MISSING_AUTHENTICATION', 'Invalid or missing authentication', 'Please sign in to check chat status');
    }

    const jobId = event.pathParameters?.job_id;
    
    if (!jobId) {
      return createErrorResponse(400, 'MISSING_JOB_ID', 'Missing job_id parameter', 'Please provide a valid job_id to check status');
    }

    // Validate job ID format and ownership
    const jobIdValidation = validateJobIdOwnership(jobId, userId);
    if (!jobIdValidation.valid) {
      await auditService.logAuditEvent({
        eventType: 'chat_interaction',
        eventSubtype: 'invalid_job_access_attempt',
        userId: userId,
        eventDetails: {
          jobId: jobId,
          reason: jobIdValidation.reason
        },
        dataClassification: 'security_event'
      });
      
      return createErrorResponse(jobIdValidation.statusCode, jobIdValidation.errorCode, jobIdValidation.message, jobIdValidation.userMessage);
    }

    // Enhanced audit logging
    await auditService.logAuditEvent({
      eventType: 'chat_interaction',
      eventSubtype: 'status_check_requested',
      userId: userId,
      eventDetails: {
        jobId: jobId
      },
      dataClassification: 'user_interaction'
    });

    // Check S3 for chat response
    const chatResponse = await getChatResponseFromS3(jobId);
    
    if (!chatResponse) {
      // Still processing
      return createResponse(202, {
        success: true,
        status: 'processing',
        message: 'Chat response is being generated',
        estimated_completion_seconds: 10
      });
    }

    // Response is ready - check if successful or failed
    if (chatResponse.status === 'failed') {
      await auditService.logAuditEvent({
        eventType: 'chat_interaction',
        eventSubtype: 'failed_response_retrieved',
        userId: userId,
        eventDetails: {
          jobId: jobId,
          errorCode: chatResponse.chat_response?.error?.code
        },
        dataClassification: 'system_error'
      });

      // Clean up S3 file after retrieving failed response
      await cleanupChatResponse(jobId);

      return createErrorResponse(500, 
        chatResponse.chat_response?.error?.code || 'CHAT_PROCESSING_FAILED',
        chatResponse.chat_response?.error?.message || 'Chat processing failed',
        chatResponse.chat_response?.error?.user_action || 'Please try sending your message again'
      );
    }

    // Successful response - clean up S3 and return data
    await cleanupChatResponse(jobId);

    // Success audit logging
    await auditService.logAuditEvent({
      eventType: 'chat_interaction',
      eventSubtype: 'response_delivered',
      userId: userId,
      eventDetails: {
        jobId: jobId,
        chatId: chatResponse.chat_response.chat_id,
        responseLength: chatResponse.chat_response.ai_response?.length || 0,
        processingTimeMs: chatResponse.chat_response.metadata?.processing_time_ms,
        tokenUsage: chatResponse.chat_response.metadata?.token_usage,
        costCents: chatResponse.chat_response.metadata?.cost_estimate_cents
      },
      dataClassification: 'ai_interaction'
    });

    return createResponse(200, {
      success: true,
      status: 'complete',
      chat_response: {
        chat_id: chatResponse.chat_response.chat_id,
        content_id: chatResponse.chat_response.content_id,
        original_message: chatResponse.chat_response.original_message,
        ai_response: chatResponse.chat_response.ai_response,
        follow_up_suggestions: chatResponse.chat_response.follow_up_suggestions || [],
        disclaimers: chatResponse.chat_response.disclaimers || [],
        metadata: chatResponse.chat_response.metadata || {}
      },
      generated_at: chatResponse.generated_at
    });

  } catch (error) {
    console.error('Chat status error:', sanitizeError(error));
    
    const userId = getUserIdFromEvent(event) || 'unknown';
    const jobId = event.pathParameters?.job_id || 'unknown';
    
    await auditService.logAuditEvent({
      eventType: 'chat_interaction',
      eventSubtype: 'status_check_error',
      userId: userId,
      eventDetails: {
        jobId: jobId,
        error: sanitizeError(error).message?.substring(0, 100) || 'Unknown error'
      },
      dataClassification: 'system_error'
    }).catch(auditError => {
      console.error('Audit logging failed:', auditError);
    });
    
    return createErrorResponse(500, 'STATUS_CHECK_FAILED', 'Failed to check chat status', 'Unable to check your message status. Please try again.');
  }
};

/**
 * Validate job ID format and ownership
 */
function validateJobIdOwnership(jobId, userId) {
  try {
    // Job ID format: {user_id}_{timestamp}_{random}
    const parts = jobId.split('_');
    
    if (parts.length !== 3) {
      return {
        valid: false,
        statusCode: 400,
        errorCode: 'INVALID_JOB_ID_FORMAT',
        message: 'Invalid job ID format',
        userMessage: 'Invalid chat session ID. Please start a new conversation.',
        reason: 'invalid_format'
      };
    }

    const jobUserId = parts[0];
    
    if (jobUserId !== userId) {
      return {
        valid: false,
        statusCode: 404,
        errorCode: 'INVALID_JOB_ID',
        message: 'Job ID not found or invalid format',
        userMessage: "I can't find that conversation. Please start a new chat.",
        reason: 'ownership_mismatch'
      };
    }

    // Check if timestamp is reasonable (not too old or in future)
    const timestamp = parseInt(parts[1]);
    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
    const oneHourInFuture = now + (60 * 60 * 1000);

    if (isNaN(timestamp) || timestamp < twentyFourHoursAgo || timestamp > oneHourInFuture) {
      return {
        valid: false,
        statusCode: 404,
        errorCode: 'EXPIRED_JOB_ID',
        message: 'Job ID expired or invalid timestamp',
        userMessage: 'This chat session has expired. Please start a new conversation.',
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
      userMessage: 'Invalid chat session ID. Please start a new conversation.',
      reason: 'validation_error'
    };
  }
}

/**
 * Get chat response from S3
 */
async function getChatResponseFromS3(jobId) {
  try {
    const s3Key = `chat-responses/${jobId}.json`;
    
    const params = {
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key
    };

    const result = await s3.getObject(params).promise();
    
    return JSON.parse(result.Body.toString());

  } catch (error) {
    if (error.code === 'NoSuchKey') {
      // Response not ready yet
      return null;
    }
    
    console.error('Error retrieving chat response from S3:', error);
    throw new Error(`Failed to retrieve chat response: ${error.message}`);
  }
}

/**
 * Clean up chat response from S3 after retrieval
 */
async function cleanupChatResponse(jobId) {
  try {
    const s3Key = `chat-responses/${jobId}.json`;
    
    const params = {
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key
    };

    await s3.deleteObject(params).promise();
    console.log(`Cleaned up chat response: ${s3Key}`);

  } catch (error) {
    console.error('Error cleaning up chat response:', error);
    // Don't throw - cleanup failure shouldn't block the response
  }
}