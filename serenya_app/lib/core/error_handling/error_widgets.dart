import 'package:flutter/material.dart';
import 'unified_error.dart';

/// Error UI components following dev rules Layer 3 requirements
/// Provides consistent error experience across the healthcare app

class ErrorStateWidget extends StatelessWidget {
  final UnifiedError error;
  final VoidCallback? onRetry;
  final VoidCallback? onFallback;
  final VoidCallback? onEscalate;
  final String? operationContext;

  const ErrorStateWidget({
    super.key,
    required this.error,
    this.onRetry,
    this.onFallback,
    this.onEscalate,
    this.operationContext,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Error icon with category-based color
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: _getErrorColor().withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(32),
            ),
            child: Icon(
              _getErrorIcon(),
              size: 32,
              color: _getErrorColor(),
            ),
          ),
          const SizedBox(height: 16),
          
          // Error message
          Text(
            error.userMessage,
            style: const TextStyle(
              fontSize: 16,
              color: Color(0xFF212121),
              height: 1.4,
            ),
            textAlign: TextAlign.center,
          ),
          
          if (error.retryMessage != null) ...[
            const SizedBox(height: 8),
            Text(
              error.retryMessage!,
              style: const TextStyle(
                fontSize: 14,
                color: Color(0xFF757575),
              ),
              textAlign: TextAlign.center,
            ),
          ],
          
          const SizedBox(height: 20),
          
          // Action buttons based on recovery strategy
          _buildActionButtons(context),
        ],
      ),
    );
  }

  Widget _buildActionButtons(BuildContext context) {
    switch (error.recoveryStrategy) {
      case RecoveryStrategy.retry:
        return ElevatedButton(
          onPressed: onRetry,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF2196F3),
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          child: const Text('Try Again'),
        );
        
      case RecoveryStrategy.fallback:
        return Column(
          children: [
            if (onRetry != null)
              ElevatedButton(
                onPressed: onRetry,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2196F3),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: const Text('Try Again'),
              ),
            if (onRetry != null && onFallback != null) const SizedBox(height: 8),
            if (onFallback != null)
              OutlinedButton(
                onPressed: onFallback,
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF2196F3),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: const Text('Use Backup'),
              ),
          ],
        );
        
      case RecoveryStrategy.escalate:
        return ElevatedButton(
          onPressed: onEscalate,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF757575),
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          child: const Text('Contact Support'),
        );
        
      case RecoveryStrategy.ignore:
        return TextButton(
          onPressed: () {
            // Find the nearest navigator and close dialogs/modals
            final navigator = Navigator.maybeOf(context);
            if (navigator != null && navigator.canPop()) {
              navigator.pop();
            }
          },
          child: const Text('OK'),
        );
    }
  }

  Color _getErrorColor() {
    switch (error.category) {
      case ErrorCategory.technical:
        return const Color(0xFFFF5722); // Deep orange for technical issues
      case ErrorCategory.validation:
        return const Color(0xFFFF9800); // Orange for validation
      case ErrorCategory.business:
        return const Color(0xFF2196F3); // Blue for business logic
      case ErrorCategory.external:
        return const Color(0xFF9C27B0); // Purple for external services
    }
  }

  IconData _getErrorIcon() {
    switch (error.category) {
      case ErrorCategory.technical:
        return Icons.wifi_off;
      case ErrorCategory.validation:
        return Icons.warning_amber;
      case ErrorCategory.business:
        return Icons.info_outline;
      case ErrorCategory.external:
        return Icons.cloud_off;
    }
  }
}

/// Inline error widget for form fields and small spaces
class InlineErrorWidget extends StatelessWidget {
  final UnifiedError error;
  final VoidCallback? onRetry;

