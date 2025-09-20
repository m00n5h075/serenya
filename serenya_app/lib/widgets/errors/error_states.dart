import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/constants/app_constants.dart';
import '../../core/constants/design_tokens.dart';

/// Comprehensive error state components for healthcare application
/// 
/// Provides consistent error UI patterns with:
/// - Healthcare-appropriate messaging
/// - Recovery actions
/// - Accessibility support
/// - HIPAA-compliant error handling

class ErrorStateWidget extends StatelessWidget {
  final ErrorType errorType;
  final String? customMessage;
  final String? customDescription;
  final VoidCallback? onRetry;
  final VoidCallback? onSupport;
  final VoidCallback? onDismiss;
  final Widget? customAction;
  final bool showTechnicalDetails;
  final String? technicalError;

  const ErrorStateWidget({
    super.key,
    required this.errorType,
    this.customMessage,
    this.customDescription,
    this.onRetry,
    this.onSupport,
    this.onDismiss,
    this.customAction,
    this.showTechnicalDetails = false,
    this.technicalError,
  });

  @override
  Widget build(BuildContext context) {
    final errorInfo = _getErrorInfo(errorType);
    
    return Semantics(
      label: 'Error: ${errorInfo.title}',
      child: Container(
        padding: const EdgeInsets.all(HealthcareSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildErrorIcon(errorInfo),
            const SizedBox(height: HealthcareSpacing.lg),
            _buildErrorTitle(errorInfo),
            const SizedBox(height: HealthcareSpacing.sm),
            _buildErrorDescription(errorInfo),
            if (showTechnicalDetails && technicalError != null) ...[
              const SizedBox(height: HealthcareSpacing.md),
              _buildTechnicalDetails(),
            ],
            const SizedBox(height: HealthcareSpacing.xl),
            _buildActionButtons(errorInfo),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorIcon(_ErrorInfo errorInfo) {
    return Container(
      width: 80,
      height: 80,
      decoration: BoxDecoration(
        color: errorInfo.color.withValues(alpha: 0.1),
        shape: BoxShape.circle,
        border: Border.all(
          color: errorInfo.color.withValues(alpha: 0.3),
          width: 2,
        ),
      ),
      child: Icon(
        errorInfo.icon,
        size: 40,
        color: errorInfo.color,
      ),
    );
  }

  Widget _buildErrorTitle(_ErrorInfo errorInfo) {
    return Text(
      customMessage ?? errorInfo.title,
      style: const TextStyle(
        fontSize: 20,
        fontWeight: FontWeight.bold,
        color: HealthcareColors.textPrimary,
      ),
      textAlign: TextAlign.center,
    );
  }

  Widget _buildErrorDescription(_ErrorInfo errorInfo) {
    return Text(
      customDescription ?? errorInfo.description,
      style: const TextStyle(
        fontSize: 16,
        color: HealthcareColors.textSecondary,
        height: 1.5,
      ),
      textAlign: TextAlign.center,
    );
  }

  Widget _buildTechnicalDetails() {
    return ExpansionTile(
      title: const Text(
        'Technical Details',
        style: TextStyle(
          fontSize: 14,
          color: HealthcareColors.textSecondary,
        ),
      ),
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(HealthcareSpacing.md),
          decoration: BoxDecoration(
            color: HealthcareColors.backgroundTertiary,
            borderRadius: BorderRadius.circular(HealthcareBorderRadius.sm),
            border: Border.all(
              color: HealthcareColors.surfaceBorder,
            ),
          ),
          child: Text(
            technicalError!,
            style: const TextStyle(
              fontSize: 12,
              fontFamily: 'monospace',
              color: HealthcareColors.textSecondary,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildActionButtons(_ErrorInfo errorInfo) {
    return Column(
      children: [
        if (onRetry != null && errorInfo.showRetry)
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () {
                HapticFeedback.lightImpact();
                onRetry!();
              },
              icon: const Icon(Icons.refresh),
              label: const Text('Try Again'),
              style: ElevatedButton.styleFrom(
                backgroundColor: HealthcareColors.serenyaBluePrimary,
              ),
            ),
          ),
        if (onRetry != null && onSupport != null)
          const SizedBox(height: HealthcareSpacing.sm),
        if (onSupport != null)
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () {
                HapticFeedback.lightImpact();
                onSupport!();
              },
              icon: const Icon(Icons.support_agent),
              label: const Text('Contact Support'),
            ),
          ),
        if (customAction != null) ...[
          const SizedBox(height: HealthcareSpacing.sm),
          SizedBox(
            width: double.infinity,
            child: customAction!,
          ),
        ],
        if (onDismiss != null) ...[
          const SizedBox(height: HealthcareSpacing.sm),
          TextButton(
            onPressed: onDismiss,
            child: const Text('Dismiss'),
          ),
        ],
      ],
    );
  }

  _ErrorInfo _getErrorInfo(ErrorType type) {
    switch (type) {
      case ErrorType.network:
        return _ErrorInfo(
          icon: Icons.wifi_off,
          title: 'Connection Problem',
          description: 'Please check your internet connection and try again.',
          color: HealthcareColors.cautionOrange,
          showRetry: true,
        );
      
      case ErrorType.server:
        return _ErrorInfo(
          icon: Icons.error_outline,
          title: 'Server Error',
          description: 'Our servers are experiencing issues. Please try again in a moment.',
          color: HealthcareColors.error,
          showRetry: true,
        );
      
      case ErrorType.authentication:
        return _ErrorInfo(
          icon: Icons.lock_outline,
          title: 'Authentication Required',
          description: 'Please sign in again to access your medical data.',
          color: HealthcareColors.cautionOrange,
          showRetry: false,
        );
      
      case ErrorType.fileUpload:
        return _ErrorInfo(
          icon: Icons.cloud_upload,
          title: 'Upload Failed',
          description: 'We couldn\'t upload your file. Please check the file format and try again.',
          color: HealthcareColors.error,
          showRetry: true,
        );
      
      case ErrorType.processing:
        return _ErrorInfo(
          icon: Icons.psychology,
          title: 'Processing Error',
          description: 'We encountered an issue analyzing your document. Our team has been notified.',
          color: HealthcareColors.error,
          showRetry: true,
        );
      
      case ErrorType.biometric:
        return _ErrorInfo(
          icon: Icons.fingerprint,
          title: 'Biometric Authentication Failed',
          description: 'Please try your biometric authentication again or use your device passcode.',
          color: HealthcareColors.cautionOrange,
          showRetry: true,
        );
      
      case ErrorType.permission:
        return _ErrorInfo(
          icon: Icons.security,
          title: 'Permission Required',
          description: 'Please allow access to continue using this feature.',
          color: HealthcareColors.cautionOrange,
          showRetry: false,
        );
      
      case ErrorType.fileFormat:
        return _ErrorInfo(
          icon: Icons.description,
          title: 'File Format Not Supported',
          description: 'Please upload a PDF, JPG, JPEG, or PNG file.',
          color: HealthcareColors.cautionOrange,
          showRetry: false,
        );
      
      case ErrorType.fileSize:
        return _ErrorInfo(
          icon: Icons.description,
          title: 'File Too Large',
          description: 'Please choose a file smaller than ${AppConstants.maxFileSizeBytes ~/ (1024 * 1024)}MB.',
          color: HealthcareColors.cautionOrange,
          showRetry: false,
        );
      
      case ErrorType.storage:
        return _ErrorInfo(
          icon: Icons.storage,
          title: 'Storage Error',
          description: 'Unable to save data locally. Please check device storage.',
          color: HealthcareColors.error,
          showRetry: true,
        );
      
      case ErrorType.encryption:
        return _ErrorInfo(
          icon: Icons.enhanced_encryption,
          title: 'Security Error',
          description: 'Unable to secure your data. Please try again.',
          color: HealthcareColors.emergencyRed,
          showRetry: true,
        );
      
      case ErrorType.generic:
        return _ErrorInfo(
          icon: Icons.error_outline,
          title: 'Something Went Wrong',
          description: 'An unexpected error occurred. Please try again.',
          color: HealthcareColors.error,
          showRetry: true,
        );
    }
  }
}

/// Compact error banner for inline error display
class ErrorBanner extends StatelessWidget {
  final String message;
  final ErrorType type;
  final VoidCallback? onRetry;
  final VoidCallback? onDismiss;
  final bool showIcon;

  const ErrorBanner({
    super.key,
    required this.message,
    required this.type,
    this.onRetry,
    this.onDismiss,
    this.showIcon = true,
  });

  @override
  Widget build(BuildContext context) {
    final errorInfo = _getErrorColor(type);
    
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(HealthcareSpacing.md),
      decoration: BoxDecoration(
        color: errorInfo.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(HealthcareBorderRadius.sm),
        border: Border.all(
          color: errorInfo.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        children: [
          if (showIcon) ...[
            Icon(
              _getErrorIcon(type),
              color: errorInfo,
              size: 20,
            ),
            const SizedBox(width: HealthcareSpacing.sm),
          ],
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: errorInfo,
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          if (onRetry != null) ...[
            const SizedBox(width: HealthcareSpacing.sm),
            IconButton(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              color: errorInfo,
              iconSize: 18,
              constraints: const BoxConstraints(
                minWidth: 32,
                minHeight: 32,
              ),
            ),
          ],
          if (onDismiss != null) ...[
            const SizedBox(width: HealthcareSpacing.xs),
            IconButton(
              onPressed: onDismiss,
              icon: const Icon(Icons.close),
              color: errorInfo,
              iconSize: 18,
              constraints: const BoxConstraints(
                minWidth: 32,
                minHeight: 32,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Color _getErrorColor(ErrorType type) {
    switch (type) {
      case ErrorType.network:
      case ErrorType.authentication:
      case ErrorType.biometric:
      case ErrorType.permission:
      case ErrorType.fileFormat:
      case ErrorType.fileSize:
        return HealthcareColors.cautionOrange;
      case ErrorType.encryption:
        return HealthcareColors.emergencyRed;
      default:
        return HealthcareColors.error;
    }
  }

  IconData _getErrorIcon(ErrorType type) {
    switch (type) {
      case ErrorType.network:
        return Icons.wifi_off;
      case ErrorType.authentication:
        return Icons.lock_outline;
      case ErrorType.biometric:
        return Icons.fingerprint;
      case ErrorType.fileUpload:
        return Icons.cloud_upload;
      case ErrorType.processing:
        return Icons.psychology;
      case ErrorType.permission:
        return Icons.security;
      case ErrorType.fileFormat:
      case ErrorType.fileSize:
        return Icons.description;
      case ErrorType.storage:
        return Icons.storage;
      case ErrorType.encryption:
        return Icons.enhanced_encryption;
      default:
        return Icons.error_outline;
    }
  }
}

/// Error types for consistent error categorization
enum ErrorType {
  network,       // Connectivity issues
  server,        // Backend/API errors
  authentication, // Auth failures
  fileUpload,    // Upload specific errors
  processing,    // AI/Processing errors
  biometric,     // Biometric auth errors
  permission,    // Permission denied errors
  fileFormat,    // Invalid file format
  fileSize,      // File too large
  storage,       // Local storage errors
  encryption,    // Security/encryption errors
  generic,       // Fallback for unknown errors
}

/// Error info structure for consistent error display
class _ErrorInfo {
  final IconData icon;
  final String title;
  final String description;
  final Color color;
  final bool showRetry;

  _ErrorInfo({
    required this.icon,
    required this.title,
    required this.description,
    required this.color,
    required this.showRetry,
  });
}

/// Error state builder for handling async operation errors
class ErrorStateBuilder extends StatelessWidget {
  final AsyncSnapshot snapshot;
  final Widget Function(Object error) errorBuilder;
  final Widget loadingWidget;
  final Widget Function(dynamic data) dataBuilder;

  const ErrorStateBuilder({
    super.key,
    required this.snapshot,
    required this.errorBuilder,
    required this.loadingWidget,
    required this.dataBuilder,
  });

  @override
  Widget build(BuildContext context) {
    if (snapshot.hasError) {
      return errorBuilder(snapshot.error!);
    }
    
    if (snapshot.connectionState == ConnectionState.waiting) {
      return loadingWidget;
    }
    
    if (snapshot.hasData) {
      return dataBuilder(snapshot.data);
    }
    
    return const ErrorStateWidget(
      errorType: ErrorType.generic,
      customMessage: 'No Data Available',
      customDescription: 'No information could be loaded.',
    );
  }
}

/// Utility class for error categorization and handling
class ErrorUtils {
  /// Categorize an exception into ErrorType
  static ErrorType categorizeError(dynamic error) {
    final errorString = error.toString().toLowerCase();
    
    if (errorString.contains('network') || 
        errorString.contains('connection') ||
        errorString.contains('timeout')) {
      return ErrorType.network;
    }
    
    if (errorString.contains('auth') || 
        errorString.contains('unauthorized') ||
        errorString.contains('token')) {
      return ErrorType.authentication;
    }
    
    if (errorString.contains('biometric') || 
        errorString.contains('fingerprint') ||
        errorString.contains('face id')) {
      return ErrorType.biometric;
    }
    
    if (errorString.contains('file') && errorString.contains('format')) {
      return ErrorType.fileFormat;
    }
    
    if (errorString.contains('file') && errorString.contains('size')) {
      return ErrorType.fileSize;
    }
    
    if (errorString.contains('upload')) {
      return ErrorType.fileUpload;
    }
    
    if (errorString.contains('processing') || 
        errorString.contains('analysis')) {
      return ErrorType.processing;
    }
    
    if (errorString.contains('permission')) {
      return ErrorType.permission;
    }
    
    if (errorString.contains('storage') || 
        errorString.contains('database')) {
      return ErrorType.storage;
    }
    
    if (errorString.contains('encryption') || 
        errorString.contains('security')) {
      return ErrorType.encryption;
    }
    
    if (errorString.contains('server') || 
        errorString.contains('5')) { // 5xx status codes
      return ErrorType.server;
    }
    
    return ErrorType.generic;
  }
  
  /// Get user-friendly error message
  static String getUserFriendlyMessage(dynamic error) {
    final errorType = categorizeError(error);
    final errorInfo = ErrorStateWidget(errorType: errorType)._getErrorInfo(errorType);
    return errorInfo.description;
  }
  
  /// Check if error should show retry option
  static bool shouldShowRetry(dynamic error) {
    final errorType = categorizeError(error);
    final errorInfo = ErrorStateWidget(errorType: errorType)._getErrorInfo(errorType);
    return errorInfo.showRetry;
  }
}