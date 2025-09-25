import 'package:flutter/material.dart';
import '../widgets/onboarding_button.dart';
import '../../../core/constants/design_tokens.dart';

class PrivacySlide extends StatelessWidget {
  final VoidCallback onContinue;

  const PrivacySlide({
    super.key,
    required this.onContinue,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.only(
            left: 24.0,
            right: 24.0,
            top: 24.0,
            bottom: 0.0, // Remove bottom padding
          ),
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
                      const SizedBox(height: 12),
                      _buildMainDescription(),
                      const SizedBox(height: 32),
                      _buildPrivacyFeatures(),
                      const SizedBox(height: 32),
                      _buildClosingStatement(),
                      const SizedBox(height: 12),
                    ],
                  ),
                ),
              ),
              _buildButton(),
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
        'Your Privacy Comes First',
        style: HealthcareTypography.headingH1.copyWith(
          color: HealthcareColors.serenyaBluePrimary,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  Widget _buildMainDescription() {
    return Text(
      'We understand health data is deeply personal. Here\'s how we protect yours:',
      style: HealthcareTypography.bodyLarge.copyWith(
        color: HealthcareColors.textPrimary,
      ),
    );
  }

  Widget _buildPrivacyFeatures() {
    final features = [
      {
        'title': 'All your data stays on your device',
        'description': 'We analyze your documents instantly, then delete them. All results stay local',
        'icon': Icons.delete_forever_outlined,
      },
      {
        'title': 'Bank-Level Security',
        'description': 'All data encrypted and GDPR/HIPAA compliant',
        'icon': Icons.security_outlined,
      },
      {
        'title': 'Never Shared',
        'description': 'Your health information stays completely private',
        'icon': Icons.lock_outline,
      },
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Privacy Features:',
          style: HealthcareTypography.headingH4.copyWith(
            fontWeight: FontWeight.w600,
            color: HealthcareColors.textPrimary,
          ),
        ),
        const SizedBox(height: 16),
        ...features.map((feature) => _buildPrivacyFeatureItem(
          feature['title']! as String,
          feature['description']! as String,
          feature['icon']! as IconData,
        )),
      ],
    );
  }

  Widget _buildPrivacyFeatureItem(String title, String description, IconData icon) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            margin: const EdgeInsets.only(right: 16),
            decoration: BoxDecoration(
              color: Colors.blue[50],
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              icon,
              size: 24,
              color: Colors.blue[600],
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: HealthcareTypography.bodyLarge.copyWith(
                    fontWeight: FontWeight.w600,
                    color: HealthcareColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  description,
                  style: HealthcareTypography.bodyMedium.copyWith(
                    color: HealthcareColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildClosingStatement() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.green[50],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.green[200]!),
      ),
      child: Row(
        children: [
          Icon(
            Icons.verified_user,
            color: Colors.green[600],
            size: 24,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Your trust is everything to us.',
              style: HealthcareTypography.bodyLarge.copyWith(
                color: HealthcareColors.safeGreen,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildButton() {
    return OnboardingButton(
      text: 'Continue',
      onPressed: onContinue,
    );
  }
}