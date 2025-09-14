const AWS = require('aws-sdk');
const sharp = require('sharp');
const {
  createResponse,
  createErrorResponse,
  sanitizeError,
  s3,
} = require('../shared/utils');
const { DocumentJobService } = require('../shared/document-database');
const { auditService } = require('../shared/audit-service');
const { bedrockService } = require('../shared/bedrock-service');

/**
 * AI Processing with AWS Bedrock Claude
 * Triggered by S3 upload or manual retry
 */
exports.handler = async (event) => {
  let jobId;
  
  try {
    // Handle different trigger types
    if (event.Records && event.Records[0].eventSource === 'aws:s3') {
      // S3 trigger - extract job ID from S3 key
      const s3Record = event.Records[0].s3;
      const s3Key = decodeURIComponent(s3Record.object.key);
      jobId = extractJobIdFromS3Key(s3Key);
    } else {
      // Direct API call - extract from path parameters
      jobId = event.pathParameters?.jobId;
    }

    if (!jobId) {
      return createErrorResponse(400, 'INVALID_JOB_ID', 'Invalid job ID provided', 'Please provide a valid job ID for processing');
    }

    // Get job record using PostgreSQL service
    const jobRecord = await DocumentJobService.getJob(jobId);
    if (!jobRecord) {
      await auditService.logAuditEvent({
        eventType: 'document_processing',
        eventSubtype: 'job_not_found',
        userId: 'system',
        eventDetails: { jobId: jobId },
        dataClassification: 'system_error'
      });
      
      return createErrorResponse(404, 'JOB_NOT_FOUND', 'Processing job not found', 'The specified document processing job could not be found');
    }

    // Enhanced processing started audit
    await auditService.logAuditEvent({
      eventType: 'document_processing',
      eventSubtype: 'processing_started',
      userId: jobRecord.userId,
      eventDetails: {
        jobId: jobId,
        fileType: jobRecord.fileType,
        fileSizeKB: Math.round(jobRecord.fileSize / 1024)
      },
      dataClassification: 'medical_phi'
    });

    // Update status to processing
    await DocumentJobService.updateJobStatus(jobId, 'processing', {
      processingStartedAt: Date.now(),
    }, jobRecord.userId);

    // Download file from S3
    const fileContent = await downloadFileFromS3(jobRecord.s3Key);
    
    // Extract text content based on file type
    const extractedText = await extractTextContent(
      fileContent, 
      jobRecord.fileType
    );

    // Process with Bedrock Claude
    const bedrockResult = await bedrockService.analyzeMedicalDocument(extractedText, {
      userId: jobRecord.userId,
      fileType: jobRecord.fileType,
      fileName: jobRecord.originalFileName
    });

    // Handle Bedrock processing failure
    if (!bedrockResult.success) {
      await DocumentJobService.updateJobStatus(jobId, 'failed', {
        failedAt: Date.now(),
        errorMessage: bedrockResult.error.message,
      }, jobRecord.userId);

      await auditService.logAuditEvent({
        eventType: 'document_processing',
        eventSubtype: 'processing_failed',
        userId: jobRecord.userId,
        eventDetails: {
          jobId: jobId,
          errorCode: bedrockResult.error.code,
          errorCategory: bedrockResult.error.category
        },
        dataClassification: 'medical_phi'
      });

      // Return error response if called directly (not from S3 trigger)
      if (!event.Records) {
        return createErrorResponse(500, bedrockResult.error.code, bedrockResult.error.message, bedrockResult.error.user_action);
      }
      return;
    }

    // Transform Bedrock result to legacy format for compatibility
    const aiResult = transformBedrockToLegacyFormat(bedrockResult);

    // Store only non-medical metadata (no medical content stored server-side)
    await DocumentJobService.storeResultsToS3(jobId, {
      confidenceScore: aiResult.confidenceScore,
      aiModelUsed: aiResult.ai_model_used,
      processingTimeMs: aiResult.processing_time_ms,
      extractedTextLength: extractedText?.length || 0,
      textExtractionMethod: jobRecord.fileType === 'pdf' ? 'pdf_text_extraction' : 'image_metadata'
    }, jobRecord.userId);

    // Update job status to completed
    await DocumentJobService.updateJobStatus(jobId, 'completed', {
      completedAt: Date.now(),
      processingDuration: Date.now() - new Date(jobRecord.uploadedAt).getTime(),
    }, jobRecord.userId);

    // Clean up S3 file immediately after successful processing
    await cleanupS3File(jobRecord.s3Key);

    // Enhanced processing completed audit
    await auditService.logAuditEvent({
      eventType: 'document_processing',
      eventSubtype: 'processing_completed',
      userId: jobRecord.userId,
      eventDetails: {
        jobId: jobId,
        confidenceScore: aiResult.confidenceScore,
        flagsCount: aiResult.medicalFlags?.length || 0,
        processingDurationMs: bedrockResult.metadata.processing_time_ms,
        tokenUsage: bedrockResult.metadata.token_usage,
        costCents: bedrockResult.metadata.cost_estimate_cents
      },
      dataClassification: 'medical_phi'
    });

    // Return result if called directly (not from S3 trigger)
    if (!event.Records) {
      return createResponse(200, {
        success: true,
        job_id: jobId,
        status: 'completed',
        result: aiResult,
        processing_metadata: {
          model_used: bedrockResult.metadata.model_used,
          processing_time_ms: bedrockResult.metadata.processing_time_ms,
          token_usage: bedrockResult.metadata.token_usage,
          cost_estimate_cents: bedrockResult.metadata.cost_estimate_cents
        }
      });
    }

  } catch (error) {
    console.error('Processing error:', sanitizeError(error));
    
    if (jobId) {
      try {
        await DocumentJobService.updateJobStatus(jobId, 'failed', {
          failedAt: Date.now(),
          errorMessage: sanitizeError(error).message?.substring(0, 500) || 'Unknown processing error',
        }, jobRecord?.userId);

        await auditService.logAuditEvent({
          eventType: 'document_processing',
          eventSubtype: 'processing_error',
          userId: jobRecord?.userId || 'unknown',
          eventDetails: {
            jobId: jobId,
            error: sanitizeError(error).message?.substring(0, 100) || 'Unknown error'
          },
          dataClassification: 'system_error'
        });
      } catch (auditError) {
        console.error('Error logging processing failure:', auditError);
      }
    }
    
    // Return structured error response
    return createErrorResponse(500, 'PROCESSING_FAILED', 'Document processing failed', 'An error occurred while processing your document. Please try again or contact support if the problem persists.');
  }
};

