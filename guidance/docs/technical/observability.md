# Serenya Observability Implementation
**Focus:** Business Metrics + Technical Performance Monitoring  
**Timeline:** Weeks 3-6 (parallel to MVP development)  
**Cost:** €101/month (1.7% of infrastructure budget)  
**Date:** August 27, 2025

---

## 📋 Executive Summary

Complete observability system for Serenya's AI Health Agent, optimized for AWS-first architecture and startup cost efficiency. This implementation provides actionable business insights and technical performance monitoring through PostgreSQL-based metrics collection with Grafana Cloud dashboards.

**Key Business Requirements:**
- Real-time business metrics for founder decision-making
- Technical performance monitoring for engineering team
- Cost-efficient tooling within €101/month budget
- Implementation parallel to MVP development (weeks 3-6)

---

## 🎯 Core Metrics Architecture

### **Business Metrics (Founder Priority)**
- **Files submitted** - Total uploaded documents
- **Files processed successfully** - Completed AI analyses  
- **Files failed** - Processing failures with reasons
- **Reports generated** - Total doctor reports created
- **AI analyses completed** - Successful medical interpretations
- **Total users** - All registered users
- **Users per plan** - Free tier vs Premium breakdown

### **Technical Performance Metrics**
- **API response times** - Request latency tracking
- **Database query performance** - Slow query identification
- **AI processing time per document** - End-to-end analysis duration
- **System uptime** - Service availability monitoring

---

## 🗄️ Database Schema for Metrics Collection

### **Core Metrics Tables**
```sql
-- Business metrics aggregation
CREATE TABLE metrics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value BIGINT NOT NULL,
    metric_type VARCHAR(20) NOT NULL, -- 'counter', 'gauge', 'histogram'
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB -- Additional context (plan_type, error_code, etc.)
);

-- API performance tracking (ENHANCED with encryption support)
CREATE TABLE api_performance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    response_time_ms INTEGER NOT NULL,
    status_code INTEGER NOT NULL,
    user_id UUID REFERENCES users(id),
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,
    -- NEW: Encryption tracking fields
    is_encrypted BOOLEAN DEFAULT FALSE, -- Whether request/response used encryption
    encryption_overhead_ms INTEGER, -- Additional latency from encryption
    encryption_success BOOLEAN, -- Whether encryption operations succeeded
    fallback_used BOOLEAN DEFAULT FALSE, -- Whether unencrypted fallback was used
    encryption_version VARCHAR(10), -- 'v1' for application-layer encryption
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    error_details TEXT
);

-- Database query performance monitoring
CREATE TABLE query_performance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_hash VARCHAR(64) NOT NULL, -- SHA256 hash of query
    execution_time_ms INTEGER NOT NULL,
    table_name VARCHAR(100),
    operation_type VARCHAR(20), -- SELECT, INSERT, UPDATE, DELETE
    rows_affected INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Business events tracking
CREATE TABLE business_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    event_type VARCHAR(50) NOT NULL, -- 'file_upload', 'report_generated', 'plan_upgrade'
    event_details JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI processing performance
CREATE TABLE ai_processing_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_job_id UUID REFERENCES ai_processing_jobs(id),
    user_id UUID REFERENCES users(id),
    ai_provider VARCHAR(50) NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    processing_time_ms INTEGER NOT NULL,
    cost_cents INTEGER NOT NULL,
    success BOOLEAN NOT NULL,
    error_type VARCHAR(100),
    confidence_score INTEGER, -- 1-10 AI confidence level
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Encryption performance metrics (NEW)
CREATE TABLE encryption_performance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_type VARCHAR(50) NOT NULL, -- 'encrypt_request', 'decrypt_response', 'key_derivation', 'biometric_auth'
    table_key_id VARCHAR(50) NOT NULL, -- 'serenya_content', 'chat_messages', 'device_root'
    operation_time_ms INTEGER NOT NULL,
    payload_size_bytes INTEGER,
    encrypted_size_bytes INTEGER, -- NULL for decryption operations
    size_overhead_percent NUMERIC(5,2), -- Calculated encryption overhead
    success BOOLEAN NOT NULL,
    error_type VARCHAR(100), -- 'key_derivation_failed', 'aes_encryption_failed', 'biometric_auth_failed'
    user_id_hash VARCHAR(64), -- sha256(user_id) for privacy
    endpoint VARCHAR(255), -- API endpoint for context
    encryption_algorithm VARCHAR(50) DEFAULT 'AES-256-GCM',
    key_derivation_version VARCHAR(10) DEFAULT 'v1',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Security audit metrics (NEW)
CREATE TABLE security_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL, -- 'biometric_auth', 'key_access', 'tampering_detected', 'fallback_used'
    security_level VARCHAR(20) NOT NULL, -- 'high', 'medium', 'low', 'fallback'
    success BOOLEAN NOT NULL,
    threat_level VARCHAR(20) DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
    threat_detected BOOLEAN DEFAULT false,
    user_id_hash VARCHAR(64), -- sha256(user_id) for privacy
    device_info JSONB, -- Platform, version, biometric type
    recovery_action VARCHAR(100), -- 'retry_auth', 'fallback_used', 'request_blocked'
    endpoint VARCHAR(255),
    session_id VARCHAR(100),
    consecutive_failures INTEGER DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Network encryption audit (NEW)
CREATE TABLE network_encryption_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id VARCHAR(100) NOT NULL, -- Unique request identifier
    user_id_hash VARCHAR(64), -- sha256(user_id) for privacy
    endpoint VARCHAR(255) NOT NULL,
    encryption_used BOOLEAN NOT NULL, -- Whether encryption was applied
    encryption_success BOOLEAN, -- NULL if no encryption attempted
    fallback_reason VARCHAR(100), -- Why fallback was used (if any)
    data_classification VARCHAR(50), -- 'medical_data', 'metadata', 'authentication'
    payload_hash VARCHAR(64), -- sha256 of payload for integrity tracking
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Hourly/daily aggregates for dashboard performance
CREATE TABLE metrics_aggregates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(100) NOT NULL,
    time_bucket TIMESTAMP WITH TIME ZONE NOT NULL, -- Hour or day boundary
    bucket_type VARCHAR(10) NOT NULL, -- 'hour', 'day'
    total_count BIGINT,
    average_value NUMERIC(10,2),
    min_value NUMERIC(10,2),
    max_value NUMERIC(10,2),
    unique_users INTEGER,
    success_rate NUMERIC(5,2), -- For encryption success rates
    security_incidents INTEGER DEFAULT 0, -- Count of security events
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### **Enhanced Existing Tables**
```sql
-- Add metrics tracking to existing tables
ALTER TABLE diagnostic_reports 
ADD COLUMN processing_time_ms INTEGER,
ADD COLUMN ai_confidence_score NUMERIC(3,2),
ADD COLUMN processing_status VARCHAR(20) DEFAULT 'completed',
ADD COLUMN file_size_bytes INTEGER;

