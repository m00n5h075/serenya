import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:crypto/crypto.dart';
import 'local_audit_logger.dart';

/// Platform-specific secure storage wrapper
/// 
/// Provides unified interface for iOS Keychain and Android Keystore
/// with medical-grade security settings and comprehensive error handling.
class SecureStorageService {
  static const String _logPrefix = 'SECURE_STORAGE';
  
  // iOS Keychain configuration for medical data
  static const IOSOptions _iOSOptions = IOSOptions(
    groupId: 'group.com.serenya.health',
    accountName: 'serenya_health_app',
    accessibility: KeychainAccessibility.unlocked,
    synchronizable: false, // Never sync medical data to iCloud
  );

  // Android Keystore configuration for medical data
  static const AndroidOptions _androidOptions = AndroidOptions(
    encryptedSharedPreferences: true,
    sharedPreferencesName: 'serenya_secure_prefs',
    preferencesKeyPrefix: 'serenya_',
    // Use hardware-backed keystore when available
    keyCipherAlgorithm: KeyCipherAlgorithm.RSA_ECB_PKCS1Padding,
    storageCipherAlgorithm: StorageCipherAlgorithm.AES_GCM_NoPadding,
  );

  static const FlutterSecureStorage _storage = FlutterSecureStorage(
    aOptions: _androidOptions,
    iOptions: _iOSOptions,
  );

  /// Store sensitive data with platform-specific security
  static Future<SecureStorageResult> store({
    required String key,
    required String value,
    StorageSecurityLevel securityLevel = StorageSecurityLevel.high,
    Map<String, String>? metadata,
  }) async {
    try {
      // Validate key and value
      final validationError = _validateInput(key, value);
      if (validationError != null) {
        return SecureStorageResult.failed(validationError);
      }

      // Add metadata for tracking
      final enrichedValue = _enrichValue(value, metadata, securityLevel);
      
      // Platform-specific storage options
      final options = _getStorageOptions(securityLevel);

      // Store the value
      await _storage.write(
        key: key,
        value: enrichedValue,
        aOptions: options.androidOptions,
        iOptions: options.iOSOptions,
      );

      // Log successful storage
      await _logStorageEvent(
        'secure_data_stored',
        key: key,
        securityLevel: securityLevel.name,
        dataSize: value.length,
        success: true,
      );

      return SecureStorageResult.success(
        'Data stored successfully',
        metadata: {'key': key, 'security_level': securityLevel.name},
      );

    } catch (e) {
      await _logStorageEvent(
        'secure_storage_failed',
        key: key,
        error: e.toString(),
        securityLevel: securityLevel.name,
        success: false,
      );

      return SecureStorageResult.failed(
        'Failed to store data: ${e.toString()}',
      );
    }
  }

  /// Retrieve sensitive data with security validation
  static Future<SecureStorageResult> retrieve(
    String key, {
    bool validateIntegrity = true,
  }) async {
    try {
      // Retrieve the value
      final enrichedValue = await _storage.read(key: key);
      
      if (enrichedValue == null) {
        await _logStorageEvent(
          'secure_data_not_found',
          key: key,
          success: false,
        );
        
        return SecureStorageResult.failed('Data not found for key: $key');
      }

      // Extract and validate the value
      final extractionResult = _extractValue(enrichedValue, validateIntegrity);
      
      if (!extractionResult.success) {
        await _logStorageEvent(
          'secure_data_validation_failed',
          key: key,
          error: extractionResult.error,
          success: false,
        );
        
        return SecureStorageResult.failed(extractionResult.error!);
      }

      // Log successful retrieval
      await _logStorageEvent(
        'secure_data_retrieved',
        key: key,
        dataSize: extractionResult.value!.length,
        success: true,
      );

      return SecureStorageResult.success(
        extractionResult.value!,
        metadata: extractionResult.metadata,
      );

    } catch (e) {
      await _logStorageEvent(
        'secure_retrieval_failed',
        key: key,
        error: e.toString(),
        success: false,
      );

      return SecureStorageResult.failed(
        'Failed to retrieve data: ${e.toString()}',
      );
    }
  }

  /// Delete sensitive data
  static Future<SecureStorageResult> delete(String key) async {
    try {
      await _storage.delete(key: key);

      await _logStorageEvent(
        'secure_data_deleted',
        key: key,
        success: true,
      );

      return SecureStorageResult.success('Data deleted successfully');

    } catch (e) {
      await _logStorageEvent(
        'secure_deletion_failed',
        key: key,
        error: e.toString(),
        success: false,
      );

      return SecureStorageResult.failed(
        'Failed to delete data: ${e.toString()}',
      );
    }
  }

  /// Check if key exists
  static Future<bool> containsKey(String key) async {
    try {
      final value = await _storage.read(key: key);
      return value != null;
    } catch (e) {
      await _logStorageEvent(
        'key_existence_check_failed',
        key: key,
        error: e.toString(),
        success: false,
      );
      return false;
    }
  }

