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
exports.EnhancedApiConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const constructs_1 = require("constructs");
class EnhancedApiConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
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
    createGatewayResponses() {
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
    setupEnhancedApiRoutes(authorizer, functions) {
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
    createApiAlarms(environment) {
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
exports.EnhancedApiConstruct = EnhancedApiConstruct;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5oYW5jZWQtYXBpLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2luZnJhc3RydWN0dXJlL2VuaGFuY2VkLWFwaS1jb25zdHJ1Y3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVFQUF5RDtBQUd6RCx1RUFBeUQ7QUFDekQsMkNBQXVDO0FBV3ZDLE1BQWEsb0JBQXFCLFNBQVEsc0JBQVM7SUFJakQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFnQztRQUN4RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLHFCQUFxQixFQUFFLGVBQWUsRUFBRSxVQUFVLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFaEcsb0RBQW9EO1FBQ3BELElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDckQsV0FBVyxFQUFFLGVBQWUsV0FBVyxFQUFFO1lBQ3pDLFdBQVcsRUFBRSxpQ0FBaUMsV0FBVyxzQkFBc0I7WUFFL0UsOEJBQThCO1lBQzlCLDJCQUEyQixFQUFFO2dCQUMzQixZQUFZLEVBQUUsWUFBWTtnQkFDMUIsWUFBWSxFQUFFLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLFNBQVMsQ0FBQztnQkFDekQsWUFBWSxFQUFFO29CQUNaLGNBQWM7b0JBQ2QsWUFBWTtvQkFDWixlQUFlO29CQUNmLFdBQVc7b0JBQ1gsc0JBQXNCO29CQUN0QixrQkFBa0I7b0JBQ2xCLGtCQUFrQjtpQkFDbkI7Z0JBQ0QsZ0JBQWdCLEVBQUUsSUFBSTtnQkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLG9DQUFv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QkFDM0IsVUFBVSxFQUFFLFNBQVM7Z0JBQ3JCLGFBQWEsRUFBRTtvQkFDYixPQUFPLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxXQUFXO2lCQUM5QjtnQkFDRCxTQUFTLEVBQUUsU0FBUztnQkFDcEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQzthQUNoQyxDQUFDO1lBQ0YsU0FBUyxFQUFFLElBQUksRUFBRSxZQUFZO1lBQzdCLGlCQUFpQixFQUFFLENBQUM7WUFDcEIsZ0JBQWdCLEVBQUUsVUFBVSxDQUFDLGdCQUFnQixDQUFDLGFBQWE7U0FDNUQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBdGFELG9EQXNhQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuaW50ZXJmYWNlIEVuaGFuY2VkQXBpQ29uc3RydWN0UHJvcHMge1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuICByZWdpb246IHN0cmluZztcbiAgYWxsb3dPcmlnaW5zOiBzdHJpbmdbXTtcbiAgZW5hYmxlRGV0YWlsZWRMb2dnaW5nOiBib29sZWFuO1xuICBsYW1iZGFGdW5jdGlvbnM6IFJlY29yZDxzdHJpbmcsIGxhbWJkYS5GdW5jdGlvbj47XG4gIGF1dGhvcml6ZXI6IGFwaWdhdGV3YXkuVG9rZW5BdXRob3JpemVyO1xufVxuXG5leHBvcnQgY2xhc3MgRW5oYW5jZWRBcGlDb25zdHJ1Y3QgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgYXBpOiBhcGlnYXRld2F5LlJlc3RBcGk7XG4gIHB1YmxpYyByZWFkb25seSByZXF1ZXN0VmFsaWRhdG9yOiBhcGlnYXRld2F5LlJlcXVlc3RWYWxpZGF0b3I7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEVuaGFuY2VkQXBpQ29uc3RydWN0UHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgeyBlbnZpcm9ubWVudCwgYWxsb3dPcmlnaW5zLCBlbmFibGVEZXRhaWxlZExvZ2dpbmcsIGxhbWJkYUZ1bmN0aW9ucywgYXV0aG9yaXplciB9ID0gcHJvcHM7XG5cbiAgICAvLyBFbmhhbmNlZCBBUEkgR2F0ZXdheSB3aXRoIHNlY3VyaXR5IGNvbmZpZ3VyYXRpb25zXG4gICAgdGhpcy5hcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdFbmhhbmNlZEFwaScsIHtcbiAgICAgIHJlc3RBcGlOYW1lOiBgc2VyZW55YS1hcGktJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZGVzY3JpcHRpb246IGBTZXJlbnlhIEFJIEhlYWx0aCBBZ2VudCBBUEkgLSAke2Vudmlyb25tZW50fSAoRW5oYW5jZWQgU2VjdXJpdHkpYCxcbiAgICAgIFxuICAgICAgLy8gQ09SUyB3aXRoIHN0cmljdGVyIGNvbnRyb2xzXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhbGxvd09yaWdpbnMsXG4gICAgICAgIGFsbG93TWV0aG9kczogWydHRVQnLCAnUE9TVCcsICdQVVQnLCAnREVMRVRFJywgJ09QVElPTlMnXSxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZScsXG4gICAgICAgICAgJ1gtQW16LURhdGUnLCBcbiAgICAgICAgICAnQXV0aG9yaXphdGlvbicsXG4gICAgICAgICAgJ1gtQXBpLUtleScsXG4gICAgICAgICAgJ1gtQW16LVNlY3VyaXR5LVRva2VuJyxcbiAgICAgICAgICAnWC1BbXotVXNlci1BZ2VudCcsXG4gICAgICAgICAgJ1gtQ29ycmVsYXRpb24tSUQnLFxuICAgICAgICBdLFxuICAgICAgICBhbGxvd0NyZWRlbnRpYWxzOiB0cnVlLFxuICAgICAgICBtYXhBZ2U6IGNkay5EdXJhdGlvbi5ob3VycygxKSwgLy8gUmVkdWNlZCBmcm9tIGRlZmF1bHQgZm9yIHNlY3VyaXR5XG4gICAgICB9LFxuXG4gICAgICAvLyBFbmhhbmNlZCBkZXBsb3ltZW50IG9wdGlvbnNcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiBlbnZpcm9ubWVudCxcbiAgICAgICAgXG4gICAgICAgIC8vIExvZ2dpbmcgY29uZmlndXJhdGlvblxuICAgICAgICBsb2dnaW5nTGV2ZWw6IGVuYWJsZURldGFpbGVkTG9nZ2luZyBcbiAgICAgICAgICA/IGFwaWdhdGV3YXkuTWV0aG9kTG9nZ2luZ0xldmVsLklORk8gXG4gICAgICAgICAgOiBhcGlnYXRld2F5Lk1ldGhvZExvZ2dpbmdMZXZlbC5FUlJPUixcbiAgICAgICAgZGF0YVRyYWNlRW5hYmxlZDogZW5hYmxlRGV0YWlsZWRMb2dnaW5nLFxuICAgICAgICBtZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgXG4gICAgICAgIC8vIEVuaGFuY2VkIHRocm90dGxpbmdcbiAgICAgICAgdGhyb3R0bGluZ1JhdGVMaW1pdDogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IDEwMCA6IDUwLFxuICAgICAgICB0aHJvdHRsaW5nQnVyc3RMaW1pdDogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IDIwMCA6IDEwMCxcbiAgICAgICAgXG4gICAgICAgIC8vIEFkZGl0aW9uYWwgc2VjdXJpdHkgaGVhZGVyc1xuICAgICAgICBtZXRob2RPcHRpb25zOiB7XG4gICAgICAgICAgJy8qLyonOiB7XG4gICAgICAgICAgICB0aHJvdHRsaW5nUmF0ZUxpbWl0OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMTAwIDogNTAsXG4gICAgICAgICAgICB0aHJvdHRsaW5nQnVyc3RMaW1pdDogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IDIwMCA6IDEwMCxcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIC8vIFJlZ2lvbmFsIGVuZHBvaW50IGZvciBiZXR0ZXIgc2VjdXJpdHlcbiAgICAgIGVuZHBvaW50Q29uZmlndXJhdGlvbjoge1xuICAgICAgICB0eXBlczogW2FwaWdhdGV3YXkuRW5kcG9pbnRUeXBlLlJFR0lPTkFMXSxcbiAgICAgIH0sXG5cbiAgICAgIC8vIERpc2FibGUgZXhlY3V0ZSBBUEkgZW5kcG9pbnQgZm9yIGFkZGl0aW9uYWwgc2VjdXJpdHkgaW4gcHJvZHVjdGlvblxuICAgICAgZGlzYWJsZUV4ZWN1dGVBcGlFbmRwb2ludDogZW52aXJvbm1lbnQgPT09ICdwcm9kJyxcblxuICAgICAgLy8gUG9saWN5IGZvciBhZGRpdGlvbmFsIHNlY3VyaXR5XG4gICAgICBwb2xpY3k6IG5ldyBjZGsuYXdzX2lhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICBuZXcgY2RrLmF3c19pYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgIGVmZmVjdDogY2RrLmF3c19pYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgcHJpbmNpcGFsczogW25ldyBjZGsuYXdzX2lhbS5BbnlQcmluY2lwYWwoKV0sXG4gICAgICAgICAgICBhY3Rpb25zOiBbJ2V4ZWN1dGUtYXBpOkludm9rZSddLFxuICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAgICAgJ2F3czpTb3VyY2VWcGNlJzogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/ICd2cGNlLSonIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSxcbiAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgLy8gUmVxdWVzdCB2YWxpZGF0b3IgZm9yIGlucHV0IHZhbGlkYXRpb25cbiAgICB0aGlzLnJlcXVlc3RWYWxpZGF0b3IgPSBuZXcgYXBpZ2F0ZXdheS5SZXF1ZXN0VmFsaWRhdG9yKHRoaXMsICdSZXF1ZXN0VmFsaWRhdG9yJywge1xuICAgICAgcmVzdEFwaTogdGhpcy5hcGksXG4gICAgICByZXF1ZXN0VmFsaWRhdG9yTmFtZTogYHNlcmVueWEtJHtlbnZpcm9ubWVudH0tdmFsaWRhdG9yYCxcbiAgICAgIHZhbGlkYXRlUmVxdWVzdEJvZHk6IHRydWUsXG4gICAgICB2YWxpZGF0ZVJlcXVlc3RQYXJhbWV0ZXJzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gR2F0ZXdheSByZXNwb25zZXMgZm9yIGJldHRlciBlcnJvciBoYW5kbGluZ1xuICAgIHRoaXMuY3JlYXRlR2F0ZXdheVJlc3BvbnNlcygpO1xuXG4gICAgLy8gU2V0dXAgZW5oYW5jZWQgQVBJIHJvdXRlc1xuICAgIHRoaXMuc2V0dXBFbmhhbmNlZEFwaVJvdXRlcyhhdXRob3JpemVyLCBsYW1iZGFGdW5jdGlvbnMpO1xuXG4gICAgLy8gQ3JlYXRlIEFQSS1zcGVjaWZpYyBhbGFybXNcbiAgICB0aGlzLmNyZWF0ZUFwaUFsYXJtcyhlbnZpcm9ubWVudCk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUdhdGV3YXlSZXNwb25zZXMoKSB7XG4gICAgLy8gQ3VzdG9tIGVycm9yIHJlc3BvbnNlc1xuICAgIGNvbnN0IGVycm9yUmVzcG9uc2VzID0gW1xuICAgICAge1xuICAgICAgICB0eXBlOiBhcGlnYXRld2F5LlJlc3BvbnNlVHlwZS5CQURfUkVRVUVTVF9CT0RZLFxuICAgICAgICBzdGF0dXNDb2RlOiAnNDAwJyxcbiAgICAgICAgdGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBlcnJvcjogJ0lOVkFMSURfUkVRVUVTVF9CT0RZJyxcbiAgICAgICAgICAgIG1lc3NhZ2U6ICdSZXF1ZXN0IGJvZHkgdmFsaWRhdGlvbiBmYWlsZWQnLFxuICAgICAgICAgICAgdXNlcl9tZXNzYWdlOiAnUGxlYXNlIGNoZWNrIHlvdXIgcmVxdWVzdCBmb3JtYXQgYW5kIHRyeSBhZ2FpbidcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAge1xuICAgICAgICB0eXBlOiBhcGlnYXRld2F5LlJlc3BvbnNlVHlwZS5CQURfUkVRVUVTVF9QQVJBTUVURVJTLFxuICAgICAgICBzdGF0dXNDb2RlOiAnNDAwJyxcbiAgICAgICAgdGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBlcnJvcjogJ0lOVkFMSURfUkVRVUVTVF9QQVJBTUVURVJTJyxcbiAgICAgICAgICAgIG1lc3NhZ2U6ICdSZXF1ZXN0IHBhcmFtZXRlcnMgdmFsaWRhdGlvbiBmYWlsZWQnLFxuICAgICAgICAgICAgdXNlcl9tZXNzYWdlOiAnUGxlYXNlIGNoZWNrIHlvdXIgcmVxdWVzdCBwYXJhbWV0ZXJzIGFuZCB0cnkgYWdhaW4nXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgdHlwZTogYXBpZ2F0ZXdheS5SZXNwb25zZVR5cGUuVU5BVVRIT1JJWkVELFxuICAgICAgICBzdGF0dXNDb2RlOiAnNDAxJyxcbiAgICAgICAgdGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBlcnJvcjogJ1VOQVVUSE9SSVpFRCcsXG4gICAgICAgICAgICBtZXNzYWdlOiAnQXV0aGVudGljYXRpb24gcmVxdWlyZWQnLFxuICAgICAgICAgICAgdXNlcl9tZXNzYWdlOiAnUGxlYXNlIHNpZ24gaW4gdG8gYWNjZXNzIHRoaXMgcmVzb3VyY2UnXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgdHlwZTogYXBpZ2F0ZXdheS5SZXNwb25zZVR5cGUuQUNDRVNTX0RFTklFRCxcbiAgICAgICAgc3RhdHVzQ29kZTogJzQwMycsXG4gICAgICAgIHRlbXBsYXRlczoge1xuICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgZXJyb3I6ICdBQ0NFU1NfREVOSUVEJyxcbiAgICAgICAgICAgIG1lc3NhZ2U6ICdBY2Nlc3MgZGVuaWVkJyxcbiAgICAgICAgICAgIHVzZXJfbWVzc2FnZTogJ1lvdSBkbyBub3QgaGF2ZSBwZXJtaXNzaW9uIHRvIGFjY2VzcyB0aGlzIHJlc291cmNlJ1xuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIHR5cGU6IGFwaWdhdGV3YXkuUmVzcG9uc2VUeXBlLlRIUk9UVExFRCxcbiAgICAgICAgc3RhdHVzQ29kZTogJzQyOScsXG4gICAgICAgIHRlbXBsYXRlczoge1xuICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgZXJyb3I6ICdSQVRFX0xJTUlURUQnLFxuICAgICAgICAgICAgbWVzc2FnZTogJ1JhdGUgbGltaXQgZXhjZWVkZWQnLFxuICAgICAgICAgICAgdXNlcl9tZXNzYWdlOiAnVG9vIG1hbnkgcmVxdWVzdHMuIFBsZWFzZSB3YWl0IGFuZCB0cnkgYWdhaW4nXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgdHlwZTogYXBpZ2F0ZXdheS5SZXNwb25zZVR5cGUuUkVRVUVTVF9UT09fTEFSR0UsXG4gICAgICAgIHN0YXR1c0NvZGU6ICc0MTMnLFxuICAgICAgICB0ZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIGVycm9yOiAnUkVRVUVTVF9UT09fTEFSR0UnLFxuICAgICAgICAgICAgbWVzc2FnZTogJ1JlcXVlc3QgZW50aXR5IHRvbyBsYXJnZScsXG4gICAgICAgICAgICB1c2VyX21lc3NhZ2U6ICdGaWxlIHNpemUgZXhjZWVkcyBtYXhpbXVtIGxpbWl0J1xuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgXTtcblxuICAgIGVycm9yUmVzcG9uc2VzLmZvckVhY2goKHJlc3BvbnNlLCBpbmRleCkgPT4ge1xuICAgICAgbmV3IGFwaWdhdGV3YXkuR2F0ZXdheVJlc3BvbnNlKHRoaXMsIGBHYXRld2F5UmVzcG9uc2Uke2luZGV4fWAsIHtcbiAgICAgICAgcmVzdEFwaTogdGhpcy5hcGksXG4gICAgICAgIHR5cGU6IHJlc3BvbnNlLnR5cGUsXG4gICAgICAgIHN0YXR1c0NvZGU6IHJlc3BvbnNlLnN0YXR1c0NvZGUsXG4gICAgICAgIHRlbXBsYXRlczogcmVzcG9uc2UudGVtcGxhdGVzLFxuICAgICAgICByZXNwb25zZUhlYWRlcnM6IHtcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogXCInKidcIixcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6IFwiJyonXCIsXG4gICAgICAgICAgJ1gtQ29udGVudC1UeXBlLU9wdGlvbnMnOiBcIidub3NuaWZmJ1wiLFxuICAgICAgICAgICdYLUZyYW1lLU9wdGlvbnMnOiBcIidERU5ZJ1wiLFxuICAgICAgICAgICdYLVhTUy1Qcm90ZWN0aW9uJzogXCInMTsgbW9kZT1ibG9jaydcIixcbiAgICAgICAgICAnU3RyaWN0LVRyYW5zcG9ydC1TZWN1cml0eSc6IFwiJ21heC1hZ2U9MzE1MzYwMDA7IGluY2x1ZGVTdWJEb21haW5zJ1wiLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHNldHVwRW5oYW5jZWRBcGlSb3V0ZXMoXG4gICAgYXV0aG9yaXplcjogYXBpZ2F0ZXdheS5Ub2tlbkF1dGhvcml6ZXIsXG4gICAgZnVuY3Rpb25zOiBSZWNvcmQ8c3RyaW5nLCBsYW1iZGEuRnVuY3Rpb24+XG4gICkge1xuICAgIC8vIENvbW1vbiByZXF1ZXN0IG1vZGVscyBmb3IgdmFsaWRhdGlvblxuICAgIGNvbnN0IGF1dGhSZXF1ZXN0TW9kZWwgPSBuZXcgYXBpZ2F0ZXdheS5Nb2RlbCh0aGlzLCAnQXV0aFJlcXVlc3RNb2RlbCcsIHtcbiAgICAgIHJlc3RBcGk6IHRoaXMuYXBpLFxuICAgICAgc2NoZW1hOiB7XG4gICAgICAgIHR5cGU6IGFwaWdhdGV3YXkuSnNvblNjaGVtYVR5cGUuT0JKRUNULFxuICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgZ29vZ2xlX3Rva2VuOiB7IHR5cGU6IGFwaWdhdGV3YXkuSnNvblNjaGVtYVR5cGUuU1RSSU5HIH0sXG4gICAgICAgICAgaWRfdG9rZW46IHsgdHlwZTogYXBpZ2F0ZXdheS5Kc29uU2NoZW1hVHlwZS5TVFJJTkcgfSxcbiAgICAgICAgICBjb25zZW50X2Fja25vd2xlZGdtZW50czoge1xuICAgICAgICAgICAgdHlwZTogYXBpZ2F0ZXdheS5Kc29uU2NoZW1hVHlwZS5PQkpFQ1QsXG4gICAgICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgIG1lZGljYWxfZGlzY2xhaW1lcnM6IHsgdHlwZTogYXBpZ2F0ZXdheS5Kc29uU2NoZW1hVHlwZS5CT09MRUFOIH0sXG4gICAgICAgICAgICAgIHRlcm1zX29mX3NlcnZpY2U6IHsgdHlwZTogYXBpZ2F0ZXdheS5Kc29uU2NoZW1hVHlwZS5CT09MRUFOIH0sXG4gICAgICAgICAgICAgIHByaXZhY3lfcG9saWN5OiB7IHR5cGU6IGFwaWdhdGV3YXkuSnNvblNjaGVtYVR5cGUuQk9PTEVBTiB9LFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgZGV2aWNlX2luZm86IHsgdHlwZTogYXBpZ2F0ZXdheS5Kc29uU2NoZW1hVHlwZS5PQkpFQ1QgfSxcbiAgICAgICAgICBlbmNyeXB0aW9uX2NvbnRleHQ6IHsgdHlwZTogYXBpZ2F0ZXdheS5Kc29uU2NoZW1hVHlwZS5PQkpFQ1QgfSxcbiAgICAgICAgfSxcbiAgICAgICAgcmVxdWlyZWQ6IFsnZ29vZ2xlX3Rva2VuJywgJ2lkX3Rva2VuJ10sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQXV0aCByb3V0ZXMgKG5vIGF1dGhvcml6YXRpb24gcmVxdWlyZWQpXG4gICAgY29uc3QgYXV0aCA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2F1dGgnKTtcbiAgICBjb25zdCBnb29nbGVBdXRoID0gYXV0aC5hZGRSZXNvdXJjZSgnZ29vZ2xlLW9uYm9hcmRpbmcnKTtcbiAgICBcbiAgICBnb29nbGVBdXRoLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5hdXRoKSwge1xuICAgICAgcmVxdWVzdFZhbGlkYXRvcjogdGhpcy5yZXF1ZXN0VmFsaWRhdG9yLFxuICAgICAgcmVxdWVzdE1vZGVsczoge1xuICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IGF1dGhSZXF1ZXN0TW9kZWwsXG4gICAgICB9LFxuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiAnMjAwJyxcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IHRydWUsXG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5YLUNvcnJlbGF0aW9uLUlEJzogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogJzQwMCcsXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiAnNDAxJyxcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHN0YXR1c0NvZGU6ICc1MDAnLFxuICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdtZXRob2QucmVxdWVzdC5oZWFkZXIuQ29udGVudC1UeXBlJzogdHJ1ZSxcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5Vc2VyLUFnZW50JzogZmFsc2UsXG4gICAgICAgICdtZXRob2QucmVxdWVzdC5oZWFkZXIuWC1Db3JyZWxhdGlvbi1JRCc6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFVzZXIgcm91dGVzIChhdXRob3JpemF0aW9uIHJlcXVpcmVkKVxuICAgIGNvbnN0IHVzZXIgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCd1c2VyJyk7XG4gICAgY29uc3QgcHJvZmlsZSA9IHVzZXIuYWRkUmVzb3VyY2UoJ3Byb2ZpbGUnKTtcbiAgICBcbiAgICBwcm9maWxlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZnVuY3Rpb25zLnVzZXJQcm9maWxlKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgIHJlcXVlc3RWYWxpZGF0b3I6IHRoaXMucmVxdWVzdFZhbGlkYXRvcixcbiAgICAgIG1ldGhvZFJlc3BvbnNlczogW1xuICAgICAgICB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogJzIwMCcsXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiB0cnVlLFxuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuWC1Db3JyZWxhdGlvbi1JRCc6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBQcm9jZXNzaW5nIHJvdXRlcyAoYXV0aG9yaXphdGlvbiByZXF1aXJlZCB3aXRoIGVuaGFuY2VkIHZhbGlkYXRpb24pXG4gICAgY29uc3QgYXBpVjEgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCdhcGknKS5hZGRSZXNvdXJjZSgndjEnKTtcbiAgICBjb25zdCBwcm9jZXNzID0gYXBpVjEuYWRkUmVzb3VyY2UoJ3Byb2Nlc3MnKTtcblxuICAgIC8vIFVwbG9hZCBlbmRwb2ludCB3aXRoIGZpbGUgdmFsaWRhdGlvblxuICAgIGNvbnN0IHVwbG9hZCA9IHByb2Nlc3MuYWRkUmVzb3VyY2UoJ3VwbG9hZCcpO1xuICAgIHVwbG9hZC5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMudXBsb2FkLCB7XG4gICAgICAvLyBUaW1lb3V0IGNvbmZpZ3VyYXRpb25cbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIC8vIEludGVncmF0aW9uIHJlc3BvbnNlIG1hcHBpbmdcbiAgICAgIGludGVncmF0aW9uUmVzcG9uc2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiAnMjAwJyxcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IFwiJyonXCIsXG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5YLUNvcnJlbGF0aW9uLUlEJzogJ2ludGVncmF0aW9uLnJlc3BvbnNlLmhlYWRlci5YLUNvcnJlbGF0aW9uLUlEJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgIHJlcXVlc3RWYWxpZGF0b3I6IHRoaXMucmVxdWVzdFZhbGlkYXRvcixcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdtZXRob2QucmVxdWVzdC5oZWFkZXIuQ29udGVudC1UeXBlJzogdHJ1ZSxcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5Db250ZW50LUxlbmd0aCc6IHRydWUsXG4gICAgICAgICdtZXRob2QucmVxdWVzdC5oZWFkZXIuWC1Db3JyZWxhdGlvbi1JRCc6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIG1ldGhvZFJlc3BvbnNlczogW1xuICAgICAgICB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogJzIwMCcsXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiB0cnVlLFxuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuWC1Db3JyZWxhdGlvbi1JRCc6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHN0YXR1c0NvZGU6ICc0MTMnLFxuICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIFN0YXR1cyBlbmRwb2ludCB3aXRoIHBhdGggdmFsaWRhdGlvblxuICAgIGNvbnN0IHN0YXR1cyA9IHByb2Nlc3MuYWRkUmVzb3VyY2UoJ3N0YXR1cycpO1xuICAgIGNvbnN0IHN0YXR1c0pvYklkID0gc3RhdHVzLmFkZFJlc291cmNlKCd7am9iSWR9Jyk7XG4gICAgc3RhdHVzSm9iSWQuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMuc3RhdHVzKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgIHJlcXVlc3RWYWxpZGF0b3I6IHRoaXMucmVxdWVzdFZhbGlkYXRvcixcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdtZXRob2QucmVxdWVzdC5wYXRoLmpvYklkJzogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBSZXN1bHQgZW5kcG9pbnRcbiAgICBjb25zdCByZXN1bHQgPSBwcm9jZXNzLmFkZFJlc291cmNlKCdyZXN1bHQnKTtcbiAgICBjb25zdCByZXN1bHRKb2JJZCA9IHJlc3VsdC5hZGRSZXNvdXJjZSgne2pvYklkfScpO1xuICAgIHJlc3VsdEpvYklkLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZnVuY3Rpb25zLnJlc3VsdCksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICByZXF1ZXN0VmFsaWRhdG9yOiB0aGlzLnJlcXVlc3RWYWxpZGF0b3IsXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucGF0aC5qb2JJZCc6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gUmV0cnkgZW5kcG9pbnRcbiAgICBjb25zdCByZXRyeSA9IHByb2Nlc3MuYWRkUmVzb3VyY2UoJ3JldHJ5Jyk7XG4gICAgY29uc3QgcmV0cnlKb2JJZCA9IHJldHJ5LmFkZFJlc291cmNlKCd7am9iSWR9Jyk7XG4gICAgcmV0cnlKb2JJZC5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMucmV0cnkpLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgcmVxdWVzdFZhbGlkYXRvcjogdGhpcy5yZXF1ZXN0VmFsaWRhdG9yLFxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnBhdGguam9iSWQnOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIERvY3RvciByZXBvcnQgZW5kcG9pbnQgKHByZW1pdW0gZmVhdHVyZSlcbiAgICBjb25zdCBkb2N0b3JSZXBvcnQgPSBwcm9jZXNzLmFkZFJlc291cmNlKCdkb2N0b3ItcmVwb3J0Jyk7XG4gICAgZG9jdG9yUmVwb3J0LmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5kb2N0b3JSZXBvcnQpLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgcmVxdWVzdFZhbGlkYXRvcjogdGhpcy5yZXF1ZXN0VmFsaWRhdG9yLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVBcGlBbGFybXMoZW52aXJvbm1lbnQ6IHN0cmluZykge1xuICAgIC8vIEhpZ2ggNFhYIGVycm9yIHJhdGVcbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnSGlnaDRYWEVycm9yUmF0ZScsIHtcbiAgICAgIGFsYXJtTmFtZTogYFNlcmVueWEtJHtlbnZpcm9ubWVudH0tQVBJLUhpZ2g0WFhgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0IHdoZW4gQVBJIDRYWCBlcnJvciByYXRlIGlzIGhpZ2gnLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdBV1MvQXBpR2F0ZXdheScsXG4gICAgICAgIG1ldHJpY05hbWU6ICc0WFhFcnJvcicsXG4gICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICBBcGlOYW1lOiB0aGlzLmFwaS5yZXN0QXBpTmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1MCwgLy8gTW9yZSB0aGFuIDUwIDRYWCBlcnJvcnMgaW4gNSBtaW51dGVzXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgLy8gSGlnaCA1WFggZXJyb3IgcmF0ZVxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdIaWdoNVhYRXJyb3JSYXRlJywge1xuICAgICAgYWxhcm1OYW1lOiBgU2VyZW55YS0ke2Vudmlyb25tZW50fS1BUEktSGlnaDVYWGAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnQgd2hlbiBBUEkgNVhYIGVycm9yIHJhdGUgaXMgaGlnaCcsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9BcGlHYXRld2F5JyxcbiAgICAgICAgbWV0cmljTmFtZTogJzVYWEVycm9yJyxcbiAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgIEFwaU5hbWU6IHRoaXMuYXBpLnJlc3RBcGlOYW1lLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEwLCAvLyBNb3JlIHRoYW4gMTAgNVhYIGVycm9ycyBpbiA1IG1pbnV0ZXNcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICAvLyBIaWdoIGxhdGVuY3kgYWxhcm1cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnSGlnaExhdGVuY3lBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogYFNlcmVueWEtJHtlbnZpcm9ubWVudH0tQVBJLUhpZ2hMYXRlbmN5YCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdBbGVydCB3aGVuIEFQSSBsYXRlbmN5IGlzIGhpZ2gnLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdBV1MvQXBpR2F0ZXdheScsXG4gICAgICAgIG1ldHJpY05hbWU6ICdMYXRlbmN5JyxcbiAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgIEFwaU5hbWU6IHRoaXMuYXBpLnJlc3RBcGlOYW1lLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1MDAwLCAvLyA1IHNlY29uZHNcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAzLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG4gIH1cbn0iXX0=