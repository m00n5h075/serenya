import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../core/constants/app_constants.dart';
import '../core/utils/encryption_utils.dart';
import '../core/security/certificate_pinning.dart';
import 'auth_service.dart';

/// Enhanced API Service for Healthcare Platform
/// 
/// Features:
/// - Dio-based HTTP client with automatic authentication
/// - Automatic token refresh and retry logic
/// - Healthcare-appropriate error handling and timeout
/// - File upload with progress tracking
/// - Comprehensive logging and error reporting
class ApiService {
  late final Dio _dio;
  late final AuthService _authService;

  // Singleton pattern for consistent authentication state
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;

  ApiService._internal() {
    _authService = AuthService();
    _setupDioClient();
  }

  /// Setup Dio client with authentication and error handling
  void _setupDioClient() {
    _dio = Dio(BaseOptions(
      baseUrl: AppConstants.baseApiUrl,
      connectTimeout: const Duration(seconds: ApiConstants.connectTimeoutSeconds),
      receiveTimeout: const Duration(seconds: ApiConstants.receiveTimeoutSeconds),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-App-Version': AppConstants.appVersion,
        'X-Platform': 'flutter',
      },
    ));

    // Configure SSL certificate pinning for security
    CertificatePinningService.configureCertificatePinning(_dio);

    // Add request interceptor for authentication
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        // Add authentication headers for protected endpoints
        if (!options.path.contains('/auth/')) {
          final token = await _authService.getToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
        }

        // Add device info headers
        options.headers['X-Device-Platform'] = Platform.operatingSystem;
        options.headers['X-Device-ID'] = await _getDeviceId();

