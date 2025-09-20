import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import '../../../services/auth_service.dart';
import '../../../core/utils/platform_utils.dart';
import '../widgets/legal_document_viewer.dart';
import '../widgets/auth_error_handler.dart';

class ConsentSlide extends StatefulWidget {
  final Function(bool agreedToTerms, bool understoodDisclaimer, bool authSuccess) onAgree;

  const ConsentSlide({
    super.key,
    required this.onAgree,
  });

  @override
  State<ConsentSlide> createState() => _ConsentSlideState();
}

class _ConsentSlideState extends State<ConsentSlide> {
  bool _understoodDisclaimer = false;
  bool _agreedToTerms = false;
  bool _isLoading = false;
  bool _isAppleLoading = false;
  bool _appleSignInAvailable = false;
  final AuthService _authService = AuthService();

  bool get _canProceed => _understoodDisclaimer && _agreedToTerms;
  bool get _isAnyLoading => _isLoading || _isAppleLoading;

  @override
  void initState() {
    super.initState();
    _checkAppleSignInAvailability();
  }

  Future<void> _checkAppleSignInAvailability() async {
    if (PlatformUtils.supportsAppleSignIn) {
      final available = await _authService.isAppleSignInAvailable();
      if (mounted) {
        setState(() {
          _appleSignInAvailable = available;
        });
      }
    }
  }

  Future<void> _handleGoogleSignIn() async {
    if (!_canProceed) return;
    
    setState(() {
      _isLoading = true;
    });

    try {
      // Prepare consent data matching API contract - 2 checkboxes map to 5 consent types
      final consentData = {
        // Checkbox 1 - Legal & Processing Bundle maps to 3 consent types
        'terms_of_service': _agreedToTerms,
        'privacy_policy': _agreedToTerms,
        'healthcare_consultation': _agreedToTerms,
        
        // Checkbox 2 - Medical Disclaimers Bundle maps to 2 consent types
        'medical_disclaimers': _understoodDisclaimer, // FIXED: Changed from 'medical_disclaimer' to 'medical_disclaimers' to match backend
        'emergency_care_limitation': _understoodDisclaimer,
        
        'timestamp': DateTime.now().toIso8601String(),
        'version': '1.0',
        'consent_method': 'bundled_consent',
      };
      
      final result = await _authService.signInWithGoogle(consentData: consentData);
      widget.onAgree(_agreedToTerms, _understoodDisclaimer, result.success);
    } catch (e) {
      // Enhanced healthcare-compliant error handling
      setState(() {
        _isLoading = false;
      });
      
      if (mounted) {
        final errorInfo = _categorizeError(e);
        AuthErrorHandler.showError(
          context,
          errorCode: errorInfo['error_code'],
          userMessage: errorInfo['user_message'],
          technicalDetails: errorInfo['technical_details'],
          onRetry: _handleGoogleSignIn,
          onSettings: _showBiometricGuidance,
          onSupport: _contactSupport,
        );
      }
    }
  }

  Future<void> _handleAppleSignIn() async {
    if (!_canProceed) return;
    
    setState(() {
      _isAppleLoading = true;
    });

    try {
      // Prepare consent data matching API contract - 2 checkboxes map to 5 consent types
      final consentData = {
        // Checkbox 1 - Legal & Processing Bundle maps to 3 consent types
        'terms_of_service': _agreedToTerms,
        'privacy_policy': _agreedToTerms,
        'healthcare_consultation': _agreedToTerms,
        
        // Checkbox 2 - Medical Disclaimers Bundle maps to 2 consent types
        'medical_disclaimers': _understoodDisclaimer,
        'emergency_care_limitation': _understoodDisclaimer,
        
        'timestamp': DateTime.now().toIso8601String(),
        'version': '1.0',
        'consent_method': 'bundled_consent',
      };
      
      final result = await _authService.signInWithApple(consentData: consentData);
      widget.onAgree(_agreedToTerms, _understoodDisclaimer, result.success);
    } catch (e) {
      // Enhanced healthcare-compliant error handling for Apple Sign-In
      setState(() {
        _isAppleLoading = false;
      });
      
      if (mounted) {
        final errorInfo = _categorizeAppleError(e);
        AuthErrorHandler.showError(
          context,
          errorCode: errorInfo['error_code'],
          userMessage: errorInfo['user_message'],
          technicalDetails: errorInfo['technical_details'],
          onRetry: _handleAppleSignIn,
          onSettings: _showAppleSignInGuidance,
          onSupport: _contactSupport,
        );
      }
    }
  }

