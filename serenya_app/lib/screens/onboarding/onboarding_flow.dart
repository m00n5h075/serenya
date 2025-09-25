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
import '../../core/constants/design_tokens.dart';

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
    
    // Biometric setup and onboarding completion are now handled in consent slide
    // This callback is just for consent recording and any additional processing
    print('ONBOARDING_FLOW: Consent processing complete');
    
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
      // Do NOT call onComplete - keep user on onboarding flow
    } else {
      // Authentication successful - show biometric setup dialog
      print('ONBOARDING_FLOW: Authentication successful, showing biometric setup');
      if (mounted) {
        _showBiometricSetupDialog();
      }
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
          print('🔍 ONBOARDING_FLOW: Biometric setup completed, completing onboarding');
          // Small delay to ensure dialog is fully closed
          await Future.delayed(const Duration(milliseconds: 100));
          
          // Notify AuthService that authentication is complete so router can redirect
          if (mounted) {
            final authService = context.read<AppStateProvider>().authService;
            authService.notifyAuthenticationComplete();
            print('🔍 ONBOARDING_FLOW: Notified AuthService of authentication completion');
          }
          
          if (widget.onComplete != null && mounted) {
            print('🔍 ONBOARDING_FLOW: Calling widget.onComplete callback');
            widget.onComplete!();
          } else {
            print('🔍 ONBOARDING_FLOW: onComplete is null or widget unmounted');
          }
        },
        onSkipped: () async {
          print('🔍 ONBOARDING_FLOW: onSkipped callback RECEIVED from BiometricSetupDialog');
          print('🔍 ONBOARDING_FLOW: widget.onComplete is ${widget.onComplete != null ? 'NOT NULL' : 'NULL'}');
          print('🔍 ONBOARDING_FLOW: mounted is $mounted');
          
          // Small delay to ensure dialog is fully closed
          await Future.delayed(const Duration(milliseconds: 100));
          
          // Notify AuthService that authentication is complete so router can redirect
          if (mounted) {
            final authService = context.read<AppStateProvider>().authService;
            authService.notifyAuthenticationComplete();
            print('🔍 ONBOARDING_FLOW: Notified AuthService of authentication completion');
          }
          
          if (widget.onComplete != null && mounted) {
            print('🔍 ONBOARDING_FLOW: About to call widget.onComplete!()');
            widget.onComplete!();
            print('🔍 ONBOARDING_FLOW: widget.onComplete!() call completed');
          } else {
            print('🔍 ONBOARDING_FLOW: CANNOT call onComplete - onComplete is null: ${widget.onComplete == null}, unmounted: ${!mounted}');
          }
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