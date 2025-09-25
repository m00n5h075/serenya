import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
interface EnhancedSerenyaBackendStackProps extends cdk.StackProps {
    environment: string;
    config: {
        region: string;
        allowOrigins: string[];
        retentionDays: number;
        enableDetailedLogging: boolean;
        enablePrivateLink: boolean;
        enableVpcFlowLogs: boolean;
        enableNatGateway: boolean;
    };
}
export declare class EnhancedSerenyaBackendStack extends cdk.Stack {
    readonly api: apigateway.RestApi;
    readonly vpc: any;
    readonly database: rds.DatabaseInstance;
    readonly dbSecret: secretsmanager.Secret;
    constructor(scope: Construct, id: string, props: EnhancedSerenyaBackendStackProps);
}
export {};
