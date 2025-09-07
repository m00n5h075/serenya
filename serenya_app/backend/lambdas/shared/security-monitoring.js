const AWS = require('aws-sdk');
const { AuditHelpers } = require('./audit-service');

/**
 * Security Monitoring and Alerting Service
 * Implements real-time security monitoring with automated alerting for healthcare compliance
 */
class SecurityMonitor {
  constructor() {
    this.cloudWatch = new AWS.CloudWatch({
      region: process.env.REGION || 'eu-west-1'
    });
    
    this.sns = new AWS.SNS({
      region: process.env.REGION || 'eu-west-1'
    });

    // Security thresholds configuration
    this.thresholds = {
      failedLogins: {
        perMinute: 5,
        perHour: 20,
        perUser: 10
      },
      encryptionFailures: {
        perMinute: 3,
        perHour: 10
      },
      rateLimitExceeded: {
        perMinute: 10,
        perHour: 50
      },
      suspiciousActivity: {
        perHour: 15
      },
      biometricFailures: {
        perUser: 5,
        perDevice: 8
      }
    };

    // In-memory counters (in production, use Redis/DynamoDB for distributed monitoring)
    this.counters = new Map();
  }

  /**
   * Log security metric to CloudWatch
   */
  async logSecurityMetric(metricName, value, unit = 'Count', dimensions = []) {
    try {
      const params = {
        Namespace: `Serenya/${process.env.ENVIRONMENT}/Security`,
        MetricData: [{
          MetricName: metricName,
          Value: value,
          Unit: unit,
          Timestamp: new Date(),
          Dimensions: dimensions.map(dim => ({
            Name: dim.name,
            Value: dim.value
          }))
        }]
      };

      await this.cloudWatch.putMetricData(params).promise();
      
    } catch (error) {
      console.error('Failed to log security metric:', error);
    }
  }

  /**
   * Create security alarm in CloudWatch
   */
  async createSecurityAlarm(alarmName, metricName, threshold, comparisonOperator = 'GreaterThanThreshold') {
    try {
      const params = {
        AlarmName: `Serenya-${process.env.ENVIRONMENT}-${alarmName}`,
        ComparisonOperator: comparisonOperator,
        EvaluationPeriods: 1,
        MetricName: metricName,
        Namespace: `Serenya/${process.env.ENVIRONMENT}/Security`,
        Period: 300, // 5 minutes
        Statistic: 'Sum',
        Threshold: threshold,
        ActionsEnabled: true,
        AlarmActions: [
          process.env.SECURITY_ALERT_TOPIC_ARN
        ].filter(Boolean),
        AlarmDescription: `Security alert: ${alarmName} threshold exceeded`,
        Unit: 'Count'
      };

      await this.cloudWatch.putMetricAlarm(params).promise();
      console.log(`Security alarm created: ${params.AlarmName}`);
      
    } catch (error) {
      console.error('Failed to create security alarm:', error);
    }
  }

  /**
   * Update counter and check thresholds
   */
  updateCounter(key, increment = 1, windowMs = 60000) {
    const now = Date.now();
    
    if (!this.counters.has(key)) {
      this.counters.set(key, []);
    }
    
    const events = this.counters.get(key);
    
    // Add current event
    events.push(now);
    
    // Remove events outside the window
    const windowStart = now - windowMs;
    const recentEvents = events.filter(timestamp => timestamp > windowStart);
    
    this.counters.set(key, recentEvents);
    
    return recentEvents.length;
  }

  /**
   * Check if threshold is exceeded
   */
  isThresholdExceeded(key, threshold, windowMs = 60000) {
    const count = this.updateCounter(key, 0, windowMs); // Don't increment, just check
    return count >= threshold;
  }

  /**
   * Send security alert
   */
  async sendSecurityAlert(alertType, severity, details) {
    try {
      const message = {
        alertType,
        severity,
        timestamp: new Date().toISOString(),
        environment: process.env.ENVIRONMENT,
        details,
        region: process.env.REGION
      };

      // Log to CloudWatch
      console.error('SECURITY_ALERT:', JSON.stringify(message));

      // Send SNS notification if topic is configured
      if (process.env.SECURITY_ALERT_TOPIC_ARN) {
        await this.sns.publish({
          TopicArn: process.env.SECURITY_ALERT_TOPIC_ARN,
          Subject: `Serenya Security Alert: ${alertType} (${severity})`,
          Message: JSON.stringify(message, null, 2)
        }).promise();
      }

      // Log security event to audit trail
      await AuditHelpers.logSecurityEvent(
        'security_alert_generated',
        null,
        null,
        null,
        null,
        null,
        {
          alert_type: alertType,
          severity,
          details
        }
      );

    } catch (error) {
      console.error('Failed to send security alert:', error);
    }
  }

