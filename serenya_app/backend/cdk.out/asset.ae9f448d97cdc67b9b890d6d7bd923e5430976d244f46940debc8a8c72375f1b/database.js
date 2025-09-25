const { Client, Pool } = require('pg');
const AWS = require('aws-sdk');
const { encryptFields, decryptFields, hashEmail, hashForIndex } = require('./encryption');

const secretsManager = new AWS.SecretsManager({
  region: process.env.REGION || 'eu-west-1'
});

// Connection pool for reuse across Lambda invocations
let connectionPool = null;

/**
 * Get database credentials from AWS Secrets Manager
 */
async function getDatabaseCredentials() {
  try {
    // First try to get application user credentials
    const appSecretName = `serenya/${process.env.ENVIRONMENT}/app-database`;
    
    try {
      const appSecret = await secretsManager.getSecretValue({
        SecretId: appSecretName
      }).promise();
      
      return JSON.parse(appSecret.SecretString);
    } catch (appError) {
      console.log('App database secret not found, falling back to admin credentials');
      
      // Fallback to admin credentials
      const adminSecret = await secretsManager.getSecretValue({
        SecretId: process.env.DB_SECRET_ARN
      }).promise();
      
      return JSON.parse(adminSecret.SecretString);
    }
  } catch (error) {
    console.error('Failed to retrieve database credentials:', error);
    throw new Error('Database credentials not available');
  }
}

/**
 * Get a connection pool for database operations
 */
async function getConnectionPool() {
  if (!connectionPool) {
    const credentials = await getDatabaseCredentials();
    
    connectionPool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'serenya',
      user: credentials.username,
      password: credentials.password,
      ssl: {
        rejectUnauthorized: false // Required for RDS
      },
      max: 5, // Maximum connections in pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    // Test the connection
    const client = await connectionPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    console.log('Database connection pool initialized');
  }
  
  return connectionPool;
}

/**
 * Execute a query with automatic connection management
 */
