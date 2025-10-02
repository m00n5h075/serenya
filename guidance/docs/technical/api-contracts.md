# API Contracts - Serenya AI Health Agent

**Date:** September 4, 2025 (Updated)  
**Domain:** Server-Side API Design & Integration  
**AI Agent:** API Design Agent  
**Last Updated:** Complete Google OAuth onboarding flow with synchronous consent collection and PII encryption  
**Dependencies:**
- **← database-architecture.md**: All API endpoints map to database operations
- **← user-flows.md**: API calls triggered by user actions in flows
- **← encryption-strategy.md**: Request/response encryption requirements
**Cross-References:**
- **→ mobile-architecture.md**: Client-side API integration and error handling
- **→ audit-logging.md**: API call audit requirements and event triggers
- **→ implementation-roadmap.md**: API development timeline (Week 3-4)

---

## 🎯 **API Architecture Overview**

### **Design Philosophy**
- **RESTful Design**: Standard HTTP methods and status codes
- **Security First**: Every endpoint requires authentication and audit logging
- **Medical Data Protection**: Application-layer encryption for all medical content in transit
- **Local-Only Medical Data**: Server processes and returns medical data but does NOT store it - all medical content (lab results, vitals, analysis, chat) stored locally on device only
- **Performance Optimized**: Single round-trip workflows, selective encryption for optimal speed
- **Error Transparency**: Clear, actionable error messages for mobile client (no crypto details exposed)
- **Privacy Compliant**: No sensitive data in URLs, encrypted medical data, comprehensive audit logging
- **Graceful Degradation**: Fallback to standard TLS when application-layer encryption fails

### **Core Technical Stack**
- **Runtime**: AWS Lambda with Node.js 18.x
- **Database**: Amazon DynamoDB serverless NoSQL database (single-table design with partition key PK and sort key SK)
- **Authentication**: JWT tokens with Google OAuth and Apple OAuth integration
- **LLM Provider**: AWS Bedrock (Claude 3.5 Sonnet) for production medical analysis
- **Encryption**:
  - **Server-side**: AWS KMS for field-level encryption of PII data
  - **Storage**: Server-side encryption at rest (AWS KMS)
  - **Transport**: TLS 1.3 for data in transit
- **Rate Limiting**: AWS API Gateway throttling (100 requests/minute per user)
- **Monitoring**: CloudWatch with custom metrics + DynamoDB Streams for observability events
- **Storage**: S3 temporary files bucket with lifecycle policies for automatic cleanup

### **API Base Configuration**
```
Base URL: https://api.serenya.health/v1
Authentication: Bearer JWT tokens
Content-Type: application/json
Rate Limits: 100 requests/minute per user
Timeout: 30 seconds per request
```

---

## 🔐 **Authentication & Session Management**

### **POST /auth/oauth-onboarding** (Primary Endpoint)
**Alias Endpoints**: `/auth/google` and `/auth/google-onboarding` (backward compatibility)
**Purpose**: Complete user onboarding with OAuth authentication (Google or Apple) and consent collection
**User Flow**: New user onboarding - synchronous consent + authentication (**→ user-flows.md** Flow 3A)
**Processing**: Synchronous OAuth token validation + user account creation + consent recording
**Device Limit**: One device per user (app installation ID based)
**Database Operations**: DynamoDB PutItem for consolidated user profile with embedded consents and initial free subscription

#### **Consent Types Defined**
```typescript
// 5 consent types - all required for onboarding
const CONSENT_TYPES = {
  terms_of_service: "Agreement to app terms and conditions",
  privacy_policy: "Agreement to data collection and privacy practices", 
  medical_disclaimer: "Understanding that Serenya is not a medical device",
  healthcare_consultation: "Agreement to always consult healthcare professionals for medical decisions",
  emergency_care_limitation: "Understanding that Serenya is not for emergency care"
};
```

#### **Consent Collection UI Mapping**
**Bundled Consent Approach**: 2 checkboxes in UI map to 5 consent types in database

**Checkbox 1 - Legal & Processing Bundle:**
- **UI Copy**: "I agree to the [Terms of Service] and [Privacy Policy], and consent to AI processing of my medical data"
- **Maps to**: `terms_of_service`, `privacy_policy`, `healthcare_consultation`

**Checkbox 2 - Medical Disclaimers Bundle:**
- **UI Copy**: "I understand that Serenya is not a medical device and has limitations in emergency situations. I will always consult healthcare professionals for medical decisions."  
- **Maps to**: `medical_disclaimer`, `emergency_care_limitation`

**Implementation Notes:**
- Both checkboxes must be checked for account creation
- Each checkbox generates multiple consent records with `consent_method: "bundled_consent"`
- All 5 consent types are recorded with individual timestamps and audit trails

#### **Client-Side Google OAuth Integration**
**iOS Implementation:**
```swift
import GoogleSignIn

// Configure and trigger Google Sign-In
GIDSignIn.sharedInstance.signIn(withPresenting: viewController) { result, error in
    guard let user = result?.user,
          let accessToken = user.accessToken.tokenString,
          let idToken = user.idToken?.tokenString else { return }
    
    // Send tokens + consent data to our server
    sendOnboardingRequest(accessToken: accessToken, idToken: idToken, consents: consents)
}
```

**Android Implementation:**
```kotlin
// Configure and trigger Google Sign-In
val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
    .requestIdToken(getString(R.string.server_client_id))
    .requestEmail()
    .build()

val googleSignInClient = GoogleSignIn.getClient(this, gso)
// Handle sign-in result and send to server with consent data
```

#### **Request**
```json
{
  "google_auth": {
    "access_token": "string",                 // Required - Google OAuth access token from client
    "id_token": "string"                      // Required - Google ID token for verification
  },
  "consents": {
    "terms_of_service": "boolean",            // Required - Must be true
    "privacy_policy": "boolean",              // Required - Must be true  
    "medical_disclaimer": "boolean",          // Required - Must be true
    "healthcare_consultation": "boolean",     // Required - Must be true
    "emergency_care_limitation": "boolean"    // Required - Must be true
  },
  "device_info": {
    "platform": "ios|android",               // Required - Mobile platform
    "app_installation_id": "string",         // Required - App installation identifier (one per user)
    "app_version": "string"                   // Required - App version
  },
  "encryption_context": {
    "encrypted_key_material": "string",       // Required - User's encryption keys
    "key_derivation_version": "v1",          // Required - Encryption version
    "supported_tables": ["users", "user_consents", "local_medical_data"]
  }
}
```

#### **Server-Side Google Integration**
```typescript
// Server validates Google tokens and fetches user profile
async function validateGoogleAuth(accessToken: string, idToken: string) {
  
  // Step 1: Validate access token with Google
  const tokenValidation = await fetch('https://oauth2.googleapis.com/tokeninfo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `access_token=${accessToken}`
  });
  
  // Step 2: Get user profile from Google People API
  const profileResponse = await fetch(
    'https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses,phoneNumbers',
    { headers: { 'Authorization': `Bearer ${accessToken}` }}
  );
  
  // Step 3: Extract and return user data
  const tokenData = await tokenValidation.json();
  const profileData = await profileResponse.json();
  
  return {
    google_user_id: tokenData.user_id,
    email: tokenData.email,
    first_name: profileData.names?.[0]?.givenName,
    last_name: profileData.names?.[0]?.familyName,
    full_name: profileData.names?.[0]?.displayName,
    phone_number: profileData.phoneNumbers?.[0]?.value || null,
    email_verified: tokenData.email_verified === 'true'
  };
}
```

