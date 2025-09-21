import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

/// SwipeBackWrapper provides global swipe-to-go-back navigation
/// 
/// This widget wraps screens that have back navigation, allowing users to
/// swipe from the left edge to navigate back while keeping the existing
/// back button as the primary navigation method.
/// 
/// Features:
/// - Right-to-left swipe detection from screen edge
/// - Configurable sensitivity and edge detection
/// - Haptic feedback on successful swipe
/// - Visual feedback during swipe gesture
/// - Respects existing navigation constraints
class SwipeBackWrapper extends StatefulWidget {
  final Widget child;
  final VoidCallback? onBackGesture;
  final bool enabled;
  final double edgeWidth;
  final double threshold;

  const SwipeBackWrapper({
    super.key,
    required this.child,
    this.onBackGesture,
    this.enabled = true,
    this.edgeWidth = 50.0,
    this.threshold = 100.0,
  });

  @override
  State<SwipeBackWrapper> createState() => _SwipeBackWrapperState();
}

class _SwipeBackWrapperState extends State<SwipeBackWrapper>
    with TickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _slideAnimation;
  
  bool _isSwipeInProgress = false;
  double _swipeProgress = 0.0;
  Offset? _swipeStartPosition;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    _slideAnimation = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(CurvedAnimation(
      parent: _animationController,
      curve: Curves.easeOut,
    ));
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  bool _isSwipeFromLeftEdge(Offset position) {
    return position.dx <= widget.edgeWidth;
  }

  void _handlePanStart(DragStartDetails details) {
    if (!widget.enabled) return;
    
    final position = details.globalPosition;
    if (_isSwipeFromLeftEdge(position)) {
      setState(() {
        _isSwipeInProgress = true;
        _swipeStartPosition = position;
        _swipeProgress = 0.0;
      });
    }
  }

  void _handlePanUpdate(DragUpdateDetails details) {
    if (!_isSwipeInProgress || _swipeStartPosition == null) return;
    
    final currentPosition = details.globalPosition;
    final deltaX = currentPosition.dx - _swipeStartPosition!.dx;
    
    // Only track rightward movement (positive deltaX)
    if (deltaX > 0) {
      setState(() {
        _swipeProgress = (deltaX / widget.threshold).clamp(0.0, 1.0);
      });
    }
  }

  void _handlePanEnd(DragEndDetails details) {
    if (!_isSwipeInProgress) return;
    
    setState(() {
      _isSwipeInProgress = false;
    });
    
    // Check if swipe threshold was reached
    if (_swipeProgress >= 1.0) {
      _triggerBackNavigation();
    } else {
      // Reset animation if threshold not reached
      _animationController.reverse().then((_) {
        if (mounted) {
          setState(() {
            _swipeProgress = 0.0;
          });
        }
      });
    }
    
    _swipeStartPosition = null;
  }

  void _triggerBackNavigation() {
    // Provide haptic feedback
    HapticFeedback.lightImpact();
    
    // Animate completion
    _animationController.forward().then((_) {
      if (mounted) {
        // Call custom callback or default navigation
        if (widget.onBackGesture != null) {
          widget.onBackGesture!();
        } else {
          // Try GoRouter first, fallback to Navigator
          try {
            if (context.canPop()) {
              context.pop();
            }
          } catch (e) {
            // Fallback to Navigator if GoRouter is not available
            if (Navigator.of(context).canPop()) {
              Navigator.of(context).pop();
            }
          }
        }
        
        // Reset state
        _animationController.reset();
        if (mounted) {
          setState(() {
            _swipeProgress = 0.0;
          });
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onPanStart: _handlePanStart,
      onPanUpdate: _handlePanUpdate,
      onPanEnd: _handlePanEnd,
      child: Stack(
        children: [
          // Main content with optional slide effect
          AnimatedBuilder(
            animation: _slideAnimation,
            builder: (context, child) {
              final slideOffset = _swipeProgress * 0.3; // Subtle slide effect
              return Transform.translate(
                offset: Offset(slideOffset * MediaQuery.of(context).size.width, 0),
                child: widget.child,
              );
            },
          ),
          
          // Visual feedback during swipe
          if (_isSwipeInProgress && _swipeProgress > 0)
            Positioned(
              left: 0,
              top: 0,
              bottom: 0,
              child: Container(
                width: _swipeProgress * 4, // Visual indicator width
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: [
                      Theme.of(context).primaryColor.withValues(alpha: 0.3),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),
          
          // Back arrow indicator when swipe is active
          if (_isSwipeInProgress && _swipeProgress > 0.3)
            Positioned(
              left: 20,
              top: MediaQuery.of(context).size.height / 2 - 12,
              child: AnimatedOpacity(
                opacity: (_swipeProgress - 0.3) / 0.7,
                duration: const Duration(milliseconds: 100),
                child: Icon(
                  Icons.arrow_back_ios,
                  color: Theme.of(context).primaryColor,
                  size: 24,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Convenience extension to easily wrap screens with swipe-back navigation
extension SwipeBackExtension on Widget {
  Widget withSwipeBack({
    VoidCallback? onBackGesture,
    bool enabled = true,
    double edgeWidth = 50.0,
    double threshold = 100.0,
  }) {
    return SwipeBackWrapper(
      onBackGesture: onBackGesture,
      enabled: enabled,
      edgeWidth: edgeWidth,
      threshold: threshold,
      child: this,
    );
  }
}