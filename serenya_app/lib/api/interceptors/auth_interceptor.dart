import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../services/auth_service.dart';
import '../../core/security/local_audit_logger.dart';

/// Authentication interceptor for automatic token management
/// 
/// Handles:
/// - Automatic token injection for authenticated endpoints
/// - Token refresh on 401 errors
/// - Request retry after token refresh
/// - Device information headers
/// - Authentication audit logging
class AuthInterceptor extends Interceptor {
  late final AuthService _authService;

  // CRITICAL FIX: Accept AuthService instance to use shared instance
  AuthInterceptor({required AuthService authService}) {
    _authService = authService;
  }

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    try {
      // Skip authentication for public endpoints
      if (_isPublicEndpoint(options.path)) {
        handler.next(options);
        return;
      }

      // Add authentication headers
      final token = await _authService.getToken();
      if (token != null) {
        options.headers['Authorization'] = 'Bearer $token';
      }

      // Add device information headers
      options.headers['X-Device-ID'] = await _getDeviceId();
      options.headers['X-Device-Platform'] = _getPlatform();
      options.headers['X-Session-ID'] = await _getSessionId();
      
      // Add request timestamp for security
      options.headers['X-Request-Timestamp'] = DateTime.now().millisecondsSinceEpoch.toString();

      // Log authentication attempt
      await _logAuthRequest(options);

      handler.next(options);
    } catch (e) {
      if (kDebugMode) {
        print('Auth interceptor error: $e');
      }
      handler.reject(
        DioException(
          requestOptions: options,
          error: 'Authentication preparation failed: $e',
          type: DioExceptionType.unknown,
        ),
      );
    }
  }

  @override
  void onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    // Handle 401 Unauthorized errors with automatic token refresh
    if (err.response?.statusCode == 401 && 
        !_isPublicEndpoint(err.requestOptions.path)) {
      
      try {
        await _logAuthFailure(err);

        // Attempt token refresh
        final refreshSuccess = await _authService.refreshToken();
        
        if (refreshSuccess) {
          // Get new token and retry request
          final newToken = await _authService.getToken();
          if (newToken != null) {
            // Clone the request with new token
            final options = err.requestOptions;
            options.headers['Authorization'] = 'Bearer $newToken';
            
            await _logAuthRetry(options);

            // Retry the original request
            try {
              final dio = Dio();
              final response = await dio.fetch(options);
              
              await _logAuthSuccess(options);
              handler.resolve(response);
              return;
            } catch (retryError) {
              if (kDebugMode) {
                print('Auth retry failed: $retryError');
              }
            }
          }
        }

        // Token refresh failed or retry failed
        await _logAuthRefreshFailure(err);
        
        // Clear invalid tokens
        await _authService.clearTokens();
        
      } catch (e) {
        if (kDebugMode) {
          print('Token refresh process failed: $e');
        }
      }
    }

    handler.next(err);
  }

  /// Check if endpoint requires authentication
  bool _isPublicEndpoint(String path) {
    const publicPaths = [
      '/auth/google-onboarding',
      '/health/check',
      '/public/',
    ];

    return publicPaths.any((publicPath) => path.startsWith(publicPath));
  }

  /// Get device identifier for request tracking
  Future<String> _getDeviceId() async {
    return await _authService.getDeviceId() ?? 'unknown-device';
  }

  /// Get platform identifier
  String _getPlatform() {
    return defaultTargetPlatform.name;
  }

  /// Get current session ID
  Future<String?> _getSessionId() async {
    return await _authService.getSessionId();
  }

  /// Log authentication request for audit trail
  Future<void> _logAuthRequest(RequestOptions options) async {
    await LocalAuditLogger.logSecurityEvent(
      'api_auth_request',
      additionalData: {
        'url': options.uri.toString(),
        'method': options.method,
        'has_auth_header': options.headers.containsKey('Authorization'),
        'timestamp': DateTime.now().toIso8601String(),
      },
    );
  }

  /// Log authentication failure
  Future<void> _logAuthFailure(DioException error) async {
    await LocalAuditLogger.logSecurityEvent(
      'api_auth_failure',
      additionalData: {
        'url': error.requestOptions.uri.toString(),
        'method': error.requestOptions.method,
        'status_code': error.response?.statusCode,
        'error_type': error.type.toString(),
        'timestamp': DateTime.now().toIso8601String(),
      },
    );
  }

  /// Log authentication retry attempt
  Future<void> _logAuthRetry(RequestOptions options) async {
    await LocalAuditLogger.logSecurityEvent(
      'api_auth_retry',
      additionalData: {
        'url': options.uri.toString(),
        'method': options.method,
        'timestamp': DateTime.now().toIso8601String(),
      },
    );
  }

  /// Log successful authentication
  Future<void> _logAuthSuccess(RequestOptions options) async {
    await LocalAuditLogger.logSecurityEvent(
      'api_auth_success',
      additionalData: {
        'url': options.uri.toString(),
        'method': options.method,
        'timestamp': DateTime.now().toIso8601String(),
      },
    );
  }

  /// Log token refresh failure
  Future<void> _logAuthRefreshFailure(DioException error) async {
    await LocalAuditLogger.logSecurityEvent(
      'api_token_refresh_failure',
      additionalData: {
        'url': error.requestOptions.uri.toString(),
        'method': error.requestOptions.method,
        'status_code': error.response?.statusCode,
        'timestamp': DateTime.now().toIso8601String(),
      },
    );
  }
}