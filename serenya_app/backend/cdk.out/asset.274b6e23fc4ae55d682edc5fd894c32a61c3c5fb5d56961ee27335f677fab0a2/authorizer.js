const { verifyJWT, sanitizeError } = require('./utils');

/**
 * JWT Token Authorizer for API Gateway
 */
exports.handler = async (event) => {
  try {
    const token = extractToken(event.authorizationToken);
    
    if (!token) {
      throw new Error('No token provided');
    }

    // Verify JWT token
    const decoded = await verifyJWT(token);
    
    // Generate IAM policy
    const policy = generatePolicy(decoded.sub, 'Allow', event.methodArn, decoded);
    
    return policy;

  } catch (error) {
    console.error('Authorization error:', sanitizeError(error));
    
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