const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  getJobRecord,
  auditLog,
  sanitizeError,
} = require('../shared/utils');

/**
 * Processing Status Tracking
 * GET /api/v1/process/status/{jobId}
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

    auditLog('status_check', userId, { jobId });

    // Get job record
    const jobRecord = await getJobRecord(jobId);
    
    if (!jobRecord) {
      auditLog('status_job_not_found', userId, { jobId });
      return createErrorResponse(404, 'Job not found');
    }

    // Verify user owns this job
    if (jobRecord.userId !== userId) {
      auditLog('status_unauthorized', userId, { jobId, actualUserId: jobRecord.userId });
      return createErrorResponse(403, 'Unauthorized access to job');
    }

    // Calculate processing duration and timeout status
    const now = Date.now();
    const uploadTime = jobRecord.uploadedAt;
    const processingTime = jobRecord.processingStartedAt;
    const timeoutMinutes = 3;
    const timeoutMs = timeoutMinutes * 60 * 1000;

    let status = jobRecord.status;
    let timeoutStatus = false;

    // Check for processing timeout
    if (status === 'processing' && processingTime) {
      const processingDuration = now - processingTime;
      if (processingDuration > timeoutMs) {
        status = 'timeout';
        timeoutStatus = true;
      }
    } else if (status === 'uploaded') {
      const uploadDuration = now - uploadTime;
      if (uploadDuration > timeoutMs) {
        status = 'timeout';
        timeoutStatus = true;
      }
    }

    // Calculate progress percentage
    const progressPercentage = calculateProgress(status, uploadTime, processingTime, now);

    // Prepare response data
    const responseData = {
      job_id: jobId,
      status: status,
      progress_percentage: progressPercentage,
      uploaded_at: new Date(uploadTime).toISOString(),
      processing_started_at: processingTime ? new Date(processingTime).toISOString() : null,
      completed_at: jobRecord.completedAt ? new Date(jobRecord.completedAt).toISOString() : null,
      retry_count: jobRecord.retryCount || 0,
      last_retry_at: jobRecord.lastRetryAt ? new Date(jobRecord.lastRetryAt).toISOString() : null,
      file_info: {
        name: jobRecord.originalFileName,
        type: jobRecord.fileType,
        size: jobRecord.fileSize,
      },
    };

    // Add error information if status is failed
    if (status === 'failed' || status === 'timeout') {
      responseData.error_message = status === 'timeout' 
        ? 'Processing timeout after 3 minutes'
        : jobRecord.errorMessage || 'Processing failed';
      
      responseData.can_retry = (jobRecord.retryCount || 0) < 3;
    }

    // Add confidence score if completed
    if (status === 'completed' && jobRecord.confidenceScore) {
      responseData.confidence_score = jobRecord.confidenceScore;
    }

    auditLog('status_retrieved', userId, { 
      jobId, 
      status, 
      progressPercentage 
    });

    return createResponse(200, {
      success: true,
      ...responseData,
    });

  } catch (error) {
    console.error('Status check error:', sanitizeError(error));
    
    const userId = getUserIdFromEvent(event) || 'unknown';
    const jobId = event.pathParameters?.jobId || 'unknown';
    
    auditLog('status_error', userId, { 
      jobId, 
      error: sanitizeError(error).substring(0, 100) 
    });
    
    return createErrorResponse(500, 'Failed to retrieve processing status');
  }
};

/**
 * Calculate progress percentage based on status and timing
 */
function calculateProgress(status, uploadTime, processingTime, currentTime) {
  switch (status) {
    case 'uploaded':
      return 10;
    case 'processing':
      if (processingTime) {
        // Linear progress from 20% to 90% over 3 minutes
        const processingDuration = currentTime - processingTime;
        const maxDuration = 3 * 60 * 1000; // 3 minutes
        const progress = Math.min(90, 20 + (processingDuration / maxDuration) * 70);
        return Math.round(progress);
      }
      return 20;
    case 'completed':
      return 100;
    case 'failed':
    case 'timeout':
      return 0;
    case 'retrying':
      return 15;
    default:
      return 0;
  }
}

/**
 * Get estimated completion time
 */
function getEstimatedCompletion(status, uploadTime, processingTime) {
  const now = Date.now();
  
  switch (status) {
    case 'uploaded':
      return new Date(now + 60000).toISOString(); // 1 minute
    case 'processing':
      if (processingTime) {
        const elapsed = now - processingTime;
        const remaining = Math.max(0, (3 * 60 * 1000) - elapsed); // 3 minutes max
        return new Date(now + remaining).toISOString();
      }
      return new Date(now + 120000).toISOString(); // 2 minutes
    case 'retrying':
      return new Date(now + 30000).toISOString(); // 30 seconds
    default:
      return null;
  }
}

/**
 * Check if job has been abandoned (no status checks for extended period)
 */
function isJobAbandoned(jobRecord) {
  const now = Date.now();
  const lastUpdate = jobRecord.updatedAt;
  const abandonedThreshold = 10 * 60 * 1000; // 10 minutes

  return (now - lastUpdate) > abandonedThreshold;
}