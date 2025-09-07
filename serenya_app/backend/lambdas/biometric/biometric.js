const { v4: uuidv4 } = require('uuid');
const { 
  createResponse, 
  createErrorResponse, 
  auditLog,
  sanitizeError,
  getUserIdFromEvent
} = require('../shared/utils');
const { BiometricService, DeviceService } = require('../auth/database');

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

    // Verify device belongs to user
    const devices = await DeviceService.getUserDevices(userId);
    const userDevice = devices.find(d => d.id === device_id);
    
    if (!userDevice) {
      return createErrorResponse(403, 'DEVICE_NOT_FOUND', 'Device not found or not authorized', 'Please ensure device is registered');
    }

    // Generate challenge for biometric verification
    const crypto = require('crypto');
    const challenge = crypto.randomBytes(32).toString('base64');
    const challengeExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Create biometric registration
    const registration = await BiometricService.createRegistration({
      deviceId: device_id,
      biometricType: biometric_type,
      challenge: challenge,
      challengeExpiresAt: challengeExpiresAt,
      deviceAttestationData: device_attestation_data,
      registrationMetadata: {
        platform: platform_info?.platform || 'unknown',
        os_version: platform_info?.os_version || 'unknown',
        app_version: platform_info?.app_version || 'unknown',
        requested_at: new Date().toISOString()
      }
    });

    auditLog('biometric_challenge_generated', userId, { 
      requestId,
      registrationId: registration.registration_id,
      biometricType: biometric_type,
      deviceId: device_id
    });

    // Build response
    const response = {
      success: true,
      data: {
        registration_id: registration.registration_id,
        challenge: registration.challenge,
        challenge_expires_at: registration.challenge_expires_at,
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
    auditLog('biometric_registration_error', userId, { 
      requestId,
      error: sanitizeError(error).substring(0, 100) 
    });
    
    return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error occurred', 'Biometric registration failed. Please try again.');
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

    // Find and validate registration
    const registration = await BiometricService.findRegistration(registration_id);
    
    if (!registration) {
      return createErrorResponse(404, 'REGISTRATION_NOT_FOUND', 'Registration not found', 'Please start a new registration process');
    }

    if (registration.registration_status !== 'pending') {
      return createErrorResponse(400, 'REGISTRATION_NOT_PENDING', 'Registration not in pending state', 'Registration may have expired or been completed');
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

    // Complete the registration
    const completedRegistration = await BiometricService.completeRegistration(
      registration_id,
      {
        signedChallenge: signed_challenge,
        biometricPublicKey: biometric_public_key
      }
    );

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
        completed_at: completedRegistration.completed_at,
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

    // Get user devices
    const devices = await DeviceService.getUserDevices(userId);
    
    // Get registrations for each device
    const allRegistrations = [];
    
    for (const device of devices) {
      const deviceRegistrations = await BiometricService.getDeviceRegistrations(device.id);
      
      // Add device info to each registration
      const registrationsWithDevice = deviceRegistrations.map(reg => ({
        registration_id: reg.registration_id,
        biometric_type: reg.biometric_type,
        registration_status: reg.registration_status,
        created_at: reg.created_at,
        completed_at: reg.completed_at,
        device: {
          id: device.id,
          platform_type: device.platform_type,
          app_installation_id: device.app_installation_id,
          last_seen_at: device.last_seen_at
        }
      }));
      
      allRegistrations.push(...registrationsWithDevice);
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

    // Find registration
    const registration = await BiometricService.findRegistration(registration_id);
    
    if (!registration || registration.registration_status !== 'completed') {
      return createErrorResponse(404, 'REGISTRATION_NOT_FOUND', 'Valid registration not found', 'Please complete biometric registration first');
    }

    // Verify biometric signature (simplified - in production would verify against stored public key)
    const isValid = biometric_signature.length >= 32; // Simplified validation
    
    if (!isValid) {
      auditLog('biometric_verification_failed', userId, { 
        requestId,
        registrationId: registration_id,
        reason: 'invalid_signature'
      });
      
      return createErrorResponse(401, 'BIOMETRIC_VERIFICATION_FAILED', 'Biometric verification failed', 'Please try again');
    }

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