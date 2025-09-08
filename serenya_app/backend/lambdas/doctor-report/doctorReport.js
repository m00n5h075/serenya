const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  sanitizeError,
} = require('../shared/utils');
const { DocumentJobService } = require('../shared/document-database');
const { auditService } = require('../shared/audit-service');
const { bedrockService } = require('../shared/bedrock-service');

/**
 * Premium Doctor Report Generation using AWS Bedrock Claude
 * POST /api/v1/process/doctor-report
 */
exports.handler = async (event) => {
  try {
    const userId = getUserIdFromEvent(event);

    if (!userId) {
      return createErrorResponse(401, 'MISSING_AUTHENTICATION', 'Invalid or missing authentication', 'Please sign in to generate doctor reports');
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'INVALID_JSON', 'Invalid JSON in request body', 'Please provide valid JSON data');
    }

    const { document_id, report_type = 'medical_summary' } = body;

    if (!document_id) {
      return createErrorResponse(400, 'MISSING_DOCUMENT_ID', 'Missing document_id', 'Please provide a valid document_id for report generation');
    }

    // Enhanced audit logging
    await auditService.logAuditEvent({
      eventType: 'premium_feature',
      eventSubtype: 'doctor_report_request',
      userId: userId,
      eventDetails: {
        documentId: document_id,
        reportType: report_type
      },
      dataClassification: 'medical_phi'
    });

    // For this implementation, we'll use job_id instead of document_id
    // since we don't have a separate documents table
    const jobId = document_id;
    
    // Get job record using PostgreSQL service
    const jobRecord = await DocumentJobService.getJob(jobId, userId);
    
    if (!jobRecord) {
      await auditService.logAuditEvent({
        eventType: 'premium_feature',
        eventSubtype: 'doctor_report_job_not_found',
        userId: userId,
        eventDetails: { jobId: jobId },
        dataClassification: 'medical_phi'
      });
      
      return createErrorResponse(404, 'DOCUMENT_NOT_FOUND', 'Document not found', 'The specified document could not be found or you do not have access to it');
    }

    // Check if processing is complete
    if (jobRecord.status !== 'completed') {
      return createErrorResponse(400, 'PROCESSING_INCOMPLETE', 'Document processing not complete', 'Please wait for document analysis to complete before generating reports');
    }

    // Check user's premium status
    const isPremiumUser = await checkPremiumStatus(userId);
    if (!isPremiumUser) {
      return createErrorResponse(403, 'PREMIUM_REQUIRED', 'Premium subscription required for doctor reports', 'Upgrade to premium to generate professional medical reports');
    }

    // Get existing analysis results
    const analysisResults = await DocumentJobService.getResults(jobId, userId);
    if (!analysisResults) {
      return createErrorResponse(404, 'ANALYSIS_NOT_FOUND', 'Analysis results not found', 'No analysis results available for this document');
    }

    // Generate comprehensive medical report using Bedrock
    const bedrockResult = await bedrockService.generateDoctorReport(analysisResults, {
      userId: userId,
      reportType: report_type,
      jobId: jobId
    });

    // Handle Bedrock processing failure
    if (!bedrockResult.success) {
      await auditService.logAuditEvent({
        eventType: 'premium_feature',
        eventSubtype: 'doctor_report_generation_failed',
        userId: userId,
        eventDetails: {
          jobId: jobId,
          errorCode: bedrockResult.error.code,
          errorCategory: bedrockResult.error.category
        },
        dataClassification: 'medical_phi'
      });

      return createErrorResponse(500, bedrockResult.error.code, bedrockResult.error.message, bedrockResult.error.user_action);
    }

    // Store report generation record for billing/tracking
    await storeReportRecord(userId, jobId, report_type, bedrockResult.metadata);

    // Enhanced success audit logging
    await auditService.logAuditEvent({
      eventType: 'premium_feature',
      eventSubtype: 'doctor_report_generated',
      userId: userId,
      eventDetails: {
        jobId: jobId,
        reportType: report_type,
        reportLength: bedrockResult.report.report_content?.length || 0,
        processingTimeMs: bedrockResult.metadata.processing_time_ms,
        tokenUsage: bedrockResult.metadata.token_usage,
        costCents: bedrockResult.metadata.cost_estimate_cents
      },
      dataClassification: 'medical_phi'
    });

    return createResponse(200, {
      success: true,
      report: {
        type: report_type,
        content: bedrockResult.report.report_content || bedrockResult.report.response_content,
        clinical_recommendations: bedrockResult.report.clinical_recommendations || bedrockResult.report.recommendations,
        disclaimers: bedrockResult.report.disclaimers,
        metadata: {
          generation_timestamp: new Date().toISOString(),
          model_used: bedrockResult.metadata.model_used,
          processing_time_ms: bedrockResult.metadata.processing_time_ms,
          token_usage: bedrockResult.metadata.token_usage,
          cost_estimate_cents: bedrockResult.metadata.cost_estimate_cents
        }
      },
      generated_at: new Date().toISOString(),
      document_info: {
        job_id: jobId,
        original_filename: jobRecord.originalFileName,
        processed_at: new Date(jobRecord.completedAt).toISOString(),
        confidence_score: analysisResults.confidence_score,
      },
    });

  } catch (error) {
    console.error('Doctor report error:', sanitizeError(error));
    
    const userId = getUserIdFromEvent(event) || 'unknown';
    
    await auditService.logAuditEvent({
      eventType: 'premium_feature',
      eventSubtype: 'doctor_report_error',
      userId: userId,
      eventDetails: {
        error: sanitizeError(error).message?.substring(0, 100) || 'Unknown error'
      },
      dataClassification: 'system_error'
    }).catch(auditError => {
      console.error('Audit logging failed:', auditError);
    });
    
    return createErrorResponse(500, 'REPORT_GENERATION_FAILED', 'Failed to generate doctor report', 'An error occurred while generating your medical report. Please try again or contact support.');
  }
};

