import 'package:flutter/material.dart';
import '../models/health_document.dart';
import '../core/constants/app_constants.dart';

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
    final level = confidenceScore.confidenceLevel;
    final color = _getConfidenceColor(level);
    final icon = _getConfidenceIcon(level);
    final label = _getConfidenceLabel(level);

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: AppConstants.smallPadding,
        vertical: AppConstants.smallPadding / 2,
      ),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(AppConstants.borderRadius / 2),
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
            SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
            SizedBox(width: 4),
            Text(
              '(${confidenceScore.toStringAsFixed(1)}/10)',
              style: TextStyle(
                fontSize: 11,
                color: color.withOpacity(0.8),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Color _getConfidenceColor(ConfidenceLevel level) {
    switch (level) {
      case ConfidenceLevel.low:
        return Colors.red[600]!;
      case ConfidenceLevel.moderate:
        return Colors.orange[600]!;
      case ConfidenceLevel.high:
        return Colors.green[600]!;
    }
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

  String _getConfidenceLabel(ConfidenceLevel level) {
    switch (level) {
      case ConfidenceLevel.low:
        return 'Low Confidence';
      case ConfidenceLevel.moderate:
        return 'Moderate Confidence';
      case ConfidenceLevel.high:
        return 'High Confidence';
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
        padding: EdgeInsets.all(AppConstants.defaultPadding),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  'AI Confidence',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey[800],
                  ),
                ),
                Spacer(),
                ConfidenceIndicator(confidenceScore: confidenceScore),
              ],
            ),
            SizedBox(height: AppConstants.smallPadding),
            Text(
              message,
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey[700],
                height: 1.4,
              ),
            ),
            if (needsConsultation) ...[
              SizedBox(height: AppConstants.defaultPadding),
              Container(
                padding: EdgeInsets.all(AppConstants.smallPadding),
                decoration: BoxDecoration(
                  color: Colors.orange[50],
                  borderRadius: BorderRadius.circular(AppConstants.borderRadius / 2),
                  border: Border.all(color: Colors.orange[200]!),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.medical_services,
                      color: Colors.orange[600],
                      size: 20,
                    ),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Consider consulting your healthcare provider for these results.',
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.orange[800],
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (onConsultDoctor != null) ...[
                SizedBox(height: AppConstants.smallPadding),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: onConsultDoctor,
                    icon: Icon(Icons.medical_services, size: 16),
                    label: Text('Find Healthcare Provider'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.orange[600],
                      side: BorderSide(color: Colors.orange[600]!),
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