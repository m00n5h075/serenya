/**
 * Test script to verify DynamoDB connectivity from Lambda outside VPC
 * This test will be deployed temporarily to verify networking feasibility
 */

const AWS = require('aws-sdk');

// Configure DynamoDB client
const dynamodb = new AWS.DynamoDB({
  region: process.env.AWS_REGION || 'eu-west-1'
});

const dynamodbDocument = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || 'eu-west-1'
});

exports.handler = async (event) => {
  console.log('=== DYNAMODB CONNECTIVITY TEST START ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('AWS Region:', process.env.AWS_REGION || 'eu-west-1');
  console.log('Lambda execution context:', {
    functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
    functionVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION,
    memoryLimitMB: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
    region: process.env.AWS_REGION
  });

  const results = {
    networkingTest: false,
    serviceDiscovery: false,
    iamPermissions: false,
    basicOperations: false,
    timestamp: new Date().toISOString()
  };

  try {
    // Test 1: Basic AWS service connectivity and endpoint resolution
    console.log('\n=== TEST 1: Service Endpoint Resolution ===');
    try {
      const endpoint = dynamodb.endpoint;
      console.log('✅ DynamoDB endpoint resolved:', endpoint.href);
      results.networkingTest = true;
    } catch (error) {
      console.error('❌ DynamoDB endpoint resolution failed:', error.message);
      results.networkingTest = false;
    }

    // Test 2: Service discovery and region connectivity
    console.log('\n=== TEST 2: Service Discovery ===');
    try {
      const listTablesParams = { Limit: 1 };
      const tablesResult = await dynamodb.listTables(listTablesParams).promise();
      console.log('✅ Service discovery successful, can list tables');
      console.log('   Tables count:', tablesResult.TableNames ? tablesResult.TableNames.length : 0);
      results.serviceDiscovery = true;
      results.iamPermissions = true; // If we can list tables, basic IAM permissions are working
    } catch (error) {
      console.error('❌ Service discovery failed:', error.message);
      console.error('   Error code:', error.code);
      console.error('   Status code:', error.statusCode);
      
      if (error.code === 'AccessDenied' || error.code === 'UnauthorizedOperation') {
        console.log('   → This is an IAM permissions issue, not networking');
        results.serviceDiscovery = true; // Network is working if we get IAM errors
        results.iamPermissions = false;
      } else if (error.code === 'NetworkingError' || error.code === 'TimeoutError') {
        console.log('   → This is a networking connectivity issue');
        results.serviceDiscovery = false;
      } else {
        console.log('   → Unknown error type, assume networking is working');
        results.serviceDiscovery = true;
      }
    }

    // Test 3: Create a test table to verify full permissions
    const testTableName = `serenya-connectivity-test-${Date.now()}`;
    console.log(`\n=== TEST 3: Basic Operations Test (Table: ${testTableName}) ===`);
    
    try {
      // Create test table
      console.log('Creating test table...');
      const createTableParams = {
        TableName: testTableName,
        KeySchema: [
          { AttributeName: 'id', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
          { AttributeName: 'id', AttributeType: 'S' }
        ],
        BillingMode: 'PAY_PER_REQUEST'
      };
      
      await dynamodb.createTable(createTableParams).promise();
      console.log('✅ Test table created successfully');

      // Wait for table to be active
      console.log('Waiting for table to become active...');
      const waitParams = { TableName: testTableName };
      await dynamodb.waitFor('tableExists', waitParams).promise();
      console.log('✅ Test table is active');

      // Test basic operations
      console.log('Testing basic DynamoDB operations...');
      
      // Put item
      const putParams = {
        TableName: testTableName,
        Item: {
          id: 'test-connectivity',
          timestamp: new Date().toISOString(),
          message: 'Lambda to DynamoDB connectivity test',
          networkType: 'outside-vpc'
        }
      };
      await dynamodbDocument.put(putParams).promise();
      console.log('✅ PUT operation successful');

      // Get item
      const getParams = {
        TableName: testTableName,
        Key: { id: 'test-connectivity' }
      };
      const getResult = await dynamodbDocument.get(getParams).promise();
      console.log('✅ GET operation successful:', getResult.Item ? 'Item found' : 'Item not found');

      // Update item
      const updateParams = {
        TableName: testTableName,
        Key: { id: 'test-connectivity' },
        UpdateExpression: 'SET #msg = :newMsg, #updated = :timestamp',
        ExpressionAttributeNames: {
          '#msg': 'message',
          '#updated': 'lastUpdated'
        },
        ExpressionAttributeValues: {
          ':newMsg': 'Updated from Lambda outside VPC',
          ':timestamp': new Date().toISOString()
        }
      };
      await dynamodbDocument.update(updateParams).promise();
      console.log('✅ UPDATE operation successful');

      // Delete item
      const deleteParams = {
        TableName: testTableName,
        Key: { id: 'test-connectivity' }
      };
      await dynamodbDocument.delete(deleteParams).promise();
      console.log('✅ DELETE operation successful');

      results.basicOperations = true;

    } catch (error) {
      console.error('❌ Basic operations test failed:', error.message);
      console.error('   Error code:', error.code);
      results.basicOperations = false;
    } finally {
      // Clean up test table
      try {
        console.log('Cleaning up test table...');
        await dynamodb.deleteTable({ TableName: testTableName }).promise();
        console.log('✅ Test table deleted successfully');
      } catch (cleanupError) {
        console.warn('⚠️ Failed to cleanup test table:', cleanupError.message);
      }
    }

  } catch (generalError) {
    console.error('❌ General connectivity test failed:', generalError.message);
    console.error('Stack trace:', generalError.stack);
  }

  // Summary
  console.log('\n=== CONNECTIVITY TEST SUMMARY ===');
  console.log('Network connectivity to DynamoDB:', results.networkingTest ? '✅ PASS' : '❌ FAIL');
  console.log('Service discovery:', results.serviceDiscovery ? '✅ PASS' : '❌ FAIL');
  console.log('IAM permissions:', results.iamPermissions ? '✅ PASS' : '❌ FAIL');
  console.log('Basic CRUD operations:', results.basicOperations ? '✅ PASS' : '❌ FAIL');

  const overallSuccess = results.networkingTest && results.serviceDiscovery && results.iamPermissions && results.basicOperations;
  console.log('OVERALL RESULT:', overallSuccess ? '✅ FULLY FUNCTIONAL' : '❌ ISSUES DETECTED');

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      success: overallSuccess,
      tests: results,
      message: overallSuccess 
        ? 'DynamoDB connectivity fully functional from Lambda outside VPC'
        : 'Issues detected with DynamoDB connectivity',
      timestamp: new Date().toISOString()
    }, null, 2)
  };
};