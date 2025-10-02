const AWS = require('aws-sdk');
const {
  createResponse,
  createErrorResponse,
  sanitizeError,
  withRetry,
  s3,
  categorizeError,
  updateCircuitBreaker,
  ERROR_CATEGORIES
} = require('../shared/utils');
const { auditService } = require('../shared/audit-service');
const { bedrockService } = require('../shared/bedrock-service');
const { medicalPromptsService } = require('../shared/medical-prompts');
const { ObservabilityService } = require('../shared/observability-service');

/**
 * AI Processing with AWS Bedrock Claude
 * Triggered by S3 upload to incoming/ folder
 */
exports.handler = async (event) => {
  const startTime = Date.now();
  let jobId;
  let userId = 'unknown';

  // Initialize observability
  const observability = ObservabilityService.createForFunction('process', event);

  try {
    // Only handle S3 triggers - no direct API calls
    if (!event.Records || event.Records[0].eventSource !== 'aws:s3') {
      console.error('Invalid trigger - process function only accepts S3 events');
      return createErrorResponse(400, 'INVALID_TRIGGER', 'Invalid trigger type', 'Process function only accepts S3 events');
    }

    // Extract job ID from S3 key
    const s3Record = event.Records[0].s3;
    const s3Key = decodeURIComponent(s3Record.object.key);
    jobId = extractJobIdFromS3Key(s3Key);

    if (!jobId) {
      console.error('Invalid S3 key format:', s3Key);
      return createErrorResponse(400, 'INVALID_JOB_ID', 'Invalid job ID in S3 key', 'S3 key must be in format: incoming/{jobId}');
    }

    console.log(`Processing job: ${jobId}`);

    // 1. Get job data from S3 incoming folder
    const jobData = await getJobDataFromS3(jobId);
    if (!jobData) {
      console.error('Job data not found in S3:', jobId);
      return createErrorResponse(404, 'JOB_DATA_NOT_FOUND', 'Job data not found', 'Could not retrieve job data from S3');
    }

    // Extract user ID for audit logging
    userId = jobData.user_id || extractUserIdFromJobId(jobId);
    
    // Determine job type and get appropriate processing
    const jobType = getJobTypeFromJobId(jobId);
    console.log(`Processing ${jobType} job for user ${userId}`);

    // 2. Process with Bedrock based on job type
    const processedResult = await processJobWithBedrock(jobType, jobData, jobId);

    // 3. Store results in S3 outgoing folder
    await storeResultsInS3(jobId, processedResult);

    // 4. Clean up original request file
    await cleanupIncomingFile(s3Key);

    // Success audit logging
    await auditService.logAuditEvent({
      eventType: 'document_processing',
      eventSubtype: 'processing_completed',
      userId: userId,
      eventDetails: {
        jobId: jobId,
        jobType: jobType,
        processingTimeMs: processedResult.metadata?.processing_time_ms || 0
      },
      dataClassification: 'medical_phi'
    });

    // Track AI processing metrics
    const processingTime = Date.now() - startTime;
    await observability.trackAIProcessing(
      true,
      processedResult.metadata?.model || 'claude-3-sonnet',
      processingTime,
      processedResult.metadata?.token_count || 0,
      processedResult.metadata?.confidence_score,
      userId
    );

    // Track user journey
    await observability.trackUserJourney('ai_processing_completed', userId, {
      jobId,
      jobType,
      processingTime
    });

    console.log(`Successfully processed job: ${jobId}`);
    return createResponse(200, {
      success: true,
      jobId: jobId,
      message: 'Processing completed successfully'
    });

  } catch (error) {
    console.error('Processing error:', sanitizeError(error));

    // Track error
    await observability.trackError(error, 'ai_processing', userId, {
      jobId,
      jobType: jobType || 'unknown'
    });
    
    // Enhanced error audit logging
    await auditService.logAuditEvent({
      eventType: 'document_processing',
      eventSubtype: 'processing_error',
      userId: userId,
      eventDetails: {
        jobId: jobId || 'unknown',
        error: sanitizeError(error).message?.substring(0, 100) || 'Unknown error'
      },
      dataClassification: 'system_error'
    }).catch(auditError => {
      console.error('Audit logging failed:', auditError);
    });
    
    // Store error status in S3 outgoing folder if we have a jobId
    if (jobId) {
      try {
        await storeErrorInS3(jobId, error);
      } catch (s3Error) {
        console.error('Failed to store error in S3:', s3Error);
      }
    }
    
    return createErrorResponse(500, 'PROCESSING_FAILED', 'Document processing failed', 'An error occurred while processing your document. Please try again or contact support if the problem persists.');
  }
};

