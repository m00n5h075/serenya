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

-- API performance tracking
CREATE TABLE api_performance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    response_time_ms INTEGER NOT NULL,
    status_code INTEGER NOT NULL,
    user_id UUID REFERENCES users(id),
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,
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
```

---

## 💻 Data Collection Implementation

### **Express Middleware for API Metrics**
```javascript
// middleware/metrics-collector.js
const collectAPIMetrics = (req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;
  
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    const requestSize = req.get('content-length') || 0;
    const responseSize = Buffer.byteLength(data || '', 'utf8');
    
    // Async insert to avoid blocking response
    setImmediate(() => {
      db.query(`
        INSERT INTO api_performance_logs 
        (endpoint, method, response_time_ms, status_code, user_id, request_size_bytes, response_size_bytes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [req.route?.path || req.path, req.method, responseTime, res.statusCode, 
          req.user?.id, requestSize, responseSize]);
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

### **Executive Dashboard (Business Metrics)**
```
┌─────────────────────────────────────────────────────────┐
│ SERENYA BUSINESS DASHBOARD                              │
├─────────────────────────────────────────────────────────┤
│ Today's Metrics:                                        │
│ • Files Uploaded: 47          • Reports Generated: 23   │
│ • AI Analyses: 45             • New Users: 8            │
│ • Premium Users: 127 (18%)    • Success Rate: 94.5%     │
├─────────────────────────────────────────────────────────┤
│ [7-Day Trend Chart: Files & Reports]                   │
│ [30-Day User Growth Chart]                              │
│ [AI Confidence Score Distribution]                      │
│ [Cost per Analysis Trend]                               │
└─────────────────────────────────────────────────────────┘
```

### **Technical Dashboard (Engineering Metrics)**
```
┌─────────────────────────────────────────────────────────┐
│ SERENYA TECHNICAL DASHBOARD                             │
├─────────────────────────────────────────────────────────┤
│ API Performance (24h):                                 │
│ • Avg Response Time: 245ms    • P95: 890ms             │
│ • Error Rate: 2.1%            • Total Requests: 1,247  │
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
Custom metrics storage:        ~€5/month (database)
Additional infrastructure:     ~€20/month (5-10% overhead)
────────────────────────────────────────
Total Monthly Cost:            €101/month
```

### **Infrastructure Impact**
- **Database storage**: +~500MB/month for metrics tables
- **CPU overhead**: ~5% additional load for metrics collection
- **Memory usage**: +~100MB for metrics service caching
- **Network usage**: Negligible additional bandwidth

### **ROI Analysis**
- **Cost percentage**: €101/month = 1.7% of total infrastructure budget
- **Business value**: Complete visibility into user behavior and system performance
- **Decision support**: Data-driven insights for product development
- **Risk mitigation**: Early detection of technical and business issues

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