  /// Categorize Apple Sign-In errors for healthcare-appropriate error handling
  Map<String, dynamic> _categorizeAppleError(dynamic error) {
    String errorCode = 'APPLE_AUTH_ERROR';
    String userMessage = 'Apple sign-in failed. Please try again.';
    String recoveryAction = 'retry';
    String technicalDetails = error.toString();
    String detailedGuidance = '';
    
    // Handle specific Apple SignInWithApple errors
    if (error.toString().contains('AuthorizationErrorCode.canceled') || 
        error.toString().contains('canceled') || 
        error.toString().contains('cancelled')) {
      errorCode = 'USER_CANCELLED';
      userMessage = 'Apple sign-in was cancelled.';
      recoveryAction = 'retry';
      detailedGuidance = 'Please tap the Apple sign-in button again to continue.';
    } else if (error.toString().contains('AuthorizationErrorCode.failed') ||
               error.toString().contains('authentication failed')) {
      errorCode = 'APPLE_AUTH_FAILED';
      userMessage = 'Apple authentication failed.';
      recoveryAction = 'retry_or_alternative';
      detailedGuidance = 'Please try again or use Google sign-in if the issue persists.';
    } else if (error.toString().contains('AuthorizationErrorCode.invalidResponse') ||
               error.toString().contains('invalid_response')) {
      errorCode = 'APPLE_INVALID_RESPONSE';
      userMessage = 'Invalid response from Apple.';
      recoveryAction = 'retry_or_alternative';
      detailedGuidance = 'Please try again in a moment or use Google sign-in.';
    } else if (error.toString().contains('AuthorizationErrorCode.notHandled') || 
               error.toString().contains('not_handled') || 
               error.toString().contains('notHandled')) {
      errorCode = 'APPLE_CONFIG_ERROR';
      userMessage = 'Apple sign-in is not properly configured.';
      recoveryAction = 'alternative';
      detailedGuidance = 'Please use Google sign-in to continue. We\'re working on fixing this issue.';
    } else if (error.toString().contains('AuthorizationErrorCode.unknown')) {
      errorCode = 'APPLE_UNKNOWN_ERROR';
      userMessage = 'An unexpected Apple sign-in error occurred.';
      recoveryAction = 'retry_or_alternative';
      detailedGuidance = 'Please try again or use Google sign-in if the problem continues.';
    } else if (error.toString().contains('not signed in') || 
               error.toString().contains('no Apple ID')) {
      errorCode = 'APPLE_NOT_SIGNED_IN';
      userMessage = 'Please sign in to your Apple ID first.';
      recoveryAction = 'settings';
      detailedGuidance = 'Go to Settings > Sign in to your [device] to set up your Apple ID, then try again.';
    } else if (error.toString().contains('two-factor') || 
               error.toString().contains('2FA') ||
               error.toString().contains('verification required')) {
      errorCode = 'APPLE_2FA_REQUIRED';
      userMessage = 'Two-factor authentication required.';
      recoveryAction = 'retry';
      detailedGuidance = 'Please complete two-factor authentication on your Apple ID and try again.';
    } else if (error.toString().contains('network') || 
               error.toString().contains('timeout') ||
               error.toString().contains('connection') ||
               error.toString().contains('internet')) {
      errorCode = 'NETWORK_ERROR';
      userMessage = 'Connection issue detected.';
      recoveryAction = 'retry';
      detailedGuidance = 'Please check your internet connection and try again.';
    } else if (error.toString().contains('ACCOUNT_LINKING_REQUIRED')) {
      errorCode = 'ACCOUNT_LINKING_REQUIRED';
      userMessage = 'This email is already registered.';
      recoveryAction = 'alternative';
      detailedGuidance = 'Please sign in with your existing Google account, or contact support for account linking.';
    } else if (error.toString().contains('token') && error.toString().contains('expired')) {
      errorCode = 'APPLE_TOKEN_EXPIRED';
      userMessage = 'Apple authentication expired.';
      recoveryAction = 'retry';
      detailedGuidance = 'Please sign in with Apple again.';
    }
    
    return {
      'error_code': errorCode,
      'user_message': userMessage,
      'recovery_action': recoveryAction,
      'technical_details': technicalDetails,
      'detailed_guidance': detailedGuidance,
      'timestamp': DateTime.now().toIso8601String(),
    };
  }

