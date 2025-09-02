-- Initial database schema for Serenya Healthcare Platform
-- Based on database-architecture.md specifications
-- Created: September 1, 2025

-- PostgreSQL 13+ has gen_random_uuid() built-in (no extension needed)

-- Database ENUM Types
CREATE TYPE auth_provider_type AS ENUM ('google', 'apple', 'facebook');
CREATE TYPE account_status_type AS ENUM ('active', 'suspended', 'deactivated', 'deleted');
CREATE TYPE consent_type AS ENUM ('medical_disclaimers', 'terms_of_service', 'privacy_policy');
CREATE TYPE subscription_status_type AS ENUM ('active', 'expired', 'cancelled', 'pending');
CREATE TYPE subscription_type AS ENUM ('monthly', 'yearly');
CREATE TYPE payment_provider_type AS ENUM ('apple', 'google', 'stripe');
CREATE TYPE payment_status_type AS ENUM ('pending', 'completed', 'failed', 'refunded', 'disputed');
CREATE TYPE content_type AS ENUM ('result', 'report');
CREATE TYPE chat_category_type AS ENUM ('explanation', 'doctor_prep', 'clarification', 'general');

-- Users Table - Core user authentication and profile
CREATE TABLE users (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255) NOT NULL,  -- Provider's user ID (e.g., Google 'sub')
    auth_provider auth_provider_type NOT NULL,
    
    -- Profile information  
    email VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    name VARCHAR(255) NOT NULL,         -- Full display name
    given_name VARCHAR(255),            -- First name
    family_name VARCHAR(255),           -- Last name
    
    -- Account management
    account_status account_status_type DEFAULT 'active',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE,
    deactivated_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT unique_external_provider UNIQUE (external_id, auth_provider)
);

-- Indexes for performance
CREATE INDEX idx_users_external_id ON users(external_id);
CREATE INDEX idx_users_auth_provider ON users(auth_provider);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_account_status ON users(account_status);

-- Consent Records Table - Legal compliance tracking
CREATE TABLE consent_records (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Consent details
    consent_type consent_type NOT NULL,
    consent_given BOOLEAN NOT NULL,
    consent_version VARCHAR(50) NOT NULL,    -- e.g., "v2.1.0"
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    withdrawn_at TIMESTAMP WITH TIME ZONE,   -- NULL when consent is active
    
    -- Constraints: One record per consent type per user
    CONSTRAINT unique_user_consent_type UNIQUE (user_id, consent_type)
);

-- Indexes for compliance queries
CREATE INDEX idx_consent_user_id ON consent_records(user_id);
CREATE INDEX idx_consent_type ON consent_records(consent_type);
CREATE INDEX idx_consent_withdrawn ON consent_records(withdrawn_at);

-- Subscriptions Table - Premium subscription management
CREATE TABLE subscriptions (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Subscription details
    subscription_status subscription_status_type DEFAULT 'pending',
    subscription_type subscription_type NOT NULL,
    
    -- Provider integration
    provider payment_provider_type NOT NULL,
    external_subscription_id VARCHAR(255) NOT NULL,  -- Apple/Google subscription ID
    
    -- Billing periods
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_external_subscription UNIQUE (provider, external_subscription_id)
);

-- Indexes for subscription management
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(subscription_status);
CREATE INDEX idx_subscriptions_provider ON subscriptions(provider);
CREATE INDEX idx_subscriptions_end_date ON subscriptions(end_date);

