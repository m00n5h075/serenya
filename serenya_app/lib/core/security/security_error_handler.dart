import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'local_audit_logger.dart';
import 'biometric_auth_service.dart';
import 'fallback_auth.dart';
import 'certificate_pinning.dart';

/// Comprehensive security error handling system
/// 
/// Provides centralized handling of all security-related errors
/// with appropriate user messaging and recovery options.
class SecurityErrorHandler {
  static const String _logPrefix = 'SECURITY_ERROR';

  /// Handle authentication errors with appropriate UI response
  static Future<SecurityErrorResult> handleAuthenticationError(
    AuthResult authResult,
    BuildContext? context, {
    bool showUserDialog = true,
  }) async {
    await _logSecurityError(
      'authentication_error',
      error: authResult.failureReason ?? 'unknown',
      method: authResult.method.toString(),
    );

    switch (authResult.failureReason) {
      case 'biometric_not_available':
        if (context == null || !context.mounted) return const SecurityErrorResult(handled: false, canRetry: false, userMessage: 'Session expired');
        return await _handleBiometricUnavailable(context, showUserDialog);

      case 'biometric_not_enrolled':
        if (context == null || !context.mounted) return const SecurityErrorResult(handled: false, canRetry: false, userMessage: 'Session expired');
        return await _handleBiometricNotEnrolled(context, showUserDialog);

      case 'biometric_locked_out':
        if (context == null || !context.mounted) return const SecurityErrorResult(handled: false, canRetry: false, userMessage: 'Session expired');
        return await _handleBiometricLockedOut(context, showUserDialog);

      case 'biometric_permanently_locked_out':
        if (context == null || !context.mounted) return const SecurityErrorResult(handled: false, canRetry: false, userMessage: 'Session expired');
        return await _handleBiometricPermanentlyLocked(context, showUserDialog);

      case 'invalid_pin':
        if (context == null || !context.mounted) return const SecurityErrorResult(handled: false, canRetry: false, userMessage: 'Session expired');
        return await _handleInvalidPin(context, showUserDialog);

      case 'temporarily_locked_out':
        if (context == null || !context.mounted) return const SecurityErrorResult(handled: false, canRetry: false, userMessage: 'Session expired');
        return await _handleTemporaryLockout(context, showUserDialog);

      case 'no_auth_methods_available':
        return await _handleNoAuthMethods(context, showUserDialog);

      case 'authentication_system_error':
        return await _handleSystemError(context, showUserDialog);

      default:
        return await _handleGenericAuthError(context, showUserDialog, authResult.failureReason);
    }
  }

  /// Handle certificate pinning errors
  static Future<SecurityErrorResult> handleCertificatePinningError(
    CertificatePinningException error,
    BuildContext? context, {
    bool showUserDialog = true,
  }) async {
    await _logSecurityError(
      'certificate_pinning_error',
      error: error.message,
      host: error.host,
      severity: 'high',
    );

    if (showUserDialog && context != null && context.mounted) {
      final result = await _showCertificateErrorDialog(context, error);
      return SecurityErrorResult(
        handled: true,
        userAction: result,
        canRetry: false, // Certificate errors should not be retried
        requiresAppUpdate: true,
      );
    }

    return const SecurityErrorResult(
      handled: false,
      canRetry: false,
      requiresAppUpdate: true,
    );
  }

  /// Handle secure storage errors
  static Future<SecurityErrorResult> handleSecureStorageError(
    String operation,
    String error,
    BuildContext? context, {
    bool showUserDialog = true,
  }) async {
    await _logSecurityError(
      'secure_storage_error',
      error: error,
      operation: operation,
    );

    if (error.contains('user_cancel') || error.contains('authentication_failed')) {
      return const SecurityErrorResult(
        handled: true,
        canRetry: true,
        userMessage: 'Authentication required to access secure data',
      );
    }

    if (error.contains('hardware_not_available') || error.contains('keystore_error')) {
      if (context == null || !context.mounted) return const SecurityErrorResult(handled: false, canRetry: false, userMessage: 'Session expired');
      return await _handleHardwareSecurityError(context, showUserDialog);
    }

    return const SecurityErrorResult(
      handled: false,
      canRetry: true,
      userMessage: 'Secure storage error. Please try again.',
    );
  }

