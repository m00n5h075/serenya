import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:dio/dio.dart';
import '../../lib/api/error_handler.dart';
import '../../lib/api/api_client.dart';

// Generate mocks
@GenerateMocks([Dio, RequestOptions, Response])
import 'error_handler_test.mocks.dart';

void main() {
  group('ApiErrorHandler', () {
    late ApiErrorHandler errorHandler;
    late MockDio mockDio;
    late MockRequestOptions mockRequestOptions;

    setUp(() {
      mockDio = MockDio();
      mockRequestOptions = MockRequestOptions();
      errorHandler = ApiErrorHandler(mockDio);

      // Setup default mock behaviors
      when(mockRequestOptions.uri).thenReturn(Uri.parse('https://api.example.com/test'));
      when(mockRequestOptions.method).thenReturn('GET');
      when(mockRequestOptions.path).thenReturn('/test');
    });

    group('Connection Errors', () {
      test('should handle connection timeout', () async {
        final error = DioException(
          requestOptions: mockRequestOptions,
          type: DioExceptionType.connectionTimeout,
          message: 'Connection timeout',
        );

        final result = await errorHandler.handleDioError(error, 'test operation');

        expect(result.success, isFalse);
        expect(result.error, contains('Connection timeout'));
        expect(result.statusCode, equals(408));
        expect(result.metadata?['error_type'], equals('connection_timeout'));
        expect(result.metadata?['retryable'], isTrue);
      });

      test('should handle send timeout', () async {
        final error = DioException(
          requestOptions: mockRequestOptions,
          type: DioExceptionType.sendTimeout,
          message: 'Send timeout',
        );

        final result = await errorHandler.handleDioError(error, 'test operation');

        expect(result.success, isFalse);
        expect(result.error, contains('Request timeout'));
        expect(result.statusCode, equals(408));
        expect(result.metadata?['error_type'], equals('send_timeout'));
        expect(result.metadata?['retryable'], isTrue);
      });

      test('should handle receive timeout', () async {
        final error = DioException(
          requestOptions: mockRequestOptions,
          type: DioExceptionType.receiveTimeout,
          message: 'Receive timeout',
        );

        final result = await errorHandler.handleDioError(error, 'test operation');

        expect(result.success, isFalse);
        expect(result.error, contains('Response timeout'));
        expect(result.statusCode, equals(408));
        expect(result.metadata?['error_type'], equals('receive_timeout'));
        expect(result.metadata?['retryable'], isTrue);
      });

      test('should handle connection error', () async {
        final error = DioException(
          requestOptions: mockRequestOptions,
          type: DioExceptionType.connectionError,
          message: 'Connection error',
        );

        final result = await errorHandler.handleDioError(error, 'test operation');

        expect(result.success, isFalse);
        expect(result.error, contains('Network connection error'));
        expect(result.statusCode, equals(0));
        expect(result.metadata?['error_type'], equals('connection_error'));
        expect(result.metadata?['retryable'], isTrue);
      });

      test('should handle bad certificate', () async {
        final error = DioException(
          requestOptions: mockRequestOptions,
          type: DioExceptionType.badCertificate,
          message: 'Bad certificate',
        );

        final result = await errorHandler.handleDioError(error, 'test operation');

        expect(result.success, isFalse);
        expect(result.error, contains('Security certificate error'));
        expect(result.statusCode, equals(0));
        expect(result.metadata?['error_type'], equals('certificate_error'));
        expect(result.metadata?['retryable'], isFalse);
      });
    });

    group('HTTP Status Code Errors', () {
      test('should handle 400 bad request', () async {
        final mockResponse = MockResponse();
        when(mockResponse.statusCode).thenReturn(400);
        when(mockResponse.data).thenReturn({'message': 'Invalid input'});

        final error = DioException(
          requestOptions: mockRequestOptions,
          response: mockResponse,
          type: DioExceptionType.badResponse,
        );

        final result = await errorHandler.handleDioError(error, 'test operation');

        expect(result.success, isFalse);
        expect(result.error, contains('Invalid input'));
        expect(result.statusCode, equals(400));
        expect(result.metadata?['error_type'], equals('bad_request'));
        expect(result.metadata?['retryable'], isFalse);
      });

      test('should handle 401 unauthorized', () async {
        final mockResponse = MockResponse();
        when(mockResponse.statusCode).thenReturn(401);

        final error = DioException(
          requestOptions: mockRequestOptions,
          response: mockResponse,
          type: DioExceptionType.badResponse,
        );

        final result = await errorHandler.handleDioError(error, 'test operation');

        expect(result.success, isFalse);
        expect(result.error, contains('Authentication required'));
        expect(result.statusCode, equals(401));
        expect(result.metadata?['error_type'], equals('unauthorized'));
        expect(result.metadata?['retryable'], isFalse);
        expect(result.metadata?['requires_auth'], isTrue);
      });

      test('should handle 403 forbidden', () async {
        final mockResponse = MockResponse();
        when(mockResponse.statusCode).thenReturn(403);

        final error = DioException(
          requestOptions: mockRequestOptions,
          response: mockResponse,
          type: DioExceptionType.badResponse,
        );

        final result = await errorHandler.handleDioError(error, 'test operation');

        expect(result.success, isFalse);
        expect(result.error, contains('Access denied'));
        expect(result.statusCode, equals(403));
        expect(result.metadata?['error_type'], equals('forbidden'));
        expect(result.metadata?['retryable'], isFalse);
      });

      test('should handle 404 not found', () async {
        final mockResponse = MockResponse();
        when(mockResponse.statusCode).thenReturn(404);

        final error = DioException(
          requestOptions: mockRequestOptions,
          response: mockResponse,
          type: DioExceptionType.badResponse,
        );

        final result = await errorHandler.handleDioError(error, 'test operation');

        expect(result.success, isFalse);
        expect(result.error, contains('resource was not found'));
        expect(result.statusCode, equals(404));
        expect(result.metadata?['error_type'], equals('not_found'));
        expect(result.metadata?['retryable'], isFalse);
      });

      test('should handle 409 conflict', () async {
        final mockResponse = MockResponse();
        when(mockResponse.statusCode).thenReturn(409);
        when(mockResponse.data).thenReturn({'message': 'Data conflict'});

        final error = DioException(
          requestOptions: mockRequestOptions,
          response: mockResponse,
          type: DioExceptionType.badResponse,
        );

        final result = await errorHandler.handleDioError(error, 'test operation');

        expect(result.success, isFalse);
        expect(result.error, contains('Data conflict'));
        expect(result.statusCode, equals(409));
        expect(result.metadata?['error_type'], equals('conflict'));
        expect(result.metadata?['retryable'], isFalse);
      });

      test('should handle 429 rate limit', () async {
        final mockResponse = MockResponse();
        final mockHeaders = Headers.fromMap({'retry-after': ['30']});
        
        when(mockResponse.statusCode).thenReturn(429);
        when(mockResponse.headers).thenReturn(mockHeaders);

        final error = DioException(
          requestOptions: mockRequestOptions,
          response: mockResponse,
          type: DioExceptionType.badResponse,
        );

        final result = await errorHandler.handleDioError(error, 'test operation');

        expect(result.success, isFalse);
        expect(result.error, contains('Too many requests'));
        expect(result.statusCode, equals(429));
        expect(result.metadata?['error_type'], equals('rate_limited'));
        expect(result.metadata?['retryable'], isTrue);
        expect(result.metadata?['retry_after'], equals(30));
      });

      test('should handle 500 server error', () async {
        final mockResponse = MockResponse();
        when(mockResponse.statusCode).thenReturn(500);

        final error = DioException(
          requestOptions: mockRequestOptions,
          response: mockResponse,
          type: DioExceptionType.badResponse,
        );

        final result = await errorHandler.handleDioError(error, 'test operation');

        expect(result.success, isFalse);
        expect(result.error, contains('Server error'));
        expect(result.statusCode, equals(500));
        expect(result.metadata?['error_type'], equals('server_error'));
        expect(result.metadata?['retryable'], isTrue);
      });

      test('should handle 503 service unavailable', () async {
        final mockResponse = MockResponse();
        when(mockResponse.statusCode).thenReturn(503);

        final error = DioException(
          requestOptions: mockRequestOptions,
          response: mockResponse,
          type: DioExceptionType.badResponse,
        );

        final result = await errorHandler.handleDioError(error, 'test operation');

        expect(result.success, isFalse);
        expect(result.error, contains('Service temporarily unavailable'));
        expect(result.statusCode, equals(503));
        expect(result.metadata?['error_type'], equals('service_unavailable'));
        expect(result.metadata?['retryable'], isTrue);
      });
    });

    group('Retry Logic', () {
      test('should determine retryable errors correctly', () {
        // Retryable errors
        final connectionTimeout = DioException(
          requestOptions: mockRequestOptions,
          type: DioExceptionType.connectionTimeout,
        );
        expect(errorHandler.shouldRetry(connectionTimeout, 1), isTrue);

        final serverError = DioException(
          requestOptions: mockRequestOptions,
          type: DioExceptionType.badResponse,
          response: MockResponse()..statusCode = 500,
        );
        expect(errorHandler.shouldRetry(serverError, 1), isTrue);

        // Non-retryable errors
        final badCertificate = DioException(
          requestOptions: mockRequestOptions,
          type: DioExceptionType.badCertificate,
        );
        expect(errorHandler.shouldRetry(badCertificate, 1), isFalse);

        final badRequest = DioException(
          requestOptions: mockRequestOptions,
          type: DioExceptionType.badResponse,
          response: MockResponse()..statusCode = 400,
        );
        expect(errorHandler.shouldRetry(badRequest, 1), isFalse);
      });

      test('should not retry after max attempts', () {
        final connectionTimeout = DioException(
          requestOptions: mockRequestOptions,
          type: DioExceptionType.connectionTimeout,
        );
        
        expect(errorHandler.shouldRetry(connectionTimeout, 3), isFalse);
      });

      test('should calculate retry delay with exponential backoff', () {
        final delay1 = errorHandler.getRetryDelay(1);
        final delay2 = errorHandler.getRetryDelay(2);
        final delay3 = errorHandler.getRetryDelay(3);

        expect(delay1.inSeconds, equals(1));
        expect(delay2.inSeconds, equals(2));
        expect(delay3.inSeconds, equals(4));
      });

      test('should respect retry-after header', () {
        final delay = errorHandler.getRetryDelay(1, retryAfterSeconds: 30);
        expect(delay.inSeconds, equals(30));
      });
    });

    group('Static Error Methods', () {
      test('should create network error', () {
        final result = ApiErrorHandler.networkError('Custom network error');
        
        expect(result.success, isFalse);
        expect(result.error, equals('Custom network error'));
        expect(result.statusCode, equals(0));
        expect(result.metadata?['error_type'], equals('network'));
        expect(result.metadata?['retryable'], isTrue);
      });

      test('should create parsing error', () {
        final result = ApiErrorHandler.parsingError('Custom parsing error');
        
        expect(result.success, isFalse);
        expect(result.error, equals('Custom parsing error'));
        expect(result.statusCode, equals(0));
        expect(result.metadata?['error_type'], equals('parsing'));
        expect(result.metadata?['retryable'], isFalse);
      });

      test('should create validation error', () {
        final result = ApiErrorHandler.validationError('Invalid data format');
        
        expect(result.success, isFalse);
        expect(result.error, equals('Invalid data format'));
        expect(result.statusCode, equals(400));
        expect(result.metadata?['error_type'], equals('validation'));
        expect(result.metadata?['retryable'], isFalse);
      });
    });
  });

  group('HealthcareApiError', () {
    test('should create healthcare error with all properties', () {
      final error = HealthcareApiError(
        type: HealthcareErrorType.medicalDataSafety,
        userMessage: 'Your medical data is secure',
        technicalDetails: 'Encryption verification failed',
        requiresUserAction: true,
        affectsPatientSafety: true,
      );

      expect(error.type, equals(HealthcareErrorType.medicalDataSafety));
      expect(error.userMessage, equals('Your medical data is secure'));
      expect(error.technicalDetails, equals('Encryption verification failed'));
      expect(error.requiresUserAction, isTrue);
      expect(error.affectsPatientSafety, isTrue);
    });

    test('should serialize to JSON correctly', () {
      final error = HealthcareApiError(
        type: HealthcareErrorType.authentication,
        userMessage: 'Please sign in again',
        technicalDetails: 'JWT token expired',
      );

      final json = error.toJson();

      expect(json['type'], equals('HealthcareErrorType.authentication'));
      expect(json['user_message'], equals('Please sign in again'));
      expect(json['technical_details'], equals('JWT token expired'));
      expect(json['requires_user_action'], isFalse);
      expect(json['affects_patient_safety'], isFalse);
    });
  });
}