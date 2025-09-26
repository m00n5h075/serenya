const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');

// AWS SDK configuration
const s3 = new AWS.S3();
const secretsManager = new AWS.SecretsManager();
const kms = new AWS.KMS();

// Cache for secrets to avoid repeated API calls
let secretsCache = null;
let secretsCacheExpiry = 0;

// Cache for decrypted Apple private key
let applePrivateKeyCache = null;
let applePrivateKeyCacheExpiry = 0;

/**
 * Get API secrets from AWS Secrets Manager with caching
 */
async function getSecrets() {
  const now = Date.now();
  
  // Return cached secrets if still valid (cache for 5 minutes)
  if (secretsCache && now < secretsCacheExpiry) {
    return secretsCache;
  }

  try {
    const result = await secretsManager.getSecretValue({
      SecretId: process.env.API_SECRETS_ARN
    }).promise();

    secretsCache = JSON.parse(result.SecretString);
    secretsCacheExpiry = now + (5 * 60 * 1000); // 5 minutes
    
    return secretsCache;
  } catch (error) {
    console.error('Error retrieving secrets:', error);
    throw new Error('Failed to retrieve API secrets');
  }
}

/**
 * Generate JWT token for authenticated user
 */
async function generateJWT(userData) {
  const secrets = await getSecrets();
  
  const payload = {
    sub: userData.userId,
    email: userData.email,
    name: userData.name,
    session_id: userData.sessionId,
    iss: 'serenya.health',
    aud: 'serenya-mobile-app',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (15 * 60), // 15 minutes expiration (per API contract)
  };

  return jwt.sign(payload, secrets.jwtSecret, { algorithm: 'HS256' });
}

/**
 * Verify JWT token
 */
async function verifyJWT(token) {
  const secrets = await getSecrets();
  
  try {
    return jwt.verify(token, secrets.jwtSecret, {
      issuer: 'serenya.health',
      audience: 'serenya-mobile-app',
    });
  } catch (error) {
    throw new Error('Invalid token');
  }
}

/**
 * Create standardized API response
 */
function createResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Create error response according to API contract
 */
function createErrorResponse(statusCode, code, message, userMessage, details = null) {
  const body = {
    success: false,
    error: {
      code,
      message,
      user_message: userMessage,
      timestamp: new Date().toISOString(),
      request_id: require('uuid').v4()
    }
  };
  
  if (details) {
    body.error.details = details;
  }

  return createResponse(statusCode, body);
}

/**
 * Validate file type and size
 */
function validateFile(fileName, fileSize) {
  const allowedTypes = ['pdf', 'jpg', 'jpeg', 'png'];
  const maxSize = 5 * 1024 * 1024; // 5MB

  const fileExtension = fileName.toLowerCase().split('.').pop();
  
  if (!allowedTypes.includes(fileExtension)) {
    return {
      valid: false,
      error: `File type .${fileExtension} not supported. Allowed types: ${allowedTypes.join(', ')}`
    };
  }

  if (fileSize > maxSize) {
    return {
      valid: false,
      error: `File size ${Math.round(fileSize / (1024 * 1024))}MB exceeds maximum of 5MB`
    };
  }

  return { valid: true };
}

/**
 * Generate unique job ID
 */
function generateJobId() {
  const { v4: uuidv4 } = require('uuid');
  return uuidv4();
}

/**
 * Get user ID from JWT token in event
 */
function getUserIdFromEvent(event) {
  try {
    if (event.requestContext && event.requestContext.authorizer) {
      return event.requestContext.authorizer.sub;
    }
    return null;
  } catch (error) {
    console.error('Error extracting user ID:', error);
    return null;
  }
}

// Note: Job and user profile functions moved to shared/database.js with PostgreSQL implementation

/**
 * Sanitize filename for S3 storage
 */
function sanitizeFileName(fileName) {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 100);
}

/**
 * Log audit event without PHI
 */
function auditLog(action, userId, metadata = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    action,
    userId,
    environment: process.env.ENVIRONMENT,
    ...metadata,
  };

  // Remove any potential PHI from logs
  delete logEntry.fileName;
  delete logEntry.fileContent;
  delete logEntry.interpretationText;

  console.log('AUDIT:', JSON.stringify(logEntry));
}

/**
 * Get decrypted Apple private key with KMS and caching
 */
async function getApplePrivateKey() {
  const now = Date.now();
  
  // Return cached key if still valid (cache for 10 minutes)
  if (applePrivateKeyCache && now < applePrivateKeyCacheExpiry) {
    return applePrivateKeyCache;
  }

  try {
    const secrets = await getSecrets();
    
    // Check if the Apple private key is KMS encrypted
    if (secrets.applePrivateKeyEncrypted && secrets.appleKmsKeyId) {
      // Decrypt the private key using KMS
      const decryptParams = {
        CiphertextBlob: Buffer.from(secrets.applePrivateKeyEncrypted, 'base64'),
        KeyId: secrets.appleKmsKeyId,
        EncryptionContext: {
          Purpose: 'AppleSignInAuth',
          Environment: process.env.NODE_ENV || 'development'
        }
      };
      
      const decryptResult = await kms.decrypt(decryptParams).promise();
      const decryptedKey = decryptResult.Plaintext.toString('utf8');
      
      // Cache the decrypted key
      applePrivateKeyCache = decryptedKey;
      applePrivateKeyCacheExpiry = now + (10 * 60 * 1000); // 10 minutes
      
      return decryptedKey;
    } else {
      // Fallback to plain text key (for backward compatibility)
      console.warn('Apple private key is not KMS encrypted - consider migrating to KMS');
      return secrets.applePrivateKey;
    }
  } catch (error) {
    console.error('Error retrieving Apple private key:', error);
    throw new Error('Failed to retrieve Apple private key');
  }
}

/**
 * Encrypt Apple private key using KMS (utility function for setup)
 */
async function encryptApplePrivateKey(privateKeyContent, kmsKeyId) {
  try {
    const encryptParams = {
      KeyId: kmsKeyId,
      Plaintext: privateKeyContent,
      EncryptionContext: {
        Purpose: 'AppleSignInAuth',
        Environment: process.env.NODE_ENV || 'development'
      }
    };
    
    const encryptResult = await kms.encrypt(encryptParams).promise();
    return encryptResult.CiphertextBlob.toString('base64');
  } catch (error) {
    console.error('Error encrypting Apple private key:', error);
    throw new Error('Failed to encrypt Apple private key');
  }
}

/**
 * Check if error contains PHI and sanitize
 */
function sanitizeError(error) {
  const errorMessage = error.message || error.toString();
  
  // Remove potential PHI patterns (simplified)
  return errorMessage
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN-REDACTED]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL-REDACTED]')
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, '[CARD-REDACTED]');
}

module.exports = {
  getSecrets,
  generateJWT,
  verifyJWT,
  createResponse,
  createErrorResponse,
  validateFile,
  generateJobId,
  getUserIdFromEvent,
  sanitizeFileName,
  auditLog,
  sanitizeError,
  getApplePrivateKey,
  encryptApplePrivateKey,
  s3,
};