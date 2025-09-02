import 'package:flutter/material.dart';
import '../models/health_document.dart';
import '../core/constants/app_constants.dart';
import '../core/constants/design_tokens.dart';
import '../core/theme/healthcare_theme.dart';

class ConfidenceIndicator extends StatelessWidget {
  final double confidenceScore;
  final bool showDetails;

  const ConfidenceIndicator({
    Key? key,
    required this.confidenceScore,
    this.showDetails = true,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final confidenceTheme = Theme.of(context).extension<ConfidenceTheme>()!;
    final level = confidenceScore.confidenceLevel;
    final color = confidenceTheme.getConfidenceColor(confidenceScore);
    final icon = _getConfidenceIcon(level);
    final label = confidenceTheme.getConfidenceDescription(confidenceScore);

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: HealthcareSpacing.sm,
        vertical: HealthcareSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(HealthcareBorderRadius.confidenceIndicator),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 16,
            color: color,
          ),
          if (showDetails) ...[
            const SizedBox(width: HealthcareSpacing.xs),
            Text(
              label,
              style: confidenceTheme.confidenceTextStyle.copyWith(color: color),
            ),
            const SizedBox(width: HealthcareSpacing.xs / 2),
            Text(
              '(${confidenceScore.toStringAsFixed(1)}/10)',
              style: HealthcareTypography.labelSmall.copyWith(
                color: color.withOpacity(0.8),
              ),
            ),
          ],
        ],
      ),
    );
  }

  IconData _getConfidenceIcon(ConfidenceLevel level) {
    switch (level) {
      case ConfidenceLevel.low:
        return Icons.warning;
      case ConfidenceLevel.moderate:
        return Icons.info;
      case ConfidenceLevel.high:
        return Icons.check_circle;
    }
  }
}

class ConfidenceCard extends StatelessWidget {
  final double confidenceScore;
  final String message;
  final VoidCallback? onConsultDoctor;

  const ConfidenceCard({
    Key? key,
    required this.confidenceScore,
    required this.message,
    this.onConsultDoctor,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final level = confidenceScore.confidenceLevel;
    final needsConsultation = level == ConfidenceLevel.low || 
                              message.toLowerCase().contains('abnormal') ||
                              message.toLowerCase().contains('concerning');

    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppConstants.borderRadius),
      ),
      child: Padding(
        padding: const EdgeInsets.all(HealthcareSpacing.cardPadding),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  'AI Confidence',
                  style: HealthcareTypography.headingH4,
                ),
                const Spacer(),
                ConfidenceIndicator(confidenceScore: confidenceScore),
              ],
            ),
            const SizedBox(height: HealthcareSpacing.sm),
            Text(
              message,
              style: HealthcareTypography.bodyMedium,
            ),
            if (needsConsultation) ...[
              const SizedBox(height: HealthcareSpacing.medicalContentSpacing),
              Container(
                padding: const EdgeInsets.all(HealthcareSpacing.sm),
                decoration: BoxDecoration(
                  color: HealthcareColors.cautionOrange.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(HealthcareBorderRadius.sm),
                  border: Border.all(
                    color: HealthcareColors.cautionOrange.withOpacity(0.3),
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.medical_services,
                      color: HealthcareColors.cautionOrange,
                      size: 20,
                    ),
                    const SizedBox(width: HealthcareSpacing.sm),
                    Expanded(
                      child: Text(
                        'Consider consulting your healthcare provider for these results.',
                        style: HealthcareTypography.bodySmall.copyWith(
                          color: HealthcareColors.cautionOrange,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (onConsultDoctor != null) ...[
                const SizedBox(height: HealthcareSpacing.sm),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: onConsultDoctor,
                    icon: const Icon(Icons.medical_services, size: 16),
                    label: const Text('Find Healthcare Provider'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: HealthcareColors.cautionOrange,
                      side: const BorderSide(color: HealthcareColors.cautionOrange),
                    ),
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}