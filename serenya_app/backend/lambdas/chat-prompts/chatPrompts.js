const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  sanitizeError,
} = require('../shared/utils');
const { getChatPrompts } = require('../shared/chat-prompts-constants');
const { auditService } = require('../shared/audit-service');
const { ObservabilityService } = require('../shared/observability-service');

/**
 * Chat Prompts API - Retrieve predefined conversation starters
 * GET /api/chat/prompts?content_type=result|report
 */
exports.handler = async (event) => {
  const startTime = Date.now();
  const observability = ObservabilityService.createForFunction('chat-prompts', event);

  try {
    const userId = getUserIdFromEvent(event);

    if (!userId) {
      return createErrorResponse(401, 'MISSING_AUTHENTICATION', 'Invalid or missing authentication', 'Please sign in to access chat prompts');
    }

    // Get content_type query parameter
    const contentType = event.queryStringParameters?.content_type;
    
    if (!contentType) {
      return createErrorResponse(400, 'MISSING_CONTENT_TYPE', 'Missing content_type parameter', 'Please specify content_type as "result" or "report"');
    }

    if (!['result', 'report'].includes(contentType)) {
      return createErrorResponse(400, 'INVALID_CONTENT_TYPE', 'Invalid content_type parameter', 'content_type must be "result" or "report"');
    }

    // Enhanced audit logging
    await auditService.logAuditEvent({
      eventType: 'chat_interaction',
      eventSubtype: 'prompts_requested',
      userId: userId,
      eventDetails: {
        contentType: contentType
      },
      dataClassification: 'system_interaction'
    });

    // Get chat prompts from static constants
    const prompts = getChatPrompts(contentType);
    
    if (!prompts || prompts.length === 0) {
      await auditService.logAuditEvent({
        eventType: 'chat_interaction',
        eventSubtype: 'prompts_not_found',
        userId: userId,
        eventDetails: { contentType: contentType },
        dataClassification: 'system_error'
      });
      
      return createErrorResponse(404, 'PROMPTS_NOT_FOUND', 'No prompts found for content type', 'No conversation starters are available at this time');
    }

    // Success audit logging
    await auditService.logAuditEvent({
      eventType: 'chat_interaction',
      eventSubtype: 'prompts_retrieved',
      userId: userId,
      eventDetails: {
        contentType: contentType,
        promptCount: prompts.length
      },
      dataClassification: 'system_interaction'
    });

    // Track user journey for chat prompts fetch
    await observability.trackUserJourney(userId, 'chat_prompts_fetched', {
      contentType: contentType,
      promptCount: prompts.length
    });

    return createResponse(200, {
      success: true,
      content_type: contentType,
      prompts: prompts,
      ttl_seconds: 86400, // 1 day TTL for caching
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat prompts error:', sanitizeError(error));

    const userId = getUserIdFromEvent(event) || 'unknown';

    await observability.trackError(error, 'chat_prompts', userId);

    await auditService.logAuditEvent({
      eventType: 'chat_interaction',
      eventSubtype: 'prompts_error',
      userId: userId,
      eventDetails: {
        error: sanitizeError(error).message?.substring(0, 100) || 'Unknown error'
      },
      dataClassification: 'system_error'
    }).catch(auditError => {
      console.error('Audit logging failed:', auditError);
    });

    return createErrorResponse(500, 'PROMPTS_RETRIEVAL_FAILED', 'Failed to retrieve chat prompts', 'Unable to load conversation starters. Please try again.');
  }
};

// Note: getChatPrompts function now imported from shared/chat-prompts-constants.js