# Serenya Observability Framework
*DynamoDB-Native Architecture*

**Date:** 2025-10-02
**Status:** ✅ Fully Implemented
**Owner:** Development Team

---

## Executive Summary

This document describes Serenya's comprehensive observability strategy and implementation for our serverless, DynamoDB-native healthcare AI platform. Our observability framework ensures HIPAA compliance, operational excellence, and business intelligence while providing actionable insights across user experiences, system performance, and medical AI operations.

## Core Principles

### Healthcare-First Design
- **HIPAA Compliance**: All metrics and logs maintain strict PHI protection
- **Patient Safety**: Critical alerts for AI model accuracy and medical data integrity
- **Audit Trail**: Complete traceability for regulatory compliance

### Serverless-Native Approach
- **Event-Driven**: Metrics triggered by Lambda executions and DynamoDB streams
- **Cost-Optimized**: Pay-per-use monitoring aligned with serverless economics
- **Auto-Scaling**: Observability scales automatically with application load

### Business Intelligence Focus
- **User Journey Tracking**: Complete visibility into patient interaction flows
- **Revenue Optimization**: Subscription conversion and retention analytics
- **Clinical Outcomes**: AI effectiveness and medical insight quality metrics

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Lambda        │    │   DynamoDB       │    │   S3 Buckets    │
│   Functions     │───▶│   Tables +       │───▶│   Event Logs    │
│   (13 funcs)    │    │   Streams        │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   CloudWatch    │    │   CloudWatch     │    │   CloudWatch    │
│   Custom        │    │   Logs           │    │   Insights      │
│   Metrics       │    │   (30 days)      │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │   3 CloudWatch Dashboards│
                    │   - Executive            │
                    │   - Operations           │
                    │   - Security             │
                    └──────────────────────────┘
```

## Implementation Status

### ✅ Phase 1: Core Infrastructure (COMPLETED)

#### S3 Events Bucket
- **Bucket Name:** `serenya-events-{environment}-{account}`
- **Encryption:** KMS with automatic key rotation
- **Lifecycle:**
  - 90 days: Transition to Infrequent Access
  - 365 days: Transition to Glacier
- **Purpose:** Long-term storage of detailed event logs for analytics and compliance

#### DynamoDB Streams
- **Configuration:** NEW_AND_OLD_IMAGES on `serenya-{env}` table
- **Purpose:** Real-time event processing for business intelligence
- **Stream Processor Lambda:**
  - Batch size: 100 records
  - Retry attempts: 3
  - Bisect on error: Enabled
  - Max batching window: 5 seconds

### ✅ Phase 2: Observability Service (COMPLETED)

The `ObservabilityService` class ([lambdas/shared/observability-service.js](../../../serenya_app/backend/lambdas/shared/observability-service.js)) provides centralized metrics and logging.

#### CloudWatch Custom Metrics
All metrics published to the `Serenya` namespace with environment-specific dimensions.

**Implementation:**
```javascript
const { ObservabilityService } = require('../shared/observability-service');

exports.handler = async (event) => {
  const observability = ObservabilityService.createForFunction('my-function', event);

  // Track various metrics
  await observability.trackAuthentication(true, 'google', 'mobile', userId);
  await observability.trackUserJourney('onboarding_completed', userId);
  await observability.trackAIProcessing(true, 'claude-3-sonnet', 2500, 15000, 0.95, userId);
};
```

#### S3 Event Logging
All events logged to S3 with structure:
```
events/
  YYYY-MM-DD/
    {event_type}/
      {correlation_id}.json
