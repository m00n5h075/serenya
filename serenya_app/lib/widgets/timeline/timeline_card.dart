import 'package:flutter/material.dart';
import '../../models/local_database_models.dart';
import '../../core/constants/app_constants.dart';
import '../../core/utils/encryption_utils.dart';
import '../confidence_indicator.dart';

class DocumentCard extends StatelessWidget {
  final SerenyaContent document;
  final VoidCallback? onTap;
  final VoidCallback? onDelete;
  final bool showConfidence;

  const DocumentCard({
    super.key,
    required this.document,
    this.onTap,
    this.onDelete,
    this.showConfidence = true,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppConstants.borderRadius),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppConstants.borderRadius),
        child: Padding(
          padding: const EdgeInsets.all(AppConstants.defaultPadding),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    _getFileIcon(document.fileType),
                    color: Colors.blue[600],
                    size: 24,
                  ),
                  const SizedBox(width: AppConstants.smallPadding),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          document.fileName ?? 'Untitled Document',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: Colors.grey[800],
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _formatUploadDate(document.uploadDate),
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey[600],
                          ),
                        ),
                      ],
                    ),
                  ),
                  _buildStatusChip(document.processingStatus ?? ProcessingStatus.completed),
                  if (onDelete != null) ...[
                    const SizedBox(width: AppConstants.smallPadding),
                    IconButton(
                      onPressed: onDelete,
                      icon: const Icon(Icons.delete_outline),
                      color: Colors.red[400],
                      iconSize: 20,
                      constraints: const BoxConstraints(
                        minWidth: 32,
                        minHeight: 32,
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: AppConstants.smallPadding),
              Row(
                children: [
                  Text(
                    '${(document.fileType ?? 'unknown').toUpperCase()} • ${EncryptionUtils.formatFileSize(document.fileSize ?? 0)}',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                  const Spacer(),
                  if (showConfidence && document.aiConfidenceScore != null)
                    ConfidenceIndicator(
                      confidenceScore: document.aiConfidenceScore!,
                      showDetails: false,
                    ),
                ],
              ),
              if (document.interpretationText != null) ...[
                const SizedBox(height: AppConstants.smallPadding),
                Container(
                  padding: const EdgeInsets.all(AppConstants.smallPadding),
                  decoration: BoxDecoration(
                    color: Colors.blue[50],
                    borderRadius: BorderRadius.circular(AppConstants.borderRadius / 2),
                  ),
                  child: Text(
                    document.interpretationText!,
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.blue[800],
                      height: 1.3,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatusChip(ProcessingStatus status) {
    final statusInfo = _getStatusInfo(status);
    
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppConstants.smallPadding,
        vertical: 4,
      ),
      decoration: BoxDecoration(
        color: statusInfo.color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: statusInfo.color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (status == ProcessingStatus.processing || status == ProcessingStatus.retrying)
            SizedBox(
              width: 12,
              height: 12,
              child: CircularProgressIndicator(
                strokeWidth: 1.5,
                valueColor: AlwaysStoppedAnimation<Color>(statusInfo.color),
              ),
            )
          else
            Icon(
              statusInfo.icon,
              size: 12,
              color: statusInfo.color,
            ),
          const SizedBox(width: 4),
          Text(
            statusInfo.label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: statusInfo.color,
            ),
          ),
        ],
      ),
    );
  }

  _StatusInfo _getStatusInfo(ProcessingStatus status) {
    switch (status) {
      case ProcessingStatus.pending:
        return _StatusInfo(
          color: Colors.orange[600]!,
          icon: Icons.schedule,
          label: 'Pending',
        );
      case ProcessingStatus.uploaded:
        return _StatusInfo(
          color: Colors.blue[400]!,
          icon: Icons.cloud_done,
          label: 'Uploaded',
        );
      case ProcessingStatus.processing:
        return _StatusInfo(
          color: Colors.blue[600]!,
          icon: Icons.sync,
          label: 'Processing',
        );
      case ProcessingStatus.completed:
        return _StatusInfo(
          color: Colors.green[600]!,
          icon: Icons.check_circle,
          label: 'Complete',
        );
      case ProcessingStatus.failed:
        return _StatusInfo(
          color: Colors.red[600]!,
          icon: Icons.error,
          label: 'Failed',
        );
      case ProcessingStatus.timeout:
        return _StatusInfo(
          color: Colors.red[400]!,
          icon: Icons.timer_off,
          label: 'Timeout',
        );
      case ProcessingStatus.retrying:
        return _StatusInfo(
          color: Colors.orange[700]!,
          icon: Icons.refresh,
          label: 'Retrying',
        );
    }
  }

  IconData _getFileIcon(String? fileType) {
    if (fileType == null) return Icons.description;
    switch (fileType.toLowerCase()) {
      case 'pdf':
        return Icons.picture_as_pdf;
      case 'jpg':
      case 'jpeg':
      case 'png':
        return Icons.image;
      default:
        return Icons.description;
    }
  }

  String _formatUploadDate(DateTime? date) {
    if (date == null) return 'Unknown';
    final now = DateTime.now();
    final difference = now.difference(date);
    
    if (difference.inDays > 0) {
      return '${difference.inDays} day${difference.inDays > 1 ? 's' : ''} ago';
    } else if (difference.inHours > 0) {
      return '${difference.inHours} hour${difference.inHours > 1 ? 's' : ''} ago';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes} minute${difference.inMinutes > 1 ? 's' : ''} ago';
    } else {
      return 'Just now';
    }
  }
}

class _StatusInfo {
  final Color color;
  final IconData icon;
  final String label;

  _StatusInfo({
    required this.color,
    required this.icon,
    required this.label,
  });
}