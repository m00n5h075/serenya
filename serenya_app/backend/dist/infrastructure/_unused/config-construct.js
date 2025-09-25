"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const events = __importStar(require("aws-cdk-lib/aws-events"));
const targets = __importStar(require("aws-cdk-lib/aws-events-targets"));
const path = __importStar(require("path"));
const constructs_1 = require("constructs");
class ConfigConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
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
            this.configRole.grantAssumeRole(func.role);
        });
        // Create feature flags and configuration
        this.createFeatureFlags(environment);
        // Create cost optimization schedules
        this.createCostOptimization(environment);
    }
    createParameters(environment, region) {
        const parameters = {};
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
    createFeatureFlags(environment) {
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
    createCostOptimization(environment) {
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
    createConfigLoader() {
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
exports.ConfigConstruct = ConfigConstruct;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL2luZnJhc3RydWN0dXJlL191bnVzZWQvY29uZmlnLWNvbnN0cnVjdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQywrREFBaUQ7QUFDakQsK0RBQWlEO0FBQ2pELHdFQUEwRDtBQUMxRCwyQ0FBNkI7QUFDN0IsMkNBQXVDO0FBUXZDLE1BQWEsZUFBZ0IsU0FBUSxzQkFBUztJQUs1QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTJCO1FBQ25FLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRXZELHNDQUFzQztRQUN0QyxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ2pELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsQ0FBQztZQUMzRCxlQUFlLEVBQUU7Z0JBQ2YsR0FBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQywwQ0FBMEMsQ0FBQzthQUN2RjtZQUNELGNBQWMsRUFBRTtnQkFDZCxvQkFBb0IsRUFBRSxJQUFJLEdBQUcsQ0FBQyxjQUFjLENBQUM7b0JBQzNDLFVBQVUsRUFBRTt3QkFDVixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7NEJBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7NEJBQ3hCLE9BQU8sRUFBRTtnQ0FDUCxrQkFBa0I7Z0NBQ2xCLG1CQUFtQjtnQ0FDbkIseUJBQXlCO2dDQUN6QixrQkFBa0I7NkJBQ25COzRCQUNELFNB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O1lBQ3RFLElBQUksRUFBRSxJQUFJLENBQUMsVUFBVTtZQUNyQixXQUFXLEVBQUU7Z0JBQ1gsZ0JBQWdCLEVBQUUsWUFBWSxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsSUFBSSxLQUFLLEVBQUU7YUFDakU7WUFDRCxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ2pDLFVBQVUsRUFBRSxHQUFHO1lBQ2YsV0FBVyxFQUFFLHlEQUF5RDtTQUN2RSxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF2UkQsMENBdVJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIHNzbSBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3NtJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzJztcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cy10YXJnZXRzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuaW50ZXJmYWNlIENvbmZpZ0NvbnN0cnVjdFByb3BzIHtcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcbiAgcmVnaW9uOiBzdHJpbmc7XG4gIGxhbWJkYUZ1bmN0aW9uczogUmVjb3JkPHN0cmluZywgbGFtYmRhLkZ1bmN0aW9uPjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpZ0NvbnN0cnVjdCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBjb25maWdSb2xlOiBpYW0uUm9sZTtcbiAgcHVibGljIHJlYWRvbmx5IHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHNzbS5TdHJpbmdQYXJhbWV0ZXI+O1xuICBwdWJsaWMgcmVhZG9ubHkgY29zdFRyYWNraW5nRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQ29uZmlnQ29uc3RydWN0UHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgeyBlbnZpcm9ubWVudCwgcmVnaW9uLCBsYW1iZGFGdW5jdGlvbnMgfSA9IHByb3BzO1xuXG4gICAgLy8gSUFNIHJvbGUgZm9yIFBhcmFtZXRlciBTdG9yZSBhY2Nlc3NcbiAgICB0aGlzLmNvbmZpZ1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0NvbmZpZ1JvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgIF0sXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBQYXJhbWV0ZXJTdG9yZVBvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnc3NtOkdldFBhcmFtZXRlcicsXG4gICAgICAgICAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXJzJyxcbiAgICAgICAgICAgICAgICAnc3NtOkdldFBhcmFtZXRlcnNCeVBhdGgnLFxuICAgICAgICAgICAgICAgICdzc206UHV0UGFyYW1ldGVyJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgYGFybjphd3M6c3NtOiR7cmVnaW9ufToke2Nkay5Bd3MuQUNDT1VOVF9JRH06cGFyYW1ldGVyL3NlcmVueWEvJHtlbnZpcm9ubWVudH0vKmAsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2Nsb3Vkd2F0Y2g6UHV0TWV0cmljRGF0YScsXG4gICAgICAgICAgICAgICAgJ2NlOkdldENvc3RBbmRVc2FnZScsXG4gICAgICAgICAgICAgICAgJ2NlOkdldFVzYWdlUmVwb3J0JyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBhcHBsaWNhdGlvbiBjb25maWd1cmF0aW9uIHBhcmFtZXRlcnNcbiAgICB0aGlzLnBhcmFtZXRlcnMgPSB0aGlzLmNyZWF0ZVBhcmFtZXRlcnMoZW52aXJvbm1lbnQsIHJlZ2lvbik7XG5cbiAgICAvLyBDb3N0IHRyYWNraW5nIExhbWJkYSBmdW5jdGlvblxuICAgIHRoaXMuY29zdFRyYWNraW5nRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdDb3N0VHJhY2tpbmdGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2Nvc3RUcmFja2luZy5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy9jb3N0LXRyYWNraW5nJykpLFxuICAgICAgcm9sZTogdGhpcy5jb25maWdSb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgRU5WSVJPTk1FTlQ6IGVudmlyb25tZW50LFxuICAgICAgICBSRUdJT046IHJlZ2lvbixcbiAgICAgICAgUEFSQU1FVEVSX1BSRUZJWDogYC9zZXJlbnlhLyR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29zdCB0cmFja2luZyBhbmQgb3B0aW1pemF0aW9uIGZvciBTZXJlbnlhJyxcbiAgICB9KTtcblxuICAgIC8vIFNjaGVkdWxlIGNvc3QgdHJhY2tpbmcgdG8gcnVuIGhvdXJseVxuICAgIGNvbnN0IGNvc3RUcmFja2luZ1J1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgJ0Nvc3RUcmFja2luZ1NjaGVkdWxlJywge1xuICAgICAgc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5yYXRlKGNkay5EdXJhdGlvbi5ob3VycygxKSksXG4gICAgICBkZXNjcmlwdGlvbjogJ1RyaWdnZXIgY29zdCB0cmFja2luZyBldmVyeSBob3VyJyxcbiAgICB9KTtcblxuICAgIGNvc3RUcmFja2luZ1J1bGUuYWRkVGFyZ2V0KG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKHRoaXMuY29zdFRyYWNraW5nRnVuY3Rpb24pKTtcblxuICAgIC8vIEdyYW50IFBhcmFtZXRlciBTdG9yZSBhY2Nlc3MgdG8gYWxsIExhbWJkYSBmdW5jdGlvbnNcbiAgICBPYmplY3QudmFsdWVzKGxhbWJkYUZ1bmN0aW9ucykuZm9yRWFjaChmdW5jID0+IHtcbiAgICAgIHRoaXMuY29uZmlnUm9sZS5ncmFudEFzc3VtZVJvbGUoZnVuYy5yb2xlISk7XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgZmVhdHVyZSBmbGFncyBhbmQgY29uZmlndXJhdGlvblxuICAgIHRoaXMuY3JlYXRlRmVhdHVyZUZsYWdzKGVudmlyb25tZW50KTtcblxuICAgIC8vIENyZWF0ZSBjb3N0IG9wdGltaXphdGlvbiBzY2hlZHVsZXNcbiAgICB0aGlzLmNyZWF0ZUNvc3RPcHRpbWl6YXRpb24oZW52aXJvbm1lbnQpO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVQYXJhbWV0ZXJzKGVudmlyb25tZW50OiBzdHJpbmcsIHJlZ2lvbjogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgc3NtLlN0cmluZ1BhcmFtZXRlcj4ge1xuICAgIGNvbnN0IHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHNzbS5TdHJpbmdQYXJhbWV0ZXI+ID0ge307XG5cbiAgICAvLyBSYXRlIGxpbWl0aW5nIGNvbmZpZ3VyYXRpb25cbiAgICBwYXJhbWV0ZXJzLnJhdGVMaW1pdEF1dGhlbnRpY2F0ZWRVc2VycyA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdSYXRlTGltaXRBdXRoZW50aWNhdGVkJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9zZXJlbnlhLyR7ZW52aXJvbm1lbnR9L3JhdGUtbGltaXRzL2F1dGhlbnRpY2F0ZWQtdXNlcnNgLFxuICAgICAgc3RyaW5nVmFsdWU6ICcyMDAnLCAvLyByZXF1ZXN0cyBwZXIgaG91clxuICAgICAgZGVzY3JpcHRpb246ICdSYXRlIGxpbWl0IGZvciBhdXRoZW50aWNhdGVkIHVzZXJzIChyZXF1ZXN0cyBwZXIgaG91ciknLFxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgfSk7XG5cbiAgICBwYXJhbWV0ZXJzLnJhdGVMaW1pdEFub255bW91c1VzZXJzID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1JhdGVMaW1pdEFub255bW91cycsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvc2VyZW55YS8ke2Vudmlyb25tZW50fS9yYXRlLWxpbWl0cy9hbm9ueW1vdXMtdXNlcnNgLFxuICAgICAgc3RyaW5nVmFsdWU6ICcyMCcsIC8vIHJlcXVlc3RzIHBlciBob3VyXG4gICAgICBkZXNjcmlwdGlvbjogJ1JhdGUgbGltaXQgZm9yIGFub255bW91cyB1c2VycyAocmVxdWVzdHMgcGVyIGhvdXIpJyxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuXG4gICAgLy8gUHJvY2Vzc2luZyBjb25maWd1cmF0aW9uXG4gICAgcGFyYW1ldGVycy5tYXhGaWxlU2l6ZSA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdNYXhGaWxlU2l6ZScsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvc2VyZW55YS8ke2Vudmlyb25tZW50fS9wcm9jZXNzaW5nL21heC1maWxlLXNpemVgLFxuICAgICAgc3RyaW5nVmFsdWU6ICcxMDQ4NTc2MCcsIC8vIDEwTUIgaW4gYnl0ZXNcbiAgICAgIGRlc2NyaXB0aW9uOiAnTWF4aW11bSBmaWxlIHNpemUgZm9yIHVwbG9hZHMgKGJ5dGVzKScsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIHBhcmFtZXRlcnMucHJvY2Vzc2luZ1RpbWVvdXQgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnUHJvY2Vzc2luZ1RpbWVvdXQnLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL3NlcmVueWEvJHtlbnZpcm9ubWVudH0vcHJvY2Vzc2luZy90aW1lb3V0YCxcbiAgICAgIHN0cmluZ1ZhbHVlOiAnMTgwJywgLy8gMyBtaW51dGVzIGluIHNlY29uZHNcbiAgICAgIGRlc2NyaXB0aW9uOiAnTWF4aW11bSBwcm9jZXNzaW5nIHRpbWVvdXQgKHNlY29uZHMpJyxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuXG4gICAgLy8gQmVkcm9jayBjb25maWd1cmF0aW9uXG4gICAgcGFyYW1ldGVycy5iZWRyb2NrTW9kZWwgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnQmVkcm9ja01vZGVsJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9zZXJlbnlhLyR7ZW52aXJvbm1lbnR9L2JlZHJvY2svZGVmYXVsdC1tb2RlbGAsXG4gICAgICBzdHJpbmdWYWx1ZTogJ2FudGhyb3BpYy5jbGF1ZGUtMy1zb25uZXQtMjAyNDAyMjktdjE6MCcsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RlZmF1bHQgQmVkcm9jayBtb2RlbCBmb3IgcHJvY2Vzc2luZycsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIHBhcmFtZXRlcnMuYmVkcm9ja01heFRva2VucyA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdCZWRyb2NrTWF4VG9rZW5zJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9zZXJlbnlhLyR7ZW52aXJvbm1lbnR9L2JlZHJvY2svbWF4LXRva2Vuc2AsXG4gICAgICBzdHJpbmdWYWx1ZTogJzQwMDAnLFxuICAgICAgZGVzY3JpcHRpb246ICdNYXhpbXVtIHRva2VucyBmb3IgQmVkcm9jayByZXF1ZXN0cycsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIHBhcmFtZXRlcnMuYmVkcm9ja1RlbXBlcmF0dXJlID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0JlZHJvY2tUZW1wZXJhdHVyZScsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvc2VyZW55YS8ke2Vudmlyb25tZW50fS9iZWRyb2NrL3RlbXBlcmF0dXJlYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiAnMC4xJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGVtcGVyYXR1cmUgc2V0dGluZyBmb3IgQmVkcm9jayBtb2RlbCcsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIC8vIFNlY3VyaXR5IGNvbmZpZ3VyYXRpb25cbiAgICBwYXJhbWV0ZXJzLmp3dEV4cGlyeUhvdXJzID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0p3dEV4cGlyeUhvdXJzJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9zZXJlbnlhLyR7ZW52aXJvbm1lbnR9L3NlY3VyaXR5L2p3dC1leHBpcnktaG91cnNgLFxuICAgICAgc3RyaW5nVmFsdWU6ICcyNCcsXG4gICAgICBkZXNjcmlwdGlvbjogJ0pXVCB0b2tlbiBleHBpcnkgaW4gaG91cnMnLFxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgfSk7XG5cbiAgICBwYXJhbWV0ZXJzLnNlc3Npb25FeHBpcnlEYXlzID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1Nlc3Npb25FeHBpcnlEYXlzJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9zZXJlbnlhLyR7ZW52aXJvbm1lbnR9L3NlY3VyaXR5L3Nlc3Npb24tZXhwaXJ5LWRheXNgLFxuICAgICAgc3RyaW5nVmFsdWU6ICc3JyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2Vzc2lvbiBleHBpcnkgaW4gZGF5cycsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIC8vIENvc3QgdGhyZXNob2xkc1xuICAgIHBhcmFtZXRlcnMuZGFpbHlDb3N0VGhyZXNob2xkID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0RhaWx5Q29zdFRocmVzaG9sZCcsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvc2VyZW55YS8ke2Vudmlyb25tZW50fS9jb3N0L2RhaWx5LXRocmVzaG9sZGAsXG4gICAgICBzdHJpbmdWYWx1ZTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/ICcxMDAnIDogJzUwJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGFpbHkgY29zdCB0aHJlc2hvbGQgZm9yIGFsZXJ0cyAoVVNEKScsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIHBhcmFtZXRlcnMubW9udGhseUNvc3RUaHJlc2hvbGQgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnTW9udGhseUNvc3RUaHJlc2hvbGQnLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL3NlcmVueWEvJHtlbnZpcm9ubWVudH0vY29zdC9tb250aGx5LXRocmVzaG9sZGAsXG4gICAgICBzdHJpbmdWYWx1ZTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/ICczMDAwJyA6ICcxNTAwJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTW9udGhseSBjb3N0IHRocmVzaG9sZCBmb3IgYWxlcnRzIChVU0QpJyxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHBhcmFtZXRlcnM7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUZlYXR1cmVGbGFncyhlbnZpcm9ubWVudDogc3RyaW5nKSB7XG4gICAgLy8gRmVhdHVyZSBmbGFncyBmb3IgZ3JhZHVhbCByb2xsb3V0XG4gICAgY29uc3QgZmVhdHVyZUZsYWdzID0gW1xuICAgICAge1xuICAgICAgICBuYW1lOiAnZW5oYW5jZWQtbG9nZ2luZycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRW5hYmxlIGVuaGFuY2VkIHN0cnVjdHVyZWQgbG9nZ2luZycsXG4gICAgICAgIGRlZmF1bHRWYWx1ZTogJ3RydWUnLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgbmFtZTogJ2NpcmN1aXQtYnJlYWtlcicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRW5hYmxlIGNpcmN1aXQgYnJlYWtlciBmb3IgZXh0ZXJuYWwgc2VydmljZXMnLFxuICAgICAgICBkZWZhdWx0VmFsdWU6ICd0cnVlJyxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdjb3N0LW9wdGltaXphdGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRW5hYmxlIGNvc3Qgb3B0aW1pemF0aW9uIGZlYXR1cmVzJyxcbiAgICAgICAgZGVmYXVsdFZhbHVlOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gJ3RydWUnIDogJ2ZhbHNlJyxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdiZWRyb2NrLXByaXZhdGUtZW5kcG9pbnQnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1VzZSBWUEMgZW5kcG9pbnQgZm9yIEJlZHJvY2sgY2FsbHMnLFxuICAgICAgICBkZWZhdWx0VmFsdWU6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyAndHJ1ZScgOiAnZmFsc2UnLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgbmFtZTogJ2FkdmFuY2VkLXNlY3VyaXR5JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdFbmFibGUgYWR2YW5jZWQgc2VjdXJpdHkgZmVhdHVyZXMnLFxuICAgICAgICBkZWZhdWx0VmFsdWU6ICd0cnVlJyxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdwcmVtaXVtLWZlYXR1cmVzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdFbmFibGUgcHJlbWl1bSBmZWF0dXJlcyAoZG9jdG9yIHJlcG9ydHMsIGV0Yy4pJyxcbiAgICAgICAgZGVmYXVsdFZhbHVlOiAndHJ1ZScsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBuYW1lOiAncGVyZm9ybWFuY2UtbW9uaXRvcmluZycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRW5hYmxlIGRldGFpbGVkIHBlcmZvcm1hbmNlIG1vbml0b3JpbmcnLFxuICAgICAgICBkZWZhdWx0VmFsdWU6ICd0cnVlJyxcbiAgICAgIH0sXG4gICAgXTtcblxuICAgIGZlYXR1cmVGbGFncy5mb3JFYWNoKGZsYWcgPT4ge1xuICAgICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgYEZlYXR1cmVGbGFnJHtmbGFnLm5hbWUucmVwbGFjZSgvLS9nLCAnJyl9YCwge1xuICAgICAgICBwYXJhbWV0ZXJOYW1lOiBgL3NlcmVueWEvJHtlbnZpcm9ubWVudH0vZmVhdHVyZXMvJHtmbGFnLm5hbWV9YCxcbiAgICAgICAgc3RyaW5nVmFsdWU6IGZsYWcuZGVmYXVsdFZhbHVlLFxuICAgICAgICBkZXNjcmlwdGlvbjogZmxhZy5kZXNjcmlwdGlvbixcbiAgICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlQ29zdE9wdGltaXphdGlvbihlbnZpcm9ubWVudDogc3RyaW5nKSB7XG4gICAgLy8gQ29zdCBvcHRpbWl6YXRpb24gcGFyYW1ldGVyc1xuICAgIGNvbnN0IGNvc3RPcHRpbWl6YXRpb25zID0gW1xuICAgICAge1xuICAgICAgICBuYW1lOiAnbGFtYmRhLW1lbW9yeS1vcHRpbWl6YXRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0F1dG9tYXRpY2FsbHkgb3B0aW1pemUgTGFtYmRhIG1lbW9yeSBiYXNlZCBvbiB1c2FnZScsXG4gICAgICAgIHZhbHVlOiAnZW5hYmxlZCcsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBuYW1lOiAncmRzLWF1dG8tc2NhbGluZycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRW5hYmxlIFJEUyBhdXRvLXNjYWxpbmcgZm9yIGNvc3Qgb3B0aW1pemF0aW9uJyxcbiAgICAgICAgdmFsdWU6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyAnZW5hYmxlZCcgOiAnZGlzYWJsZWQnLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgbmFtZTogJ3MzLWxpZmVjeWNsZS1vcHRpbWl6YXRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ09wdGltaXplIFMzIGxpZmVjeWNsZSBwb2xpY2llcyBmb3IgY29zdCcsXG4gICAgICAgIHZhbHVlOiAnZW5hYmxlZCcsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBuYW1lOiAnY2xvdWR3YXRjaC1sb2ctcmV0ZW50aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdPcHRpbWl6ZSBDbG91ZFdhdGNoIGxvZyByZXRlbnRpb24gcGVyaW9kcycsXG4gICAgICAgIHZhbHVlOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gJzMwJyA6ICc3JywgLy8gZGF5c1xuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgbmFtZTogJ2JlZHJvY2stbW9kZWwtc2VsZWN0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdBdXRvbWF0aWNhbGx5IHNlbGVjdCBjb3N0LW9wdGltYWwgQmVkcm9jayBtb2RlbCcsXG4gICAgICAgIHZhbHVlOiAnZW5hYmxlZCcsXG4gICAgICB9LFxuICAgIF07XG5cbiAgICBjb3N0T3B0aW1pemF0aW9ucy5mb3JFYWNoKG9wdGltaXphdGlvbiA9PiB7XG4gICAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCBgQ29zdE9wdGltaXphdGlvbiR7b3B0aW1pemF0aW9uLm5hbWUucmVwbGFjZSgvLS9nLCAnJyl9YCwge1xuICAgICAgICBwYXJhbWV0ZXJOYW1lOiBgL3NlcmVueWEvJHtlbnZpcm9ubWVudH0vY29zdC1vcHRpbWl6YXRpb24vJHtvcHRpbWl6YXRpb24ubmFtZX1gLFxuICAgICAgICBzdHJpbmdWYWx1ZTogb3B0aW1pemF0aW9uLnZhbHVlLFxuICAgICAgICBkZXNjcmlwdGlvbjogb3B0aW1pemF0aW9uLmRlc2NyaXB0aW9uLFxuICAgICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBjb25maWd1cmF0aW9uIGxvYWRlciB1dGlsaXR5IGZvciBMYW1iZGEgZnVuY3Rpb25zXG4gICAqL1xuICBjcmVhdGVDb25maWdMb2FkZXIoKTogbGFtYmRhLkZ1bmN0aW9uIHtcbiAgICByZXR1cm4gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQ29uZmlnTG9hZGVyRnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdjb25maWdMb2FkZXIuaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvY29uZmlnJykpLFxuICAgICAgcm9sZTogdGhpcy5jb25maWdSb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUEFSQU1FVEVSX1BSRUZJWDogYC9zZXJlbnlhLyR7cHJvY2Vzcy5lbnYuRU5WSVJPTk1FTlQgfHwgJ2Rldid9YCxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvbmZpZ3VyYXRpb24gbG9hZGVyIHV0aWxpdHkgZm9yIG90aGVyIExhbWJkYSBmdW5jdGlvbnMnLFxuICAgIH0pO1xuICB9XG59Il19