  void _showAppleSignInGuidance() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Apple Sign-In Setup'),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('To use Apple Sign-In:'),
            SizedBox(height: 12),
            Text('• Make sure you\'re signed in to iCloud'),
            Text('• Go to Settings > Sign-In & Security'),
            Text('• Enable Two-Factor Authentication'),
            Text('• Return to Serenya to continue'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  /// Categorize error for healthcare-appropriate error handling
  Map<String, dynamic> _categorizeError(dynamic error) {
    String errorCode = 'UNKNOWN_ERROR';
    String userMessage = 'Something went wrong. Please try again.';
    String recoveryAction = 'retry';
    String technicalDetails = error.toString();
    
    if (error.toString().contains('network') || 
        error.toString().contains('timeout') ||
        error.toString().contains('connection')) {
      errorCode = 'NETWORK_ERROR';
      userMessage = 'Connection issue. Check your internet and try again.';
      recoveryAction = 'retry';
    } else if (error.toString().contains('cancelled')) {
      errorCode = 'USER_CANCELLED';
      userMessage = 'Sign-in was cancelled. Tap to try again.';
      recoveryAction = 'retry';
    } else if (error.toString().contains('google')) {
      errorCode = 'GOOGLE_AUTH_ERROR';
      userMessage = 'Google sign-in failed. Please try again.';
      recoveryAction = 'retry';
    } else if (error.toString().contains('biometric')) {
      errorCode = 'BIOMETRIC_ERROR';
      userMessage = 'Biometric authentication required for medical data access.';
      recoveryAction = 'settings';
    }
    
    return {
      'error_code': errorCode,
      'user_message': userMessage,
      'recovery_action': recoveryAction,
      'technical_details': technicalDetails,
      'timestamp': DateTime.now().toIso8601String(),
    };
  }


  void _showBiometricGuidance() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Biometric Setup Required'),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'For secure access to your medical data, please enable biometric authentication:',
              style: TextStyle(fontSize: 14),
            ),
            SizedBox(height: 12),
            Text('• Go to device Settings'),
            Text('• Find Security or Biometrics'),
            Text('• Enable Face ID/Touch ID/Fingerprint'),
            Text('• Return to Serenya to continue'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  void _contactSupport() {
    // In a real app, this would open email or support chat
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Contact Support'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Need help? Get in touch with us:'),
            const SizedBox(height: 12),
            const Text('📧 support@serenya.ai'),
            const Text('💬 Chat support in app'),
            const SizedBox(height: 8),
            Text(
              'We typically respond within 4 hours.',
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[600],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 40),
                      _buildHeader(),
                      const SizedBox(height: 24),
                      _buildBenefitsIntro(),
                      const SizedBox(height: 32),
                      _buildConsentSection(),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
              _buildButton(),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Semantics(
      header: true,
      child: Text(
        'Ready to Get Started?',
        style: TextStyle(
          fontSize: 32,
          fontWeight: FontWeight.bold,
          color: Colors.blue[800],
          height: 1.2,
        ),
      ),
    );
  }

  Widget _buildBenefitsIntro() {
    final benefits = [
      'Understand their lab results better',
      'Feel more confident in healthcare conversations',
      'Build stronger relationships with their doctors',
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Join thousands who use Serenya to:',
          style: TextStyle(
            fontSize: 16,
            color: Colors.grey[800],
            height: 1.5,
          ),
        ),
        const SizedBox(height: 16),
        ...benefits.map((benefit) => Padding(
          padding: const EdgeInsets.only(bottom: 8.0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 6,
                height: 6,
                margin: const EdgeInsets.only(top: 6, right: 12),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.blue[600],
                ),
              ),
              Expanded(
                child: Text(
                  benefit,
                  style: TextStyle(
                    fontSize: 15,
                    color: Colors.grey[700],
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
        )),
      ],
    );
  }