async function query(sql, params = []) {
  const pool = await getConnectionPool();
  const client = await pool.connect();
  
  try {
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Execute multiple queries in a transaction
 */
async function transaction(queries) {
  const pool = await getConnectionPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const results = [];
    for (const { sql, params = [] } of queries) {
      const result = await client.query(sql, params);
      results.push(result);
    }
    
    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * User management functions with PII encryption
 */
const UserService = {
  async testConnection() {
    try {
      // Test basic connection
      const timeResult = await query('SELECT NOW() as current_time');
      
      // List all tables
      const tablesResult = await query(`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename
      `);
      
      const tables = tablesResult.rows.map(row => row.tablename);
      
      // Check if users table exists and get its structure
      let userTableInfo = null;
      if (tables.includes('users')) {
        const columnsResult = await query(`
          SELECT column_name, data_type, is_nullable, column_default 
          FROM information_schema.columns 
          WHERE table_name = 'users' AND table_schema = 'public'
          ORDER BY ordinal_position
        `);
        
        const countResult = await query('SELECT COUNT(*) as user_count FROM users');
        
        userTableInfo = {
          columns: columnsResult.rows,
          userCount: parseInt(countResult.rows[0].user_count)
        };
      }
      
      return {
        connected: true,
        currentTime: timeResult.rows[0].current_time,
        tablesFound: tables,
        usersTableExists: tables.includes('users'),
        userTableInfo
      };
      
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        errorCode: error.code
      };
    }
  },

  async findByExternalId(externalId, authProvider) {
    const result = await query(
      'SELECT * FROM users WHERE external_id = $1 AND auth_provider = $2',
      [externalId, authProvider]
    );
    
    if (result.rows[0]) {
      // Decrypt PII fields
      return await decryptFields(result.rows[0], ['email', 'name', 'given_name', 'family_name']);
    }
    return result.rows[0];
  },
  
  async findByEmailHash(email) {
    const emailHash = hashEmail(email);
    const result = await query(
      'SELECT * FROM users WHERE email_hash = $1',
      [emailHash]
    );
    
    if (result.rows[0]) {
      // Decrypt PII fields
      return await decryptFields(result.rows[0], ['email', 'name', 'given_name', 'family_name']);
    }
    return result.rows[0];
  },
  
  async create(userData) {
    const {
      externalId,
      authProvider,
      email,
      emailVerified = false,
      name,
      givenName,
      familyName
    } = userData;
    
    console.log('🔐 Starting user PII encryption...');
    
    // Create encryption context for this user
    const encryptionContext = {
      userId: externalId,
      authProvider: authProvider,
      dataType: 'user_pii'
    };
    console.log('🔐 Encryption context:', JSON.stringify(encryptionContext, null, 2));
    console.log('🔐 KMS Key ID:', process.env.KMS_KEY_ID);
    
    // Encrypt PII fields
    console.log('🔐 Encrypting PII fields: email, name, given_name, family_name');
    let encryptedData;
    try {
      encryptedData = await encryptFields(
        { email, name, given_name: givenName, family_name: familyName },
        ['email', 'name', 'given_name', 'family_name'],
        process.env.KMS_KEY_ID,
        encryptionContext
      );
      console.log('✅ PII encryption completed successfully');
    } catch (encryptionError) {
      console.error('❌ CRITICAL: PII encryption failed:', encryptionError);
      console.error('Encryption error details:', encryptionError.message, encryptionError.code, encryptionError.stack);
      console.error('KMS Key ID:', process.env.KMS_KEY_ID);
      console.error('Encryption context:', JSON.stringify(encryptionContext, null, 2));
      throw new Error(`User PII encryption failed: ${encryptionError.message}`);
    }
    
    // Generate searchable hash for email
    console.log('📧 Generating email hash...');
    const emailHash = hashEmail(email);
    console.log('✅ Email hash generated successfully');
    
    console.log('💾 Inserting user into database...');
    const insertParams = [
      externalId, 
      authProvider, 
      encryptedData.email, 
      emailHash,
      emailVerified, 
      encryptedData.name, 
      encryptedData.given_name, 
      encryptedData.family_name
    ];
    console.log('💾 Insert parameters:', JSON.stringify(insertParams.map((p, i) => 
      i === 2 || i === 5 || i === 6 || i === 7 ? '[ENCRYPTED]' : p
    ), null, 2));
    
    let result;
    try {
      result = await query(`
        INSERT INTO users (external_id, auth_provider, email, email_hash, email_verified, name, given_name, family_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, insertParams);
      console.log('✅ User inserted into database successfully');
    } catch (dbInsertError) {
      console.error('❌ CRITICAL: User database insertion failed:', dbInsertError);
      console.error('DB Insert error details:', dbInsertError.message, dbInsertError.code, dbInsertError.stack);
      console.error('SQL constraint violation details:', dbInsertError.constraint, dbInsertError.detail);
      console.error('External ID:', externalId);
      console.error('Auth Provider:', authProvider);
      console.error('Email Hash:', emailHash);
      throw new Error(`User database insertion failed: ${dbInsertError.message}`);
    }
    
    // Decrypt the returned data for the response
    if (result.rows[0]) {
      return await decryptFields(result.rows[0], ['email', 'name', 'given_name', 'family_name']);
    }
    return result.rows[0];
  },
  
  async update(userId, updateData) {
    const fieldsToUpdate = [];
    const values = [];
    let paramIndex = 1;
    
    // Handle PII fields that need encryption
    const piiFields = ['email', 'name', 'given_name', 'family_name'];
    const encryptionContext = {
      userId: userId,
      dataType: 'user_pii'
    };
    
    for (const [key, value] of Object.entries(updateData)) {
      if (piiFields.includes(key) && value !== undefined) {
        const encrypted = await encryptFields(
          { [key]: value },
          [key],
          process.env.KMS_KEY_ID,
          encryptionContext
        );
        fieldsToUpdate.push(`${key} = $${paramIndex}`);
        values.push(encrypted[key]);
        paramIndex++;
        
        // Handle email hash update
        if (key === 'email') {
          fieldsToUpdate.push(`email_hash = $${paramIndex}`);
          values.push(hashEmail(value));
          paramIndex++;
        }
      } else if (!piiFields.includes(key) && value !== undefined) {
        fieldsToUpdate.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    
    if (fieldsToUpdate.length === 0) {
      return await this.findById(userId);
    }
    
    values.push(userId);
    const result = await query(`
      UPDATE users 
      SET ${fieldsToUpdate.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    if (result.rows[0]) {
      return await decryptFields(result.rows[0], ['email', 'name', 'given_name', 'family_name']);
    }
    return result.rows[0];
  },
  
  async updateLastLogin(userId) {
    await query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    );
  },
  
  async findById(userId) {
    const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
    
    if (result.rows[0]) {
      // Decrypt PII fields
      return await decryptFields(result.rows[0], ['email', 'name', 'given_name', 'family_name']);
    }
    return result.rows[0];
  },
  
  async deleteUser(userId) {
    // First get user for audit logging
    const user = await this.findById(userId);
    
    // Soft delete - update account status instead of hard delete for compliance
    await query(
      'UPDATE users SET account_status = $1, deactivated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['deleted', userId]
    );
    
    return user;
  }
};

/**
 * Consent management functions
 */
const ConsentService = {
  async createConsent(userId, consentType, consentGiven, version) {
    console.log('📋 Creating consent record...');
    console.log('📋 User ID:', userId);
    console.log('📋 Consent Type:', consentType);
    console.log('📋 Consent Given:', consentGiven);
    console.log('📋 Version:', version);
    
    const consentParams = [userId, consentType, consentGiven, version];
    console.log('📋 Consent parameters:', JSON.stringify(consentParams, null, 2));
    
    let result;
    try {
      console.log('💾 Inserting consent record into database...');
      result = await query(`
        INSERT INTO consent_records (user_id, consent_type, consent_given, consent_version)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, consent_type) 
        DO UPDATE SET 
          consent_given = EXCLUDED.consent_given,
          consent_version = EXCLUDED.consent_version,
          updated_at = CURRENT_TIMESTAMP,
          withdrawn_at = CASE WHEN EXCLUDED.consent_given THEN NULL ELSE CURRENT_TIMESTAMP END
        RETURNING *
      `, consentParams);
      console.log('✅ Consent record inserted/updated successfully');
    } catch (consentDbError) {
      console.error('❌ CRITICAL: Consent database insertion failed:', consentDbError);
      console.error('Consent DB error details:', consentDbError.message, consentDbError.code, consentDbError.stack);
      console.error('SQL constraint violation details:', consentDbError.constraint, consentDbError.detail);
      console.error('Consent parameters:', JSON.stringify(consentParams, null, 2));
      throw new Error(`Consent database insertion failed: ${consentDbError.message}`);
    }
    
    return result.rows[0];
  },
  
  async getUserConsents(userId) {
    const result = await query(
      'SELECT * FROM consent_records WHERE user_id = $1 ORDER BY consent_type',
      [userId]
    );
    return result.rows;
  }
};

/**
 * Chat options management
 */
const ChatService = {
  async getOptionsForContentType(contentType) {
    const result = await query(`
      SELECT * FROM chat_options 
      WHERE content_type = $1 AND is_active = true 
      ORDER BY category, display_order
    `, [contentType]);
    return result.rows;
  }
};

/**
 * Subscription management functions with encryption for provider data
 */
const SubscriptionService = {
  async getUserActiveSubscription(userId) {
    const result = await query(`
      SELECT * FROM subscriptions 
      WHERE user_id = $1 AND subscription_status = 'active' 
      ORDER BY end_date DESC 
      LIMIT 1
    `, [userId]);
    
    if (result.rows[0]) {
      // Decrypt sensitive subscription data
      return await decryptFields(result.rows[0], ['external_subscription_id']);
    }
    return result.rows[0];
  },
  
  async getUserSubscriptionHistory(userId) {
    const result = await query(`
      SELECT * FROM subscriptions 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `, [userId]);
    
    // Decrypt subscription data for all records
    const decryptedSubscriptions = [];
    for (const subscription of result.rows) {
      const decrypted = await decryptFields(subscription, ['external_subscription_id']);
      decryptedSubscriptions.push(decrypted);
    }
    
    return decryptedSubscriptions;
  },
  
  async createSubscription(subscriptionData) {
    const {
      userId,
      subscriptionType,
      provider,
      externalSubscriptionId,
      startDate,
      endDate
    } = subscriptionData;
    
    // Create encryption context for subscription data
    const encryptionContext = {
      userId: userId,
      provider: provider,
      dataType: 'subscription_data'
    };
    
    // Encrypt sensitive subscription fields
    const encryptedData = await encryptFields(
      { external_subscription_id: externalSubscriptionId },
      ['external_subscription_id'],
      process.env.KMS_KEY_ID,
      encryptionContext
    );
    
    const result = await query(`
      INSERT INTO subscriptions (user_id, subscription_type, provider, external_subscription_id, start_date, end_date, subscription_status)
      VALUES ($1, $2, $3, $4, $5, $6, 'active')
      RETURNING *
    `, [userId, subscriptionType, provider, encryptedData.external_subscription_id, startDate, endDate]);
    
    // Decrypt the returned data for the response
    if (result.rows[0]) {
      return await decryptFields(result.rows[0], ['external_subscription_id']);
    }
    return result.rows[0];
  },
  
  async updateSubscriptionStatus(subscriptionId, status) {
    const result = await query(`
      UPDATE subscriptions 
      SET subscription_status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [status, subscriptionId]);
    
    if (result.rows[0]) {
      return await decryptFields(result.rows[0], ['external_subscription_id']);
    }
    return result.rows[0];
  },
  
  async findByExternalId(provider, externalSubscriptionId) {
    // Hash the external ID for searching
    const externalIdHash = hashForIndex(externalSubscriptionId);
    
    const result = await query(`
      SELECT * FROM subscriptions 
      WHERE provider = $1 AND external_subscription_id_hash = $2
    `, [provider, externalIdHash]);
    
    if (result.rows[0]) {
      return await decryptFields(result.rows[0], ['external_subscription_id']);
    }
    return result.rows[0];
  }
};

/**
 * Payment management functions with full table encryption (PCI DSS compliance)
 */
const PaymentService = {
  async createPayment(paymentData) {
    const {
      subscriptionId,
      userId,
      amount,
      currency,
      providerTransactionId,
      paymentMethod,
      status = 'pending'
    } = paymentData;
    
    // Create encryption context for payment data
    const encryptionContext = {
      userId: userId,
      subscriptionId: subscriptionId,
      dataType: 'payment_data'
    };
    
    // Encrypt ALL payment fields (full table encryption for PCI DSS)
    const encryptedData = await encryptFields(
      {
        amount: amount.toString(),
        currency,
        provider_transaction_id: providerTransactionId,
        payment_method: paymentMethod,
        payment_status: status
      },
      ['amount', 'currency', 'provider_transaction_id', 'payment_method', 'payment_status'],
      process.env.KMS_KEY_ID,
      encryptionContext
    );
    
    // Create hash for transaction ID searching
    const transactionIdHash = hashForIndex(providerTransactionId);
    
    const result = await query(`
      INSERT INTO payments (
        subscription_id, user_id, amount, currency, payment_status,
        provider_transaction_id, provider_transaction_id_hash, payment_method
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, subscription_id, user_id, created_at, updated_at, processed_at
    `, [
      subscriptionId,
      userId,
      encryptedData.amount,
      encryptedData.currency,
      encryptedData.payment_status,
      encryptedData.provider_transaction_id,
      transactionIdHash,
      encryptedData.payment_method
    ]);
    
    // Return minimal data - decrypt only when necessary
    return {
      ...result.rows[0],
      amount: parseFloat(amount),
      currency,
      payment_status: status,
      provider_transaction_id: providerTransactionId,
      payment_method: paymentMethod
    };
  },
  
  async getPayment(paymentId, includeDecrypted = false) {
    const result = await query(`
      SELECT * FROM payments WHERE id = $1
    `, [paymentId]);
    
    if (!result.rows[0]) {
      return null;
    }
    
    if (!includeDecrypted) {
      // Return minimal unencrypted data
      const payment = result.rows[0];
      return {
        id: payment.id,
        subscription_id: payment.subscription_id,
        user_id: payment.user_id,
        created_at: payment.created_at,
        updated_at: payment.updated_at,
        processed_at: payment.processed_at
      };
    }
    
    // Decrypt all payment fields when explicitly requested
    return await decryptFields(result.rows[0], [
      'amount', 
      'currency', 
      'payment_status', 
      'provider_transaction_id', 
      'payment_method'
    ]);
  },
  
  async getUserPayments(userId, limit = 50) {
    const result = await query(`
      SELECT * FROM payments 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `, [userId, limit]);
    
    // Decrypt payment data for user view
    const decryptedPayments = [];
    for (const payment of result.rows) {
      const decrypted = await decryptFields(payment, [
        'amount', 
        'currency', 
        'payment_status', 
        'provider_transaction_id', 
        'payment_method'
      ]);
      decryptedPayments.push(decrypted);
    }
    
    return decryptedPayments;
  },
  
  async updatePaymentStatus(paymentId, status, processedAt = null) {
    // Encrypt the new status
    const encryptedStatus = await encryptFields(
      { payment_status: status },
      ['payment_status'],
      process.env.KMS_KEY_ID,
      { dataType: 'payment_data', paymentId }
    );
    
    const updateFields = ['payment_status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [encryptedStatus.payment_status];
    let paramIndex = 2;
    
    if (processedAt) {
      updateFields.push(`processed_at = $${paramIndex}`);
      values.push(processedAt);
      paramIndex++;
    }
    
    values.push(paymentId);
    
    const result = await query(`
      UPDATE payments 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, subscription_id, user_id, created_at, updated_at, processed_at
    `, values);
    
    if (result.rows[0]) {
      return {
        ...result.rows[0],
        payment_status: status
      };
    }
    
    return result.rows[0];
  },
  
  async findByTransactionId(providerTransactionId) {
    const transactionIdHash = hashForIndex(providerTransactionId);
    
    const result = await query(`
      SELECT * FROM payments 
      WHERE provider_transaction_id_hash = $1
    `, [transactionIdHash]);
    
    if (result.rows[0]) {
      // Decrypt the payment data
      return await decryptFields(result.rows[0], [
        'amount', 
        'currency', 
        'payment_status', 
        'provider_transaction_id', 
        'payment_method'
      ]);
    }
    
    return result.rows[0];
  },
  
  async getPaymentStats(userId, startDate, endDate) {
    // Get encrypted payment data
    const result = await query(`
      SELECT amount, currency, payment_status, created_at FROM payments 
      WHERE user_id = $1 AND created_at BETWEEN $2 AND $3
    `, [userId, startDate, endDate]);
    
    // Decrypt amounts for calculation
    let totalAmount = 0;
    let completedCount = 0;
    let failedCount = 0;
    
    for (const payment of result.rows) {
      const decrypted = await decryptFields(payment, ['amount', 'currency', 'payment_status']);
      
      if (decrypted.payment_status === 'completed') {
        totalAmount += parseFloat(decrypted.amount);
        completedCount++;
      } else if (decrypted.payment_status === 'failed') {
        failedCount++;
      }
    }
    
    return {
      totalAmount,
      completedCount,
      failedCount,
      totalTransactions: result.rows.length
    };
  }
};

/**
 * Session management functions
 */
const SessionService = {
  async createSession(sessionData) {
    console.log('🎫 Creating session record...');
    const {
      userId,
      deviceId,
      sessionId,
      refreshToken,
      expiresAt,
      userAgent,
      sourceIp
    } = sessionData;
    
    console.log('🎫 Session User ID:', userId);
    console.log('🎫 Session Device ID:', deviceId);
    console.log('🎫 Session ID:', sessionId);
    console.log('🎫 Session expires at:', expiresAt);
    console.log('🎫 User agent:', userAgent);
    console.log('🎫 Source IP:', sourceIp);
    
    // Validate critical foreign key constraints
    if (!userId) {
      console.error('❌ CRITICAL: userId is required for session creation');
      throw new Error('Session creation failed: userId is required');
    }
    
    if (!deviceId) {
      console.error('❌ CRITICAL: deviceId is required for session creation');
      throw new Error('Session creation failed: deviceId is required');
    }
    
    console.log('✅ Session foreign key validation passed');
    
    // Hash the refresh token for storage
    console.log('🔐 Hashing refresh token...');
    const crypto = require('crypto');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    console.log('✅ Refresh token hashed successfully');
    
    const sessionParams = [userId, deviceId, sessionId, refreshTokenHash, expiresAt, userAgent, sourceIp];
    console.log('🎫 Session parameters:', JSON.stringify(sessionParams.map((p, i) => 
      i === 3 ? '[HASHED_TOKEN]' : p
    ), null, 2));
    
    let result;
    try {
      console.log('💾 Inserting session into database...');
      result = await query(`
        INSERT INTO user_sessions (
          user_id, device_id, session_id, refresh_token_hash, 
          expires_at, user_agent, source_ip, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
        RETURNING *
      `, sessionParams);
      console.log('✅ Session inserted into database successfully');
    } catch (sessionDbError) {
      console.error('❌ CRITICAL: Session database insertion failed:', sessionDbError);
      console.error('Session DB error details:', sessionDbError.message, sessionDbError.code, sessionDbError.stack);
      console.error('SQL constraint violation details:', sessionDbError.constraint, sessionDbError.detail);
      console.error('Session parameters (sanitized):', JSON.stringify(sessionParams.map((p, i) => 
        i === 3 ? '[HASHED_TOKEN]' : p
      ), null, 2));
      throw new Error(`Session database insertion failed: ${sessionDbError.message}`);
    }
    
    return result.rows[0];
  },
  
  async findActiveSession(sessionId) {
    const result = await query(`
      SELECT * FROM user_sessions 
      WHERE session_id = $1 AND status = 'active' AND expires_at > NOW()
    `, [sessionId]);
    
    return result.rows[0];
  },
  
  async findByRefreshToken(refreshToken) {
    const crypto = require('crypto');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    const result = await query(`
      SELECT * FROM user_sessions 
      WHERE refresh_token_hash = $1 AND status = 'active' AND expires_at > NOW()
    `, [refreshTokenHash]);
    
    return result.rows[0];
  },
  
  async updateLastActivity(sessionId) {
    await query(`
      UPDATE user_sessions 
      SET last_activity_at = CURRENT_TIMESTAMP 
      WHERE session_id = $1
    `, [sessionId]);
  },
  
  async revokeSession(sessionId) {
    const result = await query(`
      UPDATE user_sessions 
      SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP 
      WHERE session_id = $1
      RETURNING *
    `, [sessionId]);
    
    return result.rows[0];
  },
  
  async revokeAllUserSessions(userId) {
    await query(`
      UPDATE user_sessions 
      SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP 
      WHERE user_id = $1 AND status = 'active'
    `, [userId]);
  },
  
  async cleanupExpiredSessions() {
    await query(`
      UPDATE user_sessions 
      SET status = 'expired' 
      WHERE expires_at < NOW() AND status = 'active'
    `);
  }
};

/**
 * Device management functions
 */
const DeviceService = {
  async findOrCreateDevice(deviceData) {
    console.log('📱 Finding or creating device...');
    const { userId, platformType, appInstallationId, deviceFingerprint, appVersion } = deviceData;
    
    console.log('📱 Device User ID:', userId);
    console.log('📱 Platform Type:', platformType);
    console.log('📱 App Installation ID:', appInstallationId);
    console.log('📱 Device Fingerprint:', deviceFingerprint);
    console.log('📱 App Version:', appVersion);
    
    // Validate required fields
    if (!userId) {
      console.error('❌ CRITICAL: userId is required for device creation');
      throw new Error('Device creation failed: userId is required');
    }
    
    if (!appInstallationId) {
      console.error('❌ CRITICAL: appInstallationId is required for device creation');
      throw new Error('Device creation failed: appInstallationId is required');
    }
    
    console.log('✅ Device required field validation passed');
    
    // Check if device already exists
    console.log('🔍 Checking if device already exists...');
    let result;
    try {
      result = await query(`
        SELECT * FROM user_devices 
        WHERE user_id = $1 AND device_id = $2
      `, [userId, appInstallationId]);
      console.log('✅ Device lookup completed');
    } catch (deviceLookupError) {
      console.error('❌ CRITICAL: Device lookup failed:', deviceLookupError);
      console.error('Device lookup error details:', deviceLookupError.message, deviceLookupError.code, deviceLookupError.stack);
      throw new Error(`Device lookup failed: ${deviceLookupError.message}`);
    }
    
    if (result.rows[0]) {
      console.log('📱 Device already exists, updating...');
      console.log('📱 Existing device ID:', result.rows[0].id);
      try {
        // Update last seen and app version
        result = await query(`
          UPDATE user_devices 
          SET last_active_at = CURRENT_TIMESTAMP, app_version = $1
          WHERE id = $2
          RETURNING *
        `, [appVersion, result.rows[0].id]);
        console.log('✅ Device updated successfully');
      } catch (deviceUpdateError) {
        console.error('❌ CRITICAL: Device update failed:', deviceUpdateError);
        console.error('Device update error details:', deviceUpdateError.message, deviceUpdateError.code, deviceUpdateError.stack);
        throw new Error(`Device update failed: ${deviceUpdateError.message}`);
      }
      
      return result.rows[0];
    }
    
    // Create new device
    console.log('📱 Creating new device...');
    const deviceParams = [userId, platformType, appInstallationId, appVersion];
    console.log('📱 Device creation parameters:', JSON.stringify(deviceParams, null, 2));
    
    try {
      result = await query(`
        INSERT INTO user_devices (
          user_id, platform, device_id, 
          app_version, status
        )
        VALUES ($1, $2, $3, $4, 'active')
        RETURNING *
      `, deviceParams);
      console.log('✅ Device created successfully');
      console.log('✅ New device ID:', result.rows[0].id);
    } catch (deviceCreateError) {
      console.error('❌ CRITICAL: Device creation failed:', deviceCreateError);
      console.error('Device creation error details:', deviceCreateError.message, deviceCreateError.code, deviceCreateError.stack);
      console.error('SQL constraint violation details:', deviceCreateError.constraint, deviceCreateError.detail);
      console.error('Device creation parameters:', JSON.stringify(deviceParams, null, 2));
      throw new Error(`Device creation failed: ${deviceCreateError.message}`);
    }
    
    return result.rows[0];
  },
  
  async getUserDevices(userId) {
    const result = await query(`
      SELECT * FROM user_devices 
      WHERE user_id = $1 AND device_status = 'active'
      ORDER BY last_seen_at DESC
    `, [userId]);
    
    return result.rows;
  },
  
  async revokeDevice(deviceId) {
    // Revoke device and all its sessions
    await transaction([
      {
        sql: `UPDATE user_devices SET device_status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE id = $1`,
        params: [deviceId]
      },
      {
        sql: `UPDATE user_sessions SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE device_id = $1`,
        params: [deviceId]
      }
    ]);
  }
};

/**
 * Biometric registration functions with enhanced encryption
 */
const BiometricService = {
  async createRegistration(registrationData) {
    const {
      deviceId,
      biometricType,
      challenge,
      challengeExpiresAt,
      deviceAttestationData,
      registrationMetadata
    } = registrationData;
    
    const registrationId = require('crypto').randomBytes(16).toString('hex');
    
    // Create encryption context for biometric data
    const encryptionContext = {
      deviceId: deviceId,
      biometricType: biometricType,
      dataType: 'biometric_registration'
    };
    
    // Encrypt sensitive biometric data
    const encryptedData = await encryptFields({
      challenge: challenge,
      device_attestation_data: JSON.stringify(deviceAttestationData || {}),
      registration_metadata: JSON.stringify(registrationMetadata || {})
    }, ['challenge', 'device_attestation_data', 'registration_metadata'], 
    process.env.KMS_KEY_ID, encryptionContext);
    
    const result = await query(`
      INSERT INTO biometric_registrations (
        device_id, registration_id, biometric_type, challenge, 
        challenge_expires_at, device_attestation_data, registration_metadata,
        registration_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING id, device_id, registration_id, biometric_type, challenge_expires_at, created_at, registration_status
    `, [
      deviceId, 
      registrationId, 
      biometricType, 
      encryptedData.challenge,
      challengeExpiresAt,
      encryptedData.device_attestation_data,
      encryptedData.registration_metadata
    ]);
    
    return {
      ...result.rows[0],
      challenge: challenge,
      device_attestation_data: deviceAttestationData,
      registration_metadata: registrationMetadata
    };
  },
  
  async findRegistration(registrationId) {
    const result = await query(`
      SELECT * FROM biometric_registrations 
      WHERE registration_id = $1
    `, [registrationId]);
    
    if (result.rows[0]) {
      // Decrypt sensitive data
      return await decryptFields(result.rows[0], ['challenge', 'device_attestation_data', 'registration_metadata']);
    }
    
    return result.rows[0];
  },
  
  async completeRegistration(registrationId, verificationData) {
    const { signedChallenge, biometricPublicKey } = verificationData;
    
    // Encrypt the public key for storage
    const encryptionContext = {
      registrationId: registrationId,
      dataType: 'biometric_keys'
    };
    
    const encryptedKey = await encryptFields({
      biometric_public_key: biometricPublicKey,
      signed_challenge: signedChallenge
    }, ['biometric_public_key', 'signed_challenge'], 
    process.env.KMS_KEY_ID, encryptionContext);
    
    const result = await query(`
      UPDATE biometric_registrations 
      SET 
        biometric_public_key = $1,
        signed_challenge = $2,
        registration_status = 'completed',
        completed_at = CURRENT_TIMESTAMP
      WHERE registration_id = $3
      RETURNING *
    `, [encryptedKey.biometric_public_key, encryptedKey.signed_challenge, registrationId]);
    
    if (result.rows[0]) {
      return await decryptFields(result.rows[0], ['challenge', 'device_attestation_data', 'registration_metadata']);
    }
    
    return result.rows[0];
  },
  
  async getDeviceRegistrations(deviceId) {
    const result = await query(`
      SELECT * FROM biometric_registrations 
      WHERE device_id = $1 AND registration_status = 'completed'
      ORDER BY completed_at DESC
    `, [deviceId]);
    
    // Decrypt registrations
    const decryptedRegistrations = [];
    for (const registration of result.rows) {
      const decrypted = await decryptFields(registration, ['challenge', 'device_attestation_data', 'registration_metadata']);
      decryptedRegistrations.push(decrypted);
    }
    
    return decryptedRegistrations;
  }
};

module.exports = {
  query,
  transaction,
  getConnectionPool,
  UserService,
  ConsentService,
  ChatService,
  SubscriptionService,
  PaymentService,
  SessionService,
  DeviceService,
  BiometricService
};