ALTER TABLE ai_processing_jobs 
ADD COLUMN queue_wait_time_ms INTEGER,
ADD COLUMN actual_processing_time_ms INTEGER,
ADD COLUMN error_category VARCHAR(50),
ADD COLUMN retry_count INTEGER DEFAULT 0;

ALTER TABLE users 
ADD COLUMN last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN plan_changed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN plan_change_reason VARCHAR(100);
```

### **Performance Indexes**
```sql
-- Optimized indexes for dashboard queries
CREATE INDEX idx_metrics_snapshots_name_time ON metrics_snapshots(metric_name, recorded_at DESC);
CREATE INDEX idx_api_performance_endpoint_time ON api_performance_logs(endpoint, timestamp DESC);
CREATE INDEX idx_business_events_type_time ON business_events(event_type, timestamp DESC);
CREATE INDEX idx_metrics_aggregates_lookup ON metrics_aggregates(metric_name, bucket_type, time_bucket DESC);
CREATE INDEX idx_users_plan_created ON users(subscription_plan, created_at);
CREATE INDEX idx_diagnostic_reports_user_date ON diagnostic_reports(user_id, report_date DESC);
CREATE INDEX idx_ai_processing_time ON ai_processing_metrics(recorded_at DESC, success);

-- NEW: Encryption performance indexes
CREATE INDEX idx_encryption_performance_operation_time ON encryption_performance_logs(operation_type, timestamp DESC);
CREATE INDEX idx_encryption_performance_success ON encryption_performance_logs(success, timestamp DESC);
CREATE INDEX idx_security_metrics_event_time ON security_metrics(event_type, timestamp DESC);
CREATE INDEX idx_security_metrics_threat ON security_metrics(threat_detected, threat_level, timestamp DESC);
CREATE INDEX idx_network_encryption_endpoint ON network_encryption_audit(endpoint, encryption_used, timestamp DESC);
CREATE INDEX idx_api_performance_encryption ON api_performance_logs(is_encrypted, timestamp DESC);
CREATE INDEX idx_api_performance_fallback ON api_performance_logs(fallback_used, timestamp DESC);
```

---

## 💻 Data Collection Implementation

### **Enhanced Express Middleware for API Metrics (with Encryption Tracking)**
```javascript
// middleware/metrics-collector.js
const collectAPIMetrics = (req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;
  
  // Track encryption context
  const isEncryptedRequest = req.headers['x-serenya-encryption'] === 'v1' || req.body?.encrypted_payload;
  const encryptionVersion = req.headers['x-serenya-encryption'] || null;
  let encryptionOverhead = 0;
  let encryptionSuccess = null;
  let fallbackUsed = false;
  
  // Hook into encryption timing if available
  if (req.encryptionMetrics) {
    encryptionOverhead = req.encryptionMetrics.totalOverheadMs || 0;
    encryptionSuccess = req.encryptionMetrics.success;
    fallbackUsed = req.encryptionMetrics.fallbackUsed || false;
  }
  
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    const requestSize = req.get('content-length') || 0;
    const responseSize = Buffer.byteLength(data || '', 'utf8');
    
    // Check if response is encrypted
    const isEncryptedResponse = res.get('X-Serenya-Encryption-Status') === 'encrypted' ||
                                (typeof data === 'string' && data.includes('encrypted_data'));
    
    const isEncrypted = isEncryptedRequest || isEncryptedResponse;
    
    // Async insert to avoid blocking response
    setImmediate(() => {
      db.query(`
        INSERT INTO api_performance_logs 
        (endpoint, method, response_time_ms, status_code, user_id, request_size_bytes, 
         response_size_bytes, is_encrypted, encryption_overhead_ms, encryption_success, 
         fallback_used, encryption_version)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [req.route?.path || req.path, req.method, responseTime, res.statusCode, 
          req.user?.id, requestSize, responseSize, isEncrypted, encryptionOverhead,
          encryptionSuccess, fallbackUsed, encryptionVersion]);
    });
    
    originalSend.call(this, data);
  };
  
  next();
};
```

### **Business Metrics Service**
```javascript
// services/metrics-service.js
class MetricsService {
  // Core business metric collection
  async recordFileUpload(userId, filename, fileSize) {
    await this.recordBusinessEvent(userId, 'file_upload', {
      filename_hash: hashFilename(filename),
      file_size_bytes: fileSize,
      timestamp: new Date()
    });
    
    await this.incrementCounter('files_submitted_total');
  }
  
  async recordAIAnalysis(processingJobId, success, processingTime, cost, confidence) {
    await Promise.all([
      this.recordBusinessEvent(userId, 'ai_analysis_complete', {
        success: success,
        processing_time_ms: processingTime,
        confidence_score: confidence
      }),
      
      db.query(`
        INSERT INTO ai_processing_metrics 
        (processing_job_id, ai_provider, processing_time_ms, cost_cents, success, confidence_score)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [processingJobId, 'anthropic_claude', processingTime, cost, success, confidence])
    ]);
    
    await this.incrementCounter('ai_analyses_completed');
  }
  
  async recordReportGenerated(userId, reportType) {
    await this.recordBusinessEvent(userId, 'report_generated', {
      report_type: reportType,
      user_plan: await this.getUserPlan(userId)
    });
    
    await this.incrementCounter('reports_generated_total');
  }
  
  async recordPlanUpgrade(userId, fromPlan, toPlan) {
    await this.recordBusinessEvent(userId, 'plan_upgrade', {
      from_plan: fromPlan,
      to_plan: toPlan,
      upgrade_timestamp: new Date()
    });
    
    await this.incrementCounter(`plan_upgrades_${fromPlan}_to_${toPlan}`);
  }
  
  // Helper methods
  async incrementCounter(metricName, value = 1) {
    await db.query(`
      INSERT INTO metrics_snapshots (metric_name, metric_value, metric_type)
      VALUES ($1, $2, 'counter')
    `, [metricName, value]);
  }
  
  async recordGauge(metricName, value, metadata = {}) {
    await db.query(`
      INSERT INTO metrics_snapshots (metric_name, metric_value, metric_type, metadata)
      VALUES ($1, $2, 'gauge', $3)
    `, [metricName, value, JSON.stringify(metadata)]);
  }
}
```

### **Encryption Metrics Service (NEW)**
```javascript
// services/encryption-metrics-service.js
class EncryptionMetricsService {
  // Record encryption performance for client-server operations
  static async recordEncryptionOperation(
    operationType, 
    tableKeyId, 
    operationTimeMs, 
    payloadSize, 
    encryptedSize, 
    success, 
    errorType = null,
    userIdHash = null,
    endpoint = null
  ) {
    const sizeOverheadPercent = payloadSize && encryptedSize ? 
      ((encryptedSize - payloadSize) / payloadSize * 100).toFixed(2) : null;
    
    await db.query(`
      INSERT INTO encryption_performance_logs 
      (operation_type, table_key_id, operation_time_ms, payload_size_bytes, 
       encrypted_size_bytes, size_overhead_percent, success, error_type, 
       user_id_hash, endpoint)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [operationType, tableKeyId, operationTimeMs, payloadSize, encryptedSize,
        sizeOverheadPercent, success, errorType, userIdHash, endpoint]);
    
    // Update hourly aggregates
    await this.updateEncryptionAggregates(operationType, success, operationTimeMs);
  }
  
  // Record security events
  static async recordSecurityEvent(
    eventType, 
    securityLevel, 
    success, 
    threatLevel = 'low',
    threatDetected = false,
    userIdHash = null,
    deviceInfo = null,
    recoveryAction = null,
    endpoint = null
  ) {
    await db.query(`
      INSERT INTO security_metrics 
      (event_type, security_level, success, threat_level, threat_detected, 
       user_id_hash, device_info, recovery_action, endpoint)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [eventType, securityLevel, success, threatLevel, threatDetected,
        userIdHash, deviceInfo ? JSON.stringify(deviceInfo) : null, 
        recoveryAction, endpoint]);
        
    // Alert on high-threat events
    if (threatLevel === 'high' || threatLevel === 'critical') {
      await this.triggerSecurityAlert(eventType, threatLevel, userIdHash);
    }
  }
  
  // Track biometric authentication performance
  static async recordBiometricAuth(
    success, 
    authMethod, 
    responseTimeMs, 
    userIdHash, 
    deviceInfo,
    consecutiveFailures = 0
  ) {
    const securityLevel = consecutiveFailures > 3 ? 'low' : 'high';
    const threatLevel = consecutiveFailures > 5 ? 'medium' : 'low';
    
    await Promise.all([
      this.recordSecurityEvent(
        'biometric_auth', 
        securityLevel, 
        success, 
        threatLevel,
        consecutiveFailures > 5, // Threat detected if too many failures
        userIdHash, 
        deviceInfo, 
        success ? 'authenticated' : 'auth_retry',
        '/auth/biometric'
      ),
      
      this.recordEncryptionOperation(
        'biometric_auth',
        'device_root',
        responseTimeMs,
        null, // No payload size for auth
        null,
        success,
        success ? null : 'biometric_auth_failed',
        userIdHash,
        '/auth/biometric'
      )
    ]);
  }
  
  // Track key derivation performance
  static async recordKeyDerivation(
    tableKeyId, 
    derivationTimeMs, 
    success, 
    userIdHash,
    errorType = null
  ) {
    await this.recordEncryptionOperation(
      'key_derivation',
      tableKeyId,
      derivationTimeMs,
      null, // No payload for key derivation
      null,
      success,
      errorType,
      userIdHash
    );
  }
  
