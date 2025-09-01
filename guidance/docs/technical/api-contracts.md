# API Contracts - Serenya AI Health Agent

**Date:** September 1, 2025  
**Domain:** Server-Side API Design & Integration  
**AI Agent:** API Design Agent  
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
- **Performance Optimized**: Single round-trip workflows, selective encryption for optimal speed
- **Error Transparency**: Clear, actionable error messages for mobile client (no crypto details exposed)
- **Privacy Compliant**: No sensitive data in URLs, encrypted medical data, comprehensive audit logging
- **Graceful Degradation**: Fallback to standard TLS when application-layer encryption fails

### **Core Technical Stack**
- **Runtime**: AWS Lambda with Node.js 18.x
- **Database**: PostgreSQL with connection pooling
- **Authentication**: JWT tokens with Google OAuth integration + biometric key material exchange
- **Encryption**: 
  - **Server-side**: AWS KMS for field encryption
  - **Client-server**: AES-256-GCM application-layer encryption for medical data
  - **Key Management**: HKDF-derived table keys with biometric protection
- **Rate Limiting**: AWS API Gateway throttling (100 requests/minute per user)
- **Monitoring**: CloudWatch with custom metrics and alerts + encryption performance tracking

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

### **POST /auth/google**
**Purpose**: Authenticate user with Google OAuth and establish session  
**User Flow**: First-time login and returning user authentication (**→ user-flows.md** Flow 3A, 3B)  
**Database Operations**: INSERT into users table, consent_records validation (**→ database-architecture.md**)

#### **Request**
```json
{
  "google_token": "string", // Google OAuth access token
  "consent_acknowledgments": {
    "medical_disclaimers": "boolean",
    "terms_of_service": "boolean", 
    "privacy_policy": "boolean"
  },
  "device_info": {
    "platform": "ios|android",
    "device_id": "string", // Unique device identifier
    "app_version": "string"
  },
  "encryption_context": {
    "encrypted_key_material": "string", // User's derived key material, encrypted with server's public key
    "key_derivation_version": "v1", // Version for future updates
    "supported_tables": ["serenya_content", "chat_messages"] // Tables that support encryption
  }
}
```

#### **Response Success (200)**
```json
{
  "success": true,
  "data": {
    "access_token": "string", // JWT token (15-minute expiry)
    "refresh_token": "string", // 7-day expiry
    "user": {
      "id": "uuid",
      "email": "string",
      "google_user_id": "string",
      "subscription_tier": "free|premium",
      "profile_completion": "boolean"
    },
    "session": {
      "session_id": "uuid",
      "expires_at": "iso8601",
      "biometric_required": "boolean"
    },
    "encryption_support": {
      "supported_algorithms": ["AES-256-GCM"],
      "supported_tables": ["serenya_content", "chat_messages"],
      "server_encryption_version": "v1"
    }
  },
  "audit_logged": true
}
```

#### **Error Responses**
```json
// Invalid Google token (401)
{
  "success": false,
  "error": {
    "code": "INVALID_GOOGLE_TOKEN", 
    "message": "Google authentication failed",
    "user_message": "Please try signing in with Google again"
  }
}

// Missing consent (400)
{
  "success": false,
  "error": {
    "code": "MISSING_CONSENT",
    "message": "Required consent not provided",
    "user_message": "Please accept all required terms to continue",
    "missing_consents": ["medical_disclaimers", "privacy_policy"]
  }
}
```

#### **Audit Events Triggered**
- **Authentication Success**: User ID, device info, Google OAuth validation (**→ audit-logging.md**)
- **Authentication Failure**: Failed attempt with reason, IP address
- **Consent Grant**: Individual consent records with timestamps

---

### **POST /auth/refresh**
**Purpose**: Refresh expired JWT tokens without full re-authentication  
**User Flow**: Automatic token refresh during app usage  
**Rate Limit**: 10 requests/minute per user

#### **Request**
```json
{
  "refresh_token": "string",
  "device_id": "string"
}
```

#### **Response Success (200)**
```json
{
  "success": true,
  "data": {
    "access_token": "string",
    "expires_at": "iso8601"
  }
}
```

#### **Error Response (401)**
```json
{
  "success": false,
  "error": {
    "code": "REFRESH_TOKEN_EXPIRED",
    "message": "Refresh token has expired",
    "user_message": "Please sign in again",
    "action_required": "full_authentication"
  }
}
```

---

## 📄 **Document Processing APIs**

### **POST /documents/upload**
**Purpose**: Upload and initiate AI processing of medical documents  
**User Flow**: Core document upload flow (**→ user-flows.md** Flow 1A, Step 2)  
**Processing Time**: 30 seconds - 3 minutes  
**Database Operations**: INSERT into serenya_content, lab_results, vitals tables

