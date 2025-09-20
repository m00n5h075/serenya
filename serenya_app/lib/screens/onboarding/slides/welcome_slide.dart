import 'package:flutter/material.dart';
import '../widgets/onboarding_button.dart';

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
          padding: const EdgeInsets.all(24.0),
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
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ),
              _buildButton(),
              const SizedBox(height: 24),
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
            style: TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.bold,
              color: Colors.blue[800],
              height: 1.2,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Your AI Health Agent',
          style: TextStyle(
            fontSize: 20,
            color: Colors.grey[600],
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  Widget _buildMainDescription() {
    return Text(
      'We help you understand your lab results in plain language and prepare for confident conversations with your doctor.',
      style: TextStyle(
        fontSize: 16,
        color: Colors.grey[800],
        height: 1.5,
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
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: Colors.grey[800],
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
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey[800],
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  description,
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey[600],
                    height: 1.3,
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
        style: TextStyle(
          fontSize: 16,
          color: Colors.blue[800],
          fontStyle: FontStyle.italic,
          height: 1.4,
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