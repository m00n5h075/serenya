import 'package:flutter/material.dart';
import '../constants/design_tokens.dart';

class HealthcareTheme {
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      
      // Color Scheme
      colorScheme: const ColorScheme.light(
        primary: HealthcareColors.serenyaBluePrimary,
        onPrimary: HealthcareColors.serenyaWhite,
        secondary: HealthcareColors.serenyaGreenPrimary,
        onSecondary: HealthcareColors.serenyaWhite,
        surface: HealthcareColors.backgroundPrimary,
        onSurface: HealthcareColors.textPrimary,
        error: HealthcareColors.error,
        onError: HealthcareColors.serenyaWhite,
      ),
      
      // App Bar Theme
      appBarTheme: const AppBarTheme(
        backgroundColor: HealthcareColors.serenyaWhite,
        foregroundColor: HealthcareColors.textPrimary,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: HealthcareTypography.headingH3,
      ),
      
      // Card Theme
      cardTheme: CardTheme(
        color: HealthcareColors.surfaceCard,
        elevation: 1,
        shadowColor: HealthcareColors.textSecondary.withOpacity(0.1),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(HealthcareBorderRadius.card),
          side: const BorderSide(
            color: HealthcareColors.surfaceBorder,
            width: 1,
          ),
        ),
        margin: const EdgeInsets.all(HealthcareSpacing.sm),
      ),
      
      // Elevated Button Theme
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: HealthcareColors.serenyaBluePrimary,
          foregroundColor: HealthcareColors.serenyaWhite,
          elevation: 1,
          shadowColor: HealthcareColors.textSecondary.withOpacity(0.2),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(HealthcareBorderRadius.button),
          ),
          minimumSize: const Size(
            HealthcareAccessibility.minTouchTarget * 2,
            HealthcareAccessibility.minTouchTarget,
          ),
          padding: const EdgeInsets.symmetric(
            horizontal: HealthcareSpacing.lg,
            vertical: HealthcareSpacing.md,
          ),
          textStyle: HealthcareTypography.labelLarge.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      
      // Text Button Theme
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: HealthcareColors.serenyaBluePrimary,
          minimumSize: const Size(
            HealthcareAccessibility.minTouchTarget * 2,
            HealthcareAccessibility.minTouchTarget,
          ),
          padding: const EdgeInsets.symmetric(
            horizontal: HealthcareSpacing.md,
            vertical: HealthcareSpacing.sm,
          ),
          textStyle: HealthcareTypography.labelLarge.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      
      // Outlined Button Theme
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: HealthcareColors.serenyaBluePrimary,
          side: const BorderSide(
            color: HealthcareColors.serenyaBluePrimary,
            width: 1,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(HealthcareBorderRadius.button),
          ),
          minimumSize: const Size(
            HealthcareAccessibility.minTouchTarget * 2,
            HealthcareAccessibility.minTouchTarget,
          ),
          padding: const EdgeInsets.symmetric(
            horizontal: HealthcareSpacing.lg,
            vertical: HealthcareSpacing.md,
          ),
          textStyle: HealthcareTypography.labelLarge.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      
      // FAB Theme
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: HealthcareColors.serenyaBluePrimary,
        foregroundColor: HealthcareColors.serenyaWhite,
        elevation: 2,
        shape: CircleBorder(),
        sizeConstraints: BoxConstraints.tightFor(
          width: HealthcareAccessibility.preferredTouchTarget,
          height: HealthcareAccessibility.preferredTouchTarget,
        ),
      ),
      
      // Input Decoration Theme
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: HealthcareColors.backgroundTertiary,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(HealthcareBorderRadius.input),
          borderSide: const BorderSide(
            color: HealthcareColors.surfaceBorder,
            width: 1,
          ),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(HealthcareBorderRadius.input),
          borderSide: const BorderSide(
            color: HealthcareColors.surfaceBorder,
            width: 1,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(HealthcareBorderRadius.input),
          borderSide: const BorderSide(
            color: HealthcareColors.serenyaBluePrimary,
            width: 2,
          ),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(HealthcareBorderRadius.input),
          borderSide: const BorderSide(
            color: HealthcareColors.error,
            width: 1,
          ),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(HealthcareBorderRadius.input),
          borderSide: const BorderSide(
            color: HealthcareColors.error,
            width: 2,
          ),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: HealthcareSpacing.md,
          vertical: HealthcareSpacing.md,
        ),
        hintStyle: HealthcareTypography.bodyMedium.copyWith(
          color: HealthcareColors.textDisabled,
        ),
        labelStyle: HealthcareTypography.labelMedium,
      ),
      
      // Checkbox Theme
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return HealthcareColors.serenyaBluePrimary;
          }
          return HealthcareColors.serenyaWhite;
        }),
        checkColor: WidgetStateProperty.all(HealthcareColors.serenyaWhite),
        side: const BorderSide(
          color: HealthcareColors.surfaceBorder,
          width: 2,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
        ),
      ),
      
      // Snack Bar Theme
      snackBarTheme: SnackBarThemeData(
        backgroundColor: HealthcareColors.textPrimary,
        contentTextStyle: HealthcareTypography.bodyMedium.copyWith(
          color: HealthcareColors.serenyaWhite,
        ),
        actionTextColor: HealthcareColors.serenyaBlueAccent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(HealthcareBorderRadius.sm),
        ),
        behavior: SnackBarBehavior.floating,
      ),
      
      // Dialog Theme
      dialogTheme: DialogTheme(
        backgroundColor: HealthcareColors.serenyaWhite,
        elevation: 3,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(HealthcareBorderRadius.modal),
        ),
        titleTextStyle: HealthcareTypography.headingH4,
        contentTextStyle: HealthcareTypography.bodyMedium,
      ),
      
      // Bottom Sheet Theme
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: HealthcareColors.serenyaWhite,
        elevation: 3,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(HealthcareBorderRadius.lg),
          ),
        ),
      ),
      
      // Text Theme
      textTheme: const TextTheme(
        displayLarge: HealthcareTypography.headingH1,
        displayMedium: HealthcareTypography.headingH2,
        displaySmall: HealthcareTypography.headingH3,
        headlineMedium: HealthcareTypography.headingH3,
        headlineSmall: HealthcareTypography.headingH4,
        titleLarge: HealthcareTypography.headingH4,
        titleMedium: HealthcareTypography.labelLarge,
        titleSmall: HealthcareTypography.labelMedium,
        bodyLarge: HealthcareTypography.bodyLarge,
        bodyMedium: HealthcareTypography.bodyMedium,
        bodySmall: HealthcareTypography.bodySmall,
        labelLarge: HealthcareTypography.labelLarge,
        labelMedium: HealthcareTypography.labelMedium,
        labelSmall: HealthcareTypography.labelSmall,
      ),
      
      // Visual density
      visualDensity: VisualDensity.adaptivePlatformDensity,
    );
  }
  
  static ThemeData get doctorReportTheme {
    return lightTheme.copyWith(
      colorScheme: lightTheme.colorScheme.copyWith(
        primary: HealthcareColors.serenyaGreenPrimary,
        secondary: HealthcareColors.serenyaBluePrimary,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: lightTheme.elevatedButtonTheme.style?.copyWith(
          backgroundColor: WidgetStateProperty.all(
            HealthcareColors.serenyaGreenPrimary,
          ),
        ),
      ),
      floatingActionButtonTheme: lightTheme.floatingActionButtonTheme.copyWith(
        backgroundColor: HealthcareColors.serenyaGreenPrimary,
      ),
    );
  }
}

