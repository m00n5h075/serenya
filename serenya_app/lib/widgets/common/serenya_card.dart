import 'package:flutter/material.dart';
import '../../core/constants/design_tokens.dart';

/// Reusable card component for Serenya healthcare platform
/// 
/// Provides consistent card styling with:
/// - Healthcare design system compliance
/// - Accessibility support
/// - Multiple variants and interaction states
/// - Proper spacing and elevation

class SerenyaCard extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets? padding;
  final SerenyaCardVariant variant;
  final bool showBorder;
  final Color? customBackgroundColor;
  final Color? customBorderColor;
  final String? semanticLabel;
  final bool isInteractive;

  const SerenyaCard({
    Key? key,
    required this.child,
    this.onTap,
    this.padding,
    this.variant = SerenyaCardVariant.standard,
    this.showBorder = true,
    this.customBackgroundColor,
    this.customBorderColor,
    this.semanticLabel,
    this.isInteractive = false,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final cardConfig = _getCardConfig();
    
    Widget cardContent = Container(
      padding: padding ?? _getDefaultPadding(),
      decoration: BoxDecoration(
        color: customBackgroundColor ?? cardConfig.backgroundColor,
        borderRadius: BorderRadius.circular(cardConfig.borderRadius),
        border: showBorder ? Border.all(
          color: customBorderColor ?? cardConfig.borderColor,
          width: cardConfig.borderWidth,
        ) : null,
        boxShadow: cardConfig.shadows,
      ),
      child: child,
    );

    if (onTap != null || isInteractive) {
      return Semantics(
        label: semanticLabel,
        button: onTap != null,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(cardConfig.borderRadius),
            splashColor: HealthcareColors.serenyaBluePrimary.withOpacity(0.1),
            highlightColor: HealthcareColors.serenyaBluePrimary.withOpacity(0.05),
            child: cardContent,
          ),
        ),
      );
    }

    if (semanticLabel != null) {
      return Semantics(
        label: semanticLabel,
        child: cardContent,
      );
    }

    return cardContent;
  }

  EdgeInsets _getDefaultPadding() {
    switch (variant) {
      case SerenyaCardVariant.compact:
        return const EdgeInsets.all(HealthcareSpacing.sm);
      case SerenyaCardVariant.standard:
        return const EdgeInsets.all(HealthcareSpacing.md);
      case SerenyaCardVariant.spacious:
        return const EdgeInsets.all(HealthcareSpacing.lg);
      case SerenyaCardVariant.minimal:
        return const EdgeInsets.all(HealthcareSpacing.xs);
    }
  }

  _CardConfig _getCardConfig() {
    switch (variant) {
      case SerenyaCardVariant.compact:
        return _CardConfig(
          backgroundColor: HealthcareColors.surfaceCard,
          borderColor: HealthcareColors.surfaceBorder,
          borderWidth: 1,
          borderRadius: HealthcareBorderRadius.sm,
          shadows: [
            BoxShadow(
              color: HealthcareColors.textSecondary.withOpacity(0.08),
              offset: const Offset(0, 1),
              blurRadius: 2,
            ),
          ],
        );
      
      case SerenyaCardVariant.standard:
        return _CardConfig(
          backgroundColor: HealthcareColors.surfaceCard,
          borderColor: HealthcareColors.surfaceBorder,
          borderWidth: 1,
          borderRadius: HealthcareBorderRadius.card,
          shadows: [
            BoxShadow(
              color: HealthcareColors.textSecondary.withOpacity(0.1),
              offset: const Offset(0, 2),
              blurRadius: 4,
            ),
          ],
        );
      
      case SerenyaCardVariant.spacious:
        return _CardConfig(
          backgroundColor: HealthcareColors.surfaceCard,
          borderColor: HealthcareColors.surfaceBorder,
          borderWidth: 1,
          borderRadius: HealthcareBorderRadius.lg,
          shadows: [
            BoxShadow(
              color: HealthcareColors.textSecondary.withOpacity(0.12),
              offset: const Offset(0, 4),
              blurRadius: 8,
            ),
          ],
        );
      
      case SerenyaCardVariant.minimal:
        return _CardConfig(
          backgroundColor: HealthcareColors.backgroundSecondary,
          borderColor: HealthcareColors.surfaceBorder.withOpacity(0.5),
          borderWidth: 0.5,
          borderRadius: HealthcareBorderRadius.xs,
          shadows: [],
        );
    }
  }
}

