const AWS = require('aws-sdk');
const { DynamoDBUserService } = require('../shared/dynamodb-service');
const { sanitizeError } = require('../shared/utils');

/**
 * DynamoDB Database Test Function
 * Comprehensive tests for DynamoDB connectivity, schema validation, and performance
 */
exports.handler = async (event) => {
  const startTime = Date.now();
  console.log('Starting DynamoDB database tests...');
  
  try {
    const testResults = {
      timestamp: new Date().toISOString(),
      environment: process.env.ENVIRONMENT || 'dev',
      tests: [],
      summary: {
        total_tests: 0,
        passed: 0,
        failed: 0,
        total_duration_ms: 0
      }
    };

    // Initialize services
    const userService = new DynamoDBUserService();
    const dynamodb = new AWS.DynamoDB();
    const docClient = new AWS.DynamoDB.DocumentClient();
    
    // Test 1: DynamoDB Service Connectivity
    await runTest(testResults, 'DynamoDB Service Connectivity', async () => {
      const tableName = process.env.DYNAMO_TABLE_NAME || 'serenya-user-profiles';
      
      // Check if table exists and is accessible
      const tableDescription = await dynamodb.describeTable({
        TableName: tableName
      }).promise();
      
      return {
        table_name: tableName,
        table_status: tableDescription.Table.TableStatus,
        item_count: tableDescription.Table.ItemCount,
        table_size_bytes: tableDescription.Table.TableSizeBytes,
        read_capacity: tableDescription.Table.BillingModeSummary?.BillingMode || 'Unknown',
        gsi_count: tableDescription.Table.GlobalSecondaryIndexes?.length || 0
      };
    });

    // Test 2: Schema Validation
    await runTest(testResults, 'Schema Validation', async () => {
      const tableName = process.env.DYNAMO_TABLE_NAME || 'serenya-user-profiles';
      const tableDescription = await dynamodb.describeTable({
        TableName: tableName
      }).promise();
      
      const table = tableDescription.Table;
      const schema = {
        partition_key: table.KeySchema.find(k => k.KeyType === 'HASH')?.AttributeName,
        sort_key: table.KeySchema.find(k => k.KeyType === 'RANGE')?.AttributeName,
        global_secondary_indexes: table.GlobalSecondaryIndexes?.map(gsi => ({
          name: gsi.IndexName,
          keys: gsi.KeySchema.map(k => `${k.AttributeName} (${k.KeyType})`)
        })) || [],
        attribute_definitions: table.AttributeDefinitions.map(attr => ({
          name: attr.AttributeName,
          type: attr.AttributeType
        }))
      };
      
      // Validate expected schema structure
      const expectedGSIs = ['GSI1', 'GSI2'];
      const missingGSIs = expectedGSIs.filter(gsi => 
        !schema.global_secondary_indexes.some(g => g.name === gsi)
      );
      
      return {
        schema_valid: missingGSIs.length === 0,
        schema_details: schema,
        missing_gsis: missingGSIs,
        partition_key_correct: schema.partition_key === 'PK',
        sort_key_correct: schema.sort_key === 'SK'
      };
    });

    // Test 3: Read/Write Performance Test
    await runTest(testResults, 'Read/Write Performance', async () => {
      const testUserId = `test-user-${Date.now()}`;
      const testUserData = {
        id: testUserId,
        external_id: 'test-external-123',
        auth_provider: 'google',
        email: 'test@example.com',
        name: 'Test User',
        given_name: 'Test',
        family_name: 'User',
        email_verified: true,
        source_ip: '127.0.0.1',
        user_agent: 'DynamoDB-Test/1.0'
      };

      // Measure write performance
      const writeStart = Date.now();
      await userService.createUserProfile(testUserData);
      const writeTime = Date.now() - writeStart;

      // Measure read performance
      const readStart = Date.now();
      const retrievedUser = await userService.getUserProfile(testUserId);
      const readTime = Date.now() - readStart;

      // Cleanup test user
      await docClient.delete({
        TableName: process.env.DYNAMO_TABLE_NAME || 'serenya-user-profiles',
        Key: {
          PK: `USER#${testUserId}`,
          SK: 'PROFILE'
        }
      }).promise();

      return {
        write_time_ms: writeTime,
        read_time_ms: readTime,
        write_success: true,
        read_success: !!retrievedUser,
        user_data_integrity: retrievedUser?.email === testUserData.email,
        cleanup_success: true
      };
    });

    // Test 4: GSI Query Performance
    await runTest(testResults, 'GSI Query Performance', async () => {
      const testUserId = `gsi-test-user-${Date.now()}`;
      const testEmail = `gsitest${Date.now()}@example.com`;
      const testExternalId = `gsi-external-${Date.now()}`;
      
      const testUserData = {
        id: testUserId,
        external_id: testExternalId,
        auth_provider: 'google',
        email: testEmail,
        name: 'GSI Test User',
        source_ip: '127.0.0.1',
        user_agent: 'DynamoDB-GSI-Test/1.0'
      };

      // Create test user
      await userService.createUserProfile(testUserData);

      // Test GSI1 (email lookup)
      const gsi1Start = Date.now();
      const emailHash = await userService.generateEmailHash(testEmail);
      const userByEmail = await userService.findByEmailHash(emailHash);
      const gsi1Time = Date.now() - gsi1Start;

      // Test GSI2 (external ID lookup)
      const gsi2Start = Date.now();
      const userByExternal = await userService.findByExternalId(testExternalId, 'google');
      const gsi2Time = Date.now() - gsi2Start;

      // Cleanup
      await docClient.delete({
        TableName: process.env.DYNAMO_TABLE_NAME || 'serenya-user-profiles',
        Key: {
          PK: `USER#${testUserId}`,
          SK: 'PROFILE'
        }
      }).promise();

      return {
        gsi1_query_time_ms: gsi1Time,
        gsi2_query_time_ms: gsi2Time,
        email_lookup_success: userByEmail?.id === testUserId,
        external_lookup_success: userByExternal?.id === testUserId,
        gsi_performance_acceptable: gsi1Time < 100 && gsi2Time < 100
      };
    });

    // Test 5: Encryption/Decryption Test
    await runTest(testResults, 'Encryption/Decryption', async () => {
      const testUserId = `encrypt-test-user-${Date.now()}`;
      const sensitiveData = {
        id: testUserId,
        external_id: 'encrypt-test-123',
        auth_provider: 'google',
        email: 'encryption.test@example.com',
        name: 'Encryption Test User',
        given_name: 'Encryption',
        family_name: 'User',
        source_ip: '127.0.0.1',
        user_agent: 'Encryption-Test/1.0'
      };

      // Create user (should encrypt PII)
      await userService.createUserProfile(sensitiveData);
      
      // Get user (should decrypt PII)
      const decryptedUser = await userService.getUserProfile(testUserId);
      
      // Verify encryption by checking raw DynamoDB item
      const rawItem = await docClient.get({
        TableName: process.env.DYNAMO_TABLE_NAME || 'serenya-user-profiles',
        Key: {
          PK: `USER#${testUserId}`,
          SK: 'PROFILE'
        }
      }).promise();

      // Cleanup
      await docClient.delete({
        TableName: process.env.DYNAMO_TABLE_NAME || 'serenya-user-profiles',
        Key: {
          PK: `USER#${testUserId}`,
          SK: 'PROFILE'
        }
      }).promise();

      return {
        encryption_working: rawItem.Item?.email !== sensitiveData.email, // Should be encrypted in storage
        decryption_working: decryptedUser?.email === sensitiveData.email, // Should be decrypted when retrieved
        pii_fields_encrypted: ['email', 'name', 'given_name', 'family_name'].every(
          field => rawItem.Item?.[field] !== sensitiveData[field]
        ),
        data_integrity_maintained: decryptedUser?.name === sensitiveData.name
      };
    });

    // Test 6: Subscription Management Test
    await runTest(testResults, 'Subscription Management', async () => {
      const testUserId = `sub-test-user-${Date.now()}`;
      
      // Create user with default free subscription
      await userService.createUserProfile({
        id: testUserId,
        external_id: 'sub-test-123',
        auth_provider: 'google',
        email: 'sub.test@example.com',
        name: 'Subscription Test',
        source_ip: '127.0.0.1',
        user_agent: 'Sub-Test/1.0'
      });

      // Test getting active subscription
      const activeSubscription = await userService.getUserActiveSubscription(testUserId);
      
      // Test updating subscription
      const newSubscription = {
        id: `premium-${testUserId}`,
        subscription_type: 'premium',
        subscription_status: 'active',
        provider: 'stripe',
        external_subscription_id: 'sub_test123',
        start_date: Date.now(),
        end_date: Date.now() + (365 * 24 * 60 * 60 * 1000)
      };
      
      const updatedSub = await userService.updateSubscription(testUserId, newSubscription);

      // Cleanup
      await docClient.delete({
        TableName: process.env.DYNAMO_TABLE_NAME || 'serenya-user-profiles',
        Key: {
          PK: `USER#${testUserId}`,
          SK: 'PROFILE'
        }
      }).promise();

      return {
        default_subscription_created: activeSubscription?.type === 'free',
        subscription_update_success: updatedSub?.type === 'premium',
        subscription_active: activeSubscription?.status === 'active',
        subscription_expiry_valid: activeSubscription?.end_date > Date.now()
      };
    });

    // Calculate final summary
    const totalDuration = Date.now() - startTime;
    testResults.summary.total_duration_ms = totalDuration;
    
    const allTestsPassed = testResults.summary.failed === 0;
    const avgResponseTime = testResults.tests.reduce((sum, test) => sum + test.duration_ms, 0) / testResults.tests.length;

    console.log(`DynamoDB tests completed: ${testResults.summary.passed}/${testResults.summary.total_tests} passed in ${totalDuration}ms`);

    return {
      statusCode: allTestsPassed ? 200 : 500,
      body: JSON.stringify({
        success: allTestsPassed,
        message: `DynamoDB database tests ${allTestsPassed ? 'passed' : 'failed'}`,
        performance: {
          total_duration_ms: totalDuration,
          average_test_duration_ms: Math.round(avgResponseTime),
          performance_acceptable: avgResponseTime < 200
        },
        results: testResults
      }, null, 2)
    };

  } catch (error) {
    console.error('Database test error:', sanitizeError(error));
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        duration_ms: Date.now() - startTime
      }, null, 2)
    };
  }
};

/**
 * Helper function to run individual tests with timing and error handling
 */
async function runTest(testResults, testName, testFunction) {
  const testStart = Date.now();
  let testResult;
  
  try {
    console.log(`Running test: ${testName}`);
    const result = await testFunction();
    const duration = Date.now() - testStart;
    
    testResult = {
      test_name: testName,
      status: 'PASSED',
      duration_ms: duration,
      result: result
    };
    
    testResults.summary.passed++;
    console.log(`✓ ${testName} passed (${duration}ms)`);
    
  } catch (error) {
    const duration = Date.now() - testStart;
    
    testResult = {
      test_name: testName,
      status: 'FAILED',
      duration_ms: duration,
      error: sanitizeError(error),
      error_message: error.message
    };
    
    testResults.summary.failed++;
    console.error(`✗ ${testName} failed (${duration}ms):`, error.message);
  }
  
  testResults.tests.push(testResult);
  testResults.summary.total_tests++;
}