/**
 * Get job data from S3 incoming folder
 */
async function getJobDataFromS3(jobId) {
  try {
    const s3Key = `incoming/${jobId}`;
    const params = {
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key
    };

    const result = await withRetry(
      () => s3.getObject(params).promise(),
      3,
      1000,
      `S3 getObject for job ${jobId}`
    );
    
    // For file uploads (result_ jobs), the body is the file content
    // For JSON requests (chat/report jobs), parse the JSON
    const jobType = getJobTypeFromJobId(jobId);
    
    if (jobType === 'result') {
      // Medical document analysis - return file content with metadata
      return {
        file_content: result.Body,
        content_type: result.ContentType,
        metadata: result.Metadata || {},
        user_id: result.Metadata?.['user-id'],
        file_type: result.Metadata?.['file-type'],
        original_filename: result.Metadata?.['original-filename']
      };
    } else {
      // Chat/Report jobs - parse JSON content
      return JSON.parse(result.Body.toString());
    }
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      console.error(`Job data not found in S3: ${jobId}`);
      return null;
    }
    throw new Error(`Failed to get job data from S3: ${error.message}`);
  }
}

/**
 * Extract user ID from job ID format
 */
function extractUserIdFromJobId(jobId) {
  // Job ID format: {prefix}_{user_id}_{timestamp}_{random}
  const parts = jobId.split('_');
  if (parts.length >= 4) {
    return parts[1];
  }
  return 'unknown';
}

/**
 * Get job type from job ID prefix
 */
function getJobTypeFromJobId(jobId) {
  const prefix = jobId.split('_')[0];
  return prefix; // 'result', 'chat', 'report'
}

/**
 * Process job with Bedrock based on job type
 */
async function processJobWithBedrock(jobType, jobData, jobId) {
  const startTime = Date.now();
  let isSuccess = false;
  
  try {
    // Map job type to prompt type
    const promptType = getPromptTypeForJob(jobType);
    console.log(`Using prompt type: ${promptType} for job type: ${jobType}`);

    // Prepare content for Bedrock based on job type
    let content;
    
    switch (jobType) {
      case 'result':
        // Medical document analysis
        content = await prepareFileContentForBedrock(jobData);
        break;
      case 'chat':
        // Chat message with context
        content = prepareChatContentForBedrock(jobData);
        break;
      case 'report':
        // Health data report
        content = prepareHealthDataForBedrock(jobData);
        break;
      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }

    // Create Bedrock request using medical prompts service
    const bedrockRequest = medicalPromptsService.createBedrockRequest(promptType, content);
    
    console.log(`Calling Bedrock for job ${jobId} with prompt type ${promptType}`);
    
    // Call Bedrock with retry logic and circuit breaker
    const bedrockResponse = await withRetry(
      async () => {
        try {
          const response = await bedrockService.callClaude(bedrockRequest);
          isSuccess = true;
          return response;
        } catch (bedrockError) {
          // Categorize Bedrock error for better handling
          const errorContext = { 
            service: 'bedrock', 
            operation: 'claude_inference',
            jobId: jobId,
            promptType: promptType
          };
          const categorization = categorizeError(bedrockError, errorContext);
          
          console.error(`Bedrock call failed - Category: ${categorization.category}, Recovery: ${categorization.recovery_strategy}`, bedrockError);
          throw bedrockError;
        }
      },
      3,
      2000,
      `Bedrock call for job ${jobId}`
    );

    const processingTime = Date.now() - startTime;
    
    // Process and format the response
    const processedResult = formatBedrockResponse(bedrockResponse, jobType, jobId, processingTime);
    
    console.log(`Bedrock processing completed for job ${jobId} in ${processingTime}ms`);
    return processedResult;

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    // Enhanced error categorization with Bedrock context
    const errorContext = { 
      service: 'bedrock', 
      operation: 'job_processing',
      jobId: jobId,
      jobType: jobType,
      processingTimeMs: processingTime
    };
    const categorization = categorizeError(error, errorContext);
    
    console.error(`Bedrock processing failed for job ${jobId} after ${processingTime}ms - Category: ${categorization.category}, Recovery: ${categorization.recovery_strategy}:`, error);
    throw error;
    
  } finally {
    // Update circuit breaker status for Bedrock service
    updateCircuitBreaker('bedrock', isSuccess);
  }
}

/**
 * Store results in S3 outgoing folder
 */
