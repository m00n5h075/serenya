import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Comprehensive Authentication Error Handler
/// 
/// Provides healthcare-compliant error handling with:
/// - Clear user messaging
/// - Recovery action guidance
/// - Network resilience handling
/// - Accessibility support
class AuthErrorHandler {
  static void showError(
    BuildContext context, {
    required String errorCode,
    required String userMessage,
    String? technicalDetails,
    VoidCallback? onRetry,
    VoidCallback? onSupport,
    VoidCallback? onSettings,
  }) {
    final errorInfo = _categorizeError(errorCode, userMessage);
    
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _AuthErrorWidget(
        errorInfo: errorInfo,
        technicalDetails: technicalDetails,
        onRetry: onRetry,
        onSupport: onSupport,
        onSettings: onSettings,
      ),
    );
  }

  static Map<String, dynamic> _categorizeError(String errorCode, String userMessage) {
    IconData icon;
    Color color;
    String recoveryGuidance;
    List<String> recoveryActions = [];

    switch (errorCode) {
      case 'NETWORK_ERROR':
        icon = Icons.wifi_off_rounded;
        color = Colors.orange[600]!;
        recoveryGuidance = 'Check your internet connection and try again';
        recoveryActions = ['Check WiFi or cellular connection', 'Try again in a moment'];
        break;
        
      case 'GOOGLE_AUTH_ERROR':
        icon = Icons.account_circle_outlined;
        color = Colors.red[600]!;
        recoveryGuidance = 'There was an issue signing in with Google';
        recoveryActions = ['Try signing in again', 'Check your Google account', 'Contact support if this continues'];
        break;
        
      case 'BIOMETRIC_ERROR':
        icon = Icons.fingerprint_outlined;
        color = Colors.purple[600]!;
        recoveryGuidance = 'Biometric authentication is required for secure access';
        recoveryActions = ['Enable biometric auth in device settings', 'Use device PIN as backup'];
        break;
        
      case 'MISSING_CONSENT':
        icon = Icons.gavel_outlined;
        color = Colors.blue[600]!;
        recoveryGuidance = 'Please accept all required terms to continue';
        recoveryActions = ['Review terms and privacy policy', 'Check both consent boxes'];
        break;
        
      case 'SERVER_ERROR':
        icon = Icons.cloud_off_outlined;
        color = Colors.red[700]!;
        recoveryGuidance = 'Our servers are experiencing issues';
        recoveryActions = ['Try again in a few minutes', 'Check our status page', 'Contact support'];
        break;
        
      default:
        icon = Icons.error_outline_rounded;
        color = Colors.grey[600]!;
        recoveryGuidance = 'Something unexpected happened';
        recoveryActions = ['Try again', 'Contact support'];
        break;
    }

    return {
      'icon': icon,
      'color': color,
      'recoveryGuidance': recoveryGuidance,
      'recoveryActions': recoveryActions,
      'errorCode': errorCode,
      'userMessage': userMessage,
    };
  }
}

class _AuthErrorWidget extends StatelessWidget {
  final Map<String, dynamic> errorInfo;
  final String? technicalDetails;
  final VoidCallback? onRetry;
  final VoidCallback? onSupport;
  final VoidCallback? onSettings;

  const _AuthErrorWidget({
    required this.errorInfo,
    this.technicalDetails,
    this.onRetry,
    this.onSupport,
    this.onSettings,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Handle bar
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 20),
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),

              // Error icon and message
              _buildErrorHeader(),
              
              const SizedBox(height: 24),
              
              // Recovery guidance
              _buildRecoverySection(),
              
              const SizedBox(height: 32),
              
              // Action buttons
              _buildActionButtons(context),
              
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildErrorHeader() {
    return Column(
      children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: (errorInfo['color'] as Color).withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(32),
          ),
          child: Icon(
            errorInfo['icon'] as IconData,
            size: 32,
            color: errorInfo['color'] as Color,
          ),
        ),
        
        const SizedBox(height: 16),
        
        Semantics(
          header: true,
          child: Text(
            'Authentication Issue',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w600,
              color: Colors.grey[800],
            ),
            textAlign: TextAlign.center,
          ),
        ),
        
        const SizedBox(height: 8),
        
        Text(
          errorInfo['userMessage'] as String,
          style: TextStyle(
            fontSize: 16,
            color: Colors.grey[600],
            height: 1.4,
          ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildRecoverySection() {
    final recoveryActions = errorInfo['recoveryActions'] as List<String>;
    
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[200]!),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.lightbulb_outline,
                size: 20,
                color: Colors.blue[600],
              ),
              const SizedBox(width: 8),
              Text(
                'What you can try:',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Colors.grey[800],
                ),
              ),
            ],
          ),
          
          const SizedBox(height: 12),
          
          ...recoveryActions.map((action) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 6,
                  height: 6,
                  margin: const EdgeInsets.only(top: 6, right: 12),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.blue[600],
                  ),
                ),
                Expanded(
                  child: Text(
                    action,
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[700],
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          )),
        ],
      ),
    );
  }

  Widget _buildActionButtons(BuildContext context) {
    final errorCode = errorInfo['errorCode'] as String;
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Primary action button
        ElevatedButton(
          onPressed: () {
            HapticFeedback.lightImpact();
            Navigator.pop(context);
            if (onRetry != null) onRetry!();
          },
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.blue[600],
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          child: const Text(
            'Try Again',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        
        const SizedBox(height: 12),
        
        // Secondary action based on error type
        if (errorCode == 'BIOMETRIC_ERROR') ...[
          OutlinedButton(
            onPressed: () {
              HapticFeedback.lightImpact();
              Navigator.pop(context);
              if (onSettings != null) onSettings!();
            },
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: const Text('Open Settings'),
          ),
        ] else ...[
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              if (onSupport != null) onSupport!();
            },
            child: const Text('Contact Support'),
          ),
        ],
      ],
    );
  }
}