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
const { UserService, ConsentService } = require('./database');

/**
 * Google OAuth verification and JWT generation
 * POST /auth/google
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
    
    // TODO: Store session in database (session management table to be added)
    
    auditLog('auth_success', user.id, { 
      requestId,
      isNewUser,
      hasDeviceInfo: !!device_info,
      hasEncryptionContext: !!encryption_context,
      provider: 'google' 
    });

    // Build response according to API contract
    const response = {
      success: true,
      data: {
        access_token: accessToken,
        refresh_token: refreshToken, // TODO: Implement refresh token logic
        user: {
          id: user.id,
          email: user.email,
          google_user_id: googleUserData.sub,
          subscription_tier: 'free', // Default tier
          profile_completion: !!(user.name && user.email)
        },
        session: {
          session_id: sessionId,
          expires_at: sessionExpiresAt.toISOString(),
          biometric_required: false // TODO: Implement biometric requirements
        },
        encryption_support: {
          supported_algorithms: ['AES-256-GCM'],
          supported_tables: ['serenya_content', 'chat_messages'],
          server_encryption_version: 'v1'
        }
      },
      audit_logged: true
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

    // TODO: Implement refresh token validation against database
    // For now, return error indicating token expired
    auditLog('token_refresh_failed', 'anonymous', { requestId, reason: 'refresh_token_expired' });
    
    return createErrorResponse(401, 'REFRESH_TOKEN_EXPIRED', 'Refresh token has expired', 'Please sign in again', {
      action_required: 'full_authentication'
    });

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