import 'package:flutter/material.dart';
import '../../core/constants/app_constants.dart';

/// Timeline Empty State Component
/// 
/// Displays "Your Health Journey Starts Here" message when no documents exist
/// Follows UI specifications for empty state design with warm, encouraging messaging
class TimelineEmptyState extends StatelessWidget {
  const TimelineEmptyState({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: EdgeInsets.all(AppConstants.largePadding),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min, // Allow column to shrink
          children: [
            // Medical illustration (warm, not clinical)
            Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                color: Colors.blue[50],
                borderRadius: BorderRadius.circular(60),
                border: Border.all(color: Colors.blue[100]!, width: 1),
              ),
              child: Icon(
                Icons.favorite_border,
                size: 64,
                color: Colors.blue[400],
              ),
            ),
            SizedBox(height: AppConstants.largePadding),
            
            // Title: "Your Health Journey Starts Here"
            Text(
              'Your Health Journey Starts Here',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.grey[800],
              ),
              textAlign: TextAlign.center,
            ),
            SizedBox(height: AppConstants.defaultPadding),
            
            // Description from UI specs
            Container(
              constraints: BoxConstraints(maxWidth: 280),
              child: Text(
                'Upload your first lab results or medical document to get personalized insights from Serenya',
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.grey[600],
                  height: 1.5,
                ),
                textAlign: TextAlign.center,
              ),
            ),
            SizedBox(height: AppConstants.largePadding),
            
            // Encouraging call-to-action
            Container(
              padding: EdgeInsets.symmetric(horizontal: 24, vertical: 16),
              decoration: BoxDecoration(
                color: Colors.green[50],
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.green[200]!),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.lock,
                    color: Colors.green[600],
                    size: 20,
                  ),
                  SizedBox(width: 12),
                  Text(
                    'Your health data stays on your device',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.green[800],
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}