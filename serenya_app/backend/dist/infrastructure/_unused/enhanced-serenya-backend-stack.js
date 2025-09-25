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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5oYW5jZWQtc2VyZW55YS1iYWNrZW5kLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vaW5mcmFzdHJ1Y3R1cmUvX3VudXNlZC9lbmhhbmNlZC1zZXJlbnlhLWJhY2tlbmQtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLCtEQUFpRDtBQUNqRCx1RUFBeUQ7QUFDekQseURBQTJDO0FBQzNDLCtFQUFpRTtBQUNqRSx5REFBMkM7QUFDM0MsMkRBQTZDO0FBQzdDLDJDQUE2QjtBQUc3Qiw0QkFBNEI7QUFDNUIsbURBQStDO0FBQy9DLHNFQUFrRTtBQUNsRSw0RUFBd0U7QUFDeEUscUVBQWdFO0FBQ2hFLHlEQUFxRDtBQWVyRCxNQUFhLDJCQUE0QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBTXhELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBdUM7UUFDL0UsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFdEMseUJBQXlCO1FBQ3pCLE1BQU0sYUFBYSxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7WUFDOUQsV0FBVyxFQUFFLFdBQVcsV0FBVyw4QkFBOEI7WUFDakUsaUJBQWlCLEVBQUUsSUFBSTtZQUN2QixhQUFhLEVBQUUsV0FBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztTQUM3RixDQUFDLENBQUM7UUFFSCxnQ0FBZ0M7UUFDaEMsTUFBTSxZQUFZLEdBQUcsSUFBSSw0QkFBWSxDQUFDLElBQUksRUFBRSxZQUFZLEVB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Q0FBQyxJQUFJLEVBQUUsV0FBVyxFQUFFO1lBQ25DLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsT0FBTztZQUN2QyxXQUFXLEVBQUUsOEJBQThCO1lBQzNDLFVBQVUsRUFBRSxtQkFBbUIsV0FBVyxFQUFFO1NBQzdDLENBQUMsQ0FBQztRQUVILHlCQUF5QjtRQUN6QixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzVDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDbEQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxjQUFjLENBQUMsQ0FBQztRQUNwRCxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBQzlDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsV0FBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUNwRixDQUFDO0NBQ0Y7QUFuZUQsa0VBbWVDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgcmRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yZHMnO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG4vLyBJbXBvcnQgb3VyIG5ldyBjb25zdHJ1Y3RzXG5pbXBvcnQgeyBWcGNDb25zdHJ1Y3QgfSBmcm9tICcuL3ZwYy1jb25zdHJ1Y3QnO1xuaW1wb3J0IHsgU2VjdXJpdHlDb25zdHJ1Y3QgfSBmcm9tICcuL3NlY3VyaXR5L3NlY3VyaXR5LWNvbnN0cnVjdCc7XG5pbXBvcnQgeyBNb25pdG9yaW5nQ29uc3RydWN0IH0gZnJvbSAnLi9tb25pdG9yaW5nL21vbml0b3JpbmctY29uc3RydWN0JztcbmltcG9ydCB7IEVuaGFuY2VkQXBpQ29uc3RydWN0IH0gZnJvbSAnLi9lbmhhbmNlZC1hcGktY29uc3RydWN0JztcbmltcG9ydCB7IENvbmZpZ0NvbnN0cnVjdCB9IGZyb20gJy4vY29uZmlnLWNvbnN0cnVjdCc7XG5cbmludGVyZmFjZSBFbmhhbmNlZFNlcmVueWFCYWNrZW5kU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcbiAgY29uZmlnOiB7XG4gICAgcmVnaW9uOiBzdHJpbmc7XG4gICAgYWxsb3dPcmlnaW5zOiBzdHJpbmdbXTtcbiAgICByZXRlbnRpb25EYXlzOiBudW1iZXI7XG4gICAgZW5hYmxlRGV0YWlsZWRMb2dnaW5nOiBib29sZWFuO1xuICAgIGVuYWJsZVByaXZhdGVMaW5rOiBib29sZWFuO1xuICAgIGVuYWJsZVZwY0Zsb3dMb2dzOiBib29sZWFuO1xuICAgIGVuYWJsZU5hdEdhdGV3YXk6IGJvb2xlYW47XG4gIH07XG59XG5cbmV4cG9ydCBjbGFzcyBFbmhhbmNlZFNlcmVueWFCYWNrZW5kU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgYXBpOiBhcGlnYXRld2F5LlJlc3RBcGk7XG4gIHB1YmxpYyByZWFkb25seSB2cGM6IGFueTtcbiAgcHVibGljIHJlYWRvbmx5IGRhdGFiYXNlOiByZHMuRGF0YWJhc2VJbnN0YW5jZTtcbiAgcHVibGljIHJlYWRvbmx5IGRiU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEVuaGFuY2VkU2VyZW55YUJhY2tlbmRTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB7IGVudmlyb25tZW50LCBjb25maWcgfSA9IHByb3BzO1xuXG4gICAgLy8gS01TIEtleSBmb3IgZW5jcnlwdGlvblxuICAgIGNvbnN0IGVuY3J5cHRpb25LZXkgPSBuZXcga21zLktleSh0aGlzLCAnU2VyZW55YUVuY3J5cHRpb25LZXknLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYFNlcmVueWEgJHtlbnZpcm9ubWVudH0gZW5jcnlwdGlvbiBrZXkgZm9yIFBISSBkYXRhYCxcbiAgICAgIGVuYWJsZUtleVJvdGF0aW9uOiB0cnVlLFxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyBFbmhhbmNlZCBWUEMgd2l0aCBQcml2YXRlTGlua1xuICAgIGNvbnN0IHZwY0NvbnN0cnVjdCA9IG5ldyBWcGNDb25zdHJ1Y3QodGhpcywgJ1NlcmVueWFWcGMnLCB7XG4gICAgICBlbnZpcm9ubWVudCxcbiAgICAgIHJlZ2lvbjogY29uZmlnLnJlZ2lvbixcbiAgICAgIGVuYWJsZVByaXZhdGVMaW5rOiBjb25maWcuZW5hYmxlUHJpdmF0ZUxpbmssXG4gICAgICBlbmFibGVOYXRHYXRld2F5OiBjb25maWcuZW5hYmxlTmF0R2F0ZXdheSxcbiAgICB9KTtcbiAgICB0aGlzLnZwYyA9IHZwY0NvbnN0cnVjdC52cGM7XG5cbiAgICAvLyBEYXRhYmFzZSBjcmVkZW50aWFscyBzZWNyZXRcbiAgICB0aGlzLmRiU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnRGF0YWJhc2VTZWNyZXQnLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYFNlcmVueWEgJHtlbnZpcm9ubWVudH0gZGF0YWJhc2UgY3JlZGVudGlhbHNgLFxuICAgICAgc2VjcmV0TmFtZTogYHNlcmVueWEvJHtlbnZpcm9ubWVudH0vZGF0YWJhc2VgLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICB1c2VybmFtZTogJ3NlcmVueWFfYWRtaW4nLFxuICAgICAgICB9KSxcbiAgICAgICAgZ2VuZXJhdGVTdHJpbmdLZXk6ICdwYXNzd29yZCcsXG4gICAgICAgIGV4Y2x1ZGVDaGFyYWN0ZXJzOiAnXCJAL1xcXFwnLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogMzIsXG4gICAgICB9LFxuICAgICAgZW5jcnlwdGlvbktleSxcbiAgICB9KTtcblxuICAgIC8vIFBvc3RncmVTUUwgUkRTIEluc3RhbmNlIHdpdGggZW5oYW5jZWQgY29uZmlndXJhdGlvblxuICAgIHRoaXMuZGF0YWJhc2UgPSBuZXcgcmRzLkRhdGFiYXNlSW5zdGFuY2UodGhpcywgJ1NlcmVueWFEYXRhYmFzZScsIHtcbiAgICAgIGVuZ2luZTogcmRzLkRhdGFiYXNlSW5zdGFuY2VFbmdpbmUucG9zdGdyZXMoe1xuICAgICAgICB2ZXJzaW9uOiByZHMuUG9zdGdyZXNFbmdpbmVWZXJzaW9uLlZFUl8xNV84LFxuICAgICAgfSksXG4gICAgICBpbnN0YW5jZVR5cGU6IGNkay5hd3NfZWMyLkluc3RhbmNlVHlwZS5vZihcbiAgICAgICAgY2RrLmF3c19lYzIuSW5zdGFuY2VDbGFzcy5UMyxcbiAgICAgICAgZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5hd3NfZWMyLkluc3RhbmNlU2l6ZS5TTUFMTCA6IGNkay5hd3NfZWMyLkluc3RhbmNlU2l6ZS5NSUNST1xuICAgICAgKSxcbiAgICAgIGNyZWRlbnRpYWxzOiByZHMuQ3JlZGVudGlhbHMuZnJvbVNlY3JldCh0aGlzLmRiU2VjcmV0KSxcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGNkay5hd3NfZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW3ZwY0NvbnN0cnVjdC5kYXRhYmFzZVNlY3VyaXR5R3JvdXBdLFxuICAgICAgZGF0YWJhc2VOYW1lOiAnc2VyZW55YScsXG4gICAgICBzdG9yYWdlRW5jcnlwdGVkOiB0cnVlLFxuICAgICAgc3RvcmFnZUVuY3J5cHRpb25LZXk6IGVuY3J5cHRpb25LZXksXG4gICAgICBiYWNrdXBSZXRlbnRpb246IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuRHVyYXRpb24uZGF5cyg3KSA6IGNkay5EdXJhdGlvbi5kYXlzKDEpLFxuICAgICAgZGVsZXRlQXV0b21hdGVkQmFja3VwczogZW52aXJvbm1lbnQgIT09ICdwcm9kJyxcbiAgICAgIGRlbGV0aW9uUHJvdGVjdGlvbjogZW52aXJvbm1lbnQgPT09ICdwcm9kJyxcbiAgICAgIG11bHRpQXo6IGVudmlyb25tZW50ID09PSAncHJvZCcsXG4gICAgICBhbGxvY2F0ZWRTdG9yYWdlOiAyMCxcbiAgICAgIG1heEFsbG9jYXRlZFN0b3JhZ2U6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyAxMDAgOiA1MCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5TTkFQU0hPVCA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICAvLyBFbmhhbmNlZCBtb25pdG9yaW5nXG4gICAgICBtb25pdG9yaW5nSW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcbiAgICAgIHBlcmZvcm1hbmNlSW5zaWdodFJldGVudGlvbjogcmRzLlBlcmZvcm1hbmNlSW5zaWdodFJldGVudGlvbi5ERUZBVUxULFxuICAgICAgZW5hYmxlUGVyZm9ybWFuY2VJbnNpZ2h0czogdHJ1ZSxcbiAgICAgIGNsb3Vkd2F0Y2hMb2dzRXhwb3J0czogWydwb3N0Z3Jlc3FsJ10sXG4gICAgfSk7XG5cbiAgICAvLyBTZWNyZXRzIE1hbmFnZXIgZm9yIEFQSSBrZXlzXG4gICAgY29uc3QgYXBpU2VjcmV0cyA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ1NlcmVueWFBcGlTZWNyZXRzJywge1xuICAgICAgZGVzY3JpcHRpb246IGBTZXJlbnlhICR7ZW52aXJvbm1lbnR9IEFQSSBzZWNyZXRzYCxcbiAgICAgIHNlY3JldE5hbWU6IGBzZXJlbnlhLyR7ZW52aXJvbm1lbnR9L2FwaS1zZWNyZXRzYCxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7IFxuICAgICAgICAgIGp3dFNlY3JldDogJycsXG4gICAgICAgICAgYW50aHJvcGljQXBpS2V5OiAnJyxcbiAgICAgICAgICBnb29nbGVDbGllbnRJZDogJycsXG4gICAgICAgICAgZ29vZ2xlQ2xpZW50U2VjcmV0OiAnJ1xuICAgICAgICB9KSxcbiAgICAgICAgZ2VuZXJhdGVTdHJpbmdLZXk6ICdqd3RTZWNyZXQnLFxuICAgICAgICBleGNsdWRlQ2hhcmFjdGVyczogJ1wiQC9cXFxcJyxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDY0LFxuICAgICAgfSxcbiAgICAgIGVuY3J5cHRpb25LZXksXG4gICAgfSk7XG5cbiAgICAvLyBFbmhhbmNlZCBTMyBidWNrZXQgY29uZmlndXJhdGlvblxuICAgIGNvbnN0IHRlbXBGaWxlc0J1Y2tldCA9IG5ldyBjZGsuYXdzX3MzLkJ1Y2tldCh0aGlzLCAnVGVtcEZpbGVzQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYHNlcmVueWEtdGVtcC1maWxlcy0ke2Vudmlyb25tZW50fS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgZW5jcnlwdGlvbjogY2RrLmF3c19zMy5CdWNrZXRFbmNyeXB0aW9uLktNUyxcbiAgICAgIGVuY3J5cHRpb25LZXksXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogY2RrLmF3c19zMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxuICAgICAgdmVyc2lvbmVkOiBmYWxzZSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlVGVtcEZpbGVzJyxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDEpLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdEZWxldGVJbmNvbXBsZXRlVXBsb2FkcycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ1RyYW5zaXRpb25Ub0lBJyxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIHRyYW5zaXRpb25zOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN0b3JhZ2VDbGFzczogY2RrLmF3c19zMy5TdG9yYWdlQ2xhc3MuSU5GUkVRVUVOVF9BQ0NFU1MsXG4gICAgICAgICAgICAgIHRyYW5zaXRpb25BZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIGNvcnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBbY2RrLmF3c19zMy5IdHRwTWV0aG9kcy5QT1NULCBjZGsuYXdzX3MzLkh0dHBNZXRob2RzLlBVVF0sXG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IGNvbmZpZy5hbGxvd09yaWdpbnMsXG4gICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFsnKiddLFxuICAgICAgICAgIG1heEFnZTogMzYwMCxcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICAvLyBFbmhhbmNlZCBtb25pdG9yaW5nXG4gICAgICBpbnZlbnRvcnlDb25maWd1cmF0aW9uczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdpbnZlbnRvcnktY29uZmlnJyxcbiAgICAgICAgICBkZXN0aW5hdGlvbjoge1xuICAgICAgICAgICAgYnVja2V0QXJuOiBgYXJuOmF3czpzMzo6OnNlcmVueWEtdGVtcC1maWxlcy0ke2Vudmlyb25tZW50fS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgICAgICAgcHJlZml4OiAnaW52ZW50b3J5JyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgZnJlcXVlbmN5OiBjZGsuYXdzX3MzLkludmVudG9yeUZyZXF1ZW5jeS5XRUVLTFksXG4gICAgICAgICAgaW5jbHVkZU9iamVjdFZlcnNpb25zOiBjZGsuYXdzX3MzLkludmVudG9yeU9iamVjdFZlcnNpb24uQ1VSUkVOVCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBFbmhhbmNlZCBMYW1iZGEgZXhlY3V0aW9uIHJvbGVcbiAgICBjb25zdCBsYW1iZGFFeGVjdXRpb25Sb2xlID0gbmV3IGNkay5hd3NfaWFtLlJvbGUodGhpcywgJ0xhbWJkYUV4ZWN1dGlvblJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBjZGsuYXdzX2lhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGNkay5hd3NfaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICAgIGNkay5hd3NfaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhVlBDQWNjZXNzRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIFNlcmVueWFMYW1iZGFQb2xpY3k6IG5ldyBjZGsuYXdzX2lhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgLy8gRW5oYW5jZWQgUkRTIHBlcm1pc3Npb25zXG4gICAgICAgICAgICBuZXcgY2RrLmF3c19pYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBjZGsuYXdzX2lhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAncmRzLWRiOmNvbm5lY3QnLFxuICAgICAgICAgICAgICAgICdyZHM6RGVzY3JpYmVEQkluc3RhbmNlcycsXG4gICAgICAgICAgICAgICAgJ3JkczpMaXN0VGFnc0ZvclJlc291cmNlJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgYGFybjphd3M6cmRzLWRiOiR7Y29uZmlnLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmRidXNlcjoke3RoaXMuZGF0YWJhc2UuaW5zdGFuY2VSZXNvdXJjZUlkfS9zZXJlbnlhX2FwcGAsXG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhYmFzZS5pbnN0YW5jZUFybixcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgLy8gRW5oYW5jZWQgUzMgcGVybWlzc2lvbnNcbiAgICAgICAgICAgIG5ldyBjZGsuYXdzX2lhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGNkay5hd3NfaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAgICAgICAgICdzMzpQdXRPYmplY3QnLFxuICAgICAgICAgICAgICAgICdzMzpEZWxldGVPYmplY3QnLFxuICAgICAgICAgICAgICAgICdzMzpQdXRPYmplY3RBY2wnLFxuICAgICAgICAgICAgICAgICdzMzpHZXRPYmplY3RWZXJzaW9uJyxcbiAgICAgICAgICAgICAgICAnczM6TGlzdEJ1Y2tldCcsXG4gICAgICAgICAgICAgICAgJ3MzOkdldEJ1Y2tldExvY2F0aW9uJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgYCR7dGVtcEZpbGVzQnVja2V0LmJ1Y2tldEFybn0vKmAsXG4gICAgICAgICAgICAgICAgdGVtcEZpbGVzQnVja2V0LmJ1Y2tldEFybixcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgLy8gRW5oYW5jZWQgU2VjcmV0cyBNYW5hZ2VyIHBlcm1pc3Npb25zXG4gICAgICAgICAgICBuZXcgY2RrLmF3c19pYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBjZGsuYXdzX2lhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWUnLFxuICAgICAgICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpEZXNjcmliZVNlY3JldCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIGFwaVNlY3JldHMuc2VjcmV0QXJuLFxuICAgICAgICAgICAgICAgIHRoaXMuZGJTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgICAgICAgICAgIGBhcm46YXdzOnNlY3JldHNtYW5hZ2VyOiR7Y29uZmlnLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnNlY3JldDpzZXJlbnlhLyR7ZW52aXJvbm1lbnR9LypgLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAvLyBFbmhhbmNlZCBLTVMgcGVybWlzc2lvbnNcbiAgICAgICAgICAgIG5ldyBjZGsuYXdzX2lhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGNkay5hd3NfaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdrbXM6RGVjcnlwdCcsXG4gICAgICAgICAgICAgICAgJ2ttczpHZW5lcmF0ZURhdGFLZXknLFxuICAgICAgICAgICAgICAgICdrbXM6R2VuZXJhdGVEYXRhS2V5V2l0aG91dFBsYWludGV4dCcsXG4gICAgICAgICAgICAgICAgJ2ttczpEZXNjcmliZUtleScsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2VuY3J5cHRpb25LZXkua2V5QXJuXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgLy8gQ2xvdWRXYXRjaCBlbmhhbmNlZCBwZXJtaXNzaW9uc1xuICAgICAgICAgICAgbmV3IGNkay5hd3NfaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogY2RrLmF3c19pYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2Nsb3Vkd2F0Y2g6UHV0TWV0cmljRGF0YScsXG4gICAgICAgICAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJyxcbiAgICAgICAgICAgICAgICAnbG9nczpQdXRMb2dFdmVudHMnLFxuICAgICAgICAgICAgICAgICdsb2dzOkRlc2NyaWJlTG9nR3JvdXBzJyxcbiAgICAgICAgICAgICAgICAnbG9nczpEZXNjcmliZUxvZ1N0cmVhbXMnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAvLyBQYXJhbWV0ZXIgU3RvcmUgcGVybWlzc2lvbnNcbiAgICAgICAgICAgIG5ldyBjZGsuYXdzX2lhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGNkay5hd3NfaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzc206R2V0UGFyYW1ldGVyJyxcbiAgICAgICAgICAgICAgICAnc3NtOkdldFBhcmFtZXRlcnMnLFxuICAgICAgICAgICAgICAgICdzc206R2V0UGFyYW1ldGVyc0J5UGF0aCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIGBhcm46YXdzOnNzbToke2NvbmZpZy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpwYXJhbWV0ZXIvc2VyZW55YS8ke2Vudmlyb25tZW50fS8qYCxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgLy8gQmVkcm9jayBwZXJtaXNzaW9ucyAod2l0aCBWUEMgZW5kcG9pbnQgc3VwcG9ydClcbiAgICAgICAgICAgIG5ldyBjZGsuYXdzX2lhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGNkay5hd3NfaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdiZWRyb2NrOkludm9rZU1vZGVsJyxcbiAgICAgICAgICAgICAgICAnYmVkcm9jazpJbnZva2VNb2RlbFdpdGhSZXNwb25zZVN0cmVhbScsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDb21tb24gTGFtYmRhIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgIGNvbnN0IGNvbW1vbkxhbWJkYUVudmlyb25tZW50ID0ge1xuICAgICAgUkVHSU9OOiBjb25maWcucmVnaW9uLFxuICAgICAgRU5WSVJPTk1FTlQ6IGVudmlyb25tZW50LFxuICAgICAgREJfSE9TVDogdGhpcy5kYXRhYmFzZS5pbnN0YW5jZUVuZHBvaW50Lmhvc3RuYW1lLFxuICAgICAgREJfUE9SVDogdGhpcy5kYXRhYmFzZS5pbnN0YW5jZUVuZHBvaW50LnBvcnQudG9TdHJpbmcoKSxcbiAgICAgIERCX05BTUU6ICdzZXJlbnlhJyxcbiAgICAgIERCX1NFQ1JFVF9BUk46IHRoaXMuZGJTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgVEVNUF9CVUNLRVRfTkFNRTogdGVtcEZpbGVzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBBUElfU0VDUkVUU19BUk46IGFwaVNlY3JldHMuc2VjcmV0QXJuLFxuICAgICAgS01TX0tFWV9JRDogZW5jcnlwdGlvbktleS5rZXlJZCxcbiAgICAgIEVOQUJMRV9ERVRBSUxFRF9MT0dHSU5HOiBjb25maWcuZW5hYmxlRGV0YWlsZWRMb2dnaW5nLnRvU3RyaW5nKCksXG4gICAgICBQQVJBTUVURVJfUFJFRklYOiBgL3NlcmVueWEvJHtlbnZpcm9ubWVudH1gLFxuICAgIH07XG5cbiAgICAvLyBFbmhhbmNlZCBMYW1iZGEgZnVuY3Rpb24gY29uZmlndXJhdGlvbnNcbiAgICBjb25zdCBsYW1iZGFEZWZhdWx0cyA9IHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgcm9sZTogbGFtYmRhRXhlY3V0aW9uUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25MYW1iZGFFbnZpcm9ubWVudCxcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGNkay5hd3NfZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW3ZwY0NvbnN0cnVjdC5sYW1iZGFTZWN1cml0eUdyb3VwXSxcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIHRyYWNpbmc6IGxhbWJkYS5UcmFjaW5nLkFDVElWRSwgLy8gRW5hYmxlIFgtUmF5IHRyYWNpbmdcbiAgICAgIHJlc2VydmVkQ29uY3VycmVudEV4ZWN1dGlvbnM6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyAxMDAgOiAxMCxcbiAgICB9O1xuXG4gICAgLy8gQ3JlYXRlIGFsbCBMYW1iZGEgZnVuY3Rpb25zIHdpdGggZW5oYW5jZWQgY29uZmlndXJhdGlvbnNcbiAgICBjb25zdCBsYW1iZGFGdW5jdGlvbnMgPSB7XG4gICAgICBhdXRoOiBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBdXRoRnVuY3Rpb24nLCB7XG4gICAgICAgIC4uLmxhbWJkYURlZmF1bHRzLFxuICAgICAgICBoYW5kbGVyOiAnYXV0aC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL2F1dGgnKSksXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0VuaGFuY2VkIEdvb2dsZSBPQXV0aCB2ZXJpZmljYXRpb24gYW5kIEpXVCBnZW5lcmF0aW9uIHdpdGggc3RydWN0dXJlZCBsb2dnaW5nJyxcbiAgICAgIH0pLFxuICAgICAgXG4gICAgICB1c2VyUHJvZmlsZTogbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnVXNlclByb2ZpbGVGdW5jdGlvbicsIHtcbiAgICAgICAgLi4ubGFtYmRhRGVmYXVsdHMsXG4gICAgICAgIGhhbmRsZXI6ICd1c2VyUHJvZmlsZS5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL3VzZXInKSksXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDE1KSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0VuaGFuY2VkIHVzZXIgcHJvZmlsZSBtYW5hZ2VtZW50IHdpdGggY2lyY3VpdCBicmVha2VyJyxcbiAgICAgIH0pLFxuXG4gICAgICB1cGxvYWQ6IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1VwbG9hZEZ1bmN0aW9uJywge1xuICAgICAgICAuLi5sYW1iZGFEZWZhdWx0cyxcbiAgICAgICAgaGFuZGxlcjogJ3VwbG9hZC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL3VwbG9hZCcpKSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRW5oYW5jZWQgZmlsZSB1cGxvYWQgd2l0aCB2aXJ1cyBzY2FubmluZyBhbmQgdmFsaWRhdGlvbicsXG4gICAgICB9KSxcblxuICAgICAgcHJvY2VzczogbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUHJvY2Vzc0Z1bmN0aW9uJywge1xuICAgICAgICAuLi5sYW1iZGFEZWZhdWx0cyxcbiAgICAgICAgaGFuZGxlcjogJ3Byb2Nlc3MuaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy9wcm9jZXNzJykpLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygzKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMTAyNCxcbiAgICAgICAgZGVzY3JpcHRpb246ICdFbmhhbmNlZCBBSSBwcm9jZXNzaW5nIHdpdGggQmVkcm9jayBhbmQgY29zdCB0cmFja2luZycsXG4gICAgICAgIHJlc2VydmVkQ29uY3VycmVudEV4ZWN1dGlvbnM6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyAyMCA6IDUsIC8vIExvd2VyIGNvbmN1cnJlbmN5IGZvciBleHBlbnNpdmUgb3BlcmF0aW9uc1xuICAgICAgfSksXG5cbiAgICAgIHN0YXR1czogbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnU3RhdHVzRnVuY3Rpb24nLCB7XG4gICAgICAgIC4uLmxhbWJkYURlZmF1bHRzLFxuICAgICAgICBoYW5kbGVyOiAnc3RhdHVzLmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvc3RhdHVzJykpLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxNSksXG4gICAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgICAgZGVzY3JpcHRpb246ICdFbmhhbmNlZCBwcm9jZXNzaW5nIHN0YXR1cyB0cmFja2luZyB3aXRoIGhlYWx0aCBjaGVja3MnLFxuICAgICAgfSksXG5cbiAgICAgIHJlc3VsdDogbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUmVzdWx0RnVuY3Rpb24nLCB7XG4gICAgICAgIC4uLmxhbWJkYURlZmF1bHRzLFxuICAgICAgICBoYW5kbGVyOiAncmVzdWx0LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvcmVzdWx0JykpLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgICAgZGVzY3JpcHRpb246ICdFbmhhbmNlZCByZXN1bHRzIHJldHJpZXZhbCB3aXRoIGNhY2hpbmcnLFxuICAgICAgfSksXG5cbiAgICAgIHJldHJ5OiBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdSZXRyeUZ1bmN0aW9uJywge1xuICAgICAgICAuLi5sYW1iZGFEZWZhdWx0cyxcbiAgICAgICAgaGFuZGxlcjogJ3JldHJ5LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvcmV0cnknKSksXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0VuaGFuY2VkIHByb2Nlc3NpbmcgcmV0cnkgbWFuYWdlbWVudCB3aXRoIGV4cG9uZW50aWFsIGJhY2tvZmYnLFxuICAgICAgfSksXG5cbiAgICAgIGRvY3RvclJlcG9ydDogbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRG9jdG9yUmVwb3J0RnVuY3Rpb24nLCB7XG4gICAgICAgIC4uLmxhbWJkYURlZmF1bHRzLFxuICAgICAgICBoYW5kbGVyOiAnZG9jdG9yUmVwb3J0LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvZG9jdG9yLXJlcG9ydCcpKSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMiksXG4gICAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgICAgZGVzY3JpcHRpb246ICdFbmhhbmNlZCBwcmVtaXVtIGRvY3RvciByZXBvcnQgZ2VuZXJhdGlvbicsXG4gICAgICB9KSxcblxuICAgICAgYXV0aG9yaXplcjogbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQXV0aG9yaXplckZ1bmN0aW9uJywge1xuICAgICAgICAuLi5sYW1iZGFEZWZhdWx0cyxcbiAgICAgICAgaGFuZGxlcjogJ2F1dGhvcml6ZXIuaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy9hdXRob3JpemVyJykpLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxNSksXG4gICAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgICAgZGVzY3JpcHRpb246ICdFbmhhbmNlZCBKV1QgdG9rZW4gYXV0aG9yaXphdGlvbiB3aXRoIHJhdGUgbGltaXRpbmcnLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIC4uLmNvbW1vbkxhbWJkYUVudmlyb25tZW50LFxuICAgICAgICAgIFRPS0VOX0lTU1VFUjogJ3NlcmVueWEuaGVhbHRoJyxcbiAgICAgICAgICBUT0tFTl9BVURJRU5DRTogJ3NlcmVueWEtbW9iaWxlLWFwcCcsXG4gICAgICAgIH0sXG4gICAgICB9KSxcblxuICAgICAgZGJJbml0OiBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdEYXRhYmFzZUluaXRGdW5jdGlvbicsIHtcbiAgICAgICAgLi4ubGFtYmRhRGVmYXVsdHMsXG4gICAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL2RiLWluaXQnKSksXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRW5oYW5jZWQgZGF0YWJhc2Ugc2NoZW1hIGluaXRpYWxpemF0aW9uIGFuZCBtaWdyYXRpb25zJyxcbiAgICAgIH0pLFxuICAgIH07XG5cbiAgICAvLyBDcmVhdGUgSldUIGF1dGhvcml6ZXJcbiAgICBjb25zdCBqd3RBdXRob3JpemVyID0gbmV3IGFwaWdhdGV3YXkuVG9rZW5BdXRob3JpemVyKHRoaXMsICdKV1RBdXRob3JpemVyJywge1xuICAgICAgaGFuZGxlcjogbGFtYmRhRnVuY3Rpb25zLmF1dGhvcml6ZXIsXG4gICAgICBpZGVudGl0eVNvdXJjZTogJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5BdXRob3JpemF0aW9uJyxcbiAgICAgIHJlc3VsdHNDYWNoZVR0bDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBhdXRob3JpemVyTmFtZTogJ1NlcmVueWFKV1RBdXRob3JpemVyJyxcbiAgICB9KTtcblxuICAgIC8vIENvbmZpZ3VyYXRpb24gYW5kIFBhcmFtZXRlciBTdG9yZVxuICAgIGNvbnN0IGNvbmZpZ0NvbnN0cnVjdCA9IG5ldyBDb25maWdDb25zdHJ1Y3QodGhpcywgJ1NlcmVueWFDb25maWcnLCB7XG4gICAgICBlbnZpcm9ubWVudCxcbiAgICAgIHJlZ2lvbjogY29uZmlnLnJlZ2lvbixcbiAgICAgIGxhbWJkYUZ1bmN0aW9ucyxcbiAgICB9KTtcblxuICAgIC8vIEVuaGFuY2VkIEFQSSBHYXRld2F5XG4gICAgY29uc3QgYXBpQ29uc3RydWN0ID0gbmV3IEVuaGFuY2VkQXBpQ29uc3RydWN0KHRoaXMsICdTZXJlbnlhRW5oYW5jZWRBcGknLCB7XG4gICAgICBlbnZpcm9ubWVudCxcbiAgICAgIHJlZ2lvbjogY29uZmlnLnJlZ2lvbixcbiAgICAgIGFsbG93T3JpZ2luczogY29uZmlnLmFsbG93T3JpZ2lucyxcbiAgICAgIGVuYWJsZURldGFpbGVkTG9nZ2luZzogY29uZmlnLmVuYWJsZURldGFpbGVkTG9nZ2luZyxcbiAgICAgIGxhbWJkYUZ1bmN0aW9ucyxcbiAgICAgIGF1dGhvcml6ZXI6IGp3dEF1dGhvcml6ZXIsXG4gICAgfSk7XG4gICAgdGhpcy5hcGkgPSBhcGlDb25zdHJ1Y3QuYXBpO1xuXG4gICAgLy8gU2VjdXJpdHkgKFdBRiwgQ2xvdWRUcmFpbCwgR3VhcmREdXR5KVxuICAgIGNvbnN0IHNlY3VyaXR5Q29uc3RydWN0ID0gbmV3IFNlY3VyaXR5Q29uc3RydWN0KHRoaXMsICdTZXJlbnlhU2VjdXJpdHknLCB7XG4gICAgICBlbnZpcm9ubWVudCxcbiAgICAgIHJlZ2lvbjogY29uZmlnLnJlZ2lvbixcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBhcGk6IHRoaXMuYXBpLFxuICAgICAgZW5hYmxlVnBjRmxvd0xvZ3M6IGNvbmZpZy5lbmFibGVWcGNGbG93TG9ncyxcbiAgICB9KTtcblxuICAgIC8vIE1vbml0b3JpbmcgYW5kIERhc2hib2FyZHNcbiAgICBjb25zdCBtb25pdG9yaW5nQ29uc3RydWN0ID0gbmV3IE1vbml0b3JpbmdDb25zdHJ1Y3QodGhpcywgJ1NlcmVueWFNb25pdG9yaW5nJywge1xuICAgICAgZW52aXJvbm1lbnQsXG4gICAgICByZWdpb246IGNvbmZpZy5yZWdpb24sXG4gICAgICBhY2NvdW50SWQ6IHRoaXMuYWNjb3VudCxcbiAgICAgIGFwaUdhdGV3YXlJZDogdGhpcy5hcGkucmVzdEFwaUlkLFxuICAgICAga21zS2V5SWQ6IGVuY3J5cHRpb25LZXkua2V5SWQsXG4gICAgICBkYkluc3RhbmNlSWQ6IHRoaXMuZGF0YWJhc2UuaW5zdGFuY2VSZXNvdXJjZUlkLFxuICAgICAgbGFtYmRhRnVuY3Rpb25zLFxuICAgIH0pO1xuXG4gICAgLy8gRW5oYW5jZWQgQ2xvdWRXYXRjaCBMb2cgR3JvdXBzXG4gICAgT2JqZWN0LmVudHJpZXMobGFtYmRhRnVuY3Rpb25zKS5mb3JFYWNoKChbbmFtZSwgZnVuY10pID0+IHtcbiAgICAgIG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsIGAke25hbWV9TG9nR3JvdXBgLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvbGFtYmRhLyR7ZnVuYy5mdW5jdGlvbk5hbWV9YCxcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBFbmhhbmNlZCBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaVVybCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0VuaGFuY2VkIFNlcmVueWEgQVBJIEdhdGV3YXkgVVJMJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBzZXJlbnlhLWFwaS11cmwtJHtlbnZpcm9ubWVudH1gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUlkJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXBpLnJlc3RBcGlJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRW5oYW5jZWQgU2VyZW55YSBBUEkgR2F0ZXdheSBJRCcsXG4gICAgICBleHBvcnROYW1lOiBgc2VyZW55YS1hcGktaWQtJHtlbnZpcm9ubWVudH1gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1RlbXBCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IHRlbXBGaWxlc0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdFbmhhbmNlZCB0ZW1wb3JhcnkgZmlsZXMgUzMgYnVja2V0IG5hbWUnLFxuICAgICAgZXhwb3J0TmFtZTogYHNlcmVueWEtdGVtcC1idWNrZXQtJHtlbnZpcm9ubWVudH1gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0ttc0tleUlkJywge1xuICAgICAgdmFsdWU6IGVuY3J5cHRpb25LZXkua2V5SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0tNUyBlbmNyeXB0aW9uIGtleSBJRCcsXG4gICAgICBleHBvcnROYW1lOiBgc2VyZW55YS1rbXMta2V5LSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEYXRhYmFzZUhvc3QnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5kYXRhYmFzZS5pbnN0YW5jZUVuZHBvaW50Lmhvc3RuYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdFbmhhbmNlZCBQb3N0Z3JlU1FMIGRhdGFiYXNlIGhvc3RuYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBzZXJlbnlhLWRiLWhvc3QtJHtlbnZpcm9ubWVudH1gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1ZwY0lkJywge1xuICAgICAgdmFsdWU6IHRoaXMudnBjLnZwY0lkLFxuICAgICAgZGVzY3JpcHRpb246ICdFbmhhbmNlZCBWUEMgSUQgZm9yIGhlYWx0aGNhcmUgY29tcGxpYW5jZScsXG4gICAgICBleHBvcnROYW1lOiBgc2VyZW55YS12cGMtJHtlbnZpcm9ubWVudH1gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYkFjbEFybicsIHtcbiAgICAgIHZhbHVlOiBzZWN1cml0eUNvbnN0cnVjdC53ZWJBY2wuYXR0ckFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnV0FGIFdlYiBBQ0wgQVJOIGZvciBzZWN1cml0eScsXG4gICAgICBleHBvcnROYW1lOiBgc2VyZW55YS13YWYtYXJuLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIC8vIENvc3Qgb3B0aW1pemF0aW9uIHRhZ3NcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ1Byb2plY3QnLCAnU2VyZW55YScpO1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnRW52aXJvbm1lbnQnLCBlbnZpcm9ubWVudCk7XG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdDb3N0Q2VudGVyJywgJ0hlYWx0aGNhcmVBSScpO1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnT3duZXInLCAnRW5naW5lZXJpbmcnKTtcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0JhY2t1cCcsIGVudmlyb25tZW50ID09PSAncHJvZCcgPyAnUmVxdWlyZWQnIDogJ09wdGlvbmFsJyk7XG4gIH1cbn0iXX0=