async function storeResultsInS3(jobId, result) {
  try {
    const s3Key = `outgoing/${jobId}`;
    const uploadParams = {
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key,
      Body: JSON.stringify(result),
      ContentType: 'application/json',
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: process.env.KMS_KEY_ID,
      Metadata: {
        'job-id': jobId,
        'result-timestamp': Date.now().toString(),
        'processing-status': 'completed'
      },
      Tagging: 'Classification=PHI-Temporary&AutoDelete=true'
    };

    await withRetry(
      () => s3.upload(uploadParams).promise(),
      3,
      1000,
      `S3 upload result for job ${jobId}`
    );
    
    console.log(`Stored results in S3: ${s3Key}`);
  } catch (error) {
    throw new Error(`Failed to store results in S3: ${error.message}`);
  }
}

/**
 * Clean up incoming file after successful processing
 */
async function cleanupIncomingFile(s3Key) {
  try {
    await withRetry(
      () => s3.deleteObject({
        Bucket: process.env.TEMP_BUCKET_NAME,
        Key: s3Key
      }).promise(),
      3,
      500,
      `S3 cleanup for ${s3Key}`
    );
    
    console.log(`Cleaned up incoming file: ${s3Key}`);
  } catch (error) {
    console.error('S3 cleanup error:', error);
    // Don't throw - file will be cleaned up by lifecycle policy
  }
}

/**
 * Store error status in S3 outgoing folder
 */
async function storeErrorInS3(jobId, error) {
  try {
    const errorResult = {
      status: 'failed',
      job_id: jobId,
      error: {
        code: 'PROCESSING_FAILED',
        message: 'Document processing failed',
        user_action: 'Please try again or contact support if the problem persists.',
        details: sanitizeError(error).message?.substring(0, 200)
      },
      generated_at: new Date().toISOString()
    };

    const s3Key = `outgoing/${jobId}`;
    const uploadParams = {
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key,
      Body: JSON.stringify(errorResult),
      ContentType: 'application/json',
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: process.env.KMS_KEY_ID,
      Metadata: {
        'job-id': jobId,
        'result-timestamp': Date.now().toString(),
        'processing-status': 'failed'
      },
      Tagging: 'Classification=PHI-Temporary&AutoDelete=true'
    };

    await s3.upload(uploadParams).promise();
    console.log(`Stored error status in S3: ${s3Key}`);
  } catch (s3Error) {
    console.error('Failed to store error in S3:', s3Error);
    // Don't throw - this is a best-effort operation
  }
}

/**
 * Extract job ID from S3 key
 */
function extractJobIdFromS3Key(s3Key) {
  // S3 key format: incoming/{jobId}
  const parts = s3Key.split('/');
  if (parts.length >= 2 && parts[0] === 'incoming') {
    return parts[1];
  }
  return null;
}

/**
 * Map job type to prompt type
 */
function getPromptTypeForJob(jobType) {
  const mapping = {
    'result': 'medical_analysis',
    'report': 'doctor_report', 
    'chat': 'chat_response'
  };
  return mapping[jobType] || 'medical_analysis';
}

/**
 * Prepare file content for Bedrock (medical documents)
 */
async function prepareFileContentForBedrock(jobData) {
  // For medical documents, we need to extract text content
  // This is a simplified version - in production you might want OCR for images
  
  const fileType = jobData.file_type || 'pdf';
  const filename = jobData.original_filename || 'document.pdf';
  
  if (fileType === 'pdf') {
    // For PDFs, we'll pass metadata and let Bedrock handle it
    // In production, you might want to extract text first
    return `Medical document uploaded: ${filename}
File type: PDF
Size: ${jobData.file_content.length} bytes

Please analyze this medical document for lab results, vitals, and other medical data.`;
  } else {
    // For images (JPG, PNG)
    return `Medical image uploaded: ${filename}
File type: ${fileType.toUpperCase()}
Size: ${jobData.file_content.length} bytes

Please analyze this medical image for any visible lab results, vitals, or medical information.`;
  }
}

/**
 * Prepare chat content for Bedrock
 */
function prepareChatContentForBedrock(jobData) {
  const { message, content_id, structured_data } = jobData;
  
  let content = `User Question: ${message}\n\n`;
  
  if (structured_data) {
    content += `Health Data Context: ${JSON.stringify(structured_data, null, 2)}\n\n`;
  }
  
  if (content_id) {
    content += `Document Context ID: ${content_id}\n\n`;
  }
  
  content += 'Please provide a helpful, educational response about this health question.';
  
  return content;
}

/**
 * Prepare health data for Bedrock (reports)
 */
