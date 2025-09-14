import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'biometric_auth_service.dart';
import 'local_audit_logger.dart';

/// Fallback Authentication Service and UI Components
/// 
/// Provides PIN-based authentication when biometrics are unavailable
/// or failed, with secure PIN entry and comprehensive error handling.
class FallbackAuthService {
  static const Duration _lockoutDuration = Duration(minutes: 5);
  static const int _maxFailedAttempts = 3;
  
  static int _failedAttempts = 0;
  static DateTime? _lockoutUntil;

  /// Check if PIN authentication is currently locked out
  static bool get isLockedOut {
    if (_lockoutUntil == null) return false;
    
    if (DateTime.now().isBefore(_lockoutUntil!)) {
      return true;
    } else {
      // Lockout period expired, reset
      _lockoutUntil = null;
      _failedAttempts = 0;
      return false;
    }
  }

  /// Get remaining lockout time
  static Duration? get remainingLockoutTime {
    if (!isLockedOut) return null;
    return _lockoutUntil!.difference(DateTime.now());
  }

  /// Reset failed attempts counter
  static Future<void> resetFailedAttempts() async {
    _failedAttempts = 0;
    _lockoutUntil = null;
    
    await LocalAuditLogger.logSecurityEvent(
      'pin_lockout_reset',
      additionalData: {
        'event_type': 'security_event',
        'event_subtype': 'pin_lockout_reset',
        'timestamp': DateTime.now().toIso8601String(),
        'security_details': {
          'component': 'fallback_auth',
          'action': 'lockout_reset',
        }
      },
    );
  }

  /// Record failed PIN attempt
  static Future<void> recordFailedAttempt() async {
    _failedAttempts++;
    
    if (_failedAttempts >= _maxFailedAttempts) {
      _lockoutUntil = DateTime.now().add(_lockoutDuration);
      
      await LocalAuditLogger.logSecurityEvent(
        'pin_lockout_triggered',
        additionalData: {
          'event_type': 'security_event',
          'event_subtype': 'pin_lockout_triggered',
          'timestamp': DateTime.now().toIso8601String(),
          'security_details': {
            'component': 'fallback_auth',
            'failed_attempts': _failedAttempts,
            'lockout_duration_minutes': _lockoutDuration.inMinutes,
          }
        },
      );
    } else {
      await LocalAuditLogger.logSecurityEvent(
        'pin_attempt_failed',
        additionalData: {
          'event_type': 'security_event',
          'event_subtype': 'pin_attempt_failed',
          'timestamp': DateTime.now().toIso8601String(),
          'security_details': {
            'component': 'fallback_auth',
            'failed_attempts': _failedAttempts,
            'max_attempts': _maxFailedAttempts,
          }
        },
      );
    }
  }

  /// Show fallback authentication dialog
  static Future<AuthResult> showFallbackAuthDialog(
    BuildContext context, {
    String? title,
    String? message,
    bool allowCancel = false,
  }) async {
    if (isLockedOut) {
      return AuthResult(
        success: false,
        method: AuthMethod.pin,
        failureReason: 'temporarily_locked_out',
      );
    }

    final result = await showDialog<AuthResult>(
      context: context,
      barrierDismissible: allowCancel,
      builder: (context) => FallbackAuthDialog(
        title: title,
        message: message,
        allowCancel: allowCancel,
      ),
    );

    return result ?? AuthResult(
      success: false,
      method: AuthMethod.pin,
      failureReason: 'dialog_cancelled',
    );
  }
}

/// PIN Entry Dialog for fallback authentication
class FallbackAuthDialog extends StatefulWidget {
  final String? title;
  final String? message;
  final bool allowCancel;

  const FallbackAuthDialog({
    super.key,
    this.title,
    this.message,
    this.allowCancel = false,
  });

  @override
  State<FallbackAuthDialog> createState() => _FallbackAuthDialogState();
}

