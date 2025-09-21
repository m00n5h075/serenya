import 'package:flutter/material.dart';
import '../core/constants/design_tokens.dart';
import 'serenya_spinner.dart';

/// Demo screen to showcase different Serenya spinner variants
/// 
/// This screen demonstrates all available spinner types and configurations
/// for development and testing purposes.
class SerenyaSpinnerDemo extends StatelessWidget {
  const SerenyaSpinnerDemo({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Serenya Spinner Demo'),
        backgroundColor: HealthcareColors.serenyaBluePrimary,
        foregroundColor: HealthcareColors.serenyaWhite,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(HealthcareSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Text(
              'Serenya Custom Spinners',
              style: HealthcareTypography.headingH2,
            ),
            const SizedBox(height: HealthcareSpacing.md),
            Text(
              'Branded loading indicators with pulsing animation and color transitions.',
              style: HealthcareTypography.bodyMedium,
            ),
            const SizedBox(height: HealthcareSpacing.xl),
            
            // Animated Spinners Section
            _buildSection(
              'Animated Spinners',
              'Pulsing scale animation with blue-to-green color transition',
              [
                _buildSpinnerRow('Small (16px)', const SerenyaSpinnerSmall()),
                _buildSpinnerRow('Medium (24px)', const SerenyaSpinnerMedium()),
                _buildSpinnerRow('Large (32px)', const SerenyaSpinnerLarge()),
                _buildSpinnerRow('Custom', const SerenyaSpinner(
                  size: 28.0,
                  strokeWidth: 2.5,
                  enableColorTransition: true,
                  animationDuration: Duration(milliseconds: 800),
                )),
              ],
            ),
            
            const SizedBox(height: HealthcareSpacing.xl),
            
            // Static Spinners Section
            _buildSection(
              'Static Spinners',
              'No animation - ideal for buttons and small spaces',
              [
                _buildSpinnerRow('Blue Static', const SerenyaSpinnerStatic(
                  size: 20,
                  color: HealthcareColors.serenyaBluePrimary,
                )),
                _buildSpinnerRow('Green Static', const SerenyaSpinnerStatic(
                  size: 20,
                  color: HealthcareColors.serenyaGreenPrimary,
                )),
                _buildSpinnerRow('White Static', Container(
                  padding: const EdgeInsets.all(8),
                  decoration: const BoxDecoration(
                    color: HealthcareColors.serenyaBluePrimary,
                    borderRadius: BorderRadius.all(Radius.circular(4)),
                  ),
                  child: const SerenyaSpinnerStatic(
                    size: 20,
                    color: HealthcareColors.serenyaWhite,
                  ),
                )),
              ],
            ),
            
            const SizedBox(height: HealthcareSpacing.xl),
            
            // Usage Examples Section
            _buildSection(
              'Usage Examples',
              'Real-world implementations',
              [
                _buildUsageExample(
                  'Loading Button',
                  ElevatedButton(
                    onPressed: null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: HealthcareColors.serenyaBluePrimary,
                      padding: const EdgeInsets.symmetric(
                        horizontal: HealthcareSpacing.lg,
                        vertical: HealthcareSpacing.md,
                      ),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SerenyaSpinnerStatic(
                          size: 16,
                          color: HealthcareColors.serenyaWhite,
                        ),
                        SizedBox(width: HealthcareSpacing.sm),
                        Text(
                          'Processing...',
                          style: TextStyle(color: HealthcareColors.serenyaWhite),
                        ),
                      ],
                    ),
                  ),
                ),
                _buildUsageExample(
                  'Chat Loading',
                  Container(
                    padding: const EdgeInsets.all(HealthcareSpacing.md),
                    decoration: BoxDecoration(
                      color: HealthcareColors.serenyaGray100,
                      borderRadius: BorderRadius.circular(HealthcareBorderRadius.md),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SerenyaSpinnerMedium(),
                        SizedBox(width: HealthcareSpacing.md),
                        Text('AI is analyzing your results...'),
                      ],
                    ),
                  ),
                ),
                _buildUsageExample(
                  'Page Loading',
                  const Center(
                    child: Column(
                      children: [
                        SerenyaSpinnerLarge(),
                        SizedBox(height: HealthcareSpacing.md),
                        Text(
                          'Loading your health data...',
                          style: HealthcareTypography.bodyLarge,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSection(String title, String description, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: HealthcareTypography.headingH3,
        ),
        const SizedBox(height: HealthcareSpacing.xs),
        Text(
          description,
          style: HealthcareTypography.bodySmall.copyWith(
            color: HealthcareColors.textSecondary,
          ),
        ),
        const SizedBox(height: HealthcareSpacing.md),
        Container(
          padding: const EdgeInsets.all(HealthcareSpacing.md),
          decoration: BoxDecoration(
            color: HealthcareColors.backgroundSecondary,
            borderRadius: BorderRadius.circular(HealthcareBorderRadius.md),
            border: Border.all(
              color: HealthcareColors.borderColor,
              width: 1,
            ),
          ),
          child: Column(
            children: children,
          ),
        ),
      ],
    );
  }

  Widget _buildSpinnerRow(String label, Widget spinner) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: HealthcareSpacing.sm),
      child: Row(
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: HealthcareTypography.labelMedium,
            ),
          ),
          const SizedBox(width: HealthcareSpacing.md),
          spinner,
        ],
      ),
    );
  }

  Widget _buildUsageExample(String label, Widget example) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: HealthcareSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: HealthcareTypography.labelMedium,
          ),
          const SizedBox(height: HealthcareSpacing.xs),
          example,
        ],
      ),
    );
  }
}