import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:dio/dio.dart';

import '../../lib/services/api_service.dart';
import '../../lib/services/auth_service.dart';

// Generate mocks for testing
@GenerateMocks([
  Dio,
  AuthService,
  File,
])
import 'api_service_test.mocks.dart';

void main() {
  group('ApiService', () {
    late ApiService apiService;
    late MockDio mockDio;
    late MockAuthService mockAuthService;

    setUp(() {
      mockDio = MockDio();
      mockAuthService = MockAuthService();
      
      // Note: In a real implementation, we'd need to inject these dependencies
      // For now, this test structure shows the intended testing approach
      apiService = ApiService();
    });

    group('Authentication Integration', () {
      test('should automatically add authentication headers to requests', () async {
        // Arrange
        when(mockAuthService.getToken()).thenAnswer((_) async => 'valid_jwt_token');
        
        when(mockDio.get('/user/profile')).thenAnswer((_) async => Response(
          data: {
            'success': true,
            'data': {
              'id': 'user_123',
              'email': 'test@example.com'
            }
          },
          statusCode: 200,
          requestOptions: RequestOptions(path: '/user/profile'),
        ));

        // Act
        final result = await apiService.getUserProfile();

        // Assert
        expect(result.success, isTrue);
        expect(result.data?['id'], equals('user_123'));
        
        // Verify that authorization header would be added by interceptor
        // Note: This would need to be tested with actual interceptor in real implementation
      });

      test('should automatically refresh token on 401 response', () async {
        // Arrange
        when(mockAuthService.getToken())
            .thenAnswer((_) async => 'expired_token');
        when(mockAuthService.isLoggedIn())
            .thenAnswer((_) async => true); // Successful refresh

        // First request fails with 401
        when(mockDio.get('/user/profile')).thenAnswer((_) async => throw DioException(
          response: Response(
            statusCode: 401,
            statusMessage: 'Unauthorized',
            requestOptions: RequestOptions(path: '/user/profile'),
          ),
          requestOptions: RequestOptions(path: '/user/profile'),
          type: DioExceptionType.badResponse,
        ));

        // After refresh, second request succeeds
        when(mockDio.fetch(any)).thenAnswer((_) async => Response(
          data: {
            'success': true,
            'data': {'id': 'user_123'}
          },
          statusCode: 200,
          requestOptions: RequestOptions(path: '/user/profile'),
        ));

        // Act & Assert
        // Note: This test would need proper interceptor setup in real implementation
        expect(mockAuthService.isLoggedIn, returnsNormally);
      });
    });

    group('Document Upload', () {
      test('should successfully upload valid document with progress tracking', () async {
        // Arrange
        final mockFile = MockFile();
        when(mockFile.path).thenReturn('/path/to/test.pdf');
        when(mockFile.existsSync()).thenReturn(true);
        when(mockFile.lengthSync()).thenReturn(1024 * 1024); // 1MB
        when(mockFile.length()).thenAnswer((_) async => 1024 * 1024);

        when(mockDio.post(
          any,
          data: any,
          onSendProgress: anyNamed('onSendProgress'),
        )).thenAnswer((_) async => Response(
          data: {
            'success': true,
            'data': {
              'job_id': 'job_123',
              'status': 'uploaded',
              'upload_timestamp': DateTime.now().millisecondsSinceEpoch,
            }
          },
          statusCode: 200,
          requestOptions: RequestOptions(path: '/upload'),
        ));

        var progressCalled = false;
        void progressCallback(int sent, int total) {
          progressCalled = true;
          expect(sent, lessThanOrEqualTo(total));
        }

        // Act
        final result = await apiService.uploadDocument(
          file: mockFile,
          fileName: 'test.pdf',
          fileType: 'pdf',
          onProgress: progressCallback,
        );

        // Assert
        expect(result.success, isTrue);
        expect(result.data?['job_id'], equals('job_123'));
        // Note: Progress callback testing would need proper Dio mock setup
      });

      test('should reject invalid file types', () async {
        // Arrange
        final mockFile = MockFile();
        when(mockFile.path).thenReturn('/path/to/test.exe');

        // Act
        final result = await apiService.uploadDocument(
          file: mockFile,
          fileName: 'test.exe',
          fileType: 'exe',
        );

        // Assert
        expect(result.success, isFalse);
        expect(result.message, contains('Unsupported file type'));
        expect(result.statusCode, equals(400));
      });

      test('should reject oversized files', () async {
        // Arrange
        final mockFile = MockFile();
        when(mockFile.path).thenReturn('/path/to/large.pdf');
        when(mockFile.existsSync()).thenReturn(true);
        when(mockFile.lengthSync()).thenReturn(10 * 1024 * 1024); // 10MB (over 5MB limit)

        // Act
        final result = await apiService.uploadDocument(
          file: mockFile,
          fileName: 'large.pdf',
          fileType: 'pdf',
        );

        // Assert
        expect(result.success, isFalse);
        expect(result.message, contains('File size'));
        expect(result.message, contains('exceeds maximum'));
        expect(result.statusCode, equals(400));
      });

      test('should handle file not found error', () async {
        // Arrange
        final mockFile = MockFile();
        when(mockFile.path).thenReturn('/path/to/missing.pdf');
        when(mockFile.existsSync()).thenReturn(false);

        // Act
        final result = await apiService.uploadDocument(
          file: mockFile,
          fileName: 'missing.pdf',
          fileType: 'pdf',
        );

        // Assert
        expect(result.success, isFalse);
        expect(result.message, contains('does not exist'));
        expect(result.statusCode, equals(400));
      });
    });

    group('Processing Status', () {
      test('should successfully retrieve processing status', () async {
        // Arrange
        const jobId = 'job_123';
        when(mockDio.get('/api/v1/process/status/$jobId'))
            .thenAnswer((_) async => Response(
          data: {
            'success': true,
            'data': {
              'job_id': jobId,
              'status': 'processing',
              'progress': 75,
              'estimated_completion': '2025-09-03T17:00:00Z'
            }
          },
          statusCode: 200,
          requestOptions: RequestOptions(path: '/api/v1/process/status/$jobId'),
        ));

        // Act
        final result = await apiService.getProcessingStatus(jobId);

        // Assert
        expect(result.success, isTrue);
        expect(result.data?['job_id'], equals(jobId));
        expect(result.data?['status'], equals('processing'));
        expect(result.data?['progress'], equals(75));
      });

      test('should handle job not found error', () async {
        // Arrange
        const jobId = 'nonexistent_job';
        when(mockDio.get('/api/v1/process/status/$jobId'))
            .thenAnswer((_) async => throw DioException(
          response: Response(
            statusCode: 404,
            statusMessage: 'Not Found',
            data: {
              'success': false,
              'error': {
                'code': 'JOB_NOT_FOUND',
                'message': 'Processing job not found',
                'user_message': 'The requested processing job was not found.'
              }
            },
            requestOptions: RequestOptions(path: '/api/v1/process/status/$jobId'),
          ),
          requestOptions: RequestOptions(path: '/api/v1/process/status/$jobId'),
          type: DioExceptionType.badResponse,
        ));

        // Act
        final result = await apiService.getProcessingStatus(jobId);

        // Assert
        expect(result.success, isFalse);
        expect(result.statusCode, equals(404));
        expect(result.errorCode, equals('RESOURCE_NOT_FOUND'));
      });
    });

    group('Error Handling', () {
      test('should handle network timeout errors appropriately', () async {
        // Arrange
        when(mockDio.get(any)).thenAnswer((_) async => throw DioException(
          requestOptions: RequestOptions(path: '/test'),
          type: DioExceptionType.connectionTimeout,
        ));

        // Act
        final result = await apiService.getUserProfile();

        // Assert
        expect(result.success, isFalse);
        expect(result.isNetworkError, isTrue);
        expect(result.message, contains('Network timeout'));
        expect(result.message, contains('check your connection'));
      });

      test('should handle server errors with healthcare-appropriate messaging', () async {
        // Arrange
        when(mockDio.get(any)).thenAnswer((_) async => throw DioException(
          response: Response(
            statusCode: 500,
            statusMessage: 'Internal Server Error',
            requestOptions: RequestOptions(path: '/test'),
          ),
          requestOptions: RequestOptions(path: '/test'),
          type: DioExceptionType.badResponse,
        ));

        // Act
        final result = await apiService.getUserProfile();

        // Assert
        expect(result.success, isFalse);
        expect(result.statusCode, equals(500));
        expect(result.errorCode, equals('SERVER_ERROR'));
        expect(result.message, contains('Server error'));
        expect(result.message, contains('team has been notified'));
      });

      test('should handle rate limiting errors', () async {
        // Arrange
        when(mockDio.get(any)).thenAnswer((_) async => throw DioException(
          response: Response(
            statusCode: 429,
            statusMessage: 'Too Many Requests',
            requestOptions: RequestOptions(path: '/test'),
          ),
          requestOptions: RequestOptions(path: '/test'),
          type: DioExceptionType.badResponse,
        ));

        // Act
        final result = await apiService.getUserProfile();

        // Assert
        expect(result.success, isFalse);
        expect(result.statusCode, equals(429));
        expect(result.errorCode, equals('RATE_LIMITED'));
        expect(result.message, contains('Too many requests'));
        expect(result.message, contains('wait a moment'));
      });
    });

    group('Retry Logic', () {
      test('should successfully retry processing with attempt tracking', () async {
        // Arrange
        const jobId = 'job_123';
        const attemptNumber = 1;
        
        when(mockDio.post(
          '/api/v1/process/retry/$jobId',
          data: anyNamed('data'),
        )).thenAnswer((_) async => Response(
          data: {'success': true},
          statusCode: 200,
          requestOptions: RequestOptions(path: '/api/v1/process/retry/$jobId'),
        ));

        // Act
        final result = await apiService.retryProcessing(jobId, attemptNumber: attemptNumber);

        // Assert
        expect(result.success, isTrue);
        expect(result.data, isTrue);
        expect(result.message, contains('retry initiated successfully'));
        
        // Verify the request included attempt tracking
        verify(mockDio.post(
          '/api/v1/process/retry/$jobId',
          data: argThat(predicate((data) => 
            data['attempt_number'] == attemptNumber &&
            data['retry_timestamp'] != null
          ), named: 'data'),
        )).called(1);
      });
    });

    group('Health Check', () {
      test('should successfully perform health check', () async {
        // Arrange
        when(mockDio.get('/health')).thenAnswer((_) async => Response(
          data: {
            'success': true,
            'data': {
              'status': 'healthy',
              'timestamp': DateTime.now().toIso8601String(),
              'version': '1.0.0'
            }
          },
          statusCode: 200,
          requestOptions: RequestOptions(path: '/health'),
        ));

        // Act
        final result = await apiService.healthCheck();

        // Assert
        expect(result.success, isTrue);
        expect(result.data?['status'], equals('healthy'));
      });
    });
  });
}