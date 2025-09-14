import 'package:flutter/material.dart';
import '../../../core/security/biometric_auth_service.dart';
import 'dart:io';

/// Biometric Setup Dialog with Platform-Specific Guidance
/// 
/// Provides clear user guidance for biometric authentication setup
/// with platform-specific instructions and fallback options
class BiometricSetupDialog extends StatefulWidget {
  final VoidCallback? onSetupComplete;
  final VoidCallback? onSkipped;
  
  const BiometricSetupDialog({
    Key? key,
    this.onSetupComplete,
    this.onSkipped,
  }) : super(key: key);

  @override
  State<BiometricSetupDialog> createState() => _BiometricSetupDialogState();
}

class _BiometricSetupDialogState extends State<BiometricSetupDialog> {
  bool _isChecking = false;
  bool _biometricAvailable = false;
  String _biometricType = 'Biometric';

  @override
  void initState() {
    super.initState();
    _checkBiometricAvailability();
  }

  Future<void> _checkBiometricAvailability() async {
    setState(() {
      _isChecking = true;
    });

    try {
      final isAvailable = await BiometricAuthService.isBiometricAvailable();
      
      setState(() {
        _biometricAvailable = isAvailable;
        _biometricType = _getBiometricDisplayName();
        _isChecking = false;
      });
    } catch (e) {
      setState(() {
        _biometricAvailable = false;
        _isChecking = false;
      });
    }
  }

  String _getBiometricDisplayName() {
    if (Platform.isIOS) {
      return 'Face ID or Touch ID';
    } else if (Platform.isAndroid) {
      return 'Fingerprint or Face Unlock';
    }
    return 'Biometric Authentication';
  }

  Future<void> _setupBiometric() async {
    try {
      final result = await BiometricAuthService.authenticate(
        reason: 'Set up biometric authentication for secure access to your medical data',
      );
      
      if (result.success) {
        widget.onSetupComplete?.call();
        Navigator.of(context).pop();
      } else {
        _showSetupError(result.failureReason ?? 'Biometric setup failed');
      }
    } catch (e) {
      _showSetupError('Could not setup biometric authentication: $e');
    }
  }

  void _showSetupError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.error_outline, color: Colors.white),
            const SizedBox(width: 8),
            Expanded(child: Text(message)),
          ],
        ),
        backgroundColor: Colors.orange[700],
        duration: const Duration(seconds: 4),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isChecking) {
      return _buildLoadingDialog();
    }

    if (!_biometricAvailable) {
      return _buildNotAvailableDialog();
    }

    return _buildSetupDialog();
  }

  Widget _buildLoadingDialog() {
    return const AlertDialog(
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 16),
          Text('Checking biometric capabilities...'),
        ],
      ),
    );
  }

  Widget _buildNotAvailableDialog() {
    return AlertDialog(
      title: const Text('Biometric Setup'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.info_outline,
            color: Colors.blue[600],
            size: 48,
          ),
          const SizedBox(height: 16),
          const Text(
            'Biometric authentication is not available on this device.',
            style: TextStyle(fontSize: 16),
          ),
          const SizedBox(height: 12),
          Text(
            'You can still use Serenya securely with your device PIN when needed.',
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey[600],
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () {
            widget.onSkipped?.call();
            Navigator.of(context).pop();
          },
          child: const Text('Continue'),
        ),
      ],
    );
  }

  Widget _buildSetupDialog() {
    return AlertDialog(
      title: const Text('Secure Your Medical Data'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: Colors.blue[100],
              borderRadius: BorderRadius.circular(32),
            ),
            child: Icon(
              _getBiometricIcon(),
              color: Colors.blue[600],
              size: 32,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Enable $_biometricType for quick and secure access to your health information.',
            style: const TextStyle(fontSize: 16, height: 1.4),
          ),
          const SizedBox(height: 12),
          _buildSecurityFeatures(),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () {
            widget.onSkipped?.call();
            Navigator.of(context).pop();
          },
          child: const Text('Skip for Now'),
        ),
        ElevatedButton(
          onPressed: _setupBiometric,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.blue[600],
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          ),
          child: Text('Enable $_biometricType'),
        ),
      ],
    );
  }

  Widget _buildSecurityFeatures() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildFeatureItem(
          icon: Icons.security,
          text: 'Bank-level security for medical data',
        ),
        const SizedBox(height: 8),
        _buildFeatureItem(
          icon: Icons.speed,
          text: 'Quick access without passwords',
        ),
        const SizedBox(height: 8),
        _buildFeatureItem(
          icon: Icons.privacy_tip,
          text: 'Your biometric data stays on device',
        ),
      ],
    );
  }

  Widget _buildFeatureItem({required IconData icon, required String text}) {
    return Row(
      children: [
        Icon(
          icon,
          size: 16,
          color: Colors.green[600],
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey[700],
            ),
          ),
        ),
      ],
    );
  }

  IconData _getBiometricIcon() {
    if (Platform.isIOS) {
      if (_biometricType.contains('Face')) return Icons.face;
      return Icons.fingerprint;
    } else {
      if (_biometricType.contains('Face')) return Icons.face;
      return Icons.fingerprint;
    }
  }

}