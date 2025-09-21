import 'package:flutter/material.dart';
import '../core/constants/design_tokens.dart';

/// Serenya-branded spinner with pulsing animation and color transitions
/// 
/// Features:
/// - Smooth pulsing scale animation
/// - Color transition from Serenya blue to green
/// - Consistent with brand design tokens
/// - Configurable size and animation speed
/// - Maintains circular progress indicator functionality
class SerenyaSpinner extends StatefulWidget {
  final double size;
  final double strokeWidth;
  final Duration animationDuration;
  final bool enableColorTransition;

  const SerenyaSpinner({
    super.key,
    this.size = 24.0,
    this.strokeWidth = 2.0,
    this.animationDuration = const Duration(milliseconds: 1200),
    this.enableColorTransition = true,
  });

  @override
  State<SerenyaSpinner> createState() => _SerenyaSpinnerState();
}

class _SerenyaSpinnerState extends State<SerenyaSpinner>
    with TickerProviderStateMixin {
  late AnimationController _pulseController;
  late AnimationController _colorController;
  late Animation<double> _pulseAnimation;
  late Animation<Color?> _colorAnimation;

  @override
  void initState() {
    super.initState();
    
    // Pulse animation (scale)
    _pulseController = AnimationController(
      duration: widget.animationDuration,
      vsync: this,
    );
    
    _pulseAnimation = Tween<double>(
      begin: 0.8,
      end: 1.0,
    ).animate(CurvedAnimation(
      parent: _pulseController,
      curve: Curves.easeInOut,
    ));

    // Color transition animation
    _colorController = AnimationController(
      duration: Duration(milliseconds: widget.animationDuration.inMilliseconds * 2),
      vsync: this,
    );
    
    _colorAnimation = ColorTween(
      begin: HealthcareColors.serenyaBluePrimary,
      end: HealthcareColors.serenyaGreenPrimary,
    ).animate(CurvedAnimation(
      parent: _colorController,
      curve: Curves.easeInOut,
    ));

    // Start animations
    _pulseController.repeat(reverse: true);
    if (widget.enableColorTransition) {
      _colorController.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _colorController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([_pulseAnimation, _colorAnimation]),
      builder: (context, child) {
        return Transform.scale(
          scale: _pulseAnimation.value,
          child: SizedBox(
            width: widget.size,
            height: widget.size,
            child: CircularProgressIndicator(
              strokeWidth: widget.strokeWidth,
              valueColor: AlwaysStoppedAnimation<Color>(
                widget.enableColorTransition
                    ? _colorAnimation.value ?? HealthcareColors.serenyaBluePrimary
                    : HealthcareColors.serenyaBluePrimary,
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Compact Serenya spinner for small spaces (buttons, cards)
class SerenyaSpinnerSmall extends StatelessWidget {
  const SerenyaSpinnerSmall({super.key});

  @override
  Widget build(BuildContext context) {
    return const SerenyaSpinner(
      size: 16.0,
      strokeWidth: 1.5,
      enableColorTransition: false, // Keep simple for small sizes
    );
  }
}

/// Medium Serenya spinner for general loading states
class SerenyaSpinnerMedium extends StatelessWidget {
  const SerenyaSpinnerMedium({super.key});

  @override
  Widget build(BuildContext context) {
    return const SerenyaSpinner(
      size: 24.0,
      strokeWidth: 2.0,
      enableColorTransition: true,
    );
  }
}

/// Large Serenya spinner for page-level loading
class SerenyaSpinnerLarge extends StatelessWidget {
  const SerenyaSpinnerLarge({super.key});

  @override
  Widget build(BuildContext context) {
    return const SerenyaSpinner(
      size: 32.0,
      strokeWidth: 3.0,
      enableColorTransition: true,
      animationDuration: Duration(milliseconds: 1500),
    );
  }
}

/// Static versions without animation for contexts where animation might be distracting
class SerenyaSpinnerStatic extends StatelessWidget {
  final double size;
  final double strokeWidth;
  final Color? color;

  const SerenyaSpinnerStatic({
    super.key,
    this.size = 24.0,
    this.strokeWidth = 2.0,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CircularProgressIndicator(
        strokeWidth: strokeWidth,
        valueColor: AlwaysStoppedAnimation<Color>(
          color ?? HealthcareColors.serenyaBluePrimary,
        ),
      ),
    );
  }
}

/// Convenience extension to easily replace existing CircularProgressIndicator
extension CircularProgressIndicatorReplacement on Widget {
  /// Replace with Serenya-branded spinner
  static Widget serenya({
    double size = 24.0,
    double strokeWidth = 2.0,
    bool enableColorTransition = true,
  }) {
    return SerenyaSpinner(
      size: size,
      strokeWidth: strokeWidth,
      enableColorTransition: enableColorTransition,
    );
  }
}