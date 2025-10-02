/**
 * Unified Error Handling Service for Serenya Lambda Functions
 * Implements healthcare-specific error categorization and recovery strategies
 * Based on our-dev-rules.md standards
 */

// Error categories for medical applications
const ERROR_CATEGORIES = {
  TECHNICAL: 'technical',           // Server errors, network failures, timeouts
  VALIDATION: 'validation',         // Input validation, data format errors
  BUSINESS: 'business',            // Business logic violations, access control
  EXTERNAL: 'external'             // Third-party service failures (OAuth, Bedrock)
};

// Recovery strategies for each error type
const RECOVERY_STRATEGIES = {
  RETRY: 'retry',                  // Automatic retry with backoff
  FALLBACK: 'fallback',           // Use cached/alternative data
  ESCALATE: 'escalate',           // Manual intervention required
  IGNORE: 'ignore'                // Log but continue processing
};

// Circuit breaker states for external services
const CIRCUIT_BREAKER_STATES = {
  CLOSED: 'closed',               // Normal operation
  OPEN: 'open',                   // Failing fast
  HALF_OPEN: 'half_open'          // Testing recovery
};

// Healthcare-appropriate error messages (8-12 words, "we" language)
const HEALTHCARE_ERROR_MESSAGES = {
  // Authentication & Authorization (Layer 2)
  INVALID_TOKEN: "We're having trouble verifying your account. Please sign in again",
  MISSING_AUTH: "We need you to sign in first. Let's get started", 
  TOKEN_EXPIRED: "Your session expired for security. Please sign in again",
  INSUFFICIENT_PERMISSIONS: "We can't access that for you. Please check permissions",
  
  // Validation Errors (Layer 2)
  INVALID_JSON: "We received invalid data. Please check your request format",
  MISSING_REQUIRED_FIELD: "We're missing some required information. Please complete all fields",
  INVALID_FILE_TYPE: "We only support PDF and image files. Please try another",
  FILE_TOO_LARGE: "That file is too large for us. Please use smaller files",
  
  // Processing Errors (Layer 2)
  PROCESSING_FAILED: "We couldn't process your document right now. Let's try again",
  AI_SERVICE_UNAVAILABLE: "Our analysis service is temporarily down. Please try shortly",
  DOCUMENT_ANALYSIS_FAILED: "We had trouble analyzing your document. Please try again",
  
  // Database & Storage (Layer 2)
  USER_NOT_FOUND: "We couldn't find your account. Please check your sign-in",
  DATA_NOT_FOUND: "We couldn't find that information. Please check your request",
  STORAGE_ERROR: "We're having trouble saving your data. Please try again",
  
  // External Services (Layer 2)
  OAUTH_VERIFICATION_FAILED: "We couldn't verify your account with your provider. Try again",
  BEDROCK_TIMEOUT: "Our analysis service is running slow. Please try again",
  S3_UPLOAD_FAILED: "We couldn't save your file. Please try uploading again",
  
  // Premium Features (Layer 2)
  PREMIUM_REQUIRED: "That feature requires a premium subscription. Would you like to upgrade",
  SUBSCRIPTION_EXPIRED: "Your premium subscription expired. Please renew to continue",
  USAGE_LIMIT_EXCEEDED: "You've reached your monthly limit. Upgrade for more access",
  
  // Generic Fallbacks (Layer 2)
  INTERNAL_ERROR: "Something unexpected happened on our end. Please try again",
  SERVICE_UNAVAILABLE: "We're temporarily down for maintenance. Please try shortly",
  RATE_LIMITED: "Too many requests right now. Please wait a moment"
};

/**
 * Main Error Handling Service Class
 */
class ErrorHandlingService {
  constructor() {
    this.startTime = Date.now();
    this.circuitBreakers = new Map();
  }

