const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  auditLog,
  sanitizeError,
  createUnifiedError,
  withRetry,
  ERROR_CATEGORIES
} = require('../shared/utils');
const { auditService } = require('../shared/audit-service');
const { DynamoDBUserService } = require('../shared/dynamodb-service');
const { ObservabilityService } = require('../shared/observability-service');

/**
 * DynamoDB-based User Profile Management
 * GET /user/profile
 * PUT /user/profile (for updates)
 */
exports.handler = async (event) => {
  const startTime = Date.now();
  const observability = ObservabilityService.createForFunction('user-profile', event);
  const sessionId = event.requestContext?.requestId || 'unknown';
  const sourceIp = event.requestContext?.identity?.sourceIp;
  const userAgent = event.headers?.['User-Agent'];

  try {
    const userId = getUserIdFromEvent(event);
    
    if (!userId) {
      const unifiedError = createUnifiedError(new Error('Missing authentication'), {
        service: 'userProfile',
        operation: 'authentication',
        category: ERROR_CATEGORIES.BUSINESS
      });
      
      await auditService.logAuditEvent({
        eventType: 'access_control',
        eventSubtype: 'unauthenticated_profile_access',
        userId: 'unauthenticated',
        eventDetails: {
          correlationId: unifiedError.correlationId,
          httpMethod: event.httpMethod
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        userAgent: userAgent,
        dataClassification: 'security_event'
      }).catch(() => {});
      
      return createErrorResponse(401, 'UNAUTHORIZED', 'Invalid or missing authentication', 'Please sign in again.');
    }

    // Handle different HTTP methods
    if (event.httpMethod === 'GET') {
      return await getUserProfileHandler(userId);
    } else if (event.httpMethod === 'PUT') {
      return await updateUserProfileHandler(userId, event);
    } else {
      return createErrorResponse(405, 'METHOD_NOT_ALLOWED', 'Method not allowed', 'This endpoint does not support this HTTP method.');
    }

  } catch (error) {
    console.error('User profile error:', sanitizeError(error));

    const userId = getUserIdFromEvent(event) || 'unknown';

    await observability.trackError(error, 'user_profile', userId);

    const errorContext = {
      service: 'userProfile',
      operation: 'profile_operation',
      userId: userId,
      httpMethod: event.httpMethod
    };
    const unifiedError = createUnifiedError(error, errorContext);

    await auditService.logAuditEvent({
      eventType: 'user_management',
      eventSubtype: 'profile_operation_error',
      userId: userId,
      eventDetails: {
        correlationId: unifiedError.correlationId,
        errorCategory: unifiedError.category,
        recoveryStrategy: unifiedError.recoveryStrategy,
        httpMethod: event.httpMethod,
        error: sanitizeError(error).message?.substring(0, 100) || 'Unknown error'
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      userAgent: userAgent,
      dataClassification: 'system_error'
    }).catch(() => {});

    // Use categorized error response
    if (unifiedError.category === ERROR_CATEGORIES.VALIDATION) {
      return createErrorResponse(400, 'VALIDATION_ERROR', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.BUSINESS) {
      return createErrorResponse(403, 'ACCESS_DENIED', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.EXTERNAL) {
      return createErrorResponse(503, 'SERVICE_UNAVAILABLE', 'External service failure', 'Our user profile service is temporarily unavailable. Please try again shortly');
    } else {
      return createErrorResponse(500, 'PROFILE_ERROR', 'Profile operation failed', 'We had trouble processing your profile request. Please try again');
    }
  }
};

/**
 * Get user profile from DynamoDB
 */
async function getUserProfileHandler(userId) {
  // Enhanced audit logging for profile access
  await auditService.logAuditEvent({
    eventType: 'user_management',
    eventSubtype: 'profile_access',
    userId: userId,
    eventDetails: {
      operation: 'get_profile'
    },
    dataClassification: 'medical_phi'
  });

  const userService = new DynamoDBUserService();

  // Get user profile from DynamoDB with retry logic
  let userProfile;
  try {
    userProfile = await withRetry(
      () => userService.getUserProfile(userId),
      3,
      1000,
      `DynamoDB getUserProfile for ${userId}`
    );
  } catch (dbError) {
    const unifiedError = createUnifiedError(dbError, {
      service: 'userProfile',
      operation: 'dynamodb_get_profile',
      userId: userId,
      category: ERROR_CATEGORIES.EXTERNAL
    });
    
    await auditService.logAuditEvent({
      eventType: 'user_management',
      eventSubtype: 'profile_fetch_error',
      userId: userId,
      eventDetails: {
        correlationId: unifiedError.correlationId,
        error: sanitizeError(dbError).message?.substring(0, 100)
      },
      dataClassification: 'system_error'
    }).catch(() => {});
    
    throw dbError; // Re-throw to be handled by main catch block
  }
  
  if (!userProfile) {
    await auditService.logAuditEvent({
      eventType: 'user_management',
      eventSubtype: 'profile_not_found',
      userId: userId,
      eventDetails: {
        operation: 'get_profile'
      },
      dataClassification: 'security_event'
    });
    return createErrorResponse(404, 'PROFILE_NOT_FOUND', 'User profile not found', 'Your profile could not be found. Please sign in again.');
  }

  // Extract subscription information from user profile
  const subscription = userProfile.current_subscription;

  // Return sanitized user profile (PII is automatically decrypted by DynamoDB service)
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
    // Subscription information (embedded in user profile)
    subscription: subscription ? {
      type: subscription.type,
      status: subscription.status,
      provider: subscription.provider,
      end_date: subscription.end_date,
      starts_at: subscription.starts_at,
      credits_remaining: subscription.credits_remaining
    } : null
  };

  await auditService.logAuditEvent({
    eventType: 'user_management',
    eventSubtype: 'profile_retrieved',
    userId: userId,
    eventDetails: {
      operation: 'get_profile',
      hasSubscription: !!subscription,
      subscriptionType: subscription?.type
    },
    dataClassification: 'medical_phi'
  });

  // Track user profile view
  const observability = ObservabilityService.createForFunction('user-profile', {});
  await observability.trackUserJourney(userId, 'profile_viewed', {
    hasSubscription: !!subscription,
    subscriptionType: subscription?.type || 'free'
  });

  return createResponse(200, {
    success: true,
    user: profileResponse,
  });
}

/**
 * Update user profile in DynamoDB
 */
async function updateUserProfileHandler(userId, event) {
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (parseError) {
    return createErrorResponse(400, 'INVALID_JSON', 'Invalid JSON in request body', 'Please provide valid JSON data.');
  }

  const { name, given_name, family_name } = body;

  // Validate input
  if (name !== undefined && (typeof name !== 'string' || name.length > 255 || name.length < 1)) {
    return createErrorResponse(400, 'INVALID_NAME', 'Invalid name format', 'Name must be between 1 and 255 characters.');
  }
  
  if (given_name !== undefined && (typeof given_name !== 'string' || given_name.length > 255)) {
    return createErrorResponse(400, 'INVALID_GIVEN_NAME', 'Invalid given name format', 'Given name must be 255 characters or less.');
  }
  
  if (family_name !== undefined && (typeof family_name !== 'string' || family_name.length > 255)) {
    return createErrorResponse(400, 'INVALID_FAMILY_NAME', 'Invalid family name format', 'Family name must be 255 characters or less.');
  }

  const userService = new DynamoDBUserService();

  // Get current profile to verify user exists (with retry logic)
  let currentProfile;
  try {
    currentProfile = await withRetry(
      () => userService.getUserProfile(userId),
      3,
      1000,
      `DynamoDB getUserProfile for update ${userId}`
    );
  } catch (dbError) {
    const unifiedError = createUnifiedError(dbError, {
      service: 'userProfile',
      operation: 'dynamodb_get_profile_for_update',
      userId: userId,
      category: ERROR_CATEGORIES.EXTERNAL
    });
    
    await auditService.logAuditEvent({
      eventType: 'user_management',
      eventSubtype: 'profile_update_fetch_error',
      userId: userId,
      eventDetails: {
        correlationId: unifiedError.correlationId,
        error: sanitizeError(dbError).message?.substring(0, 100)
      },
      dataClassification: 'system_error'
    }).catch(() => {});
    
    throw dbError; // Re-throw to be handled by main catch block
  }
  
  if (!currentProfile) {
    await auditService.logAuditEvent({
      eventType: 'user_management',
      eventSubtype: 'profile_update_not_found',
      userId: userId,
      eventDetails: {
        operation: 'update_profile'
      },
      dataClassification: 'security_event'
    });
    return createErrorResponse(404, 'PROFILE_NOT_FOUND', 'User profile not found', 'Your profile could not be found. Please sign in again.');
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

  // Update profile in DynamoDB with retry logic
  let updatedProfile;
  try {
    updatedProfile = await withRetry(
      () => userService.updateUserProfile(userId, updateData),
      3,
      1000,
      `DynamoDB updateUserProfile for ${userId}`
    );
  } catch (dbError) {
    const unifiedError = createUnifiedError(dbError, {
      service: 'userProfile',
      operation: 'dynamodb_update_profile',
      userId: userId,
      category: ERROR_CATEGORIES.EXTERNAL
    });
    
    await auditService.logAuditEvent({
      eventType: 'user_management',
      eventSubtype: 'profile_update_error',
      userId: userId,
      eventDetails: {
        correlationId: unifiedError.correlationId,
        fieldsToUpdate: Object.keys(updateData),
        error: sanitizeError(dbError).message?.substring(0, 100)
      },
      dataClassification: 'system_error'
    }).catch(() => {});
    
    throw dbError; // Re-throw to be handled by main catch block
  }

  await auditService.logAuditEvent({
    eventType: 'user_management',
    eventSubtype: 'profile_updated',
    userId: userId,
    eventDetails: {
      operation: 'update_profile',
      fieldsUpdated: Object.keys(updateData),
      updateCount: Object.keys(updateData).length
    },
    dataClassification: 'medical_phi'
  });

  // Track user profile update and completion
  const observability = ObservabilityService.createForFunction('user-profile', {});
  await observability.trackUserJourney(userId, 'profile_updated', {
    fieldsUpdated: Object.keys(updateData),
    updateCount: Object.keys(updateData).length,
    profileComplete: !!(updatedProfile.name && updatedProfile.email)
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