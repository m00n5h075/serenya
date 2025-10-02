const AWS = require('aws-sdk');
const { encryptFields, decryptFields } = require('./encryption');
const { sanitizeError } = require('./utils');

/**
 * DynamoDB User Service Layer
 * Clean implementation for new DynamoDB-based user profile management
 */
class DynamoDBUserService {
  constructor() {
    this.dynamodb = new AWS.DynamoDB.DocumentClient({
      region: process.env.AWS_REGION || 'eu-west-1'
    });
    this.tableName = process.env.DYNAMO_TABLE_NAME || 'serenya-user-profiles';
    this.kmsKeyId = process.env.KMS_KEY_ID;
  }

  // ==================== USER CORE OPERATIONS ====================

  /**
   * Create user profile with smart consolidation
   * Consolidates: user + consents + initial subscription
   * Separate: device, session, biometric (varies per login)
   */
  async createUserProfile(userData) {
    try {
      const userId = userData.id || userData.userId;
      const timestamp = Date.now();
      
      // Encrypt PII fields
      const encryptionContext = {
        userId: userId,
        operation: 'user_profile_creation'
      };
      
      const encryptedData = await encryptFields(
        {
          email: userData.email,
          name: userData.name,
          given_name: userData.given_name,
          family_name: userData.family_name
        },
        ['email', 'name', 'given_name', 'family_name'],
        this.kmsKeyId,
        encryptionContext
      );

      // Generate email hash for GSI1 lookup
      const emailHash = await this.generateEmailHash(userData.email);

      // Core consolidated user profile item
      const userItem = {
        PK: `USER#${userId}`,
        SK: 'PROFILE',
        
        // Core user data
        id: userId,
        external_id: userData.external_id,
        auth_provider: userData.auth_provider,
        email: encryptedData.email,
        email_hash: emailHash,
        name: encryptedData.name,
        given_name: encryptedData.given_name,
        family_name: encryptedData.family_name,
        email_verified: userData.email_verified || false,
        account_status: userData.account_status || 'active',
        
        // Consolidated consents (always created together)
        consents: {
          privacy_policy: {
            consented: true,
            version: userData.consent_version || '1.0',
            timestamp: timestamp,
            ip_address: userData.source_ip,
            user_agent: userData.user_agent
          },
          terms_of_service: {
            consented: true,
            version: userData.consent_version || '1.0',
            timestamp: timestamp,
            ip_address: userData.source_ip,
            user_agent: userData.user_agent
          }
        },
        
        // Initial free subscription (always created)
        current_subscription: {
          id: `free-${userId}-${timestamp}`,
          type: 'free',
          status: 'active',
          provider: 'system',
          external_subscription_id: null,
          start_date: timestamp,
          end_date: timestamp + (365 * 24 * 60 * 60 * 1000), // 1 year
          created_at: timestamp,
          updated_at: timestamp
        },
        
        // Placeholders for separate updates
        current_device: null,
        current_session: null,
        current_biometric: null,
        
        // GSI keys for efficient lookups
        GSI1PK: `EMAIL#${emailHash}`,
        GSI1SK: `USER#${userId}`,
        GSI2PK: `EXTERNAL#${userData.auth_provider}#${userData.external_id}`,
        GSI2SK: `USER#${userId}`,
        
        // Metadata
        created_at: timestamp,
        updated_at: timestamp,
        last_login_at: timestamp,
        
        // Audit fields
        created_ip: userData.source_ip,
        created_user_agent: userData.user_agent
      };

      // Single DynamoDB operation for core profile
      await this.dynamodb.put({
        TableName: this.tableName,
        Item: userItem,
        ConditionExpression: 'attribute_not_exists(PK)' // Prevent duplicates
      }).promise();

      console.log(`User profile created: ${userId}`);
      return { 
        userId, 
        success: true, 
        created_at: timestamp,
        requires_device_registration: true,
        requires_session_creation: true
      };

    } catch (error) {
      console.error('Error creating user profile:', sanitizeError(error));
      throw new Error(`Failed to create user profile: ${error.message}`);
    }
  }

