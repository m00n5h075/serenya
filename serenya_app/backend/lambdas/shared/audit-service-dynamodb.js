const AWS = require('aws-sdk');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * DynamoDB-Native Audit Service for HIPAA/GDPR Compliance
 * Implements deployment-ready audit logging with tamper detection and privacy protection
 * Uses DynamoDB for storage and S3 for long-term compliance archival
 */
class DynamoDBAuditService {
  constructor() {
    this.dynamodb = new AWS.DynamoDB.DocumentClient({ region: process.env.AWS_REGION || 'eu-west-1' });
    this.s3 = new AWS.S3({ region: process.env.AWS_REGION || 'eu-west-1' });
    this.auditTable = process.env.AUDIT_TABLE || `serenya-audit-${process.env.ENVIRONMENT}`;
    this.complianceBucket = process.env.COMPLIANCE_BUCKET || `serenya-compliance-${process.env.ENVIRONMENT}`;
    this.environment = process.env.ENVIRONMENT || 'dev';
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
    // Only hash first 3 octets for privacy while maintaining geo-location value
    const truncatedIp = ipAddress.split('.').slice(0, 3).join('.') + '.0';
    return crypto.createHash('sha256').update(truncatedIp).digest('hex');
  }

  /**
   * Generate privacy-safe user agent hash
   */
  generateUserAgentHash(userAgent) {
    if (!userAgent) return null;
    // Extract only browser family and version for privacy
    const browserPattern = /(Chrome|Firefox|Safari|Edge)\/(\d+)/;
    const match = userAgent.match(browserPattern);
    const simplifiedUA = match ? `${match[1]}/${match[2]}` : 'unknown';
    return crypto.createHash('sha256').update(simplifiedUA).digest('hex');
  }

  /**
   * Calculate event hash for tamper detection
   */
  calculateEventHash(eventTimestamp, eventType, eventSubtype, userIdHash, sessionId, eventDetails) {
    const hashInput = [
      eventTimestamp,
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
      const eventTimestamp = new Date().toISOString();
      const auditId = uuidv4();
      
      // Generate privacy-safe hashes
      const userIdHash = userId ? this.generateUserIdHash(userId) : null;
      const adminUserIdHash = adminUserId ? this.generateUserIdHash(adminUserId) : null;
      const sourceIpHash = sourceIp ? this.generateIpHash(sourceIp) : null;
      const userAgentHash = userAgent ? this.generateUserAgentHash(userAgent) : null;
      
      // Calculate tamper detection hash
      const eventHash = this.calculateEventHash(
        eventTimestamp,
        eventType,
        eventSubtype,
        userIdHash,
        sessionId,
        eventDetails
      );
      
      // Prepare audit record
      const auditRecord = {
        audit_id: auditId,
        event_timestamp: eventTimestamp,
        event_type: eventType,
        event_subtype: eventSubtype,
        user_id_hash: userIdHash,
        session_id: sessionId,
        admin_user_id_hash: adminUserIdHash,
        source_ip_hash: sourceIpHash,
        user_agent_hash: userAgentHash,
        request_id: requestId,
        event_details: eventDetails,
        gdpr_lawful_basis: gdprLawfulBasis,
        data_classification: dataClassification,
        retention_period_years: retentionYears,
        event_hash: eventHash,
        environment: this.environment,
        created_at: eventTimestamp,
        // DynamoDB TTL for automatic cleanup (if not indefinite retention)
        ttl: retentionYears > 0 ? Math.floor(Date.now() / 1000) + (retentionYears * 365 * 24 * 60 * 60) : undefined
      };

      // Store in DynamoDB for immediate access and querying
      await this.dynamodb.put({
        TableName: this.auditTable,
        Item: auditRecord
      }).promise();

      // For critical/medical PHI events, also store in S3 for long-term compliance
      if (dataClassification === 'medical_phi' || dataClassification === 'security_event') {
        await this.storeComplianceRecord(auditRecord);
      }

      return auditId;
    } catch (error) {
      // Audit failures should not break business logic, but should be logged
      console.error('Audit logging failed:', {
        error: error.message,
        eventType,
        eventSubtype,
        timestamp: new Date().toISOString()
      });
      
      // Return null to indicate failure without throwing
      return null;
    }
  }

  /**
   * Store compliance record in S3 for long-term archival
   */
  async storeComplianceRecord(auditRecord) {
    try {
      const year = new Date(auditRecord.event_timestamp).getFullYear();
      const month = String(new Date(auditRecord.event_timestamp).getMonth() + 1).padStart(2, '0');
      const day = String(new Date(auditRecord.event_timestamp).getDate()).padStart(2, '0');
      
      const key = `compliance-logs/${year}/${month}/${day}/${auditRecord.audit_id}.json`;
      
      await this.s3.putObject({
        Bucket: this.complianceBucket,
        Key: key,
        Body: JSON.stringify(auditRecord, null, 2),
        ServerSideEncryption: 'AES256',
        ContentType: 'application/json',
        Metadata: {
          'event-type': auditRecord.event_type,
          'data-classification': auditRecord.data_classification,
          'retention-years': auditRecord.retention_period_years.toString()
        }
      }).promise();
    } catch (error) {
      console.error('Failed to store compliance record:', error.message);
    }
  }

