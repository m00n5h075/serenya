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
    
    // Create encryption context for this user
    const encryptionContext = {
      userId: externalId,
      authProvider: authProvider,
      dataType: 'user_pii'
    };
    
    // Encrypt PII fields
    const encryptedData = await encryptFields(
      { email, name, given_name: givenName, family_name: familyName },
      ['email', 'name', 'given_name', 'family_name'],
      process.env.KMS_KEY_ID,
      encryptionContext
    );
    
    // Generate searchable hash for email
    const emailHash = hashEmail(email);
    
    const result = await query(`
      INSERT INTO users (external_id, auth_provider, email, email_hash, email_verified, name, given_name, family_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      externalId, 
      authProvider, 
      encryptedData.email, 
      emailHash,
      emailVerified, 
      encryptedData.name, 
      encryptedData.given_name, 
      encryptedData.family_name
    ]);
    
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
  async createConsent(userId, consentType, consentGiven, version, consentMethod = 'bundled_consent', uiCheckboxGroup = null) {
    const result = await query(`
      INSERT INTO consent_records (user_id, consent_type, consent_given, consent_version, consent_method, ui_checkbox_group)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, consent_type) 
      DO UPDATE SET 
        consent_given = EXCLUDED.consent_given,
        consent_version = EXCLUDED.consent_version,
        consent_method = EXCLUDED.consent_method,
        ui_checkbox_group = EXCLUDED.ui_checkbox_group,
        updated_at = CURRENT_TIMESTAMP,
        withdrawn_at = CASE WHEN EXCLUDED.consent_given THEN NULL ELSE CURRENT_TIMESTAMP END
      RETURNING *
    `, [userId, consentType, consentGiven, version, consentMethod, uiCheckboxGroup]);
    
    return result.rows[0];
  },

  async createBundledConsents(userId, consentVersion) {
    // Create all 5 required consents based on UI checkbox mapping
    // Checkbox 1 -> terms_of_service, privacy_policy, healthcare_consultation
    // Checkbox 2 -> medical_disclaimer, emergency_care_limitation
    
    const consentRecords = [
      // Checkbox 1 consents
      { type: 'terms_of_service', checkboxGroup: 1 },
      { type: 'privacy_policy', checkboxGroup: 1 },
      { type: 'healthcare_consultation', checkboxGroup: 1 },
      
      // Checkbox 2 consents  
      { type: 'medical_disclaimer', checkboxGroup: 2 },
      { type: 'emergency_care_limitation', checkboxGroup: 2 }
    ];

    const results = [];
    for (const consent of consentRecords) {
      const result = await this.createConsent(
        userId,
        consent.type,
        true, // All consents given during onboarding
        consentVersion,
        'bundled_consent',
        consent.checkboxGroup
      );
      results.push(result);
    }

    return results;
  },
  
  async getUserConsents(userId) {
    const result = await query(
      'SELECT * FROM consent_records WHERE user_id = $1 ORDER BY consent_type',
      [userId]
    );
    return result.rows;
  },

  async getConsentsByMethod(userId, consentMethod = 'bundled_consent') {
    const result = await query(
      'SELECT * FROM consent_records WHERE user_id = $1 AND consent_method = $2 ORDER BY ui_checkbox_group, consent_type',
      [userId, consentMethod]
    );
    return result.rows;
  },

  async withdrawConsent(userId, consentType) {
    const result = await query(`
      UPDATE consent_records 
      SET consent_given = false,
          withdrawn_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND consent_type = $2
      RETURNING *
    `, [userId, consentType]);
    
    return result.rows[0];
  },

  async checkRequiredConsents(userId) {
    // Check if user has all 5 required consents
    const requiredConsents = [
      'terms_of_service',
      'privacy_policy', 
      'medical_disclaimer',
      'healthcare_consultation',
      'emergency_care_limitation'
    ];

    const result = await query(`
      SELECT consent_type, consent_given
      FROM consent_records 
      WHERE user_id = $1 AND consent_type = ANY($2)
    `, [userId, requiredConsents]);

    const userConsents = result.rows.reduce((acc, row) => {
      acc[row.consent_type] = row.consent_given;
      return acc;
    }, {});

    const missingConsents = requiredConsents.filter(
      consentType => !userConsents[consentType]
    );

    return {
      hasAllRequired: missingConsents.length === 0,
      missingConsents,
      userConsents
    };
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
 * Device management functions for biometric authentication and device tracking
 */
const DeviceService = {
  async registerDevice(deviceData) {
    const {
      userId,
      deviceId,
      deviceName,
      platform,
      model,
      osVersion,
      appVersion,
      biometricType,
      secureElement = false,
      publicKey
    } = deviceData;

    const result = await query(`
      INSERT INTO user_devices (
        user_id, device_id, device_name, platform, model, 
        os_version, app_version, biometric_type, secure_element, public_key
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (user_id, device_id) 
      DO UPDATE SET 
        device_name = EXCLUDED.device_name,
        model = EXCLUDED.model,
        os_version = EXCLUDED.os_version,
        app_version = EXCLUDED.app_version,
        biometric_type = EXCLUDED.biometric_type,
        secure_element = EXCLUDED.secure_element,
        public_key = EXCLUDED.public_key,
        status = 'active',
        last_active_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [userId, deviceId, deviceName, platform, model, osVersion, appVersion, biometricType, secureElement, publicKey]);

    return result.rows[0];
  },

  async getUserDevices(userId) {
    const result = await query(`
      SELECT * FROM user_devices 
      WHERE user_id = $1 
      ORDER BY last_active_at DESC
    `, [userId]);
    return result.rows;
  },

  async getDeviceById(deviceId) {
    const result = await query(`
      SELECT * FROM user_devices WHERE id = $1
    `, [deviceId]);
    return result.rows[0];
  },

  async findDeviceByUserAndDeviceId(userId, deviceId) {
    const result = await query(`
      SELECT * FROM user_devices 
      WHERE user_id = $1 AND device_id = $2
    `, [userId, deviceId]);
    return result.rows[0];
  },

  async updateDeviceActivity(deviceId) {
    await query(`
      UPDATE user_devices 
      SET last_active_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [deviceId]);
  },

  async updateDeviceStatus(deviceId, status) {
    const result = await query(`
      UPDATE user_devices 
      SET status = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2
      RETURNING *
    `, [status, deviceId]);
    return result.rows[0];
  },

  async revokeDevice(deviceId) {
    return await this.updateDeviceStatus(deviceId, 'revoked');
  },

  async getActiveDevices(userId) {
    const result = await query(`
      SELECT * FROM user_devices 
      WHERE user_id = $1 AND status = 'active'
      ORDER BY last_active_at DESC
    `, [userId]);
    return result.rows;
  }
};

/**
 * Session management functions for JWT tokens and biometric authentication
 */
const SessionService = {
  async createSession(sessionData) {
    const {
      userId,
      deviceId,
      sessionId,
      refreshTokenHash,
      accessTokenHash,
      expiresAt
    } = sessionData;

    const result = await query(`
      INSERT INTO user_sessions (
        user_id, device_id, session_id, refresh_token_hash, 
        access_token_hash, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [userId, deviceId, sessionId, refreshTokenHash, accessTokenHash, expiresAt]);

    return result.rows[0];
  },

  async getSessionBySessionId(sessionId) {
    const result = await query(`
      SELECT s.*, d.user_id, d.device_id as device_uuid, d.platform, d.biometric_type
      FROM user_sessions s
      JOIN user_devices d ON s.device_id = d.id
      WHERE s.session_id = $1 AND s.status = 'active'
    `, [sessionId]);
    return result.rows[0];
  },

  async getSessionByRefreshToken(refreshTokenHash) {
    const result = await query(`
      SELECT s.*, d.user_id, d.device_id as device_uuid, d.platform, d.biometric_type
      FROM user_sessions s
      JOIN user_devices d ON s.device_id = d.id
      WHERE s.refresh_token_hash = $1 AND s.status = 'active'
    `, [refreshTokenHash]);
    return result.rows[0];
  },

  async updateSessionActivity(sessionId) {
    await query(`
      UPDATE user_sessions 
      SET last_accessed_at = CURRENT_TIMESTAMP 
      WHERE session_id = $1
    `, [sessionId]);
  },

  async updateBiometricAuth(sessionId, biometricExpiresAt) {
    await query(`
      UPDATE user_sessions 
      SET last_biometric_auth_at = CURRENT_TIMESTAMP,
          biometric_expires_at = $1,
          requires_biometric_reauth = false,
          updated_at = CURRENT_TIMESTAMP
      WHERE session_id = $2
    `, [biometricExpiresAt, sessionId]);
  },

  async setBiometricReauthRequired(sessionId) {
    await query(`
      UPDATE user_sessions 
      SET requires_biometric_reauth = true,
          updated_at = CURRENT_TIMESTAMP
      WHERE session_id = $1
    `, [sessionId]);
  },

  async expireSession(sessionId) {
    const result = await query(`
      UPDATE user_sessions 
      SET status = 'expired', updated_at = CURRENT_TIMESTAMP 
      WHERE session_id = $1
      RETURNING *
    `, [sessionId]);
    return result.rows[0];
  },

  async revokeSession(sessionId) {
    const result = await query(`
      UPDATE user_sessions 
      SET status = 'revoked', updated_at = CURRENT_TIMESTAMP 
      WHERE session_id = $1
      RETURNING *
    `, [sessionId]);
    return result.rows[0];
  },

  async revokeAllUserSessions(userId) {
    const result = await query(`
      UPDATE user_sessions 
      SET status = 'revoked', updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = $1 AND status = 'active'
      RETURNING count(*) as revoked_count
    `, [userId]);
    return result.rows[0];
  },

  async getUserActiveSessions(userId) {
    const result = await query(`
      SELECT s.*, d.device_name, d.platform, d.model
      FROM user_sessions s
      JOIN user_devices d ON s.device_id = d.id
      WHERE s.user_id = $1 AND s.status = 'active'
      ORDER BY s.last_accessed_at DESC
    `, [userId]);
    return result.rows;
  },

  async cleanupExpiredSessions() {
    const result = await query(`
      UPDATE user_sessions 
      SET status = 'expired', updated_at = CURRENT_TIMESTAMP 
      WHERE status = 'active' AND expires_at < CURRENT_TIMESTAMP
      RETURNING count(*) as expired_count
    `);
    return result.rows[0];
  },

  async getSessionsRequiringBiometricReauth() {
    const result = await query(`
      SELECT s.*, d.user_id, d.device_id as device_uuid
      FROM user_sessions s
      JOIN user_devices d ON s.device_id = d.id
      WHERE s.status = 'active' 
        AND (
          s.biometric_expires_at < CURRENT_TIMESTAMP 
          OR s.requires_biometric_reauth = true
        )
    `);
    return result.rows;
  }
};

