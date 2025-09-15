const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { medicalPromptsService } = require('./medical-prompts');
const { auditService } = require('./audit-service');
const { BedrockCircuitBreaker } = require('./circuit-breaker');
const { createLogger } = require('./structured-logging');

/**
 * Bedrock Service for Medical AI Integration
 * Handles all AWS Bedrock Claude model interactions
 */
class BedrockService {
  constructor() {
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'eu-west-1'
    });
    
    this.logger = createLogger('BedrockService');
    
    // Circuit breaker configuration for Bedrock resilience
    this.circuitBreaker = new BedrockCircuitBreaker({
      name: 'bedrock-service',
      failureThreshold: 5,    // Open circuit after 5 failures
      recoveryTimeout: 30000, // Try again after 30 seconds
      monitoringPeriod: 60000 // Monitor failures over 1 minute
    });
    
    // Performance tracking
    this.metrics = {
      totalRequests: 0,
      totalTokensUsed: 0,
      totalCostCents: 0,
      averageResponseTime: 0
    };
  }

  /**
   * Process medical document with Claude Haiku
   */
  async analyzeMedicalDocument(documentContent, metadata = {}) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting medical document analysis', {
        documentType: metadata.fileType,
        contentLength: documentContent.length,
        userId: metadata.userId
      });

      // Create Bedrock request using prompts service
      const bedrockRequest = medicalPromptsService.createBedrockRequest(
        'medical_analysis', 
        documentContent,
        { abTesting: true }
      );

      // Execute through circuit breaker
      const response = await this.circuitBreaker.execute(async () => {
        return await this.invokeBedrock(bedrockRequest);
      });

      // Process and validate response
      const analysisResult = await this.processAnalysisResponse(response, 'medical_analysis');
      
      // Track usage metrics
      const responseTime = Date.now() - startTime;
      await this.trackUsage('medical_analysis', response.tokenUsage, responseTime, metadata);

      // Audit logging
      await this.logAnalysisAudit('medical_document_analysis', metadata.userId, {
        documentType: metadata.fileType,
        confidenceScore: analysisResult.medical_analysis?.confidence_score,
        responseTimeMs: responseTime,
        tokenUsage: response.tokenUsage
      });

      return {
        success: true,
        analysis: analysisResult,
        metadata: {
          processing_time_ms: responseTime,
          model_used: 'anthropic.claude-3-haiku-20240307-v1:0',
          token_usage: response.tokenUsage,
          cost_estimate_cents: this.calculateCostCents(response.tokenUsage)
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      this.logger.categorizedError(error, 'external', 'bedrock_analysis_failed', {
        documentType: metadata.fileType,
        responseTimeMs: responseTime,
        userId: metadata.userId
      });

      // Audit error
      await this.logAnalysisAudit('medical_document_analysis_failed', metadata.userId, {
        error: this.sanitizeError(error),
        responseTimeMs: responseTime
      });

      return this.handleBedrockError(error, 'medical_analysis');
    }
  }

  /**
   * Generate health data report with Claude Haiku
   */
  async generateHealthDataReport(healthData, metadata = {}) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting health data report generation', {
        userId: metadata.userId,
        reportType: metadata.reportType || 'health_summary',
        dataPointsCount: metadata.dataPointsCount || 0
      });

      // Format health data for report generation
      const reportInput = this.formatHealthDataForReport(healthData, metadata);
      
      // Create Bedrock request
      const bedrockRequest = medicalPromptsService.createBedrockRequest(
        'health_data_report',
        reportInput
      );

      // Execute through circuit breaker
      const response = await this.circuitBreaker.execute(async () => {
        return await this.invokeBedrock(bedrockRequest);
      });

      // Process response
      const reportResult = await this.processAnalysisResponse(response, 'health_data_report');
      
      // Track usage
      const responseTime = Date.now() - startTime;
      await this.trackUsage('health_data_report', response.tokenUsage, responseTime, metadata);

      // Audit logging
      await this.logAnalysisAudit('health_data_report_generated', metadata.userId, {
        reportType: metadata.reportType,
        dataPointsCount: metadata.dataPointsCount,
        includeRecommendations: metadata.includeRecommendations,
        responseTimeMs: responseTime,
        tokenUsage: response.tokenUsage
      });

      return {
        success: true,
        report: reportResult,
        metadata: {
          processing_time_ms: responseTime,
          model_used: 'anthropic.claude-3-haiku-20240307-v1:0',
          token_usage: response.tokenUsage,
          cost_estimate_cents: this.calculateCostCents(response.tokenUsage),
          confidence_score: this.calculateHealthDataConfidence(healthData, metadata.dataPointsCount)
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      this.logger.categorizedError(error, 'external', 'bedrock_health_report_failed', {
        reportType: metadata.reportType,
        dataPointsCount: metadata.dataPointsCount,
        responseTimeMs: responseTime,
        userId: metadata.userId
      });

      // Audit error
      await this.logAnalysisAudit('health_data_report_generation_failed', metadata.userId, {
        error: this.sanitizeError(error),
        responseTimeMs: responseTime,
        dataPointsCount: metadata.dataPointsCount
      });

      return this.handleBedrockError(error, 'health_data_report');
    }
  }

  /**
   * Generate doctor report with Claude Haiku
   */
  async generateDoctorReport(analysisData, metadata = {}) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting doctor report generation', {
        userId: metadata.userId,
        reportType: metadata.reportType || 'medical_summary'
      });

      // Format analysis data for report generation
      const reportInput = this.formatAnalysisForReport(analysisData);
      
      // Create Bedrock request
      const bedrockRequest = medicalPromptsService.createBedrockRequest(
        'doctor_report',
        reportInput
      );

      // Execute through circuit breaker
      const response = await this.circuitBreaker.execute(async () => {
        return await this.invokeBedrock(bedrockRequest);
      });

      // Process response
      const reportResult = await this.processAnalysisResponse(response, 'doctor_report');
      
      // Track usage
      const responseTime = Date.now() - startTime;
      await this.trackUsage('doctor_report', response.tokenUsage, responseTime, metadata);

      // Audit logging
      await this.logAnalysisAudit('doctor_report_generated', metadata.userId, {
        reportType: metadata.reportType,
        responseTimeMs: responseTime,
        tokenUsage: response.tokenUsage
      });

      return {
        success: true,
        report: reportResult,
        metadata: {
          processing_time_ms: responseTime,
          model_used: 'anthropic.claude-3-haiku-20240307-v1:0',
          token_usage: response.tokenUsage,
          cost_estimate_cents: this.calculateCostCents(response.tokenUsage)
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      this.logger.categorizedError(error, 'external', 'bedrock_report_failed', {
        reportType: metadata.reportType,
        responseTimeMs: responseTime,
        userId: metadata.userId
      });

      return this.handleBedrockError(error, 'doctor_report');
    }
  }

  /**
   * Process chat question with Claude Haiku
   */
  async processChatQuestion(question, documentContext, metadata = {}) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Processing chat question', {
        userId: metadata.userId,
        questionLength: question.length,
        hasContext: !!documentContext
      });

      // Format question with context
      const chatInput = this.formatQuestionWithContext(question, documentContext);
      
      // Create Bedrock request
      const bedrockRequest = medicalPromptsService.createBedrockRequest(
        'chat_response',
        chatInput
      );

      // Execute through circuit breaker
      const response = await this.circuitBreaker.execute(async () => {
        return await this.invokeBedrock(bedrockRequest);
      });

      // Process response
      const chatResult = await this.processAnalysisResponse(response, 'chat_response');
      
      // Track usage
      const responseTime = Date.now() - startTime;
      await this.trackUsage('chat_response', response.tokenUsage, responseTime, metadata);

      // Audit logging
      await this.logAnalysisAudit('chat_question_processed', metadata.userId, {
        questionLength: question.length,
        hasContext: !!documentContext,
        responseTimeMs: responseTime,
        tokenUsage: response.tokenUsage
      });

      return {
        success: true,
        response: chatResult,
        metadata: {
          processing_time_ms: responseTime,
          model_used: 'anthropic.claude-3-haiku-20240307-v1:0',
          token_usage: response.tokenUsage,
          cost_estimate_cents: this.calculateCostCents(response.tokenUsage)
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      this.logger.categorizedError(error, 'external', 'bedrock_chat_failed', {
        questionLength: question.length,
        responseTimeMs: responseTime,
        userId: metadata.userId
      });

      return this.handleBedrockError(error, 'chat_response');
    }
  }

  /**
   * Core Bedrock model invocation
   */
  async invokeBedrock(request) {
    const command = new InvokeModelCommand(request);
    const startTime = Date.now();
    
    try {
      const response = await this.client.send(command);
      const responseTime = Date.now() - startTime;
      
      // Parse response
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      // Extract token usage for cost tracking
      const tokenUsage = {
        input_tokens: responseBody.usage?.input_tokens || 0,
        output_tokens: responseBody.usage?.output_tokens || 0
      };
      
      this.logger.info('Bedrock invocation successful', {
        responseTimeMs: responseTime,
        tokenUsage: tokenUsage
      });

      return {
        content: responseBody.content?.[0]?.text || '',
        tokenUsage: tokenUsage,
        responseTime: responseTime,
        raw: responseBody
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      this.logger.categorizedError(error, 'external', 'bedrock_invocation_failed', {
        responseTimeMs: responseTime,
        modelId: request.modelId
      });
      
      throw this.enrichBedrockError(error, responseTime);
    }
  }

  /**
   * Process and validate Bedrock response
   */
  async processAnalysisResponse(response, promptType) {
    try {
      // Parse JSON response from Claude
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(response.content);
      } catch (parseError) {
        // If not valid JSON, create structured response
        parsedResponse = this.createStructuredResponse(response.content, promptType);
      }

      // Validate response format
      const validation = medicalPromptsService.validateResponse(parsedResponse, promptType);
      if (!validation.valid) {
        throw new Error(`Invalid response format: ${validation.error}`);
      }

      // Add required disclaimers
      parsedResponse.disclaimers = medicalPromptsService.getRequiredDisclaimers();
      
      // Add metadata
      parsedResponse.metadata = {
        ...parsedResponse.metadata,
        processing_timestamp: new Date().toISOString(),
        model_version: 'anthropic.claude-3-haiku-20240307-v1:0',
        prompt_version: medicalPromptsService.getCurrentVersion(promptType),
        token_usage: response.tokenUsage
      };

      return parsedResponse;

    } catch (error) {
      this.logger.categorizedError(error, 'technical', 'response_processing_failed', {
        promptType: promptType,
        contentLength: response.content?.length || 0
      });
      
      throw new Error(`Failed to process ${promptType} response: ${error.message}`);
    }
  }

  /**
   * Handle Bedrock-specific errors with proper categorization
   */
  handleBedrockError(error, promptType) {
    // Map Bedrock errors to our error handling strategy
    if (error.name === 'ThrottlingException') {
      return {
        success: false,
        error: {
          code: 'BEDROCK_RATE_LIMITED',
          message: 'AI service is temporarily busy. Please try again in a moment.',
          category: 'external',
          recovery_strategy: 'exponential_backoff',
          user_action: 'Please wait a moment and try again.',
          retry_after: 30
        }
      };
    }

    if (error.name === 'ValidationException') {
      return {
        success: false,
        error: {
          code: 'INVALID_MEDICAL_DOCUMENT',
          message: 'The document format is not supported for medical analysis.',
          category: 'validation',
          recovery_strategy: 'retry_with_valid_document',
          user_action: 'Please upload a valid medical document (PDF, image, or text format).'
        }
      };
    }

    if (error.name === 'ServiceUnavailableException' || this.circuitBreaker.isOpen()) {
      return {
        success: false,
        error: {
          code: 'BEDROCK_SERVICE_UNAVAILABLE',
          message: 'AI analysis service is temporarily unavailable.',
          category: 'external',
          recovery_strategy: 'retry_after_delay',
          user_action: 'AI analysis is temporarily unavailable. Your document has been saved and will be processed when service resumes.',
          fallback_available: false,
          retry_after: 300
        }
      };
    }

    // Generic technical error
    return {
      success: false,
      error: {
        code: 'BEDROCK_PROCESSING_FAILED',
        message: 'AI analysis could not be completed at this time.',
        category: 'technical',
        recovery_strategy: 'retry',
        user_action: 'Please try again. If the problem persists, contact support.'
      }
    };
  }

  /**
   * Track usage metrics for cost monitoring
   */
  async trackUsage(promptType, tokenUsage, responseTime, metadata) {
    try {
      const costCents = this.calculateCostCents(tokenUsage);
      
      // Update internal metrics
      this.metrics.totalRequests++;
      this.metrics.totalTokensUsed += tokenUsage.input_tokens + tokenUsage.output_tokens;
      this.metrics.totalCostCents += costCents;
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime + responseTime) / this.metrics.totalRequests;

      // Log for external cost tracking
      medicalPromptsService.logPromptUsage(promptType, 
        medicalPromptsService.getCurrentVersion(promptType), {
          responseTime,
          tokenUsage,
          confidenceScore: metadata.confidenceScore,
          userId: metadata.userId,
          documentType: metadata.fileType
        });

      // Send to CloudWatch (would be implemented in production)
      this.logger.businessEvent('bedrock_usage_tracked', {
        promptType,
        tokenUsage,
        costCents,
        responseTimeMs: responseTime
      });

    } catch (error) {
      this.logger.error('Error tracking usage metrics:', error);
    }
  }

  /**
   * Calculate cost in cents based on token usage
   * Claude Haiku pricing: $0.25 per 1M input tokens, $1.25 per 1M output tokens
   */
  calculateCostCents(tokenUsage) {
    const inputCostCents = (tokenUsage.input_tokens / 1000000) * 25; // $0.25 per 1M
    const outputCostCents = (tokenUsage.output_tokens / 1000000) * 125; // $1.25 per 1M
    return Math.round((inputCostCents + outputCostCents) * 100) / 100;
  }

  /**
   * Get current service metrics
   */
  getMetrics() {
    const cbMetrics = this.circuitBreaker.getMetrics();
    return {
      ...this.metrics,
      circuitBreaker: {
        state: cbMetrics.state,
        failures: cbMetrics.failedRequests || this.circuitBreaker.failureCount
      }
    };
  }

  // Helper methods
  formatAnalysisForReport(analysisData) {
    return `Medical Analysis Data:
${JSON.stringify(analysisData, null, 2)}

Please generate a comprehensive medical report based on this analysis.`;
  }

  formatQuestionWithContext(question, documentContext) {
    return `Document Context:
${documentContext ? JSON.stringify(documentContext, null, 2) : 'No previous analysis available'}

Patient Question:
${question}

Please provide a helpful response based on the medical context.`;
  }

  createStructuredResponse(textContent, promptType) {
    // Fallback structured response when Claude doesn't return JSON
    return {
      document_validation: {
        is_medical_document: true,
        document_type: 'general_medical',
        validation_confidence: 0.7
      },
      [`${promptType}_content`]: textContent,
      metadata: {
        processing_timestamp: new Date().toISOString(),
        response_format: 'text_fallback'
      }
    };
  }

  enrichBedrockError(error, responseTime) {
    error.bedrockMetadata = {
      responseTime,
      timestamp: new Date().toISOString(),
      service: 'bedrock'
    };
    return error;
  }

  async logAnalysisAudit(eventSubtype, userId, eventDetails) {
    try {
      await auditService.logAuditEvent({
        eventType: 'ai_processing',
        eventSubtype: eventSubtype,
        userId: userId,
        eventDetails: eventDetails,
        dataClassification: 'medical_phi'
      });
    } catch (error) {
      this.logger.error('Failed to log audit event:', error);
    }
  }

  sanitizeError(error) {
    return {
      name: error.name,
      message: error.message,
      code: error.code || 'UNKNOWN'
    };
  }

  /**
   * Format health data for AI report generation
   */
  formatHealthDataForReport(healthData, metadata) {
    const reportContext = {
      report_type: metadata.reportType || 'health_summary',
      include_recommendations: metadata.includeRecommendations !== false,
      data_points_count: metadata.dataPointsCount || 0,
      export_summary: healthData.export_summary
    };

    return `Health Data Analysis Request:

Report Configuration:
${JSON.stringify(reportContext, null, 2)}

Vitals Data (${healthData.export_summary?.vitals_count || 0} records):
${JSON.stringify(healthData.vitals_data || [], null, 2)}

Lab Results Data (${healthData.export_summary?.lab_results_count || 0} records):
${JSON.stringify(healthData.lab_results_data || [], null, 2)}

Please generate a comprehensive health report based on this data. Focus on trends, patterns, and clinically significant findings. Include actionable recommendations if requested.`;
  }

  /**
   * Calculate confidence score for health data reports
   */
  calculateHealthDataConfidence(healthData, dataPointsCount) {
    try {
      const vitalsCount = healthData.export_summary?.vitals_count || 0;
      const labResultsCount = healthData.export_summary?.lab_results_count || 0;
      const totalPoints = vitalsCount + labResultsCount;

      // Base confidence on data quantity and variety
      let confidence = 5; // Start with moderate confidence

      // Boost confidence based on data quantity
      if (totalPoints >= 20) confidence += 2;
      else if (totalPoints >= 10) confidence += 1;

      // Boost confidence based on data variety (both vitals and labs)
      if (vitalsCount > 0 && labResultsCount > 0) confidence += 1;

      // Boost confidence based on recent data
      const recentDataBonus = this.calculateRecentDataBonus(healthData);
      confidence += recentDataBonus;

      // Cap at maximum confidence of 10
      return Math.min(confidence, 10);
    } catch (error) {
      console.error('Error calculating health data confidence:', error);
      return 6; // Default moderate confidence
    }
  }

  /**
   * Calculate bonus confidence for recent data
   */
  calculateRecentDataBonus(healthData) {
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const recentVitals = (healthData.vitals_data || []).filter(vital => 
        new Date(vital.recorded_at) >= sixMonthsAgo
      ).length;

      const recentLabs = (healthData.lab_results_data || []).filter(lab => 
        new Date(lab.collected_at || lab.reported_at) >= sixMonthsAgo
      ).length;

      const recentTotal = recentVitals + recentLabs;

      if (recentTotal >= 10) return 2;
      if (recentTotal >= 5) return 1;
      return 0;
    } catch (error) {
      console.error('Error calculating recent data bonus:', error);
      return 0;
    }
  }
}

// Export singleton instance
const bedrockService = new BedrockService();

module.exports = {
  BedrockService,
  bedrockService
};