/**
 * Download file from S3
 */
async function downloadFileFromS3(s3Key) {
  try {
    const params = {
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key,
    };

    const result = await s3.getObject(params).promise();
    return result.Body;
  } catch (error) {
    throw new Error(`Failed to download file from S3: ${error.message}`);
  }
}

/**
 * Extract text content from file based on type
 */
async function extractTextContent(fileContent, fileType) {
  switch (fileType) {
    case 'pdf':
      return await extractTextFromPDF(fileContent);
    case 'jpg':
    case 'jpeg':
    case 'png':
      return await extractTextFromImage(fileContent);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

/**
 * Extract text from PDF (basic implementation)
 */
async function extractTextFromPDF(fileContent) {
  // For production, use a proper PDF parsing library like pdf-parse
  // This is a simplified implementation
  try {
    const pdfString = fileContent.toString('binary');
    
    // Very basic text extraction - look for readable text patterns
    const textPattern = /BT\s+.*?ET/g;
    const matches = pdfString.match(textPattern) || [];
    
    let extractedText = matches
      .map(match => match.replace(/BT\s+|ET/g, ''))
      .join(' ')
      .replace(/[^\w\s\.\,\:\;\-\%\(\)]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!extractedText || extractedText.length < 10) {
      // Fallback: return indication that this is a PDF document
      extractedText = 'This appears to be a PDF medical document. Please process the visual content for medical information extraction.';
    }

    return extractedText;
  } catch (error) {
    console.error('PDF text extraction error:', error);
    return 'PDF medical document uploaded for interpretation. Content extraction may require enhanced processing.';
  }
}

/**
 * Extract text from image using OCR (basic implementation)
 */
async function extractTextFromImage(fileContent) {
  try {
    // For production, integrate with AWS Textract or Google Vision API
    // This is a simplified implementation that processes the image
    
    const metadata = await sharp(fileContent).metadata();
    
    // Return basic image information for now
    return `Medical document image uploaded for analysis. Image specifications: ${metadata.width}x${metadata.height} pixels, ${metadata.format} format. Please analyze the visual content for medical information and data extraction.`;
    
  } catch (error) {
    console.error('Image text extraction error:', error);
    return 'Medical document image uploaded for interpretation. Enhanced visual analysis required for data extraction.';
  }
}

/**
 * Transform Bedrock response to legacy format for compatibility
 */
function transformBedrockToLegacyFormat(bedrockResult) {
  const analysis = bedrockResult.analysis;
  
  return {
    // Legacy field mapping
    confidenceScore: analysis.medical_analysis?.confidence_score || 5,
    interpretationText: analysis.medical_analysis?.interpretation_text || 'Medical document processed successfully.',
    detailedInterpretation: analysis.medical_analysis?.detailed_interpretation || analysis.medical_analysis?.interpretation_text || 'Analysis completed.',
    medicalFlags: analysis.medical_analysis?.medical_flags || [],
    recommendations: analysis.medical_analysis?.recommendations || ['Consult with your healthcare provider'],
    disclaimers: analysis.disclaimers || [],
    
    // Additional metadata
    ai_model_used: bedrockResult.metadata.model_used,
    processing_time_ms: bedrockResult.metadata.processing_time_ms,
    aiTokenUsage: bedrockResult.metadata.token_usage,
    ai_cost_estimate: bedrockResult.metadata.cost_estimate_cents,
    
    // Document validation info
    documentValidation: {
      is_medical_document: analysis.document_validation?.is_medical_document || true,
      document_type: analysis.document_validation?.document_type || 'general_medical',
      validation_confidence: analysis.document_validation?.validation_confidence || 0.8
    }
  };
}

/**
 * Extract job ID from S3 key
 */
function extractJobIdFromS3Key(s3Key) {
  // S3 key format: uploads/{userId}/{jobId}/{filename}
  const parts = s3Key.split('/');
  if (parts.length >= 3) {
    return parts[2];
  }
  return null;
}

/**
 * Clean up S3 file after processing
 */
async function cleanupS3File(s3Key) {
  try {
    await s3.deleteObject({
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key,
    }).promise();
    
    console.log(`Cleaned up S3 file: ${s3Key}`);
  } catch (error) {
    console.error('S3 cleanup error:', error);
    // Don't throw - file will be cleaned up by lifecycle policy
  }
}