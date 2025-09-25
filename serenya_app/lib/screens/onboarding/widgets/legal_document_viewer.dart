import 'package:flutter/material.dart';
import '../../../core/navigation/swipe_back_wrapper.dart';

/// Legal Document Viewer for Terms of Service and Privacy Policy
/// 
/// Provides in-app viewing of legal documents with healthcare-compliant formatting
class LegalDocumentViewer extends StatelessWidget {
  final String title;
  final String documentType; // 'terms' or 'privacy'
  
  const LegalDocumentViewer({
    super.key,
    required this.title,
    required this.documentType,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        elevation: 1,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.grey[800],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Last updated: January 2025',
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey[600],
              ),
            ),
            const SizedBox(height: 24),
            _buildDocumentContent(),
          ],
        ),
      ),
    ).withSwipeBack();
  }

  Widget _buildDocumentContent() {
    if (documentType == 'terms') {
      return _buildTermsOfService();
    } else if (documentType == 'privacy') {
      return _buildPrivacyPolicy();
    }
    return const SizedBox.shrink();
  }

  Widget _buildTermsOfService() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSection('1. Acceptance of Terms', [
          'By using Serenya, you agree to these Terms of Service and our Privacy Policy.',
          'If you disagree with any part of these terms, please do not use our service.',
          'You must be 18 years or older to use this service.',
        ]),
        
        _buildSection('2. Service Description', [
          'Serenya provides AI-powered interpretation of medical documents and lab results for educational purposes.',
          'Our service helps you better understand your medical information in plain language.',
          'Serenya is NOT a medical device, diagnostic tool, or substitute for professional medical advice.',
        ]),
        
        _buildSection('3. User Responsibilities', [
          'Provide accurate information during account creation',
          'Use the service only for personal, non-commercial purposes',
          'Do not share account credentials with others',
          'Comply with applicable laws and regulations',
          'Use the service responsibly and ethically',
        ]),
        
        _buildSection('4. Medical Disclaimers', [
          'CRITICAL: Serenya is for educational and informational purposes only.',
          'We do NOT provide medical advice, diagnosis, or treatment.',
          'Always consult with healthcare professionals for medical decisions.',
          'Do not use Serenya for emergency medical situations.',
          'No doctor-patient relationship is created by using Serenya.',
        ]),
        
        _buildSection('5. Data Processing and Privacy', [
          'We process your medical documents using secure AI systems.',
          'All data is encrypted and processed according to healthcare standards (GDPR/HIPAA compliant).',
          'Documents are processed instantly and then permanently deleted from our servers.',
          'Your personal medical data stays on your device.',
          'See our Privacy Policy for detailed information about data handling.',
        ]),
        
        _buildSection('6. Limitations of Liability', [
          'Serenya is provided "as is" without warranties of any kind.',
          'We are not liable for any medical decisions made based on our interpretations.',
          'You use Serenya at your own risk and discretion.',
          'Our liability is limited to the maximum extent permitted by law.',
        ]),
        
        _buildSection('7. Termination', [
          'You may terminate your account at any time through the app settings.',
          'We may suspend accounts that violate these terms.',
          'Upon termination, your account data will be deleted according to our Privacy Policy.',
        ]),
        
        _buildSection('8. Contact Information', [
          'General inquiries: support@serenya.ai',
          'Legal matters: legal@serenya.ai',
          'Technical support: support@serenya.ai',
        ]),
      ],
    );
  }

  Widget _buildPrivacyPolicy() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSection('1. Information We Collect', [
          'Account Information: Name and email address from Google/Apple sign-in',
          'Usage Data: Aggregated, anonymized usage statistics for service improvement',
          'Technical Data: Basic device information for security and compatibility',
        ]),
        
        _buildSection('2. Information We DON\'T Collect', [
          '❌ Your health documents or medical information',
          '❌ Analysis results or health insights',
          '❌ Personal identifying information from lab results',
          '❌ Location data or device contacts',
          '❌ Browsing history or other apps usage',
        ]),
        
        _buildSection('3. How We Process Medical Documents', [
          'Documents are processed instantly using secure AI systems',
          'Documents are permanently deleted immediately after processing',
          'All processing happens in encrypted, secure environments',
          'Your medical information never leaves your device permanently',
          'Results are stored locally on your device only',
        ]),
        
        _buildSection('4. How We Use Your Information', [
          'Account management and authentication',
          'Service improvement and development (anonymized data)',
          'Security monitoring and fraud prevention',
          'Customer support and communication',
          'Meeting legal and regulatory requirements',
        ]),
        
        _buildSection('5. Data Security', [
          'End-to-end encryption for all data transmission',
          'Bank-level security with GDPR and HIPAA compliance',
          'Regular security audits and compliance checks',
          'Multi-factor authentication support',
          'Secure, encrypted storage for account data',
        ]),
        
        _buildSection('6. Your Privacy Rights', [
          'Access: Request access to your personal data',
          'Correction: Request correction of inaccurate data',
          'Deletion: Request deletion of your account and data',
          'Portability: Export your data in a standard format',
          'Opt-out: Unsubscribe from communications',
          'Withdraw Consent: Revoke permissions at any time',
        ]),
        
        _buildSection('7. Data Sharing', [
          'We do NOT share your personal information with third parties',
          'Exceptions: When required by law, to protect our rights, or with your consent',
          'Anonymous, aggregated data may be used for research (no personal identification)',
        ]),
        
        _buildSection('8. Contact Information', [
          'Privacy questions: privacy@serenya.ai',
          'Data requests: data@serenya.ai',
          'General support: support@serenya.ai',
          'Security concerns: security@serenya.ai',
        ]),
      ],
    );
  }

  Widget _buildSection(String title, List<String> content) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: Colors.grey[800],
            ),
          ),
          const SizedBox(height: 12),
          ...content.map((text) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              '• $text',
              style: TextStyle(
                fontSize: 15,
                height: 1.4,
                color: Colors.grey[700],
              ),
            ),
          )),
        ],
      ),
    );
  }

  /// Show Terms of Service
  static Future<void> showTerms(BuildContext context) {
    return Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => const LegalDocumentViewer(
          title: 'Terms of Service',
          documentType: 'terms',
        ),
      ),
    );
  }

  /// Show Privacy Policy
  static Future<void> showPrivacy(BuildContext context) {
    return Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => const LegalDocumentViewer(
          title: 'Privacy Policy',
          documentType: 'privacy',
        ),
      ),
    );
  }
}