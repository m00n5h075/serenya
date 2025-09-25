const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  sanitizeError,
  s3,
} = require('../shared/utils');
const { auditService } = require('../shared/audit-service');

/**
 * S3 Temporary File Cleanup
 * DELETE /api/v1/process/cleanup/{jobId}
 * 
 * Called by Flutter app after successful storage to SerenyaContent table
 * to cleanup temporary S3 files for completed processing jobs
 */
exports.handler = async (event) => {
  const sessionId = event.requestContext?.requestId || 'unknown';
  const sourceIp = event.requestContext?.identity?.sourceIp;
  const userAgent = event.headers?.['User-Agent'];
  
  try {
    const userId = getUserIdFromEvent(event);
    const jobId = event.pathParameters?.jobId;

    if (!userId) {
      return createErrorResponse(401, 'Invalid or missing authentication');
    }

    if (!jobId) {
      return createErrorResponse(400, 'Missing job ID');
    }

    // Enhanced audit logging for cleanup request
    await auditService.logAuditEvent({
      eventType: 'document_processing',
      eventSubtype: 'cleanup_request',
      userId: userId,
      eventDetails: {
        jobId: jobId
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      userAgent: userAgent,
      dataClassification: 'medical_phi'
    });

    // Clean up all possible temporary files for this job
    const filesToCleanup = [
      // Health data input file (for doctor reports)
      `reports/${userId}/${jobId}/health_data_export.json`,
      // Doctor report results file  
      `reports/${userId}/${jobId}/doctor_report_result.json`,
      // Document analysis results file
      `results/${userId}/${jobId}/result.json`,
      // Any other results files that might exist
      `results/${userId}/${jobId}/analysis_result.json`
    ];
    const cleanupResults = [];
    
    for (const s3Key of filesToCleanup) {
      try {
        // Check if file exists first
        const headParams = {
          Bucket: process.env.TEMP_BUCKET_NAME,
          Key: s3Key,
        };
        
        await s3.headObject(headParams).promise();
        
        // File exists, delete it
        const deleteParams = {
          Bucket: process.env.TEMP_BUCKET_NAME,
          Key: s3Key,
        };
        
        await s3.deleteObject(deleteParams).promise();
        
        cleanupResults.push({
          s3Key: s3Key,
          status: 'deleted',
          existed: true
        });
        
        console.log(`Successfully cleaned up file: ${s3Key}`);
        
      } catch (error) {
        if (error.code === 'NotFound' || error.statusCode === 404) {
          // File doesn't exist, that's fine
          cleanupResults.push({
            s3Key: s3Key,
            status: 'not_found',
            existed: false
          });
        } else {
          // Actual error during cleanup
          console.error(`Failed to cleanup file ${s3Key}:`, error);
          cleanupResults.push({
            s3Key: s3Key,
            status: 'error',
            existed: null,
            error: error.message
          });
        }
      }
    }
    
    // Count successful cleanups
    const deletedFiles = cleanupResults.filter(r => r.status === 'deleted');
    const notFoundFiles = cleanupResults.filter(r => r.status === 'not_found');
    const errorFiles = cleanupResults.filter(r => r.status === 'error');
    
    // Enhanced cleanup audit log
    await auditService.logAuditEvent({
      eventType: 'document_processing',
      eventSubtype: 'cleanup_completed',
      userId: userId,
      eventDetails: {
        jobId: jobId,
        deletedCount: deletedFiles.length,
        notFoundCount: notFoundFiles.length,
        errorCount: errorFiles.length,
        cleanupResults: cleanupResults
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      userAgent: userAgent,
      dataClassification: 'medical_phi'
    });

    return createResponse(200, {
      success: true,
      message: `Cleanup completed for job ${jobId}`,
      job_id: jobId,
      cleanup_summary: {
        deleted_files: deletedFiles.length,
        not_found_files: notFoundFiles.length,
        error_files: errorFiles.length,
        total_checked: cleanupResults.length
      },
      details: cleanupResults
    });

  } catch (error) {
    console.error('Cleanup error:', sanitizeError(error));
    
    const userId = getUserIdFromEvent(event) || 'unknown';
    const jobId = event.pathParameters?.jobId || 'unknown';
    
    await auditService.logAuditEvent({
      eventType: 'document_processing',
      eventSubtype: 'cleanup_error',
      userId: userId,
      eventDetails: { 
        jobId, 
        error: sanitizeError(error).substring(0, 100) 
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      userAgent: userAgent,
      dataClassification: 'system_error'
    }).catch(auditError => {
      console.error('Audit logging failed:', auditError);
    });
    
    return createErrorResponse(500, 'Failed to cleanup temporary files');
  }
};