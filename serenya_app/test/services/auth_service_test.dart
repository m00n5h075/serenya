import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:dio/dio.dart';

import 'package:serenya_app/services/auth_service.dart';

// Generate mocks for testing
@GenerateMocks([
  GoogleSignIn,
  GoogleSignInAccount, 
  GoogleSignInAuthentication,
  GoogleSignInAuthorizationClient,
  GoogleSignInClientAuthorization,
  FlutterSecureStorage,
  Dio,
])
import 'auth_service_test.mocks.dart';

void main() {
  group('AuthService', () {
    late AuthService authService;
    late MockGoogleSignIn mockGoogleSignIn;
    late MockFlutterSecureStorage mockStorage;
    late MockDio mockDio;

    setUp(() {
      mockGoogleSignIn = MockGoogleSignIn();
      mockStorage = MockFlutterSecureStorage();
      mockDio = MockDio();
      
      // Note: In a real implementation, we'd need to inject these dependencies
      // For now, this test structure shows the intended testing approach
      authService = AuthService();
    });

    group('Authentication Flow', () {
      test('should successfully authenticate with Google OAuth and backend', () async {
        // Arrange
        final mockGoogleUser = MockGoogleSignInAccount();
        final mockGoogleAuth = MockGoogleSignInAuthentication();
        final mockAuthClient = MockGoogleSignInAuthorizationClient();
        final mockAuthorization = MockGoogleSignInClientAuthorization();
        
        when(mockGoogleSignIn.authenticate()).thenAnswer((_) async => mockGoogleUser);
        when(mockGoogleUser.authentication).thenReturn(mockGoogleAuth);
        when(mockGoogleUser.authorizationClient).thenReturn(mockAuthClient);
        when(mockAuthClient.authorizationForScopes(any)).thenAnswer((_) async => mockAuthorization);
        when(mockAuthorization.accessToken).thenReturn('mock_access_token');
        when(mockGoogleAuth.idToken).thenReturn('mock_id_token');
        
        // Note: BiometricAuthService uses static methods, so no mocking needed
        
        when(mockDio.post('/auth/google', data: anyNamed('data')))
            .thenAnswer((_) async => Response(
              data: {
                'success': true,
                'data': {
                  'access_token': 'jwt_access_token',
                  'refresh_token': 'jwt_refresh_token',
                  'user': {
                    'id': 'user_123',
                    'email': 'test@example.com',
                  },
                  'session': {
                    'session_id': 'session_123',
                    'expires_at': DateTime.now().add(const Duration(minutes: 15)).toIso8601String(),
                  }
                }
              },
              statusCode: 200,
              requestOptions: RequestOptions(path: '/auth/google'),
            ));

        // Act
        final result = await authService.signInWithGoogle(
          consentData: {
            'medical_disclaimers': true,
            'terms_of_service': true,
            'privacy_policy': true,
          },
        );

        // Assert
        expect(result.success, isTrue);
        expect(result.userData?['id'], equals('user_123'));
        expect(result.sessionData?['session_id'], equals('session_123'));
      });

      test('should handle Google OAuth cancellation gracefully', () async {
        // Arrange
        // Note: In Google Sign-In 7.0+, authenticate() throws exceptions for cancellation
        // rather than returning null, so we'll test exception handling instead
        when(mockGoogleSignIn.authenticate()).thenThrow(Exception('User cancelled authentication'));

        // Act
        final result = await authService.signInWithGoogle();

        // Assert
        expect(result.success, isFalse);
        expect(result.message, contains('Authentication error'));
      });

      test('should handle biometric authentication failure', () async {
        // Arrange
        final mockGoogleUser = MockGoogleSignInAccount();
        final mockGoogleAuth = MockGoogleSignInAuthentication();
        
        final mockAuthClient = MockGoogleSignInAuthorizationClient();
        final mockAuthorization = MockGoogleSignInClientAuthorization();
        
        when(mockGoogleSignIn.authenticate()).thenAnswer((_) async => mockGoogleUser);
        when(mockGoogleUser.authentication).thenReturn(mockGoogleAuth);
        when(mockGoogleUser.authorizationClient).thenReturn(mockAuthClient);
        when(mockAuthClient.authorizationForScopes(any)).thenAnswer((_) async => mockAuthorization);
        when(mockAuthorization.accessToken).thenReturn('mock_access_token');
        when(mockGoogleAuth.idToken).thenReturn('mock_id_token');
        
        // Note: BiometricAuthService static methods cannot be mocked directly

        // Act
        final result = await authService.signInWithGoogle(requireBiometric: true);

        // Assert
        expect(result.success, isFalse);
        expect(result.message, contains('Biometric authentication required'));
        
        // Should sign out from Google when biometric fails
        verify(mockGoogleSignIn.signOut()).called(1);
      });

      test('should handle backend authentication errors', () async {
        // Arrange
        final mockGoogleUser = MockGoogleSignInAccount();
        final mockGoogleAuth = MockGoogleSignInAuthentication();
        
        final mockAuthClient = MockGoogleSignInAuthorizationClient();
        final mockAuthorization = MockGoogleSignInClientAuthorization();
        
        when(mockGoogleSignIn.authenticate()).thenAnswer((_) async => mockGoogleUser);
        when(mockGoogleUser.authentication).thenReturn(mockGoogleAuth);
        when(mockGoogleUser.authorizationClient).thenReturn(mockAuthClient);
        when(mockAuthClient.authorizationForScopes(any)).thenAnswer((_) async => mockAuthorization);
        when(mockAuthorization.accessToken).thenReturn('mock_access_token');
        when(mockGoogleAuth.idToken).thenReturn('mock_id_token');
        
        // Note: BiometricAuthService static methods cannot be mocked directly
        
        when(mockDio.post('/auth/google', data: anyNamed('data')))
            .thenAnswer((_) async => Response(
              data: {
                'success': false,
                'error': {
                  'code': 'INVALID_GOOGLE_TOKEN',
                  'message': 'Google authentication failed',
                  'user_message': 'Please try signing in with Google again'
                }
              },
              statusCode: 401,
              requestOptions: RequestOptions(path: '/auth/google'),
            ));

        // Act
        final result = await authService.signInWithGoogle(requireBiometric: false);

        // Assert
        expect(result.success, isFalse);
        expect(result.errorCode, equals('INVALID_GOOGLE_TOKEN'));
        expect(result.message, equals('Please try signing in with Google again'));
      });
    });

    group('Session Management', () {
      test('should detect valid authentication status', () async {
        // Arrange
        const validJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.Lf5xXWn3M6L5uKL_qLq_1qL5z2E0v9yIgq8gJzGkM7c';
        
        when(mockStorage.read(key: 'serenya_access_token'))
            .thenAnswer((_) async => validJwt);
        when(mockStorage.read(key: 'serenya_refresh_token'))
            .thenAnswer((_) async => 'refresh_token');
        when(mockStorage.read(key: 'serenya_last_auth_time'))
            .thenAnswer((_) async => DateTime.now().subtract(const Duration(minutes: 30)).toIso8601String());

        // Act
        final isLoggedIn = await authService.isLoggedIn();

        // Assert
        expect(isLoggedIn, isTrue);
      });

      test('should detect expired healthcare session', () async {
        // Arrange
        const validJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.Lf5xXWn3M6L5uKL_qLq_1qL5z2E0v9yIgq8gJzGkM7c';
        
        when(mockStorage.read(key: 'serenya_access_token'))
            .thenAnswer((_) async => validJwt);
        when(mockStorage.read(key: 'serenya_refresh_token'))
            .thenAnswer((_) async => 'refresh_token');
        when(mockStorage.read(key: 'serenya_last_auth_time'))
            .thenAnswer((_) async => DateTime.now().subtract(const Duration(hours: 2)).toIso8601String());

        // Act
        final isLoggedIn = await authService.isLoggedIn();

        // Assert
        expect(isLoggedIn, isFalse);
      });

      test('should refresh expired access token automatically', () async {
        // Arrange
        const expiredJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';
        const refreshToken = 'valid_refresh_token';
        
        when(mockStorage.read(key: 'serenya_access_token'))
            .thenAnswer((_) async => expiredJwt);
        when(mockStorage.read(key: 'serenya_refresh_token'))
            .thenAnswer((_) async => refreshToken);
        
        when(mockDio.post('/auth/refresh', data: anyNamed('data')))
            .thenAnswer((_) async => Response(
              data: {
                'success': true,
                'data': {
                  'access_token': 'new_access_token',
                  'refresh_token': 'new_refresh_token',
                  'user': {'id': 'user_123'},
                  'session': {'session_id': 'session_123'}
                }
              },
              statusCode: 200,
              requestOptions: RequestOptions(path: '/auth/refresh'),
            ));

        // Act
        final isLoggedIn = await authService.isLoggedIn();

        // Assert
        expect(isLoggedIn, isTrue);
        verify(mockDio.post('/auth/refresh', data: anyNamed('data'))).called(1);
      });
    });

    group('Biometric Re-authentication', () {
      test('should require biometric re-authentication after timeout', () async {
        // Arrange
        when(mockStorage.read(key: 'serenya_biometric_session'))
            .thenAnswer((_) async => DateTime.now().subtract(const Duration(minutes: 45)).toIso8601String());

        // Act
        final requiresReauth = await authService.requiresBiometricReauth();

        // Assert
        expect(requiresReauth, isTrue);
      });

      test('should not require biometric re-authentication when session is fresh', () async {
        // Arrange
        when(mockStorage.read(key: 'serenya_biometric_session'))
            .thenAnswer((_) async => DateTime.now().subtract(const Duration(minutes: 15)).toIso8601String());

        // Act
        final requiresReauth = await authService.requiresBiometricReauth();

        // Assert
        expect(requiresReauth, isFalse);
      });
    });

    group('Sign Out', () {
      test('should clear all authentication data on sign out', () async {
        // Act
        await authService.signOut();

        // Assert
        verify(mockGoogleSignIn.signOut()).called(1);
        verify(mockStorage.delete(key: 'serenya_access_token')).called(1);
        verify(mockStorage.delete(key: 'serenya_refresh_token')).called(1);
        verify(mockStorage.delete(key: 'serenya_user_data')).called(1);
        verify(mockStorage.delete(key: 'serenya_session_data')).called(1);
        verify(mockStorage.delete(key: 'serenya_last_auth_time')).called(1);
        verify(mockStorage.delete(key: 'serenya_biometric_session')).called(1);
      });
    });

    group('User Data Management', () {
      test('should retrieve current user data from secure storage', () async {
        // Arrange
        final userData = {
          'id': 'user_123',
          'email': 'test@example.com',
          'subscription_tier': 'free'
        };
        
        when(mockStorage.read(key: 'serenya_user_data'))
            .thenAnswer((_) async => '{"id":"user_123","email":"test@example.com","subscription_tier":"free"}');

        // Act
        final result = await authService.getCurrentUser();

        // Assert
        expect(result, equals(userData));
      });

      test('should return null when no user data is stored', () async {
        // Arrange
        when(mockStorage.read(key: 'serenya_user_data'))
            .thenAnswer((_) async => null);

        // Act
        final result = await authService.getCurrentUser();

        // Assert
        expect(result, isNull);
      });
    });
  });
}

/// Mock BiometricAuthResult for testing
class BiometricAuthResult {
  final bool success;
  final String? errorMessage;

  const BiometricAuthResult._(this.success, this.errorMessage);

  factory BiometricAuthResult.success() {
    return const BiometricAuthResult._(true, null);
  }

  factory BiometricAuthResult.failed(String message) {
    return BiometricAuthResult._(false, message);
  }
}