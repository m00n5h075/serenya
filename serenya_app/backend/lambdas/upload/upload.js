const AWS = require('aws-sdk');
const multipart = require('aws-lambda-multipart-parser');
const sharp = require('sharp');
const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  validateFile,
  generateJobId,
  sanitizeFileName,
  sanitizeError,
  withRetry,
  s3,
  categorizeError,
  createUnifiedError,
  updateCircuitBreaker,
  ERROR_CATEGORIES
} = require('../shared/utils');
const { v4: uuidv4 } = require('uuid');
const { validateEncryptedPayload, sanitizeInput, validateFileUpload } = require('../shared/security-middleware');
const { auditService } = require('../shared/audit-service-dynamodb');
const { ObservabilityService } = require('../shared/observability-service');
const crypto = require('crypto');

/**
 * File Upload with Security Validation
 * POST /api/v1/process/upload
 */
exports.handler = async (event) => {
  const correlationId = crypto.randomUUID();
  const sessionId = event.requestContext?.requestId || 'unknown';
  const sourceIp = event.requestContext?.identity?.sourceIp;
  const userAgent = event.headers?.['User-Agent'];
  const startTime = Date.now();
  let userId = 'unknown';
  
  // Initialize observability
  const observability = ObservabilityService.createForFunction('upload', event);
  
  // Track function start
  await observability.logEvent('function_start', null, {
    functionName: 'upload',
    correlationId,
    sessionId,
    sourceIp,
    userAgent
  });
  
  try {
    userId = getUserIdFromEvent(event);
    
    if (!userId) {
      const unifiedError = createUnifiedError(new Error('Missing authentication'), {
        service: 'upload',
        operation: 'authentication',
        category: ERROR_CATEGORIES.BUSINESS
      });
      
      await auditService.logAuditEvent({
        eventType: 'access_control',
        eventSubtype: 'unauthenticated_upload_attempt',
        userId: 'unauthenticated',
        eventDetails: {
          correlationId: unifiedError.correlationId
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        userAgent: userAgent,
        dataClassification: 'security_event'
      }).catch(() => {});
      
      return createErrorResponse(401, 'MISSING_AUTHENTICATION', 'Invalid or missing authentication', 'Please sign in to upload files');
    }

    // Enhanced security validation with middleware
    let securityValidation;
    try {
      securityValidation = await validateFileUpload(event);
    } catch (securityValidationError) {
      const unifiedError = createUnifiedError(securityValidationError, {
        service: 'upload',
        operation: 'security_validation',
        userId: userId,
        category: ERROR_CATEGORIES.TECHNICAL
      });
      
      await auditService.logAuditEvent({
        eventType: 'security_violation',
        eventSubtype: 'security_validation_error',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId,
          error: sanitizeError(securityValidationError).message?.substring(0, 100)
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        userAgent: userAgent,
        dataClassification: 'security_event'
      }).catch(() => {});
      
      return createErrorResponse(500, 'SECURITY_VALIDATION_FAILED', 'Security validation failed', 'We had trouble validating your upload. Please try again');
    }
    
    if (!securityValidation.valid) {
      const unifiedError = createUnifiedError(new Error('Security validation failed'), {
        service: 'upload',
        operation: 'security_check',
        userId: userId,
        category: ERROR_CATEGORIES.BUSINESS
      });
      
      await auditService.logAuditEvent({
        eventType: 'security_violation',
        eventSubtype: 'upload_blocked',
        userId: userId,
        eventDetails: {
          reason: securityValidation.reason,
          correlationId: unifiedError.correlationId
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        userAgent: userAgent,
        dataClassification: 'security_event'
      }).catch(() => {});
      
      return createErrorResponse(400, 'UPLOAD_BLOCKED', 'Upload security validation failed', 'Your file didn\'t pass our security checks. Please try a different file');
    }

    // Suspicious activity detection moved to security-middleware

    // Parse multipart form data
    let parsedBody;
    try {
      parsedBody = multipart.parse(event, true);
    } catch (parseError) {
      const unifiedError = createUnifiedError(parseError, {
        service: 'upload',
        operation: 'multipart_parsing',
        userId: userId,
        category: ERROR_CATEGORIES.VALIDATION
      });
      
      await auditService.logAuditEvent({
        eventType: 'upload_error',
        eventSubtype: 'parse_failed',
        userId: userId,
        eventDetails: {
          error: parseError.message.substring(0, 100),
          correlationId: unifiedError.correlationId
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'validation_error'
      }).catch(() => {});
      
      return createErrorResponse(400, 'INVALID_MULTIPART_DATA', 'Invalid multipart form data', 'Please check your file upload format and try again');
    }

    const file = parsedBody.file;
    if (!file) {
      const unifiedError = createUnifiedError(new Error('No file provided'), {
        service: 'upload',
        operation: 'file_validation',
        userId: userId,
        category: ERROR_CATEGORIES.VALIDATION
      });
      
      await auditService.logAuditEvent({
        eventType: 'upload_error',
        eventSubtype: 'no_file_provided',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'validation_error'
      }).catch(() => {});
      
      return createErrorResponse(400, 'NO_FILE_PROVIDED', 'No file provided', 'Please select a file to upload');
    }

    // Enhanced file validation with sanitization
    const fileName = sanitizeInput(file.filename || 'unknown.pdf');
    const fileContent = file.content;
    const fileSize = fileContent.length;
    const fileType = parsedBody.file_type || fileName.split('.').pop()?.toLowerCase();

    // Generate file checksum for integrity verification
    const fileChecksum = crypto.createHash('sha256').update(fileContent).digest('hex');

    // Validate file
    const validation = validateFile(fileName, fileSize);
    if (!validation.valid) {
      const unifiedError = createUnifiedError(new Error(validation.error), {
        service: 'upload',
        operation: 'file_validation',
        userId: userId,
        category: ERROR_CATEGORIES.VALIDATION
      });
      
      await auditService.logAuditEvent({
        eventType: 'upload_error',
        eventSubtype: 'validation_failed',
        userId: userId,
        eventDetails: {
          reason: validation.error,
          fileName: fileName,
          fileSize: fileSize,
          correlationId: unifiedError.correlationId
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'medical_phi'
      }).catch(() => {});
      
      return createErrorResponse(400, 'FILE_VALIDATION_FAILED', validation.error, 'Please check your file and try again');
    }

    // Security scanning with enhanced error handling
    let securityCheck;
    try {
      securityCheck = await performSecurityScanning(fileContent, fileName);
    } catch (scanningError) {
      const unifiedError = createUnifiedError(scanningError, {
        service: 'upload',
        operation: 'security_scanning',
        userId: userId,
        category: ERROR_CATEGORIES.TECHNICAL
      });
      
      await auditService.logAuditEvent({
        eventType: 'security_violation',
        eventSubtype: 'security_scan_error',
        userId: userId,
        eventDetails: {
          error: sanitizeError(scanningError).message?.substring(0, 100),
          fileName: fileName,
          fileChecksum: fileChecksum.substring(0, 16),
          correlationId: unifiedError.correlationId
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'security_event'
      }).catch(() => {});
      
      return createErrorResponse(500, 'SECURITY_SCAN_FAILED', 'Security scanning failed', 'We had trouble scanning your file. Please try again');
    }
    
    if (!securityCheck.safe) {
      const unifiedError = createUnifiedError(new Error('Security scan failed'), {
        service: 'upload',
        operation: 'security_validation',
        userId: userId,
        category: ERROR_CATEGORIES.BUSINESS
      });
      
      await auditService.logAuditEvent({
        eventType: 'security_violation',
        eventSubtype: 'file_scan_failed',
        userId: userId,
        eventDetails: {
          reason: securityCheck.reason,
          fileName: fileName,
          fileChecksum: fileChecksum.substring(0, 16),
          correlationId: unifiedError.correlationId
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'security_event'
      }).catch(() => {});
      
      return createErrorResponse(400, 'FILE_SECURITY_FAILED', 'File failed security validation', 'Your file didn\'t pass our security checks. Please try a different file');
    }

    // Generate job ID with consistent format
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const jobId = `result_${userId}_${timestamp}_${randomString}`;
    
    const sanitizedFileName = sanitizeFileName(fileName);
    const s3Key = `incoming/${jobId}`;

    // Upload to S3 with encryption
    const uploadParams = {
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key,
      Body: fileContent,
      ContentType: getMimeType(fileType),
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: process.env.KMS_KEY_ID,
      Metadata: {
        'original-filename': fileName,
        'user-id': userId,
        'file-type': fileType,
        'upload-timestamp': Date.now().toString(),
        'job-id': jobId,
      },
      Tagging: 'Classification=PHI-Temporary&AutoDelete=true',
    };

    // S3 upload with circuit breaker pattern for external service calls
    let s3UploadSuccess = false;
    try {
      await withRetry(
        async () => {
          try {
            const result = await s3.upload(uploadParams).promise();
            s3UploadSuccess = true;
            return result;
          } catch (s3Error) {
            // Categorize S3 error for better handling
            const errorContext = {
              service: 's3',
              operation: 'file_upload',
              userId: userId,
              jobId: jobId
            };
            const categorization = categorizeError(s3Error, errorContext);
            
            console.error(`S3 upload failed - Category: ${categorization.category}, Recovery: ${categorization.recovery_strategy}`, s3Error);
            throw s3Error;
          }
        },
        3,
        1000,
        `S3 upload for job ${jobId}`
      );
    } catch (s3UploadError) {
      const unifiedError = createUnifiedError(s3UploadError, {
        service: 'upload',
        operation: 's3_upload',
        userId: userId,
        category: ERROR_CATEGORIES.EXTERNAL
      });
      
      await auditService.logAuditEvent({
        eventType: 'storage',
        eventSubtype: 'upload_failed',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId,
          jobId: jobId,
          fileName: fileName,
          error: sanitizeError(s3UploadError).message?.substring(0, 100)
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'system_error'
      }).catch(() => {});
      
      throw s3UploadError; // Let main catch block handle this
    } finally {
      // Update circuit breaker status for S3 service
      updateCircuitBreaker('s3', s3UploadSuccess);
    }

    // Enhanced upload success audit
    await auditService.logAuditEvent({
      eventType: 'document_upload',
      eventSubtype: 'upload_completed',
      userId: userId,
      eventDetails: {
        jobId: jobId,
        fileName: sanitizedFileName,
        fileType: fileType,
        fileSizeKB: Math.round(fileSize / 1024),
        fileChecksum: fileChecksum.substring(0, 16),
        securityScanPassed: securityCheck.safe
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      userAgent: userAgent,
      dataClassification: 'medical_phi'
    });

    // Track successful upload with comprehensive observability
    const processingDuration = Date.now() - startTime;
    const fileSizeMB = fileSize / (1024 * 1024);
    
    await Promise.all([
      // Track document upload success
      observability.trackDocumentUpload(
        true, // success
        fileType,
        fileSizeMB,
        userId,
        processingDuration
      ),
      
      // Track user journey step
      observability.trackUserJourney('document_uploaded', userId, {
        job_id: jobId,
        file_type: fileType,
        file_size_mb: fileSizeMB,
        security_scan_passed: securityCheck.safe,
        processing_duration_ms: processingDuration
      }),
      
      // Track function performance
      observability.trackLambdaPerformance(
        processingDuration,
        parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '512'),
        !process.env.AWS_LAMBDA_WARM_CONTAINER
      ),
      
      // Track S3 operation success
      observability.trackS3Operation(
        'putObject',
        `serenya-documents-${process.env.ENVIRONMENT}`,
        true, // success
        processingDuration,
        fileSize
      )
    ]).catch(error => {
      console.error('Observability tracking failed (non-blocking):', error.message);
    });

    return createResponse(200, {
      job_id: jobId,
      file_name: sanitizedFileName,
      mime_type: getMimeType(fileType),
      file_size_bytes: fileSize,
      estimated_completion_seconds: 90,
      message: 'File uploaded successfully and queued for processing'
    });

  } catch (error) {
    console.error('Upload error:', sanitizeError(error));
    
    // Enhanced error categorization and handling
    const errorContext = {
      service: 'upload',
      operation: 'file_upload_processing',
      userId: userId
    };
    const unifiedError = createUnifiedError(error, errorContext);
    
    // Enhanced error audit logging
    await auditService.logAuditEvent({
      eventType: 'upload_error',
      eventSubtype: 'system_error',
      userId: userId,
      eventDetails: {
        correlationId: unifiedError.correlationId,
        errorCategory: unifiedError.category,
        recoveryStrategy: unifiedError.recoveryStrategy,
        error: sanitizeError(error).message?.substring(0, 100) || 'Unknown error'
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      userAgent: userAgent,
      dataClassification: 'system_error'
    }).catch(auditError => {
      console.error('Audit logging failed:', auditError);
    });

    // Track failed upload with comprehensive observability
    const processingDuration = Date.now() - startTime;
    const fileSizeMB = fileSize ? fileSize / (1024 * 1024) : 0;
    
    await Promise.all([
      // Track document upload failure
      observability.trackDocumentUpload(
        false, // success = false
        fileType || 'unknown',
        fileSizeMB,
        userId,
        processingDuration
      ),
      
      // Track function performance (even for failures)
      observability.trackLambdaPerformance(
        processingDuration,
        parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '512'),
        !process.env.AWS_LAMBDA_WARM_CONTAINER
      ),
      
      // Track error
      observability.trackError(error, unifiedError.category, userId, {
        correlation_id: unifiedError.correlationId,
        file_type: fileType,
        file_size_mb: fileSizeMB,
        recovery_strategy: unifiedError.recoveryStrategy
      })
    ]).catch(obsError => {
      console.error('Observability tracking failed (non-blocking):', obsError.message);
    });
    
    // Use categorized error response
    if (unifiedError.category === ERROR_CATEGORIES.VALIDATION) {
      return createErrorResponse(400, 'VALIDATION_ERROR', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.BUSINESS) {
      return createErrorResponse(403, 'ACCESS_DENIED', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.EXTERNAL) {
      return createErrorResponse(503, 'SERVICE_UNAVAILABLE', 'External service failure', 'Our upload service is temporarily unavailable. Please try again shortly');
    } else {
      return createErrorResponse(500, 'UPLOAD_FAILED', 'Upload processing failed', 'We had trouble uploading your file. Please try again');
    }
  }
};

/**
 * Perform security scanning on uploaded file
 */
async function performSecurityScanning(fileContent, fileName) {
  try {
    // File size validation
    if (fileContent.length > 5 * 1024 * 1024) {
      return { safe: false, reason: 'File too large' };
    }

    // Magic number validation for common file types
    const magicNumbers = {
      pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
      jpg: [0xFF, 0xD8, 0xFF],
      jpeg: [0xFF, 0xD8, 0xFF],
      png: [0x89, 0x50, 0x4E, 0x47], // PNG signature
    };

    const fileExtension = fileName.toLowerCase().split('.').pop();
    const expectedMagic = magicNumbers[fileExtension];

    if (expectedMagic) {
      const actualMagic = Array.from(fileContent.slice(0, expectedMagic.length));
      
      if (!arraysEqual(actualMagic, expectedMagic)) {
        return { 
          safe: false, 
          reason: `File content doesn't match ${fileExtension} format` 
        };
      }
    }

    // Additional image validation for image files
    if (['jpg', 'jpeg', 'png'].includes(fileExtension)) {
      try {
        const metadata = await sharp(fileContent).metadata();
        
        // Check for reasonable image dimensions
        if (metadata.width > 10000 || metadata.height > 10000) {
          return { safe: false, reason: 'Image dimensions too large' };
        }
        
        // Check for suspicious metadata
        if (metadata.density && metadata.density > 1000) {
          return { safe: false, reason: 'Suspicious image metadata' };
        }
        
      } catch (imageError) {
        return { safe: false, reason: 'Invalid image file' };
      }
    }

    // Basic content scanning for malicious patterns
    const contentString = fileContent.toString('utf8', 0, Math.min(1024, fileContent.length));
    const maliciousPatterns = [
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /onload=/i,
      /onerror=/i,
    ];

    for (const pattern of maliciousPatterns) {
      if (pattern.test(contentString)) {
        return { safe: false, reason: 'Potentially malicious content detected' };
      }
    }

    return { safe: true };

  } catch (error) {
    console.error('Security scanning error:', error);
    return { safe: false, reason: 'Security scan failed' };
  }
}

/**
 * Get MIME type for file extension
 */
function getMimeType(fileType) {
  const mimeTypes = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
  };

  return mimeTypes[fileType] || 'application/octet-stream';
}

/**
 * Compare two arrays for equality
 */
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((val, index) => val === b[index]);
}

/**
 * Validate file content integrity
 */
async function validateFileIntegrity(fileContent, fileName) {
  const fileExtension = fileName.toLowerCase().split('.').pop();
  
  switch (fileExtension) {
    case 'pdf':
      return validatePdfIntegrity(fileContent);
    case 'jpg':
    case 'jpeg':
    case 'png':
      return validateImageIntegrity(fileContent);
    default:
      return { valid: true };
  }
}

/**
 * Basic PDF integrity validation
 */
function validatePdfIntegrity(fileContent) {
  try {
    const pdfString = fileContent.toString('binary');
    
    // Check for PDF header
    if (!pdfString.startsWith('%PDF-')) {
      return { valid: false, reason: 'Invalid PDF header' };
    }

    // Check for PDF trailer
    if (!pdfString.includes('%%EOF')) {
      return { valid: false, reason: 'Invalid PDF structure' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, reason: 'PDF validation failed' };
  }
}

/**
 * Image integrity validation using Sharp
 */
async function validateImageIntegrity(fileContent) {
  try {
    const metadata = await sharp(fileContent).metadata();
    
    // Basic validation
    if (!metadata.format || !metadata.width || !metadata.height) {
      return { valid: false, reason: 'Invalid image metadata' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, reason: 'Image validation failed' };
  }
}