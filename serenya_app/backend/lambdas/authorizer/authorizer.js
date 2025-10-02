const {
  verifyJWT,
  sanitizeError,
  categorizeError,
  createUnifiedError,
  updateCircuitBreaker,
  ERROR_CATEGORIES
} = require('./utils');
const { auditService } = require('../shared/audit-service');
const { ObservabilityService } = require('../shared/observability-service');

/**
 * JWT Token Authorizer for API Gateway
 */
exports.handler = async (event) => {
  const startTime = Date.now();
  const observability = ObservabilityService.createForFunction('authorizer', event);
  let tokenInfo = null;

  try {
    const token = extractToken(event.authorizationToken);
    
    if (!token) {
      const unifiedError = createUnifiedError(new Error('No token provided'), {
        service: 'authorizer',
        operation: 'token_extraction',
        category: ERROR_CATEGORIES.VALIDATION
      });
      
      await auditService.logAuditEvent({
        eventType: 'access_control',
        eventSubtype: 'missing_authorization_token',
        userId: 'unauthenticated',
        eventDetails: {
          correlationId: unifiedError.correlationId,
          methodArn: event.methodArn
        },
        dataClassification: 'security_event'
      }).catch(() => {});
      
      throw new Error('No token provided');
    }

    // Validate token format first
    if (!isValidTokenFormat(token)) {
      const unifiedError = createUnifiedError(new Error('Invalid token format'), {
        service: 'authorizer',
        operation: 'token_validation',
        category: ERROR_CATEGORIES.VALIDATION
      });
      
      await auditService.logAuditEvent({
        eventType: 'access_control',
        eventSubtype: 'invalid_token_format',
        userId: 'unauthenticated',
        eventDetails: {
          correlationId: unifiedError.correlationId,
          tokenLength: token.length,
          methodArn: event.methodArn
        },
        dataClassification: 'security_event'
      }).catch(() => {});
      
      throw new Error('Invalid token format');
    }

    // Verify JWT token with circuit breaker pattern
    let jwtVerificationSuccess = false;
    let decoded;
    try {
      decoded = await verifyJWT(token);
      jwtVerificationSuccess = true;
      tokenInfo = {
        userId: decoded.sub,
        email: decoded.email
      };
    } catch (jwtError) {
      const errorContext = {
        service: 'oauth_verification',
        operation: 'jwt_verify',
        category: ERROR_CATEGORIES.EXTERNAL
      };
      const categorization = categorizeError(jwtError, errorContext);
      
      await auditService.logAuditEvent({
        eventType: 'access_control',
        eventSubtype: 'jwt_verification_failed',
        userId: 'unauthenticated',
        eventDetails: {
          error: sanitizeError(jwtError).message?.substring(0, 100),
          errorCategory: categorization.category,
          methodArn: event.methodArn
        },
        dataClassification: 'security_event'
      }).catch(() => {});
      
      throw jwtError;
    } finally {
      updateCircuitBreaker('oauth_verification', jwtVerificationSuccess);
    }
    
    // Successful authorization audit
    await auditService.logAuditEvent({
      eventType: 'access_control',
      eventSubtype: 'authorization_granted',
      userId: decoded.sub,
      eventDetails: {
        methodArn: event.methodArn,
        tokenValid: true
      },
      dataClassification: 'access_granted'
    }).catch(() => {});

    // Track successful authentication
    await observability.trackUserJourney(decoded.sub, 'authentication_success', {
      methodArn: event.methodArn
    });

    // Generate IAM policy
    const policy = generatePolicy(decoded.sub, 'Allow', event.methodArn, decoded);

    return policy;

  } catch (error) {
    console.error('Authorization error:', sanitizeError(error));

    const userId = tokenInfo?.userId || 'unauthenticated';
    await observability.trackError(error, 'authentication', userId);

    const errorContext = {
      service: 'authorizer',
      operation: 'token_authorization',
      userId: userId
    };
    const unifiedError = createUnifiedError(error, errorContext);

    // Enhanced error audit logging
    await auditService.logAuditEvent({
      eventType: 'access_control',
      eventSubtype: 'authorization_denied',
      userId: userId,
      eventDetails: {
        correlationId: unifiedError.correlationId,
        errorCategory: unifiedError.category,
        recoveryStrategy: unifiedError.recoveryStrategy,
        methodArn: event.methodArn,
        error: sanitizeError(error).message?.substring(0, 100)
      },
      dataClassification: 'security_event'
    }).catch(() => {});

    // Return deny policy for any error
    const policy = generatePolicy('user', 'Deny', event.methodArn);
    return policy;
  }
};

/**
 * Extract token from Authorization header
 */
function extractToken(authorizationToken) {
  if (!authorizationToken) {
    return null;
  }

  // Handle "Bearer <token>" format
  if (authorizationToken.startsWith('Bearer ')) {
    return authorizationToken.substring(7);
  }

  // Handle direct token
  return authorizationToken;
}

/**
 * Generate IAM policy for API Gateway
 */
function generatePolicy(principalId, effect, resource, context = {}) {
  const authResponse = {
    principalId,
  };

  if (effect && resource) {
    const policyDocument = {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    };
    authResponse.policyDocument = policyDocument;
  }

  // Add user context for downstream Lambda functions
  if (effect === 'Allow' && context) {
    authResponse.context = {
      sub: context.sub,
      email: context.email,
      name: context.name || '',
      iat: context.iat?.toString() || '',
      exp: context.exp?.toString() || '',
    };
  }

  return authResponse;
}

/**
 * Validate token structure without verification
 */
function isValidTokenFormat(token) {
  if (!token || typeof token !== 'string') {
    return false;
  }

  // JWT should have 3 parts separated by dots
  const parts = token.split('.');
  return parts.length === 3;
}