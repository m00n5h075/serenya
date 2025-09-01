const fetch = require('node-fetch');
const { 
  createResponse, 
  createErrorResponse, 
  generateJWT, 
  storeUserProfile,
  auditLog,
  sanitizeError,
  getSecrets
} = require('./utils');

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

    // Create user data object
    const userData = {
      userId: generateUserId(googleUserData.email),
      email: googleUserData.email,
      name: googleUserData.name,
      profilePicture: googleUserData.picture,
      deviceId: device_id,
      googleId: googleUserData.sub,
    };

    // Store/update user profile
    await storeUserProfile(userData);

    // Generate JWT token
    const jwtToken = await generateJWT(userData);

    auditLog('auth_success', userData.userId, { 
      hasDeviceId: !!device_id,
      provider: 'google' 
    });

    return createResponse(200, {
      success: true,
      token: jwtToken,
      user: {
        id: userData.userId,
        email: userData.email,
        name: userData.name,
        profile_picture: userData.profilePicture,
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
 * Generate consistent user ID from email
 */
function generateUserId(email) {
  const crypto = require('crypto');
  return crypto
    .createHash('sha256')
    .update(email.toLowerCase())
    .digest('hex')
    .substring(0, 16);
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

/**
 * Rate limiting check (basic implementation)
 */
async function checkRateLimit(sourceIp) {
  // For production, implement Redis-based rate limiting
  // For now, basic IP-based checking with DynamoDB
  
  const rateLimitKey = `rate_limit_${sourceIp}`;
  const ttl = Math.floor(Date.now() / 1000) + 300; // 5 minutes
  
  try {
    await dynamodb.update({
      TableName: process.env.JOBS_TABLE_NAME,
      Key: { jobId: rateLimitKey },
      UpdateExpression: 'ADD attemptCount :inc SET #ttl = :ttl',
      ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':inc': 1,
        ':ttl': ttl,
      },
      ConditionExpression: 'attribute_not_exists(jobId) OR attemptCount < :limit',
      ExpressionAttributeValues: {
        ':inc': 1,
        ':ttl': ttl,
        ':limit': 10, // Max 10 attempts per IP per 5 minutes
      },
    }).promise();
    
    return true;
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      return false; // Rate limit exceeded
    }
    throw error;
  }
}