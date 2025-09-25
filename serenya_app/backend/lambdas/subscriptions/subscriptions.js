const { 
  createResponse, 
  createErrorResponse, 
  sanitizeError,
  auditLog,
  verifyJWT,
  getSecrets
} = require('../shared/utils');
const { SubscriptionService, UserService } = require('../shared/database');

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
    
    // If no subscription found, return default "free" subscription
    if (!subscription) {
      console.log('No subscription found, returning free tier defaults');
      
      // Get user info for subscription response
      let user;
      try {
        user = await UserService.findById(userId);
      } catch (userError) {
        console.error('Failed to fetch user info:', userError);
        // Continue with minimal info
        user = { id: userId, email: 'unknown@example.com' };
      }
      
      const freeSubscription = {
        subscription_id: `free-${userId}`,
        plan_id: 'free',
        plan_name: 'Free Plan', 
        status: 'active',
        monthly_price: 0.00,
        currency: 'USD',
        current_period_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        current_period_end: new Date(Date.now() + 335 * 24 * 60 * 60 * 1000).toISOString(), // ~1 year from now
        auto_renew: false,
        cancelled_at: null,
        cancellation_reason: null,
        metadata: {
          plan_type: 'free',
          created_from: 'default'
        },
        limits: {
          max_documents: 5, // Free tier: 5 documents per month
          max_chat_messages: 100,
          max_storage_gb: 1,
          premium_support: false,
          advanced_analysis: false
        }
      };
      
      auditLog('subscription_current_fetched', userId, { 
        subscription_type: 'free_default',
        has_subscription: false 
      });
      
      return createResponse(200, freeSubscription);
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