        handler.next(options);
      },

      onError: (error, handler) async {
        // Handle 401 errors with automatic token refresh
        if (error.response?.statusCode == 401 && 
            !error.requestOptions.path.contains('/auth/')) {
          try {
            // Try to refresh token silently
            final refreshed = await _authService.isLoggedIn();
            if (refreshed) {
              // Retry the original request with new token
              final token = await _authService.getToken();
              if (token != null) {
                error.requestOptions.headers['Authorization'] = 'Bearer $token';
                
                final retryResponse = await _dio.fetch(error.requestOptions);
                return handler.resolve(retryResponse);
              }
            }
          } catch (e) {
            debugPrint('Token refresh failed during API call: $e');
          }
        }

        handler.next(error);
      },
    ));

    // Add retry interceptor for network resilience
    _dio.interceptors.add(RetryInterceptor(
      dio: _dio,
      retries: 3,
      retryDelays: const [
        Duration(seconds: 1),   // First retry after 1s
        Duration(seconds: 3),   // Second retry after 3s
        Duration(seconds: 5),   // Third retry after 5s
      ],
      retryEvaluator: (error, attempt) {
        // Retry on network errors and server errors (5xx)
        return error.type == DioExceptionType.connectionTimeout ||
               error.type == DioExceptionType.sendTimeout ||
               error.type == DioExceptionType.receiveTimeout ||
               error.type == DioExceptionType.connectionError ||
               (error.response?.statusCode != null && error.response!.statusCode! >= 500);
      },
    ));

    // Add logging interceptor for debugging
    if (kDebugMode) {
      _dio.interceptors.add(LogInterceptor(
        requestBody: true,
        responseBody: false, // Don't log response bodies (may contain medical data)
        requestHeader: false, // Don't log headers (may contain tokens)
        responseHeader: false,
        logPrint: (object) => debugPrint('[API] $object'),
      ));
    }
  }

  /// Upload document with progress tracking
  Future<ApiResult<Map<String, dynamic>>> uploadDocument({
    required File file,
    required String fileName,
    required String fileType,
    ProgressCallback? onProgress,
  }) async {
    try {
      // Validate file before upload
      final validationError = _validateFile(file, fileName);
      if (validationError != null) {
        return ApiResult.failed(validationError, statusCode: 400);
      }

      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(
          file.path,
          filename: SecurityUtils.sanitizeFileName(fileName),
        ),
        'file_type': fileType,
        'file_size': await file.length(),
        'upload_timestamp': DateTime.now().millisecondsSinceEpoch,
      });

      final response = await _dio.post(
        '${AppConstants.processingEndpoint}/upload',
        data: formData,
        onSendProgress: onProgress,
      );

      return _handleResponse(response, 'Document upload');

    } on DioException catch (e) {
      return _handleDioError(e, 'Document upload');
    } catch (e) {
      return ApiResult.failed('Unexpected error during upload: $e');
    }
  }

  /// Get processing status with healthcare-appropriate messaging
  Future<ApiResult<Map<String, dynamic>>> getProcessingStatus(String jobId) async {
    try {
      final response = await _dio.get(
        '${AppConstants.processingEndpoint}/status/$jobId',
      );

      return _handleResponse(response, 'Processing status check');

    } on DioException catch (e) {
      return _handleDioError(e, 'Processing status check');
    }
  }

  /// Get interpretation results
  Future<ApiResult<Map<String, dynamic>>> getInterpretation(String jobId) async {
    try {
      final response = await _dio.get(
        '${AppConstants.processingEndpoint}/result/$jobId',
      );

      return _handleResponse(response, 'Medical interpretation retrieval');

    } on DioException catch (e) {
      return _handleDioError(e, 'Medical interpretation retrieval');
    }
  }

  /// Cleanup temporary S3 files after successful Flutter storage
  /// Fire-and-forget cleanup call triggered after SerenyaContent table update
  Future<ApiResult<Map<String, dynamic>>> cleanupTempFiles(String jobId) async {
    try {
      final response = await _dio.delete(
        '${AppConstants.processingEndpoint}/cleanup/$jobId',
      );

      return _handleResponse(response, 'Temporary file cleanup');

    } on DioException catch (e) {
      return _handleDioError(e, 'Temporary file cleanup');
    }
  }

  /// Generate doctor report with enhanced options
  Future<ApiResult<Map<String, dynamic>>> generateDoctorReport({
    required String documentId,
    String reportType = 'medical_summary',
    Map<String, dynamic>? additionalContext,
  }) async {
    try {
      final requestData = {
        'document_id': documentId,
        'report_type': reportType,
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      };

      if (additionalContext != null) {
        requestData['context'] = additionalContext;
      }

      final response = await _dio.post(
        '${AppConstants.processingEndpoint}/doctor-report',
        data: requestData,
      );

      return _handleResponse(response, 'Doctor report generation');

    } on DioException catch (e) {
      return _handleDioError(e, 'Doctor report generation');
    }
  }

  /// Retry processing with exponential backoff
  Future<ApiResult<bool>> retryProcessing(String jobId, {int attemptNumber = 0}) async {
    try {
      final response = await _dio.post(
        '${AppConstants.processingEndpoint}/retry/$jobId',
        data: {
          'retry_timestamp': DateTime.now().millisecondsSinceEpoch,
          'attempt_number': attemptNumber,
        },
      );

      if (response.statusCode == 200) {
        return ApiResult.success(
          true,
          'Processing retry initiated successfully',
        );
      } else {
        return ApiResult.failed(
          'Failed to initiate retry',
          statusCode: response.statusCode,
        );
      }

    } on DioException catch (e) {
      final result = _handleDioError(e, 'Processing retry');
      return ApiResult.failed(
        result.message,
        statusCode: result.statusCode,
        isNetworkError: result.isNetworkError,
      );
    }
  }

  /// Get user profile information
  Future<ApiResult<Map<String, dynamic>>> getUserProfile() async {
    try {
      final response = await _dio.get('/user/profile');
      return _handleResponse(response, 'User profile retrieval');

    } on DioException catch (e) {
      return _handleDioError(e, 'User profile retrieval');
    }
  }

  /// Update user profile
  Future<ApiResult<Map<String, dynamic>>> updateUserProfile(
    Map<String, dynamic> profileData,
  ) async {
    try {
      final response = await _dio.put(
        '/user/profile',
        data: profileData,
      );

      return _handleResponse(response, 'User profile update');

    } on DioException catch (e) {
      return _handleDioError(e, 'User profile update');
    }
  }

  /// Health check endpoint for connectivity testing
  Future<ApiResult<Map<String, dynamic>>> healthCheck() async {
    try {
      final response = await _dio.get('/health');
      return _handleResponse(response, 'Health check');

    } on DioException catch (e) {
      return _handleDioError(e, 'Health check');
    }
  }

  /// Validate file before upload
  String? _validateFile(File file, String fileName) {
    if (!EncryptionUtils.isValidFileType(fileName)) {
      final supportedTypes = AppConstants.supportedFileTypes.join(', ');
      return 'Unsupported file type. Supported formats: $supportedTypes';
    }

    if (!file.existsSync()) {
      return 'Selected file does not exist. Please try selecting the file again.';
    }

    final fileSize = file.lengthSync();
    if (!EncryptionUtils.isValidFileSize(fileSize)) {
      final maxSize = EncryptionUtils.formatFileSize(AppConstants.maxFileSizeBytes);
      final currentSize = EncryptionUtils.formatFileSize(fileSize);
      return 'File size ($currentSize) exceeds maximum allowed size ($maxSize).';
    }

    return null; // File is valid
  }

  /// Handle successful API responses
  ApiResult<Map<String, dynamic>> _handleResponse(
    Response response,
    String operation,
  ) {
    try {
      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = response.data;
        
        // Handle different response formats
        if (data is Map<String, dynamic>) {
          if (data['success'] == true) {
            return ApiResult.success(
              data['data'] ?? data,
              data['message'] ?? '$operation completed successfully',
            );
          } else {
            // Backend returned success: false
            final error = data['error'] ?? {};
            return ApiResult.failed(
              error['user_message'] ?? error['message'] ?? '$operation failed',
              errorCode: error['code'],
              statusCode: response.statusCode,
            );
          }
        } else {
          // Direct data response
          return ApiResult.success(
            {'result': data},
            '$operation completed successfully',
          );
        }
      } else {
        return ApiResult.failed(
          'Server returned status ${response.statusCode} for $operation',
          statusCode: response.statusCode,
        );
      }
    } catch (e) {
      return ApiResult.failed('Failed to parse response from $operation: $e');
    }
  }

  /// Handle Dio errors with healthcare-appropriate messaging
  ApiResult<Map<String, dynamic>> _handleDioError(DioException e, String operation) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return ApiResult.failed(
          'Network timeout during $operation. Please check your connection and try again.',
          isNetworkError: true,
        );

      case DioExceptionType.badResponse:
        final statusCode = e.response?.statusCode;
        final data = e.response?.data;

        if (statusCode == 401) {
          return ApiResult.failed(
            'Authentication required. Please sign in again.',
            errorCode: 'AUTHENTICATION_REQUIRED',
            statusCode: statusCode,
          );
        } else if (statusCode == 403) {
          return ApiResult.failed(
            'Access denied. You may not have permission for this operation.',
            errorCode: 'ACCESS_DENIED',
            statusCode: statusCode,
          );
        } else if (statusCode == 404) {
          return ApiResult.failed(
            'The requested resource was not found.',
            errorCode: 'RESOURCE_NOT_FOUND',
            statusCode: statusCode,
          );
        } else if (statusCode == 429) {
          return ApiResult.failed(
            'Too many requests. Please wait a moment and try again.',
            errorCode: 'RATE_LIMITED',
            statusCode: statusCode,
          );
        } else if (statusCode != null && statusCode >= 500) {
          return ApiResult.failed(
            'Server error during $operation. Our team has been notified.',
            errorCode: 'SERVER_ERROR',
            statusCode: statusCode,
          );
        } else {
          // Try to extract error message from response
          String message = 'Error during $operation';
          String? errorCode;

          if (data is Map<String, dynamic>) {
            final error = data['error'] ?? {};
            message = error['user_message'] ?? error['message'] ?? message;
            errorCode = error['code'];
          }

          return ApiResult.failed(
            message,
            errorCode: errorCode,
            statusCode: statusCode,
          );
        }

      case DioExceptionType.cancel:
        return ApiResult.cancelled('$operation was cancelled');

      case DioExceptionType.badCertificate:
        return ApiResult.failed(
          'Security certificate error. Please check your network connection.',
          isNetworkError: true,
        );

      default:
        return ApiResult.failed(
          'Network error during $operation. Please check your connection and try again.',
          isNetworkError: true,
        );
    }
  }

  /// Get device ID for API requests
  Future<String> _getDeviceId() async {
    final deviceId = await EncryptionUtils.getEncryptionKey('device_id') ?? 
                     await EncryptionUtils.generateEncryptionKey('device_id');
    return deviceId.substring(0, 16);
  }
}

