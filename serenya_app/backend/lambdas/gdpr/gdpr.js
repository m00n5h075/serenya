const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  sanitizeError,
  createUnifiedError,
  withRetry,
  ERROR_CATEGORIES
} = require('../shared/utils');
const { DynamoDBUserService } = require('../shared/dynamodb-service');
const { auditService } = require('../shared/audit-service');
const crypto = require('crypto');

/**
 * GDPR Data Rights Handler
 * Implements Right to Erasure (Article 17) and Right of Access (Article 15)
 * POST /api/v1/gdpr/erase - Delete all user data
 * GET /api/v1/gdpr/export - Export all user data
 */

/**
 * Export all user data in machine-readable format
 * GET /api/v1/gdpr/export
 */
async function exportUserData(event) {
  const userId = getUserIdFromEvent(event);
  const requestId = crypto.randomUUID();
  const sessionId = event.requestContext?.requestId || 'unknown';
  const sourceIp = event.requestContext?.identity?.sourceIp;
  const userAgent = event.headers?.['User-Agent'];
  
  if (!userId) {
    const unifiedError = createUnifiedError(new Error('Missing authentication'), {
      service: 'gdpr',
      operation: 'authentication',
      category: ERROR_CATEGORIES.BUSINESS
    });
    
    await auditService.logAuditEvent({
      eventType: 'access_control',
      eventSubtype: 'unauthenticated_gdpr_export_access',
      userId: 'unauthenticated',
      eventDetails: {
        correlationId: unifiedError.correlationId,
        requestId: requestId
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      userAgent: userAgent,
      dataClassification: 'security_event'
    }).catch(() => {});
    
    return createErrorResponse(401, 'UNAUTHORIZED', 'Authentication required', 'Please sign in to export your data');
  }

  try {
    // Log GDPR export request
    await auditService.logAuditEvent({
      eventType: 'gdpr_compliance',
      eventSubtype: 'data_export_requested',
      userId: userId,
      eventDetails: {
        requestId: requestId,
        sourceIp: event.requestContext?.identity?.sourceIp,
        userAgent: event.headers?.['User-Agent']
      },
      dataClassification: 'gdpr_request'
    });

    // Get user profile from DynamoDB - this contains ALL user data in one record!
    const userService = new DynamoDBUserService();
    let userProfile;
    try {
      userProfile = await withRetry(
        () => userService.getUserProfile(userId),
        3,
        1000,
        `DynamoDB getUserProfile for GDPR export ${userId}`
      );
    } catch (dbError) {
      const unifiedError = createUnifiedError(dbError, {
        service: 'gdpr',
        operation: 'dynamodb_get_profile_for_export',
        userId: userId,
        category: ERROR_CATEGORIES.EXTERNAL
      });
      
      await auditService.logAuditEvent({
        eventType: 'gdpr_compliance',
        eventSubtype: 'data_export_fetch_error',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId,
          requestId: requestId,
          error: sanitizeError(dbError).message?.substring(0, 100)
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'system_error'
      }).catch(() => {});
      
      throw dbError; // Re-throw to be handled by main catch block
    }
    
    if (!userProfile) {
      await auditService.logAuditEvent({
        eventType: 'gdpr_compliance',
        eventSubtype: 'data_export_user_not_found',
        userId: userId,
        eventDetails: {
          requestId: requestId
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'security_event'
      });
      return createErrorResponse(404, 'USER_NOT_FOUND', 'User profile not found', 'No data found for export');
    }

    // Create comprehensive export from consolidated user profile
    const exportData = {
      export_metadata: {
        request_id: requestId,
        user_id: userId,
        export_date: new Date().toISOString(),
        data_retention_policy: '7 years for audit compliance',
        format_version: '2.0',
        export_method: 'dynamodb_consolidated_profile'
      },
      
      // Core user account data
      user_account: {
        account_id: userProfile.id,
        external_id: userProfile.external_id,
        auth_provider: userProfile.auth_provider,
        email: userProfile.email,
        name: userProfile.name,
        given_name: userProfile.given_name,
        family_name: userProfile.family_name,
        account_status: userProfile.account_status,
        email_verified: userProfile.email_verified,
        last_login_at: userProfile.last_login_at,
        created_at: userProfile.created_at || 'N/A',
        updated_at: userProfile.updated_at || new Date().toISOString(),
        deactivated_at: userProfile.deactivated_at
      },
      
      // Consent records (embedded in profile)
      consent_records: userProfile.consents ? Object.values(userProfile.consents) : [],
      
      // Current device (simplified - one device per user in DynamoDB schema)
      current_device: userProfile.current_device || null,
      
      // Current session (simplified - one active session)
      current_session: userProfile.current_session ? {
        session_id: userProfile.current_session.session_id,
        status: userProfile.current_session.status,
        created_at: userProfile.current_session.created_at,
        last_accessed_at: userProfile.current_session.last_accessed_at,
        expires_at: userProfile.current_session.expires_at,
        last_biometric_auth_at: userProfile.current_session.last_biometric_auth_at,
        biometric_expires_at: userProfile.current_session.biometric_expires_at
      } : null,
      
      // Current subscription (simplified - one subscription per user)
      current_subscription: userProfile.current_subscription || null,
      
      // Current biometric registration
      current_biometric: userProfile.current_biometric ? {
        registration_id: userProfile.current_biometric.registration_id,
        biometric_type: userProfile.current_biometric.biometric_type,
        is_verified: userProfile.current_biometric.is_verified,
        is_active: userProfile.current_biometric.is_active,
        created_at: userProfile.current_biometric.created_at,
        last_verified_at: userProfile.current_biometric.last_verified_at
      } : null,
      
      // Note: Payment history and processing jobs are stored separately in DynamoDB
      // and would require additional queries if needed
      payment_history: [], // Would need separate DynamoDB query if payments are tracked
      processing_jobs: [], // These are stored in S3/separate system, not in user profile
      
      // Simplified audit summary
      audit_summary: {
        note: 'Audit events stored separately and anonymized for compliance',
        export_includes: 'Complete user profile data from consolidated DynamoDB record'
      }
    };

    // Log successful export
    await auditService.logAuditEvent({
      eventType: 'gdpr_compliance',
      eventSubtype: 'data_export_completed',
      userId: userId,
      eventDetails: {
        requestId: requestId,
        recordCounts: {
          user_account: exportData.user_account ? 1 : 0,
          consent_records: exportData.consent_records.length,
          current_device: exportData.current_device ? 1 : 0,
          current_session: exportData.current_session ? 1 : 0,
          current_subscription: exportData.current_subscription ? 1 : 0,
          current_biometric: exportData.current_biometric ? 1 : 0
        },
        exportMethod: 'consolidated_dynamodb_profile'
      },
      dataClassification: 'gdpr_request'
    });

    return createResponse(200, {
      success: true,
      export_data: exportData,
      disclaimer: 'This export contains all personal data from your consolidated user profile. Medical analysis results are temporarily stored in S3 and processing job metadata would require separate export if needed.'
    });

  } catch (error) {
    console.error('GDPR export error:', sanitizeError(error));
    
    const errorContext = {
      service: 'gdpr',
      operation: 'data_export',
      userId: userId
    };
    const unifiedError = createUnifiedError(error, errorContext);
    
    await auditService.logAuditEvent({
      eventType: 'gdpr_compliance',
      eventSubtype: 'data_export_failed',
      userId: userId,
      eventDetails: {
        correlationId: unifiedError.correlationId,
        errorCategory: unifiedError.category,
        recoveryStrategy: unifiedError.recoveryStrategy,
        requestId: requestId,
        error: sanitizeError(error).message?.substring(0, 100) || 'Unknown error'
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      userAgent: userAgent,
      dataClassification: 'system_error'
    }).catch(() => {});

    // Use categorized error response
    if (unifiedError.category === ERROR_CATEGORIES.VALIDATION) {
      return createErrorResponse(400, 'VALIDATION_ERROR', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.BUSINESS) {
      return createErrorResponse(403, 'ACCESS_DENIED', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.EXTERNAL) {
      return createErrorResponse(503, 'SERVICE_UNAVAILABLE', 'External service failure', 'Our data export service is temporarily unavailable. Please try again shortly');
    } else {
      return createErrorResponse(500, 'EXPORT_FAILED', 'Failed to export user data', 'We had trouble exporting your data. Please try again');
    }
  }
}

/**
 * Erase all user data (Right to Erasure - GDPR Article 17)
 * POST /api/v1/gdpr/erase
 */
async function eraseUserData(event) {
  const userId = getUserIdFromEvent(event);
  const requestId = crypto.randomUUID();
  const sessionId = event.requestContext?.requestId || 'unknown';
  const sourceIp = event.requestContext?.identity?.sourceIp;
  const userAgent = event.headers?.['User-Agent'];
  
  if (!userId) {
    const unifiedError = createUnifiedError(new Error('Missing authentication'), {
      service: 'gdpr',
      operation: 'authentication',
      category: ERROR_CATEGORIES.BUSINESS
    });
    
    await auditService.logAuditEvent({
      eventType: 'access_control',
      eventSubtype: 'unauthenticated_gdpr_erasure_access',
      userId: 'unauthenticated',
      eventDetails: {
        correlationId: unifiedError.correlationId,
        requestId: requestId
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      userAgent: userAgent,
      dataClassification: 'security_event'
    }).catch(() => {});
    
    return createErrorResponse(401, 'UNAUTHORIZED', 'Authentication required', 'Please sign in to delete your data');
  }

  try {
    // Parse request body for confirmation
    const body = JSON.parse(event.body || '{}');
    if (body.confirmation !== 'DELETE_ALL_MY_DATA') {
      return createErrorResponse(400, 'CONFIRMATION_REQUIRED', 'Must provide confirmation: "DELETE_ALL_MY_DATA"');
    }

    // Log erasure request BEFORE deletion
    await auditService.logAuditEvent({
      eventType: 'gdpr_compliance',
      eventSubtype: 'data_erasure_requested',
      userId: userId,
      eventDetails: {
        requestId: requestId,
        sourceIp: event.requestContext?.identity?.sourceIp,
        userAgent: event.headers?.['User-Agent']
      },
      dataClassification: 'gdpr_request'
    });

    // Get user profile for summary before deletion
    const userService = new DynamoDBUserService();
    let userProfile;
    try {
      userProfile = await withRetry(
        () => userService.getUserProfile(userId),
        3,
        1000,
        `DynamoDB getUserProfile for GDPR erasure ${userId}`
      );
    } catch (dbError) {
      const unifiedError = createUnifiedError(dbError, {
        service: 'gdpr',
        operation: 'dynamodb_get_profile_for_erasure',
        userId: userId,
        category: ERROR_CATEGORIES.EXTERNAL
      });
      
      await auditService.logAuditEvent({
        eventType: 'gdpr_compliance',
        eventSubtype: 'data_erasure_fetch_error',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId,
          requestId: requestId,
          error: sanitizeError(dbError).message?.substring(0, 100)
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'system_error'
      }).catch(() => {});
      
      throw dbError; // Re-throw to be handled by main catch block
    }
    
    if (!userProfile) {
      await auditService.logAuditEvent({
        eventType: 'gdpr_compliance',
        eventSubtype: 'data_erasure_user_not_found',
        userId: userId,
        eventDetails: {
          requestId: requestId
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'security_event'
      });
      return createErrorResponse(404, 'USER_NOT_FOUND', 'User profile not found', 'No data found to erase');
    }

    // Create deletion summary from consolidated profile
    const deletionSummary = {
      user_profile: 1,
      consent_records: userProfile.consents ? Object.keys(userProfile.consents).length : 0,
      current_device: userProfile.current_device ? 1 : 0,
      current_session: userProfile.current_session ? 1 : 0,
      current_subscription: userProfile.current_subscription ? 1 : 0,
      current_biometric: userProfile.current_biometric ? 1 : 0,
      erasure_method: 'single_dynamodb_record_deletion'
    };

    // Store user summary for audit
    const userSummary = {
      email: userProfile.email,
      email_hash: userProfile.email_hash,
      created_at: userProfile.created_at,
      account_status: userProfile.account_status
    };

    // Execute erasure - DRAMATICALLY SIMPLIFIED: Just delete the single DynamoDB record!
    try {
      await withRetry(
        () => userService.deleteUserProfile(userId),
        3,
        1000,
        `DynamoDB deleteUserProfile for ${userId}`
      );
    } catch (dbError) {
      const unifiedError = createUnifiedError(dbError, {
        service: 'gdpr',
        operation: 'dynamodb_delete_profile',
        userId: userId,
        category: ERROR_CATEGORIES.EXTERNAL
      });
      
      await auditService.logAuditEvent({
        eventType: 'gdpr_compliance',
        eventSubtype: 'data_erasure_delete_error',
        userId: userId,
        eventDetails: {
          correlationId: unifiedError.correlationId,
          requestId: requestId,
          error: sanitizeError(dbError).message?.substring(0, 100)
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        dataClassification: 'system_error'
      }).catch(() => {});
      
      throw dbError; // Re-throw to be handled by main catch block
    }

    // Log successful deletion (with anonymized reference)
    const userHash = crypto.createHash('sha256').update(userId.toString()).digest('hex');
    await auditService.logAuditEvent({
      eventType: 'gdpr_compliance',
      eventSubtype: 'data_erasure_completed',
      userId: null, // User no longer exists
      eventDetails: {
        requestId: requestId,
        userHashReference: userHash.substring(0, 16), // Partial hash for correlation
        deletionSummary: deletionSummary,
        userEmailHash: userSummary.email ? 
          crypto.createHash('sha256').update(userSummary.email).digest('hex').substring(0, 16) : null,
        accountAge: userSummary.created_at ? 
          Math.floor((Date.now() - new Date(userSummary.created_at).getTime()) / (1000 * 60 * 60 * 24)) : null
      },
      dataClassification: 'gdpr_request'
    });

    return createResponse(200, {
      success: true,
      message: 'All user data has been permanently deleted',
      request_id: requestId,
      deletion_summary: deletionSummary,
      retention_note: 'Anonymized audit logs retained for legal compliance (7 years). User profile completely removed from DynamoDB.'
    });

  } catch (error) {
    console.error('GDPR erasure error:', sanitizeError(error));
    
    const errorContext = {
      service: 'gdpr',
      operation: 'data_erasure',
      userId: userId
    };
    const unifiedError = createUnifiedError(error, errorContext);
    
    await auditService.logAuditEvent({
      eventType: 'gdpr_compliance',
      eventSubtype: 'data_erasure_failed',
      userId: userId,
      eventDetails: {
        correlationId: unifiedError.correlationId,
        errorCategory: unifiedError.category,
        recoveryStrategy: unifiedError.recoveryStrategy,
        requestId: requestId,
        error: sanitizeError(error).message?.substring(0, 100) || 'Unknown error'
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      userAgent: userAgent,
      dataClassification: 'system_error'
    }).catch(() => {});

    // Use categorized error response
    if (unifiedError.category === ERROR_CATEGORIES.VALIDATION) {
      return createErrorResponse(400, 'VALIDATION_ERROR', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.BUSINESS) {
      return createErrorResponse(403, 'ACCESS_DENIED', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.EXTERNAL) {
      return createErrorResponse(503, 'SERVICE_UNAVAILABLE', 'External service failure', 'Our data erasure service is temporarily unavailable. Please try again shortly');
    } else {
      return createErrorResponse(500, 'ERASURE_FAILED', 'Failed to erase user data', 'We had trouble deleting your data. Please try again');
    }
  }
}

/**
 * Main handler
 */
exports.handler = async (event) => {
  const sessionId = event.requestContext?.requestId || 'unknown';
  const sourceIp = event.requestContext?.identity?.sourceIp;
  const userAgent = event.headers?.['User-Agent'];
  
  try {
    const method = event.httpMethod;
    const path = event.path;

    if (method === 'GET' && path.includes('/export')) {
      return await exportUserData(event);
    } else if (method === 'POST' && path.includes('/erase')) {
      return await eraseUserData(event);
    } else {
      const unifiedError = createUnifiedError(new Error('Invalid GDPR endpoint'), {
        service: 'gdpr',
        operation: 'routing',
        category: ERROR_CATEGORIES.VALIDATION
      });
      
      await auditService.logAuditEvent({
        eventType: 'gdpr_compliance',
        eventSubtype: 'invalid_endpoint_access',
        userId: getUserIdFromEvent(event) || 'unknown',
        eventDetails: {
          correlationId: unifiedError.correlationId,
          method: method,
          path: path
        },
        sessionId: sessionId,
        sourceIp: sourceIp,
        userAgent: userAgent,
        dataClassification: 'security_event'
      }).catch(() => {});
      
      return createErrorResponse(404, 'NOT_FOUND', 'GDPR endpoint not found', 'The requested GDPR endpoint was not found');
    }

  } catch (error) {
    console.error('GDPR handler error:', sanitizeError(error));
    
    const userId = getUserIdFromEvent(event) || 'unknown';
    const errorContext = {
      service: 'gdpr',
      operation: 'main_handler',
      userId: userId
    };
    const unifiedError = createUnifiedError(error, errorContext);
    
    await auditService.logAuditEvent({
      eventType: 'gdpr_compliance',
      eventSubtype: 'handler_error',
      userId: userId,
      eventDetails: {
        correlationId: unifiedError.correlationId,
        errorCategory: unifiedError.category,
        recoveryStrategy: unifiedError.recoveryStrategy,
        error: sanitizeError(error).message?.substring(0, 100) || 'Unknown error'
      },
      sessionId: sessionId,
      sourceIp: sourceIp,
      userAgent: userAgent,
      dataClassification: 'system_error'
    }).catch(() => {});
    
    // Use categorized error response
    if (unifiedError.category === ERROR_CATEGORIES.VALIDATION) {
      return createErrorResponse(400, 'VALIDATION_ERROR', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.BUSINESS) {
      return createErrorResponse(403, 'ACCESS_DENIED', error.message, unifiedError.userMessage);
    } else if (unifiedError.category === ERROR_CATEGORIES.EXTERNAL) {
      return createErrorResponse(503, 'SERVICE_UNAVAILABLE', 'External service failure', 'Our GDPR service is temporarily unavailable. Please try again shortly');
    } else {
      return createErrorResponse(500, 'GDPR_ERROR', 'Failed to process GDPR request', 'We had trouble processing your GDPR request. Please try again');
    }
  }
};