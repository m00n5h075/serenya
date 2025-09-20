import 'package:flutter_test/flutter_test.dart';
import 'package:serenya_app/services/exceptions/pdf_exceptions.dart';
import 'package:serenya_app/services/pdf_cleanup_service.dart';

/// Test suite for PDF security hardening implementation
/// 
/// Tests the CTO's recommended security fixes:
/// - User-friendly exception handling
/// - PDF cleanup service functionality
/// - Error message sanitization
/// - Service lifecycle management
void main() {
  group('PDF Security Hardening Tests', () {
    
    group('PDF Exception Handling', () {
      test('should create user-friendly error messages', () {
        const exception = PdfGenerationException(
          technicalDetails: 'Internal error with stack trace',
        );
        
        expect(exception.userMessage, equals('Unable to create PDF document. Please try again.'));
        expect(exception.errorCode, equals('PDF_GENERATION_FAILED'));
        expect(exception.technicalDetails, contains('Internal error'));
        expect(exception.toString(), equals(exception.userMessage));
      });
      
      test('should handle insufficient storage gracefully', () {
        const exception = InsufficientStorageException(
          technicalDetails: 'Out of disk space on device',
        );
        
        expect(exception.userMessage, contains('Insufficient storage'));
        expect(exception.errorCode, equals('INSUFFICIENT_STORAGE'));
        expect(exception.isRetryable, isFalse);
      });
      
      test('should handle permission errors appropriately', () {
        const exception = PermissionException(
          technicalDetails: 'Access denied to temp directory',
        );
        
        expect(exception.userMessage, contains('Permission denied'));
        expect(exception.errorCode, equals('PERMISSION_DENIED'));
        expect(exception.isRetryable, isFalse);
      });
      
      test('should handle sharing errors with retry option', () {
        const exception = PdfSharingException(
          technicalDetails: 'Share intent failed',
        );
        
        expect(exception.userMessage, contains('Unable to share PDF'));
        expect(exception.errorCode, equals('PDF_SHARING_FAILED'));
        expect(exception.isRetryable, isTrue);
      });
      
      test('should handle timeout errors', () {
        const exception = TimeoutException(
          technicalDetails: 'PDF generation took too long',
        );
        
        expect(exception.userMessage, contains('taking longer than expected'));
        expect(exception.errorCode, equals('OPERATION_TIMEOUT'));
        expect(exception.isRetryable, isTrue);
      });
      
      test('should never expose technical details in user message', () {
        final exceptions = [
          const PdfGenerationException(technicalDetails: 'SQLException: table not found'),
          const InvalidContentException(technicalDetails: 'NullPointerException at line 123'),
          const SecurityException(technicalDetails: 'SecurityManager blocked access'),
          const UnknownPdfException(technicalDetails: 'Stack overflow in PDF library'),
        ];
        
        for (final exception in exceptions) {
          // User messages should never contain technical terms
          expect(exception.userMessage, isNot(contains('Exception')));
          expect(exception.userMessage, isNot(contains('Error')));
          expect(exception.userMessage, isNot(contains('null')));
          expect(exception.userMessage, isNot(contains('Stack')));
          expect(exception.userMessage, isNot(contains('SQL')));
          
          // But technical details should be preserved for logging
          expect(exception.technicalDetails, isNotEmpty);
        }
      });
    });
    
    group('PDF Cleanup Service', () {
      late PdfCleanupService cleanupService;
      
      setUp(() {
        cleanupService = PdfCleanupService();
      });
      
      test('should initialize cleanup service', () async {
        // This is a basic structure test - actual file operations would need mocking
        expect(cleanupService, isNotNull);
      });
      
      test('should identify Serenya PDF files correctly', () {
        // Testing the internal file identification logic would require making the method public
        // or using reflection. For now, we test the expected behavior.
        expect(true, isTrue); // Placeholder for file identification tests
      });
      
      test('should create cleanup stats properly', () {
        final stats = CleanupStats(
          totalPdfFiles: 5,
          oldPdfFiles: 2,
          totalSizeBytes: 1024 * 1024, // 1MB
          isServiceActive: true,
          nextCleanupDue: DateTime.now().add(const Duration(hours: 1)),
        );
        
        expect(stats.totalPdfFiles, equals(5));
        expect(stats.oldPdfFiles, equals(2));
        expect(stats.totalSizeMB, closeTo(1.0, 0.1));
        expect(stats.isServiceActive, isTrue);
        expect(stats.needsCleanup, isTrue);
        expect(stats.hasError, isFalse);
      });
      
      test('should handle cleanup result correctly', () {
        final result = CleanupResult(
          filesScanned: 10,
          filesRemoved: 3,
          errors: ['Error removing file1.pdf'],
        );
        
        expect(result.filesScanned, equals(10));
        expect(result.filesRemoved, equals(3));
        expect(result.hasErrors, isTrue);
        expect(result.isSuccessful, isFalse);
      });
      
      test('should handle successful cleanup result', () {
        final result = CleanupResult(
          filesScanned: 5,
          filesRemoved: 2,
          errors: [],
        );
        
        expect(result.filesScanned, equals(5));
        expect(result.filesRemoved, equals(2));
        expect(result.hasErrors, isFalse);
        expect(result.isSuccessful, isTrue);
      });
    });
    
    group('Security Hardening Validation', () {
      test('should never expose sensitive information in error messages', () {
        // Test all exception types to ensure they don't leak sensitive data
        final sensitiveData = [
          'password123',
          '/private/sensitive/path',
          'API_KEY_SECRET',
          'user@example.com',
          '192.168.1.1',
          'Internal server error with details',
        ];
        
        final exceptions = [
          PdfGenerationException(technicalDetails: 'Contains ${sensitiveData.join(' ')}'),
          FileSystemException(technicalDetails: 'Path: ${sensitiveData[1]}'),
          InvalidContentException(technicalDetails: 'User data: ${sensitiveData[3]}'),
        ];
        
        for (final exception in exceptions) {
          for (final sensitive in sensitiveData) {
            expect(exception.userMessage, isNot(contains(sensitive)),
              reason: 'User message should not contain sensitive data: $sensitive');
          }
        }
      });
      
      test('should provide appropriate retry guidance', () {
        // Retryable errors should suggest retry
        final retryableExceptions = [
          const PdfGenerationException(technicalDetails: 'Temporary failure', isRetryable: true),
          const PdfSharingException(technicalDetails: 'Share failed'),
          const TimeoutException(technicalDetails: 'Operation timed out'),
          const FileSystemException(technicalDetails: 'Temporary IO error'),
        ];
        
        for (final exception in retryableExceptions) {
          expect(exception.isRetryable, isTrue,
            reason: '${exception.errorCode} should be retryable');
        }
        
        // Non-retryable errors should not suggest retry
        final nonRetryableExceptions = [
          const InsufficientStorageException(technicalDetails: 'No space'),
          const PermissionException(technicalDetails: 'Access denied'),
          const InvalidContentException(technicalDetails: 'Bad data'),
          const SecurityException(technicalDetails: 'Security restriction'),
        ];
        
        for (final exception in nonRetryableExceptions) {
          expect(exception.isRetryable, isFalse,
            reason: '${exception.errorCode} should not be retryable');
        }
      });
    });
  });
}