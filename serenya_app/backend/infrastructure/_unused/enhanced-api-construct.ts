import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

interface EnhancedApiConstructProps {
  environment: string;
  region: string;
  allowOrigins: string[];
  enableDetailedLogging: boolean;
  lambdaFunctions: Record<string, lambda.Function>;
  authorizer: apigateway.TokenAuthorizer;
}

export class EnhancedApiConstruct extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly requestValidator: apigateway.RequestValidator;

  constructor(scope: Construct, id: string, props: EnhancedApiConstructProps) {
    super(scope, id);

    const { environment, allowOrigins, enableDetailedLogging, lambdaFunctions, authorizer } = props;

    // Enhanced API Gateway with security configurations
    this.api = new apigateway.RestApi(this, 'EnhancedApi', {
      restApiName: `serenya-api-${environment}`,
      description: `Serenya AI Health Agent API - ${environment} (Enhanced Security)`,
      
      // CORS with stricter controls
      defaultCorsPreflightOptions: {
        allowOrigins: allowOrigins,
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date', 
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent',
          'X-Correlation-ID',
        ],
        allowCredentials: true,
        maxAge: cdk.Duration.hours(1), // Reduced from default for security
      },

      // Enhanced deployment options
      deployOptions: {
        stageName: environment,
        
        // Logging configuration
        loggingLevel: enableDetailedLogging 
          ? apigateway.MethodLoggingLevel.INFO 
          : apigateway.MethodLoggingLevel.ERROR,
        dataTraceEnabled: enableDetailedLogging,
        metricsEnabled: true,
        
        // Enhanced throttling
        throttlingRateLimit: environment === 'prod' ? 100 : 50,
        throttlingBurstLimit: environment === 'prod' ? 200 : 100,
        
        // Additional security headers
        methodOptions: {
          '/*/*': {
            throttlingRateLimit: environment === 'prod' ? 100 : 50,
            throttlingBurstLimit: environment === 'prod' ? 200 : 100,
          }
        }
      },

      // Regional endpoint for better security
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },

      // Disable execute API endpoint for additional security in production
      disableExecuteApiEndpoint: environment === 'prod',

      // Policy for additional security
      policy: new cdk.aws_iam.PolicyDocument({
        statements: [
          new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            principals: [new cdk.aws_iam.AnyPrincipal()],
            actions: ['execute-api:Invoke'],
            resources: ['*'],
            conditions: {
              StringEquals: {
                'aws:SourceVpce': environment === 'prod' ? 'vpce-*' : undefined,
              },
            },
          }),
        ],
      }),
    });

    // Request validator for input validation
    this.requestValidator = new apigateway.RequestValidator(this, 'RequestValidator', {
      restApi: this.api,
      requestValidatorName: `serenya-${environment}-validator`,
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    // Gateway responses for better error handling
    this.createGatewayResponses();

    // Setup enhanced API routes
    this.setupEnhancedApiRoutes(authorizer, lambdaFunctions);

    // Create API-specific alarms
    this.createApiAlarms(environment);
  }

  private createGatewayResponses() {
    // Custom error responses
    const errorResponses = [
      {
        type: apigateway.ResponseType.BAD_REQUEST_BODY,
        statusCode: '400',
        templates: {
          'application/json': JSON.stringify({
            error: 'INVALID_REQUEST_BODY',
            message: 'Request body validation failed',
            user_message: 'Please check your request format and try again'
          })
        }
      },
      {
        type: apigateway.ResponseType.BAD_REQUEST_PARAMETERS,
        statusCode: '400',
        templates: {
          'application/json': JSON.stringify({
            error: 'INVALID_REQUEST_PARAMETERS',
            message: 'Request parameters validation failed',
            user_message: 'Please check your request parameters and try again'
          })
        }
      },
      {
        type: apigateway.ResponseType.UNAUTHORIZED,
        statusCode: '401',
        templates: {
          'application/json': JSON.stringify({
            error: 'UNAUTHORIZED',
            message: 'Authentication required',
            user_message: 'Please sign in to access this resource'
          })
        }
      },
      {
        type: apigateway.ResponseType.ACCESS_DENIED,
        statusCode: '403',
        templates: {
          'application/json': JSON.stringify({
            error: 'ACCESS_DENIED',
            message: 'Access denied',
            user_message: 'You do not have permission to access this resource'
          })
        }
      },
      {
        type: apigateway.ResponseType.THROTTLED,
        statusCode: '429',
        templates: {
          'application/json': JSON.stringify({
            error: 'RATE_LIMITED',
            message: 'Rate limit exceeded',
            user_message: 'Too many requests. Please wait and try again'
          })
        }
      },
      {
        type: apigateway.ResponseType.REQUEST_TOO_LARGE,
        statusCode: '413',
        templates: {
          'application/json': JSON.stringify({
            error: 'REQUEST_TOO_LARGE',
            message: 'Request entity too large',
            user_message: 'File size exceeds maximum limit'
          })
        }
      },
    ];

    errorResponses.forEach((response, index) => {
      new apigateway.GatewayResponse(this, `GatewayResponse${index}`, {
        restApi: this.api,
        type: response.type,
        statusCode: response.statusCode,
        templates: response.templates,
        responseHeaders: {
          'Access-Control-Allow-Origin': "'*'",
          'Access-Control-Allow-Headers': "'*'",
          'X-Content-Type-Options': "'nosniff'",
          'X-Frame-Options': "'DENY'",
          'X-XSS-Protection': "'1; mode=block'",
          'Strict-Transport-Security': "'max-age=31536000; includeSubDomains'",
        },
      });
    });
  }

  private setupEnhancedApiRoutes(
    authorizer: apigateway.TokenAuthorizer,
    functions: Record<string, lambda.Function>
  ) {
    // Common request models for validation
    const authRequestModel = new apigateway.Model(this, 'AuthRequestModel', {
      restApi: this.api,
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          google_token: { type: apigateway.JsonSchemaType.STRING },
          id_token: { type: apigateway.JsonSchemaType.STRING },
          consent_acknowledgments: {
            type: apigateway.JsonSchemaType.OBJECT,
            properties: {
              medical_disclaimers: { type: apigateway.JsonSchemaType.BOOLEAN },
              terms_of_service: { type: apigateway.JsonSchemaType.BOOLEAN },
              privacy_policy: { type: apigateway.JsonSchemaType.BOOLEAN },
            }
          },
          device_info: { type: apigateway.JsonSchemaType.OBJECT },
          encryption_context: { type: apigateway.JsonSchemaType.OBJECT },
        },
        required: ['google_token', 'id_token'],
      },
    });

    // Auth routes (no authorization required)
    const auth = this.api.root.addResource('auth');
    const googleAuth = auth.addResource('google-onboarding');
    
    googleAuth.addMethod('POST', new apigateway.LambdaIntegration(functions.auth), {
      requestValidator: this.requestValidator,
      requestModels: {
        'application/json': authRequestModel,
      },
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.X-Correlation-ID': true,
          },
        },
        {
          statusCode: '400',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '401',
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
      requestParameters: {
        'method.request.header.Content-Type': true,
        'method.request.header.User-Agent': false,
        'method.request.header.X-Correlation-ID': false,
      },
    });

    // User routes (authorization required)
    const user = this.api.root.addResource('user');
    const profile = user.addResource('profile');
    
    profile.addMethod('GET', new apigateway.LambdaIntegration(functions.userProfile), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      requestValidator: this.requestValidator,
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.X-Correlation-ID': true,
          },
        },
      ],
    });

    // Processing routes (authorization required with enhanced validation)
    const apiV1 = this.api.root.addResource('api').addResource('v1');
    const process = apiV1.addResource('process');

    // Upload endpoint with file validation
    const upload = process.addResource('upload');
    upload.addMethod('POST', new apigateway.LambdaIntegration(functions.upload, {
      // Timeout configuration
      timeout: cdk.Duration.seconds(30),
      // Integration response mapping
      integrationResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': "'*'",
            'method.response.header.X-Correlation-ID': 'integration.response.header.X-Correlation-ID',
          },
        },
      ],
    }), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      requestValidator: this.requestValidator,
      requestParameters: {
        'method.request.header.Content-Type': true,
        'method.request.header.Content-Length': true,
        'method.request.header.X-Correlation-ID': false,
      },
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.X-Correlation-ID': true,
          },
        },
        {
          statusCode: '413',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
      ],
    });

    // Status endpoint with path validation
    const status = process.addResource('status');
    const statusJobId = status.addResource('{jobId}');
    statusJobId.addMethod('GET', new apigateway.LambdaIntegration(functions.status), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      requestValidator: this.requestValidator,
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
      requestValidator: this.requestValidator,
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
      requestValidator: this.requestValidator,
      requestParameters: {
        'method.request.path.jobId': true,
      },
    });

    // Doctor report endpoint (premium feature)
    const doctorReport = process.addResource('doctor-report');
    doctorReport.addMethod('POST', new apigateway.LambdaIntegration(functions.doctorReport), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      requestValidator: this.requestValidator,
    });
  }

  private createApiAlarms(environment: string) {
    // High 4XX error rate
    new cloudwatch.Alarm(this, 'High4XXErrorRate', {
      alarmName: `Serenya-${environment}-API-High4XX`,
      alarmDescription: 'Alert when API 4XX error rate is high',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '4XXError',
        dimensionsMap: {
          ApiName: this.api.restApiName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 50, // More than 50 4XX errors in 5 minutes
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // High 5XX error rate
    new cloudwatch.Alarm(this, 'High5XXErrorRate', {
      alarmName: `Serenya-${environment}-API-High5XX`,
      alarmDescription: 'Alert when API 5XX error rate is high',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        dimensionsMap: {
          ApiName: this.api.restApiName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10, // More than 10 5XX errors in 5 minutes
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // High latency alarm
    new cloudwatch.Alarm(this, 'HighLatencyAlarm', {
      alarmName: `Serenya-${environment}-API-HighLatency`,
      alarmDescription: 'Alert when API latency is high',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'Latency',
        dimensionsMap: {
          ApiName: this.api.restApiName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5000, // 5 seconds
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }
}