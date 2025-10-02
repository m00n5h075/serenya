const { v4: uuidv4 } = require('uuid');
const { 
  createResponse, 
  createErrorResponse, 
  auditLog,
  sanitizeError,
  getUserIdFromEvent,
  categorizeError,
  createUnifiedError,
  withRetry,
  ERROR_CATEGORIES
} = require('../shared/utils');
const { auditService } = require('../shared/audit-service');
const { DynamoDBUserService } = require('../shared/dynamodb-service');
const crypto = require('crypto');

/**
 * Start biometric registration process
 * POST /auth/biometric/register
 */
exports.startRegistration = async (event) => {
  const requestId = uuidv4();
  const userId = getUserIdFromEvent(event);
  
  try {
    auditLog('biometric_registration_start', userId, { requestId });

    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      const unifiedError = createUnifiedError(parseError, {
        service: 'biometric',
        operation: 'request_parsing',
        userId: userId,
        category: ERROR_CATEGORIES.VALIDATION
      });
      
      await auditService.logAuditEvent({
        eventType: 'validation',
        eventSubtype: 'invalid_json_biometric_request',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId,
          operation: 'start_registration'
        },
        dataClassification: 'validation_error'
      }).catch(() => {});
      
      return createErrorResponse(400, 'INVALID_JSON', 'Invalid request format', 'Please check your request and try again');
    }

    const { 
      biometric_type,
      device_id,
      device_attestation_data,
      platform_info
    } = body;

    // Validate required fields
    if (!biometric_type || !device_id) {
      return createErrorResponse(400, 'MISSING_REQUIRED_FIELD', 'Missing required fields', 'Please provide biometric type and device ID');
    }

    // Validate biometric type
    const validBiometricTypes = ['face_id', 'touch_id', 'fingerprint', 'voice_print'];
    if (!validBiometricTypes.includes(biometric_type)) {
      return createErrorResponse(400, 'INVALID_BIOMETRIC_TYPE', 'Invalid biometric type', 'Supported types: ' + validBiometricTypes.join(', '));
    }

    // Get user profile and verify device belongs to user with retry logic
    const userService = new DynamoDBUserService();
    let userProfile;
    try {
      userProfile = await withRetry(
        () => userService.getUserProfile(userId),
        3,
        1000,
        `DynamoDB getUserProfile for biometric ${userId}`
      );
    } catch (dbError) {
      const unifiedError = createUnifiedError(dbError, {
        service: 'biometric',
        operation: 'dynamodb_user_fetch',
        userId: userId,
        category: ERROR_CATEGORIES.EXTERNAL
      });
      
      await auditService.logAuditEvent({
        eventType: 'biometric_security',
        eventSubtype: 'user_profile_fetch_error',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId,
          operation: 'start_registration',
          error: sanitizeError(dbError).message?.substring(0, 100)
        },
        dataClassification: 'system_error'
      }).catch(() => {});
      
      throw dbError; // Let main catch block handle this
    }
    
    if (!userProfile || !userProfile.current_device || userProfile.current_device.device_id !== device_id) {
      return createErrorResponse(403, 'DEVICE_NOT_FOUND', 'Device not found or not authorized', 'Please ensure device is registered');
    }
    
    const userDevice = userProfile.current_device;

    // Generate challenge for biometric verification
    const challenge = crypto.randomBytes(32).toString('base64');
    const challengeExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const registrationId = uuidv4();

    // Update user profile with new biometric registration (simplified - single biometric per device)
    const updatedBiometric = {
      device_id: device_id,
      registration_id: registrationId,
      biometric_type: biometric_type,
      challenge: challenge,
      challenge_expires_at: challengeExpiresAt.toISOString(),
      is_verified: false,
      is_active: false,
      verification_failures: 0,
      device_attestation_data: device_attestation_data || {},
      registration_metadata: {
        registration_source: 'api_request',
        platform: platform_info?.platform || 'unknown',
        os_version: platform_info?.os_version || 'unknown',
        app_version: platform_info?.app_version || 'unknown',
        requested_at: new Date().toISOString()
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_verified_at: null
    };

    // Update user profile with new biometric data
    userProfile.current_biometric = updatedBiometric;
    await userService.updateUserProfile(userId, userProfile);

    auditLog('biometric_challenge_generated', userId, { 
      requestId,
      registrationId: registrationId,
      biometricType: biometric_type,
      deviceId: device_id
    });

    // Build response
    const response = {
      success: true,
      data: {
        registration_id: registrationId,
        challenge: challenge,
        challenge_expires_at: challengeExpiresAt.toISOString(),
        biometric_type: biometric_type,
        instructions: {
          message: `Please complete ${biometric_type} verification using the provided challenge`,
          next_step: 'Sign the challenge with your biometric key and call /auth/biometric/complete',
          timeout_seconds: 300
        }
      },
      audit_logged: true
    };

    return createResponse(200, response);

  } catch (error) {
    console.error('Biometric registration error:', sanitizeError(error));
    
    const errorContext = {
      service: 'biometric',
      operation: 'registration_start',
      userId: userId
    };
    const unifiedError = createUnifiedError(error, errorContext);
    
    await auditService.logAuditEvent({
      eventType: 'biometric_security',
      eventSubtype: 'registration_start_error',
      userId: userId,
      eventDetails: {
        correlationId: unifiedError.correlationId,
        errorCategory: unifiedError.category,
        recoveryStrategy: unifiedError.recoveryStrategy,
        requestId: requestId,
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
      return createErrorResponse(503, 'SERVICE_UNAVAILABLE', 'External service failure', 'Our biometric service is temporarily unavailable. Please try again shortly');
    } else {
      return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error occurred', 'We had trouble setting up your biometric authentication. Please try again');
    }
  }
};

/**
 * Complete biometric registration process
 * POST /auth/biometric/complete
 */
exports.completeRegistration = async (event) => {
  const requestId = uuidv4();
  const userId = getUserIdFromEvent(event);
  
  try {
    auditLog('biometric_registration_complete_attempt', userId, { requestId });

    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'INVALID_JSON', 'Invalid request format', 'Please check your request and try again');
    }

    const { 
      registration_id,
      signed_challenge,
      biometric_public_key,
      attestation_result
    } = body;

    // Validate required fields
    if (!registration_id || !signed_challenge || !biometric_public_key) {
      return createErrorResponse(400, 'MISSING_REQUIRED_FIELD', 'Missing required verification data', 'Please provide registration ID, signed challenge, and public key');
    }

    // Get user profile and validate registration
    const userService = new DynamoDBUserService();
    const userProfile = await userService.getUserProfile(userId);
    
    if (!userProfile || !userProfile.current_biometric) {
      return createErrorResponse(404, 'REGISTRATION_NOT_FOUND', 'Registration not found', 'Please start a new registration process');
    }

    const registration = userProfile.current_biometric;
    
    if (registration.registration_id !== registration_id) {
      return createErrorResponse(404, 'REGISTRATION_NOT_FOUND', 'Registration ID mismatch', 'Please start a new registration process');
    }

    if (registration.is_verified) {
      return createErrorResponse(400, 'REGISTRATION_ALREADY_COMPLETED', 'Registration already completed', 'Biometric is already active');
    }

    // Check if challenge has expired
    const now = new Date();
    if (now > new Date(registration.challenge_expires_at)) {
      return createErrorResponse(400, 'CHALLENGE_EXPIRED', 'Challenge has expired', 'Please start a new registration process');
    }

    // Verify the signed challenge (simplified - in production would verify cryptographic signature)
    if (!signed_challenge || signed_challenge.length < 32) {
      return createErrorResponse(400, 'INVALID_SIGNATURE', 'Invalid challenge signature', 'Please provide a valid signed challenge');
    }

    // Complete the registration by updating user profile
    userProfile.current_biometric.is_verified = true;
    userProfile.current_biometric.is_active = true;
    userProfile.current_biometric.updated_at = new Date().toISOString();
    userProfile.current_biometric.last_verified_at = new Date().toISOString();
    userProfile.current_biometric.challenge = null; // Clear challenge for security
    
    await userService.updateUserProfile(userId, userProfile);
    
    const completedAt = new Date().toISOString();

    auditLog('biometric_registration_completed', userId, { 
      requestId,
      registrationId: registration_id,
      biometricType: registration.biometric_type,
      deviceId: registration.device_id
    });

    // Build response
    const response = {
      success: true,
      data: {
        registration_id: registration_id,
        status: 'completed',
        biometric_type: registration.biometric_type,
        completed_at: completedAt,
        verification_required: false,
        next_steps: {
          message: 'Biometric registration completed successfully',
          action: 'Biometric authentication is now available for this device'
        }
      },
      audit_logged: true
    };

    return createResponse(200, response);

  } catch (error) {
    console.error('Biometric completion error:', sanitizeError(error));
    auditLog('biometric_completion_error', userId, { 
      requestId,
      error: sanitizeError(error).substring(0, 100) 
    });
    
    return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error occurred', 'Biometric registration completion failed. Please try again.');
  }
};

