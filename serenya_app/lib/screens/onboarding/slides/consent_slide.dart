import 'package:flutter/material.dart';
import '../../../services/auth_service.dart';

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
      // Prepare consent data to send with authentication
      final consentData = {
        'agreed_to_terms': _agreedToTerms,
        'understood_disclaimer': _understoodDisclaimer,
        'timestamp': DateTime.now().toIso8601String(),
        'version': '1.0',
      };
      
      final success = await _authService.signInWithGoogle(consentData: consentData);
      widget.onAgree(_agreedToTerms, _understoodDisclaimer, success);
    } catch (e) {
      // Handle error
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                Icon(Icons.error_outline, color: Colors.white),
                SizedBox(width: 8),
                Text('Sign in failed. Please try again.'),
              ],
            ),
            backgroundColor: Colors.red[600],
            duration: Duration(seconds: 4),
            action: SnackBarAction(
              label: 'Retry',
              textColor: Colors.white,
              onPressed: () {
                ScaffoldMessenger.of(context).hideCurrentSnackBar();
                _handleGoogleSignIn();
              },
            ),
          ),
        );
      }
      setState(() {
        _isLoading = false;
      });
    }
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
          _buildCheckboxItem(
            value: _understoodDisclaimer,
            onChanged: (value) => setState(() => _understoodDisclaimer = value ?? false),
            text: 'I understand Serenya provides medical interpretation assistance (not medical advice), that I should always consult healthcare professionals for medical decisions, and that this is not a medical device or diagnostic tool',
          ),
          const SizedBox(height: 16),
          _buildCheckboxItem(
            value: _agreedToTerms,
            onChanged: (value) => setState(() => _agreedToTerms = value ?? false),
            text: 'I agree to the Terms of Service and Privacy Policy',
          ),
        ],
      ),
    );
  }

  Widget _buildCheckboxItem({
    required bool value,
    required ValueChanged<bool?> onChanged,
    required String text,
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
                child: ExcludeSemantics(
                  child: Text(
                    text,
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[700],
                      height: 1.4,
                    ),
                  ),
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
                        size: Size(18, 18),
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
    paint.color = Color(0xFF4285F4);
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
    paint.color = Color(0xFFEA4335);
    canvas.drawArc(
      Rect.fromLTWH(0, 0, size.width, size.height),
      -0.5,
      1.0,
      false,
      paint,
    );
    
    // Yellow
    paint.color = Color(0xFFFFBC04);
    canvas.drawArc(
      Rect.fromLTWH(0, 0, size.width, size.height),
      0.5,
      1.0,
      false,
      paint,
    );
    
    // Green
    paint.color = Color(0xFF34A853);
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