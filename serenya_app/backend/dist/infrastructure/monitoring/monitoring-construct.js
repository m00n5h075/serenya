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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uaXRvcmluZy1jb25zdHJ1Y3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9pbmZyYXN0cnVjdHVyZS9tb25pdG9yaW5nL21vbml0b3JpbmctY29uc3RydWN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyx1RUFBeUQ7QUFDekQsMkRBQTZDO0FBQzdDLHlEQUEyQztBQUMzQywrREFBaUQ7QUFDakQsMkNBQTZCO0FBQzdCLDJDQUF1QztBQUN2Qyx1Q0FBeUI7QUFZekIsTUFBYSxtQkFBb0IsU0FBUSxzQkFBUztJQUtoRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQStCO1FBQ3ZFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUV4RyxpQ0FBaUM7UUFDakMsSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDL0QsU0FBUyxFQUFFLElBQUksR0FBRyxDQUFDLGdCQUFnQixDQUFDLHNCQUFzQixDQUFDO1lBQzNELGNBQWMsRUFBRTtnQkFDZCxtQkFBbUIsRUFBRSxJQUFJLEdBQUcsQ0FBQyxjQUFjLENBQUM7b0JBQzFDLFVBQVUsRUFBRTt3QkFDVixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7NEJBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7NEJBQ3hCLE9BQU8sRUFBRTtnQ0FDUCwwQkFBMEI7Z0NBQzFCLHFCQUFxQjtnQ0FDckIsc0JBQXNCO2dDQUN0QixtQkFBbUI7NkJBQ3BCOzRCQUNELFNBQVMsRUFBRSxDQUFDLEdBQUcsQ0FBQzt5QkFDakIsQ0FBQztxQkFDSDtpQkFDRixDQUFDO2FBQ0g7U0FDRixDQUFDLENBQUM7UUFFSCwwQ0FBMEM7UUFDMUMsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQy9FLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsT0FBTyxFQUFFLHVCQUF1QjtZQUNoQyxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsdUJBQXVCLENBQUMsQ0FBQztZQUMxRSxJQUFJLEVBQUUsSUFBSSxDQUFDLGlCQUFpQjtZQUM1QixXQUFXLEVBQUU7Z0JBQ1gsV0FBVyxFQUFFLFdBQVc7Z0JBQ3hCLE1BQU0sRUFBRSxNQUFNO2FBQ2Y7WUFDRCxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ2hDLFVBQVUsRUFBRSxHQUFHO1lBQ2YsV0FBVyxFQUFFLGtEQUFrRDtTQUNoRSxDQUFDLENBQUM7UUFFSCx1Q0FBdUM7UUFDdkMsSUFBSSxDQUFDLGFBQWEsR0FBRyxFQUFFLENBQUM7UUFFeEIsNkJBQTZCO1FBQzdCLE1BQU0sQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtZQUN2RCxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDbEIscUNBQXFDO2dCQUNyQyxJQUFJLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztvQkFDdkIsTUFBTSxhQUFhLEdBQUcsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxHQUFHLElBQUksZUFBZSxFQUFFO3dCQUN4RSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7d0JBQ3ZCLGVBQWUsRUFBRSxrQkFBa0I7d0JBQ25DLFVBQVUsRUFBRSxtQkFBbUI7d0JBQy9CLFdBQVcsRUFBRSxHQUFHO3dCQUNoQixhQUFhLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRSxNQUFNLENBQUM7NkJBQ2xFLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsR0FBRyxFQUFFLHFCQUFxQixDQUFDLENBQUM7d0JBQzdFLFlBQVksRUFBRSxDQUFDO3FCQUNoQixDQUFDLENBQUM7b0JBRUgsTUFBTSxhQUFhLEdBQUcsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxHQUFHLElBQUksZUFBZSxFQUFFO3dCQUN4RSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7d0JBQ3ZCLGVBQWUsRUFBRSxrQkFBa0I7d0JBQ25DLFVBQVUsRUFBRSxtQkFBbUI7d0JBQy9CLFdBQVcsRUFBRSxHQUFHO3dCQUNoQixhQUFhLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRSxPQUFPLENBQUM7NkJBQ25FLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsR0FBRyxFQUFFLG1CQUFtQixDQUFDLENBQUM7d0JBQzNFLFlBQVksRUFBRSxDQUFDO3FCQUNoQixDQUFDLENBQUM7b0JBRUgsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLGFBQWEsQ0FBQyxDQUFDO2dCQUN4RCxDQUFDO2dCQUVELG1CQUFtQjtnQkFDbkIsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLEdBQUcsSUFBSSxvQkFBb0IsRUFBRTtvQkFDbEYsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO29CQUN2QixlQUFlLEVBQUUsa0JBQWtCO29CQUNuQyxVQUFVLEVBQUUsd0JBQXdCO29CQUNwQyxXQUFXLEVBQUUsR0FBRztvQkFDaEIsYUFBYSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUUsd0JBQXdCLENBQUM7b0JBQ3ZGLFlBQVksRUFBRSxDQUFDO2lCQUNoQixDQUFDLENBQUM7Z0JBRUgsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUM5QyxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFFSCw2QkFBNkI7UUFDN0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7UUFDckIsTUFBTSxnQkFBZ0IsR0FBRztZQUN2Qiw0QkFBNEI7WUFDNUIsaUNBQWlDO1lBQ2pDLCtCQUErQjtZQUMvQix5QkFBeUI7U0FDMUIsQ0FBQztRQUVGLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsRUFBRTtZQUNwQyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxjQUFjLFVBQVUsT0FBTyxDQUFDLENBQUM7WUFDNUUsSUFBSSxhQUFhLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxhQUFhLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFFNUQsNkJBQTZCO1lBQzdCLGFBQWEsR0FBRyxhQUFhO2lCQUMxQixPQUFPLENBQUMsa0JBQWtCLEVBQUUsV0FBVyxDQUFDO2lCQUN4QyxPQUFPLENBQUMsYUFBYSxFQUFFLE1BQU0sQ0FBQztpQkFDOUIsT0FBTyxDQUFDLGdCQUFnQixFQUFFLFNBQVMsQ0FBQztpQkFDcEMsT0FBTyxDQUFDLG1CQUFtQixFQUFFLFlBQVksQ0FBQztpQkFDMUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUV0QyxNQUFNLFNBQVMsR0FBRyxJQUFJLFVBQVUsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLEdBQUcsVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLFdBQVcsRUFBRTtnQkFDM0YsYUFBYSxFQUFFLFdBQVcsV0FBVyxJQUFJLFVBQVUsRUFBRTtnQkFDckQsT0FBTyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQVcsRUFBRSxFQUFFO29CQUM3RCxJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7d0JBQzdCLE9BQU8sSUFBSSxVQUFVLENBQUMsV0FBVyxDQUFDOzRCQUNoQyxLQUFLLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxLQUFLOzRCQUM5QixJQUFJLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUMsTUFBYSxFQUFFLEVBQUUsQ0FDckQsSUFBSSxVQUFVLENBQUMsTUFBTSxDQUFDO2dDQUNwQixTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztnQ0FDcEIsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0NBQ3JCLGFBQWEsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0NBQ3BELFNBQVMsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLElBQUksU0FBUzs2QkFDeEQsQ0FBQyxDQUNILElBQUksRUFBRTs0QkFDUCxLQUFLLEVBQUUsTUFBTSxDQUFDLEtBQUs7NEJBQ25CLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTTs0QkFDckIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxLQUFLLGFBQWEsQ0FBQyxDQUFDO2dDQUM5QyxVQUFVLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxDQUFDO2dDQUN6QyxVQUFVLENBQUMsZUFBZSxDQUFDLFdBQVc7eUJBQ3pDLENBQUMsQ0FBQztvQkFDTCxDQUFDO3lCQUFNLElBQUksTUFBTSxDQUFDLElBQUksS0FBSyxLQUFLLEVBQUUsQ0FBQzt3QkFDakMsT0FBTyxJQUFJLFVBQVUsQ0FBQyxjQUFjLENBQUM7NEJBQ25DLEtBQUssRUFBRSxNQUFNLENBQUMsVUFBVSxDQUFDLEtBQUs7NEJBQzlCLFNBQVMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLFdBQVcsVUFBVSxHQUFHLE1BQU0sQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsRUFBRSxFQUFFLG1CQUFtQixDQUFDLENBQUM7NEJBQ3JILFdBQVcsRUFBRSxNQUFNLENBQUMsVUFBVSxDQUFDLEtBQUs7NEJBQ3BDLEtBQUssRUFBRSxNQUFNLENBQUMsS0FBSzs0QkFDbkIsTUFBTSxFQUFFLE1BQU0sQ0FBQyxNQUFNO3lCQUN0QixDQUFDLENBQUM7b0JBQ0wsQ0FBQztvQkFDRCwrQ0FBK0M7b0JBQy9DLE9BQU8sSUFBSSxVQUFVLENBQUMsVUFBVSxDQUFDO3dCQUMvQixRQUFRLEVBQUUsS0FBSyxNQUFNLENBQUMsVUFBVSxDQUFDLEtBQUssaUJBQWlCLE1BQU0sQ0FBQyxJQUFJLHNCQUFzQjt3QkFDeEYsS0FBSyxFQUFFLE1BQU0sQ0FBQyxLQUFLO3dCQUNuQixNQUFNLEVBQUUsTUFBTSxDQUFDLE1BQU07cUJBQ3RCLENBQUMsQ0FBQztnQkFDTCxDQUFDLENBQUM7YUFDSCxDQUFDLENBQUM7WUFFSCxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxHQUFHLFNBQVMsQ0FBQztRQUMxQyxDQUFDLENBQUMsQ0FBQztRQUVILG9CQUFvQjtRQUNwQixJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFFTyxlQUFlLENBQUMsV0FBa0I7UUFDeEMsTUFBTSxVQUFVLEdBQTJCLEVBQUUsQ0FBQztRQUM5QyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDL0MsSUFBSSxPQUFPLFdBQVcsQ0FBQyxDQUFDLENBQUMsS0FBSyxRQUFRLElBQUksT0FBTyxXQUFXLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUNqRixVQUFVLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsV0FBVyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNsRCxDQUFDO1FBQ0gsQ0FBQztRQUNELE9BQU8sVUFBVSxDQUFDO0lBQ3BCLENBQUM7SUFFTyxZQUFZLENBQUMsS0FBK0I7UUFDbEQsTUFBTSxFQUFFLFdBQVcsRUFBRSxlQUFlLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFL0Msd0JBQXdCO1FBQ3hCLElBQUksVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDL0MsU0FBUyxFQUFFLFdBQVcsV0FBVyxnQkFBZ0I7WUFDakQsZ0JBQWdCLEVBQUUseUNBQXlDO1lBQzNELE1BQU0sRUFBRSxJQUFJLFVBQVUsQ0FBQyxjQUFjLENBQUM7Z0JBQ3BDLFVBQVUsRUFBRSx3QkFBd0I7Z0JBQ3BDLFlBQVksRUFBRTtvQkFDWixNQUFNLEVBQUUsZUFBZSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUM7b0JBQ2xFLFdBQVcsRUFBRSxlQUFlLENBQUMsT0FBTyxDQUFDLGlCQUFpQixDQUFDLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxDQUFDO2lCQUM3RTthQUNGLENBQUM7WUFDRixTQUFTLEVBQUUsQ0FBQztZQUNaLGlCQUFpQixFQUFFLENBQUM7WUFDcEIsZ0JBQWdCLEVBQUUsVUFBVSxDQUFDLGdCQUFnQixDQUFDLGFBQWE7U0FDNUQsQ0FBQyxDQUFDO1FBRUgscUJBQXFCO1FBQ3JCLElBQUksVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDN0MsU0FBUyxFQUFFLFdBQVcsV0FBVyxjQUFjO1lBQy9DLGdCQUFnQixFQUFFLGlEQUFpRDtZQUNuRSxNQUFNLEVBQUUsZUFBZSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLENBQUM7WUFDeEUsU0FBUyxFQUFFLE1BQU0sRUFBRSw0QkFBNEI7WUFDL0MsaUJBQWlCLEVBQUUsQ0FBQztZQUNwQixnQkFBZ0IsRUFBRSxVQUFVLENBQUMsZ0JBQWdCLENBQUMsYUFBYTtTQUM1RCxDQUFDLENBQUM7UUFFSCxxQkFBcUI7UUFDckIsSUFBSSxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUNqRCxTQUFTLEVBQUUsV0FBVyxXQUFXLGtCQUFrQjtZQUNuRCxnQkFBZ0IsRUFBRSxxQ0FBcUM7WUFDdkQsTUFBTSxFQUFFLElBQUksVUFBVSxDQUFDLE1BQU0sQ0FBQztnQkFDNUIsU0FBUyxFQUFFLFNBQVM7Z0JBQ3BCLFVBQVUsRUFBRSxnQkFBZ0I7Z0JBQzVCLGFBQWEsRUFBRTtvQkFDYixvQkFBb0IsRUFBRSxrQkFBa0IsV0FBVyxhQUFhLEtBQUssQ0FBQyxZQUFZLEVBQUU7aUJBQ3JGO2dCQUNELFNBQVMsRUFBRSxTQUFTO2FBQ3JCLENBQUM7WUFDRixTQUFTLEVBQUUsRUFBRTtZQUNiLGlCQUFpQixFQUFFLENBQUM7WUFDcEIsZ0JBQWdCLEVBQUUsVUFBVSxDQUFDLGdCQUFnQixDQUFDLGFBQWE7U0FDNUQsQ0FBQyxDQUFDO1FBRUgsdUJBQXVCO1FBQ3ZCLElBQUksVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDL0MsU0FBUyxFQUFFLFdBQVcsV0FBVyxnQkFBZ0I7WUFDakQsZ0JBQWdCLEVBQUUseUNBQXlDO1lBQzNELE1BQU0sRUFBRSxJQUFJLFVBQVUsQ0FBQyxNQUFNLENBQUM7Z0JBQzVCLFNBQVMsRUFBRSxjQUFjO2dCQUN6QixVQUFVLEVBQUUsbUJBQW1CO2dCQUMvQixhQUFhLEVBQUU7b0JBQ2IsV0FBVyxFQUFFLFdBQVc7aUJBQ3pCO2dCQUNELFNBQVMsRUFBRSxTQUFTO2FBQ3JCLENBQUM7WUFDRixTQUFTLEVBQUUsV0FBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUscUJBQXFCO1lBQ25FLGlCQUFpQixFQUFFLENBQUM7WUFDcEIsZ0JBQWdCLEVBQUUsVUFBVSxDQUFDLGdCQUFnQixDQUFDLGFBQWE7U0FDNUQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBdE9ELGtEQXNPQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuXG5pbnRlcmZhY2UgTW9uaXRvcmluZ0NvbnN0cnVjdFByb3BzIHtcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcbiAgcmVnaW9uOiBzdHJpbmc7XG4gIGFjY291bnRJZDogc3RyaW5nO1xuICBhcGlHYXRld2F5SWQ6IHN0cmluZztcbiAga21zS2V5SWQ6IHN0cmluZztcbiAgZGJJbnN0YW5jZUlkOiBzdHJpbmc7XG4gIGxhbWJkYUZ1bmN0aW9uczogUmVjb3JkPHN0cmluZywgbGFtYmRhLkZ1bmN0aW9uPjtcbn1cblxuZXhwb3J0IGNsYXNzIE1vbml0b3JpbmdDb25zdHJ1Y3QgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgZGFzaGJvYXJkczogUmVjb3JkPHN0cmluZywgY2xvdWR3YXRjaC5EYXNoYm9hcmQ+O1xuICBwdWJsaWMgcmVhZG9ubHkgbWV0cmljRmlsdGVyczogbG9ncy5NZXRyaWNGaWx0ZXJbXTtcbiAgcHVibGljIHJlYWRvbmx5IGN1c3RvbU1ldHJpY3NSb2xlOiBpYW0uUm9sZTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogTW9uaXRvcmluZ0NvbnN0cnVjdFByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQsIHJlZ2lvbiwgYWNjb3VudElkLCBhcGlHYXRld2F5SWQsIGttc0tleUlkLCBkYkluc3RhbmNlSWQsIGxhbWJkYUZ1bmN0aW9ucyB9ID0gcHJvcHM7XG5cbiAgICAvLyBDdXN0b20gbWV0cmljcyBwdWJsaXNoaW5nIHJvbGVcbiAgICB0aGlzLmN1c3RvbU1ldHJpY3NSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdDdXN0b21NZXRyaWNzUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgQ3VzdG9tTWV0cmljc1BvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnY2xvdWR3YXRjaDpQdXRNZXRyaWNEYXRhJyxcbiAgICAgICAgICAgICAgICAnbG9nczpDcmVhdGVMb2dHcm91cCcsXG4gICAgICAgICAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJyxcbiAgICAgICAgICAgICAgICAnbG9nczpQdXRMb2dFdmVudHMnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGN1c3RvbSBtZXRyaWNzIGNvbGxlY3Rpb24gTGFtYmRhXG4gICAgY29uc3QgY3VzdG9tTWV0cmljc0Z1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQ3VzdG9tTWV0cmljc0Z1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnY3VzdG9tTWV0cmljcy5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhcy9tb25pdG9yaW5nJykpLFxuICAgICAgcm9sZTogdGhpcy5jdXN0b21NZXRyaWNzUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEVOVklST05NRU5UOiBlbnZpcm9ubWVudCxcbiAgICAgICAgUkVHSU9OOiByZWdpb24sXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBkZXNjcmlwdGlvbjogJ0N1c3RvbSBDbG91ZFdhdGNoIG1ldHJpY3MgY29sbGVjdGlvbiBmb3IgU2VyZW55YScsXG4gICAgfSk7XG5cbiAgICAvLyBNZXRyaWMgZmlsdGVycyBmb3IgbG9nLWJhc2VkIG1ldHJpY3NcbiAgICB0aGlzLm1ldHJpY0ZpbHRlcnMgPSBbXTtcbiAgICBcbiAgICAvLyBCdXNpbmVzcyBtZXRyaWNzIGZyb20gbG9nc1xuICAgIE9iamVjdC5lbnRyaWVzKGxhbWJkYUZ1bmN0aW9ucykuZm9yRWFjaCgoW25hbWUsIGZ1bmNdKSA9PiB7XG4gICAgICBpZiAoZnVuYy5sb2dHcm91cCkge1xuICAgICAgICAvLyBQcm9jZXNzaW5nIHN1Y2Nlc3MvZmFpbHVyZSBtZXRyaWNzXG4gICAgICAgIGlmIChuYW1lID09PSAncHJvY2VzcycpIHtcbiAgICAgICAgICBjb25zdCBzdWNjZXNzRmlsdGVyID0gbmV3IGxvZ3MuTWV0cmljRmlsdGVyKHRoaXMsIGAke25hbWV9U3VjY2Vzc0ZpbHRlcmAsIHtcbiAgICAgICAgICAgIGxvZ0dyb3VwOiBmdW5jLmxvZ0dyb3VwLFxuICAgICAgICAgICAgbWV0cmljTmFtZXNwYWNlOiAnU2VyZW55YS9CdXNpbmVzcycsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiAnUHJvY2Vzc2luZ1N1Y2Nlc3MnLFxuICAgICAgICAgICAgbWV0cmljVmFsdWU6ICcxJyxcbiAgICAgICAgICAgIGZpbHRlclBhdHRlcm46IGxvZ3MuRmlsdGVyUGF0dGVybi5zdHJpbmdWYWx1ZSgnJC5sZXZlbCcsICc9JywgJ0lORk8nKVxuICAgICAgICAgICAgICAuYW5kKGxvZ3MuRmlsdGVyUGF0dGVybi5zdHJpbmdWYWx1ZSgnJC5ldmVudCcsICc9JywgJ3Byb2Nlc3NpbmdfY29tcGxldGUnKSksXG4gICAgICAgICAgICBkZWZhdWx0VmFsdWU6IDAsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgXG4gICAgICAgICAgY29uc3QgZmFpbHVyZUZpbHRlciA9IG5ldyBsb2dzLk1ldHJpY0ZpbHRlcih0aGlzLCBgJHtuYW1lfUZhaWx1cmVGaWx0ZXJgLCB7XG4gICAgICAgICAgICBsb2dHcm91cDogZnVuYy5sb2dHcm91cCxcbiAgICAgICAgICAgIG1ldHJpY05hbWVzcGFjZTogJ1NlcmVueWEvQnVzaW5lc3MnLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ1Byb2Nlc3NpbmdGYWlsdXJlJyxcbiAgICAgICAgICAgIG1ldHJpY1ZhbHVlOiAnMScsXG4gICAgICAgICAgICBmaWx0ZXJQYXR0ZXJuOiBsb2dzLkZpbHRlclBhdHRlcm4uc3RyaW5nVmFsdWUoJyQubGV2ZWwnLCAnPScsICdFUlJPUicpXG4gICAgICAgICAgICAgIC5hbmQobG9ncy5GaWx0ZXJQYXR0ZXJuLnN0cmluZ1ZhbHVlKCckLmV2ZW50JywgJz0nLCAncHJvY2Vzc2luZ19mYWlsZWQnKSksXG4gICAgICAgICAgICBkZWZhdWx0VmFsdWU6IDAsXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICB0aGlzLm1ldHJpY0ZpbHRlcnMucHVzaChzdWNjZXNzRmlsdGVyLCBmYWlsdXJlRmlsdGVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNlY3VyaXR5IG1ldHJpY3NcbiAgICAgICAgY29uc3QgYXV0aEF0dGVtcHRzRmlsdGVyID0gbmV3IGxvZ3MuTWV0cmljRmlsdGVyKHRoaXMsIGAke25hbWV9QXV0aEF0dGVtcHRzRmlsdGVyYCwge1xuICAgICAgICAgIGxvZ0dyb3VwOiBmdW5jLmxvZ0dyb3VwLFxuICAgICAgICAgIG1ldHJpY05hbWVzcGFjZTogJ1NlcmVueWEvU2VjdXJpdHknLFxuICAgICAgICAgIG1ldHJpY05hbWU6ICdBdXRoZW50aWNhdGlvbkF0dGVtcHRzJyxcbiAgICAgICAgICBtZXRyaWNWYWx1ZTogJzEnLFxuICAgICAgICAgIGZpbHRlclBhdHRlcm46IGxvZ3MuRmlsdGVyUGF0dGVybi5zdHJpbmdWYWx1ZSgnJC5ldmVudCcsICc9JywgJ2F1dGhlbnRpY2F0aW9uX2F0dGVtcHQnKSxcbiAgICAgICAgICBkZWZhdWx0VmFsdWU6IDAsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMubWV0cmljRmlsdGVycy5wdXNoKGF1dGhBdHRlbXB0c0ZpbHRlcik7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBMb2FkIGFuZCBjcmVhdGUgZGFzaGJvYXJkc1xuICAgIHRoaXMuZGFzaGJvYXJkcyA9IHt9O1xuICAgIGNvbnN0IGRhc2hib2FyZENvbmZpZ3MgPSBbXG4gICAgICAnYnVzaW5lc3MtbWV0cmljcy1kYXNoYm9hcmQnLFxuICAgICAgJ3RlY2huaWNhbC1wZXJmb3JtYW5jZS1kYXNoYm9hcmQnLCBcbiAgICAgICdzZWN1cml0eS1tb25pdG9yaW5nLWRhc2hib2FyZCcsXG4gICAgICAnY29zdC10cmFja2luZy1kYXNoYm9hcmQnXG4gICAgXTtcblxuICAgIGRhc2hib2FyZENvbmZpZ3MuZm9yRWFjaChjb25maWdOYW1lID0+IHtcbiAgICAgIGNvbnN0IGRhc2hib2FyZFBhdGggPSBwYXRoLmpvaW4oX19kaXJuYW1lLCBgZGFzaGJvYXJkcy8ke2NvbmZpZ05hbWV9Lmpzb25gKTtcbiAgICAgIGxldCBkYXNoYm9hcmRCb2R5ID0gZnMucmVhZEZpbGVTeW5jKGRhc2hib2FyZFBhdGgsICd1dGYtOCcpO1xuICAgICAgXG4gICAgICAvLyBSZXBsYWNlIHRlbXBsYXRlIHZhcmlhYmxlc1xuICAgICAgZGFzaGJvYXJkQm9keSA9IGRhc2hib2FyZEJvZHlcbiAgICAgICAgLnJlcGxhY2UoL1xcJHtlbnZpcm9ubWVudH0vZywgZW52aXJvbm1lbnQpXG4gICAgICAgIC5yZXBsYWNlKC9cXCR7cmVnaW9ufS9nLCByZWdpb24pXG4gICAgICAgIC5yZXBsYWNlKC9cXCR7YWNjb3VudElkfS9nLCBhY2NvdW50SWQpXG4gICAgICAgIC5yZXBsYWNlKC9cXCR7ZGJJbnN0YW5jZUlkfS9nLCBkYkluc3RhbmNlSWQpXG4gICAgICAgIC5yZXBsYWNlKC9cXCR7a21zS2V5SWR9L2csIGttc0tleUlkKTtcblxuICAgICAgY29uc3QgZGFzaGJvYXJkID0gbmV3IGNsb3Vkd2F0Y2guRGFzaGJvYXJkKHRoaXMsIGAke2NvbmZpZ05hbWUucmVwbGFjZSgvLS9nLCAnJyl9RGFzaGJvYXJkYCwge1xuICAgICAgICBkYXNoYm9hcmROYW1lOiBgU2VyZW55YS0ke2Vudmlyb25tZW50fS0ke2NvbmZpZ05hbWV9YCxcbiAgICAgICAgd2lkZ2V0czogSlNPTi5wYXJzZShkYXNoYm9hcmRCb2R5KS53aWRnZXRzLm1hcCgod2lkZ2V0OiBhbnkpID0+IHtcbiAgICAgICAgICBpZiAod2lkZ2V0LnR5cGUgPT09ICdtZXRyaWMnKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xuICAgICAgICAgICAgICB0aXRsZTogd2lkZ2V0LnByb3BlcnRpZXMudGl0bGUsXG4gICAgICAgICAgICAgIGxlZnQ6IHdpZGdldC5wcm9wZXJ0aWVzLm1ldHJpY3M/Lm1hcCgobWV0cmljOiBhbnlbXSkgPT4gXG4gICAgICAgICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICAgICAgICAgIG5hbWVzcGFjZTogbWV0cmljWzBdLFxuICAgICAgICAgICAgICAgICAgbWV0cmljTmFtZTogbWV0cmljWzFdLFxuICAgICAgICAgICAgICAgICAgZGltZW5zaW9uc01hcDogdGhpcy5wYXJzZURpbWVuc2lvbnMobWV0cmljLnNsaWNlKDIpKSxcbiAgICAgICAgICAgICAgICAgIHN0YXRpc3RpYzogbWV0cmljW21ldHJpYy5sZW5ndGggLSAxXT8uc3RhdCB8fCAnQXZlcmFnZScsXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgKSB8fCBbXSxcbiAgICAgICAgICAgICAgd2lkdGg6IHdpZGdldC53aWR0aCxcbiAgICAgICAgICAgICAgaGVpZ2h0OiB3aWRnZXQuaGVpZ2h0LFxuICAgICAgICAgICAgICB2aWV3OiB3aWRnZXQucHJvcGVydGllcy52aWV3ID09PSAnc2luZ2xlVmFsdWUnID8gXG4gICAgICAgICAgICAgICAgY2xvdWR3YXRjaC5HcmFwaFdpZGdldFZpZXcuU0lOR0xFX1ZBTFVFIDogXG4gICAgICAgICAgICAgICAgY2xvdWR3YXRjaC5HcmFwaFdpZGdldFZpZXcuVElNRV9TRVJJRVMsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHdpZGdldC50eXBlID09PSAnbG9nJykge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBjbG91ZHdhdGNoLkxvZ1F1ZXJ5V2lkZ2V0KHtcbiAgICAgICAgICAgICAgdGl0bGU6IHdpZGdldC5wcm9wZXJ0aWVzLnRpdGxlLFxuICAgICAgICAgICAgICBsb2dHcm91cHM6IFtsb2dzLkxvZ0dyb3VwLmZyb21Mb2dHcm91cE5hbWUodGhpcywgYExvZ0dyb3VwJHtjb25maWdOYW1lfSR7d2lkZ2V0Lnh9JHt3aWRnZXQueX1gLCAnL2F3cy9sYW1iZGEvZHVtbXknKV0sXG4gICAgICAgICAgICAgIHF1ZXJ5U3RyaW5nOiB3aWRnZXQucHJvcGVydGllcy5xdWVyeSxcbiAgICAgICAgICAgICAgd2lkdGg6IHdpZGdldC53aWR0aCxcbiAgICAgICAgICAgICAgaGVpZ2h0OiB3aWRnZXQuaGVpZ2h0LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIERlZmF1bHQgdG8gdGV4dCB3aWRnZXQgZm9yIHVuc3VwcG9ydGVkIHR5cGVzXG4gICAgICAgICAgcmV0dXJuIG5ldyBjbG91ZHdhdGNoLlRleHRXaWRnZXQoe1xuICAgICAgICAgICAgbWFya2Rvd246IGAjICR7d2lkZ2V0LnByb3BlcnRpZXMudGl0bGV9XFxuV2lkZ2V0IHR5cGUgJHt3aWRnZXQudHlwZX0gbm90IHlldCBpbXBsZW1lbnRlZGAsXG4gICAgICAgICAgICB3aWR0aDogd2lkZ2V0LndpZHRoLFxuICAgICAgICAgICAgaGVpZ2h0OiB3aWRnZXQuaGVpZ2h0LFxuICAgICAgICAgIH0pO1xuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLmRhc2hib2FyZHNbY29uZmlnTmFtZV0gPSBkYXNoYm9hcmQ7XG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtc1xuICAgIHRoaXMuY3JlYXRlQWxhcm1zKHByb3BzKTtcbiAgfVxuXG4gIHByaXZhdGUgcGFyc2VEaW1lbnNpb25zKG1ldHJpY0FycmF5OiBhbnlbXSk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuICAgIGNvbnN0IGRpbWVuc2lvbnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1ldHJpY0FycmF5Lmxlbmd0aDsgaSArPSAyKSB7XG4gICAgICBpZiAodHlwZW9mIG1ldHJpY0FycmF5W2ldID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgbWV0cmljQXJyYXlbaSArIDFdID09PSAnc3RyaW5nJykge1xuICAgICAgICBkaW1lbnNpb25zW21ldHJpY0FycmF5W2ldXSA9IG1ldHJpY0FycmF5W2kgKyAxXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGRpbWVuc2lvbnM7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUFsYXJtcyhwcm9wczogTW9uaXRvcmluZ0NvbnN0cnVjdFByb3BzKSB7XG4gICAgY29uc3QgeyBlbnZpcm9ubWVudCwgbGFtYmRhRnVuY3Rpb25zIH0gPSBwcm9wcztcblxuICAgIC8vIEhpZ2ggZXJyb3IgcmF0ZSBhbGFybVxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdIaWdoRXJyb3JSYXRlQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6IGBTZXJlbnlhLSR7ZW52aXJvbm1lbnR9LUhpZ2hFcnJvclJhdGVgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0IHdoZW4gTGFtYmRhIGVycm9yIHJhdGUgZXhjZWVkcyA1JScsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1hdGhFeHByZXNzaW9uKHtcbiAgICAgICAgZXhwcmVzc2lvbjogJ2Vycm9ycy9pbnZvY2F0aW9ucyoxMDAnLFxuICAgICAgICB1c2luZ01ldHJpY3M6IHtcbiAgICAgICAgICBlcnJvcnM6IGxhbWJkYUZ1bmN0aW9ucy5wcm9jZXNzLm1ldHJpY0Vycm9ycyh7IHN0YXRpc3RpYzogJ1N1bScgfSksXG4gICAgICAgICAgaW52b2NhdGlvbnM6IGxhbWJkYUZ1bmN0aW9ucy5wcm9jZXNzLm1ldHJpY0ludm9jYXRpb25zKHsgc3RhdGlzdGljOiAnU3VtJyB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1LFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIC8vIEhpZ2ggbGF0ZW5jeSBhbGFybVxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdIaWdoTGF0ZW5jeUFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiBgU2VyZW55YS0ke2Vudmlyb25tZW50fS1IaWdoTGF0ZW5jeWAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnQgd2hlbiBwcm9jZXNzaW5nIGxhdGVuY3kgZXhjZWVkcyAzIG1pbnV0ZXMnLFxuICAgICAgbWV0cmljOiBsYW1iZGFGdW5jdGlvbnMucHJvY2Vzcy5tZXRyaWNEdXJhdGlvbih7IHN0YXRpc3RpYzogJ0F2ZXJhZ2UnIH0pLFxuICAgICAgdGhyZXNob2xkOiAxODAwMDAsIC8vIDMgbWludXRlcyBpbiBtaWxsaXNlY29uZHNcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAzLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICAvLyBEYXRhYmFzZSBDUFUgYWxhcm1cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnRGF0YWJhc2VIaWdoQ1BVQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6IGBTZXJlbnlhLSR7ZW52aXJvbm1lbnR9LURhdGFiYXNlSGlnaENQVWAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnQgd2hlbiBkYXRhYmFzZSBDUFUgZXhjZWVkcyA4MCUnLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdBV1MvUkRTJyxcbiAgICAgICAgbWV0cmljTmFtZTogJ0NQVVV0aWxpemF0aW9uJyxcbiAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgIERCSW5zdGFuY2VJZGVudGlmaWVyOiBgc2VyZW55YWJhY2tlbmQtJHtlbnZpcm9ubWVudH0tc2VyZW55YWQtJHtwcm9wcy5kYkluc3RhbmNlSWR9YCxcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogODAsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgLy8gQ29zdCB0aHJlc2hvbGQgYWxhcm1cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnQ29zdFRocmVzaG9sZEFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiBgU2VyZW55YS0ke2Vudmlyb25tZW50fS1Db3N0VGhyZXNob2xkYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdBbGVydCB3aGVuIGRhaWx5IGNvc3RzIGV4Y2VlZCB0aHJlc2hvbGQnLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdTZXJlbnlhL0Nvc3QnLFxuICAgICAgICBtZXRyaWNOYW1lOiAnRGFpbHlDb3N0RXN0aW1hdGUnLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgRW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6ICdNYXhpbXVtJyxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMTAwIDogNTAsIC8vICQxMDAgcHJvZCwgJDUwIGRldlxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcbiAgfVxufSJdfQ==