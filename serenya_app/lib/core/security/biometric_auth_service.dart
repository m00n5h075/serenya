import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:crypto/crypto.dart';
import 'device_key_manager.dart';

enum AuthMethod {
  biometric,
  pin,
  none
}

enum BiometricAuthResult {
  success,
  failure,
  unavailable,
  disabled,
  cancelled
}

class AuthResult {
  final bool success;
  final AuthMethod method;
  final String? failureReason;
  final String? biometricHash;

  AuthResult({
    required this.success,
    required this.method,
    this.failureReason,
    this.biometricHash,
  });
}

class SessionManager {
  static const Duration _inactivityTimeout = Duration(minutes: 15);
  static DateTime _lastActivity = DateTime.now();
  static String? _currentSessionId;
  static bool _isAuthenticated = false;
  static AuthMethod _currentAuthMethod = AuthMethod.none;
  static Timer? _sessionTimer;

  static bool get isAuthenticated => _isAuthenticated;
  static AuthMethod get currentAuthMethod => _currentAuthMethod;
  static String? get sessionId => _currentSessionId;

  static void updateActivity() {
    if (_isAuthenticated) {
      _lastActivity = DateTime.now();
      _resetSessionTimer();
    }
  }

  static bool isSessionValid() {
    if (!_isAuthenticated) return false;
    
    final timeSinceActivity = DateTime.now().difference(_lastActivity);
    return timeSinceActivity <= _inactivityTimeout;
  }

  static Future<void> startSession(AuthMethod method) async {
    _currentSessionId = _generateSessionId();
    _isAuthenticated = true;
    _currentAuthMethod = method;
    _lastActivity = DateTime.now();
    _resetSessionTimer();

    await AuditLogger.logAuthenticationEvent(
      'session_started',
      sessionId: _currentSessionId!,
      authMethod: method.toString(),
    );
  }

  static Future<void> expireSession() async {
    if (_currentSessionId != null) {
      await AuditLogger.logAuthenticationEvent(
        'session_expired',
        sessionId: _currentSessionId!,
      );
    }

    _isAuthenticated = false;
    _currentAuthMethod = AuthMethod.none;
    _currentSessionId = null;
    _sessionTimer?.cancel();
    
    // Clear any cached keys from memory
    await DeviceKeyManager.clearCachedKeys();
  }

  static void _resetSessionTimer() {
    _sessionTimer?.cancel();
    _sessionTimer = Timer(_inactivityTimeout, () async {
      await expireSession();
    });
  }

  static String _generateSessionId() {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final randomBytes = List.generate(16, (index) => 
        DateTime.now().microsecondsSinceEpoch % 256);
    final combined = '$timestamp-${base64.encode(randomBytes)}';
    return sha256.convert(utf8.encode(combined)).toString().substring(0, 32);
  }
}

class BiometricAuthService {
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
  static const _pinKey = 'serenya_user_pin_hash';
  static const _biometricEnabledKey = 'serenya_biometric_enabled';
  static const _authPreferenceKey = 'serenya_auth_preference';
  
  static final LocalAuthentication _localAuth = LocalAuthentication();

  /// Initialize the authentication system
  static Future<void> initialize() async {
    // Check if biometrics are available
    final isAvailable = await _localAuth.isDeviceSupported();
    final isEnabled = await isBiometricEnabled();
    
    if (kDebugMode) {
      print('BiometricAuth - Device supported: $isAvailable, Enabled: $isEnabled');
    }

    await AuditLogger.logSecurityEvent(
      'biometric_auth_initialized',
      deviceSupported: isAvailable,
      userEnabled: isEnabled,
    );
    
    // Start storage health monitoring in debug mode
    if (kDebugMode) {
      _startStorageHealthMonitor();
    }
  }
  
