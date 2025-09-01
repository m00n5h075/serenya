#!/usr/bin/env node
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
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const serenya_backend_stack_1 = require("./serenya-backend-stack");
const app = new cdk.App();
// Get environment from context
const environment = app.node.tryGetContext('environment') || 'dev';
// Environment-specific configuration
const envConfig = {
    dev: {
        region: 'eu-west-1',
        allowOrigins: ['http://localhost:*'],
        retentionDays: 7,
        enableDetailedLogging: true,
    },
    staging: {
        region: 'eu-west-1',
        allowOrigins: ['https://staging.serenya.health'],
        retentionDays: 14,
        enableDetailedLogging: true,
    },
    prod: {
        region: 'eu-west-1',
        allowOrigins: ['https://app.serenya.health'],
        retentionDays: 30,
        enableDetailedLogging: false,
    }
};
const config = envConfig[environment];
new serenya_backend_stack_1.SerenyaBackendStack(app, `SerenyaBackend-${environment}`, {
    env: {
        region: config.region,
    },
    environment,
    config,
    stackName: `serenya-backend-${environment}`,
    description: `Serenya AI Health Agent Backend - ${environment} environment`,
    tags: {
        Project: 'Serenya',
        Environment: environment,
        Component: 'Backend',
        Owner: 'Serenya-Health',
        CostCenter: 'Engineering',
        DataClassification: 'PHI-Temporary',
        Compliance: 'HIPAA',
    },
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vaW5mcmFzdHJ1Y3R1cmUvYXBwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLHVDQUFxQztBQUNyQyxpREFBbUM7QUFDbkMsbUVBQThEO0FBRTlELE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLCtCQUErQjtBQUMvQixNQUFNLFdBQVcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsSUFBSSxLQUFLLENBQUM7QUFFbkUscUNBQXFDO0FBQ3JDLE1BQU0sU0FBUyxHQUFHO0lBQ2hCLEdBQUcsRUFBRTtRQUNILE1BQU0sRUFBRSxXQUFXO1FBQ25CLFlBQVksRUFBRSxDQUFDLG9CQUFvQixDQUFDO1FBQ3BDLGFBQWEsRUFBRSxDQUFDO1FBQ2hCLHFCQUFxQixFQUFFLElBQUk7S0FDNUI7SUFDRCxPQUFPLEVBQUU7UUFDUCxNQUFNLEVBQUUsV0FBVztRQUNuQixZQUFZLEVBQUUsQ0FBQyxnQ0FBZ0MsQ0FBQztRQUNoRCxhQUFhLEVBQUUsRUFBRTtRQUNqQixxQkFBcUIsRUFBRSxJQUFJO0tBQzVCO0lBQ0QsSUFBSSxFQUFFO1FBQ0osTUFBTSxFQUFFLFdBQVc7UUFDbkIsWUFBWSxFQUFFLENBQUMsNEJBQTRCLENBQUM7UUFDNUMsYUFBYSxFQUFFLEVBQUU7UUFDakIscUJBQXFCLEVBQUUsS0FBSztLQUM3QjtDQUNGLENBQUM7QUFFRixNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsV0FBcUMsQ0FBQyxDQUFDO0FBRWhFLElBQUksMkNBQW1CLENBQUMsR0FBRyxFQUFFLGtCQUFrQixXQUFXLEVBQUUsRUFBRTtJQUM1RCxHQUFHLEVBQUU7UUFDSCxNQUFNLEVBQUUsTUFBTSxDQUFDLE1BQU07S0FDdEI7SUFDRCxXQUFXO0lBQ1gsTUFBTTtJQUNOLFNBQVMsRUFBRSxtQkFBbUIsV0FBVyxFQUFFO0lBQzNDLFdBQVcsRUFBRSxxQ0FBcUMsV0FBVyxjQUFjO0lBQzNFLElBQUksRUFBRTtRQUNKLE9BQU8sRUFBRSxTQUFTO1FBQ2xCLFdBQVcsRUFBRSxXQUFXO1FBQ3hCLFNBQVMsRUFBRSxTQUFTO1FBQ3BCLEtBQUssRUFBRSxnQkFBZ0I7UUFDdkIsVUFBVSxFQUFFLGFBQWE7UUFDekIsa0JBQWtCLEVBQUUsZUFBZTtRQUNuQyxVQUFVLEVBQUUsT0FBTztLQUNwQjtDQUNGLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAnc291cmNlLW1hcC1zdXBwb3J0L3JlZ2lzdGVyJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBTZXJlbnlhQmFja2VuZFN0YWNrIH0gZnJvbSAnLi9zZXJlbnlhLWJhY2tlbmQtc3RhY2snO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuXG4vLyBHZXQgZW52aXJvbm1lbnQgZnJvbSBjb250ZXh0XG5jb25zdCBlbnZpcm9ubWVudCA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2Vudmlyb25tZW50JykgfHwgJ2Rldic7XG5cbi8vIEVudmlyb25tZW50LXNwZWNpZmljIGNvbmZpZ3VyYXRpb25cbmNvbnN0IGVudkNvbmZpZyA9IHtcbiAgZGV2OiB7XG4gICAgcmVnaW9uOiAnZXUtd2VzdC0xJyxcbiAgICBhbGxvd09yaWdpbnM6IFsnaHR0cDovL2xvY2FsaG9zdDoqJ10sXG4gICAgcmV0ZW50aW9uRGF5czogNyxcbiAgICBlbmFibGVEZXRhaWxlZExvZ2dpbmc6IHRydWUsXG4gIH0sXG4gIHN0YWdpbmc6IHtcbiAgICByZWdpb246ICdldS13ZXN0LTEnLCBcbiAgICBhbGxvd09yaWdpbnM6IFsnaHR0cHM6Ly9zdGFnaW5nLnNlcmVueWEuaGVhbHRoJ10sXG4gICAgcmV0ZW50aW9uRGF5czogMTQsXG4gICAgZW5hYmxlRGV0YWlsZWRMb2dnaW5nOiB0cnVlLFxuICB9LFxuICBwcm9kOiB7XG4gICAgcmVnaW9uOiAnZXUtd2VzdC0xJyxcbiAgICBhbGxvd09yaWdpbnM6IFsnaHR0cHM6Ly9hcHAuc2VyZW55YS5oZWFsdGgnXSxcbiAgICByZXRlbnRpb25EYXlzOiAzMCxcbiAgICBlbmFibGVEZXRhaWxlZExvZ2dpbmc6IGZhbHNlLFxuICB9XG59O1xuXG5jb25zdCBjb25maWcgPSBlbnZDb25maWdbZW52aXJvbm1lbnQgYXMga2V5b2YgdHlwZW9mIGVudkNvbmZpZ107XG5cbm5ldyBTZXJlbnlhQmFja2VuZFN0YWNrKGFwcCwgYFNlcmVueWFCYWNrZW5kLSR7ZW52aXJvbm1lbnR9YCwge1xuICBlbnY6IHtcbiAgICByZWdpb246IGNvbmZpZy5yZWdpb24sXG4gIH0sXG4gIGVudmlyb25tZW50LFxuICBjb25maWcsXG4gIHN0YWNrTmFtZTogYHNlcmVueWEtYmFja2VuZC0ke2Vudmlyb25tZW50fWAsXG4gIGRlc2NyaXB0aW9uOiBgU2VyZW55YSBBSSBIZWFsdGggQWdlbnQgQmFja2VuZCAtICR7ZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgdGFnczoge1xuICAgIFByb2plY3Q6ICdTZXJlbnlhJyxcbiAgICBFbnZpcm9ubWVudDogZW52aXJvbm1lbnQsXG4gICAgQ29tcG9uZW50OiAnQmFja2VuZCcsXG4gICAgT3duZXI6ICdTZXJlbnlhLUhlYWx0aCcsXG4gICAgQ29zdENlbnRlcjogJ0VuZ2luZWVyaW5nJyxcbiAgICBEYXRhQ2xhc3NpZmljYXRpb246ICdQSEktVGVtcG9yYXJ5JyxcbiAgICBDb21wbGlhbmNlOiAnSElQQUEnLFxuICB9LFxufSk7Il19