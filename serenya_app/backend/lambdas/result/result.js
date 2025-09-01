const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  getJobRecord,
  auditLog,
  sanitizeError,
} = require('../shared/utils');

/**
 * Results Retrieval
 * GET /api/v1/process/result/{jobId}
 */
exports.handler = async (event) => {
  try {
    const userId = getUserIdFromEvent(event);
    const jobId = event.pathParameters?.jobId;

    if (!userId) {
      return createErrorResponse(401, 'Invalid or missing authentication');
    }

    if (!jobId) {
      return createErrorResponse(400, 'Missing job ID');
    }

    auditLog('result_request', userId, { jobId });

    // Get job record
    const jobRecord = await getJobRecord(jobId);
    
    if (!jobRecord) {
      auditLog('result_job_not_found', userId, { jobId });
      return createErrorResponse(404, 'Job not found');
    }

    // Verify user owns this job
    if (jobRecord.userId !== userId) {
      auditLog('result_unauthorized', userId, { jobId, actualUserId: jobRecord.userId });
      return createErrorResponse(403, 'Unauthorized access to job');
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

    // Prepare interpretation result
    const interpretationResult = {
      job_id: jobId,
      confidence_score: jobRecord.confidenceScore,
      interpretation_text: jobRecord.interpretationText,
      detailed_interpretation: jobRecord.detailedInterpretation,
      medical_flags: jobRecord.medicalFlags || [],
      recommendations: jobRecord.recommendations || [],
      disclaimers: jobRecord.disclaimers || [],
      processed_at: new Date(jobRecord.completedAt).toISOString(),
      processing_duration_ms: jobRecord.processingDuration,
      file_info: {
        original_name: jobRecord.originalFileName,
        type: jobRecord.fileType,
        size: jobRecord.fileSize,
        uploaded_at: new Date(jobRecord.uploadedAt).toISOString(),
      },
    };

    // Add medical safety warnings based on confidence and flags
    const safetyWarnings = generateSafetyWarnings(
      jobRecord.confidenceScore,
      jobRecord.medicalFlags
    );
    
    interpretationResult.safety_warnings = safetyWarnings;
    interpretationResult.confidence_level = getConfidenceLevel(jobRecord.confidenceScore);

    auditLog('result_retrieved', userId, { 
      jobId, 
      confidenceScore: jobRecord.confidenceScore,
      confidenceLevel: interpretationResult.confidence_level
    });

    return createResponse(200, {
      success: true,
      ...interpretationResult,
    });

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