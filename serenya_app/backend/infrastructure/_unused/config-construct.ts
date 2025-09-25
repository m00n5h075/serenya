import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as path from 'path';
import { Construct } from 'constructs';

interface ConfigConstructProps {
  environment: string;
  region: string;
  lambdaFunctions: Record<string, lambda.Function>;
}

export class ConfigConstruct extends Construct {
  public readonly configRole: iam.Role;
  public readonly parameters: Record<string, ssm.StringParameter>;
  public readonly costTrackingFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ConfigConstructProps) {
    super(scope, id);

    const { environment, region, lambdaFunctions } = props;

    // IAM role for Parameter Store access
    this.configRole = new iam.Role(this, 'ConfigRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        ParameterStorePolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ssm:GetParameter',
                'ssm:GetParameters',
                'ssm:GetParametersByPath',
                'ssm:PutParameter',
              ],
              resources: [
                `arn:aws:ssm:${region}:${cdk.Aws.ACCOUNT_ID}:parameter/serenya/${environment}/*`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cloudwatch:PutMetricData',
                'ce:GetCostAndUsage',
                'ce:GetUsageReport',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // Create application configuration parameters
    this.parameters = this.createParameters(environment, region);

    // Cost tracking Lambda function
    this.costTrackingFunction = new lambda.Function(this, 'CostTrackingFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'costTracking.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/cost-tracking')),
      role: this.configRole,
      environment: {
        ENVIRONMENT: environment,
        REGION: region,
        PARAMETER_PREFIX: `/serenya/${environment}`,
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      description: 'Cost tracking and optimization for Serenya',
    });

    // Schedule cost tracking to run hourly
    const costTrackingRule = new events.Rule(this, 'CostTrackingSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
      description: 'Trigger cost tracking every hour',
    });

    costTrackingRule.addTarget(new targets.LambdaFunction(this.costTrackingFunction));

    // Grant Parameter Store access to all Lambda functions
    Object.values(lambdaFunctions).forEach(func => {
      this.configRole.grantAssumeRole(func.role!);
    });

    // Create feature flags and configuration
    this.createFeatureFlags(environment);

    // Create cost optimization schedules
    this.createCostOptimization(environment);
  }

  private createParameters(environment: string, region: string): Record<string, ssm.StringParameter> {
    const parameters: Record<string, ssm.StringParameter> = {};

    // Rate limiting configuration
    parameters.rateLimitAuthenticatedUsers = new ssm.StringParameter(this, 'RateLimitAuthenticated', {
      parameterName: `/serenya/${environment}/rate-limits/authenticated-users`,
      stringValue: '200', // requests per hour
      description: 'Rate limit for authenticated users (requests per hour)',
      tier: ssm.ParameterTier.STANDARD,
    });

    parameters.rateLimitAnonymousUsers = new ssm.StringParameter(this, 'RateLimitAnonymous', {
      parameterName: `/serenya/${environment}/rate-limits/anonymous-users`,
      stringValue: '20', // requests per hour
      description: 'Rate limit for anonymous users (requests per hour)',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Processing configuration
    parameters.maxFileSize = new ssm.StringParameter(this, 'MaxFileSize', {
      parameterName: `/serenya/${environment}/processing/max-file-size`,
      stringValue: '10485760', // 10MB in bytes
      description: 'Maximum file size for uploads (bytes)',
      tier: ssm.ParameterTier.STANDARD,
    });

    parameters.processingTimeout = new ssm.StringParameter(this, 'ProcessingTimeout', {
      parameterName: `/serenya/${environment}/processing/timeout`,
      stringValue: '180', // 3 minutes in seconds
      description: 'Maximum processing timeout (seconds)',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Bedrock configuration
    parameters.bedrockModel = new ssm.StringParameter(this, 'BedrockModel', {
      parameterName: `/serenya/${environment}/bedrock/default-model`,
      stringValue: 'anthropic.claude-3-sonnet-20240229-v1:0',
      description: 'Default Bedrock model for processing',
      tier: ssm.ParameterTier.STANDARD,
    });

    parameters.bedrockMaxTokens = new ssm.StringParameter(this, 'BedrockMaxTokens', {
      parameterName: `/serenya/${environment}/bedrock/max-tokens`,
      stringValue: '4000',
      description: 'Maximum tokens for Bedrock requests',
      tier: ssm.ParameterTier.STANDARD,
    });

    parameters.bedrockTemperature = new ssm.StringParameter(this, 'BedrockTemperature', {
      parameterName: `/serenya/${environment}/bedrock/temperature`,
      stringValue: '0.1',
      description: 'Temperature setting for Bedrock model',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Security configuration
    parameters.jwtExpiryHours = new ssm.StringParameter(this, 'JwtExpiryHours', {
      parameterName: `/serenya/${environment}/security/jwt-expiry-hours`,
      stringValue: '24',
      description: 'JWT token expiry in hours',
      tier: ssm.ParameterTier.STANDARD,
    });

    parameters.sessionExpiryDays = new ssm.StringParameter(this, 'SessionExpiryDays', {
      parameterName: `/serenya/${environment}/security/session-expiry-days`,
      stringValue: '7',
      description: 'Session expiry in days',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Cost thresholds
    parameters.dailyCostThreshold = new ssm.StringParameter(this, 'DailyCostThreshold', {
      parameterName: `/serenya/${environment}/cost/daily-threshold`,
      stringValue: environment === 'prod' ? '100' : '50',
      description: 'Daily cost threshold for alerts (USD)',
      tier: ssm.ParameterTier.STANDARD,
    });

    parameters.monthlyCostThreshold = new ssm.StringParameter(this, 'MonthlyCostThreshold', {
      parameterName: `/serenya/${environment}/cost/monthly-threshold`,
      stringValue: environment === 'prod' ? '3000' : '1500',
      description: 'Monthly cost threshold for alerts (USD)',
      tier: ssm.ParameterTier.STANDARD,
    });

    return parameters;
  }

  private createFeatureFlags(environment: string) {
    // Feature flags for gradual rollout
    const featureFlags = [
      {
        name: 'enhanced-logging',
        description: 'Enable enhanced structured logging',
        defaultValue: 'true',
      },
      {
        name: 'circuit-breaker',
        description: 'Enable circuit breaker for external services',
        defaultValue: 'true',
      },
      {
        name: 'cost-optimization',
        description: 'Enable cost optimization features',
        defaultValue: environment === 'prod' ? 'true' : 'false',
      },
      {
        name: 'bedrock-private-endpoint',
        description: 'Use VPC endpoint for Bedrock calls',
        defaultValue: environment === 'prod' ? 'true' : 'false',
      },
      {
        name: 'advanced-security',
        description: 'Enable advanced security features',
        defaultValue: 'true',
      },
      {
        name: 'premium-features',
        description: 'Enable premium features (doctor reports, etc.)',
        defaultValue: 'true',
      },
      {
        name: 'performance-monitoring',
        description: 'Enable detailed performance monitoring',
        defaultValue: 'true',
      },
    ];

    featureFlags.forEach(flag => {
      new ssm.StringParameter(this, `FeatureFlag${flag.name.replace(/-/g, '')}`, {
        parameterName: `/serenya/${environment}/features/${flag.name}`,
        stringValue: flag.defaultValue,
        description: flag.description,
        tier: ssm.ParameterTier.STANDARD,
      });
    });
  }

  private createCostOptimization(environment: string) {
    // Cost optimization parameters
    const costOptimizations = [
      {
        name: 'lambda-memory-optimization',
        description: 'Automatically optimize Lambda memory based on usage',
        value: 'enabled',
      },
      {
        name: 'rds-auto-scaling',
        description: 'Enable RDS auto-scaling for cost optimization',
        value: environment === 'prod' ? 'enabled' : 'disabled',
      },
      {
        name: 's3-lifecycle-optimization',
        description: 'Optimize S3 lifecycle policies for cost',
        value: 'enabled',
      },
      {
        name: 'cloudwatch-log-retention',
        description: 'Optimize CloudWatch log retention periods',
        value: environment === 'prod' ? '30' : '7', // days
      },
      {
        name: 'bedrock-model-selection',
        description: 'Automatically select cost-optimal Bedrock model',
        value: 'enabled',
      },
    ];

    costOptimizations.forEach(optimization => {
      new ssm.StringParameter(this, `CostOptimization${optimization.name.replace(/-/g, '')}`, {
        parameterName: `/serenya/${environment}/cost-optimization/${optimization.name}`,
        stringValue: optimization.value,
        description: optimization.description,
        tier: ssm.ParameterTier.STANDARD,
      });
    });
  }

  /**
   * Create configuration loader utility for Lambda functions
   */
  createConfigLoader(): lambda.Function {
    return new lambda.Function(this, 'ConfigLoaderFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'configLoader.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/config')),
      role: this.configRole,
      environment: {
        PARAMETER_PREFIX: `/serenya/${process.env.ENVIRONMENT || 'dev'}`,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      description: 'Configuration loader utility for other Lambda functions',
    });
  }
}