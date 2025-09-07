const { v4: uuidv4 } = require('uuid');

/**
 * Structured logging utility for Serenya Lambda functions
 * Provides correlation IDs, structured JSON logs, and CloudWatch integration
 */

class StructuredLogger {
  constructor(functionName, correlationId = null) {
    this.functionName = functionName;
    this.correlationId = correlationId || uuidv4();
    this.startTime = Date.now();
  }

  /**
   * Create correlation ID from API Gateway request
   */
  static createCorrelationId(event) {
    return event?.requestContext?.requestId || uuidv4();
  }

  /**
   * Base log method with structured format
   */
  _log(level, message, data = {}, error = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      correlationId: this.correlationId,
      functionName: this.functionName,
      message,
      ...data
    };

    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error.code && { code: error.code })
      };
    }

    // Add performance metrics for function execution
    if (level === 'info' && data.event === 'function_complete') {
      logEntry.performance = {
        durationMs: Date.now() - this.startTime,
        coldStart: !process.env.AWS_LAMBDA_WARM_CONTAINER
      };
    }

    console.log(JSON.stringify(logEntry));
  }

  info(message, data = {}) {
    this._log('info', message, data);
  }

  warn(message, data = {}) {
    this._log('warn', message, data);
  }

  error(message, data = {}, error = null) {
    this._log('error', message, data, error);
  }

  debug(message, data = {}) {
    if (process.env.ENABLE_DETAILED_LOGGING === 'true') {
      this._log('debug', message, data);
    }
  }

  /**
   * Log business events for monitoring
   */
  businessEvent(event, data = {}) {
    this._log('info', `Business event: ${event}`, {
      event: event,
      category: 'business',
      ...data
    });
  }

  /**
   * Log security events for monitoring
   */
  securityEvent(event, userId = null, data = {}) {
    this._log('info', `Security event: ${event}`, {
      event: event,
      category: 'security',
      userId,
      ...data
    });
  }

  /**
   * Log performance metrics
   */
  performanceMetric(metricName, value, unit = 'Milliseconds', data = {}) {
    this._log('info', `Performance metric: ${metricName}`, {
      event: 'performance_metric',
      category: 'performance',
      metric: {
        name: metricName,
        value,
        unit
      },
      ...data
    });
  }

  /**
   * Log custom CloudWatch metrics
   */
  customMetric(namespace, metricName, value, unit = 'Count', dimensions = {}) {
    const metric = {
      event: 'custom_metric',
      category: 'metrics',
      metric: {
        namespace,
        name: metricName,
        value,
        unit,
        dimensions
      }
    };
    
    this._log('info', `Custom metric: ${namespace}/${metricName}`, metric);
  }

  /**
   * Log API request start
   */
  requestStart(httpMethod, path, data = {}) {
    this.info('API request started', {
      event: 'request_start',
      httpMethod,
      path,
      ...data
    });
  }

  /**
   * Log API request completion
   */
  requestComplete(statusCode, data = {}) {
    this.info('API request completed', {
      event: 'request_complete',
      statusCode,
      durationMs: Date.now() - this.startTime,
      ...data
    });
  }

  /**
   * Log authentication events
   */
  authEvent(event, userId = null, data = {}) {
    this.securityEvent(`auth_${event}`, userId, data);
    
    // Also log to business metrics for conversion tracking
    if (event === 'success') {
      this.businessEvent('user_authenticated', { userId });
    }
  }

  /**
   * Log processing events
   */
  processingEvent(event, jobId, data = {}) {
    this.businessEvent(`processing_${event}`, {
      jobId,
      ...data
    });

    // Track processing metrics
    if (event === 'started') {
      this.customMetric('Serenya/Business', 'ProcessingStarted', 1, 'Count', {
        Environment: process.env.ENVIRONMENT
      });
    } else if (event === 'complete') {
      const duration = data.durationMs || (Date.now() - this.startTime);
      this.customMetric('Serenya/Business', 'ProcessingSuccess', 1, 'Count', {
        Environment: process.env.ENVIRONMENT
      });
      this.customMetric('Serenya/Business', 'ProcessingDuration', duration, 'Milliseconds', {
        Environment: process.env.ENVIRONMENT
      });
    } else if (event === 'failed') {
      this.customMetric('Serenya/Business', 'ProcessingFailure', 1, 'Count', {
        Environment: process.env.ENVIRONMENT
      });
    }
  }

  /**
   * Log data access events for compliance
   */
  dataAccessEvent(event, userId, resourceType, data = {}) {
    this.securityEvent(`data_${event}`, userId, {
      resourceType,
      ...data
    });

    // Track for security monitoring
    this.customMetric('Serenya/Security', 'DataAccessAttempts', 1, 'Count', {
      Environment: process.env.ENVIRONMENT,
      Resource: resourceType
    });
  }

  /**
   * Log encryption/decryption events
   */
  encryptionEvent(operation, durationMs, data = {}) {
    this.performanceMetric(`${operation}Duration`, durationMs, 'Milliseconds');
    
    this.customMetric('Serenya/Security', 'EncryptionOperations', 1, 'Count', {
      Environment: process.env.ENVIRONMENT,
      Operation: operation
    });

    this.securityEvent(`phi_${operation}`, null, {
      durationMs,
      ...data
    });
  }

  /**
   * Log cost-related events
   */
  costEvent(service, operation, estimatedCost, data = {}) {
    this.info(`Cost event: ${service} ${operation}`, {
      event: 'cost_tracking',
      category: 'cost',
      service,
      operation,
      estimatedCost,
      ...data
    });

    // Track Bedrock usage specifically
    if (service === 'bedrock') {
      this.customMetric('Serenya/Cost', 'BedrockCostEstimate', estimatedCost, 'None', {
        Environment: process.env.ENVIRONMENT
      });
    }
  }

  /**
   * Log error with categorization per dev rules
   */
  categorizedError(error, category = 'server', userId = null, data = {}) {
    const errorCategories = {
      server: 'Internal server error - investigate infrastructure',
      client: 'Client error - invalid request or data',
      user: 'User error - education or UX improvement needed'
    };

    this.error(errorCategories[category], {
      category,
      errorType: error.name,
      userId,
      ...data
    }, error);

    // Track error patterns
    this.customMetric('Serenya/Errors', 'ErrorByCategory', 1, 'Count', {
      Environment: process.env.ENVIRONMENT,
      Category: category,
      ErrorType: error.name
    });
  }
}

/**
 * Create logger instance for Lambda function
 */
function createLogger(functionName, event = null) {
  const correlationId = event ? StructuredLogger.createCorrelationId(event) : null;
  return new StructuredLogger(functionName, correlationId);
}

/**
 * Lambda wrapper that adds structured logging to any handler
 */
function withStructuredLogging(functionName, handler) {
  return async (event, context) => {
    const logger = createLogger(functionName, event);
    
    try {
      // Add logger to context for access in handler
      context.logger = logger;
      
      // Log function start
      logger.info('Function execution started', {
        event: 'function_start',
        functionVersion: context.functionVersion,
        remainingTimeMs: context.getRemainingTimeInMillis()
      });

      // Execute handler
      const result = await handler(event, context, logger);
      
      // Log successful completion
      logger.info('Function execution completed', {
        event: 'function_complete',
        success: true
      });
      
      return result;
    } catch (error) {
      // Log error
      logger.categorizedError(error, 'server', null, {
        event: 'function_error',
        functionVersion: context.functionVersion,
        remainingTimeMs: context.getRemainingTimeInMillis()
      });
      
      throw error;
    }
  };
}

module.exports = {
  StructuredLogger,
  createLogger,
  withStructuredLogging
};