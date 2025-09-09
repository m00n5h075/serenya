const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const { 
  createResponse, 
  createErrorResponse, 
  generateJWT, 
  auditLog,
  sanitizeError,
  getSecrets
} = require('./utils');
const { UserService, ConsentService, SessionService, DeviceService } = require('./database');

/**
 * Google OAuth verification and JWT generation
 * POST /auth/google-onboarding
 */
exports.handler = async (event) => {
  const requestId = uuidv4();
  
  try {
    auditLog('auth_attempt', 'anonymous', { 
      requestId,
      userAgent: event.headers['User-Agent'],
      sourceIp: event.requestContext?.identity?.sourceIp 
    });

    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'INVALID_JSON', 'Invalid request format', 'Please check your request and try again');
    }

    const { 
      google_token, 
      id_token, 
      consent_acknowledgments,
      device_info,
      encryption_context
    } = body;

    // Validate required fields
    if (!google_token || !id_token) {
      return createErrorResponse(400, 'MISSING_REQUIRED_FIELD', 'Missing required authentication fields', 'Please ensure you are signed in with Google');
    }

    // Validate consent acknowledgments for new users
    if (consent_acknowledgments) {
      const requiredConsents = ['medical_disclaimers', 'terms_of_service', 'privacy_policy'];
      const missingConsents = requiredConsents.filter(consent => 
        !consent_acknowledgments[consent]
      );
      
      if (missingConsents.length > 0) {
        return createErrorResponse(400, 'MISSING_CONSENT', 'Required consent not provided', 'Please accept all required terms to continue', {
          missing_consents: missingConsents
        });
      }
    }

    // Verify Google ID token
    const googleUserData = await verifyGoogleToken(id_token);
    if (!googleUserData) {
      auditLog('auth_failed', 'anonymous', { requestId, reason: 'invalid_google_token' });
      return createErrorResponse(401, 'INVALID_GOOGLE_TOKEN', 'Google authentication failed', 'Please try signing in with Google again');
    }

    // Check if user exists in database
    let user = await UserService.findByExternalId(googleUserData.sub, 'google');
    let isNewUser = false;
    
    if (!user) {
      // Create new user with encrypted PII
      isNewUser = true;
      user = await UserService.create({
        externalId: googleUserData.sub,
        authProvider: 'google',
        email: googleUserData.email,
        emailVerified: googleUserData.email_verified === 'true',
        name: googleUserData.name,
        givenName: googleUserData.given_name,
        familyName: googleUserData.family_name,
      });
      
      // Create consent records for new users
      if (consent_acknowledgments) {
        const consentPromises = Object.entries(consent_acknowledgments)
          .filter(([_, granted]) => granted)
          .map(([consentType, _]) => 
            ConsentService.createConsent(user.id, consentType, true, 'v1.0')
          );
        
        await Promise.all(consentPromises);
        
        auditLog('consent_granted', user.id, {
          requestId,
          consents: Object.keys(consent_acknowledgments).filter(k => consent_acknowledgments[k])
        });
      }
    } else {
      // Update last login for existing user
      await UserService.updateLastLogin(user.id);
    }

    // Handle device registration
    let device = null;
    if (device_info) {
      device = await DeviceService.findOrCreateDevice({
        userId: user.id,
        platformType: device_info.platform || 'unknown',
        appInstallationId: device_info.app_installation_id || `fallback-${user.id}`,
        deviceFingerprint: device_info.device_fingerprint || null,
        appVersion: device_info.app_version || '1.0.0'
      });
    }

    // Create session record
    const sessionId = uuidv4();
    const refreshToken = uuidv4();
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    // Generate JWT access token
    const accessToken = await generateJWT({
      userId: user.id,
      email: user.email,
      name: user.name,
      sessionId: sessionId
    });
    
    // Store session in database (always create session, use device.id if available, null otherwise)
    await SessionService.createSession({
      userId: user.id,
      deviceId: device ? device.id : null,
      sessionId: sessionId,
      refreshToken: refreshToken,
      expiresAt: sessionExpiresAt,
      userAgent: event.headers['User-Agent'] || 'Unknown',
      sourceIp: event.requestContext?.identity?.sourceIp || 'Unknown'
    });
    
    auditLog('auth_success', user.id, { 
      requestId,
      isNewUser,
      hasDeviceInfo: !!device_info,
      hasEncryptionContext: !!encryption_context,
      provider: 'google' 
    });

    // Build response according to API contract (aligned with mobile AuthOnboardingResponse)
    const response = {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        user_id: user.id,
        email: user.email,
        display_name: user.name || user.email.split('@')[0], // Default display name from email
        profile_picture: googleUserData.picture || null,
        timezone: 'UTC', // Default timezone, can be updated later
        created_at: new Date().toISOString(),
        last_login_at: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        preferences: null, // No preferences on first login
      },
      expires_in: 3600, // 1 hour token expiration
    };

    return createResponse(200, response);

  } catch (error) {
    console.error('Auth error:', sanitizeError(error));
    auditLog('auth_error', 'anonymous', { 
      requestId,
      error: sanitizeError(error).substring(0, 100) 
    });
    
    return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error occurred', 'Authentication failed. Please try again.');
  }
};

