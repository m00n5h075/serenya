const AWS = require('aws-sdk');
const crypto = require('crypto');

// Initialize KMS client
const kms = new AWS.KMS({
  region: process.env.REGION || 'eu-west-1'
});

// In-memory cache for data keys (performance optimization)
const dataKeyCache = new Map();
const CACHE_TTL = 3600000; // 1 hour in milliseconds
const MAX_CACHE_SIZE = 100;

/**
 * Generate or retrieve cached data key for encryption
 * @param {string} keyId - KMS key ID or ARN
 * @param {string} context - Encryption context for additional security
 * @returns {Promise<Object>} Data key with plaintext and encrypted versions
 */
async function getDataKey(keyId, context = {}) {
  const cacheKey = `${keyId}:${JSON.stringify(context)}`;
  const cached = dataKeyCache.get(cacheKey);
  
  // Return cached key if still valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return {
      plaintextKey: cached.plaintextKey,
      encryptedKey: cached.encryptedKey
    };
  }
  
  try {
    const params = {
      KeyId: keyId,
      KeySpec: 'AES_256'
    };
    
    // Add encryption context if provided for additional security
    if (Object.keys(context).length > 0) {
      params.EncryptionContext = context;
    }
    
    const result = await kms.generateDataKey(params).promise();
    
    const dataKey = {
      plaintextKey: result.Plaintext,
      encryptedKey: result.CiphertextBlob,
      timestamp: Date.now()
    };
    
    // Cache the data key with size limit
    if (dataKeyCache.size >= MAX_CACHE_SIZE) {
      // Remove oldest entry
      const oldestKey = dataKeyCache.keys().next().value;
      dataKeyCache.delete(oldestKey);
    }
    
    dataKeyCache.set(cacheKey, dataKey);
    
    return {
      plaintextKey: dataKey.plaintextKey,
      encryptedKey: dataKey.encryptedKey
    };
    
  } catch (error) {
    console.error('Failed to generate data key:', error);
    throw new Error('Encryption key generation failed');
  }
}

/**
 * Decrypt a data key from KMS
 * @param {Buffer} encryptedKey - Encrypted data key blob
 * @param {Object} context - Encryption context used during encryption
 * @returns {Promise<Buffer>} Decrypted data key
 */
async function decryptDataKey(encryptedKey, context = {}) {
  try {
    const params = {
      CiphertextBlob: encryptedKey
    };
    
    // Add encryption context if provided
    if (Object.keys(context).length > 0) {
      params.EncryptionContext = context;
    }
    
    const result = await kms.decrypt(params).promise();
    return result.Plaintext;
    
  } catch (error) {
    console.error('Failed to decrypt data key:', error);
    throw new Error('Data key decryption failed');
  }
}

/**
 * Encrypt sensitive data using AES-256-GCM
 * @param {string} plaintext - Data to encrypt
 * @param {string} keyId - KMS key ID or ARN
 * @param {Object} context - Encryption context for additional security
 * @returns {Promise<string>} Base64 encoded encrypted data with metadata
 */
async function encryptData(plaintext, keyId, context = {}) {
  if (!plaintext) {
    return null;
  }
  
  try {
    // Get data key from KMS
    const { plaintextKey, encryptedKey } = await getDataKey(keyId, context);
    
    // Generate random IV for AES-GCM
    const iv = crypto.randomBytes(16);
    
    // Create cipher
    const cipher = crypto.createCipher('aes-256-gcm', plaintextKey);
    cipher.setAAD(Buffer.from(JSON.stringify(context)));
    
    // Encrypt data
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // Get authentication tag
    const authTag = cipher.getAuthTag();
    
    // Create encrypted payload with metadata
    const encryptedPayload = {
      version: '1.0',
      algorithm: 'AES-256-GCM',
      encryptedKey: encryptedKey.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      data: encrypted.toString('base64'),
      context: context
    };
    
    return Buffer.from(JSON.stringify(encryptedPayload)).toString('base64');
    
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Data encryption failed');
  }
}

/**
 * Decrypt sensitive data using AES-256-GCM
 * @param {string} encryptedData - Base64 encoded encrypted data with metadata
 * @returns {Promise<string>} Decrypted plaintext data
 */
