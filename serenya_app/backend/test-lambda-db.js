const { UserService } = require('./lambdas/auth/database');

exports.handler = async (event) => {
  try {
    console.log('Testing database connection...');
    
    // Try to access the database through UserService
    console.log('Attempting to query users table...');
    
    // This will test if the database connection works and if tables exist
    const result = await UserService.testConnection();
    
    console.log('Database test result:', result);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Database test completed',
        result: result
      })
    };
    
  } catch (error) {
    console.error('Database test error:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Database test failed',
        error: error.message,
        stack: error.stack
      })
    };
  }
};