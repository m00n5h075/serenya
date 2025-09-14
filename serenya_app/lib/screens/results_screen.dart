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
import '../models/local_database_models.dart';
import '../api/endpoints/chat_api.dart';
import '../core/database/health_data_repository.dart';
import '../services/unified_polling_service.dart';
import '../features/chat/providers/chat_provider.dart';
import '../features/chat/widgets/enhanced_chat_prompts.dart';
import '../services/pdf_generation_service.dart';
import '../services/exceptions/pdf_exceptions.dart';

/// Updated Results Screen with integrated chat functionality
/// Addresses CTO Fix #3: Complete results screen integration
class ResultsScreen extends StatefulWidget {
  final String? documentId;

  const ResultsScreen({
    Key? key,
    this.documentId,
  }) : super(key: key);

  @override
  State<ResultsScreen> createState() => _ResultsScreenState();
}

class _ResultsScreenState extends State<ResultsScreen>
    with TickerProviderStateMixin {
  SerenyaContent? _selectedDocument;
  List<SerenyaContent> _interpretations = [];
  
  late TabController _tabController;
  late ChatProvider _chatProvider;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    
    // Initialize chat provider
    _chatProvider = ChatProvider(
      chatApi: context.read<ChatApi>(),
      repository: context.read<HealthDataRepository>(),
      pollingService: context.read<UnifiedPollingService>(),
    );
    
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadResults();
    });
  }
  
  @override
  void dispose() {
    _tabController.dispose();
    _chatProvider.dispose();
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
      
      // Load chat history for this document
      await _chatProvider.loadConversation(_selectedDocument!.id);
    }

    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: _chatProvider,
      child: Scaffold(
        backgroundColor: HealthcareColors.backgroundPrimary,
        appBar: AppBar(
          title: Text(
            _selectedDocument!.contentType == ContentType.report ? 'Report' : 'Result',
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
                  tabs: [
                    const Tab(
                      text: 'Analysis',
                      icon: Icon(Icons.assignment, size: 20),
                    ),
                    Tab(
                      child: Consumer<ChatProvider>(
                        builder: (context, chatProvider, child) {
                          return Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.chat_bubble_outline, size: 20),
                              const SizedBox(width: 4),
                              const Text('Chat'),
                              // Dot indicator for new messages or processing
                              if (chatProvider.isSending || chatProvider.messages.isNotEmpty)
                                Container(
                                  width: 8,
                                  height: 8,
                                  margin: const EdgeInsets.only(left: 4),
                                  decoration: BoxDecoration(
                                    color: chatProvider.isSending
                                        ? HealthcareColors.cautionOrange
                                        : HealthcareColors.successPrimary,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                ),
                            ],
                          );
                        },
                      ),
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
                  _buildChatTab(),
                ],
              ),
        floatingActionButton: _buildFloatingActionButton(),
      ),
    );
  }

  Widget _buildNoResults() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(HealthcareSpacing.xxl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
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
          if (_selectedDocument!.confidenceScore > 0) ...[
            Text(
              'AI Analysis',
              style: HealthcareTypography.headingH3.copyWith(
                color: HealthcareColors.textPrimary,
              ),
            ),
            const SizedBox(height: HealthcareSpacing.md),
            
            ConfidenceCard(
              confidenceScore: _selectedDocument!.confidenceScore,
              message: _selectedDocument!.summary ?? 'Analysis complete.',
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
          const MedicalDisclaimer(
            type: DisclaimerType.general,
            isCompact: false,
          ),
          const SizedBox(height: HealthcareSpacing.md),
          
          if (_selectedDocument!.confidenceScore > 0 && 
              _selectedDocument!.confidenceScore < AppConstants.moderateConfidenceThreshold)
            const MedicalDisclaimer(
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
  
  Widget _buildChatTab() {
    return Consumer<ChatProvider>(
      builder: (context, chatProvider, child) {
        // Show loading state
        if (chatProvider.isLoading) {
          return const Center(
            child: CircularProgressIndicator(
              valueColor: AlwaysStoppedAnimation<Color>(HealthcareColors.serenyaBluePrimary),
            ),
          );
        }
        
        // Show error state
        if (chatProvider.error != null) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(HealthcareSpacing.lg),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.error_outline,
                    size: 48,
                    color: HealthcareColors.error,
                  ),
                  const SizedBox(height: HealthcareSpacing.md),
                  Text(
                    'Chat Error',
                    style: HealthcareTypography.headingH4.copyWith(
                      color: HealthcareColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: HealthcareSpacing.sm),
                  Text(
                    chatProvider.error!,
                    style: HealthcareTypography.bodyMedium.copyWith(
                      color: HealthcareColors.textSecondary,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: HealthcareSpacing.lg),
                  ElevatedButton(
                    onPressed: () {
                      chatProvider.clearError();
                      chatProvider.loadConversation(_selectedDocument!.id);
                    },
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
        
        // Show empty state
        if (chatProvider.messages.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(HealthcareSpacing.lg),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.chat_bubble_outline,
                    size: 64,
                    color: HealthcareColors.textDisabled,
                  ),
                  const SizedBox(height: HealthcareSpacing.lg),
                  Text(
                    'No Conversation Yet',
                    style: HealthcareTypography.headingH3.copyWith(
                      color: HealthcareColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: HealthcareSpacing.md),
                  Text(
                    'Ask Serenya about your results using the chat button below.',
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
        
        // Show chat messages
        return ListView.builder(
          padding: const EdgeInsets.all(HealthcareSpacing.md),
          itemCount: chatProvider.messages.length,
          itemBuilder: (context, index) {
            final message = chatProvider.messages[index];
            return _buildChatMessage(message);
          },
        );
      },
    );
  }
  
  Widget _buildChatMessage(ChatMessage message) {
    final isUser = message.sender == MessageSenderType.user;
    
    return Container(
      margin: const EdgeInsets.only(bottom: HealthcareSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isUser) ...[
            const CircleAvatar(
              radius: 16,
              backgroundColor: HealthcareColors.serenyaBluePrimary,
              child: Icon(
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
                          message.message,
                          style: HealthcareTypography.bodyMedium.copyWith(
                            color: HealthcareColors.serenyaWhite,
                          ),
                        )
                      : MarkdownBody(
                          data: message.message,
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
            const CircleAvatar(
              radius: 16,
              backgroundColor: HealthcareColors.serenyaGreenPrimary,
              child: Icon(
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
    return Consumer<ChatProvider>(
      builder: (context, chatProvider, child) {
        return SerenyaEnhancedFAB(
          context: FABContext.results,
          isProcessing: chatProvider.isSending,
          hasNewResponse: chatProvider.messages.isNotEmpty && _tabController.index != 1,
          onUpload: () {
            // Handle upload navigation
            Navigator.of(context).pop(); // Return to home where upload FAB is available
          },
          onChat: _selectedDocument != null ? _showEnhancedChatPrompts : null,
          onViewAnswer: () {
            // Switch to chat tab to view new response
            _tabController.animateTo(1);
          },
        );
      },
    );
  }
  
  void _showEnhancedChatPrompts() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => EnhancedChatPromptsBottomSheet(
        contentId: _selectedDocument!.id,
        contentType: _selectedDocument!.contentType.name,
        onClose: () => Navigator.of(context).pop(),
      ),
    );
  }
  
  void _shareResults() async {
    if (_selectedDocument == null) return;
    
    // Show sharing options dialog
    showModalBottomSheet(
      context: context,
      backgroundColor: HealthcareColors.surfaceCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) => Padding(
        padding: const EdgeInsets.all(HealthcareSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Share Results',
              style: HealthcareTypography.headingH4.copyWith(
                color: HealthcareColors.textPrimary,
              ),
            ),
            const SizedBox(height: HealthcareSpacing.lg),
            
            // Text sharing option
            ListTile(
              leading: const Icon(Icons.text_fields, color: HealthcareColors.serenyaBluePrimary),
              title: Text(
                'Share as Text',
                style: HealthcareTypography.bodyMedium.copyWith(
                  color: HealthcareColors.textPrimary,
                ),
              ),
              subtitle: Text(
                'Simple text format for quick sharing',
                style: HealthcareTypography.bodySmall.copyWith(
                  color: HealthcareColors.textSecondary,
                ),
              ),
              onTap: () {
                Navigator.pop(context);
                _shareAsText();
              },
            ),
            
            const Divider(color: HealthcareColors.surfaceBorder),
            
            // PDF sharing option
            ListTile(
              leading: const Icon(Icons.picture_as_pdf, color: HealthcareColors.serenyaGreenPrimary),
              title: Text(
                'Share as PDF',
                style: HealthcareTypography.bodyMedium.copyWith(
                  color: HealthcareColors.textPrimary,
                ),
              ),
              subtitle: Text(
                'Formatted PDF with analysis and chat history',
                style: HealthcareTypography.bodySmall.copyWith(
                  color: HealthcareColors.textSecondary,
                ),
              ),
              onTap: () {
                Navigator.pop(context);
                _shareAsPdf();
              },
            ),
            
            const SizedBox(height: HealthcareSpacing.sm),
          ],
        ),
      ),
    );
  }
  
  void _shareAsText() async {
    if (_selectedDocument == null) return;
    
    try {
      final shareText = _buildShareText();
      await Share.share(
        shareText,
        subject: 'Health Analysis Results - ${_selectedDocument!.title}',
      );
    } catch (e) {
      _showError('Error sharing as text: $e');
    }
  }
  
  void _shareAsPdf() async {
    if (_selectedDocument == null) return;
    
    // Track if we're showing loading
    bool isShowingLoading = false;
    File? generatedFile;
    
    try {
      // Show loading indicator
      if (mounted) {
        isShowingLoading = true;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Row(
              children: [
                SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                ),
                SizedBox(width: 12),
                Text('Generating PDF...'),
              ],
            ),
            backgroundColor: HealthcareColors.serenyaBluePrimary,
            duration: Duration(seconds: 30), // Longer duration to account for generation time
          ),
        );
      }
      
      // Generate PDF with comprehensive error handling
      try {
        generatedFile = await PdfGenerationService.generateResultsPdf(
          content: _selectedDocument!,
          chatMessages: _chatProvider.messages,
          interpretations: _interpretations,
        );
      } on PdfException catch (pdfError) {
        // Handle our custom PDF exceptions with user-friendly messages
        _showUserFriendlyError(pdfError);
        return;
      } catch (e) {
        // Handle any unexpected errors during PDF generation
        _showUserFriendlyError(UnknownPdfException(
          technicalDetails: 'Unexpected PDF generation error: $e',
        ));
        return;
      }
      
      // Update loading message for sharing phase
      if (mounted && isShowingLoading) {
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Row(
              children: [
                SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                ),
                SizedBox(width: 12),
                Text('Preparing to share...'),
              ],
            ),
            backgroundColor: HealthcareColors.serenyaBluePrimary,
            duration: Duration(seconds: 10),
          ),
        );
      }
      
      // Share PDF file with error handling
      try {
        await Share.shareXFiles(
          [XFile(generatedFile.path)],
          text: 'Serenya Health Analysis Results',
          subject: 'Health Analysis Results - ${_selectedDocument!.title}',
        );
        
        // Show success message
        if (mounted) {
          ScaffoldMessenger.of(context).hideCurrentSnackBar();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Row(
                children: [
                  Icon(Icons.check_circle, color: Colors.white),
                  SizedBox(width: 12),
                  Text('PDF shared successfully'),
                ],
              ),
              backgroundColor: HealthcareColors.successPrimary,
              duration: Duration(seconds: 3),
            ),
          );
        }
        
      } catch (shareError) {
        // Handle sharing errors separately
        _showUserFriendlyError(PdfSharingException(
          technicalDetails: 'Share operation failed: $shareError',
        ));
        return;
      }
      
    } finally {
      // GUARANTEED CLEANUP - Always hide loading indicator
      if (mounted && isShowingLoading) {
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
      }
      
      // The generated file will be cleaned up by the app-level cleanup service
      // We don't clean it up immediately here since sharing might still be in progress
    }
  }
  
  /// Show user-friendly error messages for PDF operations
  /// 
  /// This method ensures that users never see technical details or stack traces
  /// All errors are converted to user-friendly messages as per CTO security hardening
  void _showUserFriendlyError(PdfException error) {
    if (!mounted) return;
    
    // Always hide loading indicator first
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    
    // Show user-friendly error message
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.error_outline, color: Colors.white),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                error.userMessage, // Only show user-friendly message
                style: const TextStyle(color: Colors.white),
              ),
            ),
          ],
        ),
        backgroundColor: HealthcareColors.error,
        duration: const Duration(seconds: 5),
        action: error.isRetryable
            ? SnackBarAction(
                label: 'Retry',
                textColor: Colors.white,
                onPressed: () => _shareAsPdf(), // Retry the operation
              )
            : null,
      ),
    );
    
    // Log technical details for debugging (never shown to user)
    print('PDF Error [${error.errorCode}]: ${error.technicalDetails}');
  }
  
  void _showError(String message) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: HealthcareColors.error,
        ),
      );
    }
  }
  
  String _buildShareText() {
    final buffer = StringBuffer();
    buffer.writeln('Serenya Health Analysis Results');
    buffer.writeln('=' * 35);
    buffer.writeln();
    
    buffer.writeln('Document: ${_selectedDocument!.title}');
    buffer.writeln('Date: ${_formatDate(_selectedDocument!.createdAt)}');
    
    if (_selectedDocument!.confidenceScore > 0) {
      buffer.writeln('AI Confidence: ${(_selectedDocument!.confidenceScore * 100).toStringAsFixed(1)}%');
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
        title: const Text('Healthcare Provider Consultation'),
        content: const Text(
          'Based on your results, we recommend discussing these findings with a healthcare provider. '
          'They can provide proper medical evaluation and next steps based on your complete health history.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Got it'),
          ),
        ],
      ),
    );
  }
}

