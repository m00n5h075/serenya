const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { 
  createResponse, 
  createErrorResponse, 
  generateJWT, 
  auditLog,
  sanitizeError,
  getSecrets,
  getApplePrivateKey
} = require('./utils');
const { UserService, ConsentService, SessionService, DeviceService } = require('./database');

/**
 * Unified OAuth verification and JWT generation
 * POST /auth/oauth-onboarding
 * Supports both Google and Apple OAuth providers
 */
exports.handler = async (event) => {
  const requestId = uuidv4();
  
  console.log('=== AUTH FUNCTION START ===');
  console.log('Request ID:', requestId);
  console.log('Timestamp:', new Date().toISOString());
  
  try {
    console.log('AUTH FUNCTION CALLED - Full event:', JSON.stringify(event, null, 2));
    console.log('Request headers:', JSON.stringify(event.headers, null, 2));
    console.log('Request body:', event.body);
    console.log('Request path:', event.path);
    console.log('Request method:', event.httpMethod);
    console.log('Request source IP:', event.requestContext?.identity?.sourceIp);
    console.log('Request user agent:', event.headers['User-Agent']);
    
    auditLog('auth_attempt', 'anonymous', { 
      requestId,
      userAgent: event.headers['User-Agent'],
      sourceIp: event.requestContext?.identity?.sourceIp 
    });

    // Parse request body
    console.log('=== PARSING REQUEST BODY ===');
    let body;
    try {
      body = JSON.parse(event.body || '{}');
      console.log('✅ Body parsed successfully:', JSON.stringify(body, null, 2));
    } catch (parseError) {
      console.error('❌ JSON parsing failed:', parseError.message);
      console.error('Raw body:', event.body);
      return createErrorResponse(400, 'INVALID_JSON', 'Invalid request format', 'Please check your request and try again');
    }

    const { 
      provider,
      google_token, 
      id_token,
      google_id_token, // Flutter app sends this field name
      apple_id_token,
      apple_authorization_code,
      consent_acknowledgments,
      device_info,
      encryption_context
    } = body;

    // Support both field name formats for backward compatibility
    const finalIdToken = id_token || google_id_token;
    
    console.log('=== EXTRACTED FIELDS ===');
    console.log('Provider:', provider);
    console.log('Final ID Token (first 50 chars):', finalIdToken ? finalIdToken.substring(0, 50) + '...' : 'undefined');
    console.log('Google token:', google_token ? 'present' : 'missing');
    console.log('Apple ID token:', apple_id_token ? 'present' : 'missing');
    console.log('Consent acknowledgments:', consent_acknowledgments ? 'present' : 'missing');
    console.log('Device info:', device_info ? 'present' : 'missing');

    // Validate provider
    console.log('=== VALIDATING PROVIDER ===');
    if (!provider || !['google', 'apple'].includes(provider)) {
      console.error('❌ Invalid provider:', provider);
      return createErrorResponse(400, 'INVALID_PROVIDER', 'Invalid authentication provider', 'Please specify either google or apple as provider');
    }
    console.log('✅ Provider validation passed:', provider);

    // Validate required fields based on provider
    console.log('=== VALIDATING REQUIRED FIELDS ===');
    if (provider === 'google' && !finalIdToken) {
      console.error('❌ Missing Google ID token');
      return createErrorResponse(400, 'MISSING_REQUIRED_FIELD', 'Missing required Google authentication fields', 'Please ensure you are signed in with Google');
    }
    
    if (provider === 'apple' && !apple_id_token) {
      console.error('❌ Missing Apple ID token');
      return createErrorResponse(400, 'MISSING_REQUIRED_FIELD', 'Missing required Apple authentication fields', 'Please ensure you are signed in with Apple');
    }
    console.log('✅ Required fields validation passed');

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

    // Verify OAuth token based on provider
    console.log('=== VERIFYING OAUTH TOKEN ===');
    let oauthUserData;
    if (provider === 'google') {
      console.log('📞 Calling verifyGoogleToken with token:', finalIdToken.substring(0, 50) + '...');
      oauthUserData = await verifyGoogleToken(finalIdToken);
      if (!oauthUserData) {
        console.error('❌ Google token verification failed');
        auditLog('auth_failed', 'anonymous', { requestId, reason: 'invalid_google_token', provider });
        return createErrorResponse(401, 'INVALID_GOOGLE_TOKEN', 'Google authentication failed', 'Please try signing in with Google again');
      }
      console.log('✅ Google token verified successfully:', JSON.stringify(oauthUserData, null, 2));
    } else if (provider === 'apple') {
      const appleResult = await verifyAppleToken(apple_id_token, apple_authorization_code);
      if (!appleResult.success) {
        auditLog('auth_failed', 'anonymous', { 
          requestId, 
          reason: appleResult.errorCode || 'invalid_apple_token', 
          provider,
          appleErrorDetails: appleResult.details 
        });
        
        // Return specific Apple error responses
        switch (appleResult.errorCode) {
          case 'INVALID_TOKEN_STRUCTURE':
            return createErrorResponse(400, 'INVALID_APPLE_TOKEN', 'Invalid Apple ID token format', 'Please try signing in with Apple again');
          case 'TOKEN_EXPIRED':
            return createErrorResponse(401, 'APPLE_TOKEN_EXPIRED', 'Apple ID token expired', 'Please sign in with Apple again');
          case 'INVALID_ISSUER':
          case 'INVALID_AUDIENCE':
            return createErrorResponse(401, 'INVALID_APPLE_TOKEN', 'Apple token validation failed', 'Please try signing in with Apple again');
          case 'SIGNATURE_VERIFICATION_FAILED':
            return createErrorResponse(401, 'APPLE_SIGNATURE_INVALID', 'Apple token signature verification failed', 'Please try signing in with Apple again');
          case 'APPLE_KEYS_UNAVAILABLE':
            return createErrorResponse(503, 'APPLE_SERVICE_UNAVAILABLE', 'Apple authentication service temporarily unavailable', 'Please try again in a moment or use Google sign-in');
          default:
            return createErrorResponse(401, 'INVALID_APPLE_TOKEN', 'Apple authentication failed', 'Please try signing in with Apple again');
        }
      }
      oauthUserData = appleResult.userData;
    }

    // Check if user exists in database
    console.log('=== CHECKING USER IN DATABASE ===');
    console.log('🔍 Looking up user by external ID:', oauthUserData.sub, 'and provider:', provider);
    let user = await UserService.findByExternalId(oauthUserData.sub, provider);
    let isNewUser = false;
    console.log('👤 User lookup result:', user ? 'Found existing user' : 'No existing user found');
    
    if (!user) {
      // Check for account linking - same email with different provider
      console.log('🔍 Checking for existing user by email hash for account linking');
      const existingUserByEmail = await UserService.findByEmailHash(oauthUserData.email);
      console.log('📧 Email lookup result:', existingUserByEmail ? 'Found user with same email' : 'No user with same email');
      
      if (existingUserByEmail && existingUserByEmail.authProvider !== provider) {
        // Account linking scenario - same email, different provider
        auditLog('account_linking_detected', existingUserByEmail.id, { 
          requestId, 
          existingProvider: existingUserByEmail.authProvider, 
          newProvider: provider,
          email: oauthUserData.email 
        });
        
        // Generate secure account linking token
        const linkingToken = await generateAccountLinkingToken(existingUserByEmail.id, provider, oauthUserData);
        
        return createErrorResponse(409, 'ACCOUNT_LINKING_REQUIRED', 'Account exists with different provider', 
          `An account with this email already exists using ${existingUserByEmail.authProvider}. You can link your ${provider} account or sign in with ${existingUserByEmail.authProvider}.`,
          { 
            existing_provider: existingUserByEmail.authProvider,
            attempted_provider: provider,
            linking_available: true,
            linking_token: linkingToken,
            expires_in: 300 // 5 minutes
          }
        );
      }

      // Create new user with encrypted PII
      console.log('👶 Creating new user');
      isNewUser = true;
      const newUserData = {
        externalId: oauthUserData.sub,
        authProvider: provider,
        email: oauthUserData.email,
        emailVerified: oauthUserData.email_verified === 'true' || oauthUserData.email_verified === true,
        name: oauthUserData.name || oauthUserData.email.split('@')[0], // Fallback to email prefix if no name
        givenName: provider === 'google' ? oauthUserData.given_name : null,
        familyName: provider === 'google' ? oauthUserData.family_name : null,
        isPrivateEmail: provider === 'apple' ? oauthUserData.is_private_email : false,
      };
      console.log('📝 New user data:', JSON.stringify(newUserData, null, 2));
      user = await UserService.create(newUserData);
      console.log('✅ New user created with ID:', user.id);
      
      // Create consent records for new users
      if (consent_acknowledgments) {
        // Valid consent types from the ENUM
        const validConsentTypes = [
          'medical_disclaimers', 
          'terms_of_service', 
          'privacy_policy',
          'healthcare_consultation',
          'emergency_care_limitation'
        ];
        
        const consentPromises = Object.entries(consent_acknowledgments)
          .filter(([consentType, granted]) => validConsentTypes.includes(consentType) && granted)
          .map(([consentType, _]) => 
            ConsentService.createConsent(user.id, consentType, true, consent_acknowledgments.version || 'v1.0')
          );
        
        await Promise.all(consentPromises);
        
        auditLog('consent_granted', user.id, {
          requestId,
          consents: Object.keys(consent_acknowledgments).filter(k => consent_acknowledgments[k])
        });
      }
    } else {
      // Update last login for existing user
      console.log('🔄 Updating last login for existing user:', user.id);
      await UserService.updateLastLogin(user.id);
      console.log('✅ Last login updated');
    }

    // Handle device registration
    console.log('=== HANDLING DEVICE REGISTRATION ===');
    let device = null;
    if (device_info) {
      console.log('📱 Processing device info:', JSON.stringify(device_info, null, 2));
      device = await DeviceService.findOrCreateDevice({
        userId: user.id,
        platformType: device_info.platform || 'unknown',
        appInstallationId: device_info.app_installation_id || `fallback-${user.id}`,
        deviceFingerprint: device_info.device_fingerprint || null,
        appVersion: device_info.app_version || '1.0.0'
      });
      console.log('✅ Device registered/found:', device.id);
    } else {
      console.log('ℹ️ No device info provided');
    }

    // Create session record
    console.log('=== CREATING SESSION ===');
    const sessionId = uuidv4();
    const refreshToken = uuidv4();
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    console.log('🎫 Session ID:', sessionId);
    console.log('🔑 Refresh token generated');
    console.log('⏰ Session expires at:', sessionExpiresAt.toISOString());
    
    // Generate JWT access token
    console.log('🎟️ Generating JWT access token');
    const jwtPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      sessionId: sessionId
    };
    console.log('📝 JWT payload:', JSON.stringify(jwtPayload, null, 2));
    const accessToken = await generateJWT(jwtPayload);
    console.log('✅ JWT access token generated (first 50 chars):', accessToken.substring(0, 50) + '...');
    
    // Store session in database (always create session, use device.id if available, null otherwise)
    console.log('💾 Storing session in database');
    const sessionData = {
      userId: user.id,
      deviceId: device ? device.id : null,
      sessionId: sessionId,
      refreshToken: refreshToken,
      expiresAt: sessionExpiresAt,
      userAgent: event.headers['User-Agent'] || 'Unknown',
      sourceIp: event.requestContext?.identity?.sourceIp || 'Unknown'
    };
    console.log('📋 Session data:', JSON.stringify(sessionData, null, 2));
    await SessionService.createSession(sessionData);
    console.log('✅ Session stored in database');
    
    auditLog('auth_success', user.id, { 
      requestId,
      isNewUser,
      hasDeviceInfo: !!device_info,
      hasEncryptionContext: !!encryption_context,
      provider: provider 
    });

    // Build response according to API contract (aligned with mobile AuthOnboardingResponse)
    console.log('=== BUILDING RESPONSE ===');
    const response = {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        user_id: user.id,
        email: user.email,
        display_name: user.name || user.email.split('@')[0], // Default display name from email
        profile_picture: (provider === 'google' ? oauthUserData.picture : null) || null,
        timezone: 'UTC', // Default timezone, can be updated later
        created_at: new Date().toISOString(),
        last_login_at: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        preferences: null, // No preferences on first login
        auth_provider: provider, // Include provider information
        is_private_email: provider === 'apple' ? oauthUserData.is_private_email : false,
      },
      expires_in: 3600, // 1 hour token expiration
    };
    
    console.log('📤 Final response object:', JSON.stringify(response, null, 2));
    console.log('🎉 Authentication successful, returning 200 response');
    
    const finalResponse = createResponse(200, response);
    console.log('📦 Wrapped response:', JSON.stringify(finalResponse, null, 2));
    console.log('=== AUTH FUNCTION END (SUCCESS) ===');
    return finalResponse;

  } catch (error) {
    console.error('=== AUTH FUNCTION ERROR ===');
    console.error('❌ Error occurred during authentication');
    console.error('🔍 Error details:', error);
    console.error('📋 Error stack:', error.stack);
    console.error('🧼 Sanitized error:', sanitizeError(error));
    
    auditLog('auth_error', 'anonymous', { 
      requestId,
      error: sanitizeError(error).substring(0, 100) 
    });
    
    const errorResponse = createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error occurred', 'Authentication failed. Please try again.');
    console.error('📦 Error response:', JSON.stringify(errorResponse, null, 2));
    console.log('=== AUTH FUNCTION END (ERROR) ===');
    return errorResponse;
  }
};