  /**
   * Get user profile by ID with automatic PII decryption
   */
  async getUserProfile(userId) {
    try {
      const result = await this.dynamodb.get({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE'
        }
      }).promise();

      if (!result.Item) {
        return null;
      }

      // Decrypt PII fields
      const decryptedData = await this.decryptUserPII(result.Item, userId);
      
      return {
        ...result.Item,
        ...decryptedData,
        // Remove internal keys from response
        PK: undefined,
        SK: undefined,
        GSI1PK: undefined,
        GSI1SK: undefined,
        GSI2PK: undefined,
        GSI2SK: undefined
      };

    } catch (error) {
      console.error('Error getting user profile:', sanitizeError(error));
      throw new Error(`Failed to get user profile: ${error.message}`);
    }
  }

  /**
   * Find user by external ID (OAuth lookup)
   */
  async findByExternalId(externalId, authProvider) {
    try {
      const result = await this.dynamodb.query({
        TableName: this.tableName,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `EXTERNAL#${authProvider}#${externalId}`
        }
      }).promise();

      if (!result.Items || result.Items.length === 0) {
        return null;
      }

      const userItem = result.Items[0];
      const decryptedData = await this.decryptUserPII(userItem, userItem.id);
      
      return {
        ...userItem,
        ...decryptedData,
        PK: undefined,
        SK: undefined,
        GSI1PK: undefined,
        GSI1SK: undefined,
        GSI2PK: undefined,
        GSI2SK: undefined
      };

    } catch (error) {
      console.error('Error finding user by external ID:', sanitizeError(error));
      throw new Error(`Failed to find user by external ID: ${error.message}`);
    }
  }

  /**
   * Find user by email hash (email lookup for account linking)
   */
  async findByEmailHash(emailHash) {
    try {
      const result = await this.dynamodb.query({
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `EMAIL#${emailHash}`
        }
      }).promise();

      if (!result.Items || result.Items.length === 0) {
        return null;
      }

      const userItem = result.Items[0];
      const decryptedData = await this.decryptUserPII(userItem, userItem.id);
      
      return {
        ...userItem,
        ...decryptedData,
        PK: undefined,
        SK: undefined,
        GSI1PK: undefined,
        GSI1SK: undefined,
        GSI2PK: undefined,
        GSI2SK: undefined
      };

    } catch (error) {
      console.error('Error finding user by email hash:', sanitizeError(error));
      throw new Error(`Failed to find user by email hash: ${error.message}`);
    }
  }

  /**
   * Update user profile (name, contact info, etc.)
   */
  async updateUserProfile(userId, updates) {
    try {
      const timestamp = Date.now();
      
      // Encrypt any PII fields in updates
      const fieldsToEncrypt = ['email', 'name', 'given_name', 'family_name'].filter(
        field => updates[field] !== undefined
      );
      
      let encryptedUpdates = {};
      if (fieldsToEncrypt.length > 0) {
        const encryptionContext = {
          userId: userId,
          operation: 'user_profile_update'
        };
        
        const dataToEncrypt = {};
        fieldsToEncrypt.forEach(field => {
          dataToEncrypt[field] = updates[field];
        });
        
        encryptedUpdates = await encryptFields(
          dataToEncrypt,
          fieldsToEncrypt,
          this.kmsKeyId,
          encryptionContext
        );
      }

      // Build update expression
      const updateExpressions = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};
      
      // Add encrypted fields
      Object.keys(encryptedUpdates).forEach(field => {
        updateExpressions.push(`#${field} = :${field}`);
        expressionAttributeNames[`#${field}`] = field;
        expressionAttributeValues[`:${field}`] = encryptedUpdates[field];
      });
      
      // Add non-encrypted fields
      Object.keys(updates).forEach(field => {
        if (!fieldsToEncrypt.includes(field) && field !== 'updated_at') {
          updateExpressions.push(`#${field} = :${field}`);
          expressionAttributeNames[`#${field}`] = field;
          expressionAttributeValues[`:${field}`] = updates[field];
        }
      });
      
      // Always update timestamp
      updateExpressions.push('#updated_at = :updated_at');
      expressionAttributeNames['#updated_at'] = 'updated_at';
      expressionAttributeValues[':updated_at'] = timestamp;

      const result = await this.dynamodb.update({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE'
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }).promise();

      // Decrypt and return updated profile
      const decryptedData = await this.decryptUserPII(result.Attributes, userId);
      
      return {
        ...result.Attributes,
        ...decryptedData,
        PK: undefined,
        SK: undefined,
        GSI1PK: undefined,
        GSI1SK: undefined,
        GSI2PK: undefined,
        GSI2SK: undefined
      };

    } catch (error) {
      console.error('Error updating user profile:', sanitizeError(error));
      throw new Error(`Failed to update user profile: ${error.message}`);
    }
  }

  // ==================== DEVICE MANAGEMENT ====================

  /**
   * Update current device (separate from user creation for flexibility)
   */
  async updateCurrentDevice(userId, deviceData) {
    try {
      const timestamp = Date.now();
      
      const deviceObject = {
        device_id: deviceData.device_id,
        platform: deviceData.platform,
        device_model: deviceData.device_model || null,
        device_name: deviceData.device_name || null,
        app_version: deviceData.app_version || null,
        os_version: deviceData.os_version || null,
        device_status: deviceData.device_status || 'active',
        registered_at: timestamp,
        last_seen_at: timestamp,
        registration_ip: deviceData.source_ip,
        registration_user_agent: deviceData.user_agent
      };

      await this.dynamodb.update({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE'
        },
        UpdateExpression: 'SET current_device = :device, updated_at = :timestamp',
        ExpressionAttributeValues: {
          ':device': deviceObject,
          ':timestamp': timestamp
        }
      }).promise();

      console.log(`Device updated for user: ${userId}`);
      return deviceObject;

    } catch (error) {
      console.error('Error updating current device:', sanitizeError(error));
      throw new Error(`Failed to update current device: ${error.message}`);
    }
  }

  // ==================== SESSION MANAGEMENT ====================

  /**
   * Update current session (separate from user creation for per-login flexibility)
   */
  async updateCurrentSession(userId, sessionData) {
    try {
      const timestamp = Date.now();
      const sessionDuration = 30 * 24 * 60 * 60 * 1000; // 30 days
      
      const sessionObject = {
        session_id: sessionData.session_id,
        created_at: timestamp,
        expires_at: timestamp + sessionDuration,
        last_activity_at: timestamp,
        session_status: 'active',
        source_ip: sessionData.source_ip,
        user_agent: sessionData.user_agent,
        login_method: sessionData.login_method || 'oauth'
      };

      await this.dynamodb.update({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE'
        },
        UpdateExpression: 'SET current_session = :session, updated_at = :timestamp, last_login_at = :timestamp',
        ExpressionAttributeValues: {
          ':session': sessionObject,
          ':timestamp': timestamp
        }
      }).promise();

      console.log(`Session updated for user: ${userId}`);
      return sessionObject;

    } catch (error) {
      console.error('Error updating current session:', sanitizeError(error));
      throw new Error(`Failed to update current session: ${error.message}`);
    }
  }

  // ==================== BIOMETRIC MANAGEMENT ====================

  /**
   * Update current biometric registration (optional, varies per user)
   */
  async updateCurrentBiometric(userId, biometricData) {
    try {
      const timestamp = Date.now();
      
      // Encrypt biometric hash with enhanced encryption context
      const encryptionContext = {
        userId: userId,
        operation: 'biometric_registration',
        biometric_type: biometricData.biometric_type
      };
      
      const encryptedBiometric = await encryptFields(
        { biometric_hash: biometricData.biometric_hash },
        ['biometric_hash'],
        this.kmsKeyId,
        encryptionContext
      );
      
      const biometricObject = {
        biometric_id: biometricData.biometric_id,
        biometric_type: biometricData.biometric_type, // 'fingerprint', 'face', 'voice'
        biometric_hash: encryptedBiometric.biometric_hash,
        device_id: biometricData.device_id,
        registered_at: timestamp,
        last_used_at: timestamp,
        registration_ip: biometricData.source_ip,
        status: 'active'
      };

      await this.dynamodb.update({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE'
        },
        UpdateExpression: 'SET current_biometric = :biometric, updated_at = :timestamp',
        ExpressionAttributeValues: {
          ':biometric': biometricObject,
          ':timestamp': timestamp
        }
      }).promise();

      console.log(`Biometric updated for user: ${userId}`);
      return {
        ...biometricObject,
        biometric_hash: undefined // Don't return encrypted hash
      };

    } catch (error) {
      console.error('Error updating current biometric:', sanitizeError(error));
      throw new Error(`Failed to update current biometric: ${error.message}`);
    }
  }

  // ==================== SUBSCRIPTION MANAGEMENT ====================

  /**
   * Update user's subscription (premium, yearly, etc.)
   */
  async updateSubscription(userId, subscriptionData) {
    try {
      const timestamp = Date.now();
      
      const subscriptionObject = {
        id: subscriptionData.id,
        type: subscriptionData.subscription_type,
        status: subscriptionData.subscription_status,
        provider: subscriptionData.provider,
        external_subscription_id: subscriptionData.external_subscription_id,
        start_date: subscriptionData.start_date,
        end_date: subscriptionData.end_date,
        created_at: subscriptionData.created_at || timestamp,
        updated_at: timestamp
      };

      await this.dynamodb.update({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE'
        },
        UpdateExpression: 'SET current_subscription = :subscription, updated_at = :timestamp',
        ExpressionAttributeValues: {
          ':subscription': subscriptionObject,
          ':timestamp': timestamp
        }
      }).promise();

      console.log(`Subscription updated for user: ${userId}`);
      return subscriptionObject;

    } catch (error) {
      console.error('Error updating subscription:', sanitizeError(error));
      throw new Error(`Failed to update subscription: ${error.message}`);
    }
  }

  /**
   * Get user's active subscription (for SubscriptionsFunction)
   */
  async getUserActiveSubscription(userId) {
    try {
      const userProfile = await this.getUserProfile(userId);
      if (!userProfile || !userProfile.current_subscription) {
        return null;
      }

      const subscription = userProfile.current_subscription;
      
      // Check if subscription is still active
      if (subscription.status === 'active' && subscription.end_date > Date.now()) {
        return subscription;
      }

      return null;

    } catch (error) {
      console.error('Error getting active subscription:', sanitizeError(error));
      throw new Error(`Failed to get active subscription: ${error.message}`);
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Generate email hash for GSI1 lookup
   */
  async generateEmailHash(email) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
  }

  /**
   * Decrypt user PII fields
   */
  async decryptUserPII(userItem, userId) {
    try {
      const encryptionContext = {
        userId: userId,
        operation: 'user_profile_access'
      };

      const fieldsToDecrypt = ['email', 'name', 'given_name', 'family_name'].filter(
        field => userItem[field] && typeof userItem[field] === 'string'
      );

      if (fieldsToDecrypt.length === 0) {
        return {};
      }

      const dataToDecrypt = {};
      fieldsToDecrypt.forEach(field => {
        dataToDecrypt[field] = userItem[field];
      });

      return await decryptFields(
        dataToDecrypt,
        fieldsToDecrypt,
        this.kmsKeyId,
        encryptionContext
      );

    } catch (error) {
      console.error('Error decrypting user PII:', sanitizeError(error));
      // Return empty object if decryption fails - don't break the entire request
      return {};
    }
  }

  /**
   * Security: Detect suspicious activity patterns
   */
  async detectSuspiciousActivity(userId, sourceIp, userAgent) {
    try {
      // For now, implement basic rate limiting
      // This could be enhanced with more sophisticated patterns
      
      // Check recent login frequency (stored in current_session)
      const userProfile = await this.getUserProfile(userId);
      if (!userProfile || !userProfile.current_session) {
        return { suspicious: false };
      }

      const session = userProfile.current_session;
      const timeSinceLastActivity = Date.now() - (session.last_activity_at || session.created_at);
      const minInterval = 5 * 1000; // 5 seconds minimum between requests

      if (timeSinceLastActivity < minInterval) {
        return {
          suspicious: true,
          reason: 'Too many requests in short time',
          cooldown_seconds: 5
        };
      }

      return { suspicious: false };

    } catch (error) {
      console.error('Error detecting suspicious activity:', sanitizeError(error));
      // Default to not suspicious if check fails
      return { suspicious: false };
    }
  }
}

module.exports = { DynamoDBUserService };