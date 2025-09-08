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
  medical_analysis: 0.2,    // Low creativity for consistency
  doctor_report: 0.1,       // Minimal creativity for clinical accuracy
  chat_response: 0.4        // Moderate creativity for conversational tone
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
    // PLACEHOLDER - Actual prompt content TBD
    return `## MEDICAL DOCUMENT ANALYSIS PROMPT - VERSION ${version}

## SYSTEM ROLE AND CONSTRAINTS
[TBD: Medical AI assistant role definition and processing constraints]

## MEDICAL DOCUMENT VALIDATION  
[TBD: Validation requirements and error response format for non-medical content]

## ANALYSIS INSTRUCTIONS
[TBD: Detailed analysis requirements and output format specifications]

## SAFETY AND COMPLIANCE
[TBD: Medical disclaimer requirements, safety protocols, confidence scoring]

## RESPONSE FORMAT
[TBD: Structured JSON response requirements]

## INPUT CONTENT
The following content should be analyzed:`;
  }

  getDoctorReportPrompt(version) {
    // PLACEHOLDER - Actual prompt content TBD
    return `## DOCTOR REPORT GENERATION PROMPT - VERSION ${version}

## SYSTEM ROLE AND CONSTRAINTS
[TBD: Professional medical report generation role and clinical standards]

## MEDICAL DOCUMENT VALIDATION
[TBD: Validation requirements for report-worthy medical content]

## REPORT GENERATION INSTRUCTIONS
[TBD: Professional medical terminology, clinical context, risk stratification]

## SAFETY AND COMPLIANCE  
[TBD: Healthcare provider communication standards and medical disclaimers]

## RESPONSE FORMAT
[TBD: Clinical report structure and formatting requirements]

## INPUT CONTENT
Generate professional medical report based on:`;
  }

  getChatResponsePrompt(version) {
    // PLACEHOLDER - Actual prompt content TBD  
    return `## CHAT RESPONSE PROMPT - VERSION ${version}

## SYSTEM ROLE AND CONSTRAINTS
[TBD: Conversational medical AI role and patient education focus]

## CONTEXT VALIDATION
[TBD: Requirements for context awareness from processed documents]

## RESPONSE INSTRUCTIONS
[TBD: Patient-friendly language, educational content, safety warnings]

## SAFETY AND COMPLIANCE
[TBD: Medical disclaimer integration and conversational safety protocols]

## RESPONSE FORMAT
[TBD: Conversational response structure with follow-up suggestions]

## INPUT CONTENT
Respond to this medical question:`;
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
          ...commonFields,
          'response_content',
          'follow_up_suggestions',
          'disclaimers'
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
    // Validate chat response specific requirements
    if (!response.response_content || response.response_content.trim().length === 0) {
      return { valid: false, error: 'Chat response must have content' };
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