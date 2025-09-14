import 'dart:io';
import 'package:dio/dio.dart';
import '../core/constants/app_constants.dart';
import '../core/security/certificate_pinning.dart';
import 'interceptors/auth_interceptor.dart';
import 'interceptors/encryption_interceptor.dart';
import 'interceptors/logging_interceptor.dart';
import 'interceptors/retry_interceptor.dart';
import 'error_handler.dart';
import 'endpoints/auth_api.dart';
import 'endpoints/documents_api.dart';
import 'endpoints/chat_api.dart';
import 'endpoints/subscriptions_api.dart';
import 'endpoints/reports_api.dart';

/// Main API Client for Serenya Health Platform
/// 
/// Provides a unified interface to all backend API endpoints with:
/// - Automatic authentication and token management
/// - End-to-end encryption for medical data
/// - Comprehensive error handling and retry logic  
/// - Offline capability with request queuing
/// - API versioning and backward compatibility
/// - Audit logging for all API interactions
class ApiClient {
  late final Dio _dio;
  late final ApiErrorHandler _errorHandler;
  
  // Endpoint-specific API services
  late final AuthApi auth;
  late final DocumentsApi documents;
  late final ChatApi chat;
  late final SubscriptionsApi subscriptions;
  late final ReportsApi reports;

  // Singleton pattern for consistent state management
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  
  // Expose Dio client for advanced usage (e.g., offline queue)
  Dio get dio => _dio;

  ApiClient._internal() {
    _setupDioClient();
    _errorHandler = ApiErrorHandler();
    
    // Initialize endpoint-specific services
    auth = AuthApi(_dio, _errorHandler);
    documents = DocumentsApi(_dio, _errorHandler);
    chat = ChatApi(_dio, _errorHandler);
    subscriptions = SubscriptionsApi(_dio, _errorHandler);
    reports = ReportsApi(_dio, _errorHandler);
  }

  /// Setup Dio client with all interceptors and configuration
  void _setupDioClient() {
    _dio = Dio(BaseOptions(
      baseUrl: AppConstants.baseApiUrl,
      connectTimeout: const Duration(seconds: ApiConstants.connectTimeoutSeconds),
      receiveTimeout: const Duration(seconds: ApiConstants.receiveTimeoutSeconds),
      sendTimeout: const Duration(seconds: ApiConstants.sendTimeoutSeconds),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-App-Version': AppConstants.appVersion,
        'X-Platform': 'flutter',
        'X-API-Version': 'v1',
        'User-Agent': 'Serenya/${AppConstants.appVersion} (${Platform.operatingSystem})',
      },
      validateStatus: (status) => status != null && status < 500, // Handle 4xx errors gracefully
    ));

    // Configure SSL certificate pinning for security
    CertificatePinningService.configureCertificatePinning(_dio);

    // Add interceptors in order of execution
    _dio.interceptors.addAll([
      // 1. Authentication interceptor (adds tokens)
      AuthInterceptor(),
      
      // 2. Encryption interceptor (encrypts sensitive data)
      EncryptionInterceptor(),
      
      // 3. Logging interceptor (audit trail)
      ApiLoggingInterceptor(),
      
      // 4. Retry interceptor (network resilience)  
      ApiRetryInterceptor(_dio),
    ]);
  }

  /// Get API client version and status
  Map<String, dynamic> getClientInfo() {
    return {
      'api_version': 'v1',
      'client_version': AppConstants.appVersion,
      'base_url': AppConstants.baseApiUrl,
      'ssl_pinning_enabled': true,
      'encryption_enabled': true,
      'offline_support_enabled': true,
    };
  }

  /// Test API connectivity and authentication
  Future<ApiResult<Map<String, dynamic>>> testConnection() async {
    try {
      final response = await _dio.get('/health/check');
      
      return ApiResult.success({
        'status': 'connected',
        'server_time': response.data['timestamp'],
        'api_version': response.data['version'],
        'latency_ms': response.headers.value('X-Response-Time'),
      });
    } on DioException catch (e) {
      return _errorHandler.handleDioError(e, 'Connection test');
    } catch (e) {
      return ApiResult.failed('Unexpected connection error: $e');
    }
  }

  /// Clear all cached data and reset client state
  Future<void> reset() async {
    // Clear Dio cache if any
    _dio.close(force: true);
    
    // Reinitialize client
    _setupDioClient();
    
    // Notify endpoint services of reset
    await auth.reset();
    await documents.reset();
    await chat.reset();
    await subscriptions.reset();
    await reports.reset();
  }

  /// Dispose resources
  void dispose() {
    _dio.close(force: true);
  }
}

/// API Result wrapper for consistent response handling
class ApiResult<T> {
  final bool success;
  final T? data;
  final String? error;
  final int? statusCode;
  final Map<String, dynamic>? metadata;

  const ApiResult._({
    required this.success,
    this.data,
    this.error,
    this.statusCode,
    this.metadata,
  });

  factory ApiResult.success(
    T data, {
    int? statusCode,
    Map<String, dynamic>? metadata,
  }) {
    return ApiResult._(
      success: true,
      data: data,
      statusCode: statusCode ?? 200,
      metadata: metadata,
    );
  }

  factory ApiResult.failed(
    String error, {
    int? statusCode,
    Map<String, dynamic>? metadata,
  }) {
    return ApiResult._(
      success: false,
      error: error,
      statusCode: statusCode,
      metadata: metadata,
    );
  }

  @override
  String toString() => success 
      ? 'ApiResult.success: ${data.runtimeType}'
      : 'ApiResult.failed: $error (${statusCode ?? 'unknown'})';
}