/**
 * Verify Google ID token with Google's API
 */
async function verifyGoogleToken(idToken) {
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`,
      {
        method: 'GET',
        timeout: 10000, // 10 second timeout
      }
    );

    if (!response.ok) {
      console.error('Google token verification failed:', response.status);
      return null;
    }

    const data = await response.json();

    // Verify token audience (client ID)
    const secrets = await getSecrets();
    if (data.aud !== secrets.googleClientId) {
      console.error('Invalid token audience');
      return null;
    }

    // Verify token is not expired
    const now = Math.floor(Date.now() / 1000);
    if (data.exp < now) {
      console.error('Token expired');
      return null;
    }

    // Verify email is verified
    if (data.email_verified !== 'true') {
      console.error('Email not verified');
      return null;
    }

    return {
      sub: data.sub,
      email: data.email,
      name: data.name,
      picture: data.picture,
      email_verified: data.email_verified,
    };

  } catch (error) {
    console.error('Error verifying Google token:', sanitizeError(error));
    return null;
  }
}

/**
 * Validate device ID format
 */
function isValidDeviceId(deviceId) {
  if (!deviceId) return false;
  
  // Device ID should be 16 characters alphanumeric
  const deviceIdRegex = /^[a-zA-Z0-9]{16}$/;
  return deviceIdRegex.test(deviceId);
}

/**
 * Refresh token endpoint
 * POST /auth/refresh
 */
exports.refreshHandler = async (event) => {
  const requestId = uuidv4();
  
  try {
    auditLog('token_refresh_attempt', 'anonymous', { requestId });

    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'INVALID_JSON', 'Invalid request format', 'Please check your request and try again');
    }

    const { refresh_token, device_id } = body;

    // Validate required fields
    if (!refresh_token) {
      return createErrorResponse(400, 'MISSING_REQUIRED_FIELD', 'Missing refresh token', 'Please provide a valid refresh token');
    }

    // Validate refresh token against database
    const session = await SessionService.findByRefreshToken(refresh_token);
    
    if (!session) {
      auditLog('token_refresh_failed', 'anonymous', { requestId, reason: 'invalid_refresh_token' });
      return createErrorResponse(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token', 'Please sign in again');
    }

    // Get user data
    const user = await UserService.findById(session.user_id);
    if (!user) {
      auditLog('token_refresh_failed', session.user_id, { requestId, reason: 'user_not_found' });
      return createErrorResponse(401, 'USER_NOT_FOUND', 'User not found', 'Please sign in again');
    }

    // Generate new tokens
    const newSessionId = uuidv4();
    const newRefreshToken = uuidv4();
    const newAccessToken = await generateJWT({
      userId: user.id,
      email: user.email,
      name: user.name,
      sessionId: newSessionId
    });

    // Update session with new tokens
    await SessionService.revokeSession(session.session_id);
    
    const newSessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    await SessionService.createSession({
      userId: user.id,
      deviceId: session.device_id,
      sessionId: newSessionId,
      refreshToken: newRefreshToken,
      expiresAt: newSessionExpiresAt,
      userAgent: event.headers['User-Agent'] || 'Unknown',
      sourceIp: event.requestContext?.identity?.sourceIp || 'Unknown'
    });

    auditLog('token_refresh_success', user.id, { requestId, sessionId: newSessionId });

    const response = {
      success: true,
      data: {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        session: {
          session_id: newSessionId,
          expires_at: newSessionExpiresAt.toISOString()
        }
      },
      audit_logged: true
    };

    return createResponse(200, response);

  } catch (error) {
    console.error('Token refresh error:', sanitizeError(error));
    auditLog('token_refresh_error', 'anonymous', { 
      requestId,
      error: sanitizeError(error).substring(0, 100) 
    });
    
    return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error occurred', 'Token refresh failed. Please try again.');
  }
};

/**
 * Check if user email domain is allowed (if needed for enterprise features)
 */
function isAllowedEmailDomain(email) {
  // For now, allow all domains
  // In enterprise version, this could check against approved domains
  return true;
}