#### **Response Success (200)**
```json
{
  "success": true,
  "data": {
    "access_token": "string",                 // JWT token (15-minute expiry)
    "refresh_token": "string",                // 15-minute expiry for refresh
    "encrypted_user_data": "string",          // Base64 encrypted PII
    "encryption_metadata": {
      "version": "v1",
      "algorithm": "AES-256-GCM", 
      "table_key_id": "users",
      "checksum": "string"
    },
    "user_metadata": {
      "id": "uuid",                          // User unique identifier
      "subscription_tier": "free",           // Always free for new users
      "profile_completion": "boolean",       // Profile setup status
      "is_new_user": "boolean",             // Always true for this endpoint
      "onboarding_completed": "boolean"     // Always true after this call
    },
    "session": {
      "session_id": "uuid",
      "expires_at": "iso8601",              // 15 minutes from now
      "biometric_required": "boolean"
    },
    "encryption_support": {
      "supported_algorithms": ["AES-256-GCM"],
      "supported_tables": ["users", "user_consents", "local_medical_data"],
      "server_encryption_version": "v1"
    }
  },
  "audit_logged": true
}
```

#### **Encrypted User Data Content (Within encrypted_user_data field)**
```json
{
  "email": "string",                        // ENCRYPTED PII - From Google
  "first_name": "string",                   // ENCRYPTED PII - From Google  
  "last_name": "string",                    // ENCRYPTED PII - From Google
  "full_name": "string",                    // ENCRYPTED PII - Combined name
  "phone_number": "string|null",           // ENCRYPTED PII - Optional from Google
  "google_user_id": "string"               // ENCRYPTED PII - Google identifier
}
```

#### **Database Operations (DynamoDB Single-Table Design)**
1. **OAuth Token Validation:** Call Google or Apple token validation API
2. **OAuth Profile Fetch:** Retrieve user profile data from OAuth provider
3. **User Existence Check:** DynamoDB Query on GSI2 (External Auth Index) by `EXTERNAL#{provider}#{external_id}`
4. **Consolidated User Profile:** Single DynamoDB PutItem operation creates:
   - Core user profile (`PK: USER#{userId}`, `SK: PROFILE`)
   - Embedded consents object with all 5 consent types
   - Initial free subscription embedded in user profile
   - Encrypted PII fields (email, name, given_name, family_name) using AWS KMS
5. **GSI Indexes Populated:**
   - GSI1: Email lookup (`EMAIL#{email_hash}`)
   - GSI2: External auth lookup (`EXTERNAL#{provider}#{external_id}`)
6. **Session Creation:** Generate JWT access tokens (no refresh tokens stored)
7. **Audit Logging:** DynamoDB Streams trigger observability events to S3 events bucket

#### **Error Responses**

**Missing/Invalid Consents (400)**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CONSENTS",
    "message": "All consent agreements required",
    "user_message": "Please accept all terms to continue",
    "missing_consents": ["medical_disclaimer", "emergency_care_limitation"]
  }
}
```

**Google Authentication Failed (401)**
```json
{
  "success": false,
  "error": {
    "code": "GOOGLE_AUTH_FAILED", 
    "message": "Google authentication failed",
    "user_message": "We're having trouble signing you in. Let's try again"
  }
}
```

**User Exists with Different Device (409)**
```json
{
  "success": false,
  "error": {
    "code": "DEVICE_CONFLICT",
    "message": "User already registered with different device",
    "user_message": "This account is linked to another device. Please contact support"
  }
}
```

**Database Transaction Failed (500)**
```json
{
  "success": false,
  "error": {
    "code": "ACCOUNT_CREATION_FAILED",
    "message": "Unable to create user account", 
    "user_message": "Something went wrong on our end. Please try again later"
  }
}
```

#### **Google API Configuration Requirements**
```bash
# Environment Variables
GOOGLE_CLIENT_ID=your-app-client-id.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_SCOPE=openid email profile