  /// Handle device key management errors
  static Future<SecurityErrorResult> handleKeyManagementError(
    String operation,
    String error,
    BuildContext? context, {
    bool showUserDialog = true,
  }) async {
    await _logSecurityError(
      'key_management_error',
      error: error,
      operation: operation,
      severity: 'high',
    );

    if (error.contains('device_binding_violation')) {
      if (context == null || !context.mounted) return const SecurityErrorResult(handled: false, canRetry: false, userMessage: 'Session expired');
      return await _handleDeviceBindingViolation(context, showUserDialog);
    }

    if (error.contains('key_derivation_failed')) {
      if (context == null || !context.mounted) return const SecurityErrorResult(handled: false, canRetry: false, userMessage: 'Session expired');
      return await _handleKeyDerivationError(context, showUserDialog);
    }

    if (error.contains('biometric_enrollment_change')) {
      if (context == null || !context.mounted) return const SecurityErrorResult(handled: false, canRetry: false, userMessage: 'Session expired');
      return await _handleBiometricEnrollmentChange(context, showUserDialog);
    }

    return const SecurityErrorResult(
      handled: false,
      canRetry: false,
      userMessage: 'Security key error. Please restart the app.',
      requiresRestart: true,
    );
  }

  /// Handle network security errors
  static Future<SecurityErrorResult> handleNetworkSecurityError(
    String error,
    BuildContext? context, {
    bool showUserDialog = true,
  }) async {
    await _logSecurityError(
      'network_security_error',
      error: error,
      severity: 'medium',
    );

    if (error.contains('certificate') || error.contains('ssl') || error.contains('tls')) {
      if (context == null || !context.mounted) return const SecurityErrorResult(handled: false, canRetry: false, userMessage: 'Session expired');
      return await _handleNetworkCertificateError(context, showUserDialog);
    }

    if (error.contains('man_in_the_middle') || error.contains('mitm')) {
      return await _handlePotentialMITMError(context, showUserDialog);
    }

    return const SecurityErrorResult(
      handled: false,
      canRetry: true,
      userMessage: 'Network security error. Please check your connection.',
    );
  }

  // Private helper methods for specific error handling

