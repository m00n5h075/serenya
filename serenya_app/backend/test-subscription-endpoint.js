const { handler } = require('./lambdas/subscriptions/subscriptions');

// Mock event for testing the subscription endpoint
const testEvent = {
  httpMethod: 'GET',
  resource: '/subscriptions/current',
  requestContext: {
    authorizer: {
      userId: 'test-user-id-123'
    }
  },
  headers: {
    'Authorization': 'Bearer test-jwt-token'
  },
  path: '/subscriptions/current'
};

// Mock environment variables
process.env.REGION = 'eu-west-1';
process.env.ENVIRONMENT = 'dev';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'serenya';
process.env.ENABLE_DETAILED_LOGGING = 'true';

async function testSubscriptionEndpoint() {
  console.log('Testing subscription endpoint...');
  console.log('Test event:', JSON.stringify(testEvent, null, 2));
  
  try {
    const result = await handler(testEvent);
    console.log('\n=== RESULT ===');
    console.log('Status Code:', result.statusCode);
    console.log('Headers:', JSON.stringify(result.headers, null, 2));
    console.log('Body:', result.body);
    
    if (result.body) {
      const parsedBody = JSON.parse(result.body);
      console.log('Parsed Body:', JSON.stringify(parsedBody, null, 2));
    }
    
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

// Only run if called directly
if (require.main === module) {
  testSubscriptionEndpoint();
}

module.exports = { testSubscriptionEndpoint };