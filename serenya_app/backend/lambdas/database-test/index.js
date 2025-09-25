const { UserService } = require('../auth/database');

exports.handler = async (event) => {
  try {
    console.log('Testing database connection...');
    
    const testResult = await UserService.testConnection();
    
    console.log('Database test result:', JSON.stringify(testResult, null, 2));
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: testResult
      }, null, 2)
    };
    
  } catch (error) {
    console.error('Database test error:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      }, null, 2)
    };
  }
};