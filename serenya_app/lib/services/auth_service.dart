import 'dart:convert';
import 'dart:io';
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:dio/dio.dart';
import '../core/constants/app_constants.dart';
import '../core/utils/encryption_utils.dart';
import '../core/security/biometric_auth_service.dart';
import '../core/security/device_key_manager.dart';
import '../core/providers/app_state_provider.dart';

/// Enhanced Authentication Service for Healthcare Platform
/// 
/// Implements end-to-end authentication with:
/// - Google OAuth integration with backend APIs
/// - Apple Sign-In integration (iOS only)
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
      accessibility: KeychainAccessibility.unlocked,
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
  static const Duration _healthcareSessionTimeout = Duration(hours: 1);
  static const Duration _biometricReauthInterval = Duration(minutes: 30);
  
  late final GoogleSignIn _googleSignIn;
  bool _isGoogleSignInInitialized = false;
  
  final Dio _dio = Dio(BaseOptions(
    baseUrl: AppConstants.baseApiUrl,
    connectTimeout: const Duration(seconds: ApiConstants.connectTimeoutSeconds),
    receiveTimeout: const Duration(seconds: ApiConstants.receiveTimeoutSeconds),
    headers: ApiConstants.defaultHeaders,
  ));

  // Note: BiometricAuthService uses static methods, no instance needed
  bool _isAuthenticated = false;
  bool _hasAccountCached = false; // FIXED: Single source of truth for account existence
  AppStateProvider? _appStateProvider;

  AuthService() {
    _googleSignIn = GoogleSignIn.instance;
    _setupDioInterceptors();
    _initializeGoogleSignIn();
    _initializeAuthState();
  }
  
  /// Initialize authentication state on app startup
  /// This sets both _isAuthenticated and _hasAccountCached flags for consistent router logic
  Future<void> _initializeAuthState() async {
    try {
      debugPrint('🔍 AUTH_DEBUG: _initializeAuthState() called');
      
      // FIXED: Set account cache status first
      _hasAccountCached = await _checkAccountExistence();
      debugPrint('🔍 AUTH_DEBUG: Account exists: $_hasAccountCached');
      
      // Then check if user has valid session
      if (_hasAccountCached) {
        await _checkOfflineAuthentication();
      }
      
      debugPrint('🔍 AUTH_DEBUG: Authentication state initialized - hasAccount: $_hasAccountCached, isAuthenticated: $_isAuthenticated');
    } catch (e) {
      debugPrint('🔍 AUTH_DEBUG: Error initializing auth state: $e');
      // On error, assume no account to be safe
      _hasAccountCached = false;
      _isAuthenticated = false;
    }
  }

  /// Check if account exists on device (internal method for caching)
  Future<bool> _checkAccountExistence() async {
    try {
      debugPrint('🔍 AUTH_DEBUG: _checkAccountExistence() - Starting account check...');
      
      final accessToken = await _storage.read(key: _accessTokenKey);
      final refreshToken = await _storage.read(key: _refreshTokenKey);
      final hasTokens = accessToken != null && refreshToken != null;
      
      debugPrint('🔍 AUTH_DEBUG: _checkAccountExistence() - Access token exists: ${accessToken != null}');
      debugPrint('🔍 AUTH_DEBUG: _checkAccountExistence() - Refresh token exists: ${refreshToken != null}');
      if (accessToken != null) {
        debugPrint('🔍 AUTH_DEBUG: _checkAccountExistence() - Access token preview: ${accessToken.substring(0, accessToken.length > 50 ? 50 : accessToken.length)}...');
      }
      
      // Also check offline auth cache and user data as backup indicators
      final offlineAuth = await _storage.read(key: _offlineAuthKey);
      final userData = await _storage.read(key: _userDataKey);
      final hasOfflineCache = offlineAuth != null;
      final hasUserData = userData != null;
      
      debugPrint('🔍 AUTH_DEBUG: _checkAccountExistence() - Offline cache exists: $hasOfflineCache');
      debugPrint('🔍 AUTH_DEBUG: _checkAccountExistence() - User data exists: $hasUserData');
      
      final hasAccount = hasTokens || hasOfflineCache || hasUserData;
      debugPrint('🔍 AUTH_DEBUG: _checkAccountExistence() - Final result: $hasAccount (tokens: $hasTokens, offline: $hasOfflineCache, userData: $hasUserData)');
      return hasAccount;
    } catch (e) {
      debugPrint('🔍 AUTH_DEBUG: _checkAccountExistence() - ERROR: $e');
      return false;
    }
  }

  /// Initialize Google Sign-In (required for v7.0+)
  Future<void> _initializeGoogleSignIn() async {
    if (_isGoogleSignInInitialized) return;
    
    try {
      // Initialize with web client ID for server-side verification
      await _googleSignIn.initialize(
        serverClientId: '623522924605-8j72v19u9an2q4srhn69ohsfaarkj835.apps.googleusercontent.com',
      );
      _isGoogleSignInInitialized = true;
    } catch (e) {
      // Use a logging framework in production instead of print
      if (kDebugMode) {
        print('Failed to initialize Google Sign-In: $e');
      }
      // Continue without Google Sign-In if initialization fails
    }
  }

  /// Setup Dio interceptors for automatic token refresh and error handling
  void _setupDioInterceptors() {
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        debugPrint('🔧 INTERCEPTOR: Processing request to ${options.path}');
        
        // Skip token validation for authentication endpoints to avoid infinite loops
        if (!options.path.contains('/auth/')) {
          debugPrint('🔧 INTERCEPTOR: Non-auth endpoint, checking for token');
          try {
            final token = await _storage.read(key: _accessTokenKey);
            if (token != null && !SecurityUtils.isTokenExpired(token)) {
              options.headers['Authorization'] = 'Bearer $token';
              debugPrint('🔧 INTERCEPTOR: Added auth token');
            }
          } catch (e) {
            debugPrint('🔧 INTERCEPTOR: Error getting token: $e');
          }
        } else {
          debugPrint('🔧 INTERCEPTOR: Auth endpoint, skipping token validation');
        }
        
        // Add device info headers
        options.headers['X-Device-Platform'] = Platform.operatingSystem;
        options.headers['X-App-Version'] = AppConstants.appVersion;
        options.headers['X-Device-ID'] = await _getDeviceId();
        
        debugPrint('🔧 INTERCEPTOR: Final headers: ${options.headers}');
        debugPrint('🔧 INTERCEPTOR: Passing request to next handler');
        
        handler.next(options);
      },
      
      onError: (error, handler) async {
        debugPrint('🔧 INTERCEPTOR: Error caught - ${error.type}, Status: ${error.response?.statusCode}');
        debugPrint('🔧 INTERCEPTOR: Error message: ${error.message}');
        
        // Skip token refresh for authentication endpoints to avoid infinite loops
        if (error.response?.statusCode == 401 && !error.requestOptions.path.contains('/auth/')) {
          debugPrint('🔧 INTERCEPTOR: 401 error on non-auth endpoint - attempting token refresh');
          try {
            final refreshed = await _refreshTokenSilently();
            if (refreshed) {
              // Retry the original request with new token
              final token = await _storage.read(key: _accessTokenKey);
              if (token != null) {
                error.requestOptions.headers['Authorization'] = 'Bearer $token';
                
                debugPrint('🔧 INTERCEPTOR: Retrying request with new token');
                final retryResponse = await _dio.fetch(error.requestOptions);
                return handler.resolve(retryResponse);
              }
            }
          } catch (e) {
            debugPrint('🔧 INTERCEPTOR: Token refresh failed: $e');
            // Refresh failed, user needs to re-authenticate
            await _clearAllAuthData();
          }
        } else {
          debugPrint('🔧 INTERCEPTOR: Auth endpoint or non-401 error, skipping token refresh');
        }
        
        debugPrint('🔧 INTERCEPTOR: Passing error to next handler');
        handler.next(error);
      },
    ));
  }

  /// Check if user is currently authenticated
  /// [isInitialization] - if true, performs lightweight validation during app startup
  Future<bool> isLoggedIn({bool isInitialization = false}) async {
    try {
      debugPrint('🔍 AUTH_DEBUG: isLoggedIn() called with isInitialization: $isInitialization');
      final accessToken = await _storage.read(key: _accessTokenKey);
      final refreshToken = await _storage.read(key: _refreshTokenKey);
      debugPrint('🔍 AUTH_DEBUG: accessToken exists: ${accessToken != null}');
      debugPrint('🔍 AUTH_DEBUG: refreshToken exists: ${refreshToken != null}');
      
      if (accessToken == null || refreshToken == null) {
        debugPrint('🔍 AUTH_DEBUG: Missing tokens - accessToken: ${accessToken != null}, refreshToken: ${refreshToken != null}');
        // FIXED: During initialization, always return false if no tokens
        // This ensures the router shows auth prompt instead of home
        debugPrint('🔍 AUTH_DEBUG: No tokens - returning false (requires fresh authentication)');
        return false;
      }
      
      // Check if access token is still valid
      final isTokenExpired = SecurityUtils.isTokenExpired(accessToken);
      debugPrint('🔍 AUTH_DEBUG: Access token expired: $isTokenExpired');
      
      if (!isTokenExpired) {
        // During initialization, do a lightweight session validity check
        if (isInitialization) {
          debugPrint('🔍 AUTH_DEBUG: Token valid, isInitialization=true, checking healthcare session validity');
          final isValid = await _checkHealthcareSessionValidity();
          debugPrint('🔍 AUTH_DEBUG: Healthcare session valid: $isValid');
          if (isValid) {
            _markAuthenticated(); // Set the sync flag
            debugPrint('🔍 AUTH_DEBUG: Marked as authenticated for initialization');
          }
          return isValid;
        }
        
        // Full validation for non-initialization calls
        debugPrint('🔍 AUTH_DEBUG: Token valid, not initialization, doing full validation');
        final isValid = await _checkHealthcareSessionValidity();
        if (isValid) {
          await _updateOfflineAuthCache();
        }
        return isValid;
      }
      
      // If token is expired during initialization, check offline authentication
      // This allows hasValidTokensSync() to return true if we have cached credentials
      if (isInitialization) {
        debugPrint('🔍 AUTH_DEBUG: Token expired and isInitialization=true - checking offline authentication');
        final offlineResult = await _checkOfflineAuthentication();
        debugPrint('🔍 AUTH_DEBUG: Offline authentication result: $offlineResult');
        if (offlineResult) {
          _markAuthenticated(); // Set the sync flag for hasValidTokensSync()
        }
        return offlineResult;
      }
      
      // Try to refresh if access token expired (non-initialization only)
      try {
        debugPrint('🔍 AUTH_DEBUG: Token expired, trying to refresh silently');
        final refreshed = await _refreshTokenSilently();
        debugPrint('🔍 AUTH_DEBUG: Token refresh result: $refreshed');
        if (refreshed) {
          await _updateOfflineAuthCache();
          _markAuthenticated(); // Set the sync flag
        }
        return refreshed;
      } catch (e) {
        debugPrint('🔍 AUTH_DEBUG: Token refresh failed: $e, checking offline authentication');
        final offlineResult = await _checkOfflineAuthentication();
        debugPrint('🔍 AUTH_DEBUG: Offline authentication result after refresh failure: $offlineResult');
        return offlineResult;
      }
    } catch (e) {
      debugPrint('AuthService: Failed to read authentication status: $e');
      return false;
    }
  }

  /// Enhanced Google Sign In with full backend integration
  Future<AuthResult> signInWithGoogle({
    Map<String, dynamic>? consentData,
    bool requireBiometric = true,
  }) async {
    try {
      debugPrint('🔑 AUTH_DEBUG: Starting Google authentication...');
      
      // Ensure Google Sign-In is initialized
      await _initializeGoogleSignIn();
      if (!_isGoogleSignInInitialized) {
        debugPrint('❌ AUTH_DEBUG: Google Sign-In initialization failed');
        return AuthResult.failed('Google Sign-In initialization failed');
      }
      
      debugPrint('✅ AUTH_DEBUG: Google Sign-In initialized, starting authentication...');

      // Step 1: Google OAuth authentication  
      final GoogleSignInAccount? googleUser = await _googleSignIn.authenticate();
      if (googleUser == null) {
        return AuthResult.cancelled('User cancelled Google sign-in');
      }
      debugPrint('✅ AUTH_DEBUG: Google authentication completed for user: ${googleUser.email}');

      // Get authorization for the required scopes to access tokens
      const scopes = ['email', 'profile'];
      final authorization = await googleUser.authorizationClient.authorizationForScopes(scopes);
      
      if (authorization == null) {
        return AuthResult.failed('Failed to authorize required scopes');
      }

      final GoogleSignInAuthentication googleAuth = googleUser.authentication;
      
      // Step 2: Biometric authentication (if enabled and supported)
      if (requireBiometric && await BiometricAuthService.isBiometricAvailable()) {
        final biometricResult = await BiometricAuthService.authenticate(
          reason: 'Authenticate to access your medical data securely',
        );
        
        if (!biometricResult.success) {
          await _googleSignIn.signOut();
          return AuthResult.failed('Biometric authentication required for medical data access');
        }
      }

      // Step 3: Prepare backend authentication request
      debugPrint('🚀 AUTH_DEBUG: Building authentication request...');
      final authRequest = await _buildAuthenticationRequest(
        googleAuth, 
        authorization,
        consentData,
      );
      debugPrint('🚀 AUTH_DEBUG: Authentication request built successfully');
      
      debugPrint('🚀 AUTH_DEBUG: About to make network request to ${_dio.options.baseUrl}/auth/oauth-onboarding');
      debugPrint('🚀 AUTH_DEBUG: Request headers: ${_dio.options.headers}');
      debugPrint('🚀 AUTH_DEBUG: Request data: ${jsonEncode(authRequest)}');
      
      
      // Step 4: Backend authentication via unified OAuth endpoint
      debugPrint('🚀 AUTH_DEBUG: Making POST request...');
      try {
        debugPrint('🚀 AUTH_DEBUG: Dio configuration - connectTimeout: ${_dio.options.connectTimeout}');
        debugPrint('🚀 AUTH_DEBUG: Dio configuration - receiveTimeout: ${_dio.options.receiveTimeout}');
        final response = await _dio.post('/auth/oauth-onboarding', data: authRequest);
        debugPrint('🚀 AUTH_DEBUG: Got response with status: ${response.statusCode}');
        debugPrint('🚀 AUTH_DEBUG: Response data: ${response.data}');
        
        
        if (response.statusCode == 200) {
        final authData = response.data;
        
        // Check if this is an error response
        if (authData['success'] == false) {
          final errorData = authData['error'] ?? {};
          debugPrint('🚨 AUTH_ERROR: Backend returned success=false');
          debugPrint('🚨 AUTH_ERROR: Error code: ${errorData['code']}');
          debugPrint('🚨 AUTH_ERROR: User message: ${errorData['user_message']}');
          debugPrint('🚨 AUTH_ERROR: Full error data: $errorData');
          debugPrint('🚨 AUTH_ERROR: Full response: $authData');
          
          return AuthResult.failed(
            errorData['user_message'] ?? 'Authentication failed',
            errorCode: errorData['code'],
          );
        }
        
        // Step 5: Store authentication data securely
        await _storeAuthenticationData(authData);
        
        // Step 6: Mark biometric session if used
        if (requireBiometric && await BiometricAuthService.isBiometricAvailable()) {
          await _markBiometricSession();
        }
        
        // Step 7: Mark user as authenticated for UI state updates
        _markAuthenticated();
        
        return AuthResult.success(
          'Authentication successful',
          userData: authData['user'],
          sessionData: {
            'access_token': authData['access_token'],
            'refresh_token': authData['refresh_token'],
            'expires_in': authData['expires_in'],
          },
        );
        } else {
          // Handle non-200 status codes
          debugPrint('❌ AUTH_DEBUG: Non-200 status code: ${response.statusCode}');
          return AuthResult.failed('Authentication failed with status: ${response.statusCode}');
        }
      } on DioException catch (e) {
      debugPrint('🔥 AUTH_DEBUG: DioException caught: ${e.type}');
      debugPrint('🔥 AUTH_DEBUG: Error message: ${e.message}');
      debugPrint('🔥 AUTH_DEBUG: Response status: ${e.response?.statusCode}');
      debugPrint('🔥 AUTH_DEBUG: Response data: ${e.response?.data}');
      debugPrint('🔥 AUTH_DEBUG: Response headers: ${e.response?.headers}');
      
      
      await _googleSignIn.signOut();
      
      // Handle specific backend errors
      if (e.response?.statusCode == 400 && e.response?.data != null) {
        final errorData = e.response!.data;
        if (errorData is Map && errorData.containsKey('error')) {
          return AuthResult.failed('Google authentication failed: ${errorData['error_description'] ?? errorData['error']}');
        }
      }
      
      return _handleDioError(e, 'Google authentication');
    }
    } catch (e) {
      debugPrint('💥 AUTH_DEBUG: General exception caught: $e');
      debugPrint('💥 AUTH_DEBUG: Exception type: ${e.runtimeType}');
      await _googleSignIn.signOut();
      return AuthResult.failed('Authentication error: $e');
    }
  }

  /// Enhanced Apple Sign In with full backend integration
  Future<AuthResult> signInWithApple({
    Map<String, dynamic>? consentData,
    bool requireBiometric = true,
  }) async {
    try {
      // Step 1: Apple ID authentication
      final appleCredential = await SignInWithApple.getAppleIDCredential(
        scopes: [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
      );

      // Step 2: Biometric authentication (if enabled and supported)
      if (requireBiometric && await BiometricAuthService.isBiometricAvailable()) {
        final biometricResult = await BiometricAuthService.authenticate(
          reason: 'Authenticate to access your medical data securely',
        );
        
        if (!biometricResult.success) {
          return AuthResult.failed('Biometric authentication required for medical data access');
        }
      }

      // Step 3: Prepare backend authentication request
      final authRequest = await _buildAppleAuthRequest(appleCredential, consentData);
      
      // Step 4: Backend authentication via unified OAuth endpoint
      final response = await _dio.post('/auth/oauth-onboarding', data: authRequest);
      
      if (response.statusCode == 200) {
        final authData = response.data;
        
        // Check if this is an error response
        if (authData['success'] == false) {
          final errorData = authData['error'] ?? {};
          debugPrint('🚨 AUTH_ERROR: Backend returned success=false');
          debugPrint('🚨 AUTH_ERROR: Error code: ${errorData['code']}');
          debugPrint('🚨 AUTH_ERROR: User message: ${errorData['user_message']}');
          debugPrint('🚨 AUTH_ERROR: Full error data: $errorData');
          debugPrint('🚨 AUTH_ERROR: Full response: $authData');
          
          return AuthResult.failed(
            errorData['user_message'] ?? 'Authentication failed',
            errorCode: errorData['code'],
          );
        }
        
        // Step 5: Store authentication data securely
        await _storeAuthenticationData(authData);
        
        // Step 6: Mark biometric session if used
        if (requireBiometric && await BiometricAuthService.isBiometricAvailable()) {
          await _markBiometricSession();
        }
        
        // Step 7: Mark user as authenticated for UI state updates
        _markAuthenticated();
        
        return AuthResult.success(
          'Authentication successful',
          userData: authData['user'],
          sessionData: {
            'access_token': authData['access_token'],
            'refresh_token': authData['refresh_token'],
            'expires_in': authData['expires_in'],
          },
        );
      }
      
      // Handle non-200 status codes
      return AuthResult.failed('Apple authentication failed with status: ${response.statusCode}');
      
    } on SignInWithAppleAuthorizationException catch (e) {
      return _handleAppleAuthError(e);
    } on DioException catch (e) {
      return _handleDioError(e, 'Apple authentication');
    } catch (e) {
      return AuthResult.failed('Apple authentication error: $e');
    }
  }

  /// Build Apple authentication request matching backend API contract
  Future<Map<String, dynamic>> _buildAppleAuthRequest(
    AuthorizationCredentialAppleID appleCredential,
    Map<String, dynamic>? consentData,
  ) async {
    final deviceId = await _getDeviceId();
    
    final request = {
      'provider': 'apple', // Specify OAuth provider for unified endpoint
      'apple_id_token': appleCredential.identityToken, // Match backend field name
      'apple_authorization_code': appleCredential.authorizationCode, // Match backend field name
      'device_info': {
        'platform': Platform.operatingSystem.toLowerCase(),
        'app_installation_id': deviceId,
        'app_version': AppConstants.appVersion,
      },
    };
    
    // Add user data if available (first sign-in only for Apple)
    if (appleCredential.email != null) {
      request['apple_email'] = appleCredential.email;
    }
    if (appleCredential.givenName != null || appleCredential.familyName != null) {
      request['apple_name'] = {
        'given_name': appleCredential.givenName,
        'family_name': appleCredential.familyName,
      };
    }
    
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
      // Log the specific error for debugging
      if (kDebugMode) {
        print('DeviceKeyManager initialization failed during auth: $e');
      }
    }
    
    return request;
  }

  /// Handle Apple-specific authentication errors
  AuthResult _handleAppleAuthError(SignInWithAppleAuthorizationException e) {
    switch (e.code) {
      case AuthorizationErrorCode.canceled:
        return AuthResult.cancelled('Apple sign-in was cancelled');
      case AuthorizationErrorCode.failed:
        return AuthResult.failed('Apple sign-in failed. Please try again.');
      case AuthorizationErrorCode.invalidResponse:
        return AuthResult.failed('Invalid response from Apple. Please try again.');
      case AuthorizationErrorCode.notHandled:
        return AuthResult.failed('Apple sign-in not configured properly.');
      case AuthorizationErrorCode.unknown:
      default:
        return AuthResult.failed('Apple sign-in error. Please try again.');
    }
  }

  /// Build authentication request matching backend API contract
  Future<Map<String, dynamic>> _buildAuthenticationRequest(
    GoogleSignInAuthentication googleAuth,
    GoogleSignInClientAuthorization authorization,
    Map<String, dynamic>? consentData,
  ) async {
    final deviceId = await _getDeviceId();
    
    final request = {
      'provider': 'google', // Specify OAuth provider for unified endpoint
      'google_token': googleAuth.idToken, // Use ID token for backend verification
      'id_token': googleAuth.idToken, // Backend expects 'id_token' at root level
      'device_info': {
        'platform': Platform.operatingSystem.toLowerCase(),
        'app_installation_id': deviceId, // Backend expects 'app_installation_id'
        'app_version': AppConstants.appVersion,
      },
    };
    
    // Add consent data if provided - backend expects 'consent_acknowledgments' (auth.js line 38)
    if (consentData != null) {
      request['consent_acknowledgments'] = consentData; // FIXED: Match actual backend implementation
    }
    
    // Add encryption context for field-level encryption
    try {
      await DeviceKeyManager.initialize();
      final encryptionContext = await _buildEncryptionContext();
      request['encryption_context'] = encryptionContext;
    } catch (e) {
      // Encryption context optional - continue without it
      debugPrint('Warning: Could not build encryption context: $e');
      // Log the specific error for debugging
      if (kDebugMode) {
        print('DeviceKeyManager initialization failed during auth: $e');
      }
    }
    
    return request;
  }

  /// Build encryption context for field-level encryption
  Future<Map<String, dynamic>> _buildEncryptionContext() async {
    // Get device key material for server integration
    // Note: Using initialize to ensure device key system is ready
    try {
      await DeviceKeyManager.initialize();
    } catch (e) {
      // If device key initialization fails, continue with basic context
      if (kDebugMode) {
        print('DeviceKeyManager initialization failed in _buildEncryptionContext: $e');
      }
    }
    
    // FIXED: Match backend API contract exactly
    return {
      'encrypted_key_material': 'device_key_material_placeholder', // Placeholder for actual encrypted key material
      'key_derivation_version': 'v1',
      'supported_tables': ['users', 'user_consents', 'local_medical_data'], // FIXED: Match backend expectations
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
    
    // FIXED: Update account cache when storing auth data
    debugPrint('🔍 AUTH_DEBUG: _storeAuthenticationData() - Setting account cache to true');
    _hasAccountCached = true;
    
    // Don't mark authenticated yet - let the caller do it after callback completes
  }

  /// TEMPORARY DEBUG: Get full JWT token for analysis
  Future<void> debugLogFullJWT() async {
    final accessToken = await _storage.read(key: _accessTokenKey);
    if (accessToken != null) {
      debugPrint('🔍 JWT_DEBUG: Full access token: $accessToken');
    } else {
      debugPrint('🔍 JWT_DEBUG: No access token found');
    }
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
      
      // Clear biometric session and authentication data
      await BiometricAuthService.clearAuthData();
      
      // Clear all authentication data including offline cache
      await _clearAllAuthData();
      
      // Clear cached encryption keys
      await TableKeyManager.clearCachedKeys();
      
      // FIXED: Clear account cache
      debugPrint('🔍 AUTH_DEBUG: signOut() - Clearing account cache and authentication flags');
      _hasAccountCached = false;
      _isAuthenticated = false;
      
      debugPrint('🔍 AUTH_DEBUG: Logged out and cleared all authentication data');
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
    
    // Clear authentication flag
    _isAuthenticated = false;
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

  /// Get user profile from local storage (replaces redundant API call)
  /// Profile data is already available from authentication response
  Future<Map<String, dynamic>?> getUserProfile() async {
    // Use locally stored profile data instead of making API call
    // This data comes from the authentication response and is already current
    return await getCurrentUser();
  }

  /// Check if Apple Sign-In is available on current platform
  Future<bool> isAppleSignInAvailable() async {
    try {
      // Only available on iOS/macOS
      if (!Platform.isIOS && !Platform.isMacOS) {
        return false;
      }
      
      // Runtime check for Apple Sign-In availability
      return await SignInWithApple.isAvailable();
    } catch (e) {
      debugPrint('Apple Sign-In availability check failed: $e');
      return false;
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
    // Enhanced logging for debugging new user issues
    debugPrint('🚨 DIO_ERROR: $operation failed');
    debugPrint('🚨 DIO_ERROR: Type: ${e.type}');
    debugPrint('🚨 DIO_ERROR: Message: ${e.message}');
    debugPrint('🚨 DIO_ERROR: Status Code: ${e.response?.statusCode}');
    debugPrint('🚨 DIO_ERROR: Response Data: ${e.response?.data}');
    debugPrint('🚨 DIO_ERROR: Request Path: ${e.requestOptions.path}');
    debugPrint('🚨 DIO_ERROR: Request Data: ${e.requestOptions.data}');
    debugPrint('🚨 DIO_ERROR: Request Headers: ${e.requestOptions.headers}');
    
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
      debugPrint('🔍 AUTH_DEBUG: _checkOfflineAuthentication() called');
      final offlineAuth = await _storage.read(key: _offlineAuthKey);
      debugPrint('🔍 AUTH_DEBUG: Offline auth cache exists: ${offlineAuth != null}');
      
      if (offlineAuth != null) {
        debugPrint('🔍 AUTH_DEBUG: Found offline authentication - setting _isAuthenticated for hasValidTokensSync()');
        _markAuthenticated(); // This sets _isAuthenticated = true for router logic
        return true;
      }
      
      debugPrint('🔍 AUTH_DEBUG: No offline authentication data found');
      return false;
    } catch (e) {
      debugPrint('🔍 AUTH_DEBUG: Offline authentication check failed: $e');
      return false;
    }
  }

  /// Update offline authentication cache
  Future<void> _updateOfflineAuthCache() async {
    try {
      // Store that user has completed authentication (indefinitely)
      await _storage.write(key: _offlineAuthKey, value: 'authenticated_indefinitely');
      debugPrint('🔍 AUTH_DEBUG: Updated offline auth cache for indefinite access');
    } catch (e) {
      debugPrint('🔍 AUTH_DEBUG: Failed to update offline auth cache: $e');
    }
  }


  /// Refresh authentication tokens using stored refresh token
  /// This is called after successful biometric authentication
  Future<bool> refreshTokensAfterBiometric() async {
    try {
      final refreshToken = await _storage.read(key: _refreshTokenKey);
      if (refreshToken == null) {
        debugPrint('🔍 AUTH_DEBUG: No refresh token found for biometric refresh');
        return false;
      }
      
      // Call backend to refresh tokens
      final refreshed = await _refreshTokenSilently();
      if (refreshed) {
        await _updateOfflineAuthCache();
        _markAuthenticated(); // Mark user as authenticated with fresh tokens
        debugPrint('🔍 AUTH_DEBUG: Tokens refreshed successfully after biometric auth - user marked as authenticated');
        return true;
      }
      
      return false;
    } catch (e) {
      debugPrint('🔍 AUTH_DEBUG: Token refresh after biometric failed: $e');
      return false;
    }
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

  /// Refresh access token using refresh token
  Future<bool> refreshToken() async {
    return await _refreshTokenSilently();
  }

  /// Clear all stored tokens
  Future<void> clearTokens() async {
    await _clearAllAuthData();
  }

  /// Get device identifier for tracking
  Future<String?> getDeviceId() async {
    return await _getDeviceId();
  }

  /// Get current session ID
  Future<String?> getSessionId() async {
    try {
      final sessionData = await _storage.read(key: _sessionDataKey);
      if (sessionData != null && sessionData.isNotEmpty) {
        final data = jsonDecode(sessionData);
        if (data != null && data is Map<String, dynamic>) {
          return data['session_id'] as String?;
        }
      }
    } catch (e) {
      if (kDebugMode) {
        print('Error getting session ID: $e');
      }
    }
    return null;
  }

  /// Synchronously check if user has valid tokens (for UI state checks)
  /// This is used by the router to determine if user has offline authentication available
  bool hasValidTokensSync() {
    debugPrint('🔍 AUTH_DEBUG: hasValidTokensSync called - _hasAccountCached: $_hasAccountCached, _isAuthenticated: $_isAuthenticated');
    // FIXED: Use cached account status instead of just authentication flag
    // This prevents losing account context when app is killed during authentication
    return _hasAccountCached;
  }

  /// Check if user has expired API tokens but valid offline authentication
  /// This is used to detect the scenario where user needs fresh tokens
  /// [testRefresh] - if false, skips the expensive refresh test (for router checks)
  Future<bool> hasExpiredTokensButOfflineAuth({bool testRefresh = false}) async {
    try {
      debugPrint('🔍 AUTH_DEBUG: hasExpiredTokensButOfflineAuth() called');
      
      // First check if user has any account/offline auth at all
      if (!_hasAccountCached) {
        debugPrint('🔍 AUTH_DEBUG: No cached account - returning false');
        return false;
      }
      
      // Check if we have tokens stored
      final accessToken = await _storage.read(key: _accessTokenKey);
      final refreshToken = await _storage.read(key: _refreshTokenKey);
      
      if (accessToken == null || refreshToken == null) {
        debugPrint('🔍 AUTH_DEBUG: Missing tokens but have offline auth - returning true');
        return true; // Has offline auth but no API tokens
      }
      
      // Check if access token is expired
      final isTokenExpired = SecurityUtils.isTokenExpired(accessToken);
      debugPrint('🔍 AUTH_DEBUG: Access token expired: $isTokenExpired');
      
      if (!isTokenExpired) {
        debugPrint('🔍 AUTH_DEBUG: Token valid - returning false');
        return false; // Token is still valid
      }
      
      // If testRefresh is disabled, just return true since token is expired
      if (!testRefresh) {
        debugPrint('🔍 AUTH_DEBUG: Token expired, testRefresh disabled - returning true');
        return true; // Token expired and we're not testing refresh
      }
      
      // Token is expired, try to refresh silently to test if refresh token works
      debugPrint('🔍 AUTH_DEBUG: Token expired, testing refresh token validity');
      final refreshResult = await _refreshTokenSilently();
      
      if (refreshResult) {
        debugPrint('🔍 AUTH_DEBUG: Refresh successful - returning false');
        return false; // Refresh worked, so tokens are now valid
      } else {
        debugPrint('🔍 AUTH_DEBUG: Refresh failed - user has offline auth but expired API tokens');
        return true; // Refresh failed, user needs re-authentication for fresh tokens
      }
      
    } catch (e) {
      debugPrint('🔍 AUTH_DEBUG: Error in hasExpiredTokensButOfflineAuth: $e');
      // On error, assume tokens are expired if we have offline auth
      return _hasAccountCached;
    }
  }

  /// Check if user has an account on this device (has stored tokens, regardless of expiration)
  /// This distinguishes between "new user" (needs onboarding) and "returning user" (needs auth prompt)
  Future<bool> hasAccount() async {
    try {
      // FIXED: Use the internal method and update cache
      final hasAccount = await _checkAccountExistence();
      _hasAccountCached = hasAccount; // Keep cache in sync
      return hasAccount;
    } catch (e) {
      debugPrint('AuthService: Failed to check account status: $e');
      _hasAccountCached = false; // Update cache on error
      return false;
    }
  }

  /// Set reference to app state provider for notifications
  void setAppStateProvider(AppStateProvider provider) {
    _appStateProvider = provider;
  }

  /// Mark that user has successfully authenticated (for sync checks)
  void _markAuthenticated() {
    debugPrint('🔍 AUTH_DEBUG: _markAuthenticated() called - setting _isAuthenticated = true');
    _isAuthenticated = true;
    debugPrint('🔍 AUTH_DEBUG: Authentication state set - AppStateProvider will be notified later by onboarding flow');
  }
  
  /// Notify app state provider of authentication change (called by onboarding flow after biometric setup)
  void notifyAuthenticationComplete() {
    debugPrint('🔍 AUTH_DEBUG: notifyAuthenticationComplete() called');
    if (_appStateProvider != null) {
      _appStateProvider!.refreshAuthState();
      debugPrint('🔍 AUTH_DEBUG: Notified AppStateProvider of authentication state change');
    } else {
      debugPrint('🔍 AUTH_DEBUG: No AppStateProvider reference - cannot notify');
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