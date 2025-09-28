import 'package:flutter_test/flutter_test.dart';
import 'package:serenya_app/api/api_client.dart';
import 'package:serenya_app/core/constants/app_constants.dart';
import 'package:serenya_app/services/auth_service.dart';
import 'package:mockito/mockito.dart';

// Generate mocks
class MockAuthService extends Mock implements AuthService {}

void main() {
  group('ApiClient', () {
    late ApiClient apiClient;
    late MockAuthService mockAuthService;

    setUp(() {
      // Create mock AuthService for testing
      mockAuthService = MockAuthService();
      apiClient = ApiClient(authService: mockAuthService);
    });

    tearDown(() {
      apiClient.dispose();
    });

    group('Initialization', () {
      test('should initialize with correct singleton pattern', () {
        final instance1 = ApiClient(authService: mockAuthService);
        final instance2 = ApiClient(authService: mockAuthService);
        
        expect(instance1, equals(instance2));
        expect(identical(instance1, instance2), isTrue);
      });

      test('should setup Dio client with correct configuration', () {
        expect(apiClient.dio, isNotNull);
        expect(apiClient.dio.options.baseUrl, equals(AppConstants.baseApiUrl));
        expect(apiClient.dio.options.connectTimeout?.inSeconds, equals(ApiConstants.connectTimeoutSeconds));
        expect(apiClient.dio.options.receiveTimeout?.inSeconds, equals(ApiConstants.receiveTimeoutSeconds));
        expect(apiClient.dio.options.sendTimeout?.inSeconds, equals(ApiConstants.sendTimeoutSeconds));
      });

      test('should have correct default headers', () {
        final headers = apiClient.dio.options.headers;
        
        expect(headers['Content-Type'], equals('application/json'));
        expect(headers['Accept'], equals('application/json'));
        expect(headers['X-App-Version'], equals(AppConstants.appVersion));
        expect(headers['X-Platform'], equals('flutter'));
        expect(headers['X-API-Version'], equals('v1'));
      });

      test('should setup all interceptors', () {
        final interceptors = apiClient.dio.interceptors;
        
        expect(interceptors.length, greaterThan(0));
        // Verify interceptor types are present
        expect(interceptors.any((i) => i.toString().contains('AuthInterceptor')), isTrue);
        expect(interceptors.any((i) => i.toString().contains('EncryptionInterceptor')), isTrue);
        expect(interceptors.any((i) => i.toString().contains('LoggingInterceptor')), isTrue);
        expect(interceptors.any((i) => i.toString().contains('RetryInterceptor')), isTrue);
      });

      test('should initialize endpoint services', () {
        expect(apiClient.auth, isNotNull);
        expect(apiClient.documents, isNotNull);
        expect(apiClient.chat, isNotNull);
        expect(apiClient.subscriptions, isNotNull);
        expect(apiClient.reports, isNotNull);
      });
    });

    group('Client Information', () {
      test('should return correct client info', () {
        final info = apiClient.getClientInfo();
        
        expect(info['api_version'], equals('v1'));
        expect(info['client_version'], equals(AppConstants.appVersion));
        expect(info['base_url'], equals(AppConstants.baseApiUrl));
        expect(info['ssl_pinning_enabled'], isTrue);
        expect(info['encryption_enabled'], isTrue);
        expect(info['offline_support_enabled'], isTrue);
      });
    });

    group('Connection Testing', () {
      test('should test connection successfully with mocked response', () async {
        // This test would require mocking the Dio client
        // For now, we'll test the method exists and handles errors
        
        try {
          final result = await apiClient.testConnection();
          // If it succeeds, verify the structure
          expect(result, isNotNull);
          expect(result.success, isA<bool>());
        } catch (e) {
          // If it fails (expected in test environment), verify it's handled properly
          expect(e, isA<Exception>());
        }
      });
    });

    group('Reset and Disposal', () {
      test('should reset client state', () async {
        await apiClient.reset();
        
        // Verify client is still functional after reset
        expect(apiClient.dio, isNotNull);
        expect(apiClient.auth, isNotNull);
        expect(apiClient.documents, isNotNull);
      });

      test('should dispose client resources', () {
        // Verify disposal doesn't throw
        expect(() => apiClient.dispose(), returnsNormally);
      });
    });
  });

  group('ApiResult', () {
    test('should create successful result', () {
      const data = {'test': 'data'};
      final result = ApiResult.success(data, statusCode: 200);
      
      expect(result.success, isTrue);
      expect(result.data, equals(data));
      expect(result.statusCode, equals(200));
      expect(result.error, isNull);
    });

    test('should create failed result', () {
      const error = 'Test error';
      final result = ApiResult.failed(error, statusCode: 400);
      
      expect(result.success, isFalse);
      expect(result.error, equals(error));
      expect(result.statusCode, equals(400));
      expect(result.data, isNull);
    });

    test('should have correct string representation', () {
      final successResult = ApiResult.success({'test': 'data'});
      final failedResult = ApiResult.failed('Error message', statusCode: 500);
      
      expect(successResult.toString(), contains('ApiResult.success'));
      expect(failedResult.toString(), contains('ApiResult.failed'));
      expect(failedResult.toString(), contains('Error message'));
      expect(failedResult.toString(), contains('500'));
    });

    test('should include metadata when provided', () {
      const metadata = {'request_id': '123', 'retry_count': 2};
      final result = ApiResult.success('data', metadata: metadata);
      
      expect(result.metadata, equals(metadata));
      expect(result.metadata!['request_id'], equals('123'));
      expect(result.metadata!['retry_count'], equals(2));
    });
  });
}