  // Track encryption fallback usage
  static async recordEncryptionFallback(
    endpoint, 
    reason, 
    userIdHash,
    originalError
  ) {
    await Promise.all([
      this.recordSecurityEvent(
        'fallback_used',
        'fallback', // Reduced security level
        true, // Fallback succeeded
        'medium', // Medium threat level for reduced security
        false,
        userIdHash,
        { fallback_reason: reason, original_error: originalError },
        'fallback_to_tls',
        endpoint
      ),
      
      // Record business metric for fallback usage
      db.query(`
        INSERT INTO business_events (event_type, event_details)
        VALUES ('encryption_fallback_used', $1)
      `, [JSON.stringify({ 
        endpoint, 
        reason, 
        user_id_hash: userIdHash,
        timestamp: new Date().toISOString() 
      })])
    ]);
  }
  
  // Helper: Update encryption aggregates
  static async updateEncryptionAggregates(operationType, success, operationTimeMs) {
    const currentHour = new Date();
    currentHour.setMinutes(0, 0, 0);
    
    await db.query(`
      INSERT INTO metrics_aggregates 
      (metric_name, time_bucket, bucket_type, total_count, average_value, success_rate)
      VALUES ($1, $2, 'hour', 1, $3, $4)
      ON CONFLICT (metric_name, time_bucket, bucket_type) 
      DO UPDATE SET 
        total_count = metrics_aggregates.total_count + 1,
        average_value = (metrics_aggregates.average_value * metrics_aggregates.total_count + $3) / 
                       (metrics_aggregates.total_count + 1),
        success_rate = (metrics_aggregates.success_rate * metrics_aggregates.total_count + 
                       (CASE WHEN $4 THEN 100 ELSE 0 END)) / (metrics_aggregates.total_count + 1)
    `, [`encryption_${operationType}`, currentHour, operationTimeMs, success]);
  }
  
  // Helper: Trigger security alerts
  static async triggerSecurityAlert(eventType, threatLevel, userIdHash) {
    console.warn(`SECURITY ALERT: ${eventType} - Threat Level: ${threatLevel} - User: ${userIdHash}`);
    // TODO: Integrate with alerting system (Sentry, email, Slack, etc.)
  }
}

module.exports = EncryptionMetricsService;
```

### **Database Performance Wrapper**
```javascript
// database/performance-wrapper.js
const originalQuery = db.query;

db.query = async function(text, params) {
  const startTime = Date.now();
  const queryHash = crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
  
  try {
    const result = await originalQuery.call(this, text, params);
    const executionTime = Date.now() - startTime;
    
    // Log slow queries (>100ms)
    if (executionTime > 100) {
      setImmediate(() => {
        db.query(`
          INSERT INTO query_performance_logs 
          (query_hash, execution_time_ms, operation_type, rows_affected)
          VALUES ($1, $2, $3, $4)
        `, [queryHash, executionTime, text.trim().split(' ')[0], result.rowCount || 0]);
      });
    }
    
    return result;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    // Log failed queries
    setImmediate(() => {
      db.query(`
        INSERT INTO query_performance_logs 
        (query_hash, execution_time_ms, operation_type, rows_affected)
        VALUES ($1, $2, $3, $4)
      `, [queryHash, executionTime, 'ERROR', 0]);
    });
    throw error;
  }
};
```

### **Automated Metrics Collection Jobs**
```javascript
// jobs/metrics-aggregation.js
const cron = require('node-cron');

class MetricsCollector {
  static startPeriodicCollection() {
    // Collect daily business metrics every hour
    cron.schedule('0 * * * *', async () => {
      await this.aggregateHourlyMetrics();
    });

    // Collect system metrics every 5 minutes  
    cron.schedule('*/5 * * * *', async () => {
      await this.collectSystemMetrics();
    });

    // Daily aggregation at midnight
    cron.schedule('0 0 * * *', async () => {
      await this.aggregateDailyMetrics();
    });
  }

  static async aggregateHourlyMetrics() {
    const currentHour = new Date();
    currentHour.setMinutes(0, 0, 0);
    
    // Aggregate API performance by hour
    await db.query(`
      INSERT INTO metrics_aggregates (metric_name, time_bucket, bucket_type, total_count, average_value, min_value, max_value)
      SELECT 
        CONCAT('api_response_time_', endpoint) as metric_name,
        $1 as time_bucket,
        'hour' as bucket_type,
        COUNT(*) as total_count,
        AVG(response_time_ms) as average_value,
        MIN(response_time_ms) as min_value,
        MAX(response_time_ms) as max_value
      FROM api_performance_logs 
      WHERE timestamp >= $1 AND timestamp < $1 + INTERVAL '1 hour'
      GROUP BY endpoint
    `, [currentHour]);
    
    // Clean up raw data older than 7 days
    await db.query(`
      DELETE FROM api_performance_logs 
      WHERE timestamp < NOW() - INTERVAL '7 days'
    `);
  }

