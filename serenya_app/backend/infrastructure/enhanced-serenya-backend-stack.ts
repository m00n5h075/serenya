import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Construct } from 'constructs';

// Import our new constructs
import { VpcConstruct } from './vpc-construct';
import { SecurityConstruct } from './security/security-construct';
import { MonitoringConstruct } from './monitoring/monitoring-construct';
import { EnhancedApiConstruct } from './enhanced-api-construct';
import { ConfigConstruct } from './config-construct';

interface EnhancedSerenyaBackendStackProps extends cdk.StackProps {
  environment: string;
  config: {
    region: string;
    allowOrigins: string[];
    retentionDays: number;
    enableDetailedLogging: boolean;
    enablePrivateLink: boolean;
    enableVpcFlowLogs: boolean;
    enableNatGateway: boolean;
  };
}

export class EnhancedSerenyaBackendStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly vpc: any;
  public readonly database: rds.DatabaseInstance;
  public readonly dbSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: EnhancedSerenyaBackendStackProps) {
    super(scope, id, props);

    const { environment, config } = props;

    // KMS Key for encryption
    const encryptionKey = new kms.Key(this, 'SerenyaEncryptionKey', {
      description: `Serenya ${environment} encryption key for PHI data`,
      enableKeyRotation: true,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Enhanced VPC with PrivateLink
    const vpcConstruct = new VpcConstruct(this, 'SerenyaVpc', {
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
      instanceType: cdk.aws_ec2.InstanceType.of(
        cdk.aws_ec2.InstanceClass.T3,
        environment === 'prod' ? cdk.aws_ec2.InstanceSize.SMALL : cdk.aws_ec2.InstanceSize.MICRO
      ),
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
    const configConstruct = new ConfigConstruct(this, 'SerenyaConfig', {
      environment,
      region: config.region,
      lambdaFunctions,
    });

    // Enhanced API Gateway
    const apiConstruct = new EnhancedApiConstruct(this, 'SerenyaEnhancedApi', {
      environment,
      region: config.region,
      allowOrigins: config.allowOrigins,
      enableDetailedLogging: config.enableDetailedLogging,
      lambdaFunctions,
      authorizer: jwtAuthorizer,
    });
    this.api = apiConstruct.api;

    // Security (WAF, CloudTrail, GuardDuty)
    const securityConstruct = new SecurityConstruct(this, 'SerenyaSecurity', {
      environment,
      region: config.region,
      vpc: this.vpc,
      api: this.api,
      enableVpcFlowLogs: config.enableVpcFlowLogs,
    });

    // Monitoring and Dashboards
    const monitoringConstruct = new MonitoringConstruct(this, 'SerenyaMonitoring', {
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