class HealthcareThemeExtensions {
  static ThemeExtension<ConfidenceTheme> get confidenceTheme => 
      const ConfidenceTheme();
  
  static ThemeExtension<MedicalSafetyTheme> get medicalSafetyTheme => 
      const MedicalSafetyTheme();
}

/// Custom theme extension for confidence indicators
class ConfidenceTheme extends ThemeExtension<ConfidenceTheme> {
  const ConfidenceTheme({
    this.lowConfidenceColor = HealthcareColors.confidenceLow,
    this.mediumConfidenceColor = HealthcareColors.confidenceMedium,
    this.highConfidenceColor = HealthcareColors.confidenceHigh,
    this.confidenceTextStyle = HealthcareTypography.confidenceScore,
  });

  final Color lowConfidenceColor;
  final Color mediumConfidenceColor;
  final Color highConfidenceColor;
  final TextStyle confidenceTextStyle;

  @override
  ConfidenceTheme copyWith({
    Color? lowConfidenceColor,
    Color? mediumConfidenceColor,
    Color? highConfidenceColor,
    TextStyle? confidenceTextStyle,
  }) {
    return ConfidenceTheme(
      lowConfidenceColor: lowConfidenceColor ?? this.lowConfidenceColor,
      mediumConfidenceColor: mediumConfidenceColor ?? this.mediumConfidenceColor,
      highConfidenceColor: highConfidenceColor ?? this.highConfidenceColor,
      confidenceTextStyle: confidenceTextStyle ?? this.confidenceTextStyle,
    );
  }

  @override
  ConfidenceTheme lerp(ThemeExtension<ConfidenceTheme>? other, double t) {
    if (other is! ConfidenceTheme) {
      return this;
    }
    return ConfidenceTheme(
      lowConfidenceColor: Color.lerp(lowConfidenceColor, other.lowConfidenceColor, t)!,
      mediumConfidenceColor: Color.lerp(mediumConfidenceColor, other.mediumConfidenceColor, t)!,
      highConfidenceColor: Color.lerp(highConfidenceColor, other.highConfidenceColor, t)!,
      confidenceTextStyle: TextStyle.lerp(confidenceTextStyle, other.confidenceTextStyle, t)!,
    );
  }
  
  /// Get confidence color based on score
  Color getConfidenceColor(double score) {
    if (score <= 3.0) return lowConfidenceColor;
    if (score <= 6.0) return mediumConfidenceColor;
    return highConfidenceColor;
  }
  
  /// Get confidence description based on score
  String getConfidenceDescription(double score) {
    if (score <= 3.0) return 'Low Confidence';
    if (score <= 6.0) return 'Moderate Confidence';
    return 'High Confidence';
  }
}

/// Custom theme extension for medical safety elements
class MedicalSafetyTheme extends ThemeExtension<MedicalSafetyTheme> {
  const MedicalSafetyTheme({
    this.emergencyColor = HealthcareColors.emergencyRed,
    this.cautionColor = HealthcareColors.cautionOrange,
    this.safeColor = HealthcareColors.safeGreen,
    this.disclaimerTextStyle = HealthcareTypography.medicalDisclaimer,
    this.emergencyTextStyle = HealthcareTypography.emergencyText,
  });

  final Color emergencyColor;
  final Color cautionColor;
  final Color safeColor;
  final TextStyle disclaimerTextStyle;
  final TextStyle emergencyTextStyle;

  @override
  MedicalSafetyTheme copyWith({
    Color? emergencyColor,
    Color? cautionColor,
    Color? safeColor,
    TextStyle? disclaimerTextStyle,
    TextStyle? emergencyTextStyle,
  }) {
    return MedicalSafetyTheme(
      emergencyColor: emergencyColor ?? this.emergencyColor,
      cautionColor: cautionColor ?? this.cautionColor,
      safeColor: safeColor ?? this.safeColor,
      disclaimerTextStyle: disclaimerTextStyle ?? this.disclaimerTextStyle,
      emergencyTextStyle: emergencyTextStyle ?? this.emergencyTextStyle,
    );
  }

  @override
  MedicalSafetyTheme lerp(ThemeExtension<MedicalSafetyTheme>? other, double t) {
    if (other is! MedicalSafetyTheme) {
      return this;
    }
    return MedicalSafetyTheme(
      emergencyColor: Color.lerp(emergencyColor, other.emergencyColor, t)!,
      cautionColor: Color.lerp(cautionColor, other.cautionColor, t)!,
      safeColor: Color.lerp(safeColor, other.safeColor, t)!,
      disclaimerTextStyle: TextStyle.lerp(disclaimerTextStyle, other.disclaimerTextStyle, t)!,
      emergencyTextStyle: TextStyle.lerp(emergencyTextStyle, other.emergencyTextStyle, t)!,
    );
  }
}