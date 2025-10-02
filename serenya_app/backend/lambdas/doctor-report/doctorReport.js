const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  sanitizeError,
  generateJobId,
  withRetry,
  s3,
  categorizeError,
  createUnifiedError,
  ERROR_CATEGORIES
} = require('../shared/utils');
const { auditService } = require('../shared/audit-service');
const { bedrockService } = require('../shared/bedrock-service');
const { DynamoDBUserService } = require('../shared/dynamodb-service');
const { ObservabilityService } = require('../shared/observability-service');
const { v4: uuidv4 } = require('uuid');
const { isPremiumSubscription } = require('../shared/subscription-constants');
const crypto = require('crypto');

/**
 * Premium Doctor Report Generation using AWS Bedrock Claude
 * POST /api/v1/process/doctor-report
 */
exports.handler = async (event) => {
  const startTime = Date.now();
  const observability = ObservabilityService.createForFunction('doctor-report', event);
  let userId = 'unknown';

  try {
    userId = getUserIdFromEvent(event);

    if (!userId) {
      const unifiedError = createUnifiedError(new Error('Missing authentication'), {
        service: 'doctor_report',
        operation: 'authentication',
        category: ERROR_CATEGORIES.BUSINESS
      });
      
      await auditService.logAuditEvent({
        eventType: 'access_control',
        eventSubtype: 'unauthenticated_doctor_report_attempt',
        userId: 'unauthenticated',
        eventDetails: {
          correlationId: unifiedError.correlationId
        },
        dataClassification: 'security_event'
      }).catch(() => {}); // Don't fail on audit failure
      
      return createErrorResponse(401, 'MISSING_AUTHENTICATION', 'Invalid or missing authentication', 'Please sign in to generate doctor reports');
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      const unifiedError = createUnifiedError(parseError, {
        service: 'doctor_report',
        operation: 'request_parsing',
        userId: userId,
        category: ERROR_CATEGORIES.VALIDATION
      });
      
      await auditService.logAuditEvent({
        eventType: 'validation',
        eventSubtype: 'invalid_json_doctor_report',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId,
          error: 'Invalid JSON in request body'
        },
        dataClassification: 'validation_error'
      }).catch(() => {});
      
      return createErrorResponse(400, 'INVALID_JSON', 'Invalid JSON in request body', 'Please provide valid JSON data');
    }

    const { 
      report_type = 'medical_summary',
      health_data
    } = body;

    // Validate health data
    if (!health_data) {
      const unifiedError = createUnifiedError(new Error('Missing health data'), {
        service: 'doctor_report',
        operation: 'input_validation',
        userId: userId,
        category: ERROR_CATEGORIES.VALIDATION
      });
      
      await auditService.logAuditEvent({
        eventType: 'validation',
        eventSubtype: 'missing_health_data',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId,
          reportType: report_type
        },
        dataClassification: 'validation_error'
      }).catch(() => {});
      
      return createErrorResponse(400, 'MISSING_HEALTH_DATA', 'Missing health_data', 'Please provide health data for report generation');
    }

    // Enhanced audit logging
    await auditService.logAuditEvent({
      eventType: 'premium_feature',
      eventSubtype: 'health_data_report_request',
      userId: userId,
      eventDetails: {
        reportType: report_type
      },
      dataClassification: 'medical_phi'
    });

    // Check user's premium status with enhanced error handling
    let isPremiumUser;
    try {
      isPremiumUser = await checkPremiumStatus(userId);
    } catch (premiumCheckError) {
      const unifiedError = createUnifiedError(premiumCheckError, {
        service: 'doctor_report',
        operation: 'premium_status_check',
        userId: userId,
        category: ERROR_CATEGORIES.TECHNICAL
      });
      
      await auditService.logAuditEvent({
        eventType: 'subscription',
        eventSubtype: 'premium_check_error',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId,
          error: sanitizeError(premiumCheckError).message?.substring(0, 100)
        },
        dataClassification: 'system_error'
      }).catch(() => {});
      
      return createErrorResponse(500, 'SUBSCRIPTION_CHECK_FAILED', 'Failed to verify subscription status', 'We had trouble checking your subscription. Please try again');
    }
    
    if (!isPremiumUser) {
      const unifiedError = createUnifiedError(new Error('Premium subscription required'), {
        service: 'doctor_report',
        operation: 'premium_access_check',
        userId: userId,
        category: ERROR_CATEGORIES.BUSINESS
      });
      
      await auditService.logAuditEvent({
        eventType: 'access_control',
        eventSubtype: 'premium_feature_access_denied',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId,
          feature: 'doctor_report',
          reportType: report_type
        },
        dataClassification: 'business_logic'
      }).catch(() => {});
      
      return createErrorResponse(403, 'PREMIUM_REQUIRED', 'Premium subscription required for doctor reports', 'Upgrade to premium to generate professional medical reports');
    }

    // Health Data Report Flow - Store request and queue for async processing
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const jobId = `report_${userId}_${timestamp}_${randomString}`;
    
    // Store health data report request in S3 for processing
    const reportRequestData = {
      job_id: jobId,
      user_id: userId,
      health_data: health_data,
      report_type: report_type,
      request_type: 'health_data_report',
      created_at: new Date().toISOString()
    };

    const s3Key = `incoming/${jobId}`;
    
    const uploadParams = {
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key,
      Body: JSON.stringify(reportRequestData),
      ContentType: 'application/json',
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: process.env.KMS_KEY_ID,
      Metadata: {
        'job-id': jobId,
        'user-id': userId,
        'request-type': 'health_data_report',
        'upload-timestamp': Date.now().toString()
      },
      Tagging: 'Classification=PHI-Temporary&AutoDelete=true'
    };

    try {
      await withRetry(
        () => s3.upload(uploadParams).promise(),
        3,
        1000,
        `S3 upload for health data report job ${jobId}`
      );
    } catch (s3UploadError) {
      const unifiedError = createUnifiedError(s3UploadError, {
        service: 'doctor_report',
        operation: 's3_upload',
        userId: userId,
        category: ERROR_CATEGORIES.EXTERNAL
      });
      
      await auditService.logAuditEvent({
        eventType: 'storage',
        eventSubtype: 'doctor_report_upload_failed',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId,
          jobId: jobId,
          error: sanitizeError(s3UploadError).message?.substring(0, 100)
        },
        dataClassification: 'system_error'
      }).catch(() => {});
      
      throw s3UploadError; // Let main catch block handle this
    }

    // Enhanced processing queued audit
    await auditService.logAuditEvent({
      eventType: 'premium_feature',
      eventSubtype: 'health_data_report_queued',
      userId: userId,
      eventDetails: {
        jobId: jobId,
        reportType: report_type,
        healthDataSizeKB: Math.round(JSON.stringify(health_data).length / 1024)
      },
      dataClassification: 'medical_phi'
    });

    // Track AI processing for report generation
    await observability.trackAIProcessing(userId, 'bedrock', 'claude-3-sonnet', 'doctor_report', {
      reportType: report_type,
      jobId: jobId
    });

    // Track user journey for premium report generation
    await observability.trackUserJourney(userId, 'doctor_report_requested', {
      reportType: report_type,
      jobId: jobId
    });

    // Track subscription usage (premium feature)
    await observability.trackSubscription(userId, 'doctor_report_generated', {
      reportType: report_type,
      jobId: jobId
    });

    // Return immediate response with job ID for polling
    return createResponse(202, {
      success: true,
      job_id: jobId,
      estimated_completion_seconds: 30,
      message: 'Health data report request queued for processing'
    });

  } catch (error) {
    console.error('Doctor report error:', sanitizeError(error));

    await observability.trackError(error, 'doctor_report', userId);

    // Enhanced error categorization and handling
    const errorContext = {
      service: 'doctor_report',
      operation: 'request_processing',
      userId: userId
    };
    const unifiedError = createUnifiedError(error, errorContext);

    await auditService.logAuditEvent({
      eventType: 'premium_feature',
      eventSubtype: 'doctor_report_error',
      userId: userId,
      eventDetails: {
        correlationId: unifiedError.correlationId,
        errorCategory: unifiedError.category,
        recoveryStrategy: unifiedError.recoveryStrategy,
        error: sanitizeError(error).message?.substring(0, 100) || 'Unknown error'
      },
      dataClassification: 'system_error'
    }).catch(() => {}); // Don't fail on audit failure

    // Use categorized error response
    if (unifiedError.category === ERROR_CATEGORIES.VALIDATION) {
      return createErrorResponse(400, 'VALIDATION_ERROR', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.BUSINESS) {
      return createErrorResponse(403, 'ACCESS_DENIED', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.EXTERNAL) {
      return createErrorResponse(503, 'SERVICE_UNAVAILABLE', 'External service failure', 'Our report service is temporarily unavailable. Please try again shortly');
    } else {
      return createErrorResponse(500, 'REPORT_GENERATION_FAILED', 'Failed to generate doctor report', 'We had trouble generating your medical report. Please try again');
    }
  }
};


/**
 * Check premium subscription status
 */
async function checkPremiumStatus(userId) {
  try {
    const userService = new DynamoDBUserService();
    
    // Get user profile with subscription data with retry logic
    const userProfile = await withRetry(
      () => userService.getUserProfile(userId),
      3,
      1000,
      `DynamoDB getUserProfile for premium check ${userId}`
    );
    
    if (!userProfile) {
      console.log('User profile not found for premium check:', userId);
      return false;
    }
    
    // Check subscription status
    const subscription = userProfile.current_subscription;
    if (!subscription) {
      // No subscription = free tier = no premium access
      return false;
    }
    
    // Check if user has active premium subscription using subscription constants
    const isPremium = isPremiumSubscription(subscription.type) && subscription.status === 'active';
    
    console.log(`Premium status check for user ${userId}: ${isPremium ? 'Premium' : 'Free'}`);
    
    // For now, also allow first free report for demo purposes
    if (!isPremium) {
      try {
        const reportCount = await getUserReportCount(userId);
        return reportCount < 1; // First report is free
      } catch (reportCountError) {
        console.error('Error getting report count, defaulting to no premium access:', reportCountError);
        return false;
      }
    }
    
    return isPremium;
    
  } catch (error) {
    console.error('Premium status check error:', sanitizeError(error));
    
    // Categorize the error for better handling
    const errorContext = {
      service: 'doctor_report',
      operation: 'premium_status_check',
      userId: userId,
      category: ERROR_CATEGORIES.TECHNICAL
    };
    const categorization = categorizeError(error, errorContext);
    
    console.error(`Premium check failed - Category: ${categorization.category}, Recovery: ${categorization.recovery_strategy}`);
    
    // Don't allow premium access if we can't verify subscription
    // This is a security-first approach for medical applications
    throw error;
  }
}

/**
 * Get user's report generation count for current month
 */
async function getUserReportCount(userId) {
  try {
    // This would be implemented with proper subscription tracking
    // For now, return 0 to allow report generation
    const currentMonth = new Date().toISOString().substring(0, 7);
    
    // Query from report generation tracking (would be implemented in DocumentJobService)
    // const reportCount = await DocumentJobService.getMonthlyReportCount(userId, currentMonth);
    
    return 0; // Allow reports for demo
  } catch (error) {
    console.error('Error getting report count:', error);
    return 0;
  }
}