/**
 * Verify Google ID token with Google's API
 */
async function verifyGoogleToken(idToken) {
  try {
    console.log('🔍 Verifying Google token with Google API');
    const tokenUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`;
    console.log('📞 Calling Google tokeninfo endpoint');
    
    const response = await fetch(tokenUrl, {
      method: 'GET',
      timeout: 10000, // 10 second timeout
    });

    console.log('📡 Google API response status:', response.status);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Google token verification failed:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log('✅ Google API response data:', JSON.stringify(data, null, 2));

    // Verify token audience (client ID) - support multiple valid audiences
    const secrets = await getSecrets();
    const validAudiences = [
      secrets.googleClientId,        // Web client
      secrets.googleAndroidClientId, // Android client  
      secrets.googleIosClientId      // iOS client
    ].filter(Boolean); // Remove any undefined values
    
    console.log('Token verification - Valid audiences:', validAudiences, 'Received audience:', data.aud);
    if (!validAudiences.includes(data.aud)) {
      console.error('Invalid token audience - Expected one of:', validAudiences, 'Got:', data.aud);
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
      email_verified: data.email_verified,
    };

  } catch (error) {
    console.error('Error verifying Google token:', sanitizeError(error));
    return null;
  }
}

/**
 * Verify Apple ID token with enhanced security validation
 * Returns structured response with success/error details
 */
async function verifyAppleToken(idToken, authorizationCode) {
  try {
    const secrets = await getSecrets();
    
    // Step 1: Decode and validate JWT structure
    const decodedToken = decodeAppleIdToken(idToken);
    if (!decodedToken) {
      console.error('Invalid Apple ID token structure');
      return {
        success: false,
        errorCode: 'INVALID_TOKEN_STRUCTURE',
        details: 'Apple ID token has invalid JWT structure'
      };
    }

    // Step 2: Verify token issuer and audience
    if (decodedToken.iss !== 'https://appleid.apple.com') {
      console.error('Invalid Apple ID token issuer:', decodedToken.iss);
      return {
        success: false,
        errorCode: 'INVALID_ISSUER',
        details: `Expected issuer: https://appleid.apple.com, got: ${decodedToken.iss}`
      };
    }

    if (decodedToken.aud !== secrets.appleClientId) {
      console.error('Invalid Apple ID token audience');
      return {
        success: false,
        errorCode: 'INVALID_AUDIENCE',
        details: 'Apple ID token audience does not match client ID'
      };
    }

    // Step 3: Verify token expiration
    const now = Math.floor(Date.now() / 1000);
    if (decodedToken.exp < now) {
      console.error('Apple ID token expired');
      return {
        success: false,
        errorCode: 'TOKEN_EXPIRED',
        details: `Token expired at ${new Date(decodedToken.exp * 1000).toISOString()}`
      };
    }

    // Step 4: Verify token signature against Apple's public keys
    const signatureResult = await verifyAppleTokenSignature(idToken);
    if (!signatureResult.valid) {
      console.error('Apple ID token signature verification failed:', signatureResult.error);
      return {
        success: false,
        errorCode: signatureResult.errorCode || 'SIGNATURE_VERIFICATION_FAILED',
        details: signatureResult.error || 'Token signature verification failed'
      };
    }

    // Step 5: Apple Auth library not needed for token verification
    // Token verification is complete at this point

    // Step 6: Extract user information from verified token
    const payload = decodedToken;
    
    // Handle Apple's name data (only provided on first sign-in)
    let userName = null;
    let userEmail = payload.email;
    
    if (payload.name) {
      // Name is provided on first sign-in
      userName = `${payload.name.firstName || ''} ${payload.name.lastName || ''}`.trim();
    }

    return {
      success: true,
      userData: {
        sub: payload.sub, // Apple's unique user identifier
        email: userEmail,
        name: userName,
        email_verified: payload.email_verified !== false, // Apple emails are generally verified
        is_private_email: payload.is_private_email || false,
        auth_time: payload.auth_time, // When user authenticated
      }
    };

  } catch (error) {
    console.error('Error verifying Apple token:', sanitizeError(error));
    return {
      success: false,
      errorCode: 'VERIFICATION_ERROR',
      details: sanitizeError(error)
    };
  }
}