/**
 * Check premium subscription status
 */
async function checkPremiumStatus(userId) {
  try {
    // For now, allow all users to generate reports
    // In production, this would check subscription status from the users table
    
    // Get user's report generation count for basic rate limiting
    const reportCount = await getUserReportCount(userId);
    
    // Allow 1 free report per user per month, then require premium
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    return reportCount < 1; // First report is free for demo purposes
    
  } catch (error) {
    console.error('Premium status check error:', error);
    return false;
  }
}

/**
 * Get user's report generation count for current month
 */
async function getUserReportCount(userId) {
  try {
    // This would be implemented with proper subscription tracking
    // For now, return 0 to allow report generation
    const currentMonth = new Date().toISOString().substring(0, 7);
    
    // Query from report generation tracking (would be implemented in DocumentJobService)
    // const reportCount = await DocumentJobService.getMonthlyReportCount(userId, currentMonth);
    
    return 0; // Allow reports for demo
  } catch (error) {
    console.error('Error getting report count:', error);
    return 0;
  }
}

/**
 * Store report generation record for billing/tracking
 */
async function storeReportRecord(userId, jobId, reportType, metadata) {
  try {
    // Update job record with report generation info
    await DocumentJobService.updateJobStatus(jobId, 'completed', {
      reportGeneratedAt: Date.now(),
      reportType: reportType,
      reportTokenUsage: metadata.token_usage,
      reportCostCents: metadata.cost_estimate_cents,
      reportProcessingTimeMs: metadata.processing_time_ms
    }, userId);

    console.log(`Doctor report generated for user ${userId}, job ${jobId}, type ${reportType}`);
    console.log(`Report cost: ${metadata.cost_estimate_cents} cents, tokens: ${JSON.stringify(metadata.token_usage)}`);
  } catch (error) {
    console.error('Error storing report record:', error);
    // Don't throw - report was generated successfully
  }
}