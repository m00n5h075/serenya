const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  sanitizeError,
} = require('../shared/utils');
const { query, transaction } = require('../shared/database');
const { auditService } = require('../shared/audit-service');
const { decryptFields } = require('../shared/encryption');
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
  
  if (!userId) {
    return createErrorResponse(401, 'UNAUTHORIZED', 'Authentication required');
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

    const exportData = {
      export_metadata: {
        request_id: requestId,
        user_id: userId,
        export_date: new Date().toISOString(),
        data_retention_policy: '7 years for audit compliance',
        format_version: '1.0'
      },
      user_account: null,
      consent_records: [],
      devices: [],
      sessions: [],
      subscriptions: [],
      payment_history: [],
      processing_jobs: [],
      audit_summary: null
    };

    // Export user account data (decrypt PII)
    const userResult = await query(`
      SELECT id, external_id, auth_provider, email, name, given_name, family_name,
             account_status, profile_picture, preferences, 
             created_at, updated_at, last_login_at
      FROM users WHERE id = $1
    `, [userId]);

    if (userResult.rows[0]) {
      const user = userResult.rows[0];
      // Decrypt PII fields
      const decryptedUser = await decryptFields(user, ['email', 'name', 'given_name', 'family_name']);
      exportData.user_account = {
        account_id: user.id,
        external_id: user.external_id,
        auth_provider: user.auth_provider,
        email: decryptedUser.email,
        name: decryptedUser.name,
        given_name: decryptedUser.given_name,
        family_name: decryptedUser.family_name,
        account_status: user.account_status,
        profile_picture: user.profile_picture,
        preferences: user.preferences,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_login_at: user.last_login_at
      };
    }

    // Export consent records
    const consentResult = await query(`
      SELECT consent_type, consent_given, consent_version, consent_method,
             created_at, updated_at, withdrawn_at
      FROM consent_records WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);
    exportData.consent_records = consentResult.rows;

    // Export devices (decrypt names)
    const devicesResult = await query(`
      SELECT device_id, device_name, platform, model, os_version, app_version,
             biometric_type, secure_element, device_status,
             first_seen_at, last_seen_at, created_at
      FROM user_devices WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);
    
    for (const device of devicesResult.rows) {
      const decryptedDevice = await decryptFields(device, ['device_name']);
      exportData.devices.push({
        device_id: device.device_id,
        device_name: decryptedDevice.device_name,
        platform: device.platform,
        model: device.model,
        os_version: device.os_version,
        app_version: device.app_version,
        biometric_type: device.biometric_type,
        secure_element: device.secure_element,
        device_status: device.device_status,
        first_seen_at: device.first_seen_at,
        last_seen_at: device.last_seen_at,
        created_at: device.created_at
      });
    }

    // Export active sessions (redacted for security)
    const sessionsResult = await query(`
      SELECT session_id, status, created_at, last_accessed_at, expires_at,
             last_biometric_auth_at, source_ip_hash
      FROM user_sessions WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);
    exportData.sessions = sessionsResult.rows.map(session => ({
      session_id: session.session_id,
      status: session.status,
      created_at: session.created_at,
      last_accessed_at: session.last_accessed_at,
      expires_at: session.expires_at,
      last_biometric_auth: session.last_biometric_auth_at,
      source_ip_hash: session.source_ip_hash
    }));

    // Export subscription data
    const subscriptionsResult = await query(`
      SELECT subscription_status, subscription_type, provider,
             external_subscription_id, start_date, end_date,
             created_at, updated_at
      FROM subscriptions WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);
    exportData.subscriptions = subscriptionsResult.rows;

    // Export payment history (redacted transaction details)
    const paymentsResult = await query(`
      SELECT amount, currency, payment_status, payment_method,
             processed_at, created_at
      FROM payment_transactions WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);
    exportData.payment_history = paymentsResult.rows;

    // Export processing jobs metadata (no medical content)
    const jobsResult = await query(`
      SELECT job_id, status, file_type, file_size, confidence_score,
             ai_model_used, ai_processing_time_ms, extracted_text_length,
             text_extraction_method, created_at, completed_at
      FROM processing_jobs WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);
    exportData.processing_jobs = jobsResult.rows;

    // Export audit summary (anonymized)
    const auditSummary = await query(`
      SELECT 
        COUNT(*) as total_events,
        MIN(created_at) as first_event,
        MAX(created_at) as last_event,
        COUNT(DISTINCT event_type) as unique_event_types
      FROM audit_events 
      WHERE user_id = $1
    `, [userId]);
    exportData.audit_summary = auditSummary.rows[0];

    // Log successful export
    await auditService.logAuditEvent({
      eventType: 'gdpr_compliance',
      eventSubtype: 'data_export_completed',
      userId: userId,
      eventDetails: {
        requestId: requestId,
        recordCounts: {
          devices: exportData.devices.length,
          sessions: exportData.sessions.length,
          subscriptions: exportData.subscriptions.length,
          payments: exportData.payment_history.length,
          processing_jobs: exportData.processing_jobs.length
        }
      },
      dataClassification: 'gdpr_request'
    });

    return createResponse(200, {
      success: true,
      export_data: exportData,
      disclaimer: 'This export contains all personal data processed by Serenya. Medical analysis results are not stored server-side and are not included in this export.'
    });

  } catch (error) {
    console.error('GDPR export error:', sanitizeError(error));
    
    await auditService.logAuditEvent({
      eventType: 'gdpr_compliance',
      eventSubtype: 'data_export_failed',
      userId: userId,
      eventDetails: {
        requestId: requestId,
        error: sanitizeError(error).message?.substring(0, 100)
      },
      dataClassification: 'gdpr_request'
    });

    return createErrorResponse(500, 'EXPORT_FAILED', 'Failed to export user data');
  }
}

