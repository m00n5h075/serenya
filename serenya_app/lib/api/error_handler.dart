import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../core/security/local_audit_logger.dart';
import 'api_client.dart';

/// Unified API error handling with healthcare-appropriate messaging
/// 
/// Provides consistent error handling across all API endpoints with:
/// - User-friendly error messages for healthcare context
/// - Detailed error logging for debugging and audit trails
/// - Network-aware error classification
/// - Retry decision logic for different error types
class ApiErrorHandler {
  final Dio _dio;
  
  ApiErrorHandler(this._dio);

  /// Handle Dio errors with healthcare-specific messaging
  Future<ApiResult<T>> handleDioError<T>(
    DioException error,
    String operation, {
    bool enableRetry = true,
  }) async {
    final context = {
      'operation': operation,
      'url': error.requestOptions.uri.toString(),
      'method': error.requestOptions.method,
      'timestamp': DateTime.now().toIso8601String(),
    };

    await _logApiError(error, context);

    switch (error.type) {
      case DioExceptionType.connectionTimeout:
        return ApiResult.failed(
          'Connection timeout. Please check your internet connection and try again.',
          statusCode: 408,
          metadata: {'error_type': 'connection_timeout', 'retryable': true},
        );

      case DioExceptionType.sendTimeout:
        return ApiResult.failed(
          'Request timeout. The operation took too long to complete.',
          statusCode: 408,
          metadata: {'error_type': 'send_timeout', 'retryable': true},
        );

      case DioExceptionType.receiveTimeout:
        return ApiResult.failed(
          'Response timeout. The server took too long to respond.',
          statusCode: 408,  
          metadata: {'error_type': 'receive_timeout', 'retryable': true},
        );

      case DioExceptionType.connectionError:
        return ApiResult.failed(
          'Network connection error. Please check your internet connection.',
          statusCode: 0,
          metadata: {'error_type': 'connection_error', 'retryable': true},
        );

      case DioExceptionType.badCertificate:
        return ApiResult.failed(
          'Security certificate error. Please ensure you are connected to a secure network.',
          statusCode: 0,
          metadata: {'error_type': 'certificate_error', 'retryable': false},
        );

      case DioExceptionType.badResponse:
        return _handleHttpError(error, operation);

      case DioExceptionType.cancel:
        return ApiResult.failed(
          'Request was cancelled.',
          statusCode: 0,
          metadata: {'error_type': 'cancelled', 'retryable': false},
        );

      case DioExceptionType.unknown:
      default:
        return ApiResult.failed(
          'An unexpected error occurred. Please try again.',
          statusCode: 0,
          metadata: {'error_type': 'unknown', 'retryable': true},
        );
    }
  }

  /// Handle HTTP status code errors  
  ApiResult<T> _handleHttpError<T>(DioException error, String operation) {
    final statusCode = error.response?.statusCode ?? 0;
    final responseData = error.response?.data;
    
    // Extract server error message if available
    String? serverMessage;
    if (responseData is Map<String, dynamic>) {
      serverMessage = responseData['message'] ?? responseData['error'];
    }

    switch (statusCode) {
      case 400:
        return ApiResult.failed(
          serverMessage ?? 'Invalid request. Please check your input and try again.',
          statusCode: 400,
          metadata: {'error_type': 'bad_request', 'retryable': false},
        );

      case 401:
        return ApiResult.failed(
          'Authentication required. Please sign in again.',
          statusCode: 401,
          metadata: {'error_type': 'unauthorized', 'retryable': false, 'requires_auth': true},
        );

      case 403:
        return ApiResult.failed(
          'Access denied. You don\'t have permission to perform this action.',
          statusCode: 403,
          metadata: {'error_type': 'forbidden', 'retryable': false},
        );

      case 404:
        return ApiResult.failed(
          'The requested resource was not found.',
          statusCode: 404,
          metadata: {'error_type': 'not_found', 'retryable': false},
        );

      case 409:
        return ApiResult.failed(
          serverMessage ?? 'Conflict with existing data. Please refresh and try again.',
          statusCode: 409,
          metadata: {'error_type': 'conflict', 'retryable': false},
        );

      case 422:
        return ApiResult.failed(
          serverMessage ?? 'Data validation failed. Please check your input.',
          statusCode: 422,
          metadata: {'error_type': 'validation_error', 'retryable': false},
        );

      case 429:
        return ApiResult.failed(
          'Too many requests. Please wait a moment and try again.',
          statusCode: 429,
          metadata: {'error_type': 'rate_limited', 'retryable': true, 'retry_after': _extractRetryAfter(error)},
        );

      case 500:
        return ApiResult.failed(
          'Server error. Our team has been notified and is working on a fix.',
          statusCode: 500,
          metadata: {'error_type': 'server_error', 'retryable': true},
        );

      case 502:
      case 503:
      case 504:
        return ApiResult.failed(
          'Service temporarily unavailable. Please try again in a few moments.',
          statusCode: statusCode,
          metadata: {'error_type': 'service_unavailable', 'retryable': true},
        );

      default:
        return ApiResult.failed(
          serverMessage ?? 'An unexpected server error occurred. Please try again.',
          statusCode: statusCode,
          metadata: {'error_type': 'http_error', 'retryable': statusCode >= 500},
        );
    }
  }