  static Future<SecurityErrorResult> _handleBiometricUnavailable(
    BuildContext? context,
    bool showDialog,
  ) async {
    if (showDialog && context != null && context.mounted) {
      final hasPin = await BiometricAuthService.isPinSet();
      
      if (hasPin && context.mounted) {
        await _showErrorDialog(
          context,
          'Biometric Authentication Unavailable',
          'Biometric authentication is not available on this device. You can use your PIN instead.',
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop('use_pin'),
              child: const Text('Use PIN'),
            ),
          ],
        );
        return const SecurityErrorResult(handled: true, canRetry: true);
      } else {
        if (!context.mounted) return const SecurityErrorResult(handled: false, canRetry: false);
        final setupPin = await _showSetupPinDialog(context);
        return SecurityErrorResult(
          handled: setupPin,
          canRetry: setupPin,
          userMessage: 'PIN setup required for authentication',
        );
      }
    }

    return const SecurityErrorResult(handled: false, canRetry: true);
  }

  static Future<SecurityErrorResult> _handleBiometricNotEnrolled(
    BuildContext? context,
    bool showDialog,
  ) async {
    if (showDialog && context != null) {
      await _showErrorDialog(
        context,
        'Biometric Setup Required',
        'Please set up biometric authentication in your device settings to use this feature.',
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop('setup_biometric'),
            child: const Text('Open Settings'),
          ),
        ],
      );
    }

    return const SecurityErrorResult(
      handled: true,
      canRetry: false,
      userMessage: 'Biometric authentication needs to be set up on your device',
    );
  }

  static Future<SecurityErrorResult> _handleBiometricLockedOut(
    BuildContext? context,
    bool showDialog,
  ) async {
    if (showDialog && context != null) {
      await _showErrorDialog(
        context,
        'Biometric Authentication Locked',
        'Too many failed biometric attempts. Please wait a moment and try again, or use your device passcode.',
      );
    }

    return const SecurityErrorResult(
      handled: true,
      canRetry: true,
      userMessage: 'Biometric authentication temporarily locked',
    );
  }

  static Future<SecurityErrorResult> _handleBiometricPermanentlyLocked(
    BuildContext? context,
    bool showDialog,
  ) async {
    if (showDialog && context != null) {
      await _showErrorDialog(
        context,
        'Biometric Authentication Disabled',
        'Biometric authentication has been disabled due to security reasons. Please use your device passcode or set up a PIN.',
        severity: 'high',
      );
    }

    return const SecurityErrorResult(
      handled: true,
      canRetry: false,
      userMessage: 'Biometric authentication permanently disabled',
      requiresAppUpdate: true,
    );
  }

  static Future<SecurityErrorResult> _handleInvalidPin(
    BuildContext? context,
    bool showDialog,
  ) async {
    return const SecurityErrorResult(
      handled: true,
      canRetry: true,
      userMessage: 'Incorrect PIN entered',
    );
  }

  static Future<SecurityErrorResult> _handleTemporaryLockout(
    BuildContext? context,
    bool showDialog,
  ) async {
    if (showDialog && context != null) {
      final remaining = FallbackAuthService.remainingLockoutTime;
      final timeText = remaining != null 
          ? '${remaining.inMinutes}m ${remaining.inSeconds % 60}s' 
          : 'a few minutes';
          
      await _showErrorDialog(
        context,
        'Account Temporarily Locked',
        'Too many failed authentication attempts. Please wait $timeText and try again.',
        severity: 'medium',
      );
    }

    return const SecurityErrorResult(
      handled: true,
      canRetry: false,
      userMessage: 'Authentication temporarily locked',
    );
  }

  static Future<SecurityErrorResult> _handleNoAuthMethods(
    BuildContext? context,
    bool showDialog,
  ) async {
    if (showDialog && context != null) {
      final setupPin = await _showSetupPinDialog(context);
      return SecurityErrorResult(
        handled: setupPin,
        canRetry: setupPin,
        userMessage: 'Authentication setup required',
      );
    }

    return const SecurityErrorResult(handled: false, canRetry: false);
  }

  static Future<SecurityErrorResult> _handleSystemError(
    BuildContext? context,
    bool showDialog,
  ) async {
    if (showDialog && context != null) {
      await _showErrorDialog(
        context,
        'Authentication System Error',
        'A system error occurred during authentication. Please restart the app and try again.',
        severity: 'high',
      );
    }

    return const SecurityErrorResult(
      handled: true,
      canRetry: false,
      requiresRestart: true,
      userMessage: 'Authentication system error',
    );
  }

  static Future<SecurityErrorResult> _handleGenericAuthError(
    BuildContext? context,
    bool showDialog,
    String? reason,
  ) async {
    if (showDialog && context != null) {
      await _showErrorDialog(
        context,
        'Authentication Error',
        'Authentication failed${reason != null ? ': $reason' : ''}. Please try again.',
      );
    }

    return const SecurityErrorResult(
      handled: true,
      canRetry: true,
      userMessage: 'Authentication error occurred',
    );
  }

  static Future<SecurityErrorResult> _handleHardwareSecurityError(
    BuildContext? context,
    bool showDialog,
  ) async {
    if (showDialog && context != null) {
      await _showErrorDialog(
        context,
        'Hardware Security Error',
        'Your device\'s security hardware is not available. Some features may not work correctly.',
        severity: 'high',
      );
    }

    return const SecurityErrorResult(
      handled: true,
      canRetry: false,
      userMessage: 'Hardware security not available',
    );
  }

  static Future<SecurityErrorResult> _handleDeviceBindingViolation(
    BuildContext? context,
    bool showDialog,
  ) async {
    if (showDialog && context != null) {
      await _showErrorDialog(
        context,
        'Device Security Violation',
        'This app is bound to a different device. For your security, please reinstall the app.',
        severity: 'high',
      );
    }

    return const SecurityErrorResult(
      handled: true,
      canRetry: false,
      requiresReinstall: true,
      userMessage: 'Device binding violation detected',
    );
  }

  static Future<SecurityErrorResult> _handleKeyDerivationError(
    BuildContext? context,
    bool showDialog,
  ) async {
    if (showDialog && context != null) {
      await _showErrorDialog(
        context,
        'Security Key Error',
        'Failed to generate security keys. Please sign in again.',
        severity: 'medium',
      );
    }

    return const SecurityErrorResult(
      handled: true,
      canRetry: false,
      requiresReauth: true,
      userMessage: 'Security key generation failed',
    );
  }

  static Future<SecurityErrorResult> _handleBiometricEnrollmentChange(
    BuildContext? context,
    bool showDialog,
  ) async {
    if (showDialog && context != null) {
      await _showErrorDialog(
        context,
        'Biometric Settings Changed',
        'Your biometric settings have changed. For security, please sign in again.',
        severity: 'medium',
      );
    }

    return const SecurityErrorResult(
      handled: true,
      canRetry: false,
      requiresReauth: true,
      userMessage: 'Biometric enrollment changed',
    );
  }

  static Future<SecurityErrorResult> _handleNetworkCertificateError(
    BuildContext? context,
    bool showDialog,
  ) async {
    if (showDialog && context != null) {
      await _showErrorDialog(
        context,
        'Network Security Error',
        'Cannot verify server security certificate. Please check your network connection and try again.',
        severity: 'high',
      );
    }

    return const SecurityErrorResult(
      handled: true,
      canRetry: true,
      userMessage: 'Network certificate error',
    );
  }

  static Future<SecurityErrorResult> _handlePotentialMITMError(
    BuildContext? context,
    bool showDialog,
  ) async {
    if (showDialog && context != null) {
      await _showErrorDialog(
        context,
        'Potential Security Threat',
        'A potential security threat has been detected with your network connection. Please ensure you are connected to a trusted network.',
        severity: 'high',
      );
    }

    return const SecurityErrorResult(
      handled: true,
      canRetry: false,
      userMessage: 'Potential network security threat detected',
    );
  }

  // UI helper methods

  static Future<String?> _showCertificateErrorDialog(
    BuildContext context,
    CertificatePinningException error,
  ) async {
    return await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Security Certificate Error'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.security,
              color: Colors.red,
              size: 48,
            ),
            const SizedBox(height: 16),
            Text(
              'Could not verify the security of the connection to ${error.host}. This may indicate a security threat.',
              textAlign: TextAlign.center,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop('update_app'),
            child: const Text('Update App'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop('contact_support'),
            child: const Text('Contact Support'),
          ),
        ],
      ),
    );
  }

  static Future<void> _showErrorDialog(
    BuildContext context,
    String title,
    String message, {
    String severity = 'medium',
    List<Widget>? actions,
  }) async {
    Color iconColor;
    IconData iconData;
    
    switch (severity) {
      case 'high':
        iconColor = Colors.red;
        iconData = Icons.error;
        break;
      case 'medium':
        iconColor = Colors.orange;
        iconData = Icons.warning;
        break;
      default:
        iconColor = Colors.blue;
        iconData = Icons.info;
    }

    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(iconData, color: iconColor, size: 48),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center),
          ],
        ),
        actions: actions ?? [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  static Future<bool> _showSetupPinDialog(BuildContext context) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Setup PIN Required'),
        content: const Text(
          'To secure your medical data, please set up a 4-digit PIN for authentication.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Setup PIN'),
          ),
        ],
      ),
    );
    
    return result ?? false;
  }

  static Future<void> _logSecurityError(
    String errorType, {
    String? error,
    String? method,
    String? host,
    String? operation,
    String? severity,
  }) async {
    final eventData = {
      'event_type': 'security_event',
      'event_subtype': errorType,
      'timestamp': DateTime.now().toIso8601String(),
      'security_details': {
        'component': 'security_error_handler',
        'error': error,
        'auth_method': method,
        'host': host,
        'operation': operation,
        'severity': severity ?? 'medium',
      }
    };

    await LocalAuditLogger.logSecurityEvent(
      'security_error_event',
      additionalData: eventData,
    );

    // Console logging for development
    if (kDebugMode) {
      print('$_logPrefix: $errorType - Error: $error, Severity: ${severity ?? 'medium'}');
    }
  }
}

/// Result of security error handling
class SecurityErrorResult {
  final bool handled;
  final bool canRetry;
  final bool requiresRestart;
  final bool requiresReinstall;
  final bool requiresReauth;
  final bool requiresAppUpdate;
  final String? userMessage;
  final String? userAction;

  const SecurityErrorResult({
    required this.handled,
    this.canRetry = false,
    this.requiresRestart = false,
    this.requiresReinstall = false,
    this.requiresReauth = false,
    this.requiresAppUpdate = false,
    this.userMessage,
    this.userAction,
  });

  @override
  String toString() => 'SecurityErrorResult(handled: $handled, canRetry: $canRetry, message: $userMessage)';
}

/// Security error types
enum SecurityErrorType {
  authentication,
  certificatePinning,
  secureStorage,
  keyManagement,
  networkSecurity,
  deviceBinding,
  biometric,
  unknown,
}