  const InlineErrorWidget({
    super.key,
    required this.error,
    this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: _getErrorColor().withValues(alpha: 0.1),
        border: Border.all(color: _getErrorColor().withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(
            _getErrorIcon(),
            size: 20,
            color: _getErrorColor(),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              error.userMessage,
              style: TextStyle(
                fontSize: 14,
                color: _getErrorColor().withValues(alpha: 0.78),
                height: 1.43,
              ),
            ),
          ),
          if (error.canRetry && onRetry != null) ...[
            const SizedBox(width: 12),
            TextButton(
              onPressed: onRetry,
              style: TextButton.styleFrom(
                foregroundColor: _getErrorColor(),
                padding: const EdgeInsets.symmetric(horizontal: 8),
                minimumSize: const Size(0, 32),
              ),
              child: const Text(
                'Retry',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Color _getErrorColor() {
    switch (error.category) {
      case ErrorCategory.technical:
        return const Color(0xFFFF5722);
      case ErrorCategory.validation:
        return const Color(0xFFFF9800);
      case ErrorCategory.business:
        return const Color(0xFF2196F3);
      case ErrorCategory.external:
        return const Color(0xFF9C27B0);
    }
  }

  IconData _getErrorIcon() {
    switch (error.category) {
      case ErrorCategory.technical:
        return Icons.wifi_off;
      case ErrorCategory.validation:
        return Icons.warning_amber_rounded;
      case ErrorCategory.business:
        return Icons.info_outline_rounded;
      case ErrorCategory.external:
        return Icons.cloud_off_rounded;
    }
  }
}

/// Snackbar error widget for brief notifications
class ErrorSnackBar {
  static SnackBar build(UnifiedError error, {VoidCallback? onRetry}) {
    return SnackBar(
      content: Row(
        children: [
          Icon(
            _getErrorIcon(error.category),
            color: Colors.white,
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              error.userMessage,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 14,
                height: 1.43,
              ),
            ),
          ),
        ],
      ),
      backgroundColor: _getErrorColor(error.category),
      duration: Duration(
        seconds: error.canRetry ? 6 : 4, // Longer duration for retryable errors
      ),
      action: error.canRetry && onRetry != null
          ? SnackBarAction(
              label: 'Retry',
              textColor: Colors.white,
              onPressed: onRetry,
            )
          : null,
    );
  }

  static Color _getErrorColor(ErrorCategory category) {
    switch (category) {
      case ErrorCategory.technical:
        return const Color(0xFFFF5722);
      case ErrorCategory.validation:
        return const Color(0xFFFF9800);
      case ErrorCategory.business:
        return const Color(0xFF2196F3);
      case ErrorCategory.external:
        return const Color(0xFF9C27B0);
    }
  }

  static IconData _getErrorIcon(ErrorCategory category) {
    switch (category) {
      case ErrorCategory.technical:
        return Icons.wifi_off;
      case ErrorCategory.validation:
        return Icons.warning_amber_rounded;
      case ErrorCategory.business:
        return Icons.info_outline_rounded;
      case ErrorCategory.external:
        return Icons.cloud_off_rounded;
    }
  }
}

/// Error boundary widget for catching and displaying widget errors
class ErrorBoundary extends StatefulWidget {
  final Widget child;
  final Widget Function(FlutterErrorDetails)? onError;

  const ErrorBoundary({
    super.key,
    required this.child,
    this.onError,
  });

  @override
  State<ErrorBoundary> createState() => _ErrorBoundaryState();
}

class _ErrorBoundaryState extends State<ErrorBoundary> {
  FlutterErrorDetails? _errorDetails;

  @override
  void initState() {
    super.initState();
    
    // Capture widget errors
    FlutterError.onError = (details) {
      setState(() {
        _errorDetails = details;
      });
    };
  }

  @override
  Widget build(BuildContext context) {
    if (_errorDetails != null) {
      if (widget.onError != null) {
        return widget.onError!(_errorDetails!);
      }
      
      // Default error display
      return ErrorStateWidget(
        error: const UnifiedError(
          category: ErrorCategory.technical,
          recoveryStrategy: RecoveryStrategy.retry,
          userMessage: 'We\'re having trouble displaying this content. Please try again.',
          errorCode: 'WIDGET_ERROR',
        ),
        onRetry: () {
          setState(() {
            _errorDetails = null;
          });
        },
      );
    }

    return widget.child;
  }
}