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
              'Last updated: September 1, 2025',
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
          'Serenya is a medical information interpretation tool, not a medical device or diagnostic tool.',
          'You must be 18 years or older to use this service.',
        ]),
        
        _buildSection('2. Service Description', [
          'Serenya provides AI-powered interpretation of medical documents and lab results.',
          'Our service helps you better understand your medical information.',
          'We do not provide medical advice, diagnosis, or treatment recommendations.',
        ]),
        
        _buildSection('3. Medical Disclaimers', [
          'Serenya is NOT a substitute for professional medical advice.',
          'Always consult with healthcare professionals for medical decisions.',
          'Do not use Serenya for emergency medical situations.',
          'Our interpretations are educational and informational only.',
        ]),
        
        _buildSection('4. Data Processing', [
          'We process your medical documents using secure AI systems.',
          'All data is encrypted and processed according to healthcare standards.',
          'Documents are processed instantly and then deleted from our servers.',
          'Your personal medical data stays on your device.',
        ]),
        
        _buildSection('5. Limitations of Liability', [
          'Serenya is provided "as is" without warranties of any kind.',
          'We are not liable for any medical decisions made based on our interpretations.',
          'You use Serenya at your own risk and discretion.',
        ]),
        
        _buildSection('6. Privacy and Security', [
          'Your privacy is our top priority.',
          'We comply with GDPR, HIPAA, and other applicable privacy laws.',
          'See our Privacy Policy for detailed information about data handling.',
        ]),
      ],
    );
  }

  Widget _buildPrivacyPolicy() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSection('1. Information We Collect', [
          'Account information: Name, email address from Google sign-in',
          'Medical documents: Lab results and medical files you choose to upload',
          'Device information: Basic device and app usage data for security',
        ]),
        
        _buildSection('2. How We Use Your Information', [
          'To provide AI-powered medical document interpretation',
          'To improve our service quality and accuracy',
          'To communicate with you about your account',
          'To ensure security and prevent fraud',
        ]),
        
        _buildSection('3. Data Storage and Security', [
          'Medical documents are processed instantly and then deleted',
          'Personal data is encrypted using bank-level security',
          'Your medical information is stored locally on your device',
          'We never share your medical data with third parties',
        ]),
        
        _buildSection('4. Your Rights', [
          'Access: You can request access to your personal data',
          'Correction: You can request correction of inaccurate data',
          'Deletion: You can request deletion of your account and data',
          'Portability: You can export your data in a standard format',
        ]),
        
        _buildSection('5. Data Retention', [
          'Account data: Retained until you delete your account',
          'Medical documents: Deleted immediately after processing',
          'Usage data: Anonymized and retained for service improvement',
        ]),
        
        _buildSection('6. International Data Transfers', [
          'Your data may be processed in countries with adequate protection',
          'We ensure appropriate safeguards for international transfers',
          'EU residents receive GDPR-compliant protection',
        ]),
        
        _buildSection('7. Contact Us', [
          'For privacy questions: privacy@serenya.ai',
          'For data requests: data@serenya.ai',
          'For general support: support@serenya.ai',
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