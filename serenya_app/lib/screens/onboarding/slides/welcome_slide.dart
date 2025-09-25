import 'package:flutter/material.dart';
import '../widgets/onboarding_button.dart';
import '../../../core/constants/design_tokens.dart';

class WelcomeSlide extends StatelessWidget {
  final VoidCallback onGetStarted;

  const WelcomeSlide({
    super.key,
    required this.onGetStarted,
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
            children: [
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 40),
                      _buildHeader(),
                      const SizedBox(height: 32),
                      _buildMainDescription(),
                      const SizedBox(height: 32),
                      _buildFeatures(),
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          header: true,
          child: Text(
            'Welcome to Serenya',
            style: HealthcareTypography.headingH1.copyWith(
              color: HealthcareColors.serenyaBluePrimary,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Your AI Health Agent',
          style: HealthcareTypography.headingH3.copyWith(
            color: HealthcareColors.textSecondary,
          ),
        ),
      ],
    );
  }

  Widget _buildMainDescription() {
    return Text(
      'We help you understand your lab results in plain language and prepare for confident conversations with your doctor.',
      style: HealthcareTypography.bodyLarge.copyWith(
        color: HealthcareColors.textPrimary,
      ),
    );
  }

  Widget _buildFeatures() {
    final features = [
      {
        'title': 'Upload Lab Results',
        'description': 'Files from any medical provider'
      },
      {
        'title': 'Get Clear Explanations', 
        'description': 'Medical terms in language you understand'
      },
      {
        'title': 'Feel More Confident',
        'description': 'Arrive prepared for your next doctor visit'
      },
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'What We Do:',
          style: HealthcareTypography.headingH4.copyWith(
            fontWeight: FontWeight.w600,
            color: HealthcareColors.textPrimary,
          ),
        ),
        const SizedBox(height: 16),
        ...features.map((feature) => _buildFeatureItem(
          feature['title']!,
          feature['description']!,
        )),
      ],
    );
  }

  Widget _buildFeatureItem(String title, String description) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16.0),
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
                const SizedBox(height: 2),
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
        color: Colors.blue[50],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.blue[200]!),
      ),
      child: Text(
        'Like having a knowledgeable friend help you understand your health data.',
        style: HealthcareTypography.bodyLarge.copyWith(
          color: HealthcareColors.serenyaBluePrimary,
          fontStyle: FontStyle.italic,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }

  Widget _buildButton() {
    return OnboardingButton(
      text: 'Get Started',
      onPressed: onGetStarted,
    );
  }
}