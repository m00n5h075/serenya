const {
  createResponse,
  createErrorResponse,
  sanitizeError,
  auditLog,
  getUserIdFromEvent,
  categorizeError,
  createUnifiedError,
  withRetry,
  updateCircuitBreaker,
  ERROR_CATEGORIES
} = require('../shared/utils');
const { auditService } = require('../shared/audit-service');
const { DynamoDBUserService } = require('../shared/dynamodb-service');
const { ObservabilityService } = require('../shared/observability-service');
const {
  mapSubscriptionTypeToPlanId,
  mapSubscriptionTypeToName,
  getMonthlyPriceForType,
  getLimitsForSubscriptionType,
  getFreeSubscriptionResponse
} = require('../shared/subscription-constants');

/**
 * GET /subscriptions/current
 * Get current user's active subscription details from DynamoDB
 */
exports.getCurrentHandler = async (event) => {
  const startTime = Date.now();
  const observability = ObservabilityService.createForFunction('subscriptions', event);
  console.log('=== SUBSCRIPTIONS GET CURRENT START (DynamoDB) ===');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Extract user ID from JWT token (set by authorizer)
    const userId = event.requestContext?.authorizer?.userId || getUserIdFromEvent(event);
    
    if (!userId) {
      const unifiedError = createUnifiedError(new Error('Missing authentication'), {
        service: 'subscriptions',
        operation: 'authentication',
        category: ERROR_CATEGORIES.BUSINESS
      });
      
      await auditService.logAuditEvent({
        eventType: 'access_control',
        eventSubtype: 'unauthenticated_subscription_access',
        userId: 'unauthenticated',
        eventDetails: {
          correlationId: unifiedError.correlationId
        },
        dataClassification: 'security_event'
      }).catch(() => {});
      
      console.error('No user ID found in request context');
      return createErrorResponse(401, 'UNAUTHORIZED', 'Authentication required', 'Please sign in to access your subscription');
    }
    
    console.log('User ID from JWT:', userId);
    
    const userService = new DynamoDBUserService();

    // Get user profile which contains embedded subscription data with retry logic
    console.log('Fetching user profile with subscription data...');
    let userProfile;
    try {
      userProfile = await withRetry(
        () => userService.getUserProfile(userId),
        3,
        1000,
        `DynamoDB getUserProfile for subscription ${userId}`
      );
      console.log('User profile result:', userProfile ? 'Found' : 'Not found');
    } catch (dbError) {
      const unifiedError = createUnifiedError(dbError, {
        service: 'subscriptions',
        operation: 'dynamodb_user_fetch',
        userId: userId,
        category: ERROR_CATEGORIES.EXTERNAL
      });
      
      await auditService.logAuditEvent({
        eventType: 'subscription',
        eventSubtype: 'user_profile_fetch_error',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId,
          error: sanitizeError(dbError).message?.substring(0, 100)
        },
        dataClassification: 'system_error'
      }).catch(() => {});
      
      console.error('Database error fetching user profile:', dbError);
      return createErrorResponse(500, 'DATABASE_ERROR', 'Failed to fetch subscription', 'We had trouble getting your subscription details. Please try again');
    }
    
    // If no user profile found
    if (!userProfile) {
      const unifiedError = createUnifiedError(new Error('User profile not found'), {
        service: 'subscriptions',
        operation: 'user_validation',
        userId: userId,
        category: ERROR_CATEGORIES.BUSINESS
      });
      
      await auditService.logAuditEvent({
        eventType: 'subscription',
        eventSubtype: 'user_profile_not_found',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId
        },
        dataClassification: 'business_logic'
      }).catch(() => {});
      
      console.error('User profile not found for userId:', userId);
      return createErrorResponse(404, 'USER_NOT_FOUND', 'User profile not found', 'Please sign in again to access your subscription');
    }

    // Extract subscription from user profile
    const subscription = userProfile.current_subscription;
    
    // If no subscription found, user is on free tier
    if (!subscription || subscription.type === 'free') {
      console.log('No premium subscription found for user - returning free tier');
      
      await auditService.logAuditEvent({
        eventType: 'subscription',
        eventSubtype: 'free_tier_access',
        userId: userId,
        eventDetails: {
          has_subscription: false,
          tier: 'free'
        },
        dataClassification: 'business_logic'
      }).catch(() => {});
      
      // Return free tier details in format expected by Flutter app
      const freeSubscriptionResponse = getFreeSubscriptionResponse(userId);
      
      console.log('Returning free tier subscription:', JSON.stringify(freeSubscriptionResponse, null, 2));
      
      return createResponse(200, {
        message: 'Current subscription retrieved successfully',
        subscription: freeSubscriptionResponse
      });
    }
    
    // Format subscription for frontend (regardless of status)
    const subscriptionResponse = {
      subscription_id: subscription.subscription_id || userId + '-subscription',
      plan_id: mapSubscriptionTypeToPlanId(subscription.type),
      plan_name: mapSubscriptionTypeToName(subscription.type),
      status: subscription.status,
      monthly_price: getMonthlyPriceForType(subscription.type),
      currency: 'USD', // Default currency
      current_period_start: subscription.starts_at,
      current_period_end: subscription.end_date,
      auto_renew: subscription.status === 'active', // Only active subscriptions auto-renew
      cancelled_at: subscription.status === 'cancelled' ? subscription.cancelled_at : null,
      cancellation_reason: subscription.cancellation_reason || null,
      metadata: {
        provider: subscription.provider,
        external_subscription_id: subscription.external_subscription_id,
        plan_type: subscription.type,
        credits_remaining: subscription.credits_remaining
      },
      limits: getLimitsForSubscriptionType(subscription.type)
    };
    
    await auditService.logAuditEvent({
      eventType: 'subscription',
      eventSubtype: 'subscription_details_fetched',
      userId: userId,
      eventDetails: {
        subscription_id: subscription.subscription_id,
        subscription_type: subscription.type,
        subscription_status: subscription.status,
        has_subscription: true
      },
      dataClassification: 'business_logic'
    }).catch(() => {});

    // Track subscription event
    await observability.trackSubscription(userId, 'subscription_viewed', {
      subscriptionType: subscription.type,
      subscriptionStatus: subscription.status,
      subscriptionId: subscription.subscription_id
    });

    console.log('Returning subscription details');
    return createResponse(200, {
      message: 'Current subscription retrieved successfully',
      subscription: subscriptionResponse
    });

  } catch (error) {
    console.error('Unexpected error in getCurrentHandler:', error);

    const userId = event.requestContext?.authorizer?.userId || getUserIdFromEvent(event) || 'unknown';
    await observability.trackError(error, 'subscription_fetch', userId);

    const errorContext = {
      service: 'subscriptions',
      operation: 'subscription_fetch',
      userId: userId
    };
    const unifiedError = createUnifiedError(error, errorContext);

    await auditService.logAuditEvent({
      eventType: 'subscription',
      eventSubtype: 'subscription_fetch_error',
      userId: userId,
      eventDetails: {
        correlationId: unifiedError.correlationId,
        errorCategory: unifiedError.category,
        recoveryStrategy: unifiedError.recoveryStrategy,
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
      return createErrorResponse(503, 'SERVICE_UNAVAILABLE', 'External service failure', 'Our subscription service is temporarily unavailable. Please try again shortly');
    } else {
      return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', 'We had trouble getting your subscription details. Please try again');
    }
  }
};

/**
 * Main handler - routes to appropriate method based on HTTP method and path
 */
exports.handler = async (event) => {
  console.log('=== SUBSCRIPTIONS HANDLER START (DynamoDB) ===');
  console.log('HTTP Method:', event.httpMethod);
  console.log('Resource Path:', event.resource);
  
  try {
    const httpMethod = event.httpMethod;
    const resource = event.resource;
    
    // Route based on HTTP method and path
    if (httpMethod === 'GET' && resource === '/subscriptions/current') {
      return await exports.getCurrentHandler(event);
    }
    
    // Unsupported method/path combination
    console.error('Unsupported method/path combination:', httpMethod, resource);
    return createErrorResponse(404, 'NOT_FOUND', 'Endpoint not found', 'The requested endpoint is not available');
    
  } catch (error) {
    console.error('Error in main subscriptions handler:', error);
    
    const errorContext = {
      service: 'subscriptions',
      operation: 'request_routing',
      category: ERROR_CATEGORIES.TECHNICAL
    };
    const unifiedError = createUnifiedError(error, errorContext);
    
    await auditService.logAuditEvent({
      eventType: 'subscription',
      eventSubtype: 'handler_routing_error',
      userId: 'unknown',
      eventDetails: {
        correlationId: unifiedError.correlationId,
        httpMethod: event.httpMethod,
        resource: event.resource,
        error: sanitizeError(error).message?.substring(0, 100)
      },
      dataClassification: 'system_error'
    }).catch(() => {});
    
    return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', 'We had trouble processing your request. Please try again');
  }
};

/**
 * Note: Subscription mapping functions have been moved to /shared/subscription-constants.js
 * for centralized configuration management as part of DynamoDB migration.
 */