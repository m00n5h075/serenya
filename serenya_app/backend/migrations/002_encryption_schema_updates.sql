-- Encryption schema updates for Serenya Healthcare Platform
-- Adds searchable hash fields for encrypted data
-- Created: September 2, 2025

-- Add email_hash field to users table for searchable encrypted emails
ALTER TABLE users 
ADD COLUMN email_hash VARCHAR(64);

-- Create index for email hash searching
CREATE INDEX idx_users_email_hash ON users(email_hash);

-- Add external_subscription_id_hash to subscriptions table
ALTER TABLE subscriptions 
ADD COLUMN external_subscription_id_hash VARCHAR(64);

-- Create index for subscription external ID searching
CREATE INDEX idx_subscriptions_external_id_hash ON subscriptions(external_subscription_id_hash);

-- Add provider_transaction_id_hash to payments table for PCI DSS compliance
ALTER TABLE payments 
ADD COLUMN provider_transaction_id_hash VARCHAR(64);

-- Create index for payment transaction ID searching
CREATE INDEX idx_payments_provider_transaction_hash ON payments(provider_transaction_id_hash);

-- Update schema version
INSERT INTO schema_versions (version, description) 
VALUES ('1.1.0', 'Added searchable hash fields for encrypted data (email_hash, external_subscription_id_hash, provider_transaction_id_hash)');

-- Add comments for the new fields
COMMENT ON COLUMN users.email_hash IS 'SHA-256 hash of email for searchable encrypted data';
COMMENT ON COLUMN subscriptions.external_subscription_id_hash IS 'SHA-256 hash of external subscription ID for searchable encrypted data';
COMMENT ON COLUMN payments.provider_transaction_id_hash IS 'SHA-256 hash of provider transaction ID for searchable encrypted data (PCI DSS compliance)';

-- Performance optimization: Create composite indexes for common queries
CREATE INDEX idx_payments_user_status ON payments(user_id, payment_status);
CREATE INDEX idx_subscriptions_user_status ON subscriptions(user_id, subscription_status);
CREATE INDEX idx_users_provider_external ON users(auth_provider, external_id);

-- Add indexes for compliance and audit queries
CREATE INDEX idx_payments_processed_timeline ON payments(processed_at DESC) WHERE processed_at IS NOT NULL;
CREATE INDEX idx_subscriptions_active_users ON subscriptions(user_id, end_date DESC) WHERE subscription_status = 'active';

-- Add constraint to ensure unique email hashes (prevent duplicate encrypted emails)
CREATE UNIQUE INDEX idx_users_email_hash_unique ON users(email_hash) WHERE email_hash IS NOT NULL;