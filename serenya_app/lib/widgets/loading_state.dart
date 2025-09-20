import 'package:flutter/material.dart';
import '../core/constants/app_constants.dart';

class LoadingState extends StatelessWidget {
  final String message;
  final String? subMessage;
  final bool showProgress;
  final double? progress;

  const LoadingState({
    super.key,
    required this.message,
    this.subMessage,
    this.showProgress = false,
    this.progress,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.largePadding),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (showProgress && progress != null)
              CircularProgressIndicator(
                value: progress,
                strokeWidth: 3,
                backgroundColor: Colors.grey[300],
                valueColor: AlwaysStoppedAnimation<Color>(Colors.blue[600]!),
              )
            else
              CircularProgressIndicator(
                strokeWidth: 3,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.blue[600]!),
              ),
            const SizedBox(height: AppConstants.defaultPadding),
            Text(
              message,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.grey[800],
              ),
              textAlign: TextAlign.center,
            ),
            if (subMessage != null) ...[
              const SizedBox(height: AppConstants.smallPadding),
              Text(
                subMessage!,
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.grey[600],
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class ProcessingLoadingState extends StatefulWidget {
  final ProcessingStage stage;
  final VoidCallback? onCancel;

  const ProcessingLoadingState({
    super.key,
    required this.stage,
    this.onCancel,
  });

  @override
  State<ProcessingLoadingState> createState() => _ProcessingLoadingStateState();
}

class _ProcessingLoadingStateState extends State<ProcessingLoadingState>
    with TickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: AppConstants.mediumAnimation,
      vsync: this,
    );
    _animation = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(CurvedAnimation(
      parent: _animationController,
      curve: Curves.easeInOut,
    ));
    _animationController.repeat(reverse: true);
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final stageInfo = _getStageInfo(widget.stage);
    
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.largePadding),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                color: Colors.blue[50],
                shape: BoxShape.circle,
                border: Border.all(color: Colors.blue[200]!),
              ),
              child: AnimatedBuilder(
                animation: _animation,
                builder: (context, child) {
                  return Transform.scale(
                    scale: 0.8 + (_animation.value * 0.2),
                    child: Icon(
                      stageInfo.icon,
                      size: 48,
                      color: Colors.blue[600],
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: AppConstants.largePadding),
            Text(
              stageInfo.title,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.grey[800],
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppConstants.smallPadding),
            Text(
              stageInfo.description,
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey[600],
                height: 1.4,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppConstants.largePadding),
            LinearProgressIndicator(
              backgroundColor: Colors.grey[300],
              valueColor: AlwaysStoppedAnimation<Color>(Colors.blue[600]!),
            ),
            const SizedBox(height: AppConstants.defaultPadding),
            Text(
              stageInfo.progressText,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[600],
              ),
            ),
            if (widget.onCancel != null) ...[
              const SizedBox(height: AppConstants.largePadding),
              TextButton(
                onPressed: widget.onCancel,
                child: Text(
                  'Cancel',
                  style: TextStyle(
                    color: Colors.grey[600],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  _ProcessingStageInfo _getStageInfo(ProcessingStage stage) {
    switch (stage) {
      case ProcessingStage.uploading:
        return _ProcessingStageInfo(
          icon: Icons.cloud_upload,
          title: 'Uploading Document',
          description: 'Securely uploading your health document for analysis.',
          progressText: 'Encrypting and transferring file...',
        );
      case ProcessingStage.analyzing:
        return _ProcessingStageInfo(
          icon: Icons.psychology,
          title: 'AI Analysis in Progress',
          description: 'Our AI is analyzing your document and generating insights.',
          progressText: 'This may take up to 3 minutes...',
        );
      case ProcessingStage.interpreting:
        return _ProcessingStageInfo(
          icon: Icons.auto_stories,
          title: 'Generating Interpretation',
          description: 'Creating a personalized health interpretation for you.',
          progressText: 'Preparing your results...',
        );
      case ProcessingStage.finalizing:
        return _ProcessingStageInfo(
          icon: Icons.check_circle_outline,
          title: 'Finalizing Results',
          description: 'Adding safety checks and preparing your interpretation.',
          progressText: 'Almost done...',
        );
    }
  }
}

enum ProcessingStage {
  uploading,
  analyzing,
  interpreting,
  finalizing,
}

class _ProcessingStageInfo {
  final IconData icon;
  final String title;
  final String description;
  final String progressText;

  _ProcessingStageInfo({
    required this.icon,
    required this.title,
    required this.description,
    required this.progressText,
  });
}