  /**
   * Monitor authentication failures
   */
  async monitorAuthenticationFailure(userId, sessionId, sourceIp, userAgent, requestId, reason) {
    try {
      // Log metric
      await this.logSecurityMetric('AuthenticationFailures', 1, 'Count', [
        { name: 'Reason', value: reason },
        { name: 'SourceIP', value: sourceIp || 'unknown' }
      ]);

      // Update counters
      const globalFailures = this.updateCounter('auth_failures_global', 1, 60000);
      const userFailures = userId ? this.updateCounter(`auth_failures_user_${userId}`, 1, 3600000) : 0;
      const ipFailures = sourceIp ? this.updateCounter(`auth_failures_ip_${sourceIp}`, 1, 3600000) : 0;

      // Check thresholds and send alerts
      if (globalFailures >= this.thresholds.failedLogins.perMinute) {
        await this.sendSecurityAlert('HIGH_AUTHENTICATION_FAILURE_RATE', 'HIGH', {
          failures_per_minute: globalFailures,
          threshold: this.thresholds.failedLogins.perMinute,
          source_ip: sourceIp,
          reason
        });
      }

      if (userFailures >= this.thresholds.failedLogins.perUser) {
        await this.sendSecurityAlert('USER_ACCOUNT_COMPROMISE_ATTEMPT', 'HIGH', {
          user_id: userId,
          failures: userFailures,
          source_ip: sourceIp,
          reason
        });
      }

      if (ipFailures >= 15) { // IP-based threshold
        await this.sendSecurityAlert('SUSPICIOUS_IP_ACTIVITY', 'MEDIUM', {
          source_ip: sourceIp,
          failures: ipFailures,
          time_window: '1 hour'
        });
      }

      // Log audit event
      await AuditHelpers.logAuthentication(
        false, userId, sessionId, sourceIp, userAgent, reason, requestId
      );

    } catch (error) {
      console.error('Failed to monitor authentication failure:', error);
    }
  }

  /**
   * Monitor encryption failures
   */
  async monitorEncryptionFailure(operation, error, userId, sessionId, sourceIp, requestId) {
    try {
      // Log metric
      await this.logSecurityMetric('EncryptionFailures', 1, 'Count', [
        { name: 'Operation', value: operation },
        { name: 'ErrorType', value: error.name || 'UnknownError' }
      ]);

      // Update counter
      const encryptionFailures = this.updateCounter('encryption_failures', 1, 60000);

      // Check threshold
      if (encryptionFailures >= this.thresholds.encryptionFailures.perMinute) {
        await this.sendSecurityAlert('ENCRYPTION_SYSTEM_FAILURE', 'CRITICAL', {
          operation,
          error_message: error.message,
          failures_per_minute: encryptionFailures,
          threshold: this.thresholds.encryptionFailures.perMinute
        });
      }

      // Log audit event
      await AuditHelpers.logSecurityEvent(
        'encryption_failure',
        userId,
        sessionId,
        sourceIp,
        null,
        requestId,
        {
          operation,
          error_type: error.name,
          error_message: error.message
        }
      );

    } catch (alertError) {
      console.error('Failed to monitor encryption failure:', alertError);
    }
  }

  /**
   * Monitor biometric authentication failures
   */
  async monitorBiometricFailure(userId, deviceId, biometricType, sessionId, sourceIp, requestId) {
    try {
      // Log metric
      await this.logSecurityMetric('BiometricFailures', 1, 'Count', [
        { name: 'BiometricType', value: biometricType },
        { name: 'DeviceType', value: 'mobile' }
      ]);

      // Update counters
      const userFailures = this.updateCounter(`biometric_failures_user_${userId}`, 1, 3600000);
      const deviceFailures = this.updateCounter(`biometric_failures_device_${deviceId}`, 1, 3600000);

      // Check thresholds
      if (userFailures >= this.thresholds.biometricFailures.perUser) {
        await this.sendSecurityAlert('BIOMETRIC_COMPROMISE_ATTEMPT', 'HIGH', {
          user_id: userId,
          device_id: deviceId,
          biometric_type: biometricType,
          failures: userFailures,
          threshold: this.thresholds.biometricFailures.perUser
        });
      }

      if (deviceFailures >= this.thresholds.biometricFailures.perDevice) {
        await this.sendSecurityAlert('DEVICE_COMPROMISE_ATTEMPT', 'HIGH', {
          device_id: deviceId,
          biometric_type: biometricType,
          failures: deviceFailures,
          threshold: this.thresholds.biometricFailures.perDevice
        });
      }

      // Log audit event
      await AuditHelpers.logBiometricAuth(
        false, userId, sessionId, biometricType, deviceId, sourceIp, requestId
      );

    } catch (error) {
      console.error('Failed to monitor biometric failure:', error);
    }
  }