/**
 * Biometric registration management functions
 */
const BiometricService = {
  async createRegistration(registrationData) {
    const {
      deviceId,
      registrationId,
      biometricType,
      challenge,
      challengeExpiresAt,
      deviceAttestationData,
      registrationMetadata
    } = registrationData;

    const result = await query(`
      INSERT INTO biometric_registrations (
        device_id, registration_id, biometric_type, challenge, 
        challenge_expires_at, device_attestation_data, registration_metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (device_id, biometric_type) 
      DO UPDATE SET 
        registration_id = EXCLUDED.registration_id,
        challenge = EXCLUDED.challenge,
        challenge_expires_at = EXCLUDED.challenge_expires_at,
        is_verified = false,
        verification_failures = 0,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [deviceId, registrationId, biometricType, challenge, challengeExpiresAt, deviceAttestationData, registrationMetadata]);

    return result.rows[0];
  },

  async getRegistrationById(registrationId) {
    const result = await query(`
      SELECT * FROM biometric_registrations 
      WHERE registration_id = $1 AND is_active = true
    `, [registrationId]);
    return result.rows[0];
  },

  async getDeviceRegistrations(deviceId) {
    const result = await query(`
      SELECT * FROM biometric_registrations 
      WHERE device_id = $1 AND is_active = true
      ORDER BY biometric_type
    `, [deviceId]);
    return result.rows;
  },

  async verifyRegistration(registrationId) {
    const result = await query(`
      UPDATE biometric_registrations 
      SET is_verified = true,
          last_verified_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE registration_id = $1
      RETURNING *
    `, [registrationId]);
    return result.rows[0];
  },

  async recordVerificationFailure(registrationId) {
    const result = await query(`
      UPDATE biometric_registrations 
      SET verification_failures = verification_failures + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE registration_id = $1
      RETURNING *
    `, [registrationId]);
    
    // Check if we should deactivate after too many failures
    const registration = result.rows[0];
    if (registration && registration.verification_failures >= 5) {
      await this.deactivateRegistration(registrationId);
      registration.is_active = false;
    }
    
    return registration;
  },

  async updateChallenge(registrationId, challenge, challengeExpiresAt) {
    const result = await query(`
      UPDATE biometric_registrations 
      SET challenge = $1,
          challenge_expires_at = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE registration_id = $3
      RETURNING *
    `, [challenge, challengeExpiresAt, registrationId]);
    return result.rows[0];
  },

  async deactivateRegistration(registrationId) {
    const result = await query(`
      UPDATE biometric_registrations 
      SET is_active = false,
          updated_at = CURRENT_TIMESTAMP
      WHERE registration_id = $1
      RETURNING *
    `, [registrationId]);
    return result.rows[0];
  },

  async cleanupExpiredChallenges() {
    const result = await query(`
      UPDATE biometric_registrations 
      SET is_active = false,
          updated_at = CURRENT_TIMESTAMP
      WHERE challenge_expires_at < CURRENT_TIMESTAMP 
        AND is_verified = false
        AND is_active = true
      RETURNING count(*) as cleaned_count
    `);
    return result.rows[0];
  }
};

/**
 * Audit logging service for compliance and security monitoring
 */
const AuditService = {
  async logEvent(eventData) {
    const {
      eventType,
      eventSubtype,
      userId = null,
      sessionId = null,
      adminUserId = null,
      sourceIp = null,
      userAgent = null,
      requestId = null,
      eventDetails = {},
      gdprLawfulBasis = 'legitimate_interests',
      dataClassification = 'internal',
      retentionYears = 7
    } = eventData;

    const result = await query(`
      SELECT log_audit_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as event_id
    `, [
      eventType,
      eventSubtype,
      userId,
      sessionId,
      adminUserId,
      sourceIp,
      userAgent,
      requestId,
      eventDetails,
      gdprLawfulBasis,
      dataClassification,
      retentionYears
    ]);

    return result.rows[0].event_id;
  },

  async getAuditEvents(filters = {}) {
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.userId) {
      whereClause += ` AND user_id_hash = generate_user_id_hash($${paramIndex}::uuid)`;
      params.push(filters.userId);
      paramIndex++;
    }

    if (filters.eventType) {
      whereClause += ` AND event_type = $${paramIndex}`;
      params.push(filters.eventType);
      paramIndex++;
    }

    if (filters.startDate) {
      whereClause += ` AND event_timestamp >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      whereClause += ` AND event_timestamp <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    const limit = filters.limit || 100;
    whereClause += ` ORDER BY event_timestamp DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await query(`
      SELECT id, event_timestamp, event_type, event_subtype, 
             session_id, request_id, gdpr_lawful_basis, 
             data_classification, event_details
      FROM audit_events 
      WHERE ${whereClause}
    `, params);

    return result.rows;
  },

  async updateAuditSummaries(summaryDate = null) {
    const result = await query(`
      SELECT update_audit_summaries($1) as updated_count
    `, [summaryDate]);
    return result.rows[0].updated_count;
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
  DeviceService,
  SessionService,
  BiometricService,
  AuditService
};