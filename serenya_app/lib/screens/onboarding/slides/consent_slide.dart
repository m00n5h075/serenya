import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import '../../../services/auth_service.dart';
import '../widgets/legal_document_viewer.dart';
import '../widgets/auth_error_handler.dart';

class ConsentSlide extends StatefulWidget {
  final Function(bool agreedToTerms, bool understoodDisclaimer, bool authSuccess) onAgree;

  const ConsentSlide({
    Key? key,
    required this.onAgree,
  }) : super(key: key);

  @override
  State<ConsentSlide> createState() => _ConsentSlideState();
}

class _ConsentSlideState extends State<ConsentSlide> {
  bool _understoodDisclaimer = false;
  bool _agreedToTerms = false;
  bool _isLoading = false;
  final AuthService _authService = AuthService();

  bool get _canProceed => _understoodDisclaimer && _agreedToTerms;

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
          onPressed: _canProceed && !_isLoading ? _handleGoogleSignIn : null,
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