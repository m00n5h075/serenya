const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  sanitizeError,
  s3,
} = require('../shared/utils');
const { DocumentJobService } = require('../shared/document-database');
const { auditService } = require('../shared/audit-service');
const { bedrockService } = require('../shared/bedrock-service');
const { v4: uuidv4 } = require('uuid');

/**
 * Chat Messages API - Send user question for AI analysis
 * POST /api/chat/messages
 */
exports.handler = async (event) => {
  try {
    const userId = getUserIdFromEvent(event);

    if (!userId) {
      return createErrorResponse(401, 'MISSING_AUTHENTICATION', 'Invalid or missing authentication', 'Please sign in to send chat messages');
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'INVALID_JSON', 'Invalid JSON in request body', 'Please provide valid JSON data');
    }

    const { content_id, message, suggested_prompt_id } = body;

    // Validate required fields
    if (!content_id) {
      return createErrorResponse(400, 'MISSING_CONTENT_ID', 'Missing content_id', 'Please provide a valid content_id for context');
    }

    if (!message || !message.trim()) {
      return createErrorResponse(400, 'MISSING_MESSAGE', 'Missing message', 'Please provide a message to send');
    }

    if (message.trim().length > 1000) {
      return createErrorResponse(400, 'MESSAGE_TOO_LONG', 'Message too long', 'Please keep messages under 1000 characters');
    }

    // Generate unique identifiers
    const chatId = uuidv4();
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const jobId = `${userId}_${timestamp}_${randomString}`;

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
        suggestedPromptId: suggested_prompt_id || null
      },
      dataClassification: 'user_interaction'
    });

    // Validate content_id exists and belongs to user (if needed for context)
    let documentContext = null;
    if (content_id !== 'general') {
      try {
        // Try to get document context for better AI responses
        const contextResult = await DocumentJobService.getResults(content_id, userId);
        if (contextResult) {
          documentContext = contextResult;
        }
      } catch (contextError) {
        console.warn('Could not retrieve document context:', contextError);
        // Continue without context - not critical for chat functionality
      }
    }

    // Start asynchronous AI processing
    processMessageAsync(jobId, chatId, userId, content_id, message, documentContext, suggested_prompt_id);

    // Success audit logging for message acceptance
    await auditService.logAuditEvent({
      eventType: 'chat_interaction',
      eventSubtype: 'message_accepted',
      userId: userId,
      eventDetails: {
        chatId: chatId,
        jobId: jobId,
        processingStarted: true
      },
      dataClassification: 'user_interaction'
    });

    // Return immediate response (202 Accepted)
    return createResponse(202, {
      success: true,
      job_id: jobId,
      chat_id: chatId,
      estimated_completion_seconds: 15,
      message: 'Chat message received and processing started'
    });

  } catch (error) {
    console.error('Chat message error:', sanitizeError(error));
    
    const userId = getUserIdFromEvent(event) || 'unknown';
    
    await auditService.logAuditEvent({
      eventType: 'chat_interaction',
      eventSubtype: 'message_error',
      userId: userId,
      eventDetails: {
        error: sanitizeError(error).message?.substring(0, 100) || 'Unknown error'
      },
      dataClassification: 'system_error'
    }).catch(auditError => {
      console.error('Audit logging failed:', auditError);
    });
    
    return createErrorResponse(500, 'MESSAGE_PROCESSING_FAILED', 'Failed to process chat message', 'Unable to send your message. Please try again.');
  }
};

/**
 * Process chat message asynchronously with AI
 */
