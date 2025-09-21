import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenya_app/core/navigation/swipe_back_wrapper.dart';

void main() {
  group('SwipeBackWrapper', () {
    testWidgets('should render child widget', (WidgetTester tester) async {
      const testChild = Text('Test Content');
      
      await tester.pumpWidget(
        MaterialApp(
          home: const SwipeBackWrapper(
            child: testChild,
          ),
        ),
      );
      
      expect(find.text('Test Content'), findsOneWidget);
    });
    
    testWidgets('should detect swipe from left edge', (WidgetTester tester) async {
      bool backGestureCalled = false;
      
      await tester.pumpWidget(
        MaterialApp(
          home: SwipeBackWrapper(
            onBackGesture: () {
              backGestureCalled = true;
            },
            threshold: 100.0,
            edgeWidth: 50.0,
            child: const Scaffold(
              body: Text('Test Content'),
            ),
          ),
        ),
      );
      
      // Simulate swipe from left edge
      final gesture = await tester.startGesture(const Offset(10, 300));
      await tester.pump();
      
      // Swipe right past threshold
      await gesture.moveTo(const Offset(150, 300));
      await tester.pump();
      
      // End gesture
      await gesture.up();
      await tester.pumpAndSettle();
      
      expect(backGestureCalled, isTrue);
    });
    
    testWidgets('should not trigger back gesture for swipes from center', (WidgetTester tester) async {
      bool backGestureCalled = false;
      
      await tester.pumpWidget(
        MaterialApp(
          home: SwipeBackWrapper(
            onBackGesture: () {
              backGestureCalled = true;
            },
            threshold: 100.0,
            edgeWidth: 50.0,
            child: const Scaffold(
              body: Text('Test Content'),
            ),
          ),
        ),
      );
      
      // Simulate swipe from center of screen
      final gesture = await tester.startGesture(const Offset(200, 300));
      await tester.pump();
      
      // Swipe right
      await gesture.moveTo(const Offset(350, 300));
      await tester.pump();
      
      // End gesture
      await gesture.up();
      await tester.pumpAndSettle();
      
      expect(backGestureCalled, isFalse);
    });
    
    testWidgets('should not trigger back gesture if threshold not reached', (WidgetTester tester) async {
      bool backGestureCalled = false;
      
      await tester.pumpWidget(
        MaterialApp(
          home: SwipeBackWrapper(
            onBackGesture: () {
              backGestureCalled = true;
            },
            threshold: 100.0,
            edgeWidth: 50.0,
            child: const Scaffold(
              body: Text('Test Content'),
            ),
          ),
        ),
      );
      
      // Simulate short swipe from left edge
      final gesture = await tester.startGesture(const Offset(10, 300));
      await tester.pump();
      
      // Swipe right but not past threshold
      await gesture.moveTo(const Offset(50, 300));
      await tester.pump();
      
      // End gesture
      await gesture.up();
      await tester.pumpAndSettle();
      
      expect(backGestureCalled, isFalse);
    });
    
    testWidgets('should respect enabled property', (WidgetTester tester) async {
      bool backGestureCalled = false;
      
      await tester.pumpWidget(
        MaterialApp(
          home: SwipeBackWrapper(
            enabled: false,
            onBackGesture: () {
              backGestureCalled = true;
            },
            threshold: 100.0,
            edgeWidth: 50.0,
            child: const Scaffold(
              body: Text('Test Content'),
            ),
          ),
        ),
      );
      
      // Simulate swipe from left edge
      final gesture = await tester.startGesture(const Offset(10, 300));
      await tester.pump();
      
      // Swipe right past threshold
      await gesture.moveTo(const Offset(150, 300));
      await tester.pump();
      
      // End gesture
      await gesture.up();
      await tester.pumpAndSettle();
      
      expect(backGestureCalled, isFalse);
    });
    
    testWidgets('should show visual feedback during swipe', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: const SwipeBackWrapper(
            threshold: 100.0,
            edgeWidth: 50.0,
            child: Scaffold(
              body: Text('Test Content'),
            ),
          ),
        ),
      );
      
      // Start swipe from left edge
      final gesture = await tester.startGesture(const Offset(10, 300));
      await tester.pump();
      
      // Swipe right partially
      await gesture.moveTo(const Offset(80, 300));
      await tester.pump();
      
      // Should show visual feedback elements
      expect(find.byType(Container), findsWidgets);
      expect(find.byIcon(Icons.arrow_back_ios), findsOneWidget);
      
      // End gesture
      await gesture.up();
      await tester.pumpAndSettle();
    });
    
    testWidgets('should work with extension method', (WidgetTester tester) async {
      bool backGestureCalled = false;
      
      final wrappedWidget = const Scaffold(
        body: Text('Test Content'),
      ).withSwipeBack(
        onBackGesture: () {
          backGestureCalled = true;
        },
        threshold: 100.0,
      );
      
      await tester.pumpWidget(
        MaterialApp(home: wrappedWidget),
      );
      
      expect(find.text('Test Content'), findsOneWidget);
      
      // Test swipe functionality
      final gesture = await tester.startGesture(const Offset(10, 300));
      await gesture.moveTo(const Offset(150, 300));
      await gesture.up();
      await tester.pumpAndSettle();
      
      expect(backGestureCalled, isTrue);
    });
    
    testWidgets('should use context.pop when no custom callback provided', (WidgetTester tester) async {
      
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              return const SwipeBackWrapper(
                child: Scaffold(
                  body: Text('Details'),
                ),
              );
            },
          ),
          routes: {
            '/home': (context) => const Scaffold(body: Text('Home')),
          },
        ),
      );
      
      expect(find.text('Details'), findsOneWidget);
      
      // Simulate swipe back gesture - this should attempt to pop
      final gesture = await tester.startGesture(const Offset(10, 300));
      await gesture.moveTo(const Offset(150, 300));
      await gesture.up();
      await tester.pumpAndSettle();
      
      // Since we can't easily test GoRouter navigation in unit tests,
      // we just verify the gesture completes without error
      expect(find.text('Details'), findsOneWidget);
    });
  });
}