import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { Construct } from 'constructs';
import * as fs from 'fs';

interface MonitoringConstructProps {
  environment: string;
  region: string;
  accountId: string;
  apiGatewayId: string;
  kmsKeyId: string;
  dbInstanceId: string;
  lambdaFunctions: Record<string, lambda.Function>;
}

export class MonitoringConstruct extends Construct {
  public readonly dashboards: Record<string, cloudwatch.Dashboard>;
  public readonly metricFilters: logs.MetricFilter[];
  public readonly customMetricsRole: iam.Role;

  constructor(scope: Construct, id: string, props: MonitoringConstructProps) {
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
        widgets: JSON.parse(dashboardBody).widgets.map((widget: any) => {
          if (widget.type === 'metric') {
            return new cloudwatch.GraphWidget({
              title: widget.properties.title,
              left: widget.properties.metrics?.map((metric: any[]) => 
                new cloudwatch.Metric({
                  namespace: metric[0],
                  metricName: metric[1],
                  dimensionsMap: this.parseDimensions(metric.slice(2)),
                  statistic: metric[metric.length - 1]?.stat || 'Average',
                })
              ) || [],
              width: widget.width,
              height: widget.height,
              view: widget.properties.view === 'singleValue' ? 
                cloudwatch.GraphWidgetView.SINGLE_VALUE : 
                cloudwatch.GraphWidgetView.TIME_SERIES,
            });
          } else if (widget.type === 'log') {
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

  private parseDimensions(metricArray: any[]): Record<string, string> {
    const dimensions: Record<string, string> = {};
    for (let i = 0; i < metricArray.length; i += 2) {
      if (typeof metricArray[i] === 'string' && typeof metricArray[i + 1] === 'string') {
        dimensions[metricArray[i]] = metricArray[i + 1];
      }
    }
    return dimensions;
  }

  private createAlarms(props: MonitoringConstructProps) {
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