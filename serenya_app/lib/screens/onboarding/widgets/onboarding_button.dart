import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Enhanced Onboarding Button with Healthcare Accessibility
/// 
/// Features:
/// - WCAG AA compliant touch targets (48dp minimum)
/// - Semantic labeling for screen readers
/// - Loading state announcements
/// - High contrast support
/// - Haptic feedback for user interaction
class OnboardingButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final bool isLoading;
  final bool isPrimary;
  final EdgeInsetsGeometry? margin;
  final String? semanticLabel;
  final String? semanticHint;

  const OnboardingButton({
    super.key,
    required this.text,
    this.onPressed,
    this.isLoading = false,
    this.isPrimary = true,
    this.margin,
    this.semanticLabel,
    this.semanticHint,
  });

  @override
  Widget build(BuildContext context) {
    final buttonLabel = semanticLabel ?? text;
    final buttonHint = semanticHint ?? (isLoading ? 'Please wait' : 'Double tap to activate');
    
    return Container(
      margin: margin ?? const EdgeInsets.symmetric(horizontal: 24.0),
      width: double.infinity,
      child: Semantics(
        button: true,
        label: buttonLabel,
        hint: buttonHint,
        enabled: !isLoading && onPressed != null,
        child: ElevatedButton(
          onPressed: isLoading ? null : () {
            // Provide haptic feedback for better accessibility
            HapticFeedback.lightImpact();
            onPressed?.call();
          },
          style: ElevatedButton.styleFrom(
            backgroundColor: _getButtonColor(context),
            foregroundColor: _getTextColor(context),
            padding: const EdgeInsets.symmetric(vertical: 16.0),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8.0),
            ),
            elevation: isPrimary ? 2 : 0,
            minimumSize: const Size(double.infinity, 56), // Enhanced touch target
            // High contrast support
            side: _getHighContrastBorder(context),
          ),
          child: _buildButtonContent(context),
        ),
      ),
    );
  }

  Widget _buildButtonContent(BuildContext context) {
    if (isLoading) {
      return Semantics(
        liveRegion: true,
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            valueColor: AlwaysStoppedAnimation<Color>(_getTextColor(context)),
            semanticsLabel: 'Loading',
          ),
        ),
      );
    }
    
    return ExcludeSemantics(
      child: Text(
        text,
        style: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
          // Ensure adequate contrast
          color: _getTextColor(context),
        ),
      ),
    );
  }

  Color _getButtonColor(BuildContext context) {
    final isHighContrast = MediaQuery.of(context).highContrast;
    
    if (isHighContrast) {
      return isPrimary ? Colors.black : Colors.white;
    }
    
    return isPrimary ? Colors.blue[600]! : Colors.grey[200]!;
  }

  Color _getTextColor(BuildContext context) {
    final isHighContrast = MediaQuery.of(context).highContrast;
    
    if (isHighContrast) {
      return isPrimary ? Colors.white : Colors.black;
    }
    
    return isPrimary ? Colors.white : Colors.grey[800]!;
  }

  BorderSide? _getHighContrastBorder(BuildContext context) {
    final isHighContrast = MediaQuery.of(context).highContrast;
    
    if (isHighContrast) {
      return BorderSide(
        color: isPrimary ? Colors.white : Colors.black,
        width: 2,
      );
    }
    
    return null;
  }
}