/// Enhanced FAB widget with context-aware states
class SerenyaEnhancedFAB extends StatelessWidget {
  final FABContext context;
  final bool isProcessing;
  final bool hasNewResponse;
  final VoidCallback? onUpload;
  final VoidCallback? onChat;
  final VoidCallback? onViewAnswer;

  const SerenyaEnhancedFAB({
    Key? key,
    required this.context,
    this.isProcessing = false,
    this.hasNewResponse = false,
    this.onUpload,
    this.onChat,
    this.onViewAnswer,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // Processing state - disabled with spinner
    if (isProcessing) {
      return FloatingActionButton.extended(
        onPressed: null,
        backgroundColor: HealthcareColors.textDisabled,
        icon: const SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            valueColor: AlwaysStoppedAnimation<Color>(HealthcareColors.serenyaWhite),
          ),
        ),
        label: const Text(
          'Processing...',
          style: TextStyle(color: HealthcareColors.serenyaWhite),
        ),
      );
    }
    
    // Response ready state - show "View Answer"
    if (hasNewResponse) {
      return FloatingActionButton.extended(
        onPressed: onViewAnswer,
        backgroundColor: HealthcareColors.successPrimary,
        icon: const Icon(Icons.visibility, color: HealthcareColors.serenyaWhite),
        label: const Text(
          'View Answer',
          style: TextStyle(color: HealthcareColors.serenyaWhite),
        ),
      );
    }
    
    // Default state - Ask Question
    return FloatingActionButton.extended(
      onPressed: onChat,
      backgroundColor: HealthcareColors.serenyaBluePrimary,
      icon: const Icon(Icons.psychology, color: HealthcareColors.serenyaWhite),
      label: const Text(
        'Ask Question',
        style: TextStyle(color: HealthcareColors.serenyaWhite),
      ),
    );
  }
}

enum FABContext {
  results,
  reports,
  timeline,
}