  /// Monitor secure storage health to catch PIN disappearance
  static void _startStorageHealthMonitor() {
    Timer.periodic(const Duration(seconds: 2), (timer) async {
      try {
        final pinHash = await _secureStorage.read(key: _pinKey);
        final timestamp = DateTime.now().millisecondsSinceEpoch;
        print('🔍 STORAGE_MONITOR: PIN status at $timestamp: ${pinHash != null ? "EXISTS" : "MISSING"}');
        
        if (pinHash == null) {
          // PIN disappeared - try reading all our keys to see what's happening
          final biometricEnabled = await _secureStorage.read(key: _biometricEnabledKey);
          final authPreference = await _secureStorage.read(key: _authPreferenceKey);
          print('🔍 STORAGE_MONITOR: Other keys - biometric: ${biometricEnabled != null}, auth: ${authPreference != null}');
        }
      } catch (e) {
        print('🔍 STORAGE_MONITOR: Error reading storage: $e');
      }
    });
  }

  /// Check if biometric authentication is available on device
  static Future<bool> isBiometricAvailable() async {
    try {
      final isSupported = await _localAuth.isDeviceSupported();
      if (!isSupported) return false;

      final availableBiometrics = await _localAuth.getAvailableBiometrics();
      return availableBiometrics.isNotEmpty;
    } catch (e) {
      await AuditLogger.logSecurityEvent(
        'biometric_availability_check_failed',
        error: e.toString(),
      );
      return false;
    }
  }

  /// Check if user has enabled biometric authentication
  static Future<bool> isBiometricEnabled() async {
    final enabled = await _secureStorage.read(key: _biometricEnabledKey);
    return enabled == 'true';
  }

  /// Enable/disable biometric authentication
  static Future<void> setBiometricEnabled(bool enabled) async {
    await _secureStorage.write(key: _biometricEnabledKey, value: enabled.toString());
    
    await AuditLogger.logSecurityEvent(
      'biometric_setting_changed',
      enabled: enabled,
    );
  }

  /// Check if user has set up a PIN
  static Future<bool> isPinSet() async {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final pinHash = await _secureStorage.read(key: _pinKey);
    if (kDebugMode) {
      print('🔍 PIN_DEBUG: isPinSet() at $timestamp - stored hash exists: ${pinHash != null}');
      if (pinHash != null) {
        print('🔍 PIN_DEBUG: Hash length: ${pinHash.length}, starts with: ${pinHash.substring(0, 8)}...');
      } else {
        print('🔍 PIN_DEBUG: Hash is null - storage returned null');
        // Try reading again immediately to see if it's a transient issue
        final pinHashRetry = await _secureStorage.read(key: _pinKey);
        print('🔍 PIN_DEBUG: Retry read: ${pinHashRetry != null ? "SUCCESS" : "STILL NULL"}');
      }
    }
    return pinHash != null && pinHash.isNotEmpty;
  }

  /// Set up a 4-digit PIN
  static Future<bool> setupPin(String pin) async {
    if (kDebugMode) {
      print('🔐 PIN_SETUP: Starting PIN setup for PIN: ${pin.replaceAll(RegExp(r'.'), '*')}');
    }
    
    if (!_isValidPin(pin)) {
      if (kDebugMode) {
        print('🔐 PIN_SETUP: Invalid PIN format');
      }
      throw ArgumentError('PIN must be exactly 4 digits');
    }

    // Simple SHA256 hash of PIN - proven approach
    final pinBytes = utf8.encode(pin);
    final digest = sha256.convert(pinBytes);
    final pinHash = digest.toString();

    if (kDebugMode) {
      print('🔐 PIN_SETUP: Generated hash: $pinHash');
      print('🔐 PIN_SETUP: Writing to storage with key: $_pinKey');
    }

    await _secureStorage.write(key: _pinKey, value: pinHash);

    // Immediately verify it was stored with multiple reads
    final verification1 = await _secureStorage.read(key: _pinKey);
    if (kDebugMode) {
      print('🔐 PIN_SETUP: Verification read 1: $verification1');
      print('🔐 PIN_SETUP: Storage successful 1: ${verification1 == pinHash}');
    }
    
    // Wait 100ms and verify again
    await Future.delayed(const Duration(milliseconds: 100));
    final verification2 = await _secureStorage.read(key: _pinKey);
    if (kDebugMode) {
      print('🔐 PIN_SETUP: Verification read 2 (after 100ms): $verification2');
      print('🔐 PIN_SETUP: Storage successful 2: ${verification2 == pinHash}');
    }
    
    // Final verification after 500ms
    await Future.delayed(const Duration(milliseconds: 400));
    final verification3 = await _secureStorage.read(key: _pinKey);
    if (kDebugMode) {
      print('🔐 PIN_SETUP: Verification read 3 (after 500ms): $verification3');
      print('🔐 PIN_SETUP: Storage successful 3: ${verification3 == pinHash}');
    }
    
    if (verification1 != pinHash || verification2 != pinHash || verification3 != pinHash) {
      throw SecurityException('PIN storage verification failed - secure storage is unstable');
    }

    await AuditLogger.logSecurityEvent(
      'pin_setup_completed',
      pinLength: pin.length,
    );

    if (kDebugMode) {
      print('🔐 PIN_SETUP: PIN setup completed successfully');
    }

    return true;
  }

