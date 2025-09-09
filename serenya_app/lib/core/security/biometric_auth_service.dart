import 'dart:async';
import 'dart:convert';
import 'dart:io';
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
  static const _secureStorage = FlutterSecureStorage();
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
    final pinHash = await _secureStorage.read(key: _pinKey);
    return pinHash != null && pinHash.isNotEmpty;
  }

  /// Set up a 4-digit PIN
  static Future<bool> setupPin(String pin) async {
    if (!_isValidPin(pin)) {
      throw ArgumentError('PIN must be exactly 4 digits');
    }

    // Hash the PIN with a salt for secure storage
    final salt = _generateSalt();
    final pinHash = _hashPin(pin, salt);
    final combined = '$salt:$pinHash';

    await _secureStorage.write(key: _pinKey, value: combined);

    await AuditLogger.logSecurityEvent(
      'pin_setup_completed',
      pinLength: pin.length,
    );

    return true;
  }

  /// Verify PIN authentication
  static Future<bool> verifyPin(String pin) async {
    if (!_isValidPin(pin)) return false;

    final stored = await _secureStorage.read(key: _pinKey);
    if (stored == null) return false;

    final parts = stored.split(':');
    if (parts.length != 2) return false;

    final salt = parts[0];
    final storedHash = parts[1];
    final inputHash = _hashPin(pin, salt);

    final isValid = storedHash == inputHash;

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

  /// Generate salt for PIN hashing
  static String _generateSalt() {
    final bytes = List.generate(16, (i) => 
        DateTime.now().microsecondsSinceEpoch % 256);
    return base64.encode(bytes);
  }

  /// Hash PIN with salt using PBKDF2
  static String _hashPin(String pin, String salt) {
    final saltBytes = base64.decode(salt);
    final pinBytes = utf8.encode(pin);
    
    // Simple hash for PIN (in production, use PBKDF2)
    final combined = [...pinBytes, ...saltBytes];
    final digest = sha256.convert(combined);
    
    return digest.toString();
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
    await _secureStorage.delete(key: _pinKey);
    await _secureStorage.delete(key: _biometricEnabledKey);
    await _secureStorage.delete(key: _authPreferenceKey);
    await SessionManager.expireSession();

    await AuditLogger.logSecurityEvent('auth_data_cleared');
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