# Prompt Engineering Guidelines

**Document Purpose**: Framework for medical AI prompt design, A/B testing, and optimization  
**Scope**: Bedrock Claude integration prompts and response handling  
**Audience**: Backend developers, AI engineers, and medical content reviewers  
**Status**: Framework Ready - Prompts TBD  
**Last Updated**: September 8, 2025

---

## Table of Contents

1. [Prompt Architecture Overview](#prompt-architecture-overview)
2. [Three Core Prompt Types](#three-core-prompt-types)
3. [Prompt Format Specifications](#prompt-format-specifications)
4. [Response Format Standards](#response-format-standards)
5. [A/B Testing Framework](#ab-testing-framework)
6. [Versioning Strategy](#versioning-strategy)
7. [Performance Guidelines](#performance-guidelines)
8. [Error Handling Integration](#error-handling-integration)
9. [Medical Compliance Requirements](#medical-compliance-requirements)
10. [Implementation Standards](#implementation-standards)

---

## Prompt Architecture Overview

**Core Principle**: All prompts must validate medical content first, then provide analysis  
**Processing Model**: Single-call generation of all structured medical data  
**Error Strategy**: Medical document validation prevents non-medical processing  

### Bedrock Integration Pattern
```javascript
// Standard prompt structure for all medical AI calls
const promptStructure = {
  model: 'anthropic.claude-3-haiku-20240307-v1:0',
  messages: [
    {
      role: 'user',
      content: `${SYSTEM_INSTRUCTIONS}

${MEDICAL_DOCUMENT_VALIDATION}

${TASK_SPECIFIC_PROMPT}

${USER_CONTENT}`
    }
  ],
  max_tokens: TASK_SPECIFIC_LIMIT,
  temperature: TASK_SPECIFIC_TEMPERATURE
};
```

## Three Core Prompt Types

### 1. Medical Results Analysis
**Purpose**: Process uploaded medical documents and generate structured medical data  
**Use Case**: Document upload processing pipeline  
**Expected Output**: Complete medical interpretation with confidence scoring  

**Framework Elements:**
- Document type validation (lab results, imaging, vitals, reports)
- Medical content verification before processing
- Structured data extraction requirements
- Confidence scoring methodology
- Medical flags and safety warnings
- Patient-friendly language guidelines

**Placeholder**: `MEDICAL_ANALYSIS_PROMPT_TEMPLATE` - TBD

### 2. Doctor's Report Generation  
**Purpose**: Generate professional medical reports for healthcare provider review  
**Use Case**: Premium feature for healthcare provider communication  
**Expected Output**: Clinical-grade medical report with recommendations  

**Framework Elements:**
- Professional medical terminology requirements
- Clinical context and risk stratification
- Differential diagnosis considerations
- Follow-up care recommendations
- Reference ranges and normal values
- Healthcare provider communication standards

**Placeholder**: `DOCTOR_REPORT_PROMPT_TEMPLATE` - TBD

### 3. Chat Questions Response
**Purpose**: Interactive medical Q&A based on processed document data  
**Use Case**: User questions about their medical results  
**Expected Output**: Conversational medical explanations with disclaimers  

**Framework Elements:**
- Context awareness from processed documents
- Patient education focus
- Medical disclaimer integration
- Conversational tone guidelines
- Safety warning protocols
- Follow-up question suggestions

**Placeholder**: `CHAT_RESPONSE_PROMPT_TEMPLATE` - TBD

## Prompt Format Specifications

### Universal Prompt Structure
```markdown
## SYSTEM ROLE AND CONSTRAINTS
[Medical AI assistant role definition]
[Processing constraints and limitations]

## MEDICAL DOCUMENT VALIDATION
[Validation requirements before processing]
[Error response format for non-medical content]

## TASK-SPECIFIC INSTRUCTIONS
[Detailed task requirements]
[Output format specifications]

## SAFETY AND COMPLIANCE
[Medical disclaimer requirements]
[Safety warning protocols]
[Confidence scoring guidelines]

## INPUT CONTENT
[User-provided document or question]
```

### Content Validation Framework
**All prompts must include:**
1. **Medical Document Verification**
   - Confirm content contains medical information
   - Identify document type (lab results, imaging, vitals, reports)
   - Reject non-medical content with specific error message

2. **Content Safety Checks**
   - Verify appropriate medical context
   - Flag potentially harmful or inappropriate content
   - Ensure patient privacy compliance

## Response Format Standards

### Structured Response Requirements
All medical AI responses must follow consistent JSON structure:

```json
{
  "document_validation": {
    "is_medical_document": boolean,
    "document_type": "lab_results|imaging|vitals|general_medical|unknown",
    "validation_confidence": number, // 0.0-1.0
    "rejection_reason": "string" // Only if is_medical_document is false
  },
  "medical_analysis": {
    "confidence_score": number, // 1-10 scale
    "interpretation_text": "string", // Patient-friendly summary
    "detailed_interpretation": "string", // Comprehensive analysis
    "medical_flags": ["string"], // Abnormal findings array
    "recommendations": ["string"], // Follow-up suggestions
    "safety_warnings": ["string"] // Critical alerts
  },
  "metadata": {
    "processing_timestamp": "ISO8601",
    "model_version": "string",
    "prompt_version": "string",
    "token_usage": {
      "input_tokens": number,
      "output_tokens": number
    }
  },
  "disclaimers": ["string"] // Required medical disclaimers
}
```

### Error Response Format
When medical document validation fails:

```json
{
  "error": {
    "code": "INVALID_MEDICAL_DOCUMENT",
    "message": "The uploaded file does not appear to contain medical information that can be analyzed.",
    "category": "validation",
    "recovery_strategy": "retry_with_medical_document",
    "user_action": "Please upload a valid medical document (lab results, imaging report, or medical summary)."
  },
  "document_validation": {
    "is_medical_document": false,
    "rejection_reason": "Content does not contain recognizable medical data or terminology."
  }
}
```

## A/B Testing Framework

### Prompt Versioning System
```javascript
const promptVersions = {
  medical_analysis: {
    'v1.0': MEDICAL_ANALYSIS_PROMPT_V1,
    'v1.1': MEDICAL_ANALYSIS_PROMPT_V1_1,
    'current': 'v1.1',
    'testing': 'v1.1' // Version for A/B testing
  },
  doctor_report: {
    'v1.0': DOCTOR_REPORT_PROMPT_V1,
    'current': 'v1.0',
    'testing': null
  },
  chat_response: {
    'v1.0': CHAT_RESPONSE_PROMPT_V1,
    'current': 'v1.0', 
    'testing': null
  }
};
```

### A/B Testing Configuration
```javascript
const abTestingConfig = {
  enabled: process.env.PROMPT_AB_TESTING === 'true',
  traffic_split: 0.5, // 50% traffic to each version
  metrics_tracked: [
    'response_quality_score',
    'user_satisfaction_rating', 
    'medical_accuracy_validation',
    'processing_time_ms',
    'token_usage_efficiency'
  ],
  test_duration_days: 14,
  minimum_sample_size: 100
};
```

### Testing Metrics Collection
```javascript
interface PromptTestingMetrics {
  prompt_version: string;
  test_group: 'control' | 'variant';
  user_id: string;
  document_type: string;
  response_time_ms: number;
  token_usage: {
    input: number;
    output: number;
  };
  quality_metrics: {
    confidence_score: number;
    medical_flags_count: number;
    user_satisfaction?: number; // Post-response survey
  };
}
```

## Versioning Strategy

### Version Naming Convention
- **Major Version** (v1.0, v2.0): Significant prompt restructuring
- **Minor Version** (v1.1, v1.2): Content refinements and improvements  
- **Patch Version** (v1.1.1): Bug fixes and small corrections

### Version Metadata Tracking
```javascript
interface PromptVersion {
  version: string;
  created_date: string;
  author: string;
  description: string;
  changes: string[];
  performance_baseline: {
    avg_confidence_score: number;
    avg_processing_time_ms: number;
    avg_token_usage: number;
  };
  medical_review_status: 'pending' | 'approved' | 'rejected';
  production_status: 'testing' | 'active' | 'deprecated';
}
```

## Performance Guidelines

### Token Usage Optimization
**Target Metrics:**
- **Medical Analysis**: < 2,000 input tokens, < 1,500 output tokens
- **Doctor Reports**: < 2,500 input tokens, < 2,000 output tokens  
- **Chat Responses**: < 1,500 input tokens, < 800 output tokens

### Response Time Targets
- **Medical Analysis**: < 30 seconds end-to-end
- **Doctor Reports**: < 45 seconds end-to-end
- **Chat Responses**: < 15 seconds end-to-end

### Temperature Settings
```javascript
const temperatureSettings = {
  medical_analysis: 0.2,    // Low creativity for consistency
  doctor_report: 0.1,       // Minimal creativity for clinical accuracy
  chat_response: 0.4        // Moderate creativity for conversational tone
};
```

### Token Limit Configuration
```javascript
const tokenLimits = {
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

## Error Handling Integration

### Alignment with Dev Rules
All prompt-related errors must follow the unified error handling patterns specified in `our-dev-rules.md`:

```javascript
// Error categorization for prompt-related issues
const promptErrorCategories = {
  VALIDATION: {
    INVALID_MEDICAL_DOCUMENT: {
      category: 'validation',
      recovery_strategy: 'retry_with_valid_document',
      user_friendly: true
    },
    DOCUMENT_TOO_LARGE: {
      category: 'validation', 
      recovery_strategy: 'reduce_content_size',
      user_friendly: true
    }
  },
  EXTERNAL: {
    BEDROCK_SERVICE_UNAVAILABLE: {
      category: 'external',
      recovery_strategy: 'retry_after_delay',
      user_friendly: true
    },
    BEDROCK_RATE_LIMITED: {
      category: 'external',
      recovery_strategy: 'exponential_backoff',
      user_friendly: true
    }
  },
  TECHNICAL: {
    PROMPT_PROCESSING_TIMEOUT: {
      category: 'technical',
      recovery_strategy: 'retry_with_shorter_content',
      user_friendly: false
    }
  }
};
```

### Medical-Specific Error Responses
```javascript
const medicalErrorResponses = {
  NON_MEDICAL_CONTENT: {
    message: "This doesn't appear to be a medical document. Please upload lab results, imaging reports, or medical summaries.",
    suggestion: "Accepted formats include PDF lab reports, imaging results, and medical consultation notes."
  },
  INSUFFICIENT_MEDICAL_DATA: {
    message: "Not enough medical information could be extracted from this document.",
    suggestion: "Please ensure the document is clear and contains readable medical data."
  },
  DOCUMENT_QUALITY_POOR: {
    message: "The document quality is too low for accurate medical analysis.",
    suggestion: "Please upload a clearer version or contact support for assistance."
  }
};
```

## Medical Compliance Requirements

### HIPAA Compliance in Prompts
- **No PHI Logging**: Prompts must not log personal health information
- **Audit Trail**: All prompt interactions must be auditable
- **Data Minimization**: Only necessary medical data included in prompts
- **Secure Processing**: All prompts processed within VPC boundaries

### Medical Disclaimer Requirements
**All responses must include:**
```javascript
const requiredDisclaimers = [
  "This interpretation is for informational purposes only and is not medical advice.",
  "Always consult with a qualified healthcare provider for medical decisions.", 
  "In case of emergency, contact emergency services immediately.",
  "This analysis is based on AI interpretation and may not capture all nuances."
];
```

### Confidence Scoring Standards
```javascript
const confidenceScoring = {
  high_confidence: {
    range: [8, 10],
    criteria: "Clear medical data, standard format, complete information",
    user_message: "High confidence analysis"
  },
  moderate_confidence: {
    range: [5, 7], 
    criteria: "Some unclear elements, non-standard format, missing data",
    user_message: "Moderate confidence - please discuss with healthcare provider"
  },
  low_confidence: {
    range: [1, 4],
    criteria: "Poor quality, unclear data, non-standard document", 
    user_message: "Low confidence - recommend professional medical review"
  }
};
```

## Implementation Standards

### Code Integration Requirements
```javascript
// All prompts must be accessed through the prompt service
import { MedicalPromptsService } from '../shared/medical-prompts.js';

const promptService = new MedicalPromptsService();

// Usage pattern for all medical AI calls
const prompt = promptService.getPrompt('medical_analysis', {
  version: promptService.getCurrentVersion('medical_analysis'),
  abTesting: process.env.PROMPT_AB_TESTING === 'true'
});
```

### Prompt Service Interface
```javascript
interface MedicalPromptsService {
  getPrompt(type: PromptType, options?: PromptOptions): string;
  getCurrentVersion(type: PromptType): string;
  getTestingVersion(type: PromptType): string | null;
  validateResponse(response: any, expectedFormat: ResponseFormat): boolean;
  logPromptUsage(type: PromptType, version: string, metrics: UsageMetrics): void;
}

type PromptType = 'medical_analysis' | 'doctor_report' | 'chat_response';

interface PromptOptions {
  version?: string;
  abTesting?: boolean;
  customizations?: Record<string, any>;
}
```

### Testing Requirements
**All prompts must have:**
- Unit tests for prompt generation
- Integration tests with Bedrock
- Medical accuracy validation tests
- A/B testing statistical analysis
- Performance benchmarking

---

## Implementation Next Steps

### Phase 1: Framework Implementation
1. **Create MedicalPromptsService** with placeholder templates
2. **Implement A/B testing infrastructure** 
3. **Set up prompt versioning system**
4. **Create error handling integration**

### Phase 2: Prompt Development (Future)
1. **Medical Analysis Prompt** - Document processing template
2. **Doctor Report Prompt** - Professional report template  
3. **Chat Response Prompt** - Interactive Q&A template
4. **Medical review and validation** of all prompts

### Phase 3: Optimization (Future)
1. **A/B testing implementation** with real user data
2. **Performance monitoring** and optimization
3. **Medical accuracy validation** with healthcare professionals
4. **Continuous improvement** based on usage metrics

---

**Related Documents**:
- `our-dev-rules.md` - Error handling and development standards
- `llm-integration-architecture.md` - Bedrock service integration details  
- `api-contracts.md` - Client-facing API specifications
- `database-architecture.md` - Medical data storage and encryption

**Status**: ✅ Framework Complete - Ready for MedicalPromptsService Implementation  
**Next Action**: Create `lambdas/shared/medical-prompts.js` with placeholder templates