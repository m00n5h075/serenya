class AppConstants {
  // App Information
  static const String appName = 'Serenya';
  static const String appVersion = '1.0.0';
  static const String appDescription = 'AI Health Agent for medical document interpretation';

  // API Configuration
  static const String baseApiUrl = 'https://bpzha55z9e.execute-api.eu-west-1.amazonaws.com/dev';
  static const String processingEndpoint = '/api/v1/process';
  static const String authEndpoint = '/auth';
  
  // File Upload Limits
  static const int maxFileSizeBytes = 5 * 1024 * 1024; // 5MB
  static const List<String> supportedFileTypes = ['pdf', 'jpg', 'jpeg', 'png'];
  
  // Processing Configuration
  static const int processingTimeoutMinutes = 3;
  static const int maxRetryAttempts = 3;
  static const List<int> retryDelaySeconds = [30, 120, 300]; // 30s, 2m, 5m
  
  // AI Confidence Scoring
  static const double lowConfidenceThreshold = 3.0;
  static const double moderateConfidenceThreshold = 6.0;
  static const double highConfidenceThreshold = 7.0;
  
  // Security
  static const int sessionTimeoutMinutes = 60;
  static const String jwtSecretKey = 'serenya_jwt_secret';
  
  // Medical Safety
  static const String medicalDisclaimerText = 
    'This interpretation is for informational purposes only and is not medical advice. '
    'Always consult with a qualified healthcare provider for medical decisions.';
    
  static const String emergencyCareDisclaimer = 
    'If you are experiencing a medical emergency, call emergency services immediately. '
    'This app is not intended for emergency medical situations.';
  
  // Premium Features
  static const String premiumReportTitle = 'Medical Report for Healthcare Provider';
  static const double premiumMonthlyPrice = 9.99;
  
  // Storage Keys
  static const String onboardingCompleteKey = 'onboarding_complete';
  static const String userTokenKey = 'user_jwt_token';
  static const String userPreferencesKey = 'user_preferences';
  static const String biometricEnabledKey = 'biometric_enabled';
  
  // UI Constants
  static const double defaultPadding = 16.0;
  static const double largePadding = 24.0;
  static const double smallPadding = 8.0;
  static const double borderRadius = 12.0;
  
  // Animation Durations
  static const Duration shortAnimation = Duration(milliseconds: 200);
  static const Duration mediumAnimation = Duration(milliseconds: 400);
  static const Duration longAnimation = Duration(milliseconds: 600);
}

class DatabaseConstants {
  static const String healthDocumentsTable = 'health_documents';
  static const String interpretationsTable = 'interpretations';
  static const String userPreferencesTable = 'user_preferences';
  static const String consentRecordsTable = 'consent_records';
}

class ApiConstants {
  static const Map<String, String> defaultHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  
  static const int connectTimeoutSeconds = 30;
  static const int receiveTimeoutSeconds = 180; // 3 minutes for processing
}