/// API result wrapper with comprehensive error handling
class ApiResult<T> {
  final bool success;
  final bool cancelled;
  final T? data;
  final String message;
  final String? errorCode;
  final int? statusCode;
  final bool isNetworkError;

  const ApiResult._({
    required this.success,
    required this.cancelled,
    this.data,
    required this.message,
    this.errorCode,
    this.statusCode,
    this.isNetworkError = false,
  });

  factory ApiResult.success(T data, String message) {
    return ApiResult._(
      success: true,
      cancelled: false,
      data: data,
      message: message,
    );
  }

  factory ApiResult.failed(
    String message, {
    String? errorCode,
    int? statusCode,
    bool isNetworkError = false,
  }) {
    return ApiResult._(
      success: false,
      cancelled: false,
      message: message,
      errorCode: errorCode,
      statusCode: statusCode,
      isNetworkError: isNetworkError,
    );
  }

  factory ApiResult.cancelled(String message) {
    return ApiResult._(
      success: false,
      cancelled: true,
      message: message,
    );
  }

  /// Check if this is an authentication error
  bool get isAuthError => 
      statusCode == 401 || errorCode == 'AUTHENTICATION_REQUIRED';

  /// Check if this is a network-related error
  bool get isNetworkRelated => 
      isNetworkError || 
      statusCode == null ||
      (statusCode != null && statusCode! >= 500);

