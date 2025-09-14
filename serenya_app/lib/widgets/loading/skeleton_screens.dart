import 'package:flutter/material.dart';
import '../../core/constants/design_tokens.dart';

/// Skeleton loading screens for healthcare application
/// 
/// Provides placeholder UI during content loading with:
/// - Smooth shimmer animations
/// - Content-specific skeleton layouts
/// - Accessibility support
/// - Healthcare design system compliance

class SkeletonLoader extends StatefulWidget {
  final Widget child;
  final bool isLoading;
  final Color? baseColor;
  final Color? highlightColor;
  final Duration animationDuration;

  const SkeletonLoader({
    Key? key,
    required this.child,
    required this.isLoading,
    this.baseColor,
    this.highlightColor,
    this.animationDuration = const Duration(milliseconds: 1000),
  }) : super(key: key);

  @override
  State<SkeletonLoader> createState() => _SkeletonLoaderState();
}

class _SkeletonLoaderState extends State<SkeletonLoader>
    with SingleTickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: widget.animationDuration,
      vsync: this,
    );
    _animation = Tween<double>(
      begin: -1.0,
      end: 2.0,
    ).animate(CurvedAnimation(
      parent: _animationController,
      curve: Curves.easeInOutSine,
    ));
    
    if (widget.isLoading) {
      _animationController.repeat();
    }
  }

  @override
  void didUpdateWidget(SkeletonLoader oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isLoading != oldWidget.isLoading) {
      if (widget.isLoading) {
        _animationController.repeat();
      } else {
        _animationController.stop();
      }
    }
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isLoading) {
      return widget.child;
    }

    final baseColor = widget.baseColor ?? 
        HealthcareColors.backgroundTertiary;
    final highlightColor = widget.highlightColor ?? 
        HealthcareColors.serenyaWhite.withOpacity(0.8);

    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) {
        return ShaderMask(
          shaderCallback: (bounds) {
            return LinearGradient(
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
              colors: [
                baseColor,
                highlightColor,
                baseColor,
              ],
              stops: [
                _animation.value - 0.3,
                _animation.value,
                _animation.value + 0.3,
              ].map((stop) => stop.clamp(0.0, 1.0)).toList(),
            ).createShader(bounds);
          },
          blendMode: BlendMode.srcATop,
          child: widget.child,
        );
      },
    );
  }
}

/// Timeline/Document list skeleton
class TimelineSkeletonScreen extends StatelessWidget {
  final int itemCount;
  final bool showHeader;