  /**
   * Query audit events with privacy protection
   */
  async queryAuditEvents({
    eventType = null,
    eventSubtype = null,
    userId = null,
    startTime = null,
    endTime = null,
    limit = 100
  }) {
    try {
      const userIdHash = userId ? this.generateUserIdHash(userId) : null;
      
      let params = {
        TableName: this.auditTable,
        Limit: limit,
        ScanIndexForward: false // Most recent first
      };

      // Use GSI for efficient querying by event type
      if (eventType) {
        params.IndexName = 'event-type-timestamp-index';
        params.KeyConditionExpression = 'event_type = :eventType';
        params.ExpressionAttributeValues = {
          ':eventType': eventType
        };

        if (startTime) {
          params.KeyConditionExpression += ' AND event_timestamp >= :startTime';
          params.ExpressionAttributeValues[':startTime'] = startTime;
        }
      } else {
        // Full table scan with filters (use sparingly)
        params.FilterExpression = '';
        params.ExpressionAttributeValues = {};
        
        if (startTime) {
          params.FilterExpression += 'event_timestamp >= :startTime';
          params.ExpressionAttributeValues[':startTime'] = startTime;
        }
      }

      // Add additional filters
      if (eventSubtype) {
        if (params.FilterExpression) params.FilterExpression += ' AND ';
        params.FilterExpression += 'event_subtype = :eventSubtype';
        params.ExpressionAttributeValues[':eventSubtype'] = eventSubtype;
      }

      if (userIdHash) {
        if (params.FilterExpression) params.FilterExpression += ' AND ';
        params.FilterExpression += 'user_id_hash = :userIdHash';
        params.ExpressionAttributeValues[':userIdHash'] = userIdHash;
      }

      if (endTime) {
        if (params.FilterExpression) params.FilterExpression += ' AND ';
        params.FilterExpression += 'event_timestamp <= :endTime';
        params.ExpressionAttributeValues[':endTime'] = endTime;
      }

      const result = await this.dynamodb.query(params).promise();
      return result.Items;
    } catch (error) {
      console.error('Failed to query audit events:', error.message);
      return [];
    }
  }

  /**
   * Generate compliance report for GDPR/HIPAA
   */
  async generateComplianceReport(userId, startDate, endDate) {
    try {
      const auditEvents = await this.queryAuditEvents({
        userId,
        startTime: startDate,
        endTime: endDate,
        limit: 1000
      });

      const report = {
        user_id_hash: this.generateUserIdHash(userId),
        report_generated_at: new Date().toISOString(),
        period: {
          start: startDate,
          end: endDate
        },
        total_events: auditEvents.length,
        events_by_type: {},
        data_access_events: auditEvents.filter(e => e.event_type === 'data_access'),
        authentication_events: auditEvents.filter(e => e.event_type === 'authentication'),
        processing_events: auditEvents.filter(e => e.event_type === 'document_processing')
      };

      // Count events by type
      auditEvents.forEach(event => {
        const type = event.event_type;
        report.events_by_type[type] = (report.events_by_type[type] || 0) + 1;
      });

      return report;
    } catch (error) {
      console.error('Failed to generate compliance report:', error.message);
      throw error;
    }
  }

  /**
   * Verify audit trail integrity
   */
  async verifyAuditIntegrity(auditId) {
    try {
      const result = await this.dynamodb.get({
        TableName: this.auditTable,
        Key: { audit_id: auditId }
      }).promise();

      if (!result.Item) {
        return { valid: false, reason: 'Audit record not found' };
      }

      const record = result.Item;
      const recalculatedHash = this.calculateEventHash(
        record.event_timestamp,
        record.event_type,
        record.event_subtype,
        record.user_id_hash,
        record.session_id,
        record.event_details
      );

      const valid = recalculatedHash === record.event_hash;
      
      return {
        valid,
        reason: valid ? 'Audit record integrity verified' : 'Hash mismatch - potential tampering detected',
        original_hash: record.event_hash,
        calculated_hash: recalculatedHash
      };
    } catch (error) {
      console.error('Failed to verify audit integrity:', error.message);
      return { valid: false, reason: `Verification failed: ${error.message}` };
    }
  }

  /**
   * Delete user data for GDPR compliance (right to be forgotten)
   */
  async deleteUserAuditData(userId) {
    try {
      const userIdHash = this.generateUserIdHash(userId);
      
      // Query all audit events for this user
      const auditEvents = await this.queryAuditEvents({
        userId,
        limit: 10000 // Adjust based on expected data volume
      });

      const deletePromises = auditEvents.map(event => 
        this.dynamodb.delete({
          TableName: this.auditTable,
          Key: { audit_id: event.audit_id }
        }).promise()
      );

      await Promise.all(deletePromises);

      // Log the deletion event
      await this.logAuditEvent({
        eventType: 'data_erasure',
        eventSubtype: 'user_audit_data_deleted',
        userId: null, // Don't store deleted user ID
        eventDetails: {
          user_id_hash: userIdHash,
          records_deleted: auditEvents.length,
          deletion_timestamp: new Date().toISOString()
        },
        gdprLawfulBasis: 'gdpr_right_to_erasure',
        dataClassification: 'gdpr_compliance'
      });

      return {
        success: true,
        records_deleted: auditEvents.length
      };
    } catch (error) {
      console.error('Failed to delete user audit data:', error.message);
      throw error;
    }
  }
}

// Create singleton instance
const auditService = new DynamoDBAuditService();

module.exports = {
  auditService,
  DynamoDBAuditService
};