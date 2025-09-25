import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
interface MonitoringConstructProps {
    environment: string;
    region: string;
    accountId: string;
    apiGatewayId: string;
    kmsKeyId: string;
    dbInstanceId: string;
    lambdaFunctions: Record<string, lambda.Function>;
}
export declare class MonitoringConstruct extends Construct {
    readonly dashboards: Record<string, cloudwatch.Dashboard>;
    readonly metricFilters: logs.MetricFilter[];
    readonly customMetricsRole: iam.Role;
    constructor(scope: Construct, id: string, props: MonitoringConstructProps);
    private parseDimensions;
    private createAlarms;
}
export {};
