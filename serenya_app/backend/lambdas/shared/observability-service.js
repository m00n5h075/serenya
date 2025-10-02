const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

/**
 * Comprehensive Observability Service for Serenya DynamoDB-Native Architecture
 * Implements CloudWatch Custom Metrics, S3-based Event Logging, and Business Intelligence
 */

class ObservabilityService {
  constructor() {
    this.cloudwatch = new AWS.CloudWatch({ region: process.env.AWS_REGION || 'eu-west-1' });
    this.s3 = new AWS.S3({ region: process.env.AWS_REGION || 'eu-west-1' });
    this.eventsBucket = process.env.EVENTS_BUCKET || `serenya-events-${process.env.ENVIRONMENT}`;
    this.environment = process.env.ENVIRONMENT || 'dev';
    
    // Performance tracking
    this.startTime = Date.now();
    this.correlationId = uuidv4();
  }

  /**
   * Initialize observability for a Lambda function
   */
  static createForFunction(functionName, event = null) {
    const service = new ObservabilityService();
    service.functionName = functionName;
    service.correlationId = event?.requestContext?.requestId || service.correlationId;
    return service;
  }

  /**
   * Core CloudWatch Custom Metrics Publisher
   */
  async publishMetric(metricName, value, unit = 'Count', dimensions = {}, namespace = 'Serenya') {
    const metricData = [{
      MetricName: metricName,
      Value: value,
      Unit: unit,
      Dimensions: Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value: String(Value) })),
      Timestamp: new Date()
    }];

    try {
      await this.cloudwatch.putMetricData({
        Namespace: namespace,
        MetricData: metricData
      }).promise();
    } catch (error) {
      console.error('Failed to publish metric:', { metricName, error: error.message });
      // Don't throw - observability failures shouldn't break business logic
    }
  }

  /**
   * S3-based Event Logging for Long-term Analytics
   */
  async logEvent(eventType, userId, eventData = {}) {
    const event = {
      timestamp: new Date().toISOString(),
      eventType,
      userId,
      functionName: this.functionName,
      correlationId: this.correlationId,
      environment: this.environment,
      eventData
    };

    const key = `events/${new Date().toISOString().slice(0, 10)}/${eventType}/${this.correlationId}.json`;

    try {
      await this.s3.putObject({
        Bucket: this.eventsBucket,
        Key: key,
        Body: JSON.stringify(event),
        ServerSideEncryption: 'AES256',
        ContentType: 'application/json'
      }).promise();
    } catch (error) {
      console.error('Failed to log event to S3:', { eventType, error: error.message });
    }
  }

  // ===== USER EXPERIENCE METRICS =====

  /**
   * Track authentication events
   */
  async trackAuthentication(success, provider = 'unknown', deviceType = 'unknown', userId = null) {
    await Promise.all([
      this.publishMetric('LoginAttempts', 1, 'Count', {
        Environment: this.environment,
        Provider: provider,
        DeviceType: deviceType,
        Success: success
      }, 'Serenya/Auth'),
      
      this.logEvent('authentication', userId, {
        success,
        provider,
        deviceType,
        timestamp: new Date().toISOString()
      })
    ]);

    // Track success rate for alerting
    if (success) {
      await this.publishMetric('LoginSuccess', 1, 'Count', {
        Environment: this.environment,
        Provider: provider
      }, 'Serenya/Auth');
    }
  }

  /**
   * Track biometric authentication
   */
  async trackBiometricAuth(success, biometricType, attemptNumber = 1, userId = null) {
    await Promise.all([
      this.publishMetric('BiometricVerificationAttempts', 1, 'Count', {
        Environment: this.environment,
        BiometricType: biometricType,
        Success: success,
        AttemptNumber: attemptNumber
      }, 'Serenya/Auth'),
      
      this.logEvent('biometric_authentication', userId, {
        success,
        biometricType,
        attemptNumber,
        timestamp: new Date().toISOString()
      })
    ]);

    if (success) {
      await this.publishMetric('BiometricVerificationSuccess', 1, 'Count', {
        Environment: this.environment,
        BiometricType: biometricType
      }, 'Serenya/Auth');
    }
  }

  /**
   * Track user journey steps
   */
  async trackUserJourney(step, userId, metadata = {}) {
    await Promise.all([
      this.publishMetric('UserJourneyStep', 1, 'Count', {
        Environment: this.environment,
        Step: step,
        UserId: userId
      }, 'Serenya/Journey'),
      
      this.logEvent('user_journey', userId, {
        step,
        metadata,
        timestamp: new Date().toISOString()
      })
    ]);
  }

  /**
   * Track document upload events
   */
  async trackDocumentUpload(success, fileType, fileSizeMB, userId, processingTime = null) {
    const dimensions = {
      Environment: this.environment,
      FileType: fileType,
      FileSizeBucket: this.getFileSizeBucket(fileSizeMB),
      Success: success
    };

    await Promise.all([
      this.publishMetric('DocumentUploads', 1, 'Count', dimensions, 'Serenya/Upload'),
      
      this.logEvent('document_upload', userId, {
        success,
        fileType,
        fileSizeMB,
        processingTime,
        timestamp: new Date().toISOString()
      })
    ]);

    if (success) {
      await this.publishMetric('DocumentUploadSuccess', 1, 'Count', {
        Environment: this.environment,
        FileType: fileType
      }, 'Serenya/Upload');
    }

    if (processingTime) {
      await this.publishMetric('DocumentUploadDuration', processingTime, 'Milliseconds', {
        Environment: this.environment,
        FileType: fileType
      }, 'Serenya/Upload');
    }
  }

  // ===== SYSTEM PERFORMANCE METRICS =====

  /**
   * Track Lambda function performance
   */
  async trackLambdaPerformance(duration, memoryUsed, coldStart = false) {
    const dimensions = {
      Environment: this.environment,
      FunctionName: this.functionName,
      ColdStart: coldStart
    };

    await Promise.all([
      this.publishMetric('LambdaDuration', duration, 'Milliseconds', dimensions, 'Serenya/Performance'),
      this.publishMetric('LambdaMemoryUtilization', memoryUsed, 'Megabytes', dimensions, 'Serenya/Performance'),
      
      this.logEvent('lambda_performance', null, {
        functionName: this.functionName,
        duration,
        memoryUsed,
        coldStart,
        timestamp: new Date().toISOString()
      })
    ]);

    if (coldStart) {
      await this.publishMetric('LambdaColdStarts', 1, 'Count', {
        Environment: this.environment,
        FunctionName: this.functionName
      }, 'Serenya/Performance');
    }
  }

  /**
   * Track DynamoDB operations
   */
  async trackDynamoDBOperation(operation, tableName, success, durationMs, itemCount = 1) {
    const dimensions = {
      Environment: this.environment,
      TableName: tableName,
      Operation: operation,
      Success: success
    };

    await Promise.all([
      this.publishMetric('DynamoDBOperations', 1, 'Count', dimensions, 'Serenya/Database'),
      this.publishMetric('DynamoDBDuration', durationMs, 'Milliseconds', dimensions, 'Serenya/Database'),
      
      this.logEvent('dynamodb_operation', null, {
        operation,
        tableName,
        success,
        durationMs,
        itemCount,
        timestamp: new Date().toISOString()
      })
    ]);

    if (!success) {
      await this.publishMetric('DynamoDBErrors', 1, 'Count', {
        Environment: this.environment,
        TableName: tableName,
        Operation: operation
      }, 'Serenya/Database');
    }
  }

  /**
   * Track S3 operations
   */
  async trackS3Operation(operation, bucket, success, durationMs, objectSize = null) {
    const dimensions = {
      Environment: this.environment,
      Bucket: bucket,
      Operation: operation,
      Success: success
    };

    await Promise.all([
      this.publishMetric('S3Operations', 1, 'Count', dimensions, 'Serenya/Storage'),
      this.publishMetric('S3Duration', durationMs, 'Milliseconds', dimensions, 'Serenya/Storage'),
      
      this.logEvent('s3_operation', null, {
        operation,
        bucket,
        success,
        durationMs,
        objectSize,
        timestamp: new Date().toISOString()
      })
    ]);

    if (objectSize) {
      await this.publishMetric('S3ObjectSize', objectSize, 'Bytes', {
        Environment: this.environment,
        Operation: operation
      }, 'Serenya/Storage');
    }
  }

  // ===== BUSINESS INTELLIGENCE METRICS =====

  /**
   * Track subscription events
   */
  async trackSubscription(event, userId, subscriptionType = 'free', planDetails = {}) {
    await Promise.all([
      this.publishMetric('SubscriptionEvents', 1, 'Count', {
        Environment: this.environment,
        Event: event,
        SubscriptionType: subscriptionType
      }, 'Serenya/Business'),
      
      this.logEvent('subscription', userId, {
        event,
        subscriptionType,
        planDetails,
        timestamp: new Date().toISOString()
      })
    ]);

    // Track specific conversion events
    if (event === 'conversion') {
      await this.publishMetric('SubscriptionConversions', 1, 'Count', {
        Environment: this.environment,
        FromPlan: planDetails.fromPlan || 'free',
        ToPlan: subscriptionType
      }, 'Serenya/Business');
    }
  }

  /**
   * Track AI processing results
   */
  async trackAIProcessing(success, modelName, durationMs, tokenCount, confidenceScore = null, userId = null) {
    const dimensions = {
      Environment: this.environment,
      ModelName: modelName,
      Success: success
    };

    await Promise.all([
      this.publishMetric('AIProcessingAttempts', 1, 'Count', dimensions, 'Serenya/AI'),
      this.publishMetric('AIProcessingDuration', durationMs, 'Milliseconds', dimensions, 'Serenya/AI'),
      this.publishMetric('AITokensUsed', tokenCount, 'Count', dimensions, 'Serenya/AI'),
      
      this.logEvent('ai_processing', userId, {
        success,
        modelName,
        durationMs,
        tokenCount,
        confidenceScore,
        timestamp: new Date().toISOString()
      })
    ]);

    if (success) {
      await this.publishMetric('AIProcessingSuccess', 1, 'Count', dimensions, 'Serenya/AI');
      
      if (confidenceScore !== null) {
        await this.publishMetric('AIConfidenceScore', confidenceScore, 'Percent', dimensions, 'Serenya/AI');
      }
    }

    // Track cost estimation
    const estimatedCost = this.calculateBedrockCost(modelName, tokenCount);
    await this.publishMetric('AIProcessingCost', estimatedCost, 'None', {
      Environment: this.environment,
      ModelName: modelName
    }, 'Serenya/Cost');
  }

  // ===== SECURITY & COMPLIANCE METRICS =====

  /**
   * Track security events
   */
  async trackSecurityEvent(eventType, severity, userId = null, details = {}) {
    await Promise.all([
      this.publishMetric('SecurityEvents', 1, 'Count', {
        Environment: this.environment,
        EventType: eventType,
        Severity: severity
      }, 'Serenya/Security'),
      
      this.logEvent('security_event', userId, {
        eventType,
        severity,
        details,
        timestamp: new Date().toISOString()
      })
    ]);

    // High severity events get immediate alerting
    if (severity === 'high' || severity === 'critical') {
      await this.publishMetric('HighSeveritySecurityEvents', 1, 'Count', {
        Environment: this.environment,
        EventType: eventType
      }, 'Serenya/Security');
    }
  }

  /**
   * Track encryption operations
   */
  async trackEncryption(operation, durationMs, dataSize = null) {
    const dimensions = {
      Environment: this.environment,
      Operation: operation
    };

    await Promise.all([
      this.publishMetric('EncryptionOperations', 1, 'Count', dimensions, 'Serenya/Security'),
      this.publishMetric('EncryptionDuration', durationMs, 'Milliseconds', dimensions, 'Serenya/Security'),
      
      this.logEvent('encryption_operation', null, {
        operation,
        durationMs,
        dataSize,
        timestamp: new Date().toISOString()
      })
    ]);
  }

  /**
   * Track GDPR/compliance events
   */
  async trackComplianceEvent(eventType, userId, details = {}) {
    await Promise.all([
      this.publishMetric('ComplianceEvents', 1, 'Count', {
        Environment: this.environment,
        EventType: eventType
      }, 'Serenya/Compliance'),
      
      this.logEvent('compliance_event', userId, {
        eventType,
        details,
        timestamp: new Date().toISOString()
      })
    ]);
  }

  // ===== ERROR TRACKING =====

  /**
   * Track errors with categorization
   */
  async trackError(error, category, userId = null, context = {}) {
    const errorDetails = {
      name: error.name,
      message: error.message,
      category,
      context,
      functionName: this.functionName,
      correlationId: this.correlationId
    };

    await Promise.all([
      this.publishMetric('Errors', 1, 'Count', {
        Environment: this.environment,
        Category: category,
        ErrorType: error.name,
        FunctionName: this.functionName
      }, 'Serenya/Errors'),
      
      this.logEvent('error', userId, errorDetails)
    ]);
  }

  // ===== UTILITY METHODS =====

  /**
   * Categorize file size for metrics
   */
  getFileSizeBucket(sizeMB) {
    if (sizeMB < 1) return 'small';
    if (sizeMB < 10) return 'medium';
    if (sizeMB < 50) return 'large';
    return 'xlarge';
  }

  /**
   * Calculate estimated Bedrock cost
   */
  calculateBedrockCost(modelName, tokenCount) {
    const costPerTokenMap = {
      'claude-3-sonnet': 0.000003,
      'claude-3-haiku': 0.00000025,
      'claude-3-opus': 0.000015
    };
    
    const costPerToken = costPerTokenMap[modelName] || costPerTokenMap['claude-3-sonnet'];
    return tokenCount * costPerToken;
  }

  /**
   * Get function execution duration
   */
  getFunctionDuration() {
    return Date.now() - this.startTime;
  }

  /**
   * Wrapper for Lambda functions to automatically track performance
   */
  static withObservability(functionName, handler) {
    return async (event, context) => {
      const observability = ObservabilityService.createForFunction(functionName, event);
      const startTime = Date.now();
      
      try {
        // Add observability to context
        context.observability = observability;
        
        // Track function start
        await observability.logEvent('function_start', null, {
          functionVersion: context.functionVersion,
          remainingTimeMs: context.getRemainingTimeInMillis()
        });

        // Execute handler
        const result = await handler(event, context, observability);
        
        // Track successful completion
        const duration = Date.now() - startTime;
        await observability.trackLambdaPerformance(
          duration, 
          context.memoryLimitInMB, 
          !process.env.AWS_LAMBDA_WARM_CONTAINER
        );
        
        return result;
      } catch (error) {
        // Track error
        await observability.trackError(error, 'function_error', null, {
          functionName,
          event: event?.eventSource || 'unknown'
        });
        
        throw error;
      }
    };
  }
}

module.exports = {
  ObservabilityService
};