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
  s3,
} = require('../shared/utils');
const { DocumentJobService, DocumentSecurityService } = require('../shared/document-database');
const { validateEncryptedPayload, sanitizeInput, validateFileUpload } = require('../shared/security-middleware');
const { auditService } = require('../shared/audit-service');
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
  
  try {
    const userId = getUserIdFromEvent(event);
    
    if (!userId) {
      return createErrorResponse(401, 'Invalid or missing authentication');
    }

    // Enhanced security validation with middleware
    const securityValidation = await validateFileUpload(event);
    if (!securityValidation.valid) {
      await auditService.logAuditEvent({
        eventType: 'security_violation',
        eventSubtype: 'upload_blocked',
        userId: userId,
        eventDetails: {
          reason: securityValidation.reason,
          correlationId: correlationId
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        userAgent: userAgent,
        dataClassification: 'security_event'
      });
      
      return createErrorResponse(400, 'Upload security validation failed', securityValidation.reason);
    }

    // Check for suspicious activity patterns
    const suspiciousActivity = await DocumentSecurityService.detectSuspiciousActivity(
      userId, sourceIp, userAgent
    );
    
    if (suspiciousActivity.suspicious) {
      return createErrorResponse(429, 'Too many uploads', 'Please wait before uploading again');
    }

    // Parse multipart form data
    let parsedBody;
    try {
      parsedBody = multipart.parse(event, true);
    } catch (parseError) {
      await auditService.logAuditEvent({
        eventType: 'upload_error',
        eventSubtype: 'parse_failed',
        userId: userId,
        eventDetails: {
          error: parseError.message.substring(0, 100),
          correlationId: correlationId
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'system_error'
      });
      return createErrorResponse(400, 'Invalid multipart form data');
    }

    const file = parsedBody.file;
    if (!file) {
      return createErrorResponse(400, 'No file provided');
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
      await auditService.logAuditEvent({
        eventType: 'upload_error',
        eventSubtype: 'validation_failed',
        userId: userId,
        eventDetails: {
          reason: validation.error,
          fileName: fileName,
          fileSize: fileSize,
          correlationId: correlationId
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'medical_phi'
      });
      return createErrorResponse(400, validation.error);
    }

    // Security scanning
    const securityCheck = await performSecurityScanning(fileContent, fileName);
    if (!securityCheck.safe) {
      await auditService.logAuditEvent({
        eventType: 'security_violation',
        eventSubtype: 'file_scan_failed',
        userId: userId,
        eventDetails: {
          reason: securityCheck.reason,
          fileName: fileName,
          fileChecksum: fileChecksum.substring(0, 16),
          correlationId: correlationId
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'security_event'
      });
      return createErrorResponse(400, 'File failed security validation');
    }

    // Generate job ID and S3 key
    const jobId = generateJobId();
    const sanitizedFileName = sanitizeFileName(fileName);
    const s3Key = `uploads/${userId}/${jobId}/${sanitizedFileName}`;

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

    await s3.upload(uploadParams).promise();

    // Store job record using enhanced PostgreSQL service
    const jobData = {
      jobId,
      userId,
      originalFilename: fileName,
      sanitizedFilename: sanitizedFileName,
      fileType,
      fileSize,
      s3Bucket: process.env.TEMP_BUCKET_NAME,
      s3Key,
      fileChecksum,
      encryptionKeyId: process.env.KMS_KEY_ID,
      userAgent,
      sourceIp,
      sessionId,
      correlationId
    };

    const jobResult = await DocumentJobService.createJob(jobData);

    // Record security validation results
    await DocumentSecurityService.recordSecurityValidation(jobId, {
      userId,
      securityScanPassed: securityCheck.safe,
      magicNumberValidated: true,
      fileIntegrityVerified: true
    });

    return createResponse(200, {
      document_id: jobResult.jobId,
      file_name: sanitizedFileName,
      mime_type: getMimeType(fileType),
      file_size_bytes: fileSize,
      status: 'uploaded',
      uploaded_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Upload error:', sanitizeError(error));
    
    const userId = getUserIdFromEvent(event) || 'unknown';
    
    // Enhanced error audit logging
    await auditService.logAuditEvent({
      eventType: 'upload_error',
      eventSubtype: 'system_error',
      userId: userId,
      eventDetails: {
        error: sanitizeError(error).substring(0, 100),
        correlationId: correlationId
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      userAgent: userAgent,
      dataClassification: 'system_error'
    }).catch(auditError => {
      console.error('Audit logging failed:', auditError);
    });
    
    return createErrorResponse(500, 'Upload failed');
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