/**
 * Erase all user data (Right to Erasure - GDPR Article 17)
 * POST /api/v1/gdpr/erase
 */
async function eraseUserData(event) {
  const userId = getUserIdFromEvent(event);
  const requestId = crypto.randomUUID();
  
  if (!userId) {
    return createErrorResponse(401, 'UNAUTHORIZED', 'Authentication required');
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

    // Get user data summary before deletion
    const userSummary = await query(`
      SELECT email, created_at, account_status FROM users WHERE id = $1
    `, [userId]);

    const deletionSummary = {
      user_devices: 0,
      user_sessions: 0,
      processing_jobs: 0,
      processing_events: 0,
      consent_records: 0,
      subscriptions: 0,
      payment_transactions: 0,
      audit_events_anonymized: 0
    };

    // Execute deletion in transaction
    await transaction(async (client) => {
      // 1. Delete user devices
      const devicesResult = await client.query('DELETE FROM user_devices WHERE user_id = $1', [userId]);
      deletionSummary.user_devices = devicesResult.rowCount;

      // 2. Delete user sessions
      const sessionsResult = await client.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
      deletionSummary.user_sessions = sessionsResult.rowCount;

      // 3. Delete processing job events first (FK constraint)
      const jobEventsResult = await client.query(`
        DELETE FROM processing_job_events 
        WHERE job_id IN (SELECT id FROM processing_jobs WHERE user_id = $1)
      `, [userId]);
      deletionSummary.processing_events = jobEventsResult.rowCount;

      // 4. Delete processing jobs
      const jobsResult = await client.query('DELETE FROM processing_jobs WHERE user_id = $1', [userId]);
      deletionSummary.processing_jobs = jobsResult.rowCount;

      // 5. Delete consent records
      const consentResult = await client.query('DELETE FROM consent_records WHERE user_id = $1', [userId]);
      deletionSummary.consent_records = consentResult.rowCount;

      // 6. Delete subscriptions
      const subscriptionsResult = await client.query('DELETE FROM subscriptions WHERE user_id = $1', [userId]);
      deletionSummary.subscriptions = subscriptionsResult.rowCount;

      // 7. Delete payment transactions
      const paymentsResult = await client.query('DELETE FROM payment_transactions WHERE user_id = $1', [userId]);
      deletionSummary.payment_transactions = paymentsResult.rowCount;

      // 8. Anonymize audit events (cannot delete for compliance)
      const auditResult = await client.query(`
        UPDATE audit_events 
        SET user_id = NULL,
            event_details = jsonb_set(
              COALESCE(event_details, '{}'), 
              '{user_anonymized}', 
              'true'
            ),
            anonymized_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
      `, [userId]);
      deletionSummary.audit_events_anonymized = auditResult.rowCount;

      // 9. Finally, delete user account
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
    });

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
        userEmailHash: userSummary.rows[0]?.email ? 
          crypto.createHash('sha256').update(userSummary.rows[0].email).digest('hex').substring(0, 16) : null,
        accountAge: userSummary.rows[0]?.created_at ? 
          Math.floor((Date.now() - new Date(userSummary.rows[0].created_at).getTime()) / (1000 * 60 * 60 * 24)) : null
      },
      dataClassification: 'gdpr_request'
    });

    return createResponse(200, {
      success: true,
      message: 'All user data has been permanently deleted',
      request_id: requestId,
      deletion_summary: deletionSummary,
      retention_note: 'Anonymized audit logs retained for legal compliance (7 years)'
    });

  } catch (error) {
    console.error('GDPR erasure error:', sanitizeError(error));
    
    await auditService.logAuditEvent({
      eventType: 'gdpr_compliance',
      eventSubtype: 'data_erasure_failed',
      userId: userId,
      eventDetails: {
        requestId: requestId,
        error: sanitizeError(error).message?.substring(0, 100)
      },
      dataClassification: 'gdpr_request'
    });

    return createErrorResponse(500, 'ERASURE_FAILED', 'Failed to erase user data');
  }
}

/**
 * Main handler
 */
exports.handler = async (event) => {
  try {
    const method = event.httpMethod;
    const path = event.path;

    if (method === 'GET' && path.includes('/export')) {
      return await exportUserData(event);
    } else if (method === 'POST' && path.includes('/erase')) {
      return await eraseUserData(event);
    } else {
      return createErrorResponse(404, 'NOT_FOUND', 'GDPR endpoint not found');
    }

  } catch (error) {
    console.error('GDPR handler error:', sanitizeError(error));
    return createErrorResponse(500, 'GDPR_ERROR', 'Failed to process GDPR request');
  }
};