/// Specialized card for healthcare information display
class HealthInfoCard extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget content;
  final IconData? icon;
  final Color? iconColor;
  final List<Widget>? actions;
  final VoidCallback? onTap;
  final bool showWarning;
  final String? warningText;

  const HealthInfoCard({
    Key? key,
    required this.title,
    this.subtitle,
    required this.content,
    this.icon,
    this.iconColor,
    this.actions,
    this.onTap,
    this.showWarning = false,
    this.warningText,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return SerenyaCard(
      onTap: onTap,
      variant: SerenyaCardVariant.standard,
      isInteractive: onTap != null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(),
          const SizedBox(height: HealthcareSpacing.md),
          content,
          if (showWarning) ...[
            const SizedBox(height: HealthcareSpacing.md),
            _buildWarning(),
          ],
          if (actions != null && actions!.isNotEmpty) ...[
            const SizedBox(height: HealthcareSpacing.lg),
            _buildActions(),
          ],
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      children: [
        if (icon != null) ...[
          Container(
            padding: const EdgeInsets.all(HealthcareSpacing.sm),
            decoration: BoxDecoration(
              color: (iconColor ?? HealthcareColors.serenyaBluePrimary).withOpacity(0.1),
              borderRadius: BorderRadius.circular(HealthcareBorderRadius.sm),
            ),
            child: Icon(
              icon!,
              color: iconColor ?? HealthcareColors.serenyaBluePrimary,
              size: 24,
            ),
          ),
          const SizedBox(width: HealthcareSpacing.md),
        ],
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: HealthcareTypography.headingH4.copyWith(
                  color: HealthcareColors.textPrimary,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(
                  subtitle!,
                  style: HealthcareTypography.bodySmall.copyWith(
                    color: HealthcareColors.textSecondary,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildWarning() {
    return Container(
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
          const Icon(
            Icons.warning_amber,
            color: HealthcareColors.cautionOrange,
            size: 16,
          ),
          const SizedBox(width: HealthcareSpacing.sm),
          Expanded(
            child: Text(
              warningText ?? 'Please consult your healthcare provider',
              style: HealthcareTypography.bodySmall.copyWith(
                color: HealthcareColors.cautionOrange,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActions() {
    return Wrap(
      spacing: HealthcareSpacing.sm,
      runSpacing: HealthcareSpacing.sm,
      children: actions!,
    );
  }
}

/// Summary card for displaying key metrics or information
class SummaryCard extends StatelessWidget {
  final String value;
  final String label;
  final String? unit;
  final IconData? icon;
  final Color? color;
  final String? trend;
  final TrendDirection? trendDirection;
  final VoidCallback? onTap;

  const SummaryCard({
    Key? key,
    required this.value,
    required this.label,
    this.unit,
    this.icon,
    this.color,
    this.trend,
    this.trendDirection,
    this.onTap,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final cardColor = color ?? HealthcareColors.serenyaBluePrimary;
    
    return SerenyaCard(
      onTap: onTap,
      variant: SerenyaCardVariant.standard,
      isInteractive: onTap != null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (icon != null) ...[
                Icon(
                  icon!,
                  color: cardColor,
                  size: 24,
                ),
                const SizedBox(width: HealthcareSpacing.sm),
              ],
              Expanded(
                child: Text(
                  label,
                  style: HealthcareTypography.labelMedium.copyWith(
                    color: HealthcareColors.textSecondary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: HealthcareSpacing.sm),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                value,
                style: HealthcareTypography.headingH2.copyWith(
                  color: cardColor,
                  fontWeight: FontWeight.bold,
                ),
              ),
              if (unit != null) ...[
                const SizedBox(width: 4),
                Text(
                  unit!,
                  style: HealthcareTypography.bodyMedium.copyWith(
                    color: HealthcareColors.textSecondary,
                  ),
                ),
              ],
            ],
          ),
          if (trend != null && trendDirection != null) ...[
            const SizedBox(height: HealthcareSpacing.xs),
            Row(
              children: [
                Icon(
                  _getTrendIcon(),
                  color: _getTrendColor(),
                  size: 16,
                ),
                const SizedBox(width: 4),
                Text(
                  trend!,
                  style: HealthcareTypography.bodySmall.copyWith(
                    color: _getTrendColor(),
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  IconData _getTrendIcon() {
    switch (trendDirection!) {
      case TrendDirection.up:
        return Icons.trending_up;
      case TrendDirection.down:
        return Icons.trending_down;
      case TrendDirection.stable:
        return Icons.trending_flat;
    }
  }

  Color _getTrendColor() {
    switch (trendDirection!) {
      case TrendDirection.up:
        return HealthcareColors.safeGreen;
      case TrendDirection.down:
        return HealthcareColors.error;
      case TrendDirection.stable:
        return HealthcareColors.textSecondary;
    }
  }
}

/// Card variants for different use cases
enum SerenyaCardVariant {
  compact,   // Minimal padding, small radius
  standard,  // Default styling
  spacious,  // Extra padding, larger radius
  minimal,   // Subtle styling, minimal shadows
}

/// Trend direction for summary cards
enum TrendDirection {
  up,
  down,
  stable,
}

/// Internal card configuration
class _CardConfig {
  final Color backgroundColor;
  final Color borderColor;
  final double borderWidth;
  final double borderRadius;
  final List<BoxShadow> shadows;

  _CardConfig({
    required this.backgroundColor,
    required this.borderColor,
    required this.borderWidth,
    required this.borderRadius,
    required this.shadows,
  });
}