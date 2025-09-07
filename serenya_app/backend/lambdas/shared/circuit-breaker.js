const { createLogger } = require('./structured-logging');

/**
 * Circuit Breaker implementation for external service calls
 * Follows the dev rules for error handling and recovery
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 60000; // 60 seconds
    this.monitoringPeriod = options.monitoringPeriod || 120000; // 2 minutes
    this.expectedErrors = options.expectedErrors || [];
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
    this.requests = [];
    
    this.logger = createLogger('CircuitBreaker');
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn, context = {}) {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
        this.logger.info('Circuit breaker transitioning to HALF_OPEN', {
          context,
          failureCount: this.failureCount,
          lastFailureTime: this.lastFailureTime,
        });
      } else {
        const error = new CircuitBreakerOpenError(
          'Circuit breaker is OPEN',
          this.failureCount,
          this.lastFailureTime
        );
        this.logger.warn('Circuit breaker blocked request', { context, error: error.message });
        throw error;
      }
    }

    try {
      const result = await this.callWithTimeout(fn, context);
      this.onSuccess(context);
      return result;
    } catch (error) {
      this.onFailure(error, context);
      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  async callWithTimeout(fn, context, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new CircuitBreakerTimeoutError('Function call timed out', timeout));
      }, timeout);

      Promise.resolve(fn())
        .then(result => {
          clearTimeout(timeoutHandle);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutHandle);
          reject(error);
        });
    });
  }

  /**
   * Handle successful execution
   */
  onSuccess(context) {
    this.recordRequest(true);
    this.failureCount = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 3) { // Need 3 successes to close
        this.state = 'CLOSED';
        this.successCount = 0;
        this.logger.info('Circuit breaker reset to CLOSED', { context });
      }
    }
  }

  /**
   * Handle failed execution
   */
  onFailure(error, context) {
    this.recordRequest(false);
    
    // Don't count expected errors as circuit breaker failures
    if (this.isExpectedError(error)) {
      this.logger.debug('Expected error ignored by circuit breaker', {
        context,
        error: error.message,
        errorType: error.constructor.name,
      });
      return;
    }

    this.failureCount++;
    this.lastFailureTime = new Date();
    
    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.successCount = 0;
      this.logger.error('Circuit breaker opened due to failures', {
        context,
        failureCount: this.failureCount,
        error: error.message,
        errorType: error.constructor.name,
      });
    }
  }

  /**
   * Check if error is expected and shouldn't trip the circuit breaker
   */
  isExpectedError(error) {
    if (!error) return false;
    
    return this.expectedErrors.some(expectedError => {
      if (typeof expectedError === 'string') {
        return error.constructor.name === expectedError || error.message.includes(expectedError);
      }
      if (typeof expectedError === 'function') {
        return error instanceof expectedError;
      }
      return false;
    });
  }

  /**
   * Check if we should attempt to reset the circuit breaker
   */
  shouldAttemptReset() {
    return this.lastFailureTime && 
           (Date.now() - this.lastFailureTime.getTime()) >= this.recoveryTimeout;
  }

  /**
   * Record request for monitoring
   */
  recordRequest(success) {
    const now = Date.now();
    this.requests.push({ timestamp: now, success });
    
    // Clean old requests outside monitoring period
    this.requests = this.requests.filter(
      req => now - req.timestamp <= this.monitoringPeriod
    );
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics() {
    const now = Date.now();
    const recentRequests = this.requests.filter(
      req => now - req.timestamp <= this.monitoringPeriod
    );
    
    const totalRequests = recentRequests.length;
    const successfulRequests = recentRequests.filter(req => req.success).length;
    const failedRequests = totalRequests - successfulRequests;
    const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;
    
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      totalRequests,
      successfulRequests,
      failedRequests,
      successRate: Math.round(successRate * 100) / 100,
      monitoringPeriodMs: this.monitoringPeriod,
    };
  }

  /**
   * Force circuit breaker to specific state (for testing)
   */
  forceState(state) {
    this.state = state;
    if (state === 'CLOSED') {
      this.failureCount = 0;
      this.successCount = 0;
      this.lastFailureTime = null;
    }
  }
}

/**
 * Circuit breaker specific error types
 */
class CircuitBreakerOpenError extends Error {
  constructor(message, failureCount, lastFailureTime) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.failureCount = failureCount;
    this.lastFailureTime = lastFailureTime;
    this.retryAfter = 60; // seconds
  }
}

class CircuitBreakerTimeoutError extends Error {
  constructor(message, timeout) {
    super(message);
    this.name = 'CircuitBreakerTimeoutError';
    this.timeout = timeout;
  }
}

/**
 * Retry mechanism with exponential backoff
 */
