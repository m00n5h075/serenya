import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../core/security/biometric_auth_service.dart';
import '../core/providers/app_state_provider.dart';
import '../core/constants/design_tokens.dart';

class AuthPromptScreen extends StatefulWidget {
  const AuthPromptScreen({super.key});

  @override
  State<AuthPromptScreen> createState() => _AuthPromptScreenState();
}

class _AuthPromptScreenState extends State<AuthPromptScreen> {
  bool _isAuthenticating = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    // Auto-trigger authentication when screen loads
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _authenticateUser();
    });
  }

  Future<void> _authenticateUser() async {
    if (_isAuthenticating) return;
    
    setState(() {
      _isAuthenticating = true;
      _errorMessage = null;
    });

    try {
      // FIXED: First check if user actually has an account on this device
      final appState = context.read<AppStateProvider>();
      final authService = appState.authService;
      
      final hasAccount = await authService.hasAccount();
      if (!hasAccount) {
        // User doesn't have an account - redirect to onboarding
        if (mounted) {
          debugPrint('🔍 AUTH_PROMPT: No account found - redirecting to onboarding');
          if (context.mounted) {
            // Go back to onboarding flow
            await appState.resetApp(); // This will clear states and redirect to onboarding
            return;
          }
        }
        return;
      }
      
      debugPrint('🔍 AUTH_PROMPT: Account found - proceeding with authentication');
      
      // Check available authentication methods first
      final availableMethods = await BiometricAuthService.getAvailableAuthMethods();
      final hasBiometric = availableMethods.contains(AuthMethod.biometric);
      final hasPin = availableMethods.contains(AuthMethod.pin);
      
      // DEBUG: Check PIN setup status
      final pinSetDebug = await BiometricAuthService.isPinSet();
      debugPrint('🔍 AUTH_PROMPT: PIN setup check result: $pinSetDebug');
      debugPrint('🔍 AUTH_PROMPT: Available methods - Biometric: $hasBiometric, PIN: $hasPin');
      
      // ANDROID EMULATOR: Always show PIN dialog directly (no biometric buttons)
      if (Platform.isAndroid) {
        debugPrint('🔍 AUTH_PROMPT: Android detected - showing PIN dialog directly');
        setState(() {
          _isAuthenticating = false; // Reset authentication state
        });
        _showPinDialog();
        return;
      }
      
      // If only PIN is available, go directly to PIN
      if (!hasBiometric && hasPin) {
        debugPrint('🔍 AUTH_PROMPT: Only PIN available - showing PIN dialog directly');
        _showPinDialog();
        return;
      }
      
      // User has an account - proceed with authentication
      final authResult = await BiometricAuthService.authenticate(
        reason: 'Authenticate to access your medical data',
        allowPinFallback: true,
      );
      
      if (authResult.success && mounted) {
        // NEW: Refresh tokens from backend after biometric success
        
        try {
          await authService.refreshTokensAfterBiometric();
          
          appState.setLoggedIn(true);
          // Router will automatically redirect to home
        } catch (e) {
          // If token refresh fails, still allow offline access
          debugPrint('Token refresh failed but allowing offline access: $e');
          appState.setLoggedIn(true);
        }
      } else if (mounted) {
        // FIXED: Handle specific authentication failure cases
        final failureReason = authResult.failureReason;
        
        if (failureReason == 'no_auth_methods_available') {
          // No biometric or device passcode available
          setState(() {
            _errorMessage = 'Please set up biometric authentication or device passcode in device settings to continue';
          });
        } else if (failureReason == 'pin_required') {
          // PIN authentication needed - show PIN input dialog
          setState(() {
            _errorMessage = null; // Clear error message
          });
          _showPinDialog();
        } else if (failureReason == 'biometric_not_enrolled') {
          setState(() {
            _errorMessage = 'Please enroll biometric authentication in device settings';
          });
        } else {
          setState(() {
            _errorMessage = failureReason ?? 'Authentication failed';
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Authentication error: ${e.toString()}';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _isAuthenticating = false;
        });
      }
    }
  }

  Future<void> _showPinDialog() async {
    if (!mounted) return;
    
    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => _PinInputDialog(),
    );
    
    if (result == true && mounted) {
      // PIN authentication successful
      final appState = context.read<AppStateProvider>();
      appState.setLoggedIn(true);
      // Router will automatically redirect to home
    } else if (mounted) {
      // PIN authentication failed or cancelled
      setState(() {
        _errorMessage = 'PIN authentication failed. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(HealthcareSpacing.lg),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // App Logo/Icon
              const Icon(
                Icons.medical_services,
                size: 80,
                color: HealthcareColors.serenyaBlueDark,
              ),
              
              const SizedBox(height: HealthcareSpacing.lg),
              
              Text(
                'Welcome back to Serenya',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: HealthcareColors.serenyaBlueDark,
                ),
                textAlign: TextAlign.center,
              ),
              
              const SizedBox(height: HealthcareSpacing.md),
              
              Text(
                'Please authenticate to access your medical data',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: HealthcareColors.serenyaGray700,
                ),
                textAlign: TextAlign.center,
              ),
              
              const SizedBox(height: HealthcareSpacing.xl),
              
              if (_isAuthenticating)
                const CircularProgressIndicator(
                  valueColor: AlwaysStoppedAnimation<Color>(
                    HealthcareColors.serenyaBlueDark,
                  ),
                )
              else
                Column(
                  children: [
                    // Show authentication buttons only on non-Android platforms
                    if (!Platform.isAndroid) ...[
                      ElevatedButton.icon(
                        onPressed: _authenticateUser,
                        icon: const Icon(Icons.fingerprint),
                        label: const Text('Authenticate'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: HealthcareColors.serenyaBlueDark,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(
                            horizontal: HealthcareSpacing.lg,
                            vertical: HealthcareSpacing.md,
                          ),
                        ),
                      ),
                      
                      const SizedBox(height: HealthcareSpacing.md),
                      
                      // Add PIN fallback button
                      TextButton.icon(
                        onPressed: _showPinDialog,
                        icon: const Icon(Icons.pin),
                        label: const Text('Use PIN instead'),
                        style: TextButton.styleFrom(
                          foregroundColor: HealthcareColors.serenyaBlueDark,
                          padding: const EdgeInsets.symmetric(
                            horizontal: HealthcareSpacing.lg,
                            vertical: HealthcareSpacing.sm,
                          ),
                        ),
                      ),
                    ] else ...[
                      // On Android, show a simple message with manual PIN trigger option
                      Column(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(HealthcareSpacing.md),
                            decoration: BoxDecoration(
                              color: HealthcareColors.serenyaBlueLight.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: HealthcareColors.serenyaBlueLight,
                                width: 1,
                              ),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.info_outline,
                                  color: HealthcareColors.serenyaBlueDark,
                                  size: 20,
                                ),
                                SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    'Enter your PIN to continue',
                                    style: TextStyle(
                                      color: HealthcareColors.serenyaBlueDark,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          
                          const SizedBox(height: HealthcareSpacing.md),
                          
                          // Manual PIN trigger button for Android
                          TextButton.icon(
                            onPressed: _showPinDialog,
                            icon: const Icon(Icons.pin),
                            label: const Text('Enter PIN'),
                            style: TextButton.styleFrom(
                              foregroundColor: HealthcareColors.serenyaBlueDark,
                              padding: const EdgeInsets.symmetric(
                                horizontal: HealthcareSpacing.lg,
                                vertical: HealthcareSpacing.sm,
                              ),
                              side: const BorderSide(
                                color: HealthcareColors.serenyaBlueLight,
                                width: 1,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                    
                    if (_errorMessage != null) ...[
                      const SizedBox(height: HealthcareSpacing.md),
                      Container(
                        padding: const EdgeInsets.all(HealthcareSpacing.sm),
                        decoration: BoxDecoration(
                          color: HealthcareColors.error.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: HealthcareColors.error,
                            width: 1,
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.error_outline,
                              color: HealthcareColors.error,
                              size: 16,
                            ),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                _errorMessage!,
                                style: const TextStyle(
                                  color: HealthcareColors.error,
                                  fontWeight: FontWeight.w500,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PinInputDialog extends StatefulWidget {
  @override
  State<_PinInputDialog> createState() => _PinInputDialogState();
}

class _PinInputDialogState extends State<_PinInputDialog> 
    with TickerProviderStateMixin {
  final List<TextEditingController> _controllers = [];
  final List<FocusNode> _focusNodes = [];
  
  bool _isValidating = false;
  String? _errorMessage;
  
  late AnimationController _shakeController;
  late Animation<double> _shakeAnimation;

  @override
  void initState() {
    super.initState();
    
    // Initialize controllers and focus nodes for 4 PIN digits (matching onboarding)
    for (int i = 0; i < 4; i++) {
      _controllers.add(TextEditingController());
      _focusNodes.add(FocusNode());
    }
    
    // Set up shake animation for errors
    _shakeController = AnimationController(
      duration: const Duration(milliseconds: 500),
      vsync: this,
    );
    _shakeAnimation = Tween<double>(
      begin: 0,
      end: 24,
    ).animate(CurvedAnimation(
      parent: _shakeController,
      curve: Curves.elasticIn,
    ));

    // Auto-focus first field
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusNodes[0].requestFocus();
    });
  }

  @override
  void dispose() {
    for (final controller in _controllers) {
      controller.dispose();
    }
    for (final focusNode in _focusNodes) {
      focusNode.dispose();
    }
    _shakeController.dispose();
    super.dispose();
  }

  String get _currentPin {
    return _controllers.map((c) => c.text).join();
  }

  void _clearPin() {
    for (final controller in _controllers) {
      controller.clear();
    }
    if (_focusNodes.isNotEmpty) {
      _focusNodes[0].requestFocus();
    }
  }

  void _showError(String message) {
    setState(() {
      _errorMessage = message;
    });
    _shakeController.forward().then((_) {
      _shakeController.reverse();
    });
    _clearPin();
  }

  Future<void> _validatePin() async {
    final pin = _currentPin;
    
    if (pin.length != 4) {
      _showError('Please enter your 4-digit PIN');
      return;
    }

    setState(() {
      _isValidating = true;
      _errorMessage = null;
    });

    try {
      // Validate PIN with BiometricAuthService
      final authResult = await BiometricAuthService.authenticateWithPin(pin);
      
      if (authResult.success) {
        // PIN is correct
        Navigator.of(context).pop(true);
      } else {
        _showError('Incorrect PIN. Please try again.');
      }
    } catch (e) {
      _showError('Authentication error. Please try again.');
    } finally {
      if (mounted) {
        setState(() {
          _isValidating = false;
        });
      }
    }
  }

  void _onDigitChanged(int index, String value) {
    if (value.length == 1 && index < 3) {
      // Auto-focus next field
      _focusNodes[index + 1].requestFocus();
    } else if (value.isEmpty && index > 0) {
      // Auto-focus previous field on backspace
      _focusNodes[index - 1].requestFocus();
    }
    
    // Check if PIN is complete
    if (_currentPin.length == 4) {
      // Small delay to show the last digit before processing
      Future.delayed(const Duration(milliseconds: 200), () {
        _validatePin();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text(
        'Enter PIN',
        style: TextStyle(
          fontWeight: FontWeight.bold,
          color: HealthcareColors.serenyaBlueDark,
        ),
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'Please enter your 4-digit PIN to access your medical data',
            style: TextStyle(
              color: HealthcareColors.serenyaGray700,
            ),
          ),
          const SizedBox(height: HealthcareSpacing.lg),
          
          // PIN Input Fields (matching onboarding style)
          AnimatedBuilder(
            animation: _shakeAnimation,
            builder: (context, child) {
              return Transform.translate(
                offset: Offset(_shakeAnimation.value, 0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: List.generate(4, (index) {
                    return SizedBox(
                      width: 50,
                      height: 50,
                      child: TextField(
                        controller: _controllers[index],
                        focusNode: _focusNodes[index],
                        keyboardType: TextInputType.number,
                        textAlign: TextAlign.center,
                        maxLength: 1,
                        obscureText: true,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                        decoration: InputDecoration(
                          counterText: '',
                          filled: true,
                          fillColor: Colors.grey[100],
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(
                              color: HealthcareColors.serenyaBlueLight,
                              width: 2,
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(
                              color: HealthcareColors.serenyaBlueDark,
                              width: 2,
                            ),
                          ),
                          errorBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(
                              color: HealthcareColors.error,
                              width: 2,
                            ),
                          ),
                        ),
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                        ],
                        onChanged: (value) => _onDigitChanged(index, value),
                      ),
                    );
                  }),
                ),
              );
            },
          ),
          
          const SizedBox(height: HealthcareSpacing.md),
          
          // Error Message
          if (_errorMessage != null)
            Container(
              padding: const EdgeInsets.all(HealthcareSpacing.sm),
              decoration: BoxDecoration(
                color: HealthcareColors.error.withOpacity(0.1),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: HealthcareColors.error,
                  width: 1,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.error_outline,
                    color: HealthcareColors.error,
                    size: 16,
                  ),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      _errorMessage!,
                      style: const TextStyle(
                        color: HealthcareColors.error,
                        fontWeight: FontWeight.w500,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _isValidating ? null : () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        if (_isValidating)
          const Padding(
            padding: EdgeInsets.all(8.0),
            child: SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(HealthcareColors.serenyaBlueDark),
              ),
            ),
          ),
      ],
    );
  }
}