  /**
   * Monitor suspicious file uploads
   */
  async monitorSuspiciousUpload(userId, filename, reason, sourceIp, userAgent, requestId) {
    try {
      // Log metric
      await this.logSecurityMetric('SuspiciousUploads', 1, 'Count', [
        { name: 'Reason', value: reason },
        { name: 'FileType', value: filename.split('.').pop() || 'unknown' }
      ]);

      // Always alert on suspicious uploads
      await this.sendSecurityAlert('SUSPICIOUS_FILE_UPLOAD', 'MEDIUM', {
        user_id: userId,
        filename,
        reason,
        source_ip: sourceIp,
        user_agent: userAgent
      });

      // Log audit event
      await AuditHelpers.logSecurityEvent(
        'suspicious_file_upload',
        userId,
        null,
        sourceIp,
        userAgent,
        requestId,
        {
          filename,
          reason,
          blocked: true
        }
      );

    } catch (error) {
      console.error('Failed to monitor suspicious upload:', error);
    }
  }

  /**
   * Monitor rate limit violations
   */
  async monitorRateLimitExceeded(identifier, limit, current, sourceIp, userAgent) {
    try {
      // Log metric
      await this.logSecurityMetric('RateLimitViolations', 1, 'Count', [
        { name: 'IdentifierType', value: identifier.includes('user_') ? 'user' : 'ip' },
        { name: 'Limit', value: limit.toString() }
      ]);

      // Update counter
      const rateLimitViolations = this.updateCounter('rate_limit_violations', 1, 60000);

      // Check if this is becoming a pattern
      if (rateLimitViolations >= this.thresholds.rateLimitExceeded.perMinute) {
        await this.sendSecurityAlert('DOS_ATTACK_DETECTED', 'HIGH', {
          violations_per_minute: rateLimitViolations,
          source_ip: sourceIp,
          identifier,
          limit,
          current
        });
      }

      // Log individual rate limit event
      await AuditHelpers.logSecurityEvent(
        'rate_limit_exceeded',
        identifier.includes('user_') ? identifier.replace('user_', '') : null,
        null,
        sourceIp,
        userAgent,
        null,
        {
          identifier,
          limit,
          current,
          violation_type: 'rate_limit'
        }
      );

    } catch (error) {
      console.error('Failed to monitor rate limit exceeded:', error);
    }
  }

  /**
   * Monitor KMS key usage anomalies
   */
  async monitorKMSUsage(operation, success, duration, encryptionContext = {}) {
    try {
      // Log metrics
      await this.logSecurityMetric('KMSOperations', 1, 'Count', [
        { name: 'Operation', value: operation },
        { name: 'Success', value: success.toString() }
      ]);

      await this.logSecurityMetric('KMSLatency', duration, 'Milliseconds', [
        { name: 'Operation', value: operation }
      ]);

      // Monitor for unusual patterns
      if (!success) {
        const kmsFailures = this.updateCounter('kms_failures', 1, 300000); // 5 minutes
        
        if (kmsFailures >= 5) {
          await this.sendSecurityAlert('KMS_OPERATION_FAILURES', 'CRITICAL', {
            operation,
            failures: kmsFailures,
            duration,
            encryption_context: encryptionContext
          });
        }
      }

      // Monitor for performance issues
      if (duration > 5000) { // 5 seconds threshold
        await this.sendSecurityAlert('KMS_PERFORMANCE_DEGRADATION', 'MEDIUM', {
          operation,
          duration,
          threshold: 5000,
          encryption_context: encryptionContext
        });
      }

    } catch (error) {
      console.error('Failed to monitor KMS usage:', error);
    }
  }

  /**
   * Monitor data access patterns
   */
  async monitorDataAccess(userId, dataType, operation, recordCount, sourceIp, userAgent, requestId) {
    try {
      // Log metrics
      await this.logSecurityMetric('DataAccess', recordCount || 1, 'Count', [
        { name: 'DataType', value: dataType },
        { name: 'Operation', value: operation },
        { name: 'User', value: userId || 'anonymous' }
      ]);

      // Monitor for bulk data access
      if (recordCount > 100) {
        await this.sendSecurityAlert('BULK_DATA_ACCESS', 'MEDIUM', {
          user_id: userId,
          data_type: dataType,
          operation,
          record_count: recordCount,
          source_ip: sourceIp
        });
      }

      // Monitor for after-hours access
      const hour = new Date().getHours();
      if (hour < 6 || hour > 22) { // Outside business hours
        const afterHoursAccess = this.updateCounter(`after_hours_${userId}`, 1, 86400000); // 24 hours
        
        if (afterHoursAccess >= 5) {
          await this.sendSecurityAlert('AFTER_HOURS_DATA_ACCESS', 'MEDIUM', {
            user_id: userId,
            data_type: dataType,
            operation,
            access_count: afterHoursAccess,
            time_period: '24 hours'
          });
        }
      }

      // Log audit event
      await AuditHelpers.logDataAccess(
        userId, null, dataType, operation, sourceIp, userAgent, requestId, true
      );

    } catch (error) {
      console.error('Failed to monitor data access:', error);
    }
  }

