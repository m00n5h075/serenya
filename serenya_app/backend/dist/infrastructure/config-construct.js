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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2luZnJhc3RydWN0dXJlL2NvbmZpZy1jb25zdHJ1Y3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsK0RBQWlEO0FBQ2pELCtEQUFpRDtBQUNqRCx3RUFBMEQ7QUFDMUQsMkNBQTZCO0FBQzdCLDJDQUF1QztBQVF2QyxNQUFhLGVBQWdCLFNBQVEsc0JBQVM7SUFLNUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEyQjtRQUNuRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUV2RCxzQ0FBc0M7UUFDdEMsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNqRCxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsc0JBQXNCLENBQUM7WUFDM0QsZUFBZSxFQUFFO2dCQUNmLEdBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsMENBQTBDLENBQUM7YUFDdkY7WUFDRCxjQUFjLEVBQUU7Z0JBQ2Qsb0JBQW9CLEVBQUUsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDO29CQUMzQyxVQUFVLEVBQUU7d0JBQ1YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDOzRCQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLOzRCQUN4QixPQUFPLEVBQUU7Z0NBQ1Asa0JBQWtCO2dDQUNsQixtQkFBbUI7Z0NBQ25CLHlCQUF5QjtnQ0FDekIsa0JBQWtCOzZCQUNuQjs0QkFDRCxTQUFTLEVBQUU7Z0NB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LEVBQUUsSUFBSSxDQUFDLFVBQVU7WUFDckIsV0FBVyxFQUFFO2dCQUNYLGdCQUFnQixFQUFFLFlBQVksT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLElBQUksS0FBSyxFQUFFO2FBQ2pFO1lBQ0QsT0FBTyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxVQUFVLEVBQUUsR0FBRztZQUNmLFdBQVcsRUFBRSx5REFBeUQ7U0FDdkUsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBdlJELDBDQXVSQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNzbSc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBldmVudHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cyc7XG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMtdGFyZ2V0cyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmludGVyZmFjZSBDb25maWdDb25zdHJ1Y3RQcm9wcyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG4gIHJlZ2lvbjogc3RyaW5nO1xuICBsYW1iZGFGdW5jdGlvbnM6IFJlY29yZDxzdHJpbmcsIGxhbWJkYS5GdW5jdGlvbj47XG59XG5cbmV4cG9ydCBjbGFzcyBDb25maWdDb25zdHJ1Y3QgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgY29uZmlnUm9sZTogaWFtLlJvbGU7XG4gIHB1YmxpYyByZWFkb25seSBwYXJhbWV0ZXJzOiBSZWNvcmQ8c3RyaW5nLCBzc20uU3RyaW5nUGFyYW1ldGVyPjtcbiAgcHVibGljIHJlYWRvbmx5IGNvc3RUcmFja2luZ0Z1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IENvbmZpZ0NvbnN0cnVjdFByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQsIHJlZ2lvbiwgbGFtYmRhRnVuY3Rpb25zIH0gPSBwcm9wcztcblxuICAgIC8vIElBTSByb2xlIGZvciBQYXJhbWV0ZXIgU3RvcmUgYWNjZXNzXG4gICAgdGhpcy5jb25maWdSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdDb25maWdSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICBdLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgUGFyYW1ldGVyU3RvcmVQb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXInLFxuICAgICAgICAgICAgICAgICdzc206R2V0UGFyYW1ldGVycycsXG4gICAgICAgICAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXJzQnlQYXRoJyxcbiAgICAgICAgICAgICAgICAnc3NtOlB1dFBhcmFtZXRlcicsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIGBhcm46YXdzOnNzbToke3JlZ2lvbn06JHtjZGsuQXdzLkFDQ09VTlRfSUR9OnBhcmFtZXRlci9zZXJlbnlhLyR7ZW52aXJvbm1lbnR9LypgLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdjbG91ZHdhdGNoOlB1dE1ldHJpY0RhdGEnLFxuICAgICAgICAgICAgICAgICdjZTpHZXRDb3N0QW5kVXNhZ2UnLFxuICAgICAgICAgICAgICAgICdjZTpHZXRVc2FnZVJlcG9ydCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgYXBwbGljYXRpb24gY29uZmlndXJhdGlvbiBwYXJhbWV0ZXJzXG4gICAgdGhpcy5wYXJhbWV0ZXJzID0gdGhpcy5jcmVhdGVQYXJhbWV0ZXJzKGVudmlyb25tZW50LCByZWdpb24pO1xuXG4gICAgLy8gQ29zdCB0cmFja2luZyBMYW1iZGEgZnVuY3Rpb25cbiAgICB0aGlzLmNvc3RUcmFja2luZ0Z1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQ29zdFRyYWNraW5nRnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdjb3N0VHJhY2tpbmcuaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvY29zdC10cmFja2luZycpKSxcbiAgICAgIHJvbGU6IHRoaXMuY29uZmlnUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEVOVklST05NRU5UOiBlbnZpcm9ubWVudCxcbiAgICAgICAgUkVHSU9OOiByZWdpb24sXG4gICAgICAgIFBBUkFNRVRFUl9QUkVGSVg6IGAvc2VyZW55YS8ke2Vudmlyb25tZW50fWAsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nvc3QgdHJhY2tpbmcgYW5kIG9wdGltaXphdGlvbiBmb3IgU2VyZW55YScsXG4gICAgfSk7XG5cbiAgICAvLyBTY2hlZHVsZSBjb3N0IHRyYWNraW5nIHRvIHJ1biBob3VybHlcbiAgICBjb25zdCBjb3N0VHJhY2tpbmdSdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdDb3N0VHJhY2tpbmdTY2hlZHVsZScsIHtcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUucmF0ZShjZGsuRHVyYXRpb24uaG91cnMoMSkpLFxuICAgICAgZGVzY3JpcHRpb246ICdUcmlnZ2VyIGNvc3QgdHJhY2tpbmcgZXZlcnkgaG91cicsXG4gICAgfSk7XG5cbiAgICBjb3N0VHJhY2tpbmdSdWxlLmFkZFRhcmdldChuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbih0aGlzLmNvc3RUcmFja2luZ0Z1bmN0aW9uKSk7XG5cbiAgICAvLyBHcmFudCBQYXJhbWV0ZXIgU3RvcmUgYWNjZXNzIHRvIGFsbCBMYW1iZGEgZnVuY3Rpb25zXG4gICAgT2JqZWN0LnZhbHVlcyhsYW1iZGFGdW5jdGlvbnMpLmZvckVhY2goZnVuYyA9PiB7XG4gICAgICB0aGlzLmNvbmZpZ1JvbGUuZ3JhbnRBc3N1bWVSb2xlKGZ1bmMucm9sZSEpO1xuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGZlYXR1cmUgZmxhZ3MgYW5kIGNvbmZpZ3VyYXRpb25cbiAgICB0aGlzLmNyZWF0ZUZlYXR1cmVGbGFncyhlbnZpcm9ubWVudCk7XG5cbiAgICAvLyBDcmVhdGUgY29zdCBvcHRpbWl6YXRpb24gc2NoZWR1bGVzXG4gICAgdGhpcy5jcmVhdGVDb3N0T3B0aW1pemF0aW9uKGVudmlyb25tZW50KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlUGFyYW1ldGVycyhlbnZpcm9ubWVudDogc3RyaW5nLCByZWdpb246IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIHNzbS5TdHJpbmdQYXJhbWV0ZXI+IHtcbiAgICBjb25zdCBwYXJhbWV0ZXJzOiBSZWNvcmQ8c3RyaW5nLCBzc20uU3RyaW5nUGFyYW1ldGVyPiA9IHt9O1xuXG4gICAgLy8gUmF0ZSBsaW1pdGluZyBjb25maWd1cmF0aW9uXG4gICAgcGFyYW1ldGVycy5yYXRlTGltaXRBdXRoZW50aWNhdGVkVXNlcnMgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnUmF0ZUxpbWl0QXV0aGVudGljYXRlZCcsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvc2VyZW55YS8ke2Vudmlyb25tZW50fS9yYXRlLWxpbWl0cy9hdXRoZW50aWNhdGVkLXVzZXJzYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiAnMjAwJywgLy8gcmVxdWVzdHMgcGVyIGhvdXJcbiAgICAgIGRlc2NyaXB0aW9uOiAnUmF0ZSBsaW1pdCBmb3IgYXV0aGVudGljYXRlZCB1c2VycyAocmVxdWVzdHMgcGVyIGhvdXIpJyxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuXG4gICAgcGFyYW1ldGVycy5yYXRlTGltaXRBbm9ueW1vdXNVc2VycyA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdSYXRlTGltaXRBbm9ueW1vdXMnLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL3NlcmVueWEvJHtlbnZpcm9ubWVudH0vcmF0ZS1saW1pdHMvYW5vbnltb3VzLXVzZXJzYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiAnMjAnLCAvLyByZXF1ZXN0cyBwZXIgaG91clxuICAgICAgZGVzY3JpcHRpb246ICdSYXRlIGxpbWl0IGZvciBhbm9ueW1vdXMgdXNlcnMgKHJlcXVlc3RzIHBlciBob3VyKScsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIC8vIFByb2Nlc3NpbmcgY29uZmlndXJhdGlvblxuICAgIHBhcmFtZXRlcnMubWF4RmlsZVNpemUgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnTWF4RmlsZVNpemUnLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL3NlcmVueWEvJHtlbnZpcm9ubWVudH0vcHJvY2Vzc2luZy9tYXgtZmlsZS1zaXplYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiAnMTA0ODU3NjAnLCAvLyAxME1CIGluIGJ5dGVzXG4gICAgICBkZXNjcmlwdGlvbjogJ01heGltdW0gZmlsZSBzaXplIGZvciB1cGxvYWRzIChieXRlcyknLFxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgfSk7XG5cbiAgICBwYXJhbWV0ZXJzLnByb2Nlc3NpbmdUaW1lb3V0ID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1Byb2Nlc3NpbmdUaW1lb3V0Jywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9zZXJlbnlhLyR7ZW52aXJvbm1lbnR9L3Byb2Nlc3NpbmcvdGltZW91dGAsXG4gICAgICBzdHJpbmdWYWx1ZTogJzE4MCcsIC8vIDMgbWludXRlcyBpbiBzZWNvbmRzXG4gICAgICBkZXNjcmlwdGlvbjogJ01heGltdW0gcHJvY2Vzc2luZyB0aW1lb3V0IChzZWNvbmRzKScsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIC8vIEJlZHJvY2sgY29uZmlndXJhdGlvblxuICAgIHBhcmFtZXRlcnMuYmVkcm9ja01vZGVsID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0JlZHJvY2tNb2RlbCcsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvc2VyZW55YS8ke2Vudmlyb25tZW50fS9iZWRyb2NrL2RlZmF1bHQtbW9kZWxgLFxuICAgICAgc3RyaW5nVmFsdWU6ICdhbnRocm9waWMuY2xhdWRlLTMtc29ubmV0LTIwMjQwMjI5LXYxOjAnLFxuICAgICAgZGVzY3JpcHRpb246ICdEZWZhdWx0IEJlZHJvY2sgbW9kZWwgZm9yIHByb2Nlc3NpbmcnLFxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgfSk7XG5cbiAgICBwYXJhbWV0ZXJzLmJlZHJvY2tNYXhUb2tlbnMgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnQmVkcm9ja01heFRva2VucycsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvc2VyZW55YS8ke2Vudmlyb25tZW50fS9iZWRyb2NrL21heC10b2tlbnNgLFxuICAgICAgc3RyaW5nVmFsdWU6ICc0MDAwJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTWF4aW11bSB0b2tlbnMgZm9yIEJlZHJvY2sgcmVxdWVzdHMnLFxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgfSk7XG5cbiAgICBwYXJhbWV0ZXJzLmJlZHJvY2tUZW1wZXJhdHVyZSA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdCZWRyb2NrVGVtcGVyYXR1cmUnLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL3NlcmVueWEvJHtlbnZpcm9ubWVudH0vYmVkcm9jay90ZW1wZXJhdHVyZWAsXG4gICAgICBzdHJpbmdWYWx1ZTogJzAuMScsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RlbXBlcmF0dXJlIHNldHRpbmcgZm9yIEJlZHJvY2sgbW9kZWwnLFxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgfSk7XG5cbiAgICAvLyBTZWN1cml0eSBjb25maWd1cmF0aW9uXG4gICAgcGFyYW1ldGVycy5qd3RFeHBpcnlIb3VycyA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdKd3RFeHBpcnlIb3VycycsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvc2VyZW55YS8ke2Vudmlyb25tZW50fS9zZWN1cml0eS9qd3QtZXhwaXJ5LWhvdXJzYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiAnMjQnLFxuICAgICAgZGVzY3JpcHRpb246ICdKV1QgdG9rZW4gZXhwaXJ5IGluIGhvdXJzJyxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuXG4gICAgcGFyYW1ldGVycy5zZXNzaW9uRXhwaXJ5RGF5cyA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdTZXNzaW9uRXhwaXJ5RGF5cycsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvc2VyZW55YS8ke2Vudmlyb25tZW50fS9zZWN1cml0eS9zZXNzaW9uLWV4cGlyeS1kYXlzYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiAnNycsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Nlc3Npb24gZXhwaXJ5IGluIGRheXMnLFxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgfSk7XG5cbiAgICAvLyBDb3N0IHRocmVzaG9sZHNcbiAgICBwYXJhbWV0ZXJzLmRhaWx5Q29zdFRocmVzaG9sZCA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdEYWlseUNvc3RUaHJlc2hvbGQnLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL3NlcmVueWEvJHtlbnZpcm9ubWVudH0vY29zdC9kYWlseS10aHJlc2hvbGRgLFxuICAgICAgc3RyaW5nVmFsdWU6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyAnMTAwJyA6ICc1MCcsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RhaWx5IGNvc3QgdGhyZXNob2xkIGZvciBhbGVydHMgKFVTRCknLFxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgfSk7XG5cbiAgICBwYXJhbWV0ZXJzLm1vbnRobHlDb3N0VGhyZXNob2xkID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ01vbnRobHlDb3N0VGhyZXNob2xkJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9zZXJlbnlhLyR7ZW52aXJvbm1lbnR9L2Nvc3QvbW9udGhseS10aHJlc2hvbGRgLFxuICAgICAgc3RyaW5nVmFsdWU6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyAnMzAwMCcgOiAnMTUwMCcsXG4gICAgICBkZXNjcmlwdGlvbjogJ01vbnRobHkgY29zdCB0aHJlc2hvbGQgZm9yIGFsZXJ0cyAoVVNEKScsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIHJldHVybiBwYXJhbWV0ZXJzO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVGZWF0dXJlRmxhZ3MoZW52aXJvbm1lbnQ6IHN0cmluZykge1xuICAgIC8vIEZlYXR1cmUgZmxhZ3MgZm9yIGdyYWR1YWwgcm9sbG91dFxuICAgIGNvbnN0IGZlYXR1cmVGbGFncyA9IFtcbiAgICAgIHtcbiAgICAgICAgbmFtZTogJ2VuaGFuY2VkLWxvZ2dpbmcnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0VuYWJsZSBlbmhhbmNlZCBzdHJ1Y3R1cmVkIGxvZ2dpbmcnLFxuICAgICAgICBkZWZhdWx0VmFsdWU6ICd0cnVlJyxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdjaXJjdWl0LWJyZWFrZXInLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0VuYWJsZSBjaXJjdWl0IGJyZWFrZXIgZm9yIGV4dGVybmFsIHNlcnZpY2VzJyxcbiAgICAgICAgZGVmYXVsdFZhbHVlOiAndHJ1ZScsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBuYW1lOiAnY29zdC1vcHRpbWl6YXRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0VuYWJsZSBjb3N0IG9wdGltaXphdGlvbiBmZWF0dXJlcycsXG4gICAgICAgIGRlZmF1bHRWYWx1ZTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/ICd0cnVlJyA6ICdmYWxzZScsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBuYW1lOiAnYmVkcm9jay1wcml2YXRlLWVuZHBvaW50JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdVc2UgVlBDIGVuZHBvaW50IGZvciBCZWRyb2NrIGNhbGxzJyxcbiAgICAgICAgZGVmYXVsdFZhbHVlOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gJ3RydWUnIDogJ2ZhbHNlJyxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdhZHZhbmNlZC1zZWN1cml0eScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRW5hYmxlIGFkdmFuY2VkIHNlY3VyaXR5IGZlYXR1cmVzJyxcbiAgICAgICAgZGVmYXVsdFZhbHVlOiAndHJ1ZScsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBuYW1lOiAncHJlbWl1bS1mZWF0dXJlcycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRW5hYmxlIHByZW1pdW0gZmVhdHVyZXMgKGRvY3RvciByZXBvcnRzLCBldGMuKScsXG4gICAgICAgIGRlZmF1bHRWYWx1ZTogJ3RydWUnLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgbmFtZTogJ3BlcmZvcm1hbmNlLW1vbml0b3JpbmcnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0VuYWJsZSBkZXRhaWxlZCBwZXJmb3JtYW5jZSBtb25pdG9yaW5nJyxcbiAgICAgICAgZGVmYXVsdFZhbHVlOiAndHJ1ZScsXG4gICAgICB9LFxuICAgIF07XG5cbiAgICBmZWF0dXJlRmxhZ3MuZm9yRWFjaChmbGFnID0+IHtcbiAgICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsIGBGZWF0dXJlRmxhZyR7ZmxhZy5uYW1lLnJlcGxhY2UoLy0vZywgJycpfWAsIHtcbiAgICAgICAgcGFyYW1ldGVyTmFtZTogYC9zZXJlbnlhLyR7ZW52aXJvbm1lbnR9L2ZlYXR1cmVzLyR7ZmxhZy5uYW1lfWAsXG4gICAgICAgIHN0cmluZ1ZhbHVlOiBmbGFnLmRlZmF1bHRWYWx1ZSxcbiAgICAgICAgZGVzY3JpcHRpb246IGZsYWcuZGVzY3JpcHRpb24sXG4gICAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUNvc3RPcHRpbWl6YXRpb24oZW52aXJvbm1lbnQ6IHN0cmluZykge1xuICAgIC8vIENvc3Qgb3B0aW1pemF0aW9uIHBhcmFtZXRlcnNcbiAgICBjb25zdCBjb3N0T3B0aW1pemF0aW9ucyA9IFtcbiAgICAgIHtcbiAgICAgICAgbmFtZTogJ2xhbWJkYS1tZW1vcnktb3B0aW1pemF0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdBdXRvbWF0aWNhbGx5IG9wdGltaXplIExhbWJkYSBtZW1vcnkgYmFzZWQgb24gdXNhZ2UnLFxuICAgICAgICB2YWx1ZTogJ2VuYWJsZWQnLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgbmFtZTogJ3Jkcy1hdXRvLXNjYWxpbmcnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0VuYWJsZSBSRFMgYXV0by1zY2FsaW5nIGZvciBjb3N0IG9wdGltaXphdGlvbicsXG4gICAgICAgIHZhbHVlOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gJ2VuYWJsZWQnIDogJ2Rpc2FibGVkJyxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdzMy1saWZlY3ljbGUtb3B0aW1pemF0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdPcHRpbWl6ZSBTMyBsaWZlY3ljbGUgcG9saWNpZXMgZm9yIGNvc3QnLFxuICAgICAgICB2YWx1ZTogJ2VuYWJsZWQnLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgbmFtZTogJ2Nsb3Vkd2F0Y2gtbG9nLXJldGVudGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnT3B0aW1pemUgQ2xvdWRXYXRjaCBsb2cgcmV0ZW50aW9uIHBlcmlvZHMnLFxuICAgICAgICB2YWx1ZTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/ICczMCcgOiAnNycsIC8vIGRheXNcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdiZWRyb2NrLW1vZGVsLXNlbGVjdGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQXV0b21hdGljYWxseSBzZWxlY3QgY29zdC1vcHRpbWFsIEJlZHJvY2sgbW9kZWwnLFxuICAgICAgICB2YWx1ZTogJ2VuYWJsZWQnLFxuICAgICAgfSxcbiAgICBdO1xuXG4gICAgY29zdE9wdGltaXphdGlvbnMuZm9yRWFjaChvcHRpbWl6YXRpb24gPT4ge1xuICAgICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgYENvc3RPcHRpbWl6YXRpb24ke29wdGltaXphdGlvbi5uYW1lLnJlcGxhY2UoLy0vZywgJycpfWAsIHtcbiAgICAgICAgcGFyYW1ldGVyTmFtZTogYC9zZXJlbnlhLyR7ZW52aXJvbm1lbnR9L2Nvc3Qtb3B0aW1pemF0aW9uLyR7b3B0aW1pemF0aW9uLm5hbWV9YCxcbiAgICAgICAgc3RyaW5nVmFsdWU6IG9wdGltaXphdGlvbi52YWx1ZSxcbiAgICAgICAgZGVzY3JpcHRpb246IG9wdGltaXphdGlvbi5kZXNjcmlwdGlvbixcbiAgICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgY29uZmlndXJhdGlvbiBsb2FkZXIgdXRpbGl0eSBmb3IgTGFtYmRhIGZ1bmN0aW9uc1xuICAgKi9cbiAgY3JlYXRlQ29uZmlnTG9hZGVyKCk6IGxhbWJkYS5GdW5jdGlvbiB7XG4gICAgcmV0dXJuIG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0NvbmZpZ0xvYWRlckZ1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnY29uZmlnTG9hZGVyLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL2NvbmZpZycpKSxcbiAgICAgIHJvbGU6IHRoaXMuY29uZmlnUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFBBUkFNRVRFUl9QUkVGSVg6IGAvc2VyZW55YS8ke3Byb2Nlc3MuZW52LkVOVklST05NRU5UIHx8ICdkZXYnfWAsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogMTI4LFxuICAgICAgZGVzY3JpcHRpb246ICdDb25maWd1cmF0aW9uIGxvYWRlciB1dGlsaXR5IGZvciBvdGhlciBMYW1iZGEgZnVuY3Rpb25zJyxcbiAgICB9KTtcbiAgfVxufSJdfQ==