/**
 * Get user's biometric registrations
 * GET /auth/biometric/registrations
 */
exports.getRegistrations = async (event) => {
  const requestId = uuidv4();
  const userId = getUserIdFromEvent(event);
  
  try {
    auditLog('biometric_registrations_request', userId, { requestId });

    // Get user profile with device and biometric data
    const userService = new DynamoDBUserService();
    const userProfile = await userService.getUserProfile(userId);
    
    if (!userProfile) {
      return createErrorResponse(404, 'USER_NOT_FOUND', 'User profile not found', 'Please sign in again');
    }
    
    const allRegistrations = [];
    
    // Add current biometric registration if it exists
    if (userProfile.current_biometric && userProfile.current_device) {
      allRegistrations.push({
        registration_id: userProfile.current_biometric.registration_id,
        biometric_type: userProfile.current_biometric.biometric_type,
        registration_status: userProfile.current_biometric.is_verified ? 'completed' : 'pending',
        created_at: userProfile.current_biometric.created_at,
        completed_at: userProfile.current_biometric.last_verified_at,
        is_active: userProfile.current_biometric.is_active,
        device: {
          id: userProfile.current_device.device_id,
          platform_type: userProfile.current_device.platform,
          device_name: userProfile.current_device.device_name,
          last_seen_at: userProfile.current_device.last_active_at
        }
      });
    }

    // Build response
    const response = {
      success: true,
      data: {
        registrations: allRegistrations,
        total_count: allRegistrations.length,
        active_count: allRegistrations.filter(r => r.registration_status === 'completed').length
      },
      audit_logged: true
    };

    return createResponse(200, response);

  } catch (error) {
    console.error('Get registrations error:', sanitizeError(error));
    auditLog('biometric_registrations_error', userId, { 
      requestId,
      error: sanitizeError(error).substring(0, 100) 
    });
    
    return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error occurred', 'Failed to retrieve biometric registrations.');
  }
};

