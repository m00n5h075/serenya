import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/constants/design_tokens.dart';
import '../serenya_spinner.dart';

/// Reusable button component for Serenya healthcare platform
/// 
/// Provides consistent button styling with:
/// - Healthcare design system compliance
/// - Accessibility support
/// - Multiple variants and states
/// - Haptic feedback

class SerenyaButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final SerenyaButtonVariant variant;
  final SerenyaButtonSize size;
  final IconData? icon;
  final bool isLoading;
  final bool isFullWidth;
  final Color? customColor;
  final String? semanticLabel;

  const SerenyaButton({
    super.key,
    required this.text,
    this.onPressed,
    this.variant = SerenyaButtonVariant.primary,
    this.size = SerenyaButtonSize.medium,
    this.icon,
    this.isLoading = false,
    this.isFullWidth = false,
    this.customColor,
    this.semanticLabel,
  });

  @override
  Widget build(BuildContext context) {
    final buttonStyle = _getButtonStyle();
    final textStyle = _getTextStyle();
    final iconSize = _getIconSize();
    
    Widget buttonChild = _buildButtonContent(textStyle, iconSize);
    
    if (isFullWidth) {
      buttonChild = SizedBox(
        width: double.infinity,
        child: buttonChild,
      );
    }

    return Semantics(
      label: semanticLabel ?? text,
      hint: isLoading ? 'Loading' : 'Tap to activate',
      button: true,
      enabled: onPressed != null && !isLoading,
      child: ElevatedButton(
        onPressed: isLoading ? null : _handlePress,
        style: buttonStyle,
        child: buttonChild,
      ),
    );
  }

  void _handlePress() {
    if (onPressed != null) {
      HapticFeedback.lightImpact();
      onPressed!();
    }
  }

  Widget _buildButtonContent(TextStyle textStyle, double iconSize) {
    if (isLoading) {
      return SizedBox(
        height: _getButtonHeight() - 24, // Account for padding
        child: const SerenyaSpinnerStatic(
          size: 20,
          strokeWidth: 2,
          color: HealthcareColors.serenyaWhite,
        ),
      );
    }

    if (icon != null) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: iconSize,
            color: _getIconColor(),
          ),
          const SizedBox(width: HealthcareSpacing.sm),
          Text(text, style: textStyle),
        ],
      );
    }

    return Text(text, style: textStyle);
  }

  ButtonStyle _getButtonStyle() {
    final colors = _getColors();
    
    return ElevatedButton.styleFrom(
      backgroundColor: colors.background,
      foregroundColor: colors.foreground,
      disabledBackgroundColor: colors.disabledBackground,
      disabledForegroundColor: colors.disabledForeground,
      elevation: _getElevation(),
      shadowColor: HealthcareColors.textSecondary.withValues(alpha: 0.2),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(_getBorderRadius()),
        side: _getBorderSide(colors),
      ),
      minimumSize: Size(_getMinWidth(), _getButtonHeight()),
      padding: _getPadding(),
    );
  }

  _ButtonColors _getColors() {
    if (customColor != null) {
      return _ButtonColors(
        background: customColor!,
        foreground: HealthcareColors.serenyaWhite,
        disabledBackground: HealthcareColors.textDisabled,
        disabledForeground: HealthcareColors.textSecondary,
      );
    }

    switch (variant) {
      case SerenyaButtonVariant.primary:
        return _ButtonColors(
          background: HealthcareColors.serenyaBluePrimary,
          foreground: HealthcareColors.serenyaWhite,
          disabledBackground: HealthcareColors.textDisabled,
          disabledForeground: HealthcareColors.textSecondary,
        );
      
      case SerenyaButtonVariant.secondary:
        return _ButtonColors(
          background: HealthcareColors.serenyaGreenPrimary,
          foreground: HealthcareColors.serenyaWhite,
          disabledBackground: HealthcareColors.textDisabled,
          disabledForeground: HealthcareColors.textSecondary,
        );
      
      case SerenyaButtonVariant.outline:
        return _ButtonColors(
          background: Colors.transparent,
          foreground: HealthcareColors.serenyaBluePrimary,
          disabledBackground: Colors.transparent,
          disabledForeground: HealthcareColors.textDisabled,
        );
      
      case SerenyaButtonVariant.ghost:
        return _ButtonColors(
          background: Colors.transparent,
          foreground: HealthcareColors.serenyaBluePrimary,
          disabledBackground: Colors.transparent,
          disabledForeground: HealthcareColors.textDisabled,
        );
      
      case SerenyaButtonVariant.destructive:
        return _ButtonColors(
          background: HealthcareColors.error,
          foreground: HealthcareColors.serenyaWhite,
          disabledBackground: HealthcareColors.textDisabled,
          disabledForeground: HealthcareColors.textSecondary,
        );
      
      case SerenyaButtonVariant.success:
        return _ButtonColors(
          background: HealthcareColors.safeGreen,
          foreground: HealthcareColors.serenyaWhite,
          disabledBackground: HealthcareColors.textDisabled,
          disabledForeground: HealthcareColors.textSecondary,
        );
    }
  }

  BorderSide _getBorderSide(_ButtonColors colors) {
    if (variant == SerenyaButtonVariant.outline) {
      return BorderSide(
        color: onPressed != null ? colors.foreground : HealthcareColors.textDisabled,
        width: 1,
      );
    }
    return BorderSide.none;
  }

  Color _getIconColor() {
    final colors = _getColors();
    return onPressed != null ? colors.foreground : colors.disabledForeground;
  }

  TextStyle _getTextStyle() {
    switch (size) {
      case SerenyaButtonSize.small:
        return HealthcareTypography.labelMedium.copyWith(
          fontWeight: FontWeight.w600,
          color: _getIconColor(),
        );
      case SerenyaButtonSize.medium:
        return HealthcareTypography.labelLarge.copyWith(
          fontWeight: FontWeight.w600,
          color: _getIconColor(),
        );
      case SerenyaButtonSize.large:
        return HealthcareTypography.bodyLarge.copyWith(
          fontWeight: FontWeight.w600,
          color: _getIconColor(),
        );
    }
  }

  double _getIconSize() {
    switch (size) {
      case SerenyaButtonSize.small:
        return 16;
      case SerenyaButtonSize.medium:
        return 20;
      case SerenyaButtonSize.large:
        return 24;
    }
  }

  double _getButtonHeight() {
    switch (size) {
      case SerenyaButtonSize.small:
        return 36;
      case SerenyaButtonSize.medium:
        return HealthcareAccessibility.minTouchTarget;
      case SerenyaButtonSize.large:
        return 56;
    }
  }

  double _getMinWidth() {
    switch (size) {
      case SerenyaButtonSize.small:
        return 80;
      case SerenyaButtonSize.medium:
        return HealthcareAccessibility.minTouchTarget * 2;
      case SerenyaButtonSize.large:
        return 120;
    }
  }

  double _getBorderRadius() {
    switch (size) {
      case SerenyaButtonSize.small:
        return HealthcareBorderRadius.sm;
      case SerenyaButtonSize.medium:
        return HealthcareBorderRadius.button;
      case SerenyaButtonSize.large:
        return HealthcareBorderRadius.lg;
    }
  }

  EdgeInsets _getPadding() {
    switch (size) {
      case SerenyaButtonSize.small:
        return const EdgeInsets.symmetric(
          horizontal: HealthcareSpacing.md,
          vertical: HealthcareSpacing.sm,
        );
      case SerenyaButtonSize.medium:
        return const EdgeInsets.symmetric(
          horizontal: HealthcareSpacing.lg,
          vertical: HealthcareSpacing.md,
        );
      case SerenyaButtonSize.large:
        return const EdgeInsets.symmetric(
          horizontal: HealthcareSpacing.xl,
          vertical: HealthcareSpacing.lg,
        );
    }
  }

  double _getElevation() {
    switch (variant) {
      case SerenyaButtonVariant.outline:
      case SerenyaButtonVariant.ghost:
        return 0;
      default:
        return 1;
    }
  }
}

/// Button variant types
enum SerenyaButtonVariant {
  primary,
  secondary,
  outline,
  ghost,
  destructive,
  success,
}

/// Button size options
enum SerenyaButtonSize {
  small,
  medium,
  large,
}

/// Internal color configuration
class _ButtonColors {
  final Color background;
  final Color foreground;
  final Color disabledBackground;
  final Color disabledForeground;

  _ButtonColors({
    required this.background,
    required this.foreground,
    required this.disabledBackground,
    required this.disabledForeground,
  });
}