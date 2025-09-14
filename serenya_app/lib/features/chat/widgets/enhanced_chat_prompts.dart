import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/chat_provider.dart';
import '../../../services/chat_integration_service.dart';
import '../../../core/constants/design_tokens.dart';

/// Enhanced chat prompts widget supporting two-level prompt system
class EnhancedChatPromptsBottomSheet extends StatelessWidget {
  final String contentId;
  final String contentType;
  final VoidCallback onClose;

  const EnhancedChatPromptsBottomSheet({
    Key? key,
    required this.contentId,
    required this.contentType,
    required this.onClose,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Consumer<ChatProvider>(
      builder: (context, chatProvider, child) {
        // Load chat prompts for this content type
        WidgetsBinding.instance.addPostFrameCallback((_) {
          chatProvider.loadChatPrompts(contentType);
        });

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
    // Show loading state while prompts are being loaded
    if (chatProvider.isLoadingChatPrompts) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(HealthcareSpacing.xl),
          child: CircularProgressIndicator(
            valueColor: AlwaysStoppedAnimation<Color>(HealthcareColors.serenyaBluePrimary),
          ),
        ),
      );
    }

    // Use dynamic prompts from API if available, otherwise fallback to hardcoded
    List<ChatPromptOption> mainPrompts;
    
    if (chatProvider.availableChatPrompts.isNotEmpty) {
      // Convert API prompts to ChatPromptOption objects
      mainPrompts = chatProvider.availableChatPrompts.map((chatPrompt) {
        return ChatPromptOption(
          title: _getCategoryTitle(chatPrompt.category),
          subtitle: _getCategorySubtitle(chatPrompt.category),
          icon: _getCategoryIcon(chatPrompt.category),
          promptText: chatPrompt.promptText,
        );
      }).toList();
      
      // Add metrics selector if this is results content
      if (contentType == 'results') {
        mainPrompts.add(ChatPromptOption(
          title: 'Ask about specific metrics',
          subtitle: 'Get detailed information about individual test values',
          icon: Icons.analytics_outlined,
          onTap: () => chatProvider.loadMetrics(contentId),
          isMetricSelector: true,
        ));
      }
    } else {
      // Fallback to hardcoded prompts
      mainPrompts = [
        ChatPromptOption(
          title: 'Explain my ${contentType == 'report' ? 'report' : 'results'} in simple terms',
          subtitle: 'Get a clear overview of your ${contentType == 'report' ? 'report' : 'test results'}',
          icon: Icons.lightbulb_outline,
          promptText: 'Can you explain my ${contentType == 'report' ? 'report' : 'test results'} in simple, easy-to-understand terms?',
        ),
        ChatPromptOption(
          title: 'What should I discuss with my doctor?',
          subtitle: 'Prepare for your next appointment',
          icon: Icons.medical_services_outlined,
          promptText: 'What key points should I discuss with my doctor about these ${contentType == 'report' ? 'findings' : 'results'}?',
        ),
        ChatPromptOption(
          title: 'Are there any concerning values?',
          subtitle: 'Identify values that need attention',
          icon: Icons.warning_amber_outlined,
          promptText: 'Are there any values in my ${contentType == 'report' ? 'report' : 'results'} that I should be concerned about?',
        ),
        if (contentType == 'results') ChatPromptOption(
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
          promptText: 'How do my ${contentType == 'report' ? 'report values' : 'test values'} compare to the normal reference ranges?',
        ),
      ];
    }

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
        side: const BorderSide(
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
        side: const BorderSide(
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

  /// Map category to display title
  String _getCategoryTitle(String category) {
    switch (category.toLowerCase()) {
      case 'explanation':
        return contentType == 'report' ? 'Explain my report in simple terms' : 'Explain my results in simple terms';
      case 'doctor_discussion':
        return 'What should I discuss with my doctor?';
      case 'concerning_values':
        return 'Are there any concerning values?';
      case 'normal_ranges':
        return 'How do these compare to normal ranges?';
      case 'next_steps':
        return 'What are my next steps?';
      case 'lifestyle':
        return 'Lifestyle recommendations';
      default:
        return category.replaceAll('_', ' ').split(' ')
            .map((word) => word[0].toUpperCase() + word.substring(1)).join(' ');
    }
  }

  /// Map category to display subtitle
  String _getCategorySubtitle(String category) {
    switch (category.toLowerCase()) {
      case 'explanation':
        return contentType == 'report' ? 'Get a clear overview of your report' : 'Get a clear overview of your test results';
      case 'doctor_discussion':
        return 'Prepare for your next appointment';
      case 'concerning_values':
        return 'Identify values that need attention';
      case 'normal_ranges':
        return 'Understand if your values are within expected ranges';
      case 'next_steps':
        return 'Learn about recommended follow-up actions';
      case 'lifestyle':
        return 'Get personalized health recommendations';
      default:
        return 'Get more information about this topic';
    }
  }

  /// Map category to display icon
  IconData _getCategoryIcon(String category) {
    switch (category.toLowerCase()) {
      case 'explanation':
        return Icons.lightbulb_outline;
      case 'doctor_discussion':
        return Icons.medical_services_outlined;
      case 'concerning_values':
        return Icons.warning_amber_outlined;
      case 'normal_ranges':
        return Icons.compare_arrows_outlined;
      case 'next_steps':
        return Icons.forward_outlined;
      case 'lifestyle':
        return Icons.favorite_outline;
      default:
        return Icons.help_outline;
    }
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