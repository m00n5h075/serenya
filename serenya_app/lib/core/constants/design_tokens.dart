import 'package:flutter/material.dart';

/// Healthcare-focused design tokens following UI specifications
/// Based on /guidance/docs/product/ui-specifications.md
class HealthcareColors {
  // Primary Serenya Colors
  static const Color serenyaBluePrimary = Color(0xFF2196F3);
  static const Color serenyaBlueLight = Color(0xFFE3F2FD);
  static const Color serenyaBlueDark = Color(0xFF1976D2);
  static const Color serenyaBlueAccent = Color(0xFF64B5F6);
  
  // Doctor Reports Theme (Green)
  static const Color serenyaGreenPrimary = Color(0xFF4CAF50);
  static const Color serenyaGreenLight = Color(0xFFE8F5E8);
  static const Color serenyaGreenDark = Color(0xFF388E3C);
  static const Color serenyaGreenAccent = Color(0xFF81C784);
  
  // Neutral Palette
  static const Color serenyaWhite = Color(0xFFFFFFFF);
  static const Color serenyaGray50 = Color(0xFFFAFAFA);
  static const Color serenyaGray100 = Color(0xFFF5F5F5);
  static const Color serenyaGray200 = Color(0xFFEEEEEE);
  static const Color serenyaGray300 = Color(0xFFE0E0E0);
  static const Color serenyaGray400 = Color(0xFFBDBDBD);
  static const Color serenyaGray500 = Color(0xFF9E9E9E);
  static const Color serenyaGray600 = Color(0xFF757575);
  static const Color serenyaGray700 = Color(0xFF616161);
  static const Color serenyaGray800 = Color(0xFF424242);
  static const Color serenyaGray900 = Color(0xFF212121);
  
  // Semantic Colors
  static const Color success = Color(0xFF4CAF50);
  static const Color successPrimary = Color(0xFF4CAF50); // Alias for success
  static const Color successLight = Color(0xFFE8F5E8);
  static const Color warning = Color(0xFFFF9800);
  static const Color error = Color(0xFFFF5252);
  static const Color info = Color(0xFF2196F3);
  static const Color infoPrimary = Color(0xFF2196F3); // Alias for info
  static const Color infoLight = Color(0xFFE3F2FD);
  
  // Confidence Scoring Colors (Traffic Light System)
  static const Color confidenceLow = Color(0xFFFF5252);      // Red
  static const Color confidenceMedium = Color(0xFFFF9800);   // Orange
  static const Color confidenceHigh = Color(0xFF4CAF50);     // Green
  
  // Medical Safety Colors
  static const Color emergencyRed = Color(0xFFD32F2F);
  static const Color cautionOrange = Color(0xFFFF6F00);
  static const Color safeGreen = Color(0xFF2E7D32);
  
  // Accessibility Colors (WCAG AA Compliant)
  static const Color textPrimary = Color(0xFF212121);
  static const Color textSecondary = Color(0xFF757575);
  static const Color textDisabled = Color(0xFFBDBDBD);
  
  // Background Colors
  static const Color backgroundPrimary = Color(0xFFFFFFFF);
  static const Color backgroundSecondary = Color(0xFFFAFAFA);
  static const Color backgroundTertiary = Color(0xFFF5F5F5);
  
  // Card and Surface Colors
  static const Color surfaceElevated = Color(0xFFFFFFFF);
  static const Color surfaceCard = Color(0xFFF8F9FA);
  static const Color surfaceBorder = Color(0xFFE0E0E0);
  static const Color borderColor = Color(0xFFE0E0E0); // Alias for surfaceBorder
}

class HealthcareTypography {
  // Font Family
  static const String primaryFont = 'Inter';
  static const String fallbackFont = 'System';
  
  // Heading Styles
  static const TextStyle headingH1 = TextStyle(
    fontFamily: primaryFont,
    fontSize: 28,
    height: 1.2,
    fontWeight: FontWeight.w600,
    color: HealthcareColors.textPrimary,
  );
  
  static const TextStyle headingH2 = TextStyle(
    fontFamily: primaryFont,
    fontSize: 24,
    height: 1.25,
    fontWeight: FontWeight.w600,
    color: HealthcareColors.textPrimary,
  );
  
  static const TextStyle headingH3 = TextStyle(
    fontFamily: primaryFont,
    fontSize: 20,
    height: 1.3,
    fontWeight: FontWeight.w600,
    color: HealthcareColors.textPrimary,
  );
  
  static const TextStyle headingH4 = TextStyle(
    fontFamily: primaryFont,
    fontSize: 18,
    height: 1.35,
    fontWeight: FontWeight.w500,
    color: HealthcareColors.textPrimary,
  );
  
  // Body Text Styles
  static const TextStyle bodyLarge = TextStyle(
    fontFamily: primaryFont,
    fontSize: 16,
    height: 1.5,
    fontWeight: FontWeight.w400,
    color: HealthcareColors.textPrimary,
  );
  
  static const TextStyle bodyMedium = TextStyle(
    fontFamily: primaryFont,
    fontSize: 14,
    height: 1.43,
    fontWeight: FontWeight.w400,
    color: HealthcareColors.textPrimary,
  );
  
  static const TextStyle bodySmall = TextStyle(
    fontFamily: primaryFont,
    fontSize: 12,
    height: 1.33,
    fontWeight: FontWeight.w400,
    color: HealthcareColors.textSecondary,
  );
  
