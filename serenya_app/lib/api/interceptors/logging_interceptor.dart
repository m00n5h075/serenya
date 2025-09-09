import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../core/security/local_audit_logger.dart';

/// Comprehensive logging interceptor for API audit trails
/// 
/// Provides detailed logging for:
/// - All API requests with headers, data, and timing
/// - All API responses with status, headers, and data
/// - Performance metrics and latency tracking
/// - Error details for debugging and compliance
/// - Sensitive data redaction for security
class ApiLoggingInterceptor extends Interceptor {
  final bool logRequestBody;
  final bool logResponseBody;
  final bool logHeaders;
  final int maxLogLength;
  final List<String> sensitiveHeaders;

  ApiLoggingInterceptor({
    this.logRequestBody = true,
    this.logResponseBody = true,
    this.logHeaders = true,
    this.maxLogLength = 2000,
    this.sensitiveHeaders = const [
      'Authorization',
      'X-API-Key',
      'X-Device-ID',
      'Cookie',
      'Set-Cookie',
    ],
  });

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final startTime = DateTime.now();
    
    // Store start time for latency calculation
    options.extra['start_time'] = startTime;
    options.extra['request_id'] = _generateRequestId();

    if (kDebugMode) {
      _printRequest(options);
    }

    await _logApiRequest(options, startTime);
    
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) async {
    final endTime = DateTime.now();
    final startTime = response.requestOptions.extra['start_time'] as DateTime?;
    final duration = startTime != null 
        ? endTime.difference(startTime).inMilliseconds 
        : null;

    if (kDebugMode) {
      _printResponse(response, duration);
    }

    await _logApiResponse(response, endTime, duration);
    
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final endTime = DateTime.now();
    final startTime = err.requestOptions.extra['start_time'] as DateTime?;
    final duration = startTime != null 
        ? endTime.difference(startTime).inMilliseconds 
        : null;

    if (kDebugMode) {
      _printError(err, duration);
    }

    await _logApiError(err, endTime, duration);
    
    handler.next(err);
  }

  /// Generate unique request ID for tracking
  String _generateRequestId() {
    return DateTime.now().microsecondsSinceEpoch.toString();
  }

  /// Debug print request details
  void _printRequest(RequestOptions options) {
    print('\n╭──────────────────────────────────────────────────────────');
    print('│ 🚀 API Request [${options.extra['request_id']}]');
    print('├──────────────────────────────────────────────────────────');
    print('│ ${options.method.toUpperCase()} ${options.uri}');
    
    if (logHeaders && options.headers.isNotEmpty) {
      print('├─ Headers:');
      _printHeaders(options.headers);
    }

    if (logRequestBody && options.data != null) {
      print('├─ Body:');
      print('│ ${_formatData(options.data)}');
    }
    
    print('╰──────────────────────────────────────────────────────────\n');
  }

  /// Debug print response details
  void _printResponse(Response response, int? duration) {
    final statusCode = response.statusCode ?? 0;
    final statusEmoji = _getStatusEmoji(statusCode);
    
    print('\n╭──────────────────────────────────────────────────────────');
    print('│ $statusEmoji API Response [${response.requestOptions.extra['request_id']}]');
    print('├──────────────────────────────────────────────────────────');
    print('│ ${response.requestOptions.method.toUpperCase()} ${response.requestOptions.uri}');
    print('│ Status: $statusCode ${response.statusMessage ?? ''}');
    
    if (duration != null) {
      print('│ Duration: ${duration}ms');
    }

    if (logHeaders && response.headers.map.isNotEmpty) {
      print('├─ Headers:');
      _printHeaders(response.headers.map);
    }

    if (logResponseBody && response.data != null) {
      print('├─ Body:');
      print('│ ${_formatData(response.data)}');
    }
    
    print('╰──────────────────────────────────────────────────────────\n');
  }

  /// Debug print error details
  void _printError(DioException error, int? duration) {
    print('\n╭──────────────────────────────────────────────────────────');
    print('│ ❌ API Error [${error.requestOptions.extra['request_id']}]');
    print('├──────────────────────────────────────────────────────────');
    print('│ ${error.requestOptions.method.toUpperCase()} ${error.requestOptions.uri}');
    print('│ Type: ${error.type}');
    print('│ Message: ${error.message}');
    
    if (duration != null) {
      print('│ Duration: ${duration}ms');
    }

    if (error.response != null) {
      print('│ Status: ${error.response!.statusCode}');
      
      if (logResponseBody && error.response!.data != null) {
        print('├─ Response Body:');
        print('│ ${_formatData(error.response!.data)}');
      }
    }
    
    print('╰──────────────────────────────────────────────────────────\n');
  }

  /// Get emoji for HTTP status codes
  String _getStatusEmoji(int statusCode) {
    if (statusCode >= 200 && statusCode < 300) return '✅';
    if (statusCode >= 300 && statusCode < 400) return '↩️';
    if (statusCode >= 400 && statusCode < 500) return '⚠️';
    if (statusCode >= 500) return '💥';
    return '❓';
  }

  /// Print headers with sensitive data redaction
  void _printHeaders(Map<String, dynamic> headers) {
    headers.forEach((key, value) {
      final redactedValue = _shouldRedactHeader(key) ? '[REDACTED]' : value;
      print('│   $key: $redactedValue');
    });
  }

  /// Check if header should be redacted for security
  bool _shouldRedactHeader(String headerName) {
    return sensitiveHeaders.any((sensitive) => 
        headerName.toLowerCase().contains(sensitive.toLowerCase()));
  }

  /// Format data for logging with length limits
  String _formatData(dynamic data) {
    try {
      String formatted;
      
      if (data is Map || data is List) {
        formatted = jsonEncode(data);
      } else {
        formatted = data.toString();
      }

      // Truncate if too long
      if (formatted.length > maxLogLength) {
        formatted = '${formatted.substring(0, maxLogLength)}... [TRUNCATED]';
      }

      // Redact potential sensitive data patterns
      formatted = _redactSensitiveData(formatted);

      return formatted;
    } catch (e) {
      return '[UNABLE TO FORMAT DATA: $e]';
    }
  }

  /// Redact sensitive data patterns in logs
  String _redactSensitiveData(String data) {
    // Redact potential tokens, keys, and medical data
    final patterns = [
      RegExp(r'"token":\s*"[^"]*"', caseSensitive: false),
      RegExp(r'"password":\s*"[^"]*"', caseSensitive: false),
      RegExp(r'"key":\s*"[^"]*"', caseSensitive: false),
      RegExp(r'"secret":\s*"[^"]*"', caseSensitive: false),
      RegExp(r'"authorization":\s*"[^"]*"', caseSensitive: false),
      RegExp(r'"encrypted_data":\s*"[^"]*"', caseSensitive: false),
    ];

    String redacted = data;
    for (final pattern in patterns) {
      redacted = redacted.replaceAllMapped(pattern, (match) {
        final key = match.group(0)!.split(':')[0];
        return '$key: "[REDACTED]"';
      });
    }

    return redacted;
  }

  /// Log API request for audit trail
  Future<void> _logApiRequest(RequestOptions options, DateTime timestamp) async {
    await LocalAuditLogger.logSecurityEvent(
      'api_request_initiated',
      additionalData: {
        'request_id': options.extra['request_id'],
        'method': options.method.toUpperCase(),
        'url': options.uri.toString(),
        'path': options.path,
        'content_type': options.contentType,
        'has_body': options.data != null,
        'body_size_bytes': _getDataSize(options.data),
        'headers_count': options.headers.length,
        'timestamp': timestamp.toIso8601String(),
      },
    );
  }

  /// Log API response for audit trail
  Future<void> _logApiResponse(Response response, DateTime timestamp, int? duration) async {
    await LocalAuditLogger.logSecurityEvent(
      'api_response_received',
      additionalData: {
        'request_id': response.requestOptions.extra['request_id'],
        'method': response.requestOptions.method.toUpperCase(),
        'url': response.requestOptions.uri.toString(),
        'status_code': response.statusCode,
        'status_message': response.statusMessage,
        'response_size_bytes': _getDataSize(response.data),
        'headers_count': response.headers.map.length,
        'duration_ms': duration,
        'timestamp': timestamp.toIso8601String(),
      },
    );
  }

  /// Log API error for audit trail
  Future<void> _logApiError(DioException error, DateTime timestamp, int? duration) async {
    await LocalAuditLogger.logSecurityEvent(
      'api_request_failed',
      additionalData: {
        'request_id': error.requestOptions.extra['request_id'],
        'method': error.requestOptions.method.toUpperCase(),
        'url': error.requestOptions.uri.toString(),
        'error_type': error.type.toString(),
        'error_message': error.message,
        'status_code': error.response?.statusCode,
        'response_size_bytes': _getDataSize(error.response?.data),
        'duration_ms': duration,
        'timestamp': timestamp.toIso8601String(),
      },
    );
  }

  /// Calculate data size for logging
  int _getDataSize(dynamic data) {
    if (data == null) return 0;
    
    try {
      if (data is String) {
        return data.length;
      } else if (data is Map || data is List) {
        return jsonEncode(data).length;
      } else {
        return data.toString().length;
      }
    } catch (e) {
      return 0;
    }
  }
}