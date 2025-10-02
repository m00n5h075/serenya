const AWS = require('aws-sdk');
const { auditService } = require('./audit-service');
const { sanitizeError } = require('./utils');

const s3 = new AWS.S3();

/**
 * S3 Cleanup Service
 * Handles deletion of processed requests and retrieved responses
 * Used by chat, results, and reports processing
 */

/**
 * Delete original request file after successful processing
 * Called by process function after Bedrock responds
 */
async function deleteOriginalRequest(jobId, userId, requestType) {
  try {
    // Determine S3 key based on request type
    let s3Key;
    switch (requestType) {
      case 'chat_message':
        s3Key = `chat-requests/${userId}/${jobId}/request.json`;
        break;
      case 'document_upload':
        s3Key = `uploads/${userId}/${jobId}/`; // Will need filename
        break;
      case 'health_data_report':
        s3Key = `reports/${userId}/${jobId}/health_data_export.json`;
        break;
      default:
        throw new Error(`Unknown request type: ${requestType}`);
    }

    await s3.deleteObject({
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key
    }).promise();

    // Log successful cleanup
    await auditService.logAuditEvent({
      eventType: 'data_lifecycle',
      eventSubtype: 'original_request_deleted',
      userId: userId,
      eventDetails: {
        jobId: jobId,
        requestType: requestType,
        s3Key: s3Key,
        cleanupReason: 'processing_completed'
      },
      dataClassification: 'system_operation'
    });

    console.log(`Deleted original request: ${s3Key}`);
    return true;

  } catch (error) {
    console.error('Failed to delete original request:', sanitizeError(error));
    
    await auditService.logAuditEvent({
      eventType: 'data_lifecycle',
      eventSubtype: 'cleanup_failed',
      userId: userId,
      eventDetails: {
        jobId: jobId,
        requestType: requestType,
        error: sanitizeError(error).message?.substring(0, 100),
        cleanupType: 'original_request'
      },
      dataClassification: 'system_error'
    }).catch(() => {}); // Don't fail on audit failure

    return false;
  }
}

/**
 * Delete response file after app confirms retrieval
 * Called by result function or confirmation endpoint
 */
async function deleteProcessedResponse(jobId, userId, responseType) {
  try {
    // Determine S3 key based on response type
    let s3Key;
    switch (responseType) {
      case 'chat_response':
        s3Key = `chat-responses/${jobId}.json`;
        break;
      case 'document_result':
        s3Key = `results/${userId}/${jobId}/result.json`;
        break;
      case 'doctor_report':
        s3Key = `results/${userId}/${jobId}/result.json`;
        break;
      default:
        throw new Error(`Unknown response type: ${responseType}`);
    }

    await s3.deleteObject({
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key
    }).promise();

    // Log successful cleanup
    await auditService.logAuditEvent({
      eventType: 'data_lifecycle',
      eventSubtype: 'processed_response_deleted',
      userId: userId,
      eventDetails: {
        jobId: jobId,
        responseType: responseType,
        s3Key: s3Key,
        cleanupReason: 'retrieval_confirmed'
      },
      dataClassification: 'system_operation'
    });

    console.log(`Deleted processed response: ${s3Key}`);
    return true;

  } catch (error) {
    console.error('Failed to delete processed response:', sanitizeError(error));
    
    await auditService.logAuditEvent({
      eventType: 'data_lifecycle',
      eventSubtype: 'cleanup_failed',
      userId: userId,
      eventDetails: {
        jobId: jobId,
        responseType: responseType,
        error: sanitizeError(error).message?.substring(0, 100),
        cleanupType: 'processed_response'
      },
      dataClassification: 'system_error'
    }).catch(() => {}); // Don't fail on audit failure

    return false;
  }
}

/**
 * Delete document upload file after processing (needs filename)
 */
async function deleteUploadedDocument(jobId, userId, filename) {
  try {
    const s3Key = `uploads/${userId}/${jobId}/${filename}`;

    await s3.deleteObject({
      Bucket: process.env.TEMP_BUCKET_NAME,
      Key: s3Key
    }).promise();

    // Log successful cleanup
    await auditService.logAuditEvent({
      eventType: 'data_lifecycle',
      eventSubtype: 'uploaded_document_deleted',
      userId: userId,
      eventDetails: {
        jobId: jobId,
        filename: filename,
        s3Key: s3Key,
        cleanupReason: 'processing_completed'
      },
      dataClassification: 'system_operation'
    });

    console.log(`Deleted uploaded document: ${s3Key}`);
    return true;

  } catch (error) {
    console.error('Failed to delete uploaded document:', sanitizeError(error));
    return false;
  }
}

/**
 * Cleanup both request and response (for emergency cleanup)
 */
async function cleanupJobCompletely(jobId, userId, jobType) {
  const results = {
    originalRequestDeleted: false,
    processedResponseDeleted: false
  };

  // Map job type to request/response types
  const typeMapping = {
    'chat': { request: 'chat_message', response: 'chat_response' },
    'document': { request: 'document_upload', response: 'document_result' },
    'report': { request: 'health_data_report', response: 'doctor_report' }
  };

  const types = typeMapping[jobType];
  if (!types) {
    throw new Error(`Unknown job type: ${jobType}`);
  }

  // Delete original request
  results.originalRequestDeleted = await deleteOriginalRequest(jobId, userId, types.request);

  // Delete processed response
  results.processedResponseDeleted = await deleteProcessedResponse(jobId, userId, types.response);

  return results;
}

module.exports = {
  deleteOriginalRequest,
  deleteProcessedResponse,
  deleteUploadedDocument,
  cleanupJobCompletely
};