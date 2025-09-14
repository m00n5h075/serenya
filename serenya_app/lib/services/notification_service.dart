import 'package:flutter/material.dart';
import '../models/local_database_models.dart';

class NotificationService {
  static NotificationService? _instance;
  GlobalKey<ScaffoldMessengerState>? _scaffoldKey;

  NotificationService._internal();

  factory NotificationService() {
    _instance ??= NotificationService._internal();
    return _instance!;
  }

  void setScaffoldMessengerKey(GlobalKey<ScaffoldMessengerState> key) {
    _scaffoldKey = key;
  }

  Future<void> showResultsReadyNotification(SerenyaContent document) async {
    await _showInAppNotification(
      title: 'Results Ready',
      message: 'Your results have been analyzed',
      icon: Icons.check_circle,
      backgroundColor: Colors.green[50]!,
      borderColor: Colors.green[200]!,
      iconColor: Colors.green[600]!,
      textColor: Colors.green[800]!,
    );

    // TODO: Implement push notification for when user is out of app
    await _showPushNotification(
      title: 'Serenya Results Ready',
      body: 'Your health results have been analyzed. Tap to view.',
    );
  }

  Future<void> showProcessingErrorNotification(String errorMessage) async {
    await _showInAppNotification(
      title: 'Upload Failed',
      message: errorMessage,
      icon: Icons.error,
      backgroundColor: Colors.red[50]!,
      borderColor: Colors.red[200]!,
      iconColor: Colors.red[600]!,
      textColor: Colors.red[800]!,
    );

    // TODO: Implement push notification for when user is out of app
    await _showPushNotification(
      title: 'Serenya Upload Failed',
      body: 'Upload failed - please retry. $errorMessage',
    );
  }

  Future<void> showCommunicationErrorNotification() async {
    await _showInAppNotification(
      title: 'Connection Error',
      message: 'Unable to send file - check connection and retry',
      icon: Icons.wifi_off,
      backgroundColor: Colors.orange[50]!,
      borderColor: Colors.orange[200]!,
      iconColor: Colors.orange[600]!,
      textColor: Colors.orange[800]!,
    );

    // TODO: Implement push notification for when user is out of app
    await _showPushNotification(
      title: 'Serenya Connection Error',
      body: 'Unable to send file - check connection and retry',
    );
  }

  Future<void> _showInAppNotification({
    required String title,
    required String message,
    required IconData icon,
    required Color backgroundColor,
    required Color borderColor,
    required Color iconColor,
    required Color textColor,
  }) async {
    if (_scaffoldKey?.currentState == null) return;

    _scaffoldKey!.currentState!.showSnackBar(
      SnackBar(
        content: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: backgroundColor,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: borderColor),
          ),
          child: Row(
            children: [
              Icon(
                icon,
                color: iconColor,
                size: 24,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: textColor,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      message,
                      style: TextStyle(
                        fontSize: 13,
                        color: textColor.withOpacity(0.9),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 4),
        action: SnackBarAction(
          label: 'Dismiss',
          textColor: iconColor,
          onPressed: () {
            _scaffoldKey!.currentState!.hideCurrentSnackBar();
          },
        ),
      ),
    );
  }

  Future<void> _showPushNotification({
    required String title,
    required String body,
  }) async {
    // TODO: Implement actual push notifications
    // For now, this is a placeholder for when push notification service is set up
    print('Push Notification: $title - $body');
  }

  /// Show notification with default styling
  /// 
  /// Used by UnifiedPollingService and other services
  Future<void> showNotification({
    required String title,
    required String body,
  }) async {
    await _showInAppNotification(
      title: title,
      message: body,
      icon: Icons.info,
      backgroundColor: Colors.blue[50]!,
      borderColor: Colors.blue[200]!,
      iconColor: Colors.blue[600]!,
      textColor: Colors.blue[800]!,
    );
    
    await _showPushNotification(
      title: title,
      body: body,
    );
  }
}