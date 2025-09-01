import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
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
    readonly jobsTable: dynamodb.Table;
    readonly usersTable: dynamodb.Table;
    constructor(scope: Construct, id: string, props: SerenyaBackendStackProps);
    private setupApiRoutes;
}
export {};
