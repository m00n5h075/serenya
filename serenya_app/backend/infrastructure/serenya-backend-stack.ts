import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
// RDS and EC2 imports removed - migrated to DynamoDB-only architecture
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as path from 'path';
import { Construct } from 'constructs';
import { SerenyaDynamoDBTable } from './serenya-dynamodb-table';
import { ObservabilityConstruct } from './observability-construct';

interface SerenyaBackendStackProps extends cdk.StackProps {
  environment: string;
  config: {
    region: string;
    allowOrigins: string[];
    retentionDays: number;
    enableDetailedLogging: boolean;
    alertEmail?: string;
  };
}

export class SerenyaBackendStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly tempFilesBucket: s3.Bucket;
  public readonly dynamoDBTable: SerenyaDynamoDBTable;

  constructor(scope: Construct, id: string, props: SerenyaBackendStackProps) {
    super(scope, id, props);

    const { environment, config } = props;

    // KMS Key for encryption
    const encryptionKey = new kms.Key(this, 'SerenyaEncryptionKey', {
      description: `Serenya ${environment} encryption key for PHI data`,
      enableKeyRotation: true,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Phase 1: DynamoDB Table for RDS Migration
    this.dynamoDBTable = new SerenyaDynamoDBTable(this, 'SerenyaDynamoDBTable', environment);

    // VPC removed - DynamoDB doesn't require VPC, Lambda functions outside VPC

    // RDS infrastructure removed - migrated to DynamoDB

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

    // S3 bucket for observability event logs
    const eventsBucket = new s3.Bucket(this, 'ObservabilityEventsBucket', {
      bucketName: `serenya-events-${environment}-${this.account}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: false,
      lifecycleRules: [
        {
          id: 'ArchiveOldEvents',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(365),
            }
          ],
        }
      ],
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
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
            // RDS permissions removed - migrated to DynamoDB
            // S3 permissions
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:PutObjectAcl',
              ],
              resources: [
                `${this.tempFilesBucket.bucketArn}/*`,
                `${eventsBucket.bucketArn}/*`,
              ],
            }),
            // Secrets Manager permissions
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'secretsmanager:GetSecretValue',
                'secretsmanager:CreateSecret',
                'secretsmanager:UpdateSecret',
              ],
              resources: [apiSecrets.secretArn, `arn:aws:secretsmanager:${config.region}:${this.account}:secret:serenya/${environment}/app-database*`],
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

    // Common Lambda environment variables for DynamoDB-only architecture
    const commonLambdaEnvironment = {
      REGION: config.region,
      ENVIRONMENT: environment,
      // DynamoDB Configuration
      DYNAMO_TABLE_NAME: this.dynamoDBTable.table.tableName,
      TEMP_BUCKET_NAME: this.tempFilesBucket.bucketName,
      EVENTS_BUCKET: eventsBucket.bucketName,
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

    // DynamoDB Stream Processor for Observability
    const streamProcessorFunction = new lambda.Function(this, 'StreamProcessorFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'streamProcessor.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/stream-processor')),
      role: lambdaExecutionRole,
      environment: commonLambdaEnvironment,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      logRetention: logs.RetentionDays.ONE_MONTH,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
      tracing: lambda.Tracing.ACTIVE,
      description: 'DynamoDB stream processor for observability and business intelligence',
    });

    // Add DynamoDB stream event source to stream processor
    streamProcessorFunction.addEventSource(new lambdaEventSources.DynamoEventSource(this.dynamoDBTable.table, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 100,
      bisectBatchOnError: true,
      retryAttempts: 3,
      maxBatchingWindow: cdk.Duration.seconds(5),
    }));

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

    // RDS and VPC outputs removed - migrated to DynamoDB

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

    new cdk.CfnOutput(this, 'EventsBucketName', {
      value: eventsBucket.bucketName,
      description: 'Observability events S3 bucket name',
      exportName: `serenya-events-bucket-${environment}`,
    });

    // Observability: Dashboards and Alarms
    const observability = new ObservabilityConstruct(this, 'Observability', {
      environment,
      api: this.api,
      table: this.dynamoDBTable.table,
      lambdaFunctions: {
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
        streamProcessor: streamProcessorFunction,
      },
      alertEmail: config.alertEmail,
    });

    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: observability.alertTopic.topicArn,
      description: 'SNS topic for critical alerts',
      exportName: `serenya-alert-topic-${environment}`,
    });
  }

  private setupApiRoutes(
    authorizer: apigateway.TokenAuthorizer,
    functions: Record<string, lambda.Function>
  ) {
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