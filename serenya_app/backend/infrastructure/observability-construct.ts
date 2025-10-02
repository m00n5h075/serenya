import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface ObservabilityConstructProps {
  environment: string;
  api: apigateway.RestApi;
  table: dynamodb.Table;
  lambdaFunctions: Record<string, lambda.Function>;
  alertEmail?: string;
}

/**
 * Observability Construct for Serenya
 * Creates CloudWatch dashboards and alarms following the observability framework
 */
export class ObservabilityConstruct extends Construct {
  public readonly alertTopic: sns.Topic;
  public readonly executiveDashboard: cloudwatch.Dashboard;
  public readonly operationsDashboard: cloudwatch.Dashboard;
  public readonly securityDashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: ObservabilityConstructProps) {
    super(scope, id);

    const { environment, api, table, lambdaFunctions, alertEmail } = props;

    // SNS Topic for alerts
    this.alertTopic = new sns.Topic(this, 'AlertTopic', {
      displayName: `Serenya ${environment} Alerts`,
      topicName: `serenya-alerts-${environment}`,
    });

    if (alertEmail) {
      this.alertTopic.addSubscription(
        new sns_subscriptions.EmailSubscription(alertEmail)
      );
    }

    // Create dashboards
    this.executiveDashboard = this.createExecutiveDashboard(environment, api, table);
    this.operationsDashboard = this.createOperationsDashboard(environment, lambdaFunctions, table, api);
    this.securityDashboard = this.createSecurityDashboard(environment);

    // Create critical alarms
    this.createCriticalAlarms(environment, lambdaFunctions, api, table);
    this.createWarningAlarms(environment, lambdaFunctions, api, table);
  }

  /**
   * Executive Dashboard - Key Business Metrics
   */
  private createExecutiveDashboard(
    environment: string,
    api: apigateway.RestApi,
    table: dynamodb.Table
  ): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'ExecutiveDashboard', {
      dashboardName: `Serenya-Executive-${environment}`,
      periodOverride: cloudwatch.PeriodOverride.AUTO,
    });

    // Row 1: Key Business Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Monthly Active Users (MAU)',
        left: [
          new cloudwatch.Metric({
            namespace: 'Serenya/Business',
            metricName: 'NewUserRegistrations',
            statistic: 'Sum',
            period: cdk.Duration.days(1),
          }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Subscription Conversions',
        left: [
          new cloudwatch.Metric({
            namespace: 'Serenya/Business',
            metricName: 'SubscriptionConversions',
            statistic: 'Sum',
            period: cdk.Duration.days(1),
          }),
        ],
        width: 8,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'System Uptime %',
        metrics: [
          api.metricClientError({ statistic: 'Average' }),
          api.metricServerError({ statistic: 'Average' }),
        ],
        width: 8,
      })
    );

    // Row 2: User Engagement
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Document Uploads (Daily)',
        left: [
          new cloudwatch.Metric({
            namespace: 'Serenya/Upload',
            metricName: 'DocumentUploadSuccess',
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'AI Processing Success Rate',
        left: [
          new cloudwatch.Metric({
            namespace: 'Serenya/AI',
            metricName: 'AIProcessingSuccess',
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
          }),
          new cloudwatch.Metric({
            namespace: 'Serenya/AI',
            metricName: 'AIProcessingAttempts',
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
          }),
        ],
        width: 12,
      })
    );

    return dashboard;
  }

  /**
   * Operations Dashboard - System Performance
   */
  private createOperationsDashboard(
    environment: string,
    lambdaFunctions: Record<string, lambda.Function>,
    table: dynamodb.Table,
    api: apigateway.RestApi
  ): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'OperationsDashboard', {
      dashboardName: `Serenya-Operations-${environment}`,
      periodOverride: cloudwatch.PeriodOverride.AUTO,
    });

    // Row 1: API Gateway Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Request Count',
        left: [api.metricCount()],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Latency (P50, P95, P99)',
        left: [
          api.metricLatency({ statistic: 'p50' }),
          api.metricLatency({ statistic: 'p95' }),
          api.metricLatency({ statistic: 'p99' }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Error Rate',
        left: [
          api.metricClientError(),
          api.metricServerError(),
        ],
        width: 8,
      })
    );

    // Row 2: Lambda Performance
    const authFunction = lambdaFunctions.auth;
    const uploadFunction = lambdaFunctions.upload;
    const processFunction = lambdaFunctions.process;

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration (ms)',
        left: [
          authFunction.metricDuration({ statistic: 'Average' }),
          uploadFunction.metricDuration({ statistic: 'Average' }),
          processFunction.metricDuration({ statistic: 'Average' }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        left: [
          authFunction.metricErrors(),
          uploadFunction.metricErrors(),
          processFunction.metricErrors(),
        ],
        width: 12,
      })
    );

    // Row 3: DynamoDB Performance
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Read/Write Capacity',
        left: [
          table.metricConsumedReadCapacityUnits(),
          table.metricConsumedWriteCapacityUnits(),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Throttled Requests',
        left: [
          table.metricUserErrors(),
          table.metricSystemErrorsForOperations(),
        ],
        width: 12,
      })
    );

    // Row 4: Custom Observability Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Cold Starts',
        left: [
          new cloudwatch.Metric({
            namespace: 'Serenya/Performance',
            metricName: 'LambdaColdStarts',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'AI Processing Duration',
        left: [
          new cloudwatch.Metric({
            namespace: 'Serenya/AI',
            metricName: 'AIProcessingDuration',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Job Processing Queue',
        left: [
          new cloudwatch.Metric({
            namespace: 'Serenya/Jobs',
            metricName: 'JobsCreated',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'Serenya/Jobs',
            metricName: 'JobCompletions',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 8,
      })
    );

    return dashboard;
  }

  /**
   * Security Dashboard - Security & Compliance
   */
  private createSecurityDashboard(environment: string): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'SecurityDashboard', {
      dashboardName: `Serenya-Security-${environment}`,
      periodOverride: cloudwatch.PeriodOverride.AUTO,
    });

    // Row 1: Authentication Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Login Success Rate',
        left: [
          new cloudwatch.Metric({
            namespace: 'Serenya/Auth',
            metricName: 'LoginSuccess',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'Serenya/Auth',
            metricName: 'LoginAttempts',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Biometric Authentication',
        left: [
          new cloudwatch.Metric({
            namespace: 'Serenya/Auth',
            metricName: 'BiometricVerificationSuccess',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'Serenya/Auth',
            metricName: 'BiometricVerificationAttempts',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      })
    );

    // Row 2: Security Events
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Security Events by Severity',
        left: [
          new cloudwatch.Metric({
            namespace: 'Serenya/Security',
            metricName: 'SecurityEvents',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'Serenya/Security',
            metricName: 'HighSeveritySecurityEvents',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Encryption Operations',
        left: [
          new cloudwatch.Metric({
            namespace: 'Serenya/Security',
            metricName: 'EncryptionOperations',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      })
    );

    return dashboard;
  }

  /**
   * Create Critical Alarms (PagerDuty-level)
   */
  private createCriticalAlarms(
    environment: string,
    lambdaFunctions: Record<string, lambda.Function>,
    api: apigateway.RestApi,
    table: dynamodb.Table
  ): void {
    // API 5xx Error Rate
    const apiErrorAlarm = new cloudwatch.Alarm(this, 'ApiServerErrorAlarm', {
      alarmName: `${environment}-api-server-errors`,
      metric: api.metricServerError({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'API Gateway 5xx errors exceed threshold',
    });
    apiErrorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alertTopic));

    // Lambda Error Rate
    Object.entries(lambdaFunctions).forEach(([name, func]) => {
      const errorAlarm = new cloudwatch.Alarm(this, `${name}ErrorAlarm`, {
        alarmName: `${environment}-lambda-${name}-errors`,
        metric: func.metricErrors({
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 5,
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: `${name} Lambda function error rate exceeded`,
      });
      errorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alertTopic));
    });

    // AI Processing Failure
    const aiProcessingAlarm = new cloudwatch.Alarm(this, 'AIProcessingFailureAlarm', {
      alarmName: `${environment}-ai-processing-failure`,
      metric: new cloudwatch.Metric({
        namespace: 'Serenya/AI',
        metricName: 'AIProcessingSuccess',
        statistic: 'Sum',
        period: cdk.Duration.minutes(10),
      }),
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      alarmDescription: 'AI processing success rate below 95%',
    });
    aiProcessingAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alertTopic));

    // DynamoDB Throttling
    const dynamoThrottleAlarm = new cloudwatch.Alarm(this, 'DynamoDBThrottleAlarm', {
      alarmName: `${environment}-dynamodb-throttling`,
      metric: table.metricUserErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'DynamoDB throttling detected',
    });
    dynamoThrottleAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alertTopic));
  }

  /**
   * Create Warning Alarms (Email-level)
   */
  private createWarningAlarms(
    environment: string,
    lambdaFunctions: Record<string, lambda.Function>,
    api: apigateway.RestApi,
    table: dynamodb.Table
  ): void {
    // API Latency P95
    new cloudwatch.Alarm(this, 'ApiLatencyP95Alarm', {
      alarmName: `${environment}-api-latency-p95`,
      metric: api.metricLatency({
        statistic: 'p95',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 2000, // 2 seconds
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'API P95 latency exceeded 2 seconds',
    });

    // Lambda Duration Warning
    const processFunction = lambdaFunctions.process;
    if (processFunction) {
      new cloudwatch.Alarm(this, 'ProcessLambdaDurationAlarm', {
        alarmName: `${environment}-process-lambda-duration`,
        metric: processFunction.metricDuration({
          statistic: 'p95',
          period: cdk.Duration.minutes(5),
        }),
        threshold: processFunction.timeout ? processFunction.timeout.toMilliseconds() * 0.8 : 120000,
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: 'Process Lambda duration approaching timeout',
      });
    }

    // Upload Success Rate
    new cloudwatch.Alarm(this, 'UploadSuccessRateAlarm', {
      alarmName: `${environment}-upload-success-rate`,
      metric: new cloudwatch.Metric({
        namespace: 'Serenya/Upload',
        metricName: 'DocumentUploadSuccess',
        statistic: 'Sum',
        period: cdk.Duration.minutes(10),
      }),
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      threshold: 10, // Less than 10 successful uploads in 10 minutes
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Document upload success rate is low',
    });
  }
}