  static async aggregateDailyMetrics() {
    const currentDay = new Date();
    currentDay.setHours(0, 0, 0, 0);
    
    // User growth metrics
    await db.query(`
      INSERT INTO metrics_aggregates (metric_name, time_bucket, bucket_type, total_count)
      VALUES 
        ('new_users', $1, 'day', (
          SELECT COUNT(*) FROM users 
          WHERE created_at >= $1 AND created_at < $1 + INTERVAL '1 day'
        )),
        ('total_users', $1, 'day', (
          SELECT COUNT(*) FROM users 
          WHERE created_at <= $1 + INTERVAL '1 day'
        ))
    `, [currentDay]);
  }
}
```

---

## 📊 Dashboard Queries & Implementation

### **Business Metrics SQL Queries**
```sql
-- Total files submitted (all time)
SELECT COUNT(*) as total_files_submitted 
FROM business_events 
WHERE event_type = 'file_upload';

-- Files processed successfully vs failed
SELECT 
  SUM(CASE WHEN processing_status = 'completed' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN processing_status = 'failed' THEN 1 ELSE 0 END) as failed,
  COUNT(*) as total,
  ROUND(
    SUM(CASE WHEN processing_status = 'completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 
    2
  ) as success_rate_percent
FROM diagnostic_reports;

-- Reports generated by type (last 30 days)
SELECT 
  event_details->>'report_type' as report_type,
  COUNT(*) as count
FROM business_events 
WHERE event_type = 'report_generated'
  AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY event_details->>'report_type';

-- AI analyses performance
SELECT 
  DATE(recorded_at) as date,
  COUNT(*) as total_analyses,
  COUNT(*) FILTER (WHERE success = true) as successful,
  ROUND(AVG(processing_time_ms)::numeric, 0) as avg_processing_time_ms,
  ROUND(AVG(confidence_score)::numeric, 1) as avg_confidence_score,
  SUM(cost_cents)/100.0 as total_cost_euros
FROM ai_processing_metrics 
WHERE recorded_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(recorded_at)
ORDER BY date;

-- Users by plan distribution
SELECT 
  subscription_plan,
  COUNT(*) as user_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM users 
GROUP BY subscription_plan;

-- Monthly active users (activity in last 30 days)
SELECT COUNT(DISTINCT user_id) as monthly_active_users
FROM business_events 
WHERE timestamp >= NOW() - INTERVAL '30 days';

-- Daily metrics trend (last 30 days)
SELECT 
  DATE(timestamp) as date,
  COUNT(CASE WHEN event_type = 'file_upload' THEN 1 END) as files_uploaded,
  COUNT(CASE WHEN event_type = 'report_generated' THEN 1 END) as reports_generated,
  COUNT(DISTINCT user_id) as active_users
FROM business_events 
WHERE timestamp >= NOW() - INTERVAL '30 days'
GROUP BY DATE(timestamp)
ORDER BY date;
```

### **Technical Performance Queries**
```sql
-- API response time percentiles (last 24 hours)
SELECT 
  endpoint,
  COUNT(*) as request_count,
  ROUND(AVG(response_time_ms)::numeric, 2) as avg_response_time,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_ms) as p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) as p99
FROM api_performance_logs 
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY endpoint
ORDER BY avg_response_time DESC;

-- Error rate by endpoint
SELECT 
  endpoint,
  COUNT(*) as total_requests,
  SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count,
  ROUND(
    SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 
    2
  ) as error_rate_percent
FROM api_performance_logs 
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY endpoint
HAVING COUNT(*) > 10
ORDER BY error_rate_percent DESC;

-- Slow database queries (last 24 hours)
SELECT 
  query_hash,
  operation_type,
  table_name,
  COUNT(*) as execution_count,
  ROUND(AVG(execution_time_ms)::numeric, 2) as avg_time_ms,
  MAX(execution_time_ms) as max_time_ms
FROM query_performance_logs 
WHERE timestamp >= NOW() - INTERVAL '24 hours'
  AND execution_time_ms > 50