class _FallbackAuthDialogState extends State<FallbackAuthDialog>
    with SingleTickerProviderStateMixin {
  final _pinController = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;
  late AnimationController _shakeController;
  late Animation<double> _shakeAnimation;

  @override
  void initState() {
    super.initState();
    _shakeController = AnimationController(
      duration: const Duration(milliseconds: 500),
      vsync: this,
    );
    _shakeAnimation = Tween<double>(
      begin: 0,
      end: 10,
    ).animate(CurvedAnimation(
      parent: _shakeController,
      curve: Curves.elasticIn,
    ));
  }

  @override
  void dispose() {
    _pinController.dispose();
    _shakeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(
        widget.title ?? 'Authenticate',
        style: Theme.of(context).textTheme.titleLarge,
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (widget.message != null) ...[
            Text(
              widget.message!,
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
          ],
          
          // Lockout warning
          if (FallbackAuthService.isLockedOut) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.red.shade200),
              ),
              child: Row(
                children: [
                  Icon(Icons.lock_clock, color: Colors.red.shade700),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Too many failed attempts. Try again in ${_formatLockoutTime()}.',
                      style: TextStyle(
                        color: Colors.red.shade700,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ] else ...[
            // PIN input field
            AnimatedBuilder(
              animation: _shakeAnimation,
              builder: (context, child) {
                return Transform.translate(
                  offset: Offset(_shakeAnimation.value, 0),
                  child: child,
                );
              },
              child: TextField(
                controller: _pinController,
                keyboardType: TextInputType.number,
                obscureText: true,
                maxLength: 4,
                enabled: !_isLoading && !FallbackAuthService.isLockedOut,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                ],
                decoration: InputDecoration(
                  labelText: 'Enter your 4-digit PIN',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                  errorText: _errorMessage,
                  prefixIcon: const Icon(Icons.lock),
                  counterText: '', // Hide character counter
                ),
                onSubmitted: _isLoading ? null : (_) => _authenticateWithPin(),
                autofocus: true,
              ),
            ),
            
            if (_errorMessage != null) ...[
              const SizedBox(height: 8),
              Text(
                _errorMessage!,
                style: TextStyle(
                  color: Colors.red.shade700,
                  fontSize: 12,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ],
        ],
      ),
      actions: [
        if (widget.allowCancel)
          TextButton(
            onPressed: _isLoading ? null : () {
              Navigator.of(context).pop(AuthResult(
                success: false,
                method: AuthMethod.pin,
                failureReason: 'user_cancelled',
              ));
            },
            child: const Text('Cancel'),
          ),
        
        if (!FallbackAuthService.isLockedOut)
          ElevatedButton(
            onPressed: _isLoading || _pinController.text.length != 4 
                ? null 
                : _authenticateWithPin,
            child: _isLoading 
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Authenticate'),
          ),
      ],
    );
  }

  Future<void> _authenticateWithPin() async {
    if (_pinController.text.length != 4) {
      setState(() {
        _errorMessage = 'PIN must be exactly 4 digits';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final result = await BiometricAuthService.authenticateWithPin(_pinController.text);
      
      if (result.success) {
        // Reset failed attempts on success
        await FallbackAuthService.resetFailedAttempts();
        
        if (mounted) {
          Navigator.of(context).pop(result);
        }
      } else {
        // Record failed attempt
        await FallbackAuthService.recordFailedAttempt();
        
        setState(() {
          _errorMessage = _getPinErrorMessage(result.failureReason);
        });
        
        // Shake animation for visual feedback
        _shakeController.forward().then((_) {
          _shakeController.reverse();
        });
        
        // Clear PIN field
        _pinController.clear();
        
        // Check if now locked out
        if (FallbackAuthService.isLockedOut) {
          setState(() {}); // Rebuild to show lockout message
        }
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Authentication error. Please try again.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  String _getPinErrorMessage(String? failureReason) {
    switch (failureReason) {
      case 'invalid_pin':
        final remaining = FallbackAuthService._maxFailedAttempts - FallbackAuthService._failedAttempts;
        if (remaining > 0) {
          return 'Incorrect PIN. $remaining attempt${remaining != 1 ? 's' : ''} remaining.';
        } else {
          return 'Too many failed attempts. Account temporarily locked.';
        }
      case 'temporarily_locked_out':
        return 'Account temporarily locked due to failed attempts.';
      default:
        return 'Authentication failed. Please try again.';
    }
  }

  String _formatLockoutTime() {
    final remaining = FallbackAuthService.remainingLockoutTime;
    if (remaining == null) return '';
    
    if (remaining.inMinutes > 0) {
      return '${remaining.inMinutes}m ${remaining.inSeconds % 60}s';
    } else {
      return '${remaining.inSeconds}s';
    }
  }
}

/// PIN Setup Dialog for first-time PIN configuration
class PinSetupDialog extends StatefulWidget {
  final String? title;
  final String? message;

  const PinSetupDialog({
    super.key,
    this.title,
    this.message,
  });

  @override
  State<PinSetupDialog> createState() => _PinSetupDialogState();
}

class _PinSetupDialogState extends State<PinSetupDialog> {
  final _pinController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;
  bool _showConfirm = false;

  @override
  void dispose() {
    _pinController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(
        widget.title ?? 'Set up PIN',
        style: Theme.of(context).textTheme.titleLarge,
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (widget.message != null) ...[
            Text(
              widget.message!,
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
          ],
          
          // PIN input
          TextField(
            controller: _pinController,
            keyboardType: TextInputType.number,
            obscureText: true,
            maxLength: 4,
            enabled: !_isLoading,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
            ],
            decoration: InputDecoration(
              labelText: _showConfirm ? 'Enter PIN' : 'Create 4-digit PIN',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
              prefixIcon: const Icon(Icons.lock),
              counterText: '',
            ),
            onChanged: (value) {
              if (value.length == 4 && !_showConfirm) {
                setState(() {
                  _showConfirm = true;
                });
              }
            },
            autofocus: true,
          ),
          
          if (_showConfirm) ...[
            const SizedBox(height: 16),
            TextField(
              controller: _confirmController,
              keyboardType: TextInputType.number,
              obscureText: true,
              maxLength: 4,
              enabled: !_isLoading,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
              ],
              decoration: InputDecoration(
                labelText: 'Confirm PIN',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                prefixIcon: const Icon(Icons.lock_outline),
                counterText: '',
                errorText: _errorMessage,
              ),
              onSubmitted: _isLoading ? null : (_) => _setupPin(),
            ),
          ],
          
          if (_errorMessage != null && !_showConfirm) ...[
            const SizedBox(height: 8),
            Text(
              _errorMessage!,
              style: TextStyle(
                color: Colors.red.shade700,
                fontSize: 12,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () {
            Navigator.of(context).pop(false);
          },
          child: const Text('Cancel'),
        ),
        
        if (_showConfirm)
          ElevatedButton(
            onPressed: _isLoading || _confirmController.text.length != 4 
                ? null 
                : _setupPin,
            child: _isLoading 
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Set PIN'),
          ),
      ],
    );
  }

  Future<void> _setupPin() async {
    if (_pinController.text != _confirmController.text) {
      setState(() {
        _errorMessage = 'PINs do not match';
      });
      return;
    }

    if (_pinController.text.length != 4) {
      setState(() {
        _errorMessage = 'PIN must be exactly 4 digits';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final success = await BiometricAuthService.setupPin(_pinController.text);
      
      if (success) {
        if (mounted) {
          Navigator.of(context).pop(true);
        }
      } else {
        setState(() {
          _errorMessage = 'Failed to set up PIN. Please try again.';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Error setting up PIN: ${e.toString()}';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }
}

/// Utility methods for fallback authentication
class FallbackAuthUtils {
  /// Show appropriate authentication method
  static Future<AuthResult> showAuthenticationDialog(
    BuildContext context, {
    String? reason,
    bool allowCancel = false,
  }) async {
    // First try biometric if available
    final biometricAvailable = await BiometricAuthService.isBiometricAvailable();
    final biometricEnabled = await BiometricAuthService.isBiometricEnabled();
    
    if (biometricAvailable && biometricEnabled) {
      final biometricResult = await BiometricAuthService.authenticate(
        reason: reason,
        allowPinFallback: false,
      );
      
      if (biometricResult.success) {
        return biometricResult;
      }
      
      // If biometric failed, show PIN fallback
      if (await BiometricAuthService.isPinSet()) {
        if (!context.mounted) return AuthResult(success: false, method: AuthMethod.none, failureReason: 'context_no_longer_mounted');
        return await FallbackAuthService.showFallbackAuthDialog(
          context,
          title: 'Biometric authentication failed',
          message: 'Please enter your PIN to continue',
          allowCancel: allowCancel,
        );
      }
    } else if (await BiometricAuthService.isPinSet()) {
      // Only PIN available
      if (!context.mounted) return AuthResult(success: false, method: AuthMethod.none, failureReason: 'context_no_longer_mounted');
      return await FallbackAuthService.showFallbackAuthDialog(
        context,
        title: 'Authenticate',
        message: reason ?? 'Enter your PIN to continue',
        allowCancel: allowCancel,
      );
    }
    
    // No authentication methods available
    return AuthResult(
      success: false,
      method: AuthMethod.none,
      failureReason: 'no_auth_methods_available',
    );
  }

  /// Show PIN setup dialog
  static Future<bool> showPinSetupDialog(
    BuildContext context, {
    String? title,
    String? message,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => PinSetupDialog(
        title: title,
        message: message,
      ),
    );
    
    return result ?? false;
  }
}