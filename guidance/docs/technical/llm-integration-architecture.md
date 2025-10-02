# LLM Integration Architecture

**Date:** January 2025 (Updated for AWS Bedrock Implementation)
**Domain:** AI/ML Integration & Medical Document Processing
**Dependencies:**
- **← api-contracts.md**: Client-facing API specifications for AI processing
- **← database-architecture.md**: Temporary S3 storage for processing jobs
- **← observability.md**: AI processing metrics and monitoring
**Cross-References:**
- **→ our-dev-rules.md**: Development standards for AI integration
- **→ deployment-procedures.md**: Bedrock deployment configuration

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [AWS Bedrock Integration](#aws-bedrock-integration)
3. [Medical Prompts Service](#medical-prompts-service)
4. [Processing Pipeline](#processing-pipeline)
5. [Job Types & Processing](#job-types--processing)
6. [Response Formats](#response-formats)
7. [Cost Tracking & Monitoring](#cost-tracking--monitoring)
8. [Error Handling & Resilience](#error-handling--resilience)
9. [Development & Testing](#development--testing)

---

## 🎯 Architecture Overview

### Core Principles

**Asynchronous Processing Model:**
- S3-triggered Lambda execution (no direct API calls to process Lambda)
- Client polls for completion (2-second intervals)
- All medical data generated in single atomic AI operation
- Results stored in S3 `outgoing/` folder

**Single-Table Document Processing:**
- Job tracking via job ID format: `{type}_{userId}_{timestamp}_{random}`
- Temporary S3 storage only (2-day lifecycle policy)
- No server-side database for jobs or medical data
- Final medical data stored locally on device

**AWS Bedrock Provider:**
- Claude 3 Haiku (multimodal) - `anthropic.claude-3-haiku-20240307-v1:0`
- Supports binary files (PDF, images) directly
- HIPAA-compliant processing
- Pay-per-use pricing (no reserved capacity)

---

## 🤖 AWS Bedrock Integration

### Configuration

```javascript
// Bedrock Service Configuration
const BEDROCK_CONFIG = {
  region: 'eu-west-1',
  modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
  maxTokens: 4000,
  temperature: 0.1, // Low for medical accuracy
  contentType: 'application/json',
  accept: 'application/json',
  anthropicVersion: 'bedrock-2023-05-31'
};
```

### Supported File Types

**Multimodal Document Processing:**
- **PDFs**: `application/pdf`
- **Images**: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/bmp`, `image/tiff`

**Request Format:**
```javascript
{
  modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
  contentType: 'application/json',
  accept: 'application/json',
  body: {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 4000,
    temperature: 0.1,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: '<base64_encoded_document>'
            }
          },
          {
            type: 'text',
            text: '<medical_analysis_prompt>'
          }
        ]
      }
    ]
  }
}
```

### Cost Structure

**Claude 3 Haiku Pricing (AWS Bedrock):**
- Input tokens: $0.25 per 1M tokens
- Output tokens: $1.25 per 1M tokens

**Typical Usage:**
- Medical document analysis: ~2000 input + ~800 output tokens = $0.0015/analysis
- Chat response: ~500 input + ~200 output tokens = $0.0004/message
- Doctor report: ~3000 input + ~1500 output tokens = $0.003/report

**Estimated Monthly Costs (1000 users):**
- 3000 document analyses: $4.50
- 5000 chat messages: $2.00
- 500 premium reports: $1.50
- **Total: ~$8/month** (plus AWS infrastructure)

---

## 📝 Medical Prompts Service

### Prompt Management

**Prompt Types:**
1. `medical_analysis` - Document analysis (lab results, vitals)
2. `doctor_report` - Historical trend analysis (premium)
3. `chat_response` - Educational health questions

**Version Control:**
```javascript
const PROMPT_VERSIONS = {
  medical_analysis: {
    'v1.0': 'MEDICAL_ANALYSIS_PROMPT_V1_0',
    'current': 'v1.0',
    'testing': null // A/B testing version
  },
  doctor_report: {
    'v1.0': 'DOCTOR_REPORT_PROMPT_V1_0',
    'current': 'v1.0',
    'testing': null
  },
  chat_response: {
    'v1.0': 'CHAT_RESPONSE_PROMPT_V1_0',
    'current': 'v1.0',
    'testing': null
  }
};
```

### Temperature Settings

**Optimized for Medical Accuracy:**
```javascript
const TEMPERATURE_SETTINGS = {
  medical_analysis: 0.2,  // Low creativity for consistency
  doctor_report: 0.1,     // Minimal creativity for clinical accuracy
  chat_response: 0.4      // Moderate creativity for conversational tone
};
```

### Token Limits

```javascript
const TOKEN_LIMITS = {
  medical_analysis: {
    max_tokens: 1500,
    target_range: [800, 1200]
  },
  doctor_report: {
    max_tokens: 2000,
    target_range: [1200, 1800]
  },
  chat_response: {
    max_tokens: 800,
    target_range: [300, 600]
  }
};
```

### Required Medical Disclaimers

**All AI responses include:**
1. "This interpretation is for informational purposes only and is not medical advice."
2. "Always consult with a qualified healthcare provider for medical decisions."
3. "In case of emergency, contact emergency services immediately."
4. "This analysis is based on AI interpretation and may not capture all nuances."

---

## 🔄 Processing Pipeline

### 1. Document Upload Flow

```
Client Upload → S3 temp-files/incoming/{jobId}
                ↓
          S3 Event Trigger
                ↓
          Process Lambda
                ↓
     AWS Bedrock (Claude 3 Haiku)
                ↓
    S3 temp-files/outgoing/{jobId}
                ↓
    Client Polling (2s intervals)
                ↓
    Local Device Storage
```

### 2. Process Lambda Execution

**Location:** `/Users/m00n5h075ai/development/serenya/serenya_app/backend/lambdas/process/process.js`

**Key Functions:**
1. **getJobDataFromS3(jobId)** - Retrieve uploaded document
2. **processJobWithBedrock(jobType, jobData, jobId)** - Call Bedrock with appropriate prompt
3. **storeResultsInS3(jobId, result)** - Store AI-generated results
4. **cleanupIncomingFile(s3Key)** - Delete processed file

**Job ID Format:**
- `result_{userId}_{timestamp}_{random}` - Medical document analysis
- `chat_{userId}_{timestamp}_{random}` - Chat message
- `report_{userId}_{timestamp}_{random}` - Premium doctor report

**Observability Integration:**
```javascript
// Track AI processing metrics
await observability.trackAIProcessing(
  true,                          // success
  'claude-3-haiku',             // model
  processingTime,               // duration
  tokenCount,                   // token usage
  confidenceScore,              // confidence (1-10)
  userId                        // user context
);
```

---

## 📊 Job Types & Processing

### Job Type 1: Medical Document Analysis (`result_*`)

**Input:**
- Binary file content (PDF, image)
- File metadata (type, filename)
- User context

**Prompt Type:** `medical_analysis`

**Processing:**
```javascript
// Prepare multimodal content
const content = [
  {
    type: 'image',
    source: {
      type: 'base64',
      media_type: getMediaTypeFromFileType(jobData.file_type),
      data: jobData.file_content.toString('base64')
    }
  },
  {
    type: 'text',
    text: medicalPromptsService.getPrompt('medical_analysis')
  }
];
```

**Output Format:**
```javascript
{
  status: 'completed',
  job_id: 'result_user123_1704672000000_abc123',
  result_type: 'medical_analysis',
  title: 'Blood Work Analysis',
  markdown_content: '## Quick Summary\n...',
  extraction_metadata: {
    confidence_score: 8,
    summary: 'Overall health picture summary',
    medical_flags: ['High cholesterol']
  },
  lab_results: [
    {
      test_name: 'Total Cholesterol',
      test_category: 'blood',
      test_value: 220,
      test_unit: 'mg/dL',
      reference_range_low: 0,
      reference_range_high: 200,
      reference_range_text: '< 200 mg/dL',
      is_abnormal: true
    }
  ],
  vitals: [
    {
      vital_type: 'blood_pressure',
      systolic_value: 120,
      diastolic_value: 80,
      numeric_value: null,
      unit: 'mmHg',
      is_abnormal: false
    }
  ],
  metadata: {
    processing_time_ms: 12500,
    model_used: 'anthropic.claude-3-haiku-20240307-v1:0',
    job_type: 'result'
  },
  generated_at: '2025-01-15T10:30:00Z'
}
```

---

### Job Type 2: Chat Response (`chat_*`)

**Input:**
- User question/message
- Document context (optional)
- Structured health data (optional)

**Prompt Type:** `chat_response`

**Processing:**
```javascript
function prepareChatContentForBedrock(jobData) {
  const { message, content_id, structured_data } = jobData;

  let content = `User Question: ${message}\n\n`;

  if (structured_data) {
    content += `Health Data Context: ${JSON.stringify(structured_data, null, 2)}\n\n`;
  }

  if (content_id) {
    content += `Document Context ID: ${content_id}\n\n`;
  }

  content += 'Please provide a helpful, educational response about this health question.';

  return content;
}
```

**Output Format:**
```javascript
{
  status: 'completed',
  job_id: 'chat_user123_1704672000000_xyz789',
  result_type: 'chat_response',
  chat_response: {
    ai_response: 'Your cholesterol level of 220 mg/dL is slightly elevated...',
    metadata: {
      response_length: 350,
      model_temperature: 0.4
    }
  },
  metadata: {
    processing_time_ms: 5200,
    model_used: 'anthropic.claude-3-haiku-20240307-v1:0',
    job_type: 'chat'
  },
  generated_at: '2025-01-15T10:35:00Z'
}
```

---

### Job Type 3: Doctor Report (`report_*`)

**Input:**
- Historical health data (vitals, lab results)
- Report type (health summary, trend analysis)

**Prompt Type:** `doctor_report`

**Processing:**
```javascript
function prepareHealthDataForBedrock(jobData) {
  const { health_data, report_type } = jobData;

  return `Health Data Report Request
Report Type: ${report_type || 'medical_summary'}

Health Data:
${JSON.stringify(health_data, null, 2)}

Please generate a comprehensive health report analyzing trends, patterns, and insights from this data.`;
}
```

**Output Format:**
```javascript
{
  status: 'completed',
  job_id: 'report_user123_1704672000000_def456',
  result_type: 'doctor_report',
  title: 'Health Trend Report',
  markdown_content: '## Quick Summary\n...',
  summary: 'Health trend analysis completed',
  confidence: 8,
  metadata: {
    processing_time_ms: 18000,
    model_used: 'anthropic.claude-3-haiku-20240307-v1:0',
    job_type: 'report'
  },
  generated_at: '2025-01-15T10:40:00Z'
}
```

---

## 📋 Medical Analysis Prompt Structure

### Medical Analysis Prompt (v1.0)

**System Role:**
```
You are Serenya, a warm and empathetic medical AI assistant specialized in analyzing medical documents.
```

**Constraints:**
- Process only valid medical documents (lab results, vitals, imaging, medical reports)
- Maintain strict medical accuracy and clinical reasoning
- Never provide specific medical advice or diagnoses
- Always recommend consulting healthcare providers

**Document Validation:**
- Verify content contains medical data with recognizable medical terminology
- If not medical, respond with: "Not a valid medical document"

**Analysis Instructions:**
1. **Extract & Normalize** - Identify lab results/vitals, normalize values, compare to reference ranges
2. **Group & Contextualize** - Dynamically group results (Blood Health, Metabolic Health), provide mini-explainers
3. **Assess & Synthesize** - Provide warm overall summary, detailed closing synthesis

**Response Format:**
```markdown
# <Short, user-friendly report title>

## Quick Summary
<2-3 sentence warm overview>

## Grouped Analysis
### <Dynamic Group Name>
- <Result>: value unit (ref range) — status (↓/↔/↑)
<Mini-explainer>

## Closing Synthesis
<Full empathetic wrap-up>

*[Required disclaimers]*

```json
{
  "title": "<Same short title>",
  "extraction_metadata": {
    "confidence_score": 8,
    "summary": "<Same as Quick Summary>",
    "medical_flags": ["<Abnormal findings>"]
  },
  "lab_results": [...],
  "vitals": [...]
}
```
```

---

## 💰 Cost Tracking & Monitoring

### Token Usage Tracking

**Location:** `/Users/m00n5h075ai/development/serenya/serenya_app/backend/lambdas/shared/bedrock-service.js:546-578`

```javascript
async trackUsage(promptType, tokenUsage, responseTime, metadata) {
  const costCents = this.calculateCostCents(tokenUsage);

  // Update internal metrics
  this.metrics.totalRequests++;
  this.metrics.totalTokensUsed += tokenUsage.input_tokens + tokenUsage.output_tokens;
  this.metrics.totalCostCents += costCents;

  // Log for CloudWatch monitoring
  medicalPromptsService.logPromptUsage(promptType, version, {
    responseTime,
    tokenUsage,
    confidenceScore,
    userId,
    documentType
  });
}

calculateCostCents(tokenUsage) {
  // Claude Haiku pricing
  const inputCostCents = (tokenUsage.input_tokens / 1000000) * 25;   // $0.25/1M
  const outputCostCents = (tokenUsage.output_tokens / 1000000) * 125; // $1.25/1M
  return Math.round((inputCostCents + outputCostCents) * 100) / 100;
}
```

### Observability Integration

**AI Processing Metrics:**
```javascript
await observability.trackAIProcessing(
  success,           // true/false
  modelName,         // 'claude-3-haiku'
  processingTime,    // milliseconds
  tokenCount,        // total tokens used
  confidenceScore,   // 1-10
  userId             // user context
);
```

**CloudWatch Metrics:**
- `Serenya/AI/ProcessingTime` - AI processing duration
- `Serenya/AI/TokenUsage` - Input/output token counts
- `Serenya/AI/Cost` - Estimated cost per request
- `Serenya/AI/ConfidenceScore` - AI confidence scores
- `Serenya/AI/ErrorRate` - Bedrock error frequency

---

## 🛡️ Error Handling & Resilience

### Circuit Breaker Pattern

**Location:** `/Users/m00n5h075ai/development/serenya/serenya_app/backend/lambdas/shared/circuit-breaker.js`

```javascript
const circuitBreaker = new BedrockCircuitBreaker({
  name: 'bedrock-service',
  failureThreshold: 5,    // Open circuit after 5 failures
  recoveryTimeout: 30000, // Try again after 30 seconds
  monitoringPeriod: 60000 // Monitor failures over 1 minute
});

// Execute Bedrock call through circuit breaker
const response = await circuitBreaker.execute(async () => {
  return await bedrockService.invokeBedrock(request);
});
```

### Error Categorization

**Bedrock-Specific Errors:**

1. **ThrottlingException** (Rate Limiting)
   - Category: `external`
   - Recovery: `exponential_backoff`
   - User Action: "Please wait a moment and try again"
   - Retry After: 30 seconds

2. **ValidationException** (Invalid Request)
   - Category: `validation`
   - Recovery: `retry_with_valid_document`
   - User Action: "Please upload a valid medical document"

3. **ServiceUnavailableException** (Service Down)
   - Category: `external`
   - Recovery: `retry_after_delay`
   - User Action: "Document saved, will be processed when service resumes"
   - Fallback: Store job for later processing

4. **ModelTimeoutException** (Processing Timeout)
   - Category: `technical`
   - Recovery: `retry_with_shorter_content`
   - User Action: "Please try with a smaller document"

### Retry Logic

**Exponential Backoff:**
```javascript
async retryWithBackoff(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;

      // Exponential backoff: 1s, 2s, 4s
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}
```

**Error Storage:**
```javascript
// Store error status in S3 for client polling
async function storeErrorInS3(jobId, error) {
  const errorResult = {
    status: 'failed',
    job_id: jobId,
    error: {
      code: 'PROCESSING_FAILED',
      message: 'Document processing failed',
      user_action: 'Please try again or contact support if the problem persists.',
      details: sanitizeError(error).message?.substring(0, 200)
    },
    generated_at: new Date().toISOString()
  };

  await s3.upload({
    Bucket: process.env.TEMP_BUCKET_NAME,
    Key: `outgoing/${jobId}`,
    Body: JSON.stringify(errorResult),
    ServerSideEncryption: 'aws:kms'
  }).promise();
}
```

---

## 🧪 Development & Testing

### Mock Provider (Future Enhancement)

**Currently:** Production uses AWS Bedrock directly
**Future:** Mock provider for development without Bedrock costs

**Mock Service Structure:**
```javascript
class MockBedrockService {
  async analyzeMedicalDocument(documentContent, metadata) {
    // Simulate processing delay (5-15 seconds)
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Return realistic mock medical analysis
    return {
      success: true,
      analysis: MOCK_MEDICAL_ANALYSIS,
      metadata: {
        processing_time_ms: 10000,
        model_used: 'mock-v1.0',
        token_usage: { input_tokens: 2000, output_tokens: 800 },
        cost_estimate_cents: 0
      }
    };
  }
}
```

### Testing Strategies

**Unit Tests:**
- Prompt template validation
- Token usage calculation
- Error handling logic
- Response format validation

**Integration Tests:**
- Bedrock API connectivity
- S3 event triggering
- Job lifecycle (upload → process → result)
- Cost tracking accuracy

**End-to-End Tests:**
- Real document processing
- Client polling flow
- Error recovery scenarios
- Circuit breaker behavior

### Environment Configuration

```bash
# Development
AWS_REGION=eu-west-1
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
TEMP_BUCKET_NAME=serenya-temp-files-dev-123456789
KMS_KEY_ID=alias/serenya-dev
PROMPT_AB_TESTING=false

# Production
AWS_REGION=eu-west-1
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
TEMP_BUCKET_NAME=serenya-temp-files-prod-123456789
KMS_KEY_ID=alias/serenya-prod
PROMPT_AB_TESTING=true
```

---

## 📈 Performance Metrics

### Typical Processing Times

**Medical Document Analysis:**
- Small image (1MB): 8-12 seconds
- Large PDF (5MB): 15-25 seconds
- Average: 12.5 seconds

**Chat Responses:**
- Simple question: 3-5 seconds
- With context: 5-8 seconds
- Average: 5.2 seconds

**Doctor Reports:**
- Basic report: 12-18 seconds
- Complex trends: 18-25 seconds
- Average: 18 seconds

### Success Rates

**Target Metrics:**
- Document processing success: >95%
- Chat response success: >98%
- Circuit breaker activation: <1% of requests
- Average confidence score: >7.5/10

### Timeout Configuration

```javascript
const TIMEOUT_CONFIG = {
  document_processing: {
    lambda_timeout: 180,        // 3 minutes
    bedrock_timeout: 120000,    // 2 minutes
    polling_interval: 2000,     // 2 seconds
    max_polling_attempts: 90    // 3 minutes total
  },
  chat_responses: {
    lambda_timeout: 60,         // 1 minute
    bedrock_timeout: 45000,     // 45 seconds
    polling_interval: 2000,     // 2 seconds
    max_polling_attempts: 30    // 1 minute total
  },
  premium_reports: {
    lambda_timeout: 300,        // 5 minutes
    bedrock_timeout: 240000,    // 4 minutes
    polling_interval: 5000,     // 5 seconds
    max_polling_attempts: 60    // 5 minutes total
  }
};
```

---

## 🔒 Security & Compliance

### Data Privacy

**Zero-Retention Policy:**
- AWS Bedrock does not store PHI
- All medical data encrypted in transit (TLS 1.3)
- Temporary S3 storage only (2-day lifecycle)
- No medical data in CloudWatch logs

### Encryption

**At Rest:**
- S3 objects: KMS encryption
- DynamoDB: AWS-managed encryption

**In Transit:**
- Client → API Gateway: TLS 1.3
- Lambda → Bedrock: AWS internal encryption
- Bedrock → Response: AWS internal encryption

### Audit Logging

**AI Processing Events:**
```javascript
await auditService.logAuditEvent({
  eventType: 'ai_processing',
  eventSubtype: 'medical_document_analysis',
  userId: userId,
  eventDetails: {
    documentType: 'lab_results',
    confidenceScore: 8,
    responseTimeMs: 12500,
    tokenUsage: { input: 2000, output: 800 }
  },
  dataClassification: 'medical_phi'
});
```

**Audit Events Captured:**
- `medical_document_analysis` - Document processed
- `medical_document_analysis_failed` - Processing error
- `chat_question_processed` - Chat message handled
- `health_data_report_generated` - Premium report created
- `doctor_report_generated` - Doctor report created

---

## 📚 Related Documentation

- **[api-contracts.md](api-contracts.md)** - Client-facing API specifications
- **[database-architecture.md](database-architecture.md)** - S3 job storage architecture
- **[observability.md](observability.md)** - AI processing metrics and monitoring
- **[our-dev-rules.md](our-dev-rules.md)** - Development standards for AI integration
- **[deployment-procedures.md](deployment-procedures.md)** - Bedrock deployment configuration

---

**Document Status**: ✅ Complete - AWS Bedrock Production Implementation
**Last Updated**: January 2025
**Implementation Files:**
- `/backend/lambdas/process/process.js` - Main processing Lambda
- `/backend/lambdas/shared/bedrock-service.js` - Bedrock integration
- `/backend/lambdas/shared/medical-prompts.js` - Prompt management
- `/backend/lambdas/shared/circuit-breaker.js` - Resilience patterns
