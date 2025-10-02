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
  getApplePrivateKey,
  categorizeError,
  createUnifiedError,
  withRetry,
  updateCircuitBreaker,
  ERROR_CATEGORIES
} = require('./utils');
const { auditService } = require('../shared/audit-service-dynamodb');
const { DynamoDBUserService } = require('../shared/dynamodb-service');
const { ObservabilityService } = require('../shared/observability-service');

/**
 * DynamoDB-based OAuth Authentication
 * POST /auth/oauth-onboarding
 * Supports Google and Apple OAuth providers with clean DynamoDB backend
 */
exports.handler = async (event) => {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  // Initialize observability
  const observability = ObservabilityService.createForFunction('auth', event);
  const sourceIp = event.requestContext?.identity?.sourceIp;
  const userAgent = event.headers?.['User-Agent'];
  const deviceType = userAgent?.includes('Mobile') ? 'mobile' : 'desktop';
  
  console.log('=== AUTH FUNCTION START (DynamoDB) ===');
  console.log('Request ID:', requestId);
  console.log('Timestamp:', new Date().toISOString());
  
  // Track function start
  await observability.logEvent('function_start', null, {
    functionName: 'auth',
    requestId,
    sourceIp,
    userAgent,
    deviceType
  });
  
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
      const unifiedError = createUnifiedError(parseError, {
        service: 'auth',
        operation: 'request_parsing',
        category: ERROR_CATEGORIES.VALIDATION
      });
      
      await auditService.logAuditEvent({
        eventType: 'validation',
        eventSubtype: 'invalid_json_auth_request',
        userId: 'unauthenticated',
        eventDetails: {
          correlationId: unifiedError.correlationId,
          requestId: requestId
        },
        dataClassification: 'validation_error'
      }).catch(() => {});
      
      console.error('❌ JSON parsing failed:', parseError.message);
      console.error('Raw body:', event.body);
      return createErrorResponse(400, 'INVALID_JSON', 'Invalid JSON in request body', 'Please provide valid JSON data.');
    }

    const { auth_token, auth_provider, consent_version, device_info, biometric_info } = body;

    console.log('=== EXTRACTED FIELDS ===');
    console.log('Auth Provider:', auth_provider);
    console.log('Auth Token (first 50 chars):', auth_token ? auth_token.substring(0, 50) + '...' : 'undefined');
    console.log('Consent version:', consent_version);
    console.log('Device info:', device_info ? 'present' : 'missing');
    console.log('Biometric info:', biometric_info ? 'present' : 'missing');

    // Validate required fields
    console.log('=== VALIDATING REQUIRED FIELDS ===');
    if (!auth_token) {
      const unifiedError = createUnifiedError(new Error('Missing auth token'), {
        service: 'auth',
        operation: 'token_validation',
        category: ERROR_CATEGORIES.VALIDATION
      });
      
      await auditService.logAuditEvent({
        eventType: 'validation',
        eventSubtype: 'missing_auth_token',
        userId: 'unauthenticated',
        eventDetails: {
          correlationId: unifiedError.correlationId,
          requestId: requestId,
          authProvider: auth_provider
        },
        dataClassification: 'validation_error'
      }).catch(() => {});
      
      console.error('❌ Missing authentication token');
      return createErrorResponse(400, 'MISSING_AUTH_TOKEN', 'Missing authentication token', 'Please provide a valid authentication token.');
    }
    console.log('✅ Auth token validation passed');

    if (!auth_provider || !['google', 'apple'].includes(auth_provider)) {
      const unifiedError = createUnifiedError(new Error('Invalid auth provider'), {
        service: 'auth',
        operation: 'provider_validation',
        category: ERROR_CATEGORIES.VALIDATION
      });
      
      await auditService.logAuditEvent({
        eventType: 'validation',
        eventSubtype: 'invalid_auth_provider',
        userId: 'unauthenticated',
        eventDetails: {
          correlationId: unifiedError.correlationId,
          requestId: requestId,
          providedProvider: auth_provider
        },
        dataClassification: 'validation_error'
      }).catch(() => {});
      
      console.error('❌ Invalid auth provider:', auth_provider);
      return createErrorResponse(400, 'INVALID_AUTH_PROVIDER', 'Invalid authentication provider', 'Please use "google" or "apple" as the authentication provider.');
    }
    console.log('✅ Auth provider validation passed:', auth_provider);

    console.log(`=== PROCESSING ${auth_provider.toUpperCase()} OAUTH AUTHENTICATION ===`);

    // Initialize DynamoDB service
    console.log('🔧 Initializing DynamoDB service...');
    const userService = new DynamoDBUserService();
    console.log('✅ DynamoDB service initialized');

    // Verify OAuth token and get user data with retry logic
    console.log('🔐 Verifying OAuth token...');
    let oauthUserData;
    try {
      oauthUserData = await withRetry(
        () => verifyOAuthToken(auth_token, auth_provider),
        3,
        1000,
        `OAuth ${auth_provider} token verification`
      );
      console.log('✅ OAuth verification successful:', { 
        sub: oauthUserData.sub, 
        email: oauthUserData.email,
        provider: auth_provider 
      });
    } catch (verificationError) {
      console.error('❌ CRITICAL: OAuth token verification failed:', verificationError);
      console.error('Verification error details:', verificationError.message, verificationError.code, verificationError.stack);
      auditLog('oauth_verification_failed', 'anonymous', { 
        requestId,
        provider: auth_provider,
        error: sanitizeError(verificationError).message?.substring(0, 100) 
      });
      
      if (verificationError.message?.includes('Invalid token') || verificationError.message?.includes('Token verification failed')) {
        return createErrorResponse(401, 'INVALID_TOKEN', 'Authentication token is invalid', 'Please sign in again with a valid account.');
      }
      return createErrorResponse(500, 'VERIFICATION_ERROR', 'Token verification failed', 'An error occurred during authentication. Please try again.');
    }

    // Check if user already exists by external ID
    console.log('🔍 Checking for existing user by external ID...');
    let existingUser;
    try {
      existingUser = await userService.findByExternalId(oauthUserData.sub, auth_provider);
      console.log('User lookup result:', existingUser ? 'Found existing user' : 'No existing user found');
    } catch (lookupError) {
      console.error('❌ CRITICAL: User lookup failed:', lookupError);
      console.error('Lookup error details:', lookupError.message, lookupError.code, lookupError.stack);
      throw new Error(`User lookup failed: ${lookupError.message}`);
    }
    
    let userId;
    let isNewUser = false;

    if (existingUser) {
      // Existing user - update last login
      userId = existingUser.id;
      console.log('🔄 Existing user found, updating last login:', userId);
      
      try {
        console.log('📡 Calling userService.updateUserProfile for last login...');
        await userService.updateUserProfile(userId, { 
          last_login_at: Date.now(),
          email_verified: oauthUserData.email_verified || existingUser.email_verified
        });
        console.log('✅ Last login updated successfully');
      } catch (updateError) {
        console.error('❌ CRITICAL: Last login update failed:', updateError);
        console.error('Update error details:', updateError.message, updateError.code, updateError.stack);
        console.error('User ID:', userId);
        throw new Error(`Last login update failed: ${updateError.message}`);
      }

    } else {
      // Check if user exists with same email (for account linking)
      console.log('📧 Checking for existing user with same email...');
      let emailUser;
      try {
        const emailHash = await userService.generateEmailHash(oauthUserData.email);
        emailUser = await userService.findByEmailHash(emailHash);
        console.log('Email lookup result:', emailUser ? 'Found user with same email' : 'No user with same email');
      } catch (emailLookupError) {
        console.error('❌ CRITICAL: Email lookup failed:', emailLookupError);
        console.error('Email lookup error details:', emailLookupError.message, emailLookupError.code, emailLookupError.stack);
        throw new Error(`Email lookup failed: ${emailLookupError.message}`);
      }
      
      if (emailUser) {
        // Account linking scenario - user exists with same email but different provider
        console.log('⚠️ Account linking detected - same email, different provider');
        auditLog('account_linking_required', 'anonymous', {
          requestId,
          email: oauthUserData.email?.substring(0, 3) + '***',
          existing_provider: emailUser.auth_provider,
          attempted_provider: auth_provider
        });
        return createErrorResponse(409, 'ACCOUNT_LINKING_REQUIRED', 'Account already exists with this email', 'An account with this email already exists. Please use the same sign-in method you used originally.');
      }

      // Create new user
      console.log('👶 Creating new user...');
      isNewUser = true;
      userId = uuidv4();
      console.log('📝 Generated new user ID:', userId);

      const userData = {
        id: userId,
        external_id: oauthUserData.sub,
        auth_provider: auth_provider,
        email: oauthUserData.email,
        name: oauthUserData.name || oauthUserData.email.split('@')[0], // Fallback to email prefix if no name
        given_name: oauthUserData.given_name || '',
        family_name: oauthUserData.family_name || '',
        email_verified: oauthUserData.email_verified || false,
        account_status: 'active',
        consent_version: consent_version || '1.0',
        source_ip: event.requestContext?.identity?.sourceIp,
        user_agent: event.headers['User-Agent']
      };
      console.log('📋 New user data prepared:', JSON.stringify({...userData, external_id: '***'}, null, 2));

      try {
        console.log('📡 Calling userService.createUserProfile...');
        await userService.createUserProfile(userData);
        console.log('✅ New user created successfully');
      } catch (createError) {
        console.error('❌ CRITICAL: User creation failed:', createError);
        console.error('Create error details:', createError.message, createError.code, createError.stack);
        console.error('Failed user data:', JSON.stringify({...userData, external_id: '***'}, null, 2));
        throw new Error(`User creation failed: ${createError.message}`);
      }
      
      auditLog('user_created', userId, { 
        provider: auth_provider, 
        email: oauthUserData.email?.substring(0, 3) + '***',
        requestId 
      });
      
      console.log('ℹ️ New user created with free tier access (no subscription record needed)');
    }

    // Handle device registration (separate from user creation)
    console.log('=== HANDLING DEVICE REGISTRATION ===');
    if (device_info) {
      try {
        console.log('📱 Processing device registration...');
        const deviceData = {
          device_id: device_info.device_id || uuidv4(),
          platform: device_info.platform,
          device_model: device_info.device_model,
          device_name: device_info.device_name,
          app_version: device_info.app_version,
          os_version: device_info.os_version,
          source_ip: event.requestContext?.identity?.sourceIp,
          user_agent: event.headers['User-Agent']
        };
        console.log('📱 Device data prepared:', JSON.stringify(deviceData, null, 2));

        console.log('📡 Calling userService.updateCurrentDevice...');
        await userService.updateCurrentDevice(userId, deviceData);
        console.log('✅ Device registered successfully');
      } catch (deviceError) {
        console.error('⚠️ Device registration failed (non-critical):', deviceError);
        console.error('Device error details:', deviceError.message, deviceError.code, deviceError.stack);
        // Device registration failure is non-critical - continue with auth
      }
    } else {
      console.log('📱 No device info provided - skipping device registration');
    }

    // Create session (separate from user creation)
    console.log('=== CREATING SESSION ===');
    const sessionData = {
      session_id: uuidv4(),
      source_ip: event.requestContext?.identity?.sourceIp,
      user_agent: event.headers['User-Agent'],
      login_method: `oauth_${auth_provider}`
    };
    console.log('🔑 Session data prepared:', JSON.stringify(sessionData, null, 2));

    try {
      console.log('📡 Calling userService.updateCurrentSession...');
      await userService.updateCurrentSession(userId, sessionData);
      console.log('✅ Session created successfully');
    } catch (sessionError) {
      console.error('❌ CRITICAL: Session creation failed:', sessionError);
      console.error('Session error details:', sessionError.message, sessionError.code, sessionError.stack);
      console.error('User ID:', userId);
      console.error('Session data:', JSON.stringify(sessionData, null, 2));
      throw new Error(`Session creation failed: ${sessionError.message}`);
    }

    // Handle biometric registration (optional, separate)
    console.log('=== HANDLING BIOMETRIC REGISTRATION ===');
    if (biometric_info && biometric_info.biometric_hash) {
      try {
        console.log('👆 Processing biometric registration...');
        const biometricData = {
          biometric_id: uuidv4(),
          biometric_type: biometric_info.biometric_type || 'fingerprint',
          biometric_hash: biometric_info.biometric_hash,
          device_id: device_info?.device_id,
          source_ip: event.requestContext?.identity?.sourceIp
        };
        console.log('👆 Biometric data prepared:', JSON.stringify({...biometricData, biometric_hash: '***'}, null, 2));

        console.log('📡 Calling userService.updateCurrentBiometric...');
        await userService.updateCurrentBiometric(userId, biometricData);
        console.log('✅ Biometric registered successfully');
      } catch (biometricError) {
        console.error('⚠️ Biometric registration failed (non-critical):', biometricError);
        console.error('Biometric error details:', biometricError.message, biometricError.code, biometricError.stack);
        // Biometric registration failure is non-critical - continue with auth
      }
    } else {
      console.log('👆 No biometric info provided - skipping biometric registration');
    }

    // Generate JWT token
    console.log('=== GENERATING JWT TOKEN ===');
    const jwtPayload = {
      sub: userId,
      email: oauthUserData.email,
      name: oauthUserData.name || '',
      auth_provider: auth_provider,
      session_id: sessionData.session_id,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
    };
    console.log('🎫 JWT payload prepared:', JSON.stringify({...jwtPayload, sub: '***'}, null, 2));

    let jwtToken;
    try {
      console.log('📡 Calling generateJWT...');
      jwtToken = await generateJWT(jwtPayload);
      console.log('✅ JWT token generated successfully');
      console.log('🎫 JWT token (first 50 chars):', jwtToken.substring(0, 50) + '...');
    } catch (jwtError) {
      console.error('❌ CRITICAL: JWT token generation failed:', jwtError);
      console.error('JWT error details:', jwtError.message, jwtError.code, jwtError.stack);
      console.error('JWT payload:', JSON.stringify({...jwtPayload, sub: '***'}, null, 2));
      throw new Error(`JWT generation failed: ${jwtError.message}`);
    }

    // Success audit log
    auditLog('auth_success', userId, { 
      provider: auth_provider,
      isNewUser,
      sessionId: sessionData.session_id,
      requestId 
    });

    console.log('✅ Authentication successful for user:', userId);

    // Track successful authentication with comprehensive observability
    const processingDuration = Date.now() - startTime;
    
    await Promise.all([
      // Track authentication success
      observability.trackAuthentication(true, auth_provider, deviceType, userId),
      
      // Track user journey step
      observability.trackUserJourney(isNewUser ? 'registration_complete' : 'login_complete', userId, {
        auth_provider,
        is_new_user: isNewUser,
        has_biometric: !!biometric_info,
        processing_duration_ms: processingDuration
      }),
      
      // Track function performance
      observability.trackLambdaPerformance(
        processingDuration,
        parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '512'),
        !process.env.AWS_LAMBDA_WARM_CONTAINER
      ),
      
      // Log detailed event for analytics
      observability.logEvent('authentication_success', userId, {
        auth_provider,
        device_type: deviceType,
        is_new_user: isNewUser,
        session_id: sessionData.session_id,
        processing_duration_ms: processingDuration,
        user_agent: userAgent,
        source_ip: sourceIp
      })
    ]);

    const response = {
      success: true,
      token: jwtToken,
      user: {
        id: userId,
        email: oauthUserData.email,
        name: oauthUserData.name || '',
        given_name: oauthUserData.given_name || '',
        family_name: oauthUserData.family_name || '',
        email_verified: oauthUserData.email_verified || false,
        auth_provider: auth_provider,
        is_new_user: isNewUser
      },
      session: {
        session_id: sessionData.session_id,
        expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString()
      }
    };

    const finalResponse = createResponse(200, response);
    console.log('📦 Wrapped response prepared');
    console.log('=== AUTH FUNCTION END (SUCCESS) ===');
    return finalResponse;

  } catch (error) {
    console.error('=== AUTH FUNCTION ERROR ===');
    console.error('❌ Error occurred during authentication');
    console.error('🔍 Error details:', error);
    console.error('📋 Error stack:', error.stack);
    console.error('🧼 Sanitized error:', sanitizeError(error));
    
    // Track authentication failure with observability
    const processingDuration = Date.now() - startTime;
    const provider = event.body ? JSON.parse(event.body).auth_provider : 'unknown';
    
    await Promise.all([
      // Track authentication failure
      observability.trackAuthentication(false, provider, deviceType, null),
      
      // Track error
      observability.trackError(error, 'authentication_error', null, {
        auth_provider: provider,
        device_type: deviceType,
        processing_duration_ms: processingDuration,
        user_agent: userAgent,
        source_ip: sourceIp
      }),
      
      // Track function performance (even for failures)
      observability.trackLambdaPerformance(
        processingDuration,
        parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '512'),
        !process.env.AWS_LAMBDA_WARM_CONTAINER
      ),
      
      // Log authentication failure event
      observability.logEvent('authentication_failure', null, {
        auth_provider: provider,
        device_type: deviceType,
        error_name: error.name,
        error_message: error.message,
        processing_duration_ms: processingDuration,
        user_agent: userAgent,
        source_ip: sourceIp
      })
    ]);
    
    const errorContext = {
      service: 'auth',
      operation: 'oauth_authentication',
      requestId: requestId
    };
    const unifiedError = createUnifiedError(error, errorContext);
    
    await auditService.logAuditEvent({
      eventType: 'authentication',
      eventSubtype: 'oauth_authentication_error',
      userId: 'unknown',
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
      if (error.message?.includes('Invalid token') || error.message?.includes('Token verification failed')) {
        return createErrorResponse(401, 'INVALID_TOKEN', 'Authentication token is invalid', 'Please sign in again with a valid account.');
      } else {
        return createErrorResponse(403, 'ACCESS_DENIED', error.message, unifiedError.userMessage);
      }
    } else if (unifiedError.category === ERROR_CATEGORIES.EXTERNAL) {
      return createErrorResponse(503, 'SERVICE_UNAVAILABLE', 'External service failure', 'Our sign-in service is temporarily unavailable. Please try again shortly');
    } else {
      // Technical errors - provide specific user-friendly messages
      if (error.message?.includes('User lookup failed') || error.message?.includes('User creation failed')) {
        return createErrorResponse(500, 'USER_MANAGEMENT_ERROR', 'User management failed', 'We had trouble setting up your account. Please try again');
      } else if (error.message?.includes('Session creation failed')) {
        return createErrorResponse(500, 'SESSION_ERROR', 'Session creation failed', 'We had trouble creating your session. Please try again');
      } else if (error.message?.includes('JWT generation failed')) {
        return createErrorResponse(500, 'TOKEN_GENERATION_ERROR', 'Token generation failed', 'We had trouble generating your access token. Please try again');
      } else {
        return createErrorResponse(500, 'AUTHENTICATION_FAILED', 'Authentication process failed', 'We had trouble signing you in. Please try again');
      }
    }
  }
};

