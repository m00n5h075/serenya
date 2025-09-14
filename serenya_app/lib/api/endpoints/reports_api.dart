import 'package:dio/dio.dart';
import '../api_client.dart';
import '../error_handler.dart';
import '../../core/security/local_audit_logger.dart';

/// Reports API endpoints implementation
/// 
/// Handles all report generation and management API calls including:
/// - Medical report generation from processed documents
/// - Report template management
/// - Report status tracking and progress
/// - Report customization and formatting
/// - Secure report delivery and access control
class ReportsApi {
  final Dio _dio;
  final ApiErrorHandler _errorHandler;

  ReportsApi(this._dio, this._errorHandler);

  /// POST /reports/generate
  /// Generate a medical report from processed documents
  Future<ApiResult<ReportGenerationResponse>> generateReport({
    required String reportType,
    required List<String> documentIds,
    String? templateId,
    Map<String, dynamic>? customParameters,
    String? title,
    ReportFormat? format,
  }) async {
    try {
      final requestData = {
        'report_type': reportType,
        'document_ids': documentIds,
        if (templateId != null) 'template_id': templateId,
        if (customParameters != null) 'custom_parameters': customParameters,
        if (title != null) 'title': title,
        if (format != null) 'format': format.toString().split('.').last,
      };

      final response = await _dio.post(
        '/reports/generate',
        data: requestData,
      );

      await _logReportOperation('report_generation_started', {
        'report_type': reportType,
        'document_count': documentIds.length,
        'has_template': templateId != null,
        'has_custom_params': customParameters != null,
      });

      return ApiResult.success(
        ReportGenerationResponse.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Generate report');
    } catch (e) {
      return ApiResult.failed('Unexpected error generating report: $e');
    }
  }

  /// GET /reports/{report_id}/status
  /// Get report generation status
  Future<ApiResult<ReportStatus>> getReportStatus(String reportId) async {
    try {
      final response = await _dio.get('/reports/$reportId/status');

      await _logReportOperation('report_status_checked', {
        'report_id': reportId,
      });

      return ApiResult.success(
        ReportStatus.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Get report status');
    } catch (e) {
      return ApiResult.failed('Unexpected error getting report status: $e');
    }
  }

  /// GET /reports/{report_id}
  /// Get completed report details and metadata
  Future<ApiResult<ReportDetails>> getReportDetails(String reportId) async {
    try {
      final response = await _dio.get('/reports/$reportId');

      await _logReportOperation('report_details_fetched', {
        'report_id': reportId,
      });

      return ApiResult.success(
        ReportDetails.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Get report details');
    } catch (e) {
      return ApiResult.failed('Unexpected error getting report details: $e');
    }
  }

  /// GET /reports/{report_id}/download
  /// Download report content
  Future<ApiResult<ReportDownload>> downloadReport({
    required String reportId,
    ReportFormat? format,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (format != null) queryParams['format'] = format.toString().split('.').last;

      final response = await _dio.get(
        '/reports/$reportId/download',
        queryParameters: queryParams,
        options: Options(responseType: ResponseType.bytes),
      );

      await _logReportOperation('report_downloaded', {
        'report_id': reportId,
        'format': format?.toString() ?? 'default',
      });

      return ApiResult.success(
        ReportDownload(
          reportId: reportId,
          content: response.data as List<int>,
          mimeType: response.headers.value('content-type') ?? 'application/pdf',
          fileName: _extractFileName(response.headers) ?? 'report_$reportId.pdf',
        ),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Download report');
    } catch (e) {
      return ApiResult.failed('Unexpected error downloading report: $e');
    }
  }

  /// GET /reports
  /// List user's reports with filtering and pagination
  Future<ApiResult<ReportListResponse>> listReports({
    int? limit,
    String? cursor,
    String? status,
    String? reportType,
    DateTime? generatedAfter,
    DateTime? generatedBefore,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (limit != null) queryParams['limit'] = limit;
      if (cursor != null) queryParams['cursor'] = cursor;
      if (status != null) queryParams['status'] = status;
      if (reportType != null) queryParams['report_type'] = reportType;
      if (generatedAfter != null) queryParams['generated_after'] = generatedAfter.toIso8601String();
      if (generatedBefore != null) queryParams['generated_before'] = generatedBefore.toIso8601String();

      final response = await _dio.get(
        '/reports',
        queryParameters: queryParams,
      );

      await _logReportOperation('reports_listed', {
        'query_params': queryParams,
      });

      return ApiResult.success(
        ReportListResponse.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'List reports');
    } catch (e) {
      return ApiResult.failed('Unexpected error listing reports: $e');
    }
  }

  /// PUT /reports/{report_id}
  /// Update report metadata
  Future<ApiResult<ReportDetails>> updateReport({
    required String reportId,
    String? title,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final requestData = <String, dynamic>{};
      if (title != null) requestData['title'] = title;
      if (metadata != null) requestData['metadata'] = metadata;

      if (requestData.isEmpty) {
        return ApiResult.failed('No report data to update');
      }

      final response = await _dio.put(
        '/reports/$reportId',
        data: requestData,
      );

      await _logReportOperation('report_updated', {
        'report_id': reportId,
        'updated_fields': requestData.keys.toList(),
      });

      return ApiResult.success(
        ReportDetails.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Update report');
    } catch (e) {
      return ApiResult.failed('Unexpected error updating report: $e');
    }
  }

  /// DELETE /reports/{report_id}
  /// Delete a report
  Future<ApiResult<void>> deleteReport(String reportId) async {
    try {
      final response = await _dio.delete('/reports/$reportId');

      await _logReportOperation('report_deleted', {
        'report_id': reportId,
      });

      return ApiResult.success(
        null,
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Delete report');
    } catch (e) {
      return ApiResult.failed('Unexpected error deleting report: $e');
    }
  }

  /// GET /reports/templates
  /// List available report templates
  Future<ApiResult<ReportTemplateListResponse>> getReportTemplates({
    String? reportType,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (reportType != null) queryParams['report_type'] = reportType;

      final response = await _dio.get(
        '/reports/templates',
        queryParameters: queryParams,
      );

      await _logReportOperation('templates_listed', {
        'query_params': queryParams,
      });

      return ApiResult.success(
        ReportTemplateListResponse.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Get report templates');
    } catch (e) {
      return ApiResult.failed('Unexpected error getting templates: $e');
    }
  }

  /// GET /reports/types
  /// List available report types
  Future<ApiResult<ReportTypeListResponse>> getReportTypes() async {
    try {
      final response = await _dio.get('/reports/types');

      await _logReportOperation('report_types_listed', {});

      return ApiResult.success(
        ReportTypeListResponse.fromJson(response.data),
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return await _errorHandler.handleDioError(e, 'Get report types');
    } catch (e) {
      return ApiResult.failed('Unexpected error getting report types: $e');
    }
  }

  /// Extract filename from response headers
  String? _extractFileName(Headers headers) {
    final contentDisposition = headers.value('content-disposition');
    if (contentDisposition != null) {
      final filenameIndex = contentDisposition.indexOf('filename=');
      if (filenameIndex != -1) {
        var filename = contentDisposition.substring(filenameIndex + 9);
        final semicolonIndex = filename.indexOf(';');
        if (semicolonIndex != -1) {
          filename = filename.substring(0, semicolonIndex);
        }
        return filename.replaceAll('"', '').replaceAll("'", '').trim();
      }
    }
    return null;
  }

  /// Log report operation for audit trail
  Future<void> _logReportOperation(String operation, Map<String, dynamic> context) async {
    await LocalAuditLogger.logSecurityEvent(
      'report_api_operation',
      additionalData: {
        'operation': operation,
        'context': context,
        'timestamp': DateTime.now().toIso8601String(),
      },
    );
  }

  /// Reset API state
  Future<void> reset() async {
    // No persistent state to reset for reports API
  }
}

/// Report format enumeration
enum ReportFormat {
  pdf,
  docx,
  html,
  json,
}

/// Report generation response model
class ReportGenerationResponse {
  final String reportId;
  final String status;
  final String reportType;
  final DateTime requestedAt;
  final DateTime? estimatedCompletion;
  final String? title;

  ReportGenerationResponse({
    required this.reportId,
    required this.status,
    required this.reportType,
    required this.requestedAt,
    this.estimatedCompletion,
    this.title,
  });

  factory ReportGenerationResponse.fromJson(Map<String, dynamic> json) {
    return ReportGenerationResponse(
      reportId: json['report_id'] as String,
      status: json['status'] as String,
      reportType: json['report_type'] as String,
      requestedAt: DateTime.parse(json['requested_at'] as String),
      estimatedCompletion: json['estimated_completion'] != null
          ? DateTime.parse(json['estimated_completion'] as String)
          : null,
      title: json['title'] as String?,
    );
  }
}

/// Report status model
class ReportStatus {
  final String reportId;
  final String status;
  final double? progressPercent;
  final String? currentStage;
  final String? errorMessage;
  final DateTime lastUpdated;
  final DateTime? completedAt;

  ReportStatus({
    required this.reportId,
    required this.status,
    this.progressPercent,
    this.currentStage,
    this.errorMessage,
    required this.lastUpdated,
    this.completedAt,
  });

  factory ReportStatus.fromJson(Map<String, dynamic> json) {
    return ReportStatus(
      reportId: json['report_id'] as String,
      status: json['status'] as String,
      progressPercent: json['progress_percent']?.toDouble(),
      currentStage: json['current_stage'] as String?,
      errorMessage: json['error_message'] as String?,
      lastUpdated: DateTime.parse(json['last_updated'] as String),
      completedAt: json['completed_at'] != null
          ? DateTime.parse(json['completed_at'] as String)
          : null,
    );
  }
}

/// Report details model
class ReportDetails {
  final String reportId;
  final String reportType;
  final String status;
  final String? title;
  final List<String> documentIds;
  final String? templateId;
  final DateTime requestedAt;
  final DateTime? completedAt;
  final int? fileSizeBytes;
  final ReportFormat? format;
  final Map<String, dynamic>? metadata;
  final Map<String, dynamic>? customParameters;

  ReportDetails({
    required this.reportId,
    required this.reportType,
    required this.status,
    this.title,
    required this.documentIds,
    this.templateId,
    required this.requestedAt,
    this.completedAt,
    this.fileSizeBytes,
    this.format,
    this.metadata,
    this.customParameters,
  });

  factory ReportDetails.fromJson(Map<String, dynamic> json) {
    return ReportDetails(
      reportId: json['report_id'] as String,
      reportType: json['report_type'] as String,
      status: json['status'] as String,
      title: json['title'] as String?,
      documentIds: (json['document_ids'] as List).cast<String>(),
      templateId: json['template_id'] as String?,
      requestedAt: DateTime.parse(json['requested_at'] as String),
      completedAt: json['completed_at'] != null
          ? DateTime.parse(json['completed_at'] as String)
          : null,
      fileSizeBytes: json['file_size_bytes'] as int?,
      format: json['format'] != null
          ? ReportFormat.values.firstWhere(
              (f) => f.toString().split('.').last == json['format'],
              orElse: () => ReportFormat.pdf,
            )
          : null,
      metadata: json['metadata'] as Map<String, dynamic>?,
      customParameters: json['custom_parameters'] as Map<String, dynamic>?,
    );
  }
}

/// Report download model
class ReportDownload {
  final String reportId;
  final List<int> content;
  final String mimeType;
  final String fileName;

  ReportDownload({
    required this.reportId,
    required this.content,
    required this.mimeType,
    required this.fileName,
  });
}

/// Report list response model
class ReportListResponse {
  final List<ReportSummary> reports;
  final String? nextCursor;
  final bool hasMore;
  final int totalCount;

  ReportListResponse({
    required this.reports,
    this.nextCursor,
    required this.hasMore,
    required this.totalCount,
  });

  factory ReportListResponse.fromJson(Map<String, dynamic> json) {
    return ReportListResponse(
      reports: (json['reports'] as List)
          .map((item) => ReportSummary.fromJson(item))
          .toList(),
      nextCursor: json['next_cursor'] as String?,
      hasMore: json['has_more'] as bool,
      totalCount: json['total_count'] as int,
    );
  }
}

/// Report summary model
class ReportSummary {
  final String reportId;
  final String reportType;
  final String status;
  final String? title;
  final DateTime requestedAt;
  final DateTime? completedAt;
  final int documentCount;

  ReportSummary({
    required this.reportId,
    required this.reportType,
    required this.status,
    this.title,
    required this.requestedAt,
    this.completedAt,
    required this.documentCount,
  });

  factory ReportSummary.fromJson(Map<String, dynamic> json) {
    return ReportSummary(
      reportId: json['report_id'] as String,
      reportType: json['report_type'] as String,
      status: json['status'] as String,
      title: json['title'] as String?,
      requestedAt: DateTime.parse(json['requested_at'] as String),
      completedAt: json['completed_at'] != null
          ? DateTime.parse(json['completed_at'] as String)
          : null,
      documentCount: json['document_count'] as int,
    );
  }
}

/// Report template model
class ReportTemplate {
  final String templateId;
  final String name;
  final String description;
  final String reportType;
  final List<String> supportedFormats;
  final Map<String, dynamic>? defaultParameters;
  final bool isDefault;

  ReportTemplate({
    required this.templateId,
    required this.name,
    required this.description,
    required this.reportType,
    required this.supportedFormats,
    this.defaultParameters,
    required this.isDefault,
  });

  factory ReportTemplate.fromJson(Map<String, dynamic> json) {
    return ReportTemplate(
      templateId: json['template_id'] as String,
      name: json['name'] as String,
      description: json['description'] as String,
      reportType: json['report_type'] as String,
      supportedFormats: (json['supported_formats'] as List).cast<String>(),
      defaultParameters: json['default_parameters'] as Map<String, dynamic>?,
      isDefault: json['is_default'] as bool,
    );
  }
}

/// Report template list response model
class ReportTemplateListResponse {
  final List<ReportTemplate> templates;

  ReportTemplateListResponse({
    required this.templates,
  });

  factory ReportTemplateListResponse.fromJson(Map<String, dynamic> json) {
    return ReportTemplateListResponse(
      templates: (json['templates'] as List)
          .map((item) => ReportTemplate.fromJson(item))
          .toList(),
    );
  }
}

/// Report type model
class ReportType {
  final String reportType;
  final String name;
  final String description;
  final List<String> requiredDocumentTypes;
  final Map<String, dynamic>? availableParameters;

  ReportType({
    required this.reportType,
    required this.name,
    required this.description,
    required this.requiredDocumentTypes,
    this.availableParameters,
  });

  factory ReportType.fromJson(Map<String, dynamic> json) {
    return ReportType(
      reportType: json['report_type'] as String,
      name: json['name'] as String,
      description: json['description'] as String,
      requiredDocumentTypes: (json['required_document_types'] as List).cast<String>(),
      availableParameters: json['available_parameters'] as Map<String, dynamic>?,
    );
  }
}

/// Report type list response model
class ReportTypeListResponse {
  final List<ReportType> reportTypes;

  ReportTypeListResponse({
    required this.reportTypes,
  });

  factory ReportTypeListResponse.fromJson(Map<String, dynamic> json) {
    return ReportTypeListResponse(
      reportTypes: (json['report_types'] as List)
          .map((item) => ReportType.fromJson(item))
          .toList(),
    );
  }
}