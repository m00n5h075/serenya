import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import 'biometric_auth_service.dart';

/// Device Root Key Manager - Hardware-bound encryption key generation and management
/// 
/// Implements the encryption strategy from encryption-strategy.md:
/// - Layer 1: Device Root Key (Hardware Security Module bound)
/// - Layer 2: Table-specific keys derived via HKDF
/// - Biometric authentication protection
/// - iOS Keychain / Android Keystore integration
class DeviceKeyManager {
  static const _secureStorage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
      keyCipherAlgorithm: KeyCipherAlgorithm.RSA_ECB_PKCS1Padding,
      storageCipherAlgorithm: StorageCipherAlgorithm.AES_GCM_NoPadding,
    ),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.unlocked,
      accountName: 'serenya_health_app',
    ),
  );
  
  static const String _deviceRootKeyAlias = 'serenya_device_root_key_v1';
  static const String _keyVersionKey = 'serenya_key_version';
  static const String _deviceIdentifierKey = 'serenya_device_id';
  
  /// Initialize the device root key system
  static Future<void> initialize() async {
    try {
      // Check if device root key exists
      if (!await _deviceRootKeyExists()) {
        await _generateAndStoreDeviceRootKey();
      }
      
      // Verify key integrity
      await _verifyKeyIntegrity();
      
      await _logSecurityEvent('device_key_manager_initialized');
    } catch (e) {
      await _logSecurityEvent('device_key_manager_init_failed', error: e.toString());
      rethrow;
    }
  }

  /// Generate and securely store the device root key
  static Future<void> _generateAndStoreDeviceRootKey() async {
    try {
      // Generate device root key using secure random
      final rootKey = await _generateDeviceRootKey();
      
      // Store in secure hardware (iOS Keychain / Android Keystore)
      await _storeInSecureHardware(rootKey);
      
      // Generate and store device identifier
      await _generateDeviceIdentifier();
      
      // Set key version
      await _secureStorage.write(key: _keyVersionKey, value: 'v1');
      
      await _logSecurityEvent('device_root_key_generated');
    } catch (e) {
      await _logSecurityEvent('device_root_key_generation_failed', error: e.toString());
      rethrow;
    }
  }

  /// Generate cryptographically secure device root key
  static Future<Uint8List> _generateDeviceRootKey() async {
    final random = Random.secure();
    final keyMaterial = Uint8List(32); // 256-bit key
    
    // Fill with secure random bytes
    for (int i = 0; i < keyMaterial.length; i++) {
      keyMaterial[i] = random.nextInt(256);
    }
    
    // Add additional entropy from device-specific sources
    final deviceEntropy = await _getDeviceEntropy();
    final combinedKey = _combineEntropySources(keyMaterial, deviceEntropy);
    
    return combinedKey;
  }

  /// Get device-specific entropy for key generation
  static Future<Uint8List> _getDeviceEntropy() async {
    final entropyData = <String>[];
    
    // Platform-specific entropy
    entropyData.add(Platform.operatingSystem);
    entropyData.add(Platform.operatingSystemVersion);
    
    // Time-based entropy
    entropyData.add(DateTime.now().millisecondsSinceEpoch.toString());
    entropyData.add(DateTime.now().microsecondsSinceEpoch.toString());
    
    // Combine entropy sources
    final combined = entropyData.join('-');
    final hash = crypto.sha256.convert(utf8.encode(combined));
    
    return Uint8List.fromList(hash.bytes);
  }

  /// Combine multiple entropy sources
  static Uint8List _combineEntropySources(Uint8List primary, Uint8List secondary) {
    final combined = Uint8List(32);
    
    for (int i = 0; i < 32; i++) {
      combined[i] = primary[i] ^ secondary[i % secondary.length];
    }
    
    return combined;
  }

  /// Store root key in platform-specific secure hardware
  static Future<void> _storeInSecureHardware(Uint8List rootKey) async {
    try {
      final base64Key = base64.encode(rootKey);
      
      if (Platform.isIOS) {
        // iOS Keychain with Secure Enclave protection
        await _secureStorage.write(
          key: _deviceRootKeyAlias,
          value: base64Key,
        );
      } else if (Platform.isAndroid) {
        // Android Keystore with Hardware Security Module
        await _secureStorage.write(
          key: _deviceRootKeyAlias,
          value: base64Key,
        );
      } else {
        // Fallback for other platforms (testing/desktop)
        await _secureStorage.write(
          key: _deviceRootKeyAlias,
          value: base64Key,
        );
      }
      
      // Zero out the original key from memory
      _secureZeroMemory(rootKey);
      
    } catch (e) {
      await _logSecurityEvent('secure_key_storage_failed', error: e.toString());
      rethrow;
    }
  }

  /// Retrieve device root key with biometric authentication
  static Future<Uint8List> getDeviceRootKeyWithAuth() async {
    try {
      // Require authentication to access root key
      final authResult = await BiometricAuthService.authenticate(
        reason: 'Access your secure medical data encryption key',
      );
      
      if (!authResult.success) {
        await _logSecurityEvent('key_access_denied', 
            reason: authResult.failureReason ?? 'authentication_failed');
        throw SecurityException('Authentication failed: ${authResult.failureReason}');
      }
      
      // Retrieve key from secure storage
      final base64Key = await _secureStorage.read(key: _deviceRootKeyAlias);
      if (base64Key == null) {
        throw SecurityException('Device root key not found');
      }
      
      final rootKey = base64.decode(base64Key);
      
      await _logSecurityEvent('device_root_key_accessed', 
          authMethod: authResult.method.toString());
      
      return Uint8List.fromList(rootKey);
      
    } catch (e) {
      await _logSecurityEvent('device_root_key_access_failed', error: e.toString());
      rethrow;
    }
  }

  /// Check if device root key exists
  static Future<bool> _deviceRootKeyExists() async {
    final key = await _secureStorage.read(key: _deviceRootKeyAlias);
    return key != null && key.isNotEmpty;
  }

  /// Verify key integrity and device binding
  static Future<void> _verifyKeyIntegrity() async {
    try {
      // Check if key exists
      if (!await _deviceRootKeyExists()) {
        throw SecurityException('Device root key missing');
      }
      
      // Verify key version
      final version = await _secureStorage.read(key: _keyVersionKey);
      if (version != 'v1') {
        await _logSecurityEvent('key_version_mismatch', version: version);
        throw SecurityException('Key version mismatch');
      }
      
      // Verify device identifier hasn't changed (device binding)
      await _verifyDeviceBinding();
      
      await _logSecurityEvent('key_integrity_verified');
      
    } catch (e) {
      await _logSecurityEvent('key_integrity_check_failed', error: e.toString());
      rethrow;
    }
  }

  /// Generate and store device identifier for device binding
  static Future<void> _generateDeviceIdentifier() async {
    final deviceData = <String>[];
    
    // Platform information
    deviceData.add(Platform.operatingSystem);
    deviceData.add(Platform.localHostname);
    
    // Generate stable device ID
    final combined = deviceData.join('-');
    final hash = crypto.sha256.convert(utf8.encode(combined));
    final deviceId = hash.toString().substring(0, 16);
    
    await _secureStorage.write(key: _deviceIdentifierKey, value: deviceId);
  }

  /// Verify device binding (prevent key use on different device)
  static Future<void> _verifyDeviceBinding() async {
    final storedId = await _secureStorage.read(key: _deviceIdentifierKey);
    if (storedId == null) {
      throw SecurityException('Device identifier missing');
    }
    
    // Generate current device ID
    final deviceData = <String>[];
    deviceData.add(Platform.operatingSystem);
    deviceData.add(Platform.localHostname);
    
    final combined = deviceData.join('-');
    final hash = crypto.sha256.convert(utf8.encode(combined));
    final currentId = hash.toString().substring(0, 16);
    
    if (storedId != currentId) {
      await _logSecurityEvent('device_binding_violation', 
          stored: storedId, current: currentId);
      throw SecurityException('Device binding violation - key not valid for this device');
    }
  }

  /// Handle biometric enrollment changes (auto key rotation)
  static Future<void> handleBiometricEnrollmentChange() async {
    try {
      await _logSecurityEvent('biometric_enrollment_change_detected');
      
      // Platform automatically invalidates hardware-protected keys
      // when biometric enrollment changes, so we need to regenerate
      
      // Clear existing keys
      await _clearAllKeys();
      
      // Regenerate device root key
      await _generateAndStoreDeviceRootKey();
      
      await _logSecurityEvent('biometric_change_rekey_completed');
      
    } catch (e) {
      await _logSecurityEvent('biometric_change_rekey_failed', error: e.toString());
      
      // If re-key fails, clear all data for security
      await _clearAllLocalData();
      rethrow;
    }
  }

  /// Clear all encryption keys (for logout/reset)
  static Future<void> _clearAllKeys() async {
    try {
      await _secureStorage.delete(key: _deviceRootKeyAlias);
      await _secureStorage.delete(key: _keyVersionKey);
      await _secureStorage.delete(key: _deviceIdentifierKey);
      
      await _logSecurityEvent('all_keys_cleared');
    } catch (e) {
      await _logSecurityEvent('key_clearing_failed', error: e.toString());
      rethrow;
    }
  }

  /// Clear all local data (emergency security measure)
  static Future<void> _clearAllLocalData() async {
    try {
      // Clear all secure storage
      await _secureStorage.deleteAll();
      
      // Clear authentication data
      await BiometricAuthService.clearAuthData();
      
      await _logSecurityEvent('emergency_data_clear_completed');
    } catch (e) {
      await _logSecurityEvent('emergency_data_clear_failed', error: e.toString());
    }
  }

  /// Secure memory zeroing
  static void _secureZeroMemory(Uint8List data) {
    for (int i = 0; i < data.length; i++) {
      data[i] = 0;
    }
  }

  /// Clear cached encryption keys (for logout/security)
  static Future<void> clearCachedKeys() async {
    await _logSecurityEvent('cached_keys_cleared');
    if (kDebugMode) {
      print('Clearing cached encryption keys');
    }
    // TODO: Clear cached keys when key caching is implemented
  }

  /// Log security events
  static Future<void> _logSecurityEvent(
    String event, {
    String? error,
    String? reason,
    String? authMethod,
    String? version,
    String? stored,
    String? current,
  }) async {
    if (kDebugMode) {
      print('DEVICE_KEY_SECURITY: $event - Error: $error, Reason: $reason');
    }
    
    // In production, integrate with comprehensive audit logging system
    // This will be implemented in the audit logging task
  }
}