async function decryptData(encryptedData) {
  if (!encryptedData) {
    return null;
  }
  
  try {
    // Parse encrypted payload
    const payload = JSON.parse(Buffer.from(encryptedData, 'base64').toString('utf8'));
    
    // Validate payload version
    if (payload.version !== '1.0') {
      throw new Error('Unsupported encryption version');
    }
    
    // Decrypt data key
    const encryptedKey = Buffer.from(payload.encryptedKey, 'base64');
    const plaintextKey = await decryptDataKey(encryptedKey, payload.context);
    
    // Extract components
    const iv = Buffer.from(payload.iv, 'base64');
    const authTag = Buffer.from(payload.authTag, 'base64');
    const data = Buffer.from(payload.data, 'base64');
    
    // Create decipher
    const decipher = crypto.createDecipher('aes-256-gcm', plaintextKey);
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from(JSON.stringify(payload.context)));
    
    // Decrypt data
    let decrypted = decipher.update(data);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
    
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Data decryption failed');
  }
}

/**
 * Encrypt multiple fields in an object
 * @param {Object} data - Object with fields to encrypt
 * @param {string[]} fieldsToEncrypt - Array of field names to encrypt
 * @param {string} keyId - KMS key ID or ARN
 * @param {Object} context - Encryption context
 * @returns {Promise<Object>} Object with encrypted fields
 */
async function encryptFields(data, fieldsToEncrypt, keyId, context = {}) {
  if (!data || !fieldsToEncrypt || fieldsToEncrypt.length === 0) {
    return data;
  }
  
  const encryptedData = { ...data };
  
  // Encrypt each specified field
  for (const field of fieldsToEncrypt) {
    if (encryptedData[field] !== undefined && encryptedData[field] !== null) {
      encryptedData[field] = await encryptData(String(encryptedData[field]), keyId, {
        ...context,
        field: field
      });
    }
  }
  
  return encryptedData;
}

/**
 * Decrypt multiple fields in an object
 * @param {Object} data - Object with encrypted fields
 * @param {string[]} fieldsToDecrypt - Array of field names to decrypt
 * @returns {Promise<Object>} Object with decrypted fields
 */
async function decryptFields(data, fieldsToDecrypt) {
  if (!data || !fieldsToDecrypt || fieldsToDecrypt.length === 0) {
    return data;
  }
  
  const decryptedData = { ...data };
  
  // Decrypt each specified field
  for (const field of fieldsToDecrypt) {
    if (decryptedData[field] !== undefined && decryptedData[field] !== null) {
      decryptedData[field] = await decryptData(decryptedData[field]);
    }
  }
  
  return decryptedData;
}

/**
 * Hash sensitive data for indexing (SHA-256)
 * @param {string} data - Data to hash
 * @returns {string} Hex encoded hash
 */
function hashForIndex(data) {
  if (!data) {
    return null;
  }
  
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate searchable hash with salt for email addresses
 * @param {string} email - Email address to hash
 * @param {string} salt - Salt for hashing (should be consistent per environment)
 * @returns {string} Hex encoded salted hash
 */
function hashEmail(email, salt = process.env.EMAIL_HASH_SALT || 'default_salt') {
  if (!email) {
    return null;
  }
  
  return crypto.createHash('sha256').update(email.toLowerCase() + salt).digest('hex');
}

/**
 * Clear cached data keys (for security or memory management)
 */
function clearDataKeyCache() {
  dataKeyCache.clear();
  console.log('Data key cache cleared');
}

/**
 * Get cache statistics for monitoring
 * @returns {Object} Cache statistics
 */
function getCacheStats() {
  const now = Date.now();
  let validEntries = 0;
  let expiredEntries = 0;
  
  for (const [key, value] of dataKeyCache.entries()) {
    if (now - value.timestamp < CACHE_TTL) {
      validEntries++;
    } else {
      expiredEntries++;
    }
  }
  
  return {
    totalEntries: dataKeyCache.size,
    validEntries,
    expiredEntries,
    maxSize: MAX_CACHE_SIZE,
    cacheTtl: CACHE_TTL
  };
}

module.exports = {
  // Core encryption functions
  encryptData,
  decryptData,
  encryptFields,
  decryptFields,
  
  // Utility functions
  hashForIndex,
  hashEmail,
  
  // Cache management
  clearDataKeyCache,
  getCacheStats,
  
  // Internal functions (for testing)
  getDataKey,
  decryptDataKey
};