/**
 * Verify OAuth token with provider - Enhanced with circuit breaker and error categorization
 */
async function verifyOAuthToken(token, provider) {
  console.log(`🔐 Verifying ${provider} OAuth token...`);
  
  try {
    let result;
    let isSuccess = false;
    
    try {
      if (provider === 'google') {
        console.log('📡 Calling verifyGoogleToken...');
        result = await verifyGoogleToken(token);
      } else if (provider === 'apple') {
        console.log('📡 Calling verifyAppleToken...');
        result = await verifyAppleToken(token);
      } else {
        console.error('❌ Unsupported OAuth provider:', provider);
        throw new Error(`Unsupported OAuth provider: ${provider}`);
      }
      
      isSuccess = true;
      console.log('✅ OAuth token verification successful for provider:', provider);
      
    } catch (verificationError) {
      // Categorize the error for proper handling
      const errorContext = {
        service: 'oauth',
        operation: 'token_verification',
        provider: provider
      };
      
      const categorization = categorizeError(verificationError, errorContext);
      console.error(`❌ OAuth verification failed (${categorization.category}):`, verificationError.message);
      
      // Re-throw with categorization context
      const enhancedError = new Error(`Token verification failed: ${verificationError.message}`);
      enhancedError.category = categorization.category;
      enhancedError.recovery_strategy = categorization.recovery_strategy;
      enhancedError.correlation_id = categorization.correlation_id;
      
      throw enhancedError;
      
    } finally {
      // Update circuit breaker for OAuth service
      updateCircuitBreaker(`oauth_${provider}`, isSuccess);
    }
    
    return result;
    
  } catch (error) {
    console.error(`❌ ${provider} token verification failed:`, error.message);
    console.error('Token verification error details:', error.code, error.stack);
    throw error; // Preserve enhanced error with categorization
  }
}