/**
 * Decode Apple ID token without verification (for inspection)
 */
function decodeAppleIdToken(idToken) {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    const normalized = base64UrlDecode(payload);
    return JSON.parse(normalized);
  } catch (error) {
    console.error('Error decoding Apple ID token:', error);
    return null;
  }
}

/**
 * Verify Apple ID token signature against Apple's public keys
 * Returns structured response with validation details
 */
async function verifyAppleTokenSignature(idToken) {
  try {
    // Get Apple's public keys (with caching)
    let applePublicKeys;
    try {
      applePublicKeys = await getApplePublicKeys();
    } catch (keyError) {
      console.error('Failed to retrieve Apple public keys:', keyError);
      return {
        valid: false,
        errorCode: 'APPLE_KEYS_UNAVAILABLE',
        error: 'Unable to retrieve Apple public keys for verification'
      };
    }
    
    // Decode token header to get key ID
    let header, keyId;
    try {
      const parts = idToken.split('.');
      header = JSON.parse(base64UrlDecode(parts[0]));
      keyId = header.kid;
    } catch (decodeError) {
      return {
        valid: false,
        errorCode: 'INVALID_TOKEN_HEADER',
        error: 'Unable to decode token header'
      };
    }
    
    // Find the matching public key
    const publicKey = applePublicKeys.keys.find(key => key.kid === keyId);
    if (!publicKey) {
      console.error('Apple public key not found for key ID:', keyId);
      return {
        valid: false,
        errorCode: 'PUBLIC_KEY_NOT_FOUND',
        error: `No Apple public key found for key ID: ${keyId}`
      };
    }

    // Convert Apple's JWK to PEM format for verification
    let pemKey;
    try {
      pemKey = jwkToPem(publicKey);
    } catch (pemError) {
      console.error('Failed to convert JWK to PEM:', pemError);
      return {
        valid: false,
        errorCode: 'KEY_CONVERSION_FAILED',
        error: 'Failed to convert Apple public key to PEM format'
      };
    }
    
    // Verify JWT signature using jsonwebtoken library
    try {
      jwt.verify(idToken, pemKey, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        // Note: audience verification is done separately in verifyAppleToken
      });
      return {
        valid: true,
        keyId: keyId
      };
    } catch (jwtError) {
      console.error('JWT signature verification failed:', jwtError.message);
      return {
        valid: false,
        errorCode: 'SIGNATURE_INVALID',
        error: `JWT signature verification failed: ${jwtError.message}`
      };
    }
    
  } catch (error) {
    console.error('Error verifying Apple token signature:', error);
    return {
      valid: false,
      errorCode: 'SIGNATURE_VERIFICATION_ERROR',
      error: sanitizeError(error)
    };
  }
}

