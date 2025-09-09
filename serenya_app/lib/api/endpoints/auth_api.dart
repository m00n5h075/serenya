import 'dart:convert';
import 'package:dio/dio.dart';
import '../api_client.dart';
import '../error_handler.dart';
import '../../core/security/local_audit_logger.dart';

/// Authentication API endpoints implementation
/// 
/// Handles all authentication-related API calls including:
/// - Google OAuth onboarding
/// - Token refresh and validation
/// - User profile management
/// - Session management
/// - Authentication audit logging
class AuthApi {
  final Dio _dio;
  final ApiErrorHandler _errorHandler;

  AuthApi(this._dio, this._errorHandler);

  /// POST /auth/google-onboarding
  /// Complete Google OAuth onboarding process
  Future<ApiResult<AuthOnboardingResponse>> googleOnboarding({
    required String googleIdToken,
    required String deviceId,
    required String deviceName,
    String? fcmToken,
  }) async {
    try {
      final requestData = {
        'google_id_token': googleIdToken,
        'device_id': deviceId,
        'device_name': deviceName,
        if (fcmToken != null) 'fcm_token': fcmToken,
      };

      final response = await _dio.post(
        '/auth/google-onboarding',
        data: requestData,
      );

      await _logAuthSuccess('google_onboarding', requestData);

      return ApiResult.success(
        AuthOnboardingResponse.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Google OAuth onboarding');
    } catch (e) {
      return ApiResult.failed('Unexpected error during Google onboarding: $e');
    }
  }

  /// POST /auth/refresh-token
  /// Refresh authentication token
  Future<ApiResult<AuthTokenResponse>> refreshToken({
    required String refreshToken,
    required String deviceId,
  }) async {
    try {
      final requestData = {
        'refresh_token': refreshToken,
        'device_id': deviceId,
      };

      final response = await _dio.post(
        '/auth/refresh-token',
        data: requestData,
      );

      await _logAuthSuccess('token_refresh', {'device_id': deviceId});

      return ApiResult.success(
        AuthTokenResponse.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Token refresh');
    } catch (e) {
      return ApiResult.failed('Unexpected error during token refresh: $e');
    }
  }

  /// GET /auth/profile
  /// Get current user profile
  Future<ApiResult<UserProfile>> getProfile() async {
    try {
      final response = await _dio.get('/auth/profile');

      await _logAuthSuccess('profile_fetch', {});

      return ApiResult.success(
        UserProfile.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Get user profile');
    } catch (e) {
      return ApiResult.failed('Unexpected error fetching profile: $e');
    }
  }

  /// PUT /auth/profile
  /// Update user profile
  Future<ApiResult<UserProfile>> updateProfile({
    String? displayName,
    String? timezone,
    Map<String, dynamic>? preferences,
  }) async {
    try {
      final requestData = <String, dynamic>{};
      if (displayName != null) requestData['display_name'] = displayName;
      if (timezone != null) requestData['timezone'] = timezone;
      if (preferences != null) requestData['preferences'] = preferences;

      if (requestData.isEmpty) {
        return ApiResult.failed('No profile data to update');
      }

      final response = await _dio.put(
        '/auth/profile',
        data: requestData,
      );

      await _logAuthSuccess('profile_update', requestData);

      return ApiResult.success(
        UserProfile.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Update user profile');
    } catch (e) {
      return ApiResult.failed('Unexpected error updating profile: $e');
    }
  }

  /// POST /auth/logout
  /// Logout and invalidate tokens
  Future<ApiResult<void>> logout({
    required String deviceId,
    bool? logoutAllDevices,
  }) async {
    try {
      final requestData = {
        'device_id': deviceId,
        if (logoutAllDevices != null) 'logout_all_devices': logoutAllDevices,
      };

      final response = await _dio.post(
        '/auth/logout',
        data: requestData,
      );

      await _logAuthSuccess('logout', requestData);

      return ApiResult.success(
        null,
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Logout');
    } catch (e) {
      return ApiResult.failed('Unexpected error during logout: $e');
    }
  }

  /// DELETE /auth/account
  /// Delete user account
  Future<ApiResult<void>> deleteAccount({
    required String confirmationText,
    required String deviceId,
  }) async {
    try {
      final requestData = {
        'confirmation_text': confirmationText,
        'device_id': deviceId,
      };

      final response = await _dio.delete(
        '/auth/account',
        data: requestData,
      );

      await _logAuthSuccess('account_deletion', {'device_id': deviceId});

      return ApiResult.success(
        null,
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Delete account');
    } catch (e) {
      return ApiResult.failed('Unexpected error during account deletion: $e');
    }
  }

  /// Log successful authentication events
  Future<void> _logAuthSuccess(String operation, Map<String, dynamic> context) async {
    await LocalAuditLogger.logSecurityEvent(
      'auth_api_success',
      additionalData: {
        'operation': operation,
        'context': context,
        'timestamp': DateTime.now().toIso8601String(),
      },
    );
  }

  /// Reset API state
  Future<void> reset() async {
    // No persistent state to reset for auth API
  }
}

/// Google OAuth onboarding response model
class AuthOnboardingResponse {
  final String accessToken;
  final String refreshToken;
  final UserProfile user;
  final int expiresIn;

  AuthOnboardingResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
    required this.expiresIn,
  });

  factory AuthOnboardingResponse.fromJson(Map<String, dynamic> json) {
    return AuthOnboardingResponse(
      accessToken: json['access_token'] as String,
      refreshToken: json['refresh_token'] as String,
      user: UserProfile.fromJson(json['user'] as Map<String, dynamic>),
      expiresIn: json['expires_in'] as int,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'access_token': accessToken,
      'refresh_token': refreshToken,
      'user': user.toJson(),
      'expires_in': expiresIn,
    };
  }
}

/// Authentication token response model
class AuthTokenResponse {
  final String accessToken;
  final String? refreshToken;
  final int expiresIn;

  AuthTokenResponse({
    required this.accessToken,
    this.refreshToken,
    required this.expiresIn,
  });

  factory AuthTokenResponse.fromJson(Map<String, dynamic> json) {
    return AuthTokenResponse(
      accessToken: json['access_token'] as String,
      refreshToken: json['refresh_token'] as String?,
      expiresIn: json['expires_in'] as int,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'access_token': accessToken,
      if (refreshToken != null) 'refresh_token': refreshToken,
      'expires_in': expiresIn,
    };
  }
}

/// User profile model
class UserProfile {
  final String userId;
  final String email;
  final String displayName;
  final String? profilePicture;
  final String timezone;
  final DateTime createdAt;
  final DateTime? lastLoginAt;
  final Map<String, dynamic>? preferences;

  UserProfile({
    required this.userId,
    required this.email,
    required this.displayName,
    this.profilePicture,
    required this.timezone,
    required this.createdAt,
    this.lastLoginAt,
    this.preferences,
  });

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      userId: json['user_id'] as String,
      email: json['email'] as String,
      displayName: json['display_name'] as String,
      profilePicture: json['profile_picture'] as String?,
      timezone: json['timezone'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      lastLoginAt: json['last_login_at'] != null 
          ? DateTime.parse(json['last_login_at'] as String)
          : null,
      preferences: json['preferences'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'user_id': userId,
      'email': email,
      'display_name': displayName,
      if (profilePicture != null) 'profile_picture': profilePicture,
      'timezone': timezone,
      'created_at': createdAt.toIso8601String(),
      if (lastLoginAt != null) 'last_login_at': lastLoginAt!.toIso8601String(),
      if (preferences != null) 'preferences': preferences,
    };
  }
}