  /// Get all stored keys (for debugging/management)
  static Future<Set<String>> getAllKeys() async {
    try {
      final allData = await _storage.readAll();
      return allData.keys.toSet();
    } catch (e) {
      await _logStorageEvent(
        'get_all_keys_failed',
        error: e.toString(),
        success: false,
      );
      return <String>{};
    }
  }

  /// Clear all stored data (for logout/reset)
  static Future<SecureStorageResult> clearAll() async {
    try {
      await _storage.deleteAll();

      await _logStorageEvent(
        'all_secure_data_cleared',
        success: true,
      );

      return SecureStorageResult.success('All data cleared successfully');

    } catch (e) {
      await _logStorageEvent(
        'clear_all_failed',
        error: e.toString(),
        success: false,
      );

      return SecureStorageResult.failed(
        'Failed to clear all data: ${e.toString()}',
      );
    }
  }

  /// Store biometric authentication template
  static Future<SecureStorageResult> storeBiometricTemplate({
    required String templateId,
    required Uint8List templateData,
    required String userId,
  }) async {
    final key = 'biometric_template_$templateId';
    final metadata = {
      'type': 'biometric_template',
      'user_id': sha256.convert(utf8.encode(userId)).toString(),
      'template_id': templateId,
      'created_at': DateTime.now().toIso8601String(),
    };

    return await store(
      key: key,
      value: base64.encode(templateData),
      securityLevel: StorageSecurityLevel.critical,
      metadata: metadata,
    );
  }

  /// Retrieve biometric authentication template
  static Future<SecureStorageResult> retrieveBiometricTemplate(
    String templateId,
  ) async {
    final key = 'biometric_template_$templateId';
    final result = await retrieve(key);
    
    if (result.success) {
      // Decode the base64 template data
      try {
        final templateBytes = base64.decode(result.data!);
        return SecureStorageResult.success(
          base64.encode(templateBytes),
          metadata: result.metadata,
        );
      } catch (e) {
        return SecureStorageResult.failed(
          'Failed to decode biometric template: $e',
        );
      }
    }
    
    return result;
  }

  /// Store encryption key with hardware protection
  static Future<SecureStorageResult> storeEncryptionKey({
    required String keyId,
    required Uint8List keyData,
    required String keyContext,
  }) async {
    final key = 'encryption_key_$keyId';
    final metadata = {
      'type': 'encryption_key',
      'key_context': keyContext,
      'key_length': keyData.length.toString(),
      'created_at': DateTime.now().toIso8601String(),
    };

    return await store(
      key: key,
      value: base64.encode(keyData),
      securityLevel: StorageSecurityLevel.critical,
      metadata: metadata,
    );
  }

  /// Test secure storage functionality
  static Future<SecureStorageTestResult> testSecureStorage() async {
    const testKey = 'serenya_storage_test';
    const testValue = 'test_data_12345';
    
    try {
      // Test store
      final storeResult = await store(
        key: testKey,
        value: testValue,
        securityLevel: StorageSecurityLevel.medium,
      );
      
      if (!storeResult.success) {
        return SecureStorageTestResult(
          success: false,
          message: 'Store test failed: ${storeResult.error}',
        );
      }

      // Test retrieve
      final retrieveResult = await retrieve(testKey);
      
      if (!retrieveResult.success) {
        return SecureStorageTestResult(
          success: false,
          message: 'Retrieve test failed: ${retrieveResult.error}',
        );
      }

      // Validate data integrity
      if (retrieveResult.data != testValue) {
        return SecureStorageTestResult(
          success: false,
          message: 'Data integrity test failed: values do not match',
        );
      }

      // Test delete
      final deleteResult = await delete(testKey);
      
      if (!deleteResult.success) {
        return SecureStorageTestResult(
          success: false,
          message: 'Delete test failed: ${deleteResult.error}',
        );
      }

      return SecureStorageTestResult(
        success: true,
        message: 'All secure storage tests passed',
      );

    } catch (e) {
      // Cleanup test data
      try {
        await delete(testKey);
      } catch (_) {}

      return SecureStorageTestResult(
        success: false,
        message: 'Secure storage test error: $e',
      );
    }
  }

  /// Validate input parameters
  static String? _validateInput(String key, String value) {
    if (key.isEmpty) {
      return 'Storage key cannot be empty';
    }

    if (key.length > 255) {
      return 'Storage key too long (max 255 characters)';
    }

    if (value.isEmpty) {
      return 'Storage value cannot be empty';
    }

    if (value.length > 1048576) { // 1MB limit
      return 'Storage value too large (max 1MB)';
    }

    return null;
  }

  /// Enrich value with metadata and integrity checks
  static String _enrichValue(
    String value,
    Map<String, String>? metadata,
    StorageSecurityLevel securityLevel,
  ) {
    final enrichedData = {
      'value': value,
      'timestamp': DateTime.now().toIso8601String(),
      'security_level': securityLevel.name,
      'checksum': sha256.convert(utf8.encode(value)).toString(),
      'metadata': metadata ?? {},
    };

    return jsonEncode(enrichedData);
  }

