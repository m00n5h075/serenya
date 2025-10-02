// DynamoDB Data Types for Serenya Migration Plan
// Defines TypeScript interfaces for the consolidated user profile structure
// This is what goes inside the `data` field of DynamoDB records

// === CORE BUSINESS ENUMS ===
export type AuthProvider = 'google' | 'apple' | 'facebook';
export type AccountStatus = 'active' | 'suspended' | 'deactivated' | 'deleted';

// Subscription types - billing frequency, not tier names
export type SubscriptionType = 'monthly' | 'yearly';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'pending';
export type PaymentProvider = 'apple' | 'google' | 'stripe';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded' | 'disputed';

// === DEVICE AND SESSION MANAGEMENT ENUMS ===
export type DeviceStatus = 'active' | 'inactive' | 'revoked';
export type BiometricType = 'fingerprint' | 'face' | 'voice';
export type SessionStatus = 'active' | 'expired' | 'revoked';

// === SUBSCRIPTION TIER NAMES (Constants, not DB enum) ===
export type SubscriptionTierName = 'free' | 'premium' | 'family';

// Consent types (5 types from RDS schema)
export type ConsentType = 
  | 'medical_disclaimers'
  | 'terms_of_service' 
  | 'privacy_policy'
  | 'healthcare_consultation'
  | 'emergency_care_limitation';

// === BASE DYNAMODB RECORD INTERFACE ===
export interface DynamoDBRecord {
  PK: string;           // "USER#{user_id}"
  SK: string;           // "PROFILE" | "PAYMENT#{date}#{payment_id}"
  GSI1PK?: string;      // "USER_EMAIL#{sha256(email)}" for email lookups
  GSI1SK?: string;      // "PROFILE"
  GSI2PK?: string;      // "USER_EXTERNAL#{provider}#{external_id}" for external auth
  GSI2SK?: string;      // "PROFILE"
  entity_type: string;  // "user" | "payment"
  data: UserProfileData | PaymentData;
  created_at: string;
  updated_at: string;
}

// === 1. CONSENT RECORDS (from consent_records table) ===
export interface ConsentRecord {
  consent_type: ConsentType;       // Which consent this is
  consent_given: boolean;          // Whether consent was given
  consent_version: string;         // Version of terms (e.g., "v2.1.0")
  consent_method: string;          // How consent was given (e.g., "bundled_consent")
  ui_checkbox_group: number;       // Which UI group it belonged to
  created_at: string;              // When consent was first given
  updated_at: string;              // When consent was last updated
  withdrawn_at: string | null;     // When consent was withdrawn (if ever)
}

// Consents object - one record per consent type
export interface ConsentsObject {
  medical_disclaimers: ConsentRecord;
  terms_of_service: ConsentRecord;
  privacy_policy: ConsentRecord;
  healthcare_consultation: ConsentRecord;
  emergency_care_limitation: ConsentRecord;
}

// === 2. CURRENT USER DEVICE (from user_devices table) ===
export interface CurrentDevice {
  device_id: string;               // Unique device identifier
  device_name: string;             // User-friendly name (e.g., "iPhone 15 Pro")
  platform: string;               // "ios" | "android"
  model: string;                   // Device model
  os_version: string;              // OS version
  app_version: string;             // App version
  biometric_type: BiometricType;   // Type of biometric available
  secure_element: boolean;         // Whether device has secure element
  public_key: string;              // Device hardware public key
  status: DeviceStatus;            // Device status
  last_active_at: string;          // When device was last active
  created_at: string;              // When device was registered
  updated_at: string;              // When device info was last updated
}

// === 3. CURRENT USER SESSION (from user_sessions table) ===
export interface CurrentSession {
  session_id: string;              // Unique session identifier
  device_id: string;               // Which device this session is on
  refresh_token_hash: string;      // Hashed refresh token
  access_token_hash: string;       // Hashed access token
  status: SessionStatus;           // Session status
  created_at: string;              // When session was created
  last_accessed_at: string;        // When session was last used
  expires_at: string;              // When session expires
  last_biometric_auth_at: string;  // When biometric auth last occurred
  biometric_expires_at: string;    // When biometric auth expires
  requires_biometric_reauth: boolean; // Whether biometric reauth is needed
  updated_at: string;              // When session was last updated
}

// === 4. CURRENT BIOMETRIC REGISTRATION (from biometric_registrations table) ===
export interface DeviceAttestationData {
  secure_enclave: boolean;         // Whether secure enclave is available
  attestation_cert: string;        // Device attestation certificate
}

export interface RegistrationMetadata {
  registration_source: string;     // How registration was initiated
}

