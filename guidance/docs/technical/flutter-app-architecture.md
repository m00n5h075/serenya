# Flutter App Architecture - Serenya AI Health Agent

**Document Purpose**: Mobile app architecture, local database design, and API integration patterns  
**Scope**: Flutter application implementation, local data management, server communication  
**Audience**: Flutter developers, mobile app architects  
**Status**: Implementation Ready  
**Last Updated**: September 4, 2025

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Local SQLite Database Schema](#local-sqlite-database-schema)
3. [API Integration Layer](#api-integration-layer)
4. [Asynchronous Job Management](#asynchronous-job-management)
5. [Local Data Operations](#local-data-operations)
6. [Content Type Management](#content-type-management)
7. [Premium Feature Integration](#premium-feature-integration)
8. [Encryption/Decryption Flow](#encryptiondecryption-flow)
9. [State Management](#state-management)
10. [Offline Capability](#offline-capability)
11. [Error Handling & User Experience](#error-handling--user-experience)
12. [Performance Optimization](#performance-optimization)

---

## Architecture Overview

### **Local-First Architecture**
Serenya follows a **local-first** approach where all medical data is stored locally on the device after processing. The server provides processing services but does not persist medical content.

```
┌─────────────────────────┐    ┌─────────────────────────┐
│      FLUTTER APP        │    │      SERVER API         │
│   (Complete Medical     │    │  (Processing Services   │
│    Data Storage)        │    │   & User Management)    │
├─────────────────────────┤    ├─────────────────────────┤
│ • SQLite Database       │◄──►│ • Document Processing   │
│ • Medical Content       │    │ • Chat AI Responses     │
│ • Timeline Views        │    │ • Doctor Reports        │
│ • Chat History          │    │ • Authentication        │
│ • Search Indexes        │    │ • Subscription Mgmt     │
│ • Encryption Keys       │    │ • Temporary S3 Storage  │
└─────────────────────────┘    └─────────────────────────┘
```

### **Data Flow Patterns**
1. **Document Processing**: Upload → Server processing → Polling → Local storage
2. **Chat Conversations**: Message → Server AI → Polling → Local chat history
3. **Doctor Reports**: Medical data → Server AI → Polling → Local report storage
4. **Timeline Views**: Built entirely from local SQLite queries
5. **Search**: Local full-text search on encrypted medical content

---

## Local SQLite Database Schema

### **Core Tables Structure**

#### **`serenya_content` Table (Primary Content Repository)**
```sql
CREATE TABLE serenya_content (
    id TEXT PRIMARY KEY,                    -- UUID generated locally
    content_type TEXT NOT NULL,             -- ENUM: 'results' | 'reports'
    title TEXT,                            -- ENCRYPTED: AI-generated content title
    summary TEXT,                          -- ENCRYPTED: Brief description/analysis
    analysis_markdown TEXT,                -- ENCRYPTED: Full AI analysis document
    confidence_score REAL,                 -- 0.0-1.0 processing confidence
    document_date TEXT,                    -- ISO8601: Original document date
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    -- Encryption metadata
    encryption_version TEXT DEFAULT 'v1',
    table_key_id TEXT DEFAULT 'serenya_content',
    
    -- Processing metadata
    processing_time_seconds INTEGER,
    model_version TEXT,
    
    -- Flags and status
    has_lab_results BOOLEAN DEFAULT FALSE,
    has_vitals BOOLEAN DEFAULT FALSE,
    has_conversations BOOLEAN DEFAULT FALSE,
    is_premium_content BOOLEAN DEFAULT FALSE
);

-- Indexes for timeline and search performance
CREATE INDEX idx_serenya_content_timeline ON serenya_content(created_at DESC);
CREATE INDEX idx_serenya_content_type ON serenya_content(content_type, created_at DESC);
CREATE INDEX idx_serenya_content_search ON serenya_content(title, summary);
```

#### **`lab_results` Table (Structured Medical Data)**
```sql
CREATE TABLE lab_results (
    id TEXT PRIMARY KEY,                    -- UUID generated locally
    serenya_content_id TEXT NOT NULL,       -- References serenya_content.id
    test_name TEXT NOT NULL,               -- ENCRYPTED: Lab test name
    test_value REAL,                      -- ENCRYPTED: Numeric value (aligned with API)
    test_unit TEXT,                       -- Measurement unit (aligned with API)
    reference_range_low REAL,             -- Lower bound of normal range (NEW)
    reference_range_high REAL,            -- Upper bound of normal range (NEW)  
    reference_range_text TEXT,            -- ENCRYPTED: Complete range text (aligned with API)
    is_abnormal BOOLEAN,                  -- AI-determined abnormality flag
    confidence_score REAL,                -- AI confidence score 0.0 to 10.0 (NEW)
    ai_interpretation TEXT,               -- ENCRYPTED: AI analysis of result (NEW)
    test_category TEXT,                   -- 'blood' | 'urine' | 'imaging' | 'other' (aligned with API)
    test_date TEXT,                       -- ISO8601: When test was performed
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (serenya_content_id) REFERENCES serenya_content(id)
);

-- Indexes for filtering and timeline views
CREATE INDEX idx_lab_results_content ON lab_results(serenya_content_id);
CREATE INDEX idx_lab_results_timeline ON lab_results(test_date DESC);
CREATE INDEX idx_lab_results_test_name ON lab_results(test_name);
CREATE INDEX idx_lab_results_abnormal ON lab_results(is_abnormal, test_date DESC);
```

#### **`vitals` Table (Vital Signs Data)**
```sql
CREATE TABLE vitals (
    id TEXT PRIMARY KEY,                    -- UUID generated locally
    serenya_content_id TEXT NOT NULL,       -- References serenya_content.id
    vital_type TEXT NOT NULL,              -- 'blood_pressure' | 'heart_rate' | 'temperature' | 'weight' | 'height' | 'oxygen_saturation'
    systolic_value REAL,                  -- For blood pressure only
    diastolic_value REAL,                 -- For blood pressure only  
    numeric_value REAL,                   -- For single-value vitals (weight, heart rate)
    unit TEXT,                           -- Measurement unit (e.g., "mmHg", "°C", "kg", "bpm", "%")
    is_abnormal BOOLEAN,                  -- AI-determined abnormality flag
    confidence_score REAL,                -- AI confidence score 0.0 to 10.0 (NEW)
    ai_interpretation TEXT,               -- ENCRYPTED: AI analysis of vital sign (NEW)
    measurement_date TEXT,               -- ISO8601: When measurement was taken
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (serenya_content_id) REFERENCES serenya_content(id)
);

-- Indexes for vital signs queries and trends
CREATE INDEX idx_vitals_content ON vitals(serenya_content_id);
CREATE INDEX idx_vitals_type_timeline ON vitals(vital_type, measurement_date DESC);
CREATE INDEX idx_vitals_abnormal ON vitals(is_abnormal, measurement_date DESC);
```

#### **`chat_messages` Table (Conversation History)**
```sql
CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,                    -- UUID generated locally
    serenya_content_id TEXT NOT NULL,       -- References serenya_content.id
    message_id TEXT,                       -- Server-generated chat message UUID
    sender TEXT NOT NULL,                  -- 'user' | 'ai'
    message_content TEXT NOT NULL,         -- ENCRYPTED: Message text
    suggested_prompt_id TEXT,              -- Optional: Reference to chat_options
    
    -- AI response metadata
    confidence_score REAL,                 -- For AI responses
    processing_time_seconds INTEGER,       -- For AI responses
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (serenya_content_id) REFERENCES serenya_content(id)
);

-- Indexes for conversation retrieval
CREATE INDEX idx_chat_messages_content ON chat_messages(serenya_content_id, created_at ASC);
CREATE INDEX idx_chat_messages_sender ON chat_messages(sender);
```

#### **`processing_jobs` Table (Local Job Tracking)**
```sql
CREATE TABLE processing_jobs (
    job_id TEXT PRIMARY KEY,               -- Server job_id: {user_id}_{timestamp}_{random}
    job_type TEXT NOT NULL,               -- 'document_upload' | 'chat_message' | 'doctor_report'
    status TEXT NOT NULL,                 -- 'processing' | 'completed' | 'failed'
    
    -- Job metadata
    initiated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    estimated_completion_seconds INTEGER,
    
    -- Result tracking
    result_content_id TEXT,               -- References serenya_content.id when complete
    error_message TEXT,                   -- For failed jobs
    retry_count INTEGER DEFAULT 0,
    
    -- Polling management
    last_poll_at TEXT,
    next_poll_at TEXT,
    
    FOREIGN KEY (result_content_id) REFERENCES serenya_content(id)
);

CREATE INDEX idx_processing_jobs_status ON processing_jobs(status, next_poll_at);
CREATE INDEX idx_processing_jobs_type ON processing_jobs(job_type, status);
```

#### **`user_preferences` Table (App Configuration)**
```sql
CREATE TABLE user_preferences (
    key TEXT PRIMARY KEY,
    value TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Common preferences stored:
-- • 'biometric_enabled': 'true' | 'false'
-- • 'polling_interval': '10' (seconds)
-- • 'cache_chat_prompts': 'true' | 'false'
-- • 'auto_cleanup_jobs': 'true' | 'false'
```

---

## API Integration Layer

### **HTTP Client Configuration**
```dart
// lib/services/api_client.dart
class ApiClient {
  static const String baseUrl = 'https://api.serenya.health';
  static const Duration defaultTimeout = Duration(seconds: 30);
  static const Duration longTimeout = Duration(minutes: 2); // For uploads
  
  late final Dio _dio;
  
  ApiClient() {
    _dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: defaultTimeout,
      receiveTimeout: longTimeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Serenya-Flutter/${AppConfig.version}',
      },
    ));
    
    // Add authentication interceptor
    _dio.interceptors.add(AuthInterceptor());
    
    // Add retry interceptor for failed requests
    _dio.interceptors.add(RetryInterceptor(
      dio: _dio,
      logPrint: debugPrint,
      retries: 3,
      retryDelays: [
        Duration(seconds: 1),
        Duration(seconds: 2),
        Duration(seconds: 4),
      ],
    ));
  }
}
```

### **Authentication Integration**

**Integration**: Connects to **→ encryption-strategy.md** biometric-server integration flow and **→ database-architecture.md** authentication tables

```dart
// lib/services/auth_service.dart
class AuthService extends ChangeNotifier {
  final ApiEndpoints _api;
  final DatabaseService _db;
  final EncryptionService _encryption;
  final SecureStorage _secureStorage;
  
  // Authentication state
  AuthenticationState _currentState = AuthenticationState.unauthenticated;
  User? _currentUser;
  String? _accessToken;
  String? _refreshToken;
  DateTime? _tokenExpiresAt;
  String? _deviceId;
  
  // Biometric authentication tracking
  DateTime? _lastBiometricAuth;
  bool _biometricSetupComplete = false;
  
  AuthService(this._api, this._db, this._encryption, this._secureStorage);
  
  // Getters
  AuthenticationState get currentState => _currentState;
  User? get currentUser => _currentUser;
  bool get isAuthenticated => _currentState == AuthenticationState.authenticated;
  bool get hasBiometricSetup => _biometricSetupComplete;
  String? get deviceId => _deviceId;
  
  /// Initialize authentication service
  Future<void> initialize() async {
    await _loadStoredAuthState();
    await _checkBiometricSetup();
    await _validateCurrentSession();
  }
  
  /// Google Sign-In with biometric device registration
  Future<AuthenticationResult> signInWithGoogle() async {
    try {
      _updateState(AuthenticationState.signingIn);
      
      // 1. Google Sign-In flow
      final GoogleSignIn googleSignIn = GoogleSignIn(
        serverClientId: AppConfig.googleServerClientId,
        scopes: ['email', 'profile'],
      );
      
      final GoogleSignInAccount? googleUser = await googleSignIn.signIn();
      if (googleUser == null) {
        _updateState(AuthenticationState.unauthenticated);
        return AuthenticationResult.cancelled();
      }
      
      final GoogleSignInAuthentication googleAuth = await googleUser.authentication;
      
      // 2. Server authentication with Google token
      final serverAuthResponse = await _api.authenticateWithGoogle(
        idToken: googleAuth.idToken!,
        accessToken: googleAuth.accessToken,
      );
      
      if (!serverAuthResponse.success) {
        _updateState(AuthenticationState.unauthenticated);
        return AuthenticationResult.failure(serverAuthResponse.error);
      }
      
      // 3. Store user data and tokens
      _currentUser = User.fromJson(serverAuthResponse.data['user']);
      _accessToken = serverAuthResponse.data['access_token'];
      _refreshToken = serverAuthResponse.data['refresh_token'];
      _tokenExpiresAt = DateTime.parse(serverAuthResponse.data['expires_at']);
      
      await _storeAuthState();
      
      // 4. Setup or verify biometric authentication
      final biometricResult = await _setupBiometricAuthentication();
      if (!biometricResult.success) {
        // Authentication succeeded but biometric setup failed
        await signOut(); // Clear auth state for security
        return AuthenticationResult.failure('Biometric setup required but failed');
      }
      
      _updateState(AuthenticationState.authenticated);
      
      return AuthenticationResult.success(
        user: _currentUser!,
        requiresOnboarding: serverAuthResponse.data['requires_onboarding'] ?? false,
      );
      
    } catch (error) {
      _updateState(AuthenticationState.unauthenticated);
      return AuthenticationResult.failure('Authentication failed: $error');
    }
  }
  
  /// Biometric authentication for existing users
  Future<AuthenticationResult> authenticateWithBiometric() async {
    try {
      _updateState(AuthenticationState.authenticating);
      
      // 1. Check if user has stored credentials
      if (_refreshToken == null || _deviceId == null) {
        _updateState(AuthenticationState.unauthenticated);
        return AuthenticationResult.failure('No stored credentials found');
      }
      
      // 2. Biometric authentication with challenge-response
      final biometricAuth = await _performBiometricChallengeResponse();
      if (!biometricAuth.success) {
        _updateState(AuthenticationState.unauthenticated);
        return AuthenticationResult.failure(biometricAuth.error!);
      }
      
      // 3. Update tokens and session
      _accessToken = biometricAuth.accessToken;
      _refreshToken = biometricAuth.refreshToken;
      _tokenExpiresAt = biometricAuth.expiresAt;
      _lastBiometricAuth = DateTime.now();
      
      await _storeAuthState();
      _updateState(AuthenticationState.authenticated);
      
      return AuthenticationResult.success(user: _currentUser!);
      
    } catch (error) {
      _updateState(AuthenticationState.unauthenticated);
      return AuthenticationResult.failure('Biometric authentication failed: $error');
    }
  }
  
  /// Setup biometric authentication during first sign-in
  Future<BiometricSetupResult> _setupBiometricAuthentication() async {
    try {
      // 1. Check biometric capability
      final LocalAuthentication localAuth = LocalAuthentication();
      final isAvailable = await localAuth.canCheckBiometrics;
      final availableBiometrics = await localAuth.getAvailableBiometrics();
      
      if (!isAvailable || availableBiometrics.isEmpty) {
        // Device doesn't support biometrics - use PIN fallback
        return await _setupPinFallback();
      }
      
      // 2. Generate device-specific keys for server communication
      final deviceKeyPair = await _generateDeviceKeyPair();
      
      // 3. Register device with server
      final registrationResult = await _registerDeviceWithServer(deviceKeyPair);
      if (!registrationResult.success) {
        return BiometricSetupResult.failure(registrationResult.error!);
      }
      
      _deviceId = registrationResult.deviceId;
      
      // 4. Initialize biometric-protected encryption keys
      await _encryption.initializeDeviceRootKey();
      
      // 5. Store device authentication keys securely
      await _storeDeviceAuthKeys(deviceKeyPair.privateKey);
      
      // 6. Mark biometric setup as complete
      _biometricSetupComplete = true;
      await _secureStorage.write(key: 'biometric_setup_complete', value: 'true');
      await _secureStorage.write(key: 'device_id', value: _deviceId!);
      
      return BiometricSetupResult.success();
      
    } catch (error) {
      return BiometricSetupResult.failure('Biometric setup failed: $error');
    }
  }
  
  /// Perform biometric challenge-response authentication
  Future<BiometricAuthResult> _performBiometricChallengeResponse() async {
    try {
      // 1. Request authentication challenge from server
      final challengeResponse = await _api.getBiometricChallenge(
        userId: _currentUser!.id,
        deviceId: _deviceId!,
      );
      
      if (!challengeResponse.success) {
        throw Exception('Failed to get authentication challenge');
      }
      
      final challenge = challengeResponse.data;
      
      // 2. Trigger biometric authentication locally
      final LocalAuthentication localAuth = LocalAuthentication();
      
      final didAuthenticate = await localAuth.authenticate(
        localizedReason: 'Authenticate to access your medical data securely',
        options: AuthenticationOptions(
          biometricOnly: false, // Allow PIN fallback
          stickyAuth: true,     // Keep auth active for this operation
        ),
      );
      
      if (!didAuthenticate) {
        return BiometricAuthResult.failure('Biometric authentication failed');
      }
      
      // 3. Access biometric-protected device keys
      final deviceRootKey = await _encryption.getDeviceRootKeyWithBiometric();
      final devicePrivateKey = await _getDevicePrivateKey();
      
      // 4. Sign challenge with device private key
      final challengeSignature = await _signChallenge(
        challenge['nonce'],
        challenge['timestamp'],
        _deviceId!,
        devicePrivateKey,
      );
      
      // 5. Create biometric proof without exposing keys
      final biometricProof = await _createBiometricProof(
        challenge['nonce'],
        deviceRootKey,
      );
      
      // 6. Send verification response to server
      final verificationResponse = await _api.verifyBiometricChallenge(
        challengeId: challenge['challenge_id'],
        deviceId: _deviceId!,
        signature: challengeSignature,
        biometricProof: biometricProof,
      );
      
      if (!verificationResponse.success) {
        return BiometricAuthResult.failure(verificationResponse.error);
      }
      
      final authData = verificationResponse.data;
      
      return BiometricAuthResult.success(
        accessToken: authData['access_token'],
        refreshToken: authData['refresh_token'],
        expiresAt: DateTime.parse(authData['expires_at']),
      );
      
    } catch (error) {
      return BiometricAuthResult.failure('Challenge-response failed: $error');
    }
  }
  
  /// Get valid access token, refreshing if necessary
  Future<String?> getValidToken() async {
    if (_accessToken == null || _tokenExpiresAt == null) {
      return null;
    }
    
    // Check if token expires within next 5 minutes
    final expiryBuffer = DateTime.now().add(Duration(minutes: 5));
    if (_tokenExpiresAt!.isBefore(expiryBuffer)) {
      // Token expiring soon - refresh it
      final refreshed = await refreshToken();
      if (!refreshed) {
        return null;
      }
    }
    
    return _accessToken;
  }
  
  /// Refresh authentication token
  Future<bool> refreshToken() async {
    if (_refreshToken == null) {
      return false;
    }
    
    try {
      final response = await _api.refreshAuthToken(
        refreshToken: _refreshToken!,
        deviceId: _deviceId,
      );
      
      if (response.success) {
        _accessToken = response.data['access_token'];
        _tokenExpiresAt = DateTime.parse(response.data['expires_at']);
        
        // Update refresh token if provided
        if (response.data['refresh_token'] != null) {
          _refreshToken = response.data['refresh_token'];
        }
        
        await _storeAuthState();
        notifyListeners();
        return true;
      }
      
    } catch (error) {
      debugPrint('Token refresh failed: $error');
    }
    
    return false;
  }
  
  /// Check if biometric re-authentication is required
  bool requiresBiometricReauth() {
    if (_lastBiometricAuth == null) return true;
    
    // Require re-auth after 15 minutes of inactivity
    const biometricTimeout = Duration(minutes: 15);
    return DateTime.now().difference(_lastBiometricAuth!) > biometricTimeout;
  }
  
  /// Sign out and clear all authentication data
  Future<void> signOut() async {
    try {
      // Notify server of sign out
      if (_accessToken != null) {
        await _api.signOut(accessToken: _accessToken!);
      }
    } catch (error) {
      // Continue with local cleanup even if server call fails
      debugPrint('Server sign out failed: $error');
    }
    
    // Clear local state
    _currentState = AuthenticationState.unauthenticated;
    _currentUser = null;
    _accessToken = null;
    _refreshToken = null;
    _tokenExpiresAt = null;
    _lastBiometricAuth = null;
    
    // Clear secure storage
    await _clearStoredAuthState();
    
    // Clear encryption keys
    await _encryption.clearCachedKeys();
    
    notifyListeners();
  }
  
  /// Session validation on app startup
  Future<void> _validateCurrentSession() async {
    if (!isAuthenticated) return;
    
    // Check if biometric re-authentication is required
    if (requiresBiometricReauth()) {
      _updateState(AuthenticationState.requiresBiometric);
      return;
    }
    
    // Validate token with server
    try {
      final isValid = await _api.validateSession();
      if (!isValid) {
        await signOut();
      }
    } catch (error) {
      // Network error - assume valid for offline usage
      debugPrint('Session validation failed: $error');
    }
  }
  
  void _updateState(AuthenticationState newState) {
    _currentState = newState;
    notifyListeners();
  }
  
  /// Store authentication state securely
  Future<void> _storeAuthState() async {
    if (_currentUser != null) {
      await _secureStorage.write(key: 'user_data', value: jsonEncode(_currentUser!.toJson()));
    }
    if (_accessToken != null) {
      await _secureStorage.write(key: 'access_token', value: _accessToken!);
    }
    if (_refreshToken != null) {
      await _secureStorage.write(key: 'refresh_token', value: _refreshToken!);
    }
    if (_tokenExpiresAt != null) {
      await _secureStorage.write(key: 'token_expires_at', value: _tokenExpiresAt!.toIso8601String());
    }
    if (_lastBiometricAuth != null) {
      await _secureStorage.write(key: 'last_biometric_auth', value: _lastBiometricAuth!.toIso8601String());
    }
  }
  
  /// Load stored authentication state
  Future<void> _loadStoredAuthState() async {
    final userData = await _secureStorage.read(key: 'user_data');
    if (userData != null) {
      _currentUser = User.fromJson(jsonDecode(userData));
    }
    
    _accessToken = await _secureStorage.read(key: 'access_token');
    _refreshToken = await _secureStorage.read(key: 'refresh_token');
    
    final expiresAtStr = await _secureStorage.read(key: 'token_expires_at');
    if (expiresAtStr != null) {
      _tokenExpiresAt = DateTime.parse(expiresAtStr);
    }
    
    final lastBiometricStr = await _secureStorage.read(key: 'last_biometric_auth');
    if (lastBiometricStr != null) {
      _lastBiometricAuth = DateTime.parse(lastBiometricStr);
    }
    
    _deviceId = await _secureStorage.read(key: 'device_id');
    
    // Update state based on stored data
    if (_currentUser != null && _accessToken != null) {
      if (requiresBiometricReauth()) {
        _updateState(AuthenticationState.requiresBiometric);
      } else {
        _updateState(AuthenticationState.authenticated);
      }
    } else {
      _updateState(AuthenticationState.unauthenticated);
    }
  }
  
  /// Clear all stored authentication data
  Future<void> _clearStoredAuthState() async {
    final keys = [
      'user_data', 'access_token', 'refresh_token', 'token_expires_at',
      'last_biometric_auth', 'device_id', 'device_private_key',
      'biometric_setup_complete'
    ];
    
    for (final key in keys) {
      await _secureStorage.delete(key: key);
    }
  }
  
  /// Check if biometric setup is complete
  Future<void> _checkBiometricSetup() async {
    final setupComplete = await _secureStorage.read(key: 'biometric_setup_complete');
    _biometricSetupComplete = setupComplete == 'true';
  }
}

// lib/services/auth_interceptor.dart
class AuthInterceptor extends Interceptor {
  final AuthService _authService;
  
  AuthInterceptor(this._authService);
  
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await _authService.getValidToken();
    
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    
    // Add device ID for biometric endpoints
    if (_authService.deviceId != null) {
      options.headers['X-Device-ID'] = _authService.deviceId!;
    }
    
    handler.next(options);
  }
  
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
      // Token expired or invalid
      final refreshed = await _authService.refreshToken();
      
      if (refreshed) {
        // Retry original request with new token
        final token = await _authService.getValidToken();
        err.requestOptions.headers['Authorization'] = 'Bearer $token';
        
        final cloneReq = await Dio().fetch(err.requestOptions);
        handler.resolve(cloneReq);
        return;
      } else {
        // Refresh failed - require re-authentication
        await _authService.signOut();
      }
    }
    
    handler.next(err);
  }
}

/// Authentication state enum
enum AuthenticationState {
  unauthenticated,  // No valid authentication
  signingIn,        // Google sign-in in progress
  authenticating,   // Biometric authentication in progress
  authenticated,    // Fully authenticated
  requiresBiometric, // Requires biometric re-authentication
}

/// Authentication result classes
class AuthenticationResult {
  final bool success;
  final User? user;
  final String? error;
  final bool requiresOnboarding;
  
  AuthenticationResult({
    required this.success,
    this.user,
    this.error,
    this.requiresOnboarding = false,
  });
  
  factory AuthenticationResult.success({required User user, bool requiresOnboarding = false}) {
    return AuthenticationResult(
      success: true,
      user: user,
      requiresOnboarding: requiresOnboarding,
    );
  }
  
  factory AuthenticationResult.failure(String error) {
    return AuthenticationResult(success: false, error: error);
  }
  
  factory AuthenticationResult.cancelled() {
    return AuthenticationResult(success: false, error: 'Authentication cancelled by user');
  }
}

class BiometricAuthResult {
  final bool success;
  final String? error;
  final String? accessToken;
  final String? refreshToken;
  final DateTime? expiresAt;
  
  BiometricAuthResult({
    required this.success,
    this.error,
    this.accessToken,
    this.refreshToken,
    this.expiresAt,
  });
  
  factory BiometricAuthResult.success({
    required String accessToken,
    required String refreshToken,
    required DateTime expiresAt,
  }) {
    return BiometricAuthResult(
      success: true,
      accessToken: accessToken,
      refreshToken: refreshToken,
      expiresAt: expiresAt,
    );
  }
  
  factory BiometricAuthResult.failure(String error) {
    return BiometricAuthResult(success: false, error: error);
  }
}

class BiometricSetupResult {
  final bool success;
  final String? error;
  
  BiometricSetupResult({required this.success, this.error});
  
  factory BiometricSetupResult.success() {
    return BiometricSetupResult(success: true);
  }
  
  factory BiometricSetupResult.failure(String error) {
    return BiometricSetupResult(success: false, error: error);
  }
}
```

### **Consent Collection Implementation**
**Integration**: Connects to **→ api-contracts.md** consent mapping and **→ database-architecture.md** consent_records table

```dart
// lib/widgets/consent_collection.dart
class ConsentCollectionWidget extends StatefulWidget {
  final Function(Map<String, bool>) onConsentChanged;
  
  const ConsentCollectionWidget({Key? key, required this.onConsentChanged}) : super(key: key);
  
  @override
  State<ConsentCollectionWidget> createState() => _ConsentCollectionWidgetState();
}

class _ConsentCollectionWidgetState extends State<ConsentCollectionWidget> {
  bool _checkbox1Checked = false; // Legal & Processing Bundle
  bool _checkbox2Checked = false; // Medical Disclaimers Bundle
  
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Checkbox 1: Legal & Processing Bundle
        CheckboxListTile(
          value: _checkbox1Checked,
          onChanged: (value) {
            setState(() {
              _checkbox1Checked = value ?? false;
              _notifyConsentChange();
            });
          },
          title: RichText(
            text: TextSpan(
              style: Theme.of(context).textTheme.bodyMedium,
              children: [
                const TextSpan(text: "I agree to the "),
                TextSpan(
                  text: "Terms of Service",
                  style: const TextStyle(decoration: TextDecoration.underline),
                  recognizer: TapGestureRecognizer()..onTap = () => _openTermsOfService(),
                ),
                const TextSpan(text: " and "),
                TextSpan(
                  text: "Privacy Policy",
                  style: const TextStyle(decoration: TextDecoration.underline),
                  recognizer: TapGestureRecognizer()..onTap = () => _openPrivacyPolicy(),
                ),
                const TextSpan(text: ", and consent to AI processing of my medical data"),
              ],
            ),
          ),
          controlAffinity: ListTileControlAffinity.leading,
        ),
        
        const SizedBox(height: 16),
        
        // Checkbox 2: Medical Disclaimers Bundle  
        CheckboxListTile(
          value: _checkbox2Checked,
          onChanged: (value) {
            setState(() {
              _checkbox2Checked = value ?? false;
              _notifyConsentChange();
            });
          },
          title: const Text(
            "I understand that Serenya is not a medical device and has limitations in emergency situations. "
            "I will always consult healthcare professionals for medical decisions.",
          ),
          controlAffinity: ListTileControlAffinity.leading,
        ),
      ],
    );
  }
  
  void _notifyConsentChange() {
    // Map UI checkboxes to database consent types
    final consentMap = {
      // Checkbox 1 -> 3 consent types
      'terms_of_service': _checkbox1Checked,
      'privacy_policy': _checkbox1Checked,
      'healthcare_consultation': _checkbox1Checked,
      
      // Checkbox 2 -> 2 consent types  
      'medical_disclaimer': _checkbox2Checked,
      'emergency_care_limitation': _checkbox2Checked,
    };
    
    widget.onConsentChanged(consentMap);
  }
  
  void _openTermsOfService() {
    // Launch Terms of Service URL
    launchUrl(Uri.parse('https://serenya.health/terms'));
  }
  
  void _openPrivacyPolicy() {
    // Launch Privacy Policy URL  
    launchUrl(Uri.parse('https://serenya.health/privacy'));
  }
  
  bool get allConsentsGiven => _checkbox1Checked && _checkbox2Checked;
}

// lib/screens/onboarding_screen.dart
class OnboardingScreen extends StatefulWidget {
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _pageController = PageController();
  Map<String, bool> _consentStates = {};
  bool _isSigningUp = false;
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PageView(
        controller: _pageController,
        children: [
          // Slides 1-3: Welcome, Privacy, Medical Disclaimers
          _buildWelcomeSlide(),
          _buildPrivacySlide(), 
          _buildMedicalDisclaimerSlide(),
          
          // Slide 4: Consent & Authentication
          _buildConsentAndAuthSlide(),
        ],
      ),
    );
  }
  
  Widget _buildConsentAndAuthSlide() {
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        children: [
          const Text(
            "Terms & Conditions",
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          
          const SizedBox(height: 32),
          
          // Consent Collection Widget
          ConsentCollectionWidget(
            onConsentChanged: (consentMap) {
              setState(() {
                _consentStates = consentMap;
              });
            },
          ),
          
          const Spacer(),
          
          // Google Sign-In Button
          ElevatedButton(
            onPressed: _canProceed ? _handleGoogleSignIn : null,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.blue,
              minimumSize: const Size(double.infinity, 48),
            ),
            child: _isSigningUp 
              ? const CircularProgressIndicator(color: Colors.white)
              : Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: const [
                    Icon(Icons.login, color: Colors.white),
                    SizedBox(width: 8),
                    Text("Continue with Google", style: TextStyle(color: Colors.white)),
                  ],
                ),
          ),
        ],
      ),
    );
  }
  
  bool get _canProceed {
    return _consentStates.values.every((consent) => consent) && !_isSigningUp;
  }
  
  Future<void> _handleGoogleSignIn() async {
    setState(() {
      _isSigningUp = true;
    });
    
    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      
      // Perform Google authentication with consent data
      final result = await authService.authenticateWithGoogle(
        consentData: _consentStates,
      );
      
      if (result.success) {
        // Navigate to biometric setup or main app
        Navigator.pushReplacementNamed(context, '/biometric-setup');
      } else {
        // Show error
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result.error ?? 'We\'re having trouble signing you in. Let\'s try again')),
        );
      }
    } finally {
      setState(() {
        _isSigningUp = false;
      });
    }
  }
}
```

**Key Implementation Features:**

1. **Bundled Consent Mapping**: 2 UI checkboxes automatically map to 5 database consent types
2. **Legal Link Integration**: Terms of Service and Privacy Policy links are tappable  
3. **State Management**: Real-time validation ensures both checkboxes are checked
4. **API Integration**: Consent data is passed to authentication service for server storage
5. **User Experience**: Clean, accessible interface with proper error handling
6. **Audit Compliance**: Each consent type gets individual database record with timestamps

### **API Endpoint Methods**
```dart
// lib/services/api_endpoints.dart
class ApiEndpoints {
  final ApiClient _client;
  
  ApiEndpoints(this._client);
  
  // Document Processing
  Future<JobResponse> uploadDocument({
    required String encryptedFileData,
    required EncryptionMetadata encryptionMetadata,
    required FileMetadata fileMetadata,
  }) async {
    final response = await _client.post('/documents/upload', data: {
      'encrypted_file_data': encryptedFileData,
      'encryption_metadata': encryptionMetadata.toJson(),
      'file_metadata': fileMetadata.toJson(),
    });
    
    return JobResponse.fromJson(response.data['data']);
  }
  
  // Doctor Reports (Premium)
  Future<JobResponse> generateDoctorReport({
    required List<LabResult> labResults,
    required List<VitalSign> vitals,
    ReportPreferences? preferences,
  }) async {
    final response = await _client.post('/reports/generate', data: {
      'medical_data': {
        'lab_results': labResults.map((r) => r.toApiJson()).toList(),
        'vitals': vitals.map((v) => v.toApiJson()).toList(),
      },
      'report_preferences': preferences?.toJson() ?? ReportPreferences.defaultPrefs().toJson(),
    });
    
    return JobResponse.fromJson(response.data['data']);
  }
  
  // Job Polling
  Future<JobStatusResponse> getJobStatus(String jobId) async {
    final response = await _client.get('/jobs/$jobId/status');
    return JobStatusResponse.fromJson(response.data['data']);
  }
  
  // Chat Integration
  Future<List<ChatPrompt>> getChatPrompts({required ContentType contentType}) async {
    final response = await _client.get('/chat/prompts', queryParameters: {
      'content_type': contentType.toApiString(),
    });
    
    return (response.data['data']['prompts'] as List)
        .map((json) => ChatPrompt.fromJson(json))
        .toList();
  }
  
  Future<JobResponse> sendChatMessage({
    required String contentId,
    required String message,
    String? suggestedPromptId,
  }) async {
    final response = await _client.post('/chat/messages', data: {
      'content_id': contentId,
      'message': message,
      if (suggestedPromptId != null) 'suggested_prompt_id': suggestedPromptId,
    });
    
    return JobResponse.fromJson(response.data);
  }
  
  // Subscription Management
  Future<SubscriptionStatus> getSubscriptionStatus() async {
    final response = await _client.get('/subscriptions/status');
    return SubscriptionStatus.fromJson(response.data['data']);
  }
}
```

---

## Asynchronous Job Management

### **Job Polling Service**
```dart
// lib/services/job_polling_service.dart
class JobPollingService {
  static const Duration defaultPollingInterval = Duration(seconds: 10);
  static const Duration backoffMultiplier = Duration(seconds: 5);
  static const int maxRetries = 36; // 6 minutes max polling
  
  final ApiEndpoints _api;
  final DatabaseService _db;
  final Map<String, Timer> _activePolls = {};
  final Map<String, StreamController<JobStatusUpdate>> _jobStreams = {};
  
  JobPollingService(this._api, this._db);
  
  /// Start polling for a job and return a stream of status updates
  Stream<JobStatusUpdate> pollJob({
    required String jobId,
    required JobType jobType,
    Duration? pollingInterval,
  }) {
    // Create stream controller for this job
    final controller = StreamController<JobStatusUpdate>.broadcast();
    _jobStreams[jobId] = controller;
    
    // Store job in local database for persistence
    _db.insertProcessingJob(ProcessingJob(
      jobId: jobId,
      jobType: jobType,
      status: JobStatus.processing,
      initiatedAt: DateTime.now(),
    ));
    
    // Start polling timer
    _startPolling(jobId, pollingInterval ?? defaultPollingInterval);
    
    return controller.stream;
  }
  
  void _startPolling(String jobId, Duration interval) {
    _activePolls[jobId] = Timer.periodic(interval, (timer) async {
      try {
        final response = await _api.getJobStatus(jobId);
        final update = JobStatusUpdate.fromResponse(response);
        
        // Update local job record
        await _db.updateProcessingJob(jobId, {
          'status': update.status.toDb(),
          'last_poll_at': DateTime.now().toIso8601String(),
        });
        
        // Emit update to stream
        _jobStreams[jobId]?.add(update);
        
        // Handle completion or failure
        if (update.status.isTerminal) {
          await _handleJobCompletion(jobId, update);
          _stopPolling(jobId);
        }
        
      } catch (error) {
        debugPrint('Polling error for job $jobId: $error');
        
        // Implement exponential backoff
        final currentInterval = timer.tick * backoffMultiplier;
        if (timer.tick >= maxRetries) {
          _handleJobTimeout(jobId);
          _stopPolling(jobId);
        }
      }
    });
  }
  
  Future<void> _handleJobCompletion(String jobId, JobStatusUpdate update) async {
    switch (update.status) {
      case JobStatus.completed:
        await _processJobResults(jobId, update.results!);
        break;
      case JobStatus.failed:
        await _handleJobFailure(jobId, update.error!);
        break;
    }
  }
  
  Future<void> _processJobResults(String jobId, JobResults results) async {
    // Decrypt and process results based on job type
    final job = await _db.getProcessingJob(jobId);
    
    switch (job.jobType) {
      case JobType.documentUpload:
        await _processDocumentResults(jobId, results);
        break;
      case JobType.chatMessage:
        await _processChatResults(jobId, results);
        break;
      case JobType.doctorReport:
        await _processDoctorReportResults(jobId, results);
        break;
    }
  }
  
  void _stopPolling(String jobId) {
    _activePolls[jobId]?.cancel();
    _activePolls.remove(jobId);
    _jobStreams[jobId]?.close();
    _jobStreams.remove(jobId);
  }
}
```

### **Background Job Restoration**
```dart
// lib/services/job_restoration_service.dart
class JobRestorationService {
  final JobPollingService _polling;
  final DatabaseService _db;
  
  JobRestorationService(this._polling, this._db);
  
  /// Restore polling for any incomplete jobs on app startup
  Future<void> restoreActiveJobs() async {
    final incompleteJobs = await _db.getProcessingJobs(
      where: "status = 'processing'",
    );
    
    for (final job in incompleteJobs) {
      // Check if job is still within reasonable timeout
      final age = DateTime.now().difference(job.initiatedAt);
      if (age.inMinutes < 10) { // Jobs older than 10 minutes considered stale
        // Resume polling for this job
        _polling.pollJob(
          jobId: job.jobId,
          jobType: job.jobType,
        ).listen(
          (update) => debugPrint('Restored job ${job.jobId}: ${update.status}'),
          onError: (error) => debugPrint('Restored job error: $error'),
        );
      } else {
        // Mark stale jobs as failed
        await _db.updateProcessingJob(job.jobId, {
          'status': 'failed',
          'error_message': 'Job timeout during app restoration',
        });
      }
    }
  }
}
```

---

## Local Data Operations

### **Database Service**
```dart
// lib/services/database_service.dart
class DatabaseService {
  static Database? _database;
  final EncryptionService _encryption;
  
  DatabaseService(this._encryption);
  
  Future<Database> get database async {
    _database ??= await _initDatabase();
    return _database!;
  }
  
  Future<Database> _initDatabase() async {
    final databasesPath = await getDatabasesPath();
    final path = join(databasesPath, 'serenya_local.db');
    
    return await openDatabase(
      path,
      version: 1,
      onCreate: _createDatabase,
      onUpgrade: _upgradeDatabase,
    );
  }
  
  // Content Management
  Future<String> insertContent({
    required ContentType contentType,
    required String title,
    required String summary,
    required String analysisMarkdown,
    required double confidenceScore,
    DateTime? documentDate,
    Map<String, dynamic>? metadata,
  }) async {
    final db = await database;
    final contentId = _generateUuid();
    
    // Encrypt sensitive fields
    final encryptedTitle = await _encryption.encryptField(title);
    final encryptedSummary = await _encryption.encryptField(summary);
    final encryptedAnalysis = await _encryption.encryptField(analysisMarkdown);
    
    await db.insert('serenya_content', {
      'id': contentId,
      'content_type': contentType.toDb(),
      'title': encryptedTitle,
      'summary': encryptedSummary,
      'analysis_markdown': encryptedAnalysis,
      'confidence_score': confidenceScore,
      'document_date': documentDate?.toIso8601String(),
      'created_at': DateTime.now().toIso8601String(),
      'updated_at': DateTime.now().toIso8601String(),
    });
    
    return contentId;
  }
  
  Future<List<ContentItem>> getTimelineItems({
    ContentType? contentType,
    DateTime? fromDate,
    DateTime? toDate,
    int limit = 20,
    int offset = 0,
  }) async {
    final db = await database;
    
    String whereClause = '1=1';
    List<dynamic> whereArgs = [];
    
    if (contentType != null) {
      whereClause += ' AND content_type = ?';
      whereArgs.add(contentType.toDb());
    }
    
    if (fromDate != null) {
      whereClause += ' AND created_at >= ?';
      whereArgs.add(fromDate.toIso8601String());
    }
    
    if (toDate != null) {
      whereClause += ' AND created_at <= ?';
      whereArgs.add(toDate.toIso8601String());
    }
    
    final results = await db.query(
      'serenya_content',
      where: whereClause,
      whereArgs: whereArgs,
      orderBy: 'created_at DESC',
      limit: limit,
      offset: offset,
    );
    
    // Decrypt and return content items
    return Future.wait(results.map((row) => _decryptContentItem(row)));
  }
  
  Future<ContentItem> _decryptContentItem(Map<String, dynamic> row) async {
    return ContentItem(
      id: row['id'],
      contentType: ContentType.fromDb(row['content_type']),
      title: await _encryption.decryptField(row['title']),
      summary: await _encryption.decryptField(row['summary']),
      analysisMarkdown: await _encryption.decryptField(row['analysis_markdown']),
      confidenceScore: row['confidence_score'],
      documentDate: row['document_date'] != null 
          ? DateTime.parse(row['document_date']) 
          : null,
      createdAt: DateTime.parse(row['created_at']),
      hasLabResults: row['has_lab_results'] == 1,
      hasVitals: row['has_vitals'] == 1,
      hasConversations: row['has_conversations'] == 1,
      isPremiumContent: row['is_premium_content'] == 1,
    );
  }
  
  // Lab Results Management
  Future<void> insertLabResults(String contentId, List<LabResult> results) async {
    final db = await database;
    
    for (final result in results) {
      final encryptedTestName = await _encryption.encryptField(result.testName);
      final encryptedRange = await _encryption.encryptField(result.referenceRange);
      
      await db.insert('lab_results', {
        'id': _generateUuid(),
        'serenya_content_id': contentId,
        'test_name': encryptedTestName,
        'value': result.value,
        'value_text': result.valueText,
        'unit': result.unit,
        'reference_range': encryptedRange,
        'status': result.status.toDb(),
        'test_category': result.category?.toDb(),
        'test_date': result.testDate?.toIso8601String(),
        'created_at': DateTime.now().toIso8601String(),
      });
    }
    
    // Update parent content flags
    await db.update(
      'serenya_content',
      {'has_lab_results': 1, 'updated_at': DateTime.now().toIso8601String()},
      where: 'id = ?',
      whereArgs: [contentId],
    );
  }
  
  Future<List<LabResult>> getLabResults({
    String? contentId,
    DateTime? fromDate,
    bool? onlyAbnormal,
  }) async {
    final db = await database;
    
    String whereClause = '1=1';
    List<dynamic> whereArgs = [];
    
    if (contentId != null) {
      whereClause += ' AND serenya_content_id = ?';
      whereArgs.add(contentId);
    }
    
    if (fromDate != null) {
      whereClause += ' AND test_date >= ?';
      whereArgs.add(fromDate.toIso8601String());
    }
    
    if (onlyAbnormal == true) {
      whereClause += ' AND is_abnormal = 1';
    }
    
    final results = await db.query(
      'lab_results',
      where: whereClause,
      whereArgs: whereArgs,
      orderBy: 'test_date DESC, test_name ASC',
    );
    
    return Future.wait(results.map((row) => _decryptLabResult(row)));
  }
}
```

---

## Content Type Management

### **Content Type Definitions**
```dart
// lib/models/content_type.dart
enum ContentType {
  results,  // Processed medical documents (lab results, vitals)
  reports;  // AI-generated doctor reports (premium feature)
  
  String toDb() {
    switch (this) {
      case ContentType.results:
        return 'results';
      case ContentType.reports:
        return 'reports';
    }
  }
  
  String toApiString() {
    return toDb(); // Same as database representation
  }
  
  static ContentType fromDb(String value) {
    switch (value) {
      case 'results':
        return ContentType.results;
      case 'reports':
        return ContentType.reports;
      default:
        throw ArgumentError('Invalid content type: $value');
    }
  }
  
  String get displayName {
    switch (this) {
      case ContentType.results:
        return 'Medical Results';
      case ContentType.reports:
        return 'Doctor Reports';
    }
  }
  
  IconData get icon {
    switch (this) {
      case ContentType.results:
        return Icons.assignment;
      case ContentType.reports:
        return Icons.description;
    }
  }
  
  bool get isPremiumFeature {
    switch (this) {
      case ContentType.results:
        return false;
      case ContentType.reports:
        return true;
    }
  }
}
```

### **Timeline View Implementation**
```dart
// lib/screens/timeline_screen.dart
class TimelineScreen extends StatefulWidget {
  @override
  _TimelineScreenState createState() => _TimelineScreenState();
}

class _TimelineScreenState extends State<TimelineScreen> {
  final DatabaseService _db = GetIt.instance<DatabaseService>();
  final ScrollController _scrollController = ScrollController();
  
  List<ContentItem> _timelineItems = [];
  ContentType? _selectedFilter;
  bool _isLoading = false;
  bool _hasMore = true;
  int _currentOffset = 0;
  
  @override
  void initState() {
    super.initState();
    _loadTimelineItems();
    _scrollController.addListener(_onScroll);
  }
  
  Future<void> _loadTimelineItems({bool refresh = false}) async {
    if (_isLoading) return;
    
    setState(() {
      _isLoading = true;
      if (refresh) {
        _timelineItems.clear();
        _currentOffset = 0;
        _hasMore = true;
      }
    });
    
    try {
      final newItems = await _db.getTimelineItems(
        contentType: _selectedFilter,
        limit: 20,
        offset: _currentOffset,
      );
      
      setState(() {
        if (refresh) {
          _timelineItems = newItems;
        } else {
          _timelineItems.addAll(newItems);
        }
        _currentOffset += newItems.length;
        _hasMore = newItems.length == 20;
        _isLoading = false;
      });
    } catch (error) {
      setState(() => _isLoading = false);
      _showError('Failed to load timeline: $error');
    }
  }
  
  void _onScroll() {
    if (_scrollController.position.pixels >= 
        _scrollController.position.maxScrollExtent - 200) {
      if (_hasMore && !_isLoading) {
        _loadTimelineItems();
      }
    }
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Health Timeline'),
        actions: [
          PopupMenuButton<ContentType?>(
            icon: Icon(Icons.filter_list),
            initialValue: _selectedFilter,
            onSelected: (filter) {
              setState(() => _selectedFilter = filter);
              _loadTimelineItems(refresh: true);
            },
            itemBuilder: (context) => [
              PopupMenuItem(
                value: null,
                child: Text('All Content'),
              ),
              ...ContentType.values.map((type) => PopupMenuItem(
                value: type,
                child: Row(
                  children: [
                    Icon(type.icon, size: 16),
                    SizedBox(width: 8),
                    Text(type.displayName),
                    if (type.isPremiumFeature) ...[
                      SizedBox(width: 8),
                      Icon(Icons.star, size: 12, color: Colors.amber),
                    ],
                  ],
                ),
              )),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => _loadTimelineItems(refresh: true),
        child: _buildTimelineList(),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showUploadOptions(context),
        child: Icon(Icons.add),
        tooltip: 'Add Medical Content',
      ),
    );
  }
  
  Widget _buildTimelineList() {
    if (_timelineItems.isEmpty && !_isLoading) {
      return _buildEmptyState();
    }
    
    return ListView.builder(
      controller: _scrollController,
      itemCount: _timelineItems.length + (_hasMore ? 1 : 0),
      itemBuilder: (context, index) {
        if (index >= _timelineItems.length) {
          return _buildLoadingIndicator();
        }
        
        final item = _timelineItems[index];
        return TimelineItemCard(
          item: item,
          onTap: () => _navigateToDetails(item),
        );
      },
    );
  }
}
```

---

## Premium Feature Integration

### **Subscription Service**
```dart
// lib/services/subscription_service.dart
class SubscriptionService extends ChangeNotifier {
  final ApiEndpoints _api;
  final DatabaseService _db;
  
  SubscriptionStatus? _currentStatus;
  Timer? _statusCheckTimer;
  
  SubscriptionService(this._api, this._db);
  
  SubscriptionStatus? get currentStatus => _currentStatus;
  
  bool get hasPremium => _currentStatus?.tier == SubscriptionTier.premium;
  
  bool get canGenerateReports => hasPremium;
  
  Future<void> initialize() async {
    await refreshStatus();
    _startPeriodicStatusCheck();
  }
  
  Future<void> refreshStatus() async {
    try {
      _currentStatus = await _api.getSubscriptionStatus();
      notifyListeners();
      
      // Cache status locally for offline access
      await _db.setUserPreference('subscription_tier', _currentStatus!.tier.toDb());
      await _db.setUserPreference('subscription_expires_at', _currentStatus!.expiresAt?.toIso8601String() ?? '');
    } catch (error) {
      // Try to load cached status
      final cachedTier = await _db.getUserPreference('subscription_tier');
      if (cachedTier != null) {
        _currentStatus = SubscriptionStatus(
          tier: SubscriptionTier.fromDb(cachedTier),
          isActive: true, // Assume active for offline usage
        );
        notifyListeners();
      }
    }
  }
  
  void _startPeriodicStatusCheck() {
    _statusCheckTimer = Timer.periodic(Duration(hours: 6), (timer) {
      refreshStatus();
    });
  }
  
  /// Check if user can access a premium feature, with user-friendly error
  Future<bool> checkPremiumAccess({required String feature}) async {
    if (hasPremium) return true;
    
    // Show premium upgrade prompt
    final shouldUpgrade = await _showPremiumPrompt(feature: feature);
    if (shouldUpgrade) {
      await _navigateToUpgrade();
    }
    
    return false;
  }
  
  Future<bool> _showPremiumPrompt({required String feature}) async {
    // Implementation depends on your navigation/dialog system
    return await showDialog<bool>(
      context: navigatorKey.currentContext!,
      builder: (context) => PremiumFeatureDialog(feature: feature),
    ) ?? false;
  }
  
  @override
  void dispose() {
    _statusCheckTimer?.cancel();
    super.dispose();
  }
}
```

### **Premium Feature Guards**
```dart
// lib/widgets/premium_feature_guard.dart
class PremiumFeatureGuard extends StatelessWidget {
  final Widget child;
  final String featureName;
  final VoidCallback? onUpgradeRequested;
  
  const PremiumFeatureGuard({
    Key? key,
    required this.child,
    required this.featureName,
    this.onUpgradeRequested,
  }) : super(key: key);
  
  @override
  Widget build(BuildContext context) {
    return Consumer<SubscriptionService>(
      builder: (context, subscription, _) {
        if (subscription.hasPremium) {
          return child;
        }
        
        return PremiumLockedWidget(
          featureName: featureName,
          onUpgradePressed: onUpgradeRequested,
        );
      },
    );
  }
}

// Usage in doctor reports screen
class DoctorReportsScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return PremiumFeatureGuard(
      featureName: 'Doctor Reports',
      child: _buildDoctorReportsInterface(),
      onUpgradeRequested: () => _navigateToUpgrade(context),
    );
  }
}
```

---

## Encryption/Decryption Flow

### **Encryption Service**
```dart
// lib/services/encryption_service.dart
class EncryptionService {
  static const String algorithm = 'AES-256-GCM';
  static const String keyVersion = 'v1';
  
  final SecureStorage _secureStorage;
  final Map<String, Uint8List> _keyCache = {};
  
  EncryptionService(this._secureStorage);
  
  /// Encrypt a field value for local storage
  Future<String> encryptField(String plaintext) async {
    final key = await _getOrCreateTableKey('serenya_content');
    final encrypted = await _encryptWithKey(plaintext, key);
    return base64.encode(encrypted);
  }
  
  /// Decrypt a field value from local storage
  Future<String> decryptField(String encryptedBase64) async {
    final key = await _getOrCreateTableKey('serenya_content');
    final encryptedBytes = base64.decode(encryptedBase64);
    return await _decryptWithKey(encryptedBytes, key);
  }
  
  /// Decrypt data received from API
  Future<String> decryptApiResponse({
    required String encryptedData,
    required EncryptionMetadata metadata,
  }) async {
    if (metadata.algorithm != algorithm || metadata.version != keyVersion) {
      throw UnsupportedError('Unsupported encryption: ${metadata.algorithm}');
    }
    
    final key = await _getOrCreateTableKey(metadata.tableKeyId);
    final encryptedBytes = base64.decode(encryptedData);
    final decrypted = await _decryptWithKey(encryptedBytes, key);
    
    // Verify checksum if provided
    if (metadata.checksum != null) {
      final calculatedChecksum = sha256.convert(utf8.encode(decrypted)).toString();
      if (calculatedChecksum != metadata.checksum) {
        throw SecurityException('Data integrity check failed');
      }
    }
    
    return decrypted;
  }
  
  Future<Uint8List> _getOrCreateTableKey(String tableKeyId) async {
    // Check cache first
    if (_keyCache.containsKey(tableKeyId)) {
      return _keyCache[tableKeyId]!;
    }
    
    // Try to load from secure storage
    final storedKey = await _secureStorage.read(key: 'table_key_$tableKeyId');
    if (storedKey != null) {
      final keyBytes = base64.decode(storedKey);
      _keyCache[tableKeyId] = keyBytes;
      return keyBytes;
    }
    
    // Generate new key
    final newKey = _generateRandomKey();
    await _secureStorage.write(
      key: 'table_key_$tableKeyId',
      value: base64.encode(newKey),
    );
    _keyCache[tableKeyId] = newKey;
    return newKey;
  }
  
  Uint8List _generateRandomKey() {
    final random = Random.secure();
    final key = Uint8List(32); // 256 bits for AES-256
    for (int i = 0; i < key.length; i++) {
      key[i] = random.nextInt(256);
    }
    return key;
  }
  
  Future<Uint8List> _encryptWithKey(String plaintext, Uint8List key) async {
    // Implementation using dart:ffi or pointycastle for AES-GCM
    // This is a simplified example - use proper crypto library
    final cipher = AESFastEngine();
    final gcmCipher = GCMBlockCipher(cipher);
    
    final keyParam = KeyParameter(key);
    final iv = _generateRandomIV();
    final params = AEADParameters(keyParam, 128, iv, Uint8List(0));
    
    gcmCipher.init(true, params);
    
    final plainBytes = utf8.encode(plaintext);
    final encryptedBytes = Uint8List(plainBytes.length + 16); // +16 for auth tag
    
    final len = gcmCipher.processBytes(plainBytes, 0, plainBytes.length, encryptedBytes, 0);
    gcmCipher.doFinal(encryptedBytes, len);
    
    // Prepend IV to encrypted data
    final result = Uint8List(iv.length + encryptedBytes.length);
    result.setRange(0, iv.length, iv);
    result.setRange(iv.length, result.length, encryptedBytes);
    
    return result;
  }
  
  Future<String> _decryptWithKey(Uint8List encryptedData, Uint8List key) async {
    // Extract IV and encrypted bytes
    const ivLength = 12; // GCM standard IV length
    final iv = encryptedData.sublist(0, ivLength);
    final ciphertext = encryptedData.sublist(ivLength);
    
    final cipher = AESFastEngine();
    final gcmCipher = GCMBlockCipher(cipher);
    
    final keyParam = KeyParameter(key);
    final params = AEADParameters(keyParam, 128, iv, Uint8List(0));
    
    gcmCipher.init(false, params);
    
    final decryptedBytes = Uint8List(ciphertext.length - 16); // -16 for auth tag
    final len = gcmCipher.processBytes(ciphertext, 0, ciphertext.length, decryptedBytes, 0);
    gcmCipher.doFinal(decryptedBytes, len);
    
    return utf8.decode(decryptedBytes);
  }
  
  Uint8List _generateRandomIV() {
    final random = Random.secure();
    final iv = Uint8List(12); // 96 bits for GCM
    for (int i = 0; i < iv.length; i++) {
      iv[i] = random.nextInt(256);
    }
    return iv;
  }
}
```

---

## State Management

### **Medical Data State Management (Provider Pattern)**
```dart
// lib/providers/medical_data_provider.dart
class MedicalDataProvider extends ChangeNotifier {
  final DatabaseService _db;
  final JobPollingService _polling;
  final SubscriptionService _subscription;
  
  // Timeline state
  List<ContentItem> _timelineItems = [];
  bool _isLoadingTimeline = false;
  ContentType? _timelineFilter;
  
  // Active processing jobs
  Map<String, ProcessingJob> _activeJobs = {};
  
  // Current content detail
  ContentItem? _currentContent;
  List<LabResult>? _currentLabResults;
  List<VitalSign>? _currentVitals;
  List<ChatMessage>? _currentMessages;
  
  MedicalDataProvider(this._db, this._polling, this._subscription);
  
  // Getters
  List<ContentItem> get timelineItems => List.unmodifiable(_timelineItems);
  bool get isLoadingTimeline => _isLoadingTimeline;
  ContentType? get timelineFilter => _timelineFilter;
  Map<String, ProcessingJob> get activeJobs => Map.unmodifiable(_activeJobs);
  ContentItem? get currentContent => _currentContent;
  
  // Timeline management
  Future<void> loadTimeline({
    ContentType? filter,
    bool refresh = false,
  }) async {
    if (_isLoadingTimeline && !refresh) return;
    
    _isLoadingTimeline = true;
    _timelineFilter = filter;
    notifyListeners();
    
    try {
      final items = await _db.getTimelineItems(
        contentType: filter,
        limit: 50,
      );
      
      _timelineItems = items;
    } catch (error) {
      debugPrint('Error loading timeline: $error');
      // Keep existing data on error
    }
    
    _isLoadingTimeline = false;
    notifyListeners();
  }
  
  // Document processing
  Future<void> uploadDocument({
    required File documentFile,
    required String mimeType,
  }) async {
    // Encrypt file data
    final fileBytes = await documentFile.readAsBytes();
    final encryptedData = await _encryptFileData(fileBytes);
    
    try {
      // Upload to server
      final api = GetIt.instance<ApiEndpoints>();
      final jobResponse = await api.uploadDocument(
        encryptedFileData: base64.encode(encryptedData),
        encryptionMetadata: EncryptionMetadata.forContent(),
        fileMetadata: FileMetadata(
          fileType: mimeType,
          fileSizeBytes: fileBytes.length,
        ),
      );
      
      // Start polling for results
      final processingJob = ProcessingJob(
        jobId: jobResponse.jobId,
        jobType: JobType.documentUpload,
        status: JobStatus.processing,
        initiatedAt: DateTime.now(),
        estimatedCompletionSeconds: jobResponse.estimatedProcessingTimeSeconds,
      );
      
      _activeJobs[jobResponse.jobId] = processingJob;
      notifyListeners();
      
      // Poll for completion
      _polling.pollJob(
        jobId: jobResponse.jobId,
        jobType: JobType.documentUpload,
      ).listen(
        (update) => _handleJobUpdate(jobResponse.jobId, update),
        onError: (error) => _handleJobError(jobResponse.jobId, error),
      );
      
    } catch (error) {
      debugPrint('Document upload failed: $error');
      rethrow;
    }
  }
  
  // Doctor reports (Premium)
  Future<void> generateDoctorReport() async {
    // Check premium access
    if (!await _subscription.checkPremiumAccess(feature: 'Doctor Reports')) {
      return;
    }
    
    try {
      // Get all lab results and vitals
      final allLabResults = await _db.getLabResults();
      final allVitals = await _db.getVitals();
      
      if (allLabResults.isEmpty && allVitals.isEmpty) {
        throw Exception('No medical data available for report generation');
      }
      
      // Request report generation
      final api = GetIt.instance<ApiEndpoints>();
      final jobResponse = await api.generateDoctorReport(
        labResults: allLabResults,
        vitals: allVitals,
        preferences: ReportPreferences.comprehensive(),
      );
      
      // Track job
      final processingJob = ProcessingJob(
        jobId: jobResponse.jobId,
        jobType: JobType.doctorReport,
        status: JobStatus.processing,
        initiatedAt: DateTime.now(),
        estimatedCompletionSeconds: jobResponse.estimatedProcessingTimeSeconds,
      );
      
      _activeJobs[jobResponse.jobId] = processingJob;
      notifyListeners();
      
      // Poll for completion
      _polling.pollJob(
        jobId: jobResponse.jobId,
        jobType: JobType.doctorReport,
      ).listen(
        (update) => _handleJobUpdate(jobResponse.jobId, update),
        onError: (error) => _handleJobError(jobResponse.jobId, error),
      );
      
    } catch (error) {
      debugPrint('Doctor report generation failed: $error');
      rethrow;
    }
  }
  
  void _handleJobUpdate(String jobId, JobStatusUpdate update) {
    final job = _activeJobs[jobId];
    if (job != null) {
      _activeJobs[jobId] = job.copyWith(status: update.status);
      
      if (update.status == JobStatus.completed) {
        _handleJobCompletion(jobId, update.results!);
      } else if (update.status == JobStatus.failed) {
        _handleJobFailure(jobId, update.error!);
      }
      
      notifyListeners();
    }
  }
  
  Future<void> _handleJobCompletion(String jobId, JobResults results) async {
    final job = _activeJobs[jobId]!;
    
    try {
      switch (job.jobType) {
        case JobType.documentUpload:
          await _processDocumentResults(results);
          break;
        case JobType.doctorReport:
          await _processDoctorReportResults(results);
          break;
        case JobType.chatMessage:
          await _processChatResults(results);
          break;
      }
      
      // Remove completed job and refresh timeline
      _activeJobs.remove(jobId);
      await loadTimeline(filter: _timelineFilter, refresh: true);
      
    } catch (error) {
      debugPrint('Error processing job results: $error');
      _handleJobFailure(jobId, JobError(
        code: 'RESULT_PROCESSING_FAILED',
        message: 'Failed to process job results: $error',
      ));
    }
  }
  
  Future<void> _processDocumentResults(JobResults results) async {
    final encryption = GetIt.instance<EncryptionService>();
    
    // Decrypt analysis
    final analysisMarkdown = await encryption.decryptApiResponse(
      encryptedData: results.encryptedAnalysis!,
      metadata: results.encryptionMetadata!,
    );
    
    // Create content record
    final contentId = await _db.insertContent(
      contentType: ContentType.results,
      title: 'Medical Analysis', // Will be updated based on content
      summary: 'Processed medical document',
      analysisMarkdown: analysisMarkdown,
      confidenceScore: results.processingMetadata!.confidenceScore,
      documentDate: DateTime.now(),
    );
    
    // Process lab results if present
    if (results.encryptedLabResults != null) {
      final labResultsJson = await encryption.decryptApiResponse(
        encryptedData: results.encryptedLabResults!,
        metadata: results.encryptionMetadata!,
      );
      
      final labResultsData = jsonDecode(labResultsJson) as List;
      final labResults = labResultsData
          .map((json) => LabResult.fromJson(json))
          .toList();
      
      await _db.insertLabResults(contentId, labResults);
    }
    
    // Process vitals if present
    if (results.encryptedVitalsData != null) {
      final vitalsJson = await encryption.decryptApiResponse(
        encryptedData: results.encryptedVitalsData!,
        metadata: results.encryptionMetadata!,
      );
      
      final vitalsData = jsonDecode(vitalsJson) as List;
      final vitals = vitalsData
          .map((json) => VitalSign.fromJson(json))
          .toList();
      
      await _db.insertVitals(contentId, vitals);
    }
  }
  
  Future<void> _processDoctorReportResults(JobResults results) async {
    final encryption = GetIt.instance<EncryptionService>();
    
    // Decrypt doctor report
    final reportMarkdown = await encryption.decryptApiResponse(
      encryptedData: results.encryptedDoctorReport!,
      metadata: results.encryptionMetadata!,
    );
    
    // Create content record for report
    await _db.insertContent(
      contentType: ContentType.reports,
      title: 'Comprehensive Doctor Report',
      summary: 'AI-generated medical analysis report',
      analysisMarkdown: reportMarkdown,
      confidenceScore: results.processingMetadata?.confidenceScore ?? 0.95,
      documentDate: DateTime.now(),
    );
  }
}
```

---

## Offline Capability

### **Offline Storage Strategy**
```dart
// lib/services/offline_service.dart
class OfflineService {
  final DatabaseService _db;
  final NetworkService _network;
  
  OfflineService(this._db, this._network);
  
  /// Queue operations for when network is available
  Future<void> queueOfflineOperation({
    required String operationType,
    required Map<String, dynamic> data,
  }) async {
    await _db.insertOfflineOperation(OfflineOperation(
      id: _generateUuid(),
      operationType: operationType,
      data: jsonEncode(data),
      createdAt: DateTime.now(),
      retryCount: 0,
    ));
  }
  
  /// Process queued operations when network returns
  Future<void> processOfflineQueue() async {
    if (!await _network.isConnected) return;
    
    final operations = await _db.getOfflineOperations();
    
    for (final operation in operations) {
      try {
        await _processOperation(operation);
        await _db.deleteOfflineOperation(operation.id);
      } catch (error) {
        // Increment retry count
        await _db.updateOfflineOperation(operation.id, {
          'retry_count': operation.retryCount + 1,
          'last_error': error.toString(),
        });
        
        // Remove operations that have failed too many times
        if (operation.retryCount >= 3) {
          await _db.deleteOfflineOperation(operation.id);
        }
      }
    }
  }
  
  Future<void> _processOperation(OfflineOperation operation) async {
    final data = jsonDecode(operation.data);
    
    switch (operation.operationType) {
      case 'upload_document':
        // Retry document upload
        break;
      case 'send_chat_message':
        // Retry chat message
        break;
      case 'generate_report':
        // Retry report generation
        break;
    }
  }
}
```

### **Network Awareness**
```dart
// lib/services/network_service.dart
class NetworkService extends ChangeNotifier {
  bool _isConnected = true;
  StreamSubscription? _connectivitySubscription;
  
  bool get isConnected => _isConnected;
  
  void initialize() {
    _connectivitySubscription = Connectivity()
        .onConnectivityChanged
        .listen(_updateConnectionStatus);
    
    // Check initial status
    _checkInitialConnection();
  }
  
  Future<void> _checkInitialConnection() async {
    final result = await Connectivity().checkConnectivity();
    _updateConnectionStatus(result);
  }
  
  void _updateConnectionStatus(ConnectivityResult result) {
    final wasConnected = _isConnected;
    _isConnected = result != ConnectivityResult.none;
    
    if (!wasConnected && _isConnected) {
      // Network restored - process offline queue
      GetIt.instance<OfflineService>().processOfflineQueue();
    }
    
    notifyListeners();
  }
  
  @override
  void dispose() {
    _connectivitySubscription?.cancel();
    super.dispose();
  }
}
```

---

## Error Handling & User Experience

### **Unified Three-Layer Error Handling Implementation**
**Implementing the comprehensive error handling strategy from Issue #16 resolution:**

#### **Layer 1 Integration - Server Error Processing**
Client receives categorized errors from server with recovery strategies:

#### **Layer 2 - Client Error Translation**
Flutter app transforms server errors into actionable user guidance:

#### **Layer 3 - User Experience**
Present contextual error messages with clear recovery actions:

### **UnifiedError Model Implementation**
```dart
// lib/models/unified_error.dart
enum ErrorCategory { 
  technical,    // Infrastructure failures, timeouts, service unavailable
  validation,   // Input validation, format errors, missing fields  
  business,     // Business logic violations, insufficient permissions
  external      // Third-party service failures (Google OAuth, AI services)
}

enum RecoveryStrategy {
  retry,        // Automatic or user-triggered retry
  fallback,     // Graceful degradation to alternative functionality
  escalate,     // Require user intervention or support contact
  ignore        // Continue with limited functionality
}

class UnifiedError {
  final String code;
  final ErrorCategory category; 
  final String technicalMessage;
  final String userMessage;
  final RecoveryStrategy recoveryStrategy;
  final Duration? retryAfter;
  final bool fallbackAvailable;
  final String correlationId;
  final String? circuitBreakerStatus;
  
  const UnifiedError({
    required this.code,
    required this.category,
    required this.technicalMessage,
    required this.userMessage,
    required this.recoveryStrategy,
    this.retryAfter,
    this.fallbackAvailable = false,
    required this.correlationId,
    this.circuitBreakerStatus,
  });
  
  // Transform server error response to UnifiedError
  factory UnifiedError.fromApiResponse(Map<String, dynamic> errorData) {
    return UnifiedError(
      code: errorData['code'] as String,
      category: _parseCategory(errorData['category'] as String),
      technicalMessage: errorData['message'] as String,
      userMessage: errorData['user_message'] as String,
      recoveryStrategy: _parseRecoveryStrategy(errorData['recovery_strategy'] as String),
      retryAfter: errorData['details']?['retry_after_seconds'] != null 
          ? Duration(seconds: errorData['details']['retry_after_seconds'] as int)
          : null,
      fallbackAvailable: errorData['details']?['fallback_available'] == true,
      correlationId: errorData['correlation_id'] as String,
      circuitBreakerStatus: errorData['circuit_breaker_status'] as String?,
    );
  }
  
  static ErrorCategory _parseCategory(String category) {
    return ErrorCategory.values.firstWhere(
      (c) => c.name == category,
      orElse: () => ErrorCategory.technical,
    );
  }
  
  static RecoveryStrategy _parseRecoveryStrategy(String strategy) {
    return RecoveryStrategy.values.firstWhere(
      (s) => s.name == strategy,
      orElse: () => RecoveryStrategy.escalate,
    );
  }
}

### **UnifiedErrorService Implementation**
```dart
// lib/services/unified_error_service.dart  
class UnifiedErrorService {
  static final _logger = Logger('UnifiedErrorService');
  
  /// Handle unified error with three-layer strategy
  static Future<void> handleError(
    UnifiedError error, {
    BuildContext? context,
    bool showUser = true,
  }) async {
    // Layer 1 - Log technical details for debugging
    _logger.info('UnifiedError [${error.code}]: ${error.technicalMessage}');
    
    // Send correlation ID to crash analytics for support tracking
    FirebaseCrashlytics.instance.setCustomKey('correlation_id', error.correlationId);
    FirebaseCrashlytics.instance.setCustomKey('circuit_breaker_status', error.circuitBreakerStatus ?? 'unknown');
    
    // Layer 2 - Apply recovery strategy
    final recoveryResult = await _executeRecoveryStrategy(error, context);
    
    // Layer 3 - Show user-facing error if recovery didn't handle it
    if (showUser && context != null && !recoveryResult.handledByRecovery) {
      _showErrorToUser(context, error);
    }
  }
  
  /// Execute recovery strategy based on error type
  static Future<RecoveryResult> _executeRecoveryStrategy(
    UnifiedError error, 
    BuildContext? context
  ) async {
    switch (error.recoveryStrategy) {
      case RecoveryStrategy.retry:
        return _handleRetryStrategy(error, context);
      case RecoveryStrategy.fallback:
        return _handleFallbackStrategy(error, context);
      case RecoveryStrategy.escalate:
        return _handleEscalateStrategy(error, context);
      case RecoveryStrategy.ignore:
        return _handleIgnoreStrategy(error, context);
    }
  }
  
  /// Retry strategy with exponential backoff
  static Future<RecoveryResult> _handleRetryStrategy(
    UnifiedError error, 
    BuildContext? context
  ) async {
    if (error.retryAfter != null) {
      // Wait for specified duration before enabling retry
      Timer(error.retryAfter!, () {
        // Enable retry button or automatic retry
      });
    }
    
    return RecoveryResult(handledByRecovery: false, requiresUserAction: true);
  }
  
  /// Fallback strategy with graceful degradation
  static Future<RecoveryResult> _handleFallbackStrategy(
    UnifiedError error,
    BuildContext? context
  ) async {
    if (error.fallbackAvailable) {
      // Activate fallback functionality
      switch (error.category) {
        case ErrorCategory.external:
          // AI service down - show cached results or simple text view
          _activateOfflineMode();
          break;
        case ErrorCategory.technical:
          // Server issues - enable local-only functionality
          _activateLocalOnlyMode();
          break;
        default:
          break;
      }
      return RecoveryResult(handledByRecovery: true, requiresUserAction: false);
    }
    
    return RecoveryResult(handledByRecovery: false, requiresUserAction: true);
  }
  
  /// Show contextual user error with recovery actions
  static void _showErrorToUser(BuildContext context, UnifiedError error) {
    showDialog(
      context: context,
      builder: (context) => ErrorDialogWidget(error: error),
    );
  }
}

class RecoveryResult {
  final bool handledByRecovery;
  final bool requiresUserAction;
  
  const RecoveryResult({
    required this.handledByRecovery,
    required this.requiresUserAction,
  });
}
```

### **Error UI Components**
```dart
// lib/widgets/error_dialog_widget.dart
class ErrorDialogWidget extends StatelessWidget {
  final UnifiedError error;
  
  const ErrorDialogWidget({Key? key, required this.error}) : super(key: key);
  
  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Row(
        children: [
          Icon(_getErrorIcon(error.category), color: _getErrorColor(error.category)),
          SizedBox(width: 8),
          Expanded(child: Text(_getErrorTitle(error.category))),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(error.userMessage),
          if (error.fallbackAvailable) ...[
            SizedBox(height: 16),
            Container(
              padding: EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline, color: Colors.blue.shade700),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Limited functionality is available while we resolve this issue.',
                      style: TextStyle(color: Colors.blue.shade700),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
      actions: _buildRecoveryActions(context, error),
    );
  }
  
  /// Build action buttons based on recovery strategy
  List<Widget> _buildRecoveryActions(BuildContext context, UnifiedError error) {
    final actions = <Widget>[];
    
    switch (error.recoveryStrategy) {
      case RecoveryStrategy.retry:
        actions.add(
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
              _retryOriginalAction(error);
            },
            child: Text('Try Again'),
          ),
        );
        break;
        
      case RecoveryStrategy.fallback:
        if (error.fallbackAvailable) {
          actions.add(
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
                _activateFallbackMode(error);
              },
              child: Text('Continue with Limited Features'),
            ),
          );
        }
        actions.add(
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
              _retryOriginalAction(error);
            },
            child: Text('Try Again'),
          ),
        );
        break;
        
      case RecoveryStrategy.escalate:
        actions.add(
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              _contactSupport(error.correlationId);
            },
            child: Text('Contact Support'),
          ),
        );
        break;
        
      case RecoveryStrategy.ignore:
        actions.add(
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text('Continue'),
          ),
        );
        break;
    }
    
    return actions;
  }
}
```

// Previous implementation retained for compatibility
class AppError {
  final ErrorCategory category;
  final ErrorSeverity severity;
  final String code;
  final String technicalMessage;
  final String userMessage;
  final String? suggestion;
  final dynamic originalError;
  
  const AppError({
    required this.category,
    required this.severity,
    required this.code,
    required this.technicalMessage,
    required this.userMessage,
    this.suggestion,
    this.originalError,
  });
  
  factory AppError.fromApiError(Map<String, dynamic> errorData) {
    final code = errorData['code'] as String;
    final message = errorData['message'] as String;
    final userMessage = errorData['user_message'] as String;
    
    return AppError(
      category: _categorizeError(code),
      severity: _getSeverity(code),
      code: code,
      technicalMessage: message,
      userMessage: userMessage,
      suggestion: errorData['suggestions']?.first,
    );
  }
  
  static ErrorCategory _categorizeError(String code) {
    if (code.contains('TOKEN') || code.contains('AUTH')) {
      return ErrorCategory.authentication;
    } else if (code.contains('NETWORK') || code.contains('TIMEOUT')) {
      return ErrorCategory.network;
    } else if (code.contains('PREMIUM') || code.contains('SUBSCRIPTION')) {
      return ErrorCategory.subscription;
    } else if (code.contains('PROCESSING') || code.contains('AI_')) {
      return ErrorCategory.processing;
    } else if (code.contains('DATA') || code.contains('ENCRYPTION')) {
      return ErrorCategory.data;
    }
    return ErrorCategory.unknown;
  }
  
  static ErrorSeverity _getSeverity(String code) {
    final criticalCodes = ['DATA_INTEGRITY_ERROR', 'ENCRYPTION_FAILED'];
    final errorCodes = ['AI_PROCESSING_FAILED', 'INVALID_TOKEN'];
    final warningCodes = ['PREMIUM_REQUIRED', 'RATE_LIMITED'];
    
    if (criticalCodes.contains(code)) return ErrorSeverity.critical;
    if (errorCodes.contains(code)) return ErrorSeverity.error;
    if (warningCodes.contains(code)) return ErrorSeverity.warning;
    return ErrorSeverity.info;
  }
}

// lib/services/error_service.dart
class ErrorService {
  static void handleError(
    AppError error, {
    BuildContext? context,
    bool showUser = true,
  }) {
    // Log error for debugging
    debugPrint('AppError [${error.code}]: ${error.technicalMessage}');
    
    // Report critical errors to crash analytics
    if (error.severity == ErrorSeverity.critical) {
      FirebaseCrashlytics.instance.recordError(
        error.originalError ?? error.technicalMessage,
        null,
        fatal: false,
      );
    }
    
    // Show user-facing error
    if (showUser && context != null) {
      _showErrorToUser(context, error);
    }
    
    // Handle specific error categories
    switch (error.category) {
      case ErrorCategory.authentication:
        _handleAuthError(error);
        break;
      case ErrorCategory.subscription:
        _handleSubscriptionError(error, context);
        break;
      case ErrorCategory.processing:
        _handleProcessingError(error, context);
        break;
      default:
        break;
    }
  }
  
  static void _showErrorToUser(BuildContext context, AppError error) {
    switch (error.severity) {
      case ErrorSeverity.critical:
        _showCriticalErrorDialog(context, error);
        break;
      case ErrorSeverity.error:
        _showErrorDialog(context, error);
        break;
      case ErrorSeverity.warning:
        _showWarningSnackBar(context, error);
        break;
      case ErrorSeverity.info:
        _showInfoSnackBar(context, error);
        break;
    }
  }
}
```

### **Loading States and User Feedback**
```dart
// lib/widgets/processing_indicator.dart
class ProcessingIndicatorWidget extends StatelessWidget {
  final ProcessingJob job;
  final VoidCallback? onCancel;
  
  const ProcessingIndicatorWidget({
    Key? key,
    required this.job,
    this.onCancel,
  }) : super(key: key);
  
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(_getJobIcon(job.jobType)),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _getJobDescription(job.jobType),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                if (onCancel != null)
                  IconButton(
                    icon: Icon(Icons.close),
                    onPressed: onCancel,
                  ),
              ],
            ),
            SizedBox(height: 12),
            LinearProgressIndicator(
              value: _calculateProgress(job),
            ),
            SizedBox(height: 8),
            Text(
              _getStatusText(job),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
  
  IconData _getJobIcon(JobType jobType) {
    switch (jobType) {
      case JobType.documentUpload:
        return Icons.cloud_upload;
      case JobType.chatMessage:
        return Icons.chat;
      case JobType.doctorReport:
        return Icons.description;
    }
  }
  
  String _getJobDescription(JobType jobType) {
    switch (jobType) {
      case JobType.documentUpload:
        return 'Processing Medical Document';
      case JobType.chatMessage:
        return 'Getting AI Response';
      case JobType.doctorReport:
        return 'Generating Doctor Report';
    }
  }
  
  double? _calculateProgress(ProcessingJob job) {
    if (job.estimatedCompletionSeconds == null) return null;
    
    // Calculate approximate progress for visual feedback only
    // Note: This is not precise progress tracking, just estimated completion
    final elapsed = DateTime.now().difference(job.initiatedAt).inSeconds;
    final estimatedProgress = elapsed / job.estimatedCompletionSeconds!;
    
    return math.min(estimatedProgress, 0.95); // Never show 100% until actually complete
  }
  
  String _getStatusText(ProcessingJob job) {
    final elapsed = DateTime.now().difference(job.initiatedAt).inSeconds;
    
    if (job.estimatedCompletionSeconds != null) {
      final remaining = job.estimatedCompletionSeconds! - elapsed;
      if (remaining > 0) {
        return 'Estimated ${remaining}s remaining';
      }
    }
    
    return 'Processing... (${elapsed}s elapsed)';
  }
}
```

---

## Performance Optimization

### **Performance Budgets & Targets**

**Integration**: Connects to **→ encryption-strategy.md** performance impact and **→ observability.md** monitoring requirements

**Design Philosophy**: Security and compliance must not compromise user experience. All performance targets designed to maintain responsive, smooth user interactions while ensuring comprehensive medical data protection.

#### **Mobile App Performance Budgets**
```typescript
// Performance targets for implementation and monitoring
interface PerformanceBudgets {
  // Encryption/Decryption Operations
  encryptionOperations: {
    fieldEncryption: {
      target: "<10ms per field",
      maximum: "<25ms per field",
      context: "Timeline item title/summary encryption during storage"
    },
    documentDecryption: {
      target: "<100ms per document", 
      maximum: "<200ms per document",
      context: "Medical analysis viewing from local storage"
    },
    biometricKeyAccess: {
      target: "<500ms total",
      maximum: "<1000ms total", 
      context: "Device root key access with biometric authentication"
    },
    batchEncryption: {
      target: "<5ms per item",
      maximum: "<10ms per item",
      context: "Timeline loading with 20 items"
    }
  },
  
  // Local Database Performance
  databaseOperations: {
    timelineQuery: {
      target: "<100ms for 20 items",
      maximum: "<200ms for 20 items",
      context: "Initial timeline load with encrypted content"
    },
    searchQuery: {
      target: "<200ms",
      maximum: "<500ms",
      context: "Full-text search across encrypted medical content"
    },
    contentInsertion: {
      target: "<50ms per item",
      maximum: "<100ms per item", 
      context: "Storing processed medical results locally"
    },
    auditLogInsertion: {
      target: "<10ms per event",
      maximum: "<25ms per event",
      context: "Local audit logging for content access"
    }
  },
  
  // User Interface Responsiveness
  uiResponsiveness: {
    timelineLoad: {
      target: "<800ms total",
      maximum: "<1.5s total",
      context: "App launch to timeline display"
    },
    resultViewing: {
      target: "<300ms",
      maximum: "<600ms", 
      context: "Tap result to full analysis display"
    },
    chatMessageDisplay: {
      target: "<150ms per message",
      maximum: "<300ms per message",
      context: "Chat history loading with decryption"
    },
    biometricAuthFlow: {
      target: "<2s total",
      maximum: "<4s total",
      context: "Biometric prompt to authenticated state"
    }
  },
  
  // Background Operations (Acceptable slower performance)
  backgroundOperations: {
    documentProcessing: {
      acceptable: "30s - 3min with spinner",
      context: "AI analysis processing with user feedback"
    },
    databaseMaintenance: {
      acceptable: "Background with no UI impact",
      context: "Index rebuilding, vacuuming, cache cleanup"
    },
    auditLogSync: {
      acceptable: "<5s batch processing", 
      context: "Local audit log maintenance"
    }
  }
}
```

#### **Performance Risk Mitigation Strategies**

**Encryption Performance Optimization**:
```dart
// 1. Lazy Encryption - Only encrypt when storing, not when displaying
class LazyEncryptionStrategy {
  // Store plaintext in memory during active use
  Map<String, String> _plaintextCache = {};
  
  Future<String> getDecryptedContent(String contentId) async {
    // Check memory cache first (no decryption cost)
    if (_plaintextCache.containsKey(contentId)) {
      return _plaintextCache[contentId]!;
    }
    
    // Decrypt only when not cached
    final encrypted = await _db.getEncryptedContent(contentId);
    final plaintext = await _encryption.decryptField(encrypted);
    
    // Cache for session (cleared on app background)
    _plaintextCache[contentId] = plaintext;
    return plaintext;
  }
}

// 2. Background Encryption - Non-critical operations
class BackgroundEncryption {
  static Future<void> encryptInBackground(List<String> contents) async {
    // Use compute() to run on background isolate
    await compute(_encryptBatch, contents);
  }
  
  static List<String> _encryptBatch(List<String> contents) {
    // Heavy encryption work on background thread
    return contents.map((content) => encrypt(content)).toList();
  }
}

// 3. Encryption Key Caching
class EncryptionKeyCache {
  static final Map<String, Uint8List> _keyCache = {};
  static const Duration _cacheTimeout = Duration(minutes: 15);
  
  static Future<Uint8List> getTableKey(String tableId) async {
    final cacheKey = '${tableId}_${DateTime.now().millisecondsSinceEpoch ~/ 900000}'; // 15min buckets
    
    if (_keyCache.containsKey(cacheKey)) {
      return _keyCache[cacheKey]!; // No key derivation cost
    }
    
    final key = await _deriveTableKey(tableId);
    _keyCache[cacheKey] = key;
    return key;
  }
}
```

**Database Performance Optimization**:
```dart
// 1. Batch Database Operations
class BatchDatabaseOperations {
  static Future<void> insertBatchContent(List<ContentItem> items) async {
    final batch = _db.batch();
    
    for (final item in items) {
      batch.insert('serenya_content', item.toMap());
    }
    
    // Single transaction for all operations
    await batch.commit(noResult: true);
  }
  
  // 2. Streaming Large Queries
  static Stream<ContentItem> getTimelineStream({int batchSize = 10}) async* {
    int offset = 0;
    
    while (true) {
      final batch = await _db.getTimelineItems(
        limit: batchSize,
        offset: offset
      );
      
      if (batch.isEmpty) break;
      
      for (final item in batch) {
        yield item; // Yield items as they're processed
      }
      
      offset += batchSize;
    }
  }
}

// 3. Smart Caching Strategy
class IntelligentCaching {
  static const int _maxTimelineCache = 50;
  static const Duration _cacheExpiry = Duration(hours: 6);
  
  static Future<List<ContentItem>> getCachedTimeline() async {
    final cached = await _cacheService.getTimelineCache();
    
    if (cached.isExpired || cached.items.length < 10) {
      // Refresh cache with latest items
      final fresh = await _db.getTimelineItems(limit: _maxTimelineCache);
      await _cacheService.updateTimelineCache(fresh);
      return fresh;
    }
    
    return cached.items;
  }
}
```

#### **Performance Monitoring Integration**
```dart
// Performance tracking for optimization identification
class PerformanceTracker {
  static final Map<String, List<Duration>> _operationTimes = {};
  
  static Future<T> trackOperation<T>(
    String operation,
    Future<T> Function() task
  ) async {
    final stopwatch = Stopwatch()..start();
    
    try {
      final result = await task();
      
      stopwatch.stop();
      _recordOperationTime(operation, stopwatch.elapsed);
      
      // Alert if exceeding performance budget
      if (_exceedsPerformanceBudget(operation, stopwatch.elapsed)) {
        await _reportPerformanceIssue(operation, stopwatch.elapsed);
      }
      
      return result;
    } catch (e) {
      stopwatch.stop();
      _recordFailedOperation(operation, stopwatch.elapsed, e);
      rethrow;
    }
  }
  
  static void _recordOperationTime(String operation, Duration elapsed) {
    _operationTimes.putIfAbsent(operation, () => []).add(elapsed);
    
    // Keep only last 100 measurements
    final times = _operationTimes[operation]!;
    if (times.length > 100) {
      times.removeAt(0);
    }
  }
  
  static bool _exceedsPerformanceBudget(String operation, Duration elapsed) {
    const budgets = {
      'encrypt_field': Duration(milliseconds: 25),
      'decrypt_document': Duration(milliseconds: 200),
      'timeline_query': Duration(milliseconds: 200),
      'biometric_auth': Duration(milliseconds: 1000),
    };
    
    return elapsed > (budgets[operation] ?? Duration(seconds: 1));
  }
}
```

### **Database Query Optimization**
```dart
// lib/services/database_optimization.dart
class DatabaseOptimizationService {
  final Database _db;
  
  DatabaseOptimizationService(this._db);
  
  /// Analyze and optimize database performance
  Future<void> optimizeDatabase() async {
    await _analyzeQueryPerformance();
    await _rebuildIndexes();
    await _vacuumDatabase();
    await _updateTableStatistics();
  }
  
  Future<void> _analyzeQueryPerformance() async {
    // Enable query analysis
    await _db.execute('EXPLAIN QUERY PLAN SELECT * FROM serenya_content ORDER BY created_at DESC LIMIT 20');
    
    // Log slow queries for optimization
    final slowQueries = await _db.rawQuery('''
      SELECT sql, count(*) as execution_count
      FROM sqlite_log 
      WHERE type = 'SLOW_QUERY'
      GROUP BY sql
      ORDER BY execution_count DESC
    ''');
    
    for (final query in slowQueries) {
      debugPrint('Slow query: ${query['sql']} (${query['execution_count']} times)');
    }
  }
  
  Future<void> _rebuildIndexes() async {
    final indexes = [
      'idx_serenya_content_timeline',
      'idx_serenya_content_type', 
      'idx_lab_results_content',
      'idx_vitals_content',
      'idx_chat_messages_content',
    ];
    
    for (final index in indexes) {
      await _db.execute('REINDEX $index');
    }
  }
  
  Future<void> _vacuumDatabase() async {
    // Reclaim unused space and defragment
    await _db.execute('VACUUM');
  }
  
  Future<void> _updateTableStatistics() async {
    // Update SQLite statistics for better query planning
    await _db.execute('ANALYZE');
  }
}
```

### **Caching Strategy**
```dart
// lib/services/cache_service.dart
class CacheService {
  final Map<String, CachedItem> _memoryCache = {};
  final Database _db;
  static const Duration defaultTTL = Duration(hours: 1);
  static const int maxMemoryCacheSize = 100;
  
  CacheService(this._db);
  
  /// Cache chat prompts for offline access
  Future<void> cacheChatPrompts(ContentType contentType, List<ChatPrompt> prompts) async {
    final key = 'chat_prompts_${contentType.toDb()}';
    
    // Store in memory cache
    _memoryCache[key] = CachedItem(
      data: prompts,
      cachedAt: DateTime.now(),
      ttl: Duration(days: 1), // Chat prompts cached for 1 day
    );
    
    // Persist to database
    await _db.execute('''
      INSERT OR REPLACE INTO cache_entries (key, data, cached_at, ttl_seconds)
      VALUES (?, ?, ?, ?)
    ''', [
      key,
      jsonEncode(prompts.map((p) => p.toJson()).toList()),
      DateTime.now().toIso8601String(),
      86400, // 1 day in seconds
    ]);
    
    _enforceMemoryCacheLimit();
  }
  
  /// Get cached chat prompts
  Future<List<ChatPrompt>?> getCachedChatPrompts(ContentType contentType) async {
    final key = 'chat_prompts_${contentType.toDb()}';
    
    // Try memory cache first
    final memoryItem = _memoryCache[key];
    if (memoryItem != null && !memoryItem.isExpired) {
      return memoryItem.data as List<ChatPrompt>;
    }
    
    // Try database cache
    final results = await _db.query(
      'cache_entries',
      where: 'key = ? AND cached_at + ttl_seconds > ?',
      whereArgs: [
        key,
        DateTime.now().millisecondsSinceEpoch ~/ 1000,
      ],
    );
    
    if (results.isNotEmpty) {
      final data = jsonDecode(results.first['data'] as String) as List;
      final prompts = data.map((json) => ChatPrompt.fromJson(json)).toList();
      
      // Update memory cache
      _memoryCache[key] = CachedItem(
        data: prompts,
        cachedAt: DateTime.parse(results.first['cached_at'] as String),
        ttl: Duration(seconds: results.first['ttl_seconds'] as int),
      );
      
      return prompts;
    }
    
    return null;
  }
  
  void _enforceMemoryCacheLimit() {
    if (_memoryCache.length > maxMemoryCacheSize) {
      // Remove oldest entries
      final sortedEntries = _memoryCache.entries.toList()
        ..sort((a, b) => a.value.cachedAt.compareTo(b.value.cachedAt));
      
      for (int i = 0; i < _memoryCache.length - maxMemoryCacheSize; i++) {
        _memoryCache.remove(sortedEntries[i].key);
      }
    }
  }
  
  /// Clear expired cache entries
  Future<void> clearExpiredCache() async {
    // Clear memory cache
    _memoryCache.removeWhere((key, item) => item.isExpired);
    
    // Clear database cache
    await _db.delete(
      'cache_entries',
      where: 'cached_at + ttl_seconds < ?',
      whereArgs: [DateTime.now().millisecondsSinceEpoch ~/ 1000],
    );
  }
}

class CachedItem {
  final dynamic data;
  final DateTime cachedAt;
  final Duration ttl;
  
  CachedItem({
    required this.data,
    required this.cachedAt,
    required this.ttl,
  });
  
  bool get isExpired => DateTime.now().isAfter(cachedAt.add(ttl));
}
```

---

## Implementation Notes

### **Development Setup**
1. **Dependencies**: Add required packages to `pubspec.yaml`
2. **Code Generation**: Run `flutter packages pub run build_runner build` for generated code
3. **Database Migration**: Implement proper schema versioning and migration logic
4. **Testing**: Create unit tests for all services, especially encryption and database operations
5. **Documentation**: Generate dartdoc for all public APIs

### **Security Considerations**
- All medical data encrypted at rest using AES-256-GCM
- Encryption keys stored in secure device storage
- No medical data in logs or crash reports
- Biometric authentication for sensitive operations
- Certificate pinning for API communication

### **Performance Guidelines**
- Use database transactions for batch operations  
- Implement pagination for all list views
- Cache frequently accessed data (chat prompts, user preferences)
- Optimize images and use lazy loading
- Background processing for non-critical operations

### **Error Recovery**
- Automatic retry with exponential backoff for network failures
- Offline operation queuing with sync when network returns
- Graceful handling of corrupted local data with user notification
- Manual sync options for users when automatic sync fails

---

**Related Documents**:
- `api-contracts.md` - Server API specifications
- `database-architecture.md` - Server-side database design  
- `encryption-strategy.md` - Security implementation details
- `llm-integration-architecture.md` - AI processing architecture