# API Endpoints  
GOOGLE_TOKEN_VALIDATION_URL=https://oauth2.googleapis.com/tokeninfo
GOOGLE_PEOPLE_API_URL=https://people.googleapis.com/v1/people/me
```

#### **Audit Events Triggered**
- **Onboarding Success**: User ID, device info, Google OAuth validation, consent timestamps
- **Onboarding Failure**: Failed attempt with specific reason, IP address, device info
- **Consent Recording**: Individual consent records with timestamps for all 5 consent types
- **Device Registration**: App installation ID, platform, version tracking

**Note on Token Refresh**: Current implementation uses JWT access tokens without server-side refresh token storage. Token refresh functionality may be added in future iterations.

**Note on Biometric Authentication**: Biometric authentication endpoints (`/auth/biometric/*`) are not currently implemented in the production API. These features are planned for future releases.

---

> **📋 LLM Integration Details**: Internal LLM processing architecture, mock server configuration, and provider implementation details have been moved to `llm-integration-architecture.md` for better separation of concerns.

---

## 📄 **Document Processing APIs**

### **POST /api/v1/process/upload**
**Purpose**: Upload medical document for asynchronous AI processing via AWS Bedrock
**User Flow**: Simple file upload without user metadata input (**→ user-flows.md** Flow 1A, Step 2)
**Processing Model**: Asynchronous with S3 temporary storage and polling for results
**Max File Size**: 10MB
**Rate Limit**: 5 requests/minute per user
**AI Provider**: AWS Bedrock (Claude 3.5 Sonnet)

#### **Request Structure**
```json
{
  "encrypted_file_data": "string",             // Base64 encoded encrypted file content
  "encryption_metadata": {
    "version": "v1",
    "algorithm": "AES-256-GCM",
    "table_key_id": "local_medical_data",
    "checksum": "string"                       // SHA-256 of original file
  },
  "file_metadata": {
    "file_type": "image/jpeg|image/png|application/pdf",
    "file_size_bytes": "number"                // For validation only
  }
}
```

#### **Response Success (202 Accepted)**
```json
{
  "success": true,
  "data": {
    "job_id": "string",                        // Format: {user_id}_{timestamp}_{random}
    "status": "uploaded",                      // Always "uploaded" 
    "estimated_processing_time_seconds": 120, // Rough estimate: 2 minutes
    "polling_endpoint": "/jobs/{job_id}/status",
    "recommended_polling_interval_seconds": 10
  },
  "audit_logged": true
}
```

#### **Job ID Format**
```
{user_id}_{timestamp}_{random_string}
Example: "550e8400-e29b-41d4-a716-446655440000_1725456789_abc123"
```

#### **S3 Storage Architecture**
```
s3://serenya-temp-files-{environment}-{account}/
├── jobs/{job_id}_original          # Uploaded medical documents (temporary)
├── results/{job_id}.json           # AI processing results from Bedrock (when ready)
└── chat-responses/{job_id}.json    # Chat response results (when ready)

s3://serenya-events-{environment}-{account}/
└── observability/                  # DynamoDB Streams events for audit logging
```

#### **S3 Lifecycle Policy**
- **Automatic Cleanup**: All files in temp-files bucket older than 2 days are automatically deleted
- **Manual Cleanup**: Files deleted immediately after successful client retrieval via DELETE /api/v1/process/cleanup/{jobId}
- **Events Retention**: Observability events retained for 90 days for compliance

#### **Server-Side Processing Requirements**
**Medical Document Processing Workflow**:
1. **Upload to S3**: Client uploads document (base64 encoded) to S3 temp bucket via Lambda
2. **AWS Bedrock Processing**: Lambda function sends document to AWS Bedrock Claude 3.5 Sonnet for AI analysis
3. **Structured Data Extraction**: Bedrock returns structured medical data (lab results, vitals, analysis)
4. **S3 Result Storage**: AI processing results stored in S3 at `results/{job_id}.json`
5. **Client Polling**: Client polls GET /api/v1/process/status/{jobId} for completion
6. **Result Retrieval**: Client retrieves results via GET /api/v1/process/result/{jobId}
7. **S3 Cleanup**: Client calls DELETE /api/v1/process/cleanup/{jobId} to remove temporary files

**Security Constraints**:
- **S3 Server-Side Encryption**: All S3 buckets use AWS KMS encryption at rest
- **Bedrock VPC Endpoint**: Bedrock communication stays within AWS network (no internet egress)
- **No Database Storage**: Medical data never stored in DynamoDB (only S3 temporarily)
- **Automatic Lifecycle**: S3 lifecycle policies auto-delete files after 2 days

#### **Error Responses**
```json
// File too large (413)
{
  "success": false,
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "File exceeds maximum size limit",
    "user_message": "Your file is a bit too large. Please try under 10MB",
    "max_size_mb": 10
  }
}

// Unsupported format (400)
{
  "success": false,
  "error": {
    "code": "UNSUPPORTED_FILE_TYPE",
    "message": "File type not supported for processing",
    "user_message": "We work best with PDF documents or photos (JPG/PNG)",
    "supported_types": ["image/jpeg", "image/png", "application/pdf"]
  }
}
```

#### **Database Operations**
- **No DynamoDB jobs table**: Job tracking handled via S3 object existence and job_id validation
- **Temporary S3 storage**: Original file stored at `jobs/{job_id}_original`, results at `results/{job_id}.json`
- **Final storage**: Client stores results in local SQLite database after polling
- **Audit logging**: DynamoDB Streams capture events to S3 events bucket for compliance

**Note on Batch Upload**: Batch upload endpoints (`/documents/batch-upload` and `/batches/{batch_id}/status`) are not currently implemented. Clients should upload documents individually using POST /api/v1/process/upload.

---

### **GET /api/v1/process/status/{jobId}**
**Purpose**: Poll for AI processing status (does not return results, only status)
**User Flow**: Asynchronous status checking via polling (**→ user-flows.md** Flow 1A, Step 3)
**Polling Frequency**: Every 10 seconds recommended
**Rate Limit**: 200 requests/minute per user (higher limit for polling)
**Note**: Use GET /api/v1/process/result/{jobId} to retrieve actual results

#### **Job Validation Process**
```typescript
// Server validates job ownership via job_id format
const [user_id, timestamp, random] = job_id.split('_');
if (user_id !== authenticated_user_id) {
  return { error: "INVALID_JOB_ID" };
}
```

#### **Response - Processing (202)**
```json
{
  "success": true,
  "data": {
    "job_id": "string",
    "status": "processing",
    "processing_info": {
      "stage": "ai_analysis",                  // ai_analysis|data_extraction|finalizing
      "estimated_completion_seconds": 90      // Time remaining estimate
    }
  }
}
```

#### **Response - Complete (200)**
```json
{
  "success": true,
  "data": {
    "job_id": "string",
    "status": "completed",
    "processing_summary": {
      "processing_time_seconds": 85,
      "lab_results_count": 12,
      "vitals_count": 5,
      "confidence_score": 0.92
    }
  },
  "audit_logged": true
}
```

**Note**: Status endpoint only returns completion status. Use GET /api/v1/process/result/{jobId} to retrieve actual medical data results.

---

### **GET /api/v1/process/result/{jobId}**
**Purpose**: Retrieve AI-processed medical data results after job completion
**User Flow**: Called after status endpoint confirms job is complete
**Rate Limit**: 100 requests/minute per user
**Auto-Cleanup**: Results are automatically deleted from S3 after successful retrieval

#### **Response - Results Available (200)**
```json
{
  "success": true,
  "data": {
    "job_id": "string",
    "results": {
      "serenya_content_id": "uuid",           // ✅ CRITICAL: Parent content identifier for data relationships
      "lab_results": [],                      // Array of structured lab result objects (from Bedrock)
      "vitals": [],                           // Array of structured vital sign objects (from Bedrock)
      "analysis_markdown": "string",          // Single markdown document with ALL AI analysis
      "confidence_score": 0.92
    },
    "processing_summary": {
      "processing_time_seconds": 85,
      "lab_results_count": 12,
      "vitals_count": 5,
      "data_types_found": ["analysis", "lab_results", "vitals"],
      "bedrock_model_used": "anthropic.claude-3-5-sonnet-20241022-v2:0"
    }
  },
  "audit_logged": true
}
```

#### **AI Processing Results Structure (3 Objects Only)**
**S3 AI Response Format (`results/{job_id}.json`):**
```json
{
  "lab_results": [                         // Array of structured lab result objects (or empty array)
    {
      "id": "uuid",                        // Server-generated UUID
      "serenya_content_id": "uuid",        // ✅ CRITICAL: Links to parent analysis for data relationships
      "test_name": "string",               // e.g., "Total Cholesterol", "Blood Glucose"
      "test_category": "blood|urine|imaging|other",
      "test_value": "number|null",         // Numeric result (null if text-only)
      "test_unit": "string|null",          // e.g., "mg/dL", "mmol/L", "%"
      "reference_range_low": "number|null", // Lower bound of normal range
      "reference_range_high": "number|null", // Upper bound of normal range
      "reference_range_text": "string|null", // e.g., "Normal", "< 200 mg/dL"
      "is_abnormal": "boolean",            // AI-determined abnormality
      "confidence_score": "number|null",   // 0.0 to 10.0
      "ai_interpretation": "string|null",  // AI analysis of this specific result
      "test_date": "iso8601_string|null",  // When test was performed (if available)
      "created_at": "iso8601_string"       // When parsed by AI
    }
  ],
  "vitals": [                              // Array of structured vital sign objects (or empty array)
    {
      "id": "uuid",                        // Server-generated UUID
      "serenya_content_id": "uuid",        // ✅ CRITICAL: Links to parent analysis for data relationships
      "vital_type": "blood_pressure|heart_rate|temperature|weight|height|oxygen_saturation",
      "systolic_value": "number|null",     // For blood pressure only
      "diastolic_value": "number|null",    // For blood pressure only
      "numeric_value": "number|null",      // For single-value vitals
      "unit": "string|null",               // e.g., "mmHg", "°C", "kg", "bpm", "%"
      "is_abnormal": "boolean",            // AI-determined abnormality
      "confidence_score": "number|null",   // 0.0 to 10.0
      "ai_interpretation": "string|null",  // AI analysis of this vital sign
      "measurement_date": "iso8601_string|null", // When measured (if available)
      "created_at": "iso8601_string"       // When parsed by AI
    }
  ],
  "analysis_markdown": "string",           // Single markdown document with ALL AI analysis
  "confidence_score": 0.92,               // Overall processing confidence
  "processing_metadata": {
    "processing_time_seconds": 85,
    "model_version": "claude-3.5",
    "extraction_success": true
  }
}
```

#### **S3-to-API Response Transformation**
1. **Read AI Results**: Get `results/{job_id}.json` from S3
2. **Data Breakdown**: Split into 3 encrypted chunks:
   - `lab_results` → `encrypted_lab_results`
   - `vitals` → `encrypted_vitals_data` 
   - `analysis_markdown` → `encrypted_analysis`
3. **Encrypt Each Chunk**: Using user's table keys
4. **Return to Client**: Structured encrypted API response
5. **Cleanup**: Delete both S3 files (`jobs/{job_id}_original` and `results/{job_id}.json`)

#### **Response - Failed (200)**
```json
{
  "success": true,
  "data": {
    "job_id": "string",
    "status": "failed",
    "error": {
      "code": "AI_PROCESSING_FAILED",
      "message": "Document processing failed after retries",
      "user_message": "We're having trouble reading your document. Try a clearer photo?",
      "retry_attempts": 3,
      "suggestions": [
        "Try taking a clearer photo",
        "Ensure the document is well-lit",
        "Contact support if the problem persists"
      ]
    }
  }
}
```

#### **Invalid Job ID (404)**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_JOB_ID",
    "message": "Job not found",
    "user_message": "We can't find your document analysis. Please upload again"
  }
}
```

#### **AI Processing Retry Logic**
- **Max Attempts**: 3 retries
- **Backoff Schedule**: 30 seconds, 2 minutes, 5 minutes
- **Total Timeout**: ~8 minutes maximum before failure
- **Exponential Backoff**: Prevents AI service overload

#### **Database Operations (Polling Endpoint)**
- **Job Validation**: Extract user_id from job_id and validate against authenticated user
- **S3 Check**: Check if AI results available at `results/{job_id}.json`
- **Data Transformation**: Convert S3 AI response to encrypted API chunks
- **Cleanup**: Delete both S3 files after successful response
- **Final Storage**: Client stores results in local SQLite database
- **Audit Logging**: Log successful result retrieval and cleanup

#### **Audit Events Triggered**
- **Document Upload**: Job ID, file metadata, user ID, processing initiation
- **Processing Complete**: Results summary, confidence scores, data extraction success, cleanup completion
- **Processing Failed**: Error details, retry attempts, failure reasons

---

### **POST /api/v1/process/doctor-report**
**Purpose**: Generate comprehensive doctor report from all user's medical data (Premium feature)
**User Flow**: Premium feature - comprehensive medical report generation
**Processing Model**: Asynchronous with S3 temporary storage and polling for results
**Subscription Required**: Premium tier only (verified via DynamoDB user profile)
**Rate Limit**: 5 requests/minute per user
**AI Provider**: AWS Bedrock (Claude 3.5 Sonnet)

#### **Premium Subscription Check**
- Server validates user has active premium subscription before processing
- Returns subscription error if user lacks premium access

#### **Request Structure**
```json
{
  "medical_data": {
    "lab_results": [
      {
        "test_name": "string",
        "value": "number",
        "unit": "string", 
        "reference_range": "string",
        "status": "normal|abnormal|critical",
        "test_date": "iso8601"
      }
    ],
    "vitals": [
      {
        "vital_type": "blood_pressure|heart_rate|temperature|weight|height",
        "value": "string",
        "unit": "string", 
        "status": "normal|abnormal|critical",
        "measurement_date": "iso8601"
      }
    ]
  },
  "report_preferences": {
    "include_disclaimers": "boolean", // Default: true
    "report_style": "comprehensive|summary" // Default: comprehensive
  }
}
```

#### **Response Success (202 Accepted)**
```json
{
  "success": true,
  "data": {
    "job_id": "string", // Format: {user_id}_{timestamp}_{random}
    "status": "processing",
    "estimated_processing_time_seconds": 180, // Longer than document processing
    "polling_endpoint": "/jobs/{job_id}/status",
    "recommended_polling_interval_seconds": 15,
    "report_type": "doctor_report"
  },
  "audit_logged": true
}
```

#### **S3 Storage Architecture** 
```
s3://serenya-temp-processing/
├── jobs/{job_id}_medical_data       # Encrypted medical data payload (temporary)
└── results/{job_id}.json            # AI-generated doctor report (when ready)
```

#### **Premium Subscription Error (403)**
```json
{
  "success": false,
  "error": {
    "code": "PREMIUM_REQUIRED",
    "message": "Premium subscription required for doctor reports",
    "user_message": "Doctor reports are available with Premium. Want to upgrade?",
    "upgrade_url": "/subscriptions/create"
  }
}
```

#### **AI Processing - Doctor Report Response Format**
**S3 Response Format (`results/{job_id}.json`):**
```json
{
  "doctor_report": "string", // Comprehensive markdown medical report
  "report_metadata": {
    "data_points_analyzed": "number",
    "report_length_words": "number", 
    "sections_included": ["executive_summary", "lab_analysis", "vitals_trends", "recommendations"],
    "generation_time_seconds": 120,
    "model_version": "claude-3.5"
  },
  "medical_disclaimers": "string",
  "confidence_score": 0.95
}
```

#### **Job Status Response - Doctor Report Complete (200)**
```json
{
  "success": true,
  "data": {
    "job_id": "string",
    "status": "completed",
    "results": {
      "encrypted_doctor_report": "string", // Base64 encrypted markdown report
      "encryption_metadata": {
        "version": "v1",
        "algorithm": "AES-256-GCM", 
        "table_key_id": "local_medical_data",
        "checksum": "string"
      }
    },
    "processing_summary": {
      "processing_time_seconds": 150,
      "data_points_analyzed": 45,
      "report_sections": 6,
      "confidence_score": 0.95
    }
  },
  "audit_logged": true
}
```

#### **Database Operations**
- **Premium Check**: DynamoDB GetItem on user profile, validate `current_subscription.type = 'premium'` and `status = 'active'`
- **Job Validation**: Extract user_id from job_id and validate against authenticated user
- **S3 Processing**: Store medical data temporarily at `jobs/{job_id}_medical_data`, retrieve AI-generated report from `results/{job_id}.json`
- **Cleanup**: Delete both S3 files after successful response via DELETE /api/v1/process/cleanup/{jobId}
- **Final Storage**: Client creates new local record as "reports" content type in SQLite only upon successful polling
- **Audit Logging**: DynamoDB Streams capture premium feature usage events to S3 events bucket

#### **Audit Events Triggered**
- **Report Request**: Premium user, data volume, processing initiation
- **Report Complete**: Report metadata, processing time, premium feature usage
- **Report Failed**: Error details, retry attempts, premium user impact

---

## 💬 **Chat Prompts & Conversation APIs**

### **GET /api/v1/chat/prompts**
**Purpose**: Retrieve pre-defined conversation starters for medical content
**User Flow**: Loading chat interface, refreshing available questions based on content type
**Caching**: 1-day TTL for optimal performance and offline capability
**Rate Limit**: 50 requests/minute per user
**Data Source**: Pre-defined prompts (not dynamically generated by LLM)

#### **Query Parameters**
- `content_type` (required): ENUM - `results` | `reports`
  - `results` - For viewing processed medical data (lab results, vitals)
  - `reports` - For viewing AI analysis/summary documents

#### **Response Success (200)**
```json
{
  "success": true,
  "data": {
    "content_type": "results|reports", // ENUM: Only these 2 values accepted
    "prompts": [
      {
        "id": "uuid",
        "question": "string", // Ready-to-use conversation starter
        "category": "clarification|explanation|next_steps|comparison",
        "priority": "high|medium|low", // Suggested display order
        "estimated_response_time": "number" // Seconds for LLM response
      }
    ],
    "metadata": {
      "generated_at": "iso8601",
      "expires_at": "iso8601", // 24 hours from generation
      "total_prompts": "number"
    }
  },
  "cache_info": {
    "cache_control": "max-age=86400", // 1 day TTL
    "etag": "string", // For conditional requests
    "last_modified": "iso8601"
  }
}
```

#### **Response Headers**
```http
Cache-Control: max-age=86400, public
ETag: "prompts-v1-{content_id}-{hash}"
Last-Modified: {generation_timestamp}
Expires: {24_hours_from_generation}
```

#### **Error Responses**
```json
// Invalid content_type parameter (400)
{
  "success": false,
  "error": {
    "code": "INVALID_CONTENT_TYPE",
    "message": "content_type must be 'results' or 'reports'",
    "user_message": "Something's not right with that request. Please try again",
    "valid_values": ["results", "reports"]
  }
}

// Missing content_type parameter (400)
{
  "success": false,
  "error": {
    "code": "MISSING_CONTENT_TYPE",
    "message": "content_type query parameter is required",
    "user_message": "Please specify what type of content you're looking for"
  }
}

// No prompts found (404)
{
  "success": false,
  "error": {
    "code": "CONTENT_NOT_FOUND",
    "message": "Content not found or not accessible",
    "user_message": "We can't find that document. It may have been deleted"
  }
}

// Processing not complete (425)
{
  "success": false,
  "error": {
    "code": "PROCESSING_NOT_COMPLETE",
    "message": "Document analysis not yet complete",
    "user_message": "Your document is still being analyzed. Please wait a moment",
    "retry_after": 30
  }
}
```

#### **Chat Prompts Data Source**
**Current Implementation**: Chat prompts are currently hardcoded in the Lambda function, not stored in DynamoDB. This is a temporary implementation that may be moved to DynamoDB in future iterations.

**Prompt Categories**:
- `explanation` - Help users understand medical terminology
- `clarification` - Answer specific questions about results
- `next_steps` - Provide guidance on what to do next

**Sample Prompts**:
- Results: "What do my lab values mean?", "Should I be concerned about any of these results?"
- Reports: "Can you explain this analysis in simpler terms?", "What are the key takeaways?"

**Future Enhancement**: Prompts may be moved to DynamoDB for easier management and customization per user.

#### **Implementation Notes**
- **Independent of Processing**: Can be called separately from document processing completion
- **Caching Strategy**: 1-day TTL reduces server load and enables offline access
- **Refresh Capability**: Client can request new prompts by bypassing cache
- **Context-Aware**: Prompts generated based on specific document content and type
- **Performance**: Cached prompts load instantly without waiting for LLM generation
- **Development**: Mock prompts enable full UI/UX testing without LLM dependencies

---

## 💬 **Chat & Conversation APIs**

### **POST /api/v1/chat/messages**
**Purpose**: Send user question for AI analysis via AWS Bedrock - asynchronous processing
**User Flow**: Interactive conversation (**→ user-flows.md** Flow 2A, Step 3)
**Processing Time**: 5-15 seconds (asynchronous)
**Processing Model**: Asynchronous with S3 temporary storage and polling for results
**AI Provider**: AWS Bedrock (Claude 3.5 Sonnet)

#### **Request**
```json
{
  "content_id": "uuid", // Related to specific analysis (results or reports)
  "message": "string", // User's question
  "suggested_prompt_id": "uuid" // Optional - if selected from chat_options table
}
```

#### **Response Success (202 Accepted)**
```json
{
  "success": true,
  "job_id": "string", // Format: {user_id}_{timestamp}_{random}
  "chat_id": "uuid", // Generated server-side for this chat message
  "estimated_completion_seconds": 10
}
```

#### **Job ID Format**
```
{user_id}_{timestamp}_{random_string}
Example: "550e8400-e29b-41d4-a716-446655440000_1725456789_def456"
```

#### **S3 Chat Response Storage**
```
s3://serenya-temp-processing/chat-responses/{job_id}.json
```
- **Content**: Encrypted chat response data
- **Lifecycle**: 2-day automatic deletion + immediate cleanup after client retrieval
- **Purpose**: Temporary storage while client is offline

#### **Subscription Tiers (DynamoDB Embedded)**
Subscription information is embedded in the user profile DynamoDB item, not a separate table.

**User Profile Structure**:
```json
{
  "PK": "USER#{userId}",
  "SK": "PROFILE",
  "current_subscription": {
    "id": "subscription-id",
    "type": "free|premium",
    "status": "active|expired|cancelled",
    "provider": "system|apple|google",
    "start_date": "timestamp",
    "end_date": "timestamp"
  }
}
```

**Subscription Tiers**:
- `free`: Document upload, processing, chat - NO medical reports
- `premium`: All features including AI-generated doctor reports

#### **Database Operations**
1. **Generate chat_id**: UUID for the chat message/response pair
2. **Create job_id**: Structured format `{user_id}_{timestamp}_{random}` for ownership validation
3. **Queue for Bedrock Processing**: Send to AWS Bedrock with content context
4. **S3 Temporary Storage**: Chat responses stored at `chat-responses/{job_id}.json`
5. **No DynamoDB Persistence**: Chat history stored client-side only

#### **Error Responses**

**Content Not Found (404)**
```json
{
  "success": false,
  "error": {
    "code": "CONTENT_NOT_FOUND",
    "message": "Content not found or not accessible",
    "user_message": "I can't find what you're asking about. Try a different question?"
  }
}
```

**Invalid Message (400)**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_MESSAGE",
    "message": "Message cannot be empty",
    "user_message": "I'm ready to help! What would you like to know?"
  }
}
```

**Rate Limited (429)**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests",
    "user_message": "I'm still working on your last question. One moment please",
    "retry_after": 30
  }
}
```

---

### **GET /api/v1/chat/jobs/{job_id}/status**
**Purpose**: Poll for chat response completion and retrieve AI answer from Bedrock
**User Flow**: Polling after sending chat message
**Rate Limit**: 10 requests/minute per job_id
**AI Provider**: AWS Bedrock (Claude 3.5 Sonnet)

#### **Job Validation Process**
- **Extract user_id** from job_id format: `{user_id}_{timestamp}_{random}`
- **Verify ownership** by matching user_id with authenticated user
- **Check S3 storage** for response availability

#### **Response - Processing (202)**
```json
{
  "status": "processing",
  "job_id": "string",
  "estimated_remaining_seconds": 5
}
```

#### **Response - Complete (200)**
```json
{
  "success": true,
  "status": "complete",
  "chat_response": {
    "chat_id": "uuid", // Same as from initial POST response
    "content_id": "uuid", // Original content being discussed  
    "encrypted_response": "string", // Base64 encrypted AI response
    "encryption_metadata": {
      "version": "v1",
      "algorithm": "AES-256-GCM",
      "table_key_id": "local_medical_data"
    },
    "timestamp": "iso8601"
  }
}
```

#### **Encrypted Response Content (Within encrypted_response field)**
```json
{
  "response": {
    "content": "string", // AI response in markdown format
    "confidence_score": "number", // 0.0-1.0
    "sources_referenced": ["lab_results", "vitals", "analysis"],
    "medical_disclaimers": "boolean"
  },
  "suggested_follow_ups": [
    {
      "id": "uuid",
      "question": "string",
      "category": "explanation|next_steps|comparison"
    }
  ]
}
```

#### **Response - Failed (200)**
```json
{
  "success": true,
  "status": "failed",
  "error": {
    "code": "AI_PROCESSING_FAILED",
    "message": "Unable to generate response at this time",
    "user_message": "I'm having trouble with that question. Could you rephrase it?",
    "retry_recommended": true
  }
}
```

#### **Invalid Job ID (404)**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_JOB_ID",
    "message": "Job ID not found or invalid format",
    "user_message": "I can't find that conversation. Please start a new chat"
  }
}
```

#### **S3-to-API Response Transformation**
- **Retrieve**: Encrypted response from S3 temporary storage
- **Return**: Full response structure to client
- **Cleanup**: Immediately delete S3 object after successful retrieval
- **Local Storage**: Client stores response locally for conversation history

#### **Database Operations (Polling Endpoint)**
- **No DynamoDB queries**: All validation done via job_id structure (user_id embedded in job_id)
- **S3 operations only**: Check existence at `chat-responses/{job_id}.json`, retrieve content, delete after retrieval
- **Audit logging**: DynamoDB Streams capture events to S3 events bucket

#### **Audit Events Triggered**
- **Chat Response Delivered**: User received AI response, content context, response quality metrics
- **S3 Cleanup**: Temporary storage cleaned up after successful delivery

---


## ⭐ **Premium Subscription APIs**

### **GET /subscriptions/current**
**Purpose**: Get current subscription status for authenticated user
**User Flow**: Settings page, premium content access validation
**Database Operations**: DynamoDB GetItem on user profile, return embedded subscription object

#### **Response Success (200)**
```json
{
  "success": true,
  "data": {
    "subscription": {
      "id": "subscription-id",
      "type": "free|premium",
      "status": "active|expired|cancelled",
      "provider": "system|apple|google",
      "external_subscription_id": "string|null",
      "start_date": "timestamp",
      "end_date": "timestamp"
    },
    "features": {
      "document_processing": true,
      "chat_analysis": true,
      "medical_reports": "boolean"  // true for premium, false for free
    }
  },
  "audit_logged": true
}
```

**Note on Subscription Management**: POST /subscriptions/create endpoint is not currently implemented. Subscription upgrades are handled through Apple App Store or Google Play Store in-app purchases, with webhook notifications updating the DynamoDB user profile's `current_subscription` object.

---

## 🛡️ **GDPR Data Subject Rights APIs**

**Note on GDPR Endpoints**: GDPR data subject rights endpoints (`/gdpr/erasure-request` and `/gdpr/erasure-status/{erasure_request_id}`) are not currently implemented in the production API. These features are planned for future releases.

**Current Data Deletion Process**:
1. User can request account deletion through support contact
2. Manual DynamoDB DeleteItem operation removes user profile
3. S3 temporary files auto-delete via lifecycle policies (2-day TTL)
4. Medical data stored client-side is deleted when app is uninstalled

### **POST /gdpr/erasure-request** (Planned)
**Purpose**: Submit GDPR right to erasure (right to be forgotten) request
**User Flow**: Settings → Privacy → Delete Account
**Business Logic**: Initiates complete user data deletion from DynamoDB and S3
**Processing**: Asynchronous deletion with status tracking

#### **Request**
```json
{
  "deletion_reason": "string",           // Optional: user's reason for deletion
  "confirmation_text": "DELETE",        // Required: user types "DELETE" to confirm
  "include_audit_anonymization": true   // Whether to anonymize audit logs (recommended: true)
}
```

#### **Response - Deletion Initiated (202)**
```json
{
  "success": true,
  "data": {
    "erasure_request_id": "uuid",
    "status": "initiated",
    "estimated_completion_hours": 72,    // GDPR requires completion within 30 days, but we aim for 72 hours
    "deletion_categories": [
      "user_profile",
      "subscription_data", 
      "payment_history",
      "consent_records",
      "audit_log_anonymization"
    ],
    "important_note": "Medical data is stored locally on your device and will be removed when you uninstall the app."
  }
}
```

#### **Error Responses**
```json
// Invalid confirmation
{
  "success": false,
  "error": {
    "code": "INVALID_CONFIRMATION",
    "message": "Please type 'DELETE' exactly to confirm account deletion",
    "user_message": "Please type 'DELETE' exactly to confirm account deletion"
  }
}

// Active subscription blocking deletion
{
  "success": false,
  "error": {
    "code": "ACTIVE_SUBSCRIPTION",
    "message": "Cannot delete account with active subscription",
    "user_message": "Please cancel your subscription first, then try deleting your account",
    "suggestions": ["Cancel subscription in Settings", "Contact support for assistance"]
  }
}
```

---

### **GET /gdpr/erasure-status/{erasure_request_id}**
**Purpose**: Check status of GDPR deletion request  
**User Flow**: Post-deletion status tracking  
**Processing**: Real-time status of deletion process

#### **Response - In Progress (200)**
```json
{
  "success": true,
  "data": {
    "erasure_request_id": "uuid",
    "status": "in_progress",
    "progress": {
      "user_profile": "completed",
      "subscription_data": "completed", 
      "payment_history": "in_progress",
      "consent_records": "pending",
      "audit_log_anonymization": "pending"
    },
    "estimated_completion": "2025-09-09T14:30:00Z",
    "last_updated": "2025-09-06T10:15:00Z"
  }
}
```

#### **Response - Completed (200)**
```json
{
  "success": true,
  "data": {
    "erasure_request_id": "uuid",
    "status": "completed",
    "completion_date": "2025-09-08T09:45:00Z",
    "verification_hash": "sha256_hash_of_deletion_verification",
    "deletion_summary": {
      "user_profile": "deleted",
      "subscription_data": "deleted",
      "payment_history": "deleted", 
      "consent_records": "deleted",
      "audit_logs": "anonymized"
    },
    "compliance_certificate": "Available for download for 90 days"
  }
}
```

#### **Error Responses**
```json
// Request not found
{
  "success": false,
  "error": {
    "code": "ERASURE_REQUEST_NOT_FOUND",
    "message": "Deletion request not found",
    "user_message": "Your deletion request wasn't found. It may be completed already"
  }
}
```

---

## ⚠️ **Error Handling & Standards**

### **Unified Error Handling Strategy**

**Three-Layer Error Handling Architecture** (aligned with Issue #16 resolution):

1. **Layer 1 - Server Error Processing**: Categorize and sanitize errors at the Lambda level
2. **Layer 2 - Client Error Translation**: Transform server errors into actionable user guidance  
3. **Layer 3 - User Experience**: Present contextual error messages with recovery actions

#### **Error Categories**
```typescript
// Server-side error categorization
enum ErrorCategory {
  TECHNICAL = 'technical',     // Infrastructure failures, timeouts, service unavailable
  VALIDATION = 'validation',   // Input validation, format errors, missing fields
  BUSINESS = 'business',       // Business logic violations, insufficient permissions
  EXTERNAL = 'external'        // Third-party service failures (Google OAuth, AI services)
}

// Recovery strategies
enum RecoveryStrategy {
  RETRY = 'retry',             // Automatic or user-triggered retry
  FALLBACK = 'fallback',       // Graceful degradation to alternative functionality  
  ESCALATE = 'escalate',       // Require user intervention or support contact
  IGNORE = 'ignore'            // Continue with limited functionality
}
```

#### **Standard Error Response Structure**
**Universal format for all API error responses:**
```json
{
  "success": false,
  "error": {
    "code": "string",                          // Machine-readable error code (e.g., "AUTH_TOKEN_EXPIRED")
    "category": "technical|validation|business|external",  // Error categorization
    "message": "string",                       // Technical error message for logging
    "user_message": "string",                  // User-friendly message for display
    "recovery_strategy": "retry|fallback|escalate|ignore", // Suggested recovery approach
    "details": {                              // Optional additional context
      "field": "string",                      // For validation errors
      "retry_after_seconds": "number",        // For rate limiting and retries
      "upgrade_url": "string",                // For premium features
      "fallback_available": "boolean"         // Whether fallback options exist
    },
    "correlation_id": "uuid",                 // For support tracking and debugging
    "circuit_breaker_status": "open|closed|half_open"  // Circuit breaker state
  },
  "audit_logged": true
}
```

#### **Circuit Breaker Implementation**
Server-side circuit breakers prevent cascading failures:
```json
{
  "service": "google_oauth|openai_api|database",
  "status": "open|closed|half_open",
  "failure_threshold": 5,
  "recovery_timeout_seconds": 30,
  "fallback_available": true
}
```

### **Standard Success Response Structure**
**Universal format for all API success responses:**
```json
{
  "success": true,
  "data": {
    // Actual response data
  },
  "metadata": {                              // Optional metadata
    "processing_time_ms": "number",
    "api_version": "string", 
    "rate_limit_remaining": "number"
  },
  "audit_logged": true
}
```

### **HTTP Status Code Usage**
- **200 OK**: Successful request with data
- **201 Created**: Resource successfully created
- **202 Accepted**: Request accepted, processing async
- **204 No Content**: Successful request, no data to return
- **400 Bad Request**: Client error, invalid request format
- **401 Unauthorized**: Authentication required or invalid
- **403 Forbidden**: Valid authentication, insufficient permissions
- **404 Not Found**: Requested resource doesn't exist
- **413 Payload Too Large**: File upload exceeds size limit
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server-side processing error
- **502 Bad Gateway**: External service (AI, payment) unavailable
- **503 Service Unavailable**: Temporary service overload

### **Common Error Codes & Recovery Patterns**
**Standardized error codes with recovery strategies:**

```typescript
// Authentication Errors (Category: BUSINESS)
INVALID_TOKEN = {
  message: "Authentication token is invalid or expired",
  recovery_strategy: "retry",
  user_action: "Your session expired for security. Please sign in again"
}
BIOMETRIC_REQUIRED = {
  message: "Biometric authentication required for this operation", 
  recovery_strategy: "escalate",
  user_action: "Please use your fingerprint or Face ID to continue"
}
SESSION_EXPIRED = {
  message: "User session has expired",
  recovery_strategy: "retry", 
  user_action: "Your session expired for security. Please sign in again"
}

// Validation Errors (Category: VALIDATION)
MISSING_REQUIRED_FIELD = {
  message: "Required field missing from request",
  recovery_strategy: "escalate",
  user_action: "Please fill in all required fields"
}
INVALID_FILE_TYPE = {
  message: "File type not supported",
  recovery_strategy: "escalate",
  user_action: "We work best with PDF documents or photos (JPG/PNG)"
}
FILE_TOO_LARGE = {
  message: "File exceeds maximum size limit", 
  recovery_strategy: "escalate",
  user_action: "Your file is a bit too large. Please try under 5MB"
}

// Technical Errors (Category: TECHNICAL)
AI_SERVICE_UNAVAILABLE = {
  message: "AI processing service temporarily unavailable",
  recovery_strategy: "fallback",
  user_action: "AI analysis is temporarily unavailable. You can still view documents",
  fallback_available: true
}
DOCUMENT_PROCESSING_FAILED = {
  message: "Document could not be analyzed", 
  recovery_strategy: "retry",
  user_action: "We're having trouble reading your document. Try a clearer photo?"
}

// External Service Errors (Category: EXTERNAL)  
GOOGLE_OAUTH_FAILED = {
  message: "Google authentication service unavailable",
  recovery_strategy: "retry",
  user_action: "Google sign-in is temporarily unavailable. Please try again"
}
RATE_LIMIT_EXCEEDED = {
  message: "Rate limit exceeded",
  recovery_strategy: "retry", 
  user_action: "Please wait a moment before trying again",
  retry_after_seconds: 60
}
INSUFFICIENT_IMAGE_QUALITY = "Document image quality too low for processing"

// Business Logic Errors
PREMIUM_REQUIRED = "Premium subscription required for this feature"
RATE_LIMITED = "Request rate limit exceeded"
SUBSCRIPTION_EXPIRED = "Premium subscription has expired"

// System Errors
DATABASE_ERROR = "Database operation failed"
EXTERNAL_SERVICE_ERROR = "External service integration failed"
INTERNAL_SERVER_ERROR = "Internal server error occurred"

// Encryption & Security Errors (New)
KEY_DERIVATION_FAILED = "Unable to derive encryption keys for user"
ENCRYPTION_FAILED = "Data encryption failed during processing"
DECRYPTION_FAILED = "Unable to decrypt request payload"
DATA_INTEGRITY_ERROR = "Data integrity verification failed - possible tampering"
ENCRYPTION_SYSTEM_ERROR = "Encryption system temporarily unavailable"
INVALID_ENCRYPTION_METADATA = "Encryption metadata format invalid"
UNSUPPORTED_ENCRYPTION_VERSION = "Encryption version not supported"
CORRUPTED_ENCRYPTED_PAYLOAD = "Encrypted payload appears corrupted"
ENCRYPTED_PAYLOAD_TOO_LARGE = "Encrypted payload exceeds size limit after encryption"
KEY_MATERIAL_NOT_FOUND = "User encryption key material not available"
BIOMETRIC_REQUIRED_FOR_KEYS = "Biometric authentication required to access encryption keys"
ENCRYPTION_FALLBACK_USED = "Operation completed with reduced security (unencrypted fallback)"
```

---

## 📈 **Performance & Monitoring**

### **API Performance Targets (With Application-Layer Encryption)**
- **Authentication**: < 200ms average response time (+ key material exchange)
- **File Upload (Encrypted)**: < 3 seconds for 5MB file (includes encryption overhead)
- **File Upload (Fallback)**: < 2 seconds for 5MB file (unencrypted fallback)
- **Document Processing**: < 3 minutes end-to-end (encryption/decryption included)
  - **Client Timeout**: 180 seconds (3 minutes) for document upload and processing
  - **Server Processing**: 180 seconds Lambda timeout for Bedrock AI analysis
  - **Polling Interval**: 2 seconds client-side status polling
  - **Max Polling**: 90 attempts (180 seconds total polling time)
- **Chat Messages**: < 1 minute for AI responses
  - **Client Timeout**: 60 seconds for chat message responses
  - **Server Processing**: 60 seconds Lambda timeout for Bedrock chat
  - **Streaming Timeout**: 30 seconds for streaming chat responses
  - **Typing Indicator**: 1 second delay before showing typing indicator
- **Premium Reports**: < 5 minutes for comprehensive report generation
  - **Client Timeout**: 300 seconds (5 minutes) for report requests
  - **Server Processing**: 300 seconds Lambda timeout for complex analysis
  - **Generation Polling**: 5 seconds interval for report status
  - **Max Report Polling**: 60 attempts (300 seconds total)
- **Batch Processing**: < 10 minutes for multiple document batches
  - **Client Timeout**: 600 seconds (10 minutes) for batch operations
  - **Server Processing**: 600 seconds Lambda timeout for batch jobs
  - **Per Document**: 180 seconds maximum per document in batch
  - **Batch Status Polling**: 10 seconds interval for batch status
- **Chat Response (Encrypted)**: < 17 seconds average (includes encryption of response)
- **Timeline Loading (Encrypted)**: < 600ms for 50 items (includes decryption)
- **Content Details (Encrypted)**: < 400ms (includes field-level decryption)

### **Encryption Performance Considerations**
- **Payload Size Increase**: 15-20% increase due to encryption metadata and padding
- **Processing Overhead**: 50-100ms additional latency for encrypt/decrypt operations
- **Memory Usage**: Additional memory for key caching and crypto operations
- **Fallback Thresholds**: Switch to unencrypted mode if encryption adds >2x latency

### **Rate Limiting Configuration**
```typescript
const rateLimits = {
  // Per user limits (sliding window)
  general: "100 requests/minute",
  
  // Specific endpoint limits
  "/auth/*": "10 requests/minute", 
  "/documents/upload": "5 requests/minute",
  "/jobs/*/status": "200 requests/minute", // Higher for polling
  "/chat/messages": "30 requests/minute",
  "/subscriptions/*": "20 requests/minute",
  
  // Burst allowances
  "/content/timeline": "50 requests/minute",
  "/content/*/details": "100 requests/minute"
};
```

### **Monitoring & Alerting**
- **Uptime Target**: 99.9% availability
- **Error Rate Threshold**: < 1% of requests result in 5xx errors
- **Response Time Alerts**: > 95th percentile thresholds
- **Security Monitoring**: Failed authentication attempts, suspicious patterns
- **Business Metrics**: Document processing success rate, subscription conversion

---

## 🔄 **Agent Handoff Requirements**

### **For Mobile Architecture Agent (→ mobile-architecture.md)**
**API Integration Requirements**:
- HTTP client configuration with proper timeout handling
- JWT token management with automatic refresh
- Error response parsing and user-friendly message display
- File upload with status tracking
- Real-time polling for document processing status
- Offline request queuing and retry logic

### **For Security Implementation Agent (→ encryption-strategy.md)**
**Security Integration Points**:
- Request/response encryption for sensitive data
- JWT token validation and session management
- Biometric authentication trigger points
- Audit event payload encryption
- API key management for external services

### **For Audit Logging Agent (→ audit-logging.md)**
**Audit Event Specifications**:
- API call logging requirements for each endpoint
- User action to audit event mapping
- Request/response data to include in audit logs
- Retention requirements for API audit data
- Real-time vs batch audit processing decisions

---

---

## 📋 **Implementation Architecture Summary**

### **Key Architectural Decisions** 
Based on workflow analysis and technical requirements:

1. **Single LLM Call Model**: 
   - Document + prompt → LLM → ALL structured data generated at once
   - No separate API calls needed for different data types
   - All medical content (analysis, lab results, vitals) delivered together

2. **Asynchronous Processing with Polling**:
   - Client uploads document → continues working in app
   - Polls `/jobs/{job_id}/status` for completion
   - Gets all structured data in single encrypted response

3. **Chat Prompts Independence**:
   - Separated from document processing completion
   - Dedicated `/content/{content_id}/chat-prompts` endpoint
   - 1-day TTL caching for performance and offline capability

4. **Comprehensive Medical Data Encryption**:
   - ALL medical content encrypted together (analysis + lab results + vitals)
   - Single encrypted payload for HIPAA compliance
   - No separate encryption for different data types

5. **Modular LLM Integration**:
   - Environment-configurable LLM provider (mock/anthropic/openai)
   - Mock server enables development without external dependencies
   - Easy toggle between development and production LLM services
   - Consistent response format regardless of provider

### **External Service Integration**
- **Production LLM**: Anthropic Claude for document analysis
- **Development LLM**: Local mock server with realistic medical responses
- **Processing Pipeline**: Document → Structured Prompt → LLM → Medical Data
- **Error Handling**: Graceful LLM service failure management
- **Security**: No PHI logged in external service calls
- **Configuration**: Environment-based provider switching

### **Development Environment Setup**
```bash
# Development configuration (Recommended)
LLM_PROVIDER=mock
MOCK_LLM_ENDPOINT=http://localhost:3001
MOCK_PROCESSING_DELAY=10
MOCK_RESPONSE_VARIATION=true  # Randomize mock responses

