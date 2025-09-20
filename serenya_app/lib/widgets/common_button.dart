import 'package:flutter/material.dart';
import '../core/constants/app_constants.dart';

class CommonButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final bool isLoading;
  final ButtonType type;
  final IconData? icon;
  final EdgeInsetsGeometry? margin;
  final double? width;

  const CommonButton({
    super.key,
    required this.text,
    this.onPressed,
    this.isLoading = false,
    this.type = ButtonType.primary,
    this.icon,
    this.margin,
    this.width,
  });

  @override
  Widget build(BuildContext context) {
    final buttonStyle = _getButtonStyle(type);
    
    return Container(
      margin: margin ?? const EdgeInsets.symmetric(horizontal: AppConstants.defaultPadding),
      width: width ?? double.infinity,
      child: ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: buttonStyle,
        child: isLoading
            ? SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(
                    type == ButtonType.primary ? Colors.white : Colors.grey[600]!,
                  ),
                ),
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 18),
                    const SizedBox(width: 8),
                  ],
                  Text(
                    text,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  ButtonStyle _getButtonStyle(ButtonType type) {
    switch (type) {
      case ButtonType.primary:
        return ElevatedButton.styleFrom(
          backgroundColor: Colors.blue[600],
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: AppConstants.defaultPadding),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppConstants.borderRadius),
          ),
          elevation: 2,
          minimumSize: const Size(double.infinity, 48),
        );
      case ButtonType.secondary:
        return ElevatedButton.styleFrom(
          backgroundColor: Colors.grey[200],
          foregroundColor: Colors.grey[800],
          padding: const EdgeInsets.symmetric(vertical: AppConstants.defaultPadding),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppConstants.borderRadius),
          ),
          elevation: 0,
          minimumSize: const Size(double.infinity, 48),
        );
      case ButtonType.danger:
        return ElevatedButton.styleFrom(
          backgroundColor: Colors.red[600],
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: AppConstants.defaultPadding),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppConstants.borderRadius),
          ),
          elevation: 2,
          minimumSize: const Size(double.infinity, 48),
        );
      case ButtonType.outline:
        return OutlinedButton.styleFrom(
          foregroundColor: Colors.blue[600],
          padding: const EdgeInsets.symmetric(vertical: AppConstants.defaultPadding),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppConstants.borderRadius),
          ),
          side: BorderSide(color: Colors.blue[600]!),
          minimumSize: const Size(double.infinity, 48),
        );
    }
  }
}

enum ButtonType {
  primary,
  secondary,
  danger,
  outline,
}