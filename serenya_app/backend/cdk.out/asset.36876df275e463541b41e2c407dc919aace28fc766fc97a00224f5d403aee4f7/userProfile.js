const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  getUserProfile,
  auditLog,
  sanitizeError,
} = require('../shared/utils');

/**
 * User Profile Management
 * GET /user/profile
 */
exports.handler = async (event) => {
  try {
    const userId = getUserIdFromEvent(event);
    
    if (!userId) {
      return createErrorResponse(401, 'Invalid or missing authentication');
    }

    auditLog('profile_access', userId);

    // Get user profile from DynamoDB
    const userProfile = await getUserProfile(userId);
    
    if (!userProfile) {
      auditLog('profile_not_found', userId);
      return createErrorResponse(404, 'User profile not found');
    }

    // Return sanitized user profile (no sensitive data)
    const profileResponse = {
      id: userProfile.userId,
      email: userProfile.email,
      name: userProfile.name,
      profile_picture: userProfile.profilePicture,
      created_at: new Date(userProfile.createdAt).toISOString(),
      updated_at: new Date(userProfile.updatedAt).toISOString(),
      last_login_at: new Date(userProfile.lastLoginAt).toISOString(),
    };

    auditLog('profile_retrieved', userId);

    return createResponse(200, {
      success: true,
      user: profileResponse,
    });

  } catch (error) {
    console.error('User profile error:', sanitizeError(error));
    
    const userId = getUserIdFromEvent(event) || 'unknown';
    auditLog('profile_error', userId, { 
      error: sanitizeError(error).substring(0, 100) 
    });
    
    return createErrorResponse(500, 'Failed to retrieve user profile');
  }
};

/**
 * Update user profile (future endpoint)
 */
async function updateUserProfile(event) {
  try {
    const userId = getUserIdFromEvent(event);
    
    if (!userId) {
      return createErrorResponse(401, 'Invalid or missing authentication');
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    const { name } = body;

    // Validate input
    if (name && (typeof name !== 'string' || name.length > 100)) {
      return createErrorResponse(400, 'Invalid name format');
    }

    // Get current profile
    const currentProfile = await getUserProfile(userId);
    if (!currentProfile) {
      return createErrorResponse(404, 'User profile not found');
    }

    // Update profile
    const updatedProfile = {
      ...currentProfile,
      name: name || currentProfile.name,
      updatedAt: Date.now(),
    };

    await storeUserProfile(updatedProfile);

    auditLog('profile_updated', userId, { fieldsUpdated: Object.keys(body) });

    return createResponse(200, {
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedProfile.userId,
        email: updatedProfile.email,
        name: updatedProfile.name,
        profile_picture: updatedProfile.profilePicture,
        updated_at: new Date(updatedProfile.updatedAt).toISOString(),
      },
    });

  } catch (error) {
    console.error('Profile update error:', sanitizeError(error));
    
    const userId = getUserIdFromEvent(event) || 'unknown';
    auditLog('profile_update_error', userId, { 
      error: sanitizeError(error).substring(0, 100) 
    });
    
    return createErrorResponse(500, 'Failed to update user profile');
  }
}