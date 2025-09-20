/// Unified Error Handling System
/// 
/// Implements the 3-layer error handling strategy as defined in dev rules:
/// Layer 1: Server Error Processing
/// Layer 2: Client Error Translation  
/// Layer 3: User Experience
library;

enum ErrorCategory {
  technical,    // Network, API, or system errors
  validation,   // User input or data validation errors  
  business,     // Business logic or rule violations
  external,     // Third-party service errors
}

enum RecoveryStrategy {
  retry,        // User can retry the operation
  fallback,     // Alternative functionality available
  escalate,     // Contact support required
  ignore,       // Error can be dismissed
}

/// Unified error representation following dev rules standard
class UnifiedError {
  final ErrorCategory category;
  final RecoveryStrategy recoveryStrategy;
  final String userMessage;
  final bool fallbackAvailable;
  final Duration? retryAfter;
  final String? errorCode;
  final String? correlationId;
  final Map<String, dynamic>? context;

  const UnifiedError({
    required this.category,
    required this.recoveryStrategy,
    required this.userMessage,
    this.fallbackAvailable = false,
    this.retryAfter,
    this.errorCode,
    this.correlationId,
    this.context,
  });

  /// Create error from API service result
  factory UnifiedError.fromApiResult(dynamic apiResult, String operation) {
    if (apiResult.isNetworkError) {
      return const UnifiedError(
        category: ErrorCategory.technical,
        recoveryStrategy: RecoveryStrategy.retry,
        userMessage: 'We\'re having trouble connecting. Please check your network.',
        fallbackAvailable: false,
        retryAfter: Duration(seconds: 3),
        errorCode: 'NETWORK_ERROR',
      );
    }
    
    if (apiResult.statusCode == 401) {
      return const UnifiedError(
        category: ErrorCategory.technical,
        recoveryStrategy: RecoveryStrategy.escalate,
        userMessage: 'We need you to sign in again for security.',
        fallbackAvailable: false,
        errorCode: 'AUTH_REQUIRED',
      );
    }
    
    if (apiResult.statusCode == 429) {
      return const UnifiedError(
        category: ErrorCategory.technical,
        recoveryStrategy: RecoveryStrategy.retry,
        userMessage: 'We\'re handling lots of requests. Please wait a moment.',
        fallbackAvailable: false,
        retryAfter: Duration(minutes: 1),
        errorCode: 'RATE_LIMITED',
      );
    }
    
    if (apiResult.statusCode != null && apiResult.statusCode! >= 500) {
      return const UnifiedError(
        category: ErrorCategory.technical,
        recoveryStrategy: RecoveryStrategy.escalate,
        userMessage: 'We\'re having technical difficulties. Please try again later.',
        fallbackAvailable: false,
        errorCode: 'SERVER_ERROR',
      );
    }
    
    // Default error for unknown cases
    return UnifiedError(
      category: ErrorCategory.technical,
      recoveryStrategy: RecoveryStrategy.retry,
      userMessage: 'We\'re having trouble with $operation. Please try again.',
      fallbackAvailable: false,
      retryAfter: const Duration(seconds: 5),
      errorCode: 'UNKNOWN_ERROR',
    );
  }

  /// Create validation error
  factory UnifiedError.validation(String message) {
    return UnifiedError(
      category: ErrorCategory.validation,
      recoveryStrategy: RecoveryStrategy.ignore,
      userMessage: message,
      fallbackAvailable: false,
      errorCode: 'VALIDATION_ERROR',
    );
  }

  /// Create business logic error
  factory UnifiedError.business(String message, {bool canRetry = false}) {
    return UnifiedError(
      category: ErrorCategory.business,
      recoveryStrategy: canRetry ? RecoveryStrategy.retry : RecoveryStrategy.ignore,
      userMessage: message,
      fallbackAvailable: false,
      errorCode: 'BUSINESS_ERROR',
    );
  }

  /// Create external service error with fallback
  factory UnifiedError.external(String service, {bool hasFallback = false}) {
    return UnifiedError(
      category: ErrorCategory.external,
      recoveryStrategy: hasFallback ? RecoveryStrategy.fallback : RecoveryStrategy.retry,
      userMessage: 'We\'re having trouble with $service. ${hasFallback ? 'Using backup system.' : 'Please try again.'}',
      fallbackAvailable: hasFallback,
      retryAfter: const Duration(seconds: 10),
      errorCode: 'EXTERNAL_SERVICE_ERROR',
    );
  }

  /// Check if error can be retried
  bool get canRetry => recoveryStrategy == RecoveryStrategy.retry && retryAfter != null;

  /// Check if error requires escalation
  bool get requiresEscalation => recoveryStrategy == RecoveryStrategy.escalate;

  /// Get user-friendly retry message
  String? get retryMessage {
    if (!canRetry) return null;
    
    final delay = retryAfter!;
    if (delay.inMinutes > 0) {
      return 'Try again in ${delay.inMinutes} minute${delay.inMinutes > 1 ? 's' : ''}';
    } else {
      return 'Try again in ${delay.inSeconds} second${delay.inSeconds > 1 ? 's' : ''}';
    }
  }

  @override
  String toString() => 'UnifiedError($category, $recoveryStrategy): $userMessage';
}

/// Error state container for UI components
class ErrorState {
  final UnifiedError error;
  final String operation;
  final DateTime timestamp;
  final bool isRetrying;

  const ErrorState({
    required this.error,
    required this.operation,
    required this.timestamp,
    this.isRetrying = false,
  });

  ErrorState copyWith({
    UnifiedError? error,
    String? operation,
    DateTime? timestamp,
    bool? isRetrying,
  }) {
    return ErrorState(
      error: error ?? this.error,
      operation: operation ?? this.operation,
      timestamp: timestamp ?? this.timestamp,
      isRetrying: isRetrying ?? this.isRetrying,
    );
  }
}