#### **Request (Encrypted Format - Recommended)**
```json
{
  "encrypted_payload": "string", // Base64 encrypted JSON of original document data
  "encryption_metadata": {
    "version": "v1", // Encryption version for future updates
    "algorithm": "AES-256-GCM", // Encryption algorithm used
    "table_key_id": "serenya_content", // Which table key was used
    "checksum": "string" // SHA-256 of original payload for integrity
  },
  // Unencrypted metadata for server routing/validation
  "file_type": "image/jpeg|image/png|application/pdf",
  "file_size_bytes": "number",
  "document_type": "lab_results|imaging|prescription|other"
}
```

#### **Original Payload (Encrypted within encrypted_payload)**
```json
{
  "file": "base64_encoded_document", // Max 10MB
  "file_name": "string",
  "upload_context": {
    "user_notes": "string", // Optional user description
    "document_date": "iso8601", // When document was created
    "provider_name": "string" // Optional healthcare provider
  }
}
```

#### **Request (Fallback Unencrypted Format)**
```json
{
  "file": "base64_encoded_document", // Max 10MB
  "file_name": "string",
  "file_type": "image/jpeg|image/png|application/pdf",
  "document_type": "lab_results|imaging|prescription|other",
  "upload_context": {
    "user_notes": "string", // Optional user description
    "document_date": "iso8601", // When document was created
    "provider_name": "string" // Optional healthcare provider
  }
}
```

#### **Response Success (202)**
```json
{
  "success": true,
  "data": {
    "job_id": "uuid",
    "upload_id": "uuid", 
    "estimated_processing_time": "number", // seconds
    "status": "uploaded",
    "polling_url": "/jobs/{job_id}/status",
    "webhook_url": null // Future feature
  },
  "audit_logged": true
}
```

#### **Error Responses**
```json
// File too large (413)
{
  "success": false,
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "File exceeds maximum size limit",
    "user_message": "Please upload a file smaller than 10MB",
    "max_size_mb": 10
  }
}

// Unsupported format (400)
{
  "success": false,
  "error": {
    "code": "UNSUPPORTED_FILE_TYPE",
    "message": "File type not supported for processing",
    "user_message": "Please upload a JPEG, PNG, or PDF file",
    "supported_types": ["image/jpeg", "image/png", "application/pdf"]
  }
}
```

#### **Audit Events Triggered**
- **Document Upload**: File metadata, user ID, upload timestamp
- **Processing Start**: Job ID, document classification, AI service invocation

---

### **GET /jobs/{job_id}/status**
**Purpose**: Check document processing status and retrieve results  
**User Flow**: Processing phase polling (**→ user-flows.md** Flow 1A, Step 3)  
**Polling Frequency**: Every 5 seconds from mobile client  
**Rate Limit**: 200 requests/minute (higher for polling)

#### **Response - Processing (202)**
```json
{
  "success": true,
  "data": {
    "job_id": "uuid",
    "status": "processing",
    "progress": {
      "stage": "ai_analysis", // ocr_extraction|ai_analysis|data_extraction|finalizing
      "percentage": 75,
      "message": "Analyzing your document..."
    },
    "estimated_completion": "iso8601"
  }
}
```

#### **Response - Complete (200) - Encrypted Format**
```json
{
  "success": true,
  "encrypted_data": "string", // Base64 encrypted JSON of sensitive medical results
  "encryption_metadata": {
    "version": "v1",
    "algorithm": "AES-256-GCM",
    "table_key_id": "serenya_content",
    "checksum": "string"
  },
  // Unencrypted metadata
  "metadata": {
    "job_id": "uuid",
    "status": "completed",
    "content_id": "uuid",
    "timestamp": "iso8601",
    "response_size_bytes": "number"
  },
  "audit_logged": true
}
```

#### **Encrypted Data Content (Within encrypted_data field)**
```json
{
  "results": {
    "analysis": {
      "summary": "string", // AI-generated summary
      "key_findings": ["string"], // Important findings array
      "medical_data_extracted": "boolean",
      "confidence_score": "number", // 0.0-1.0
      "flags": {
        "critical_values": "boolean",
        "incomplete_data": "boolean", 
        "processing_errors": "boolean"
      }
    },
    "structured_data": {
      "lab_results": [
        {
          "test_name": "string",
          "value": "number",
          "unit": "string", 
          "reference_range": "string",
          "status": "normal|abnormal|critical"
        }
      ],
      "vitals": [
        {
          "vital_type": "blood_pressure|heart_rate|temperature|weight|height",
          "value": "string",
          "unit": "string",
          "measurement_date": "iso8601"
        }
      ]
    },
    "chat_prompts": [
      {
        "id": "uuid",
        "question": "string",
        "category": "clarification|explanation|next_steps"
      }
    ]
  }
}
```

