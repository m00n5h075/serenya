const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  sanitizeError,
} = require('../shared/utils');
const { DocumentJobService } = require('../shared/document-database');
const { auditService } = require('../shared/audit-service');

/**
 * Results Retrieval
 * GET /api/v1/process/result/{jobId}
 */
exports.handler = async (event) => {
  const sessionId = event.requestContext?.requestId || 'unknown';
  const sourceIp = event.requestContext?.identity?.sourceIp;
  const userAgent = event.headers?.['User-Agent'];
  
  try {
    const userId = getUserIdFromEvent(event);
    const jobId = event.pathParameters?.jobId;

    if (!userId) {
      return createErrorResponse(401, 'Invalid or missing authentication');
    }

    if (!jobId) {
      return createErrorResponse(400, 'Missing job ID');
    }

    // Enhanced audit logging for result request
    await auditService.logAuditEvent({
      eventType: 'document_processing',
      eventSubtype: 'result_request',
      userId: userId,
      eventDetails: {
        jobId: jobId
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      userAgent: userAgent,
      dataClassification: 'medical_phi'
    });

    // Get job record using PostgreSQL service (includes user verification)
    const jobRecord = await DocumentJobService.getJob(jobId, userId);
    
    if (!jobRecord) {
      await auditService.logAuditEvent({
        eventType: 'document_processing',
        eventSubtype: 'result_job_not_found',
        userId: userId,
        eventDetails: { jobId: jobId },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'medical_phi'
      });
      return createErrorResponse(404, 'Job not found');
    }

    // Check if processing is complete
    if (jobRecord.status !== 'completed') {
      const statusMessage = getStatusMessage(jobRecord.status, jobRecord.retryCount);
      
      return createResponse(202, {
        success: false,
        job_id: jobId,
        status: jobRecord.status,
        message: statusMessage,
        retry_count: jobRecord.retryCount || 0,
        can_retry: (jobRecord.retryCount || 0) < 3 && jobRecord.status === 'failed',
      });
    }

    // Handle different job types differently
    // Check if this is a doctor report by looking at the filename pattern
    const isDoctorReport = jobRecord.originalFilename && 
                          jobRecord.originalFilename.includes('health_data_export');
    
    if (isDoctorReport) {
      // Doctor report results are stored in S3, not database
      return await handleDoctorReportResults(jobRecord, userId);
    } else {
      // Document analysis results are stored in database
      const results = await DocumentJobService.getResults(jobId, userId);
      if (!results) {
        return createErrorResponse(500, 'Results not found', 'Processing results are not available');
      }
      
      return handleDocumentAnalysisResults(jobRecord, results);
    }

  } catch (error) {
    console.error('Result retrieval error:', sanitizeError(error));
    
    const userId = getUserIdFromEvent(event) || 'unknown';
    const jobId = event.pathParameters?.jobId || 'unknown';
    
    auditLog('result_error', userId, { 
      jobId, 
      error: sanitizeError(error).substring(0, 100) 
    });
    
    return createErrorResponse(500, 'Failed to retrieve results');
  }
};

/**
 * Handle doctor report results using unified approach
 */
async function handleDoctorReportResults(jobRecord, userId) {
  try {
    // Get unified results using the same method as document analysis
    const results = await DocumentJobService.getResults(jobRecord.jobId, userId);
    if (!results) {
      return createErrorResponse(500, 'Doctor report results not found', 'Processing results are not available');
    }

    // Parse unified Bedrock response format (same as document analysis)
    const bedrockResponse = results;
    const reportMetadata = bedrockResponse.report_metadata || {};
    const jobMetadata = results.jobMetadata || {};

    // Format as interpretation result for consistency with Flutter app
    const interpretationResult = {
      job_id: jobRecord.jobId,
      content_id: jobRecord.jobId,
      title: reportMetadata.title || 'Doctor Report',
      summary: reportMetadata.summary || 'Comprehensive medical analysis report',
      detailed_interpretation: bedrockResponse.markdown_content || '',
      confidence_score: reportMetadata.confidence_score || jobMetadata.confidenceScore || 8,
      medical_flags: reportMetadata.medical_flags || [],
      recommendations: [], // Not used per user feedback
      disclaimers: [], // Baked into markdown content per user feedback
      safety_warnings: [],
      processed_at: new Date(jobRecord.completedAt).toISOString(),
      processing_duration_ms: jobMetadata.processingTimeMs || 0,
      ai_model_info: {
        model_used: jobMetadata.aiModelUsed || 'claude-3-haiku-20240307',
        processing_time_ms: jobMetadata.processingTimeMs || 0,
        token_usage: bedrockResponse.token_usage || null,
        cost_estimate: bedrockResponse.cost_estimate || null
      },
      file_info: {
        original_name: jobRecord.original_filename || `doctor_report_${jobRecord.jobId}.json`,
        type: 'doctor_report',
        size: jobRecord.fileSize,
        uploaded_at: new Date(jobRecord.uploadedAt).toISOString(),
      },
      // Include structured data for local storage
      lab_results: bedrockResponse.lab_results || [],
      vitals: bedrockResponse.vitals || []
    };

    // Add medical safety warnings
    const safetyWarnings = generateSafetyWarnings(
      interpretationResult.confidence_score,
      interpretationResult.medical_flags
    );
    
    interpretationResult.safety_warnings = [...(interpretationResult.safety_warnings || []), ...safetyWarnings];
    interpretationResult.confidence_level = getConfidenceLevel(interpretationResult.confidence_score);

    return createResponse(200, {
      success: true,
      ...interpretationResult,
    });
    
  } catch (error) {
    console.error('Error fetching doctor report from S3:', error);
    return createErrorResponse(500, 'Failed to retrieve doctor report', 'Unable to fetch report from storage');
  }
}

/**
 * Handle document analysis results from unified Bedrock response
 */
async function handleDocumentAnalysisResults(jobRecord, results) {
  // Parse unified Bedrock response format
  const bedrockResponse = results;
  const documentMetadata = bedrockResponse.document_metadata || {};
  const jobMetadata = results.jobMetadata || {};

  // Prepare interpretation result with parsed data
  const interpretationResult = {
    job_id: jobRecord.jobId,
    content_id: jobRecord.jobId,
    title: documentMetadata.title || 'Medical Document Analysis',
    summary: documentMetadata.summary || '',
    detailed_interpretation: bedrockResponse.markdown_content || '',
    confidence_score: documentMetadata.confidence_score || jobMetadata.confidenceScore || 5,
    medical_flags: documentMetadata.medical_flags || [],
    recommendations: [], // Not used per user feedback
    disclaimers: [], // Baked into markdown content per user feedback
    safety_warnings: [],
    processed_at: new Date(jobRecord.completedAt).toISOString(),
    processing_duration_ms: jobMetadata.processingTimeMs || 0,
    ai_model_info: {
      model_used: jobMetadata.aiModelUsed || 'claude-3-haiku-20240307',
      processing_time_ms: jobMetadata.processingTimeMs || 0,
      token_usage: bedrockResponse.token_usage || null,
      cost_estimate: bedrockResponse.cost_estimate || null
    },
    file_info: {
      original_name: jobRecord.original_filename,
      type: jobRecord.fileType,
      size: jobRecord.fileSize,
      uploaded_at: new Date(jobRecord.uploadedAt).toISOString(),
    },
    // Include structured data for local storage
    lab_results: bedrockResponse.lab_results || [],
    vitals: bedrockResponse.vitals || []
  };

  // Add medical safety warnings based on confidence and flags
  const safetyWarnings = generateSafetyWarnings(
    interpretationResult.confidence_score,
    interpretationResult.medical_flags
  );
    
  interpretationResult.safety_warnings = [...(interpretationResult.safety_warnings || []), ...safetyWarnings];
  interpretationResult.confidence_level = getConfidenceLevel(interpretationResult.confidence_score);

  // Enhanced result retrieval audit
  await auditService.logAuditEvent({
    eventType: 'document_processing',
    eventSubtype: 'result_retrieved',
    userId: jobRecord.userId,
    eventDetails: {
      jobId: jobRecord.jobId,
      confidenceScore: interpretationResult.confidence_score,
      confidenceLevel: interpretationResult.confidence_level,
      flagsCount: interpretationResult.medical_flags?.length || 0
    },
    dataClassification: 'medical_phi'
  });

  return createResponse(200, {
    success: true,
    ...interpretationResult,
  });
}

/**
 * Get status message for incomplete processing
 */
function getStatusMessage(status, retryCount = 0) {
  switch (status) {
    case 'uploaded':
      return 'File uploaded successfully. Processing will start shortly.';
    case 'processing':
      return 'Your document is being analyzed. This usually takes 1-2 minutes.';
    case 'failed':
      if (retryCount === 0) {
        return 'Processing failed. You can retry or try uploading again.';
      } else {
        return `Processing failed after ${retryCount} attempt(s). You can retry or contact support.`;
      }
    case 'retrying':
      return `Retrying processing (attempt ${retryCount + 1}/3). Please wait...`;
    case 'timeout':
      return 'Processing timeout. You can retry or try uploading a different file.';
    default:
      return 'Processing status unknown. Please contact support.';
  }
}

/**
 * Generate safety warnings based on confidence score and medical flags
 */
function generateSafetyWarnings(confidenceScore, medicalFlags = []) {
  const warnings = [];

  // Low confidence warnings
  if (confidenceScore <= 3) {
    warnings.push({
      type: 'LOW_CONFIDENCE',
      message: 'The AI interpretation has low confidence. Please consult a healthcare provider.',
      severity: 'high',
    });
  } else if (confidenceScore <= 6) {
    warnings.push({
      type: 'MODERATE_CONFIDENCE', 
      message: 'The AI interpretation has moderate confidence. Consider discussing with your doctor.',
      severity: 'medium',
    });
  }

  // Medical flag warnings
  if (medicalFlags.includes('ABNORMAL_VALUES')) {
    warnings.push({
      type: 'ABNORMAL_VALUES',
      message: 'Abnormal values detected. Please consult your healthcare provider promptly.',
      severity: 'high',
    });
  }

  if (medicalFlags.includes('URGENT_CONSULTATION')) {
    warnings.push({
      type: 'URGENT_CONSULTATION',
      message: 'Urgent consultation recommended. Contact your healthcare provider immediately.',
      severity: 'critical',
    });
  }

  if (medicalFlags.includes('REQUIRES_FOLLOWUP')) {
    warnings.push({
      type: 'FOLLOWUP_NEEDED',
      message: 'Follow-up recommended. Schedule an appointment with your healthcare provider.',
      severity: 'medium',
    });
  }

  // Always include general disclaimer
  warnings.push({
    type: 'MEDICAL_DISCLAIMER',
    message: 'This interpretation is for informational purposes only. Always consult healthcare professionals for medical advice.',
    severity: 'info',
  });

  return warnings;
}

/**
 * Get confidence level category
 */
function getConfidenceLevel(confidenceScore) {
  if (confidenceScore <= 3) {
    return 'low';
  } else if (confidenceScore <= 6) {
    return 'moderate';
  } else {
    return 'high';
  }
}

/**
 * Check if result has expired (for additional security)
 */
function isResultExpired(completedAt) {
  const now = Date.now();
  const resultExpiryHours = 24;
  const expiryTime = completedAt + (resultExpiryHours * 60 * 60 * 1000);
  
  return now > expiryTime;
}

/**
 * Sanitize interpretation text for safe display
 */
function sanitizeInterpretationText(text) {
  if (!text) return '';
  
  // Remove any potential script injections
  return text
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .substring(0, 5000); // Limit length
}

/**
 * Format medical flags for display
 */
function formatMedicalFlags(flags = []) {
  const flagDescriptions = {
    'ABNORMAL_VALUES': 'Some values appear outside normal ranges',
    'URGENT_CONSULTATION': 'Urgent medical consultation recommended',
    'REQUIRES_FOLLOWUP': 'Follow-up appointment recommended',
    'PROCESSING_ERROR': 'Processing completed with technical issues',
    'LOW_QUALITY_IMAGE': 'Image quality may affect interpretation accuracy',
    'INCOMPLETE_DATA': 'Some information may be missing or unclear',
  };

  return flags.map(flag => ({
    code: flag,
    description: flagDescriptions[flag] || flag,
  }));
}