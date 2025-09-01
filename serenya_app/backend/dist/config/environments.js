"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.environments = void 0;
exports.getEnvironmentConfig = getEnvironmentConfig;
exports.environments = {
    dev: {
        region: 'eu-west-1',
        allowOrigins: ['http://localhost:*', 'https://localhost:*'],
        retentionDays: 7,
        enableDetailedLogging: true,
        enableXRayTracing: true,
        memorySize: {
            small: 256,
            medium: 512,
            large: 1024,
        },
        timeout: {
            short: 15,
            medium: 60,
            long: 180,
        },
        apiGateway: {
            throttlingRateLimit: 100,
            throttlingBurstLimit: 200,
            cacheKeyTtl: 300, // 5 minutes
        },
        s3: {
            lifecycleHours: 1,
            failsafeHours: 24,
        },
        security: {
            jwtExpirationHours: 1,
            maxRetryAttempts: 3,
            rateLimitPerMinute: 60,
        },
    },
    staging: {
        region: 'eu-west-1',
        allowOrigins: ['https://staging.serenya.health'],
        retentionDays: 14,
        enableDetailedLogging: true,
        enableXRayTracing: true,
        memorySize: {
            small: 256,
            medium: 512,
            large: 1024,
        },
        timeout: {
            short: 15,
            medium: 60,
            long: 180,
        },
        apiGateway: {
            throttlingRateLimit: 200,
            throttlingBurstLimit: 400,
            cacheKeyTtl: 300,
        },
        s3: {
            lifecycleHours: 1,
            failsafeHours: 24,
        },
        security: {
            jwtExpirationHours: 1,
            maxRetryAttempts: 3,
            rateLimitPerMinute: 100,
        },
    },
    prod: {
        region: 'eu-west-1',
        allowOrigins: ['https://app.serenya.health'],
        retentionDays: 30,
        enableDetailedLogging: false,
        enableXRayTracing: true,
        memorySize: {
            small: 512,
            medium: 1024,
            large: 2048,
        },
        timeout: {
            short: 15,
            medium: 60,
            long: 180,
        },
        apiGateway: {
            throttlingRateLimit: 500,
            throttlingBurstLimit: 1000,
            cacheKeyTtl: 600, // 10 minutes
        },
        s3: {
            lifecycleHours: 1,
            failsafeHours: 24,
        },
        security: {
            jwtExpirationHours: 1,
            maxRetryAttempts: 3,
            rateLimitPerMinute: 200,
        },
    },
};
function getEnvironmentConfig(environment) {
    const config = exports.environments[environment];
    if (!config) {
        throw new Error(`Unknown environment: ${environment}. Available: ${Object.keys(exports.environments).join(', ')}`);
    }
    return config;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vY29uZmlnL2Vudmlyb25tZW50cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFrSUEsb0RBTUM7QUF4R1ksUUFBQSxZQUFZLEdBQXNDO0lBQzdELEdBQUcsRUFBRTtRQUNILE1BQU0sRUFBRSxXQUFXO1FBQ25CLFlBQVksRUFBRSxDQUFDLG9CQUFvQixFQUFFLHFCQUFxQixDQUFDO1FBQzNELGFBQWEsRUFBRSxDQUFDO1FBQ2hCLHFCQUFxQixFQUFFLElBQUk7UUFDM0IsaUJBQWlCLEVBQUUsSUFBSTtRQUN2QixVQUFVLEVBQUU7WUFDVixLQUFLLEVBQUUsR0FBRztZQUNWLE1BQU0sRUFBRSxHQUFHO1lBQ1gsS0FBSyxFQUFFLElBQUk7U0FDWjtRQUNELE9BQU8sRUFBRTtZQUNQLEtBQUssRUFBRSxFQUFFO1lBQ1QsTUFBTSxFQUFFLEVBQUU7WUFDVixJQUFJLEVBQUUsR0FBRztTQUNWO1FBQ0QsVUFBVSxFQUFFO1lBQ1YsbUJBQW1CLEVBQUUsR0FBRztZQUN4QixvQkFBb0IsRUFBRSxHQUFHO1lBQ3pCLFdBQVcsRUFBRSxHQUFHLEVBQUUsWUFBWTtTQUMvQjtRQUNELEVBQUUsRUFBRTtZQUNGLGNBQWMsRUFBRSxDQUFDO1lBQ2pCLGFBQWEsRUFBRSxFQUFFO1NBQ2xCO1FBQ0QsUUFBUSxFQUFFO1lBQ1Isa0JBQWtCLEVBQUUsQ0FBQztZQUNyQixnQkFBZ0IsRUFBRSxDQUFDO1lBQ25CLGtCQUFrQixFQUFFLEVBQUU7U0FDdkI7S0FDRjtJQUVELE9BQU8sRUFBRTtRQUNQLE1BQU0sRUFBRSxXQUFXO1FBQ25CLFlBQVksRUFBRSxDQUFDLGdDQUFnQyxDQUFDO1FBQ2hELGFBQWEsRUFBRSxFQUFFO1FBQ2pCLHFCQUFxQixFQUFFLElBQUk7UUFDM0IsaUJBQWlCLEVBQUUsSUFBSTtRQUN2QixVQUFVLEVBQUU7WUFDVixLQUFLLEVBQUUsR0FBRztZQUNWLE1BQU0sRUFBRSxHQUFHO1lBQ1gsS0FBSyxFQUFFLElBQUk7U0FDWjtRQUNELE9BQU8sRUFBRTtZQUNQLEtBQUssRUFBRSxFQUFFO1lBQ1QsTUFBTSxFQUFFLEVBQUU7WUFDVixJQUFJLEVBQUUsR0FBRztTQUNWO1FBQ0QsVUFBVSxFQUFFO1lBQ1YsbUJBQW1CLEVBQUUsR0FBRztZQUN4QixvQkFBb0IsRUFBRSxHQUFHO1lBQ3pCLFdBQVcsRUFBRSxHQUFHO1NBQ2pCO1FBQ0QsRUFBRSxFQUFFO1lBQ0YsY0FBYyxFQUFFLENBQUM7WUFDakIsYUFBYSxFQUFFLEVBQUU7U0FDbEI7UUFDRCxRQUFRLEVBQUU7WUFDUixrQkFBa0IsRUFBRSxDQUFDO1lBQ3JCLGdCQUFnQixFQUFFLENBQUM7WUFDbkIsa0JBQWtCLEVBQUUsR0FBRztTQUN4QjtLQUNGO0lBRUQsSUFBSSxFQUFFO1FBQ0osTUFBTSxFQUFFLFdBQVc7UUFDbkIsWUFBWSxFQUFFLENBQUMsNEJBQTRCLENBQUM7UUFDNUMsYUFBYSxFQUFFLEVBQUU7UUFDakIscUJBQXFCLEVBQUUsS0FBSztRQUM1QixpQkFBaUIsRUFBRSxJQUFJO1FBQ3ZCLFVBQVUsRUFBRTtZQUNWLEtBQUssRUFBRSxHQUFHO1lBQ1YsTUFBTSxFQUFFLElBQUk7WUFDWixLQUFLLEVBQUUsSUFBSTtTQUNaO1FBQ0QsT0FBTyxFQUFFO1lBQ1AsS0FBSyxFQUFFLEVBQUU7WUFDVCxNQUFNLEVBQUUsRUFBRTtZQUNWLElBQUksRUFBRSxHQUFHO1NBQ1Y7UUFDRCxVQUFVLEVBQUU7WUFDVixtQkFBbUIsRUFBRSxHQUFHO1lBQ3hCLG9CQUFvQixFQUFFLElBQUk7WUFDMUIsV0FBVyxFQUFFLEdBQUcsRUFBRSxhQUFhO1NBQ2hDO1FBQ0QsRUFBRSxFQUFFO1lBQ0YsY0FBYyxFQUFFLENBQUM7WUFDakIsYUFBYSxFQUFFLEVBQUU7U0FDbEI7UUFDRCxRQUFRLEVBQUU7WUFDUixrQkFBa0IsRUFBRSxDQUFDO1lBQ3JCLGdCQUFnQixFQUFFLENBQUM7WUFDbkIsa0JBQWtCLEVBQUUsR0FBRztTQUN4QjtLQUNGO0NBQ0YsQ0FBQztBQUVGLFNBQWdCLG9CQUFvQixDQUFDLFdBQW1CO0lBQ3RELE1BQU0sTUFBTSxHQUFHLG9CQUFZLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDekMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ1osTUFBTSxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsV0FBVyxnQkFBZ0IsTUFBTSxDQUFDLElBQUksQ0FBQyxvQkFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUM3RyxDQUFDO0lBQ0QsT0FBTyxNQUFNLENBQUM7QUFDaEIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBpbnRlcmZhY2UgRW52aXJvbm1lbnRDb25maWcge1xuICByZWdpb246IHN0cmluZztcbiAgYWxsb3dPcmlnaW5zOiBzdHJpbmdbXTtcbiAgcmV0ZW50aW9uRGF5czogbnVtYmVyO1xuICBlbmFibGVEZXRhaWxlZExvZ2dpbmc6IGJvb2xlYW47XG4gIGVuYWJsZVhSYXlUcmFjaW5nOiBib29sZWFuO1xuICBtZW1vcnlTaXplOiB7XG4gICAgc21hbGw6IG51bWJlcjtcbiAgICBtZWRpdW06IG51bWJlcjtcbiAgICBsYXJnZTogbnVtYmVyO1xuICB9O1xuICB0aW1lb3V0OiB7XG4gICAgc2hvcnQ6IG51bWJlcjtcbiAgICBtZWRpdW06IG51bWJlcjtcbiAgICBsb25nOiBudW1iZXI7XG4gIH07XG4gIGFwaUdhdGV3YXk6IHtcbiAgICB0aHJvdHRsaW5nUmF0ZUxpbWl0OiBudW1iZXI7XG4gICAgdGhyb3R0bGluZ0J1cnN0TGltaXQ6IG51bWJlcjtcbiAgICBjYWNoZUtleVR0bDogbnVtYmVyO1xuICB9O1xuICBzMzoge1xuICAgIGxpZmVjeWNsZUhvdXJzOiBudW1iZXI7XG4gICAgZmFpbHNhZmVIb3VyczogbnVtYmVyO1xuICB9O1xuICBzZWN1cml0eToge1xuICAgIGp3dEV4cGlyYXRpb25Ib3VyczogbnVtYmVyO1xuICAgIG1heFJldHJ5QXR0ZW1wdHM6IG51bWJlcjtcbiAgICByYXRlTGltaXRQZXJNaW51dGU6IG51bWJlcjtcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IGVudmlyb25tZW50czogUmVjb3JkPHN0cmluZywgRW52aXJvbm1lbnRDb25maWc+ID0ge1xuICBkZXY6IHtcbiAgICByZWdpb246ICdldS13ZXN0LTEnLFxuICAgIGFsbG93T3JpZ2luczogWydodHRwOi8vbG9jYWxob3N0OionLCAnaHR0cHM6Ly9sb2NhbGhvc3Q6KiddLFxuICAgIHJldGVudGlvbkRheXM6IDcsXG4gICAgZW5hYmxlRGV0YWlsZWRMb2dnaW5nOiB0cnVlLFxuICAgIGVuYWJsZVhSYXlUcmFjaW5nOiB0cnVlLFxuICAgIG1lbW9yeVNpemU6IHtcbiAgICAgIHNtYWxsOiAyNTYsXG4gICAgICBtZWRpdW06IDUxMixcbiAgICAgIGxhcmdlOiAxMDI0LFxuICAgIH0sXG4gICAgdGltZW91dDoge1xuICAgICAgc2hvcnQ6IDE1LFxuICAgICAgbWVkaXVtOiA2MCxcbiAgICAgIGxvbmc6IDE4MCxcbiAgICB9LFxuICAgIGFwaUdhdGV3YXk6IHtcbiAgICAgIHRocm90dGxpbmdSYXRlTGltaXQ6IDEwMCxcbiAgICAgIHRocm90dGxpbmdCdXJzdExpbWl0OiAyMDAsXG4gICAgICBjYWNoZUtleVR0bDogMzAwLCAvLyA1IG1pbnV0ZXNcbiAgICB9LFxuICAgIHMzOiB7XG4gICAgICBsaWZlY3ljbGVIb3VyczogMSxcbiAgICAgIGZhaWxzYWZlSG91cnM6IDI0LFxuICAgIH0sXG4gICAgc2VjdXJpdHk6IHtcbiAgICAgIGp3dEV4cGlyYXRpb25Ib3VyczogMSxcbiAgICAgIG1heFJldHJ5QXR0ZW1wdHM6IDMsXG4gICAgICByYXRlTGltaXRQZXJNaW51dGU6IDYwLFxuICAgIH0sXG4gIH0sXG4gIFxuICBzdGFnaW5nOiB7XG4gICAgcmVnaW9uOiAnZXUtd2VzdC0xJyxcbiAgICBhbGxvd09yaWdpbnM6IFsnaHR0cHM6Ly9zdGFnaW5nLnNlcmVueWEuaGVhbHRoJ10sXG4gICAgcmV0ZW50aW9uRGF5czogMTQsXG4gICAgZW5hYmxlRGV0YWlsZWRMb2dnaW5nOiB0cnVlLFxuICAgIGVuYWJsZVhSYXlUcmFjaW5nOiB0cnVlLFxuICAgIG1lbW9yeVNpemU6IHtcbiAgICAgIHNtYWxsOiAyNTYsXG4gICAgICBtZWRpdW06IDUxMixcbiAgICAgIGxhcmdlOiAxMDI0LFxuICAgIH0sXG4gICAgdGltZW91dDoge1xuICAgICAgc2hvcnQ6IDE1LFxuICAgICAgbWVkaXVtOiA2MCxcbiAgICAgIGxvbmc6IDE4MCxcbiAgICB9LFxuICAgIGFwaUdhdGV3YXk6IHtcbiAgICAgIHRocm90dGxpbmdSYXRlTGltaXQ6IDIwMCxcbiAgICAgIHRocm90dGxpbmdCdXJzdExpbWl0OiA0MDAsXG4gICAgICBjYWNoZUtleVR0bDogMzAwLFxuICAgIH0sXG4gICAgczM6IHtcbiAgICAgIGxpZmVjeWNsZUhvdXJzOiAxLFxuICAgICAgZmFpbHNhZmVIb3VyczogMjQsXG4gICAgfSxcbiAgICBzZWN1cml0eToge1xuICAgICAgand0RXhwaXJhdGlvbkhvdXJzOiAxLFxuICAgICAgbWF4UmV0cnlBdHRlbXB0czogMyxcbiAgICAgIHJhdGVMaW1pdFBlck1pbnV0ZTogMTAwLFxuICAgIH0sXG4gIH0sXG4gIFxuICBwcm9kOiB7XG4gICAgcmVnaW9uOiAnZXUtd2VzdC0xJyxcbiAgICBhbGxvd09yaWdpbnM6IFsnaHR0cHM6Ly9hcHAuc2VyZW55YS5oZWFsdGgnXSxcbiAgICByZXRlbnRpb25EYXlzOiAzMCxcbiAgICBlbmFibGVEZXRhaWxlZExvZ2dpbmc6IGZhbHNlLFxuICAgIGVuYWJsZVhSYXlUcmFjaW5nOiB0cnVlLFxuICAgIG1lbW9yeVNpemU6IHtcbiAgICAgIHNtYWxsOiA1MTIsXG4gICAgICBtZWRpdW06IDEwMjQsXG4gICAgICBsYXJnZTogMjA0OCxcbiAgICB9LFxuICAgIHRpbWVvdXQ6IHtcbiAgICAgIHNob3J0OiAxNSxcbiAgICAgIG1lZGl1bTogNjAsXG4gICAgICBsb25nOiAxODAsXG4gICAgfSxcbiAgICBhcGlHYXRld2F5OiB7XG4gICAgICB0aHJvdHRsaW5nUmF0ZUxpbWl0OiA1MDAsXG4gICAgICB0aHJvdHRsaW5nQnVyc3RMaW1pdDogMTAwMCxcbiAgICAgIGNhY2hlS2V5VHRsOiA2MDAsIC8vIDEwIG1pbnV0ZXNcbiAgICB9LFxuICAgIHMzOiB7XG4gICAgICBsaWZlY3ljbGVIb3VyczogMSxcbiAgICAgIGZhaWxzYWZlSG91cnM6IDI0LFxuICAgIH0sXG4gICAgc2VjdXJpdHk6IHtcbiAgICAgIGp3dEV4cGlyYXRpb25Ib3VyczogMSxcbiAgICAgIG1heFJldHJ5QXR0ZW1wdHM6IDMsXG4gICAgICByYXRlTGltaXRQZXJNaW51dGU6IDIwMCxcbiAgICB9LFxuICB9LFxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVudmlyb25tZW50Q29uZmlnKGVudmlyb25tZW50OiBzdHJpbmcpOiBFbnZpcm9ubWVudENvbmZpZyB7XG4gIGNvbnN0IGNvbmZpZyA9IGVudmlyb25tZW50c1tlbnZpcm9ubWVudF07XG4gIGlmICghY29uZmlnKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGVudmlyb25tZW50OiAke2Vudmlyb25tZW50fS4gQXZhaWxhYmxlOiAke09iamVjdC5rZXlzKGVudmlyb25tZW50cykuam9pbignLCAnKX1gKTtcbiAgfVxuICByZXR1cm4gY29uZmlnO1xufSJdfQ==