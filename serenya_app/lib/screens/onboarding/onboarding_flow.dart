import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../services/consent_service.dart';
import '../../core/providers/app_state_provider.dart';
import 'slides/welcome_slide.dart';
import 'slides/privacy_slide.dart';
import 'slides/disclaimer_slide.dart';
import 'slides/consent_slide.dart';
import 'widgets/progress_dots.dart';
import 'widgets/biometric_setup_dialog.dart';
import 'widgets/pin_setup_dialog.dart';
import '../../core/constants/design_tokens.dart';
import '../../core/security/biometric_auth_service.dart';

class OnboardingFlow extends StatefulWidget {
  final VoidCallback? onComplete;
  final VoidCallback? onAuthenticationSuccess;
  
  const OnboardingFlow({
    super.key, 
    this.onComplete,
    this.onAuthenticationSuccess,
  });

  @override
  State<OnboardingFlow> createState() => _OnboardingFlowState();
}

class _OnboardingFlowState extends State<OnboardingFlow>
    with TickerProviderStateMixin {
  final PageController _pageController = PageController();
  final ConsentService _consentService = ConsentService();
  
  int _currentIndex = 0;
  final int _totalSlides = 4;

  final List<String> _slideNames = [
    'Welcome',
    'Privacy',
    'Disclaimer',
    'Consent'
  ];

  @override
  void initState() {
    super.initState();
    print('ONBOARDING_FLOW: initState called');
    _trackSlideView(_currentIndex);
  }

  @override
  void dispose() {
    print('ONBOARDING_FLOW: dispose called');
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _trackSlideView(int slideIndex) async {
    await _consentService.trackSlideView(
      slideIndex,
      _slideNames[slideIndex],
    );
  }

  void _nextSlide() {
    if (_currentIndex < _totalSlides - 1) {
      _animateToSlide(_currentIndex + 1);
    }
  }

  void _animateToSlide(int slideIndex) {
    // Haptic feedback for better UX
    HapticFeedback.lightImpact();
    
    _pageController.animateToPage(
      slideIndex,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
    );
  }

  void _onPageChanged(int index) {
    setState(() {
      _currentIndex = index;
    });
    _trackSlideView(index);
  }

  Future<void> _handleConsentComplete(bool agreedToTerms, bool understoodDisclaimer, bool authSuccess) async {
    print('ONBOARDING_FLOW: _handleConsentComplete called with authSuccess: $authSuccess, mounted: $mounted');
    
    // Record the consent first
    await _consentService.recordConsent(agreedToTerms, understoodDisclaimer);
    print('ONBOARDING_FLOW: Consent recorded, mounted: $mounted');
    
    if (!authSuccess) {
      // Authentication failed - show error but stay on onboarding
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.error_outline, color: Colors.white),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Authentication failed. Please try again.',
                    overflow: TextOverflow.visible,
                    softWrap: true,
                  ),
                ),
              ],
            ),
            backgroundColor: Colors.red[600],
            duration: const Duration(seconds: 4),
            action: SnackBarAction(
              label: 'Dismiss',
              textColor: Colors.white,
              onPressed: () {
                ScaffoldMessenger.of(context).hideCurrentSnackBar();
              },
            ),
          ),
        );
      }
      return; // Stay on onboarding
    }
    
    // Authentication successful - now check if user needs to set up PIN/biometrics
    print('ONBOARDING_FLOW: Authentication successful, checking authentication setup');
    await _checkAndSetupAuthentication();
  }

  /// Check if user has authentication set up, and guide them through setup if needed
  Future<void> _checkAndSetupAuthentication() async {
    try {
      print('🔍 ONBOARDING_FLOW: _checkAndSetupAuthentication() starting...');
      final biometricAvailable = await BiometricAuthService.isBiometricAvailable();
      final biometricEnabled = await BiometricAuthService.isBiometricEnabled();
      final pinSet = await BiometricAuthService.isPinSet();
      
      print('🔍 ONBOARDING_FLOW: Auth status - biometric available: $biometricAvailable, enabled: $biometricEnabled, PIN set: $pinSet');
      
      if (!biometricEnabled && !pinSet) {
        // User has no authentication method set up - show PIN setup dialog first
        print('🔍 ONBOARDING_FLOW: No authentication methods set up, showing PIN setup dialog');
        if (mounted && context.mounted) {
          _showPinSetupDialog();
        } else {
          print('❌ ONBOARDING_FLOW: Widget not mounted, cannot show PIN setup dialog');
        }
      } else {
        // User has authentication set up - complete onboarding immediately
        print('🔍 ONBOARDING_FLOW: Authentication already set up, calling _completeOnboarding() directly');
        _completeOnboarding();
      }
    } catch (e) {
      print('❌ ONBOARDING_FLOW: Error checking authentication setup: $e');
      // If there's an error checking auth status, show PIN setup as fallback
      if (mounted && context.mounted) {
        _showPinSetupDialog();
      } else {
        print('❌ ONBOARDING_FLOW: Widget not mounted, cannot show PIN setup dialog');
      }
    }
  }

  /// Show PIN setup dialog - required for accessing encrypted data
  Future<void> _showPinSetupDialog() async {
    print('ONBOARDING_FLOW: Showing PIN setup dialog');
    
    showDialog(
      context: context,
      barrierDismissible: false, // User must complete PIN setup
      builder: (context) => PinSetupDialog(
        onSetupComplete: () async {
          print('🔐 PIN_DIALOG: PIN setup completed successfully');
          Navigator.of(context).pop();
          
          // CRITICAL FIX: Complete onboarding - AppStateProvider will automatically handle completeAuthentication()
          print('🔍 ONBOARDING_FLOW: Calling _completeOnboarding() - authentication completion will be handled automatically');
          await _completeOnboarding();
          print('🔐 ONBOARDING_FLOW: Onboarding completion finished - router redirect should happen automatically');
        },
      ),
    );
  }

  /// Complete onboarding and optionally show biometric setup
  Future<void> _completeOnboarding() async {
    print('🔍 ONBOARDING_FLOW: _completeOnboarding() called - mounted: $mounted');
    
    if (mounted) {
      // First complete onboarding in AppStateProvider
      try {
        print('🔍 ONBOARDING_FLOW: Getting AppStateProvider and calling completeOnboarding()...');
        final appStateProvider = context.read<AppStateProvider>();
        await appStateProvider.completeOnboarding();
        print('🔍 ONBOARDING_FLOW: Successfully called completeOnboarding() on AppStateProvider');
        
        // CRITICAL: DO NOT call completeAuthentication() here!
        // This causes router to dispose OnboardingFlow widget before PIN dialog appears
        // BUG: authentication-timing-issue - Fixed multiple times, keeps regressing
        // SOLUTION: completeAuthentication() moved to PIN dialog completion
        // appStateProvider.completeAuthentication(); // DISABLED - see PIN dialog onSetupComplete
        // print('ONBOARDING_FLOW: Called completeAuthentication() - router redirects now enabled');
      } catch (e) {
        print('ONBOARDING_FLOW: Error in completion flow: $e');
      }
      
      // Complete onboarding widget
      if (widget.onComplete != null) {
        print('ONBOARDING_FLOW: Calling widget.onComplete to finish onboarding');
        widget.onComplete!();
      }
      
      // Then show biometric setup dialog in the background (non-blocking) if biometrics are available
      Future.delayed(const Duration(milliseconds: 500), () async {
        if (mounted && context.mounted) {
          final biometricAvailable = await BiometricAuthService.isBiometricAvailable();
          final biometricEnabled = await BiometricAuthService.isBiometricEnabled();
          
          if (biometricAvailable && !biometricEnabled) {
            _showBiometricSetupDialog();
          }
        }
      });
    }
  }

  /// Show biometric setup dialog after successful authentication
  Future<void> _showBiometricSetupDialog() async {
    print('ONBOARDING_FLOW: Showing biometric setup dialog');
    
    showDialog(
      context: context,
      barrierDismissible: false, // User must complete or skip biometric setup
      builder: (context) => BiometricSetupDialog(
        onSetupComplete: () async {
          print('🔍 BIOMETRIC_DIALOG: Biometric setup completed successfully');
          // Onboarding is already complete - just close dialog
          Navigator.of(context).pop();
        },
        onSkipped: () async {
          print('🔍 BIOMETRIC_DIALOG: Biometric setup skipped by user');  
          // Onboarding is already complete - just close dialog
          Navigator.of(context).pop();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Column(
        children: [
          // Main content - takes most of the space
          Expanded(
            child: Semantics(
              container: true,
              label: 'Onboarding slides',
              hint: 'Swipe left and right to navigate between slides',
              child: PageView(
                controller: _pageController,
                onPageChanged: _onPageChanged,
                physics: const ClampingScrollPhysics(), // Prevent over-scrolling
                children: [
                  _SlideWrapper(
                    slideIndex: 0,
                    totalSlides: _totalSlides,
                    child: WelcomeSlide(
                      onGetStarted: _nextSlide,
                    ),
                  ),
                  _SlideWrapper(
                    slideIndex: 1,
                    totalSlides: _totalSlides,
                    child: PrivacySlide(
                      onContinue: _nextSlide,
                    ),
                  ),
                  _SlideWrapper(
                    slideIndex: 2,
                    totalSlides: _totalSlides,
                    child: DisclaimerSlide(
                      onUnderstand: _nextSlide,
                    ),
                  ),
                  _SlideWrapper(
                    slideIndex: 3,
                    totalSlides: _totalSlides,
                    child: ConsentSlide(
                      onAgree: _handleConsentComplete,
                    ),
                  ),
                ],
              ),
            ),
          ),
          
          // Progress indicator at bottom
          Padding(
            padding: const EdgeInsets.only(
              bottom: HealthcareSpacing.md,
              top: HealthcareSpacing.xs,
            ),
            child: ProgressDots(
              currentIndex: _currentIndex,
              totalCount: _totalSlides,
              slideNames: _slideNames,
            ),
          ),
        ],
      ),
    );
  }
}

// Optional: Add a slide-specific wrapper for enhanced accessibility
class _SlideWrapper extends StatelessWidget {
  final Widget child;
  final int slideIndex;
  final int totalSlides;

  const _SlideWrapper({
    required this.child,
    required this.slideIndex,
    required this.totalSlides,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: 'Onboarding slide ${slideIndex + 1} of $totalSlides',
      child: child,
    );
  }
}