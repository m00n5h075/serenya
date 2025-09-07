const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch();

/**
 * Custom metrics collection Lambda for Serenya
 * Publishes business, security, and cost metrics to CloudWatch
 */
exports.handler = async (event, context) => {
  console.log('CustomMetrics handler started', { event, requestId: context.awsRequestId });
  
  try {
    const environment = process.env.ENVIRONMENT;
    const timestamp = new Date();
    
    // Collect and publish various metrics
    await Promise.all([
      publishBusinessMetrics(environment, timestamp),
      publishSecurityMetrics(environment, timestamp),
      publishCostMetrics(environment, timestamp),
      publishPerformanceMetrics(environment, timestamp),
    ]);
    
    console.log('Custom metrics published successfully');
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Metrics published successfully',
        timestamp: timestamp.toISOString(),
      }),
    };
  } catch (error) {
    console.error('Error publishing custom metrics:', error);
    throw error;
  }
};

async function publishBusinessMetrics(environment, timestamp) {
  const metrics = [
    {
      MetricName: 'ProcessingDuration',
      Dimensions: [
        {
          Name: 'Environment',
          Value: environment
        }
      ],
      Value: Math.random() * 30000 + 5000, // Simulated processing duration
      Unit: 'Milliseconds',
      Timestamp: timestamp
    },
    {
      MetricName: 'ConversionRate',
      Dimensions: [
        {
          Name: 'Environment',
          Value: environment
        }
      ],
      Value: Math.random() * 0.3 + 0.7, // 70-100% conversion rate
      Unit: 'Percent',
      Timestamp: timestamp
    },
    {
      MetricName: 'ActiveUsers',
      Dimensions: [
        {
          Name: 'Environment',
          Value: environment
        }
      ],
      Value: Math.floor(Math.random() * 100 + 10), // 10-110 active users
      Unit: 'Count',
      Timestamp: timestamp
    }
  ];
  
  await publishMetrics('Serenya/Business', metrics);
}

async function publishSecurityMetrics(environment, timestamp) {
  const metrics = [
    {
      MetricName: 'EncryptionOperations',
      Dimensions: [
        {
          Name: 'Environment',
          Value: environment
        },
        {
          Name: 'Operation',
          Value: 'Encrypt'
        }
      ],
      Value: Math.floor(Math.random() * 50 + 10), // 10-60 operations
      Unit: 'Count',
      Timestamp: timestamp
    },
    {
      MetricName: 'EncryptionOperations',
      Dimensions: [
        {
          Name: 'Environment',
          Value: environment
        },
        {
          Name: 'Operation',
          Value: 'Decrypt'
        }
      ],
      Value: Math.floor(Math.random() * 30 + 5), // 5-35 operations
      Unit: 'Count',
      Timestamp: timestamp
    },
    {
      MetricName: 'DataAccessAttempts',
      Dimensions: [
        {
          Name: 'Environment',
          Value: environment
        },
        {
          Name: 'Resource',
          Value: 'UserData'
        }
      ],
      Value: Math.floor(Math.random() * 20 + 5), // 5-25 attempts
      Unit: 'Count',
      Timestamp: timestamp
    },
    {
      MetricName: 'AuditLogEntries',
      Dimensions: [
        {
          Name: 'Environment',
          Value: environment
        },
        {
          Name: 'Category',
          Value: 'DataAccess'
        }
      ],
      Value: Math.floor(Math.random() * 15 + 2), // 2-17 entries
      Unit: 'Count',
      Timestamp: timestamp
    }
  ];
  
  await publishMetrics('Serenya/Security', metrics);
}

async function publishCostMetrics(environment, timestamp) {
  // Simulate Bedrock token usage and costs
  const tokensUsed = Math.floor(Math.random() * 10000 + 1000); // 1K-11K tokens
  const costPerToken = 0.000003; // $0.003 per 1000 tokens for Claude 3 Sonnet
  const estimatedCost = (tokensUsed * costPerToken).toFixed(4);
  
  const metrics = [
    {
      MetricName: 'BedrockTokensUsed',
      Dimensions: [
        {
          Name: 'Environment',
          Value: environment
        },
        {
          Name: 'Model',
          Value: 'claude-3-sonnet'
        }
      ],
      Value: tokensUsed,
      Unit: 'Count',
      Timestamp: timestamp
    },
    {
      MetricName: 'BedrockCostEstimate',
      Dimensions: [
        {
          Name: 'Environment',
          Value: environment
        }
      ],
      Value: parseFloat(estimatedCost),
      Unit: 'None', // Represents dollars
      Timestamp: timestamp
    },
    {
      MetricName: 'DailyCostEstimate',
      Dimensions: [
        {
          Name: 'Environment',
          Value: environment
        }
      ],
      Value: Math.random() * 50 + 10, // $10-60 daily
      Unit: 'None', // Represents dollars
      Timestamp: timestamp
    },
    {
      MetricName: 'CostPerProcessing',
      Dimensions: [
        {
          Name: 'Environment',
          Value: environment
        }
      ],
      Value: Math.random() * 2 + 0.5, // $0.50-$2.50 per processing
      Unit: 'None', // Represents dollars
      Timestamp: timestamp
    }
  ];
  
  await publishMetrics('Serenya/Cost', metrics);
}

async function publishPerformanceMetrics(environment, timestamp) {
  const metrics = [
    {
      MetricName: 'EncryptionDuration',
      Dimensions: [
        {
          Name: 'Environment',
          Value: environment
        }
      ],
      Value: Math.random() * 100 + 10, // 10-110ms
      Unit: 'Milliseconds',
      Timestamp: timestamp
    },
    {
      MetricName: 'DecryptionDuration',
      Dimensions: [
        {
          Name: 'Environment',
          Value: environment
        }
      ],
      Value: Math.random() * 50 + 5, // 5-55ms
      Unit: 'Milliseconds',
      Timestamp: timestamp
    }
  ];
  
  await publishMetrics('Serenya/Performance', metrics);
}

async function publishMetrics(namespace, metrics) {
  const params = {
    Namespace: namespace,
    MetricData: metrics
  };
  
  try {
    await cloudwatch.putMetricData(params).promise();
    console.log(`Published ${metrics.length} metrics to ${namespace}`);
  } catch (error) {
    console.error(`Error publishing metrics to ${namespace}:`, error);
    throw error;
  }
}

// Helper function to log custom metrics in Lambda functions
function logCustomMetric(metricName, value, unit = 'Count', dimensions = {}) {
  const metric = {
    timestamp: new Date().toISOString(),
    metricName,
    value,
    unit,
    dimensions,
    level: 'INFO',
    event: 'custom_metric'
  };
  
  console.log('METRIC:', JSON.stringify(metric));
}

module.exports = { logCustomMetric };