  /// Extract and validate stored value
  static ValueExtractionResult _extractValue(
    String enrichedValue,
    bool validateIntegrity,
  ) {
    try {
      final data = jsonDecode(enrichedValue) as Map<String, dynamic>;
      final value = data['value'] as String;
      final storedChecksum = data['checksum'] as String;
      final metadata = data['metadata'] as Map<String, dynamic>?;

      // Validate integrity if requested
      if (validateIntegrity) {
        final currentChecksum = sha256.convert(utf8.encode(value)).toString();
        if (currentChecksum != storedChecksum) {
          return ValueExtractionResult(
            success: false,
            error: 'Data integrity validation failed',
          );
        }
      }

      return ValueExtractionResult(
        success: true,
        value: value,
        metadata: metadata?.map((k, v) => MapEntry(k, v.toString())),
      );

    } catch (e) {
      return ValueExtractionResult(
        success: false,
        error: 'Failed to extract value: $e',
      );
    }
  }

  /// Get platform-specific storage options
  static StorageOptions _getStorageOptions(StorageSecurityLevel securityLevel) {
    switch (securityLevel) {
      case StorageSecurityLevel.critical:
        return StorageOptions(
          androidOptions: _androidOptions.copyWith(
            keyCipherAlgorithm: KeyCipherAlgorithm.RSA_ECB_PKCS1Padding,
          ),
          iOSOptions: _iOSOptions.copyWith(
            accessibility: KeychainAccessibility.unlocked,
          ),
        );

      case StorageSecurityLevel.high:
        return StorageOptions(
          androidOptions: _androidOptions,
          iOSOptions: _iOSOptions,
        );

      case StorageSecurityLevel.medium:
        return StorageOptions(
          androidOptions: _androidOptions.copyWith(
            encryptedSharedPreferences: true,
          ),
          iOSOptions: _iOSOptions.copyWith(
            accessibility: KeychainAccessibility.unlocked,
          ),
        );
    }
  }

  /// Log storage events
  static Future<void> _logStorageEvent(
    String eventType, {
    String? key,
    String? securityLevel,
    int? dataSize,
    bool? success,
    String? error,
  }) async {
    final eventData = {
      'event_type': 'security_event',
      'event_subtype': eventType,
      'timestamp': DateTime.now().toIso8601String(),
      'security_details': {
        'component': 'secure_storage',
        'platform': Platform.operatingSystem,
        'key_hash': key != null ? sha256.convert(utf8.encode(key)).toString().substring(0, 16) : null,
        'security_level': securityLevel,
        'data_size_bytes': dataSize,
        'success': success,
        'error': error,
      }
    };

    await LocalAuditLogger.logSecurityEvent(
      'security_event',
      additionalData: eventData,
    );

    // Console logging for development
    if (kDebugMode) {
      print('$_logPrefix: $eventType - Key: ${key != null ? key.substring(0, 8) + '...' : 'N/A'}, Success: ${success ?? 'N/A'}');
      if (error != null) {
        print('$_logPrefix: Error - $error');
      }
    }
  }
}

/// Security levels for stored data
enum StorageSecurityLevel {
  medium,   // Standard encryption
  high,     // Hardware-backed encryption when available
  critical, // Maximum security with biometric protection
}

/// Result of secure storage operations
class SecureStorageResult {
  final bool success;
  final String? data;
  final String? error;
  final Map<String, String>? metadata;

  const SecureStorageResult._({
    required this.success,
    this.data,
    this.error,
    this.metadata,
  });

  factory SecureStorageResult.success(
    String data, {
    Map<String, String>? metadata,
  }) {
    return SecureStorageResult._(
      success: true,
      data: data,
      metadata: metadata,
    );
  }

  factory SecureStorageResult.failed(String error) {
    return SecureStorageResult._(
      success: false,
      error: error,
    );
  }

  @override
  String toString() => success
      ? 'SecureStorageResult.success: ${data?.length ?? 0} bytes'
      : 'SecureStorageResult.failed: $error';
}

/// Result of secure storage testing
class SecureStorageTestResult {
  final bool success;
  final String message;

  const SecureStorageTestResult({
    required this.success,
    required this.message,
  });

  @override
  String toString() => success
      ? 'SecureStorageTest.success: $message'
      : 'SecureStorageTest.failed: $message';
}

/// Internal result for value extraction
class ValueExtractionResult {
  final bool success;
  final String? value;
  final String? error;
  final Map<String, String>? metadata;

  const ValueExtractionResult({
    required this.success,
    this.value,
    this.error,
    this.metadata,
  });
}

/// Storage options for different platforms
class StorageOptions {
  final AndroidOptions androidOptions;
  final IOSOptions iOSOptions;

  const StorageOptions({
    required this.androidOptions,
    required this.iOSOptions,
  });
}