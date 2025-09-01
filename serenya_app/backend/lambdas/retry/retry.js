const AWS = require('aws-sdk');
const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  getJobRecord,
  updateJobStatus,
  auditLog,
  sanitizeError,
} = require('../shared/utils');

const lambda = new AWS.Lambda();

/**
 * Processing Retry Management
 * POST /api/v1/process/retry/{jobId}
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

    auditLog('retry_attempt', userId, { jobId });

    // Get job record
    const jobRecord = await getJobRecord(jobId);
    
    if (!jobRecord) {
      auditLog('retry_job_not_found', userId, { jobId });
      return createErrorResponse(404, 'Job not found');
    }

    // Verify user owns this job
    if (jobRecord.userId !== userId) {
      auditLog('retry_unauthorized', userId, { jobId, actualUserId: jobRecord.userId });
      return createErrorResponse(403, 'Unauthorized access to job');
    }

    // Check if job can be retried
    const canRetry = canJobBeRetried(jobRecord);
    if (!canRetry.allowed) {
      auditLog('retry_not_allowed', userId, { jobId, reason: canRetry.reason });
      return createErrorResponse(400, canRetry.reason);
    }

    // Calculate retry delay
    const retryCount = jobRecord.retryCount || 0;
    const retryDelay = calculateRetryDelay(retryCount);

    // Update job status to retrying
    await updateJobStatus(jobId, 'retrying', {
      retryCount: retryCount + 1,
      lastRetryAt: Date.now(),
      scheduledRetryAt: Date.now() + retryDelay,
    });

    // Schedule the actual retry
    await scheduleRetry(jobId, retryDelay);

    const retryInfo = {
      retry_count: retryCount + 1,
      max_retries: 3,
      retry_delay_seconds: Math.round(retryDelay / 1000),
      estimated_completion: new Date(Date.now() + retryDelay + (2 * 60 * 1000)).toISOString(),
    };

    auditLog('retry_scheduled', userId, { 
      jobId, 
      retryCount: retryCount + 1,
      delaySeconds: Math.round(retryDelay / 1000)
    });

    return createResponse(200, {
      success: true,
      job_id: jobId,
      status: 'retrying',
      message: `Retry scheduled (attempt ${retryCount + 1}/3)`,
      ...retryInfo,
    });

  } catch (error) {
    console.error('Retry error:', sanitizeError(error));
    
    const userId = getUserIdFromEvent(event) || 'unknown';
    const jobId = event.pathParameters?.jobId || 'unknown';
    
    auditLog('retry_error', userId, { 
      jobId, 
      error: sanitizeError(error).substring(0, 100) 
    });
    
    return createErrorResponse(500, 'Failed to schedule retry');
  }
};

/**
 * Check if job can be retried
 */
function canJobBeRetried(jobRecord) {
  const maxRetries = 3;
  const retryCount = jobRecord.retryCount || 0;

  // Check retry limit
  if (retryCount >= maxRetries) {
    return {
      allowed: false,
      reason: `Maximum retry limit reached (${maxRetries} attempts)`,
    };
  }

  // Check job status
  const retryableStatuses = ['failed', 'timeout'];
  if (!retryableStatuses.includes(jobRecord.status)) {
    return {
      allowed: false,
      reason: `Cannot retry job with status: ${jobRecord.status}`,
    };
  }

  // Check time since last retry (prevent spam)
  if (jobRecord.lastRetryAt) {
    const timeSinceLastRetry = Date.now() - jobRecord.lastRetryAt;
    const minRetryInterval = 30 * 1000; // 30 seconds
    
    if (timeSinceLastRetry < minRetryInterval) {
      return {
        allowed: false,
        reason: 'Please wait before retrying again',
      };
    }
  }

  // Check if job is too old
  const jobAge = Date.now() - jobRecord.uploadedAt;
  const maxJobAge = 24 * 60 * 60 * 1000; // 24 hours
  
  if (jobAge > maxJobAge) {
    return {
      allowed: false,
      reason: 'Job is too old to retry. Please upload a new file.',
    };
  }

  return { allowed: true };
}

/**
 * Calculate retry delay based on attempt number (exponential backoff)
 */
function calculateRetryDelay(retryCount) {
  const baseDelays = [
    30 * 1000,   // First retry: 30 seconds
    2 * 60 * 1000,   // Second retry: 2 minutes  
    5 * 60 * 1000,   // Third retry: 5 minutes
  ];

  return baseDelays[retryCount] || baseDelays[baseDelays.length - 1];
}

/**
 * Schedule retry by invoking process Lambda after delay
 */
async function scheduleRetry(jobId, delayMs) {
  try {
    // Use CloudWatch Events (EventBridge) for scheduled retry
    const eventbridge = new AWS.EventBridge();
    
    const ruleName = `serenya-retry-${jobId}`;
    const scheduleExpression = `at(${new Date(Date.now() + delayMs).toISOString().slice(0, -5)})`;

    // Create one-time rule
    await eventbridge.putRule({
      Name: ruleName,
      ScheduleExpression: scheduleExpression,
      State: 'ENABLED',
      Description: `Serenya processing retry for job ${jobId}`,
    }).promise();

    // Add Lambda target
    await eventbridge.putTargets({
      Rule: ruleName,
      Targets: [{
        Id: '1',
        Arn: `arn:aws:lambda:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:function:${process.env.PROCESS_FUNCTION_NAME}`,
        Input: JSON.stringify({
          source: 'retry-scheduler',
          pathParameters: { jobId },
        }),
      }],
    }).promise();

    console.log(`Scheduled retry for job ${jobId} in ${delayMs}ms`);

  } catch (error) {
    console.error('Failed to schedule retry:', error);
    
    // Fallback: direct Lambda invocation with delay (not recommended for production)
    setTimeout(async () => {
      try {
        await lambda.invoke({
          FunctionName: process.env.PROCESS_FUNCTION_NAME,
          InvocationType: 'Event',
          Payload: JSON.stringify({
            source: 'retry-fallback',
            pathParameters: { jobId },
          }),
        }).promise();
      } catch (invokeError) {
        console.error('Fallback retry invocation failed:', invokeError);
      }
    }, delayMs);
  }
}

/**
 * Get retry message for user display
 */
function getRetryMessage(retryCount) {
  const messages = [
    'Retrying in 30 seconds...',
    'Retrying in 2 minutes...',
    'Final retry in 5 minutes...',
  ];

  return messages[retryCount - 1] || 'Retry scheduled...';
}

/**
 * Clean up retry schedule (for completed/cancelled jobs)
 */
async function cleanupRetrySchedule(jobId) {
  try {
    const eventbridge = new AWS.EventBridge();
    const ruleName = `serenya-retry-${jobId}`;

    // Remove targets first
    await eventbridge.removeTargets({
      Rule: ruleName,
      Ids: ['1'],
    }).promise();

    // Delete rule
    await eventbridge.deleteRule({
      Name: ruleName,
    }).promise();

    console.log(`Cleaned up retry schedule for job ${jobId}`);
  } catch (error) {
    // Ignore cleanup errors - rules will expire naturally
    console.log('Retry schedule cleanup error (non-critical):', error.message);
  }
}