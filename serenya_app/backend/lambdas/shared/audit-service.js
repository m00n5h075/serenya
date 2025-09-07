const { Client } = require('pg');
const AWS = require('aws-sdk');
const crypto = require('crypto');
const { encryptFields } = require('./encryption');

const secretsManager = new AWS.SecretsManager({
  region: process.env.REGION || 'eu-west-1'
});

/**
 * Comprehensive Audit Service for HIPAA/GDPR Compliance
 * Implements deployment-ready audit logging with tamper detection and privacy protection
 */
class AuditService {
  constructor() {
    this.pool = null;
  }

  /**
   * Get database credentials from AWS Secrets Manager
   */
  async getDatabaseCredentials() {
    try {
      // Try application user credentials first
      const appSecretName = `serenya/${process.env.ENVIRONMENT}/app-database`;
      
      try {
        const appSecret = await secretsManager.getSecretValue({
          SecretId: appSecretName
        }).promise();
        
        return JSON.parse(appSecret.SecretString);
      } catch (appError) {
        console.log('App database secret not found, using admin credentials');
        
        // Fallback to admin credentials
        const adminSecret = await secretsManager.getSecretValue({
          SecretId: process.env.DB_SECRET_ARN
        }).promise();
        
        return JSON.parse(adminSecret.SecretString);
      }
    } catch (error) {
      console.error('Failed to retrieve database credentials:', error);
      throw new Error('Database credentials not available');
    }
  }

