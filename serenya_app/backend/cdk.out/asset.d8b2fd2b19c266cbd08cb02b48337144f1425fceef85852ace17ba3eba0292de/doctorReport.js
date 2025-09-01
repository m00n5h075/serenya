const AWS = require('aws-sdk');
const Anthropic = require('@anthropic-ai/sdk');
const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  getJobRecord,
  auditLog,
  sanitizeError,
  getSecrets,
  dynamodb,
} = require('../shared/utils');

/**
 * Premium Doctor Report Generation
 * POST /api/v1/process/doctor-report
 */
exports.handler = async (event) => {
  try {
    const userId = getUserIdFromEvent(event);

    if (!userId) {
      return createErrorResponse(401, 'Invalid or missing authentication');
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    const { document_id, report_type = 'medical_summary' } = body;

    if (!document_id) {
      return createErrorResponse(400, 'Missing document_id');
    }

    auditLog('doctor_report_request', userId, { documentId: document_id, reportType: report_type });

    // For this implementation, we'll use job_id instead of document_id
    // since we don't have a separate documents table
    const jobId = document_id;
    
    // Get job record
    const jobRecord = await getJobRecord(jobId);
    
    if (!jobRecord) {
      auditLog('doctor_report_job_not_found', userId, { jobId });
      return createErrorResponse(404, 'Document not found');
    }

    // Verify user owns this job
    if (jobRecord.userId !== userId) {
      auditLog('doctor_report_unauthorized', userId, { jobId, actualUserId: jobRecord.userId });
      return createErrorResponse(403, 'Unauthorized access to document');
    }

    // Check if processing is complete
    if (jobRecord.status !== 'completed') {
      return createErrorResponse(400, 'Document processing not complete');
    }

    // Check user's premium status (placeholder for future subscription system)
    const isPremiumUser = await checkPremiumStatus(userId);
    if (!isPremiumUser) {
      return createErrorResponse(403, 'Premium subscription required for doctor reports');
    }

    // Generate comprehensive medical report
    const medicalReport = await generateMedicalReport(jobRecord, report_type);

    // Store report generation record for billing/tracking
    await storeReportRecord(userId, jobId, report_type);

    auditLog('doctor_report_generated', userId, { 
      jobId, 
      reportType: report_type,
      reportLength: medicalReport.content.length 
    });

    return createResponse(200, {
      success: true,
      report: medicalReport,
      generated_at: new Date().toISOString(),
      document_info: {
        job_id: jobId,
        original_filename: jobRecord.originalFileName,
        processed_at: new Date(jobRecord.completedAt).toISOString(),
        confidence_score: jobRecord.confidenceScore,
      },
    });

  } catch (error) {
    console.error('Doctor report error:', sanitizeError(error));
    
    const userId = getUserIdFromEvent(event) || 'unknown';
    auditLog('doctor_report_error', userId, { 
      error: sanitizeError(error).substring(0, 100) 
    });
    
    return createErrorResponse(500, 'Failed to generate doctor report');
  }
};

/**
 * Generate comprehensive medical report for healthcare providers
 */
async function generateMedicalReport(jobRecord, reportType) {
  try {
    const secrets = await getSecrets();
    const anthropic = new Anthropic({
      apiKey: secrets.anthropicApiKey,
    });

    const systemPrompt = `You are a medical AI assistant creating a comprehensive report for healthcare providers. Generate a professional medical report based on the patient's uploaded document and AI interpretation.

REPORT REQUIREMENTS:
1. Professional medical language appropriate for healthcare providers
2. Comprehensive analysis with clinical context
3. Clear recommendations for follow-up care
4. Risk stratification if applicable
5. Reference ranges and normal values where relevant
6. Differential diagnosis considerations if appropriate

FORMAT: Generate a structured medical report in professional format.`;

    const userPrompt = `Generate a comprehensive medical report for a healthcare provider based on this interpretation:

Original Document: ${jobRecord.originalFileName}
File Type: ${jobRecord.fileType}
Processing Date: ${new Date(jobRecord.completedAt).toISOString()}
AI Confidence Score: ${jobRecord.confidenceScore}/10

Previous AI Interpretation:
${jobRecord.detailedInterpretation}

Medical Flags: ${(jobRecord.medicalFlags || []).join(', ')}

Please create a professional medical report that a healthcare provider can use for clinical decision-making.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 3000,
      temperature: 0.2, // Lower temperature for professional reports
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    const reportContent = message.content[0].text;

    return {
      type: reportType,
      format: 'text',
      content: reportContent,
      metadata: {
        ai_model: 'claude-3-sonnet',
        confidence_score: jobRecord.confidenceScore,
        medical_flags: jobRecord.medicalFlags || [],
        generation_timestamp: new Date().toISOString(),
        source_document: jobRecord.originalFileName,
      },
      disclaimers: [
        'This report was generated by AI and should be reviewed by qualified medical professionals.',
        'Clinical correlation is recommended for all findings.',
        'This report supplements but does not replace clinical judgment.',
      ],
    };

  } catch (error) {
    console.error('Medical report generation error:', sanitizeError(error));
    throw new Error('Failed to generate medical report');
  }
}

/**
 * Check premium subscription status (placeholder)
 */
async function checkPremiumStatus(userId) {
  try {
    // For now, allow all users to generate reports
    // In production, this would check subscription status
    
    // Placeholder logic: check if user has generated reports before
    const reportCount = await getUserReportCount(userId);
    
    // Allow 1 free report per user, then require premium
    return reportCount === 0; // First report is free
    
  } catch (error) {
    console.error('Premium status check error:', error);
    return false;
  }
}

/**
 * Get user's report generation count
 */
async function getUserReportCount(userId) {
  try {
    const result = await dynamodb.query({
      TableName: process.env.JOBS_TABLE_NAME,
      IndexName: 'UserJobsIndex',
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'attribute_exists(reportGeneratedAt)',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      Select: 'COUNT',
    }).promise();

    return result.Count || 0;
  } catch (error) {
    console.error('Error getting report count:', error);
    return 0;
  }
}

/**
 * Store report generation record for billing/tracking
 */
async function storeReportRecord(userId, jobId, reportType) {
  try {
    await updateJobStatus(jobId, 'completed', {
      reportGeneratedAt: Date.now(),
      reportType: reportType,
    });

    // You could also store in a separate reports table for detailed tracking
    console.log(`Report generated for user ${userId}, job ${jobId}, type ${reportType}`);
  } catch (error) {
    console.error('Error storing report record:', error);
    // Don't throw - report was generated successfully
  }
}

/**
 * Format report for different output types
 */
function formatReport(content, format = 'text') {
  switch (format) {
    case 'pdf':
      // Future: Generate PDF using puppeteer or similar
      return {
        type: 'application/pdf',
        content: Buffer.from(content, 'utf8').toString('base64'),
        encoding: 'base64',
      };
    case 'html':
      return {
        type: 'text/html',
        content: `
          <html>
            <head>
              <title>Medical Report - Serenya Health</title>
              <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                .header { border-bottom: 2px solid #333; padding-bottom: 20px; }
                .content { margin-top: 20px; line-height: 1.6; }
                .disclaimer { margin-top: 30px; padding: 15px; background: #f5f5f5; border-left: 4px solid #ff6b6b; }
              </style>
            </head>
            <body>
              <div class="header">
                <h1>Medical Report</h1>
                <p>Generated by Serenya AI Health Agent</p>
                <p>Date: ${new Date().toLocaleDateString()}</p>
              </div>
              <div class="content">
                ${content.replace(/\n/g, '<br>')}
              </div>
              <div class="disclaimer">
                <h3>Important Disclaimer</h3>
                <p>This report was generated by AI and should be reviewed by qualified medical professionals. Clinical correlation is recommended for all findings.</p>
              </div>
            </body>
          </html>
        `,
        encoding: 'utf8',
      };
    default:
      return {
        type: 'text/plain',
        content: content,
        encoding: 'utf8',
      };
  }
}