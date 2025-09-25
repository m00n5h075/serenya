import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
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
export declare class SerenyaBackendStack extends cdk.Stack {
    readonly api: apigateway.RestApi;
    readonly tempFilesBucket: s3.Bucket;
    readonly vpc: ec2.Vpc;
    readonly database: rds.DatabaseCluster;
    readonly dbSecret: secretsmanager.Secret;
    constructor(scope: Construct, id: string, props: SerenyaBackendStackProps);
    private setupApiRoutes;
}
export {};
