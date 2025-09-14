import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/chat_provider.dart';
import '../../../services/chat_integration_service.dart';
import '../../../core/constants/design_tokens.dart';

/// Enhanced chat prompts widget supporting two-level prompt system
class EnhancedChatPromptsBottomSheet extends StatelessWidget {
  final String contentId;
  final VoidCallback onClose;

  const EnhancedChatPromptsBottomSheet({
    Key? key,
    required this.contentId,
    required this.onClose,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Consumer<ChatProvider>(
      builder: (context, chatProvider, child) {
        return Container(
          decoration: const BoxDecoration(
            color: HealthcareColors.serenyaWhite,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Handle bar
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(top: HealthcareSpacing.sm),
                decoration: BoxDecoration(
                  color: HealthcareColors.textDisabled,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              
              // Header with back button (for level 2)
              _buildHeader(context, chatProvider),
              
              // Content based on prompt level
              Flexible(
                child: chatProvider.promptLevel == PromptLevel.main
                    ? _buildMainPrompts(context, chatProvider)
                    : _buildMetricsPrompts(context, chatProvider),
              ),
              
              // Bottom padding for safe area
              SizedBox(height: MediaQuery.of(context).viewInsets.bottom),
            ],
          ),
        );
      },
    );
  }

  Widget _buildHeader(BuildContext context, ChatProvider chatProvider) {
    return Padding(
      padding: const EdgeInsets.all(HealthcareSpacing.md),
      child: Row(
        children: [
          // Back button (only show on metrics level)
          if (chatProvider.promptLevel == PromptLevel.metrics)
            IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => chatProvider.backToMainPrompts(),
              color: HealthcareColors.serenyaBluePrimary,
            )
          else
            const SizedBox(width: 48), // Placeholder for alignment
          
          // Title
          Expanded(
            child: Text(
              chatProvider.promptLevel == PromptLevel.main
                  ? 'Ask Serenya'
                  : 'Select Metric',
              style: HealthcareTypography.headingH3.copyWith(
                color: HealthcareColors.textPrimary,
              ),
              textAlign: TextAlign.center,
            ),
          ),
          
          // Close button
          IconButton(
            icon: const Icon(Icons.close),
            onPressed: onClose,
            color: HealthcareColors.textSecondary,
          ),
        ],
      ),
    );
  }

  Widget _buildMainPrompts(BuildContext context, ChatProvider chatProvider) {
    final mainPrompts = [
      ChatPromptOption(
        title: 'Explain my results in simple terms',
        subtitle: 'Get a clear overview of your test results',
        icon: Icons.lightbulb_outline,
        promptText: 'Can you explain my test results in simple, easy-to-understand terms?',
      ),
      ChatPromptOption(
        title: 'What should I discuss with my doctor?',
        subtitle: 'Prepare for your next appointment',
        icon: Icons.medical_services_outlined,
        promptText: 'What key points should I discuss with my doctor about these results?',
      ),
      ChatPromptOption(
        title: 'Are there any concerning values?',
        subtitle: 'Identify values that need attention',
        icon: Icons.warning_amber_outlined,
        promptText: 'Are there any values in my results that I should be concerned about?',
      ),
      ChatPromptOption(
        title: 'Ask about specific metrics',
        subtitle: 'Get detailed information about individual test values',
        icon: Icons.analytics_outlined,
        onTap: () => chatProvider.loadMetrics(contentId),
        isMetricSelector: true,
      ),
      ChatPromptOption(
        title: 'How do these compare to normal ranges?',
        subtitle: 'Understand if your values are within expected ranges',
        icon: Icons.compare_arrows_outlined,
        promptText: 'How do my test values compare to the normal reference ranges?',
      ),
    ];

    return ListView.separated(
      padding: const EdgeInsets.all(HealthcareSpacing.md),
      shrinkWrap: true,
      itemCount: mainPrompts.length,
      separatorBuilder: (context, index) => const SizedBox(height: HealthcareSpacing.sm),
      itemBuilder: (context, index) {
        final prompt = mainPrompts[index];
        return _buildPromptTile(
          context,
          chatProvider,
          prompt,
        );
      },
    );
  }

