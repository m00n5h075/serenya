import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/constants/design_tokens.dart';
import '../../../core/security/biometric_auth_service.dart';

class PinSetupDialog extends StatefulWidget {
  final VoidCallback onSetupComplete;
  final VoidCallback? onSkipped;

  const PinSetupDialog({
    super.key,
    required this.onSetupComplete,
    this.onSkipped,
  });

  @override
  State<PinSetupDialog> createState() => _PinSetupDialogState();
}

class _PinSetupDialogState extends State<PinSetupDialog>
    with TickerProviderStateMixin {
  final List<TextEditingController> _controllers = [];
  final List<FocusNode> _focusNodes = [];
  
  bool _isLoading = false;
  String? _errorMessage;
  bool _isConfirmationMode = false;
  String _firstPin = '';
  
  late AnimationController _shakeController;
  late Animation<double> _shakeAnimation;

  @override
  void initState() {
    super.initState();
    
    // Initialize controllers and focus nodes for 4 PIN digits
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

  Future<void> _handlePinComplete() async {
    final pin = _currentPin;
    
    if (pin.length != 4) {
      _showError('Please enter a 4-digit PIN');
      return;
    }

    if (!_isConfirmationMode) {
      // First PIN entry - store it and ask for confirmation
      _firstPin = pin;
      setState(() {
        _isConfirmationMode = true;
        _errorMessage = null;
      });
      _clearPin();
      return;
    }

    // Confirmation mode - verify PINs match
    if (pin != _firstPin) {
      _showError('PINs do not match. Please try again.');
      setState(() {
        _isConfirmationMode = false;
        _firstPin = '';
      });
      return;
    }

    // PINs match - set up the PIN
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await BiometricAuthService.setupPin(pin);
      
      // Success!
      HapticFeedback.lightImpact();
      widget.onSetupComplete();
      
    } catch (e) {
      _showError('Failed to set up PIN: ${e.toString()}');
      setState(() {
        _isConfirmationMode = false;
        _firstPin = '';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
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
        _handlePinComplete();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: Padding(
        padding: const EdgeInsets.all(HealthcareSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            const Icon(
              Icons.lock,
              size: 48,
              color: HealthcareColors.serenyaBlueDark,
            ),
            
            const SizedBox(height: HealthcareSpacing.md),
            
            Text(
              _isConfirmationMode ? 'Confirm Your PIN' : 'Set Up Your PIN',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: HealthcareColors.serenyaBlueDark,
              ),
              textAlign: TextAlign.center,
            ),
            
            const SizedBox(height: HealthcareSpacing.sm),
            
            Text(
              _isConfirmationMode 
                  ? 'Please enter your PIN again to confirm'
                  : 'Create a 4-digit PIN to secure your medical data',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: HealthcareColors.serenyaGray700,
              ),
              textAlign: TextAlign.center,
            ),
            
            const SizedBox(height: HealthcareSpacing.lg),
            
            // PIN Input Fields
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
            
            const SizedBox(height: HealthcareSpacing.lg),
            
            // Loading Indicator
            if (_isLoading)
              const CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(
                  HealthcareColors.serenyaBlueDark,
                ),
              )
            else
              // Help Text
              Container(
                padding: const EdgeInsets.all(HealthcareSpacing.sm),
                decoration: BoxDecoration(
                  color: HealthcareColors.serenyaBlueLight.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.info_outline,
                      color: HealthcareColors.serenyaBlueDark,
                      size: 16,
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        'Your PIN secures your medical data',
                        style: TextStyle(
                          color: HealthcareColors.serenyaBlueDark,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            
            const SizedBox(height: HealthcareSpacing.lg),
            
            // Action Buttons
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                if (widget.onSkipped != null)
                  TextButton(
                    onPressed: _isLoading ? null : widget.onSkipped,
                    child: const Text('Skip for now'),
                  ),
                
                ElevatedButton(
                  onPressed: _isLoading ? null : () {
                    // Clear any error and focus first field
                    setState(() {
                      _errorMessage = null;
                    });
                    _focusNodes[0].requestFocus();
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: HealthcareColors.serenyaBlueDark,
                    foregroundColor: Colors.white,
                  ),
                  child: Text(_isConfirmationMode ? 'Confirm PIN' : 'Set PIN'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}