  /**
   * Get database connection pool
   */
  async getConnectionPool() {
    if (!this.pool) {
      const credentials = await this.getDatabaseCredentials();
      
      const { Pool } = require('pg');
      this.pool = new Pool({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'serenya',
        user: credentials.username,
        password: credentials.password,
        ssl: {
          rejectUnauthorized: false // Required for RDS
        },
        max: 3, // Audit service pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
    }
    
    return this.pool;
  }

  /**
   * Execute query with connection management
   */
  async query(sql, params = []) {
    const pool = await this.getConnectionPool();
    const client = await pool.connect();
    
    try {
      const result = await client.query(sql, params);
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Generate privacy-safe user hash
   */
  generateUserIdHash(userId) {
    if (!userId) return null;
    return crypto.createHash('sha256').update(userId.toString()).digest('hex');
  }

  /**
   * Generate privacy-safe IP hash
   */
  generateIpHash(ipAddress) {
    if (!ipAddress) return null;
    return crypto.createHash('sha256').update(ipAddress).digest('hex');
  }

  /**
   * Generate privacy-safe user agent hash
   */
  generateUserAgentHash(userAgent) {
    if (!userAgent) return null;
    return crypto.createHash('sha256').update(userAgent).digest('hex');
  }

  /**
   * Calculate event hash for tamper detection
   */
  calculateEventHash(eventTimestamp, eventType, eventSubtype, userIdHash, sessionId, eventDetails) {
    const hashInput = [
      eventTimestamp.toISOString(),
      eventType,
      eventSubtype,
      userIdHash || '',
      sessionId?.toString() || '',
      JSON.stringify(eventDetails)
    ].join('|');
    
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Primary audit logging function with comprehensive privacy protection
   */
  async logAuditEvent({
    eventType,
    eventSubtype,
    userId = null,
    sessionId = null,
    adminUserId = null,
    sourceIp = null,
    userAgent = null,
    requestId = null,
    eventDetails = {},
    gdprLawfulBasis = 'legitimate_interests',
    dataClassification = 'internal',
    retentionYears = 7
  }) {
    try {
      const eventTimestamp = new Date();
      
      // Generate privacy-safe hashes
      const userIdHash = userId ? this.generateUserIdHash(userId) : null;
      const adminUserIdHash = adminUserId ? this.generateUserIdHash(adminUserId) : null;
      const sourceIpHash = sourceIp ? this.generateIpHash(sourceIp) : null;
      const userAgentHash = userAgent ? this.generateUserAgentHash(userAgent) : null;
      
      // Encrypt sensitive event details
      let encryptedEventDetails = eventDetails;
      if (dataClassification === 'medical_phi' || dataClassification === 'restricted') {
        const encryptionContext = {
          eventType,
          dataClassification,
          timestamp: eventTimestamp.toISOString()
        };
        
        const encryptedData = await encryptFields(
          { event_details: JSON.stringify(eventDetails) },
          ['event_details'],
          process.env.KMS_KEY_ID,
          encryptionContext
        );
        
        encryptedEventDetails = { encrypted: true, data: encryptedData.event_details };
      }
      
      // Calculate tamper detection hash
      const eventHash = this.calculateEventHash(
        eventTimestamp,
        eventType,
        eventSubtype,
        userIdHash,
        sessionId,
        encryptedEventDetails
      );
      
      // Insert audit event
      const result = await this.query(`
        INSERT INTO audit_events (
          event_timestamp,
          event_type,
          event_subtype,
          user_id_hash,
          session_id,
          admin_user_id_hash,
          source_ip_hash,
          user_agent_hash,
          request_id,
          event_details,
          gdpr_lawful_basis,
          data_classification,
          retention_period_years,
          event_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
      `, [
        eventTimestamp,
        eventType,
        eventSubtype,
        userIdHash,
        sessionId,
        adminUserIdHash,
        sourceIpHash,
        userAgentHash,
        requestId,
        JSON.stringify(encryptedEventDetails),
        gdprLawfulBasis,
        dataClassification,
        retentionYears,
        eventHash
      ]);
      
      const auditEventId = result.rows[0].id;
      
      // Log to CloudWatch for immediate monitoring
      const logEntry = {
        auditEventId,
        eventType,
        eventSubtype,
        timestamp: eventTimestamp.toISOString(),
        dataClassification,
        gdprLawfulBasis,
        hasUserId: !!userId,
        hasSessionId: !!sessionId,
        environment: process.env.ENVIRONMENT
      };
      
      console.log('AUDIT_EVENT:', JSON.stringify(logEntry));
      
      return auditEventId;
      
    } catch (error) {
      console.error('Failed to log audit event:', error);
      
      // Fallback to CloudWatch logging if database fails
      const fallbackLog = {
        error: 'AUDIT_DB_FAILURE',
        eventType,
        eventSubtype,
        timestamp: new Date().toISOString(),
        errorMessage: error.message,
        environment: process.env.ENVIRONMENT
      };
      
      console.error('AUDIT_FALLBACK:', JSON.stringify(fallbackLog));
      
      // Re-throw to alert calling code
      throw new Error(`Audit logging failed: ${error.message}`);
    }
  }

  /**
   * Get audit events with privacy protection
   */
  async getAuditEvents(filters = {}) {
    try {
      let whereClause = '1=1';
      const params = [];
      let paramIndex = 1;

      // Filter by user ID hash
      if (filters.userId) {
        const userIdHash = this.generateUserIdHash(filters.userId);
        whereClause += ` AND user_id_hash = $${paramIndex}`;
        params.push(userIdHash);
        paramIndex++;
      }

      // Filter by event type
      if (filters.eventType) {
        whereClause += ` AND event_type = $${paramIndex}`;
        params.push(filters.eventType);
        paramIndex++;
      }

      // Filter by event subtype
      if (filters.eventSubtype) {
        whereClause += ` AND event_subtype = $${paramIndex}`;
        params.push(filters.eventSubtype);
        paramIndex++;
      }

      // Filter by data classification
      if (filters.dataClassification) {
        whereClause += ` AND data_classification = $${paramIndex}`;
        params.push(filters.dataClassification);
        paramIndex++;
      }

      // Filter by date range
      if (filters.startDate) {
        whereClause += ` AND event_timestamp >= $${paramIndex}`;
        params.push(filters.startDate);
        paramIndex++;
      }

      if (filters.endDate) {
        whereClause += ` AND event_timestamp <= $${paramIndex}`;
        params.push(filters.endDate);
        paramIndex++;
      }

      // Filter by session
      if (filters.sessionId) {
        whereClause += ` AND session_id = $${paramIndex}`;
        params.push(filters.sessionId);
        paramIndex++;
      }

      // Pagination
      const limit = Math.min(filters.limit || 100, 1000); // Max 1000 records
      const offset = filters.offset || 0;
      
      whereClause += ` ORDER BY event_timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await this.query(`
        SELECT 
          id,
          event_timestamp,
          event_type,
          event_subtype,
          session_id,
          request_id,
          gdpr_lawful_basis,
          data_classification,
          event_details,
          retention_expiry_date,
          created_at
        FROM audit_events 
        WHERE ${whereClause}
      `, params);

      return result.rows.map(row => ({
        ...row,
        // Note: event_details may be encrypted based on data_classification
        encrypted: row.data_classification === 'medical_phi' || row.data_classification === 'restricted'
      }));
      
    } catch (error) {
      console.error('Failed to retrieve audit events:', error);
      throw new Error(`Audit retrieval failed: ${error.message}`);
    }
  }

  /**
   * Get audit event summaries for compliance reporting
   */
  async getAuditSummaries(filters = {}) {
    try {
      let whereClause = '1=1';
      const params = [];
      let paramIndex = 1;

      if (filters.startDate) {
        whereClause += ` AND summary_date >= $${paramIndex}`;
        params.push(filters.startDate);
        paramIndex++;
      }

      if (filters.endDate) {
        whereClause += ` AND summary_date <= $${paramIndex}`;
        params.push(filters.endDate);
        paramIndex++;
      }

      if (filters.eventType) {
        whereClause += ` AND event_type = $${paramIndex}`;
        params.push(filters.eventType);
        paramIndex++;
      }

      const result = await this.query(`
        SELECT * FROM audit_event_summaries 
        WHERE ${whereClause}
        ORDER BY summary_date DESC, event_type, event_subtype
      `, params);

      return result.rows;
      
    } catch (error) {
      console.error('Failed to retrieve audit summaries:', error);
      throw new Error(`Audit summary retrieval failed: ${error.message}`);
    }
  }

  /**
   * Update daily audit summaries (for automated maintenance)
   */
  async updateAuditSummaries(summaryDate = null) {
    try {
      const targetDate = summaryDate || new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      const result = await this.query(`
        SELECT update_audit_summaries($1) as updated_count
      `, [targetDate.toISOString().split('T')[0]]);
      
      console.log(`Updated audit summaries for ${targetDate.toISOString().split('T')[0]}: ${result.rows[0].updated_count} records`);
      
      return result.rows[0].updated_count;
      
    } catch (error) {
      console.error('Failed to update audit summaries:', error);
      throw new Error(`Audit summary update failed: ${error.message}`);
    }
  }

  /**
   * Validate audit event integrity (tamper detection)
   */
  async validateEventIntegrity(eventId) {
    try {
      const result = await this.query(`
        SELECT 
          event_timestamp, event_type, event_subtype, 
          user_id_hash, session_id, event_details, event_hash
        FROM audit_events 
        WHERE id = $1
      `, [eventId]);

      if (!result.rows[0]) {
        return { valid: false, error: 'Event not found' };
      }

      const event = result.rows[0];
      const calculatedHash = this.calculateEventHash(
        event.event_timestamp,
        event.event_type,
        event.event_subtype,
        event.user_id_hash,
        event.session_id,
        JSON.parse(event.event_details)
      );

      const isValid = calculatedHash === event.event_hash;

      return {
        valid: isValid,
        storedHash: event.event_hash,
        calculatedHash,
        eventId
      };
      
    } catch (error) {
      console.error('Failed to validate event integrity:', error);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Get compliance statistics for reporting
   */
  async getComplianceStats(startDate, endDate) {
    try {
      const result = await this.query(`
        SELECT 
          data_classification,
          gdpr_lawful_basis,
          COUNT(*) as event_count,
          COUNT(DISTINCT DATE(event_timestamp)) as active_days,
          MIN(event_timestamp) as earliest_event,
          MAX(event_timestamp) as latest_event
        FROM audit_events 
        WHERE event_timestamp BETWEEN $1 AND $2
        GROUP BY data_classification, gdpr_lawful_basis
        ORDER BY data_classification, gdpr_lawful_basis
      `, [startDate, endDate]);

      return {
        period: { startDate, endDate },
        statistics: result.rows,
        totalEvents: result.rows.reduce((sum, row) => sum + parseInt(row.event_count), 0)
      };
      
    } catch (error) {
      console.error('Failed to generate compliance stats:', error);
      throw new Error(`Compliance stats generation failed: ${error.message}`);
    }
  }

  /**
   * Clean up expired audit events (for retention management)
   */
  async cleanupExpiredEvents() {
    try {
      const result = await this.query(`
        DELETE FROM audit_events 
        WHERE retention_expiry_date < CURRENT_DATE
        RETURNING COUNT(*) as deleted_count
      `);

      const deletedCount = result.rows[0]?.deleted_count || 0;
      
      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} expired audit events`);
        
        // Log the cleanup action itself
        await this.logAuditEvent({
          eventType: 'data_management',
          eventSubtype: 'audit_cleanup',
          eventDetails: {
            deleted_count: deletedCount,
            cleanup_date: new Date().toISOString()
          },
          gdprLawfulBasis: 'legal_obligation',
          dataClassification: 'internal'
        });
      }

      return deletedCount;
      
    } catch (error) {
      console.error('Failed to cleanup expired events:', error);
      throw new Error(`Audit cleanup failed: ${error.message}`);
    }
  }

  /**
   * Close connection pool
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

// Singleton instance for module exports
const auditService = new AuditService();

/**
 * Convenience functions for common audit events
 */
const AuditHelpers = {
  // Authentication events
  async logAuthentication(success, userId, sessionId, sourceIp, userAgent, provider, requestId, deviceId = null) {
    return auditService.logAuditEvent({
      eventType: 'authentication',
      eventSubtype: success ? 'login_success' : 'login_failure',
      userId,
      sessionId,
      sourceIp,
      userAgent,
      requestId,
      eventDetails: {
        success,
        auth_provider: provider,
        device_id: deviceId,
        timestamp: new Date().toISOString()
      },
      gdprLawfulBasis: 'consent',
      dataClassification: 'confidential'
    });
  },

  async logBiometricAuth(success, userId, sessionId, biometricType, deviceId, sourceIp, requestId) {
    return auditService.logAuditEvent({
      eventType: 'security_event',
      eventSubtype: success ? 'biometric_auth_success' : 'biometric_auth_failure',
      userId,
      sessionId,
      sourceIp,
      requestId,
      eventDetails: {
        success,
        biometric_type: biometricType,
        device_id: deviceId,
        timestamp: new Date().toISOString()
      },
      gdprLawfulBasis: 'legitimate_interests',
      dataClassification: 'restricted'
    });
  },

  // Data access events
  async logDataAccess(userId, sessionId, dataType, operation, sourceIp, userAgent, requestId, success = true) {
    return auditService.logAuditEvent({
      eventType: 'data_access',
      eventSubtype: `${dataType}_${operation}`,
      userId,
      sessionId,
      sourceIp,
      userAgent,
      requestId,
      eventDetails: {
        data_type: dataType,
        operation,
        success,
        timestamp: new Date().toISOString()
      },
      gdprLawfulBasis: 'consent',
      dataClassification: dataType.includes('medical') ? 'medical_phi' : 'confidential'
    });
  },

  // Consent management events
  async logConsentChange(userId, sessionId, consentTypes, granted, version, sourceIp, userAgent, requestId) {
    return auditService.logAuditEvent({
      eventType: 'consent_management',
      eventSubtype: granted ? 'consent_granted' : 'consent_withdrawn',
      userId,
      sessionId,
      sourceIp,
      userAgent,
      requestId,
      eventDetails: {
        consent_types: consentTypes,
        consent_granted: granted,
        consent_version: version,
        ui_method: 'bundled_consent',
        timestamp: new Date().toISOString()
      },
      gdprLawfulBasis: 'consent',
      dataClassification: 'medical_phi'
    });
  },

  // Financial transaction events
  async logPayment(userId, sessionId, paymentId, amount, currency, status, provider, sourceIp, requestId) {
    return auditService.logAuditEvent({
      eventType: 'financial_transaction',
      eventSubtype: 'payment_processed',
      userId,
      sessionId,
      sourceIp,
      requestId,
      eventDetails: {
        payment_id: paymentId,
        amount: parseFloat(amount),
        currency,
        payment_status: status,
        payment_provider: provider,
        timestamp: new Date().toISOString()
      },
      gdprLawfulBasis: 'contract',
      dataClassification: 'restricted'
    });
  },

  // Security events
  async logSecurityEvent(eventSubtype, userId, sessionId, sourceIp, userAgent, requestId, details = {}) {
    return auditService.logAuditEvent({
      eventType: 'security_event',
      eventSubtype,
      userId,
      sessionId,
      sourceIp,
      userAgent,
      requestId,
      eventDetails: {
        ...details,
        timestamp: new Date().toISOString()
      },
      gdprLawfulBasis: 'legitimate_interests',
      dataClassification: 'restricted'
    });
  }
};

module.exports = {
  AuditService: auditService,
  AuditHelpers
};