async function processMessageAsync(jobId, chatId, userId, contentId, message, documentContext, suggestedPromptId) {
  try {
    console.log(`Starting async chat processing for job ${jobId}`);

    // Process with Bedrock Claude
    const bedrockResult = await bedrockService.processChatQuestion(message, documentContext, {
      userId: userId,
      chatId: chatId,
      contentId: contentId,
      suggestedPromptId: suggestedPromptId
    });

    // Handle Bedrock processing failure
    if (!bedrockResult.success) {
      await storeFailedChatResponse(jobId, chatId, userId, bedrockResult.error);

      await auditService.logAuditEvent({
        eventType: 'chat_interaction',
        eventSubtype: 'ai_processing_failed',
        userId: userId,
        eventDetails: {
          chatId: chatId,
          jobId: jobId,
          errorCode: bedrockResult.error.code,
          errorCategory: bedrockResult.error.category
        },
        dataClassification: 'system_error'
      });

      return;
    }

    // Store successful response in S3
    await storeChatResponse(jobId, chatId, userId, contentId, bedrockResult, message);

    // Enhanced success audit logging
    await auditService.logAuditEvent({
      eventType: 'chat_interaction',
      eventSubtype: 'ai_response_generated',
      userId: userId,
      eventDetails: {
        chatId: chatId,
        jobId: jobId,
        responseLength: bedrockResult.response.response_content?.length || 0,
        processingTimeMs: bedrockResult.metadata.processing_time_ms,
        tokenUsage: bedrockResult.metadata.token_usage,
        costCents: bedrockResult.metadata.cost_estimate_cents
      },
      dataClassification: 'ai_interaction'
    });

    console.log(`Chat processing completed successfully for job ${jobId}`);

  } catch (error) {
    console.error(`Async chat processing failed for job ${jobId}:`, sanitizeError(error));
    
    await storeFailedChatResponse(jobId, chatId, userId, {
      code: 'CHAT_PROCESSING_ERROR',
      message: 'Failed to process chat message',
      category: 'technical'
    });

    await auditService.logAuditEvent({
      eventType: 'chat_interaction',
      eventSubtype: 'async_processing_error',
      userId: userId,
      eventDetails: {
        chatId: chatId,
        jobId: jobId,
        error: sanitizeError(error).message?.substring(0, 100) || 'Unknown error'
      },
      dataClassification: 'system_error'
    }).catch(auditError => {
      console.error('Audit logging failed:', auditError);
    });
  }
}

/**
 * Store successful chat response in S3
 */
async function storeChatResponse(jobId, chatId, userId, contentId, bedrockResult, originalMessage) {
  try {
    const responseData = {
      status: 'complete',
      chat_response: {
        chat_id: chatId,
        content_id: contentId,
        original_message: originalMessage,
        ai_response: bedrockResult.response.response_content,
        follow_up_suggestions: bedrockResult.response.follow_up_suggestions || [],
        disclaimers: bedrockResult.response.disclaimers || [],
        metadata: {
          generation_timestamp: new Date().toISOString(),
          model_used: bedrockResult.metadata.model_used,
          processing_time_ms: bedrockResult.metadata.processing_time_ms,
          token_usage: bedrockResult.metadata.token_usage,
          cost_estimate_cents: bedrockResult.metadata.cost_estimate_cents
        }
      },
      generated_at: new Date().toISOString()
    };

    const s3Key = `chat-responses/${jobId}.json`;
    
    const params = {
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key,
      Body: JSON.stringify(responseData),
      ContentType: 'application/json',
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: process.env.KMS_KEY_ID
    };

    await s3.upload(params).promise();
    console.log(`Chat response stored in S3: ${s3Key}`);

  } catch (error) {
    console.error('Error storing chat response in S3:', error);
    throw new Error(`Failed to store chat response: ${error.message}`);
  }
}

/**
 * Store failed chat response in S3
 */
async function storeFailedChatResponse(jobId, chatId, userId, errorDetails) {
  try {
    const responseData = {
      status: 'failed',
      chat_response: {
        chat_id: chatId,
        error: errorDetails
      },
      failed_at: new Date().toISOString()
    };

    const s3Key = `chat-responses/${jobId}.json`;
    
    const params = {
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key,
      Body: JSON.stringify(responseData),
      ContentType: 'application/json',
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: process.env.KMS_KEY_ID
    };

    await s3.upload(params).promise();
    console.log(`Failed chat response stored in S3: ${s3Key}`);

  } catch (error) {
    console.error('Error storing failed chat response in S3:', error);
  }
}