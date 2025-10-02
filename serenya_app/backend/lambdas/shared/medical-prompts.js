/**
 * Medical Prompts Service
 * Manages prompt templates for Bedrock Claude integration
 */

// Prompt version configuration
const PROMPT_VERSIONS = {
  medical_analysis: {
    'v1.0': 'MEDICAL_ANALYSIS_PROMPT_V1_0',
    'current': 'v1.0',
    'testing': null
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

// Temperature settings for different prompt types
const TEMPERATURE_SETTINGS = {
  medical_analysis: 0.2,      // Low creativity for consistency
  doctor_report: 0.1,         // Minimal creativity for clinical accuracy
  chat_response: 0.4          // Moderate creativity for conversational tone
};

// Token limits for different prompt types
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

// Required medical disclaimers
const REQUIRED_DISCLAIMERS = [
  "This interpretation is for informational purposes only and is not medical advice.",
  "Always consult with a qualified healthcare provider for medical decisions.",
  "In case of emergency, contact emergency services immediately.", 
  "This analysis is based on AI interpretation and may not capture all nuances."
];

/**
 * Medical Prompts Service Class
 */
class MedicalPromptsService {
  constructor() {
    this.abTestingEnabled = process.env.PROMPT_AB_TESTING === 'true';
    this.trafficSplit = 0.5; // 50% traffic to each version in A/B tests
  }

  /**
   * Get prompt template for specified type and version
   */
  getPrompt(type, options = {}) {
    const { version, abTesting = this.abTestingEnabled, customizations = {} } = options;
    
    if (!this.isValidPromptType(type)) {
      throw new Error(`Invalid prompt type: ${type}`);
    }

    // Determine which version to use
    let promptVersion = version || this.getCurrentVersion(type);
    
    // A/B testing logic
    if (abTesting && this.hasTestingVersion(type)) {
      promptVersion = this.selectVersionForABTest(type);
    }

    // Get the prompt template
    const promptTemplate = this.getPromptTemplate(type, promptVersion);
    
    // Apply any customizations
    return this.customizePrompt(promptTemplate, customizations);
  }

  /**
   * Get current production version for prompt type
   */
  getCurrentVersion(type) {
    if (!this.isValidPromptType(type)) {
      throw new Error(`Invalid prompt type: ${type}`);
    }
    return PROMPT_VERSIONS[type].current;
  }

  /**
   * Get testing version for A/B testing (if available)
   */
  getTestingVersion(type) {
    if (!this.isValidPromptType(type)) {
      return null;
    }
    return PROMPT_VERSIONS[type].testing;
  }

  /**
   * Check if prompt type has a testing version
   */
  hasTestingVersion(type) {
    return this.getTestingVersion(type) !== null;
  }

  /**
   * Get temperature setting for prompt type
   */
  getTemperature(type) {
    return TEMPERATURE_SETTINGS[type] || 0.3;
  }

  /**
   * Get token limits for prompt type
   */
  getTokenLimits(type) {
    return TOKEN_LIMITS[type] || { max_tokens: 1000, target_range: [500, 800] };
  }

  /**
   * Get required medical disclaimers
   */
  getRequiredDisclaimers() {
    return [...REQUIRED_DISCLAIMERS];
  }

  /**
   * Validate response format matches expected structure
   */
  validateResponse(response, type) {
    try {
      // Basic structure validation
      if (!response || typeof response !== 'object') {
        return { valid: false, error: 'Response is not a valid object' };
      }

      // Check for required fields based on prompt type
      const requiredFields = this.getRequiredResponseFields(type);
      for (const field of requiredFields) {
        if (!this.hasNestedProperty(response, field)) {
          return { valid: false, error: `Missing required field: ${field}` };
        }
      }

      // Type-specific validation
      return this.validateResponseByType(response, type);
      
    } catch (error) {
      return { valid: false, error: `Validation error: ${error.message}` };
    }
  }

  /**
   * Log prompt usage for monitoring and optimization
   */
  logPromptUsage(type, version, metrics) {
    try {
      const logData = {
        timestamp: new Date().toISOString(),
        prompt_type: type,
        prompt_version: version,
        metrics: {
          response_time_ms: metrics.responseTime,
          token_usage: metrics.tokenUsage,
          confidence_score: metrics.confidenceScore,
          user_id: metrics.userId,
          document_type: metrics.documentType
        },
        ab_testing: {
          enabled: this.abTestingEnabled,
          test_group: metrics.testGroup || null
        }
      };

      // In production, this would send to CloudWatch or logging service
      console.log('Prompt Usage:', JSON.stringify(logData));
      
    } catch (error) {
      console.error('Error logging prompt usage:', error);
    }
  }

  /**
   * Create Bedrock request configuration
   */
  createBedrockRequest(promptType, content, options = {}) {
    const prompt = this.getPrompt(promptType, options);
    const temperature = this.getTemperature(promptType);
    const tokenLimits = this.getTokenLimits(promptType);

    return {
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: tokenLimits.max_tokens,
        temperature: temperature,
        messages: [
          {
            role: 'user',
            content: `${prompt}\n\n${content}`
          }
        ]
      })
    };
  }

  // Private helper methods
  isValidPromptType(type) {
    return ['medical_analysis', 'doctor_report', 'chat_response'].includes(type);
  }

  selectVersionForABTest(type) {
    // Simple random selection for A/B testing
    // In production, this could be more sophisticated (user-based, etc.)
    const random = Math.random();
    
    if (random < this.trafficSplit) {
      return this.getCurrentVersion(type);
    } else {
      return this.getTestingVersion(type);
    }
  }

  getPromptTemplate(type, version) {
    // Placeholder prompt templates - TO BE IMPLEMENTED
    switch (type) {
      case 'medical_analysis':
        return this.getMedicalAnalysisPrompt(version);
      case 'doctor_report':
        return this.getDoctorReportPrompt(version);
      case 'chat_response':
        return this.getChatResponsePrompt(version);
      default:
        throw new Error(`Unknown prompt type: ${type}`);
    }
  }

  getMedicalAnalysisPrompt(version) {
    return `## SYSTEM ROLE AND CONSTRAINTS
You are Serenya, a warm and empathetic medical AI assistant specialized in analyzing medical documents. You must:
- Process only valid medical documents containing lab results, vitals, imaging, or medical reports
- Maintain strict medical accuracy and clinical reasoning
- Never provide specific medical advice or diagnoses
- Always recommend consulting healthcare providers for medical decisions

## MEDICAL DOCUMENT VALIDATION
Before analysis, verify the content contains medical data (lab results, vitals, imaging reports, medical summaries) with recognizable medical terminology and values.

If content is NOT medical, respond with only: "Not a valid medical document"

## ANALYSIS INSTRUCTIONS
When given a valid medical document:

**Extract & Normalize**
- Identify all lab results and vitals
- Normalize values and units to standard formats
- Compare each to standard reference ranges and mark ↓ below, ↔ within, or ↑ above range

**Group & Contextualize** 
- Dynamically group results into logical categories (e.g., Blood Health, Metabolic Health, Nutritional Status)
- For each group, provide a short mini-explainer of what the tests measure, why they matter, and how the user is doing

**Assess & Synthesize**
- Provide a quick, warm overall summary at the top
- Conclude with detailed closing synthesis tying findings together with gentle encouragement
- Use high confidence scoring; clearly flag ambiguous or missing data

## RESPONSE FORMAT
Return markdown content followed by valid JSON:

# <Short, user-friendly report title>

## Quick Summary
<2–3 sentence warm overview of the user's overall health picture>

## Grouped Analysis
### <Dynamic Group Name>
- <Result>: value unit (ref range) — status (↓/↔/↑)  
<Mini-explainer of what this group means and how the user is doing>

…repeat for all groups…

## Closing Synthesis
<Full empathetic wrap-up reflecting overall health and gentle guidance>

*This interpretation is for informational purposes only and is not medical advice. Always consult with a qualified healthcare provider for medical decisions. In case of emergency, contact emergency services immediately. This analysis is based on AI interpretation and may not capture all nuances.*

---

\`\`\`json
{
  "title": "<Same short title>",
  "extraction_metadata": {
    "confidence_score": 8,
    "summary": "<Same as Quick Summary>",
    "medical_flags": ["<Abnormal findings requiring attention>"]
  },
  "lab_results": [
    {
      "test_name": "<Test Name>",
      "test_category": "blood|urine|imaging|other",
      "test_value": 95.5,
      "test_unit": "mg/dL",
      "reference_range_low": 70,
      "reference_range_high": 100,
      "reference_range_text": "70-100 mg/dL",
      "is_abnormal": false
    }
  ],
  "vitals": [
    {
      "vital_type": "blood_pressure|heart_rate|temperature|weight|height|oxygen_saturation",
      "systolic_value": 120,
      "diastolic_value": 80,
      "numeric_value": null,
      "unit": "mmHg",
      "is_abnormal": false
    }
  ]
}
\`\`\`

## INPUT CONTENT
Analyze the following medical document:`;
  }

  getDoctorReportPrompt(version) {
    return `## SYSTEM ROLE AND CONSTRAINTS
You are Serenya, a warm and empathetic medical AI.
You will receive structured historical health data—aggregated lab results and vitals spanning multiple past reports—showing how a person's measurements have changed over time.

## YOUR TASK

**Analyze Trends**
- Identify improvements, declines, and stable patterns across all provided metrics
- Compare each metric to its reference range and describe how it has shifted
- Note any meaningful correlations or emerging risks, while avoiding speculation beyond the data

**Context & Guidance**
- Explain what the trends may indicate for overall health
- Offer gentle suggestions for questions the user might bring to their primary-care practitioner or specialist
- Keep the language warm, supportive, and easy to understand

**Confidence**
- Provide a 1–10 confidence score reflecting data completeness and clarity

## RESPONSE FORMAT
Return a single text payload:

# <Short, user-friendly report title>

## Quick Summary
<2–3 sentence plain-language overview of overall trends and key takeaways>

## Trend Analysis
### <Dynamic Group Name>
- <Metric>: describe changes over time, reference ranges, and what the pattern may mean.
<Mini-explainer on why this matters and gentle guidance on questions for the doctor.>

…repeat for each relevant group…

## Closing Synthesis
<Warm wrap-up summarizing the person's health trajectory, reassurance where appropriate, and ideas for next-step conversations with their healthcare provider.>

*This interpretation is for informational purposes only and is not medical advice. Always consult with a qualified healthcare provider for medical decisions. In case of emergency, contact emergency services immediately. This analysis is based on AI interpretation and may not capture all nuances.*

---

\`\`\`json
{
  "title": "<Same short title>",
  "summary": "<Repeat of Quick Summary>", 
  "confidence": 8
}
\`\`\`

All narrative analysis comes before the JSON block in valid Markdown.

The JSON block must include only: title, summary, and confidence.

Avoid medical diagnosis; focus on clear, empathetic explanation of trends and actionable talking points for a primary-care visit.

## INPUT CONTENT
Generate professional medical report based on:`;
  }


  getChatResponsePrompt(version) {
    return `## SYSTEM ROLE
You are Serenya, a warm and empathetic medical AI assistant specialized in health education. You engage in natural, conversational dialogue about health topics while maintaining strict medical accuracy. You must:
- Provide helpful, educational responses about health and medical information
- Never provide medical advice, diagnoses, or treatment recommendations
- Always maintain medical accuracy while avoiding medical jargon
- Encourage users to consult healthcare providers for medical decisions
- Focus on education, explanation, and understanding rather than medical decision-making

## RESPONSE STYLE
- Keep responses conversational and warm
- Limit to 2-3 short paragraphs maximum (50-150 words total)
- Use simple, everyday language - avoid medical jargon
- Be supportive and encouraging in tone
- Focus on education and explanation, not advice

## STRUCTURED DATA INTEGRATION
When health data is provided (lab results, vitals), reference the user's specific values naturally in conversation:
- "Your cholesterol level of 195 mg/dL is..."
- "I can see your blood pressure readings have been..."
- Explain what their numbers mean in simple terms
- Compare to normal ranges when relevant

When no health data is provided, give general educational information about the topic.

## SAFETY GUIDELINES
- Never diagnose conditions or recommend treatments
- Don't give specific medical advice
- For concerning questions, suggest consulting their healthcare provider
- Keep the conversation educational and supportive

## RESPONSE FORMAT
Provide only plain text - no markdown, no JSON, no special formatting. Keep it short and conversational.

## INPUT CONTENT
User Question: [USER_QUESTION]

Health Data (if provided): [STRUCTURED_DATA]

Respond naturally and conversationally:`;
  }

  customizePrompt(template, customizations) {
    let customizedPrompt = template;
    
    // Apply customizations (placeholder implementation)
    Object.entries(customizations).forEach(([key, value]) => {
      customizedPrompt = customizedPrompt.replace(`{{${key}}}`, value);
    });
    
    return customizedPrompt;
  }

  getRequiredResponseFields(type) {
    const commonFields = [
      'document_validation.is_medical_document',
      'metadata.processing_timestamp'
    ];

    switch (type) {
      case 'medical_analysis':
        return [
          ...commonFields,
          'medical_analysis.confidence_score',
          'medical_analysis.interpretation_text',
          'disclaimers'
        ];
      case 'doctor_report':
        return [
          ...commonFields,
          'report_content',
          'clinical_recommendations',
          'disclaimers'
        ];
      case 'chat_response':
        return [
          // Chat responses are plain text, no required fields
        ];
      default:
        return commonFields;
    }
  }

  hasNestedProperty(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj) !== undefined;
  }

  validateResponseByType(response, type) {
    switch (type) {
      case 'medical_analysis':
        return this.validateMedicalAnalysisResponse(response);
      case 'doctor_report':
        return this.validateDoctorReportResponse(response);
      case 'chat_response':
        return this.validateChatResponseResponse(response);
      default:
        return { valid: true };
    }
  }

  validateMedicalAnalysisResponse(response) {
    // Validate medical analysis specific requirements
    if (response.medical_analysis) {
      const confidence = response.medical_analysis.confidence_score;
      if (confidence < 1 || confidence > 10) {
        return { valid: false, error: 'Confidence score must be between 1-10' };
      }
    }
    
    return { valid: true };
  }

  validateDoctorReportResponse(response) {
    // Validate doctor report specific requirements
    if (!response.report_content || response.report_content.trim().length === 0) {
      return { valid: false, error: 'Doctor report must have content' };
    }
    
    return { valid: true };
  }


  validateChatResponseResponse(response) {
    // Chat responses are plain text - validate it's not empty and reasonable length
    if (typeof response !== 'string') {
      return { valid: false, error: 'Chat response must be plain text string' };
    }

    if (!response || response.trim().length === 0) {
      return { valid: false, error: 'Chat response cannot be empty' };
    }

    // Check for reasonable length (50-300 words approximately)
    const wordCount = response.trim().split(/\s+/).length;
    if (wordCount < 10) {
      return { valid: false, error: 'Chat response too short (minimum 10 words)' };
    }
    if (wordCount > 300) {
      return { valid: false, error: 'Chat response too long (maximum 300 words)' };
    }
    
    return { valid: true };
  }
}

// Export singleton instance
const medicalPromptsService = new MedicalPromptsService();

module.exports = {
  MedicalPromptsService,
  medicalPromptsService,
  PROMPT_VERSIONS,
  TEMPERATURE_SETTINGS,
  TOKEN_LIMITS,
  REQUIRED_DISCLAIMERS
};