  /// Extract Retry-After header value for rate limiting
  int? _extractRetryAfter(DioException error) {
    final retryAfterHeader = error.response?.headers.value('Retry-After');
    if (retryAfterHeader != null) {
      return int.tryParse(retryAfterHeader);
    }
    return null;
  }

  /// Determine if an error should trigger a retry
  bool shouldRetry(DioException error, int attemptCount) {
    if (attemptCount >= 3) return false;

    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.connectionError:
        return true;

      case DioExceptionType.badResponse:
        final statusCode = error.response?.statusCode ?? 0;
        // Retry on server errors and rate limiting
        return statusCode >= 500 || statusCode == 429;

      case DioExceptionType.badCertificate:
      case DioExceptionType.cancel:
        return false;

      case DioExceptionType.unknown:
      default:
        // Retry unknown errors cautiously
        return attemptCount < 2;
    }
  }

  /// Get retry delay for exponential backoff
  Duration getRetryDelay(int attemptCount, {int? retryAfterSeconds}) {
    if (retryAfterSeconds != null) {
      return Duration(seconds: retryAfterSeconds);
    }

    // Exponential backoff with jitter
    final baseDelay = Duration(seconds: 1);
    final exponentialDelay = Duration(
      milliseconds: baseDelay.inMilliseconds * (1 << (attemptCount - 1))
    );
    
    // Add jitter to prevent thundering herd
    final jitter = Duration(
      milliseconds: (exponentialDelay.inMilliseconds * 0.1).round()
    );
    
    return exponentialDelay + jitter;
  }

  /// Log API errors for debugging and audit trails
  Future<void> _logApiError(
    DioException error,
    Map<String, dynamic> context,
  ) async {
    final errorData = {
      'error_type': error.type.toString(),
      'status_code': error.response?.statusCode,
      'error_message': error.message,
      'request_url': error.requestOptions.uri.toString(),
      'request_method': error.requestOptions.method,
      'response_headers': error.response?.headers.map,
      'operation': context['operation'],
      'timestamp': context['timestamp'],
    };

    // Log to audit system
    await LocalAuditLogger.logSecurityEvent(
      'api_error_occurred',
      additionalData: errorData,
    );

    // Debug logging
    if (kDebugMode) {
      print('API Error [${error.type}]: ${error.message}');
      print('URL: ${error.requestOptions.uri}');
      print('Status: ${error.response?.statusCode}');
      if (error.response?.data != null) {
        print('Response: ${error.response?.data}');
      }
    }
  }

  /// Create a generic network error result
  static ApiResult<T> networkError<T>([String? message]) {
    return ApiResult.failed(
      message ?? 'Network error. Please check your connection and try again.',
      statusCode: 0,
      metadata: {'error_type': 'network', 'retryable': true},
    );
  }

  /// Create a generic parsing error result  
  static ApiResult<T> parsingError<T>([String? message]) {
    return ApiResult.failed(
      message ?? 'Data parsing error. Please try again.',
      statusCode: 0,
      metadata: {'error_type': 'parsing', 'retryable': false},
    );
  }

  /// Create a validation error result
  static ApiResult<T> validationError<T>(String message) {
    return ApiResult.failed(
      message,
      statusCode: 400,
      metadata: {'error_type': 'validation', 'retryable': false},
    );
  }
}

/// Healthcare-specific error categories
enum HealthcareErrorType {
  authentication,
  authorization,
  dataValidation,
  networkConnectivity,
  serverUnavailable,
  dataEncryption,
  medicalDataSafety,
  complianceViolation,
}

/// Error result with healthcare context
class HealthcareApiError {
  final HealthcareErrorType type;
  final String userMessage;
  final String technicalDetails;
  final bool requiresUserAction;
  final bool affectsPatientSafety;

  const HealthcareApiError({
    required this.type,
    required this.userMessage,
    required this.technicalDetails,
    this.requiresUserAction = false,
    this.affectsPatientSafety = false,
  });

  Map<String, dynamic> toJson() => {
    'type': type.toString(),
    'user_message': userMessage,
    'technical_details': technicalDetails,
    'requires_user_action': requiresUserAction,
    'affects_patient_safety': affectsPatientSafety,
  };
}