import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenya_app/widgets/timeline/timeline_empty_state.dart';

void main() {
  group('TimelineEmptyState', () {
    testWidgets('displays empty state message and UI elements', (WidgetTester tester) async {
      // Build the widget
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: TimelineEmptyState(),
          ),
        ),
      );

      // Verify the title is displayed
      expect(find.text('Your Health Journey Starts Here'), findsOneWidget);
      
      // Verify the description is displayed
      expect(
        find.text('Upload your first lab results or medical document to get personalized insights from Serenya'), 
        findsOneWidget
      );
      
      // Verify the privacy message is displayed
      expect(find.text('Your health data stays on your device'), findsOneWidget);
      
      // Verify the medical icon is displayed
      expect(find.byIcon(Icons.favorite_border), findsOneWidget);
      
      // Verify the lock icon is displayed
      expect(find.byIcon(Icons.lock), findsOneWidget);
    });

    testWidgets('has proper layout structure', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: TimelineEmptyState(),
          ),
        ),
      );

      // Verify the main container structure exists
      expect(find.byType(Center), findsAtLeastNWidgets(1));
      expect(find.byType(Padding), findsAtLeastNWidgets(1));
      expect(find.byType(Column), findsAtLeastNWidgets(1));
      
      // Verify the circular medical icon container exists
      expect(find.byType(Container), findsAtLeastNWidgets(1));
    });
  });
}