GROUP BY query_hash, operation_type, table_name
ORDER BY avg_time_ms DESC
LIMIT 20;
```

---

## 🛠️ Recommended Tool Stack

### **Primary: Grafana Cloud (€50/month)**
- **Features**: Dashboards, alerting, PostgreSQL integration
- **Benefits**: Managed service, no infrastructure overhead
- **Rationale**: Direct database connection, proven reliability

### **Application Monitoring: Sentry (€26/month)**
- **Features**: Error tracking, performance monitoring, user impact
- **Benefits**: Node.js SDK, real-time alerting
- **Rationale**: Critical error detection and user experience monitoring

### **Infrastructure: AWS CloudWatch (Free tier)**
- **Features**: System metrics, custom metrics, log aggregation
- **Benefits**: Included with AWS services, 10 free custom metrics
- **Rationale**: Native AWS integration, cost-effective

### **Additional: Custom Metrics API**
- **Features**: Real-time dashboard data via Express endpoints
- **Benefits**: Cached queries, JSON API, external integrations
- **Rationale**: Fast dashboard loading, business-specific metrics

---

## 📊 Dashboard Architecture

### **Executive Dashboard (Enhanced Business Metrics)**
```
┌─────────────────────────────────────────────────────────┐
│ SERENYA BUSINESS DASHBOARD                              │
├─────────────────────────────────────────────────────────┤
│ Today's Metrics:                                        │
│ • Files Uploaded: 47          • Reports Generated: 23   │
│ • AI Analyses: 45             • New Users: 8            │
│ • Premium Users: 127 (18%)    • Success Rate: 94.5%     │
│ • Encrypted Uploads: 37 (79%) • Security Level: HIGH    │
├─────────────────────────────────────────────────────────┤
│ [7-Day Trend Chart: Files & Reports + Encryption Usage] │
│ [30-Day User Growth Chart]                              │
│ [AI Confidence Score Distribution]                      │
│ [Cost per Analysis Trend + Security Overhead]          │
│ [Encryption Adoption Rate]                              │
└─────────────────────────────────────────────────────────┘
```

### **Technical Dashboard (Enhanced Engineering Metrics)**
```
┌─────────────────────────────────────────────────────────┐
│ SERENYA TECHNICAL DASHBOARD                             │
├─────────────────────────────────────────────────────────┤
│ API Performance (24h):                                 │
│ • Avg Response Time: 245ms    • P95: 890ms             │
│ • Error Rate: 2.1%            • Total Requests: 1,247  │
│ • Encrypted Requests: 978     • Encryption Overhead: +67ms │
├─────────────────────────────────────────────────────────┤
│ Database Performance:                                   │
│ • Slow Queries (>100ms): 12  • Avg Query Time: 45ms    │
│ • Active Connections: 23/100  • Lock Wait Time: 2ms    │
├─────────────────────────────────────────────────────────┤
│ AI Processing:                                          │
│ • Avg Processing Time: 34s    • Queue Depth: 3         │
│ • Success Rate: 97.2%         • Daily Capacity: 89%    │
└─────────────────────────────────────────────────────────┘
```

### **Security & Encryption Dashboard (NEW)**
```
┌─────────────────────────────────────────────────────────┐
│ SERENYA SECURITY & ENCRYPTION DASHBOARD                │
├─────────────────────────────────────────────────────────┤
│ Encryption Performance (24h):                          │
│ • Encrypted API Calls: 1,247 (78% of total)           │
│ • Avg Encryption Overhead: +67ms (Target: <100ms)     │
│ • Encryption Success Rate: 99.2% (Target: >99%)       │
│ • Fallback Usage: 0.8% (10 requests)                  │
├─────────────────────────────────────────────────────────┤
│ Security Events & Authentication:                       │
│ • Biometric Auth Success: 98.5% (Target: >95%)        │
│ • Key Derivation Failures: 3 (Target: <10/day)       │
│ • Potential Tampering: 0 detected                     │
│ • Security Fallbacks: 2 instances                     │
├─────────────────────────────────────────────────────────┤
│ Medical Data Protection:                                │
│ • Medical Content Encrypted: 100% (HIPAA Compliant)   │
│ • Avg Payload Size Increase: +18% (encryption overhead) │
│ • Data Integrity Checks: 1,247 passed, 0 failed      │
│ • Audit Events Logged: 2,456 (all security actions)  │
├─────────────────────────────────────────────────────────┤
│ [24h Encryption Performance Trend]                     │
│ [Security Event Timeline]                              │
│ [Biometric Auth Failure Patterns]                     │
│ [Encryption vs Standard Performance Comparison]        │
└─────────────────────────────────────────────────────────┘
```

### **Executive Security Summary (NEW)**
```
┌─────────────────────────────────────────────────────────┐
│ SERENYA SECURITY EXECUTIVE SUMMARY                     │
├─────────────────────────────────────────────────────────┤
│ Security Posture: EXCELLENT ✅                         │
│ • Medical Data Protection: 100% Encrypted             │
│ • HIPAA Compliance: FULL                               │
│ • Security Incidents: 0 critical, 0 high, 2 medium   │
│ • User Trust Score: 98.5% (biometric auth success)    │
├─────────────────────────────────────────────────────────┤
│ Performance Impact:                                     │
│ • Encryption Overhead: +67ms avg (within target)      │
│ • User Experience: No degradation detected            │
│ • System Reliability: 99.9% uptime maintained         │
│ • Cost Impact: +€15/month (monitoring + overhead)     │
├─────────────────────────────────────────────────────────┤
│ Key Metrics (Last 30 Days):                           │
│ • Total Encrypted Operations: 47,856                   │
│ • Security Events Handled: 127                        │
│ • Fallback Usage Rate: 0.3% (acceptable)             │
│ • Zero Data Breaches: ✅                              │
└─────────────────────────────────────────────────────────┘
```

---

## 🗓️ Implementation Timeline

### **Week 3-4: Foundation Setup**
**Tasks:**
- Database schema migration and indexes (1 day)
- Express middleware integration (2 days)
- Basic metrics collection service (3 days)
- Grafana Cloud setup and connection (1 day)

**Deliverables:**
- Core metrics collection active
- Basic business dashboard functional
- API performance tracking enabled

### **Week 5: Dashboard Development**
**Tasks:**
- Custom business metrics dashboard (3 days)
- Technical performance dashboard (2 days)
- Alert configuration for critical metrics (1 day)
- Sentry integration for error tracking (1 day)

**Deliverables:**
- Complete dashboard suite
- Automated alerting system
- Error tracking and reporting

### **Week 6: Optimization & Production**
**Tasks:**
- Query performance optimization (2 days)
- Metric aggregation job implementation (2 days)
- Documentation and runbooks (2 days)
- Load testing dashboard performance (1 day)

**Deliverables:**
- Production-ready observability system
- Operations documentation
- Performance-validated queries

---

## 💰 Cost Analysis & ROI

### **Monthly Tool Costs**
```
Grafana Cloud (Starter):        €50/month
Sentry (Team plan):            €26/month  
AWS CloudWatch (free tier):     €0/month
Custom metrics storage:        ~€10/month (database + encryption metrics)
Additional infrastructure:     ~€25/month (5-10% overhead + encryption monitoring)
────────────────────────────────────────
Total Monthly Cost:            €111/month
```

### **Infrastructure Impact**
- **Database storage**: +~750MB/month for metrics tables (including encryption performance logs)
- **CPU overhead**: ~8% additional load for metrics collection and encryption monitoring
- **Memory usage**: +~150MB for metrics service caching and encryption tracking
- **Network usage**: +~5% bandwidth for encrypted metrics transmission

### **ROI Analysis**
- **Cost percentage**: €111/month = 1.9% of total infrastructure budget
- **Business value**: Complete visibility into user behavior, system performance, and security posture
- **Decision support**: Data-driven insights for product development and security optimization
- **Risk mitigation**: Early detection of technical, business, and security issues
- **Compliance value**: HIPAA audit trail and encryption performance validation

---

## 🔒 Security & Privacy

### **Data Privacy**
- **No PHI in metrics**: Only aggregate counts and performance data
- **User anonymization**: User IDs hashed in aggregated metrics  
- **GDPR compliance**: 90-day data retention aligned with business requirements
- **Access controls**: Dashboard access restricted by role (exec, eng, ops)

### **Technical Security**
- **Encrypted transit**: All metrics data via HTTPS/TLS
- **Database encryption**: Metrics tables encrypted at rest
- **Access logging**: All dashboard access logged and monitored
- **API authentication**: Metrics endpoints require valid JWT tokens

---

## ✅ Success Metrics & Validation

### **Technical Success Criteria**
- **Dashboard load time**: <2 seconds for all views
- **Data freshness**: Business metrics updated within 5 minutes
- **Query performance**: All dashboard queries <500ms
- **System impact**: <5% additional CPU/memory overhead
- **Uptime**: 99.9% availability for dashboard and metrics collection

### **Business Success Criteria**
- **Daily usage**: Dashboard accessed daily by product/engineering teams
- **Decision impact**: 3+ product decisions per month informed by metrics
- **Problem detection**: Technical issues detected before user reports
- **Trend identification**: Weekly business insights delivered to leadership

---

## 🔍 Encryption Monitoring Queries & Examples

### **Performance Analysis Queries**

```sql
-- Encryption operation performance by type
SELECT 
    operation_type,
    table_key_id,
    AVG(operation_time_ms) as avg_time_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY operation_time_ms) as p95_time_ms,
    COUNT(*) as operation_count,
    (COUNT(*) FILTER (WHERE success = false))::float / COUNT(*) * 100 as failure_rate_pct