  /**
   * Initialize security monitoring (setup alarms)
   */
  async initializeMonitoring() {
    try {
      const alarms = [
        { name: 'AuthFailures', metric: 'AuthenticationFailures', threshold: 10 },
        { name: 'EncryptionFailures', metric: 'EncryptionFailures', threshold: 3 },
        { name: 'BiometricFailures', metric: 'BiometricFailures', threshold: 5 },
        { name: 'SuspiciousUploads', metric: 'SuspiciousUploads', threshold: 1 },
        { name: 'RateLimitViolations', metric: 'RateLimitViolations', threshold: 20 },
        { name: 'KMSFailures', metric: 'KMSOperations', threshold: 5 }
      ];

      for (const alarm of alarms) {
        await this.createSecurityAlarm(alarm.name, alarm.metric, alarm.threshold);
      }

      console.log('Security monitoring initialized with CloudWatch alarms');

    } catch (error) {
      console.error('Failed to initialize security monitoring:', error);
    }
  }

  /**
   * Get security metrics summary
   */
  async getSecurityMetricsSummary(startTime, endTime) {
    try {
      const metrics = [
        'AuthenticationFailures',
        'EncryptionFailures',
        'BiometricFailures',
        'SuspiciousUploads',
        'RateLimitViolations',
        'KMSOperations',
        'DataAccess'
      ];

      const results = {};

      for (const metricName of metrics) {
        const params = {
          Namespace: `Serenya/${process.env.ENVIRONMENT}/Security`,
          MetricName: metricName,
          StartTime: startTime,
          EndTime: endTime,
          Period: 3600, // 1 hour
          Statistics: ['Sum', 'Average', 'Maximum']
        };

        try {
          const data = await this.cloudWatch.getMetricStatistics(params).promise();
          results[metricName] = {
            datapoints: data.Datapoints.length,
            total: data.Datapoints.reduce((sum, dp) => sum + dp.Sum, 0),
            average: data.Datapoints.length > 0 ? 
              data.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / data.Datapoints.length : 0,
            maximum: Math.max(...data.Datapoints.map(dp => dp.Maximum), 0)
          };
        } catch (metricError) {
          results[metricName] = { error: metricError.message };
        }
      }

      return results;

    } catch (error) {
      console.error('Failed to get security metrics summary:', error);
      throw error;
    }
  }
}

// Create singleton instance
const securityMonitor = new SecurityMonitor();

// Export convenience functions
const SecurityMonitorHelpers = {
  authFailure: (userId, sessionId, sourceIp, userAgent, requestId, reason) =>
    securityMonitor.monitorAuthenticationFailure(userId, sessionId, sourceIp, userAgent, requestId, reason),
  
  encryptionFailure: (operation, error, userId, sessionId, sourceIp, requestId) =>
    securityMonitor.monitorEncryptionFailure(operation, error, userId, sessionId, sourceIp, requestId),
  
  biometricFailure: (userId, deviceId, biometricType, sessionId, sourceIp, requestId) =>
    securityMonitor.monitorBiometricFailure(userId, deviceId, biometricType, sessionId, sourceIp, requestId),
  
  suspiciousUpload: (userId, filename, reason, sourceIp, userAgent, requestId) =>
    securityMonitor.monitorSuspiciousUpload(userId, filename, reason, sourceIp, userAgent, requestId),
  
  rateLimitExceeded: (identifier, limit, current, sourceIp, userAgent) =>
    securityMonitor.monitorRateLimitExceeded(identifier, limit, current, sourceIp, userAgent),
  
  kmsUsage: (operation, success, duration, encryptionContext) =>
    securityMonitor.monitorKMSUsage(operation, success, duration, encryptionContext),
  
  dataAccess: (userId, dataType, operation, recordCount, sourceIp, userAgent, requestId) =>
    securityMonitor.monitorDataAccess(userId, dataType, operation, recordCount, sourceIp, userAgent, requestId)
};

module.exports = {
  SecurityMonitor: securityMonitor,
  SecurityMonitorHelpers
};