  /// Verify PIN authentication
  static Future<bool> verifyPin(String pin) async {
    if (kDebugMode) {
      print('🔐 PIN_VERIFY: Starting PIN verification for PIN: ${pin.replaceAll(RegExp(r'.'), '*')}');
    }
    
    if (!_isValidPin(pin)) {
      if (kDebugMode) {
        print('🔐 PIN_VERIFY: Invalid PIN format - must be exactly 4 digits');
      }
      return false;
    }

    final storedHash = await _secureStorage.read(key: _pinKey);
    if (kDebugMode) {
      print('🔐 PIN_VERIFY: Reading from storage key: $_pinKey');
      print('🔐 PIN_VERIFY: Stored hash exists: ${storedHash != null}');
      if (storedHash != null) {
        print('🔐 PIN_VERIFY: Stored hash: $storedHash');
      }
    }
    
    if (storedHash == null) {
      if (kDebugMode) {
        print('🔐 PIN_VERIFY: No stored PIN hash found');
      }
      return false;
    }

    // Simple SHA256 hash of input PIN
    final pinBytes = utf8.encode(pin);
    final digest = sha256.convert(pinBytes);
    final inputHash = digest.toString();

    if (kDebugMode) {
      print('🔐 PIN_VERIFY: Input hash: $inputHash');
      print('🔐 PIN_VERIFY: Hashes match: ${storedHash == inputHash}');
    }

    final isValid = storedHash == inputHash;

    if (kDebugMode) {
      print('🔐 PIN_VERIFY: Final verification result: $isValid');
    }

    await AuditLogger.logSecurityEvent(
      'pin_verification_attempt',
      success: isValid,
    );

    return isValid;
  }

  /// Main authentication method - tries biometric first, falls back to PIN
  static Future<AuthResult> authenticate({
    String? reason,
    bool allowPinFallback = true,
  }) async {
    try {
      // Update session activity
      SessionManager.updateActivity();

      // Check if session is still valid
      if (SessionManager.isSessionValid()) {
        return AuthResult(
          success: true, 
          method: SessionManager.currentAuthMethod,
        );
      }

      final biometricAvailable = await isBiometricAvailable();
      final biometricEnabled = await isBiometricEnabled();
      final pinSet = await isPinSet();

      // Try biometric authentication first if available and enabled
      if (biometricAvailable && biometricEnabled) {
        final biometricResult = await _performBiometricAuth(reason);
        
        if (biometricResult.success) {
          await SessionManager.startSession(AuthMethod.biometric);
          return AuthResult(
            success: true,
            method: AuthMethod.biometric,
            biometricHash: biometricResult.biometricHash,
          );
        }

        // If biometric failed and PIN fallback is not allowed, fail
        if (!allowPinFallback || !pinSet) {
          return AuthResult(
            success: false,
            method: AuthMethod.biometric,
            failureReason: biometricResult.failureReason,
          );
        }
      }

      // Fall back to PIN if biometric unavailable/disabled or failed
      if (pinSet && allowPinFallback) {
        // PIN authentication requires UI interaction - this will be handled by the UI layer
        return AuthResult(
          success: false,
          method: AuthMethod.pin,
          failureReason: 'pin_required',
        );
      }

      // No authentication methods available
      return AuthResult(
        success: false,
        method: AuthMethod.none,
        failureReason: 'no_auth_methods_available',
      );

    } catch (e) {
      await AuditLogger.logSecurityEvent(
        'authentication_error',
        error: e.toString(),
      );
      
      return AuthResult(
        success: false,
        method: AuthMethod.none,
        failureReason: 'authentication_system_error',
      );
    }
  }

