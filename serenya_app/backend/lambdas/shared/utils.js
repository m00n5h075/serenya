const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');

// AWS SDK configuration
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const secretsManager = new AWS.SecretsManager();

// Cache for secrets to avoid repeated API calls
let secretsCache = null;
let secretsCacheExpiry = 0;

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
    iss: 'serenya.health',
    aud: 'serenya-mobile-app',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour expiration
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
 * Create error response - now supports both 3 and 4 parameter signatures
 * Uses new unified error handling service for healthcare-appropriate responses
 */
function createErrorResponse(statusCode, errorCodeOrMessage, technicalDetails = null, userMessage = null) {
  const { errorHandlingService } = require('./error-handling');
  return errorHandlingService.createErrorResponse(statusCode, errorCodeOrMessage, technicalDetails, userMessage);
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

// Note: Database functions have been moved to the unified DynamoDB service
// Use DynamoDBUserService from ../shared/dynamodb-service for all database operations

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

/**
 * Retry helper with exponential backoff and jitter
 * @param {Function} operation - The async operation to retry
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} baseDelay - Base delay in milliseconds (default: 1000)
 * @param {string} operationName - Name for logging purposes
 * @returns {Promise} Result of the operation
 */
async function withRetry(operation, maxRetries = 3, baseDelay = 1000, operationName = 'operation') {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (attempt > 1) {
        console.log(`✓ ${operationName} succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      
      if (isLastAttempt) {
        console.error(`✗ ${operationName} failed after ${maxRetries} attempts:`, error.message);
        throw error;
      }
      
      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 1000; // 0-1000ms jitter
      const totalDelay = exponentialDelay + jitter;
      
      console.warn(`⚠ ${operationName} failed on attempt ${attempt}/${maxRetries}: ${error.message}. Retrying in ${Math.round(totalDelay)}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }
}

// Import unified error handling for additional exports
const { errorHandlingService, ERROR_CATEGORIES, RECOVERY_STRATEGIES } = require('./error-handling');

/**
 * Enhanced error handling utilities using new unified service
 */
function categorizeError(error, context = {}) {
  return errorHandlingService.categorizeError(error, context);
}

function createUnifiedError(error, context = {}) {
  return errorHandlingService.createUnifiedError(error, context);
}

function updateCircuitBreaker(service, isSuccess) {
  return errorHandlingService.updateCircuitBreaker(service, isSuccess);
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
  withRetry,
  dynamodb,
  s3,
  // New unified error handling exports
  categorizeError,
  createUnifiedError,
  updateCircuitBreaker,
  errorHandlingService,
  ERROR_CATEGORIES,
  RECOVERY_STRATEGIES
};