  /**
   * Layer 1 - Server Error Processing
   * Categorize error and determine recovery strategy
   */
  categorizeError(error, context = {}) {
    const startCategorization = process.hrtime.bigint();
    
    try {
      const category = this._determineErrorCategory(error, context);
      const recoveryStrategy = this._getRecoveryStrategy(category, error, context);
      const circuitBreakerStatus = this._getCircuitBreakerStatus(context.service);
      
      const categorization = {
        category,
        recovery_strategy: recoveryStrategy,
        circuit_breaker_status: circuitBreakerStatus,
        error_code: this._generateErrorCode(error, context),
        correlation_id: context.correlation_id || this._generateCorrelationId(),
        categorization_time_ns: Number(process.hrtime.bigint() - startCategorization),
        timestamp: new Date().toISOString()
      };

      // Performance requirement: <5ms categorization
      const categorizationTimeMs = categorization.categorization_time_ns / 1_000_000;
      if (categorizationTimeMs > 5) {
        console.warn(`Error categorization took ${categorizationTimeMs}ms (>5ms requirement)`);
      }

      return categorization;
      
    } catch (categorizationError) {
      console.error('Error categorization failed:', categorizationError);
      return {
        category: ERROR_CATEGORIES.TECHNICAL,
        recovery_strategy: RECOVERY_STRATEGIES.ESCALATE,
        circuit_breaker_status: CIRCUIT_BREAKER_STATES.CLOSED,
        error_code: 'CATEGORIZATION_FAILED',
        correlation_id: context.correlation_id || this._generateCorrelationId(),
        categorization_time_ns: Number(process.hrtime.bigint() - startCategorization),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Layer 2 - Client Error Translation  
   * Create UnifiedError for API responses
   */
  createUnifiedError(error, context = {}) {
    const categorization = this.categorizeError(error, context);
    
    const unifiedError = {
      category: categorization.category,
      recoveryStrategy: categorization.recovery_strategy,
      errorCode: categorization.error_code,
      userMessage: this._getHealthcareErrorMessage(categorization.error_code),
      technicalMessage: error.message || 'Unknown error',
      fallbackAvailable: this._hasFallback(categorization.recovery_strategy),
      retryAfter: this._getRetryDelay(categorization.recovery_strategy),
      correlationId: categorization.correlation_id,
      timestamp: categorization.timestamp,
      context: {
        service: context.service,
        operation: context.operation,
        userId: context.userId
      }
    };

    return unifiedError;
  }

  /**
   * Layer 3 - User Experience
   * Create healthcare-appropriate error response
   */
  createErrorResponse(statusCode, errorCodeOrMessage, technicalDetails = null, userMessage = null) {
    // Handle both old (3-param) and new (4-param) signatures
    let errorCode, message, details, userMsg;
    
    if (userMessage !== null) {
      // New 4-parameter signature: (statusCode, errorCode, technicalDetails, userMessage)
      errorCode = errorCodeOrMessage;
      message = technicalDetails;
      details = null;
      userMsg = userMessage;
    } else {
      // Old 3-parameter signature: (statusCode, message, details)
      errorCode = 'GENERIC_ERROR';
      message = errorCodeOrMessage;
      details = technicalDetails;
      userMsg = this._getHealthcareErrorMessage(errorCode);
    }

    const body = {
      error: true,
      code: errorCode,
      message: userMsg || this._getHealthcareErrorMessage(errorCode),
      technical_message: message,
      correlation_id: this._generateCorrelationId(),
      timestamp: new Date().toISOString(),
      support_info: {
        contact: "For immediate help, contact support with your correlation ID",
        privacy: "We never share your health information"
      }
    };
    
    // Include technical details only in development
    if (details && process.env.ENABLE_DETAILED_LOGGING === 'true') {
      body.technical_details = details;
    }

    return this._createResponse(statusCode, body);
  }

  /**
   * Circuit Breaker Management
   */
  updateCircuitBreaker(service, isSuccess) {
    if (!this.circuitBreakers.has(service)) {
      this.circuitBreakers.set(service, {
        state: CIRCUIT_BREAKER_STATES.CLOSED,
        failures: 0,
        successes: 0,
        lastFailure: null,
        lastSuccess: null
      });
    }

    const breaker = this.circuitBreakers.get(service);
    const now = Date.now();

    if (isSuccess) {
      breaker.successes++;
      breaker.lastSuccess = now;
      
      // Reset if we're recovering
      if (breaker.state === CIRCUIT_BREAKER_STATES.HALF_OPEN && breaker.successes >= 3) {
        breaker.state = CIRCUIT_BREAKER_STATES.CLOSED;
        breaker.failures = 0;
      }
    } else {
      breaker.failures++;
      breaker.lastFailure = now;
      
      // Open circuit after 5 failures
      if (breaker.failures >= 5 && breaker.state === CIRCUIT_BREAKER_STATES.CLOSED) {
        breaker.state = CIRCUIT_BREAKER_STATES.OPEN;
      }
      
      // Try half-open after 30 seconds
      if (breaker.state === CIRCUIT_BREAKER_STATES.OPEN && 
          now - breaker.lastFailure > 30000) {
        breaker.state = CIRCUIT_BREAKER_STATES.HALF_OPEN;
        breaker.successes = 0;
      }
    }

    return breaker.state;
  }

  // Private helper methods
  _determineErrorCategory(error, context) {
    // OAuth and authentication errors
    if (error.message?.includes('token') || error.message?.includes('auth') || 
        context.operation?.includes('auth') || context.service === 'oauth') {
      return ERROR_CATEGORIES.BUSINESS;
    }
    
    // Validation errors
    if (error.message?.includes('validation') || error.message?.includes('invalid') ||
        error.message?.includes('required') || error.message?.includes('format')) {
      return ERROR_CATEGORIES.VALIDATION;
    }
    
    // External service errors
    if (context.service === 'bedrock' || context.service === 'oauth' || 
        context.service === 's3' || error.message?.includes('timeout')) {
      return ERROR_CATEGORIES.EXTERNAL;
    }
    
    // Default to technical
    return ERROR_CATEGORIES.TECHNICAL;
  }

  _getRecoveryStrategy(category, error, context) {
    switch (category) {
      case ERROR_CATEGORIES.EXTERNAL:
        // External services should be retried with circuit breaker
        return RECOVERY_STRATEGIES.RETRY;
        
      case ERROR_CATEGORIES.VALIDATION:
        // Validation errors need user correction
        return RECOVERY_STRATEGIES.ESCALATE;
        
      case ERROR_CATEGORIES.BUSINESS:
        // Business logic errors usually need escalation
        return RECOVERY_STRATEGIES.ESCALATE;
        
      case ERROR_CATEGORIES.TECHNICAL:
      default:
        // Technical errors can be retried
        return RECOVERY_STRATEGIES.RETRY;
    }
  }

  _getCircuitBreakerStatus(service) {
    if (!service) return CIRCUIT_BREAKER_STATES.CLOSED;
    
    const breaker = this.circuitBreakers.get(service);
    return breaker ? breaker.state : CIRCUIT_BREAKER_STATES.CLOSED;
  }

  _generateErrorCode(error, context) {
    // Generate specific error codes based on context
    if (error.message?.includes('token')) return 'INVALID_TOKEN';
    if (error.message?.includes('not found')) return 'NOT_FOUND';
    if (error.message?.includes('timeout')) return 'TIMEOUT';
    if (error.message?.includes('validation')) return 'VALIDATION_ERROR';
    if (context.service === 'bedrock') return 'AI_SERVICE_ERROR';
    if (context.service === 'oauth') return 'OAUTH_ERROR';
    
    return 'INTERNAL_ERROR';
  }

  _getHealthcareErrorMessage(errorCode) {
    return HEALTHCARE_ERROR_MESSAGES[errorCode] || HEALTHCARE_ERROR_MESSAGES.INTERNAL_ERROR;
  }

  _hasFallback(recoveryStrategy) {
    return recoveryStrategy === RECOVERY_STRATEGIES.FALLBACK;
  }

  _getRetryDelay(recoveryStrategy) {
    if (recoveryStrategy === RECOVERY_STRATEGIES.RETRY) {
      return 1000; // 1 second initial retry delay
    }
    return null;
  }

  _generateCorrelationId() {
    const { v4: uuidv4 } = require('uuid');
    return `serenya-${uuidv4().substring(0, 8)}`;
  }

  _createResponse(statusCode, body) {
    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Correlation-ID': body.correlation_id
      },
      body: JSON.stringify(body)
    };
  }
}

// Export singleton instance and constants
const errorHandlingService = new ErrorHandlingService();

module.exports = {
  ErrorHandlingService,
  errorHandlingService,
  ERROR_CATEGORIES,
  RECOVERY_STRATEGIES,
  CIRCUIT_BREAKER_STATES,
  HEALTHCARE_ERROR_MESSAGES
};