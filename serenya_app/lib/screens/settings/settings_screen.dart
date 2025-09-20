import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/app_state_provider.dart';
import '../../services/premium_user_service.dart';
import '../../services/api_service.dart';
import '../../core/security/biometric_auth_service.dart';
import '../../core/error_handling/unified_error.dart';
import '../../core/error_handling/error_widgets.dart';
import '../login_screen.dart';
import 'privacy_data_screen.dart';
import 'consent_management_screen.dart';

/// Main Settings Screen
/// 
/// Provides access to user preferences, security settings, subscription info,
/// privacy controls, and account management following the established
/// Serenya design patterns and architecture.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  // Service instances following ResultsScreen pattern
  late PremiumUserService _premiumService;
  
  // User data state
  String? _userName;
  String? _userEmail;
  String? _authProvider;
  bool _isLoadingProfile = true;
  
  // Security settings state
  bool _isBiometricAvailable = false;
  bool _isBiometricEnabled = false;
  bool _isPinSet = false;
  bool _isLoadingSecurity = true;
  
  // Premium subscription state
  PremiumUserDetails? _subscriptionDetails;
  bool _isLoadingSubscription = true;

  @override
  void initState() {
    super.initState();
    _premiumService = PremiumUserService();
    _loadAllSettings();
  }

  @override
  void dispose() {
    // Cleanup like ResultsScreen pattern
    super.dispose();
  }

  /// Load all settings data
  Future<void> _loadAllSettings() async {
    await Future.wait([
      _loadProfileData(),
      _loadSecuritySettings(),
      _loadSubscriptionData(),
    ]);
  }

  /// Load user profile data from server
  Future<void> _loadProfileData() async {
    try {
      final apiService = ApiService();
      final result = await apiService.getUserProfile();
      
      if (result.success && result.data != null) {
        setState(() {
          _userName = result.data!['name'] ?? 'Unknown User';
          _userEmail = result.data!['email'] ?? '';
          _authProvider = result.data!['auth_provider'] ?? 'Unknown';
          _isLoadingProfile = false;
        });
      } else {
        // Handle API failure using unified error handling
        final error = UnifiedError.fromApiResult(result, 'loading your profile');
        setState(() {
          _userName = 'Unable to load';
          _userEmail = 'Unable to load';
          _authProvider = 'Unknown';
          _isLoadingProfile = false;
        });
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            ErrorSnackBar.build(error, onRetry: _loadProfileData),
          );
        }
      }
    } catch (e) {
      const error = UnifiedError(
        category: ErrorCategory.technical,
        recoveryStrategy: RecoveryStrategy.retry,
        userMessage: 'We\'re having trouble connecting. Please check your network.',
        retryAfter: Duration(seconds: 5),
        errorCode: 'NETWORK_ERROR',
      );
      
      setState(() {
        _userName = 'Unable to load';
        _userEmail = 'Unable to load';
        _authProvider = 'Unknown';
        _isLoadingProfile = false;
      });
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          ErrorSnackBar.build(error, onRetry: _loadProfileData),
        );
      }
    }
  }

  /// Load security settings from BiometricAuthService
  Future<void> _loadSecuritySettings() async {
    try {
      final biometricAvailable = await BiometricAuthService.isBiometricAvailable();
      final biometricEnabled = await BiometricAuthService.isBiometricEnabled();
      final pinSet = await BiometricAuthService.isPinSet();
      
      setState(() {
        _isBiometricAvailable = biometricAvailable;
        _isBiometricEnabled = biometricEnabled;
        _isPinSet = pinSet;
        _isLoadingSecurity = false;
      });
    } catch (e) {
      setState(() {
        _isLoadingSecurity = false;
      });
    }
  }

  /// Load subscription data from PremiumUserService
  Future<void> _loadSubscriptionData() async {
    try {
      final details = await _premiumService.getPremiumUserDetails();
      setState(() {
        _subscriptionDetails = details;
        _isLoadingSubscription = false;
      });
    } catch (e) {
      setState(() {
        _isLoadingSubscription = false;
      });
    }
  }

  /// Handle biometric toggle
  Future<void> _toggleBiometric(bool enabled) async {
    try {
      await BiometricAuthService.setBiometricEnabled(enabled);
      setState(() {
        _isBiometricEnabled = enabled;
      });
    } catch (e) {
      // Show error message
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update biometric setting: $e')),
        );
      }
    }
  }

  /// Handle PIN setup/change
  Future<void> _handlePinSetup() async {
    // TODO: Navigate to PIN setup/change screen
    // This should open the existing biometric setup flow
  }

  /// Handle logout
  Future<void> _handleLogout() async {
    final appState = context.read<AppStateProvider>();
    await appState.logout();
    if (mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (context) => const LoginScreen()),
      );
    }
  }

  /// Navigate to Privacy & Data screen
  void _navigateToPrivacyData() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const PrivacyDataScreen()),
    );
  }

  /// Navigate to Consent Management screen
  void _navigateToConsentManagement() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const ConsentManagementScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FA),
      appBar: AppBar(
        title: const Text(
          'Settings',
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
            // Profile Section
            _buildProfileSection(),
            const SizedBox(height: 24),
            
            // Security Section
            _buildSecuritySection(),
            const SizedBox(height: 24),
            
            // Subscription Section (for all users)
            _buildSubscriptionSection(),
            const SizedBox(height: 24),
            
            // Privacy & Data Navigation
            _buildPrivacyDataSection(),
            const SizedBox(height: 24),
            
            // Consent Management Navigation
            _buildConsentSection(),
            const SizedBox(height: 24),
            
            // Legal & Support Section
            _buildLegalSection(),
            const SizedBox(height: 32),
            
            // Logout Button (at bottom)
            _buildLogoutButton(),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  /// Build profile information section
  Widget _buildProfileSection() {
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
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Profile',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w500,
              color: Color(0xFF212121),
            ),
          ),
          const SizedBox(height: 16),
          
          if (_isLoadingProfile)
            const Center(child: CircularProgressIndicator())
          else ...[
            // Profile header with avatar
            Row(
              children: [
                // Avatar placeholder
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: const Color(0xFFE3F2FD),
                    borderRadius: BorderRadius.circular(28),
                  ),
                  child: const Icon(
                    Icons.person,
                    size: 24,
                    color: Color(0xFF2196F3),
                  ),
                ),
                const SizedBox(width: 16),
                
                // Profile info
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _userName ?? 'Unknown User',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w500,
                          color: Color(0xFF212121),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _userEmail ?? 'No email',
                        style: const TextStyle(
                          fontSize: 14,
                          color: Color(0xFF757575),
                        ),
                      ),
                      const SizedBox(height: 8),
                      
                      // Auth provider badge
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFE8F5E8),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.verified_user,
                              size: 16,
                              color: Color(0xFF4CAF50),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              'Logged in with $_authProvider',
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                                color: Color(0xFF4CAF50),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  /// Build security settings section
  Widget _buildSecuritySection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Security',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w500,
            color: Color(0xFF212121),
          ),
        ),
        const SizedBox(height: 16),
        
        Container(
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
          child: Column(
            children: [
              // Biometric toggle (if available)
              if (_isBiometricAvailable) ...[
                _buildSecurityItem(
                  icon: Icons.fingerprint,
                  title: 'Biometric Authentication',
                  subtitle: 'Use Face ID or fingerprint to unlock',
                  trailing: Switch(
                    value: _isBiometricEnabled,
                    onChanged: _isLoadingSecurity ? null : _toggleBiometric,
                    activeThumbColor: const Color(0xFF2196F3),
                  ),
                ),
                const Divider(height: 1),
              ],
              
              // PIN setup/change
              _buildSecurityItem(
                icon: Icons.lock,
                title: _isPinSet ? 'Change PIN' : 'Set up PIN',
                subtitle: _isPinSet 
                    ? 'Update your 4-digit PIN'
                    : 'Create a 4-digit PIN for security',
                trailing: const Icon(
                  Icons.arrow_forward_ios,
                  size: 16,
                  color: Color(0xFFBDBDBD),
                ),
                onTap: _isLoadingSecurity ? null : _handlePinSetup,
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// Build security item helper
  Widget _buildSecurityItem({
    required IconData icon,
    required String title,
    required String subtitle,
    required Widget trailing,
    VoidCallback? onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: const Color(0xFFE3F2FD),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                icon,
                size: 20,
                color: const Color(0xFF2196F3),
              ),
            ),
            const SizedBox(width: 16),
            
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: Color(0xFF212121),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 14,
                      color: Color(0xFF757575),
                    ),
                  ),
                ],
              ),
            ),
            
            trailing,
          ],
        ),
      ),
    );
  }

  /// Build subscription section
  Widget _buildSubscriptionSection() {
    // Determine if user is premium and get plan details
    final isPremium = _subscriptionDetails != null;
    final planName = _subscriptionDetails?.planName ?? 'Free';
    final isActive = _subscriptionDetails?.status == 'active';
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Subscription',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w500,
            color: Color(0xFF212121),
          ),
        ),
        const SizedBox(height: 16),
        
        Container(
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
          padding: const EdgeInsets.all(16),
          child: _isLoadingSubscription
              ? const Center(child: CircularProgressIndicator())
              : Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: isPremium 
                          ? const Color(0xFFE8F5E8)  // Green for premium
                          : const Color(0xFFE3F2FD), // Blue for free
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      isPremium ? Icons.diamond : Icons.person,
                      size: 20,
                      color: isPremium 
                          ? const Color(0xFF4CAF50)  // Green for premium
                          : const Color(0xFF2196F3), // Blue for free
                    ),
                  ),
                  const SizedBox(width: 16),
                  
                  Text(
                    '$planName Plan',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: Color(0xFF212121),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              
              Padding(
                padding: const EdgeInsets.only(left: 56),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Show renewal date only for premium users
                    if (isPremium && _subscriptionDetails?.currentPeriodEnd != null) ...[
                      Text(
                        'Renews: ${_formatDate(_subscriptionDetails?.currentPeriodEnd)}',
                        style: const TextStyle(
                          fontSize: 14,
                          color: Color(0xFF757575),
                        ),
                      ),
                      const SizedBox(height: 4),
                    ],
                    
                    // Status indicator
                    Row(
                      children: [
                        Icon(
                          isPremium && isActive 
                              ? Icons.check_circle 
                              : isPremium 
                                  ? Icons.warning 
                                  : Icons.info,
                          size: 16,
                          color: isPremium && isActive
                              ? const Color(0xFF4CAF50)  // Green for active premium
                              : isPremium
                                  ? const Color(0xFFFF9800)  // Orange for inactive premium
                                  : const Color(0xFF2196F3), // Blue for free
                        ),
                        const SizedBox(width: 6),
                        Text(
                          isPremium && isActive
                              ? 'Active'
                              : isPremium
                                  ? _subscriptionDetails?.status ?? 'Inactive'
                                  : 'Active',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            color: isPremium && isActive
                                ? const Color(0xFF4CAF50)  // Green for active premium
                                : isPremium
                                    ? const Color(0xFFFF9800)  // Orange for inactive premium
                                    : const Color(0xFF2196F3), // Blue for free
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// Build privacy & data navigation section
  Widget _buildPrivacyDataSection() {
    return _buildNavigationCard(
      title: 'Privacy & Data',
      subtitle: 'Manage your data and privacy',
      icon: Icons.security,
      onTap: _navigateToPrivacyData,
    );
  }

  /// Build consent management navigation section
  Widget _buildConsentSection() {
    return _buildNavigationCard(
      title: 'Consent Management',
      subtitle: 'View your consent preferences',
      icon: Icons.assignment,
      onTap: _navigateToConsentManagement,
    );
  }

  /// Build navigation card helper
  Widget _buildNavigationCard({
    required String title,
    required String subtitle,
    required IconData icon,
    required VoidCallback onTap,
  }) {
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
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: const Color(0xFFE3F2FD),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  icon,
                  size: 20,
                  color: const Color(0xFF2196F3),
                ),
              ),
              const SizedBox(width: 16),
              
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                        color: Color(0xFF212121),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 14,
                        color: Color(0xFF757575),
                      ),
                    ),
                  ],
                ),
              ),
              
              const Icon(
                Icons.arrow_forward_ios,
                size: 16,
                color: Color(0xFFBDBDBD),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Build legal & support section
  Widget _buildLegalSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Legal & Support',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w500,
            color: Color(0xFF212121),
          ),
        ),
        const SizedBox(height: 16),
        
        Container(
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
          child: Column(
            children: [
              _buildLegalItem('Terms of Service'),
              const Divider(height: 1),
              _buildLegalItem('Privacy Policy'),
              const Divider(height: 1),
              _buildLegalItem('Contact Support'),
            ],
          ),
        ),
      ],
    );
  }

  /// Build legal item helper
  Widget _buildLegalItem(String title) {
    return InkWell(
      onTap: () {
        // TODO: Open external links to website
      },
      child: Container(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  fontSize: 16,
                  color: Color(0xFF212121),
                ),
              ),
            ),
            const Icon(
              Icons.open_in_new,
              size: 16,
              color: Color(0xFFBDBDBD),
            ),
          ],
        ),
      ),
    );
  }

  /// Build logout button
  Widget _buildLogoutButton() {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton(
        onPressed: _handleLogout,
        style: OutlinedButton.styleFrom(
          side: const BorderSide(color: Color(0xFFE0E0E0)),
          foregroundColor: const Color(0xFFFF5252),
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
        child: const Text(
          'Log Out',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }

  /// Format date helper
  String _formatDate(DateTime? date) {
    if (date == null) return 'Unknown';
    return '${date.month}/${date.day}/${date.year}';
  }
}