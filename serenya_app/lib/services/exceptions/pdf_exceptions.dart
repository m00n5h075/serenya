/// Base class for all PDF-related exceptions with user-friendly messaging
/// 
/// These exceptions provide user-friendly error messages without exposing
/// technical details or stack traces to end users.
abstract class PdfException implements Exception {
  /// User-friendly error message suitable for display to end users
  final String userMessage;
  
  /// Internal technical details for logging (not shown to users)
  final String technicalDetails;
  
  /// Whether this error is potentially recoverable by retrying
  final bool isRetryable;
  
  /// Error code for categorization and handling
  final String errorCode;

  const PdfException({
    required this.userMessage,
    required this.technicalDetails,
    required this.errorCode,
    this.isRetryable = false,
  });

  @override
  String toString() => userMessage;
}

/// Exception thrown when PDF generation fails due to system/IO issues
class PdfGenerationException extends PdfException {
  const PdfGenerationException({
    required super.technicalDetails,
    super.isRetryable = false,
  }) : super(
          userMessage: 'Unable to create PDF document. Please try again.',
          errorCode: 'PDF_GENERATION_FAILED',
        );
}

/// Exception thrown when there's insufficient storage space
class InsufficientStorageException extends PdfException {
  const InsufficientStorageException({
    required super.technicalDetails,
  }) : super(
          userMessage: 'Insufficient storage space to create PDF. Please free up some space and try again.',
          errorCode: 'INSUFFICIENT_STORAGE',
          isRetryable: false,
        );
}

/// Exception thrown when file system operations fail
class FileSystemException extends PdfException {
  const FileSystemException({
    required super.technicalDetails,
    super.isRetryable = true,
  }) : super(
          userMessage: 'File system error occurred. Please try again.',
          errorCode: 'FILE_SYSTEM_ERROR',
        );
}

/// Exception thrown when PDF file cleanup fails
class PdfCleanupException extends PdfException {
  const PdfCleanupException({
    required super.technicalDetails,
  }) : super(
          userMessage: 'Unable to clean up temporary files. This may affect storage space.',
          errorCode: 'PDF_CLEANUP_FAILED',
          isRetryable: true,
        );
}

/// Exception thrown when there are permission issues
class PermissionException extends PdfException {
  const PermissionException({
    required super.technicalDetails,
  }) : super(
          userMessage: 'Permission denied. Please check app permissions and try again.',
          errorCode: 'PERMISSION_DENIED',
          isRetryable: false,
        );
}

/// Exception thrown when PDF content is invalid or corrupted
class InvalidContentException extends PdfException {
  const InvalidContentException({
    required super.technicalDetails,
  }) : super(
          userMessage: 'Unable to process document content for PDF generation.',
          errorCode: 'INVALID_CONTENT',
          isRetryable: false,
        );
}

/// Exception thrown when sharing the PDF fails
class PdfSharingException extends PdfException {
  const PdfSharingException({
    required super.technicalDetails,
    super.isRetryable = true,
  }) : super(
          userMessage: 'Unable to share PDF document. Please try again.',
          errorCode: 'PDF_SHARING_FAILED',
        );
}

/// Exception thrown when the device has security restrictions
class SecurityException extends PdfException {
  const SecurityException({
    required super.technicalDetails,
  }) : super(
          userMessage: 'Security restrictions prevent PDF creation. Please check device settings.',
          errorCode: 'SECURITY_RESTRICTION',
          isRetryable: false,
        );
}

/// Exception thrown when operation times out
class TimeoutException extends PdfException {
  const TimeoutException({
    required super.technicalDetails,
  }) : super(
          userMessage: 'PDF generation is taking longer than expected. Please try again.',
          errorCode: 'OPERATION_TIMEOUT',
          isRetryable: true,
        );
}

/// Exception thrown for unknown/unexpected errors
class UnknownPdfException extends PdfException {
  const UnknownPdfException({
    required super.technicalDetails,
  }) : super(
          userMessage: 'An unexpected error occurred while creating PDF. Please try again.',
          errorCode: 'UNKNOWN_ERROR',
          isRetryable: true,
        );
}