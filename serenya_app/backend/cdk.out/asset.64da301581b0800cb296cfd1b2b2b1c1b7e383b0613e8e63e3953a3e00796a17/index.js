const { Client } = require('pg');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

const secretsManager = new AWS.SecretsManager({
  region: process.env.REGION || 'eu-west-1'
});

/**
 * Database initialization Lambda function
 * Handles schema creation and migrations for PostgreSQL database
 * 
 * MIGRATION STRUCTURE (Consolidated):
 * - Migration 001: Complete core schema (v2.0.0) - All business tables and ENUM types
 * - Migration 002: Audit infrastructure (v2.1.0) - HIPAA/GDPR compliance logging
 * 
 * NOTE: For production deployment, the full SQL content should be loaded from
 * the migration files or bundled with the Lambda. Current implementation includes
 * abbreviated schema for Lambda size constraints.
 */
exports.handler = async (event, context) => {
  console.log('Database initialization started', { event: JSON.stringify(event) });
  
  let client;
  
  try {
    // Get database credentials from Secrets Manager
    const dbSecret = await secretsManager.getSecretValue({
      SecretId: process.env.DB_SECRET_ARN
    }).promise();
    
    const credentials = JSON.parse(dbSecret.SecretString);
    
    // Create PostgreSQL client
    client = new Client({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'serenya',
      user: credentials.username,
      password: credentials.password,
      ssl: {
        rejectUnauthorized: false // Required for RDS
      }
    });
    
    await client.connect();
    console.log('Connected to PostgreSQL database');
    
    // If checkTables parameter is passed, list all tables and return
    if (event.checkTables) {
      console.log('CHECKING TABLES - Listing all tables in database...');
      
      const tablesResult = await client.query(`
        SELECT table_name, table_schema 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name
      `);
      
      console.log('TABLES FOUND:', tablesResult.rows.length);
      tablesResult.rows.forEach(row => {
        console.log(`  - ${row.table_name} (schema: ${row.table_schema})`);
      });
      
      if (tablesResult.rows.length === 0) {
        console.log('❌ NO TABLES FOUND IN PUBLIC SCHEMA');
      }
      
      // Check if users table specifically exists
      const usersCheck = await client.query(`
        SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users' AND table_schema = 'public')
      `);
      console.log('USERS TABLE EXISTS:', usersCheck.rows[0].exists);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Table check completed',
          tableCount: tablesResult.rows.length,
          tables: tablesResult.rows.map(r => r.table_name),
          usersTableExists: usersCheck.rows[0].exists,
          timestamp: new Date().toISOString()
        })
      };
    }
    
    // Check if schema is already initialized
    const versionCheck = await client.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'schema_versions')"
    );
    
    const schemaExists = versionCheck.rows[0].exists;
    
    if (!schemaExists) {
      console.log('Schema not found, initializing database...');
      
      // Execute the consolidated core schema migration (v2.0.0)
      console.log('Running migration 001: Complete core schema');
      const coreSchemaSQL = await getCoreSchemaSQL();
      await client.query(coreSchemaSQL);
      console.log('✅ Migration 001 (Core Schema v2.0.0) completed');
      
      // Execute the audit infrastructure migration (v2.1.0)
      console.log('Running migration 002: Audit infrastructure');
      const auditSchemaSQL = await getAuditSchemaSQL();
      await client.query(auditSchemaSQL);
      console.log('✅ Migration 002 (Audit Infrastructure v2.1.0) completed');
      
      console.log('Database schema initialized successfully with 2 consolidated migrations');
      
      // Update the application user password with a secure one from secrets
      const appPassword = await generateSecurePassword();
      await client.query('ALTER USER serenya_app PASSWORD $1', [appPassword]);
      
      // Store the app password in a separate secret
      await secretsManager.createSecret({
        Name: `serenya/${process.env.ENVIRONMENT}/app-database`,
        Description: 'Application database user credentials',
        SecretString: JSON.stringify({
          username: 'serenya_app',
          password: appPassword,
          host: process.env.DB_HOST,
          port: process.env.DB_PORT,
          database: process.env.DB_NAME
        })
      }).promise();
      
      console.log('Application database credentials created');
      
    } else {
      console.log('Database schema already exists, checking for pending migrations...');
      
      // Check current schema version
      const currentVersion = await client.query(
        'SELECT version FROM schema_versions ORDER BY applied_at DESC LIMIT 1'
      );
      
      console.log('Current schema version:', currentVersion.rows[0]?.version || 'unknown');
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Database initialization completed successfully',
        schemaExists,
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('Database initialization failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Database initialization failed',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
    
  } finally {
    if (client) {
      await client.end();
      console.log('Database connection closed');
    }
  }
};

/**
 * Generate a secure random password for the application database user
 */
async function generateSecurePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  
  // Generate 32 character password
  for (let i = 0; i < 32; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return password;
}

/**
 * Get the core schema SQL (Migration 001 - v2.0.0)
 * Loads the full SQL from 001_complete_core_schema.sql
 */
async function getCoreSchemaSQL() {
  const sqlPath = path.join(__dirname, 'migrations/001_complete_core_schema.sql');
  try {
    return fs.readFileSync(sqlPath, 'utf8');
  } catch (error) {
    console.error('CRITICAL ERROR: Could not load migration file:', error);
    throw new Error(`Migration file not found: ${sqlPath}. Database initialization cannot proceed without the complete schema.`);
  }
}

/**
 * Get the audit infrastructure SQL (Migration 002 - v2.1.0)
 * Loads from 002_audit_infrastructure.sql
 */
async function getAuditSchemaSQL() {
  const sqlPath = path.join(__dirname, 'migrations/002_audit_infrastructure.sql');
  try {
    return fs.readFileSync(sqlPath, 'utf8');
  } catch (error) {
    console.error('CRITICAL ERROR: Could not load audit migration file:', error);
    throw new Error(`Audit migration file not found: ${sqlPath}. Database initialization cannot proceed without the complete audit schema.`);
  }
}