  const TimelineSkeletonScreen({
    Key? key,
    this.itemCount = 5,
    this.showHeader = true,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Loading your health timeline',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (showHeader) ...[
            _buildHeaderSkeleton(),
            const SizedBox(height: HealthcareSpacing.lg),
          ],
          Expanded(
            child: ListView.separated(
              itemCount: itemCount,
              separatorBuilder: (context, index) => 
                  const SizedBox(height: HealthcareSpacing.md),
              itemBuilder: (context, index) => _buildTimelineItemSkeleton(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeaderSkeleton() {
    return SkeletonLoader(
      isLoading: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 32,
            width: 200,
            decoration: BoxDecoration(
              color: HealthcareColors.backgroundTertiary,
              borderRadius: BorderRadius.circular(HealthcareBorderRadius.sm),
            ),
          ),
          const SizedBox(height: HealthcareSpacing.sm),
          Container(
            height: 16,
            width: 150,
            decoration: BoxDecoration(
              color: HealthcareColors.backgroundTertiary,
              borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTimelineItemSkeleton() {
    return SkeletonLoader(
      isLoading: true,
      child: Container(
        padding: const EdgeInsets.all(HealthcareSpacing.md),
        decoration: BoxDecoration(
          color: HealthcareColors.surfaceCard,
          borderRadius: BorderRadius.circular(HealthcareBorderRadius.card),
          border: Border.all(color: HealthcareColors.surfaceBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: HealthcareColors.backgroundTertiary,
                    borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
                  ),
                ),
                const SizedBox(width: HealthcareSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        height: 16,
                        width: double.infinity,
                        decoration: BoxDecoration(
                          color: HealthcareColors.backgroundTertiary,
                          borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Container(
                        height: 12,
                        width: 100,
                        decoration: BoxDecoration(
                          color: HealthcareColors.backgroundTertiary,
                          borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  width: 60,
                  height: 20,
                  decoration: BoxDecoration(
                    color: HealthcareColors.backgroundTertiary,
                    borderRadius: BorderRadius.circular(HealthcareBorderRadius.sm),
                  ),
                ),
              ],
            ),
            const SizedBox(height: HealthcareSpacing.sm),
            Row(
              children: [
                Container(
                  height: 12,
                  width: 80,
                  decoration: BoxDecoration(
                    color: HealthcareColors.backgroundTertiary,
                    borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
                  ),
                ),
                const Spacer(),
                Container(
                  height: 20,
                  width: 80,
                  decoration: BoxDecoration(
                    color: HealthcareColors.backgroundTertiary,
                    borderRadius: BorderRadius.circular(HealthcareBorderRadius.sm),
                  ),
                ),
              ],
            ),
            const SizedBox(height: HealthcareSpacing.sm),
            Container(
              height: 40,
              width: double.infinity,
              decoration: BoxDecoration(
                color: HealthcareColors.backgroundTertiary,
                borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Results detail skeleton
class ResultsSkeletonScreen extends StatelessWidget {
  final bool showSummary;
  final bool showMetrics;

  const ResultsSkeletonScreen({
    Key? key,
    this.showSummary = true,
    this.showMetrics = true,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Loading your health results',
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(HealthcareSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHeaderSkeleton(),
            if (showSummary) ...[
              const SizedBox(height: HealthcareSpacing.xl),
              _buildSummarySkeleton(),
            ],
            if (showMetrics) ...[
              const SizedBox(height: HealthcareSpacing.xl),
              _buildMetricsSkeleton(),
            ],
            const SizedBox(height: HealthcareSpacing.xl),
            _buildDetailsSkeleton(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeaderSkeleton() {
    return SkeletonLoader(
      isLoading: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 28,
            width: 250,
            decoration: BoxDecoration(
              color: HealthcareColors.backgroundTertiary,
              borderRadius: BorderRadius.circular(HealthcareBorderRadius.sm),
            ),
          ),
          const SizedBox(height: HealthcareSpacing.sm),
          Container(
            height: 16,
            width: 120,
            decoration: BoxDecoration(
              color: HealthcareColors.backgroundTertiary,
              borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
            ),
          ),
          const SizedBox(height: HealthcareSpacing.md),
          Row(
            children: [
              Container(
                height: 24,
                width: 100,
                decoration: BoxDecoration(
                  color: HealthcareColors.backgroundTertiary,
                  borderRadius: BorderRadius.circular(HealthcareBorderRadius.sm),
                ),
              ),
              const SizedBox(width: HealthcareSpacing.md),
              Container(
                height: 24,
                width: 80,
                decoration: BoxDecoration(
                  color: HealthcareColors.backgroundTertiary,
                  borderRadius: BorderRadius.circular(HealthcareBorderRadius.sm),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSummarySkeleton() {
    return SkeletonLoader(
      isLoading: true,
      child: Container(
        padding: const EdgeInsets.all(HealthcareSpacing.lg),
        decoration: BoxDecoration(
          color: HealthcareColors.surfaceCard,
          borderRadius: BorderRadius.circular(HealthcareBorderRadius.card),
          border: Border.all(color: HealthcareColors.surfaceBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 20,
              width: 150,
              decoration: BoxDecoration(
                color: HealthcareColors.backgroundTertiary,
                borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
              ),
            ),
            const SizedBox(height: HealthcareSpacing.md),
            ...List.generate(
              4,
              (index) => Padding(
                padding: const EdgeInsets.only(bottom: HealthcareSpacing.sm),
                child: Container(
                  height: 16,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: HealthcareColors.backgroundTertiary,
                    borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
                  ),
                ),
              ),
            ),
            Container(
              height: 16,
              width: 200,
              decoration: BoxDecoration(
                color: HealthcareColors.backgroundTertiary,
                borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMetricsSkeleton() {
    return SkeletonLoader(
      isLoading: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 20,
            width: 120,
            decoration: BoxDecoration(
              color: HealthcareColors.backgroundTertiary,
              borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
            ),
          ),
          const SizedBox(height: HealthcareSpacing.md),
          Row(
            children: List.generate(
              3,
              (index) => Expanded(
                child: Container(
                  margin: EdgeInsets.only(
                    right: index < 2 ? HealthcareSpacing.sm : 0,
                  ),
                  padding: const EdgeInsets.all(HealthcareSpacing.md),
                  decoration: BoxDecoration(
                    color: HealthcareColors.surfaceCard,
                    borderRadius: BorderRadius.circular(HealthcareBorderRadius.card),
                    border: Border.all(color: HealthcareColors.surfaceBorder),
                  ),
                  child: Column(
                    children: [
                      Container(
                        height: 40,
                        width: 40,
                        decoration: const BoxDecoration(
                          color: HealthcareColors.backgroundTertiary,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(height: HealthcareSpacing.sm),
                      Container(
                        height: 24,
                        width: 60,
                        decoration: BoxDecoration(
                          color: HealthcareColors.backgroundTertiary,
                          borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
                        ),
                      ),
                      const SizedBox(height: HealthcareSpacing.xs),
                      Container(
                        height: 14,
                        width: 80,
                        decoration: BoxDecoration(
                          color: HealthcareColors.backgroundTertiary,
                          borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailsSkeleton() {
    return SkeletonLoader(
      isLoading: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 20,
            width: 160,
            decoration: BoxDecoration(
              color: HealthcareColors.backgroundTertiary,
              borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
            ),
          ),
          const SizedBox(height: HealthcareSpacing.md),
          ...List.generate(
            6,
            (index) => Padding(
              padding: const EdgeInsets.only(bottom: HealthcareSpacing.md),
              child: Container(
                padding: const EdgeInsets.all(HealthcareSpacing.md),
                decoration: BoxDecoration(
                  color: HealthcareColors.surfaceCard,
                  borderRadius: BorderRadius.circular(HealthcareBorderRadius.card),
                  border: Border.all(color: HealthcareColors.surfaceBorder),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 100,
                      height: 16,
                      decoration: BoxDecoration(
                        color: HealthcareColors.backgroundTertiary,
                        borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
                      ),
                    ),
                    const SizedBox(width: HealthcareSpacing.md),
                    Expanded(
                      child: Container(
                        height: 16,
                        decoration: BoxDecoration(
                          color: HealthcareColors.backgroundTertiary,
                          borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
                        ),
                      ),
                    ),
                    const SizedBox(width: HealthcareSpacing.md),
                    Container(
                      width: 60,
                      height: 16,
                      decoration: BoxDecoration(
                        color: HealthcareColors.backgroundTertiary,
                        borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Chat interface skeleton
class ChatSkeletonScreen extends StatelessWidget {
  final int messageCount;

  const ChatSkeletonScreen({
    Key? key,
    this.messageCount = 5,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Loading chat interface',
      child: Column(
        children: [
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(HealthcareSpacing.md),
              itemCount: messageCount,
              itemBuilder: (context, index) {
                final isUser = index % 2 == 0;
                return _buildMessageSkeleton(isUser: isUser);
              },
            ),
          ),
          _buildInputSkeleton(),
        ],
      ),
    );
  }

  Widget _buildMessageSkeleton({required bool isUser}) {
    return SkeletonLoader(
      isLoading: true,
      child: Padding(
        padding: const EdgeInsets.only(bottom: HealthcareSpacing.md),
        child: Row(
          mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
          children: [
            if (!isUser) ...[
              Container(
                width: 32,
                height: 32,
                decoration: const BoxDecoration(
                  color: HealthcareColors.backgroundTertiary,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: HealthcareSpacing.sm),
            ],
            Container(
              constraints: const BoxConstraints(
                maxWidth: 250, // Fixed width instead of context-dependent
              ),
              padding: const EdgeInsets.all(HealthcareSpacing.md),
              decoration: BoxDecoration(
                color: HealthcareColors.backgroundTertiary,
                borderRadius: BorderRadius.circular(HealthcareBorderRadius.lg),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    height: 16,
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: HealthcareColors.backgroundSecondary,
                      borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
                    ),
                  ),
                  const SizedBox(height: HealthcareSpacing.xs),
                  Container(
                    height: 16,
                    width: 120,
                    decoration: BoxDecoration(
                      color: HealthcareColors.backgroundSecondary,
                      borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
                    ),
                  ),
                ],
              ),
            ),
            if (isUser) ...[
              const SizedBox(width: HealthcareSpacing.sm),
              Container(
                width: 32,
                height: 32,
                decoration: const BoxDecoration(
                  color: HealthcareColors.backgroundTertiary,
                  shape: BoxShape.circle,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildInputSkeleton() {
    return SkeletonLoader(
      isLoading: true,
      child: Container(
        padding: const EdgeInsets.all(HealthcareSpacing.md),
        decoration: const BoxDecoration(
          color: HealthcareColors.surfaceCard,
          border: Border(
            top: BorderSide(color: HealthcareColors.surfaceBorder),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Container(
                height: 48,
                decoration: BoxDecoration(
                  color: HealthcareColors.backgroundTertiary,
                  borderRadius: BorderRadius.circular(HealthcareBorderRadius.lg),
                ),
              ),
            ),
            const SizedBox(width: HealthcareSpacing.sm),
            Container(
              width: 48,
              height: 48,
              decoration: const BoxDecoration(
                color: HealthcareColors.backgroundTertiary,
                shape: BoxShape.circle,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Generic content skeleton for lists
class ListSkeletonScreen extends StatelessWidget {
  final int itemCount;
  final Widget Function(BuildContext, int)? itemBuilder;

  const ListSkeletonScreen({
    Key? key,
    this.itemCount = 10,
    this.itemBuilder,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      itemCount: itemCount,
      separatorBuilder: (context, index) => 
          const SizedBox(height: HealthcareSpacing.sm),
      itemBuilder: itemBuilder ?? _defaultItemBuilder,
    );
  }

  Widget _defaultItemBuilder(BuildContext context, int index) {
    return SkeletonLoader(
      isLoading: true,
      child: Container(
        height: 80,
        margin: const EdgeInsets.symmetric(horizontal: HealthcareSpacing.md),
        padding: const EdgeInsets.all(HealthcareSpacing.md),
        decoration: BoxDecoration(
          color: HealthcareColors.surfaceCard,
          borderRadius: BorderRadius.circular(HealthcareBorderRadius.card),
          border: Border.all(color: HealthcareColors.surfaceBorder),
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: HealthcareColors.backgroundTertiary,
                borderRadius: BorderRadius.circular(HealthcareBorderRadius.sm),
              ),
            ),
            const SizedBox(width: HealthcareSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    height: 16,
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: HealthcareColors.backgroundTertiary,
                      borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
                    ),
                  ),
                  const SizedBox(height: HealthcareSpacing.xs),
                  Container(
                    height: 14,
                    width: 150,
                    decoration: BoxDecoration(
                      color: HealthcareColors.backgroundTertiary,
                      borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
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