  Widget _buildConsentSection() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[200]!),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'By continuing, I acknowledge that:',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Colors.grey[800],
            ),
          ),
          const SizedBox(height: 16),
          _buildLegalCheckboxItem(
            value: _agreedToTerms,
            onChanged: (value) => setState(() => _agreedToTerms = value ?? false),
          ),
          const SizedBox(height: 16),
          _buildCheckboxItem(
            value: _understoodDisclaimer,
            onChanged: (value) => setState(() => _understoodDisclaimer = value ?? false),
            text: 'I understand that Serenya is not a medical device and has limitations in emergency situations. I will always consult healthcare professionals for medical decisions.',
            isMedicalBundle: true,
          ),
        ],
      ),
    );
  }

  Widget _buildLegalCheckboxItem({
    required bool value,
    required ValueChanged<bool?> onChanged,
  }) {
    return Semantics(
      container: true,
      label: '${value ? 'Checked' : 'Unchecked'} checkbox: Legal agreement and consent',
      hint: 'Tap to ${value ? 'uncheck' : 'check'}',
      child: InkWell(
        onTap: () => onChanged(!value),
        borderRadius: BorderRadius.circular(4),
        child: Padding(
          padding: const EdgeInsets.all(4.0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 24,
                height: 24,
                child: Checkbox(
                  value: value,
                  onChanged: onChanged,
                  activeColor: Colors.blue[600],
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ExcludeSemantics(
                      child: RichText(
                        text: TextSpan(
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.grey[700],
                            height: 1.4,
                            fontWeight: FontWeight.w500,
                          ),
                          children: [
                            const TextSpan(text: 'I agree to the '),
                            TextSpan(
                              text: 'Terms of Service',
                              style: TextStyle(
                                color: Colors.blue[600],
                                decoration: TextDecoration.underline,
                              ),
                              recognizer: TapGestureRecognizer()
                                ..onTap = () => LegalDocumentViewer.showTerms(context),
                            ),
                            const TextSpan(text: ' and '),
                            TextSpan(
                              text: 'Privacy Policy',
                              style: TextStyle(
                                color: Colors.blue[600],
                                decoration: TextDecoration.underline,
                              ),
                              recognizer: TapGestureRecognizer()
                                ..onTap = () => LegalDocumentViewer.showPrivacy(context),
                            ),
                            const TextSpan(text: ', and consent to AI processing of my medical data'),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Includes: Terms, Privacy Policy, Healthcare Consultation Agreement',
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.blue[600],
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCheckboxItem({
    required bool value,
    required ValueChanged<bool?> onChanged,
    required String text,
    bool isLegalBundle = false,
    bool isMedicalBundle = false,
  }) {
    return Semantics(
      container: true,
      label: '${value ? 'Checked' : 'Unchecked'} checkbox: $text',
      hint: 'Tap to ${value ? 'uncheck' : 'check'}',
      child: InkWell(
        onTap: () => onChanged(!value),
        borderRadius: BorderRadius.circular(4),
        child: Padding(
          padding: const EdgeInsets.all(4.0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 24,
                height: 24,
                child: Checkbox(
                  value: value,
                  onChanged: onChanged,
                  activeColor: Colors.blue[600],
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ExcludeSemantics(
                      child: Text(
                        text,
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.grey[700],
                          height: 1.4,
                          fontWeight: (isLegalBundle || isMedicalBundle) ? FontWeight.w500 : FontWeight.normal,
                        ),
                      ),
                    ),
                    if (isLegalBundle) ...[
                      const SizedBox(height: 4),
                      Text(
                        'Includes: Terms, Privacy Policy, Healthcare Consultation Agreement',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.blue[600],
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ],
                    if (isMedicalBundle) ...[
                      const SizedBox(height: 4),
                      Text(
                        'Includes: Medical Disclaimer, Emergency Care Limitations',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.orange[600],
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildButton() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Separator with text
        Row(
          children: [
            Expanded(
              child: Divider(
                color: Colors.grey[300],
                thickness: 1,
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                'Create my account using:',
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.grey[600],
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            Expanded(
              child: Divider(
                color: Colors.grey[300],
                thickness: 1,
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        
        // Apple Sign-In Button (iOS only, top position per Apple HIG)
        if (_appleSignInAvailable) ...[
          _buildAppleSignInButton(),
          const SizedBox(height: 12),
        ],
        
        // Google Sign-In Button
        _buildGoogleSignInButton(),
        
        if (!_canProceed) ...[
          const SizedBox(height: 12),
          Text(
            'Please check both boxes above to continue',
            style: TextStyle(
              fontSize: 12,
              color: Colors.red[600],
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ],
    );
  }

  Widget _buildGoogleSignInButton() {
    return Semantics(
      label: 'Continue with Google',
      hint: 'Sign in using your Google account to create your Serenya account',
      child: Container(
        width: 328,
        height: 50,
        margin: const EdgeInsets.symmetric(horizontal: 24),
        child: ElevatedButton(
          onPressed: _canProceed && !_isAnyLoading ? _handleGoogleSignIn : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.white,
            foregroundColor: Colors.black87,
            elevation: 1,
            shadowColor: Colors.black26,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(4),
              side: BorderSide(
                color: _canProceed ? Colors.grey[300]! : Colors.grey[200]!,
                width: 1,
              ),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 16),
          ),
          child: _isLoading
              ? SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.grey[600]!),
                  ),
                )
              : Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Google logo (using built-in design)
                    Container(
                      width: 18,
                      height: 18,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(2),
                      ),
                      child: CustomPaint(
                        painter: GoogleLogoPainter(),
                        size: const Size(18, 18),
                      ),
                    ),
                    const SizedBox(width: 12),
                    // Button text with proper font
                    Text(
                      'Continue with Google',
                      style: TextStyle(
                        fontFamily: 'Roboto',
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: _canProceed ? Colors.black87 : Colors.grey[400],
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _buildAppleSignInButton() {
    return Semantics(
      label: 'Continue with Apple',
      hint: 'Sign in using your Apple ID to create your Serenya account',
      child: Container(
        width: 328,
        height: 50,
        margin: const EdgeInsets.symmetric(horizontal: 24),
        child: _canProceed && !_isAnyLoading
            ? SignInWithAppleButton(
                onPressed: () => _handleAppleSignIn(),
                style: SignInWithAppleButtonStyle.black,
                borderRadius: BorderRadius.circular(4),
                height: 50,
                text: 'Continue with Apple',
              )
            : Opacity(
                opacity: 0.5,
                child: SignInWithAppleButton(
                  onPressed: () {}, // Empty callback for disabled state
                  style: SignInWithAppleButtonStyle.black,
                  borderRadius: BorderRadius.circular(4),
                  height: 50,
                  text: 'Continue with Apple',
                ),
              ),
      ),
    );
  }
}

// Custom painter for Google logo following official branding guidelines
class GoogleLogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..style = PaintingStyle.fill;
    
    // Google "G" logo simplified implementation
    // Blue
    paint.color = const Color(0xFF4285F4);
    canvas.drawPath(
      Path()
        ..moveTo(size.width * 0.4, size.height * 0.5)
        ..lineTo(size.width * 0.9, size.height * 0.5)
        ..lineTo(size.width * 0.9, size.height * 0.7)
        ..lineTo(size.width * 0.7, size.height * 0.7)
        ..lineTo(size.width * 0.7, size.height * 0.3)
        ..lineTo(size.width * 0.4, size.height * 0.3)
        ..close(),
      paint,
    );
    
    // Red
    paint.color = const Color(0xFFEA4335);
    canvas.drawArc(
      Rect.fromLTWH(0, 0, size.width, size.height),
      -0.5,
      1.0,
      false,
      paint,
    );
    
    // Yellow
    paint.color = const Color(0xFFFFBC04);
    canvas.drawArc(
      Rect.fromLTWH(0, 0, size.width, size.height),
      0.5,
      1.0,
      false,
      paint,
    );
    
    // Green
    paint.color = const Color(0xFF34A853);
    canvas.drawArc(
      Rect.fromLTWH(0, 0, size.width, size.height),
      1.5,
      1.0,
      false,
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}