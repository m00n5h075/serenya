import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:crypto/crypto.dart';
import '../../core/utils/encryption_utils.dart';
import '../../core/security/device_key_manager.dart';
import '../../core/security/local_audit_logger.dart';

/// Encryption interceptor for sensitive medical data
/// 
/// Handles:
/// - Automatic encryption of sensitive request data
/// - Decryption of encrypted response data  
/// - Key derivation for table-specific encryption
/// - Encryption metadata and integrity verification
/// - Audit logging for encryption operations
class EncryptionInterceptor extends Interceptor {
  
  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    try {
      // Check if request contains sensitive data that needs encryption
      if (_shouldEncryptRequest(options)) {
        await _encryptRequestData(options);
      }

      handler.next(options);
    } catch (e) {
      if (kDebugMode) {
        print('Encryption interceptor request error: $e');
      }
      
      await LocalAuditLogger.logSecurityEvent(
        'api_encryption_request_failed',
        additionalData: {
          'url': options.uri.toString(),
          'method': options.method,
          'error': e.toString(),
          'timestamp': DateTime.now().toIso8601String(),
        },
      );

      handler.reject(
        DioException(
          requestOptions: options,
          error: 'Request encryption failed: $e',
          type: DioExceptionType.unknown,
        ),
      );
    }
  }

  @override
  void onResponse(
    Response response,
    ResponseInterceptorHandler handler,
  ) async {
    try {
      // Check if response contains encrypted data
      if (_shouldDecryptResponse(response)) {
        await _decryptResponseData(response);
      }

      handler.next(response);
    } catch (e) {
      if (kDebugMode) {
        print('Encryption interceptor response error: $e');
      }

      await LocalAuditLogger.logSecurityEvent(
        'api_decryption_response_failed',
        additionalData: {
          'url': response.requestOptions.uri.toString(),
          'method': response.requestOptions.method,
          'status_code': response.statusCode,
          'error': e.toString(),
          'timestamp': DateTime.now().toIso8601String(),
        },
      );

      handler.reject(
        DioException(
          requestOptions: response.requestOptions,
          response: response,
          error: 'Response decryption failed: $e',
          type: DioExceptionType.unknown,
        ),
      );
    }
  }

  /// Determine if request data should be encrypted
  bool _shouldEncryptRequest(RequestOptions options) {
    // Encrypt data for endpoints that handle sensitive medical information
    const encryptedEndpoints = [
      '/documents/upload',
      '/documents/batch-upload',
      '/chat/messages',
      '/reports/generate',
    ];

    return encryptedEndpoints.any((endpoint) => 
        options.path.startsWith(endpoint));
  }

  /// Determine if response data should be decrypted
  bool _shouldDecryptResponse(Response response) {
    // Check for encryption metadata in response headers
    final hasEncryptionMetadata = response.headers.value('X-Encryption-Version') != null;
    
    // Check if response data contains encrypted fields
    final responseData = response.data;
    if (responseData is Map<String, dynamic>) {
      return hasEncryptionMetadata || 
             responseData.containsKey('encrypted_data') ||
             responseData.containsKey('encryption_metadata');
    }

    return false;
  }

  /// Encrypt sensitive request data
  Future<void> _encryptRequestData(RequestOptions options) async {
    final originalData = options.data;
    
    if (originalData == null) return;

    // Determine table context for key derivation
    final tableContext = _getTableContextForEndpoint(options.path);
    
    // Get table-specific encryption key
    final encryptionKey = await TableKeyManager.getTableKeyForEncryption(tableContext);
    
    // Encrypt the sensitive data
    final encryptedData = await _encryptData(originalData, encryptionKey, tableContext);
    
    // Replace request data with encrypted version
    options.data = encryptedData;
    
    // Add encryption headers
    options.headers['X-Encryption-Version'] = 'v1';
    options.headers['X-Table-Context'] = tableContext;
    options.headers['Content-Type'] = 'application/json; charset=utf-8';

    await LocalAuditLogger.logSecurityEvent(
      'api_request_encrypted',
      additionalData: {
        'url': options.uri.toString(),
        'method': options.method,
        'table_context': tableContext,
        'data_size_bytes': _getDataSize(originalData),
        'timestamp': DateTime.now().toIso8601String(),
      },
    );
  }

  /// Decrypt encrypted response data
  Future<void> _decryptResponseData(Response response) async {
    final responseData = response.data;
    
    if (responseData is! Map<String, dynamic>) return;

    // Extract encryption metadata
    final encryptionMetadata = responseData['encryption_metadata'] as Map<String, dynamic>?;
    final encryptedData = responseData['encrypted_data'] as String?;
    
    if (encryptionMetadata == null || encryptedData == null) return;

    // Get decryption parameters
    final tableContext = encryptionMetadata['table_key_id'] as String;
    final algorithm = encryptionMetadata['algorithm'] as String;
    final checksum = encryptionMetadata['checksum'] as String;

    // Validate encryption algorithm
    if (algorithm != 'AES-256-GCM') {
      throw UnsupportedError('Unsupported encryption algorithm: $algorithm');
    }

    // Get table-specific decryption key
    final decryptionKey = await TableKeyManager.getTableKeyForEncryption(tableContext);
    
    // Decrypt the data
    final decryptedData = await _decryptData(encryptedData, decryptionKey, checksum);
    
    // Replace response data with decrypted version
    response.data = decryptedData;

    await LocalAuditLogger.logSecurityEvent(
      'api_response_decrypted',
      additionalData: {
        'url': response.requestOptions.uri.toString(),
        'method': response.requestOptions.method,
        'table_context': tableContext,
        'algorithm': algorithm,
        'timestamp': DateTime.now().toIso8601String(),
      },
    );
  }

  /// Get table context for specific API endpoint
  String _getTableContextForEndpoint(String path) {
    if (path.startsWith('/documents/')) {
      return 'serenya_content';
    } else if (path.startsWith('/chat/')) {
      return 'chat_messages';
    } else if (path.startsWith('/reports/')) {
      return 'serenya_content';
    }
    
    // Default context for other sensitive endpoints
    return 'serenya_content';
  }

  /// Encrypt data using AES-256-GCM
  Future<Map<String, dynamic>> _encryptData(
    dynamic data,
    Uint8List key,
    String tableContext,
  ) async {
    // Serialize data to JSON
    final jsonData = jsonEncode(data);
    final dataBytes = utf8.encode(jsonData);
    
    // Encrypt using AES-256-GCM
    final encryptedBytes = await EncryptionUtils.encryptAES256GCM(dataBytes, key);
    final encryptedBase64 = base64.encode(encryptedBytes);
    
    // Generate checksum for integrity verification
    final checksum = sha256.convert(dataBytes).toString();
    
    return {
      'encrypted_data': encryptedBase64,
      'encryption_metadata': {
        'version': 'v1',
        'algorithm': 'AES-256-GCM',
        'table_key_id': tableContext,
        'checksum': checksum,
        'timestamp': DateTime.now().toIso8601String(),
      }
    };
  }

  /// Decrypt data and verify integrity
  Future<dynamic> _decryptData(
    String encryptedBase64,
    Uint8List key,
    String expectedChecksum,
  ) async {
    // Decode from base64
    final encryptedBytes = base64.decode(encryptedBase64);
    
    // Decrypt using AES-256-GCM
    final decryptedBytes = await EncryptionUtils.decryptAES256GCM(encryptedBytes, key);
    
    // Verify data integrity
    final actualChecksum = sha256.convert(decryptedBytes).toString();
    if (actualChecksum != expectedChecksum) {
      throw SecurityException('Data integrity verification failed');
    }
    
    // Parse JSON data
    final jsonData = utf8.decode(decryptedBytes);
    return jsonDecode(jsonData);
  }

  /// Get data size for logging
  int _getDataSize(dynamic data) {
    if (data == null) return 0;
    
    try {
      final jsonString = jsonEncode(data);
      return utf8.encode(jsonString).length;
    } catch (e) {
      return 0;
    }
  }
}

/// Security exception for encryption errors
class SecurityException implements Exception {
  final String message;
  
  SecurityException(this.message);
  
  @override
  String toString() => 'SecurityException: $message';
}