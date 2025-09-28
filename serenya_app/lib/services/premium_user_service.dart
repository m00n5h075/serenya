import 'dart:async';
import 'package:flutter/foundation.dart';
import '../api/endpoints/subscriptions_api.dart';
import '../api/api_client.dart';
import '../api/error_handler.dart';

/// Premium User Detection Service with Caching
/// 
/// Provides efficient premium status detection with caching to avoid
/// repeated API calls. Features:
/// - Memory caching with TTL (time-to-live)
/// - Automatic cache invalidation
/// - Background refresh capability
/// - Error handling with graceful degradation
/// - Dependency injection for ApiClient
class PremiumUserService {
  final SubscriptionsApi _subscriptionsApi;
  
  // Cache state
  bool? _cachedPremiumStatus;
  DateTime? _cacheTimestamp;
  SubscriptionDetails? _cachedSubscription;
  
  // Cache configuration
  static const Duration _cacheValidityDuration = Duration(minutes: 15);
  static const Duration _backgroundRefreshInterval = Duration(hours: 1);
  
  // Background refresh timer
  Timer? _backgroundRefreshTimer;
  
  /// Constructor that accepts ApiClient dependency
  PremiumUserService({required ApiClient apiClient})
      : _subscriptionsApi = SubscriptionsApi(
          apiClient.dio,
          ApiErrorHandler(),
        ) {
    _startBackgroundRefresh();
  }

  /// Check if user is premium with caching
  /// 
  /// Returns cached result if available and valid, otherwise fetches from API
  Future<bool> isPremiumUser() async {
    try {
      // Check if cache is valid
      if (_isCacheValid()) {
        _log('Returning cached premium status: $_cachedPremiumStatus');
        return _cachedPremiumStatus!;
      }

      // Cache is invalid or missing, fetch from API
      _log('Cache invalid or missing, fetching premium status from API');
      final premiumStatus = await _fetchPremiumStatusFromAPI();
      
      // Update cache
      _updateCache(premiumStatus);
      
      return premiumStatus;
      
    } catch (e) {
      _log('Error checking premium status: $e', isError: true);
      
      // Graceful degradation: return cached value if available, otherwise false
      if (_cachedPremiumStatus != null) {
        _log('Returning stale cached premium status due to error: $_cachedPremiumStatus');
        return _cachedPremiumStatus!;
      }
      
      _log('No cached status available, defaulting to non-premium');
      return false;
    }
  }

  /// Get premium user details with caching
  /// 
  /// Returns full subscription details for premium users
  Future<PremiumUserDetails?> getPremiumUserDetails() async {
    try {
      // Check if user is premium first
      final isPremium = await isPremiumUser();
      if (!isPremium) {
        return null;
      }

      // Return cached subscription if available and valid
      if (_isCacheValid() && _cachedSubscription != null) {
        _log('Returning cached subscription details');
        return PremiumUserDetails.fromSubscription(_cachedSubscription!);
      }

      // Fetch fresh subscription details
      _log('Fetching fresh subscription details from API');
      final subscriptionResult = await _subscriptionsApi.getCurrentSubscription();
      
      if (!subscriptionResult.success) {
        _log('Failed to fetch subscription details: ${subscriptionResult.error}', isError: true);
        
        // Return cached subscription if available
        if (_cachedSubscription != null) {
          _log('Returning stale cached subscription details');
          return PremiumUserDetails.fromSubscription(_cachedSubscription!);
        }
        
        return null;
      }

      // Update cached subscription
      _cachedSubscription = subscriptionResult.data!;
      
      return PremiumUserDetails.fromSubscription(_cachedSubscription!);
      
    } catch (e) {
      _log('Error getting premium user details: $e', isError: true);
      
      // Return cached subscription if available
      if (_cachedSubscription != null) {
        _log('Returning stale cached subscription details due to error');
        return PremiumUserDetails.fromSubscription(_cachedSubscription!);
      }
      
      return null;
    }
  }

  /// Check if user has specific premium feature
  Future<bool> hasFeature(PremiumFeature feature) async {
    try {
      final details = await getPremiumUserDetails();
      if (details == null) {
        return false;
      }

      switch (feature) {
        case PremiumFeature.doctorReports:
          return details.hasAdvancedAnalysis;
        case PremiumFeature.unlimitedUploads:
          return details.maxDocuments == -1 || details.maxDocuments > 100;
        case PremiumFeature.premiumSupport:
          return details.hasPremiumSupport;
        case PremiumFeature.extendedHistory:
          return details.hasAdvancedAnalysis; // Assume extended history comes with advanced analysis
      }
      
    } catch (e) {
      _log('Error checking feature availability: $e', isError: true);
      return false;
    }
  }

