import 'package:flutter/material.dart';
import '../core/constants/app_constants.dart';

class MedicalDisclaimer extends StatelessWidget {
  final DisclaimerType type;
  final bool isCompact;
  final VoidCallback? onLearnMore;

  const MedicalDisclaimer({
    Key? key,
    this.type = DisclaimerType.general,
    this.isCompact = false,
    this.onLearnMore,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final disclaimerInfo = _getDisclaimerInfo(type);
    
    return Container(
      padding: const EdgeInsets.all(AppConstants.defaultPadding),
      margin: const EdgeInsets.symmetric(horizontal: AppConstants.defaultPadding),
      decoration: BoxDecoration(
        color: disclaimerInfo.backgroundColor,
        borderRadius: BorderRadius.circular(AppConstants.borderRadius),
        border: Border.all(color: disclaimerInfo.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                disclaimerInfo.icon,
                color: disclaimerInfo.iconColor,
                size: 20,
              ),
              const SizedBox(width: AppConstants.smallPadding),
              Expanded(
                child: Text(
                  disclaimerInfo.title,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: disclaimerInfo.textColor,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.smallPadding),
          Text(
            isCompact ? disclaimerInfo.shortText : disclaimerInfo.fullText,
            style: TextStyle(
              fontSize: 13,
              color: disclaimerInfo.textColor.withOpacity(0.9),
              height: 1.4,
            ),
          ),
          if (onLearnMore != null) ...[
            const SizedBox(height: AppConstants.smallPadding),
            TextButton(
              onPressed: onLearnMore,
              style: TextButton.styleFrom(
                foregroundColor: disclaimerInfo.iconColor,
                padding: EdgeInsets.zero,
              ),
              child: const Text(
                'Learn more',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  _DisclaimerInfo _getDisclaimerInfo(DisclaimerType type) {
    switch (type) {
      case DisclaimerType.general:
        return _DisclaimerInfo(
          title: 'Not Medical Advice',
          shortText: 'This interpretation is for informational purposes only.',
          fullText: AppConstants.medicalDisclaimerText,
          icon: Icons.info_outline,
          backgroundColor: Colors.blue[50]!,
          borderColor: Colors.blue[200]!,
          iconColor: Colors.blue[600]!,
          textColor: Colors.blue[800]!,
        );
      case DisclaimerType.emergency:
        return _DisclaimerInfo(
          title: 'Emergency Care',
          shortText: 'For medical emergencies, call emergency services immediately.',
          fullText: AppConstants.emergencyCareDisclaimer,
          icon: Icons.warning,
          backgroundColor: Colors.red[50]!,
          borderColor: Colors.red[200]!,
          iconColor: Colors.red[600]!,
          textColor: Colors.red[800]!,
        );
      case DisclaimerType.consultation:
        return _DisclaimerInfo(
          title: 'Consult Your Doctor',
          shortText: 'These results may require medical consultation.',
          fullText: 'Some values in your results are outside normal ranges or our AI has moderate confidence. We recommend discussing these results with your healthcare provider for proper evaluation and next steps.',
          icon: Icons.medical_services,
          backgroundColor: Colors.orange[50]!,
          borderColor: Colors.orange[200]!,
          iconColor: Colors.orange[600]!,
          textColor: Colors.orange[800]!,
        );
      case DisclaimerType.privacy:
        return _DisclaimerInfo(
          title: 'Privacy Protected',
          shortText: 'Your health data stays on your device.',
          fullText: 'Your health data is encrypted and stored only on your device. Processing happens temporarily on secure servers and files are automatically deleted after interpretation.',
          icon: Icons.lock,
          backgroundColor: Colors.green[50]!,
          borderColor: Colors.green[200]!,
          iconColor: Colors.green[600]!,
          textColor: Colors.green[800]!,
        );
    }
  }
}

enum DisclaimerType {
  general,
  emergency,
  consultation,
  privacy,
}

class _DisclaimerInfo {
  final String title;
  final String shortText;
  final String fullText;
  final IconData icon;
  final Color backgroundColor;
  final Color borderColor;
  final Color iconColor;
  final Color textColor;

  _DisclaimerInfo({
    required this.title,
    required this.shortText,
    required this.fullText,
    required this.icon,
    required this.backgroundColor,
    required this.borderColor,
    required this.iconColor,
    required this.textColor,
  });
}