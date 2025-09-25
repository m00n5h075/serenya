import 'package:flutter/material.dart';
import '../widgets/onboarding_button.dart';
import '../../../core/constants/design_tokens.dart';

class DisclaimerSlide extends StatelessWidget {
  final VoidCallback onUnderstand;

  const DisclaimerSlide({
    super.key,
    required this.onUnderstand,
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
                      _buildIntroduction(),
                      const SizedBox(height: 32),
                      _buildWhatWeAre(),
                      const SizedBox(height: 12),
                      _buildWhatWeAreNot(),
                      const SizedBox(height: 32),
                      _buildSafetyStatement(),
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
        'Important Things to Know',
        style: HealthcareTypography.headingH1.copyWith(
          color: HealthcareColors.serenyaBluePrimary,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  Widget _buildIntroduction() {
    return Text(
      'Serenya provides medical interpretation assistance, not medical advice or diagnosis.',
      style: TextStyle(
        fontSize: 16,
        color: Colors.grey[800],
        height: 1.5,
        fontWeight: FontWeight.w500,
      ),
    );
  }

  Widget _buildWhatWeAre() {
    final items = [
      'A helpful friend explaining your results',
      'A guide to help you navigate your health information',
      'A preparation tool for doctor conversations',
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Think of us as:',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: Colors.green[700],
          ),
        ),
        const SizedBox(height: 12),
        ...items.map((item) => _buildListItem(item, Colors.green, true)),
      ],
    );
  }

  Widget _buildWhatWeAreNot() {
    final items = [
      'A replacement for your doctor',
      'A diagnostic tool or medical device',
      'Emergency medical assistance',
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'We are NOT:',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: Colors.red[700],
          ),
        ),
        const SizedBox(height: 12),
        ...items.map((item) => _buildListItem(item, Colors.red, false)),
      ],
    );
  }

  Widget _buildListItem(String text, MaterialColor color, bool isPositive) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            isPositive ? Icons.check_circle_outline : Icons.cancel_outlined,
            size: 20,
            color: color[600],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 15,
                color: Colors.grey[800],
                height: 1.3,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSafetyStatement() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.orange[50],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.orange[300]!),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.warning_amber_outlined,
            color: Colors.orange[700],
            size: 24,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Important Safety Reminder',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.orange[800],
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Always consult healthcare professionals for medical decisions and never delay seeking medical care.',
                  style: TextStyle(
                    fontSize: 15,
                    color: Colors.orange[800],
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildButton() {
    return OnboardingButton(
      text: 'I Understand - Continue',
      onPressed: onUnderstand,
    );
  }
}