  /// Invalidate cache and force refresh
  /// 
  /// Useful when subscription status might have changed (e.g., after purchase)
  Future<void> invalidateCacheAndRefresh() async {
    _log('Invalidating cache and forcing refresh');
    _clearCache();
    await isPremiumUser(); // This will fetch fresh data
  }

  /// Start background refresh timer
  void _startBackgroundRefresh() {
    _backgroundRefreshTimer = Timer.periodic(_backgroundRefreshInterval, (timer) {
      _performBackgroundRefresh();
    });
    _log('Started background refresh timer');
  }

  /// Perform background refresh
  Future<void> _performBackgroundRefresh() async {
    try {
      _log('Performing background refresh of premium status');
      
      // Fetch fresh data in background
      final premiumStatus = await _fetchPremiumStatusFromAPI();
      _updateCache(premiumStatus);
      
      _log('Background refresh completed successfully');
      
    } catch (e) {
      _log('Background refresh failed: $e', isError: true);
      // Don't clear cache on background refresh failure
    }
  }

  /// Fetch premium status from API
  Future<bool> _fetchPremiumStatusFromAPI() async {
    final subscriptionResult = await _subscriptionsApi.getCurrentSubscription();
    
    if (!subscriptionResult.success) {
      throw Exception('Failed to fetch subscription: ${subscriptionResult.error}');
    }

    final subscription = subscriptionResult.data!;
    _cachedSubscription = subscription;
    
    // Consider user premium if subscription is active and has advanced features
    final isPremium = subscription.status == 'active' && 
                     (subscription.limits.advancedAnalysis || 
                      subscription.limits.premiumSupport);
    
    _log('Fetched premium status from API: $isPremium');
    return isPremium;
  }

  /// Check if cache is valid
  bool _isCacheValid() {
    if (_cachedPremiumStatus == null || _cacheTimestamp == null) {
      return false;
    }
    
    final age = DateTime.now().difference(_cacheTimestamp!);
    final isValid = age < _cacheValidityDuration;
    
    if (!isValid) {
      _log('Cache expired (age: ${age.inMinutes} minutes)');
    }
    
    return isValid;
  }

  /// Update cache with new premium status
  void _updateCache(bool premiumStatus) {
    _cachedPremiumStatus = premiumStatus;
    _cacheTimestamp = DateTime.now();
    _log('Updated cache with premium status: $premiumStatus');
  }

  /// Clear cache
  void _clearCache() {
    _cachedPremiumStatus = null;
    _cacheTimestamp = null;
    _cachedSubscription = null;
    _log('Cache cleared');
  }

  /// Dispose service and clean up resources
  void dispose() {
    _backgroundRefreshTimer?.cancel();
    _backgroundRefreshTimer = null;
    _clearCache();
    _log('Premium user service disposed');
  }

  /// Log messages with consistent formatting
  void _log(String message, {bool isError = false}) {
    if (kDebugMode || isError) {
      final timestamp = DateTime.now().toIso8601String();
      final level = isError ? 'ERROR' : 'INFO';
      debugPrint('[$timestamp] PREMIUM_USER_SERVICE $level: $message');
    }
  }
}

/// Premium user details extracted from subscription
class PremiumUserDetails {
  final String planName;
  final String status;
  final int maxDocuments;
  final int maxChatMessages;
  final bool hasPremiumSupport;
  final bool hasAdvancedAnalysis;
  final DateTime currentPeriodEnd;

  PremiumUserDetails({
    required this.planName,
    required this.status,
    required this.maxDocuments,
    required this.maxChatMessages,
    required this.hasPremiumSupport,
    required this.hasAdvancedAnalysis,
    required this.currentPeriodEnd,
  });

  factory PremiumUserDetails.fromSubscription(SubscriptionDetails subscription) {
    return PremiumUserDetails(
      planName: subscription.planName,
      status: subscription.status,
      maxDocuments: subscription.limits.maxDocuments,
      maxChatMessages: subscription.limits.maxChatMessages,
      hasPremiumSupport: subscription.limits.premiumSupport,
      hasAdvancedAnalysis: subscription.limits.advancedAnalysis,
      currentPeriodEnd: subscription.currentPeriodEnd,
    );
  }
}

/// Premium features that can be checked
enum PremiumFeature {
  doctorReports,
  unlimitedUploads,
  premiumSupport,
  extendedHistory,
}