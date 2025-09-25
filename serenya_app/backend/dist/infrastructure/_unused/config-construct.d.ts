import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
interface ConfigConstructProps {
    environment: string;
    region: string;
    lambdaFunctions: Record<string, lambda.Function>;
}
export declare class ConfigConstruct extends Construct {
    readonly configRole: iam.Role;
    readonly parameters: Record<string, ssm.StringParameter>;
    readonly costTrackingFunction: lambda.Function;
    constructor(scope: Construct, id: string, props: ConfigConstructProps);
    private createParameters;
    private createFeatureFlags;
    private createCostOptimization;
    /**
     * Create configuration loader utility for Lambda functions
     */
    createConfigLoader(): lambda.Function;
}
export {};
