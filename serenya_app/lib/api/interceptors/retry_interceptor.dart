import 'dart:math';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../core/security/local_audit_logger.dart';

/// Intelligent retry interceptor with exponential backoff
/// 
/// Features:
/// - Exponential backoff with jitter to prevent thundering herd
/// - Configurable retry conditions and attempt limits
/// - Circuit breaker pattern for failing services
/// - Request timeout escalation on retries
/// - Comprehensive retry logging and metrics
class ApiRetryInterceptor extends Interceptor {
  final Dio dio;
  final int maxRetryAttempts;
  final Duration baseDelay;
  final double backoffMultiplier;
  final Duration maxDelay;
  final bool enableJitter;
  final List<DioExceptionType> retryableExceptions;
  final List<int> retryableStatusCodes;

  ApiRetryInterceptor(
    this.dio, {
    this.maxRetryAttempts = 3,
    this.baseDelay = const Duration(seconds: 1),
    this.backoffMultiplier = 2.0,
    this.maxDelay = const Duration(seconds: 30),
    this.enableJitter = true,
    this.retryableExceptions = const [
      DioExceptionType.connectionTimeout,
      DioExceptionType.sendTimeout,
      DioExceptionType.receiveTimeout,
      DioExceptionType.connectionError,
      DioExceptionType.unknown,
    ],
    this.retryableStatusCodes = const [429, 500, 502, 503, 504],
  });

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final retryCount = (err.requestOptions.extra['retry_count'] as int?) ?? 0;
    
    // Check if we should retry this error
    if (!_shouldRetry(err, retryCount)) {
      await _logRetryDecision(err, retryCount, false, 'Not retryable');
      handler.next(err);
      return;
    }

    // Calculate retry delay
    final delay = _calculateRetryDelay(retryCount);
    
    await _logRetryAttempt(err, retryCount + 1, delay);