  Widget _buildMetricsPrompts(BuildContext context, ChatProvider chatProvider) {
    if (chatProvider.isLoadingMetrics) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(HealthcareSpacing.xl),
          child: CircularProgressIndicator(
            valueColor: AlwaysStoppedAnimation<Color>(HealthcareColors.serenyaBluePrimary),
          ),
        ),
      );
    }

    if (chatProvider.availableMetrics.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(HealthcareSpacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.info_outline,
                size: 48,
                color: HealthcareColors.textSecondary,
              ),
              const SizedBox(height: HealthcareSpacing.md),
              Text(
                'No metrics available',
                style: HealthcareTypography.headingH4.copyWith(
                  color: HealthcareColors.textSecondary,
                ),
              ),
              const SizedBox(height: HealthcareSpacing.sm),
              Text(
                'This report doesn\'t contain specific lab results or vital signs to ask about.',
                style: HealthcareTypography.bodyMedium.copyWith(
                  color: HealthcareColors.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    // Limit visible items and make scrollable
    final visibleMetrics = chatProvider.availableMetrics.take(10).toList();
    final hasMore = chatProvider.availableMetrics.length > 10;

    return Column(
      children: [
        if (hasMore)
          Padding(
            padding: const EdgeInsets.all(HealthcareSpacing.md),
            child: Text(
              'Showing top 10 metrics (${chatProvider.availableMetrics.length} total)',
              style: HealthcareTypography.bodySmall.copyWith(
                color: HealthcareColors.textSecondary,
              ),
              textAlign: TextAlign.center,
            ),
          ),
        
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.all(HealthcareSpacing.md),
            itemCount: visibleMetrics.length,
            separatorBuilder: (context, index) => const SizedBox(height: HealthcareSpacing.sm),
            itemBuilder: (context, index) {
              final metric = visibleMetrics[index];
              return _buildMetricTile(
                context,
                chatProvider,
                metric,
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildPromptTile(
    BuildContext context,
    ChatProvider chatProvider,
    ChatPromptOption prompt,
  ) {
    return Card(
      elevation: 0,
      color: HealthcareColors.backgroundSecondary,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: HealthcareColors.borderColor,
          width: 1,
        ),
      ),
      child: InkWell(
        onTap: chatProvider.isSending
            ? null
            : () {
                if (prompt.isMetricSelector) {
                  prompt.onTap?.call();
                } else if (prompt.promptText != null) {
                  chatProvider.sendMessage(
                    contentId: contentId,
                    prompt: prompt.promptText!,
                  );
                  onClose();
                }
              },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(HealthcareSpacing.md),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: HealthcareColors.serenyaBluePrimary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  prompt.icon,
                  color: HealthcareColors.serenyaBluePrimary,
                  size: 24,
                ),
              ),
              
              const SizedBox(width: HealthcareSpacing.md),
              
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      prompt.title,
                      style: HealthcareTypography.bodyLarge.copyWith(
                        fontWeight: FontWeight.w500,
                        color: HealthcareColors.textPrimary,
                      ),
                    ),
                    if (prompt.subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        prompt.subtitle!,
                        style: HealthcareTypography.bodySmall.copyWith(
                          color: HealthcareColors.textSecondary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              
              if (prompt.isMetricSelector)
                const Icon(
                  Icons.arrow_forward_ios,
                  size: 16,
                  color: HealthcareColors.textSecondary,
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMetricTile(
    BuildContext context,
    ChatProvider chatProvider,
    MetricOption metric,
  ) {
    return Card(
      elevation: 0,
      color: HealthcareColors.backgroundSecondary,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: HealthcareColors.borderColor,
          width: 1,
        ),
      ),
      child: InkWell(
        onTap: chatProvider.isSending
            ? null
            : () {
                final promptText = 'Can you explain my ${metric.name} result and what it means for my health?';
                chatProvider.sendMessage(
                  contentId: contentId,
                  prompt: promptText,
                  context: {
                    'metric_name': metric.name,
                    'metric_type': metric.type,
                    'metric_value': metric.value,
                    'metric_unit': metric.unit,
                  },
                );
                onClose();
              },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(HealthcareSpacing.md),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: metric.type == 'lab' 
                      ? HealthcareColors.successLight.withOpacity(0.2)
                      : HealthcareColors.infoLight.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  metric.type == 'lab' ? Icons.science_outlined : Icons.favorite_outline,
                  color: metric.type == 'lab' 
                      ? HealthcareColors.successPrimary
                      : HealthcareColors.infoPrimary,
                  size: 24,
                ),
              ),
              
              const SizedBox(width: HealthcareSpacing.md),
              
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      metric.name,
                      style: HealthcareTypography.bodyLarge.copyWith(
                        fontWeight: FontWeight.w500,
                        color: HealthcareColors.textPrimary,
                      ),
                    ),
                    if (metric.value != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        '${metric.value}${metric.unit ?? ''}',
                        style: HealthcareTypography.bodySmall.copyWith(
                          color: HealthcareColors.textSecondary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Model for chat prompt options
class ChatPromptOption {
  final String title;
  final String? subtitle;
  final IconData icon;
  final String? promptText;
  final VoidCallback? onTap;
  final bool isMetricSelector;

  const ChatPromptOption({
    required this.title,
    this.subtitle,
    required this.icon,
    this.promptText,
    this.onTap,
    this.isMetricSelector = false,
  });
}