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
exports.SerenyaBackendStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const rds = __importStar(require("aws-cdk-lib/aws-rds"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const secretsmanager = __importStar(require("aws-cdk-lib/aws-secretsmanager"));
const kms = __importStar(require("aws-cdk-lib/aws-kms"));
const path = __importStar(require("path"));
const serenya_dynamodb_table_1 = require("./serenya-dynamodb-table");
class SerenyaBackendStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { environment, config } = props;
        // KMS Key for encryption
        const encryptionKey = new kms.Key(this, 'SerenyaEncryptionKey', {
            description: `Serenya ${environment} encryption key for PHI data`,
            enableKeyRotation: true,
            removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        });
        // Phase 1: DynamoDB Table for RDS Migration
        this.dynamoDBTable = new serenya_dynamodb_table_1.SerenyaDynamoDBTable(this, 'SerenyaDynamoDBTable', environment);
        // VPC for database isolation only - Lambda functions outside VPC
        this.vpc = new ec2.Vpc(this, 'SerenyaDatabaseVpc', {
            maxAzs: 2, // Multi-AZ for high availability
            natGateways: 0, // No NAT Gateway needed - Lambda functions outside VPC
            ipAddresses: ec2.IpAddresses.cidr('10.2.0.0/16'), // Use different CIDR to avoid conflicts with existing infrastructure
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'Public',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                {
                    cidrMask: 24,
                    name: 'Database',
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
            ],
            enableDnsHostnames: true,
            enableDnsSupport: true,
        });
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
        // Security group for database
        const dbSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
            vpc: this.vpc,
            description: 'Security group for PostgreSQL database',
            allowAllOutbound: false,
        });
        // Security group for Lambda functions
        const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
            vpc: this.vpc,
            description: 'Security group for Lambda functions',
            allowAllOutbound: true,
        });
        // Security group for RDS Proxy
        const proxySecurityGroup = new ec2.SecurityGroup(this, 'ProxySecurityGroup', {
            vpc: this.vpc,
            description: 'Security group for RDS Proxy',
            allowAllOutbound: true,
        });
        // Allow RDS Proxy to connect to database
        dbSecurityGroup.addIngressRule(proxySecurityGroup, ec2.Port.tcp(5432), 'Allow RDS Proxy to connect to database');
        // Allow Lambda functions (outside VPC) to connect to RDS Proxy
        // Note: This needs to be more restrictive in production
        proxySecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5432), 'Allow Lambda functions outside VPC to connect to RDS Proxy');
        // Aurora Serverless v2 PostgreSQL Cluster with IAM Authentication
        this.database = new rds.DatabaseCluster(this, 'SerenyaDatabase', {
            engine: rds.DatabaseClusterEngine.auroraPostgres({
                version: rds.AuroraPostgresEngineVersion.VER_15_8,
            }),
            serverlessV2MinCapacity: 0.5, // Minimum 0.5 ACU for cost optimization
            serverlessV2MaxCapacity: 16, // Maximum 16 ACU for scalability
            credentials: rds.Credentials.fromSecret(this.dbSecret),
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
            },
            securityGroups: [dbSecurityGroup],
            defaultDatabaseName: 'serenya',
            storageEncrypted: true,
            storageEncryptionKey: encryptionKey,
            iamAuthentication: true, // Enable IAM authentication for VPC elimination
            copyTagsToSnapshot: true,
            cloudwatchLogsExports: ['postgresql'], // Enhanced logging
            monitoringInterval: cdk.Duration.minutes(1), // Detailed monitoring
            backup: {
                retention: cdk.Duration.days(7),
            },
            deletionProtection: environment === 'prod',
            removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.SNAPSHOT : cdk.RemovalPolicy.DESTROY,
            writer: rds.ClusterInstance.serverlessV2('writer'),
        });
        // RDS Proxy for Lambda outside VPC connectivity
        const rdsProxy = new rds.DatabaseProxy(this, 'DatabaseProxy', {
            proxyTarget: rds.ProxyTarget.fromCluster(this.database),
            secrets: [this.dbSecret],
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            },
            securityGroups: [proxySecurityGroup],
            iamAuth: true, // Enable IAM authentication through proxy
            requireTLS: true,
            idleClientTimeout: cdk.Duration.minutes(30),
            maxConnectionsPercent: 100,
            maxIdleConnectionsPercent: 50,
            debugLogging: environment !== 'prod', // Enable debug logging for non-prod
        });
        // Store RDS Proxy endpoint for Lambda functions
        const rdsProxyEndpoint = rdsProxy.endpoint;
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
        // S3 bucket for temporary file storage
        this.tempFilesBucket = new s3.Bucket(this, 'TempFilesBucket', {
            bucketName: `serenya-temp-files-${environment}-${this.account}`,
            encryption: s3.BucketEncryption.KMS,
            encryptionKey,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            versioned: false,
            autoDeleteObjects: true,
            lifecycleRules: [
                {
                    id: 'DeleteTempFiles',
                    enabled: true,
                    expiration: cdk.Duration.days(1), // Primary cleanup after 1 day
                },
                {
                    id: 'DeleteIncompleteUploads',
                    enabled: true,
                    abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
                }
            ],
            cors: [
                {
                    allowedMethods: [s3.HttpMethods.POST, s3.HttpMethods.PUT],
                    allowedOrigins: config.allowOrigins,
                    allowedHeaders: ['*'],
                    maxAge: 3600,
                }
            ],
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // Lambda execution role with least privilege and IAM database access
        const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
                // Note: CloudWatchLambdaInsightsExecutionRolePolicy is automatically added by Lambda when insightsVersion is specified
            ],
            inlinePolicies: {
                SerenyaLambdaPolicy: new iam.PolicyDocument({
                    statements: [
                        // RDS permissions for IAM authentication via RDS Proxy
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'rds-db:connect',
                            ],
                            resources: [
                                `arn:aws:rds-db:${config.region}:${this.account}:dbuser:${this.database.clusterResourceIdentifier}/lambda_user`,
                            ],
                        }),
                        // S3 permissions
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:GetObject',
                                's3:PutObject',
                                's3:DeleteObject',
                                's3:PutObjectAcl',
                            ],
                            resources: [`${this.tempFilesBucket.bucketArn}/*`],
                        }),
                        // Secrets Manager permissions
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'secretsmanager:GetSecretValue',
                                'secretsmanager:CreateSecret',
                                'secretsmanager:UpdateSecret',
                            ],
                            resources: [apiSecrets.secretArn, this.dbSecret.secretArn, `arn:aws:secretsmanager:${config.region}:${this.account}:secret:serenya/${environment}/app-database*`],
                        }),
                        // KMS permissions
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'kms:Decrypt',
                                'kms:GenerateDataKey',
                            ],
                            resources: [encryptionKey.keyArn],
                        }),
                        // DynamoDB permissions for Phase 1 migration
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:PutItem',
                                'dynamodb:GetItem',
                                'dynamodb:UpdateItem',
                                'dynamodb:DeleteItem',
                                'dynamodb:Query',
                                'dynamodb:Scan',
                                'dynamodb:BatchGetItem',
                                'dynamodb:BatchWriteItem',
                            ],
                            resources: [
                                this.dynamoDBTable.table.tableArn,
                                `${this.dynamoDBTable.table.tableArn}/index/*`,
                            ],
                        }),
                        // Bedrock permissions for AI chat functionality
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'bedrock:InvokeModel',
                                'bedrock:InvokeModelWithResponseStream',
                            ],
                            resources: [
                                `arn:aws:bedrock:${config.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
                                `arn:aws:bedrock:${config.region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
                            ],
                        }),
                    ],
                }),
            },
        });
        // Common Lambda environment variables with IAM authentication via RDS Proxy
        const commonLambdaEnvironment = {
            REGION: config.region,
            ENVIRONMENT: environment,
            DB_HOST: rdsProxyEndpoint, // Use RDS Proxy endpoint instead of cluster endpoint
            DB_PORT: '5432', // RDS Proxy uses standard PostgreSQL port
            DB_NAME: 'serenya',
            DB_AUTH_METHOD: 'iam', // Use IAM authentication
            DB_USERNAME: 'lambda_user', // IAM database user
            DB_SECRET_ARN: this.dbSecret.secretArn, // Keep for compatibility during migration
            RDS_PROXY_ENDPOINT: rdsProxyEndpoint, // Explicit proxy endpoint for clarity
            // Phase 1: DynamoDB Configuration
            DYNAMO_TABLE_NAME: this.dynamoDBTable.table.tableName,
            TEMP_BUCKET_NAME: this.tempFilesBucket.bucketName,
            API_SECRETS_ARN: apiSecrets.secretArn,
            KMS_KEY_ID: encryptionKey.keyId,
            ENABLE_DETAILED_LOGGING: config.enableDetailedLogging.toString(),
            LOG_LEVEL: 'INFO',
            ENABLE_REQUEST_LOGGING: 'true',
            ENABLE_PERFORMANCE_MONITORING: 'true',
        };
        // Lambda functions without VPC - direct AWS service access
        const authFunction = new lambda.Function(this, 'AuthFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'auth.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/auth')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0, // Enhanced monitoring
            tracing: lambda.Tracing.ACTIVE, // Enable X-Ray tracing
            description: 'Google OAuth verification and JWT generation',
        });
        const userProfileFunction = new lambda.Function(this, 'UserProfileFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'userProfile.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/user')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            timeout: cdk.Duration.seconds(15),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
            tracing: lambda.Tracing.ACTIVE,
            description: 'User profile management',
        });
        const uploadFunction = new lambda.Function(this, 'UploadFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'upload.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/upload')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            timeout: cdk.Duration.seconds(60),
            memorySize: 512,
            logRetention: logs.RetentionDays.ONE_MONTH,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
            tracing: lambda.Tracing.ACTIVE,
            description: 'File upload with virus scanning',
        });
        const processFunction = new lambda.Function(this, 'ProcessFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'process.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/process')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            timeout: cdk.Duration.minutes(3),
            memorySize: 1024,
            logRetention: logs.RetentionDays.ONE_MONTH,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
            tracing: lambda.Tracing.ACTIVE,
            description: 'AI processing with Anthropic Claude',
        });
        const statusFunction = new lambda.Function(this, 'StatusFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'status.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/status')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            timeout: cdk.Duration.seconds(15),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
            tracing: lambda.Tracing.ACTIVE,
            description: 'Processing status tracking',
        });
        const resultFunction = new lambda.Function(this, 'ResultFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'result.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/result')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
            tracing: lambda.Tracing.ACTIVE,
            description: 'Results retrieval',
        });
        const retryFunction = new lambda.Function(this, 'RetryFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'retry.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/retry')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
            tracing: lambda.Tracing.ACTIVE,
            description: 'Processing retry management',
        });
        const doctorReportFunction = new lambda.Function(this, 'DoctorReportFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'doctorReport.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/doctor-report')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            timeout: cdk.Duration.minutes(2),
            memorySize: 512,
            logRetention: logs.RetentionDays.ONE_MONTH,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
            tracing: lambda.Tracing.ACTIVE,
            description: 'Premium doctor report generation',
        });
        const cleanupFunction = new lambda.Function(this, 'CleanupFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'cleanup.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/cleanup')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
            tracing: lambda.Tracing.ACTIVE,
            description: 'S3 temporary file cleanup after successful Flutter storage',
        });
        // JWT Authorizer Lambda  
        const authorizerFunction = new lambda.Function(this, 'AuthorizerFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'authorizer.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/authorizer')),
            role: lambdaExecutionRole,
            environment: {
                ...commonLambdaEnvironment,
                TOKEN_ISSUER: 'serenya.health',
                TOKEN_AUDIENCE: 'serenya-mobile-app',
            },
            timeout: cdk.Duration.seconds(15),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
            tracing: lambda.Tracing.ACTIVE,
            description: 'JWT token authorization',
        });
        // Database initialization Lambda (for manual schema setup)
        const dbInitFunction = new lambda.Function(this, 'DatabaseInitFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/db-init')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            timeout: cdk.Duration.minutes(5),
            memorySize: 512,
            logRetention: logs.RetentionDays.ONE_MONTH,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
            tracing: lambda.Tracing.ACTIVE,
            description: 'Database schema initialization and migrations',
        });
        // Chat Lambda functions
        const chatPromptsFunction = new lambda.Function(this, 'ChatPromptsFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'chatPrompts.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/chat-prompts')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            timeout: cdk.Duration.seconds(15),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
            tracing: lambda.Tracing.ACTIVE,
            description: 'Chat prompts retrieval for conversation starters',
        });
        const chatMessagesFunction = new lambda.Function(this, 'ChatMessagesFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'chatMessages.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/chat-messages')),
            role: lambdaExecutionRole,
            environment: {
                ...commonLambdaEnvironment,
                BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
            },
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            logRetention: logs.RetentionDays.ONE_MONTH,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
            tracing: lambda.Tracing.ACTIVE,
            description: 'Chat message processing with AI response generation',
        });
        const chatStatusFunction = new lambda.Function(this, 'ChatStatusFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'chatStatus.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/chat-status')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            timeout: cdk.Duration.seconds(15),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
            tracing: lambda.Tracing.ACTIVE,
            description: 'Chat response status polling',
        });
        const subscriptionsFunction = new lambda.Function(this, 'SubscriptionsFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'subscriptions.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/subscriptions')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            timeout: cdk.Duration.seconds(15),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
            tracing: lambda.Tracing.ACTIVE,
            description: 'Subscription management and billing',
        });
        // Custom authorizer
        const jwtAuthorizer = new apigateway.TokenAuthorizer(this, 'JWTAuthorizer', {
            handler: authorizerFunction,
            identitySource: 'method.request.header.Authorization',
            resultsCacheTtl: cdk.Duration.minutes(5),
            authorizerName: 'SerenyaJWTAuthorizer',
        });
        // API Gateway
        this.api = new apigateway.RestApi(this, 'SerenyaApi', {
            restApiName: `serenya-api-${environment}`,
            description: `Serenya AI Health Agent API - ${environment}`,
            defaultCorsPreflightOptions: {
                allowOrigins: config.allowOrigins,
                allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                allowHeaders: [
                    'Content-Type',
                    'X-Amz-Date',
                    'Authorization',
                    'X-Api-Key',
                    'X-Amz-Security-Token',
                    'X-Amz-User-Agent',
                ],
                allowCredentials: true,
            },
            deployOptions: {
                stageName: environment,
                loggingLevel: config.enableDetailedLogging
                    ? apigateway.MethodLoggingLevel.INFO
                    : apigateway.MethodLoggingLevel.ERROR,
                dataTraceEnabled: config.enableDetailedLogging,
                metricsEnabled: true,
                throttlingRateLimit: 100,
                throttlingBurstLimit: 200,
            },
            endpointConfiguration: {
                types: [apigateway.EndpointType.REGIONAL],
            },
        });
        // API Gateway resources and methods
        this.setupApiRoutes(jwtAuthorizer, {
            auth: authFunction,
            userProfile: userProfileFunction,
            upload: uploadFunction,
            process: processFunction,
            status: statusFunction,
            result: resultFunction,
            retry: retryFunction,
            doctorReport: doctorReportFunction,
            cleanup: cleanupFunction,
            chatPrompts: chatPromptsFunction,
            chatMessages: chatMessagesFunction,
            chatStatus: chatStatusFunction,
            subscriptions: subscriptionsFunction,
        });
        // CloudWatch Log Groups with retention
        new logs.LogGroup(this, 'ApiGatewayLogGroup', {
            logGroupName: `/aws/apigateway/serenya-${environment}`,
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // Note: Removed S3 event notification - processing now triggered directly via API
        // Outputs
        new cdk.CfnOutput(this, 'ApiUrl', {
            value: this.api.url,
            description: 'Serenya API Gateway URL',
            exportName: `serenya-api-url-${environment}`,
        });
        new cdk.CfnOutput(this, 'ApiId', {
            value: this.api.restApiId,
            description: 'Serenya API Gateway ID',
            exportName: `serenya-api-id-${environment}`,
        });
        new cdk.CfnOutput(this, 'TempBucketName', {
            value: this.tempFilesBucket.bucketName,
            description: 'Temporary files S3 bucket name',
            exportName: `serenya-temp-bucket-${environment}`,
        });
        new cdk.CfnOutput(this, 'KmsKeyId', {
            value: encryptionKey.keyId,
            description: 'KMS encryption key ID',
            exportName: `serenya-kms-key-${environment}`,
        });
        new cdk.CfnOutput(this, 'DatabaseHost', {
            value: this.database.clusterEndpoint.hostname,
            description: 'PostgreSQL database hostname (direct access)',
            exportName: `serenya-db-host-${environment}`,
        });
        new cdk.CfnOutput(this, 'RdsProxyEndpoint', {
            value: rdsProxyEndpoint,
            description: 'RDS Proxy endpoint for Lambda functions',
            exportName: `serenya-rds-proxy-${environment}`,
        });
        new cdk.CfnOutput(this, 'DatabasePort', {
            value: this.database.clusterEndpoint.port.toString(),
            description: 'PostgreSQL database port',
            exportName: `serenya-db-port-${environment}`,
        });
        new cdk.CfnOutput(this, 'DatabaseSecretArn', {
            value: this.dbSecret.secretArn,
            description: 'Database credentials secret ARN',
            exportName: `serenya-db-secret-${environment}`,
        });
        new cdk.CfnOutput(this, 'VpcId', {
            value: this.vpc.vpcId,
            description: 'VPC ID for healthcare compliance',
            exportName: `serenya-vpc-${environment}`,
        });
        new cdk.CfnOutput(this, 'DynamoTableName', {
            value: this.dynamoDBTable.table.tableName,
            description: 'DynamoDB table name for Phase 1 migration',
            exportName: `serenya-dynamo-table-${environment}`,
        });
        new cdk.CfnOutput(this, 'DynamoTableArn', {
            value: this.dynamoDBTable.table.tableArn,
            description: 'DynamoDB table ARN for Phase 1 migration',
            exportName: `serenya-dynamo-table-arn-${environment}`,
        });
    }
    setupApiRoutes(authorizer, functions) {
        // Auth routes (no authorization required)
        const auth = this.api.root.addResource('auth');
        const googleAuth = auth.addResource('google');
        const googleOnboardingAuth = auth.addResource('google-onboarding');
        const oauthOnboardingAuth = auth.addResource('oauth-onboarding');
        // Both routes point to the same auth function for backward compatibility
        googleAuth.addMethod('POST', new apigateway.LambdaIntegration(functions.auth), {
            methodResponses: [
                {
                    statusCode: '200',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                },
                {
                    statusCode: '400',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                },
                {
                    statusCode: '500',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                },
            ],
        });
        // Google onboarding auth route (same as above for Flutter app compatibility)
        googleOnboardingAuth.addMethod('POST', new apigateway.LambdaIntegration(functions.auth), {
            methodResponses: [
                {
                    statusCode: '200',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                },
                {
                    statusCode: '400',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                },
                {
                    statusCode: '500',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                },
            ],
        });
        // OAuth onboarding auth route (what Flutter app actually calls)
        oauthOnboardingAuth.addMethod('POST', new apigateway.LambdaIntegration(functions.auth), {
            methodResponses: [
                {
                    statusCode: '200',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                },
                {
                    statusCode: '400',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                },
                {
                    statusCode: '500',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                },
            ],
        });
        // User routes (authorization required)
        const user = this.api.root.addResource('user');
        const profile = user.addResource('profile');
        profile.addMethod('GET', new apigateway.LambdaIntegration(functions.userProfile), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // Processing routes (authorization required)
        const apiV1 = this.api.root.addResource('api').addResource('v1');
        const process = apiV1.addResource('process');
        // Upload endpoint
        const upload = process.addResource('upload');
        upload.addMethod('POST', new apigateway.LambdaIntegration(functions.upload), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
            requestParameters: {
                'method.request.header.Content-Type': true,
            },
        });
        // Status endpoint
        const status = process.addResource('status');
        const statusJobId = status.addResource('{jobId}');
        statusJobId.addMethod('GET', new apigateway.LambdaIntegration(functions.status), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
            requestParameters: {
                'method.request.path.jobId': true,
            },
        });
        // Result endpoint
        const result = process.addResource('result');
        const resultJobId = result.addResource('{jobId}');
        resultJobId.addMethod('GET', new apigateway.LambdaIntegration(functions.result), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
            requestParameters: {
                'method.request.path.jobId': true,
            },
        });
        // Retry endpoint
        const retry = process.addResource('retry');
        const retryJobId = retry.addResource('{jobId}');
        retryJobId.addMethod('POST', new apigateway.LambdaIntegration(functions.retry), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
            requestParameters: {
                'method.request.path.jobId': true,
            },
        });
        // Doctor report endpoint (premium feature)
        const doctorReport = process.addResource('doctor-report');
        doctorReport.addMethod('POST', new apigateway.LambdaIntegration(functions.doctorReport), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // Cleanup endpoint for S3 temporary files
        const cleanup = process.addResource('cleanup');
        const cleanupJobId = cleanup.addResource('{jobId}');
        cleanupJobId.addMethod('DELETE', new apigateway.LambdaIntegration(functions.cleanup), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
            requestParameters: {
                'method.request.path.jobId': true,
            },
        });
        // Reports API endpoints (premium features)
        const reports = apiV1.addResource('reports');
        // Chat API endpoints (authorization required)
        const chat = apiV1.addResource('chat');
        // Chat prompts endpoint - GET /api/v1/chat/prompts?content_type=results|reports
        const prompts = chat.addResource('prompts');
        prompts.addMethod('GET', new apigateway.LambdaIntegration(functions.chatPrompts), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
            requestParameters: {
                'method.request.querystring.content_type': true,
            },
        });
        // Chat messages endpoint - POST /api/v1/chat/messages
        const messages = chat.addResource('messages');
        messages.addMethod('POST', new apigateway.LambdaIntegration(functions.chatMessages), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // Chat jobs status endpoint - GET /api/v1/chat/jobs/{job_id}/status
        const jobs = chat.addResource('jobs');
        const jobId = jobs.addResource('{job_id}');
        const jobStatus = jobId.addResource('status');
        jobStatus.addMethod('GET', new apigateway.LambdaIntegration(functions.chatStatus), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
            requestParameters: {
                'method.request.path.job_id': true,
            },
        });
        // Subscriptions API endpoints (authorization required)
        const subscriptions = this.api.root.addResource('subscriptions');
        // Current subscription endpoint - GET /subscriptions/current
        const current = subscriptions.addResource('current');
        current.addMethod('GET', new apigateway.LambdaIntegration(functions.subscriptions), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
    }
}
exports.SerenyaBackendStack = SerenyaBackendStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VyZW55YS1iYWNrZW5kLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vaW5mcmFzdHJ1Y3R1cmUvc2VyZW55YS1iYWNrZW5kLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQywrREFBaUQ7QUFDakQsdUVBQXlEO0FBQ3pELHVEQUF5QztBQUN6Qyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQywyREFBNkM7QUFDN0MsK0VBQWlFO0FBQ2pFLHlEQUEyQztBQUUzQywyQ0FBNkI7QUFFN0IscUVBQWdFO0FBWWhFLE1BQWEsbUJBQW9CLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFRaEQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUErQjtRQUN2RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQztRQUV0Qyx5QkFBeUI7UUFDekIsTUFBTSxhQUFhLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUM5RCxXQUFXLEVBQUUsV0FBVyxXQUFXLDhCQUE4QjtZQUNqRSxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLGFBQWEsRUFBRSxXQUFXLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1NBQzdGLENBQUMsQ0FBQztRQUVILDRDQUE0QztRQUM1QyxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksNkNBQW9CLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRXpGLGlFQUFpRTtRQUNqRSxJQUFJLENBQUMs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VSxDQUFDLGlCQUFpQixDQUFDLE1BQU07U0FDdkQsQ0FBQyxDQUFDO1FBRUgsb0VBQW9FO1FBQ3BFLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMzQyxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzlDLFNBQVMsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsRUFBRTtZQUNqRixVQUFVO1lBQ1YsaUJBQWlCLEVBQUUsVUFBVSxDQUFDLGlCQUFpQixDQUFDLE1BQU07WUFDdEQsaUJBQWlCLEVBQUU7Z0JBQ2pCLDRCQUE0QixFQUFFLElBQUk7YUFDbkM7U0FDRixDQUFDLENBQUM7UUFFSCx1REFBdUQ7UUFDdkQsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBRWpFLDZEQUE2RDtRQUM3RCxNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3JELE9BQU8sQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsRUFBRTtZQUNsRixVQUFVO1lBQ1YsaUJBQWlCLEVBQUUsVUFBVSxDQUFDLGlCQUFpQixDQUFDLE1BQU07U0FDdkQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBejFCRCxrREF5MUJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIHJkcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtcmRzJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBTZXJlbnlhRHluYW1vREJUYWJsZSB9IGZyb20gJy4vc2VyZW55YS1keW5hbW9kYi10YWJsZSc7XG5cbmludGVyZmFjZSBTZXJlbnlhQmFja2VuZFN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG4gIGNvbmZpZzoge1xuICAgIHJlZ2lvbjogc3RyaW5nO1xuICAgIGFsbG93T3JpZ2luczogc3RyaW5nW107XG4gICAgcmV0ZW50aW9uRGF5czogbnVtYmVyO1xuICAgIGVuYWJsZURldGFpbGVkTG9nZ2luZzogYm9vbGVhbjtcbiAgfTtcbn1cblxuZXhwb3J0IGNsYXNzIFNlcmVueWFCYWNrZW5kU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgYXBpOiBhcGlnYXRld2F5LlJlc3RBcGk7XG4gIHB1YmxpYyByZWFkb25seSB0ZW1wRmlsZXNCdWNrZXQ6IHMzLkJ1Y2tldDtcbiAgcHVibGljIHJlYWRvbmx5IHZwYzogZWMyLlZwYztcbiAgcHVibGljIHJlYWRvbmx5IGRhdGFiYXNlOiByZHMuRGF0YWJhc2VDbHVzdGVyO1xuICBwdWJsaWMgcmVhZG9ubHkgZGJTZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcbiAgcHVibGljIHJlYWRvbmx5IGR5bmFtb0RCVGFibGU6IFNlcmVueWFEeW5hbW9EQlRhYmxlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZXJlbnlhQmFja2VuZFN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQsIGNvbmZpZyB9ID0gcHJvcHM7XG5cbiAgICAvLyBLTVMgS2V5IGZvciBlbmNyeXB0aW9uXG4gICAgY29uc3QgZW5jcnlwdGlvbktleSA9IG5ldyBrbXMuS2V5KHRoaXMsICdTZXJlbnlhRW5jcnlwdGlvbktleScsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgU2VyZW55YSAke2Vudmlyb25tZW50fSBlbmNyeXB0aW9uIGtleSBmb3IgUEhJIGRhdGFgLFxuICAgICAgZW5hYmxlS2V5Um90YXRpb246IHRydWUsXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIFBoYXNlIDE6IER5bmFtb0RCIFRhYmxlIGZvciBSRFMgTWlncmF0aW9uXG4gICAgdGhpcy5keW5hbW9EQlRhYmxlID0gbmV3IFNlcmVueWFEeW5hbW9EQlRhYmxlKHRoaXMsICdTZXJlbnlhRHluYW1vREJUYWJsZScsIGVudmlyb25tZW50KTtcblxuICAgIC8vIFZQQyBmb3IgZGF0YWJhc2UgaXNvbGF0aW9uIG9ubHkgLSBMYW1iZGEgZnVuY3Rpb25zIG91dHNpZGUgVlBDXG4gICAgdGhpcy52cGMgPSBuZXcgZWMyLlZwYyh0aGlzLCAnU2VyZW55YURhdGFiYXNlVnBjJywge1xuICAgICAgbWF4QXpzOiAyLCAvLyBNdWx0aS1BWiBmb3IgaGlnaCBhdmFpbGFiaWxpdHlcbiAgICAgIG5hdEdhdGV3YXlzOiAwLCAvLyBObyBOQVQgR2F0ZXdheSBuZWVkZWQgLSBMYW1iZGEgZnVuY3Rpb25zIG91dHNpZGUgVlBDXG4gICAgICBpcEFkZHJlc3NlczogZWMyLklwQWRkcmVzc2VzLmNpZHIoJzEwLjIuMC4wLzE2JyksIC8vIFVzZSBkaWZmZXJlbnQgQ0lEUiB0byBhdm9pZCBjb25mbGljdHMgd2l0aCBleGlzdGluZyBpbmZyYXN0cnVjdHVyZVxuICAgICAgc3VibmV0Q29uZmlndXJhdGlvbjogW1xuICAgICAgICB7XG4gICAgICAgICAgY2lkck1hc2s6IDI0LFxuICAgICAgICAgIG5hbWU6ICdQdWJsaWMnLFxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGNpZHJNYXNrOiAyNCxcbiAgICAgICAgICBuYW1lOiAnRGF0YWJhc2UnLFxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgZW5hYmxlRG5zSG9zdG5hbWVzOiB0cnVlLFxuICAgICAgZW5hYmxlRG5zU3VwcG9ydDogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIERhdGFiYXNlIGNyZWRlbnRpYWxzIHNlY3JldFxuICAgIHRoaXMuZGJTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdEYXRhYmFzZVNlY3JldCcsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgU2VyZW55YSAke2Vudmlyb25tZW50fSBkYXRhYmFzZSBjcmVkZW50aWFsc2AsXG4gICAgICBzZWNyZXROYW1lOiBgc2VyZW55YS8ke2Vudmlyb25tZW50fS9kYXRhYmFzZWAsXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBzZWNyZXRTdHJpbmdUZW1wbGF0ZTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHVzZXJuYW1lOiAnc2VyZW55YV9hZG1pbicsXG4gICAgICAgIH0pLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogJ3Bhc3N3b3JkJyxcbiAgICAgICAgZXhjbHVkZUNoYXJhY3RlcnM6ICdcIkAvXFxcXCcsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiAzMixcbiAgICAgIH0sXG4gICAgICBlbmNyeXB0aW9uS2V5LFxuICAgIH0pO1xuXG4gICAgLy8gU2VjdXJpdHkgZ3JvdXAgZm9yIGRhdGFiYXNlXG4gICAgY29uc3QgZGJTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdEYXRhYmFzZVNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGM6IHRoaXMudnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgUG9zdGdyZVNRTCBkYXRhYmFzZScsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZSxcbiAgICB9KTtcblxuICAgIC8vIFNlY3VyaXR5IGdyb3VwIGZvciBMYW1iZGEgZnVuY3Rpb25zXG4gICAgY29uc3QgbGFtYmRhU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnTGFtYmRhU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBMYW1iZGEgZnVuY3Rpb25zJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBTZWN1cml0eSBncm91cCBmb3IgUkRTIFByb3h5XG4gICAgY29uc3QgcHJveHlTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdQcm94eVNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGM6IHRoaXMudnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgUkRTIFByb3h5JyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBSRFMgUHJveHkgdG8gY29ubmVjdCB0byBkYXRhYmFzZVxuICAgIGRiU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIHByb3h5U2VjdXJpdHlHcm91cCxcbiAgICAgIGVjMi5Qb3J0LnRjcCg1NDMyKSxcbiAgICAgICdBbGxvdyBSRFMgUHJveHkgdG8gY29ubmVjdCB0byBkYXRhYmFzZSdcbiAgICApO1xuXG4gICAgLy8gQWxsb3cgTGFtYmRhIGZ1bmN0aW9ucyAob3V0c2lkZSBWUEMpIHRvIGNvbm5lY3QgdG8gUkRTIFByb3h5XG4gICAgLy8gTm90ZTogVGhpcyBuZWVkcyB0byBiZSBtb3JlIHJlc3RyaWN0aXZlIGluIHByb2R1Y3Rpb25cbiAgICBwcm94eVNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoNTQzMiksXG4gICAgICAnQWxsb3cgTGFtYmRhIGZ1bmN0aW9ucyBvdXRzaWRlIFZQQyB0byBjb25uZWN0IHRvIFJEUyBQcm94eSdcbiAgICApO1xuXG4gICAgLy8gQXVyb3JhIFNlcnZlcmxlc3MgdjIgUG9zdGdyZVNRTCBDbHVzdGVyIHdpdGggSUFNIEF1dGhlbnRpY2F0aW9uXG4gICAgdGhpcy5kYXRhYmFzZSA9IG5ldyByZHMuRGF0YWJhc2VDbHVzdGVyKHRoaXMsICdTZXJlbnlhRGF0YWJhc2UnLCB7XG4gICAgICBlbmdpbmU6IHJkcy5EYXRhYmFzZUNsdXN0ZXJFbmdpbmUuYXVyb3JhUG9zdGdyZXMoe1xuICAgICAgICB2ZXJzaW9uOiByZHMuQXVyb3JhUG9zdGdyZXNFbmdpbmVWZXJzaW9uLlZFUl8xNV84LFxuICAgICAgfSksXG4gICAgICBzZXJ2ZXJsZXNzVjJNaW5DYXBhY2l0eTogMC41LCAvLyBNaW5pbXVtIDAuNSBBQ1UgZm9yIGNvc3Qgb3B0aW1pemF0aW9uXG4gICAgICBzZXJ2ZXJsZXNzVjJNYXhDYXBhY2l0eTogMTYsICAvLyBNYXhpbXVtIDE2IEFDVSBmb3Igc2NhbGFiaWxpdHlcbiAgICAgIGNyZWRlbnRpYWxzOiByZHMuQ3JlZGVudGlhbHMuZnJvbVNlY3JldCh0aGlzLmRiU2VjcmV0KSxcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYlNlY3VyaXR5R3JvdXBdLFxuICAgICAgZGVmYXVsdERhdGFiYXNlTmFtZTogJ3NlcmVueWEnLFxuICAgICAgc3RvcmFnZUVuY3J5cHRlZDogdHJ1ZSxcbiAgICAgIHN0b3JhZ2VFbmNyeXB0aW9uS2V5OiBlbmNyeXB0aW9uS2V5LFxuICAgICAgaWFtQXV0aGVudGljYXRpb246IHRydWUsIC8vIEVuYWJsZSBJQU0gYXV0aGVudGljYXRpb24gZm9yIFZQQyBlbGltaW5hdGlvblxuICAgICAgY29weVRhZ3NUb1NuYXBzaG90OiB0cnVlLFxuICAgICAgY2xvdWR3YXRjaExvZ3NFeHBvcnRzOiBbJ3Bvc3RncmVzcWwnXSwgLy8gRW5oYW5jZWQgbG9nZ2luZ1xuICAgICAgbW9uaXRvcmluZ0ludGVydmFsOiBjZGsuRHVyYXRpb24ubWludXRlcygxKSwgLy8gRGV0YWlsZWQgbW9uaXRvcmluZ1xuICAgICAgYmFja3VwOiB7XG4gICAgICAgIHJldGVudGlvbjogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICB9LFxuICAgICAgZGVsZXRpb25Qcm90ZWN0aW9uOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnLFxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlNOQVBTSE9UIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHdyaXRlcjogcmRzLkNsdXN0ZXJJbnN0YW5jZS5zZXJ2ZXJsZXNzVjIoJ3dyaXRlcicpLFxuICAgIH0pO1xuXG4gICAgLy8gUkRTIFByb3h5IGZvciBMYW1iZGEgb3V0c2lkZSBWUEMgY29ubmVjdGl2aXR5XG4gICAgY29uc3QgcmRzUHJveHkgPSBuZXcgcmRzLkRhdGFiYXNlUHJveHkodGhpcywgJ0RhdGFiYXNlUHJveHknLCB7XG4gICAgICBwcm94eVRhcmdldDogcmRzLlByb3h5VGFyZ2V0LmZyb21DbHVzdGVyKHRoaXMuZGF0YWJhc2UpLFxuICAgICAgc2VjcmV0czogW3RoaXMuZGJTZWNyZXRdLFxuICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFVCTElDLFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbcHJveHlTZWN1cml0eUdyb3VwXSxcbiAgICAgIGlhbUF1dGg6IHRydWUsIC8vIEVuYWJsZSBJQU0gYXV0aGVudGljYXRpb24gdGhyb3VnaCBwcm94eVxuICAgICAgcmVxdWlyZVRMUzogdHJ1ZSxcbiAgICAgIGlkbGVDbGllbnRUaW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygzMCksXG4gICAgICBtYXhDb25uZWN0aW9uc1BlcmNlbnQ6IDEwMCxcbiAgICAgIG1heElkbGVDb25uZWN0aW9uc1BlcmNlbnQ6IDUwLFxuICAgICAgZGVidWdMb2dnaW5nOiBlbnZpcm9ubWVudCAhPT0gJ3Byb2QnLCAvLyBFbmFibGUgZGVidWcgbG9nZ2luZyBmb3Igbm9uLXByb2RcbiAgICB9KTtcblxuICAgIC8vIFN0b3JlIFJEUyBQcm94eSBlbmRwb2ludCBmb3IgTGFtYmRhIGZ1bmN0aW9uc1xuICAgIGNvbnN0IHJkc1Byb3h5RW5kcG9pbnQgPSByZHNQcm94eS5lbmRwb2ludDtcblxuICAgIC8vIFNlY3JldHMgTWFuYWdlciBmb3IgQVBJIGtleXNcbiAgICBjb25zdCBhcGlTZWNyZXRzID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnU2VyZW55YUFwaVNlY3JldHMnLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYFNlcmVueWEgJHtlbnZpcm9ubWVudH0gQVBJIHNlY3JldHNgLFxuICAgICAgc2VjcmV0TmFtZTogYHNlcmVueWEvJHtlbnZpcm9ubWVudH0vYXBpLXNlY3JldHNgLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHsgXG4gICAgICAgICAgand0U2VjcmV0OiAnJyxcbiAgICAgICAgICBhbnRocm9waWNBcGlLZXk6ICcnLFxuICAgICAgICAgIGdvb2dsZUNsaWVudElkOiAnJyxcbiAgICAgICAgICBnb29nbGVDbGllbnRTZWNyZXQ6ICcnXG4gICAgICAgIH0pLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogJ2p3dFNlY3JldCcsXG4gICAgICAgIGV4Y2x1ZGVDaGFyYWN0ZXJzOiAnXCJAL1xcXFwnLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogNjQsXG4gICAgICB9LFxuICAgICAgZW5jcnlwdGlvbktleSxcbiAgICB9KTtcblxuICAgIC8vIFMzIGJ1Y2tldCBmb3IgdGVtcG9yYXJ5IGZpbGUgc3RvcmFnZVxuICAgIHRoaXMudGVtcEZpbGVzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnVGVtcEZpbGVzQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYHNlcmVueWEtdGVtcC1maWxlcy0ke2Vudmlyb25tZW50fS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5LTVMsXG4gICAgICBlbmNyeXB0aW9uS2V5LFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIGVuZm9yY2VTU0w6IHRydWUsXG4gICAgICB2ZXJzaW9uZWQ6IGZhbHNlLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdEZWxldGVUZW1wRmlsZXMnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMSksIC8vIFByaW1hcnkgY2xlYW51cCBhZnRlciAxIGRheVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdEZWxldGVJbmNvbXBsZXRlVXBsb2FkcycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW3MzLkh0dHBNZXRob2RzLlBPU1QsIHMzLkh0dHBNZXRob2RzLlBVVF0sXG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IGNvbmZpZy5hbGxvd09yaWdpbnMsXG4gICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFsnKiddLFxuICAgICAgICAgIG1heEFnZTogMzYwMCxcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cblxuICAgIC8vIExhbWJkYSBleGVjdXRpb24gcm9sZSB3aXRoIGxlYXN0IHByaXZpbGVnZSBhbmQgSUFNIGRhdGFiYXNlIGFjY2Vzc1xuICAgIGNvbnN0IGxhbWJkYUV4ZWN1dGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0xhbWJkYUV4ZWN1dGlvblJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgICAgLy8gTm90ZTogQ2xvdWRXYXRjaExhbWJkYUluc2lnaHRzRXhlY3V0aW9uUm9sZVBvbGljeSBpcyBhdXRvbWF0aWNhbGx5IGFkZGVkIGJ5IExhbWJkYSB3aGVuIGluc2lnaHRzVmVyc2lvbiBpcyBzcGVjaWZpZWRcbiAgICAgIF0sXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBTZXJlbnlhTGFtYmRhUG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICAvLyBSRFMgcGVybWlzc2lvbnMgZm9yIElBTSBhdXRoZW50aWNhdGlvbiB2aWEgUkRTIFByb3h5XG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdyZHMtZGI6Y29ubmVjdCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIGBhcm46YXdzOnJkcy1kYjoke2NvbmZpZy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpkYnVzZXI6JHt0aGlzLmRhdGFiYXNlLmNsdXN0ZXJSZXNvdXJjZUlkZW50aWZpZXJ9L2xhbWJkYV91c2VyYCxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgLy8gUzMgcGVybWlzc2lvbnNcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOkRlbGV0ZU9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdEFjbCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Ake3RoaXMudGVtcEZpbGVzQnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAvLyBTZWNyZXRzIE1hbmFnZXIgcGVybWlzc2lvbnNcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlJyxcbiAgICAgICAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6Q3JlYXRlU2VjcmV0JyxcbiAgICAgICAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6VXBkYXRlU2VjcmV0JyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYXBpU2VjcmV0cy5zZWNyZXRBcm4sIHRoaXMuZGJTZWNyZXQuc2VjcmV0QXJuLCBgYXJuOmF3czpzZWNyZXRzbWFuYWdlcjoke2NvbmZpZy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpzZWNyZXQ6c2VyZW55YS8ke2Vudmlyb25tZW50fS9hcHAtZGF0YWJhc2UqYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIC8vIEtNUyBwZXJtaXNzaW9uc1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAna21zOkRlY3J5cHQnLFxuICAgICAgICAgICAgICAgICdrbXM6R2VuZXJhdGVEYXRhS2V5JyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbZW5jcnlwdGlvbktleS5rZXlBcm5dLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAvLyBEeW5hbW9EQiBwZXJtaXNzaW9ucyBmb3IgUGhhc2UgMSBtaWdyYXRpb25cbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOkRlbGV0ZUl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlNjYW4nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpCYXRjaEdldEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpCYXRjaFdyaXRlSXRlbScsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIHRoaXMuZHluYW1vREJUYWJsZS50YWJsZS50YWJsZUFybixcbiAgICAgICAgICAgICAgICBgJHt0aGlzLmR5bmFtb0RCVGFibGUudGFibGUudGFibGVBcm59L2luZGV4LypgLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAvLyBCZWRyb2NrIHBlcm1pc3Npb25zIGZvciBBSSBjaGF0IGZ1bmN0aW9uYWxpdHlcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2JlZHJvY2s6SW52b2tlTW9kZWwnLFxuICAgICAgICAgICAgICAgICdiZWRyb2NrOkludm9rZU1vZGVsV2l0aFJlc3BvbnNlU3RyZWFtJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgYGFybjphd3M6YmVkcm9jazoke2NvbmZpZy5yZWdpb259Ojpmb3VuZGF0aW9uLW1vZGVsL2FudGhyb3BpYy5jbGF1ZGUtMy1oYWlrdS0yMDI0MDMwNy12MTowYCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7Y29uZmlnLnJlZ2lvbn06OmZvdW5kYXRpb24tbW9kZWwvYW50aHJvcGljLmNsYXVkZS0zLXNvbm5ldC0yMDI0MDIyOS12MTowYCxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENvbW1vbiBMYW1iZGEgZW52aXJvbm1lbnQgdmFyaWFibGVzIHdpdGggSUFNIGF1dGhlbnRpY2F0aW9uIHZpYSBSRFMgUHJveHlcbiAgICBjb25zdCBjb21tb25MYW1iZGFFbnZpcm9ubWVudCA9IHtcbiAgICAgIFJFR0lPTjogY29uZmlnLnJlZ2lvbixcbiAgICAgIEVOVklST05NRU5UOiBlbnZpcm9ubWVudCxcbiAgICAgIERCX0hPU1Q6IHJkc1Byb3h5RW5kcG9pbnQsIC8vIFVzZSBSRFMgUHJveHkgZW5kcG9pbnQgaW5zdGVhZCBvZiBjbHVzdGVyIGVuZHBvaW50XG4gICAgICBEQl9QT1JUOiAnNTQzMicsIC8vIFJEUyBQcm94eSB1c2VzIHN0YW5kYXJkIFBvc3RncmVTUUwgcG9ydFxuICAgICAgREJfTkFNRTogJ3NlcmVueWEnLFxuICAgICAgREJfQVVUSF9NRVRIT0Q6ICdpYW0nLCAvLyBVc2UgSUFNIGF1dGhlbnRpY2F0aW9uXG4gICAgICBEQl9VU0VSTkFNRTogJ2xhbWJkYV91c2VyJywgLy8gSUFNIGRhdGFiYXNlIHVzZXJcbiAgICAgIERCX1NFQ1JFVF9BUk46IHRoaXMuZGJTZWNyZXQuc2VjcmV0QXJuLCAvLyBLZWVwIGZvciBjb21wYXRpYmlsaXR5IGR1cmluZyBtaWdyYXRpb25cbiAgICAgIFJEU19QUk9YWV9FTkRQT0lOVDogcmRzUHJveHlFbmRwb2ludCwgLy8gRXhwbGljaXQgcHJveHkgZW5kcG9pbnQgZm9yIGNsYXJpdHlcbiAgICAgIC8vIFBoYXNlIDE6IER5bmFtb0RCIENvbmZpZ3VyYXRpb25cbiAgICAgIERZTkFNT19UQUJMRV9OQU1FOiB0aGlzLmR5bmFtb0RCVGFibGUudGFibGUudGFibGVOYW1lLFxuICAgICAgVEVNUF9CVUNLRVRfTkFNRTogdGhpcy50ZW1wRmlsZXNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIEFQSV9TRUNSRVRTX0FSTjogYXBpU2VjcmV0cy5zZWNyZXRBcm4sXG4gICAgICBLTVNfS0VZX0lEOiBlbmNyeXB0aW9uS2V5LmtleUlkLFxuICAgICAgRU5BQkxFX0RFVEFJTEVEX0xPR0dJTkc6IGNvbmZpZy5lbmFibGVEZXRhaWxlZExvZ2dpbmcudG9TdHJpbmcoKSxcbiAgICAgIExPR19MRVZFTDogJ0lORk8nLFxuICAgICAgRU5BQkxFX1JFUVVFU1RfTE9HR0lORzogJ3RydWUnLFxuICAgICAgRU5BQkxFX1BFUkZPUk1BTkNFX01PTklUT1JJTkc6ICd0cnVlJyxcbiAgICB9O1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9ucyB3aXRob3V0IFZQQyAtIGRpcmVjdCBBV1Mgc2VydmljZSBhY2Nlc3NcbiAgICBjb25zdCBhdXRoRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBdXRoRnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdhdXRoLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL2F1dGgnKSksXG4gICAgICByb2xlOiBsYW1iZGFFeGVjdXRpb25Sb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkxhbWJkYUVudmlyb25tZW50LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgaW5zaWdodHNWZXJzaW9uOiBsYW1iZGEuTGFtYmRhSW5zaWdodHNWZXJzaW9uLlZFUlNJT05fMV8wXzIyOV8wLCAvLyBFbmhhbmNlZCBtb25pdG9yaW5nXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsIC8vIEVuYWJsZSBYLVJheSB0cmFjaW5nXG4gICAgICBkZXNjcmlwdGlvbjogJ0dvb2dsZSBPQXV0aCB2ZXJpZmljYXRpb24gYW5kIEpXVCBnZW5lcmF0aW9uJyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHVzZXJQcm9maWxlRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdVc2VyUHJvZmlsZUZ1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAndXNlclByb2ZpbGUuaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvdXNlcicpKSxcbiAgICAgIHJvbGU6IGxhbWJkYUV4ZWN1dGlvblJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uTGFtYmRhRW52aXJvbm1lbnQsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxNSksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICBpbnNpZ2h0c1ZlcnNpb246IGxhbWJkYS5MYW1iZGFJbnNpZ2h0c1ZlcnNpb24uVkVSU0lPTl8xXzBfMjI5XzAsXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1VzZXIgcHJvZmlsZSBtYW5hZ2VtZW50JyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHVwbG9hZEZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnVXBsb2FkRnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICd1cGxvYWQuaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvdXBsb2FkJykpLFxuICAgICAgcm9sZTogbGFtYmRhRXhlY3V0aW9uUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25MYW1iZGFFbnZpcm9ubWVudCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIGluc2lnaHRzVmVyc2lvbjogbGFtYmRhLkxhbWJkYUluc2lnaHRzVmVyc2lvbi5WRVJTSU9OXzFfMF8yMjlfMCxcbiAgICAgIHRyYWNpbmc6IGxhbWJkYS5UcmFjaW5nLkFDVElWRSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRmlsZSB1cGxvYWQgd2l0aCB2aXJ1cyBzY2FubmluZycsXG4gICAgfSk7XG5cbiAgICBjb25zdCBwcm9jZXNzRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdQcm9jZXNzRnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdwcm9jZXNzLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL3Byb2Nlc3MnKSksXG4gICAgICByb2xlOiBsYW1iZGFFeGVjdXRpb25Sb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkxhbWJkYUVudmlyb25tZW50LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMyksXG4gICAgICBtZW1vcnlTaXplOiAxMDI0LFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgaW5zaWdodHNWZXJzaW9uOiBsYW1iZGEuTGFtYmRhSW5zaWdodHNWZXJzaW9uLlZFUlNJT05fMV8wXzIyOV8wLFxuICAgICAgdHJhY2luZzogbGFtYmRhLlRyYWNpbmcuQUNUSVZFLFxuICAgICAgZGVzY3JpcHRpb246ICdBSSBwcm9jZXNzaW5nIHdpdGggQW50aHJvcGljIENsYXVkZScsXG4gICAgfSk7XG5cbiAgICBjb25zdCBzdGF0dXNGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1N0YXR1c0Z1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnc3RhdHVzLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL3N0YXR1cycpKSxcbiAgICAgIHJvbGU6IGxhbWJkYUV4ZWN1dGlvblJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uTGFtYmRhRW52aXJvbm1lbnQsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxNSksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICBpbnNpZ2h0c1ZlcnNpb246IGxhbWJkYS5MYW1iZGFJbnNpZ2h0c1ZlcnNpb24uVkVSU0lPTl8xXzBfMjI5XzAsXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2Nlc3Npbmcgc3RhdHVzIHRyYWNraW5nJyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHJlc3VsdEZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUmVzdWx0RnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdyZXN1bHQuaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvcmVzdWx0JykpLFxuICAgICAgcm9sZTogbGFtYmRhRXhlY3V0aW9uUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25MYW1iZGFFbnZpcm9ubWVudCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIGluc2lnaHRzVmVyc2lvbjogbGFtYmRhLkxhbWJkYUluc2lnaHRzVmVyc2lvbi5WRVJTSU9OXzFfMF8yMjlfMCxcbiAgICAgIHRyYWNpbmc6IGxhbWJkYS5UcmFjaW5nLkFDVElWRSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUmVzdWx0cyByZXRyaWV2YWwnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmV0cnlGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1JldHJ5RnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdyZXRyeS5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy9yZXRyeScpKSxcbiAgICAgIHJvbGU6IGxhbWJkYUV4ZWN1dGlvblJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uTGFtYmRhRW52aXJvbm1lbnQsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICBpbnNpZ2h0c1ZlcnNpb246IGxhbWJkYS5MYW1iZGFJbnNpZ2h0c1ZlcnNpb24uVkVSU0lPTl8xXzBfMjI5XzAsXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2Nlc3NpbmcgcmV0cnkgbWFuYWdlbWVudCcsXG4gICAgfSk7XG5cbiAgICBjb25zdCBkb2N0b3JSZXBvcnRGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0RvY3RvclJlcG9ydEZ1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnZG9jdG9yUmVwb3J0LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL2RvY3Rvci1yZXBvcnQnKSksXG4gICAgICByb2xlOiBsYW1iZGFFeGVjdXRpb25Sb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkxhbWJkYUVudmlyb25tZW50LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMiksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICBpbnNpZ2h0c1ZlcnNpb246IGxhbWJkYS5MYW1iZGFJbnNpZ2h0c1ZlcnNpb24uVkVSU0lPTl8xXzBfMjI5XzAsXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1ByZW1pdW0gZG9jdG9yIHJlcG9ydCBnZW5lcmF0aW9uJyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGNsZWFudXBGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0NsZWFudXBGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2NsZWFudXAuaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvY2xlYW51cCcpKSxcbiAgICAgIHJvbGU6IGxhbWJkYUV4ZWN1dGlvblJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uTGFtYmRhRW52aXJvbm1lbnQsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICBpbnNpZ2h0c1ZlcnNpb246IGxhbWJkYS5MYW1iZGFJbnNpZ2h0c1ZlcnNpb24uVkVSU0lPTl8xXzBfMjI5XzAsXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1MzIHRlbXBvcmFyeSBmaWxlIGNsZWFudXAgYWZ0ZXIgc3VjY2Vzc2Z1bCBGbHV0dGVyIHN0b3JhZ2UnLFxuICAgIH0pO1xuXG4gICAgLy8gSldUIEF1dGhvcml6ZXIgTGFtYmRhICBcbiAgICBjb25zdCBhdXRob3JpemVyRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBdXRob3JpemVyRnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdhdXRob3JpemVyLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL2F1dGhvcml6ZXInKSksXG4gICAgICByb2xlOiBsYW1iZGFFeGVjdXRpb25Sb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgLi4uY29tbW9uTGFtYmRhRW52aXJvbm1lbnQsXG4gICAgICAgIFRPS0VOX0lTU1VFUjogJ3NlcmVueWEuaGVhbHRoJyxcbiAgICAgICAgVE9LRU5fQVVESUVOQ0U6ICdzZXJlbnlhLW1vYmlsZS1hcHAnLFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDE1KSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIGluc2lnaHRzVmVyc2lvbjogbGFtYmRhLkxhbWJkYUluc2lnaHRzVmVyc2lvbi5WRVJTSU9OXzFfMF8yMjlfMCxcbiAgICAgIHRyYWNpbmc6IGxhbWJkYS5UcmFjaW5nLkFDVElWRSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnSldUIHRva2VuIGF1dGhvcml6YXRpb24nLFxuICAgIH0pO1xuXG4gICAgLy8gRGF0YWJhc2UgaW5pdGlhbGl6YXRpb24gTGFtYmRhIChmb3IgbWFudWFsIHNjaGVtYSBzZXR1cClcbiAgICBjb25zdCBkYkluaXRGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0RhdGFiYXNlSW5pdEZ1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvZGItaW5pdCcpKSxcbiAgICAgIHJvbGU6IGxhbWJkYUV4ZWN1dGlvblJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uTGFtYmRhRW52aXJvbm1lbnQsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIGluc2lnaHRzVmVyc2lvbjogbGFtYmRhLkxhbWJkYUluc2lnaHRzVmVyc2lvbi5WRVJTSU9OXzFfMF8yMjlfMCxcbiAgICAgIHRyYWNpbmc6IGxhbWJkYS5UcmFjaW5nLkFDVElWRSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGF0YWJhc2Ugc2NoZW1hIGluaXRpYWxpemF0aW9uIGFuZCBtaWdyYXRpb25zJyxcbiAgICB9KTtcblxuICAgIC8vIENoYXQgTGFtYmRhIGZ1bmN0aW9uc1xuICAgIGNvbnN0IGNoYXRQcm9tcHRzRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdDaGF0UHJvbXB0c0Z1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnY2hhdFByb21wdHMuaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvY2hhdC1wcm9tcHRzJykpLFxuICAgICAgcm9sZTogbGFtYmRhRXhlY3V0aW9uUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25MYW1iZGFFbnZpcm9ubWVudCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDE1KSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIGluc2lnaHRzVmVyc2lvbjogbGFtYmRhLkxhbWJkYUluc2lnaHRzVmVyc2lvbi5WRVJTSU9OXzFfMF8yMjlfMCxcbiAgICAgIHRyYWNpbmc6IGxhbWJkYS5UcmFjaW5nLkFDVElWRSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ2hhdCBwcm9tcHRzIHJldHJpZXZhbCBmb3IgY29udmVyc2F0aW9uIHN0YXJ0ZXJzJyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGNoYXRNZXNzYWdlc0Z1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQ2hhdE1lc3NhZ2VzRnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdjaGF0TWVzc2FnZXMuaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvY2hhdC1tZXNzYWdlcycpKSxcbiAgICAgIHJvbGU6IGxhbWJkYUV4ZWN1dGlvblJvbGUsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAuLi5jb21tb25MYW1iZGFFbnZpcm9ubWVudCxcbiAgICAgICAgQkVEUk9DS19NT0RFTF9JRDogJ2FudGhyb3BpYy5jbGF1ZGUtMy1oYWlrdS0yMDI0MDMwNy12MTowJyxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICBpbnNpZ2h0c1ZlcnNpb246IGxhbWJkYS5MYW1iZGFJbnNpZ2h0c1ZlcnNpb24uVkVSU0lPTl8xXzBfMjI5XzAsXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NoYXQgbWVzc2FnZSBwcm9jZXNzaW5nIHdpdGggQUkgcmVzcG9uc2UgZ2VuZXJhdGlvbicsXG4gICAgfSk7XG5cbiAgICBjb25zdCBjaGF0U3RhdHVzRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdDaGF0U3RhdHVzRnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdjaGF0U3RhdHVzLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL2NoYXQtc3RhdHVzJykpLFxuICAgICAgcm9sZTogbGFtYmRhRXhlY3V0aW9uUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25MYW1iZGFFbnZpcm9ubWVudCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDE1KSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIGluc2lnaHRzVmVyc2lvbjogbGFtYmRhLkxhbWJkYUluc2lnaHRzVmVyc2lvbi5WRVJTSU9OXzFfMF8yMjlfMCxcbiAgICAgIHRyYWNpbmc6IGxhbWJkYS5UcmFjaW5nLkFDVElWRSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ2hhdCByZXNwb25zZSBzdGF0dXMgcG9sbGluZycsXG4gICAgfSk7XG5cbiAgICBjb25zdCBzdWJzY3JpcHRpb25zRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdTdWJzY3JpcHRpb25zRnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdzdWJzY3JpcHRpb25zLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL3N1YnNjcmlwdGlvbnMnKSksXG4gICAgICByb2xlOiBsYW1iZGFFeGVjdXRpb25Sb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkxhbWJkYUVudmlyb25tZW50LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTUpLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgaW5zaWdodHNWZXJzaW9uOiBsYW1iZGEuTGFtYmRhSW5zaWdodHNWZXJzaW9uLlZFUlNJT05fMV8wXzIyOV8wLFxuICAgICAgdHJhY2luZzogbGFtYmRhLlRyYWNpbmcuQUNUSVZFLFxuICAgICAgZGVzY3JpcHRpb246ICdTdWJzY3JpcHRpb24gbWFuYWdlbWVudCBhbmQgYmlsbGluZycsXG4gICAgfSk7XG5cbiAgICAvLyBDdXN0b20gYXV0aG9yaXplclxuICAgIGNvbnN0IGp3dEF1dGhvcml6ZXIgPSBuZXcgYXBpZ2F0ZXdheS5Ub2tlbkF1dGhvcml6ZXIodGhpcywgJ0pXVEF1dGhvcml6ZXInLCB7XG4gICAgICBoYW5kbGVyOiBhdXRob3JpemVyRnVuY3Rpb24sXG4gICAgICBpZGVudGl0eVNvdXJjZTogJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5BdXRob3JpemF0aW9uJyxcbiAgICAgIHJlc3VsdHNDYWNoZVR0bDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBhdXRob3JpemVyTmFtZTogJ1NlcmVueWFKV1RBdXRob3JpemVyJyxcbiAgICB9KTtcblxuICAgIC8vIEFQSSBHYXRld2F5XG4gICAgdGhpcy5hcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdTZXJlbnlhQXBpJywge1xuICAgICAgcmVzdEFwaU5hbWU6IGBzZXJlbnlhLWFwaS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFNlcmVueWEgQUkgSGVhbHRoIEFnZW50IEFQSSAtICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGNvbmZpZy5hbGxvd09yaWdpbnMsXG4gICAgICAgIGFsbG93TWV0aG9kczogWydHRVQnLCAnUE9TVCcsICdQVVQnLCAnREVMRVRFJywgJ09QVElPTlMnXSxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZScsXG4gICAgICAgICAgJ1gtQW16LURhdGUnLCBcbiAgICAgICAgICAnQXV0aG9yaXphdGlvbicsXG4gICAgICAgICAgJ1gtQXBpLUtleScsXG4gICAgICAgICAgJ1gtQW16LVNlY3VyaXR5LVRva2VuJyxcbiAgICAgICAgICAnWC1BbXotVXNlci1BZ2VudCcsXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93Q3JlZGVudGlhbHM6IHRydWUsXG4gICAgICB9LFxuICAgICAgZGVwbG95T3B0aW9uczoge1xuICAgICAgICBzdGFnZU5hbWU6IGVudmlyb25tZW50LFxuICAgICAgICBsb2dnaW5nTGV2ZWw6IGNvbmZpZy5lbmFibGVEZXRhaWxlZExvZ2dpbmcgXG4gICAgICAgICAgPyBhcGlnYXRld2F5Lk1ldGhvZExvZ2dpbmdMZXZlbC5JTkZPIFxuICAgICAgICAgIDogYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuRVJST1IsXG4gICAgICAgIGRhdGFUcmFjZUVuYWJsZWQ6IGNvbmZpZy5lbmFibGVEZXRhaWxlZExvZ2dpbmcsXG4gICAgICAgIG1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICB0aHJvdHRsaW5nUmF0ZUxpbWl0OiAxMDAsXG4gICAgICAgIHRocm90dGxpbmdCdXJzdExpbWl0OiAyMDAsXG4gICAgICB9LFxuICAgICAgZW5kcG9pbnRDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIHR5cGVzOiBbYXBpZ2F0ZXdheS5FbmRwb2ludFR5cGUuUkVHSU9OQUxdLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEFQSSBHYXRld2F5IHJlc291cmNlcyBhbmQgbWV0aG9kc1xuICAgIHRoaXMuc2V0dXBBcGlSb3V0ZXMoand0QXV0aG9yaXplciwge1xuICAgICAgYXV0aDogYXV0aEZ1bmN0aW9uLFxuICAgICAgdXNlclByb2ZpbGU6IHVzZXJQcm9maWxlRnVuY3Rpb24sXG4gICAgICB1cGxvYWQ6IHVwbG9hZEZ1bmN0aW9uLFxuICAgICAgcHJvY2VzczogcHJvY2Vzc0Z1bmN0aW9uLFxuICAgICAgc3RhdHVzOiBzdGF0dXNGdW5jdGlvbixcbiAgICAgIHJlc3VsdDogcmVzdWx0RnVuY3Rpb24sXG4gICAgICByZXRyeTogcmV0cnlGdW5jdGlvbixcbiAgICAgIGRvY3RvclJlcG9ydDogZG9jdG9yUmVwb3J0RnVuY3Rpb24sXG4gICAgICBjbGVhbnVwOiBjbGVhbnVwRnVuY3Rpb24sXG4gICAgICBjaGF0UHJvbXB0czogY2hhdFByb21wdHNGdW5jdGlvbixcbiAgICAgIGNoYXRNZXNzYWdlczogY2hhdE1lc3NhZ2VzRnVuY3Rpb24sXG4gICAgICBjaGF0U3RhdHVzOiBjaGF0U3RhdHVzRnVuY3Rpb24sXG4gICAgICBzdWJzY3JpcHRpb25zOiBzdWJzY3JpcHRpb25zRnVuY3Rpb24sXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIExvZyBHcm91cHMgd2l0aCByZXRlbnRpb25cbiAgICBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnQXBpR2F0ZXdheUxvZ0dyb3VwJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy9hcGlnYXRld2F5L3NlcmVueWEtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIE5vdGU6IFJlbW92ZWQgUzMgZXZlbnQgbm90aWZpY2F0aW9uIC0gcHJvY2Vzc2luZyBub3cgdHJpZ2dlcmVkIGRpcmVjdGx5IHZpYSBBUElcblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpVXJsJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VyZW55YSBBUEkgR2F0ZXdheSBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogYHNlcmVueWEtYXBpLXVybC0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hcGkucmVzdEFwaUlkLFxuICAgICAgZGVzY3JpcHRpb246ICdTZXJlbnlhIEFQSSBHYXRld2F5IElEJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBzZXJlbnlhLWFwaS1pZC0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVGVtcEJ1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy50ZW1wRmlsZXNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGVtcG9yYXJ5IGZpbGVzIFMzIGJ1Y2tldCBuYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBzZXJlbnlhLXRlbXAtYnVja2V0LSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdLbXNLZXlJZCcsIHtcbiAgICAgIHZhbHVlOiBlbmNyeXB0aW9uS2V5LmtleUlkLFxuICAgICAgZGVzY3JpcHRpb246ICdLTVMgZW5jcnlwdGlvbiBrZXkgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYHNlcmVueWEta21zLWtleS0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGF0YWJhc2VIb3N0Jywge1xuICAgICAgdmFsdWU6IHRoaXMuZGF0YWJhc2UuY2x1c3RlckVuZHBvaW50Lmhvc3RuYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdQb3N0Z3JlU1FMIGRhdGFiYXNlIGhvc3RuYW1lIChkaXJlY3QgYWNjZXNzKScsXG4gICAgICBleHBvcnROYW1lOiBgc2VyZW55YS1kYi1ob3N0LSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdSZHNQcm94eUVuZHBvaW50Jywge1xuICAgICAgdmFsdWU6IHJkc1Byb3h5RW5kcG9pbnQsXG4gICAgICBkZXNjcmlwdGlvbjogJ1JEUyBQcm94eSBlbmRwb2ludCBmb3IgTGFtYmRhIGZ1bmN0aW9ucycsXG4gICAgICBleHBvcnROYW1lOiBgc2VyZW55YS1yZHMtcHJveHktJHtlbnZpcm9ubWVudH1gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RhdGFiYXNlUG9ydCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmRhdGFiYXNlLmNsdXN0ZXJFbmRwb2ludC5wb3J0LnRvU3RyaW5nKCksXG4gICAgICBkZXNjcmlwdGlvbjogJ1Bvc3RncmVTUUwgZGF0YWJhc2UgcG9ydCcsXG4gICAgICBleHBvcnROYW1lOiBgc2VyZW55YS1kYi1wb3J0LSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEYXRhYmFzZVNlY3JldEFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmRiU2VjcmV0LnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGF0YWJhc2UgY3JlZGVudGlhbHMgc2VjcmV0IEFSTicsXG4gICAgICBleHBvcnROYW1lOiBgc2VyZW55YS1kYi1zZWNyZXQtJHtlbnZpcm9ubWVudH1gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1ZwY0lkJywge1xuICAgICAgdmFsdWU6IHRoaXMudnBjLnZwY0lkLFxuICAgICAgZGVzY3JpcHRpb246ICdWUEMgSUQgZm9yIGhlYWx0aGNhcmUgY29tcGxpYW5jZScsXG4gICAgICBleHBvcnROYW1lOiBgc2VyZW55YS12cGMtJHtlbnZpcm9ubWVudH1gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0R5bmFtb1RhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmR5bmFtb0RCVGFibGUudGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciBQaGFzZSAxIG1pZ3JhdGlvbicsXG4gICAgICBleHBvcnROYW1lOiBgc2VyZW55YS1keW5hbW8tdGFibGUtJHtlbnZpcm9ubWVudH1gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0R5bmFtb1RhYmxlQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuZHluYW1vREJUYWJsZS50YWJsZS50YWJsZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgdGFibGUgQVJOIGZvciBQaGFzZSAxIG1pZ3JhdGlvbicsXG4gICAgICBleHBvcnROYW1lOiBgc2VyZW55YS1keW5hbW8tdGFibGUtYXJuLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0dXBBcGlSb3V0ZXMoXG4gICAgYXV0aG9yaXplcjogYXBpZ2F0ZXdheS5Ub2tlbkF1dGhvcml6ZXIsXG4gICAgZnVuY3Rpb25zOiBSZWNvcmQ8c3RyaW5nLCBsYW1iZGEuRnVuY3Rpb24+XG4gICkge1xuICAgIC8vIEF1dGggcm91dGVzIChubyBhdXRob3JpemF0aW9uIHJlcXVpcmVkKVxuICAgIGNvbnN0IGF1dGggPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCdhdXRoJyk7XG4gICAgY29uc3QgZ29vZ2xlQXV0aCA9IGF1dGguYWRkUmVzb3VyY2UoJ2dvb2dsZScpO1xuICAgIGNvbnN0IGdvb2dsZU9uYm9hcmRpbmdBdXRoID0gYXV0aC5hZGRSZXNvdXJjZSgnZ29vZ2xlLW9uYm9hcmRpbmcnKTtcbiAgICBjb25zdCBvYXV0aE9uYm9hcmRpbmdBdXRoID0gYXV0aC5hZGRSZXNvdXJjZSgnb2F1dGgtb25ib2FyZGluZycpO1xuICAgIFxuICAgIC8vIEJvdGggcm91dGVzIHBvaW50IHRvIHRoZSBzYW1lIGF1dGggZnVuY3Rpb24gZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbiAgICBnb29nbGVBdXRoLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5hdXRoKSwge1xuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiAnMjAwJyxcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHN0YXR1c0NvZGU6ICc0MDAnLFxuICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogJzUwMCcsXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gR29vZ2xlIG9uYm9hcmRpbmcgYXV0aCByb3V0ZSAoc2FtZSBhcyBhYm92ZSBmb3IgRmx1dHRlciBhcHAgY29tcGF0aWJpbGl0eSlcbiAgICBnb29nbGVPbmJvYXJkaW5nQXV0aC5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMuYXV0aCksIHtcbiAgICAgIG1ldGhvZFJlc3BvbnNlczogW1xuICAgICAgICB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogJzIwMCcsXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiAnNDAwJyxcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHN0YXR1c0NvZGU6ICc1MDAnLFxuICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIE9BdXRoIG9uYm9hcmRpbmcgYXV0aCByb3V0ZSAod2hhdCBGbHV0dGVyIGFwcCBhY3R1YWxseSBjYWxscylcbiAgICBvYXV0aE9uYm9hcmRpbmdBdXRoLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5hdXRoKSwge1xuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiAnMjAwJyxcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHN0YXR1c0NvZGU6ICc0MDAnLFxuICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogJzUwMCcsXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gVXNlciByb3V0ZXMgKGF1dGhvcml6YXRpb24gcmVxdWlyZWQpXG4gICAgY29uc3QgdXNlciA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3VzZXInKTtcbiAgICBjb25zdCBwcm9maWxlID0gdXNlci5hZGRSZXNvdXJjZSgncHJvZmlsZScpO1xuICAgIHByb2ZpbGUuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMudXNlclByb2ZpbGUpLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgIH0pO1xuXG4gICAgLy8gUHJvY2Vzc2luZyByb3V0ZXMgKGF1dGhvcml6YXRpb24gcmVxdWlyZWQpXG4gICAgY29uc3QgYXBpVjEgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCdhcGknKS5hZGRSZXNvdXJjZSgndjEnKTtcbiAgICBjb25zdCBwcm9jZXNzID0gYXBpVjEuYWRkUmVzb3VyY2UoJ3Byb2Nlc3MnKTtcblxuICAgIC8vIFVwbG9hZCBlbmRwb2ludFxuICAgIGNvbnN0IHVwbG9hZCA9IHByb2Nlc3MuYWRkUmVzb3VyY2UoJ3VwbG9hZCcpO1xuICAgIHVwbG9hZC5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMudXBsb2FkKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdtZXRob2QucmVxdWVzdC5oZWFkZXIuQ29udGVudC1UeXBlJzogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBTdGF0dXMgZW5kcG9pbnRcbiAgICBjb25zdCBzdGF0dXMgPSBwcm9jZXNzLmFkZFJlc291cmNlKCdzdGF0dXMnKTtcbiAgICBjb25zdCBzdGF0dXNKb2JJZCA9IHN0YXR1cy5hZGRSZXNvdXJjZSgne2pvYklkfScpO1xuICAgIHN0YXR1c0pvYklkLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZnVuY3Rpb25zLnN0YXR1cyksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucGF0aC5qb2JJZCc6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gUmVzdWx0IGVuZHBvaW50XG4gICAgY29uc3QgcmVzdWx0ID0gcHJvY2Vzcy5hZGRSZXNvdXJjZSgncmVzdWx0Jyk7XG4gICAgY29uc3QgcmVzdWx0Sm9iSWQgPSByZXN1bHQuYWRkUmVzb3VyY2UoJ3tqb2JJZH0nKTtcbiAgICByZXN1bHRKb2JJZC5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5yZXN1bHQpLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnBhdGguam9iSWQnOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFJldHJ5IGVuZHBvaW50XG4gICAgY29uc3QgcmV0cnkgPSBwcm9jZXNzLmFkZFJlc291cmNlKCdyZXRyeScpO1xuICAgIGNvbnN0IHJldHJ5Sm9iSWQgPSByZXRyeS5hZGRSZXNvdXJjZSgne2pvYklkfScpO1xuICAgIHJldHJ5Sm9iSWQuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZnVuY3Rpb25zLnJldHJ5KSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdtZXRob2QucmVxdWVzdC5wYXRoLmpvYklkJzogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBEb2N0b3IgcmVwb3J0IGVuZHBvaW50IChwcmVtaXVtIGZlYXR1cmUpXG4gICAgY29uc3QgZG9jdG9yUmVwb3J0ID0gcHJvY2Vzcy5hZGRSZXNvdXJjZSgnZG9jdG9yLXJlcG9ydCcpO1xuICAgIGRvY3RvclJlcG9ydC5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMuZG9jdG9yUmVwb3J0KSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICB9KTtcblxuICAgIC8vIENsZWFudXAgZW5kcG9pbnQgZm9yIFMzIHRlbXBvcmFyeSBmaWxlc1xuICAgIGNvbnN0IGNsZWFudXAgPSBwcm9jZXNzLmFkZFJlc291cmNlKCdjbGVhbnVwJyk7XG4gICAgY29uc3QgY2xlYW51cEpvYklkID0gY2xlYW51cC5hZGRSZXNvdXJjZSgne2pvYklkfScpO1xuICAgIGNsZWFudXBKb2JJZC5hZGRNZXRob2QoJ0RFTEVURScsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5jbGVhbnVwKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdtZXRob2QucmVxdWVzdC5wYXRoLmpvYklkJzogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBSZXBvcnRzIEFQSSBlbmRwb2ludHMgKHByZW1pdW0gZmVhdHVyZXMpXG4gICAgY29uc3QgcmVwb3J0cyA9IGFwaVYxLmFkZFJlc291cmNlKCdyZXBvcnRzJyk7XG4gICAgXG5cbiAgICAvLyBDaGF0IEFQSSBlbmRwb2ludHMgKGF1dGhvcml6YXRpb24gcmVxdWlyZWQpXG4gICAgY29uc3QgY2hhdCA9IGFwaVYxLmFkZFJlc291cmNlKCdjaGF0Jyk7XG5cbiAgICAvLyBDaGF0IHByb21wdHMgZW5kcG9pbnQgLSBHRVQgL2FwaS92MS9jaGF0L3Byb21wdHM/Y29udGVudF90eXBlPXJlc3VsdHN8cmVwb3J0c1xuICAgIGNvbnN0IHByb21wdHMgPSBjaGF0LmFkZFJlc291cmNlKCdwcm9tcHRzJyk7XG4gICAgcHJvbXB0cy5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5jaGF0UHJvbXB0cyksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucXVlcnlzdHJpbmcuY29udGVudF90eXBlJzogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDaGF0IG1lc3NhZ2VzIGVuZHBvaW50IC0gUE9TVCAvYXBpL3YxL2NoYXQvbWVzc2FnZXNcbiAgICBjb25zdCBtZXNzYWdlcyA9IGNoYXQuYWRkUmVzb3VyY2UoJ21lc3NhZ2VzJyk7XG4gICAgbWVzc2FnZXMuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZnVuY3Rpb25zLmNoYXRNZXNzYWdlcyksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgfSk7XG5cbiAgICAvLyBDaGF0IGpvYnMgc3RhdHVzIGVuZHBvaW50IC0gR0VUIC9hcGkvdjEvY2hhdC9qb2JzL3tqb2JfaWR9L3N0YXR1c1xuICAgIGNvbnN0IGpvYnMgPSBjaGF0LmFkZFJlc291cmNlKCdqb2JzJyk7XG4gICAgY29uc3Qgam9iSWQgPSBqb2JzLmFkZFJlc291cmNlKCd7am9iX2lkfScpO1xuICAgIGNvbnN0IGpvYlN0YXR1cyA9IGpvYklkLmFkZFJlc291cmNlKCdzdGF0dXMnKTtcbiAgICBqb2JTdGF0dXMuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMuY2hhdFN0YXR1cyksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucGF0aC5qb2JfaWQnOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFN1YnNjcmlwdGlvbnMgQVBJIGVuZHBvaW50cyAoYXV0aG9yaXphdGlvbiByZXF1aXJlZClcbiAgICBjb25zdCBzdWJzY3JpcHRpb25zID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnc3Vic2NyaXB0aW9ucycpO1xuXG4gICAgLy8gQ3VycmVudCBzdWJzY3JpcHRpb24gZW5kcG9pbnQgLSBHRVQgL3N1YnNjcmlwdGlvbnMvY3VycmVudFxuICAgIGNvbnN0IGN1cnJlbnQgPSBzdWJzY3JpcHRpb25zLmFkZFJlc291cmNlKCdjdXJyZW50Jyk7XG4gICAgY3VycmVudC5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5zdWJzY3JpcHRpb25zKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICB9KTtcbiAgfVxufSJdfQ==