  /// Check if this operation can be retried
  bool get canRetry => 
      isNetworkRelated && !cancelled && statusCode != 401;

  @override
  String toString() => success 
      ? 'ApiResult.success: $message'
      : 'ApiResult.failed: $message${errorCode != null ? ' ($errorCode)' : ''}';
}

/// Enhanced Processing Retry Manager for Healthcare Operations
class ProcessingRetryManager {
  static const List<Duration> retryDelays = [
    Duration(seconds: 30),   // First retry after 30s
    Duration(minutes: 2),    // Second retry after 2m
    Duration(minutes: 5),    // Final retry after 5m
  ];

  static const List<String> retryMessages = [
    'Processing temporarily unavailable. Retrying in 30 seconds...',
    'Still processing your medical document. Retrying in 2 minutes...',
    'Final retry attempt in 5 minutes. If this fails, please contact support.',
  ];

  /// Schedule retry with healthcare-appropriate delays
  static Future<ApiResult<bool>> scheduleRetry(
    String jobId, 
    int attemptNumber,
  ) async {
    if (attemptNumber >= AppConstants.maxRetryAttempts) {
      return ApiResult.failed(
        'Processing failed after maximum retry attempts. Please try uploading your document again or contact support if the issue persists.',
        errorCode: 'MAX_RETRIES_EXCEEDED',
      );
    }

    final delay = retryDelays[attemptNumber];
    await Future.delayed(delay);

    final apiService = ApiService();
    return await apiService.retryProcessing(jobId, attemptNumber: attemptNumber);
  }

  /// Get retry message for current attempt
  static String getRetryMessage(int attemptNumber) {
    if (attemptNumber < retryMessages.length) {
      return retryMessages[attemptNumber];
    }
    return 'Processing failed after maximum retry attempts. Please contact support.';
  }

  /// Get estimated completion time for retry
  static String getEstimatedTime(int attemptNumber) {
    if (attemptNumber >= retryDelays.length) {
      return 'Unknown';
    }
    
    final delay = retryDelays[attemptNumber];
    if (delay.inMinutes > 0) {
      return '${delay.inMinutes} minute${delay.inMinutes > 1 ? 's' : ''}';
    } else {
      return '${delay.inSeconds} second${delay.inSeconds > 1 ? 's' : ''}';
    }
  }

  /// Check if retry is recommended based on error type
  static bool shouldRetry(ApiResult result, int attemptNumber) {
    return result.canRetry && 
           attemptNumber < AppConstants.maxRetryAttempts &&
           !result.isAuthError;
  }
}

/// Network resilience interceptor with exponential backoff
class RetryInterceptor extends Interceptor {
  final Dio dio;
  final void Function(Object object)? logPrint;
  final int retries;
  final List<Duration> retryDelays;
  final bool Function(DioException error, int attempt) retryEvaluator;

  RetryInterceptor({
    required this.dio,
    this.logPrint,
    this.retries = 3,
    this.retryDelays = const [
      Duration(seconds: 1),
      Duration(seconds: 3),
      Duration(seconds: 5),
    ],
    required this.retryEvaluator,
  });

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final attempt = err.requestOptions.extra['retry_attempt'] ?? 0;
    
    if (attempt >= retries || !retryEvaluator(err, attempt)) {
      return handler.next(err);
    }

    final delay = retryDelays.length > attempt 
        ? retryDelays[attempt] 
        : retryDelays.last;
    
    logPrint?.call('Retrying request (attempt ${attempt + 1}/$retries) after ${delay.inSeconds}s delay');
    
    await Future.delayed(delay);
    
    // Clone request options and increment retry count
    final requestOptions = err.requestOptions;
    requestOptions.extra['retry_attempt'] = attempt + 1;
    
    try {
      final response = await dio.fetch(requestOptions);
      return handler.resolve(response);
    } on DioException catch (retryError) {
      return handler.next(retryError);
    }
  }
}

/// Legacy API Exception for backward compatibility
@deprecated
class ApiException implements Exception {
  final String message;
  final int statusCode;

  ApiException(this.message, this.statusCode);

  @override
  String toString() => 'ApiException: $message (Status: $statusCode)';
}