export interface CurrentBiometric {
  device_id: string;               // Which device this is for
  registration_id: string;         // Unique registration identifier
  biometric_type: BiometricType;   // Type of biometric registered
  challenge: string;               // Current challenge data
  challenge_expires_at: string;    // When challenge expires
  is_verified: boolean;            // Whether biometric is verified
  is_active: boolean;              // Whether biometric is active
  verification_failures: number;   // Number of failed verifications
  device_attestation_data: DeviceAttestationData;
  registration_metadata: RegistrationMetadata;
  created_at: string;              // When biometric was registered
  updated_at: string;              // When biometric was last updated
  last_verified_at: string;        // When biometric was last verified
}

// === 5. CURRENT SUBSCRIPTION (from subscriptions table) ===
export interface UsageCurrentPeriod {
  documents_processed: number;     // Documents processed this period
  period_start: string;            // When current period started
  period_end: string;              // When current period ends
}

export interface CurrentSubscription {
  subscription_id: string;         // Unique subscription identifier
  subscription_status: SubscriptionStatus; // Subscription status
  subscription_type: SubscriptionType;     // Billing frequency
  provider: PaymentProvider;       // Who processes payments
  external_subscription_id: string;        // Provider's subscription ID
  external_subscription_id_hash: string;   // Hashed external ID
  start_date: string;              // When subscription started
  end_date: string;                // When subscription ends
  next_billing_date: string;       // When next billing occurs
  usage_current_period: UsageCurrentPeriod; // Usage tracking
  created_at: string;              // When subscription was created
  updated_at: string;              // When subscription was last updated
}

// === CONSOLIDATED USER PROFILE DATA (6 tables → 1 object) ===
export interface UserProfileData {
  // === CORE USER DATA (from users table) ===
  id: string;                      // User UUID
  external_id: string;             // OAuth provider's user ID
  auth_provider: AuthProvider;     // Which OAuth provider
  email: string;                   // User email
  email_hash: string;              // SHA256 hash of email
  email_verified: boolean;         // Whether email is verified
  name: string;                    // Full name
  given_name: string;              // First name
  family_name: string;             // Last name
  account_status: AccountStatus;   // Account status
  last_login_at: string;           // When user last logged in
  deactivated_at: string | null;   // When account was deactivated
  
  // === EMBEDDED OBJECTS (from other tables) ===
  consents: ConsentsObject;        // From consent_records table
  current_device: CurrentDevice;   // From user_devices table
  current_session: CurrentSession; // From user_sessions table
  current_biometric: CurrentBiometric; // From biometric_registrations table
  current_subscription: CurrentSubscription; // From subscriptions table
}

// === PAYMENT DATA (separate records, from payments table) ===
export interface PaymentData {
  payment_id: string;              // Unique payment identifier
  subscription_id: string;         // Which subscription this payment is for
  amount: number;                  // Payment amount
  currency: string;                // Currency code (e.g., "USD")
  payment_status: PaymentStatus;   // Payment status
  provider_transaction_id: string; // Provider's transaction ID
  payment_method: string;          // How payment was made
  processed_at: string;            // When payment was processed
}

// === TYPED DYNAMODB RECORDS ===
export interface UserRecord extends DynamoDBRecord {
  PK: string;                      // "USER#{user_id}"
  SK: "PROFILE";
  GSI1PK: string;                  // "USER_EMAIL#{sha256(email)}"
  GSI1SK: "PROFILE";
  GSI2PK: string;                  // "USER_EXTERNAL#{provider}#{external_id}"
  GSI2SK: "PROFILE";
  entity_type: "user";
  data: UserProfileData;
}

export interface PaymentRecord extends DynamoDBRecord {
  PK: string;                      // "USER#{user_id}"
  SK: string;                      // "PAYMENT#{date}#{payment_id}"
  entity_type: "payment";
  data: PaymentData;
}

// === HELPER FUNCTIONS FOR KEY GENERATION ===
export const DynamoDBKeys = {
  // User profile keys
  userPK: (userId: string): string => `USER#${userId}`,
  userSK: (): string => "PROFILE",
  
  // Email lookup keys
  emailGSI1PK: (emailHash: string): string => `USER_EMAIL#${emailHash}`,
  emailGSI1SK: (): string => "PROFILE",
  
  // External auth lookup keys
  externalAuthGSI2PK: (provider: AuthProvider, externalId: string): string => 
    `USER_EXTERNAL#${provider}#${externalId}`,
  externalAuthGSI2SK: (): string => "PROFILE",
  
  // Payment record keys
  paymentPK: (userId: string): string => `USER#${userId}`,
  paymentSK: (date: string, paymentId: string): string => `PAYMENT#${date}#${paymentId}`
};