import 'package:flutter/material.dart';
import '../../services/data_export_service.dart';
import '../../services/api_service.dart';
import '../../core/error_handling/unified_error.dart';
import '../../core/error_handling/error_widgets.dart';
import '../../core/navigation/swipe_back_wrapper.dart';

/// Privacy & Data Management Screen
/// 
/// Provides users with data export and account deletion capabilities
/// following GDPR compliance requirements. Includes user-friendly copy
/// and clear explanations of consequences for destructive actions.
class PrivacyDataScreen extends StatefulWidget {
  const PrivacyDataScreen({super.key});

  @override
  State<PrivacyDataScreen> createState() => _PrivacyDataScreenState();
}

class _PrivacyDataScreenState extends State<PrivacyDataScreen> {
  bool _isExporting = false;
  bool _isDeleting = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FA),
      appBar: AppBar(
        title: const Text(
          'Privacy & Data',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
        backgroundColor: Colors.blue[600],
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header section with main description
            _buildHeaderSection(),
            const SizedBox(height: 24),
            
            // Data Export section
            _buildDataExportSection(),
            const SizedBox(height: 24),
            
            // Account Deletion section
            _buildAccountDeletionSection(),
            const SizedBox(height: 24),
            
            // Footer with contact information
            _buildFooterSection(),
          ],
        ),
      ),
    ).withSwipeBack();
  }

  /// Build header section with main description
  Widget _buildHeaderSection() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Your Data, Your Control',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w600,
              color: Color(0xFF212121),
            ),
          ),
          SizedBox(height: 12),
          Text(
            'We believe you should have complete control over your personal health data. Use the options below to export your information or permanently delete your account—it\'s entirely up to you.',
            style: TextStyle(
              fontSize: 16,
              color: Color(0xFF757575),
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }

  /// Build data export section
  Widget _buildDataExportSection() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section header
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: const Color(0xFFE3F2FD),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.file_download,
                  size: 24,
                  color: Color(0xFF2196F3),
                ),
              ),
              const SizedBox(width: 16),
              const Text(
                'Download Your Complete Data',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF212121),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          
          // Description
          const Text(
            'Get a comprehensive file containing all your account information, consent records, and usage history. This export includes everything we store about you, formatted for easy review.',
            style: TextStyle(
              fontSize: 14,
              color: Color(0xFF757575),
              height: 1.43,
            ),
          ),
          const SizedBox(height: 20),
          
          // Export button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _isExporting ? null : _handleDataExport,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2196F3),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                elevation: 0,
              ),
              child: _isExporting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    )
                  : const Text(
                      'Export My Data',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  /// Build account deletion section
  Widget _buildAccountDeletionSection() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
        border: Border.all(color: const Color(0xFFFFEBEE)),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section header
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFEBEE),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.delete_forever,
                  size: 24,
                  color: Color(0xFFFF5252),
                ),
              ),
              const SizedBox(width: 16),
              const Text(
                'Permanently Delete Everything',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF212121),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          
          // Warning box
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFFFFF3E0),
              border: Border.all(color: const Color(0xFFFFB74D)),
              borderRadius: BorderRadius.circular(8),
            ),
            padding: const EdgeInsets.all(12),
            child: const Text(
              '⚠️ This action cannot be undone. All your health data, chat history, and account information will be permanently deleted.',
              style: TextStyle(
                fontSize: 14,
                color: Color(0xFFE65100),
                height: 1.43,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const SizedBox(height: 16),
          
          // Description
          const Text(
            'This action removes your account and all associated data from our systems immediately. Once deleted, this cannot be undone and you\'ll need to create a new account to use Serenya again.',
            style: TextStyle(
              fontSize: 14,
              color: Color(0xFF757575),
              height: 1.43,
            ),
          ),
          const SizedBox(height: 20),
          
          // Delete button (secondary style with error color)
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: _isDeleting ? null : _handleAccountDeletion,
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Color(0xFFFF5252), width: 2),
                foregroundColor: const Color(0xFFFF5252),
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              child: _isDeleting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFFF5252)),
                      ),
                    )
                  : const Text(
                      'Delete Account',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  /// Build footer section with contact information
  Widget _buildFooterSection() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: const Color(0xFFE3F2FD),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(
                  Icons.help_outline,
                  size: 18,
                  color: Color(0xFF2196F3),
                ),
              ),
              const SizedBox(width: 12),
              const Text(
                'Need Help?',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF212121),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          
          const Text(
            'Questions about your data? We\'re here to help. Contact us at privacy@serenya.ai for any data-related inquiries.',
            style: TextStyle(
              fontSize: 14,
              color: Color(0xFF757575),
              height: 1.43,
            ),
          ),
          const SizedBox(height: 12),
          
          // Contact link
          GestureDetector(
            onTap: _handleContactSupport,
            child: const Text(
              'privacy@serenya.ai',
              style: TextStyle(
                fontSize: 14,
                color: Color(0xFF2196F3),
                fontWeight: FontWeight.w500,
                decoration: TextDecoration.underline,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Handle data export with user education and confirmation
  Future<void> _handleDataExport() async {
    // Show confirmation dialog with user education first
    final confirmed = await _showExportEducationDialog();
    if (!confirmed) return;

    setState(() {
      _isExporting = true;
    });

    try {
      final exportService = DataExportService();
      final result = await exportService.exportAllUserData();
      
      if (result.success && result.file != null) {
        // Share the export file immediately
        await exportService.shareExportFile(result.file!);
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Data export completed! ${result.recordsCount} records exported.'),
              backgroundColor: const Color(0xFF4CAF50),
            ),
          );
        }
      } else {
        throw Exception(result.message);
      }
    } catch (e) {
      const error = UnifiedError(
        category: ErrorCategory.technical,
        recoveryStrategy: RecoveryStrategy.retry,
        userMessage: 'We\'re having trouble exporting your data. Please try again.',
        retryAfter: Duration(seconds: 5),
        errorCode: 'EXPORT_ERROR',
      );
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          ErrorSnackBar.build(error, onRetry: _handleDataExport),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isExporting = false;
        });
      }
    }
  }

  /// Handle account deletion
  Future<void> _handleAccountDeletion() async {
    // Show confirmation dialog first
    final confirmed = await _showDeletionConfirmationDialog();
    if (!confirmed) return;

    setState(() {
      _isDeleting = true;
    });

    try {
      // Submit GDPR erasure request
      final apiService = ApiService();
      final result = await apiService.requestAccountDeletion(
        confirmationText: 'DELETE',
        includeAuditAnonymization: true,
      );
      
      if (result.success) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Account deletion initiated. You will receive confirmation via email.'),
              backgroundColor: Color(0xFF4CAF50),
            ),
          );
          
          // Navigate back to login or close app
          Navigator.of(context).popUntil((route) => route.isFirst);
        }
      } else {
        final error = UnifiedError.fromApiResult(result, 'account deletion');
        throw error;
      }
    } catch (e) {
      UnifiedError error;
      
      if (e is UnifiedError) {
        error = e;
      } else {
        error = const UnifiedError(
          category: ErrorCategory.technical,
          recoveryStrategy: RecoveryStrategy.escalate,
          userMessage: 'We\'re having trouble deleting your account. Please contact support.',
          errorCode: 'DELETION_ERROR',
        );
      }
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          ErrorSnackBar.build(error),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isDeleting = false;
        });
      }
    }
  }

  /// Show multi-step deletion confirmation dialog
  Future<bool> _showDeletionConfirmationDialog() async {
    // Step 1: Education and initial confirmation
    final firstConfirmed = await _showDeletionEducationDialog();
    if (!firstConfirmed) return false;
    
    // Step 2: Final confirmation with typing requirement
    final finalConfirmed = await _showFinalDeletionDialog();
    return finalConfirmed;
  }

  /// Step 1: Education about account deletion consequences
  Future<bool> _showDeletionEducationDialog() async {
    return await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text(
          'Delete Your Account',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w600,
            color: Color(0xFFFF5252),
          ),
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Warning icon and message
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFEBEE),
                  border: Border.all(color: const Color(0xFFFF5252)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  children: [
                    Icon(
                      Icons.warning_amber,
                      color: Color(0xFFFF5252),
                      size: 24,
                    ),
                    SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'This action cannot be undone',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFFFF5252),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              
              // What will be deleted
              const Text(
                'The following will be permanently deleted:',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF212121),
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                '• All your medical documents and analysis results\n'
                '• Complete chat conversation history\n'
                '• Personal profile and account information\n'
                '• Subscription and payment history\n'
                '• All preferences and settings\n'
                '• Consent records and audit logs',
                style: TextStyle(
                  fontSize: 14,
                  color: Color(0xFF757575),
                  height: 1.43,
                ),
              ),
              const SizedBox(height: 16),
              
              // Timeline and process
              const Text(
                'Deletion process:',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF212121),
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                '• Immediate: Account access revoked\n'
                '• Within 72 hours: All data permanently erased\n'
                '• Cannot be recovered or restored\n'
                '• You\'ll need to create a new account to use Serenya again',
                style: TextStyle(
                  fontSize: 14,
                  color: Color(0xFF757575),
                  height: 1.43,
                ),
              ),
              const SizedBox(height: 16),
              
              // Alternative suggestion
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFE3F2FD),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  '💡 Consider exporting your data first if you want to keep a copy for your records.',
                  style: TextStyle(
                    fontSize: 14,
                    color: Color(0xFF1976D2),
                    fontWeight: FontWeight.w500,
                    height: 1.43,
                  ),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text(
              'Cancel',
              style: TextStyle(
                color: Color(0xFF757575),
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(
              foregroundColor: const Color(0xFFFF5252),
            ),
            child: const Text(
              'I Understand, Continue',
              style: TextStyle(
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    ) ?? false;
  }

  /// Step 2: Final confirmation with typing requirement
  Future<bool> _showFinalDeletionDialog() async {
    final TextEditingController confirmationController = TextEditingController();
    bool canDelete = false;
    
    return await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text(
            'Final Confirmation',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w600,
              color: Color(0xFFFF5252),
            ),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'To confirm account deletion, please type:',
                style: TextStyle(
                  fontSize: 16,
                  color: Color(0xFF212121),
                ),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFFF5F5F5),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text(
                  'DELETE MY ACCOUNT',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF212121),
                    fontFamily: 'monospace',
                  ),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: confirmationController,
                onChanged: (value) {
                  setState(() {
                    canDelete = value.trim() == 'DELETE MY ACCOUNT';
                  });
                },
                decoration: const InputDecoration(
                  labelText: 'Type the text above',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                style: const TextStyle(fontFamily: 'monospace'),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text(
                'Cancel',
                style: TextStyle(
                  color: Color(0xFF757575),
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            TextButton(
              onPressed: canDelete ? () => Navigator.of(context).pop(true) : null,
              style: TextButton.styleFrom(
                foregroundColor: canDelete ? const Color(0xFFFF5252) : const Color(0xFFBDBDBD),
              ),
              child: const Text(
                'Delete Account',
                style: TextStyle(
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
      ),
    ) ?? false;
  }

  /// Show data export education and confirmation dialog
  Future<bool> _showExportEducationDialog() async {
    return await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text(
          'Export Your Health Data',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w600,
            color: Color(0xFF212121),
          ),
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Education content
              const Text(
                'This export includes all your personal health information:',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF212121),
                ),
              ),
              const SizedBox(height: 12),
              
              // What's included list
              const Text(
                '• Medical document analysis results\n'
                '• Chat conversation history\n'
                '• Personal profile information\n'
                '• Upload and processing history\n'
                '• Account preferences and settings',
                style: TextStyle(
                  fontSize: 14,
                  color: Color(0xFF757575),
                  height: 1.43,
                ),
              ),
              const SizedBox(height: 16),
              
              // Security warning
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF3E0),
                  border: Border.all(color: const Color(0xFFFFB74D)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  '⚠️ Important: This file contains sensitive medical information. Only share with trusted healthcare providers or family members.',
                  style: TextStyle(
                    fontSize: 14,
                    color: Color(0xFFE65100),
                    fontWeight: FontWeight.w500,
                    height: 1.43,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              
              // What happens next
              const Text(
                'What happens next:',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF212121),
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                '1. We\'ll create a comprehensive file with all your data\n'
                '2. Your device will open a sharing menu\n'
                '3. You can save to files or share directly\n'
                '4. The file is in readable JSON format',
                style: TextStyle(
                  fontSize: 14,
                  color: Color(0xFF757575),
                  height: 1.43,
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text(
              'Cancel',
              style: TextStyle(
                color: Color(0xFF757575),
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF2196F3),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: const Text(
              'Export My Data',
              style: TextStyle(
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    ) ?? false;
  }

  /// Handle contact support
  void _handleContactSupport() {
    // TODO: Open email client or external contact form
    // For now, just copy to clipboard
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Email address copied to clipboard'),
      ),
    );
  }
}