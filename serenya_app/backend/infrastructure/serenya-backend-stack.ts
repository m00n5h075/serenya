import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3Notifications from 'aws-cdk-lib/aws-s3-notifications';
import * as path from 'path';
import { Construct } from 'constructs';

interface SerenyaBackendStackProps extends cdk.StackProps {
  environment: string;
  config: {
    region: string;
    allowOrigins: string[];
    retentionDays: number;
    enableDetailedLogging: boolean;
  };
}

export class SerenyaBackendStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly tempFilesBucket: s3.Bucket;
  public readonly jobsTable: dynamodb.Table;
  public readonly usersTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: SerenyaBackendStackProps) {
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
    this.tempFilesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3Notifications.LambdaDestination(processFunction),
      { prefix: 'uploads/' }
    );

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

  private setupApiRoutes(
    authorizer: apigateway.TokenAuthorizer,
    functions: Record<string, lambda.Function>
  ) {
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