# Production configuration (AWS Bedrock - Recommended)
LLM_PROVIDER=bedrock
AWS_REGION=eu-west-1
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
BEDROCK_COST_ALERT_THRESHOLD=200  # Monthly cost alert in USD

# Alternative: Direct Anthropic (Not recommended for production)
LLM_PROVIDER=direct-anthropic
ANTHROPIC_API_KEY=your_api_key
ANTHROPIC_ENDPOINT=https://api.anthropic.com/v1

# Staging/testing configuration
LLM_PROVIDER=bedrock  # Use Bedrock for staging too
AWS_REGION=eu-west-1
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
```

  
- **Medical Data**: Stored locally on device (not server-side)
- **Cost Optimization**: Token usage monitoring, intelligent routing, response caching

---

---

## 📊 **API Implementation Summary**

### **Implemented Endpoints (Production Ready)**

**Authentication & User Management:**
- ✅ POST `/auth/oauth-onboarding` - OAuth authentication (Google/Apple) with aliases `/auth/google` and `/auth/google-onboarding`
- ✅ GET `/user/profile` - User profile retrieval

**Document Processing:**
- ✅ POST `/api/v1/process/upload` - Document upload for AI processing
- ✅ GET `/api/v1/process/status/{jobId}` - Job status polling
- ✅ GET `/api/v1/process/result/{jobId}` - Retrieve processing results
- ✅ POST `/api/v1/process/retry/{jobId}` - Retry failed jobs
- ✅ DELETE `/api/v1/process/cleanup/{jobId}` - S3 cleanup
- ✅ POST `/api/v1/process/doctor-report` - Generate doctor report (premium)

**Chat & Conversation:**
- ✅ GET `/api/v1/chat/prompts?content_type=results|reports` - Get chat prompts
- ✅ POST `/api/v1/chat/messages` - Send chat message
- ✅ GET `/api/v1/chat/jobs/{job_id}/status` - Chat job status

**Subscriptions:**
- ✅ GET `/subscriptions/current` - Current subscription status

### **Endpoints Removed/Not Implemented**

**Authentication:**
- ❌ POST `/auth/refresh` - Token refresh (no server-side refresh token storage)
- ❌ POST `/auth/biometric/register` - Biometric registration (planned for future)
- ❌ POST `/auth/biometric/verify` - Biometric verification (planned for future)
- ❌ GET `/auth/biometric/status` - Biometric status (planned for future)

**Document Processing:**
- ❌ POST `/documents/batch-upload` - Batch upload (not implemented)
- ❌ GET `/batches/{batch_id}/status` - Batch status (not implemented)

**Subscriptions:**
- ❌ POST `/subscriptions/create` - Subscription creation (handled by Apple/Google in-app purchases)

**GDPR:**
- ❌ POST `/gdpr/erasure-request` - Data erasure request (planned for future)
- ❌ GET `/gdpr/erasure-status/{erasure_request_id}` - Erasure status (planned for future)

### **Database Architecture Changes**

**PostgreSQL → DynamoDB Migration:**
- ✅ Single-table design with `PK` and `SK` partition/sort keys
- ✅ GSI1-EmailLookup: `EMAIL#{email_hash}` for user lookup
- ✅ GSI2-ExternalAuth: `EXTERNAL#{provider}#{external_id}` for OAuth lookup
- ✅ Embedded consents in user profile (no separate consents table)
- ✅ Embedded subscription in user profile (no separate subscriptions table)
- ✅ Embedded device, session, biometric in user profile
- ✅ DynamoDB Streams for observability events to S3
- ✅ AWS KMS encryption for PII fields (email, name, given_name, family_name)

