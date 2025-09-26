const { 
  createResponse, 
  createErrorResponse, 
  sanitizeError,
  auditLog,
  verifyJWT,
  getSecrets
} = require('./utils');
const { SubscriptionService, UserService } = require('./database');

/**
 * GET /subscriptions/current
 * Get current user's active subscription details
 */
exports.getCurrentHandler = async (event) => {
  console.log('=== SUBSCRIPTIONS GET CURRENT START ===');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  try {
    // Extract user ID from JWT token (set by authorizer)
    const userId = event.requestContext?.authorizer?.userId;
    
    if (!userId) {
      console.error('No user ID found in request context');
      return createErrorResponse(401, 'UNAUTHORIZED', 'Authentication required', 'Please sign in to access your subscription');
    }
    
    console.log('User ID from JWT:', userId);
    
    // Get user's latest subscription from database (regardless of status)
    console.log('Fetching latest subscription for user...');
    let subscription;
    try {
      subscription = await SubscriptionService.getUserLatestSubscription(userId);
      console.log('Latest subscription result:', subscription ? 'Found' : 'Not found');
    } catch (dbError) {
      console.error('Database error fetching subscription:', dbError);
      auditLog('subscription_fetch_error', userId, { 
        error: sanitizeError(dbError).substring(0, 100) 
      });
      return createErrorResponse(500, 'DATABASE_ERROR', 'Failed to fetch subscription', 'Please try again');
    }
    
    // If no subscription found, user is on free tier
    if (!subscription) {
      console.log('No subscription found for user - returning free tier');
      
      auditLog('free_tier_user', userId, { 
        has_subscription: false,
        tier: 'free' 
      });
      
      // Return free tier details
      const freeSubscriptionResponse = {
        subscription_id: null,
        plan_id: 'free',
        plan_name: 'Free',
        status: 'active',
        monthly_price: 0.00,
        currency: 'USD',
        current_period_start: null,
        current_period_end: null,
        features: {
          medical_reports: false,
          max_documents_per_month: 5,
          priority_processing: false,
          advanced_analytics: false,
          export_capabilities: false
        },
        provider: null,
        auto_renew: false,
        trial: false
      };
      
      console.log('Returning free tier subscription:', JSON.stringify(freeSubscriptionResponse, null, 2));
      
      return createResponse(200, {
        message: 'Current subscription retrieved successfully',
        subscription: freeSubscriptionResponse
      });
    }
    
    // Format subscription for frontend (regardless of status)
    const subscriptionResponse = {
      subscription_id: subscription.id,
      plan_id: mapSubscriptionTypeToPlanId(subscription.subscription_type),
      plan_name: mapSubscriptionTypeToName(subscription.subscription_type),
      status: subscription.subscription_status,
      monthly_price: getMonthlyPriceForType(subscription.subscription_type),
      currency: 'USD', // Default currency
      current_period_start: subscription.start_date,
      current_period_end: subscription.end_date,
      auto_renew: subscription.subscription_status === 'active', // Only active subscriptions auto-renew
      cancelled_at: subscription.subscription_status === 'cancelled' ? subscription.updated_at : null,
      cancellation_reason: null, // Could be added to subscription table later
      metadata: {
        provider: subscription.provider,
        external_subscription_id: subscription.external_subscription_id,
        plan_type: subscription.subscription_type
      },
      limits: getLimitsForSubscriptionType(subscription.subscription_type)
    };
    
    auditLog('subscription_current_fetched', userId, { 
      subscription_id: subscription.id,
      subscription_type: subscription.subscription_type,
      subscription_status: subscription.subscription_status,
      has_subscription: true 
    });
    
    console.log('Returning subscription details');
    return createResponse(200, subscriptionResponse);
    
  } catch (error) {
    console.error('Unexpected error in getCurrentHandler:', error);
    auditLog('subscription_current_error', 'unknown', { 
      error: sanitizeError(error).substring(0, 100) 
    });
    return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', 'Failed to fetch subscription details');
  }
};

/**
 * Main handler - routes to appropriate method based on HTTP method and path
 */
exports.handler = async (event) => {
  console.log('=== SUBSCRIPTIONS HANDLER START ===');
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
    return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', 'An unexpected error occurred');
  }
};

/**
 * Helper functions to map subscription data
 */
function mapSubscriptionTypeToPlanId(subscriptionType) {
  switch (subscriptionType) {
    case 'monthly':
      return 'premium-monthly';
    case 'yearly':
      return 'premium-yearly';
    default:
      return 'free';
  }
}

function mapSubscriptionTypeToName(subscriptionType) {
  switch (subscriptionType) {
    case 'monthly':
      return 'Premium Monthly';
    case 'yearly':
      return 'Premium Yearly';
    default:
      return 'Free Plan';
  }
}

function getMonthlyPriceForType(subscriptionType) {
  switch (subscriptionType) {
    case 'monthly':
      return 9.99;
    case 'yearly':
      return 8.33; // $99.99/year = $8.33/month
    default:
      return 0.00;
  }
}

function getLimitsForSubscriptionType(subscriptionType) {
  switch (subscriptionType) {
    case 'monthly':
    case 'yearly':
      return {
        max_documents: null, // Unlimited for premium
        max_chat_messages: null, // Unlimited
        max_storage_gb: 100, // 100GB for premium
        premium_support: true,
        advanced_analysis: true
      };
    default:
      return {
        max_documents: 5,
        max_chat_messages: 100,
        max_storage_gb: 1,
        premium_support: false,
        advanced_analysis: false
      };
  }
}