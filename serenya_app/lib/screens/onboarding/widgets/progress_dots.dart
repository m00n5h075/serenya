import 'package:flutter/material.dart';

class ProgressDots extends StatelessWidget {
  final int currentIndex;
  final int totalCount;
  final Color activeColor;
  final Color inactiveColor;
  final double dotSize;
  final double spacing;

  const ProgressDots({
    Key? key,
    required this.currentIndex,
    required this.totalCount,
    this.activeColor = const Color(0xFF1976D2), // Blue[600]
    this.inactiveColor = const Color(0xFFE0E0E0), // Grey[300]
    this.dotSize = 8.0,
    this.spacing = 8.0,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Page ${currentIndex + 1} of $totalCount',
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(
          totalCount,
          (index) => Container(
            margin: EdgeInsets.symmetric(horizontal: spacing / 2),
            width: dotSize,
            height: dotSize,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: index == currentIndex ? activeColor : inactiveColor,
            ),
          ),
        ),
      ),
    );
  }
}