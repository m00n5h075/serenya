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
    
    // Handle force drop and recreate
    if (event.dropAndRecreate || event.force) {
      console.log('FORCE MODE: Dropping all Serenya schema objects to force complete re-initialization...');
      
      // Drop all tables first (in dependency order)
      const tables = [
        'processing_job_events', 'processing_jobs', 'biometric_registrations', 
        'user_sessions', 'user_devices', 'payments', 'subscriptions', 
        'subscription_tiers', 'chat_options', 'consent_records', 'users', 'schema_versions'
      ];
      
      for (const table of tables) {
        try {
          await client.query('DROP TABLE IF EXISTS ' + table + ' CASCADE');
          console.log(`✓ Dropped table: ${table}`);
        } catch (error) {
          console.log(`ⓘ Table ${table} did not exist or could not be dropped:`, error.message);
        }
      }
      
      // Drop all ENUM types
      const enumTypes = [
        'auth_provider_type', 'account_status_type', 'consent_type', 
        'subscription_status_type', 'subscription_type', 'payment_provider_type',
        'payment_status_type', 'content_type', 'chat_category_type',
        'device_status_type', 'biometric_type', 'session_status_type',
        'processing_status', 'document_file_type'
      ];
      
      for (const enumType of enumTypes) {
        try {
          await client.query('DROP TYPE IF EXISTS ' + enumType + ' CASCADE');
          console.log(`✓ Dropped ENUM type: ${enumType}`);
        } catch (error) {
          console.log(`ⓘ ENUM type ${enumType} did not exist:`, error.message);
        }
      }
      
      console.log('✅ Force cleanup completed');
    }
    
    // Check if schema is already initialized
    const versionCheck = await client.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'schema_versions')"
    );
    
    const schemaExists = versionCheck.rows[0].exists;
    
    if (!schemaExists) {
      console.log('Schema not found, initializing database...');
      
      // Create the complete database schema from migration file
      console.log('Creating complete database schema from migration file...');
      await createCompleteSchemaFromMigration(client);
      console.log('✅ Complete database schema created successfully');
      
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
 * Create the complete database schema by loading the full migration file
 */
async function createCompleteSchemaFromMigration(client) {
  console.log('Loading complete schema from migration file...');
  
  try {
    // Enable pgcrypto extension first
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    console.log('✅ pgcrypto extension enabled');
    
    // Load the complete schema SQL from the migration file
    const migrationPath = path.join(__dirname, 'migrations/001_complete_core_schema.sql');
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const coreSchemaSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('✅ Migration file loaded, executing complete schema...');
    
    // Execute the complete schema in a single transaction
    await executeMultiStatementSQL(client, coreSchemaSQL, 'Core Schema Migration 001');
    
    console.log('✅ Complete database schema created successfully');
    
  } catch (error) {
    console.error('❌ Schema creation failed:', error.message);
    throw error;
  }
}

/**
 * Execute multi-statement SQL by properly parsing PostgreSQL statements
 */
async function executeMultiStatementSQL(client, sql, migrationName) {
  console.log(`Executing ${migrationName} migration...`);
  
  // Parse SQL statements properly handling PostgreSQL syntax
  const statements = parsePostgreSQLStatements(sql);
    
  console.log(`Found ${statements.length} SQL statements to execute`);
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    console.log(`Executing statement ${i + 1}/${statements.length}...`);
    console.log('Statement preview:', statement.substring(0, 100) + '...');
    
    try {
      await client.query(statement);
      console.log(`✓ Statement ${i + 1} completed`);
    } catch (error) {
      console.error(`✗ Statement ${i + 1} failed:`, error.message);
      console.error('Failed statement:', statement.substring(0, 300) + '...');
      throw error;
    }
  }
  
  console.log(`${migrationName} migration completed successfully`);
}

/**
 * Parse PostgreSQL statements properly handling dollar-quoted strings and complex syntax
 */
function parsePostgreSQLStatements(sql) {
  const statements = [];
  let currentStatement = '';
  let inDollarQuote = false;
  let dollarTag = '';
  
  const lines = sql.split('\n');
  
  for (let line of lines) {
    // Skip comment lines
    if (line.trim().startsWith('--')) {
      continue;
    }
    
    // Handle dollar-quoted strings
    if (!inDollarQuote) {
      // Look for start of dollar quote
      const dollarMatch = line.match(/\$([^$]*)\$/);
      if (dollarMatch) {
        inDollarQuote = true;
        dollarTag = dollarMatch[0];
      }
    } else {
      // Look for end of dollar quote
      if (line.includes(dollarTag)) {
        inDollarQuote = false;
        dollarTag = '';
      }
    }
    
    currentStatement += line + '\n';
    
    // If we find a semicolon and we're not in a dollar quote, end the statement
    if (!inDollarQuote && line.trim().endsWith(';')) {
      const statement = currentStatement.trim();
      if (statement && statement !== ';') {
        statements.push(statement);
      }
      currentStatement = '';
    }
  }
  
  // Add any remaining statement
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }
  
  return statements;
}