function prepareHealthDataForBedrock(jobData) {
  const { health_data, report_type } = jobData;
  
  return `Health Data Report Request
Report Type: ${report_type || 'medical_summary'}

Health Data:
${JSON.stringify(health_data, null, 2)}

Please generate a comprehensive health report analyzing trends, patterns, and insights from this data.`;
}

/**
 * Format Bedrock response based on job type
 */
function formatBedrockResponse(bedrockResponse, jobType, jobId, processingTime) {
  const baseResult = {
    status: 'completed',
    job_id: jobId,
    generated_at: new Date().toISOString(),
    metadata: {
      processing_time_ms: processingTime,
      model_used: 'anthropic.claude-3-haiku-20240307-v1:0',
      job_type: jobType
    }
  };

  switch (jobType) {
    case 'result':
      return formatMedicalAnalysisResponse(bedrockResponse, baseResult);
    case 'report':
      return formatDoctorReportResponse(bedrockResponse, baseResult);
    case 'chat':
      return formatChatResponse(bedrockResponse, baseResult);
    default:
      // Fallback format
      return {
        ...baseResult,
        result_type: 'unknown',
        content: bedrockResponse
      };
  }
}

/**
 * Format medical analysis response (result_ jobs)
 */
function formatMedicalAnalysisResponse(bedrockResponse, baseResult) {
  try {
    // Try to parse structured response from Bedrock
    const content = bedrockResponse.content?.[0]?.text || bedrockResponse;
    
    // Split markdown and JSON parts
    const parts = content.split('```json');
    const markdownContent = parts[0]?.trim();
    const jsonPart = parts[1]?.replace('```', '').trim();
    
    let structuredData = {};
    if (jsonPart) {
      try {
        structuredData = JSON.parse(jsonPart);
      } catch (parseError) {
        console.warn('Failed to parse JSON from Bedrock response:', parseError);
      }
    }

    return {
      ...baseResult,
      result_type: 'medical_analysis',
      title: structuredData.title || 'Medical Analysis Results',
      markdown_content: markdownContent,
      extraction_metadata: structuredData.extraction_metadata || {
        confidence_score: 5,
        summary: 'Medical analysis completed',
        medical_flags: []
      },
      lab_results: structuredData.lab_results || [],
      vitals: structuredData.vitals || []
    };
  } catch (error) {
    console.error('Error formatting medical analysis response:', error);
    return {
      ...baseResult,
      result_type: 'medical_analysis',
      title: 'Medical Analysis Results',
      markdown_content: bedrockResponse.content?.[0]?.text || bedrockResponse,
      extraction_metadata: {
        confidence_score: 3,
        summary: 'Analysis completed with formatting issues',
        medical_flags: []
      }
    };
  }
}

/**
 * Format doctor report response (report_ jobs)
 */
function formatDoctorReportResponse(bedrockResponse, baseResult) {
  try {
    // Doctor reports use markdown + simple JSON format (similar to medical_analysis)
    const content = bedrockResponse.content?.[0]?.text || bedrockResponse;
    
    // Split markdown and JSON parts
    const parts = content.split('```json');
    const markdownContent = parts[0]?.trim();
    const jsonPart = parts[1]?.replace('```', '').trim();
    
    let structuredData = {};
    if (jsonPart) {
      try {
        structuredData = JSON.parse(jsonPart);
      } catch (parseError) {
        console.warn('Failed to parse JSON from doctor report response:', parseError);
      }
    }

    return {
      ...baseResult,
      result_type: 'doctor_report',
      title: structuredData.title || 'Health Trend Report',
      markdown_content: markdownContent,
      summary: structuredData.summary || 'Health trend analysis completed',
      confidence: structuredData.confidence || 5
    };
  } catch (error) {
    console.error('Error formatting doctor report response:', error);
    return {
      ...baseResult,
      result_type: 'doctor_report',
      title: 'Health Trend Report',
      markdown_content: bedrockResponse.content?.[0]?.text || bedrockResponse,
      summary: 'Analysis completed with formatting issues',
      confidence: 3
    };
  }
}

/**
 * Format chat response (chat_ jobs)
 */
function formatChatResponse(bedrockResponse, baseResult) {
  const aiResponse = bedrockResponse.content?.[0]?.text || bedrockResponse;
  
  return {
    ...baseResult,
    result_type: 'chat_response',
    chat_response: {
      ai_response: aiResponse,
      metadata: {
        response_length: aiResponse.length,
        model_temperature: medicalPromptsService.getTemperature('chat_response')
      }
    }
  };
}