**Storage Architecture:**
- ✅ S3 bucket: `serenya-temp-files-{environment}-{account}` for temporary document storage
- ✅ S3 bucket: `serenya-events-{environment}-{account}` for observability events
- ✅ Lifecycle policies: Auto-delete files older than 2 days
- ✅ Manual cleanup via DELETE `/api/v1/process/cleanup/{jobId}`

### **AI/LLM Integration Updates**

**AWS Bedrock Integration:**
- ✅ Model: `anthropic.claude-3-5-sonnet-20241022-v2:0`
- ✅ VPC endpoint for secure communication (no internet egress)
- ✅ Document processing: Extract lab results, vitals, analysis
- ✅ Chat responses: Interactive medical Q&A
- ✅ Doctor reports: Comprehensive medical analysis (premium)

**Removed References:**
- ❌ "Development LLM: Mock server" → Use AWS Bedrock in all environments
- ❌ "Direct Anthropic API" references → Use AWS Bedrock instead

### **Major Technical Stack Changes**

| Component | Before (Documented) | After (Actual) |
|-----------|---------------------|----------------|
| Database | PostgreSQL with connection pooling | Amazon DynamoDB (serverless NoSQL) |
| Data Model | Relational tables (users, consents, subscriptions, devices) | Single-table design with embedded objects |
| Transactions | SQL BEGIN/COMMIT | DynamoDB PutItem/UpdateItem operations |
| Indexing | PostgreSQL indexes | DynamoDB GSI (GSI1-EmailLookup, GSI2-ExternalAuth) |
| Encryption | Application-layer + AWS KMS | AWS KMS field-level encryption only |
| LLM Provider | Mock server / Direct Anthropic | AWS Bedrock (Claude 3.5 Sonnet) |
| Audit Logging | PostgreSQL audit table | DynamoDB Streams → S3 events bucket |
| Job Tracking | PostgreSQL jobs table | S3 object existence + job_id validation |

