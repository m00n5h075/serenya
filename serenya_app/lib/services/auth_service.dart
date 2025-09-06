import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:dio/dio.dart';
import '../core/constants/app_constants.dart';
import '../core/utils/encryption_utils.dart';
import '../core/security/biometric_auth_service.dart';
import '../core/security/device_key_manager.dart';

/// Enhanced Authentication Service for Healthcare Platform
/// 
/// Implements end-to-end authentication with:
/// - Google OAuth integration with backend APIs
/// - JWT token management with automatic refresh
/// - Biometric authentication integration
/// - Healthcare-appropriate session management
/// - Robust error handling and network retry logic
class AuthService {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
      keyCipherAlgorithm: KeyCipherAlgorithm.RSA_ECB_PKCS1Padding,
      storageCipherAlgorithm: StorageCipherAlgorithm.AES_GCM_NoPadding,
    ),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.whenUnlockedThisDeviceOnly,
      accountName: 'serenya_health_auth',
    ),
  );

  // Storage keys for enhanced token management
  static const String _accessTokenKey = 'serenya_access_token';
  static const String _refreshTokenKey = 'serenya_refresh_token';
  static const String _userDataKey = 'serenya_user_data';
  static const String _sessionDataKey = 'serenya_session_data';
  static const String _lastAuthTimeKey = 'serenya_last_auth_time';
  static const String _biometricSessionKey = 'serenya_biometric_session';
  static const String _offlineAuthKey = 'serenya_offline_auth_cache';
  
  // Healthcare session configuration
  static const Duration _accessTokenExpiry = Duration(minutes: 15);
  static const Duration _healthcareSessionTimeout = Duration(hours: 1);
  static const Duration _biometricReauthInterval = Duration(minutes: 30);
  
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    scopes: ['email', 'profile'],
  );
  
  final Dio _dio = Dio(BaseOptions(
    baseUrl: AppConstants.baseApiUrl,
    connectTimeout: Duration(seconds: ApiConstants.connectTimeoutSeconds),
    receiveTimeout: Duration(seconds: ApiConstants.receiveTimeoutSeconds),
    headers: ApiConstants.defaultHeaders,
  ));

  final BiometricAuthService _biometricAuth = BiometricAuthService();

  AuthService() {
    _setupDioInterceptors();
  }

  /// Setup Dio interceptors for automatic token refresh and error handling
  void _setupDioInterceptors() {
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        // Add authentication headers for authenticated endpoints
        final token = await _getValidAccessToken();
        if (token != null && !options.path.contains('/auth/')) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        
        // Add device info headers
        options.headers['X-Device-Platform'] = Platform.operatingSystem;
        options.headers['X-App-Version'] = AppConstants.appVersion;
        options.headers['X-Device-ID'] = await _getDeviceId();
        
        handler.next(options);
      },
      
      onError: (error, handler) async {
        // Handle token expiry with automatic refresh
        if (error.response?.statusCode == 401) {
          try {
            final refreshed = await _refreshTokenSilently();
            if (refreshed) {
              // Retry the original request with new token
              final token = await _getValidAccessToken();
              error.requestOptions.headers['Authorization'] = 'Bearer $token';
              
              final retryResponse = await _dio.fetch(error.requestOptions);
              return handler.resolve(retryResponse);
            }
          } catch (e) {
            // Refresh failed, user needs to re-authenticate
            await _clearAllAuthData();
          }
        }
        
        handler.next(error);
      },
    ));
  }

  /// Check if user is currently authenticated
  Future<bool> isLoggedIn() async {
    final accessToken = await _storage.read(key: _accessTokenKey);
    final refreshToken = await _storage.read(key: _refreshTokenKey);
    
    if (accessToken == null || refreshToken == null) {
      return await _checkOfflineAuthentication();
    }
    
    // Check if access token is still valid
    if (!SecurityUtils.isTokenExpired(accessToken)) {
      final isValid = await _checkHealthcareSessionValidity();
      if (isValid) {
        await _updateOfflineAuthCache();
      }
      return isValid;
    }
    
    // Try to refresh if access token expired
    try {
      final refreshed = await _refreshTokenSilently();
      if (refreshed) {
        await _updateOfflineAuthCache();
      }
      return refreshed;
    } catch (e) {
      // Network error - check offline cache
      debugPrint('Network error during token refresh, checking offline cache: $e');
      return await _checkOfflineAuthentication();
    }
  }

  /// Enhanced Google Sign In with full backend integration
  Future<AuthResult> signInWithGoogle({
    Map<String, dynamic>? consentData,
    bool requireBiometric = true,
  }) async {
    try {
      // Step 1: Google OAuth authentication
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      if (googleUser == null) {
        return AuthResult.cancelled('User cancelled Google sign in');
      }

      final GoogleSignInAuthentication googleAuth = await googleUser.authentication;
      
      // Step 2: Biometric authentication (if enabled and supported)
      if (requireBiometric && await _biometricAuth.isAvailable()) {
        final biometricResult = await _biometricAuth.authenticate(
          reason: 'Authenticate to access your medical data securely',
        );
        
        if (!biometricResult.success) {
          await _googleSignIn.signOut();
          return AuthResult.failed('Biometric authentication required for medical data access');
        }
      }

      // Step 3: Prepare backend authentication request
      final authRequest = await _buildAuthenticationRequest(
        googleAuth, 
        consentData,
      );
      
      // Step 4: Backend authentication
      final response = await _dio.post('/auth/google', data: authRequest);
      
      if (response.statusCode == 200 && response.data['success'] == true) {
        final authData = response.data['data'];
        
        // Step 5: Store authentication data securely
        await _storeAuthenticationData(authData);
        
        // Step 6: Mark biometric session if used
        if (requireBiometric && await _biometricAuth.isAvailable()) {
          await _markBiometricSession();
        }
        
        return AuthResult.success(
          'Authentication successful',
          userData: authData['user'],
          sessionData: authData['session'],
        );
      }
      
      // Handle backend authentication failure
      final errorData = response.data['error'] ?? {};
      return AuthResult.failed(
        errorData['user_message'] ?? 'Authentication failed',
        errorCode: errorData['code'],
      );
      
    } on DioException catch (e) {
      await _googleSignIn.signOut();
      return _handleDioError(e, 'Google authentication');
    } catch (e) {
      await _googleSignIn.signOut();
      return AuthResult.failed('Authentication error: $e');
    }
  }

  /// Build authentication request matching backend API contract
  Future<Map<String, dynamic>> _buildAuthenticationRequest(
    GoogleSignInAuthentication googleAuth,
    Map<String, dynamic>? consentData,
  ) async {
    final deviceId = await _getDeviceId();
    
    final request = {
      'google_token': googleAuth.accessToken,
      'id_token': googleAuth.idToken,
      'device_info': {
        'platform': Platform.operatingSystem.toLowerCase(),
        'device_id': deviceId,
        'app_version': AppConstants.appVersion,
      },
    };
    
    // Add consent data if provided
    if (consentData != null) {
      request['consent_acknowledgments'] = consentData;
    }
    
    // Add encryption context for field-level encryption
    try {
      await DeviceKeyManager.initialize();
      final encryptionContext = await _buildEncryptionContext();
      request['encryption_context'] = encryptionContext;
    } catch (e) {
      // Encryption context optional - continue without it
      debugPrint('Warning: Could not build encryption context: $e');
    }
    
    return request;
  }

  /// Build encryption context for field-level encryption
  Future<Map<String, dynamic>> _buildEncryptionContext() async {
    // Get device key material for server integration
    final deviceKeyInfo = await DeviceKeyManager.getDeviceKeyInfo();
    
    return {
      'key_derivation_version': 'v1',
      'supported_tables': ['serenya_content', 'chat_messages'],
      'device_key_hash': deviceKeyInfo['keyHash'], // For key verification
      'encryption_capabilities': ['AES-256-GCM'],
    };
  }

  /// Store authentication data securely
  Future<void> _storeAuthenticationData(Map<String, dynamic> authData) async {
    await Future.wait([
      _storage.write(key: _accessTokenKey, value: authData['access_token']),
      _storage.write(key: _refreshTokenKey, value: authData['refresh_token']),
      _storage.write(key: _userDataKey, value: jsonEncode(authData['user'])),
      _storage.write(key: _sessionDataKey, value: jsonEncode(authData['session'])),
      _storage.write(key: _lastAuthTimeKey, value: DateTime.now().toIso8601String()),
    ]);
  }

  /// Get valid access token with automatic refresh
  Future<String?> _getValidAccessToken() async {
    final accessToken = await _storage.read(key: _accessTokenKey);
    if (accessToken == null) return null;
    
    if (!SecurityUtils.isTokenExpired(accessToken)) {
      return accessToken;
    }
    
    // Token expired, try to refresh
    final refreshed = await _refreshTokenSilently();
    if (refreshed) {
      return await _storage.read(key: _accessTokenKey);
    }
    
    return null;
  }

  /// Silently refresh expired tokens
  Future<bool> _refreshTokenSilently() async {
    try {
      final refreshToken = await _storage.read(key: _refreshTokenKey);
      if (refreshToken == null) return false;
      
      final deviceId = await _getDeviceId();
      
      final response = await _dio.post('/auth/refresh', data: {
        'refresh_token': refreshToken,
        'device_id': deviceId,
      });
      
      if (response.statusCode == 200 && response.data['success'] == true) {
        final authData = response.data['data'];
        await _storeAuthenticationData(authData);
        return true;
      }
      
      return false;
    } catch (e) {
      debugPrint('Token refresh failed: $e');
      return false;
    }
  }

  /// Check healthcare session validity (1-hour timeout)
  Future<bool> _checkHealthcareSessionValidity() async {
    try {
      final lastAuthTimeStr = await _storage.read(key: _lastAuthTimeKey);
      if (lastAuthTimeStr == null) return false;
      
      final lastAuthTime = DateTime.parse(lastAuthTimeStr);
      final sessionAge = DateTime.now().difference(lastAuthTime);
      
      return sessionAge <= _healthcareSessionTimeout;
    } catch (e) {
      return false;
    }
  }

  /// Mark biometric session for enhanced security
  Future<void> _markBiometricSession() async {
    await _storage.write(
      key: _biometricSessionKey, 
      value: DateTime.now().toIso8601String(),
    );
  }

  /// Check if biometric re-authentication is required
  Future<bool> requiresBiometricReauth() async {
    try {
      final biometricSessionStr = await _storage.read(key: _biometricSessionKey);
      if (biometricSessionStr == null) return true;
      
      final lastBiometricAuth = DateTime.parse(biometricSessionStr);
      final timeSinceAuth = DateTime.now().difference(lastBiometricAuth);
      
      return timeSinceAuth >= _biometricReauthInterval;
    } catch (e) {
      return true; // Default to requiring auth on error
    }
  }

  /// Enhanced sign out with complete data cleanup
  Future<void> signOut() async {
    try {
      // Sign out from Google
      await _googleSignIn.signOut();
      
      // Clear biometric session
      await BiometricAuthService.clearSession();
      
      // Clear all authentication data
      await _clearAllAuthData();
      
      // Clear cached encryption keys
      await TableKeyManager.clearCachedKeys();
      
    } catch (e) {
      debugPrint('Sign out error: $e');
      // Ensure data is cleared even if some steps fail
      await _clearAllAuthData();
    }
  }

  /// Clear all stored authentication data
  Future<void> _clearAllAuthData() async {
    await Future.wait([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
      _storage.delete(key: _userDataKey),
      _storage.delete(key: _sessionDataKey),
      _storage.delete(key: _lastAuthTimeKey),
      _storage.delete(key: _biometricSessionKey),
      _storage.delete(key: _offlineAuthKey),
    ]);
  }

  /// Get current user data
  Future<Map<String, dynamic>?> getCurrentUser() async {
    try {
      final userDataStr = await _storage.read(key: _userDataKey);
      if (userDataStr == null) return null;
      
      return jsonDecode(userDataStr);
    } catch (e) {
      return null;
    }
  }

  /// Get current session data
  Future<Map<String, dynamic>?> getCurrentSession() async {
    try {
      final sessionDataStr = await _storage.read(key: _sessionDataKey);
      if (sessionDataStr == null) return null;
      
      return jsonDecode(sessionDataStr);
    } catch (e) {
      return null;
    }
  }

  /// Get valid authentication token for API calls
  Future<String?> getToken() async {
    return await _getValidAccessToken();
  }

  /// Get user profile from backend
  Future<Map<String, dynamic>?> getUserProfile() async {
    try {
      final response = await _dio.get('/user/profile');
      
      if (response.statusCode == 200 && response.data['success'] == true) {
        return response.data['data'];
      }
      
      return null;
    } on DioException catch (e) {
      debugPrint('Get user profile error: ${e.message}');
      return null;
    }
  }

  /// Generate or retrieve device ID
  Future<String> _getDeviceId() async {
    final deviceId = await EncryptionUtils.getEncryptionKey('device_id') ?? 
                     await EncryptionUtils.generateEncryptionKey('device_id');
    return deviceId.substring(0, 16);
  }

  /// Handle Dio errors with healthcare-appropriate messaging
  AuthResult _handleDioError(DioException e, String operation) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return AuthResult.failed(
          'Network timeout during $operation. Please check your connection and try again.',
          isNetworkError: true,
        );
        
      case DioExceptionType.badResponse:
        final statusCode = e.response?.statusCode;
        final errorData = e.response?.data;
        
        if (statusCode == 401) {
          return AuthResult.failed(
            'Authentication failed. Please try signing in again.',
            errorCode: 'AUTHENTICATION_FAILED',
          );
        } else if (statusCode == 400 && errorData?['error']?['code'] == 'MISSING_CONSENT') {
          return AuthResult.failed(
            'Please accept all required terms to access medical features.',
            errorCode: 'MISSING_CONSENT',
          );
        } else {
          return AuthResult.failed(
            errorData?['error']?['user_message'] ?? 'Server error during $operation',
            errorCode: errorData?['error']?['code'],
          );
        }
        
      case DioExceptionType.cancel:
        return AuthResult.cancelled('$operation was cancelled');
        
      default:
        return AuthResult.failed(
          'Network error during $operation. Please try again.',
          isNetworkError: true,
        );
    }
  }

  /// Check offline authentication cache for network-resilient authentication
  Future<bool> _checkOfflineAuthentication() async {
    try {
      final offlineDataStr = await _storage.read(key: _offlineAuthKey);
      if (offlineDataStr == null) return false;
      
      final offlineData = jsonDecode(offlineDataStr);
      final cachedTime = DateTime.parse(offlineData['cached_at']);
      final timeDiff = DateTime.now().difference(cachedTime);
      
      // Allow offline authentication for up to 24 hours
      if (timeDiff <= Duration(hours: 24)) {
        // Require biometric authentication for offline access
        if (await _biometricAuth.isAvailable()) {
          final biometricResult = await _biometricAuth.authenticate(
            reason: 'Authenticate for offline access to your medical data',
          );
          return biometricResult.success;
        }
      }
      
      return false;
    } catch (e) {
      debugPrint('Offline authentication check failed: $e');
      return false;
    }
  }

  /// Update offline authentication cache
  Future<void> _updateOfflineAuthCache() async {
    try {
      final userData = await getCurrentUser();
      if (userData != null) {
        final offlineData = {
          'cached_at': DateTime.now().toIso8601String(),
          'user_id': userData['id'],
          'user_email': userData['email'],
          'session_valid': true,
        };
        
        await _storage.write(
          key: _offlineAuthKey, 
          value: jsonEncode(offlineData),
        );
      }
    } catch (e) {
      debugPrint('Failed to update offline auth cache: $e');
    }
  }

  /// Clear offline authentication cache
  Future<void> _clearOfflineAuthCache() async {
    await _storage.delete(key: _offlineAuthKey);
  }

  /// Enhanced network resilience check
  Future<bool> isNetworkAvailable() async {
    try {
      final result = await InternetAddress.lookup('google.com');
      return result.isNotEmpty && result[0].rawAddress.isNotEmpty;
    } on SocketException catch (_) {
      return false;
    }
  }
}

/// Authentication result with detailed status information
class AuthResult {
  final bool success;
  final bool cancelled;
  final String message;
  final String? errorCode;
  final bool isNetworkError;
  final Map<String, dynamic>? userData;
  final Map<String, dynamic>? sessionData;

  const AuthResult._({
    required this.success,
    required this.cancelled,
    required this.message,
    this.errorCode,
    this.isNetworkError = false,
    this.userData,
    this.sessionData,
  });

  factory AuthResult.success(
    String message, {
    Map<String, dynamic>? userData,
    Map<String, dynamic>? sessionData,
  }) {
    return AuthResult._(
      success: true,
      cancelled: false,
      message: message,
      userData: userData,
      sessionData: sessionData,
    );
  }

  factory AuthResult.failed(
    String message, {
    String? errorCode,
    bool isNetworkError = false,
  }) {
    return AuthResult._(
      success: false,
      cancelled: false,
      message: message,
      errorCode: errorCode,
      isNetworkError: isNetworkError,
    );
  }

  factory AuthResult.cancelled(String message) {
    return AuthResult._(
      success: false,
      cancelled: true,
      message: message,
    );
  }
}