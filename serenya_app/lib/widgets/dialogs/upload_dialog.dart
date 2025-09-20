import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers/health_data_provider.dart';
import '../../core/utils/encryption_utils.dart';
import '../../services/processing_service.dart';
import '../../services/notification_service.dart';

/// Reusable Upload Dialog Widget
/// 
/// Provides file source selection and upload functionality that can be used
/// from multiple places in the app (FAB, menu, etc.)
class UploadDialog extends StatefulWidget {
  final VoidCallback? onUploadStarted;
  final VoidCallback? onUploadCompleted;

  const UploadDialog({
    super.key,
    this.onUploadStarted,
    this.onUploadCompleted,
  });

  @override
  State<UploadDialog> createState() => _UploadDialogState();
}

class _UploadDialogState extends State<UploadDialog> {
  final ProcessingService _processingService = ProcessingService();
  final NotificationService _notificationService = NotificationService();
  final ImagePicker _imagePicker = ImagePicker();
  
  bool _isUploading = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.defaultPadding),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Select Document Source',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: Colors.grey[800],
            ),
          ),
          const SizedBox(height: AppConstants.defaultPadding),
          
          if (_isUploading) ...[
            const Center(
              child: Column(
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Uploading document...'),
                ],
              ),
            ),
          ] else ...[
            _buildSourceOption(
              icon: Icons.camera_alt,
              title: 'Take Photo',
              subtitle: 'Capture lab results with camera',
              onTap: () => _selectFromCamera(),
            ),
            _buildSourceOption(
              icon: Icons.photo_library,
              title: 'Choose from Gallery',
              subtitle: 'Select existing photo',
              onTap: () => _selectFromGallery(),
            ),
            _buildSourceOption(
              icon: Icons.description,
              title: 'Browse Files',
              subtitle: 'Select PDF or image file',
              onTap: () => _selectFromFiles(),
            ),
          ],
          
          const SizedBox(height: AppConstants.smallPadding),
        ],
      ),
    );
  }

  Widget _buildSourceOption({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return ListTile(
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: Colors.blue[50],
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(
          icon,
          color: Colors.blue[600],
          size: 24,
        ),
      ),
      title: Text(
        title,
        style: TextStyle(
          fontWeight: FontWeight.w600,
          color: Colors.grey[800],
        ),
      ),
      subtitle: Text(
        subtitle,
        style: TextStyle(
          color: Colors.grey[600],
          fontSize: 13,
        ),
      ),
      onTap: onTap,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
      ),
    );
  }

  Future<void> _selectFromCamera() async {
    try {
      final cameraStatus = await Permission.camera.request();
      if (cameraStatus != PermissionStatus.granted) {
        _showError('Camera permission required to take photos');
        return;
      }

      final XFile? image = await _imagePicker.pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
        maxWidth: 2048,
        maxHeight: 2048,
      );

      if (image == null) return;

      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final fileName = 'health_document_$timestamp.jpg';

      await _processFile(File(image.path), fileName);
      
    } catch (e) {
      _showError('Failed to capture photo: ${e.toString()}');
    }
  }

  Future<void> _selectFromGallery() async {
    try {
      final XFile? image = await _imagePicker.pickImage(
        source: ImageSource.gallery,
      );

      if (image == null) return;

      final originalName = image.name;
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final extension = originalName.split('.').last;
      final fileName = 'health_document_$timestamp.$extension';

      await _processFile(File(image.path), fileName);
      
    } catch (e) {
      _showError('Failed to select from gallery: ${e.toString()}');
    }
  }

  Future<void> _selectFromFiles() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: AppConstants.supportedFileTypes,
        allowMultiple: false,
      );

      if (result == null || result.files.isEmpty) return;

      final platformFile = result.files.first;
      if (platformFile.path == null) return;

      await _processFile(File(platformFile.path!), platformFile.name);
      
    } catch (e) {
      _showError('Failed to select file: ${e.toString()}');
    }
  }

  Future<void> _processFile(File file, String fileName) async {
    // Validate file
    final validation = await _validateFile(file, fileName);
    if (!validation.isValid) {
      _showError(validation.errorMessage!);
      return;
    }

    setState(() {
      _isUploading = true;
    });

    widget.onUploadStarted?.call();

    try {
      if (!mounted) return;
      final dataProvider = context.read<HealthDataProvider>();
      
      final result = await _processingService.processDocument(
        file: file,
        fileName: fileName,
        dataProvider: dataProvider,
      );

      if (result.success) {
        // Close dialog
        if (mounted) {
          Navigator.of(context).pop();
        }
        
        widget.onUploadCompleted?.call();
        
        await _notificationService.showNotification(
          title: 'Upload Complete',
          body: 'Your document $fileName is now being processed.',
        );
      } else {
        _showError('Upload failed: ${result.message}');
      }
      
    } catch (e) {
      _showError('Upload failed: ${e.toString()}');
    } finally {
      if (mounted) {
        setState(() {
          _isUploading = false;
        });
      }
    }
  }

  Future<ValidationResult> _validateFile(File file, String fileName) async {
    if (!EncryptionUtils.isValidFileType(fileName)) {
      return ValidationResult(
        isValid: false,
        errorMessage: 'File type not supported. Please use PDF, JPG, JPEG, or PNG files.',
      );
    }

    final fileSize = await file.length();
    if (!EncryptionUtils.isValidFileSize(fileSize)) {
      const maxSizeMB = AppConstants.maxFileSizeBytes / (1024 * 1024);
      return ValidationResult(
        isValid: false,
        errorMessage: 'File too large. Maximum size is ${maxSizeMB.toInt()}MB.',
      );
    }

    if (!await file.exists()) {
      return ValidationResult(
        isValid: false,
        errorMessage: 'Selected file could not be accessed.',
      );
    }

    return ValidationResult(isValid: true);
  }

  void _showError(String message) {
    HapticFeedback.lightImpact();
    
    if (mounted) {
      showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Row(
            children: [
              Icon(
                Icons.error_outline,
                color: Colors.red,
              ),
              SizedBox(width: 8),
              Text('Upload Error'),
            ],
          ),
          content: Text(message),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('OK'),
            ),
          ],
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      );
    }
  }
}

class ValidationResult {
  final bool isValid;
  final String? errorMessage;

  ValidationResult({required this.isValid, this.errorMessage});
}