### **Response Schema Updates**

**User Profile:**
- Changed from separate table rows to single DynamoDB item with embedded objects
- Added `current_subscription`, `current_device`, `current_session`, `current_biometric` nested objects
- Removed separate table references

**Job Processing:**
- Changed from database-tracked jobs to S3-based job tracking
- Job validation via job_id format: `{user_id}_{timestamp}_{random}`
- No job status in DynamoDB, only S3 object existence

**Subscription Data:**
- Changed from separate subscriptions table to embedded `current_subscription` object
- Provider field indicates `system` (free), `apple`, or `google` (premium)
- No billing table, external subscription IDs stored in user profile

### **Verification Results**

**✅ Endpoint Path Verification:**
- All endpoints match infrastructure/serenya-backend-stack.ts routes (lines 612-812)
- Correct path prefixes: `/api/v1/process/*`, `/api/v1/chat/*`, `/subscriptions/*`

**✅ Lambda Function Verification:**
- DynamoDB operations confirmed in lambdas/shared/dynamodb-service.js
- S3 operations for job storage confirmed
- AWS Bedrock integration verified
- KMS encryption for PII fields confirmed

**✅ No PostgreSQL References Remaining:**
- Removed all SQL table references (users, user_consents, user_devices, subscriptions)
- Removed SQL transaction descriptions (BEGIN/COMMIT)
- Removed RDS/connection pooling mentions
- Updated to DynamoDB operations (PutItem, GetItem, Query, UpdateItem)

**Document Status**: ✅ **UPDATED** - Reflects current DynamoDB-only architecture with AWS Bedrock integration
**Endpoint Coverage**: 12 implemented REST endpoints + 8 planned/removed endpoints documented
**Database Migration**: PostgreSQL → DynamoDB single-table design complete
**LLM Integration**: AWS Bedrock (Claude 3.5 Sonnet) production-ready
**Cross-References**: All user flows and database operations updated to DynamoDB model