```

Each event includes:
- Timestamp (ISO 8601)
- Event type
- User ID (if applicable)
- Function name
- Correlation ID
- Environment
- Event-specific data

### ✅ Phase 3: CloudWatch Dashboards (COMPLETED)

Three comprehensive dashboards via `ObservabilityConstruct`:

#### 1. Executive Dashboard (`Serenya-Executive-{env}`)
**Purpose:** High-level business metrics for leadership

**Widgets:**
- Monthly Active Users (MAU)
- Subscription Conversions
- System Uptime %
- Document Uploads (Daily)
- AI Processing Success Rate

**Target Audience:** Founders, executives, product managers

#### 2. Operations Dashboard (`Serenya-Operations-{env}`)
**Purpose:** Technical performance monitoring

**Widgets:**
- API Request Count, Latency (P50, P95, P99), Error Rate
- Lambda Duration & Errors (all functions)
- DynamoDB Read/Write Capacity & Throttling
- Lambda Cold Starts
- AI Processing Duration
- Job Processing Queue

**Target Audience:** DevOps, SREs, backend engineers

#### 3. Security Dashboard (`Serenya-Security-{env}`)
**Purpose:** Security and compliance monitoring

**Widgets:**
- Login Success Rate
- Biometric Authentication
- Security Events by Severity
- Encryption Operations

**Target Audience:** Security team, compliance officers

### ✅ Phase 4: CloudWatch Alarms (COMPLETED)

#### Critical Alarms (SNS → Email/PagerDuty)
Trigger immediate response for system-down scenarios:

1. **API Server Errors** - 10 errors in 5 minutes
2. **Lambda Function Errors** - 5 errors per function in 5 minutes
3. **AI Processing Failure** - <1 success in 10 minutes
4. **DynamoDB Throttling** - 5 throttled requests in 5 minutes

#### Warning Alarms (Email only)
Alert for degraded performance:

1. **API Latency P95** - >2000ms for 3 periods
2. **Process Lambda Duration** - 80% of timeout for 2 periods
3. **Upload Success Rate** - <10 successes in 10 minutes

## Lambda Function Coverage

### ✅ Fully Instrumented (13/19 Lambda Functions)

All production-critical Lambda functions have comprehensive observability:

1. **auth** - Authentication and JWT generation
2. **upload** - File upload and validation
3. **process** - AI document processing (tracks AI cost & performance)
4. **chat-messages** - Chat AI interactions
5. **chat-prompts** - Chat prompt suggestions
6. **chat-status** - Chat status polling
7. **status** - Job status tracking
8. **result** - Result retrieval
9. **cleanup** - S3 file cleanup
10. **doctor-report** - Premium report generation
11. **subscriptions** - Subscription management
12. **user** - User profile management
13. **stream-processor** - DynamoDB stream processing (automatic metrics)

### ⚠️ Not Instrumented (System/Utility Functions - 6/19)

Intentionally not instrumented:
- **authorizer** - JWT validation (auth metrics in auth function)
- **biometric** - Has comprehensive audit logging
- **cost-tracking** - Internal monitoring
- **database-test**, **gdpr**, **monitoring** - Utilities

## Metric Categories

### 1. User Experience Metrics

**Namespace:** `Serenya/Auth`, `Serenya/Upload`, `Serenya/Journey`

- **Login Success Rate**: Target >99.5%, Alert <97%
- **Biometric Authentication**: Target >95% first-attempt success
- **Onboarding Completion**: Target >85%
- **Document Upload Success**: Target >98%, Alert <95%
- **AI Processing Completion**: Target >99%

**Key Metrics:**
- `LoginAttempts`, `LoginSuccess`
- `BiometricVerificationAttempts`, `BiometricVerificationSuccess`
- `UserJourneyStep`
- `DocumentUploads`, `DocumentUploadSuccess`, `DocumentUploadDuration`

### 2. System Performance Metrics

**Namespace:** `Serenya/Performance`, `Serenya/Database`, `Serenya/Storage`

- **Cold Start Frequency**: Target <5%
- **Memory Utilization**: Target 60-80%
- **DynamoDB Throttling**: Target 0
- **S3 Processing Latency**: Target P95 <5s

**Key Metrics:**
- `LambdaDuration`, `LambdaMemoryUtilization`, `LambdaColdStarts`
- `DynamoDBOperations`, `DynamoDBDuration`, `DynamoDBErrors`
- `S3Operations`, `S3Duration`, `S3ObjectSize`

### 3. Business Intelligence Metrics

**Namespace:** `Serenya/Business`, `Serenya/AI`, `Serenya/Jobs`

- **Subscription Conversion**: Target >15%
- **MRR Growth**: Target 20% month-over-month
- **User Retention**: 7-day, 30-day, 90-day cohorts

**Key Metrics:**
- `NewUserRegistrations`, `OnboardingCompletions`, `BiometricEnrollments`
- `SubscriptionEvents`, `SubscriptionConversions`
- `AIProcessingAttempts`, `AIProcessingSuccess`, `AITokensUsed`, `AIProcessingCost`
- `JobsCreated`, `JobCompletions`, `JobFailures`, `JobProcessingDuration`

### 4. Security & Compliance Metrics

**Namespace:** `Serenya/Security`, `Serenya/Compliance`

- **PHI Audit Compliance**: Target 100%
- **Encryption Coverage**: Target 100%
- **Auth Failure Rate**: Target <0.1%

**Key Metrics:**
- `SecurityEvents`, `HighSeveritySecurityEvents`
- `EncryptionOperations`, `EncryptionDuration`
- `ComplianceEvents`

## Usage Guide

### For Lambda Functions

```javascript
const { ObservabilityService } = require('../shared/observability-service');

