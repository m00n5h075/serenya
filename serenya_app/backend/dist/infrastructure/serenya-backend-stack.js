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
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const secretsmanager = __importStar(require("aws-cdk-lib/aws-secretsmanager"));
const kms = __importStar(require("aws-cdk-lib/aws-kms"));
const s3Notifications = __importStar(require("aws-cdk-lib/aws-s3-notifications"));
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
        // DynamoDB table for job tracking
        this.jobsTable = new dynamodb.Table(this, 'ProcessingJobsTable', {
            tableName: `serenya-jobs-${environment}`,
            partitionKey: { name: 'jobId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
            encryptionKey,
            pointInTimeRecovery: environment === 'prod',
            timeToLiveAttribute: 'ttl',
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // Add GSI for user-based queries
        this.jobsTable.addGlobalSecondaryIndex({
            indexName: 'UserJobsIndex',
            partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: dynamodb.AttributeType.NUMBER },
        });
        // DynamoDB table for user profiles (temporary)
        this.usersTable = new dynamodb.Table(this, 'UsersTable', {
            tableName: `serenya-users-${environment}`,
            partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
            encryptionKey,
            pointInTimeRecovery: environment === 'prod',
            timeToLiveAttribute: 'ttl',
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // Lambda execution role with least privilege
        const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
            inlinePolicies: {
                SerenyaLambdaPolicy: new iam.PolicyDocument({
                    statements: [
                        // DynamoDB permissions
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:GetItem',
                                'dynamodb:PutItem',
                                'dynamodb:UpdateItem',
                                'dynamodb:DeleteItem',
                                'dynamodb:Query',
                                'dynamodb:Scan',
                            ],
                            resources: [
                                this.jobsTable.tableArn,
                                this.usersTable.tableArn,
                                `${this.jobsTable.tableArn}/index/*`,
                                `${this.usersTable.tableArn}/index/*`,
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
                            ],
                            resources: [apiSecrets.secretArn],
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
                    ],
                }),
            },
        });
        // Common Lambda environment variables
        const commonLambdaEnvironment = {
            REGION: config.region,
            ENVIRONMENT: environment,
            JOBS_TABLE_NAME: this.jobsTable.tableName,
            USERS_TABLE_NAME: this.usersTable.tableName,
            TEMP_BUCKET_NAME: this.tempFilesBucket.bucketName,
            API_SECRETS_ARN: apiSecrets.secretArn,
            KMS_KEY_ID: encryptionKey.keyId,
            ENABLE_DETAILED_LOGGING: config.enableDetailedLogging.toString(),
        };
        // Lambda functions
        const authFunction = new lambda.Function(this, 'AuthFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'auth.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/auth')),
            role: lambdaExecutionRole,
            environment: commonLambdaEnvironment,
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
            timeout: cdk.Duration.minutes(2),
            memorySize: 512,
            logRetention: logs.RetentionDays.ONE_MONTH,
            description: 'Premium doctor report generation',
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
            description: 'JWT token authorization',
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
        });
        // CloudWatch Log Groups with retention
        new logs.LogGroup(this, 'ApiGatewayLogGroup', {
            logGroupName: `/aws/apigateway/serenya-${environment}`,
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // S3 bucket notifications to trigger processing
        this.tempFilesBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3Notifications.LambdaDestination(processFunction), { prefix: 'uploads/' });
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
    }
    setupApiRoutes(authorizer, functions) {
        // Auth routes (no authorization required)
        const auth = this.api.root.addResource('auth');
        const googleAuth = auth.addResource('google');
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
    }
}
exports.SerenyaBackendStack = SerenyaBackendStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VyZW55YS1iYWNrZW5kLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vaW5mcmFzdHJ1Y3R1cmUvc2VyZW55YS1iYWNrZW5kLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQywrREFBaUQ7QUFDakQsdUVBQXlEO0FBQ3pELHVEQUF5QztBQUN6QyxtRUFBcUQ7QUFDckQseURBQTJDO0FBQzNDLDJEQUE2QztBQUM3QywrRUFBaUU7QUFDakUseURBQTJDO0FBQzNDLGtGQUFvRTtBQUNwRSwyQ0FBNkI7QUFhN0IsTUFBYSxtQkFBb0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQU1oRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQStCO1FBQ3ZFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRXRDLHlCQUF5QjtRQUN6QixNQUFNLGFBQWEsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQzlELFdBQVcsRUFBRSxXQUFXLFdBQVcsOEJBQThCO1lBQ2pFLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsYUFBYSxFQUFFLFdBQVcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87U0FDN0YsQ0FBQyxDQUFDO1FBRUgsK0JBQStCO1FBQy9CLE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDdEUsV0FBVyxFQUFFLFdBQVcsV0FBVyxjQUFjO1lBQ2pELFVBQVUsRUFBRSxXQUFXLFdB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LEtBQUssRUFBRSxJQUFJLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDL0UsVUFBVTtZQUNWLGlCQUFpQixFQUFFLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNO1lBQ3RELGlCQUFpQixFQUFFO2dCQUNqQiwyQkFBMkIsRUFBRSxJQUFJO2FBQ2xDO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsaUJBQWlCO1FBQ2pCLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDM0MsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNoRCxVQUFVLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxJQUFJLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDOUUsVUFBVTtZQUNWLGlCQUFpQixFQUFFLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNO1lBQ3RELGlCQUFpQixFQUFFO2dCQUNqQiwyQkFBMkIsRUFBRSxJQUFJO2FBQ2xDO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsMkNBQTJDO1FBQzNDLE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDMUQsWUFBWSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxVQUFVLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxFQUFFO1lBQ3ZGLFVBQVU7WUFDVixpQkFBaUIsRUFBRSxVQUFVLENBQUMsaUJBQWlCLENBQUMsTUFBTTtTQUN2RCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFyZEQsa0RBcWRDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBrbXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWttcyc7XG5pbXBvcnQgKiBhcyBzM05vdGlmaWNhdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzLW5vdGlmaWNhdGlvbnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5pbnRlcmZhY2UgU2VyZW55YUJhY2tlbmRTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuICBjb25maWc6IHtcbiAgICByZWdpb246IHN0cmluZztcbiAgICBhbGxvd09yaWdpbnM6IHN0cmluZ1tdO1xuICAgIHJldGVudGlvbkRheXM6IG51bWJlcjtcbiAgICBlbmFibGVEZXRhaWxlZExvZ2dpbmc6IGJvb2xlYW47XG4gIH07XG59XG5cbmV4cG9ydCBjbGFzcyBTZXJlbnlhQmFja2VuZFN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGFwaTogYXBpZ2F0ZXdheS5SZXN0QXBpO1xuICBwdWJsaWMgcmVhZG9ubHkgdGVtcEZpbGVzQnVja2V0OiBzMy5CdWNrZXQ7XG4gIHB1YmxpYyByZWFkb25seSBqb2JzVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xuICBwdWJsaWMgcmVhZG9ubHkgdXNlcnNUYWJsZTogZHluYW1vZGIuVGFibGU7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlcmVueWFCYWNrZW5kU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgeyBlbnZpcm9ubWVudCwgY29uZmlnIH0gPSBwcm9wcztcblxuICAgIC8vIEtNUyBLZXkgZm9yIGVuY3J5cHRpb25cbiAgICBjb25zdCBlbmNyeXB0aW9uS2V5ID0gbmV3IGttcy5LZXkodGhpcywgJ1NlcmVueWFFbmNyeXB0aW9uS2V5Jywge1xuICAgICAgZGVzY3JpcHRpb246IGBTZXJlbnlhICR7ZW52aXJvbm1lbnR9IGVuY3J5cHRpb24ga2V5IGZvciBQSEkgZGF0YWAsXG4gICAgICBlbmFibGVLZXlSb3RhdGlvbjogdHJ1ZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gU2VjcmV0cyBNYW5hZ2VyIGZvciBBUEkga2V5c1xuICAgIGNvbnN0IGFwaVNlY3JldHMgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdTZXJlbnlhQXBpU2VjcmV0cycsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgU2VyZW55YSAke2Vudmlyb25tZW50fSBBUEkgc2VjcmV0c2AsXG4gICAgICBzZWNyZXROYW1lOiBgc2VyZW55YS8ke2Vudmlyb25tZW50fS9hcGktc2VjcmV0c2AsXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBzZWNyZXRTdHJpbmdUZW1wbGF0ZTogSlNPTi5zdHJpbmdpZnkoeyBcbiAgICAgICAgICBqd3RTZWNyZXQ6ICcnLFxuICAgICAgICAgIGFudGhyb3BpY0FwaUtleTogJycsXG4gICAgICAgICAgZ29vZ2xlQ2xpZW50SWQ6ICcnLFxuICAgICAgICAgIGdvb2dsZUNsaWVudFNlY3JldDogJydcbiAgICAgICAgfSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAnand0U2VjcmV0JyxcbiAgICAgICAgZXhjbHVkZUNoYXJhY3RlcnM6ICdcIkAvXFxcXCcsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiA2NCxcbiAgICAgIH0sXG4gICAgICBlbmNyeXB0aW9uS2V5LFxuICAgIH0pO1xuXG4gICAgLy8gUzMgYnVja2V0IGZvciB0ZW1wb3JhcnkgZmlsZSBzdG9yYWdlXG4gICAgdGhpcy50ZW1wRmlsZXNCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdUZW1wRmlsZXNCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgc2VyZW55YS10ZW1wLWZpbGVzLSR7ZW52aXJvbm1lbnR9LSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLktNUyxcbiAgICAgIGVuY3J5cHRpb25LZXksXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5mb3JjZVNTTDogdHJ1ZSxcbiAgICAgIHZlcnNpb25lZDogZmFsc2UsXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0RlbGV0ZVRlbXBGaWxlcycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygxKSwgLy8gUHJpbWFyeSBjbGVhbnVwIGFmdGVyIDEgZGF5XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0RlbGV0ZUluY29tcGxldGVVcGxvYWRzJyxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGFib3J0SW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZEFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cygxKSxcbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIGNvcnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBbczMuSHR0cE1ldGhvZHMuUE9TVCwgczMuSHR0cE1ldGhvZHMuUFVUXSxcbiAgICAgICAgICBhbGxvd2VkT3JpZ2luczogY29uZmlnLmFsbG93T3JpZ2lucyxcbiAgICAgICAgICBhbGxvd2VkSGVhZGVyczogWycqJ10sXG4gICAgICAgICAgbWF4QWdlOiAzNjAwLFxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIER5bmFtb0RCIHRhYmxlIGZvciBqb2IgdHJhY2tpbmdcbiAgICB0aGlzLmpvYnNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnUHJvY2Vzc2luZ0pvYnNUYWJsZScsIHtcbiAgICAgIHRhYmxlTmFtZTogYHNlcmVueWEtam9icy0ke2Vudmlyb25tZW50fWAsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2pvYklkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQ1VTVE9NRVJfTUFOQUdFRCxcbiAgICAgIGVuY3J5cHRpb25LZXksXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnLFxuICAgICAgdGltZVRvTGl2ZUF0dHJpYnV0ZTogJ3R0bCcsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIEdTSSBmb3IgdXNlci1iYXNlZCBxdWVyaWVzXG4gICAgdGhpcy5qb2JzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiAnVXNlckpvYnNJbmRleCcsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3VzZXJJZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdjcmVhdGVkQXQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLk5VTUJFUiB9LFxuICAgIH0pO1xuXG4gICAgLy8gRHluYW1vREIgdGFibGUgZm9yIHVzZXIgcHJvZmlsZXMgKHRlbXBvcmFyeSlcbiAgICB0aGlzLnVzZXJzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1VzZXJzVGFibGUnLCB7XG4gICAgICB0YWJsZU5hbWU6IGBzZXJlbnlhLXVzZXJzLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndXNlcklkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQ1VTVE9NRVJfTUFOQUdFRCxcbiAgICAgIGVuY3J5cHRpb25LZXksXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnLFxuICAgICAgdGltZVRvTGl2ZUF0dHJpYnV0ZTogJ3R0bCcsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGV4ZWN1dGlvbiByb2xlIHdpdGggbGVhc3QgcHJpdmlsZWdlXG4gICAgY29uc3QgbGFtYmRhRXhlY3V0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnTGFtYmRhRXhlY3V0aW9uUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIFNlcmVueWFMYW1iZGFQb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIC8vIER5bmFtb0RCIHBlcm1pc3Npb25zXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6UHV0SXRlbScsIFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6RGVsZXRlSXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlF1ZXJ5JyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6U2NhbicsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIHRoaXMuam9ic1RhYmxlLnRhYmxlQXJuLFxuICAgICAgICAgICAgICAgIHRoaXMudXNlcnNUYWJsZS50YWJsZUFybixcbiAgICAgICAgICAgICAgICBgJHt0aGlzLmpvYnNUYWJsZS50YWJsZUFybn0vaW5kZXgvKmAsXG4gICAgICAgICAgICAgICAgYCR7dGhpcy51c2Vyc1RhYmxlLnRhYmxlQXJufS9pbmRleC8qYCxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgLy8gUzMgcGVybWlzc2lvbnNcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOkRlbGV0ZU9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdEFjbCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Ake3RoaXMudGVtcEZpbGVzQnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAvLyBTZWNyZXRzIE1hbmFnZXIgcGVybWlzc2lvbnNcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYXBpU2VjcmV0cy5zZWNyZXRBcm5dLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAvLyBLTVMgcGVybWlzc2lvbnNcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2ttczpEZWNyeXB0JyxcbiAgICAgICAgICAgICAgICAna21zOkdlbmVyYXRlRGF0YUtleScsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2VuY3J5cHRpb25LZXkua2V5QXJuXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENvbW1vbiBMYW1iZGEgZW52aXJvbm1lbnQgdmFyaWFibGVzXG4gICAgY29uc3QgY29tbW9uTGFtYmRhRW52aXJvbm1lbnQgPSB7XG4gICAgICBSRUdJT046IGNvbmZpZy5yZWdpb24sXG4gICAgICBFTlZJUk9OTUVOVDogZW52aXJvbm1lbnQsXG4gICAgICBKT0JTX1RBQkxFX05BTUU6IHRoaXMuam9ic1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIFVTRVJTX1RBQkxFX05BTUU6IHRoaXMudXNlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICBURU1QX0JVQ0tFVF9OQU1FOiB0aGlzLnRlbXBGaWxlc0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgQVBJX1NFQ1JFVFNfQVJOOiBhcGlTZWNyZXRzLnNlY3JldEFybixcbiAgICAgIEtNU19LRVlfSUQ6IGVuY3J5cHRpb25LZXkua2V5SWQsXG4gICAgICBFTkFCTEVfREVUQUlMRURfTE9HR0lORzogY29uZmlnLmVuYWJsZURldGFpbGVkTG9nZ2luZy50b1N0cmluZygpLFxuICAgIH07XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb25zXG4gICAgY29uc3QgYXV0aEZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQXV0aEZ1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnYXV0aC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy9hdXRoJykpLFxuICAgICAgcm9sZTogbGFtYmRhRXhlY3V0aW9uUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25MYW1iZGFFbnZpcm9ubWVudCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnR29vZ2xlIE9BdXRoIHZlcmlmaWNhdGlvbiBhbmQgSldUIGdlbmVyYXRpb24nLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdXNlclByb2ZpbGVGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1VzZXJQcm9maWxlRnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICd1c2VyUHJvZmlsZS5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy91c2VyJykpLFxuICAgICAgcm9sZTogbGFtYmRhRXhlY3V0aW9uUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25MYW1iZGFFbnZpcm9ubWVudCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDE1KSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVXNlciBwcm9maWxlIG1hbmFnZW1lbnQnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdXBsb2FkRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdVcGxvYWRGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ3VwbG9hZC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy91cGxvYWQnKSksXG4gICAgICByb2xlOiBsYW1iZGFFeGVjdXRpb25Sb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkxhbWJkYUVudmlyb25tZW50LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgZGVzY3JpcHRpb246ICdGaWxlIHVwbG9hZCB3aXRoIHZpcnVzIHNjYW5uaW5nJyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHByb2Nlc3NGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1Byb2Nlc3NGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ3Byb2Nlc3MuaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvcHJvY2VzcycpKSxcbiAgICAgIHJvbGU6IGxhbWJkYUV4ZWN1dGlvblJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uTGFtYmRhRW52aXJvbm1lbnQsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygzKSxcbiAgICAgIG1lbW9yeVNpemU6IDEwMjQsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FJIHByb2Nlc3Npbmcgd2l0aCBBbnRocm9waWMgQ2xhdWRlJyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHN0YXR1c0Z1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnU3RhdHVzRnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdzdGF0dXMuaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvc3RhdHVzJykpLFxuICAgICAgcm9sZTogbGFtYmRhRXhlY3V0aW9uUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25MYW1iZGFFbnZpcm9ubWVudCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDE1KSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHJvY2Vzc2luZyBzdGF0dXMgdHJhY2tpbmcnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVzdWx0RnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdSZXN1bHRGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ3Jlc3VsdC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy9yZXN1bHQnKSksXG4gICAgICByb2xlOiBsYW1iZGFFeGVjdXRpb25Sb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkxhbWJkYUVudmlyb25tZW50LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgZGVzY3JpcHRpb246ICdSZXN1bHRzIHJldHJpZXZhbCcsXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXRyeUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUmV0cnlGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ3JldHJ5LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL3JldHJ5JykpLFxuICAgICAgcm9sZTogbGFtYmRhRXhlY3V0aW9uUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25MYW1iZGFFbnZpcm9ubWVudCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHJvY2Vzc2luZyByZXRyeSBtYW5hZ2VtZW50JyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGRvY3RvclJlcG9ydEZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRG9jdG9yUmVwb3J0RnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdkb2N0b3JSZXBvcnQuaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXMvZG9jdG9yLXJlcG9ydCcpKSxcbiAgICAgIHJvbGU6IGxhbWJkYUV4ZWN1dGlvblJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uTGFtYmRhRW52aXJvbm1lbnQsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygyKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHJlbWl1bSBkb2N0b3IgcmVwb3J0IGdlbmVyYXRpb24nLFxuICAgIH0pO1xuXG4gICAgLy8gSldUIEF1dGhvcml6ZXIgTGFtYmRhXG4gICAgY29uc3QgYXV0aG9yaXplckZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQXV0aG9yaXplckZ1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnYXV0aG9yaXplci5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy9hdXRob3JpemVyJykpLFxuICAgICAgcm9sZTogbGFtYmRhRXhlY3V0aW9uUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIC4uLmNvbW1vbkxhbWJkYUVudmlyb25tZW50LFxuICAgICAgICBUT0tFTl9JU1NVRVI6ICdzZXJlbnlhLmhlYWx0aCcsXG4gICAgICAgIFRPS0VOX0FVRElFTkNFOiAnc2VyZW55YS1tb2JpbGUtYXBwJyxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxNSksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICBkZXNjcmlwdGlvbjogJ0pXVCB0b2tlbiBhdXRob3JpemF0aW9uJyxcbiAgICB9KTtcblxuICAgIC8vIEN1c3RvbSBhdXRob3JpemVyXG4gICAgY29uc3Qgand0QXV0aG9yaXplciA9IG5ldyBhcGlnYXRld2F5LlRva2VuQXV0aG9yaXplcih0aGlzLCAnSldUQXV0aG9yaXplcicsIHtcbiAgICAgIGhhbmRsZXI6IGF1dGhvcml6ZXJGdW5jdGlvbixcbiAgICAgIGlkZW50aXR5U291cmNlOiAnbWV0aG9kLnJlcXVlc3QuaGVhZGVyLkF1dGhvcml6YXRpb24nLFxuICAgICAgcmVzdWx0c0NhY2hlVHRsOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIGF1dGhvcml6ZXJOYW1lOiAnU2VyZW55YUpXVEF1dGhvcml6ZXInLFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIEdhdGV3YXlcbiAgICB0aGlzLmFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ1NlcmVueWFBcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogYHNlcmVueWEtYXBpLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgU2VyZW55YSBBSSBIZWFsdGggQWdlbnQgQVBJIC0gJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogY29uZmlnLmFsbG93T3JpZ2lucyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBbJ0dFVCcsICdQT1NUJywgJ1BVVCcsICdERUxFVEUnLCAnT1BUSU9OUyddLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJyxcbiAgICAgICAgICAnWC1BbXotRGF0ZScsIFxuICAgICAgICAgICdBdXRob3JpemF0aW9uJyxcbiAgICAgICAgICAnWC1BcGktS2V5JyxcbiAgICAgICAgICAnWC1BbXotU2VjdXJpdHktVG9rZW4nLFxuICAgICAgICAgICdYLUFtei1Vc2VyLUFnZW50JyxcbiAgICAgICAgXSxcbiAgICAgICAgYWxsb3dDcmVkZW50aWFsczogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBkZXBsb3lPcHRpb25zOiB7XG4gICAgICAgIHN0YWdlTmFtZTogZW52aXJvbm1lbnQsXG4gICAgICAgIGxvZ2dpbmdMZXZlbDogY29uZmlnLmVuYWJsZURldGFpbGVkTG9nZ2luZyBcbiAgICAgICAgICA/IGFwaWdhdGV3YXkuTWV0aG9kTG9nZ2luZ0xldmVsLklORk8gXG4gICAgICAgICAgOiBhcGlnYXRld2F5Lk1ldGhvZExvZ2dpbmdMZXZlbC5FUlJPUixcbiAgICAgICAgZGF0YVRyYWNlRW5hYmxlZDogY29uZmlnLmVuYWJsZURldGFpbGVkTG9nZ2luZyxcbiAgICAgICAgbWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIHRocm90dGxpbmdSYXRlTGltaXQ6IDEwMCxcbiAgICAgICAgdGhyb3R0bGluZ0J1cnN0TGltaXQ6IDIwMCxcbiAgICAgIH0sXG4gICAgICBlbmRwb2ludENvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgdHlwZXM6IFthcGlnYXRld2F5LkVuZHBvaW50VHlwZS5SRUdJT05BTF0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIEdhdGV3YXkgcmVzb3VyY2VzIGFuZCBtZXRob2RzXG4gICAgdGhpcy5zZXR1cEFwaVJvdXRlcyhqd3RBdXRob3JpemVyLCB7XG4gICAgICBhdXRoOiBhdXRoRnVuY3Rpb24sXG4gICAgICB1c2VyUHJvZmlsZTogdXNlclByb2ZpbGVGdW5jdGlvbixcbiAgICAgIHVwbG9hZDogdXBsb2FkRnVuY3Rpb24sXG4gICAgICBwcm9jZXNzOiBwcm9jZXNzRnVuY3Rpb24sXG4gICAgICBzdGF0dXM6IHN0YXR1c0Z1bmN0aW9uLFxuICAgICAgcmVzdWx0OiByZXN1bHRGdW5jdGlvbixcbiAgICAgIHJldHJ5OiByZXRyeUZ1bmN0aW9uLFxuICAgICAgZG9jdG9yUmVwb3J0OiBkb2N0b3JSZXBvcnRGdW5jdGlvbixcbiAgICB9KTtcblxuICAgIC8vIENsb3VkV2F0Y2ggTG9nIEdyb3VwcyB3aXRoIHJldGVudGlvblxuICAgIG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdBcGlHYXRld2F5TG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2FwaWdhdGV3YXkvc2VyZW55YS0ke2Vudmlyb25tZW50fWAsXG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gUzMgYnVja2V0IG5vdGlmaWNhdGlvbnMgdG8gdHJpZ2dlciBwcm9jZXNzaW5nXG4gICAgdGhpcy50ZW1wRmlsZXNCdWNrZXQuYWRkRXZlbnROb3RpZmljYXRpb24oXG4gICAgICBzMy5FdmVudFR5cGUuT0JKRUNUX0NSRUFURUQsXG4gICAgICBuZXcgczNOb3RpZmljYXRpb25zLkxhbWJkYURlc3RpbmF0aW9uKHByb2Nlc3NGdW5jdGlvbiksXG4gICAgICB7IHByZWZpeDogJ3VwbG9hZHMvJyB9XG4gICAgKTtcblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpVXJsJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VyZW55YSBBUEkgR2F0ZXdheSBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogYHNlcmVueWEtYXBpLXVybC0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hcGkucmVzdEFwaUlkLFxuICAgICAgZGVzY3JpcHRpb246ICdTZXJlbnlhIEFQSSBHYXRld2F5IElEJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBzZXJlbnlhLWFwaS1pZC0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVGVtcEJ1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy50ZW1wRmlsZXNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGVtcG9yYXJ5IGZpbGVzIFMzIGJ1Y2tldCBuYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBzZXJlbnlhLXRlbXAtYnVja2V0LSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdLbXNLZXlJZCcsIHtcbiAgICAgIHZhbHVlOiBlbmNyeXB0aW9uS2V5LmtleUlkLFxuICAgICAgZGVzY3JpcHRpb246ICdLTVMgZW5jcnlwdGlvbiBrZXkgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYHNlcmVueWEta21zLWtleS0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHNldHVwQXBpUm91dGVzKFxuICAgIGF1dGhvcml6ZXI6IGFwaWdhdGV3YXkuVG9rZW5BdXRob3JpemVyLFxuICAgIGZ1bmN0aW9uczogUmVjb3JkPHN0cmluZywgbGFtYmRhLkZ1bmN0aW9uPlxuICApIHtcbiAgICAvLyBBdXRoIHJvdXRlcyAobm8gYXV0aG9yaXphdGlvbiByZXF1aXJlZClcbiAgICBjb25zdCBhdXRoID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnYXV0aCcpO1xuICAgIGNvbnN0IGdvb2dsZUF1dGggPSBhdXRoLmFkZFJlc291cmNlKCdnb29nbGUnKTtcbiAgICBnb29nbGVBdXRoLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5hdXRoKSwge1xuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiAnMjAwJyxcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHN0YXR1c0NvZGU6ICc0MDAnLFxuICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogJzUwMCcsXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gVXNlciByb3V0ZXMgKGF1dGhvcml6YXRpb24gcmVxdWlyZWQpXG4gICAgY29uc3QgdXNlciA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3VzZXInKTtcbiAgICBjb25zdCBwcm9maWxlID0gdXNlci5hZGRSZXNvdXJjZSgncHJvZmlsZScpO1xuICAgIHByb2ZpbGUuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMudXNlclByb2ZpbGUpLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgIH0pO1xuXG4gICAgLy8gUHJvY2Vzc2luZyByb3V0ZXMgKGF1dGhvcml6YXRpb24gcmVxdWlyZWQpXG4gICAgY29uc3QgYXBpVjEgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCdhcGknKS5hZGRSZXNvdXJjZSgndjEnKTtcbiAgICBjb25zdCBwcm9jZXNzID0gYXBpVjEuYWRkUmVzb3VyY2UoJ3Byb2Nlc3MnKTtcblxuICAgIC8vIFVwbG9hZCBlbmRwb2ludFxuICAgIGNvbnN0IHVwbG9hZCA9IHByb2Nlc3MuYWRkUmVzb3VyY2UoJ3VwbG9hZCcpO1xuICAgIHVwbG9hZC5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMudXBsb2FkKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdtZXRob2QucmVxdWVzdC5oZWFkZXIuQ29udGVudC1UeXBlJzogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBTdGF0dXMgZW5kcG9pbnRcbiAgICBjb25zdCBzdGF0dXMgPSBwcm9jZXNzLmFkZFJlc291cmNlKCdzdGF0dXMnKTtcbiAgICBjb25zdCBzdGF0dXNKb2JJZCA9IHN0YXR1cy5hZGRSZXNvdXJjZSgne2pvYklkfScpO1xuICAgIHN0YXR1c0pvYklkLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZnVuY3Rpb25zLnN0YXR1cyksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucGF0aC5qb2JJZCc6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gUmVzdWx0IGVuZHBvaW50XG4gICAgY29uc3QgcmVzdWx0ID0gcHJvY2Vzcy5hZGRSZXNvdXJjZSgncmVzdWx0Jyk7XG4gICAgY29uc3QgcmVzdWx0Sm9iSWQgPSByZXN1bHQuYWRkUmVzb3VyY2UoJ3tqb2JJZH0nKTtcbiAgICByZXN1bHRKb2JJZC5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5yZXN1bHQpLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnBhdGguam9iSWQnOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFJldHJ5IGVuZHBvaW50XG4gICAgY29uc3QgcmV0cnkgPSBwcm9jZXNzLmFkZFJlc291cmNlKCdyZXRyeScpO1xuICAgIGNvbnN0IHJldHJ5Sm9iSWQgPSByZXRyeS5hZGRSZXNvdXJjZSgne2pvYklkfScpO1xuICAgIHJldHJ5Sm9iSWQuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZnVuY3Rpb25zLnJldHJ5KSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdtZXRob2QucmVxdWVzdC5wYXRoLmpvYklkJzogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBEb2N0b3IgcmVwb3J0IGVuZHBvaW50IChwcmVtaXVtIGZlYXR1cmUpXG4gICAgY29uc3QgZG9jdG9yUmVwb3J0ID0gcHJvY2Vzcy5hZGRSZXNvdXJjZSgnZG9jdG9yLXJlcG9ydCcpO1xuICAgIGRvY3RvclJlcG9ydC5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMuZG9jdG9yUmVwb3J0KSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICB9KTtcbiAgfVxufSJdfQ==