import 'dart:io';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

/// Platform detection utilities for Serenya healthcare app
/// 
/// Provides platform-specific functionality detection including:
/// - iOS/Android platform identification
/// - Apple Sign-In availability checking
/// - Platform-specific feature detection
class PlatformUtils {
  /// Check if current platform is iOS
  static bool get isIOS => Platform.isIOS;
  
  /// Check if current platform is Android
  static bool get isAndroid => Platform.isAndroid;
  
  /// Check if current platform is macOS
  static bool get isMacOS => Platform.isMacOS;
  
  /// Check if current platform is Windows
  static bool get isWindows => Platform.isWindows;
  
  /// Check if current platform is Linux
  static bool get isLinux => Platform.isLinux;
  
  /// Check if current platform is Web
  static bool get isWeb => !Platform.isIOS && !Platform.isAndroid && !Platform.isMacOS && !Platform.isWindows && !Platform.isLinux;
  
  /// Check if Apple Sign-In should be available based on platform
  /// Apple Sign-In is only supported on iOS 13+ and macOS 10.15+
  static bool get supportsAppleSignIn => isIOS || isMacOS;
  
  /// Check if device actually supports Apple Sign-In
  /// This performs a runtime check to verify Apple Sign-In availability
  static Future<bool> isAppleSignInAvailable() async {
    if (!supportsAppleSignIn) return false;
    
    try {
      return await SignInWithApple.isAvailable();
    } catch (e) {
      // If there's any error checking availability, assume it's not available
      return false;
    }
  }
  
  /// Get platform name as string for logging and analytics
  static String get platformName {
    if (isIOS) return 'iOS';
    if (isAndroid) return 'Android';
    if (isMacOS) return 'macOS';
    if (isWindows) return 'Windows';
    if (isLinux) return 'Linux';
    return 'Web';
  }
  
  /// Check if platform supports biometric authentication
  /// This is a general check - actual availability should be verified with BiometricAuthService
  static bool get supportsBiometrics => isIOS || isAndroid;
  
  /// Check if platform supports secure hardware keystore
  static bool get supportsSecureKeystore => isIOS || isAndroid;
  
  /// Check if platform requires special handling for file storage
  static bool get requiresSpecialFileHandling => isIOS;
  
  /// Get platform-specific user agent suffix for API calls
  static String get userAgentSuffix {
    if (isIOS) return 'iOS';
    if (isAndroid) return 'Android';
    return 'Mobile';
  }
  
  /// Check if platform supports native authentication methods
  static bool get supportsNativeAuth => isIOS || isAndroid;
  
  /// Get minimum iOS version required for Apple Sign-In
  static String get minimumIOSVersionForAppleSignIn => '13.0';
  
  /// Get minimum macOS version required for Apple Sign-In
  static String get minimumMacOSVersionForAppleSignIn => '10.15';
  
  /// Check if current platform version meets minimum requirements for Apple Sign-In
  /// Note: This is a basic check. For production, you might want to parse actual OS versions
  static bool get meetsAppleSignInRequirements {
    // For our healthcare app, we assume modern OS versions
    // In production, you would parse Platform.operatingSystemVersion
    return supportsAppleSignIn;
  }
}