class RetryHandler {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000; // 1 second
    this.maxDelay = options.maxDelay || 30000; // 30 seconds
    this.retryableErrors = options.retryableErrors || ['NetworkError', 'TimeoutError', 'ServiceUnavailable'];
    this.logger = createLogger('RetryHandler');
  }

  /**
   * Execute function with retry logic
   */
  async executeWithRetry(fn, context = {}) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.calculateDelay(attempt);
          this.logger.info('Retrying operation', {
            attempt,
            delay,
            context,
          });
          await this.sleep(delay);
        }
        
        const result = await fn();
        
        if (attempt > 0) {
          this.logger.info('Operation succeeded after retry', {
            attempt,
            context,
          });
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        if (!this.shouldRetry(error, attempt)) {
          this.logger.error('Operation failed, not retryable', {
            attempt,
            error: error.message,
            errorType: error.constructor.name,
            context,
          });
          break;
        }
        
        this.logger.warn('Operation failed, will retry', {
          attempt,
          error: error.message,
          errorType: error.constructor.name,
          context,
        });
      }
    }
    
    this.logger.error('Operation failed after all retries', {
      maxRetries: this.maxRetries,
      finalError: lastError.message,
      context,
    });
    
    throw lastError;
  }

  /**
   * Determine if error is retryable
   */
  shouldRetry(error, attempt) {
    if (attempt >= this.maxRetries) {
      return false;
    }
    
    if (error instanceof CircuitBreakerOpenError) {
      return false; // Don't retry if circuit breaker is open
    }
    
    return this.retryableErrors.some(retryableError => {
      if (typeof retryableError === 'string') {
        return error.constructor.name === retryableError || error.message.includes(retryableError);
      }
      if (typeof retryableError === 'function') {
        return error instanceof retryableError;
      }
      return false;
    });
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  calculateDelay(attempt) {
    const exponentialDelay = this.baseDelay * Math.pow(2, attempt - 1);
    const jitteredDelay = exponentialDelay * (0.5 + Math.random() * 0.5); // 50-100% jitter
    return Math.min(jitteredDelay, this.maxDelay);
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Health checker for external services
 */
class HealthChecker {
  constructor(options = {}) {
    this.services = new Map();
    this.checkInterval = options.checkInterval || 30000; // 30 seconds
    this.timeout = options.timeout || 5000; // 5 seconds
    this.logger = createLogger('HealthChecker');
  }

  /**
   * Register a service for health checking
   */
  registerService(name, healthCheckFn, options = {}) {
    this.services.set(name, {
      name,
      healthCheckFn,
      isHealthy: true,
      lastCheck: null,
      lastError: null,
      circuitBreaker: new CircuitBreaker({
        failureThreshold: options.failureThreshold || 3,
        recoveryTimeout: options.recoveryTimeout || 30000,
        expectedErrors: options.expectedErrors || [],
      }),
    });
    
    this.logger.info('Service registered for health checking', { serviceName: name });
  }

  /**
   * Check health of a specific service
   */
  async checkServiceHealth(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not registered`);
    }

    try {
      await service.circuitBreaker.execute(() => service.healthCheckFn());
      service.isHealthy = true;
      service.lastCheck = new Date();
      service.lastError = null;
      
      this.logger.debug('Service health check passed', { serviceName });
      return true;
    } catch (error) {
      service.isHealthy = false;
      service.lastCheck = new Date();
      service.lastError = error.message;
      
      this.logger.error('Service health check failed', {
        serviceName,
        error: error.message,
        circuitBreakerState: service.circuitBreaker.state,
      });
      return false;
    }
  }

  /**
   * Get health status of all services
   */
  getHealthStatus() {
    const status = {
      overall: 'healthy',
      services: {},
      timestamp: new Date().toISOString(),
    };

    let hasUnhealthyService = false;
    
    for (const [name, service] of this.services) {
      const serviceStatus = {
        healthy: service.isHealthy,
        lastCheck: service.lastCheck?.toISOString(),
        lastError: service.lastError,
        circuitBreaker: service.circuitBreaker.getMetrics(),
      };
      
      status.services[name] = serviceStatus;
      
      if (!service.isHealthy) {
        hasUnhealthyService = true;
      }
    }
    
    if (hasUnhealthyService) {
      status.overall = 'degraded';
    }
    
    return status;
  }

  /**
   * Check if service is healthy
   */
  isServiceHealthy(serviceName) {
    const service = this.services.get(serviceName);
    return service ? service.isHealthy : false;
  }
}

module.exports = {
  CircuitBreaker,
  CircuitBreakerOpenError,
  CircuitBreakerTimeoutError,
  RetryHandler,
  HealthChecker,
};