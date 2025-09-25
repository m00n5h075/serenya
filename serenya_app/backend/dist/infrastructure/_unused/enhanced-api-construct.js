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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5oYW5jZWQtYXBpLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL2luZnJhc3RydWN0dXJlL191bnVzZWQvZW5oYW5jZWQtYXBpLWNvbnN0cnVjdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdUVBQXlEO0FBR3pELHVFQUF5RDtBQUN6RCwyQ0FBdUM7QUFXdkMsTUFBYSxvQkFBcUIsU0FBUSxzQkFBUztJQUlqRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWdDO1FBQ3hFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUscUJBQXFCLEVBQUUsZUFBZSxFQUFFLFVBQVUsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUVoRyxvREFBb0Q7UUFDcEQsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyRCxXQUFXLEVBQUUsZUFBZSxXQUFXLEVBQUU7WUFDekMsV0FBVyxFQUFFLGlDQUFpQyxXQUFXLHNCQUFzQjtZQUUvRSw4QkFBOEI7WUFDOUIsMkJBQTJCLEVBQUU7Z0JBQzNCLFlBQVksRUFBRSxZQUFZO2dCQUMxQixZQUFZLEVBQUUsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsU0FBUyxDQUFDO2dCQUN6RCxZQUFZLEVBQUU7b0JBQ1osY0FBYztvQkFDZCxZQUFZO29CQUNaLGVBQWU7b0JBQ2YsV0FBVztvQkFDWCxzQkFBc0I7b0JBQ3RCLGtCQUFrQjtvQkFDbEIsa0JBQWtCO2lCQUNuQjtnQkFDRCxnQkFBZ0IsRUFBRSxJQUFJO2dCQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFD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QUUsZ0JBQWdCO2dCQUMzQixVQUFVLEVBQUUsU0FBUztnQkFDckIsYUFBYSxFQUFFO29CQUNiLE9BQU8sRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLFdBQVc7aUJBQzlCO2dCQUNELFNBQVMsRUFBRSxTQUFTO2dCQUNwQixNQUFNLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2FBQ2hDLENBQUM7WUFDRixTQUFTLEVBQUUsSUFBSSxFQUFFLFlBQVk7WUFDN0IsaUJBQWlCLEVBQUUsQ0FBQztZQUNwQixnQkFBZ0IsRUFBRSxVQUFVLENBQUMsZ0JBQWdCLENBQUMsYUFBYTtTQUM1RCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF0YUQsb0RBc2FDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5pbnRlcmZhY2UgRW5oYW5jZWRBcGlDb25zdHJ1Y3RQcm9wcyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG4gIHJlZ2lvbjogc3RyaW5nO1xuICBhbGxvd09yaWdpbnM6IHN0cmluZ1tdO1xuICBlbmFibGVEZXRhaWxlZExvZ2dpbmc6IGJvb2xlYW47XG4gIGxhbWJkYUZ1bmN0aW9uczogUmVjb3JkPHN0cmluZywgbGFtYmRhLkZ1bmN0aW9uPjtcbiAgYXV0aG9yaXplcjogYXBpZ2F0ZXdheS5Ub2tlbkF1dGhvcml6ZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBFbmhhbmNlZEFwaUNvbnN0cnVjdCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBhcGk6IGFwaWdhdGV3YXkuUmVzdEFwaTtcbiAgcHVibGljIHJlYWRvbmx5IHJlcXVlc3RWYWxpZGF0b3I6IGFwaWdhdGV3YXkuUmVxdWVzdFZhbGlkYXRvcjtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRW5oYW5jZWRBcGlDb25zdHJ1Y3RQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCB7IGVudmlyb25tZW50LCBhbGxvd09yaWdpbnMsIGVuYWJsZURldGFpbGVkTG9nZ2luZywgbGFtYmRhRnVuY3Rpb25zLCBhdXRob3JpemVyIH0gPSBwcm9wcztcblxuICAgIC8vIEVuaGFuY2VkIEFQSSBHYXRld2F5IHdpdGggc2VjdXJpdHkgY29uZmlndXJhdGlvbnNcbiAgICB0aGlzLmFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ0VuaGFuY2VkQXBpJywge1xuICAgICAgcmVzdEFwaU5hbWU6IGBzZXJlbnlhLWFwaS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFNlcmVueWEgQUkgSGVhbHRoIEFnZW50IEFQSSAtICR7ZW52aXJvbm1lbnR9IChFbmhhbmNlZCBTZWN1cml0eSlgLFxuICAgICAgXG4gICAgICAvLyBDT1JTIHdpdGggc3RyaWN0ZXIgY29udHJvbHNcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGFsbG93T3JpZ2lucyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBbJ0dFVCcsICdQT1NUJywgJ1BVVCcsICdERUxFVEUnLCAnT1BUSU9OUyddLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJyxcbiAgICAgICAgICAnWC1BbXotRGF0ZScsIFxuICAgICAgICAgICdBdXRob3JpemF0aW9uJyxcbiAgICAgICAgICAnWC1BcGktS2V5JyxcbiAgICAgICAgICAnWC1BbXotU2VjdXJpdHktVG9rZW4nLFxuICAgICAgICAgICdYLUFtei1Vc2VyLUFnZW50JyxcbiAgICAgICAgICAnWC1Db3JyZWxhdGlvbi1JRCcsXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93Q3JlZGVudGlhbHM6IHRydWUsXG4gICAgICAgIG1heEFnZTogY2RrLkR1cmF0aW9uLmhvdXJzKDEpLCAvLyBSZWR1Y2VkIGZyb20gZGVmYXVsdCBmb3Igc2VjdXJpdHlcbiAgICAgIH0sXG5cbiAgICAgIC8vIEVuaGFuY2VkIGRlcGxveW1lbnQgb3B0aW9uc1xuICAgICAgZGVwbG95T3B0aW9uczoge1xuICAgICAgICBzdGFnZU5hbWU6IGVudmlyb25tZW50LFxuICAgICAgICBcbiAgICAgICAgLy8gTG9nZ2luZyBjb25maWd1cmF0aW9uXG4gICAgICAgIGxvZ2dpbmdMZXZlbDogZW5hYmxlRGV0YWlsZWRMb2dnaW5nIFxuICAgICAgICAgID8gYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuSU5GTyBcbiAgICAgICAgICA6IGFwaWdhdGV3YXkuTWV0aG9kTG9nZ2luZ0xldmVsLkVSUk9SLFxuICAgICAgICBkYXRhVHJhY2VFbmFibGVkOiBlbmFibGVEZXRhaWxlZExvZ2dpbmcsXG4gICAgICAgIG1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICBcbiAgICAgICAgLy8gRW5oYW5jZWQgdGhyb3R0bGluZ1xuICAgICAgICB0aHJvdHRsaW5nUmF0ZUxpbWl0OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMTAwIDogNTAsXG4gICAgICAgIHRocm90dGxpbmdCdXJzdExpbWl0OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMjAwIDogMTAwLFxuICAgICAgICBcbiAgICAgICAgLy8gQWRkaXRpb25hbCBzZWN1cml0eSBoZWFkZXJzXG4gICAgICAgIG1ldGhvZE9wdGlvbnM6IHtcbiAgICAgICAgICAnLyovKic6IHtcbiAgICAgICAgICAgIHRocm90dGxpbmdSYXRlTGltaXQ6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyAxMDAgOiA1MCxcbiAgICAgICAgICAgIHRocm90dGxpbmdCdXJzdExpbWl0OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMjAwIDogMTAwLFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSxcblxuICAgICAgLy8gUmVnaW9uYWwgZW5kcG9pbnQgZm9yIGJldHRlciBzZWN1cml0eVxuICAgICAgZW5kcG9pbnRDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIHR5cGVzOiBbYXBpZ2F0ZXdheS5FbmRwb2ludFR5cGUuUkVHSU9OQUxdLFxuICAgICAgfSxcblxuICAgICAgLy8gRGlzYWJsZSBleGVjdXRlIEFQSSBlbmRwb2ludCBmb3IgYWRkaXRpb25hbCBzZWN1cml0eSBpbiBwcm9kdWN0aW9uXG4gICAgICBkaXNhYmxlRXhlY3V0ZUFwaUVuZHBvaW50OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnLFxuXG4gICAgICAvLyBQb2xpY3kgZm9yIGFkZGl0aW9uYWwgc2VjdXJpdHlcbiAgICAgIHBvbGljeTogbmV3IGNkay5hd3NfaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgIG5ldyBjZGsuYXdzX2lhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgZWZmZWN0OiBjZGsuYXdzX2lhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICBwcmluY2lwYWxzOiBbbmV3IGNkay5hd3NfaWFtLkFueVByaW5jaXBhbCgpXSxcbiAgICAgICAgICAgIGFjdGlvbnM6IFsnZXhlY3V0ZS1hcGk6SW52b2tlJ10sXG4gICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICAgICAnYXdzOlNvdXJjZVZwY2UnOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gJ3ZwY2UtKicgOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgfSksXG4gICAgfSk7XG5cbiAgICAvLyBSZXF1ZXN0IHZhbGlkYXRvciBmb3IgaW5wdXQgdmFsaWRhdGlvblxuICAgIHRoaXMucmVxdWVzdFZhbGlkYXRvciA9IG5ldyBhcGlnYXRld2F5LlJlcXVlc3RWYWxpZGF0b3IodGhpcywgJ1JlcXVlc3RWYWxpZGF0b3InLCB7XG4gICAgICByZXN0QXBpOiB0aGlzLmFwaSxcbiAgICAgIHJlcXVlc3RWYWxpZGF0b3JOYW1lOiBgc2VyZW55YS0ke2Vudmlyb25tZW50fS12YWxpZGF0b3JgLFxuICAgICAgdmFsaWRhdGVSZXF1ZXN0Qm9keTogdHJ1ZSxcbiAgICAgIHZhbGlkYXRlUmVxdWVzdFBhcmFtZXRlcnM6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBHYXRld2F5IHJlc3BvbnNlcyBmb3IgYmV0dGVyIGVycm9yIGhhbmRsaW5nXG4gICAgdGhpcy5jcmVhdGVHYXRld2F5UmVzcG9uc2VzKCk7XG5cbiAgICAvLyBTZXR1cCBlbmhhbmNlZCBBUEkgcm91dGVzXG4gICAgdGhpcy5zZXR1cEVuaGFuY2VkQXBpUm91dGVzKGF1dGhvcml6ZXIsIGxhbWJkYUZ1bmN0aW9ucyk7XG5cbiAgICAvLyBDcmVhdGUgQVBJLXNwZWNpZmljIGFsYXJtc1xuICAgIHRoaXMuY3JlYXRlQXBpQWxhcm1zKGVudmlyb25tZW50KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlR2F0ZXdheVJlc3BvbnNlcygpIHtcbiAgICAvLyBDdXN0b20gZXJyb3IgcmVzcG9uc2VzXG4gICAgY29uc3QgZXJyb3JSZXNwb25zZXMgPSBbXG4gICAgICB7XG4gICAgICAgIHR5cGU6IGFwaWdhdGV3YXkuUmVzcG9uc2VUeXBlLkJBRF9SRVFVRVNUX0JPRFksXG4gICAgICAgIHN0YXR1c0NvZGU6ICc0MDAnLFxuICAgICAgICB0ZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIGVycm9yOiAnSU5WQUxJRF9SRVFVRVNUX0JPRFknLFxuICAgICAgICAgICAgbWVzc2FnZTogJ1JlcXVlc3QgYm9keSB2YWxpZGF0aW9uIGZhaWxlZCcsXG4gICAgICAgICAgICB1c2VyX21lc3NhZ2U6ICdQbGVhc2UgY2hlY2sgeW91ciByZXF1ZXN0IGZvcm1hdCBhbmQgdHJ5IGFnYWluJ1xuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIHR5cGU6IGFwaWdhdGV3YXkuUmVzcG9uc2VUeXBlLkJBRF9SRVFVRVNUX1BBUkFNRVRFUlMsXG4gICAgICAgIHN0YXR1c0NvZGU6ICc0MDAnLFxuICAgICAgICB0ZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIGVycm9yOiAnSU5WQUxJRF9SRVFVRVNUX1BBUkFNRVRFUlMnLFxuICAgICAgICAgICAgbWVzc2FnZTogJ1JlcXVlc3QgcGFyYW1ldGVycyB2YWxpZGF0aW9uIGZhaWxlZCcsXG4gICAgICAgICAgICB1c2VyX21lc3NhZ2U6ICdQbGVhc2UgY2hlY2sgeW91ciByZXF1ZXN0IHBhcmFtZXRlcnMgYW5kIHRyeSBhZ2FpbidcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAge1xuICAgICAgICB0eXBlOiBhcGlnYXRld2F5LlJlc3BvbnNlVHlwZS5VTkFVVEhPUklaRUQsXG4gICAgICAgIHN0YXR1c0NvZGU6ICc0MDEnLFxuICAgICAgICB0ZW1wbGF0ZXM6IHtcbiAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIGVycm9yOiAnVU5BVVRIT1JJWkVEJyxcbiAgICAgICAgICAgIG1lc3NhZ2U6ICdBdXRoZW50aWNhdGlvbiByZXF1aXJlZCcsXG4gICAgICAgICAgICB1c2VyX21lc3NhZ2U6ICdQbGVhc2Ugc2lnbiBpbiB0byBhY2Nlc3MgdGhpcyByZXNvdXJjZSdcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAge1xuICAgICAgICB0eXBlOiBhcGlnYXRld2F5LlJlc3BvbnNlVHlwZS5BQ0NFU1NfREVOSUVELFxuICAgICAgICBzdGF0dXNDb2RlOiAnNDAzJyxcbiAgICAgICAgdGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBlcnJvcjogJ0FDQ0VTU19ERU5JRUQnLFxuICAgICAgICAgICAgbWVzc2FnZTogJ0FjY2VzcyBkZW5pZWQnLFxuICAgICAgICAgICAgdXNlcl9tZXNzYWdlOiAnWW91IGRvIG5vdCBoYXZlIHBlcm1pc3Npb24gdG8gYWNjZXNzIHRoaXMgcmVzb3VyY2UnXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgdHlwZTogYXBpZ2F0ZXdheS5SZXNwb25zZVR5cGUuVEhST1RUTEVELFxuICAgICAgICBzdGF0dXNDb2RlOiAnNDI5JyxcbiAgICAgICAgdGVtcGxhdGVzOiB7XG4gICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBlcnJvcjogJ1JBVEVfTElNSVRFRCcsXG4gICAgICAgICAgICBtZXNzYWdlOiAnUmF0ZSBsaW1pdCBleGNlZWRlZCcsXG4gICAgICAgICAgICB1c2VyX21lc3NhZ2U6ICdUb28gbWFueSByZXF1ZXN0cy4gUGxlYXNlIHdhaXQgYW5kIHRyeSBhZ2FpbidcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAge1xuICAgICAgICB0eXBlOiBhcGlnYXRld2F5LlJlc3BvbnNlVHlwZS5SRVFVRVNUX1RPT19MQVJHRSxcbiAgICAgICAgc3RhdHVzQ29kZTogJzQxMycsXG4gICAgICAgIHRlbXBsYXRlczoge1xuICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgZXJyb3I6ICdSRVFVRVNUX1RPT19MQVJHRScsXG4gICAgICAgICAgICBtZXNzYWdlOiAnUmVxdWVzdCBlbnRpdHkgdG9vIGxhcmdlJyxcbiAgICAgICAgICAgIHVzZXJfbWVzc2FnZTogJ0ZpbGUgc2l6ZSBleGNlZWRzIG1heGltdW0gbGltaXQnXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICBdO1xuXG4gICAgZXJyb3JSZXNwb25zZXMuZm9yRWFjaCgocmVzcG9uc2UsIGluZGV4KSA9PiB7XG4gICAgICBuZXcgYXBpZ2F0ZXdheS5HYXRld2F5UmVzcG9uc2UodGhpcywgYEdhdGV3YXlSZXNwb25zZSR7aW5kZXh9YCwge1xuICAgICAgICByZXN0QXBpOiB0aGlzLmFwaSxcbiAgICAgICAgdHlwZTogcmVzcG9uc2UudHlwZSxcbiAgICAgICAgc3RhdHVzQ29kZTogcmVzcG9uc2Uuc3RhdHVzQ29kZSxcbiAgICAgICAgdGVtcGxhdGVzOiByZXNwb25zZS50ZW1wbGF0ZXMsXG4gICAgICAgIHJlc3BvbnNlSGVhZGVyczoge1xuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBcIicqJ1wiLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogXCInKidcIixcbiAgICAgICAgICAnWC1Db250ZW50LVR5cGUtT3B0aW9ucyc6IFwiJ25vc25pZmYnXCIsXG4gICAgICAgICAgJ1gtRnJhbWUtT3B0aW9ucyc6IFwiJ0RFTlknXCIsXG4gICAgICAgICAgJ1gtWFNTLVByb3RlY3Rpb24nOiBcIicxOyBtb2RlPWJsb2NrJ1wiLFxuICAgICAgICAgICdTdHJpY3QtVHJhbnNwb3J0LVNlY3VyaXR5JzogXCInbWF4LWFnZT0zMTUzNjAwMDsgaW5jbHVkZVN1YkRvbWFpbnMnXCIsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0dXBFbmhhbmNlZEFwaVJvdXRlcyhcbiAgICBhdXRob3JpemVyOiBhcGlnYXRld2F5LlRva2VuQXV0aG9yaXplcixcbiAgICBmdW5jdGlvbnM6IFJlY29yZDxzdHJpbmcsIGxhbWJkYS5GdW5jdGlvbj5cbiAgKSB7XG4gICAgLy8gQ29tbW9uIHJlcXVlc3QgbW9kZWxzIGZvciB2YWxpZGF0aW9uXG4gICAgY29uc3QgYXV0aFJlcXVlc3RNb2RlbCA9IG5ldyBhcGlnYXRld2F5Lk1vZGVsKHRoaXMsICdBdXRoUmVxdWVzdE1vZGVsJywge1xuICAgICAgcmVzdEFwaTogdGhpcy5hcGksXG4gICAgICBzY2hlbWE6IHtcbiAgICAgICAgdHlwZTogYXBpZ2F0ZXdheS5Kc29uU2NoZW1hVHlwZS5PQkpFQ1QsXG4gICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICBnb29nbGVfdG9rZW46IHsgdHlwZTogYXBpZ2F0ZXdheS5Kc29uU2NoZW1hVHlwZS5TVFJJTkcgfSxcbiAgICAgICAgICBpZF90b2tlbjogeyB0eXBlOiBhcGlnYXRld2F5Lkpzb25TY2hlbWFUeXBlLlNUUklORyB9LFxuICAgICAgICAgIGNvbnNlbnRfYWNrbm93bGVkZ21lbnRzOiB7XG4gICAgICAgICAgICB0eXBlOiBhcGlnYXRld2F5Lkpzb25TY2hlbWFUeXBlLk9CSkVDVCxcbiAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgbWVkaWNhbF9kaXNjbGFpbWVyczogeyB0eXBlOiBhcGlnYXRld2F5Lkpzb25TY2hlbWFUeXBlLkJPT0xFQU4gfSxcbiAgICAgICAgICAgICAgdGVybXNfb2Zfc2VydmljZTogeyB0eXBlOiBhcGlnYXRld2F5Lkpzb25TY2hlbWFUeXBlLkJPT0xFQU4gfSxcbiAgICAgICAgICAgICAgcHJpdmFjeV9wb2xpY3k6IHsgdHlwZTogYXBpZ2F0ZXdheS5Kc29uU2NoZW1hVHlwZS5CT09MRUFOIH0sXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBkZXZpY2VfaW5mbzogeyB0eXBlOiBhcGlnYXRld2F5Lkpzb25TY2hlbWFUeXBlLk9CSkVDVCB9LFxuICAgICAgICAgIGVuY3J5cHRpb25fY29udGV4dDogeyB0eXBlOiBhcGlnYXRld2F5Lkpzb25TY2hlbWFUeXBlLk9CSkVDVCB9LFxuICAgICAgICB9LFxuICAgICAgICByZXF1aXJlZDogWydnb29nbGVfdG9rZW4nLCAnaWRfdG9rZW4nXSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBdXRoIHJvdXRlcyAobm8gYXV0aG9yaXphdGlvbiByZXF1aXJlZClcbiAgICBjb25zdCBhdXRoID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnYXV0aCcpO1xuICAgIGNvbnN0IGdvb2dsZUF1dGggPSBhdXRoLmFkZFJlc291cmNlKCdnb29nbGUtb25ib2FyZGluZycpO1xuICAgIFxuICAgIGdvb2dsZUF1dGguYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZnVuY3Rpb25zLmF1dGgpLCB7XG4gICAgICByZXF1ZXN0VmFsaWRhdG9yOiB0aGlzLnJlcXVlc3RWYWxpZGF0b3IsXG4gICAgICByZXF1ZXN0TW9kZWxzOiB7XG4gICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogYXV0aFJlcXVlc3RNb2RlbCxcbiAgICAgIH0sXG4gICAgICBtZXRob2RSZXNwb25zZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHN0YXR1c0NvZGU6ICcyMDAnLFxuICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogdHJ1ZSxcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLlgtQ29ycmVsYXRpb24tSUQnOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiAnNDAwJyxcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IHRydWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHN0YXR1c0NvZGU6ICc0MDEnLFxuICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogJzUwMCcsXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5Db250ZW50LVR5cGUnOiB0cnVlLFxuICAgICAgICAnbWV0aG9kLnJlcXVlc3QuaGVhZGVyLlVzZXItQWdlbnQnOiBmYWxzZSxcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5YLUNvcnJlbGF0aW9uLUlEJzogZmFsc2UsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gVXNlciByb3V0ZXMgKGF1dGhvcml6YXRpb24gcmVxdWlyZWQpXG4gICAgY29uc3QgdXNlciA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3VzZXInKTtcbiAgICBjb25zdCBwcm9maWxlID0gdXNlci5hZGRSZXNvdXJjZSgncHJvZmlsZScpO1xuICAgIFxuICAgIHByb2ZpbGUuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMudXNlclByb2ZpbGUpLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgcmVxdWVzdFZhbGlkYXRvcjogdGhpcy5yZXF1ZXN0VmFsaWRhdG9yLFxuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiAnMjAwJyxcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IHRydWUsXG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5YLUNvcnJlbGF0aW9uLUlEJzogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIFByb2Nlc3Npbmcgcm91dGVzIChhdXRob3JpemF0aW9uIHJlcXVpcmVkIHdpdGggZW5oYW5jZWQgdmFsaWRhdGlvbilcbiAgICBjb25zdCBhcGlWMSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2FwaScpLmFkZFJlc291cmNlKCd2MScpO1xuICAgIGNvbnN0IHByb2Nlc3MgPSBhcGlWMS5hZGRSZXNvdXJjZSgncHJvY2VzcycpO1xuXG4gICAgLy8gVXBsb2FkIGVuZHBvaW50IHdpdGggZmlsZSB2YWxpZGF0aW9uXG4gICAgY29uc3QgdXBsb2FkID0gcHJvY2Vzcy5hZGRSZXNvdXJjZSgndXBsb2FkJyk7XG4gICAgdXBsb2FkLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy51cGxvYWQsIHtcbiAgICAgIC8vIFRpbWVvdXQgY29uZmlndXJhdGlvblxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgLy8gSW50ZWdyYXRpb24gcmVzcG9uc2UgbWFwcGluZ1xuICAgICAgaW50ZWdyYXRpb25SZXNwb25zZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHN0YXR1c0NvZGU6ICcyMDAnLFxuICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogXCInKidcIixcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLlgtQ29ycmVsYXRpb24tSUQnOiAnaW50ZWdyYXRpb24ucmVzcG9uc2UuaGVhZGVyLlgtQ29ycmVsYXRpb24tSUQnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgcmVxdWVzdFZhbGlkYXRvcjogdGhpcy5yZXF1ZXN0VmFsaWRhdG9yLFxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5Db250ZW50LVR5cGUnOiB0cnVlLFxuICAgICAgICAnbWV0aG9kLnJlcXVlc3QuaGVhZGVyLkNvbnRlbnQtTGVuZ3RoJzogdHJ1ZSxcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5YLUNvcnJlbGF0aW9uLUlEJzogZmFsc2UsXG4gICAgICB9LFxuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiAnMjAwJyxcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IHRydWUsXG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5YLUNvcnJlbGF0aW9uLUlEJzogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogJzQxMycsXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gU3RhdHVzIGVuZHBvaW50IHdpdGggcGF0aCB2YWxpZGF0aW9uXG4gICAgY29uc3Qgc3RhdHVzID0gcHJvY2Vzcy5hZGRSZXNvdXJjZSgnc3RhdHVzJyk7XG4gICAgY29uc3Qgc3RhdHVzSm9iSWQgPSBzdGF0dXMuYWRkUmVzb3VyY2UoJ3tqb2JJZH0nKTtcbiAgICBzdGF0dXNKb2JJZC5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5zdGF0dXMpLCB7XG4gICAgICBhdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgcmVxdWVzdFZhbGlkYXRvcjogdGhpcy5yZXF1ZXN0VmFsaWRhdG9yLFxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnBhdGguam9iSWQnOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFJlc3VsdCBlbmRwb2ludFxuICAgIGNvbnN0IHJlc3VsdCA9IHByb2Nlc3MuYWRkUmVzb3VyY2UoJ3Jlc3VsdCcpO1xuICAgIGNvbnN0IHJlc3VsdEpvYklkID0gcmVzdWx0LmFkZFJlc291cmNlKCd7am9iSWR9Jyk7XG4gICAgcmVzdWx0Sm9iSWQuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmdW5jdGlvbnMucmVzdWx0KSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgIHJlcXVlc3RWYWxpZGF0b3I6IHRoaXMucmVxdWVzdFZhbGlkYXRvcixcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdtZXRob2QucmVxdWVzdC5wYXRoLmpvYklkJzogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBSZXRyeSBlbmRwb2ludFxuICAgIGNvbnN0IHJldHJ5ID0gcHJvY2Vzcy5hZGRSZXNvdXJjZSgncmV0cnknKTtcbiAgICBjb25zdCByZXRyeUpvYklkID0gcmV0cnkuYWRkUmVzb3VyY2UoJ3tqb2JJZH0nKTtcbiAgICByZXRyeUpvYklkLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZ1bmN0aW9ucy5yZXRyeSksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICByZXF1ZXN0VmFsaWRhdG9yOiB0aGlzLnJlcXVlc3RWYWxpZGF0b3IsXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucGF0aC5qb2JJZCc6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gRG9jdG9yIHJlcG9ydCBlbmRwb2ludCAocHJlbWl1bSBmZWF0dXJlKVxuICAgIGNvbnN0IGRvY3RvclJlcG9ydCA9IHByb2Nlc3MuYWRkUmVzb3VyY2UoJ2RvY3Rvci1yZXBvcnQnKTtcbiAgICBkb2N0b3JSZXBvcnQuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZnVuY3Rpb25zLmRvY3RvclJlcG9ydCksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICByZXF1ZXN0VmFsaWRhdG9yOiB0aGlzLnJlcXVlc3RWYWxpZGF0b3IsXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUFwaUFsYXJtcyhlbnZpcm9ubWVudDogc3RyaW5nKSB7XG4gICAgLy8gSGlnaCA0WFggZXJyb3IgcmF0ZVxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdIaWdoNFhYRXJyb3JSYXRlJywge1xuICAgICAgYWxhcm1OYW1lOiBgU2VyZW55YS0ke2Vudmlyb25tZW50fS1BUEktSGlnaDRYWGAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnQgd2hlbiBBUEkgNFhYIGVycm9yIHJhdGUgaXMgaGlnaCcsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9BcGlHYXRld2F5JyxcbiAgICAgICAgbWV0cmljTmFtZTogJzRYWEVycm9yJyxcbiAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgIEFwaU5hbWU6IHRoaXMuYXBpLnJlc3RBcGlOYW1lLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDUwLCAvLyBNb3JlIHRoYW4gNTAgNFhYIGVycm9ycyBpbiA1IG1pbnV0ZXNcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICAvLyBIaWdoIDVYWCBlcnJvciByYXRlXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ0hpZ2g1WFhFcnJvclJhdGUnLCB7XG4gICAgICBhbGFybU5hbWU6IGBTZXJlbnlhLSR7ZW52aXJvbm1lbnR9LUFQSS1IaWdoNVhYYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdBbGVydCB3aGVuIEFQSSA1WFggZXJyb3IgcmF0ZSBpcyBoaWdoJyxcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0FwaUdhdGV3YXknLFxuICAgICAgICBtZXRyaWNOYW1lOiAnNVhYRXJyb3InLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgQXBpTmFtZTogdGhpcy5hcGkucmVzdEFwaU5hbWUsXG4gICAgICAgIH0sXG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMTAsIC8vIE1vcmUgdGhhbiAxMCA1WFggZXJyb3JzIGluIDUgbWludXRlc1xuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIC8vIEhpZ2ggbGF0ZW5jeSBhbGFybVxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdIaWdoTGF0ZW5jeUFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiBgU2VyZW55YS0ke2Vudmlyb25tZW50fS1BUEktSGlnaExhdGVuY3lgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0IHdoZW4gQVBJIGxhdGVuY3kgaXMgaGlnaCcsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9BcGlHYXRld2F5JyxcbiAgICAgICAgbWV0cmljTmFtZTogJ0xhdGVuY3knLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgQXBpTmFtZTogdGhpcy5hcGkucmVzdEFwaU5hbWUsXG4gICAgICAgIH0sXG4gICAgICAgIHN0YXRpc3RpYzogJ0F2ZXJhZ2UnLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDUwMDAsIC8vIDUgc2Vjb25kc1xuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDMsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcbiAgfVxufSJdfQ==