import 'package:dio/dio.dart';
import '../api_client.dart';
import '../error_handler.dart';
import '../../core/security/local_audit_logger.dart';

/// Subscriptions API endpoints implementation
/// 
/// Handles all subscription and billing-related API calls including:
/// - Subscription plan management
/// - Billing information and payment methods
/// - Subscription status and usage tracking
/// - Plan upgrades and downgrades
/// - Subscription audit logging
class SubscriptionsApi {
  final Dio _dio;
  final ApiErrorHandler _errorHandler;

  SubscriptionsApi(this._dio, this._errorHandler);

  /// GET /subscriptions/current
  /// Get current user's subscription details
  Future<ApiResult<SubscriptionDetails>> getCurrentSubscription() async {
    try {
      final response = await _dio.get('/subscriptions/current');

      await _logSubscriptionOperation('current_subscription_fetched', {});

      return ApiResult.success(
        SubscriptionDetails.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Get current subscription');
    } catch (e) {
      return ApiResult.failed('Unexpected error getting subscription: $e');
    }
  }

  /// GET /subscriptions/plans
  /// List available subscription plans
  Future<ApiResult<SubscriptionPlansResponse>> getAvailablePlans() async {
    try {
      final response = await _dio.get('/subscriptions/plans');

      await _logSubscriptionOperation('plans_listed', {});

      return ApiResult.success(
        SubscriptionPlansResponse.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Get available plans');
    } catch (e) {
      return ApiResult.failed('Unexpected error getting plans: $e');
    }
  }

  /// POST /subscriptions/checkout
  /// Create checkout session for plan upgrade/subscription
  Future<ApiResult<CheckoutSessionResponse>> createCheckoutSession({
    required String planId,
    String? couponCode,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final requestData = {
        'plan_id': planId,
        if (couponCode != null) 'coupon_code': couponCode,
        if (metadata != null) 'metadata': metadata,
      };

      final response = await _dio.post(
        '/subscriptions/checkout',
        data: requestData,
      );

      await _logSubscriptionOperation('checkout_session_created', {
        'plan_id': planId,
        'has_coupon': couponCode != null,
      });

      return ApiResult.success(
        CheckoutSessionResponse.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Create checkout session');
    } catch (e) {
      return ApiResult.failed('Unexpected error creating checkout session: $e');
    }
  }

  /// PUT /subscriptions/current
  /// Update current subscription
  Future<ApiResult<SubscriptionDetails>> updateSubscription({
    String? planId,
    bool? autoRenew,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final requestData = <String, dynamic>{};
      if (planId != null) requestData['plan_id'] = planId;
      if (autoRenew != null) requestData['auto_renew'] = autoRenew;
      if (metadata != null) requestData['metadata'] = metadata;

      if (requestData.isEmpty) {
        return ApiResult.failed('No subscription data to update');
      }

      final response = await _dio.put(
        '/subscriptions/current',
        data: requestData,
      );

      await _logSubscriptionOperation('subscription_updated', {
        'updated_fields': requestData.keys.toList(),
      });

      return ApiResult.success(
        SubscriptionDetails.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Update subscription');
    } catch (e) {
      return ApiResult.failed('Unexpected error updating subscription: $e');
    }
  }

  /// DELETE /subscriptions/current
  /// Cancel current subscription
  Future<ApiResult<SubscriptionDetails>> cancelSubscription({
    bool? cancelImmediately,
    String? cancellationReason,
    String? feedback,
  }) async {
    try {
      final requestData = <String, dynamic>{};
      if (cancelImmediately != null) requestData['cancel_immediately'] = cancelImmediately;
      if (cancellationReason != null) requestData['cancellation_reason'] = cancellationReason;
      if (feedback != null) requestData['feedback'] = feedback;

      final response = await _dio.delete(
        '/subscriptions/current',
        data: requestData.isNotEmpty ? requestData : null,
      );

      await _logSubscriptionOperation('subscription_cancelled', {
        'cancel_immediately': cancelImmediately ?? false,
        'has_reason': cancellationReason != null,
        'has_feedback': feedback != null,
      });

      return ApiResult.success(
        SubscriptionDetails.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Cancel subscription');
    } catch (e) {
      return ApiResult.failed('Unexpected error cancelling subscription: $e');
    }
  }

  /// GET /subscriptions/usage
  /// Get subscription usage statistics
  Future<ApiResult<UsageStatistics>> getUsageStatistics({
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (startDate != null) queryParams['start_date'] = startDate.toIso8601String();
      if (endDate != null) queryParams['end_date'] = endDate.toIso8601String();

      final response = await _dio.get(
        '/subscriptions/usage',
        queryParameters: queryParams,
      );

      await _logSubscriptionOperation('usage_statistics_fetched', {
        'query_params': queryParams,
      });

      return ApiResult.success(
        UsageStatistics.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Get usage statistics');
    } catch (e) {
      return ApiResult.failed('Unexpected error getting usage statistics: $e');
    }
  }

  /// GET /subscriptions/billing-history
  /// Get billing history
  Future<ApiResult<BillingHistoryResponse>> getBillingHistory({
    int? limit,
    String? cursor,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (limit != null) queryParams['limit'] = limit;
      if (cursor != null) queryParams['cursor'] = cursor;
      if (startDate != null) queryParams['start_date'] = startDate.toIso8601String();
      if (endDate != null) queryParams['end_date'] = endDate.toIso8601String();

      final response = await _dio.get(
        '/subscriptions/billing-history',
        queryParameters: queryParams,
      );

      await _logSubscriptionOperation('billing_history_fetched', {
        'query_params': queryParams,
      });

      return ApiResult.success(
        BillingHistoryResponse.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Get billing history');
    } catch (e) {
      return ApiResult.failed('Unexpected error getting billing history: $e');
    }
  }

  /// POST /subscriptions/payment-methods
  /// Add payment method
  Future<ApiResult<PaymentMethod>> addPaymentMethod({
    required String paymentMethodToken,
    bool? setAsDefault,
  }) async {
    try {
      final requestData = {
        'payment_method_token': paymentMethodToken,
        if (setAsDefault != null) 'set_as_default': setAsDefault,
      };

      final response = await _dio.post(
        '/subscriptions/payment-methods',
        data: requestData,
      );

      await _logSubscriptionOperation('payment_method_added', {
        'set_as_default': setAsDefault ?? false,
      });

      return ApiResult.success(
        PaymentMethod.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Add payment method');
    } catch (e) {
      return ApiResult.failed('Unexpected error adding payment method: $e');
    }
  }

  /// GET /subscriptions/payment-methods
  /// List payment methods
  Future<ApiResult<PaymentMethodsResponse>> getPaymentMethods() async {
    try {
      final response = await _dio.get('/subscriptions/payment-methods');

      await _logSubscriptionOperation('payment_methods_listed', {});

      return ApiResult.success(
        PaymentMethodsResponse.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Get payment methods');
    } catch (e) {
      return ApiResult.failed('Unexpected error getting payment methods: $e');
    }
  }

  /// DELETE /subscriptions/payment-methods/{payment_method_id}
  /// Remove payment method
  Future<ApiResult<void>> removePaymentMethod(String paymentMethodId) async {
    try {
      final response = await _dio.delete('/subscriptions/payment-methods/$paymentMethodId');

      await _logSubscriptionOperation('payment_method_removed', {
        'payment_method_id': paymentMethodId,
      });

      return ApiResult.success(
        null,
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Remove payment method');
    } catch (e) {
      return ApiResult.failed('Unexpected error removing payment method: $e');
    }
  }

  /// Log subscription operation for audit trail
  Future<void> _logSubscriptionOperation(String operation, Map<String, dynamic> context) async {
    await LocalAuditLogger.logSecurityEvent(
      'subscription_api_operation',
      additionalData: {
        'operation': operation,
        'context': context,
        'timestamp': DateTime.now().toIso8601String(),
      },
    );
  }

  /// Reset API state
  Future<void> reset() async {
    // No persistent state to reset for subscriptions API
  }
}

/// Subscription details model
class SubscriptionDetails {
  final String subscriptionId;
  final String planId;
  final String planName;
  final String status;
  final double monthlyPrice;
  final String currency;
  final DateTime currentPeriodStart;
  final DateTime currentPeriodEnd;
  final bool autoRenew;
  final DateTime? cancelledAt;
  final String? cancellationReason;
  final Map<String, dynamic>? metadata;
  final SubscriptionLimits limits;

  SubscriptionDetails({
    required this.subscriptionId,
    required this.planId,
    required this.planName,
    required this.status,
    required this.monthlyPrice,
    required this.currency,
    required this.currentPeriodStart,
    required this.currentPeriodEnd,
    required this.autoRenew,
    this.cancelledAt,
    this.cancellationReason,
    this.metadata,
    required this.limits,
  });

  factory SubscriptionDetails.fromJson(Map<String, dynamic> json) {
    return SubscriptionDetails(
      subscriptionId: json['subscription_id'] as String,
      planId: json['plan_id'] as String,
      planName: json['plan_name'] as String,
      status: json['status'] as String,
      monthlyPrice: (json['monthly_price'] as num).toDouble(),
      currency: json['currency'] as String,
      currentPeriodStart: DateTime.parse(json['current_period_start'] as String),
      currentPeriodEnd: DateTime.parse(json['current_period_end'] as String),
      autoRenew: json['auto_renew'] as bool,
      cancelledAt: json['cancelled_at'] != null ? DateTime.parse(json['cancelled_at'] as String) : null,
      cancellationReason: json['cancellation_reason'] as String?,
      metadata: json['metadata'] as Map<String, dynamic>?,
      limits: SubscriptionLimits.fromJson(json['limits'] as Map<String, dynamic>),
    );
  }
}

/// Subscription limits model
class SubscriptionLimits {
  final int maxDocuments;
  final int maxChatMessages;
  final int maxStorageGB;
  final bool premiumSupport;
  final bool advancedAnalysis;

  SubscriptionLimits({
    required this.maxDocuments,
    required this.maxChatMessages,
    required this.maxStorageGB,
    required this.premiumSupport,
    required this.advancedAnalysis,
  });

  factory SubscriptionLimits.fromJson(Map<String, dynamic> json) {
    return SubscriptionLimits(
      maxDocuments: json['max_documents'] as int,
      maxChatMessages: json['max_chat_messages'] as int,
      maxStorageGB: json['max_storage_gb'] as int,
      premiumSupport: json['premium_support'] as bool,
      advancedAnalysis: json['advanced_analysis'] as bool,
    );
  }
}

/// Subscription plans response model
class SubscriptionPlansResponse {
  final List<SubscriptionPlan> plans;

  SubscriptionPlansResponse({
    required this.plans,
  });

  factory SubscriptionPlansResponse.fromJson(Map<String, dynamic> json) {
    return SubscriptionPlansResponse(
      plans: (json['plans'] as List)
          .map((item) => SubscriptionPlan.fromJson(item))
          .toList(),
    );
  }
}

/// Subscription plan model
class SubscriptionPlan {
  final String planId;
  final String name;
  final String description;
  final double monthlyPrice;
  final double? annualPrice;
  final String currency;
  final SubscriptionLimits limits;
  final List<String> features;
  final bool popular;

  SubscriptionPlan({
    required this.planId,
    required this.name,
    required this.description,
    required this.monthlyPrice,
    this.annualPrice,
    required this.currency,
    required this.limits,
    required this.features,
    required this.popular,
  });

  factory SubscriptionPlan.fromJson(Map<String, dynamic> json) {
    return SubscriptionPlan(
      planId: json['plan_id'] as String,
      name: json['name'] as String,
      description: json['description'] as String,
      monthlyPrice: (json['monthly_price'] as num).toDouble(),
      annualPrice: json['annual_price'] != null ? (json['annual_price'] as num).toDouble() : null,
      currency: json['currency'] as String,
      limits: SubscriptionLimits.fromJson(json['limits'] as Map<String, dynamic>),
      features: (json['features'] as List).cast<String>(),
      popular: json['popular'] as bool,
    );
  }
}

/// Checkout session response model
class CheckoutSessionResponse {
  final String sessionId;
  final String checkoutUrl;
  final DateTime expiresAt;

  CheckoutSessionResponse({
    required this.sessionId,
    required this.checkoutUrl,
    required this.expiresAt,
  });

  factory CheckoutSessionResponse.fromJson(Map<String, dynamic> json) {
    return CheckoutSessionResponse(
      sessionId: json['session_id'] as String,
      checkoutUrl: json['checkout_url'] as String,
      expiresAt: DateTime.parse(json['expires_at'] as String),
    );
  }
}

/// Usage statistics model
class UsageStatistics {
  final int documentsUsed;
  final int documentsLimit;
  final int chatMessagesUsed;
  final int chatMessagesLimit;
  final double storageUsedGB;
  final int storageLimit;
  final DateTime periodStart;
  final DateTime periodEnd;
  final Map<String, int> dailyUsage;

  UsageStatistics({
    required this.documentsUsed,
    required this.documentsLimit,
    required this.chatMessagesUsed,
    required this.chatMessagesLimit,
    required this.storageUsedGB,
    required this.storageLimit,
    required this.periodStart,
    required this.periodEnd,
    required this.dailyUsage,
  });

  factory UsageStatistics.fromJson(Map<String, dynamic> json) {
    return UsageStatistics(
      documentsUsed: json['documents_used'] as int,
      documentsLimit: json['documents_limit'] as int,
      chatMessagesUsed: json['chat_messages_used'] as int,
      chatMessagesLimit: json['chat_messages_limit'] as int,
      storageUsedGB: (json['storage_used_gb'] as num).toDouble(),
      storageLimit: json['storage_limit_gb'] as int,
      periodStart: DateTime.parse(json['period_start'] as String),
      periodEnd: DateTime.parse(json['period_end'] as String),
      dailyUsage: Map<String, int>.from(json['daily_usage'] as Map),
    );
  }
}

/// Billing history response model
class BillingHistoryResponse {
  final List<BillingRecord> records;
  final String? nextCursor;
  final bool hasMore;

  BillingHistoryResponse({
    required this.records,
    this.nextCursor,
    required this.hasMore,
  });

  factory BillingHistoryResponse.fromJson(Map<String, dynamic> json) {
    return BillingHistoryResponse(
      records: (json['records'] as List)
          .map((item) => BillingRecord.fromJson(item))
          .toList(),
      nextCursor: json['next_cursor'] as String?,
      hasMore: json['has_more'] as bool,
    );
  }
}

/// Billing record model
class BillingRecord {
  final String invoiceId;
  final double amount;
  final String currency;
  final String status;
  final DateTime billingDate;
  final DateTime? paidAt;
  final String description;
  final String? invoiceUrl;

  BillingRecord({
    required this.invoiceId,
    required this.amount,
    required this.currency,
    required this.status,
    required this.billingDate,
    this.paidAt,
    required this.description,
    this.invoiceUrl,
  });

  factory BillingRecord.fromJson(Map<String, dynamic> json) {
    return BillingRecord(
      invoiceId: json['invoice_id'] as String,
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] as String,
      status: json['status'] as String,
      billingDate: DateTime.parse(json['billing_date'] as String),
      paidAt: json['paid_at'] != null ? DateTime.parse(json['paid_at'] as String) : null,
      description: json['description'] as String,
      invoiceUrl: json['invoice_url'] as String?,
    );
  }
}

/// Payment method model
class PaymentMethod {
  final String paymentMethodId;
  final String type;
  final String? last4;
  final String? brand;
  final int? expiryMonth;
  final int? expiryYear;
  final bool isDefault;
  final DateTime createdAt;

  PaymentMethod({
    required this.paymentMethodId,
    required this.type,
    this.last4,
    this.brand,
    this.expiryMonth,
    this.expiryYear,
    required this.isDefault,
    required this.createdAt,
  });

  factory PaymentMethod.fromJson(Map<String, dynamic> json) {
    return PaymentMethod(
      paymentMethodId: json['payment_method_id'] as String,
      type: json['type'] as String,
      last4: json['last4'] as String?,
      brand: json['brand'] as String?,
      expiryMonth: json['expiry_month'] as int?,
      expiryYear: json['expiry_year'] as int?,
      isDefault: json['is_default'] as bool,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }
}

/// Payment methods response model
class PaymentMethodsResponse {
  final List<PaymentMethod> paymentMethods;
  final PaymentMethod? defaultPaymentMethod;

  PaymentMethodsResponse({
    required this.paymentMethods,
    this.defaultPaymentMethod,
  });

  factory PaymentMethodsResponse.fromJson(Map<String, dynamic> json) {
    return PaymentMethodsResponse(
      paymentMethods: (json['payment_methods'] as List)
          .map((item) => PaymentMethod.fromJson(item))
          .toList(),
      defaultPaymentMethod: json['default_payment_method'] != null
          ? PaymentMethod.fromJson(json['default_payment_method'])
          : null,
    );
  }
}