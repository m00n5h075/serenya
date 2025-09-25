const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  auditLog,
  sanitizeError,
} = require('../shared/utils');
const { UserService, SubscriptionService } = require('../shared/database');

/**
 * User Profile Management with Encryption Support
 * GET /user/profile
 * PUT /user/profile (for updates)
 */
exports.handler = async (event) => {
  try {
    const userId = getUserIdFromEvent(event);
    
    if (!userId) {
      return createErrorResponse(401, 'Invalid or missing authentication');
    }

    // Handle different HTTP methods
    if (event.httpMethod === 'GET') {
      return await getUserProfileHandler(userId);
    } else if (event.httpMethod === 'PUT') {
      return await updateUserProfileHandler(userId, event);
    } else {
      return createErrorResponse(405, 'Method not allowed');
    }

  } catch (error) {
    console.error('User profile error:', sanitizeError(error));
    
    const userId = getUserIdFromEvent(event) || 'unknown';
    auditLog('profile_error', userId, { 
      error: sanitizeError(error).substring(0, 100) 
    });
    
    return createErrorResponse(500, 'Profile operation failed');
  }
};

/**
 * Get user profile with encryption support
 */
async function getUserProfileHandler(userId) {
  auditLog('profile_access', userId);

  // Get user profile from encrypted database
  const userProfile = await UserService.findById(userId);
  
  if (!userProfile) {
    auditLog('profile_not_found', userId);
    return createErrorResponse(404, 'User profile not found');
  }

  // Get user's active subscription (if any)
  let subscription = null;
  try {
    subscription = await SubscriptionService.getUserActiveSubscription(userId);
  } catch (subscriptionError) {
    console.warn('Failed to fetch subscription:', sanitizeError(subscriptionError));
    // Continue without subscription data - not critical for profile
  }

  // Return sanitized user profile (PII is automatically decrypted by UserService)
  const profileResponse = {
    id: userProfile.id,
    email: userProfile.email,
    name: userProfile.name,
    given_name: userProfile.given_name,
    family_name: userProfile.family_name,
    email_verified: userProfile.email_verified,
    account_status: userProfile.account_status,
    auth_provider: userProfile.auth_provider,
    created_at: userProfile.created_at,
    updated_at: userProfile.updated_at,
    last_login_at: userProfile.last_login_at,
    // Subscription information
    subscription: subscription ? {
      type: subscription.subscription_type,
      status: subscription.subscription_status,
      provider: subscription.provider,
      end_date: subscription.end_date
    } : null
  };

  auditLog('profile_retrieved', userId, { hasSubscription: !!subscription });

  return createResponse(200, {
    success: true,
    user: profileResponse,
  });
}

/**
 * Update user profile with encryption support
 */
async function updateUserProfileHandler(userId, event) {
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (parseError) {
    return createErrorResponse(400, 'Invalid JSON in request body');
  }

  const { name, given_name, family_name } = body;

  // Validate input
  if (name !== undefined && (typeof name !== 'string' || name.length > 255 || name.length < 1)) {
    return createErrorResponse(400, 'Invalid name format (1-255 characters)');
  }
  
  if (given_name !== undefined && (typeof given_name !== 'string' || given_name.length > 255)) {
    return createErrorResponse(400, 'Invalid given_name format (max 255 characters)');
  }
  
  if (family_name !== undefined && (typeof family_name !== 'string' || family_name.length > 255)) {
    return createErrorResponse(400, 'Invalid family_name format (max 255 characters)');
  }

  // Get current profile to verify user exists
  const currentProfile = await UserService.findById(userId);
  if (!currentProfile) {
    return createErrorResponse(404, 'User profile not found');
  }

  // Prepare update data (only include fields that were provided)
  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (given_name !== undefined) updateData.given_name = given_name;
  if (family_name !== undefined) updateData.family_name = family_name;

  // If no fields to update, return current profile
  if (Object.keys(updateData).length === 0) {
    return createResponse(200, {
      success: true,
      message: 'No changes to update',
      user: {
        id: currentProfile.id,
        email: currentProfile.email,
        name: currentProfile.name,
        given_name: currentProfile.given_name,
        family_name: currentProfile.family_name,
        updated_at: currentProfile.updated_at,
      },
    });
  }

  // Update profile with encrypted storage
  const updatedProfile = await UserService.update(userId, updateData);

  auditLog('profile_updated', userId, { 
    fieldsUpdated: Object.keys(updateData),
    updateCount: Object.keys(updateData).length
  });

  return createResponse(200, {
    success: true,
    message: 'Profile updated successfully',
    user: {
      id: updatedProfile.id,
      email: updatedProfile.email,
      name: updatedProfile.name,
      given_name: updatedProfile.given_name,
      family_name: updatedProfile.family_name,
      updated_at: updatedProfile.updated_at,
    },
  });
}

