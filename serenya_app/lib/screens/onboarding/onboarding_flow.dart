import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../services/consent_service.dart';
import '../../services/auth_service.dart';
import 'slides/welcome_slide.dart';
import 'slides/privacy_slide.dart';
import 'slides/disclaimer_slide.dart';
import 'slides/consent_slide.dart';
import 'widgets/progress_dots.dart';

class OnboardingFlow extends StatefulWidget {
  final VoidCallback? onComplete;
  final VoidCallback? onAuthenticationSuccess;
  
  const OnboardingFlow({
    Key? key, 
    this.onComplete,
    this.onAuthenticationSuccess,
  }) : super(key: key);

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
    _trackSlideView(_currentIndex);
  }

  @override
  void dispose() {
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
    // Record the consent first
    await _consentService.recordConsent(agreedToTerms, understoodDisclaimer);
    
    if (authSuccess) {
      // Authentication was successful - proceed to home screen
      if (widget.onAuthenticationSuccess != null) {
        widget.onAuthenticationSuccess!();
      }
    } else {
      // Authentication failed - show error
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                Icon(Icons.error_outline, color: Colors.white),
                SizedBox(width: 8),
                Text('Authentication failed. Please try again.'),
              ],
            ),
            backgroundColor: Colors.red[600],
            duration: Duration(seconds: 4),
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
    }
    
    // Always call completion callback for any cleanup
    if (widget.onComplete != null) {
      widget.onComplete!();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Column(
        children: [
          // Progress indicator
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.only(top: 20.0, bottom: 8.0),
              child: ProgressDots(
                currentIndex: _currentIndex,
                totalCount: _totalSlides,
              ),
            ),
          ),
          
          // Main content
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