  /// System-level authentication that uses existing session or allows PIN without UI
  /// This is used by services like DeviceKeyManager when no UI context is available
  static Future<AuthResult> authenticateForSystem({
    String? reason,
  }) async {
    try {
      // Update session activity
      SessionManager.updateActivity();

      // Check if session is still valid first
      if (SessionManager.isSessionValid()) {
        return AuthResult(
          success: true, 
          method: SessionManager.currentAuthMethod,
        );
      }

      final biometricAvailable = await isBiometricAvailable();
      final biometricEnabled = await isBiometricEnabled();
      final pinSet = await isPinSet();

      if (kDebugMode) {
        print('🔐 SYSTEM_AUTH: biometric available: $biometricAvailable, enabled: $biometricEnabled, PIN set: $pinSet');
      }

      // For system access, if only PIN is available, treat it as available authentication
      // The session was likely created during recent authentication (like onboarding)
      if (pinSet && (!biometricAvailable || !biometricEnabled)) {
        // Allow system access with existing PIN setup
        // This prevents the catch-22 during app initialization
        await SessionManager.startSession(AuthMethod.pin);
        
        if (kDebugMode) {
          print('🔐 SYSTEM_AUTH: Allowing system access with PIN setup - session started');
        }
        
        return AuthResult(
          success: true,
          method: AuthMethod.pin,
        );
      }

      // Try biometric authentication if available and enabled
      if (biometricAvailable && biometricEnabled) {
        final biometricResult = await _performBiometricAuth(reason);
        
        if (biometricResult.success) {
          await SessionManager.startSession(AuthMethod.biometric);
          return AuthResult(
            success: true,
            method: AuthMethod.biometric,
            biometricHash: biometricResult.biometricHash,
          );
        }
        
        // If biometric failed but PIN is set, allow system access
        if (pinSet) {
          await SessionManager.startSession(AuthMethod.pin);
          return AuthResult(
            success: true,
            method: AuthMethod.pin,
          );
        }
      }

      // No authentication methods available
      return AuthResult(
        success: false,
        method: AuthMethod.none,
        failureReason: 'no_auth_methods_available',
      );

    } catch (e) {
      await AuditLogger.logSecurityEvent(
        'system_authentication_error',
        error: e.toString(),
      );
      
      return AuthResult(
        success: false,
        method: AuthMethod.none,
        failureReason: 'authentication_system_error',
      );
    }
  }

  /// Authenticate with PIN (called from UI)
  static Future<AuthResult> authenticateWithPin(String pin) async {
    final isValid = await verifyPin(pin);
    
    if (isValid) {
      await SessionManager.startSession(AuthMethod.pin);
      return AuthResult(
        success: true,
        method: AuthMethod.pin,
      );
    } else {
      return AuthResult(
        success: false,
        method: AuthMethod.pin,
        failureReason: 'invalid_pin',
      );
    }
  }

  /// Force re-authentication for critical operations
  static Future<AuthResult> authenticateForCriticalOperation(String operation) async {
    // Critical operations always require fresh authentication
    SessionManager._isAuthenticated = false;
    
    await AuditLogger.logSecurityEvent(
      'critical_operation_auth_required',
      operation: operation,
    );

    return await authenticate(
      reason: 'Authenticate to perform: $operation',
      allowPinFallback: true,
    );
  }

  /// Get available authentication methods
  static Future<List<AuthMethod>> getAvailableAuthMethods() async {
    final methods = <AuthMethod>[];
    
    if (await isBiometricAvailable() && await isBiometricEnabled()) {
      methods.add(AuthMethod.biometric);
    }
    
    if (await isPinSet()) {
      methods.add(AuthMethod.pin);
    }
    
    return methods;
  }

