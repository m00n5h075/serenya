import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
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
  public readonly vpc: ec2.Vpc;
  public readonly database: rds.DatabaseInstance;
  public readonly dbSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: SerenyaBackendStackProps) {
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
    dbSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Lambda access to PostgreSQL'
    );

    // PostgreSQL RDS Instance
    this.database = new rds.DatabaseInstance(this, 'SerenyaDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_8,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        environment === 'prod' ? ec2.InstanceSize.SMALL : ec2.InstanceSize.MICRO
      ),
      credentials: rds.Credentials.fromSecret(this.dbSecret),
      vpc: this.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSecurityGroup],
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
                `arn:aws:rds-db:${config.region}:${this.account}:dbuser:${this.database.instanceResourceId}/serenya_app`,
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
      DB_HOST: this.database.instanceEndpoint.hostname,
      DB_PORT: this.database.instanceEndpoint.port.toString(),
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
      chatPrompts: chatPromptsFunction,
      chatMessages: chatMessagesFunction,
      chatStatus: chatStatusFunction,
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
      value: this.database.instanceEndpoint.hostname,
      description: 'PostgreSQL database hostname',
      exportName: `serenya-db-host-${environment}`,
    });

    new cdk.CfnOutput(this, 'DatabasePort', {
      value: this.database.instanceEndpoint.port.toString(),
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
  }
}