FROM encryption_performance_logs 
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY operation_type, table_key_id
ORDER BY avg_time_ms DESC;

-- Daily encryption overhead impact
SELECT 
    DATE_TRUNC('day', timestamp) as date,
    COUNT(*) as total_operations,
    AVG(operation_time_ms) as avg_encryption_time_ms,
    SUM(payload_size_bytes) / 1024 / 1024 as total_data_mb,
    AVG(encrypted_size_bytes::float / payload_size_bytes) as avg_size_overhead_ratio
FROM encryption_performance_logs 
WHERE timestamp >= NOW() - INTERVAL '30 days'
    AND payload_size_bytes > 0 
    AND encrypted_size_bytes > 0
GROUP BY DATE_TRUNC('day', timestamp)
ORDER BY date DESC;

-- Encryption failures by error type
SELECT 
    error_type,
    endpoint,
    COUNT(*) as failure_count,
    COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as failure_percentage
FROM encryption_performance_logs 
WHERE success = false 
    AND timestamp >= NOW() - INTERVAL '7 days'
GROUP BY error_type, endpoint
ORDER BY failure_count DESC;
```

### **Security Analysis Queries**

```sql
-- Suspicious encryption patterns (potential tampering)
SELECT 
    user_id_hash,
    endpoint,
    operation_type,
    COUNT(*) as attempt_count,
    COUNT(*) FILTER (WHERE success = false) as failure_count,
    ARRAY_AGG(DISTINCT error_type) FILTER (WHERE error_type IS NOT NULL) as error_types
FROM encryption_performance_logs 
WHERE timestamp >= NOW() - INTERVAL '1 hour'
GROUP BY user_id_hash, endpoint, operation_type
HAVING COUNT(*) FILTER (WHERE success = false) > 5  -- Multiple failures indicate issues
ORDER BY failure_count DESC;

-- Key derivation performance monitoring
SELECT 
    table_key_id,
    DATE_TRUNC('hour', timestamp) as hour,
    COUNT(*) as derivation_count,
    AVG(operation_time_ms) as avg_derivation_time_ms,
    MAX(operation_time_ms) as max_derivation_time_ms
FROM encryption_performance_logs 
WHERE operation_type = 'key_derivation'
    AND timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY table_key_id, DATE_TRUNC('hour', timestamp)
ORDER BY hour DESC, avg_derivation_time_ms DESC;

-- Biometric authentication success rates
SELECT 
    DATE_TRUNC('day', timestamp) as date,
    COUNT(*) as total_auth_attempts,
    COUNT(*) FILTER (WHERE success = true) as successful_attempts,
    COUNT(*) FILTER (WHERE success = true) * 100.0 / COUNT(*) as success_rate_pct,
    ARRAY_AGG(DISTINCT error_type) FILTER (WHERE error_type IS NOT NULL) as error_patterns
FROM encryption_performance_logs 
WHERE operation_type = 'biometric_auth'
    AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', timestamp)