#### **Response - Failed (200)**
```json
{
  "success": true,
  "data": {
    "job_id": "uuid",
    "status": "failed",
    "error": {
      "code": "AI_PROCESSING_FAILED",
      "message": "Document processing failed",
      "user_message": "We couldn't analyze your document. This could be due to image quality or document format.",
      "retry_allowed": true,
      "support_contact": "support@serenya.health"
    },
    "fallback_options": {
      "manual_review": true,
      "tips_url": "/help/document-tips"
    }
  }
}
```

#### **Audit Events Triggered**
- **Processing Complete**: Results summary, confidence scores, data extraction success
- **Processing Failed**: Error details, retry attempts, fallback options used

---

## 💬 **Chat & Conversation APIs**

### **POST /chat/messages**
**Purpose**: Send user question and receive AI-powered response  
**User Flow**: Interactive conversation (**→ user-flows.md** Flow 2A, Step 3)  
**Processing Time**: 5-15 seconds  
**Database Operations**: INSERT into chat_messages table with encryption (**→ encryption-strategy.md**)

#### **Request**
```json
{
  "content_id": "uuid", // Related to specific analysis
  "message": "string", // User's question
  "message_type": "question|follow_up", 
  "context": {
    "previous_message_id": "uuid", // Optional for follow-ups
    "suggested_prompt_id": "uuid" // If using pre-defined prompt
  }
}
```

#### **Response Success (200) - Encrypted Format**
```json
{
  "success": true,
  "encrypted_data": "string", // Base64 encrypted JSON of AI response and medical content
  "encryption_metadata": {
    "version": "v1",
    "algorithm": "AES-256-GCM",
    "table_key_id": "chat_messages",
    "checksum": "string"
  },
  // Unencrypted metadata
  "metadata": {
    "message_id": "uuid",
    "conversation_id": "uuid",
    "message_count": "number",
    "timestamp": "iso8601",
    "response_size_bytes": "number"
  },
  "audit_logged": true
}
```

#### **Encrypted Data Content (Within encrypted_data field)**
```json
{
  "response": {
    "content": "string", // AI response in markdown format (ENCRYPTED - contains medical advice)
    "confidence_score": "number",
    "sources_referenced": ["lab_results", "previous_conversation"],
    "medical_disclaimers": "boolean" // If medical advice disclaimer needed
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

#### **Error Responses**
```json
// Rate limited (429)
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests",
    "user_message": "Please wait a moment before asking another question",
    "retry_after": 30 // seconds
  }
}

// Content not found (404)
{
  "success": false,
  "error": {
    "code": "CONTENT_NOT_FOUND",
    "message": "Referenced content not found",
    "user_message": "Please upload a document first to ask questions about it"
  }
}
```

#### **Audit Events Triggered**
- **Chat Message**: User question, AI response, conversation context, content referenced
- **AI Interaction**: Model used, processing time, confidence scores

---

### **GET /chat/conversations/{content_id}**
**Purpose**: Retrieve chat history for specific analyzed content  
**User Flow**: Returning to previous conversations  
**Database Operations**: SELECT from chat_messages with decryption

#### **Response Success (200) - Encrypted Format**
```json
{
  "success": true,
  "encrypted_data": "string", // Base64 encrypted JSON of conversation messages
  "encryption_metadata": {
    "version": "v1",
    "algorithm": "AES-256-GCM",
    "table_key_id": "chat_messages",
    "checksum": "string"
  },
  // Unencrypted metadata
  "metadata": {
    "content_id": "uuid",
    "conversation_id": "uuid",
    "message_count": "number",
    "last_activity": "iso8601",
    "response_size_bytes": "number"
  }
}
```

#### **Encrypted Data Content (Within encrypted_data field)**
```json
{
  "messages": [
    {
      "id": "uuid",
      "message_type": "question|response",
      "content": "string", // ENCRYPTED - User questions and AI medical responses
      "timestamp": "iso8601",
      "metadata": {
        "confidence_score": "number", // For AI responses
        "processing_time_ms": "number"
      }
    }
  ]
}
```

---

## ⭐ **Premium Subscription APIs**

### **POST /subscriptions/create**
**Purpose**: Create new premium subscription  
**User Flow**: Premium upgrade discovery (**→ user-flows.md** Flow 4A, Step 3)  
**Payment Processing**: Apple App Store / Google Play integration  
**Database Operations**: INSERT into subscriptions table

#### **Request**
```json
{
  "subscription_plan": "monthly|annual",
  "payment_platform": "apple|google",
  "platform_transaction": {
    "receipt_data": "string", // Platform-specific receipt
    "transaction_id": "string",
    "product_id": "string"
  },
  "billing_info": {
    "country_code": "string",
    "currency": "string"
  }
}
```

#### **Response Success (201)**
```json
{
  "success": true,
  "data": {
    "subscription_id": "uuid",
    "subscription_tier": "premium",
    "plan_type": "monthly|annual", 
    "status": "active",
    "billing": {
      "start_date": "iso8601",
      "next_billing_date": "iso8601",
      "amount": "number",
      "currency": "string"
    },
    "features_unlocked": [
      "professional_reports",
      "trend_analysis", 
      "doctor_conversation_prep",
      "unlimited_conversations"
    ]
  },
  "audit_logged": true
}
```

#### **Error Responses**
```json
// Payment failed (402)
{
  "success": false,
  "error": {
    "code": "PAYMENT_FAILED",
    "message": "Payment could not be processed",
    "user_message": "Payment failed. Please check your payment method and try again.",
    "platform_error": "string" // Apple/Google specific error
  }
}

