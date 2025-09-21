import 'package:flutter/material.dart';

/// Enhanced Progress Dots for Healthcare Onboarding
/// 
/// Features:
/// - Smooth animations between slides
/// - Healthcare-appropriate color scheme
/// - Accessibility support with semantic labels
/// - Visual indication of slide names
class ProgressDots extends StatefulWidget {
  final int currentIndex;
  final int totalCount;
  final Color activeColor;
  final Color inactiveColor;
  final Color completedColor;
  final double dotSize;
  final double spacing;
  final List<String>? slideNames;

  const ProgressDots({
    super.key,
    required this.currentIndex,
    required this.totalCount,
    this.activeColor = const Color(0xFF2196F3), // Healthcare Blue
    this.inactiveColor = const Color(0xFFE0E0E0), // Light Grey
    this.completedColor = const Color(0xFF4CAF50), // Healthcare Green
    this.dotSize = 12.0,
    this.spacing = 16.0,
    this.slideNames,
  });

  @override
  State<ProgressDots> createState() => _ProgressDotsState();
}

class _ProgressDotsState extends State<ProgressDots> 
    with TickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(
      begin: 1.0,
      end: 1.2,
    ).animate(CurvedAnimation(
      parent: _animationController,
      curve: Curves.easeInOut,
    ));
  }

  @override
  void didUpdateWidget(ProgressDots oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.currentIndex != oldWidget.currentIndex) {
      _animationController.forward().then((_) {
        if (mounted) {
          _animationController.reverse();
        }
      });
    }
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final currentSlideName = widget.slideNames != null && 
                           widget.currentIndex < widget.slideNames!.length
        ? widget.slideNames![widget.currentIndex]
        : 'Step ${widget.currentIndex + 1}';

    return Semantics(
      label: '$currentSlideName, page ${widget.currentIndex + 1} of ${widget.totalCount}',
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(
          widget.totalCount,
          (index) => _buildProgressDot(index),
        ),
      ),
    );
  }

  Widget _buildProgressDot(int index) {
    final isActive = index == widget.currentIndex;
    final isCompleted = index < widget.currentIndex;
    final isAnimating = isActive && _animationController.isAnimating;

    Color dotColor;
    if (isCompleted) {
      dotColor = widget.completedColor;
    } else if (isActive) {
      dotColor = widget.activeColor;
    } else {
      dotColor = widget.inactiveColor;
    }

    return AnimatedBuilder(
      animation: _scaleAnimation,
      builder: (context, child) {
        final scale = isAnimating ? _scaleAnimation.value : 1.0;
        
        return Container(
          margin: EdgeInsets.symmetric(horizontal: widget.spacing / 2),
          child: Transform.scale(
            scale: scale,
            child: Container(
              width: widget.dotSize,
              height: widget.dotSize,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: dotColor,
                boxShadow: isActive ? [
                  BoxShadow(
                    color: dotColor.withValues(alpha: 0.3),
                    blurRadius: 4,
                    spreadRadius: 1,
                  ),
                ] : null,
              ),
              child: isCompleted 
                ? Icon(
                    Icons.check,
                    size: widget.dotSize * 0.6,
                    color: Colors.white,
                  )
                : null,
            ),
          ),
        );
      },
    );
  }
}