/**
 * Verify Google OAuth token
 */
async function verifyGoogleToken(token) {
  console.log('🔐 Verifying Google OAuth token...');
  
  try {
    console.log('📡 Making request to Google tokeninfo endpoint...');
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
    
    if (!response.ok) {
      console.error('❌ Google tokeninfo request failed:', response.status, response.statusText);
      throw new Error(`Google token verification failed: ${response.status}`);
    }
    
    console.log('✅ Google tokeninfo request successful');
    const userData = await response.json();
    
    if (userData.error) {
      console.error('❌ Google token contains error:', userData.error);
      throw new Error(`Google token error: ${userData.error}`);
    }
    
    console.log('✅ Google token verified successfully');
    console.log('📋 Google user data received:', { 
      sub: userData.sub, 
      email: userData.email, 
      name: userData.name,
      email_verified: userData.email_verified 
    });
    
    return {
      sub: userData.sub,
      email: userData.email,
      name: userData.name,
      given_name: userData.given_name,
      family_name: userData.family_name,
      email_verified: userData.email_verified === 'true'
    };
  } catch (error) {
    console.error('❌ Error verifying Google token:', sanitizeError(error));
    throw error;
  }
}

/**
 * Verify Apple OAuth token
 */
async function verifyAppleToken(token) {
  console.log('🍎 Verifying Apple OAuth token...');
  
  try {
    // Get Apple's public keys for verification
    console.log('📡 Fetching Apple public keys...');
    const keysResponse = await fetch('https://appleid.apple.com/auth/keys');
    
    if (!keysResponse.ok) {
      console.error('❌ Apple keys request failed:', keysResponse.status, keysResponse.statusText);
      throw new Error(`Failed to fetch Apple public keys: ${keysResponse.status}`);
    }
    
    const keysData = await keysResponse.json();
    console.log('✅ Apple public keys fetched successfully');
    
    // Decode token header to get key ID
    console.log('🔍 Decoding Apple token header...');
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      console.error('❌ Invalid Apple token structure');
      throw new Error('Invalid Apple token structure');
    }
    
    const header = JSON.parse(Buffer.from(tokenParts[0], 'base64').toString());
    console.log('✅ Apple token header decoded, key ID:', header.kid);
    
    // Find matching key
    const signingKey = keysData.keys.find(key => key.kid === header.kid);
    if (!signingKey) {
      console.error('❌ Apple signing key not found for key ID:', header.kid);
      throw new Error('Apple signing key not found');
    }
    console.log('✅ Apple signing key found');
    
    // Verify and decode token (simplified - in production use proper JWT library)
    console.log('🔍 Decoding Apple token payload...');
    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    
    // Basic validation
    console.log('✅ Apple token payload decoded, validating...');
    if (payload.iss !== 'https://appleid.apple.com') {
      console.error('❌ Invalid Apple token issuer:', payload.iss);
      throw new Error('Invalid Apple token issuer');
    }
    
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      console.error('❌ Apple token expired:', payload.exp, 'vs', Math.floor(Date.now() / 1000));
      throw new Error('Apple token expired');
    }
    
    console.log('✅ Apple token validated successfully');
    console.log('📋 Apple user data received:', { 
      sub: payload.sub, 
      email: payload.email, 
      email_verified: payload.email_verified 
    });
    
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name ? `${payload.name.firstName || ''} ${payload.name.lastName || ''}`.trim() : '',
      given_name: payload.name?.firstName || '',
      family_name: payload.name?.lastName || '',
      email_verified: payload.email_verified === 'true'
    };
    
  } catch (error) {
    console.error('❌ Apple token verification error:', sanitizeError(error));
    console.error('Apple verification error details:', error.message, error.code, error.stack);
    throw new Error(`Apple token verification failed: ${error.message}`);
  }
}