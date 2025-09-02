const fetch = require('node-fetch');
const { 
  createResponse, 
  createErrorResponse, 
  generateJWT, 
  auditLog,
  sanitizeError,
  getSecrets
} = require('./utils');
const { UserService } = require('../shared/database');

/**
 * Google OAuth verification and JWT generation
 * POST /auth/google
 */
exports.handler = async (event) => {
  try {
    auditLog('auth_attempt', 'anonymous', { 
      userAgent: event.headers['User-Agent'],
      sourceIp: event.requestContext?.identity?.sourceIp 
    });

    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    const { google_token, id_token, device_id } = body;

    // Validate required fields
    if (!google_token || !id_token) {
      return createErrorResponse(400, 'Missing required fields: google_token and id_token');
    }

    // Verify Google ID token
    const googleUserData = await verifyGoogleToken(id_token);
    if (!googleUserData) {
      auditLog('auth_failed', 'anonymous', { reason: 'invalid_google_token' });
      return createErrorResponse(401, 'Invalid Google credentials');
    }

    // Check if user exists in database
    let user = await UserService.findByExternalId(googleUserData.sub, 'google');
    
    if (!user) {
      // Create new user
      user = await UserService.create({
        externalId: googleUserData.sub,
        authProvider: 'google',
        email: googleUserData.email,
        emailVerified: googleUserData.email_verified === 'true',
        name: googleUserData.name,
        givenName: googleUserData.given_name,
        familyName: googleUserData.family_name,
      });
    } else {
      // Update last login
      await UserService.updateLastLogin(user.id);
    }

    // Generate JWT token with user data
    const jwtToken = await generateJWT({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    auditLog('auth_success', user.id, { 
      hasDeviceId: !!device_id,
      provider: 'google' 
    });

    return createResponse(200, {
      success: true,
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        profile_picture: googleUserData.picture,
      },
      expires_in: 3600, // 1 hour
    });

  } catch (error) {
    console.error('Auth error:', sanitizeError(error));
    auditLog('auth_error', 'anonymous', { 
      error: sanitizeError(error).substring(0, 100) 
    });
    
    return createErrorResponse(500, 'Authentication failed');
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
 * Check if user email domain is allowed (if needed for enterprise features)
 */
function isAllowedEmailDomain(email) {
  // For now, allow all domains
  // In enterprise version, this could check against approved domains
  return true;
}