ORDER BY date DESC;
```

### **Business Impact Queries**

```sql
-- API response time correlation with encryption
SELECT 
    apl.endpoint,
    apl.method,
    COUNT(*) as total_requests,
    AVG(apl.response_time_ms) as avg_response_time_ms,
    AVG(CASE WHEN apl.has_encryption = true 
             THEN apl.response_time_ms END) as avg_encrypted_response_ms,
    AVG(CASE WHEN apl.has_encryption = false 
             THEN apl.response_time_ms END) as avg_unencrypted_response_ms,
    AVG(epl.operation_time_ms) as avg_encryption_overhead_ms
FROM api_performance_logs apl
LEFT JOIN encryption_performance_logs epl 
    ON apl.request_id = epl.user_id_hash  -- Simplified join example
    AND apl.timestamp BETWEEN epl.timestamp - INTERVAL '1 second' 
                          AND epl.timestamp + INTERVAL '1 second'
WHERE apl.timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY apl.endpoint, apl.method
HAVING COUNT(*) > 100  -- Only endpoints with significant traffic
ORDER BY avg_encrypted_response_ms DESC;

-- User experience impact of encryption
SELECT 
    DATE_TRUNC('hour', apl.timestamp) as hour,
    COUNT(*) as total_requests,
    AVG(apl.response_time_ms) as avg_response_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY apl.response_time_ms) as p95_response_time,
    COUNT(*) FILTER (WHERE apl.response_time_ms > 2000) as slow_requests_count,
    COUNT(*) FILTER (WHERE apl.has_encryption = true) as encrypted_requests
FROM api_performance_logs apl
WHERE apl.timestamp >= NOW() - INTERVAL '48 hours'
GROUP BY DATE_TRUNC('hour', apl.timestamp)
ORDER BY hour DESC;
```

### **Alerting Query Examples**

```sql
-- Critical: High encryption failure rate (>5% in last 10 minutes)
SELECT 
    operation_type,
    COUNT(*) as total_operations,
    COUNT(*) FILTER (WHERE success = false) as failures,
    COUNT(*) FILTER (WHERE success = false) * 100.0 / COUNT(*) as failure_rate_pct
FROM encryption_performance_logs 
WHERE timestamp >= NOW() - INTERVAL '10 minutes'
GROUP BY operation_type
HAVING COUNT(*) FILTER (WHERE success = false) * 100.0 / COUNT(*) > 5;

-- Warning: Encryption operations taking too long (>100ms average)
SELECT 
    table_key_id,
    operation_type,
    COUNT(*) as operation_count,
    AVG(operation_time_ms) as avg_time_ms,
    MAX(operation_time_ms) as max_time_ms
FROM encryption_performance_logs 
WHERE timestamp >= NOW() - INTERVAL '15 minutes'
GROUP BY table_key_id, operation_type
HAVING AVG(operation_time_ms) > 100
ORDER BY avg_time_ms DESC;

-- Critical: Potential security breach (multiple failed auth attempts)
SELECT 
    user_id_hash,
    COUNT(*) as failed_attempts,
    ARRAY_AGG(DISTINCT endpoint) as affected_endpoints,
    MIN(timestamp) as first_failure,
    MAX(timestamp) as last_failure
FROM encryption_performance_logs 
WHERE operation_type = 'biometric_auth'
    AND success = false
    AND timestamp >= NOW() - INTERVAL '5 minutes'
GROUP BY user_id_hash
HAVING COUNT(*) >= 3
ORDER BY failed_attempts DESC;
```

### **Dashboard Query Examples**

```sql
-- Executive Summary: Daily encryption health
SELECT 
    'Today' as period,
    COUNT(DISTINCT user_id_hash) as active_users,
    COUNT(*) as total_crypto_operations,
    COUNT(*) FILTER (WHERE success = true) * 100.0 / COUNT(*) as success_rate_pct,
    AVG(operation_time_ms) as avg_performance_ms,
    SUM(payload_size_bytes) / 1024 / 1024 as data_processed_mb
FROM encryption_performance_logs 
WHERE timestamp >= CURRENT_DATE;

-- Technical Dashboard: Performance breakdown
SELECT 
    operation_type,
    table_key_id,
    COUNT(*) as operations,
    AVG(operation_time_ms) as avg_ms,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY operation_time_ms) as median_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY operation_time_ms) as p95_ms,
    MAX(operation_time_ms) as max_ms,
    COUNT(*) FILTER (WHERE success = false) as failures
FROM encryption_performance_logs 
WHERE timestamp >= NOW() - INTERVAL '1 hour'
GROUP BY operation_type, table_key_id
ORDER BY avg_ms DESC;
```

---

## 📚 Cross-References

**Related Documents:**
- **Technical Architecture**: `technical-overview.md` (AWS infrastructure foundation)
- **Healthcare Compliance**: `healthcare-compliance-migration.md` (compliance monitoring)
- **Development Standards**: `our-dev-rules.md` (team coordination)

**Linear Task Integration:**
- Epic 10: Observability & Monitoring (M00-105 to M00-112)
- Epic 6.5: AI Prompt Engineering (M00-64 to M00-71) - AI confidence metrics
- Epic 8: Medical Safety Framework (M00-88 to M00-95) - safety metrics

---

This observability implementation provides comprehensive, cost-effective monitoring for Serenya's AWS-first architecture while maintaining startup budget constraints and enabling data-driven decision making from day one.