/**
 * Verify biometric authentication
 * POST /auth/biometric/verify
 */
exports.verifyBiometric = async (event) => {
  const requestId = uuidv4();
  const userId = getUserIdFromEvent(event);
  
  try {
    auditLog('biometric_verification_attempt', userId, { requestId });

    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'INVALID_JSON', 'Invalid request format', 'Please check your request and try again');
    }

    const { 
      registration_id,
      biometric_signature,
      challenge_data
    } = body;

    // Validate required fields
    if (!registration_id || !biometric_signature) {
      return createErrorResponse(400, 'MISSING_REQUIRED_FIELD', 'Missing verification data', 'Please provide registration ID and biometric signature');
    }

    // Get user profile and find registration
    const userService = new DynamoDBUserService();
    const userProfile = await userService.getUserProfile(userId);
    
    if (!userProfile || !userProfile.current_biometric) {
      return createErrorResponse(404, 'REGISTRATION_NOT_FOUND', 'Biometric registration not found', 'Please complete biometric registration first');
    }
    
    const registration = userProfile.current_biometric;
    
    if (registration.registration_id !== registration_id || !registration.is_verified || !registration.is_active) {
      return createErrorResponse(404, 'REGISTRATION_NOT_FOUND', 'Valid registration not found', 'Please complete biometric registration first');
    }

    // Verify biometric signature (simplified - in production would verify against stored public key)
    const isValid = biometric_signature.length >= 32; // Simplified validation
    
    if (!isValid) {
      // Increment failure count
      userProfile.current_biometric.verification_failures += 1;
      userProfile.current_biometric.updated_at = new Date().toISOString();
      await userService.updateUserProfile(userId, userProfile);
      
      auditLog('biometric_verification_failed', userId, { 
        requestId,
        registrationId: registration_id,
        reason: 'invalid_signature',
        failureCount: userProfile.current_biometric.verification_failures
      });
      
      return createErrorResponse(401, 'BIOMETRIC_VERIFICATION_FAILED', 'Biometric verification failed', 'Please try again');
    }

    // Update last verified timestamp
    userProfile.current_biometric.last_verified_at = new Date().toISOString();
    userProfile.current_biometric.updated_at = new Date().toISOString();
    await userService.updateUserProfile(userId, userProfile);

    auditLog('biometric_verification_success', userId, { 
      requestId,
      registrationId: registration_id,
      biometricType: registration.biometric_type
    });

    // Build response
    const response = {
      success: true,
      data: {
        verification_status: 'verified',
        biometric_type: registration.biometric_type,
        verified_at: new Date().toISOString(),
        session_enhanced: true
      },
      audit_logged: true
    };

    return createResponse(200, response);

  } catch (error) {
    console.error('Biometric verification error:', sanitizeError(error));
    auditLog('biometric_verification_error', userId, { 
      requestId,
      error: sanitizeError(error).substring(0, 100) 
    });
    
    return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error occurred', 'Biometric verification failed. Please try again.');
  }
};