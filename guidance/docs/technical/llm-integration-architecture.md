# LLM Integration Architecture

**Document Purpose**: Internal LLM service integration design and implementation details  
**Scope**: Server-side LLM processing, mock development server, and provider abstraction  
**Audience**: Backend developers, DevOps engineers, and system architects  
**Status**: Implementation Ready  
**Last Updated**: September 4, 2025

---

## Table of Contents

1. [Internal LLM Processing Pipeline](#internal-llm-processing-pipeline)
2. [Service Request/Response Interfaces](#service-requestresponse-interfaces)
3. [LLM Integration Architecture](#llm-integration-architecture-1)
4. [Development Mock Server Configuration](#development-mock-server-configuration)
5. [Mock Server Endpoints](#mock-server-endpoints-development-only)
6. [Mock LLM Responses](#mock-llm-responses-for-development)
7. [AWS Bedrock Integration](#aws-bedrock-integration-configuration)
8. [LLM Provider Implementation](#llm-provider-implementation-notes)
9. [Cost Tracking & Monitoring](#cost-tracking--monitoring)
10. [Development Workflow](#development-workflow)
11. [Production Deployment](#production-deployment)

---

## Internal LLM Processing Pipeline

**Purpose**: Server-side integration with external LLM services for document analysis  
**Workflow**: Document → Structured Prompt → LLM → All Medical Data (single atomic operation)  
**Processing Model**: Asynchronous with client polling  

### LLM Service Request (Internal)
```typescript
// Server-to-LLM communication (not exposed to clients)
interface LLMAnalysisRequest {
  document: {
    content: string; // Base64 or extracted text
    type: "lab_results" | "vitals" | "imaging" | "general";
    metadata: {
      file_name: string;
      document_date?: string;
      provider_name?: string;
      user_notes?: string;
    };
  };
  prompt_template: string; // Structured prompt for medical analysis
  response_format: "structured_medical_data"; // Enforce consistent output
  user_context: {
    user_id: string;
    previous_analyses?: string[]; // For context-aware responses
  };
}
```

### LLM Service Response (Internal)
```typescript
// Expected structured response from LLM
interface LLMAnalysisResponse {
  analysis: {
    summary: string; // AI-generated medical summary
    key_findings: string[]; // Important medical findings
    medical_data_extracted: boolean;
    confidence_score: number; // 0.0-1.0
    flags: {
      critical_values: boolean;
      incomplete_data: boolean;
      processing_errors: boolean;
    };
  };
  structured_data: {
    lab_results?: LabResult[];
    vitals?: VitalSign[];
  };
  metadata: {
    processing_time_ms: number;
    model_version: string;
    prompt_version: string;
  };
}
```

## LLM Integration Architecture

- **Single Call Model**: One LLM request generates all structured data at once
- **Atomic Operation**: All medical data (analysis + lab results + vitals) created together
- **Error Handling**: LLM service failures gracefully handled with user-friendly messages
- **Security**: No PHI logged in LLM service calls, encrypted at rest
- **Performance**: Asynchronous processing allows client to continue working during analysis

## Development Mock Server Configuration

**Purpose**: Enable development and testing without external LLM dependencies  
**Modular Design**: Easy toggle between mock and real LLM services  

```typescript
// Environment-based LLM service configuration
interface LLMServiceConfig {
  provider: "mock" | "anthropic" | "openai";
  endpoint: string;
  api_key?: string;
  timeout_seconds: number;
  mock_delay_seconds?: number; // Simulate processing time
}

// Development mock responses
interface MockLLMService {
  // Mock lab results analysis
  mockLabResultsAnalysis: LLMAnalysisResponse;
  // Mock vitals analysis  
  mockVitalsAnalysis: LLMAnalysisResponse;
  // Mock general document analysis
  mockGeneralAnalysis: LLMAnalysisResponse;
  // Configurable processing delay (default 5-15 seconds)
  simulatedProcessingTime: number;
}
```

## Mock Server Endpoints (Development Only)

```http
# Local development mock server
POST http://localhost:3001/mock/llm/analyze-document
GET  http://localhost:3001/mock/llm/health
POST http://localhost:3001/mock/llm/config  # Configure mock responses

# Environment variables for toggling
LLM_PROVIDER=mock|anthropic|openai
MOCK_LLM_ENDPOINT=http://localhost:3001
MOCK_PROCESSING_DELAY=10  # seconds
```

## Mock LLM Responses for Development

### 1. Document Analysis Response (Initial Processing)
```json
// Mock lab results analysis response
{
  "analysis": {
    "summary": "Your recent blood work shows mostly normal values with a few areas to discuss with your doctor.",
    "key_findings": [
      "Cholesterol levels are slightly elevated",
      "Vitamin D is below optimal range", 
      "All other values within normal limits"
    ],
    "medical_data_extracted": true,
    "confidence_score": 0.92,
    "flags": {
      "critical_values": false,
      "incomplete_data": false,
      "processing_errors": false
    }
  },
  "structured_data": {
    "lab_results": [
      {
        "test_name": "Total Cholesterol",
        "value": 220,
        "unit": "mg/dL",
        "reference_range": "< 200",
        "status": "abnormal"
      },
      {
        "test_name": "Vitamin D",
        "value": 25,
        "unit": "ng/mL", 
        "reference_range": "30-100",
        "status": "abnormal"
      }
    ]
  },
  "metadata": {
    "processing_time_ms": 10000,
    "model_version": "mock-v1.0",
    "prompt_version": "medical-analysis-v2"
  }
}
```

### 2. Chat Response Mock (User Questions)
```json
// Mock chat responses for common questions
{
  "cholesterol_question": {
    "response": {
      "content": "Your total cholesterol level is 220 mg/dL, which is slightly above the recommended level of less than 200 mg/dL.\n\nThis means your cholesterol is in the 'borderline high' range. While this isn't immediately dangerous, it's worth discussing with your doctor about lifestyle changes like:\n\n• Eating more fiber-rich foods\n• Reducing saturated fats\n• Getting regular exercise\n\nYour doctor might want to recheck this in 3-6 months to see if lifestyle changes help bring it down.",
      "confidence_score": 0.94,
      "sources_referenced": ["lab_results"],
      "medical_disclaimers": true
    },
    "suggested_follow_ups": [
      {
        "id": "uuid-1",
        "question": "What foods should I avoid to lower cholesterol?",
        "category": "next_steps"
      },
      {
        "id": "uuid-2",
        "question": "How often should I get my cholesterol checked?",
        "category": "next_steps"
      }
    ]
  },
  "vitamin_d_question": {
    "response": {
      "content": "Your Vitamin D level is 25 ng/mL, which is below the optimal range of 30-100 ng/mL.\n\nThis is quite common, especially during winter months or if you spend limited time outdoors. Low Vitamin D can affect:\n\n• Bone health\n• Immune system function\n• Energy levels\n\nYour doctor might recommend a Vitamin D supplement or suggest getting more sunlight. The good news is this is easily treatable!",
      "confidence_score": 0.91,
      "sources_referenced": ["lab_results"],
      "medical_disclaimers": true
    },
    "suggested_follow_ups": [
      {
        "id": "uuid-3",
        "question": "What Vitamin D supplement should I take?",
        "category": "next_steps"
      }
    ]
  }
}
```

### 3. Premium Doctor Report Mock
```json
// Mock doctor report content (Premium feature)
{
  "doctor_report": {
    "title": "Health Summary Report - Lab Results Analysis",
    "patient_context": "Based on lab results from [date] and health profile",
    "executive_summary": "Patient presents with borderline high cholesterol (220 mg/dL) and suboptimal Vitamin D levels (25 ng/mL). All other values within normal limits.",
    "detailed_analysis": {
      "key_findings": [
        {
          "finding": "Total Cholesterol: 220 mg/dL (Reference: <200)",
          "clinical_significance": "Borderline high - increased cardiovascular risk if sustained",
          "trend_context": "First measurement - establish baseline for monitoring",
          "recommendations": "Lifestyle modifications recommended before pharmacological intervention"
        },
        {
          "finding": "Vitamin D: 25 ng/mL (Reference: 30-100)",
          "clinical_significance": "Insufficiency - may impact bone health and immune function", 
          "trend_context": "Common deficiency, especially in winter months",
          "recommendations": "Consider supplementation and dietary sources"
        }
      ]
    },
    "suggested_discussion_points": [
      "Discuss cholesterol management strategy (lifestyle vs medication)",
      "Review Vitamin D supplementation options and dosing",
      "Establish monitoring schedule for follow-up labs",
      "Assess cardiovascular risk factors and family history"
    ],
    "questions_for_doctor": [
      "Should I start a cholesterol medication or try lifestyle changes first?",
      "What Vitamin D supplement dose would you recommend?",
      "How often should I recheck these levels?",
      "Are there other tests I should consider given these results?"
    ],
    "medical_disclaimer": "This document provides medical interpretation assistance, not medical advice. Please consult your physician for all medical decisions."
  }
}
```

## AWS Bedrock Integration Configuration

```typescript
// Bedrock service configuration
interface BedrockConfig {
  region: string;                    // eu-west-1
  modelId: string;                   // anthropic.claude-3-5-sonnet-20241022-v2:0
  maxTokens: number;                 // 4000 for responses
  temperature: number;               // 0.7 for medical analysis
  costAlertThreshold: number;        // Monthly cost threshold in USD
  enableUsageTracking: boolean;      // Track all token usage
}

// Bedrock API request format
interface BedrockRequest {
  modelId: string;
  contentType: string;               // application/json
  accept: string;                    // application/json
  body: {
    anthropic_version: string;       // bedrock-2023-05-31
    max_tokens: number;
    temperature: number;
    messages: [
      {
        role: "user";
        content: string;               // Medical analysis prompt
      }
    ];
  };
}

// Cost tracking integration
interface CostMetrics {
  inputTokens: number;
  outputTokens: number;
  inputCost: number;                 // $3/1M tokens
  outputCost: number;                // $15/1M tokens
  totalCost: number;
  provider: 'bedrock' | 'mock' | 'direct';
  timestamp: string;
  documentType: 'lab_results' | 'vitals' | 'chat' | 'report';
}
```

## LLM Provider Implementation Notes

```typescript
// Key architectural decisions:
// 1. Single LLM call generates ALL structured data (not separate calls)
// 2. All medical content encrypted together in single payload
// 3. Client polls for completion - gets everything at once
// 4. No separate API calls needed for different data types
// 5. PROVIDER ABSTRACTION: Unified interface for mock/Bedrock/direct providers
// 6. COST OPTIMIZATION: Usage monitoring and intelligent routing
// 7. DEVELOPMENT: Enhanced mock server with realistic healthcare scenarios
// 8. PRODUCTION: AWS Bedrock for HIPAA compliance and cost efficiency
// 9. RESILIENCE: Fallback mechanisms and health checks across providers
// 10. MODULAR: Environment-based provider switching for all environments

// LLM Service Factory Pattern
interface LLMService {
  analyzeDocument(prompt: string, context: DocumentContext): Promise<AnalysisResult>;
  generateChatResponse(message: string, context: ChatContext): Promise<ChatResponse>;
  createDoctorReport(data: ReportData, context: ReportContext): Promise<ReportContent>;
}

class LLMServiceFactory {
  static create(provider: 'mock' | 'bedrock' | 'direct-anthropic'): LLMService {
    switch (provider) {
      case 'mock': return new MockLLMService();
      case 'bedrock': return new BedrockLLMService();
      case 'direct-anthropic': return new AnthropicLLMService();
    }
  }
}

// Cost monitoring integration
interface CostTracker {
  trackTokenUsage(provider: string, inputTokens: number, outputTokens: number): void;
  getMonthlyUsage(): Promise<UsageStats>;
  checkAlertThresholds(): Promise<boolean>;
}
```

## Cost Tracking & Monitoring

### Provider Comparison
- **Mock Provider**: $0/month (development only)
- **AWS Bedrock**: Input: $3/1M tokens, Output: $15/1M tokens
- **Direct Anthropic**: Input: $3/1M tokens, Output: $15/1M tokens

### Usage Monitoring Integration

#### **Real-time Cost Tracking Implementation**
```typescript
// Cost tracking integrated with payment processing
interface CostTrackingService {
  // Track individual LLM usage
  trackUsage(userId: string, usage: LLMUsageMetrics): Promise<void>;
  
  // Get monthly usage for billing integration
  getMonthlyUsage(userId: string, month: string): Promise<MonthlyUsage>;
  
  // Check if user is approaching premium limits
  checkUsageLimits(userId: string): Promise<UsageLimitStatus>;
  
  // Generate billing data for premium users
  generateBillingData(userId: string, billingPeriod: string): Promise<BillingData>;
}

interface MonthlyUsage {
  userId: string;
  month: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number; // in cents
  documentProcessingCount: number;
  chatMessageCount: number;
  reportGenerationCount: number;
  exceededLimits: boolean;
}

interface UsageLimitStatus {
  userId: string;
  subscriptionTier: 'free' | 'premium';
  currentUsage: MonthlyUsage;
  limits: {
    maxDocumentsPerMonth: number;
    maxChatMessagesPerMonth: number;
    maxReportsPerMonth: number;
    maxMonthlyCostCents: number;
  };
  percentageUsed: {
    documents: number;
    chatMessages: number;
    reports: number;
    cost: number;
  };
  willExceedBy: Date | null;
}

interface BillingData {
  userId: string;
  billingPeriod: string;
  usage: MonthlyUsage;
  subscriptionFee: number; // €9.99 in cents
  overageCharges: number; // Additional charges for exceeding limits
  totalAmount: number;
  breakdown: {
    baseSubscription: number;
    documentProcessing: number;
    premiumFeatures: number;
    overage: number;
  };
}
```

#### **CloudWatch Integration for Premium Features**
```typescript
// Premium feature usage tracking
export async function trackPremiumFeatureUsage(
  userId: string, 
  feature: 'historical_analysis' | 'trend_insights' | 'doctor_report' | 'export_data',
  metadata: { documentCount?: number; timeRange?: string; reportType?: string }
): Promise<void> {
  
  // CloudWatch metrics for premium feature usage
  const metricData = [
    {
      MetricName: 'PremiumFeatureUsage',
      Dimensions: [
        { Name: 'Feature', Value: feature },
        { Name: 'SubscriptionTier', Value: await getUserSubscriptionTier(userId) }
      ],
      Value: 1,
      Unit: 'Count',
      Timestamp: new Date()
    }
  ];

  await cloudwatch.putMetricData({
    Namespace: 'Serenya/Premium',
    MetricData: metricData
  }).promise();

  // Store usage for billing integration
  await storePremiumFeatureUsage(userId, feature, metadata);
}

// Payment processing integration
export async function validatePremiumAccess(
  userId: string, 
  requestedFeature: string
): Promise<{ allowed: boolean; reason?: string; upgradeRequired?: boolean }> {
  
  const subscriptionStatus = await getSubscriptionStatus(userId);
  const currentUsage = await getCurrentMonthUsage(userId);
  
  if (subscriptionStatus.tier === 'free') {
    return {
      allowed: false,
      reason: 'Premium subscription required',
      upgradeRequired: true
    };
  }
  
  if (subscriptionStatus.tier === 'premium' && subscriptionStatus.status !== 'active') {
    return {
      allowed: false,
      reason: 'Premium subscription inactive - payment required',
      upgradeRequired: false
    };
  }
  
  // Check usage limits for premium users
  const limits = await getUsageLimits(subscriptionStatus.tier);
  if (currentUsage.exceededLimits) {
    return {
      allowed: false,
      reason: 'Monthly usage limits exceeded',
      upgradeRequired: false
    };
  }
  
  return { allowed: true };
}
```

#### **Usage Alert System**
```typescript
// Alert thresholds for cost management
interface CostAlertThresholds {
  userId: string;
  monthlyBudgetCents: number;
  alertThresholds: {
    warning: number; // 75% of budget
    critical: number; // 90% of budget
    limit: number; // 100% of budget
  };
  notificationPreferences: {
    email: boolean;
    pushNotification: boolean;
    inAppAlert: boolean;
  };
}

export async function checkAndSendUsageAlerts(userId: string): Promise<void> {
  const usage = await getCurrentMonthUsage(userId);
  const thresholds = await getCostAlertThresholds(userId);
  
  const usagePercentage = (usage.totalCost / thresholds.monthlyBudgetCents) * 100;
  
  if (usagePercentage >= thresholds.alertThresholds.limit) {
    // Suspend premium features
    await suspendPremiumAccess(userId, 'monthly_limit_exceeded');
    await sendAlert(userId, 'LIMIT_EXCEEDED', { usagePercentage, totalCost: usage.totalCost });
    
  } else if (usagePercentage >= thresholds.alertThresholds.critical) {
    await sendAlert(userId, 'CRITICAL_USAGE', { usagePercentage, estimatedOverage: calculateOverage(usage, thresholds) });
    
  } else if (usagePercentage >= thresholds.alertThresholds.warning) {
    await sendAlert(userId, 'WARNING_USAGE', { usagePercentage, remainingBudget: thresholds.monthlyBudgetCents - usage.totalCost });
  }
}

// Integration with payment processing
export async function generateMonthlyBill(userId: string, billingPeriod: string): Promise<BillingData> {
  const usage = await getMonthlyUsage(userId, billingPeriod);
  const subscription = await getSubscriptionStatus(userId);
  
  const billingData: BillingData = {
    userId,
    billingPeriod,
    usage,
    subscriptionFee: subscription.tier === 'premium' ? 999 : 0, // €9.99 in cents
    overageCharges: calculateOverageCharges(usage, subscription),
    totalAmount: 0,
    breakdown: {
      baseSubscription: subscription.tier === 'premium' ? 999 : 0,
      documentProcessing: 0, // Included in premium
      premiumFeatures: 0, // Included in premium
      overage: calculateOverageCharges(usage, subscription)
    }
  };
  
  billingData.totalAmount = billingData.subscriptionFee + billingData.overageCharges;
  
  return billingData;
}
```

### Cost Optimization Strategies
- **Intelligent Model Selection**: Use Claude-3-Haiku for simple chat, Claude-3-Sonnet for complex analysis
- **Response Caching**: Cache common medical interpretations to reduce API calls
- **Batch Processing**: Group multiple documents for cost-efficient processing
- **Usage-Based Throttling**: Implement gentle rate limiting for high-usage users

## Mock Server Benefits

- **Rapid Development**: Test full workflow without LLM API costs
- **Consistent Testing**: Predictable responses for automated testing
- **Offline Development**: No internet dependency for core development
- **Performance Testing**: Configurable response delays
- **Cost Effective**: Avoid LLM API charges during development

## LLM Provider Architecture Context

### Provider Selection Strategy
- **Development**: Mock provider for fast iteration
- **Staging**: Real provider with lower cost limits
- **Production**: AWS Bedrock for HIPAA compliance and cost efficiency

### Implementation Features
- **Anthropic Claude**: Primary production LLM for medical analysis
- **OpenAI GPT-4**: Backup option with similar structured output capability  
- **Mock Provider**: Full-featured development environment without external API calls
- **Rate Limiting**: Built into server-side implementation, not exposed to client
- **Retry Logic**: Automatic retry with exponential backoff for LLM service failures
- **Fallback Responses**: Pre-defined responses when LLM services are unavailable
- **Cost Management**: Token usage monitoring and optimization in production
- **Model Versioning**: Track model versions for consistency and debugging
- **Prompt Engineering**: Centralized prompt templates with version control
- **Response Validation**: Ensure LLM responses match expected structured format
- **Error Classification**: Distinguish between LLM errors vs document processing errors
- **Performance Monitoring**: Track response times and success rates per provider
- **A/B Testing**: Capability to test different models/prompts with user consent
- **Audit Trail**: Full logging of LLM interactions for medical record compliance
- **Data Privacy**: Zero-retention policy with LLM providers for PHI protection

## Development Workflow

1. **Development Phase**: Start with mock LLM responses for faster development
2. **Testing Phase**: Test with real documents using mock data first
3. **Integration Phase**: Validate structured data format matches client expectations
4. **Staging Phase**: Switch to real Bedrock provider for integration testing
5. **Performance Phase**: Monitor processing times and adjust client timeout expectations
6. **Cost Validation**: Test cost tracking integration with payment processing
7. **Premium Testing**: Validate premium feature access controls and billing integration

### **Timeout Configuration Standards**
```typescript
// Standardized timeout configurations across all environments
const TIMEOUT_CONFIGURATIONS = {
  document_processing: {
    client_timeout: 180000, // 3 minutes client-side
    lambda_timeout: 180, // 3 minutes server-side
    bedrock_timeout: 120000, // 2 minutes Bedrock API
    polling_interval: 2000, // 2 seconds client polling
    max_polling_attempts: 90 // 3 minutes / 2 seconds
  },
  chat_responses: {
    client_timeout: 60000, // 1 minute client-side
    lambda_timeout: 60, // 1 minute server-side
    bedrock_timeout: 45000, // 45 seconds Bedrock API
    streaming_timeout: 30000, // 30 seconds for streaming responses
    typing_indicator_delay: 1000 // 1 second typing indicator
  },
  premium_reports: {
    client_timeout: 300000, // 5 minutes client-side
    lambda_timeout: 300, // 5 minutes server-side
    bedrock_timeout: 240000, // 4 minutes Bedrock API
    generation_polling: 5000, // 5 seconds polling for reports
    max_polling_attempts: 60 // 5 minutes / 5 seconds
  },
  batch_processing: {
    client_timeout: 600000, // 10 minutes client-side
    lambda_timeout: 600, // 10 minutes server-side
    per_document_timeout: 180000, // 3 minutes per document
    batch_status_polling: 10000, // 10 seconds batch status
    max_batch_size: 10 // Maximum documents per batch
  }
};

// Environment-specific adjustments
const ENVIRONMENT_MULTIPLIERS = {
  development: 1.5, // 50% longer timeouts for debugging
  staging: 1.2, // 20% longer timeouts for testing
  production: 1.0 // Standard timeouts
};
```

## Production Deployment

### **Environment-Based Configuration**
- **Development**: Mock provider with cost tracking disabled
- **Staging**: Bedrock with reduced limits and cost monitoring
- **Production**: Full Bedrock implementation with comprehensive cost tracking

### **Error Handling and Resilience**
```typescript
// Bedrock-specific error handling
interface BedrockErrorHandler {
  // Handle Bedrock service-specific errors
  handleBedrockError(error: BedrockServiceError): Promise<ErrorResponse>;
  
  // Implement exponential backoff for rate limits
  retryWithBackoff<T>(operation: () => Promise<T>, maxRetries: number): Promise<T>;
  
  // Fallback mechanisms for service unavailability
  handleServiceUnavailable(requestType: string): Promise<FallbackResponse>;
}

class BedrockErrorHandler implements BedrockErrorHandler {
  async handleBedrockError(error: BedrockServiceError): Promise<ErrorResponse> {
    switch (error.code) {
      case 'ModelTimeoutException':
        // Model processing timeout - retry with shorter content
        return await this.retryWithShorterContent(error.request);
        
      case 'ThrottlingException':
        // Rate limit exceeded - implement exponential backoff
        await this.waitForRateLimit(error.retryAfter);
        return await this.retryWithBackoff(() => error.originalOperation(), 3);
        
      case 'ModelNotReadyException':
        // Model not available - try alternative model
        return await this.tryAlternativeModel(error.request);
        
      case 'ValidationException':
        // Invalid request format - fix and retry
        const fixedRequest = await this.fixRequestFormat(error.request);
        return await this.executeRequest(fixedRequest);
        
      case 'ServiceUnavailableException':
        // Bedrock service down - use fallback response
        return await this.handleServiceUnavailable(error.requestType);
        
      default:
        // Unknown error - log and return generic error
        console.error('Unknown Bedrock error:', error);
        return await this.createGenericErrorResponse(error);
    }
  }
  
  async retryWithBackoff<T>(operation: () => Promise<T>, maxRetries: number): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        // Exponential backoff: 1s, 2s, 4s, 8s...
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    throw lastError!;
  }
  
  async handleServiceUnavailable(requestType: string): Promise<FallbackResponse> {
    // Log service unavailability for monitoring
    console.error(`Bedrock service unavailable for request type: ${requestType}`);
    
    // Return appropriate fallback based on request type
    switch (requestType) {
      case 'document_processing':
        return {
          status: 'service_unavailable',
          message: 'AI processing temporarily unavailable. Your document has been saved and will be processed when service resumes.',
          fallback_available: true,
          retry_after: 300 // 5 minutes
        };
        
      case 'chat_message':
        return {
          status: 'service_unavailable',
          message: 'AI chat temporarily unavailable. Please try again in a few minutes.',
          fallback_available: false,
          retry_after: 60 // 1 minute
        };
        
      case 'premium_report':
        return {
          status: 'service_unavailable',
          message: 'Report generation temporarily unavailable. You will be notified when your report is ready.',
          fallback_available: true,
          retry_after: 600 // 10 minutes
        };
        
      default:
        return {
          status: 'service_unavailable',
          message: 'AI services temporarily unavailable. Please try again later.',
          fallback_available: false,
          retry_after: 300
        };
    }
  }
}
```

### **Health Checks and Monitoring**
- **Bedrock Service Health**: Regular health check pings to Bedrock API
- **Cost Threshold Monitoring**: Real-time alerts when costs approach limits
- **Performance Monitoring**: Track response times and success rates
- **Automatic Scaling**: Adjust request concurrency based on service performance
- **Graceful Degradation**: Fallback to reduced functionality when services are impaired

---

**Related Documents**:
- `api-contracts.md` - Client-facing API specifications (timeout configurations aligned)
- `database-architecture.md` - Data storage and encryption details
- `encryption-strategy.md` - Security implementation details
- `system-architecture.md` - AWS Bedrock infrastructure and cost tracking implementation