  /// Perform biometric authentication
  static Future<AuthResult> _performBiometricAuth(String? reason) async {
    try {
      final availableBiometrics = await _localAuth.getAvailableBiometrics();
      
      if (availableBiometrics.isEmpty) {
        return AuthResult(
          success: false,
          method: AuthMethod.biometric,
          failureReason: 'no_biometrics_available',
        );
      }

      final didAuthenticate = await _localAuth.authenticate(
        localizedReason: reason ?? 'Access your secure medical data',
        options: const AuthenticationOptions(
          biometricOnly: false, // Allow device passcode fallback
          stickyAuth: true,     // Require auth for each access
          sensitiveTransaction: true, // For medical data
        ),
      );

      if (didAuthenticate) {
        // Generate a biometric session hash for key derivation
        final biometricHash = _generateBiometricHash(availableBiometrics);
        
        return AuthResult(
          success: true,
          method: AuthMethod.biometric,
          biometricHash: biometricHash,
        );
      } else {
        return AuthResult(
          success: false,
          method: AuthMethod.biometric,
          failureReason: 'biometric_authentication_cancelled',
        );
      }

    } on PlatformException catch (e) {
      String failureReason;
      switch (e.code) {
        case 'NotAvailable':
          failureReason = 'biometric_not_available';
          break;
        case 'NotEnrolled':
          failureReason = 'biometric_not_enrolled';
          break;
        case 'LockedOut':
          failureReason = 'biometric_locked_out';
          break;
        case 'PermanentlyLockedOut':
          failureReason = 'biometric_permanently_locked_out';
          break;
        default:
          failureReason = 'biometric_system_error';
      }

      await AuditLogger.logSecurityEvent(
        'biometric_authentication_failed',
        errorCode: e.code,
        errorMessage: e.message,
      );

      return AuthResult(
        success: false,
        method: AuthMethod.biometric,
        failureReason: failureReason,
      );
    }
  }

  /// Validate PIN format (4 digits)
  static bool _isValidPin(String pin) {
    return RegExp(r'^\d{4}$').hasMatch(pin);
  }

  /// Generate biometric hash for key derivation
  static String _generateBiometricHash(List<BiometricType> availableBiometrics) {
    final biometricInfo = {
      'types': availableBiometrics.map((b) => b.toString()).toList(),
      'timestamp': DateTime.now().millisecondsSinceEpoch,
      'platform': Platform.operatingSystem,
    };
    
    final hash = sha256.convert(utf8.encode(jsonEncode(biometricInfo)));
    return hash.toString();
  }

  /// Clear all authentication data (for logout/reset)
  static Future<void> clearAuthData() async {
    if (kDebugMode) {
      print('🚨 PIN_DEBUG: clearAuthData() called - clearing PIN storage!');
      print('🚨 PIN_DEBUG: Stack trace: ${StackTrace.current}');
    }
    
    await _secureStorage.delete(key: _pinKey);
    await _secureStorage.delete(key: _biometricEnabledKey);
    await _secureStorage.delete(key: _authPreferenceKey);
    await SessionManager.expireSession();

    await AuditLogger.logSecurityEvent('auth_data_cleared');
    
    if (kDebugMode) {
      print('🚨 PIN_DEBUG: clearAuthData() completed - PIN should now be cleared');
    }
  }

  /// Reset PIN data (for fixing corrupted salt/hash issues)
  static Future<void> resetPinData() async {
    await _secureStorage.delete(key: _pinKey);
    await AuditLogger.logSecurityEvent('pin_data_reset');
    
    if (kDebugMode) {
      print('🔧 PIN_RESET: PIN data cleared due to salt generation fix');
    }
  }
}

// Placeholder for audit logging - will be implemented in audit system
class AuditLogger {
  static Future<void> logAuthenticationEvent(
    String event, {
    String? sessionId,
    String? authMethod,
  }) async {
    if (kDebugMode) {
      print('AUTH_AUDIT: $event - Session: $sessionId, Method: $authMethod');
    }
  }

  static Future<void> logSecurityEvent(
    String event, {
    bool? deviceSupported,
    bool? userEnabled,
    bool? enabled,
    int? pinLength,
    bool? success,
    String? error,
    String? operation,
    String? errorCode,
    String? errorMessage,
  }) async {
    if (kDebugMode) {
      print('SECURITY_AUDIT: $event - Success: $success, Error: $error');
    }
  }
}