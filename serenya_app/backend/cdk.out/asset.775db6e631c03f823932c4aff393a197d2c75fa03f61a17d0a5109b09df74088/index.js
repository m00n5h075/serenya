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
      
      // Check for specific critical tables
      const criticalTables = [
        'users', 'user_devices', 'user_sessions', 'consent_records',
        'biometric_registrations', 'subscriptions', 'payments', 
        'processing_jobs', 'schema_versions'
      ];
      
      const existingTables = tablesResult.rows.map(r => r.table_name);
      const missingTables = criticalTables.filter(table => !existingTables.includes(table));
      
      if (missingTables.length > 0) {
        console.log('❌ MISSING CRITICAL TABLES:', missingTables);
      } else {
        console.log('✅ ALL CRITICAL TABLES PRESENT');
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Table check completed',
          tableCount: tablesResult.rows.length,
          tables: existingTables,
          criticalTablesMissing: missingTables,
          allCriticalTablesPresent: missingTables.length === 0,
          timestamp: new Date().toISOString()
        })
      };
    }
    
    // If addSessionColumns parameter is passed, add missing columns to user_sessions
    if (event.addSessionColumns) {
      console.log('ADDING SESSION COLUMNS - Adding user_agent and source_ip to user_sessions...');
      
      try {
        // Add user_agent column if it doesn't exist
        await client.query(`
          ALTER TABLE user_sessions 
          ADD COLUMN IF NOT EXISTS user_agent TEXT;
        `);
        console.log('✅ user_agent column added successfully');
        
        // Add source_ip column if it doesn't exist
        await client.query(`
          ALTER TABLE user_sessions 
          ADD COLUMN IF NOT EXISTS source_ip INET;
        `);
        console.log('✅ source_ip column added successfully');
        
        // Create indexes for the new columns
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_user_sessions_source_ip ON user_sessions(source_ip, created_at);
        `);
        console.log('✅ source_ip index created successfully');
        
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_user_sessions_user_agent ON user_sessions(user_agent);
        `);
        console.log('✅ user_agent index created successfully');
        
        console.log('🎉 ALL SESSION COLUMNS ADDED SUCCESSFULLY');
        
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Session columns added successfully',
            columnsAdded: ['user_agent', 'source_ip'],
            indexesCreated: ['idx_user_sessions_source_ip', 'idx_user_sessions_user_agent'],
            timestamp: new Date().toISOString()
          })
        };
        
      } catch (error) {
        console.error('❌ Failed to add session columns:', error);
        throw error;
      }
    }
    
    // If getSchema parameter is passed, get detailed schema information
    if (event.getSchema) {
      console.log('GETTING SCHEMA - Retrieving detailed table schemas...');
      
      // Get all tables
      const tablesResult = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name
      `);
      
      const schema = {};
      
      // Get columns for each table
      for (const table of tablesResult.rows) {
        const tableName = table.table_name;
        const columnsResult = await client.query(`
          SELECT 
            column_name,
            data_type,
            character_maximum_length,
            is_nullable,
            column_default
          FROM information_schema.columns 
          WHERE table_name = $1 AND table_schema = 'public'
          ORDER BY ordinal_position
        `, [tableName]);
        
        schema[tableName] = columnsResult.rows.map(col => ({
          name: col.column_name,
          type: col.data_type,
          maxLength: col.character_maximum_length,
          nullable: col.is_nullable === 'YES',
          default: col.column_default
        }));
      }
      
      console.log('SCHEMA:', JSON.stringify(schema, null, 2));
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Schema retrieved successfully',
          schema: schema,
          timestamp: new Date().toISOString()
        })
      };
    }
    
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
    
    // If getTableCounts parameter is passed, get row counts for key tables
    if (event.getTableCounts) {
      console.log('GETTING TABLE COUNTS - Counting rows in users and subscriptions tables...');
      
      try {
        const userCountResult = await client.query('SELECT COUNT(*) as count FROM users');
        const subscriptionCountResult = await client.query('SELECT COUNT(*) as count FROM subscriptions');
        
        const userCount = parseInt(userCountResult.rows[0].count);
        const subscriptionCount = parseInt(subscriptionCountResult.rows[0].count);
        
        console.log(`Users: ${userCount}, Subscriptions: ${subscriptionCount}`);
        
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Table counts retrieved successfully',
            userCount,
            subscriptionCount,
            timestamp: new Date().toISOString()
          })
        };
        
      } catch (error) {
        console.error('❌ Failed to get table counts:', error);
        throw error;
      }
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