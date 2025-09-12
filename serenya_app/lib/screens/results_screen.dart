import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../core/providers/health_data_provider.dart';
import '../core/constants/app_constants.dart';
import '../core/constants/design_tokens.dart';
import '../widgets/timeline/timeline_card.dart';
import '../widgets/confidence_indicator.dart';
import '../widgets/medical_disclaimer.dart';
import '../widgets/buttons/floating_action_buttons.dart';
import '../models/local_database_models.dart';
import '../api/endpoints/chat_api.dart';

class ResultsScreen extends StatefulWidget {
  final String? documentId;

  const ResultsScreen({
    Key? key,
    this.documentId,
  }) : super(key: key);

  @override
  _ResultsScreenState createState() => _ResultsScreenState();
}

class _ResultsScreenState extends State<ResultsScreen>
    with TickerProviderStateMixin {
  SerenyaContent? _selectedDocument;
  List<SerenyaContent> _interpretations = [];
  List<ChatMessageResponse> _chatHistory = [];
  bool _isLoadingChat = false;
  String? _chatError;
  
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadResults();
    });
  }
  
  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _loadResults() async {
    final dataProvider = context.read<HealthDataProvider>();
    await dataProvider.loadDocuments();

    if (widget.documentId != null) {
      _selectedDocument = dataProvider.documents
          .where((doc) => doc.id == widget.documentId)
          .firstOrNull;
    } else {
      // Show most recent completed document
      final completedDocs = dataProvider.getDocumentsByStatus(ProcessingStatus.completed);
      if (completedDocs.isNotEmpty) {
        _selectedDocument = completedDocs.first;
      }
    }

    if (_selectedDocument != null) {
      await dataProvider.loadInterpretations();
      _interpretations = dataProvider.interpretations;
      await _loadChatHistory();
    }

    setState(() {});
  }
  
  Future<void> _loadChatHistory() async {
    if (_selectedDocument == null) return;
    
    setState(() {
      _isLoadingChat = true;
      _chatError = null;
    });
    
    try {
      // TODO: Replace with actual chat API call once API client is available
      // This is a placeholder for chat history loading
      await Future.delayed(const Duration(milliseconds: 500)); // Simulate API call
      
      // Mock chat data for demonstration - replace with actual API call
      _chatHistory = [
        ChatMessageResponse(
          messageId: '1',
          conversationId: 'conv_${_selectedDocument!.id}',
          role: 'user',
          content: 'Can you explain my test results?',
          createdAt: DateTime.now().subtract(const Duration(hours: 2)),
        ),
        ChatMessageResponse(
          messageId: '2',
          conversationId: 'conv_${_selectedDocument!.id}',
          role: 'assistant',
          content: '''Based on your uploaded health document, I can see several key findings. Let me break down the most important aspects for you:

## Key Results

**Blood Glucose**: Your levels are within normal range
**Cholesterol**: Slightly elevated - consider dietary changes
**Blood Pressure**: Normal readings

### Recommendations

1. **Diet**: Focus on low-cholesterol foods
2. **Exercise**: 30 minutes daily walking
3. **Follow-up**: Schedule appointment in 3 months

> **Important**: This analysis is for informational purposes only. Please consult your healthcare provider for professional medical advice.''',
          createdAt: DateTime.now().subtract(const Duration(hours: 2)),
        ),
      ];
    } catch (e) {
      _chatError = 'Failed to load chat history: $e';
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingChat = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: HealthcareColors.backgroundPrimary,
      appBar: AppBar(
        title: Text(
          'Results Analysis',
          style: HealthcareTypography.headingH3.copyWith(
            color: HealthcareColors.serenyaWhite,
          ),
        ),
        backgroundColor: HealthcareColors.serenyaBluePrimary,
        elevation: 0,
        iconTheme: const IconThemeData(color: HealthcareColors.serenyaWhite),
        actions: [
          if (_selectedDocument != null)
            IconButton(
              icon: const Icon(Icons.share),
              onPressed: _shareResults,
              tooltip: 'Share Results',
            ),
        ],
        bottom: _selectedDocument != null
            ? TabBar(
                controller: _tabController,
                indicatorColor: HealthcareColors.serenyaWhite,
                labelColor: HealthcareColors.serenyaWhite,
                unselectedLabelColor: HealthcareColors.serenyaBlueLight,
                labelStyle: HealthcareTypography.labelLarge,
                unselectedLabelStyle: HealthcareTypography.labelMedium,
                tabs: const [
                  Tab(
                    text: 'Analysis',
                    icon: Icon(Icons.assignment, size: 20),
                  ),
                  Tab(
                    text: 'Chat History', 
                    icon: Icon(Icons.chat_bubble_outline, size: 20),
                  ),
                ],
              )
            : null,
      ),
      body: _selectedDocument == null
          ? _buildNoResults()
          : TabBarView(
              controller: _tabController,
              children: [
                _buildAnalysisTab(),
                _buildChatHistoryTab(),
              ],
            ),
      floatingActionButton: _buildFloatingActionButton(),
    );
  }

  Widget _buildNoResults() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(HealthcareSpacing.xxl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.assignment_outlined,
              size: 64,
              color: HealthcareColors.textDisabled,
            ),
            const SizedBox(height: HealthcareSpacing.lg),
            Text(
              'No Results Available',
              style: HealthcareTypography.headingH3.copyWith(
                color: HealthcareColors.textSecondary,
              ),
            ),
            const SizedBox(height: HealthcareSpacing.md),
            Text(
              'Upload a health document to see AI analysis results here.',
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

  Widget _buildAnalysisTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(HealthcareSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Document info
          DocumentCard(
            document: _selectedDocument!,
            showConfidence: true,
            onTap: null, // Don't allow navigation from results screen
          ),
          const SizedBox(height: HealthcareSpacing.lg),

          // AI Analysis section
          if (_selectedDocument!.aiConfidenceScore != null) ...[
            Text(
              'AI Analysis',
              style: HealthcareTypography.headingH3.copyWith(
                color: HealthcareColors.textPrimary,
              ),
            ),
            const SizedBox(height: HealthcareSpacing.md),
            
            ConfidenceCard(
              confidenceScore: _selectedDocument!.aiConfidenceScore!,
              message: _selectedDocument!.interpretationText ?? 'Analysis complete.',
              onConsultDoctor: () => _showDoctorConsultationInfo(),
            ),
            const SizedBox(height: HealthcareSpacing.lg),
          ],

          // Detailed interpretations
          if (_interpretations.isNotEmpty) ...[
            Text(
              'Detailed Analysis',
              style: HealthcareTypography.headingH4.copyWith(
                color: HealthcareColors.textPrimary,
              ),
            ),
            const SizedBox(height: HealthcareSpacing.md),
            
            ..._interpretations.map((interpretation) => Container(
              margin: const EdgeInsets.only(bottom: HealthcareSpacing.md),
              decoration: BoxDecoration(
                color: HealthcareColors.surfaceCard,
                borderRadius: BorderRadius.circular(HealthcareBorderRadius.card),
                boxShadow: HealthcareShadows.cardShadow,
                border: Border.all(
                  color: HealthcareColors.surfaceBorder,
                  width: 0.5,
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.all(HealthcareSpacing.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          _getContentTypeLabel(interpretation.contentType),
                          style: HealthcareTypography.labelLarge.copyWith(
                            color: HealthcareColors.textPrimary,
                          ),
                        ),
                        const Spacer(),
                        ConfidenceIndicator(
                          confidenceScore: interpretation.confidenceScore,
                          showDetails: false,
                        ),
                      ],
                    ),
                    const SizedBox(height: HealthcareSpacing.sm),
                    MarkdownBody(
                      data: interpretation.content,
                      styleSheet: MarkdownStyleSheet(
                        p: HealthcareTypography.bodyMedium.copyWith(
                          color: HealthcareColors.textPrimary,
                          height: 1.5,
                        ),
                        h1: HealthcareTypography.headingH4.copyWith(
                          color: HealthcareColors.textPrimary,
                        ),
                        h2: HealthcareTypography.labelLarge.copyWith(
                          color: HealthcareColors.textPrimary,
                        ),
                        strong: HealthcareTypography.bodyMedium.copyWith(
                          color: HealthcareColors.textPrimary,
                          fontWeight: FontWeight.w600,
                        ),
                        listBullet: HealthcareTypography.bodyMedium.copyWith(
                          color: HealthcareColors.serenyaBluePrimary,
                        ),
                      ),
                      selectable: true,
                    ),
                    if (interpretation.medicalFlags.isNotEmpty) ...[
                      const SizedBox(height: HealthcareSpacing.md),
                      Wrap(
                        spacing: HealthcareSpacing.sm,
                        runSpacing: HealthcareSpacing.xs,
                        children: interpretation.medicalFlags.map((flag) => 
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: HealthcareSpacing.sm,
                              vertical: HealthcareSpacing.xs,
                            ),
                            decoration: BoxDecoration(
                              color: HealthcareColors.cautionOrange.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(HealthcareBorderRadius.xs),
                              border: Border.all(
                                color: HealthcareColors.cautionOrange.withOpacity(0.3),
                              ),
                            ),
                            child: Text(
                              flag,
                              style: HealthcareTypography.labelSmall.copyWith(
                                color: HealthcareColors.cautionOrange,
                              ),
                            ),
                          ),
                        ).toList(),
                      ),
                    ],
                  ],
                ),
              ),
            )).toList(),
            const SizedBox(height: HealthcareSpacing.lg),
          ],

          // Medical disclaimers
          MedicalDisclaimer(
            type: DisclaimerType.general,
            isCompact: false,
          ),
          const SizedBox(height: HealthcareSpacing.md),
          
          if (_selectedDocument!.aiConfidenceScore != null && 
              _selectedDocument!.aiConfidenceScore! < AppConstants.moderateConfidenceThreshold)
            MedicalDisclaimer(
              type: DisclaimerType.consultation,
              isCompact: false,
            ),
        ],
      ),
    );
  }

  String _getContentTypeLabel(ContentType type) {
    switch (type) {
      case ContentType.result:
        return 'Analysis Result';
      case ContentType.report:
        return 'Comprehensive Report';
    }
  }
  
  Widget _buildChatHistoryTab() {
    if (_isLoadingChat) {
      return const Center(
        child: CircularProgressIndicator(
          valueColor: AlwaysStoppedAnimation<Color>(HealthcareColors.serenyaBluePrimary),
        ),
      );
    }
    
    if (_chatError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(HealthcareSpacing.lg),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.chat_bubble_outline,
                size: 48,
                color: HealthcareColors.textSecondary,
              ),
              const SizedBox(height: HealthcareSpacing.md),
              Text(
                'Chat History',
                style: HealthcareTypography.headingH4.copyWith(
                  color: HealthcareColors.textPrimary,
                ),
              ),
              const SizedBox(height: HealthcareSpacing.sm),
              Text(
                _chatError!,
                style: HealthcareTypography.bodyMedium.copyWith(
                  color: HealthcareColors.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: HealthcareSpacing.lg),
              ElevatedButton(
                onPressed: _loadChatHistory,
                style: ElevatedButton.styleFrom(
                  backgroundColor: HealthcareColors.serenyaBluePrimary,
                  foregroundColor: HealthcareColors.serenyaWhite,
                ),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }
    
    if (_chatHistory.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(HealthcareSpacing.lg),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.chat_bubble_outline,
                size: 64,
                color: HealthcareColors.textDisabled,
              ),
              const SizedBox(height: HealthcareSpacing.lg),
              Text(
                'No Chat History',
                style: HealthcareTypography.headingH3.copyWith(
                  color: HealthcareColors.textSecondary,
                ),
              ),
              const SizedBox(height: HealthcareSpacing.md),
              Text(
                'Start a conversation about your results using the chat button below.',
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
    
    return ListView.builder(
      padding: const EdgeInsets.all(HealthcareSpacing.md),
      itemCount: _chatHistory.length,
      itemBuilder: (context, index) {
        final message = _chatHistory[index];
        return _buildChatMessage(message);
      },
    );
  }
  
  Widget _buildChatMessage(ChatMessageResponse message) {
    final isUser = message.role == 'user';
    
    return Container(
      margin: const EdgeInsets.only(bottom: HealthcareSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isUser) ...[
            CircleAvatar(
              radius: 16,
              backgroundColor: HealthcareColors.serenyaBluePrimary,
              child: const Icon(
                Icons.smart_toy,
                size: 16,
                color: HealthcareColors.serenyaWhite,
              ),
            ),
            const SizedBox(width: HealthcareSpacing.sm),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                Container(
                  constraints: BoxConstraints(
                    maxWidth: MediaQuery.of(context).size.width * 0.75,
                  ),
                  padding: const EdgeInsets.all(HealthcareSpacing.md),
                  decoration: BoxDecoration(
                    color: isUser 
                        ? HealthcareColors.serenyaBluePrimary
                        : HealthcareColors.surfaceCard,
                    borderRadius: BorderRadius.circular(HealthcareBorderRadius.md).copyWith(
                      bottomLeft: isUser ? null : const Radius.circular(4),
                      bottomRight: isUser ? const Radius.circular(4) : null,
                    ),
                    boxShadow: HealthcareShadows.cardShadow,
                  ),
                  child: isUser 
                      ? Text(
                          message.content,
                          style: HealthcareTypography.bodyMedium.copyWith(
                            color: HealthcareColors.serenyaWhite,
                          ),
                        )
                      : MarkdownBody(
                          data: message.content,
                          styleSheet: MarkdownStyleSheet(
                            p: HealthcareTypography.bodyMedium.copyWith(
                              color: HealthcareColors.textPrimary,
                            ),
                            h1: HealthcareTypography.headingH3.copyWith(
                              color: HealthcareColors.textPrimary,
                            ),
                            h2: HealthcareTypography.headingH4.copyWith(
                              color: HealthcareColors.textPrimary,
                            ),
                            strong: HealthcareTypography.bodyMedium.copyWith(
                              color: HealthcareColors.textPrimary,
                              fontWeight: FontWeight.w600,
                            ),
                            code: HealthcareTypography.bodySmall.copyWith(
                              color: HealthcareColors.textPrimary,
                              backgroundColor: HealthcareColors.surfaceBorder,
                            ),
                            blockquote: HealthcareTypography.bodyMedium.copyWith(
                              color: HealthcareColors.textSecondary,
                              fontStyle: FontStyle.italic,
                            ),
                          ),
                          selectable: true,
                        ),
                ),
                const SizedBox(height: HealthcareSpacing.xs),
                Text(
                  _formatTimestamp(message.createdAt),
                  style: HealthcareTypography.bodySmall.copyWith(
                    color: HealthcareColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          if (isUser) ...[
            const SizedBox(width: HealthcareSpacing.sm),
            CircleAvatar(
              radius: 16,
              backgroundColor: HealthcareColors.serenyaGreenPrimary,
              child: const Icon(
                Icons.person,
                size: 16,
                color: HealthcareColors.serenyaWhite,
              ),
            ),
          ],
        ],
      ),
    );
  }
  
  String _formatTimestamp(DateTime timestamp) {
    final now = DateTime.now();
    final difference = now.difference(timestamp);
    
    if (difference.inDays > 0) {
      return '${difference.inDays}d ago';
    } else if (difference.inHours > 0) {
      return '${difference.inHours}h ago';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes}m ago';
    } else {
      return 'Just now';
    }
  }
  
  Widget _buildFloatingActionButton() {
    return SerenyaFAB(
      context: FABContext.results,
      onUpload: () {
        // Handle upload navigation
        // Use existing app navigation - redirect to home with upload FAB
        Navigator.of(context).pop(); // Return to home where upload FAB is available
      },
      onChat: _selectedDocument != null ? _showChatPrompts : null,
    );
  }
  
  void _showChatPrompts() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _buildChatPromptsBottomSheet(),
    );
  }
  
  Widget _buildChatPromptsBottomSheet() {
    final predefinedPrompts = [
      'Explain my test results in simple terms',
      'What should I discuss with my doctor?',
      'Are there any concerning values in my results?',
      'What lifestyle changes might help?',
      'What do these medical terms mean?',
    ];
    
    return Container(
      decoration: const BoxDecoration(
        color: HealthcareColors.backgroundPrimary,
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(HealthcareBorderRadius.modal),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle bar
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.only(top: HealthcareSpacing.md),
            decoration: BoxDecoration(
              color: HealthcareColors.textDisabled,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(HealthcareSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Ask about your results',
                  style: HealthcareTypography.headingH3.copyWith(
                    color: HealthcareColors.textPrimary,
                  ),
                ),
                const SizedBox(height: HealthcareSpacing.md),
                Text(
                  'Choose a quick prompt or start typing your own question:',
                  style: HealthcareTypography.bodyMedium.copyWith(
                    color: HealthcareColors.textSecondary,
                  ),
                ),
                const SizedBox(height: HealthcareSpacing.lg),
                ...predefinedPrompts.map((prompt) => 
                  Container(
                    width: double.infinity,
                    margin: const EdgeInsets.only(bottom: HealthcareSpacing.sm),
                    child: OutlinedButton(
                      onPressed: () {
                        Navigator.of(context).pop();
                        _startChatWithPrompt(prompt);
                      },
                      style: OutlinedButton.styleFrom(
                        foregroundColor: HealthcareColors.serenyaBluePrimary,
                        side: const BorderSide(
                          color: HealthcareColors.serenyaBluePrimary,
                        ),
                        padding: const EdgeInsets.all(HealthcareSpacing.md),
                        alignment: Alignment.centerLeft,
                      ),
                      child: Text(
                        prompt,
                        style: HealthcareTypography.bodyMedium,
                      ),
                    ),
                  ),
                ).toList(),
                const SizedBox(height: HealthcareSpacing.lg),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      Navigator.of(context).pop();
                      _startNewChat();
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: HealthcareColors.serenyaBluePrimary,
                      foregroundColor: HealthcareColors.serenyaWhite,
                      padding: const EdgeInsets.all(HealthcareSpacing.md),
                    ),
                    icon: const Icon(Icons.chat_bubble),
                    label: const Text('Start New Chat'),
                  ),
                ),
                SizedBox(height: MediaQuery.of(context).viewInsets.bottom),
              ],
            ),
          ),
        ],
      ),
    );
  }
  
  void _startChatWithPrompt(String prompt) {
    // TODO: Implement chat with predefined prompt
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Starting chat with: "$prompt"'),
        backgroundColor: HealthcareColors.serenyaBluePrimary,
      ),
    );
  }
  
  void _startNewChat() {
    // TODO: Navigate to chat screen or implement inline chat
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('Opening new chat...'),
        backgroundColor: HealthcareColors.serenyaBluePrimary,
      ),
    );
  }
  
  void _shareResults() async {
    if (_selectedDocument == null) return;
    
    try {
      final shareText = _buildShareText();
      await Share.share(
        shareText,
        subject: 'Health Analysis Results - ${_selectedDocument!.title}',
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error sharing results: $e'),
            backgroundColor: HealthcareColors.error,
          ),
        );
      }
    }
  }
  
  String _buildShareText() {
    final buffer = StringBuffer();
    buffer.writeln('Serenya Health Analysis Results');
    buffer.writeln('=' * 35);
    buffer.writeln();
    
    buffer.writeln('Document: ${_selectedDocument!.title}');
    buffer.writeln('Date: ${_formatDate(_selectedDocument!.createdAt)}');
    
    if (_selectedDocument!.aiConfidenceScore != null) {
      buffer.writeln('AI Confidence: ${(_selectedDocument!.aiConfidenceScore! * 100).toStringAsFixed(1)}%');
    }
    
    buffer.writeln();
    
    if (_selectedDocument!.content.isNotEmpty) {
      buffer.writeln('Analysis Summary:');
      buffer.writeln(_selectedDocument!.content);
      buffer.writeln();
    }
    
    if (_interpretations.isNotEmpty) {
      buffer.writeln('Detailed Analysis:');
      for (final interpretation in _interpretations) {
        buffer.writeln('• ${_getContentTypeLabel(interpretation.contentType)}');
        buffer.writeln('  ${interpretation.content}');
        buffer.writeln();
      }
    }
    
    buffer.writeln('Generated by Serenya AI Health Agent');
    buffer.writeln('This is not medical advice. Consult with healthcare providers.');
    
    return buffer.toString();
  }
  
  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  void _showDoctorConsultationInfo() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Healthcare Provider Consultation'),
        content: Text(
          'Based on your results, we recommend discussing these findings with a healthcare provider. '
          'They can provide proper medical evaluation and next steps based on your complete health history.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Got it'),
          ),
        ],
      ),
    );
  }
}