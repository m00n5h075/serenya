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
exports.MonitoringConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const path = __importStar(require("path"));
const constructs_1 = require("constructs");
const fs = __importStar(require("fs"));
class MonitoringConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { environment, region, accountId, apiGatewayId, kmsKeyId, dbInstanceId, lambdaFunctions } = props;
        // Custom metrics publishing role
        this.customMetricsRole = new iam.Role(this, 'CustomMetricsRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                CustomMetricsPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'cloudwatch:PutMetricData',
                                'logs:CreateLogGroup',
                                'logs:CreateLogStream',
                                'logs:PutLogEvents',
                            ],
                            resources: ['*'],
                        }),
                    ],
                }),
            },
        });
        // Create custom metrics collection Lambda
        const customMetricsFunction = new lambda.Function(this, 'CustomMetricsFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'customMetrics.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/monitoring')),
            role: this.customMetricsRole,
            environment: {
                ENVIRONMENT: environment,
                REGION: region,
            },
            timeout: cdk.Duration.minutes(5),
            memorySize: 256,
            description: 'Custom CloudWatch metrics collection for Serenya',
        });
        // Metric filters for log-based metrics
        this.metricFilters = [];
        // Business metrics from logs
        Object.entries(lambdaFunctions).forEach(([name, func]) => {
            if (func.logGroup) {
                // Processing success/failure metrics
                if (name === 'process') {
                    const successFilter = new logs.MetricFilter(this, `${name}SuccessFilter`, {
                        logGroup: func.logGroup,
                        metricNamespace: 'Serenya/Business',
                        metricName: 'ProcessingSuccess',
                        metricValue: '1',
                        filterPattern: logs.FilterPattern.stringValue('$.level', '=', 'INFO')
                            .and(logs.FilterPattern.stringValue('$.event', '=', 'processing_complete')),
                        defaultValue: 0,
                    });
                    const failureFilter = new logs.MetricFilter(this, `${name}FailureFilter`, {
                        logGroup: func.logGroup,
                        metricNamespace: 'Serenya/Business',
                        metricName: 'ProcessingFailure',
                        metricValue: '1',
                        filterPattern: logs.FilterPattern.stringValue('$.level', '=', 'ERROR')
                            .and(logs.FilterPattern.stringValue('$.event', '=', 'processing_failed')),
                        defaultValue: 0,
                    });
                    this.metricFilters.push(successFilter, failureFilter);
                }
                // Security metrics
                const authAttemptsFilter = new logs.MetricFilter(this, `${name}AuthAttemptsFilter`, {
                    logGroup: func.logGroup,
                    metricNamespace: 'Serenya/Security',
                    metricName: 'AuthenticationAttempts',
                    metricValue: '1',
                    filterPattern: logs.FilterPattern.stringValue('$.event', '=', 'authentication_attempt'),
                    defaultValue: 0,
                });
                this.metricFilters.push(authAttemptsFilter);
            }
        });
        // Load and create dashboards
        this.dashboards = {};
        const dashboardConfigs = [
            'business-metrics-dashboard',
            'technical-performance-dashboard',
            'security-monitoring-dashboard',
            'cost-tracking-dashboard'
        ];
        dashboardConfigs.forEach(configName => {
            const dashboardPath = path.join(__dirname, `dashboards/${configName}.json`);
            let dashboardBody = fs.readFileSync(dashboardPath, 'utf-8');
            // Replace template variables
            dashboardBody = dashboardBody
                .replace(/\${environment}/g, environment)
                .replace(/\${region}/g, region)
                .replace(/\${accountId}/g, accountId)
                .replace(/\${dbInstanceId}/g, dbInstanceId)
                .replace(/\${kmsKeyId}/g, kmsKeyId);
            const dashboard = new cloudwatch.Dashboard(this, `${configName.replace(/-/g, '')}Dashboard`, {
                dashboardName: `Serenya-${environment}-${configName}`,
                widgets: JSON.parse(dashboardBody).widgets.map((widget) => {
                    if (widget.type === 'metric') {
                        return new cloudwatch.GraphWidget({
                            title: widget.properties.title,
                            left: widget.properties.metrics?.map((metric) => new cloudwatch.Metric({
                                namespace: metric[0],
                                metricName: metric[1],
                                dimensionsMap: this.parseDimensions(metric.slice(2)),
                                statistic: metric[metric.length - 1]?.stat || 'Average',
                            })) || [],
                            width: widget.width,
                            height: widget.height,
                            view: widget.properties.view === 'singleValue' ?
                                cloudwatch.GraphWidgetView.SINGLE_VALUE :
                                cloudwatch.GraphWidgetView.TIME_SERIES,
                        });
                    }
                    else if (widget.type === 'log') {
                        return new cloudwatch.LogQueryWidget({
                            title: widget.properties.title,
                            logGroups: [logs.LogGroup.fromLogGroupName(this, `LogGroup${configName}${widget.x}${widget.y}`, '/aws/lambda/dummy')],
                            queryString: widget.properties.query,
                            width: widget.width,
                            height: widget.height,
                        });
                    }
                    // Default to text widget for unsupported types
                    return new cloudwatch.TextWidget({
                        markdown: `# ${widget.properties.title}\nWidget type ${widget.type} not yet implemented`,
                        width: widget.width,
                        height: widget.height,
                    });
                }),
            });
            this.dashboards[configName] = dashboard;
        });
        // CloudWatch Alarms
        this.createAlarms(props);
    }
    parseDimensions(metricArray) {
        const dimensions = {};
        for (let i = 0; i < metricArray.length; i += 2) {
            if (typeof metricArray[i] === 'string' && typeof metricArray[i + 1] === 'string') {
                dimensions[metricArray[i]] = metricArray[i + 1];
            }
        }
        return dimensions;
    }
    createAlarms(props) {
        const { environment, lambdaFunctions } = props;
        // High error rate alarm
        new cloudwatch.Alarm(this, 'HighErrorRateAlarm', {
            alarmName: `Serenya-${environment}-HighErrorRate`,
            alarmDescription: 'Alert when Lambda error rate exceeds 5%',
            metric: new cloudwatch.MathExpression({
                expression: 'errors/invocations*100',
                usingMetrics: {
                    errors: lambdaFunctions.process.metricErrors({ statistic: 'Sum' }),
                    invocations: lambdaFunctions.process.metricInvocations({ statistic: 'Sum' }),
                },
            }),
            threshold: 5,
            evaluationPeriods: 2,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // High latency alarm
        new cloudwatch.Alarm(this, 'HighLatencyAlarm', {
            alarmName: `Serenya-${environment}-HighLatency`,
            alarmDescription: 'Alert when processing latency exceeds 3 minutes',
            metric: lambdaFunctions.process.metricDuration({ statistic: 'Average' }),
            threshold: 180000, // 3 minutes in milliseconds
            evaluationPeriods: 3,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Database CPU alarm
        new cloudwatch.Alarm(this, 'DatabaseHighCPUAlarm', {
            alarmName: `Serenya-${environment}-DatabaseHighCPU`,
            alarmDescription: 'Alert when database CPU exceeds 80%',
            metric: new cloudwatch.Metric({
                namespace: 'AWS/RDS',
                metricName: 'CPUUtilization',
                dimensionsMap: {
                    DBInstanceIdentifier: `serenyabackend-${environment}-serenyad-${props.dbInstanceId}`,
                },
                statistic: 'Average',
            }),
            threshold: 80,
            evaluationPeriods: 2,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Cost threshold alarm
        new cloudwatch.Alarm(this, 'CostThresholdAlarm', {
            alarmName: `Serenya-${environment}-CostThreshold`,
            alarmDescription: 'Alert when daily costs exceed threshold',
            metric: new cloudwatch.Metric({
                namespace: 'Serenya/Cost',
                metricName: 'DailyCostEstimate',
                dimensionsMap: {
                    Environment: environment,
                },
                statistic: 'Maximum',
            }),
            threshold: environment === 'prod' ? 100 : 50, // $100 prod, $50 dev
            evaluationPeriods: 1,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
    }
}
exports.MonitoringConstruct = MonitoringConstruct;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uaXRvcmluZy1jb25zdHJ1Y3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9pbmZyYXN0cnVjdHVyZS9fdW51c2VkL21vbml0b3JpbmcvbW9uaXRvcmluZy1jb25zdHJ1Y3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVFQUF5RDtBQUN6RCwyREFBNkM7QUFDN0MseURBQTJDO0FBQzNDLCtEQUFpRDtBQUNqRCwyQ0FBNkI7QUFDN0IsMkNBQXVDO0FBQ3ZDLHVDQUF5QjtBQVl6QixNQUFhLG1CQUFvQixTQUFRLHNCQUFTO0lBS2hELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBK0I7UUFDdkUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRXhHLGlDQUFpQztRQUNqQyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMvRCxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsc0JBQXNCLENBQUM7WUFDM0QsY0FBYyxFQUFFO2dCQUNkLG1CQUFtQixFQUFFLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQztvQkFDMUMsVUFBVSxFQUFFO3dCQUNWLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQzs0QkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSzs0QkFDeEIsT0FBTyxFQUFFO2dDQUNQLDBCQUEwQjtnQ0FDMUIscUJBQXFCO2dDQUNyQixzQkFBc0I7Z0NBQ3RCLG1CQUFtQjs2QkFDcEI7NEJBQ0QsU0FBUyxF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QkFBcUI7WUFDbkUsaUJBQWlCLEVBQUUsQ0FBQztZQUNwQixnQkFBZ0IsRUFBRSxVQUFVLENBQUMsZ0JBQWdCLENBQUMsYUFBYTtTQUM1RCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF0T0Qsa0RBc09DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5cbmludGVyZmFjZSBNb25pdG9yaW5nQ29uc3RydWN0UHJvcHMge1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuICByZWdpb246IHN0cmluZztcbiAgYWNjb3VudElkOiBzdHJpbmc7XG4gIGFwaUdhdGV3YXlJZDogc3RyaW5nO1xuICBrbXNLZXlJZDogc3RyaW5nO1xuICBkYkluc3RhbmNlSWQ6IHN0cmluZztcbiAgbGFtYmRhRnVuY3Rpb25zOiBSZWNvcmQ8c3RyaW5nLCBsYW1iZGEuRnVuY3Rpb24+O1xufVxuXG5leHBvcnQgY2xhc3MgTW9uaXRvcmluZ0NvbnN0cnVjdCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBkYXNoYm9hcmRzOiBSZWNvcmQ8c3RyaW5nLCBjbG91ZHdhdGNoLkRhc2hib2FyZD47XG4gIHB1YmxpYyByZWFkb25seSBtZXRyaWNGaWx0ZXJzOiBsb2dzLk1ldHJpY0ZpbHRlcltdO1xuICBwdWJsaWMgcmVhZG9ubHkgY3VzdG9tTWV0cmljc1JvbGU6IGlhbS5Sb2xlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBNb25pdG9yaW5nQ29uc3RydWN0UHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgeyBlbnZpcm9ubWVudCwgcmVnaW9uLCBhY2NvdW50SWQsIGFwaUdhdGV3YXlJZCwga21zS2V5SWQsIGRiSW5zdGFuY2VJZCwgbGFtYmRhRnVuY3Rpb25zIH0gPSBwcm9wcztcblxuICAgIC8vIEN1c3RvbSBtZXRyaWNzIHB1Ymxpc2hpbmcgcm9sZVxuICAgIHRoaXMuY3VzdG9tTWV0cmljc1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0N1c3RvbU1ldHJpY3NSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBDdXN0b21NZXRyaWNzUG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdjbG91ZHdhdGNoOlB1dE1ldHJpY0RhdGEnLFxuICAgICAgICAgICAgICAgICdsb2dzOkNyZWF0ZUxvZ0dyb3VwJyxcbiAgICAgICAgICAgICAgICAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLFxuICAgICAgICAgICAgICAgICdsb2dzOlB1dExvZ0V2ZW50cycsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgY3VzdG9tIG1ldHJpY3MgY29sbGVjdGlvbiBMYW1iZGFcbiAgICBjb25zdCBjdXN0b21NZXRyaWNzRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdDdXN0b21NZXRyaWNzRnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdjdXN0b21NZXRyaWNzLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGFzL21vbml0b3JpbmcnKSksXG4gICAgICByb2xlOiB0aGlzLmN1c3RvbU1ldHJpY3NSb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgRU5WSVJPTk1FTlQ6IGVudmlyb25tZW50LFxuICAgICAgICBSRUdJT046IHJlZ2lvbixcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ3VzdG9tIENsb3VkV2F0Y2ggbWV0cmljcyBjb2xsZWN0aW9uIGZvciBTZXJlbnlhJyxcbiAgICB9KTtcblxuICAgIC8vIE1ldHJpYyBmaWx0ZXJzIGZvciBsb2ctYmFzZWQgbWV0cmljc1xuICAgIHRoaXMubWV0cmljRmlsdGVycyA9IFtdO1xuICAgIFxuICAgIC8vIEJ1c2luZXNzIG1ldHJpY3MgZnJvbSBsb2dzXG4gICAgT2JqZWN0LmVudHJpZXMobGFtYmRhRnVuY3Rpb25zKS5mb3JFYWNoKChbbmFtZSwgZnVuY10pID0+IHtcbiAgICAgIGlmIChmdW5jLmxvZ0dyb3VwKSB7XG4gICAgICAgIC8vIFByb2Nlc3Npbmcgc3VjY2Vzcy9mYWlsdXJlIG1ldHJpY3NcbiAgICAgICAgaWYgKG5hbWUgPT09ICdwcm9jZXNzJykge1xuICAgICAgICAgIGNvbnN0IHN1Y2Nlc3NGaWx0ZXIgPSBuZXcgbG9ncy5NZXRyaWNGaWx0ZXIodGhpcywgYCR7bmFtZX1TdWNjZXNzRmlsdGVyYCwge1xuICAgICAgICAgICAgbG9nR3JvdXA6IGZ1bmMubG9nR3JvdXAsXG4gICAgICAgICAgICBtZXRyaWNOYW1lc3BhY2U6ICdTZXJlbnlhL0J1c2luZXNzJyxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6ICdQcm9jZXNzaW5nU3VjY2VzcycsXG4gICAgICAgICAgICBtZXRyaWNWYWx1ZTogJzEnLFxuICAgICAgICAgICAgZmlsdGVyUGF0dGVybjogbG9ncy5GaWx0ZXJQYXR0ZXJuLnN0cmluZ1ZhbHVlKCckLmxldmVsJywgJz0nLCAnSU5GTycpXG4gICAgICAgICAgICAgIC5hbmQobG9ncy5GaWx0ZXJQYXR0ZXJuLnN0cmluZ1ZhbHVlKCckLmV2ZW50JywgJz0nLCAncHJvY2Vzc2luZ19jb21wbGV0ZScpKSxcbiAgICAgICAgICAgIGRlZmF1bHRWYWx1ZTogMCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBcbiAgICAgICAgICBjb25zdCBmYWlsdXJlRmlsdGVyID0gbmV3IGxvZ3MuTWV0cmljRmlsdGVyKHRoaXMsIGAke25hbWV9RmFpbHVyZUZpbHRlcmAsIHtcbiAgICAgICAgICAgIGxvZ0dyb3VwOiBmdW5jLmxvZ0dyb3VwLFxuICAgICAgICAgICAgbWV0cmljTmFtZXNwYWNlOiAnU2VyZW55YS9CdXNpbmVzcycsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiAnUHJvY2Vzc2luZ0ZhaWx1cmUnLFxuICAgICAgICAgICAgbWV0cmljVmFsdWU6ICcxJyxcbiAgICAgICAgICAgIGZpbHRlclBhdHRlcm46IGxvZ3MuRmlsdGVyUGF0dGVybi5zdHJpbmdWYWx1ZSgnJC5sZXZlbCcsICc9JywgJ0VSUk9SJylcbiAgICAgICAgICAgICAgLmFuZChsb2dzLkZpbHRlclBhdHRlcm4uc3RyaW5nVmFsdWUoJyQuZXZlbnQnLCAnPScsICdwcm9jZXNzaW5nX2ZhaWxlZCcpKSxcbiAgICAgICAgICAgIGRlZmF1bHRWYWx1ZTogMCxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHRoaXMubWV0cmljRmlsdGVycy5wdXNoKHN1Y2Nlc3NGaWx0ZXIsIGZhaWx1cmVGaWx0ZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU2VjdXJpdHkgbWV0cmljc1xuICAgICAgICBjb25zdCBhdXRoQXR0ZW1wdHNGaWx0ZXIgPSBuZXcgbG9ncy5NZXRyaWNGaWx0ZXIodGhpcywgYCR7bmFtZX1BdXRoQXR0ZW1wdHNGaWx0ZXJgLCB7XG4gICAgICAgICAgbG9nR3JvdXA6IGZ1bmMubG9nR3JvdXAsXG4gICAgICAgICAgbWV0cmljTmFtZXNwYWNlOiAnU2VyZW55YS9TZWN1cml0eScsXG4gICAgICAgICAgbWV0cmljTmFtZTogJ0F1dGhlbnRpY2F0aW9uQXR0ZW1wdHMnLFxuICAgICAgICAgIG1ldHJpY1ZhbHVlOiAnMScsXG4gICAgICAgICAgZmlsdGVyUGF0dGVybjogbG9ncy5GaWx0ZXJQYXR0ZXJuLnN0cmluZ1ZhbHVlKCckLmV2ZW50JywgJz0nLCAnYXV0aGVudGljYXRpb25fYXR0ZW1wdCcpLFxuICAgICAgICAgIGRlZmF1bHRWYWx1ZTogMCxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5tZXRyaWNGaWx0ZXJzLnB1c2goYXV0aEF0dGVtcHRzRmlsdGVyKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIExvYWQgYW5kIGNyZWF0ZSBkYXNoYm9hcmRzXG4gICAgdGhpcy5kYXNoYm9hcmRzID0ge307XG4gICAgY29uc3QgZGFzaGJvYXJkQ29uZmlncyA9IFtcbiAgICAgICdidXNpbmVzcy1tZXRyaWNzLWRhc2hib2FyZCcsXG4gICAgICAndGVjaG5pY2FsLXBlcmZvcm1hbmNlLWRhc2hib2FyZCcsIFxuICAgICAgJ3NlY3VyaXR5LW1vbml0b3JpbmctZGFzaGJvYXJkJyxcbiAgICAgICdjb3N0LXRyYWNraW5nLWRhc2hib2FyZCdcbiAgICBdO1xuXG4gICAgZGFzaGJvYXJkQ29uZmlncy5mb3JFYWNoKGNvbmZpZ05hbWUgPT4ge1xuICAgICAgY29uc3QgZGFzaGJvYXJkUGF0aCA9IHBhdGguam9pbihfX2Rpcm5hbWUsIGBkYXNoYm9hcmRzLyR7Y29uZmlnTmFtZX0uanNvbmApO1xuICAgICAgbGV0IGRhc2hib2FyZEJvZHkgPSBmcy5yZWFkRmlsZVN5bmMoZGFzaGJvYXJkUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICBcbiAgICAgIC8vIFJlcGxhY2UgdGVtcGxhdGUgdmFyaWFibGVzXG4gICAgICBkYXNoYm9hcmRCb2R5ID0gZGFzaGJvYXJkQm9keVxuICAgICAgICAucmVwbGFjZSgvXFwke2Vudmlyb25tZW50fS9nLCBlbnZpcm9ubWVudClcbiAgICAgICAgLnJlcGxhY2UoL1xcJHtyZWdpb259L2csIHJlZ2lvbilcbiAgICAgICAgLnJlcGxhY2UoL1xcJHthY2NvdW50SWR9L2csIGFjY291bnRJZClcbiAgICAgICAgLnJlcGxhY2UoL1xcJHtkYkluc3RhbmNlSWR9L2csIGRiSW5zdGFuY2VJZClcbiAgICAgICAgLnJlcGxhY2UoL1xcJHtrbXNLZXlJZH0vZywga21zS2V5SWQpO1xuXG4gICAgICBjb25zdCBkYXNoYm9hcmQgPSBuZXcgY2xvdWR3YXRjaC5EYXNoYm9hcmQodGhpcywgYCR7Y29uZmlnTmFtZS5yZXBsYWNlKC8tL2csICcnKX1EYXNoYm9hcmRgLCB7XG4gICAgICAgIGRhc2hib2FyZE5hbWU6IGBTZXJlbnlhLSR7ZW52aXJvbm1lbnR9LSR7Y29uZmlnTmFtZX1gLFxuICAgICAgICB3aWRnZXRzOiBKU09OLnBhcnNlKGRhc2hib2FyZEJvZHkpLndpZGdldHMubWFwKCh3aWRnZXQ6IGFueSkgPT4ge1xuICAgICAgICAgIGlmICh3aWRnZXQudHlwZSA9PT0gJ21ldHJpYycpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XG4gICAgICAgICAgICAgIHRpdGxlOiB3aWRnZXQucHJvcGVydGllcy50aXRsZSxcbiAgICAgICAgICAgICAgbGVmdDogd2lkZ2V0LnByb3BlcnRpZXMubWV0cmljcz8ubWFwKChtZXRyaWM6IGFueVtdKSA9PiBcbiAgICAgICAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICAgICAgICAgICAgbmFtZXNwYWNlOiBtZXRyaWNbMF0sXG4gICAgICAgICAgICAgICAgICBtZXRyaWNOYW1lOiBtZXRyaWNbMV0sXG4gICAgICAgICAgICAgICAgICBkaW1lbnNpb25zTWFwOiB0aGlzLnBhcnNlRGltZW5zaW9ucyhtZXRyaWMuc2xpY2UoMikpLFxuICAgICAgICAgICAgICAgICAgc3RhdGlzdGljOiBtZXRyaWNbbWV0cmljLmxlbmd0aCAtIDFdPy5zdGF0IHx8ICdBdmVyYWdlJyxcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICApIHx8IFtdLFxuICAgICAgICAgICAgICB3aWR0aDogd2lkZ2V0LndpZHRoLFxuICAgICAgICAgICAgICBoZWlnaHQ6IHdpZGdldC5oZWlnaHQsXG4gICAgICAgICAgICAgIHZpZXc6IHdpZGdldC5wcm9wZXJ0aWVzLnZpZXcgPT09ICdzaW5nbGVWYWx1ZScgPyBcbiAgICAgICAgICAgICAgICBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0Vmlldy5TSU5HTEVfVkFMVUUgOiBcbiAgICAgICAgICAgICAgICBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0Vmlldy5USU1FX1NFUklFUyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gZWxzZSBpZiAod2lkZ2V0LnR5cGUgPT09ICdsb2cnKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IGNsb3Vkd2F0Y2guTG9nUXVlcnlXaWRnZXQoe1xuICAgICAgICAgICAgICB0aXRsZTogd2lkZ2V0LnByb3BlcnRpZXMudGl0bGUsXG4gICAgICAgICAgICAgIGxvZ0dyb3VwczogW2xvZ3MuTG9nR3JvdXAuZnJvbUxvZ0dyb3VwTmFtZSh0aGlzLCBgTG9nR3JvdXAke2NvbmZpZ05hbWV9JHt3aWRnZXQueH0ke3dpZGdldC55fWAsICcvYXdzL2xhbWJkYS9kdW1teScpXSxcbiAgICAgICAgICAgICAgcXVlcnlTdHJpbmc6IHdpZGdldC5wcm9wZXJ0aWVzLnF1ZXJ5LFxuICAgICAgICAgICAgICB3aWR0aDogd2lkZ2V0LndpZHRoLFxuICAgICAgICAgICAgICBoZWlnaHQ6IHdpZGdldC5oZWlnaHQsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gRGVmYXVsdCB0byB0ZXh0IHdpZGdldCBmb3IgdW5zdXBwb3J0ZWQgdHlwZXNcbiAgICAgICAgICByZXR1cm4gbmV3IGNsb3Vkd2F0Y2guVGV4dFdpZGdldCh7XG4gICAgICAgICAgICBtYXJrZG93bjogYCMgJHt3aWRnZXQucHJvcGVydGllcy50aXRsZX1cXG5XaWRnZXQgdHlwZSAke3dpZGdldC50eXBlfSBub3QgeWV0IGltcGxlbWVudGVkYCxcbiAgICAgICAgICAgIHdpZHRoOiB3aWRnZXQud2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQ6IHdpZGdldC5oZWlnaHQsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIHRoaXMuZGFzaGJvYXJkc1tjb25maWdOYW1lXSA9IGRhc2hib2FyZDtcbiAgICB9KTtcblxuICAgIC8vIENsb3VkV2F0Y2ggQWxhcm1zXG4gICAgdGhpcy5jcmVhdGVBbGFybXMocHJvcHMpO1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJzZURpbWVuc2lvbnMobWV0cmljQXJyYXk6IGFueVtdKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB7XG4gICAgY29uc3QgZGltZW5zaW9uczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWV0cmljQXJyYXkubGVuZ3RoOyBpICs9IDIpIHtcbiAgICAgIGlmICh0eXBlb2YgbWV0cmljQXJyYXlbaV0gPT09ICdzdHJpbmcnICYmIHR5cGVvZiBtZXRyaWNBcnJheVtpICsgMV0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGRpbWVuc2lvbnNbbWV0cmljQXJyYXlbaV1dID0gbWV0cmljQXJyYXlbaSArIDFdO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZGltZW5zaW9ucztcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlQWxhcm1zKHByb3BzOiBNb25pdG9yaW5nQ29uc3RydWN0UHJvcHMpIHtcbiAgICBjb25zdCB7IGVudmlyb25tZW50LCBsYW1iZGFGdW5jdGlvbnMgfSA9IHByb3BzO1xuXG4gICAgLy8gSGlnaCBlcnJvciByYXRlIGFsYXJtXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ0hpZ2hFcnJvclJhdGVBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogYFNlcmVueWEtJHtlbnZpcm9ubWVudH0tSGlnaEVycm9yUmF0ZWAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnQgd2hlbiBMYW1iZGEgZXJyb3IgcmF0ZSBleGNlZWRzIDUlJyxcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWF0aEV4cHJlc3Npb24oe1xuICAgICAgICBleHByZXNzaW9uOiAnZXJyb3JzL2ludm9jYXRpb25zKjEwMCcsXG4gICAgICAgIHVzaW5nTWV0cmljczoge1xuICAgICAgICAgIGVycm9yczogbGFtYmRhRnVuY3Rpb25zLnByb2Nlc3MubWV0cmljRXJyb3JzKHsgc3RhdGlzdGljOiAnU3VtJyB9KSxcbiAgICAgICAgICBpbnZvY2F0aW9uczogbGFtYmRhRnVuY3Rpb25zLnByb2Nlc3MubWV0cmljSW52b2NhdGlvbnMoeyBzdGF0aXN0aWM6ICdTdW0nIH0pLFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDUsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgLy8gSGlnaCBsYXRlbmN5IGFsYXJtXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ0hpZ2hMYXRlbmN5QWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6IGBTZXJlbnlhLSR7ZW52aXJvbm1lbnR9LUhpZ2hMYXRlbmN5YCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdBbGVydCB3aGVuIHByb2Nlc3NpbmcgbGF0ZW5jeSBleGNlZWRzIDMgbWludXRlcycsXG4gICAgICBtZXRyaWM6IGxhbWJkYUZ1bmN0aW9ucy5wcm9jZXNzLm1ldHJpY0R1cmF0aW9uKHsgc3RhdGlzdGljOiAnQXZlcmFnZScgfSksXG4gICAgICB0aHJlc2hvbGQ6IDE4MDAwMCwgLy8gMyBtaW51dGVzIGluIG1pbGxpc2Vjb25kc1xuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDMsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIC8vIERhdGFiYXNlIENQVSBhbGFybVxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdEYXRhYmFzZUhpZ2hDUFVBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogYFNlcmVueWEtJHtlbnZpcm9ubWVudH0tRGF0YWJhc2VIaWdoQ1BVYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdBbGVydCB3aGVuIGRhdGFiYXNlIENQVSBleGNlZWRzIDgwJScsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9SRFMnLFxuICAgICAgICBtZXRyaWNOYW1lOiAnQ1BVVXRpbGl6YXRpb24nLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgREJJbnN0YW5jZUlkZW50aWZpZXI6IGBzZXJlbnlhYmFja2VuZC0ke2Vudmlyb25tZW50fS1zZXJlbnlhZC0ke3Byb3BzLmRiSW5zdGFuY2VJZH1gLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA4MCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICAvLyBDb3N0IHRocmVzaG9sZCBhbGFybVxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdDb3N0VGhyZXNob2xkQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6IGBTZXJlbnlhLSR7ZW52aXJvbm1lbnR9LUNvc3RUaHJlc2hvbGRgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0IHdoZW4gZGFpbHkgY29zdHMgZXhjZWVkIHRocmVzaG9sZCcsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ1NlcmVueWEvQ29zdCcsXG4gICAgICAgIG1ldHJpY05hbWU6ICdEYWlseUNvc3RFc3RpbWF0ZScsXG4gICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICBFbnZpcm9ubWVudDogZW52aXJvbm1lbnQsXG4gICAgICAgIH0sXG4gICAgICAgIHN0YXRpc3RpYzogJ01heGltdW0nLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyAxMDAgOiA1MCwgLy8gJDEwMCBwcm9kLCAkNTAgZGV2XG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuICB9XG59Il19