  // Label Styles
  static const TextStyle labelLarge = TextStyle(
    fontFamily: primaryFont,
    fontSize: 14,
    height: 1.43,
    fontWeight: FontWeight.w500,
    color: HealthcareColors.textPrimary,
  );
  
  static const TextStyle labelMedium = TextStyle(
    fontFamily: primaryFont,
    fontSize: 12,
    height: 1.33,
    fontWeight: FontWeight.w500,
    color: HealthcareColors.textPrimary,
  );
  
  static const TextStyle labelSmall = TextStyle(
    fontFamily: primaryFont,
    fontSize: 11,
    height: 1.45,
    fontWeight: FontWeight.w500,
    color: HealthcareColors.textSecondary,
  );
  
  // Medical-Specific Styles
  static const TextStyle medicalDisclaimer = TextStyle(
    fontFamily: primaryFont,
    fontSize: 12,
    height: 1.5,
    fontWeight: FontWeight.w400,
    color: HealthcareColors.textSecondary,
    fontStyle: FontStyle.italic,
  );
  
  static const TextStyle confidenceScore = TextStyle(
    fontFamily: primaryFont,
    fontSize: 14,
    height: 1.0,
    fontWeight: FontWeight.w600,
    color: HealthcareColors.textPrimary,
  );
  
  static const TextStyle emergencyText = TextStyle(
    fontFamily: primaryFont,
    fontSize: 14,
    height: 1.43,
    fontWeight: FontWeight.w600,
    color: HealthcareColors.emergencyRed,
  );
}

class HealthcareSpacing {
  // Base spacing unit (8px system)
  static const double base = 8.0;
  
  // Spacing scale
  static const double xs = base * 0.5;    // 4px
  static const double sm = base;          // 8px
  static const double md = base * 2;      // 16px
  static const double lg = base * 3;      // 24px
  static const double xl = base * 4;      // 32px
  static const double xxl = base * 6;     // 48px
  static const double xxxl = base * 8;    // 64px
  
  // Component-specific spacing
  static const double cardPadding = md;
  static const double sectionSpacing = lg;
  static const double pageMargin = md;
  
  // Healthcare-specific spacing
  static const double medicalContentSpacing = lg;
  static const double disclaimerSpacing = sm;
  static const double confidenceIndicatorSpacing = sm;
}

class HealthcareBorderRadius {
  // Border radius scale
  static const double xs = 4.0;
  static const double sm = 8.0;
  static const double md = 12.0;
  static const double lg = 16.0;
  static const double xl = 20.0;
  static const double xxl = 24.0;
  
  // Component-specific radius
  static const double card = md;
  static const double button = sm;
  static const double input = sm;
  static const double modal = lg;
  
  // Medical component radius
  static const double resultCard = md;
  static const double confidenceIndicator = xs;
  static const double uploadButton = xxl; // Circular FAB
}

class HealthcareShadows {
  // Elevation shadows following Material Design
  static const List<BoxShadow> elevation1 = [
    BoxShadow(
      color: Color(0x1F000000),
      offset: Offset(0, 1),
      blurRadius: 3,
      spreadRadius: 0,
    ),
  ];
  
  static const List<BoxShadow> elevation2 = [
    BoxShadow(
      color: Color(0x1F000000),
      offset: Offset(0, 1),
      blurRadius: 5,
      spreadRadius: 0,
    ),
    BoxShadow(
      color: Color(0x14000000),
      offset: Offset(0, 2),
      blurRadius: 2,
      spreadRadius: 0,
    ),
  ];
  
  static const List<BoxShadow> elevation3 = [
    BoxShadow(
      color: Color(0x1F000000),
      offset: Offset(0, 1),
      blurRadius: 8,
      spreadRadius: 0,
    ),
    BoxShadow(
      color: Color(0x14000000),
      offset: Offset(0, 3),
      blurRadius: 4,
      spreadRadius: 0,
    ),
  ];
  
  // Medical-specific shadows
  static const List<BoxShadow> cardShadow = elevation1;
  static const List<BoxShadow> modalShadow = elevation3;
  static const List<BoxShadow> fabShadow = elevation2;
}

class HealthcareDurations {
  // Animation durations
  static const Duration fast = Duration(milliseconds: 150);
  static const Duration medium = Duration(milliseconds: 250);
  static const Duration slow = Duration(milliseconds: 350);
  
  // Interaction durations
  static const Duration buttonPress = Duration(milliseconds: 100);
  static const Duration pageTransition = Duration(milliseconds: 300);
  static const Duration modalTransition = Duration(milliseconds: 250);
  
  // Medical-specific durations
  static const Duration uploadProgress = Duration(milliseconds: 100);
  static const Duration confidenceAnimation = Duration(milliseconds: 400);
  static const Duration loadingSpinner = Duration(milliseconds: 1200);
}

class HealthcareAccessibility {
  // Minimum touch target sizes (healthcare standard)
  static const double minTouchTarget = 48.0;
  static const double preferredTouchTarget = 56.0;
  
  // Text size multipliers for accessibility
  static const double smallTextMultiplier = 0.875;
  static const double normalTextMultiplier = 1.0;
  static const double largeTextMultiplier = 1.125;
  static const double xLargeTextMultiplier = 1.25;
  
  // Contrast ratios (WCAG AA compliant)
  static const double minimumContrast = 4.5;
  static const double enhancedContrast = 7.0;
  
  // Focus ring configuration
  static const double focusRingWidth = 2.0;
  static const Color focusRingColor = HealthcareColors.serenyaBluePrimary;
}