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
        // VPC for healthcare-compliant network isolation
        this.vpc = new ec2.Vpc(this, 'SerenyaVpc', {
            maxAzs: 2, // Multi-AZ for high availability
            natGateways: 1, // Cost optimization - single NAT gateway
            ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'Public',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                {
                    cidrMask: 24,
                    name: 'Private',
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
                {
                    cidrMask: 24,
                    name: 'Database',
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
            ],
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
        // Allow Lambda to access database on port 5432
        dbSecurityGroup.addIngressRule(lambdaSecurityGroup, ec2.Port.tcp(5432), 'Allow Lambda access to PostgreSQL');
        // Aurora Serverless v2 PostgreSQL Cluster
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
            backup: {
                retention: cdk.Duration.days(7),
            },
            deletionProtection: environment === 'prod',
            removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.SNAPSHOT : cdk.RemovalPolicy.DESTROY,
            writer: rds.ClusterInstance.serverlessV2('writer'),
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
        // Lambda execution role with least privilege
        const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
            ],
            inlinePolicies: {
                SerenyaLambdaPolicy: new iam.PolicyDocument({
                    statements: [
                        // RDS permissions for PostgreSQL access
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'rds-db:connect',
                            ],
                            resources: [
                                `arn:aws:rds-db:${config.region}:${this.account}:dbuser:${this.database.clusterResourceIdentifier}/serenya_app`,
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
        // Common Lambda environment variables
        const commonLambdaEnvironment = {
            REGION: config.region,
            ENVIRONMENT: environment,
            DB_HOST: this.database.clusterEndpoint.hostname,
            DB_PORT: this.database.clusterEndpoint.port.toString(),
            DB_NAME: 'serenya',
            DB_SECRET_ARN: this.dbSecret.secretArn,
            TEMP_BUCKET_NAME: this.tempFilesBucket.bucketName,
            API_SECRETS_ARN: apiSecrets.secretArn,
            KMS_KEY_ID: encryptionKey.keyId,
            ENABLE_DETAILED_LOGGING: config.enableDetailedLogging.toString(),
        };
        // Lambda functions with VPC configuration
        const authFunction = new lambda.Function(this, 'AuthFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'auth.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/auth')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [lambdaSecurityGroup],
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
            description: 'Google OAuth verification and JWT generation',
        });
        const userProfileFunction = new lambda.Function(this, 'UserProfileFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'userProfile.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/user')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [lambdaSecurityGroup],
            timeout: cdk.Duration.seconds(15),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
            description: 'User profile management',
        });
        const uploadFunction = new lambda.Function(this, 'UploadFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'upload.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/upload')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [lambdaSecurityGroup],
            timeout: cdk.Duration.seconds(60),
            memorySize: 512,
            logRetention: logs.RetentionDays.ONE_MONTH,
            description: 'File upload with virus scanning',
        });
        const processFunction = new lambda.Function(this, 'ProcessFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'process.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/process')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [lambdaSecurityGroup],
            timeout: cdk.Duration.minutes(3),
            memorySize: 1024,
            logRetention: logs.RetentionDays.ONE_MONTH,
            description: 'AI processing with Anthropic Claude',
        });
        const statusFunction = new lambda.Function(this, 'StatusFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'status.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/status')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [lambdaSecurityGroup],
            timeout: cdk.Duration.seconds(15),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
            description: 'Processing status tracking',
        });
        const resultFunction = new lambda.Function(this, 'ResultFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'result.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/result')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [lambdaSecurityGroup],
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
            description: 'Results retrieval',
        });
        const retryFunction = new lambda.Function(this, 'RetryFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'retry.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/retry')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [lambdaSecurityGroup],
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
            description: 'Processing retry management',
        });
        const doctorReportFunction = new lambda.Function(this, 'DoctorReportFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'doctorReport.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/doctor-report')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [lambdaSecurityGroup],
            timeout: cdk.Duration.minutes(2),
            memorySize: 512,
            logRetention: logs.RetentionDays.ONE_MONTH,
            description: 'Premium doctor report generation',
        });
        const cleanupFunction = new lambda.Function(this, 'CleanupFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'cleanup.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/cleanup')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [lambdaSecurityGroup],
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
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
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [lambdaSecurityGroup],
            timeout: cdk.Duration.seconds(15),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
            description: 'JWT token authorization',
        });
        // Database initialization Lambda (for manual schema setup)
        const dbInitFunction = new lambda.Function(this, 'DatabaseInitFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/db-init')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [lambdaSecurityGroup],
            timeout: cdk.Duration.minutes(5),
            memorySize: 512,
            logRetention: logs.RetentionDays.ONE_MONTH,
            description: 'Database schema initialization and migrations',
        });
        // Chat Lambda functions
        const chatPromptsFunction = new lambda.Function(this, 'ChatPromptsFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'chatPrompts.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/chat-prompts')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [lambdaSecurityGroup],
            timeout: cdk.Duration.seconds(15),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
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
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [lambdaSecurityGroup],
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            logRetention: logs.RetentionDays.ONE_MONTH,
            description: 'Chat message processing with AI response generation',
        });
        const chatStatusFunction = new lambda.Function(this, 'ChatStatusFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'chatStatus.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/chat-status')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [lambdaSecurityGroup],
            timeout: cdk.Duration.seconds(15),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
            description: 'Chat response status polling',
        });
        const subscriptionsFunction = new lambda.Function(this, 'SubscriptionsFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'subscriptions.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/subscriptions')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [lambdaSecurityGroup],
            timeout: cdk.Duration.seconds(15),
            memorySize: 256,
            logRetention: logs.RetentionDays.ONE_MONTH,
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
            description: 'PostgreSQL database hostname',
            exportName: `serenya-db-host-${environment}`,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VyZW55YS1iYWNrZW5kLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vaW5mcmFzdHJ1Y3R1cmUvc2VyZW55YS1iYWNrZW5kLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQywrREFBaUQ7QUFDakQsdUVBQXlEO0FBQ3pELHVEQUF5QztBQUN6Qyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQywyREFBNkM7QUFDN0MsK0VBQWlFO0FBQ2pFLHlEQUEyQztBQUMzQywyQ0FBNkI7QUFhN0IsTUFBYSxtQkFBb0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQU9oRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQStCO1FBQ3ZFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRXRDLHlCQUF5QjtRQUN6QixNQUFNLGFBQWEsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQzlELFdBQVcsRUFBRSxXQUFXLFdBQVcsOEJBQThCO1lBQ2pFLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsYUFBYSxFQUFFLFdBQVcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87U0FDN0YsQ0FBQyxDQUFDO1FBRUgsaURBQWlEO1FBQ2pELElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDekMsTUFBTSxFQUFFLENBQUMsRUFBRSxpQ0FBaUM7WUFDNUMsV0FBVyxFQUFFLENB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RUFBRTtZQUNsRixVQUFVO1lBQ1YsaUJBQWlCLEVBQUUsVUFBVSxDQUFDLGlCQUFpQixDQUFDLE1BQU07U0FDdkQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBbHpCRCxrREFrekJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIHJkcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtcmRzJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuaW50ZXJmYWNlIFNlcmVueWFCYWNrZW5kU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcbiAgY29uZmlnOiB7XG4gICAgcmVnaW9uOiBzdHJpbmc7XG4gICAgYWxsb3dPcmlnaW5zOiBzdHJpbmdbXTtcbiAgICByZXRlbnRpb25EYXlzOiBudW1iZXI7XG4gICAgZW5hYmxlRGV0YWlsZWRMb2dnaW5nOiBib29sZWFuO1xuICB9O1xufVxuXG5leHBvcnQgY2xhc3MgU2VyZW55YUJhY2tlbmRTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSBhcGk6IGFwaWdhdGV3YXkuUmVzdEFwaTtcbiAgcHVibGljIHJlYWRvbmx5IHRlbXBGaWxlc0J1Y2tldDogczMuQnVja2V0O1xuICBwdWJsaWMgcmVhZG9ubHkgdnBjOiBlYzIuVnBjO1xuICBwdWJsaWMgcmVhZG9ubHkgZGF0YWJhc2U6IHJkcy5EYXRhYmFzZUNsdXN0ZXI7XG4gIHB1YmxpYyByZWFkb25seSBkYlNlY3JldDogc2VjcmV0c21hbmFnZXIuU2VjcmV0O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZXJlbnlhQmFja2VuZFN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQsIGNvbmZpZyB9ID0gcHJvcHM7XG5cbiAgICAvLyBLTVMgS2V5IGZvciBlbmNyeXB0aW9uXG4gICAgY29uc3QgZW5jcnlwdGlvbktleSA9IG5ldyBrbXMuS2V5KHRoaXMsICdTZXJlbnlhRW5jcnlwdGlvbktleScsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgU2VyZW55YSAke2Vudmlyb25tZW50fSBlbmNyeXB0aW9uIGtleSBmb3IgUEhJIGRhdGFgLFxuICAgICAgZW5hYmxlS2V5Um90YXRpb246IHRydWUsXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIFZQQyBmb3IgaGVhbHRoY2FyZS1jb21wbGlhbnQgbmV0d29yayBpc29sYXRpb25cbiAgICB0aGlzLnZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsICdTZXJlbnlhVnBjJywge1xuICAgICAgbWF4QXpzOiAyLCAvLyBNdWx0aS1BWiBmb3IgaGlnaCBhdmFpbGFiaWxpdHlcbiAgICAgIG5hdEdhdGV3YXlzOiAxLCAvLyBDb3N0IG9wdGltaXphdGlvbiAtIHNpbmdsZSBOQVQgZ2F0ZXdheVxuICAgICAgaXBBZGRyZXNzZXM6IGVjMi5JcEFkZHJlc3Nlcy5jaWRyKCcxMC4wLjAuMC8xNicpLFxuICAgICAgc3VibmV0Q29uZmlndXJhdGlvbjogW1xuICAgICAgICB7XG4gICAgICAgICAgY2lkck1hc2s6IDI0LFxuICAgICAgICAgIG5hbWU6ICdQdWJsaWMnLFxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGNpZHJNYXNrOiAyNCxcbiAgICAgICAgICBuYW1lOiAnUHJpdmF0ZScsXG4gICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGNpZHJNYXNrOiAyNCxcbiAgICAgICAgICBuYW1lOiAnRGF0YWJhc2UnLFxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gRGF0YWJhc2UgY3JlZGVudGlhbHMgc2VjcmV0XG4gICAgdGhpcy5kYlNlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0RhdGFiYXNlU2VjcmV0Jywge1xuICAgICAgZGVzY3JpcHRpb246IGBTZXJlbnlhICR7ZW52aXJvbm1lbnR9IGRhdGFiYXNlIGNyZWRlbnRpYWxzYCxcbiAgICAgIHNlY3JldE5hbWU6IGBzZXJlbnlhLyR7ZW52aXJvbm1lbnR9L2RhdGFiYXNlYCxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgdXNlcm5hbWU6ICdzZXJlbnlhX2FkbWluJyxcbiAgICAgICAgfSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAncGFzc3dvcmQnLFxuICAgICAgICBleGNsdWRlQ2hhcmFjdGVyczogJ1wiQC9cXFxcJyxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDMyLFxuICAgICAgfSxcbiAgICAgIGVuY3J5cHRpb25LZXksXG4gICAgfSk7XG5cbiAgICAvLyBTZWN1cml0eSBncm91cCBmb3IgZGF0YWJhc2VcbiAgICBjb25zdCBkYlNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0RhdGFiYXNlU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBQb3N0Z3JlU1FMIGRhdGFiYXNlJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgLy8gU2VjdXJpdHkgZ3JvdXAgZm9yIExhbWJkYSBmdW5jdGlvbnNcbiAgICBjb25zdCBsYW1iZGFTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdMYW1iZGFTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIExhbWJkYSBmdW5jdGlvbnMnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IExhbWJkYSB0byBhY2Nlc3MgZGF0YWJhc2Ugb24gcG9ydCA1NDMyXG4gICAgZGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgbGFtYmRhU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjMi5Qb3J0LnRjcCg1NDMyKSxcbiAgICAgICdBbGxvdyBMYW1iZGEgYWNjZXNzIHRvIFBvc3RncmVTUUwnXG4gICAgKTtcblxuICAgIC8vIEF1cm9yYSBTZXJ2ZXJsZXNzIHYyIFBvc3RncmVTUUwgQ2x1c3RlclxuICAgIHRoaXMuZGF0YWJhc2UgPSBuZXcgcmRzLkRhdGFiYXNlQ2x1c3Rlcih0aGlzLCAnU2VyZW55YURhdGFiYXNlJywge1xuICAgICAgZW5naW5lOiByZHMuRGF0YWJhc2VDbHVzdGVyRW5naW5lLmF1cm9yYVBvc3RncmVzKHtcbiAgICAgICAgdmVyc2lvbjogcmRzLkF1cm9yYVBvc3RncmVzRW5naW5lVmVyc2lvbi5WRVJfMTVfOCxcbiAgICAgIH0pLFxuICAgICAgc2VydmVybGVzc1YyTWluQ2FwYWNpdHk6IDAuNSwgLy8gTWluaW11bSAwLjUgQUNVIGZvciBjb3N0IG9wdGltaXphdGlvblxuICAgICAgc2VydmVybGVzc1YyTWF4Q2FwYWNpdHk6IDE2LCAgLy8gTWF4aW11bSAxNiBBQ1UgZm9yIHNjYWxhYmlsaXR5XG4gICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21TZWNyZXQodGhpcy5kYlNlY3JldCksXG4gICAgICB2cGM6IHRoaXMudnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVELFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbZGJTZWN1cml0eUdyb3VwXSxcbiAgICAgIGRlZmF1bHREYXRhYmFzZU5hbWU6ICdzZXJlbnlhJyxcbiAgICAgIHN0b3JhZ2VFbmNyeXB0ZWQ6IHRydWUsXG4gICAgICBzdG9yYWdlRW5jcnlwdGlvbktleTogZW5jcnlwdGlvbktleSxcbiAgICAgIGJhY2t1cDoge1xuICAgICAgICByZXRlbnRpb246IGNkay5EdXJhdGlvbi5kYXlzKDcpLFxuICAgICAgfSxcbiAgICAgIGRlbGV0aW9uUHJvdGVjdGlvbjogZW52aXJvbm1lbnQgPT09ICdwcm9kJyxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5TTkFQU0hPVCA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICB3cml0ZXI6IHJkcy5DbHVzdGVySW5zdGFuY2Uuc2VydmVybGVzc1YyKCd3cml0ZXInKSxcbiAgICB9KTtcblxuICAgIC8vIFNlY3JldHMgTWFuYWdlciBmb3IgQVBJIGtleXNcbiAgICBjb25zdCBhcGlTZWNyZXRzID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnU2VyZW55YUFwaVNlY3JldHMnLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYFNlcmVueWEgJHtlbnZpcm9ubWVudH0gQVBJIHNlY3JldHNgLFxuICAgICAgc2VjcmV0TmFtZTogYHNlcmVueWEvJHtlbnZpcm9ubWVudH0vYXBpLXNlY3JldHNgLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHsgXG4gICAgICAgICAgand0U2VjcmV0OiAnJyxcbiAgICAgICAgICBhbnRocm9waWNBcGlLZXk6ICcnLFxuICAgICAgICAgIGdvb2dsZUNsaWVudElkOiAnJyxcbiAgICAgICAgICBnb29nbGVDbGllbnRTZWNyZXQ6ICcnXG4gICAgICAgIH0pLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogJ2p3dFNlY3JldCcsXG4gICAgICAgIGV4Y2x1ZGVDaGFyYWN0ZXJzOiAnXCJAL1xcXFwnLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogNjQsXG4gICAgICB9LFxuICAgICAgZW5jcnlwdGlvbktleSxcbiAgICB9KTtcblxuICAgIC8vIFMzIGJ1Y2tldCBmb3IgdGVtcG9yYXJ5IGZpbGUgc3RvcmFnZVxuICAgIHRoaXMudGVtcEZpbGVzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnVGVtcEZpbGVzQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYHNlcmVueWEtdGVtcC1maWxlcy0ke2Vudmlyb25tZW50fS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5LTVMsXG4gICAgICBlbmNyeXB0aW9uS2V5LFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIGVuZm9yY2VTU0w6IHRydWUsXG4gICAgICB2ZXJzaW9uZWQ6IGZhbHNlLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdEZWxldGVUZW1wRmlsZXMnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMSksIC8vIFByaW1hcnkgY2xlYW51cCBhZnRlciAxIGRheVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdEZWxldGVJbmNvbXBsZXRlVXBsb2FkcycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW3MzLkh0dHBNZXRob2RzLlBPU1QsIHMzLkh0dHBNZXRob2RzLlBVVF0sXG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IGNvbmZpZy5hbGxvd09yaWdpbnMsXG4gICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFsnKiddLFxuICAgICAgICAgIG1heEFnZTogMzYwMCxcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cblxuICAgIC8vIExhbWJkYSBleGVjdXRpb24gcm9sZSB3aXRoIGxlYXN0IHByaXZpbGVnZVxuICAgIGNvbnN0IGxhbWJkYUV4ZWN1dGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0xhbWJkYUV4ZWN1dGlvblJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhVlBDQWNjZXNzRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIFNlcmVueWFMYW1iZGFQb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIC8vIFJEUyBwZXJtaXNzaW9ucyBmb3IgUG9zdGdyZVNRTCBhY2Nlc3NcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3Jkcy1kYjpjb25uZWN0JyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgYGFybjphd3M6cmRzLWRiOiR7Y29uZmlnLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmRidXNlcjoke3RoaXMuZGF0YWJhc2UuY2x1c3RlclJlc291cmNlSWRlbnRpZmllcn0vc2VyZW55YV9hcHBgLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAvLyBTMyBwZXJtaXNzaW9uc1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6RGVsZXRlT2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6UHV0T2JqZWN0QWNsJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYCR7dGhpcy50ZW1wRmlsZXNCdWNrZXQuYnVja2V0QXJufS8qYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIC8vIFNlY3JldHMgTWFuYWdlciBwZXJtaXNzaW9uc1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWUnLFxuICAgICAgICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpDcmVhdGVTZWNyZXQnLFxuICAgICAgICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpVcGRhdGVTZWNyZXQnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFthcGlTZWNyZXRzLnNlY3JldEFybiwgdGhpcy5kYlNlY3JldC5zZWNyZXRBcm4sIGBhcm46YXdzOnNlY3JldHNtYW5hZ2VyOiR7Y29uZmlnLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnNlY3JldDpzZXJlbnlhLyR7ZW52aXJvbm1lbnR9L2FwcC1kYXRhYmFzZSpgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgLy8gS01TIHBlcm1pc3Npb25zXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdrbXM6RGVjcnlwdCcsXG4gICAgICAgICAgICAgICAgJ2ttczpHZW5lcmF0ZURhdGFLZXknLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtlbmNyeXB0aW9uS2V5LmtleUFybl0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIC8vIEJlZHJvY2sgcGVybWlzc2lvbnMgZm9yIEFJIGNoYXQgZnVuY3Rpb25hbGl0eVxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnYmVkcm9jazpJbnZva2VNb2RlbCcsXG4gICAgICAgICAgICAgICAgJ2JlZHJvY2s6SW52b2tlTW9kZWxXaXRoUmVzcG9uc2VTdHJlYW0nLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7Y29uZmlnLnJlZ2lvbn06OmZvdW5kYXRpb24tbW9kZWwvYW50aHJvcGljLmNsYXVkZS0zLWhhaWt1LTIwMjQwMzA3LXYxOjBgLFxuICAgICAgICAgICAgICAgIGBhcm46YXdzOmJlZHJvY2s6JHtjb25maWcucmVnaW9ufTo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLTMtc29ubmV0LTIwMjQwMjI5LXYxOjBgLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ29tbW9uIExhbWJkYSBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICBjb25zdCBjb21tb25MYW1iZGFFbnZpcm9ubWVudCA9IHtcbiAgICAgIFJFR0lPTjogY29uZmlnLnJlZ2lvbixcbiAgICAgIEVOVklST05NRU5UOiBlbnZpcm9ubWVudCxcbiAgICAgIERCX0hPU1Q6IHRoaXMuZGF0YWJhc2UuY2x1c3RlckVuZHBvaW50Lmhvc3RuYW1lLFxuICAgICAgREJfUE9SVDogdGhpcy5kYXRhYmFzZS5jbHVzdGVyRW5kcG9pbnQucG9ydC50b1N0cmluZygpLFxuICAgICAgREJfTkFNRTogJ3NlcmVueWEnLFxuICAgICAgREJfU0VDUkVUX0FSTjogdGhpcy5kYlNlY3JldC5zZWNyZXRBcm4sXG4gICAgICBURU1QX0JVQ0tFVF9OQU1FOiB0aGlzLnRlbXBGaWxlc0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgQVBJX1NFQ1JFVFNfQVJOOiBhcGlTZWNyZXRzLnNlY3JldEFybixcbiAgICAgIEtNU19LRVlfSUQ6IGVuY3J5cHRpb25LZXkua2V5SWQsXG4gICAgICBFTkFCTEVfREVUQUlMRURfTE9HR0lORzogY29uZmlnLmVuYWJsZURldGFpbGVkTG9nZ2luZy50b1N0cmluZygpLFxuICAgIH07XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb25zIHdpdGggVlBDIGNvbmZpZ3VyYXRpb25cbiAgICBjb25zdCBhdXRoRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBdXRoRnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdhdXRoLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL2F1dGgnKSksXG4gICAgICByb2xlOiBsYW1iZGFFeGVjdXRpb25Sb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkxhbWJkYUVudmlyb25tZW50LFxuICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW2xhbWJkYVNlY3VyaXR5R3JvdXBdLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgZGVzY3JpcHRpb246ICdHb29nbGUgT0F1dGggdmVyaWZpY2F0aW9uIGFuZCBKV1QgZ2VuZXJhdGlvbicsXG4gICAgfSk7XG5cbiAgICBjb25zdCB1c2VyUHJvZmlsZUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnVXNlclByb2ZpbGVGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ3VzZXJQcm9maWxlLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL3VzZXInKSksXG4gICAgICByb2xlOiBsYW1iZGFFeGVjdXRpb25Sb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkxhbWJkYUVudmlyb25tZW50LFxuICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW2xhbWJkYVNlY3VyaXR5R3JvdXBdLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTUpLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgZGVzY3JpcHRpb246ICdVc2VyIHByb2ZpbGUgbWFuYWdlbWVudCcsXG4gICAgfSk7XG5cbiAgICBjb25zdCB1cGxvYWRGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1VwbG9hZEZ1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAndXBsb2FkLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL3VwbG9hZCcpKSxcbiAgICAgIHJvbGU6IGxhbWJkYUV4ZWN1dGlvblJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uTGFtYmRhRW52aXJvbm1lbnQsXG4gICAgICB2cGM6IHRoaXMudnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbbGFtYmRhU2VjdXJpdHlHcm91cF0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg2MCksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICBkZXNjcmlwdGlvbjogJ0ZpbGUgdXBsb2FkIHdpdGggdmlydXMgc2Nhbm5pbmcnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcHJvY2Vzc0Z1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUHJvY2Vzc0Z1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAncHJvY2Vzcy5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy9wcm9jZXNzJykpLFxuICAgICAgcm9sZTogbGFtYmRhRXhlY3V0aW9uUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25MYW1iZGFFbnZpcm9ubWVudCxcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtsYW1iZGFTZWN1cml0eUdyb3VwXSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDMpLFxuICAgICAgbWVtb3J5U2l6ZTogMTAyNCxcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQUkgcHJvY2Vzc2luZyB3aXRoIEFudGhyb3BpYyBDbGF1ZGUnLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc3RhdHVzRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdTdGF0dXNGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ3N0YXR1cy5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy9zdGF0dXMnKSksXG4gICAgICByb2xlOiBsYW1iZGFFeGVjdXRpb25Sb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkxhbWJkYUVudmlyb25tZW50LFxuICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW2xhbWJkYVNlY3VyaXR5R3JvdXBdLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTUpLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9jZXNzaW5nIHN0YXR1cyB0cmFja2luZycsXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXN1bHRGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1Jlc3VsdEZ1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAncmVzdWx0LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL3Jlc3VsdCcpKSxcbiAgICAgIHJvbGU6IGxhbWJkYUV4ZWN1dGlvblJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uTGFtYmRhRW52aXJvbm1lbnQsXG4gICAgICB2cGM6IHRoaXMudnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbbGFtYmRhU2VjdXJpdHlHcm91cF0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Jlc3VsdHMgcmV0cmlldmFsJyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHJldHJ5RnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdSZXRyeUZ1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAncmV0cnkuaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvcmV0cnknKSksXG4gICAgICByb2xlOiBsYW1iZGFFeGVjdXRpb25Sb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkxhbWJkYUVudmlyb25tZW50LFxuICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW2xhbWJkYVNlY3VyaXR5R3JvdXBdLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9jZXNzaW5nIHJldHJ5IG1hbmFnZW1lbnQnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZG9jdG9yUmVwb3J0RnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdEb2N0b3JSZXBvcnRGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2RvY3RvclJlcG9ydC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy9kb2N0b3ItcmVwb3J0JykpLFxuICAgICAgcm9sZTogbGFtYmRhRXhlY3V0aW9uUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25MYW1iZGFFbnZpcm9ubWVudCxcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtsYW1iZGFTZWN1cml0eUdyb3VwXSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDIpLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgZGVzY3JpcHRpb246ICdQcmVtaXVtIGRvY3RvciByZXBvcnQgZ2VuZXJhdGlvbicsXG4gICAgfSk7XG5cbiAgICBjb25zdCBjbGVhbnVwRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdDbGVhbnVwRnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdjbGVhbnVwLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL2NsZWFudXAnKSksXG4gICAgICByb2xlOiBsYW1iZGFFeGVjdXRpb25Sb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkxhbWJkYUVudmlyb25tZW50LFxuICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW2xhbWJkYVNlY3VyaXR5R3JvdXBdLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgZGVzY3JpcHRpb246ICdTMyB0ZW1wb3JhcnkgZmlsZSBjbGVhbnVwIGFmdGVyIHN1Y2Nlc3NmdWwgRmx1dHRlciBzdG9yYWdlJyxcbiAgICB9KTtcblxuICAgIC8vIEpXVCBBdXRob3JpemVyIExhbWJkYSAgXG4gICAgY29uc3QgYXV0aG9yaXplckZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQXV0aG9yaXplckZ1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnYXV0aG9yaXplci5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy9hdXRob3JpemVyJykpLFxuICAgICAgcm9sZTogbGFtYmRhRXhlY3V0aW9uUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIC4uLmNvbW1vbkxhbWJkYUVudmlyb25tZW50LFxuICAgICAgICBUT0tFTl9JU1NVRVI6ICdzZXJlbnlhLmhlYWx0aCcsXG4gICAgICAgIFRPS0VOX0FVRElFTkNFOiAnc2VyZW55YS1tb2JpbGUtYXBwJyxcbiAgICAgIH0sXG4gICAgICB2cGM6IHRoaXMudnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbbGFtYmRhU2VjdXJpdHlHcm91cF0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxNSksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICBkZXNjcmlwdGlvbjogJ0pXVCB0b2tlbiBhdXRob3JpemF0aW9uJyxcbiAgICB9KTtcblxuICAgIC8vIERhdGFiYXNlIGluaXRpYWxpemF0aW9uIExhbWJkYSAoZm9yIG1hbnVhbCBzY2hlbWEgc2V0dXApXG4gICAgY29uc3QgZGJJbml0RnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdEYXRhYmFzZUluaXRGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL2RiLWluaXQnKSksXG4gICAgICByb2xlOiBsYW1iZGFFeGVjdXRpb25Sb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkxhbWJkYUVudmlyb25tZW50LFxuICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW2xhbWJkYVNlY3VyaXR5R3JvdXBdLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RhdGFiYXNlIHNjaGVtYSBpbml0aWFsaXphdGlvbiBhbmQgbWlncmF0aW9ucycsXG4gICAgfSk7XG5cbiAgICAvLyBDaGF0IExhbWJkYSBmdW5jdGlvbnNcbiAgICBjb25zdCBjaGF0UHJvbXB0c0Z1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQ2hhdFByb21wdHNGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2NoYXRQcm9tcHRzLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL2NoYXQtcHJvbXB0cycpKSxcbiAgICAgIHJvbGU6IGxhbWJkYUV4ZWN1dGlvblJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uTGFtYmRhRW52aXJvbm1lbnQsXG4gICAgICB2cGM6IHRoaXMudnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbbGFtYmRhU2VjdXJpdHlHcm91cF0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxNSksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NoYXQgcHJvbXB0cyByZXRyaWV2YWwgZm9yIGNvbnZlcnNhdGlvbiBzdGFydGVycycsXG4gICAgfSk7XG5cbiAgICBjb25zdCBjaGF0TWVzc2FnZXNGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0NoYXRNZXNzYWdlc0Z1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnY2hhdE1lc3NhZ2VzLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL2NoYXQtbWVzc2FnZXMnKSksXG4gICAgICByb2xlOiBsYW1iZGFFeGVjdXRpb25Sb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgLi4uY29tbW9uTGFtYmRhRW52aXJvbm1lbnQsXG4gICAgICAgIEJFRFJPQ0tfTU9ERUxfSUQ6ICdhbnRocm9waWMuY2xhdWRlLTMtaGFpa3UtMjAyNDAzMDctdjE6MCcsXG4gICAgICB9LFxuICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW2xhbWJkYVNlY3VyaXR5R3JvdXBdLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgZGVzY3JpcHRpb246ICdDaGF0IG1lc3NhZ2UgcHJvY2Vzc2luZyB3aXRoIEFJIHJlc3BvbnNlIGdlbmVyYXRpb24nLFxuICAgIH0pO1xuXG4gICAgY29uc3QgY2hhdFN0YXR1c0Z1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQ2hhdFN0YXR1c0Z1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnY2hhdFN0YXR1cy5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy9jaGF0LXN0YXR1cycpKSxcbiAgICAgIHJvbGU6IGxhbWJkYUV4ZWN1dGlvblJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uTGFtYmRhRW52aXJvbm1lbnQsXG4gICAgICB2cGM6IHRoaXMudnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbbGFtYmRhU2VjdXJpdHlHcm91cF0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxNSksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NoYXQgcmVzcG9uc2Ugc3RhdHVzIHBvbGxpbmcnLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uc0Z1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnU3Vic2NyaXB0aW9uc0Z1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnc3Vic2NyaXB0aW9ucy5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy9zdWJzY3JpcHRpb25zJykpLFxuICAgICAgcm9sZTogbGFtYmRhRXhlY3V0aW9uUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25MYW1iZGFFbnZpcm9ubWVudCxcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtsYW1iZGFTZWN1cml0eUdyb3VwXSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDE1KSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3Vic2NyaXB0aW9uIG1hbmFnZW1lbnQgYW5kIGJpbGxpbmcnLFxuICAgIH0pO1xuXG4gICAgLy8gQ3VzdG9tIGF1dGhvcml6ZXJcbiAgICBjb25zdCBqd3RBdXRob3JpemVyID0gbmV3IGFwaWdhdGV3YXkuVG9rZW5BdXRob3JpemVyKHRoaXMsICdKV1RBdXRob3JpemVyJywge1xuICAgICAgaGFuZGxlcjogYXV0aG9yaXplckZ1bmN0aW9uLFxuICAgICAgaWRlbnRpdHlTb3VyY2U6ICdtZXRob2QucmVxdWVzdC5oZWFkZXIuQXV0aG9yaXphdGlvbicsXG4gICAgICByZXN1bHRzQ2FjaGVUdGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgYXV0aG9yaXplck5hbWU6ICdTZXJlbnlhSldUQXV0aG9yaXplcicsXG4gICAgfSk7XG5cbiAgICAvLyBBUEkgR2F0ZXdheVxuICAgIHRoaXMuYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnU2VyZW55YUFwaScsIHtcbiAgICAgIHJlc3RBcGlOYW1lOiBgc2VyZW55YS1hcGktJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZGVzY3JpcHRpb246IGBTZXJlbnlhIEFJIEhlYWx0aCBBZ2VudCBBUEkgLSAke2Vudmlyb25tZW50fWAsXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBjb25maWcuYWxsb3dPcmlnaW5zLFxuICAgICAgICBhbGxvd01ldGhvZHM6IFsnR0VUJywgJ1BPU1QnLCAnUFVUJywgJ0RFTEVURScsICdPUFRJT05TJ10sXG4gICAgICAgIGFsbG93SGVhZGVyczogW1xuICAgICAgICAgICdDb250ZW50LVR5cGUnLFxuICAgICAgICAgICdYLUFtei1EYXRlJywgXG4gICAgICAgICAgJ0F1dGhvcml6YXRpb24nLFxuICAgICAgICAgICdYLUFwaS1LZXknLFxuICAgICAgICAgICdYLUFtei1TZWN1cml0eS1Ub2tlbicsXG4gICAgICAgICAgJ1gtQW16LVVzZXItQWdlbnQnLFxuICAgICAgICBdLFxuICAgICAgICBhbGxvd0NyZWRlbnRpYWxzOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiBlbnZpcm9ubWVudCxcbiAgICAgICAgbG9nZ2luZ0xldmVsOiBjb25maWcuZW5hYmxlRGV0YWlsZWRMb2dnaW5nIFxuICAgICAgICAgID8gYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuSU5GTyBcbiAgICAgICAgICA6IGFwaWdhdGV3YXkuTWV0aG9kTG9nZ2luZ0xldmVsLkVSUk9SLFxuICAgICAgICBkYXRhVHJhY2VFbmFibGVkOiBjb25maWcuZW5hYmxlRGV0YWlsZWRMb2dnaW5nLFxuICAgICAgICBtZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgdGhyb3R0bGluZ1JhdGVMaW1pdDogMTAwLFxuICAgICAgICB0aHJvdHRsaW5nQnVyc3RMaW1pdDogMjAwLFxuICAgICAgfSxcbiAgICAgIGVuZHBvaW50Q29uZmlndXJhdGlvbjoge1xuICAgICAgICB0eXBlczogW2FwaWdhdGV3YXkuRW5kcG9pbnRUeXBlLlJFR0lPTkFMXSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBUEkgR2F0ZXdheSByZXNvdXJjZXMgYW5kIG1ldGhvZHNcbiAgICB0aGlzLnNldHVwQXBpUm91dGVzKGp3dEF1dGhvcml6ZXIsIHtcbiAgICAgIGF1dGg6IGF1dGhGdW5jdGlvbixcbiAgICAgIHVzZXJQcm9maWxlOiB1c2VyUHJvZmlsZUZ1bmN0aW9uLFxuICAgICAgdXBsb2FkOiB1cGxvYWRGdW5jdGlvbixcbiAgICAgIHByb2Nlc3M6IHByb2Nlc3NGdW5jdGlvbixcbiAgICAgIHN0YXR1czogc3RhdHVzRnVuY3Rpb24sXG4gICAgICByZXN1bHQ6IHJlc3VsdEZ1bmN0aW9uLFxuICAgICAgcmV0cnk6IHJldHJ5RnVuY3Rpb24sXG4gICAgICBkb2N0b3JSZXBvcnQ6IGRvY3RvclJlcG9ydEZ1bmN0aW9uLFxuICAgICAgY2xlYW51cDogY2xlYW51cEZ1bmN0aW9uLFxuICAgICAgY2hhdFByb21wdHM6IGNoYXRQcm9tcHRzRnVuY3Rpb24sXG4gICAgICBjaGF0TWVzc2FnZXM6IGNoYXRNZXNzYWdlc0Z1bmN0aW9uLFxuICAgICAgY2hhdFN0YXR1czogY2hhdFN0YXR1c0Z1bmN0aW9uLFxuICAgICAgc3Vic2NyaXB0aW9uczogc3Vic2NyaXB0aW9uc0Z1bmN0aW9uLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBMb2cgR3JvdXBzIHdpdGggcmV0ZW50aW9uXG4gICAgbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0FwaUdhdGV3YXlMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvYXBpZ2F0ZXdheS9zZXJlbnlhLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyBOb3RlOiBSZW1vdmVkIFMzIGV2ZW50IG5vdGlmaWNhdGlvbiAtIHByb2Nlc3Npbmcgbm93IHRyaWdnZXJlZCBkaXJlY3RseSB2aWEgQVBJXG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaVVybCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlcmVueWEgQVBJIEdhdGV3YXkgVVJMJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBzZXJlbnlhLWFwaS11cmwtJHtlbnZpcm9ubWVudH1gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUlkJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXBpLnJlc3RBcGlJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VyZW55YSBBUEkgR2F0ZXdheSBJRCcsXG4gICAgICBleHBvcnROYW1lOiBgc2VyZW55YS1hcGktaWQtJHtlbnZpcm9ubWVudH1gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1RlbXBCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMudGVtcEZpbGVzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RlbXBvcmFyeSBmaWxlcyBTMyBidWNrZXQgbmFtZScsXG4gICAgICBleHBvcnROYW1lOiBgc2VyZW55YS10ZW1wLWJ1Y2tldC0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnS21zS2V5SWQnLCB7XG4gICAgICB2YWx1ZTogZW5jcnlwdGlvbktleS5rZXlJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnS01TIGVuY3J5cHRpb24ga2V5IElEJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBzZXJlbnlhLWttcy1rZXktJHtlbnZpcm9ubWVudH1gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RhdGFiYXNlSG9zdCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmRhdGFiYXNlLmNsdXN0ZXJFbmRwb2ludC5ob3N0bmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUG9zdGdyZVNRTCBkYXRhYmFzZSBob3N0bmFtZScsXG4gICAgICBleHBvcnROYW1lOiBgc2VyZW55YS1kYi1ob3N0LSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEYXRhYmFzZVBvcnQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5kYXRhYmFzZS5jbHVzdGVyRW5kcG9pbnQucG9ydC50b1N0cmluZygpLFxuICAgICAgZGVzY3JpcHRpb246ICdQb3N0Z3JlU1FMIGRhdGFiYXNlIHBvcnQnLFxuICAgICAgZXhwb3J0TmFtZTogYHNlcmVueWEtZGItcG9ydC0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGF0YWJhc2VTZWNyZXRBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5kYlNlY3JldC5zZWNyZXRBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0RhdGFiYXNlIGNyZWRlbnRpYWxzIHNlY3JldCBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogYHNlcmVueWEtZGItc2VjcmV0LSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdWcGNJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnZwYy52cGNJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVlBDIElEIGZvciBoZWFsdGhjYXJlIGNvbXBsaWFuY2UnLFxuICAgICAgZXhwb3J0TmFtZTogYHNlcmVueWEtdnBjLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0dXBBcGlSb3V0ZXMoXG4gICAgYXV0aG9yaXplcjogYXBpZ2F0ZXdheS5Ub2tlbkF1dGhvcml6ZXIsXG4gICAgZnVuY3Rpb25zOiBSZWNvcmQ8c3RyaW5nLCBsYW1iZGEuRnVuY3Rpb24+XG4gICkge1xuICAgIC8vIEF1dGggcm91dGVzIChubyBhdXRob3JpemF0aW9uIHJlcXVpcmVkKVxuICAgIGNvbnN0IGF1dGggPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCdhdXRoJyk7XG4gICAgY29uc3QgZ29vZ2xlQXV0aCA9IGF1dGguYWRkUmVzb3VyY2UoJ2dvb2dsZScpO1xuICAgIGNvbnN0IGdvb2dsZU9uYm9hcmRpbmdBdXRoID0gYXV0aC5hZGRSZXNvdXJjZSgnZ29vZ2xlLW9uYm9hcmRpbmcnKTtcbiAgICBjb25zdCBvYXV0aE9uYm9hcmRpbmdBdXRoID0gYXV0aC5hZGRSZXNvdXJjZSgnb2F1dGgtb25ib2FyZGluZycpO1xuICAgIFxuICAgIC8vIEJvdGggcm91dGVzIHBvaW50IHRvIHRoZSBzYW1lIGF1dGggZnVuY3Rpb24gZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbiAgICBnb29nbGVBdXRoLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5hdXRoKSwge1xuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiAnMjAwJyxcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHN0YXR1c0NvZGU6ICc0MDAnLFxuICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogJzUwMCcsXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gR29vZ2xlIG9uYm9hcmRpbmcgYXV0aCByb3V0ZSAoc2FtZSBhcyBhYm92ZSBmb3IgRmx1dHRlciBhcHAgY29tcGF0aWJpbGl0eSlcbiAgICBnb29nbGVPbmJvYXJkaW5nQXV0aC5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMuYXV0aCksIHtcbiAgICAgIG1ldGhvZFJlc3BvbnNlczogW1xuICAgICAgICB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogJzIwMCcsXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiAnNDAwJyxcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHN0YXR1c0NvZGU6ICc1MDAnLFxuICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIE9BdXRoIG9uYm9hcmRpbmcgYXV0aCByb3V0ZSAod2hhdCBGbHV0dGVyIGFwcCBhY3R1YWxseSBjYWxscylcbiAgICBvYXV0aE9uYm9hcmRpbmdBdXRoLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5hdXRoKSwge1xuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiAnMjAwJyxcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHN0YXR1c0NvZGU6ICc0MDAnLFxuICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogJzUwMCcsXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gVXNlciByb3V0ZXMgKGF1dGhvcml6YXRpb24gcmVxdWlyZWQpXG4gICAgY29uc3QgdXNlciA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3VzZXInKTtcbiAgICBjb25zdCBwcm9maWxlID0gdXNlci5hZGRSZXNvdXJjZSgncHJvZmlsZScpO1xuICAgIHByb2ZpbGUuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMudXNlclByb2ZpbGUpLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgIH0pO1xuXG4gICAgLy8gUHJvY2Vzc2luZyByb3V0ZXMgKGF1dGhvcml6YXRpb24gcmVxdWlyZWQpXG4gICAgY29uc3QgYXBpVjEgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCdhcGknKS5hZGRSZXNvdXJjZSgndjEnKTtcbiAgICBjb25zdCBwcm9jZXNzID0gYXBpVjEuYWRkUmVzb3VyY2UoJ3Byb2Nlc3MnKTtcblxuICAgIC8vIFVwbG9hZCBlbmRwb2ludFxuICAgIGNvbnN0IHVwbG9hZCA9IHByb2Nlc3MuYWRkUmVzb3VyY2UoJ3VwbG9hZCcpO1xuICAgIHVwbG9hZC5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMudXBsb2FkKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdtZXRob2QucmVxdWVzdC5oZWFkZXIuQ29udGVudC1UeXBlJzogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBTdGF0dXMgZW5kcG9pbnRcbiAgICBjb25zdCBzdGF0dXMgPSBwcm9jZXNzLmFkZFJlc291cmNlKCdzdGF0dXMnKTtcbiAgICBjb25zdCBzdGF0dXNKb2JJZCA9IHN0YXR1cy5hZGRSZXNvdXJjZSgne2pvYklkfScpO1xuICAgIHN0YXR1c0pvYklkLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZnVuY3Rpb25zLnN0YXR1cyksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucGF0aC5qb2JJZCc6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gUmVzdWx0IGVuZHBvaW50XG4gICAgY29uc3QgcmVzdWx0ID0gcHJvY2Vzcy5hZGRSZXNvdXJjZSgncmVzdWx0Jyk7XG4gICAgY29uc3QgcmVzdWx0Sm9iSWQgPSByZXN1bHQuYWRkUmVzb3VyY2UoJ3tqb2JJZH0nKTtcbiAgICByZXN1bHRKb2JJZC5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5yZXN1bHQpLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnBhdGguam9iSWQnOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFJldHJ5IGVuZHBvaW50XG4gICAgY29uc3QgcmV0cnkgPSBwcm9jZXNzLmFkZFJlc291cmNlKCdyZXRyeScpO1xuICAgIGNvbnN0IHJldHJ5Sm9iSWQgPSByZXRyeS5hZGRSZXNvdXJjZSgne2pvYklkfScpO1xuICAgIHJldHJ5Sm9iSWQuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZnVuY3Rpb25zLnJldHJ5KSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdtZXRob2QucmVxdWVzdC5wYXRoLmpvYklkJzogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBEb2N0b3IgcmVwb3J0IGVuZHBvaW50IChwcmVtaXVtIGZlYXR1cmUpXG4gICAgY29uc3QgZG9jdG9yUmVwb3J0ID0gcHJvY2Vzcy5hZGRSZXNvdXJjZSgnZG9jdG9yLXJlcG9ydCcpO1xuICAgIGRvY3RvclJlcG9ydC5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMuZG9jdG9yUmVwb3J0KSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICB9KTtcblxuICAgIC8vIENsZWFudXAgZW5kcG9pbnQgZm9yIFMzIHRlbXBvcmFyeSBmaWxlc1xuICAgIGNvbnN0IGNsZWFudXAgPSBwcm9jZXNzLmFkZFJlc291cmNlKCdjbGVhbnVwJyk7XG4gICAgY29uc3QgY2xlYW51cEpvYklkID0gY2xlYW51cC5hZGRSZXNvdXJjZSgne2pvYklkfScpO1xuICAgIGNsZWFudXBKb2JJZC5hZGRNZXRob2QoJ0RFTEVURScsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5jbGVhbnVwKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdtZXRob2QucmVxdWVzdC5wYXRoLmpvYklkJzogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBSZXBvcnRzIEFQSSBlbmRwb2ludHMgKHByZW1pdW0gZmVhdHVyZXMpXG4gICAgY29uc3QgcmVwb3J0cyA9IGFwaVYxLmFkZFJlc291cmNlKCdyZXBvcnRzJyk7XG4gICAgXG5cbiAgICAvLyBDaGF0IEFQSSBlbmRwb2ludHMgKGF1dGhvcml6YXRpb24gcmVxdWlyZWQpXG4gICAgY29uc3QgY2hhdCA9IGFwaVYxLmFkZFJlc291cmNlKCdjaGF0Jyk7XG5cbiAgICAvLyBDaGF0IHByb21wdHMgZW5kcG9pbnQgLSBHRVQgL2FwaS92MS9jaGF0L3Byb21wdHM/Y29udGVudF90eXBlPXJlc3VsdHN8cmVwb3J0c1xuICAgIGNvbnN0IHByb21wdHMgPSBjaGF0LmFkZFJlc291cmNlKCdwcm9tcHRzJyk7XG4gICAgcHJvbXB0cy5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5jaGF0UHJvbXB0cyksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucXVlcnlzdHJpbmcuY29udGVudF90eXBlJzogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDaGF0IG1lc3NhZ2VzIGVuZHBvaW50IC0gUE9TVCAvYXBpL3YxL2NoYXQvbWVzc2FnZXNcbiAgICBjb25zdCBtZXNzYWdlcyA9IGNoYXQuYWRkUmVzb3VyY2UoJ21lc3NhZ2VzJyk7XG4gICAgbWVzc2FnZXMuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZnVuY3Rpb25zLmNoYXRNZXNzYWdlcyksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgfSk7XG5cbiAgICAvLyBDaGF0IGpvYnMgc3RhdHVzIGVuZHBvaW50IC0gR0VUIC9hcGkvdjEvY2hhdC9qb2JzL3tqb2JfaWR9L3N0YXR1c1xuICAgIGNvbnN0IGpvYnMgPSBjaGF0LmFkZFJlc291cmNlKCdqb2JzJyk7XG4gICAgY29uc3Qgam9iSWQgPSBqb2JzLmFkZFJlc291cmNlKCd7am9iX2lkfScpO1xuICAgIGNvbnN0IGpvYlN0YXR1cyA9IGpvYklkLmFkZFJlc291cmNlKCdzdGF0dXMnKTtcbiAgICBqb2JTdGF0dXMuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMuY2hhdFN0YXR1cyksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucGF0aC5qb2JfaWQnOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFN1YnNjcmlwdGlvbnMgQVBJIGVuZHBvaW50cyAoYXV0aG9yaXphdGlvbiByZXF1aXJlZClcbiAgICBjb25zdCBzdWJzY3JpcHRpb25zID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnc3Vic2NyaXB0aW9ucycpO1xuXG4gICAgLy8gQ3VycmVudCBzdWJzY3JpcHRpb24gZW5kcG9pbnQgLSBHRVQgL3N1YnNjcmlwdGlvbnMvY3VycmVudFxuICAgIGNvbnN0IGN1cnJlbnQgPSBzdWJzY3JpcHRpb25zLmFkZFJlc291cmNlKCdjdXJyZW50Jyk7XG4gICAgY3VycmVudC5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5zdWJzY3JpcHRpb25zKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICB9KTtcbiAgfVxufSJdfQ==