// Invalid receipt (400)
{
  "success": false,
  "error": {
    "code": "INVALID_RECEIPT",
    "message": "Payment receipt validation failed",
    "user_message": "Payment verification failed. Please contact support if you were charged.",
    "support_reference": "uuid"
  }
}
```

#### **Audit Events Triggered**
- **Subscription Created**: Plan details, payment info, user tier upgrade
- **Payment Processed**: Transaction details, platform confirmation, billing cycle start
- **Premium Access Granted**: Features unlocked, subscription status change

---

### **GET /subscriptions/status**
**Purpose**: Check current subscription status and billing info  
**User Flow**: Settings page, premium content access validation

#### **Response Success (200)**
```json
{
  "success": true,
  "data": {
    "subscription_id": "uuid",
    "subscription_tier": "free|premium",
    "status": "active|expired|cancelled|pending",
    "plan_type": "monthly|annual|null",
    "billing": {
      "next_billing_date": "iso8601",
      "amount": "number",
      "currency": "string",
      "payment_method": "apple|google"
    },
    "features": {
      "professional_reports": "boolean",
      "trend_analysis": "boolean", 
      "doctor_conversation_prep": "boolean",
      "unlimited_conversations": "boolean",
      "conversation_limit": "number" // For free tier
    },
    "usage_stats": {
      "documents_processed": "number",
      "conversations_this_month": "number",
      "reports_generated": "number"
    }
  }
}
```

---

## 📊 **Content & Timeline APIs**

### **GET /content/timeline**
**Purpose**: Retrieve user's timeline with all analyzed content  
**User Flow**: Main timeline view loading (**→ user-flows.md** entry points)  
**Database Operations**: Complex JOIN across serenya_content, lab_results, vitals  
**Performance**: Optimized with pagination and caching

#### **Query Parameters**
```
?limit=20 (default, max 50)
&offset=0 
&content_type=all|lab_results|vitals|general
&date_from=iso8601
&date_to=iso8601
&include_premium=boolean
```

#### **Response Success (200) - Encrypted Format**
```json
{
  "success": true,
  "encrypted_data": "string", // Base64 encrypted JSON of timeline items with medical content
  "encryption_metadata": {
    "version": "v1",
    "algorithm": "AES-256-GCM",
    "table_key_id": "serenya_content",
    "checksum": "string"
  },
  // Unencrypted metadata
  "metadata": {
    "total_items": "number",
    "pagination": {
      "total_count": "number",
      "current_page": "number",
      "has_next_page": "boolean",
      "next_offset": "number"
    },
    "timestamp": "iso8601",
    "response_size_bytes": "number"
  }
}
```

#### **Encrypted Data Content (Within encrypted_data field)**
```json
{
  "timeline_items": [
    {
      "id": "uuid",
      "content_type": "lab_results|vitals|general",
      "title": "string", // AI-generated title (ENCRYPTED - contains medical summary)
      "summary": "string", // Brief description (ENCRYPTED - medical content)
      "analysis_date": "iso8601",
      "document_date": "iso8601",
      "confidence_score": "number",
      "has_conversations": "boolean",
      "conversation_count": "number",
      "premium_content": "boolean",
      "key_metrics": {
        "lab_results_count": "number",
        "vitals_count": "number", 
        "critical_flags": "number"
      },
      "preview": {
        "key_findings": ["string"], // First 2-3 findings (ENCRYPTED - medical findings)
        "data_points": "number"
      }
    }
  ],
  "summary_stats": {
    "total_documents": "number",
    "this_month": "number",
    "premium_content_available": "number"
  }
}
```

#### **Error Response (204)**
```json
{
  "success": true,
  "data": {
    "timeline_items": [],
    "message": "No content available",
    "user_message": "Upload your first document to get started",
    "empty_state": true
  }
}
```

---

### **GET /content/{content_id}/details**
**Purpose**: Retrieve complete analysis details for specific content  
**User Flow**: Viewing analysis results (**→ user-flows.md** Flow 1A, Step 5)  
**Database Operations**: SELECT with field decryption for sensitive medical data

#### **Response Success (200) - Encrypted Format**
```json
{
  "success": true,
  "encrypted_data": "string", // Base64 encrypted JSON of complete medical analysis
  "encryption_metadata": {
    "version": "v1",
    "algorithm": "AES-256-GCM",
    "table_key_id": "serenya_content",
    "checksum": "string"
  },
  // Unencrypted metadata
  "metadata": {
    "content_id": "uuid",
    "analysis_date": "iso8601",
    "document_date": "iso8601",
    "document_type": "lab_results|vitals|general",
    "has_conversations": "boolean",
    "message_count": "number",
    "timestamp": "iso8601",
    "response_size_bytes": "number"
  }
}
```

#### **Encrypted Data Content (Within encrypted_data field)**
```json
{
  "analysis": {
    "title": "string", // ENCRYPTED - Medical document title
    "summary": "string", // ENCRYPTED - Full AI analysis in markdown
    "key_findings": ["string"], // ENCRYPTED - Medical findings
    "recommendations": ["string"], // ENCRYPTED - Medical recommendations
    "medical_disclaimers": "string",
    "confidence_score": "number",
    "processing_time_seconds": "number",
    "flags": {
      "critical_values": "boolean",
      "follow_up_recommended": "boolean",
      "incomplete_data": "boolean"
    }
  },
  "structured_data": {
    "lab_results": [
      {
        "id": "uuid",
        "test_name": "string", // ENCRYPTED - Lab test names
        "value": "number", // ENCRYPTED - Medical values
        "unit": "string",
        "reference_range": "string", 
        "status": "normal|abnormal|critical",
        "trend": "improving|stable|declining|unknown",
        "previous_value": "number",
        "change_percentage": "number"
      }
    ],
    "vitals": [
      {
        "id": "uuid",
        "vital_type": "blood_pressure|heart_rate|temperature|weight|height",
        "value": "string", // ENCRYPTED - Vital sign values
        "unit": "string",
        "status": "normal|abnormal|critical",
        "measurement_date": "iso8601"
      }
    ]
  },
  "premium_content": {
    "available": "boolean",
    "professional_report": "string", // ENCRYPTED - Premium medical reports
    "trend_analysis": "object", // ENCRYPTED - Premium trend data
    "doctor_conversation_prep": "object" // ENCRYPTED - Premium consultation prep
  },
  "conversation_summary": {
    "last_activity": "iso8601"
  }
}
```

---

## ⚠️ **Error Handling & Standards**

### **Standard Error Response Structure**
```json
{
  "success": false,
  "error": {
    "code": "string", // Machine-readable error code
    "message": "string", // Technical error message  
    "user_message": "string", // User-friendly message for display
    "details": "object", // Optional additional context
    "timestamp": "iso8601",
    "request_id": "uuid", // For support tracking
    "retry_after": "number", // Seconds to wait before retry
    "support_contact": "string" // For critical errors
  }
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

### **Common Error Codes**
```typescript
// Authentication Errors
INVALID_TOKEN = "Authentication token is invalid or expired"
BIOMETRIC_REQUIRED = "Biometric authentication required for this operation"
SESSION_EXPIRED = "User session has expired"

// Validation Errors  
MISSING_REQUIRED_FIELD = "Required field missing from request"
INVALID_FILE_TYPE = "File type not supported"
FILE_TOO_LARGE = "File exceeds maximum size limit"

// Processing Errors
AI_SERVICE_UNAVAILABLE = "AI processing service temporarily unavailable"
DOCUMENT_PROCESSING_FAILED = "Document could not be analyzed"
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
- File upload with progress tracking
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

**Document Status**: ✅ Complete - Ready for API development and mobile integration  
**Endpoint Coverage**: 15 REST endpoints with comprehensive request/response schemas  
**Cross-References**: All user flows and database operations mapped to API calls  
**Next Steps**: Mobile architecture integration + security implementation + audit logging setup