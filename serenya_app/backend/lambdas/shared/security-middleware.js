const crypto = require('crypto');
const { decryptFields, encryptFields } = require('./encryption');
const { AuditHelpers } = require('./audit-service');

/**
 * Comprehensive Security Middleware for Healthcare API
 * Implements application-layer encryption, input validation, and CSRF protection
 */
class SecurityMiddleware {
  constructor() {
    this.allowedContentTypes = [
      'application/json',
      'multipart/form-data',
      'application/x-www-form-urlencoded'
    ];
  }

  /**
   * Validate encrypted payload structure for medical data
   */
  async validateEncryptedPayload(payload, requiredFields = []) {
    try {
      // Check if payload has required encryption structure
      if (!payload.encrypted_data || !payload.encryption_metadata) {
        throw new Error('Missing required encryption fields');
      }

      const { encrypted_data, encryption_metadata } = payload;

      // Validate encryption metadata
      if (!encryption_metadata.version || !encryption_metadata.algorithm) {
        throw new Error('Invalid encryption metadata');
      }

      // Check supported encryption version and algorithm
      if (encryption_metadata.version !== 'v1') {
        throw new Error(`Unsupported encryption version: ${encryption_metadata.version}`);
      }

      if (encryption_metadata.algorithm !== 'AES-256-GCM') {
        throw new Error(`Unsupported encryption algorithm: ${encryption_metadata.algorithm}`);
      }

      // Validate encrypted data structure
      if (!encrypted_data.ciphertext || !encrypted_data.iv || !encrypted_data.authTag) {
        throw new Error('Invalid encrypted data structure');
      }

      // Validate base64 encoding
      const ciphertextBuffer = Buffer.from(encrypted_data.ciphertext, 'base64');
      const ivBuffer = Buffer.from(encrypted_data.iv, 'base64');
      const authTagBuffer = Buffer.from(encrypted_data.authTag, 'base64');

      if (ciphertextBuffer.length === 0 || ivBuffer.length !== 12 || authTagBuffer.length !== 16) {
        throw new Error('Invalid encrypted data encoding or structure');
      }

      return {
        valid: true,
        encryptedData: encrypted_data,
        metadata: encryption_metadata
      };

    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Decrypt and validate encrypted API payload
   */
  async decryptApiPayload(encryptedPayload, encryptionContext = {}) {
    try {
      const validation = await this.validateEncryptedPayload(encryptedPayload);
      if (!validation.valid) {
        throw new Error(`Encryption validation failed: ${validation.error}`);
      }

      const { encryptedData } = validation;

      // Decrypt the payload using KMS
      const cipher = crypto.createDecipherGCM('aes-256-gcm', Buffer.from(process.env.ENCRYPTION_KEY_BASE64 || '', 'base64'));
      cipher.setIV(Buffer.from(encryptedData.iv, 'base64'));
      cipher.setAuthTag(Buffer.from(encryptedData.authTag, 'base64'));

      let decrypted = cipher.update(Buffer.from(encryptedData.ciphertext, 'base64'), null, 'utf8');
      decrypted += cipher.final('utf8');

      const decryptedData = JSON.parse(decrypted);

      return {
        success: true,
        data: decryptedData
      };

    } catch (error) {
      console.error('Payload decryption failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Encrypt API response payload for medical data
   */
  async encryptApiResponse(data, encryptionContext = {}) {
    try {
      const plaintext = JSON.stringify(data);
      
      // Generate random IV
      const iv = crypto.randomBytes(12);
      
      // Use AES-256-GCM for authenticated encryption
      const cipher = crypto.createCipherGCM('aes-256-gcm', Buffer.from(process.env.ENCRYPTION_KEY_BASE64 || '', 'base64'));
      cipher.setIV(iv);

      let encrypted = cipher.update(plaintext, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      const authTag = cipher.getAuthTag();

      return {
        encrypted_data: {
          ciphertext: encrypted.toString('base64'),
          iv: iv.toString('base64'),
          authTag: authTag.toString('base64')
        },
        encryption_metadata: {
          version: 'v1',
          algorithm: 'AES-256-GCM',
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Response encryption failed:', error);
      throw new Error(`Response encryption failed: ${error.message}`);
    }
  }

  /**
   * Comprehensive input sanitization for SQL injection and XSS prevention
   */
  sanitizeInput(input, options = {}) {
    if (input === null || input === undefined) {
      return input;
    }

    const {
      allowHTML = false,
      maxLength = 10000,
      allowedCharacters = null,
      trimWhitespace = true
    } = options;

    let sanitized = input;

    if (typeof sanitized === 'string') {
      // Trim whitespace
      if (trimWhitespace) {
        sanitized = sanitized.trim();
      }

      // Length validation
      if (sanitized.length > maxLength) {
        throw new Error(`Input exceeds maximum length of ${maxLength} characters`);
      }

      // SQL injection prevention - escape dangerous characters
      sanitized = sanitized
        .replace(/'/g, "''")           // Escape single quotes
        .replace(/"/g, '&quot;')       // Escape double quotes
        .replace(/\\/g, '\\\\')        // Escape backslashes
        .replace(/\x00/g, '\\0')       // Escape null bytes
        .replace(/\n/g, '\\n')         // Escape newlines
        .replace(/\r/g, '\\r')         // Escape carriage returns
        .replace(/\x1a/g, '\\Z');      // Escape ctrl+Z

      // XSS prevention if HTML not allowed
      if (!allowHTML) {
        sanitized = sanitized
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/&/g, '&amp;')
          .replace(/javascript:/gi, 'blocked:');
      }

      // Character whitelist validation
      if (allowedCharacters) {
        const regex = new RegExp(`^[${allowedCharacters}]*$`);
        if (!regex.test(sanitized)) {
          throw new Error('Input contains disallowed characters');
        }
      }
    } else if (typeof sanitized === 'object') {
      // Recursively sanitize object properties
      const sanitizedObj = {};
      for (const [key, value] of Object.entries(sanitized)) {
        sanitizedObj[this.sanitizeInput(key, { maxLength: 100 })] = this.sanitizeInput(value, options);
      }
      sanitized = sanitizedObj;
    } else if (Array.isArray(sanitized)) {
      // Sanitize array elements
      sanitized = sanitized.map(item => this.sanitizeInput(item, options));
    }

    return sanitized;
  }

  /**
   * Validate request headers for security
   */
  validateRequestHeaders(headers) {
    const issues = [];

    // Check Content-Type
    if (headers['content-type'] && !this.allowedContentTypes.some(type => 
      headers['content-type'].toLowerCase().includes(type.toLowerCase())
    )) {
      issues.push(`Unsupported content type: ${headers['content-type']}`);
    }

    // Check for required security headers in response
    const requiredHeaders = {
      'user-agent': 'User-Agent header missing',
      'authorization': 'Authorization header missing for protected endpoints'
    };

    // Check User-Agent (basic bot detection)
    const userAgent = headers['user-agent'] || '';
    if (userAgent.length > 1000) {
      issues.push('User-Agent header too long');
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /onload=/i,
      /onerror=/i,
      /eval\(/i,
      /alert\(/i,
      /document\./i
    ];

    for (const [headerName, headerValue] of Object.entries(headers)) {
      if (typeof headerValue === 'string') {
        for (const pattern of suspiciousPatterns) {
          if (pattern.test(headerValue)) {
            issues.push(`Suspicious pattern detected in header ${headerName}`);
            break;
          }
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Generate and validate CSRF tokens
   */
  generateCSRFToken(sessionId, secret = process.env.CSRF_SECRET || 'default-secret') {
    const timestamp = Date.now();
    const payload = `${sessionId}:${timestamp}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    
    return {
      token: Buffer.from(`${payload}:${signature}`).toString('base64'),
      timestamp
    };
  }

  validateCSRFToken(token, sessionId, secret = process.env.CSRF_SECRET || 'default-secret', maxAge = 3600000) {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      const [session, timestampStr, signature] = decoded.split(':');

      if (session !== sessionId) {
        return { valid: false, error: 'Session mismatch' };
      }

      const timestamp = parseInt(timestampStr);
      if (isNaN(timestamp)) {
        return { valid: false, error: 'Invalid timestamp' };
      }

      // Check token age
      if (Date.now() - timestamp > maxAge) {
        return { valid: false, error: 'Token expired' };
      }

      // Verify signature
      const expectedSignature = crypto.createHmac('sha256', secret)
        .update(`${session}:${timestampStr}`)
        .digest('hex');

      if (signature !== expectedSignature) {
        return { valid: false, error: 'Invalid signature' };
      }

      return { valid: true };

    } catch (error) {
      return { valid: false, error: 'Token parsing failed' };
    }
  }

  /**
   * Rate limiting validation (basic implementation)
   */
  async validateRateLimit(identifier, maxRequests = 200, windowMs = 3600000) {
    // Note: In production, this should use Redis or DynamoDB for distributed rate limiting
    // For now, implementing basic in-memory rate limiting for single Lambda instance
    
    if (!this.rateLimitStore) {
      this.rateLimitStore = new Map();
    }

    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or create request history for identifier
    if (!this.rateLimitStore.has(identifier)) {
      this.rateLimitStore.set(identifier, []);
    }

    const requestHistory = this.rateLimitStore.get(identifier);
    
    // Clean old requests outside the window
    const recentRequests = requestHistory.filter(timestamp => timestamp > windowStart);
    
    // Update the store
    this.rateLimitStore.set(identifier, recentRequests);

    // Check if limit exceeded
    if (recentRequests.length >= maxRequests) {
      return {
        allowed: false,
        limit: maxRequests,
        current: recentRequests.length,
        resetTime: Math.ceil((recentRequests[0] + windowMs) / 1000)
      };
    }

    // Add current request
    recentRequests.push(now);
    this.rateLimitStore.set(identifier, recentRequests);

    return {
      allowed: true,
      limit: maxRequests,
      current: recentRequests.length,
      remaining: maxRequests - recentRequests.length
    };
  }

  /**
   * File upload security validation
   */
  validateFileUpload(fileBuffer, filename, allowedTypes = ['pdf', 'jpg', 'jpeg', 'png']) {
    const validation = {
      valid: true,
      issues: [],
      metadata: {}
    };

    // File size validation (10MB limit)
    const maxSize = 10 * 1024 * 1024;
    if (fileBuffer.length > maxSize) {
      validation.valid = false;
      validation.issues.push(`File size exceeds ${maxSize / 1024 / 1024}MB limit`);
    }

    // File extension validation
    const extension = filename.toLowerCase().split('.').pop();
    if (!allowedTypes.includes(extension)) {
      validation.valid = false;
      validation.issues.push(`File type '${extension}' not allowed`);
    }

    // Magic number/file signature validation
    const signatures = {
      pdf: [0x25, 0x50, 0x44, 0x46],      // %PDF
      jpg: [0xFF, 0xD8, 0xFF],            // JPEG
      jpeg: [0xFF, 0xD8, 0xFF],           // JPEG
      png: [0x89, 0x50, 0x4E, 0x47]       // PNG
    };

    if (signatures[extension]) {
      const signature = signatures[extension];
      const fileHeader = Array.from(fileBuffer.slice(0, signature.length));
      
      if (!signature.every((byte, index) => byte === fileHeader[index])) {
        validation.valid = false;
        validation.issues.push('File signature does not match extension');
      }
    }

    // Scan for embedded executables or suspicious content
    const suspiciousPatterns = [
      Buffer.from('MZ'),      // PE executable
      Buffer.from('PK'),      // ZIP/Office documents with macros
      Buffer.from('<script'), // JavaScript
      Buffer.from('<?php'),   // PHP
      Buffer.from('#!/bin'),  // Shell scripts
    ];

    for (const pattern of suspiciousPatterns) {
      if (fileBuffer.includes(pattern)) {
        validation.valid = false;
        validation.issues.push('File contains suspicious content');
        break;
      }
    }

    validation.metadata = {
      size: fileBuffer.length,
      extension,
      filename: this.sanitizeInput(filename, { maxLength: 255 })
    };

    return validation;
  }

  /**
   * Generate security response headers
   */
  getSecurityHeaders() {
    return {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.amazonaws.com",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    };
  }
}

/**
 * Express/Lambda middleware wrapper for security validation
 */
function createSecurityMiddleware() {
  const security = new SecurityMiddleware();

  return {
    /**
     * Input validation and sanitization middleware
     */
    validateInput: (options = {}) => {
      return async (event, context) => {
        try {
          const requestId = context.awsRequestId;
          const sourceIp = event.requestContext?.identity?.sourceIp;
          const userAgent = event.headers?.['User-Agent'] || event.headers?.['user-agent'];

          // Validate headers
          const headerValidation = security.validateRequestHeaders(event.headers || {});
          if (!headerValidation.valid) {
            await AuditHelpers.logSecurityEvent(
              'request_validation_failure',
              null,
              null,
              sourceIp,
              userAgent,
              requestId,
              { validation_issues: headerValidation.issues }
            );

            return {
              statusCode: 400,
              headers: security.getSecurityHeaders(),
              body: JSON.stringify({
                error: 'Request validation failed',
                issues: headerValidation.issues
              })
            };
          }

          // Sanitize request body if present
          if (event.body) {
            try {
              const parsedBody = JSON.parse(event.body);
              const sanitizedBody = security.sanitizeInput(parsedBody, options);
              event.body = JSON.stringify(sanitizedBody);
            } catch (parseError) {
              await AuditHelpers.logSecurityEvent(
                'invalid_json_payload',
                null,
                null,
                sourceIp,
                userAgent,
                requestId,
                { error: parseError.message }
              );

              return {
                statusCode: 400,
                headers: security.getSecurityHeaders(),
                body: JSON.stringify({
                  error: 'Invalid JSON payload'
                })
              };
            }
          }

          // Sanitize query string parameters
          if (event.queryStringParameters) {
            event.queryStringParameters = security.sanitizeInput(
              event.queryStringParameters,
              { maxLength: 1000 }
            );
          }

          // Continue to next middleware/handler
          return null;

        } catch (error) {
          console.error('Security middleware error:', error);
          return {
            statusCode: 500,
            headers: security.getSecurityHeaders(),
            body: JSON.stringify({
              error: 'Security validation failed'
            })
          };
        }
      };
    },

    /**
     * Encryption validation middleware for medical data endpoints
     */
    validateEncryption: (requireEncryption = true) => {
      return async (event, context) => {
        try {
          if (!requireEncryption) {
            return null; // Skip encryption validation
          }

          const requestId = context.awsRequestId;
          const sourceIp = event.requestContext?.identity?.sourceIp;
          const userAgent = event.headers?.['User-Agent'] || event.headers?.['user-agent'];

          if (!event.body) {
            return null; // No body to validate
          }

          const parsedBody = JSON.parse(event.body);
          const validation = await security.validateEncryptedPayload(parsedBody);

          if (!validation.valid) {
            await AuditHelpers.logSecurityEvent(
              'encryption_validation_failure',
              null,
              null,
              sourceIp,
              userAgent,
              requestId,
              { validation_error: validation.error }
            );

            return {
              statusCode: 400,
              headers: security.getSecurityHeaders(),
              body: JSON.stringify({
                error: 'Encryption validation failed',
                details: validation.error
              })
            };
          }

          // Store validated encryption metadata for handler use
          event.encryptionValidation = validation;
          
          return null;

        } catch (error) {
          console.error('Encryption validation error:', error);
          return {
            statusCode: 500,
            headers: security.getSecurityHeaders(),
            body: JSON.stringify({
              error: 'Encryption validation failed'
            })
          };
        }
      };
    },

    /**
     * Rate limiting middleware
     */
    rateLimit: (maxRequests = 200, windowMs = 3600000) => {
      return async (event, context) => {
        try {
          const sourceIp = event.requestContext?.identity?.sourceIp;
          const userId = event.requestContext?.authorizer?.userId;
          const identifier = userId || sourceIp || 'anonymous';

          const rateLimitResult = await security.validateRateLimit(identifier, maxRequests, windowMs);

          if (!rateLimitResult.allowed) {
            await AuditHelpers.logSecurityEvent(
              'rate_limit_exceeded',
              userId,
              null,
              sourceIp,
              event.headers?.['User-Agent'],
              context.awsRequestId,
              { 
                limit: rateLimitResult.limit,
                current: rateLimitResult.current,
                identifier: userId ? 'authenticated' : 'anonymous'
              }
            );

            return {
              statusCode: 429,
              headers: {
                ...security.getSecurityHeaders(),
                'Retry-After': (rateLimitResult.resetTime - Math.floor(Date.now() / 1000)).toString()
              },
              body: JSON.stringify({
                error: 'Rate limit exceeded',
                limit: rateLimitResult.limit,
                resetTime: rateLimitResult.resetTime
              })
            };
          }

          // Add rate limit info to response headers
          event.rateLimitInfo = rateLimitResult;
          
          return null;

        } catch (error) {
          console.error('Rate limit middleware error:', error);
          return null; // Continue on rate limit errors
        }
      };
    },

    security
  };
}

module.exports = {
  SecurityMiddleware,
  createSecurityMiddleware
};