/**
 * Convert JWK (JSON Web Key) to PEM format
 */
function jwkToPem(jwk) {
  // This is a simplified implementation
  // In production, use a proper library like jwk-to-pem
  const crypto = require('crypto');
  
  // For RSA keys (which Apple uses)
  if (jwk.kty === 'RSA') {
    // Create public key from modulus and exponent
    const key = crypto.createPublicKey({
      key: {
        kty: jwk.kty,
        n: jwk.n,
        e: jwk.e,
      },
      format: 'jwk'
    });
    
    return key.export({
      type: 'spki',
      format: 'pem'
    });
  }
  
  throw new Error('Unsupported JWK key type: ' + jwk.kty);
}

// Cache for Apple's public keys (5-minute cache)
let appleKeysCache = {
  keys: null,
  timestamp: 0,
  ttl: 5 * 60 * 1000 // 5 minutes
};

/**
 * Get Apple's public keys for token verification (with caching)
 */
async function getApplePublicKeys() {
  try {
    const now = Date.now();
    
    // Return cached keys if still valid
    if (appleKeysCache.keys && (now - appleKeysCache.timestamp) < appleKeysCache.ttl) {
      return appleKeysCache.keys;
    }
    
    // Fetch fresh keys from Apple
    const response = await fetch('https://appleid.apple.com/auth/keys', {
      method: 'GET',
      timeout: 10000,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Apple public keys: ${response.status}`);
    }

    const keys = await response.json();
    
    // Update cache
    appleKeysCache = {
      keys: keys,
      timestamp: now,
      ttl: 5 * 60 * 1000
    };
    
    return keys;
  } catch (error) {
    console.error('Error fetching Apple public keys:', error);
    
    // If cache exists and fetch fails, use stale cache for resilience
    if (appleKeysCache.keys) {
      console.warn('Using stale Apple public keys cache due to fetch failure');
      return appleKeysCache.keys;
    }
    
    throw error;
  }
}

/**
 * Base64 URL decode utility
 */
function base64UrlDecode(str) {
  // Add padding if needed (correct calculation)
  str += '='.repeat((4 - str.length % 4) % 4);
  // Replace URL-safe characters
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(str, 'base64').toString();
}

/**
 * Generate secure account linking token
 */
async function generateAccountLinkingToken(existingUserId, newProvider, newProviderData) {
  try {
    const linkingData = {
      existing_user_id: existingUserId,
      new_provider: newProvider,
      new_provider_sub: newProviderData.sub,
      new_provider_email: newProviderData.email,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
    };
    
    // Generate secure linking token (JWT with short expiration)
    const linkingToken = await generateJWT({
      ...linkingData,
      purpose: 'account_linking'
    });
    
    // Store linking request in cache/database for validation
    // Note: In production, store this in Redis or a dedicated linking_requests table
    await storeLinkingRequest(linkingToken, linkingData);
    
    return linkingToken;
  } catch (error) {
    console.error('Error generating account linking token:', sanitizeError(error));
    throw new Error('Failed to generate account linking token');
  }
}

/**
 * Store account linking request (placeholder - implement with proper storage)
 */
async function storeLinkingRequest(token, linkingData) {
  // TODO: Implement proper storage (Redis, DynamoDB, or PostgreSQL table)
  // For now, this is a placeholder that would store the linking request
  console.log('Storing linking request:', { token: token.substring(0, 20) + '...', linkingData });
}

/**
 * Account linking confirmation endpoint
 * POST /auth/confirm-account-linking
 */
exports.confirmAccountLinking = async (event) => {
  const requestId = uuidv4();
  
  try {
    auditLog('account_linking_attempt', 'anonymous', { requestId });

    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'INVALID_JSON', 'Invalid request format', 'Please check your request and try again');
    }

    const { linking_token, confirmation } = body;

    if (!linking_token) {
      return createErrorResponse(400, 'MISSING_LINKING_TOKEN', 'Missing account linking token', 'Account linking token is required');
    }

    if (!confirmation || confirmation !== 'confirmed') {
      return createErrorResponse(400, 'LINKING_NOT_CONFIRMED', 'Account linking not confirmed', 'Please confirm that you want to link these accounts');
    }

    // Verify and decode linking token
    const linkingData = await verifyJWT(linking_token);
    if (!linkingData || linkingData.purpose !== 'account_linking') {
      return createErrorResponse(401, 'INVALID_LINKING_TOKEN', 'Invalid or expired linking token', 'Please restart the sign-in process');
    }

    // Check if linking request is still valid (not expired)
    const now = new Date();
    const expiresAt = new Date(linkingData.expires_at);
    if (now > expiresAt) {
      return createErrorResponse(401, 'LINKING_TOKEN_EXPIRED', 'Account linking token expired', 'Please restart the sign-in process');
    }

    // Perform account linking
    const existingUser = await UserService.findById(linkingData.existing_user_id);
    if (!existingUser) {
      return createErrorResponse(404, 'USER_NOT_FOUND', 'Original user account not found', 'Please restart the sign-in process');
    }

    // Add the new provider to the existing user's account
    await UserService.addAlternativeProvider(existingUser.id, {
      provider: linkingData.new_provider,
      externalId: linkingData.new_provider_sub,
      email: linkingData.new_provider_email,
      linkedAt: new Date().toISOString()
    });

    auditLog('account_linking_success', existingUser.id, {
      requestId,
      linkedProvider: linkingData.new_provider,
      email: linkingData.new_provider_email
    });

    // Generate authentication response for the linked account
    const sessionId = uuidv4();
    const refreshToken = uuidv4();
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    const accessToken = await generateJWT({
      userId: existingUser.id,
      email: existingUser.email,
      name: existingUser.name,
      sessionId: sessionId
    });
    
    await SessionService.createSession({
      userId: existingUser.id,
      deviceId: null, // Device info not available in linking flow
      sessionId: sessionId,
      refreshToken: refreshToken,
      expiresAt: sessionExpiresAt,
      userAgent: event.headers['User-Agent'] || 'Account Linking',
      sourceIp: event.requestContext?.identity?.sourceIp || 'Unknown'
    });

    const response = {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        user_id: existingUser.id,
        email: existingUser.email,
        display_name: existingUser.name || existingUser.email.split('@')[0],
        profile_picture: null,
        timezone: 'UTC',
        created_at: existingUser.createdAt,
        last_login_at: new Date().toISOString(),
        preferences: null,
        linked_providers: [existingUser.authProvider, linkingData.new_provider]
      },
      expires_in: 3600,
      account_linked: true
    };

    return createResponse(200, response);

  } catch (error) {
    console.error('Account linking error:', sanitizeError(error));
    auditLog('account_linking_error', 'anonymous', { 
      requestId,
      error: sanitizeError(error).substring(0, 100) 
    });
    
    return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Account linking failed', 'Please try again or contact support');
  }
};

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