exports.handler = async (event) => {
  const startTime = Date.now();
  const observability = ObservabilityService.createForFunction('my-function', event);

  try {
    // Your business logic here

    // Track metrics
    await observability.trackUserJourney('action_completed', userId, metadata);

    return success;
  } catch (error) {
    await observability.trackError(error, 'business_logic', userId, context);
    throw error;
  }
};
```

### Available Tracking Methods

```javascript
// Authentication
await observability.trackAuthentication(success, provider, deviceType, userId);
await observability.trackBiometricAuth(success, biometricType, attemptNumber, userId);

// User Journey
await observability.trackUserJourney(step, userId, metadata);

// File Operations
await observability.trackDocumentUpload(success, fileType, fileSizeMB, userId, processingTime);
await observability.trackS3Operation(operation, bucket, success, durationMs, objectSize);

// AI Processing
await observability.trackAIProcessing(success, modelName, durationMs, tokenCount, confidenceScore, userId);

// Business Events
await observability.trackSubscription(event, userId, subscriptionType, planDetails);

// Security
await observability.trackSecurityEvent(eventType, severity, userId, details);
await observability.trackEncryption(operation, durationMs, dataSize);

// Errors
await observability.trackError(error, category, userId, context);
```

### Accessing Dashboards

1. **AWS Console:** CloudWatch → Dashboards
2. **Dashboard Names:**
   - `Serenya-Executive-{env}`
   - `Serenya-Operations-{env}`
   - `Serenya-Security-{env}`

### Configuration

**Environment Variables** (automatically set):
```bash
ENVIRONMENT=dev|staging|prod
EVENTS_BUCKET=serenya-events-{env}-{account}
ENABLE_DETAILED_LOGGING=true|false
```

**Alert Email** (set in `config/environments.ts`):
```typescript
export const environments = {
  prod: {
    alertEmail: 'ops-alerts@serenya.health'
  }
};
```

## Alerting & Response

### Critical Alarms Response
1. Check CloudWatch dashboard for context
2. Review Lambda CloudWatch Logs for errors
3. Check X-Ray traces for distributed tracing
4. Verify DynamoDB capacity and throttling
5. Escalate to on-call engineer if unresolved

### Warning Alarms Response
1. Monitor trend over next hour
2. Review performance metrics
3. Check for increased load or usage patterns
4. Schedule optimization work if pattern persists

## Compliance & Data Retention

### HIPAA Compliance
- ✅ All metrics contain NO PHI
- ✅ Event logs encrypted at rest with KMS
- ✅ Access logged via CloudTrail
- ✅ 7+ year retention for compliance

### Data Retention Policies
- **CloudWatch Metrics:** 15 months (default)
- **CloudWatch Logs:** 30 days
- **S3 Event Logs:**
  - Hot storage: 90 days
  - Infrequent Access: 90-365 days
  - Glacier Archive: 365+ days

## Cost Analysis

### Monthly Costs (Production)

**CloudWatch:**
- 50 custom metrics: $15
- 3 dashboards: $9
- 15 alarms: $1.50
- API requests: ~$5
- **Subtotal: ~$30/month**

**S3 Event Logs (1000 DAU):**
- ~10 GB events/month: $0.23
- After lifecycle transitions: ~$0.05/month
- **Subtotal: <$1/month**

**Total Estimated Cost: ~$35/month**

## Troubleshooting

### Missing Metrics
1. Verify Lambda has CloudWatch PutMetricData permissions
2. Check `EVENTS_BUCKET` environment variable
3. Review Lambda logs for ObservabilityService errors
4. Confirm ObservabilityService is imported

### Dashboard Not Showing Data
1. Verify metrics in CloudWatch → Metrics
2. Check time range on dashboard
3. Confirm correct environment/namespace
4. Wait 5-10 minutes for aggregation

### Alarms Not Triggering
1. Check alarm state in CloudWatch
2. Verify SNS subscription confirmed
3. Review threshold and evaluation periods
4. Check "Treat missing data" setting

## Future Enhancements

### Planned (Q1 2026)
- [ ] Grafana Cloud integration
- [ ] OpenTelemetry distributed tracing
- [ ] Cost attribution by user/tier
- [ ] Anomaly detection for security
- [ ] Automated incident response

### Under Consideration
- [ ] Real-time streaming with Kinesis
- [ ] ML-based predictive alerting
- [ ] Linear integration for auto-issues
- [ ] User-facing status page

## References

- [Development Rules](./our-dev-rules.md) - Error handling standards
- [ObservabilityService Code](../../../serenya_app/backend/lambdas/shared/observability-service.js)
- [ObservabilityConstruct Code](../../../serenya_app/backend/infrastructure/observability-construct.ts)
- [Stream Processor Code](../../../serenya_app/backend/lambdas/stream-processor/streamProcessor.js)
- [AWS CloudWatch Documentation](https://docs.aws.amazon.com/cloudwatch/)
- [AWS X-Ray Documentation](https://docs.aws.amazon.com/xray/)
