const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  sanitizeError,
  withRetry,
  s3,
  categorizeError,
  createUnifiedError,
  updateCircuitBreaker,
  ERROR_CATEGORIES
} = require('../shared/utils');
const { auditService } = require('../shared/audit-service');
const { bedrockService } = require('../shared/bedrock-service');
const { ObservabilityService } = require('../shared/observability-service');
const { v4: uuidv4 } = require('uuid');

/**
 * Chat Messages API - Send user question for AI analysis
 * POST /api/chat/messages
 */
exports.handler = async (event) => {
  const startTime = Date.now();
  let userId = 'unknown';

  // Initialize observability
  const observability = ObservabilityService.createForFunction('chat-messages', event);

  try {
    userId = getUserIdFromEvent(event);

    if (!userId) {
      const unifiedError = createUnifiedError(new Error('Missing authentication'), {
        service: 'chat_messages',
        operation: 'authentication',
        category: ERROR_CATEGORIES.BUSINESS
      });
      
      await auditService.logAuditEvent({
        eventType: 'access_control',
        eventSubtype: 'unauthenticated_chat_attempt',
        userId: 'unauthenticated',
        eventDetails: {
          correlationId: unifiedError.correlationId
        },
        dataClassification: 'security_event'
      }).catch(() => {});
      
      return createErrorResponse(401, 'MISSING_AUTHENTICATION', 'Invalid or missing authentication', 'Please sign in to send chat messages');
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      const unifiedError = createUnifiedError(parseError, {
        service: 'chat_messages',
        operation: 'request_parsing',
        userId: userId,
        category: ERROR_CATEGORIES.VALIDATION
      });
      
      await auditService.logAuditEvent({
        eventType: 'validation',
        eventSubtype: 'invalid_json_chat_request',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId,
          error: 'Invalid JSON in request body'
        },
        dataClassification: 'validation_error'
      }).catch(() => {});
      
      return createErrorResponse(400, 'INVALID_JSON', 'Invalid JSON in request body', 'Please provide valid JSON data');
    }

    const { content_id, message, suggested_prompt_id, structured_data } = body;

    // Validate required fields - content_id must reference a document (report or result)
    if (!content_id) {
      const unifiedError = createUnifiedError(new Error('Missing content_id'), {
        service: 'chat_messages',
        operation: 'input_validation',
        userId: userId,
        category: ERROR_CATEGORIES.VALIDATION
      });
      
      await auditService.logAuditEvent({
        eventType: 'validation',
        eventSubtype: 'missing_content_id',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId
        },
        dataClassification: 'validation_error'
      }).catch(() => {});
      
      return createErrorResponse(400, 'MISSING_CONTENT_ID', 'Missing content_id', 'Please provide a valid content_id for document context');
    }

    if (!message || !message.trim()) {
      const unifiedError = createUnifiedError(new Error('Missing message'), {
        service: 'chat_messages',
        operation: 'input_validation',
        userId: userId,
        category: ERROR_CATEGORIES.VALIDATION
      });
      
      await auditService.logAuditEvent({
        eventType: 'validation',
        eventSubtype: 'missing_message',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId,
          contentId: content_id
        },
        dataClassification: 'validation_error'
      }).catch(() => {});
      
      return createErrorResponse(400, 'MISSING_MESSAGE', 'Missing message', 'Please provide a message to send');
    }

    if (message.trim().length > 1000) {
      const unifiedError = createUnifiedError(new Error('Message too long'), {
        service: 'chat_messages',
        operation: 'input_validation',
        userId: userId,
        category: ERROR_CATEGORIES.VALIDATION
      });
      
      await auditService.logAuditEvent({
        eventType: 'validation',
        eventSubtype: 'message_too_long',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId,
          messageLength: message.trim().length,
          contentId: content_id
        },
        dataClassification: 'validation_error'
      }).catch(() => {});
      
      return createErrorResponse(400, 'MESSAGE_TOO_LONG', 'Message too long', 'Please keep messages under 1000 characters');
    }

    // Generate unique identifiers
    const chatId = uuidv4();
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const jobId = `chat_${userId}_${timestamp}_${randomString}`;

    // Store chat request in S3 for processing
    const chatRequestData = {
      job_id: jobId,
      chat_id: chatId,
      user_id: userId,
      content_id: content_id,
      message: message.trim(),
      suggested_prompt_id: suggested_prompt_id || null,
      structured_data: structured_data || null,
      request_type: 'chat_message',
      created_at: new Date().toISOString()
    };

    const s3Key = `incoming/${jobId}`;
    
    const uploadParams = {
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key,
      Body: JSON.stringify(chatRequestData),
      ContentType: 'application/json',
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: process.env.KMS_KEY_ID,
      Metadata: {
        'job-id': jobId,
        'user-id': userId,
        'request-type': 'chat_message',
        'upload-timestamp': Date.now().toString()
      },
      Tagging: 'Classification=PHI-Temporary&AutoDelete=true'
    };

    // S3 upload with enhanced error handling
    try {
      await withRetry(
        () => s3.upload(uploadParams).promise(),
        3,
        1000,
        `S3 upload for chat job ${jobId}`
      );
    } catch (s3UploadError) {
      const unifiedError = createUnifiedError(s3UploadError, {
        service: 'chat_messages',
        operation: 's3_upload',
        userId: userId,
        category: ERROR_CATEGORIES.EXTERNAL
      });
      
      await auditService.logAuditEvent({
        eventType: 'storage',
        eventSubtype: 'chat_upload_failed',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId,
          jobId: jobId,
          chatId: chatId,
          error: sanitizeError(s3UploadError).message?.substring(0, 100)
        },
        dataClassification: 'system_error'
      }).catch(() => {});
      
      throw s3UploadError; // Let main catch block handle this
    }

    // Enhanced audit logging
    await auditService.logAuditEvent({
      eventType: 'chat_interaction',
      eventSubtype: 'message_sent',
      userId: userId,
      eventDetails: {
        chatId: chatId,
        jobId: jobId,
        contentId: content_id,
        messageLength: message.trim().length,
        hasStructuredData: !!structured_data,
        suggestedPromptId: suggested_prompt_id || null
      },
      dataClassification: 'user_interaction'
    });

    // Success audit logging for message stored
    await auditService.logAuditEvent({
      eventType: 'chat_interaction',
      eventSubtype: 'message_stored',
      userId: userId,
      eventDetails: {
        chatId: chatId,
        jobId: jobId,
        s3Key: s3Key,
        processingQueued: true
      },
      dataClassification: 'user_interaction'
    });

    // Return immediate response with job ID for polling
    return createResponse(202, {
      success: true,
      job_id: jobId,
      chat_id: chatId,
      estimated_completion_seconds: 15,
      message: 'Chat message stored and queued for processing'
    });

  } catch (error) {
    console.error('Chat message error:', sanitizeError(error));
    
    // Enhanced error categorization and handling
    const errorContext = {
      service: 'chat_messages',
      operation: 'message_processing',
      userId: userId
    };
    const unifiedError = createUnifiedError(error, errorContext);
    
    await auditService.logAuditEvent({
      eventType: 'chat_interaction',
      eventSubtype: 'message_error',
      userId: userId,
      eventDetails: {
        correlationId: unifiedError.correlationId,
        errorCategory: unifiedError.category,
        recoveryStrategy: unifiedError.recoveryStrategy,
        error: sanitizeError(error).message?.substring(0, 100) || 'Unknown error'
      },
      dataClassification: 'system_error'
    }).catch(auditError => {
      console.error('Audit logging failed:', auditError);
    });
    
    // Use categorized error response
    if (unifiedError.category === ERROR_CATEGORIES.VALIDATION) {
      return createErrorResponse(400, 'VALIDATION_ERROR', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.BUSINESS) {
      return createErrorResponse(403, 'ACCESS_DENIED', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.EXTERNAL) {
      return createErrorResponse(503, 'SERVICE_UNAVAILABLE', 'External service failure', 'Our chat service is temporarily unavailable. Please try again shortly');
    } else {
      return createErrorResponse(500, 'MESSAGE_PROCESSING_FAILED', 'Failed to process chat message', 'We had trouble sending your message. Please try again');
    }
  }
};