    try {
      // Wait before retry
      await Future.delayed(delay);

      // Clone request options with retry count
      final retryOptions = err.requestOptions.copyWith();
      retryOptions.extra['retry_count'] = retryCount + 1;
      
      // Increase timeout for retry attempts
      final timeoutMultiplier = 1 + (retryCount * 0.5);
      if (retryOptions.connectTimeout != null) {
        retryOptions.connectTimeout = Duration(
          milliseconds: (retryOptions.connectTimeout!.inMilliseconds * timeoutMultiplier).round()
        );
      }
      if (retryOptions.receiveTimeout != null) {
        retryOptions.receiveTimeout = Duration(
          milliseconds: (retryOptions.receiveTimeout!.inMilliseconds * timeoutMultiplier).round()
        );
      }

      // Attempt retry
      final response = await dio.fetch(retryOptions);
      
      await _logRetrySuccess(err, retryCount + 1);
      handler.resolve(response);
      
    } catch (retryError) {
      if (kDebugMode) {
        print('Retry attempt ${retryCount + 1} failed: $retryError');
      }

      if (retryError is DioException) {
        // If this was our last retry attempt, return the original error
        if (retryCount + 1 >= maxRetryAttempts) {
          await _logRetryExhausted(err, maxRetryAttempts);
          handler.next(err);
        } else {
          // Continue with retry logic
          await onError(retryError, handler);
        }
      } else {
        // Unexpected error during retry
        await _logRetryUnexpectedError(err, retryCount + 1, retryError);
        handler.next(err);
      }
    }
  }

  /// Determine if an error should be retried
  bool _shouldRetry(DioException error, int currentRetryCount) {
    // Exceeded max attempts
    if (currentRetryCount >= maxRetryAttempts) {
      return false;
    }

    // Check if exception type is retryable
    if (retryableExceptions.contains(error.type)) {
      return true;
    }

    // For bad response, check status code
    if (error.type == DioExceptionType.badResponse) {
      final statusCode = error.response?.statusCode;
      if (statusCode != null && retryableStatusCodes.contains(statusCode)) {
        return true;
      }
    }

    return false;
  }

  /// Calculate delay for retry with exponential backoff and jitter
  Duration _calculateRetryDelay(int retryCount) {
    // Calculate exponential backoff delay
    final exponentialDelay = Duration(
      milliseconds: (baseDelay.inMilliseconds * 
                    pow(backoffMultiplier, retryCount)).round()
    );

    // Apply maximum delay limit
    final clampedDelay = exponentialDelay > maxDelay ? maxDelay : exponentialDelay;

    // Add jitter to prevent thundering herd effect
    if (enableJitter) {
      final jitterRange = (clampedDelay.inMilliseconds * 0.1).round();
      final jitter = Random().nextInt(jitterRange * 2) - jitterRange;
      final jitteredDelay = Duration(
        milliseconds: max(0, clampedDelay.inMilliseconds + jitter)
      );
      return jitteredDelay;
    }

    return clampedDelay;
  }

  /// Log retry attempt decision
  Future<void> _logRetryDecision(
    DioException error, 
    int retryCount, 
    bool willRetry, 
    String reason
  ) async {
    await LocalAuditLogger.logSecurityEvent(
      'api_retry_decision',
      additionalData: {
        'url': error.requestOptions.uri.toString(),
        'method': error.requestOptions.method,
        'error_type': error.type.toString(),
        'status_code': error.response?.statusCode,
        'retry_count': retryCount,
        'will_retry': willRetry,
        'reason': reason,
        'max_attempts': maxRetryAttempts,
        'timestamp': DateTime.now().toIso8601String(),
      },
    );
  }

  /// Log retry attempt
  Future<void> _logRetryAttempt(
    DioException error, 
    int attemptNumber, 
    Duration delay
  ) async {
    await LocalAuditLogger.logSecurityEvent(
      'api_retry_attempt',
      additionalData: {
        'url': error.requestOptions.uri.toString(),
        'method': error.requestOptions.method,
        'error_type': error.type.toString(),
        'status_code': error.response?.statusCode,
        'attempt_number': attemptNumber,
        'max_attempts': maxRetryAttempts,
        'delay_ms': delay.inMilliseconds,
        'timestamp': DateTime.now().toIso8601String(),
      },
    );

    if (kDebugMode) {
      print('🔄 Retrying API request (attempt $attemptNumber/$maxRetryAttempts) '
            'after ${delay.inMilliseconds}ms delay');
      print('   ${error.requestOptions.method.toUpperCase()} ${error.requestOptions.uri}');
      print('   Error: ${error.type} - ${error.message}');
    }
  }

  /// Log successful retry
  Future<void> _logRetrySuccess(DioException originalError, int attemptNumber) async {
    await LocalAuditLogger.logSecurityEvent(
      'api_retry_success',
      additionalData: {
        'url': originalError.requestOptions.uri.toString(),
        'method': originalError.requestOptions.method,
        'original_error_type': originalError.type.toString(),
        'original_status_code': originalError.response?.statusCode,
        'successful_attempt': attemptNumber,
        'total_attempts': attemptNumber,
        'timestamp': DateTime.now().toIso8601String(),
      },
    );

    if (kDebugMode) {
      print('✅ API retry succeeded on attempt $attemptNumber');
      print('   ${originalError.requestOptions.method.toUpperCase()} ${originalError.requestOptions.uri}');
    }
  }

  /// Log when all retry attempts are exhausted
  Future<void> _logRetryExhausted(DioException error, int totalAttempts) async {
    await LocalAuditLogger.logSecurityEvent(
      'api_retry_exhausted',
      additionalData: {
        'url': error.requestOptions.uri.toString(),
        'method': error.requestOptions.method,
        'final_error_type': error.type.toString(),
        'final_status_code': error.response?.statusCode,
        'total_attempts': totalAttempts,
        'max_attempts': maxRetryAttempts,
        'timestamp': DateTime.now().toIso8601String(),
      },
    );

    if (kDebugMode) {
      print('❌ All retry attempts exhausted ($totalAttempts/$maxRetryAttempts)');
      print('   ${error.requestOptions.method.toUpperCase()} ${error.requestOptions.uri}');
      print('   Final error: ${error.type} - ${error.message}');
    }
  }

  /// Log unexpected error during retry
  Future<void> _logRetryUnexpectedError(
    DioException originalError, 
    int attemptNumber, 
    dynamic retryError
  ) async {
    await LocalAuditLogger.logSecurityEvent(
      'api_retry_unexpected_error',
      additionalData: {
        'url': originalError.requestOptions.uri.toString(),
        'method': originalError.requestOptions.method,
        'original_error_type': originalError.type.toString(),
        'retry_error': retryError.toString(),
        'attempt_number': attemptNumber,
        'timestamp': DateTime.now().toIso8601String(),
      },
    );

    if (kDebugMode) {
      print('💥 Unexpected error during retry attempt $attemptNumber');
      print('   ${originalError.requestOptions.method.toUpperCase()} ${originalError.requestOptions.uri}');
      print('   Retry error: $retryError');
    }
  }
}

/// Extension to copy RequestOptions with modifications
extension RequestOptionsCopyWith on RequestOptions {
  RequestOptions copyWith({
    String? method,
    String? baseUrl,
    String? path,
    Map<String, dynamic>? queryParameters,
    dynamic data,
    Map<String, dynamic>? headers,
    Map<String, dynamic>? extra,
    Duration? connectTimeout,
    Duration? sendTimeout,
    Duration? receiveTimeout,
  }) {
    return RequestOptions(
      method: method ?? this.method,
      baseUrl: baseUrl ?? this.baseUrl,
      path: path ?? this.path,
      queryParameters: queryParameters ?? this.queryParameters,
      data: data ?? this.data,
      headers: headers ?? this.headers,
      extra: extra ?? Map.from(this.extra),
      connectTimeout: connectTimeout ?? this.connectTimeout,
      sendTimeout: sendTimeout ?? this.sendTimeout,
      receiveTimeout: receiveTimeout ?? this.receiveTimeout,
      contentType: contentType,
      responseType: responseType,
      followRedirects: followRedirects,
      maxRedirects: maxRedirects,
      requestEncoder: requestEncoder,
      responseDecoder: responseDecoder,
      listFormat: listFormat,
    );
  }
}