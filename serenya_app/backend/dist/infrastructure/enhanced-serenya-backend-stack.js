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
exports.EnhancedSerenyaBackendStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const rds = __importStar(require("aws-cdk-lib/aws-rds"));
const secretsmanager = __importStar(require("aws-cdk-lib/aws-secretsmanager"));
const kms = __importStar(require("aws-cdk-lib/aws-kms"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const path = __importStar(require("path"));
// Import our new constructs
const vpc_construct_1 = require("./vpc-construct");
const security_construct_1 = require("./security/security-construct");
const monitoring_construct_1 = require("./monitoring/monitoring-construct");
const enhanced_api_construct_1 = require("./enhanced-api-construct");
const config_construct_1 = require("./config-construct");
class EnhancedSerenyaBackendStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { environment, config } = props;
        // KMS Key for encryption
        const encryptionKey = new kms.Key(this, 'SerenyaEncryptionKey', {
            description: `Serenya ${environment} encryption key for PHI data`,
            enableKeyRotation: true,
            removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        });
        // Enhanced VPC with PrivateLink
        const vpcConstruct = new vpc_construct_1.VpcConstruct(this, 'SerenyaVpc', {
            environment,
            region: config.region,
            enablePrivateLink: config.enablePrivateLink,
            enableNatGateway: config.enableNatGateway,
        });
        this.vpc = vpcConstruct.vpc;
        // Database credentials secret
        this.dbSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
            description: `Serenya ${environment} database credentials`,
            secretName: `serenya/${environment}/database`,
            generateSecretString: {
                secretStringTemplate: JSON.stringify({
                    username: 'serenya_admin',
                }),
                generateStringKey: 'password',
                excludeCharacters: '"@/\\',
                passwordLength: 32,
            },
            encryptionKey,
        });
        // PostgreSQL RDS Instance with enhanced configuration
        this.database = new rds.DatabaseInstance(this, 'SerenyaDatabase', {
            engine: rds.DatabaseInstanceEngine.postgres({
                version: rds.PostgresEngineVersion.VER_15_8,
            }),
            instanceType: cdk.aws_ec2.InstanceType.of(cdk.aws_ec2.InstanceClass.T3, environment === 'prod' ? cdk.aws_ec2.InstanceSize.SMALL : cdk.aws_ec2.InstanceSize.MICRO),
            credentials: rds.Credentials.fromSecret(this.dbSecret),
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: cdk.aws_ec2.SubnetType.PRIVATE_ISOLATED,
            },
            securityGroups: [vpcConstruct.databaseSecurityGroup],
            databaseName: 'serenya',
            storageEncrypted: true,
            storageEncryptionKey: encryptionKey,
            backupRetention: environment === 'prod' ? cdk.Duration.days(7) : cdk.Duration.days(1),
            deleteAutomatedBackups: environment !== 'prod',
            deletionProtection: environment === 'prod',
            multiAz: environment === 'prod',
            allocatedStorage: 20,
            maxAllocatedStorage: environment === 'prod' ? 100 : 50,
            removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.SNAPSHOT : cdk.RemovalPolicy.DESTROY,
            // Enhanced monitoring
            monitoringInterval: cdk.Duration.seconds(60),
            performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
            enablePerformanceInsights: true,
            cloudwatchLogsExports: ['postgresql'],
        });
        // Secrets Manager for API keys
        const apiSecrets = new secretsmanager.Secret(this, 'SerenyaApiSecrets', {
            description: `Serenya ${environment} API secrets`,
            secretName: `serenya/${environment}/api-secrets`,
            generateSecretString: {
                secretStringTemplate: JSON.stringify({
                    jwtSecret: '',
                    anthropicApiKey: '',
                    googleClientId: '',
                    googleClientSecret: ''
                }),
                generateStringKey: 'jwtSecret',
                excludeCharacters: '"@/\\',
                passwordLength: 64,
            },
            encryptionKey,
        });
        // Enhanced S3 bucket configuration
        const tempFilesBucket = new cdk.aws_s3.Bucket(this, 'TempFilesBucket', {
            bucketName: `serenya-temp-files-${environment}-${this.account}`,
            encryption: cdk.aws_s3.BucketEncryption.KMS,
            encryptionKey,
            blockPublicAccess: cdk.aws_s3.BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            versioned: false,
            autoDeleteObjects: true,
            lifecycleRules: [
                {
                    id: 'DeleteTempFiles',
                    enabled: true,
                    expiration: cdk.Duration.days(1),
                },
                {
                    id: 'DeleteIncompleteUploads',
                    enabled: true,
                    abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
                },
                {
                    id: 'TransitionToIA',
                    enabled: true,
                    transitions: [
                        {
                            storageClass: cdk.aws_s3.StorageClass.INFREQUENT_ACCESS,
                            transitionAfter: cdk.Duration.days(30),
                        },
                    ],
                },
            ],
            cors: [
                {
                    allowedMethods: [cdk.aws_s3.HttpMethods.POST, cdk.aws_s3.HttpMethods.PUT],
                    allowedOrigins: config.allowOrigins,
                    allowedHeaders: ['*'],
                    maxAge: 3600,
                }
            ],
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            // Enhanced monitoring
            inventoryConfigurations: [
                {
                    id: 'inventory-config',
                    destination: {
                        bucketArn: `arn:aws:s3:::serenya-temp-files-${environment}-${this.account}`,
                        prefix: 'inventory',
                    },
                    enabled: true,
                    frequency: cdk.aws_s3.InventoryFrequency.WEEKLY,
                    includeObjectVersions: cdk.aws_s3.InventoryObjectVersion.CURRENT,
                },
            ],
        });
        // Enhanced Lambda execution role
        const lambdaExecutionRole = new cdk.aws_iam.Role(this, 'LambdaExecutionRole', {
            assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
                cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
            ],
            inlinePolicies: {
                SerenyaLambdaPolicy: new cdk.aws_iam.PolicyDocument({
                    statements: [
                        // Enhanced RDS permissions
                        new cdk.aws_iam.PolicyStatement({
                            effect: cdk.aws_iam.Effect.ALLOW,
                            actions: [
                                'rds-db:connect',
                                'rds:DescribeDBInstances',
                                'rds:ListTagsForResource',
                            ],
                            resources: [
                                `arn:aws:rds-db:${config.region}:${this.account}:dbuser:${this.database.instanceResourceId}/serenya_app`,
                                this.database.instanceArn,
                            ],
                        }),
                        // Enhanced S3 permissions
                        new cdk.aws_iam.PolicyStatement({
                            effect: cdk.aws_iam.Effect.ALLOW,
                            actions: [
                                's3:GetObject',
                                's3:PutObject',
                                's3:DeleteObject',
                                's3:PutObjectAcl',
                                's3:GetObjectVersion',
                                's3:ListBucket',
                                's3:GetBucketLocation',
                            ],
                            resources: [
                                `${tempFilesBucket.bucketArn}/*`,
                                tempFilesBucket.bucketArn,
                            ],
                        }),
                        // Enhanced Secrets Manager permissions
                        new cdk.aws_iam.PolicyStatement({
                            effect: cdk.aws_iam.Effect.ALLOW,
                            actions: [
                                'secretsmanager:GetSecretValue',
                                'secretsmanager:DescribeSecret',
                            ],
                            resources: [
                                apiSecrets.secretArn,
                                this.dbSecret.secretArn,
                                `arn:aws:secretsmanager:${config.region}:${this.account}:secret:serenya/${environment}/*`,
                            ],
                        }),
                        // Enhanced KMS permissions
                        new cdk.aws_iam.PolicyStatement({
                            effect: cdk.aws_iam.Effect.ALLOW,
                            actions: [
                                'kms:Decrypt',
                                'kms:GenerateDataKey',
                                'kms:GenerateDataKeyWithoutPlaintext',
                                'kms:DescribeKey',
                            ],
                            resources: [encryptionKey.keyArn],
                        }),
                        // CloudWatch enhanced permissions
                        new cdk.aws_iam.PolicyStatement({
                            effect: cdk.aws_iam.Effect.ALLOW,
                            actions: [
                                'cloudwatch:PutMetricData',
                                'logs:CreateLogStream',
                                'logs:PutLogEvents',
                                'logs:DescribeLogGroups',
                                'logs:DescribeLogStreams',
                            ],
                            resources: ['*'],
                        }),
                        // Parameter Store permissions
                        new cdk.aws_iam.PolicyStatement({
                            effect: cdk.aws_iam.Effect.ALLOW,
                            actions: [
                                'ssm:GetParameter',
                                'ssm:GetParameters',
                                'ssm:GetParametersByPath',
                            ],
                            resources: [
                                `arn:aws:ssm:${config.region}:${this.account}:parameter/serenya/${environment}/*`,
                            ],
                        }),
                        // Bedrock permissions (with VPC endpoint support)
                        new cdk.aws_iam.PolicyStatement({
                            effect: cdk.aws_iam.Effect.ALLOW,
                            actions: [
                                'bedrock:InvokeModel',
                                'bedrock:InvokeModelWithResponseStream',
                            ],
                            resources: ['*'],
                        }),
                    ],
                }),
            },
        });
        // Common Lambda environment variables
        const commonLambdaEnvironment = {
            REGION: config.region,
            ENVIRONMENT: environment,
            DB_HOST: this.database.instanceEndpoint.hostname,
            DB_PORT: this.database.instanceEndpoint.port.toString(),
            DB_NAME: 'serenya',
            DB_SECRET_ARN: this.dbSecret.secretArn,
            TEMP_BUCKET_NAME: tempFilesBucket.bucketName,
            API_SECRETS_ARN: apiSecrets.secretArn,
            KMS_KEY_ID: encryptionKey.keyId,
            ENABLE_DETAILED_LOGGING: config.enableDetailedLogging.toString(),
            PARAMETER_PREFIX: `/serenya/${environment}`,
        };
        // Enhanced Lambda function configurations
        const lambdaDefaults = {
            runtime: lambda.Runtime.NODEJS_18_X,
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [vpcConstruct.lambdaSecurityGroup],
            logRetention: logs.RetentionDays.ONE_MONTH,
            tracing: lambda.Tracing.ACTIVE, // Enable X-Ray tracing
            reservedConcurrentExecutions: environment === 'prod' ? 100 : 10,
        };
        // Create all Lambda functions with enhanced configurations
        const lambdaFunctions = {
            auth: new lambda.Function(this, 'AuthFunction', {
                ...lambdaDefaults,
                handler: 'auth.handler',
                code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/auth')),
                timeout: cdk.Duration.seconds(30),
                memorySize: 256,
                description: 'Enhanced Google OAuth verification and JWT generation with structured logging',
            }),
            userProfile: new lambda.Function(this, 'UserProfileFunction', {
                ...lambdaDefaults,
                handler: 'userProfile.handler',
                code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/user')),
                timeout: cdk.Duration.seconds(15),
                memorySize: 256,
                description: 'Enhanced user profile management with circuit breaker',
            }),
            upload: new lambda.Function(this, 'UploadFunction', {
                ...lambdaDefaults,
                handler: 'upload.handler',
                code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/upload')),
                timeout: cdk.Duration.seconds(60),
                memorySize: 512,
                description: 'Enhanced file upload with virus scanning and validation',
            }),
            process: new lambda.Function(this, 'ProcessFunction', {
                ...lambdaDefaults,
                handler: 'process.handler',
                code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/process')),
                timeout: cdk.Duration.minutes(3),
                memorySize: 1024,
                description: 'Enhanced AI processing with Bedrock and cost tracking',
                reservedConcurrentExecutions: environment === 'prod' ? 20 : 5, // Lower concurrency for expensive operations
            }),
            status: new lambda.Function(this, 'StatusFunction', {
                ...lambdaDefaults,
                handler: 'status.handler',
                code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/status')),
                timeout: cdk.Duration.seconds(15),
                memorySize: 256,
                description: 'Enhanced processing status tracking with health checks',
            }),
            result: new lambda.Function(this, 'ResultFunction', {
                ...lambdaDefaults,
                handler: 'result.handler',
                code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/result')),
                timeout: cdk.Duration.seconds(30),
                memorySize: 256,
                description: 'Enhanced results retrieval with caching',
            }),
            retry: new lambda.Function(this, 'RetryFunction', {
                ...lambdaDefaults,
                handler: 'retry.handler',
                code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/retry')),
                timeout: cdk.Duration.seconds(30),
                memorySize: 256,
                description: 'Enhanced processing retry management with exponential backoff',
            }),
            doctorReport: new lambda.Function(this, 'DoctorReportFunction', {
                ...lambdaDefaults,
                handler: 'doctorReport.handler',
                code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/doctor-report')),
                timeout: cdk.Duration.minutes(2),
                memorySize: 512,
                description: 'Enhanced premium doctor report generation',
            }),
            authorizer: new lambda.Function(this, 'AuthorizerFunction', {
                ...lambdaDefaults,
                handler: 'authorizer.handler',
                code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/authorizer')),
                timeout: cdk.Duration.seconds(15),
                memorySize: 256,
                description: 'Enhanced JWT token authorization with rate limiting',
                environment: {
                    ...commonLambdaEnvironment,
                    TOKEN_ISSUER: 'serenya.health',
                    TOKEN_AUDIENCE: 'serenya-mobile-app',
                },
            }),
            dbInit: new lambda.Function(this, 'DatabaseInitFunction', {
                ...lambdaDefaults,
                handler: 'index.handler',
                code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/db-init')),
                timeout: cdk.Duration.minutes(5),
                memorySize: 512,
                description: 'Enhanced database schema initialization and migrations',
            }),
        };
        // Create JWT authorizer
        const jwtAuthorizer = new apigateway.TokenAuthorizer(this, 'JWTAuthorizer', {
            handler: lambdaFunctions.authorizer,
            identitySource: 'method.request.header.Authorization',
            resultsCacheTtl: cdk.Duration.minutes(5),
            authorizerName: 'SerenyaJWTAuthorizer',
        });
        // Configuration and Parameter Store
        const configConstruct = new config_construct_1.ConfigConstruct(this, 'SerenyaConfig', {
            environment,
            region: config.region,
            lambdaFunctions,
        });
        // Enhanced API Gateway
        const apiConstruct = new enhanced_api_construct_1.EnhancedApiConstruct(this, 'SerenyaEnhancedApi', {
            environment,
            region: config.region,
            allowOrigins: config.allowOrigins,
            enableDetailedLogging: config.enableDetailedLogging,
            lambdaFunctions,
            authorizer: jwtAuthorizer,
        });
        this.api = apiConstruct.api;
        // Security (WAF, CloudTrail, GuardDuty)
        const securityConstruct = new security_construct_1.SecurityConstruct(this, 'SerenyaSecurity', {
            environment,
            region: config.region,
            vpc: this.vpc,
            api: this.api,
            enableVpcFlowLogs: config.enableVpcFlowLogs,
        });
        // Monitoring and Dashboards
        const monitoringConstruct = new monitoring_construct_1.MonitoringConstruct(this, 'SerenyaMonitoring', {
            environment,
            region: config.region,
            accountId: this.account,
            apiGatewayId: this.api.restApiId,
            kmsKeyId: encryptionKey.keyId,
            dbInstanceId: this.database.instanceResourceId,
            lambdaFunctions,
        });
        // Enhanced CloudWatch Log Groups
        Object.entries(lambdaFunctions).forEach(([name, func]) => {
            new logs.LogGroup(this, `${name}LogGroup`, {
                logGroupName: `/aws/lambda/${func.functionName}`,
                retention: logs.RetentionDays.ONE_MONTH,
                removalPolicy: cdk.RemovalPolicy.DESTROY,
            });
        });
        // Enhanced Outputs
        new cdk.CfnOutput(this, 'ApiUrl', {
            value: this.api.url,
            description: 'Enhanced Serenya API Gateway URL',
            exportName: `serenya-api-url-${environment}`,
        });
        new cdk.CfnOutput(this, 'ApiId', {
            value: this.api.restApiId,
            description: 'Enhanced Serenya API Gateway ID',
            exportName: `serenya-api-id-${environment}`,
        });
        new cdk.CfnOutput(this, 'TempBucketName', {
            value: tempFilesBucket.bucketName,
            description: 'Enhanced temporary files S3 bucket name',
            exportName: `serenya-temp-bucket-${environment}`,
        });
        new cdk.CfnOutput(this, 'KmsKeyId', {
            value: encryptionKey.keyId,
            description: 'KMS encryption key ID',
            exportName: `serenya-kms-key-${environment}`,
        });
        new cdk.CfnOutput(this, 'DatabaseHost', {
            value: this.database.instanceEndpoint.hostname,
            description: 'Enhanced PostgreSQL database hostname',
            exportName: `serenya-db-host-${environment}`,
        });
        new cdk.CfnOutput(this, 'VpcId', {
            value: this.vpc.vpcId,
            description: 'Enhanced VPC ID for healthcare compliance',
            exportName: `serenya-vpc-${environment}`,
        });
        new cdk.CfnOutput(this, 'WebAclArn', {
            value: securityConstruct.webAcl.attrArn,
            description: 'WAF Web ACL ARN for security',
            exportName: `serenya-waf-arn-${environment}`,
        });
        // Cost optimization tags
        cdk.Tags.of(this).add('Project', 'Serenya');
        cdk.Tags.of(this).add('Environment', environment);
        cdk.Tags.of(this).add('CostCenter', 'HealthcareAI');
        cdk.Tags.of(this).add('Owner', 'Engineering');
        cdk.Tags.of(this).add('Backup', environment === 'prod' ? 'Required' : 'Optional');
    }
}
exports.EnhancedSerenyaBackendStack = EnhancedSerenyaBackendStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5oYW5jZWQtc2VyZW55YS1iYWNrZW5kLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vaW5mcmFzdHJ1Y3R1cmUvZW5oYW5jZWQtc2VyZW55YS1iYWNrZW5kLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQywrREFBaUQ7QUFDakQsdUVBQXlEO0FBQ3pELHlEQUEyQztBQUMzQywrRUFBaUU7QUFDakUseURBQTJDO0FBQzNDLDJEQUE2QztBQUM3QywyQ0FBNkI7QUFHN0IsNEJBQTRCO0FBQzVCLG1EQUErQztBQUMvQyxzRUFBa0U7QUFDbEUsNEVBQXdFO0FBQ3hFLHFFQUFnRTtBQUNoRSx5REFBcUQ7QUFlckQsTUFBYSwyQkFBNEIsU0FBUSxHQUFHLENBQUMsS0FBSztJQU14RCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXVDO1FBQy9FLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRXRDLHlCQUF5QjtRQUN6QixNQUFNLGFBQWEsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQzlELFdBQVcsRUFBRSxXQUFXLFdBQVcsOEJBQThCO1lBQ2pFLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsYUFBYSxFQUFFLFdBQVcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87U0FDN0YsQ0FBQyxDQUFDO1FBRUgsZ0NBQWdDO1FBQ2hDLE1BQU0sWUFBWSxHQUFHLElBQUksNEJBQVksQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ3hELFdB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QUFFLFdBQVcsRUFBRTtZQUNuQyxLQUFLLEVBQUUsaUJBQWlCLENBQUMsTUFBTSxDQUFDLE9BQU87WUFDdkMsV0FBVyxFQUFFLDhCQUE4QjtZQUMzQyxVQUFVLEVBQUUsbUJBQW1CLFdBQVcsRUFBRTtTQUM3QyxDQUFDLENBQUM7UUFFSCx5QkFBeUI7UUFDekIsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUM1QyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ2xELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDcEQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxhQUFhLENBQUMsQ0FBQztRQUM5QyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLFdBQVcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDcEYsQ0FBQztDQUNGO0FBbmVELGtFQW1lQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIHJkcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtcmRzJztcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBrbXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWttcyc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuLy8gSW1wb3J0IG91ciBuZXcgY29uc3RydWN0c1xuaW1wb3J0IHsgVnBjQ29uc3RydWN0IH0gZnJvbSAnLi92cGMtY29uc3RydWN0JztcbmltcG9ydCB7IFNlY3VyaXR5Q29uc3RydWN0IH0gZnJvbSAnLi9zZWN1cml0eS9zZWN1cml0eS1jb25zdHJ1Y3QnO1xuaW1wb3J0IHsgTW9uaXRvcmluZ0NvbnN0cnVjdCB9IGZyb20gJy4vbW9uaXRvcmluZy9tb25pdG9yaW5nLWNvbnN0cnVjdCc7XG5pbXBvcnQgeyBFbmhhbmNlZEFwaUNvbnN0cnVjdCB9IGZyb20gJy4vZW5oYW5jZWQtYXBpLWNvbnN0cnVjdCc7XG5pbXBvcnQgeyBDb25maWdDb25zdHJ1Y3QgfSBmcm9tICcuL2NvbmZpZy1jb25zdHJ1Y3QnO1xuXG5pbnRlcmZhY2UgRW5oYW5jZWRTZXJlbnlhQmFja2VuZFN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG4gIGNvbmZpZzoge1xuICAgIHJlZ2lvbjogc3RyaW5nO1xuICAgIGFsbG93T3JpZ2luczogc3RyaW5nW107XG4gICAgcmV0ZW50aW9uRGF5czogbnVtYmVyO1xuICAgIGVuYWJsZURldGFpbGVkTG9nZ2luZzogYm9vbGVhbjtcbiAgICBlbmFibGVQcml2YXRlTGluazogYm9vbGVhbjtcbiAgICBlbmFibGVWcGNGbG93TG9nczogYm9vbGVhbjtcbiAgICBlbmFibGVOYXRHYXRld2F5OiBib29sZWFuO1xuICB9O1xufVxuXG5leHBvcnQgY2xhc3MgRW5oYW5jZWRTZXJlbnlhQmFja2VuZFN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGFwaTogYXBpZ2F0ZXdheS5SZXN0QXBpO1xuICBwdWJsaWMgcmVhZG9ubHkgdnBjOiBhbnk7XG4gIHB1YmxpYyByZWFkb25seSBkYXRhYmFzZTogcmRzLkRhdGFiYXNlSW5zdGFuY2U7XG4gIHB1YmxpYyByZWFkb25seSBkYlNlY3JldDogc2VjcmV0c21hbmFnZXIuU2VjcmV0O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBFbmhhbmNlZFNlcmVueWFCYWNrZW5kU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgeyBlbnZpcm9ubWVudCwgY29uZmlnIH0gPSBwcm9wcztcblxuICAgIC8vIEtNUyBLZXkgZm9yIGVuY3J5cHRpb25cbiAgICBjb25zdCBlbmNyeXB0aW9uS2V5ID0gbmV3IGttcy5LZXkodGhpcywgJ1NlcmVueWFFbmNyeXB0aW9uS2V5Jywge1xuICAgICAgZGVzY3JpcHRpb246IGBTZXJlbnlhICR7ZW52aXJvbm1lbnR9IGVuY3J5cHRpb24ga2V5IGZvciBQSEkgZGF0YWAsXG4gICAgICBlbmFibGVLZXlSb3RhdGlvbjogdHJ1ZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gRW5oYW5jZWQgVlBDIHdpdGggUHJpdmF0ZUxpbmtcbiAgICBjb25zdCB2cGNDb25zdHJ1Y3QgPSBuZXcgVnBjQ29uc3RydWN0KHRoaXMsICdTZXJlbnlhVnBjJywge1xuICAgICAgZW52aXJvbm1lbnQsXG4gICAgICByZWdpb246IGNvbmZpZy5yZWdpb24sXG4gICAgICBlbmFibGVQcml2YXRlTGluazogY29uZmlnLmVuYWJsZVByaXZhdGVMaW5rLFxuICAgICAgZW5hYmxlTmF0R2F0ZXdheTogY29uZmlnLmVuYWJsZU5hdEdhdGV3YXksXG4gICAgfSk7XG4gICAgdGhpcy52cGMgPSB2cGNDb25zdHJ1Y3QudnBjO1xuXG4gICAgLy8gRGF0YWJhc2UgY3JlZGVudGlhbHMgc2VjcmV0XG4gICAgdGhpcy5kYlNlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0RhdGFiYXNlU2VjcmV0Jywge1xuICAgICAgZGVzY3JpcHRpb246IGBTZXJlbnlhICR7ZW52aXJvbm1lbnR9IGRhdGFiYXNlIGNyZWRlbnRpYWxzYCxcbiAgICAgIHNlY3JldE5hbWU6IGBzZXJlbnlhLyR7ZW52aXJvbm1lbnR9L2RhdGFiYXNlYCxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgdXNlcm5hbWU6ICdzZXJlbnlhX2FkbWluJyxcbiAgICAgICAgfSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAncGFzc3dvcmQnLFxuICAgICAgICBleGNsdWRlQ2hhcmFjdGVyczogJ1wiQC9cXFxcJyxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDMyLFxuICAgICAgfSxcbiAgICAgIGVuY3J5cHRpb25LZXksXG4gICAgfSk7XG5cbiAgICAvLyBQb3N0Z3JlU1FMIFJEUyBJbnN0YW5jZSB3aXRoIGVuaGFuY2VkIGNvbmZpZ3VyYXRpb25cbiAgICB0aGlzLmRhdGFiYXNlID0gbmV3IHJkcy5EYXRhYmFzZUluc3RhbmNlKHRoaXMsICdTZXJlbnlhRGF0YWJhc2UnLCB7XG4gICAgICBlbmdpbmU6IHJkcy5EYXRhYmFzZUluc3RhbmNlRW5naW5lLnBvc3RncmVzKHtcbiAgICAgICAgdmVyc2lvbjogcmRzLlBvc3RncmVzRW5naW5lVmVyc2lvbi5WRVJfMTVfOCxcbiAgICAgIH0pLFxuICAgICAgaW5zdGFuY2VUeXBlOiBjZGsuYXdzX2VjMi5JbnN0YW5jZVR5cGUub2YoXG4gICAgICAgIGNkay5hd3NfZWMyLkluc3RhbmNlQ2xhc3MuVDMsXG4gICAgICAgIGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuYXdzX2VjMi5JbnN0YW5jZVNpemUuU01BTEwgOiBjZGsuYXdzX2VjMi5JbnN0YW5jZVNpemUuTUlDUk9cbiAgICAgICksXG4gICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21TZWNyZXQodGhpcy5kYlNlY3JldCksXG4gICAgICB2cGM6IHRoaXMudnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBjZGsuYXdzX2VjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFt2cGNDb25zdHJ1Y3QuZGF0YWJhc2VTZWN1cml0eUdyb3VwXSxcbiAgICAgIGRhdGFiYXNlTmFtZTogJ3NlcmVueWEnLFxuICAgICAgc3RvcmFnZUVuY3J5cHRlZDogdHJ1ZSxcbiAgICAgIHN0b3JhZ2VFbmNyeXB0aW9uS2V5OiBlbmNyeXB0aW9uS2V5LFxuICAgICAgYmFja3VwUmV0ZW50aW9uOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLkR1cmF0aW9uLmRheXMoNykgOiBjZGsuRHVyYXRpb24uZGF5cygxKSxcbiAgICAgIGRlbGV0ZUF1dG9tYXRlZEJhY2t1cHM6IGVudmlyb25tZW50ICE9PSAncHJvZCcsXG4gICAgICBkZWxldGlvblByb3RlY3Rpb246IGVudmlyb25tZW50ID09PSAncHJvZCcsXG4gICAgICBtdWx0aUF6OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnLFxuICAgICAgYWxsb2NhdGVkU3RvcmFnZTogMjAsXG4gICAgICBtYXhBbGxvY2F0ZWRTdG9yYWdlOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMTAwIDogNTAsXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuU05BUFNIT1QgOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgLy8gRW5oYW5jZWQgbW9uaXRvcmluZ1xuICAgICAgbW9uaXRvcmluZ0ludGVydmFsOiBjZGsuRHVyYXRpb24uc2Vjb25kcyg2MCksXG4gICAgICBwZXJmb3JtYW5jZUluc2lnaHRSZXRlbnRpb246IHJkcy5QZXJmb3JtYW5jZUluc2lnaHRSZXRlbnRpb24uREVGQVVMVCxcbiAgICAgIGVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHM6IHRydWUsXG4gICAgICBjbG91ZHdhdGNoTG9nc0V4cG9ydHM6IFsncG9zdGdyZXNxbCddLFxuICAgIH0pO1xuXG4gICAgLy8gU2VjcmV0cyBNYW5hZ2VyIGZvciBBUEkga2V5c1xuICAgIGNvbnN0IGFwaVNlY3JldHMgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdTZXJlbnlhQXBpU2VjcmV0cycsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgU2VyZW55YSAke2Vudmlyb25tZW50fSBBUEkgc2VjcmV0c2AsXG4gICAgICBzZWNyZXROYW1lOiBgc2VyZW55YS8ke2Vudmlyb25tZW50fS9hcGktc2VjcmV0c2AsXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBzZWNyZXRTdHJpbmdUZW1wbGF0ZTogSlNPTi5zdHJpbmdpZnkoeyBcbiAgICAgICAgICBqd3RTZWNyZXQ6ICcnLFxuICAgICAgICAgIGFudGhyb3BpY0FwaUtleTogJycsXG4gICAgICAgICAgZ29vZ2xlQ2xpZW50SWQ6ICcnLFxuICAgICAgICAgIGdvb2dsZUNsaWVudFNlY3JldDogJydcbiAgICAgICAgfSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAnand0U2VjcmV0JyxcbiAgICAgICAgZXhjbHVkZUNoYXJhY3RlcnM6ICdcIkAvXFxcXCcsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiA2NCxcbiAgICAgIH0sXG4gICAgICBlbmNyeXB0aW9uS2V5LFxuICAgIH0pO1xuXG4gICAgLy8gRW5oYW5jZWQgUzMgYnVja2V0IGNvbmZpZ3VyYXRpb25cbiAgICBjb25zdCB0ZW1wRmlsZXNCdWNrZXQgPSBuZXcgY2RrLmF3c19zMy5CdWNrZXQodGhpcywgJ1RlbXBGaWxlc0J1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGBzZXJlbnlhLXRlbXAtZmlsZXMtJHtlbnZpcm9ubWVudH0tJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIGVuY3J5cHRpb246IGNkay5hd3NfczMuQnVja2V0RW5jcnlwdGlvbi5LTVMsXG4gICAgICBlbmNyeXB0aW9uS2V5LFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IGNkay5hd3NfczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5mb3JjZVNTTDogdHJ1ZSxcbiAgICAgIHZlcnNpb25lZDogZmFsc2UsXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0RlbGV0ZVRlbXBGaWxlcycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygxKSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlSW5jb21wbGV0ZVVwbG9hZHMnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgYWJvcnRJbmNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDEpLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdUcmFuc2l0aW9uVG9JQScsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICB0cmFuc2l0aW9uczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBzdG9yYWdlQ2xhc3M6IGNkay5hd3NfczMuU3RvcmFnZUNsYXNzLklORlJFUVVFTlRfQUNDRVNTLFxuICAgICAgICAgICAgICB0cmFuc2l0aW9uQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW2Nkay5hd3NfczMuSHR0cE1ldGhvZHMuUE9TVCwgY2RrLmF3c19zMy5IdHRwTWV0aG9kcy5QVVRdLFxuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBjb25maWcuYWxsb3dPcmlnaW5zLFxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbJyonXSxcbiAgICAgICAgICBtYXhBZ2U6IDM2MDAsXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgLy8gRW5oYW5jZWQgbW9uaXRvcmluZ1xuICAgICAgaW52ZW50b3J5Q29uZmlndXJhdGlvbnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnaW52ZW50b3J5LWNvbmZpZycsXG4gICAgICAgICAgZGVzdGluYXRpb246IHtcbiAgICAgICAgICAgIGJ1Y2tldEFybjogYGFybjphd3M6czM6OjpzZXJlbnlhLXRlbXAtZmlsZXMtJHtlbnZpcm9ubWVudH0tJHt0aGlzLmFjY291bnR9YCxcbiAgICAgICAgICAgIHByZWZpeDogJ2ludmVudG9yeScsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGZyZXF1ZW5jeTogY2RrLmF3c19zMy5JbnZlbnRvcnlGcmVxdWVuY3kuV0VFS0xZLFxuICAgICAgICAgIGluY2x1ZGVPYmplY3RWZXJzaW9uczogY2RrLmF3c19zMy5JbnZlbnRvcnlPYmplY3RWZXJzaW9uLkNVUlJFTlQsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gRW5oYW5jZWQgTGFtYmRhIGV4ZWN1dGlvbiByb2xlXG4gICAgY29uc3QgbGFtYmRhRXhlY3V0aW9uUm9sZSA9IG5ldyBjZGsuYXdzX2lhbS5Sb2xlKHRoaXMsICdMYW1iZGFFeGVjdXRpb25Sb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgY2RrLmF3c19pYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBjZGsuYXdzX2lhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgICBjZGsuYXdzX2lhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYVZQQ0FjY2Vzc0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgIF0sXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBTZXJlbnlhTGFtYmRhUG9saWN5OiBuZXcgY2RrLmF3c19pYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIC8vIEVuaGFuY2VkIFJEUyBwZXJtaXNzaW9uc1xuICAgICAgICAgICAgbmV3IGNkay5hd3NfaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogY2RrLmF3c19pYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3Jkcy1kYjpjb25uZWN0JyxcbiAgICAgICAgICAgICAgICAncmRzOkRlc2NyaWJlREJJbnN0YW5jZXMnLFxuICAgICAgICAgICAgICAgICdyZHM6TGlzdFRhZ3NGb3JSZXNvdXJjZScsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIGBhcm46YXdzOnJkcy1kYjoke2NvbmZpZy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpkYnVzZXI6JHt0aGlzLmRhdGFiYXNlLmluc3RhbmNlUmVzb3VyY2VJZH0vc2VyZW55YV9hcHBgLFxuICAgICAgICAgICAgICAgIHRoaXMuZGF0YWJhc2UuaW5zdGFuY2VBcm4sXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIC8vIEVuaGFuY2VkIFMzIHBlcm1pc3Npb25zXG4gICAgICAgICAgICBuZXcgY2RrLmF3c19pYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBjZGsuYXdzX2lhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6RGVsZXRlT2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6UHV0T2JqZWN0QWNsJyxcbiAgICAgICAgICAgICAgICAnczM6R2V0T2JqZWN0VmVyc2lvbicsXG4gICAgICAgICAgICAgICAgJ3MzOkxpc3RCdWNrZXQnLFxuICAgICAgICAgICAgICAgICdzMzpHZXRCdWNrZXRMb2NhdGlvbicsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIGAke3RlbXBGaWxlc0J1Y2tldC5idWNrZXRBcm59LypgLFxuICAgICAgICAgICAgICAgIHRlbXBGaWxlc0J1Y2tldC5idWNrZXRBcm4sXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIC8vIEVuaGFuY2VkIFNlY3JldHMgTWFuYWdlciBwZXJtaXNzaW9uc1xuICAgICAgICAgICAgbmV3IGNkay5hd3NfaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogY2RrLmF3c19pYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlJyxcbiAgICAgICAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6RGVzY3JpYmVTZWNyZXQnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBhcGlTZWNyZXRzLnNlY3JldEFybixcbiAgICAgICAgICAgICAgICB0aGlzLmRiU2VjcmV0LnNlY3JldEFybixcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpzZWNyZXRzbWFuYWdlcjoke2NvbmZpZy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpzZWNyZXQ6c2VyZW55YS8ke2Vudmlyb25tZW50fS8qYCxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgLy8gRW5oYW5jZWQgS01TIHBlcm1pc3Npb25zXG4gICAgICAgICAgICBuZXcgY2RrLmF3c19pYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBjZGsuYXdzX2lhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAna21zOkRlY3J5cHQnLFxuICAgICAgICAgICAgICAgICdrbXM6R2VuZXJhdGVEYXRhS2V5JyxcbiAgICAgICAgICAgICAgICAna21zOkdlbmVyYXRlRGF0YUtleVdpdGhvdXRQbGFpbnRleHQnLFxuICAgICAgICAgICAgICAgICdrbXM6RGVzY3JpYmVLZXknLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtlbmNyeXB0aW9uS2V5LmtleUFybl0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIC8vIENsb3VkV2F0Y2ggZW5oYW5jZWQgcGVybWlzc2lvbnNcbiAgICAgICAgICAgIG5ldyBjZGsuYXdzX2lhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGNkay5hd3NfaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdjbG91ZHdhdGNoOlB1dE1ldHJpY0RhdGEnLFxuICAgICAgICAgICAgICAgICdsb2dzOkNyZWF0ZUxvZ1N0cmVhbScsXG4gICAgICAgICAgICAgICAgJ2xvZ3M6UHV0TG9nRXZlbnRzJyxcbiAgICAgICAgICAgICAgICAnbG9nczpEZXNjcmliZUxvZ0dyb3VwcycsXG4gICAgICAgICAgICAgICAgJ2xvZ3M6RGVzY3JpYmVMb2dTdHJlYW1zJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgLy8gUGFyYW1ldGVyIFN0b3JlIHBlcm1pc3Npb25zXG4gICAgICAgICAgICBuZXcgY2RrLmF3c19pYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBjZGsuYXdzX2lhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnc3NtOkdldFBhcmFtZXRlcicsXG4gICAgICAgICAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXJzJyxcbiAgICAgICAgICAgICAgICAnc3NtOkdldFBhcmFtZXRlcnNCeVBhdGgnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpzc206JHtjb25maWcucmVnaW9ufToke3RoaXMuYWNjb3VudH06cGFyYW1ldGVyL3NlcmVueWEvJHtlbnZpcm9ubWVudH0vKmAsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIC8vIEJlZHJvY2sgcGVybWlzc2lvbnMgKHdpdGggVlBDIGVuZHBvaW50IHN1cHBvcnQpXG4gICAgICAgICAgICBuZXcgY2RrLmF3c19pYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBjZGsuYXdzX2lhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnYmVkcm9jazpJbnZva2VNb2RlbCcsXG4gICAgICAgICAgICAgICAgJ2JlZHJvY2s6SW52b2tlTW9kZWxXaXRoUmVzcG9uc2VTdHJlYW0nLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ29tbW9uIExhbWJkYSBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICBjb25zdCBjb21tb25MYW1iZGFFbnZpcm9ubWVudCA9IHtcbiAgICAgIFJFR0lPTjogY29uZmlnLnJlZ2lvbixcbiAgICAgIEVOVklST05NRU5UOiBlbnZpcm9ubWVudCxcbiAgICAgIERCX0hPU1Q6IHRoaXMuZGF0YWJhc2UuaW5zdGFuY2VFbmRwb2ludC5ob3N0bmFtZSxcbiAgICAgIERCX1BPUlQ6IHRoaXMuZGF0YWJhc2UuaW5zdGFuY2VFbmRwb2ludC5wb3J0LnRvU3RyaW5nKCksXG4gICAgICBEQl9OQU1FOiAnc2VyZW55YScsXG4gICAgICBEQl9TRUNSRVRfQVJOOiB0aGlzLmRiU2VjcmV0LnNlY3JldEFybixcbiAgICAgIFRFTVBfQlVDS0VUX05BTUU6IHRlbXBGaWxlc0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgQVBJX1NFQ1JFVFNfQVJOOiBhcGlTZWNyZXRzLnNlY3JldEFybixcbiAgICAgIEtNU19LRVlfSUQ6IGVuY3J5cHRpb25LZXkua2V5SWQsXG4gICAgICBFTkFCTEVfREVUQUlMRURfTE9HR0lORzogY29uZmlnLmVuYWJsZURldGFpbGVkTG9nZ2luZy50b1N0cmluZygpLFxuICAgICAgUEFSQU1FVEVSX1BSRUZJWDogYC9zZXJlbnlhLyR7ZW52aXJvbm1lbnR9YCxcbiAgICB9O1xuXG4gICAgLy8gRW5oYW5jZWQgTGFtYmRhIGZ1bmN0aW9uIGNvbmZpZ3VyYXRpb25zXG4gICAgY29uc3QgbGFtYmRhRGVmYXVsdHMgPSB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIHJvbGU6IGxhbWJkYUV4ZWN1dGlvblJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uTGFtYmRhRW52aXJvbm1lbnQsXG4gICAgICB2cGM6IHRoaXMudnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBjZGsuYXdzX2VjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFt2cGNDb25zdHJ1Y3QubGFtYmRhU2VjdXJpdHlHcm91cF0sXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsIC8vIEVuYWJsZSBYLVJheSB0cmFjaW5nXG4gICAgICByZXNlcnZlZENvbmN1cnJlbnRFeGVjdXRpb25zOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMTAwIDogMTAsXG4gICAgfTtcblxuICAgIC8vIENyZWF0ZSBhbGwgTGFtYmRhIGZ1bmN0aW9ucyB3aXRoIGVuaGFuY2VkIGNvbmZpZ3VyYXRpb25zXG4gICAgY29uc3QgbGFtYmRhRnVuY3Rpb25zID0ge1xuICAgICAgYXV0aDogbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQXV0aEZ1bmN0aW9uJywge1xuICAgICAgICAuLi5sYW1iZGFEZWZhdWx0cyxcbiAgICAgICAgaGFuZGxlcjogJ2F1dGguaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy9hdXRoJykpLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgICAgZGVzY3JpcHRpb246ICdFbmhhbmNlZCBHb29nbGUgT0F1dGggdmVyaWZpY2F0aW9uIGFuZCBKV1QgZ2VuZXJhdGlvbiB3aXRoIHN0cnVjdHVyZWQgbG9nZ2luZycsXG4gICAgICB9KSxcbiAgICAgIFxuICAgICAgdXNlclByb2ZpbGU6IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1VzZXJQcm9maWxlRnVuY3Rpb24nLCB7XG4gICAgICAgIC4uLmxhbWJkYURlZmF1bHRzLFxuICAgICAgICBoYW5kbGVyOiAndXNlclByb2ZpbGUuaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy91c2VyJykpLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxNSksXG4gICAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgICAgZGVzY3JpcHRpb246ICdFbmhhbmNlZCB1c2VyIHByb2ZpbGUgbWFuYWdlbWVudCB3aXRoIGNpcmN1aXQgYnJlYWtlcicsXG4gICAgICB9KSxcblxuICAgICAgdXBsb2FkOiBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdVcGxvYWRGdW5jdGlvbicsIHtcbiAgICAgICAgLi4ubGFtYmRhRGVmYXVsdHMsXG4gICAgICAgIGhhbmRsZXI6ICd1cGxvYWQuaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy91cGxvYWQnKSksXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0VuaGFuY2VkIGZpbGUgdXBsb2FkIHdpdGggdmlydXMgc2Nhbm5pbmcgYW5kIHZhbGlkYXRpb24nLFxuICAgICAgfSksXG5cbiAgICAgIHByb2Nlc3M6IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1Byb2Nlc3NGdW5jdGlvbicsIHtcbiAgICAgICAgLi4ubGFtYmRhRGVmYXVsdHMsXG4gICAgICAgIGhhbmRsZXI6ICdwcm9jZXNzLmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvcHJvY2VzcycpKSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMyksXG4gICAgICAgIG1lbW9yeVNpemU6IDEwMjQsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRW5oYW5jZWQgQUkgcHJvY2Vzc2luZyB3aXRoIEJlZHJvY2sgYW5kIGNvc3QgdHJhY2tpbmcnLFxuICAgICAgICByZXNlcnZlZENvbmN1cnJlbnRFeGVjdXRpb25zOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMjAgOiA1LCAvLyBMb3dlciBjb25jdXJyZW5jeSBmb3IgZXhwZW5zaXZlIG9wZXJhdGlvbnNcbiAgICAgIH0pLFxuXG4gICAgICBzdGF0dXM6IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1N0YXR1c0Z1bmN0aW9uJywge1xuICAgICAgICAuLi5sYW1iZGFEZWZhdWx0cyxcbiAgICAgICAgaGFuZGxlcjogJ3N0YXR1cy5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL3N0YXR1cycpKSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTUpLFxuICAgICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRW5oYW5jZWQgcHJvY2Vzc2luZyBzdGF0dXMgdHJhY2tpbmcgd2l0aCBoZWFsdGggY2hlY2tzJyxcbiAgICAgIH0pLFxuXG4gICAgICByZXN1bHQ6IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1Jlc3VsdEZ1bmN0aW9uJywge1xuICAgICAgICAuLi5sYW1iZGFEZWZhdWx0cyxcbiAgICAgICAgaGFuZGxlcjogJ3Jlc3VsdC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL3Jlc3VsdCcpKSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRW5oYW5jZWQgcmVzdWx0cyByZXRyaWV2YWwgd2l0aCBjYWNoaW5nJyxcbiAgICAgIH0pLFxuXG4gICAgICByZXRyeTogbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUmV0cnlGdW5jdGlvbicsIHtcbiAgICAgICAgLi4ubGFtYmRhRGVmYXVsdHMsXG4gICAgICAgIGhhbmRsZXI6ICdyZXRyeS5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL3JldHJ5JykpLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgICAgZGVzY3JpcHRpb246ICdFbmhhbmNlZCBwcm9jZXNzaW5nIHJldHJ5IG1hbmFnZW1lbnQgd2l0aCBleHBvbmVudGlhbCBiYWNrb2ZmJyxcbiAgICAgIH0pLFxuXG4gICAgICBkb2N0b3JSZXBvcnQ6IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0RvY3RvclJlcG9ydEZ1bmN0aW9uJywge1xuICAgICAgICAuLi5sYW1iZGFEZWZhdWx0cyxcbiAgICAgICAgaGFuZGxlcjogJ2RvY3RvclJlcG9ydC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL2RvY3Rvci1yZXBvcnQnKSksXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDIpLFxuICAgICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRW5oYW5jZWQgcHJlbWl1bSBkb2N0b3IgcmVwb3J0IGdlbmVyYXRpb24nLFxuICAgICAgfSksXG5cbiAgICAgIGF1dGhvcml6ZXI6IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0F1dGhvcml6ZXJGdW5jdGlvbicsIHtcbiAgICAgICAgLi4ubGFtYmRhRGVmYXVsdHMsXG4gICAgICAgIGhhbmRsZXI6ICdhdXRob3JpemVyLmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvYXV0aG9yaXplcicpKSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTUpLFxuICAgICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRW5oYW5jZWQgSldUIHRva2VuIGF1dGhvcml6YXRpb24gd2l0aCByYXRlIGxpbWl0aW5nJyxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICAuLi5jb21tb25MYW1iZGFFbnZpcm9ubWVudCxcbiAgICAgICAgICBUT0tFTl9JU1NVRVI6ICdzZXJlbnlhLmhlYWx0aCcsXG4gICAgICAgICAgVE9LRU5fQVVESUVOQ0U6ICdzZXJlbnlhLW1vYmlsZS1hcHAnLFxuICAgICAgICB9LFxuICAgICAgfSksXG5cbiAgICAgIGRiSW5pdDogbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRGF0YWJhc2VJbml0RnVuY3Rpb24nLCB7XG4gICAgICAgIC4uLmxhbWJkYURlZmF1bHRzLFxuICAgICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy9kYi1pbml0JykpLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0VuaGFuY2VkIGRhdGFiYXNlIHNjaGVtYSBpbml0aWFsaXphdGlvbiBhbmQgbWlncmF0aW9ucycsXG4gICAgICB9KSxcbiAgICB9O1xuXG4gICAgLy8gQ3JlYXRlIEpXVCBhdXRob3JpemVyXG4gICAgY29uc3Qgand0QXV0aG9yaXplciA9IG5ldyBhcGlnYXRld2F5LlRva2VuQXV0aG9yaXplcih0aGlzLCAnSldUQXV0aG9yaXplcicsIHtcbiAgICAgIGhhbmRsZXI6IGxhbWJkYUZ1bmN0aW9ucy5hdXRob3JpemVyLFxuICAgICAgaWRlbnRpdHlTb3VyY2U6ICdtZXRob2QucmVxdWVzdC5oZWFkZXIuQXV0aG9yaXphdGlvbicsXG4gICAgICByZXN1bHRzQ2FjaGVUdGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgYXV0aG9yaXplck5hbWU6ICdTZXJlbnlhSldUQXV0aG9yaXplcicsXG4gICAgfSk7XG5cbiAgICAvLyBDb25maWd1cmF0aW9uIGFuZCBQYXJhbWV0ZXIgU3RvcmVcbiAgICBjb25zdCBjb25maWdDb25zdHJ1Y3QgPSBuZXcgQ29uZmlnQ29uc3RydWN0KHRoaXMsICdTZXJlbnlhQ29uZmlnJywge1xuICAgICAgZW52aXJvbm1lbnQsXG4gICAgICByZWdpb246IGNvbmZpZy5yZWdpb24sXG4gICAgICBsYW1iZGFGdW5jdGlvbnMsXG4gICAgfSk7XG5cbiAgICAvLyBFbmhhbmNlZCBBUEkgR2F0ZXdheVxuICAgIGNvbnN0IGFwaUNvbnN0cnVjdCA9IG5ldyBFbmhhbmNlZEFwaUNvbnN0cnVjdCh0aGlzLCAnU2VyZW55YUVuaGFuY2VkQXBpJywge1xuICAgICAgZW52aXJvbm1lbnQsXG4gICAgICByZWdpb246IGNvbmZpZy5yZWdpb24sXG4gICAgICBhbGxvd09yaWdpbnM6IGNvbmZpZy5hbGxvd09yaWdpbnMsXG4gICAgICBlbmFibGVEZXRhaWxlZExvZ2dpbmc6IGNvbmZpZy5lbmFibGVEZXRhaWxlZExvZ2dpbmcsXG4gICAgICBsYW1iZGFGdW5jdGlvbnMsXG4gICAgICBhdXRob3JpemVyOiBqd3RBdXRob3JpemVyLFxuICAgIH0pO1xuICAgIHRoaXMuYXBpID0gYXBpQ29uc3RydWN0LmFwaTtcblxuICAgIC8vIFNlY3VyaXR5IChXQUYsIENsb3VkVHJhaWwsIEd1YXJkRHV0eSlcbiAgICBjb25zdCBzZWN1cml0eUNvbnN0cnVjdCA9IG5ldyBTZWN1cml0eUNvbnN0cnVjdCh0aGlzLCAnU2VyZW55YVNlY3VyaXR5Jywge1xuICAgICAgZW52aXJvbm1lbnQsXG4gICAgICByZWdpb246IGNvbmZpZy5yZWdpb24sXG4gICAgICB2cGM6IHRoaXMudnBjLFxuICAgICAgYXBpOiB0aGlzLmFwaSxcbiAgICAgIGVuYWJsZVZwY0Zsb3dMb2dzOiBjb25maWcuZW5hYmxlVnBjRmxvd0xvZ3MsXG4gICAgfSk7XG5cbiAgICAvLyBNb25pdG9yaW5nIGFuZCBEYXNoYm9hcmRzXG4gICAgY29uc3QgbW9uaXRvcmluZ0NvbnN0cnVjdCA9IG5ldyBNb25pdG9yaW5nQ29uc3RydWN0KHRoaXMsICdTZXJlbnlhTW9uaXRvcmluZycsIHtcbiAgICAgIGVudmlyb25tZW50LFxuICAgICAgcmVnaW9uOiBjb25maWcucmVnaW9uLFxuICAgICAgYWNjb3VudElkOiB0aGlzLmFjY291bnQsXG4gICAgICBhcGlHYXRld2F5SWQ6IHRoaXMuYXBpLnJlc3RBcGlJZCxcbiAgICAgIGttc0tleUlkOiBlbmNyeXB0aW9uS2V5LmtleUlkLFxuICAgICAgZGJJbnN0YW5jZUlkOiB0aGlzLmRhdGFiYXNlLmluc3RhbmNlUmVzb3VyY2VJZCxcbiAgICAgIGxhbWJkYUZ1bmN0aW9ucyxcbiAgICB9KTtcblxuICAgIC8vIEVuaGFuY2VkIENsb3VkV2F0Y2ggTG9nIEdyb3Vwc1xuICAgIE9iamVjdC5lbnRyaWVzKGxhbWJkYUZ1bmN0aW9ucykuZm9yRWFjaCgoW25hbWUsIGZ1bmNdKSA9PiB7XG4gICAgICBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCBgJHtuYW1lfUxvZ0dyb3VwYCwge1xuICAgICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2xhbWJkYS8ke2Z1bmMuZnVuY3Rpb25OYW1lfWAsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gRW5oYW5jZWQgT3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlVcmwnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hcGkudXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdFbmhhbmNlZCBTZXJlbnlhIEFQSSBHYXRld2F5IFVSTCcsXG4gICAgICBleHBvcnROYW1lOiBgc2VyZW55YS1hcGktdXJsLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFwaS5yZXN0QXBpSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0VuaGFuY2VkIFNlcmVueWEgQVBJIEdhdGV3YXkgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYHNlcmVueWEtYXBpLWlkLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdUZW1wQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiB0ZW1wRmlsZXNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRW5oYW5jZWQgdGVtcG9yYXJ5IGZpbGVzIFMzIGJ1Y2tldCBuYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBzZXJlbnlhLXRlbXAtYnVja2V0LSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdLbXNLZXlJZCcsIHtcbiAgICAgIHZhbHVlOiBlbmNyeXB0aW9uS2V5LmtleUlkLFxuICAgICAgZGVzY3JpcHRpb246ICdLTVMgZW5jcnlwdGlvbiBrZXkgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYHNlcmVueWEta21zLWtleS0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGF0YWJhc2VIb3N0Jywge1xuICAgICAgdmFsdWU6IHRoaXMuZGF0YWJhc2UuaW5zdGFuY2VFbmRwb2ludC5ob3N0bmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRW5oYW5jZWQgUG9zdGdyZVNRTCBkYXRhYmFzZSBob3N0bmFtZScsXG4gICAgICBleHBvcnROYW1lOiBgc2VyZW55YS1kYi1ob3N0LSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdWcGNJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnZwYy52cGNJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRW5oYW5jZWQgVlBDIElEIGZvciBoZWFsdGhjYXJlIGNvbXBsaWFuY2UnLFxuICAgICAgZXhwb3J0TmFtZTogYHNlcmVueWEtdnBjLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXZWJBY2xBcm4nLCB7XG4gICAgICB2YWx1ZTogc2VjdXJpdHlDb25zdHJ1Y3Qud2ViQWNsLmF0dHJBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1dBRiBXZWIgQUNMIEFSTiBmb3Igc2VjdXJpdHknLFxuICAgICAgZXhwb3J0TmFtZTogYHNlcmVueWEtd2FmLWFybi0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICAvLyBDb3N0IG9wdGltaXphdGlvbiB0YWdzXG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdQcm9qZWN0JywgJ1NlcmVueWEnKTtcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0Vudmlyb25tZW50JywgZW52aXJvbm1lbnQpO1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnQ29zdENlbnRlcicsICdIZWFsdGhjYXJlQUknKTtcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ093bmVyJywgJ0VuZ2luZWVyaW5nJyk7XG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdCYWNrdXAnLCBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gJ1JlcXVpcmVkJyA6ICdPcHRpb25hbCcpO1xuICB9XG59Il19