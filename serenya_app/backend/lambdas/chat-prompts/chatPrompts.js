const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  sanitizeError,
} = require('../shared/utils');
const { DocumentJobService } = require('../shared/document-database');
const { auditService } = require('../shared/audit-service');

/**
 * Chat Prompts API - Retrieve predefined conversation starters
 * GET /api/chat/prompts?content_type=results|reports
 */
exports.handler = async (event) => {
  try {
    const userId = getUserIdFromEvent(event);

    if (!userId) {
      return createErrorResponse(401, 'MISSING_AUTHENTICATION', 'Invalid or missing authentication', 'Please sign in to access chat prompts');
    }

    // Get content_type query parameter
    const contentType = event.queryStringParameters?.content_type;
    
    if (!contentType) {
      return createErrorResponse(400, 'MISSING_CONTENT_TYPE', 'Missing content_type parameter', 'Please specify content_type as "results" or "reports"');
    }

    if (!['results', 'reports'].includes(contentType)) {
      return createErrorResponse(400, 'INVALID_CONTENT_TYPE', 'Invalid content_type parameter', 'content_type must be "results" or "reports"');
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

    // Get chat prompts from database
    const prompts = await getChatPrompts(contentType);
    
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

/**
 * Get chat prompts from database by content type
 */
async function getChatPrompts(contentType) {
  try {
    const query = `
      SELECT 
        id,
        content_type,
        category,
        option_text,
        display_order,
        created_at
      FROM chat_options 
      WHERE content_type = $1 
        AND is_active = true
      ORDER BY display_order ASC, created_at ASC
    `;
    
    const result = await DocumentJobService.executeQuery(query, [contentType]);
    
    if (!result.rows || result.rows.length === 0) {
      return [];
    }

    // Format prompts for API response
    return result.rows.map(row => ({
      id: row.id,
      content_type: row.content_type,
      category: row.category,
      prompt_text: row.option_text,
      display_order: row.display_order
    }));

  } catch (error) {
    console.error('Database error getting chat prompts:', error);
    throw new Error(`Failed to retrieve chat prompts: ${error.message}`);
  }
}