-- Payments Table - Financial transaction records
CREATE TABLE payments (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Payment details
    amount DECIMAL(10,2) NOT NULL,           -- e.g., 9.99
    currency CHAR(3) NOT NULL,               -- ISO 4217: USD, EUR, etc.
    payment_status payment_status_type DEFAULT 'pending',
    
    -- Provider integration
    provider_transaction_id VARCHAR(255) NOT NULL,    -- Apple/Google/Stripe transaction ID
    payment_method VARCHAR(100) NOT NULL,             -- 'apple_pay', 'google_pay', 'credit_card'
    
    -- Timestamps
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for payment tracking
CREATE INDEX idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(payment_status);
CREATE INDEX idx_payments_provider_transaction ON payments(provider_transaction_id);

-- Chat Options Table - Predefined chat prompts/questions
CREATE TABLE chat_options (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Content categorization
    content_type content_type NOT NULL,     -- 'result' or 'report'
    category chat_category_type NOT NULL,   -- grouping for UI organization
    
    -- Option details
    option_text TEXT NOT NULL,              -- The suggested question/prompt
    display_order INTEGER NOT NULL,         -- For consistent UI ordering
    is_active BOOLEAN DEFAULT TRUE,         -- Enable/disable without deletion
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_content_category_order UNIQUE (content_type, category, display_order)
);

-- Indexes for UI queries
CREATE INDEX idx_chat_options_content_type ON chat_options(content_type, is_active, display_order);
CREATE INDEX idx_chat_options_category ON chat_options(category);

-- Schema Version Tracking
CREATE TABLE schema_versions (
    version VARCHAR(20) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

-- Insert initial version
INSERT INTO schema_versions (version, description) 
VALUES ('1.0.0', 'Initial database schema with user management, subscriptions, payments, and chat options');

-- Create application user for Lambda functions
CREATE USER serenya_app WITH PASSWORD 'temp_password_to_be_replaced';

-- Grant necessary permissions to application user
GRANT USAGE ON SCHEMA public TO serenya_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO serenya_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO serenya_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO serenya_app;

-- Grant permissions on future tables and sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO serenya_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO serenya_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO serenya_app;

-- Insert default chat options
INSERT INTO chat_options (content_type, category, option_text, display_order) VALUES
-- Result chat options
('result', 'explanation', 'Can you explain this in simpler terms?', 1),
('result', 'explanation', 'What do these numbers mean for my health?', 2),
('result', 'doctor_prep', 'What should I ask my doctor about these results?', 1),
('result', 'doctor_prep', 'What questions should I prepare for my next appointment?', 2),
('result', 'clarification', 'Are there any immediate concerns I should know about?', 1),
('result', 'clarification', 'How do these results compare to normal ranges?', 2),
('result', 'general', 'What lifestyle changes might help improve these results?', 1),

-- Report chat options  
('report', 'explanation', 'Can you summarize the key findings?', 1),
('report', 'explanation', 'What are the most important points in this report?', 2),
('report', 'doctor_prep', 'How should I present this to my doctor?', 1),
('report', 'doctor_prep', 'What questions should I ask based on this analysis?', 2),
('report', 'clarification', 'Are there any patterns or trends I should be aware of?', 1),
('report', 'clarification', 'What do these recommendations mean for my care?', 2),
('report', 'general', 'How can I use this information to improve my health?', 1);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the trigger to tables with updated_at columns
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_consent_records_updated_at BEFORE UPDATE ON consent_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chat_options_updated_at BEFORE UPDATE ON chat_options FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for observability monitoring (from observability.md requirements)
CREATE INDEX idx_users_created_timeline ON users(created_at DESC);
CREATE INDEX idx_subscriptions_created_timeline ON subscriptions(created_at DESC);
CREATE INDEX idx_payments_created_timeline ON payments(created_at DESC);

-- Comments for documentation
COMMENT ON TABLE users IS 'Core user authentication and profile information';
COMMENT ON TABLE consent_records IS 'Legal compliance tracking for medical disclaimers, terms of service, and privacy policy';
COMMENT ON TABLE subscriptions IS 'Premium subscription management for enhanced features';
COMMENT ON TABLE payments IS 'Financial transaction records for subscription billing';
COMMENT ON TABLE chat_options IS 'Predefined chat prompts and questions for user interface';
COMMENT ON TABLE schema_versions IS 'Database schema version tracking for migrations';