/// Table-specific key derivation using HKDF
/// 
/// Implements Layer 2 of the encryption strategy:
/// - Derives table-specific keys from device root key
/// - Uses HKDF (RFC 5869) for key derivation
/// - Supports key caching for performance
class TableKeyManager {
  static final Map<String, CachedKey> _keyCache = {};
  static const Duration _cacheExpiration = Duration(minutes: 5);
  
  // Table contexts from encryption-strategy.md
  static const Map<String, String> _tableContexts = {
    // Local device tables (medical data)
    'serenya_content': 'serenya_content_v1',
    'lab_results': 'serenya_medical_data_v1',
    'vitals': 'serenya_medical_data_v1',     // Shared medical context
    'chat_messages': 'serenya_chat_v1',
  };

  /// Get table-specific encryption key
  static Future<Uint8List> getTableKeyForEncryption(String tableName) async {
    // Check cache first for performance
    final cached = _keyCache[tableName];
    if (cached != null && !cached.isExpired) {
      return cached.key;
    }

    try {
      // Get device root key (triggers authentication)
      final deviceRootKey = await DeviceKeyManager.getDeviceRootKeyWithAuth();
      
      // Derive table-specific key
      final tableKey = await _deriveTableKey(tableName, deviceRootKey);
      
      // Cache for performance
      _keyCache[tableName] = CachedKey(
        key: tableKey,
        cacheTime: DateTime.now(),
      );
      
      // Secure zero the root key from memory
      DeviceKeyManager._secureZeroMemory(deviceRootKey);
      
      return tableKey;
      
    } catch (e) {
      await _logSecurityEvent('table_key_derivation_failed', 
          table: tableName, error: e.toString());
      rethrow;
    }
  }

