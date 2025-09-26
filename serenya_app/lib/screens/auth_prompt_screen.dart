import 'package:flutter/material.dart';
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
          // PIN authentication needed - for now show helpful message
          // TODO: Implement PIN authentication UI component
          setState(() {
            _errorMessage = 'PIN authentication required - please try biometric authentication again';
          });
          // Auto-retry after a delay
          Future.delayed(const Duration(seconds: 2), () {
            if (mounted) _authenticateUser();
          });
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