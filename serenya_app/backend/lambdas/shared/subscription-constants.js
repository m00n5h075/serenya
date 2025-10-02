/**
 * Subscription Tiers and Pricing Constants
 * Replaces database queries for subscription_tiers table
 */

const SUBSCRIPTION_PLANS = {
  free: {
    plan_id: 'free',
    plan_name: 'Free Plan',
    type: 'free',
    monthly_price: 0.00,
    yearly_price: 0.00,
    currency: 'USD',
    limits: {
      max_documents: 5,
      max_chat_messages: 50,
      max_storage_gb: 1,
      premium_support: false,
      advanced_analysis: false
    },
    features: [
      'Basic health document analysis',
      'Limited chat interactions',
      'Basic file storage'
    ]
  },
  monthly: {
    plan_id: 'premium-monthly',
    plan_name: 'Premium Monthly',
    type: 'monthly',
    monthly_price: 9.99,
    yearly_price: null,
    currency: 'USD',
    limits: {
      max_documents: null, // Unlimited
      max_chat_messages: null, // Unlimited
      max_storage_gb: 100,
      premium_support: true,
      advanced_analysis: true
    },
    features: [
      'Unlimited health document analysis',
      'Unlimited chat interactions',
      'Advanced AI insights',
      'Premium support',
      '100GB storage'
    ]
  },
  yearly: {
    plan_id: 'premium-yearly',
    plan_name: 'Premium Yearly',
    type: 'yearly',
    monthly_price: 8.33, // $99.99/year = $8.33/month
    yearly_price: 99.99,
    currency: 'USD',
    limits: {
      max_documents: null, // Unlimited
      max_chat_messages: null, // Unlimited
      max_storage_gb: 100,
      premium_support: true,
      advanced_analysis: true
    },
    features: [
      'Unlimited health document analysis',
      'Unlimited chat interactions',
      'Advanced AI insights',
      'Premium support',
      '100GB storage',
      '17% savings vs monthly'
    ]
  }
};

/**
 * Map subscription type to plan ID
 * @param {string} subscriptionType - 'free', 'monthly', or 'yearly'
 * @returns {string} Plan ID
 */
function mapSubscriptionTypeToPlanId(subscriptionType) {
  const plan = SUBSCRIPTION_PLANS[subscriptionType];
  return plan ? plan.plan_id : 'free';
}

/**
 * Map subscription type to plan name
 * @param {string} subscriptionType - 'free', 'monthly', or 'yearly'
 * @returns {string} Plan name
 */
function mapSubscriptionTypeToName(subscriptionType) {
  const plan = SUBSCRIPTION_PLANS[subscriptionType];
  return plan ? plan.plan_name : 'Free Plan';
}

/**
 * Get monthly price for subscription type
 * @param {string} subscriptionType - 'free', 'monthly', or 'yearly'
 * @returns {number} Monthly price
 */
function getMonthlyPriceForType(subscriptionType) {
  const plan = SUBSCRIPTION_PLANS[subscriptionType];
  return plan ? plan.monthly_price : 0.00;
}

/**
 * Get limits for subscription type
 * @param {string} subscriptionType - 'free', 'monthly', or 'yearly'
 * @returns {Object} Limits object
 */
function getLimitsForSubscriptionType(subscriptionType) {
  const plan = SUBSCRIPTION_PLANS[subscriptionType];
  return plan ? plan.limits : SUBSCRIPTION_PLANS.free.limits;
}

/**
 * Get all subscription plans
 * @returns {Object} All subscription plans
 */
function getAllSubscriptionPlans() {
  return SUBSCRIPTION_PLANS;
}

/**
 * Check if subscription type is premium
 * @param {string} subscriptionType - 'free', 'monthly', or 'yearly'
 * @returns {boolean} True if premium
 */
function isPremiumSubscription(subscriptionType) {
  return subscriptionType === 'monthly' || subscriptionType === 'yearly';
}

/**
 * Get free tier subscription response
 * @param {string} userId - User ID
 * @returns {Object} Free tier subscription object
 */
function getFreeSubscriptionResponse(userId) {
  const freePlan = SUBSCRIPTION_PLANS.free;
  return {
    subscription_id: 'free-tier',
    plan_id: freePlan.plan_id,
    plan_name: freePlan.plan_name,
    status: 'active',
    monthly_price: freePlan.monthly_price,
    currency: freePlan.currency,
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
    auto_renew: false,
    cancelled_at: null,
    cancellation_reason: null,
    metadata: null,
    limits: freePlan.limits
  };
}

module.exports = {
  SUBSCRIPTION_PLANS,
  mapSubscriptionTypeToPlanId,
  mapSubscriptionTypeToName,
  getMonthlyPriceForType,
  getLimitsForSubscriptionType,
  getAllSubscriptionPlans,
  isPremiumSubscription,
  getFreeSubscriptionResponse
};