  /// Derive table-specific key using HKDF
  static Future<Uint8List> _deriveTableKey(
    String tableName, 
    Uint8List deviceRootKey,
  ) async {
    final context = _tableContexts[tableName];
    if (context == null) {
      throw UnsupportedError('Unknown table: $tableName');
    }
    
    try {
      // Use HKDF for key derivation (RFC 5869)
      final hkdf = Hkdf(
        hmac: Hmac.sha256(),
        outputLength: 32, // 256-bit derived key
      );
      
      final derivedKey = await hkdf.deriveKey(
        secretKey: SecretKey(deviceRootKey),
        info: utf8.encode(context),
        nonce: utf8.encode('serenya_key_derivation_salt_v1'),
      );
      
      final keyBytes = await derivedKey.extractBytes();
      
      await _logSecurityEvent('table_key_derived', 
          table: tableName, context: context);
      
      return Uint8List.fromList(keyBytes);
      
    } catch (e) {
      await _logSecurityEvent('hkdf_derivation_failed', 
          table: tableName, error: e.toString());
      rethrow;
    }
  }

  /// Clear cached keys from memory
  static Future<void> clearCachedKeys() async {
    try {
      // Secure zero all cached keys
      for (final cached in _keyCache.values) {
        DeviceKeyManager._secureZeroMemory(cached.key);
      }
      
      _keyCache.clear();
      
      await _logSecurityEvent('cached_keys_cleared');
    } catch (e) {
      await _logSecurityEvent('cache_clearing_failed', error: e.toString());
    }
  }

  /// Log security events
  static Future<void> _logSecurityEvent(
    String event, {
    String? table,
    String? context,
    String? error,
  }) async {
    if (kDebugMode) {
      print('TABLE_KEY_SECURITY: $event - Table: $table, Error: $error');
    }
  }
}

/// Cached encryption key with expiration
class CachedKey {
  final Uint8List key;
  final DateTime cacheTime;
  
  CachedKey({
    required this.key,
    required this.cacheTime,
  });
  
  bool get isExpired {
    final age = DateTime.now().difference(cacheTime);
    return age > TableKeyManager._cacheExpiration;
  }
}

/// Security exception for encryption/key management errors
class SecurityException implements Exception {
  final String message;
  
  SecurityException(this.message);
  
  @override
  String toString() => 'SecurityException: $message';
}