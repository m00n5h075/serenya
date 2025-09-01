# Regulatory Requirements - Serenya AI Health Agent

**Date:** September 1, 2025  
**Domain:** Legal Compliance & Regulatory Framework  
**AI Agent:** Compliance Agent  
**Dependencies:**
- **← audit-logging.md**: Compliance audit trail requirements and retention policies
- **← encryption-strategy.md**: Data protection and privacy implementation requirements
- **← database-architecture.md**: Data classification and storage compliance requirements
- **← user-flows.md**: User consent collection and privacy disclosure points
**Cross-References:**
- **→ system-architecture.md**: Infrastructure compliance configuration (HIPAA Technical Safeguards)
- **→ implementation-roadmap.md**: Compliance milestone timeline (Phase 1-2)

---

## ⚖️ **Regulatory Framework Overview**

### **Compliance Philosophy**
- **Privacy by Design**: Compliance built into architecture from day one
- **Maximum Protection**: Meet highest standards (HIPAA + GDPR) for global applicability
- **Transparency First**: Clear user communication about data practices
- **Audit-Ready**: Comprehensive documentation and audit trails
- **Continuous Monitoring**: Ongoing compliance validation and improvement

### **Applicable Regulations**
- **HIPAA** (Health Insurance Portability and Accountability Act) - US health data
- **GDPR** (General Data Protection Regulation) - EU personal data
- **CCPA** (California Consumer Privacy Act) - California residents
- **SOC 2 Type II** - Service organization controls (future consideration)
- **FDA Guidelines** - AI/ML in medical devices (monitoring for applicability)

---

## 🏥 **HIPAA Compliance Framework**

### **HIPAA Applicability Assessment**
**Business Associate Status**: Serenya handles Protected Health Information (PHI) on behalf of individuals  
**Covered Entity Relationship**: Individuals are effectively the covered entity for their own health data  
**Risk Classification**: High - Handling sensitive medical data with AI processing

### **Administrative Safeguards**

#### **§164.308(a)(1) - Security Management Process**
```yaml
SecurityOfficer:
  Role: Chief Technology Officer
  Responsibilities:
    - Overall HIPAA compliance oversight
    - Security policy implementation
    - Incident response coordination
    - Compliance training program

Policies:
  - Information Security Policy (ISP-001)
  - Privacy Policy (PP-001) 
  - Incident Response Procedure (IRP-001)
  - Employee Training Program (ETP-001)
  - Risk Assessment Procedure (RAP-001)

Documentation:
  Location: /compliance/policies/
  Review: Annual with CTO approval
  Version Control: Git with signed commits
  Retention: 7 years minimum
```

#### **§164.308(a)(3) - Workforce Training**
```typescript
// Training requirements tracking
interface ComplianceTraining {
  employeeId: string;
  trainingDate: Date;
  topics: [
    'HIPAA Privacy Rule',
    'HIPAA Security Rule', 
    'Data Breach Response',
    'AI Ethics in Healthcare',
    'Incident Reporting'
  ];
  completionStatus: 'completed' | 'pending' | 'overdue';
  nextTrainingDue: Date; // Annual requirement
  certificationScore: number; // Minimum 80% required
}

const trainingRequirements = {
  newEmployee: {
    deadline: '30 days from hire date',
    prerequisite: 'System access approval'
  },
  annual: {
    deadline: 'Anniversary of last training',
    topics: 'Updated regulations + incident lessons learned'
  },
  incident: {
    deadline: '10 days after reportable incident',
    scope: 'All staff with PHI access'
  }
};
```

#### **§164.308(a)(6) - Security Incident Procedures**
```typescript
// Incident response workflow (→ audit-logging.md integration)
interface SecurityIncident {
  incidentId: string;
  reportedDate: Date;
  discoveredDate: Date;
  incidentType: 'data_breach' | 'unauthorized_access' | 'system_compromise' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  phiInvolved: boolean;
  individualCount: number;
  containmentActions: string[];
  rootCause: string;
  correctiveActions: string[];
  
  // HIPAA-specific requirements
  breachNotificationRequired: boolean;
  hhs_notification_date?: Date; // Within 60 days
  individual_notification_date?: Date; // Within 60 days
  media_notification_required: boolean; // If >500 individuals
}

const incidentResponsePlan = {
  detection: {
    sources: ['automated_monitoring', 'employee_report', 'external_notification'],
    escalation: '15 minutes for critical, 4 hours for high severity'
  },
  assessment: {
    phi_determination: '2 hours maximum',
    severity_classification: '4 hours maximum', 
    breach_assessment: '24 hours maximum'
  },
  containment: {
    immediate: 'Isolate affected systems',
    investigation: 'Preserve evidence for forensics',
    communication: 'Internal stakeholders only until assessed'
  },
  notification: {
    hhs: '60 days for breaches affecting 500+ individuals',
    individuals: '60 days with written notice',
    media: 'If breach affects >500 in same state/jurisdiction'
  }
};
```

### **Physical Safeguards**

#### **§164.310(a)(1) - Facility Access Controls**
```yaml
# Cloud infrastructure physical security (AWS responsibility)
DataCenters:
  Provider: Amazon Web Services
  Certifications: 
    - SOC 1 Type II
    - SOC 2 Type II
    - ISO 27001
    - PCI DSS Level 1
  PhysicalSecurity:
    - 24/7 security staff
    - Biometric access controls
    - Surveillance systems
    - Environmental monitoring

# Office/remote work security (Serenya responsibility)
WorkplaceControls:
  RemoteWork: 
    - Encrypted laptops with full-disk encryption
    - VPN requirement for PHI access
    - Screen privacy in public spaces
    - Secure disposal of printed materials
  OfficeAccess:
    - Badge-controlled entry
    - Visitor escort requirements
    - Clean desk policy
    - Secure storage for portable media
```

#### **§164.310(d)(1) - Device and Media Controls**
```typescript
// Device management and disposal
interface DeviceManagement {
  deviceId: string;
  deviceType: 'laptop' | 'phone' | 'tablet' | 'server' | 'storage';
  assignedUser: string;
  encryptionStatus: boolean;
  lastSecurityUpdate: Date;
  
  // PHI access tracking
  phiAccessEnabled: boolean;
  accessGrantedDate?: Date;
  accessReviewDate?: Date; // Quarterly review required
  
  // Disposal requirements
  disposalRequired: boolean;
  disposalMethod: 'secure_wipe' | 'physical_destruction' | 'degaussing';
  disposalVerification: string; // Certificate of destruction
}

const mediaDisposalProcedure = {
  identification: 'Tag all media containing PHI',
  authorization: 'CTO approval required for disposal',
  sanitization: {
    electronic: 'NIST 800-88 cryptographic erase',
    paper: 'Cross-cut shredding',
    verification: 'Certificate of destruction required'
  },
  documentation: 'Disposal log with serial numbers and methods'
};
```

### **Technical Safeguards**

#### **§164.312(a)(1) - Access Control**
```typescript
// Role-based access control (→ database-architecture.md integration)
interface HipaaAccessControl {
  userId: string;
  role: 'admin' | 'developer' | 'support' | 'auditor';
  phiAccessLevel: 'none' | 'limited' | 'full';
  
  // Minimum necessary principle
  authorizedDataTypes: ('demographic' | 'clinical' | 'payment' | 'administrative')[];
  accessJustification: string; // Business need documentation
  
  // Access management
  accessGrantedDate: Date;
  accessReviewDate: Date; // Every 90 days
  lastAccessDate: Date;
  accessRevocationDate?: Date;
  
  // Technical implementation
  authenticationMethod: 'mfa' | 'certificate' | 'biometric';
  sessionTimeout: number; // Minutes of inactivity
  concurrentSessionLimit: number;
}

// Implementation in database queries
const accessControlQueries = {
  // Minimum necessary - limit columns based on role
  getUserData: (userId: string, requesterRole: string) => {
    const allowedColumns = getRolePermissions(requesterRole);
    return `SELECT ${allowedColumns.join(', ')} FROM users WHERE id = $1`;
  },
  
  // Audit trail for all PHI access
  logDataAccess: async (userId: string, accessType: string, dataRequested: string[]) => {
    await audit.log({
      event_type: 'data_access',
      user_id: userId,
      data_accessed: dataRequested,
      access_method: accessType,
      timestamp: new Date()
    });
  }
};
```

#### **§164.312(e)(1) - Transmission Security**
```typescript
// Encryption in transit requirements (→ encryption-strategy.md)
const transmissionSecurity = {
  api_endpoints: {
    protocol: 'TLS 1.3',
    cipher_suites: [
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'TLS_AES_128_GCM_SHA256'
    ],
    certificate_validation: 'Required',
    hsts: 'max-age=31536000; includeSubDomains; preload'
  },
  
  database_connections: {
    encryption: 'TLS 1.2 minimum',
    certificate_verification: 'Required',
    connection_timeout: '30 seconds'
  },
  
  mobile_app: {
    certificate_pinning: 'Required',
    backup_certificates: 2, // In case of rotation
    validation: 'Fail-closed on certificate mismatch'
  }
};
```

---

## 🇪🇺 **GDPR Compliance Framework**

### **Data Protection Principles**

#### **Article 5 - Principles of Processing**
```typescript
// GDPR principles implementation
interface GDPRCompliance {
  // Lawfulness, fairness, transparency
  processingLawfulness: {
    legalBasis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
    consentEvidence: string; // Reference to consent record
    transparencyMeasures: string[]; // Privacy policy, consent forms
  };
  
  // Purpose limitation  
  purposeLimitation: {
    originalPurpose: string;
    compatibleUses: string[];
    incompatibleUsesPrevented: boolean;
  };
  
  // Data minimization
  dataMinimization: {
    necessaryDataOnly: boolean;
    dataRetentionPeriod: string;
    regularDataReview: Date; // Quarterly
  };
  
  // Accuracy
  accuracyMaintenance: {
    dataValidation: boolean;
    correctionMechanism: string;
    accuracyAudit: Date; // Annual
  };
  
  // Storage limitation  
  storageLimitation: {
    retentionPeriod: string;
    deletionSchedule: Date;
    archivalRules: string;
  };
  
  // Integrity and confidentiality
  securityMeasures: {
    encryptionAtRest: boolean;
    encryptionInTransit: boolean;
    accessControls: boolean;
    auditLogging: boolean;
  };
}
```

#### **Article 6 - Lawfulness of Processing**
```typescript
// Legal basis tracking for each data processing activity
interface ProcessingActivity {
  activityId: string;
  description: string;
  dataTypes: string[];
  dataSubjects: 'app_users' | 'employees' | 'business_contacts';
  
  // Legal basis (GDPR Article 6)
  legalBasis: {
    primary: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
    description: string;
    evidence: string; // Reference to documentation
  };
  
  // Special category data (Article 9)
  specialCategoryData: boolean;
  article9LegalBasis?: 'explicit_consent' | 'employment' | 'vital_interests' | 'public_health' | 'research';
  
  // Processing details
  processingMethods: string[];
  automatedDecisionMaking: boolean;
  profiling: boolean;
  
  // Data transfers
  internationalTransfers: boolean;
  transferMechanism?: 'adequacy_decision' | 'sccs' | 'bcrs' | 'derogations';
  transferCountries: string[];
}

// Example processing activities
const processingActivities: ProcessingActivity[] = [
  {
    activityId: 'document-analysis',
    description: 'AI-powered analysis of user-uploaded medical documents',
    dataTypes: ['medical_records', 'lab_results', 'personal_identifiers'],
    dataSubjects: 'app_users',
    legalBasis: {
      primary: 'consent',
      description: 'User provides explicit consent for document analysis',
      evidence: 'consent_records table with timestamp and IP'
    },
    specialCategoryData: true,
    article9LegalBasis: 'explicit_consent',
    processingMethods: ['automated_analysis', 'ai_processing', 'data_storage'],
    automatedDecisionMaking: false, // Human review available
    profiling: false,
    internationalTransfers: false,
    transferCountries: []
  }
];
```

### **Data Subject Rights Implementation**

#### **Article 15 - Right of Access**
```typescript
// Data portability and access request handling
class DataSubjectRightsHandler {
  async handleAccessRequest(userId: string, requestId: string): Promise<UserDataExport> {
    // Authenticate request
    const authResult = await this.authenticateRequest(userId, requestId);
    if (!authResult.valid) {
      throw new Error('Invalid access request authentication');
    }
    
    // Collect all personal data
    const userData = await this.collectAllUserData(userId);
    
    // Format for human readability
    const exportData = {
      personalInformation: userData.profile,
      medicalDocuments: userData.documents.map(doc => ({
        uploadDate: doc.created_at,
        documentType: doc.type,
        analysisResults: doc.analysis,
        hasConversations: doc.chat_messages.length > 0
      })),
      conversationHistory: userData.chatHistory,
      subscriptionInformation: userData.subscription,
      consentHistory: userData.consents,
      
      // GDPR-required metadata
      processingActivities: this.getProcessingActivitiesForUser(userId),
      dataRetention: this.getRetentionSchedule(userId),
      thirdPartySharing: [], // None currently
    };
    
    // Log the access request
    await this.auditLog({
      event_type: 'gdpr_access_request',
      user_id: userId,
      request_id: requestId,
      data_categories_accessed: Object.keys(exportData),
      timestamp: new Date()
    });
    
    return exportData;
  }
  
  // Response time requirement: 30 days maximum
  async processAccessRequest(request: AccessRequest): Promise<void> {
    const processingDeadline = new Date(request.received_date);
    processingDeadline.setDate(processingDeadline.getDate() + 30);
    
    if (new Date() > processingDeadline) {
      await this.sendDelayNotification(request.user_id, request.id);
    }
  }
}
```

#### **Article 17 - Right to Erasure (Right to be Forgotten)**
```typescript
// Complete data deletion implementation
class DataErasureHandler {
  async processErasureRequest(userId: string, requestId: string): Promise<ErasureResult> {
    // Verify no legal obligation to retain data
    const retentionCheck = await this.checkLegalRetentionRequirements(userId);
    if (retentionCheck.mustRetain) {
      return {
        success: false,
        reason: 'legal_retention_requirement',
        details: retentionCheck.requirements
      };
    }
    
    // Begin cascade deletion
    const deletionPlan = await this.createDeletionPlan(userId);
    
    // Execute deletion with verification
    const deletionResults = await Promise.all([
      this.deleteUserProfile(userId),
      this.deleteDocuments(userId), 
      this.deleteChatHistory(userId),
      this.deleteSubscriptionData(userId),
      this.deleteAuditLogs(userId), // After retention period only
    ]);
    
    // Verify complete deletion
    const verificationResult = await this.verifyCompleteDeletion(userId);
    
    // Log erasure completion  
    await this.auditLog({
      event_type: 'gdpr_erasure_completed',
      user_id_hash: this.hashUserId(userId), // User ID no longer exists
      request_id: requestId,
      deletion_categories: deletionPlan.categories,
      verification_result: verificationResult,
      timestamp: new Date()
    });
    
    return {
      success: verificationResult.complete,
      deletionDate: new Date(),
      categoriesDeleted: deletionPlan.categories,
      verificationHash: verificationResult.hash
    };
  }
  
  // Secure deletion implementation
  private async secureDelete(tableName: string, userId: string): Promise<boolean> {
    // 1. Encrypt data with unique key
    // 2. Delete encryption key 
    // 3. Overwrite database pages (if supported)
    // 4. Verify data unrecoverable
    
    const encryptionKey = await this.generateUniqueKey();
    await this.encryptUserData(tableName, userId, encryptionKey);
    await this.deleteKey(encryptionKey);
    
    // Standard SQL deletion
    await this.database.query(`DELETE FROM ${tableName} WHERE user_id = $1`, [userId]);
    
    // Verification
    const remainingData = await this.database.query(
      `SELECT COUNT(*) FROM ${tableName} WHERE user_id = $1`, 
      [userId]
    );
    
    return remainingData.rows[0].count === '0';
  }
}
```

### **Privacy by Design Implementation**

#### **Data Protection Impact Assessment (DPIA)**
```yaml
DPIAAssessment:
  TriggerCriteria:
    - High risk to rights and freedoms: YES
    - Systematic monitoring: YES (health data tracking)
    - Special category data: YES (health information)
    - Large scale processing: YES (intended for wide adoption)
    - Automated decision making: PARTIAL (AI analysis with human oversight)
  
  RiskAssessment:
    DataMinimization:
      Risk: MEDIUM
      Mitigation: Only collect necessary health data for analysis
      Controls: Data retention policies, regular cleanup
    
    ConsentManagement:  
      Risk: HIGH
      Mitigation: Granular consent with easy withdrawal
      Controls: Consent management system, audit trail
    
    DataBreachImpact:
      Risk: HIGH
      Mitigation: Encryption, access controls, monitoring
      Controls: Incident response plan, breach notification procedures
    
    ThirdPartyRisks:
      Risk: MEDIUM  
      Mitigation: Data processing agreements, regular audits
      Controls: Vendor security assessments, contract terms

  Conclusion: ACCEPTABLE with implemented safeguards
  ReviewDate: Annual or upon significant changes
  ApprovalDate: 2025-09-01
  ApprovedBy: Chief Technology Officer
```

---

## 🏛️ **Additional Regulatory Considerations**

### **California Consumer Privacy Act (CCPA)**
```typescript
// CCPA compliance overlaps significantly with GDPR
interface CCPACompliance {
  // Categories of personal information collected
  personalInfoCategories: [
    'identifiers', // Email, user ID
    'protected_classifications', // Health data
    'commercial_information', // Subscription data
    'internet_activity', // App usage
    'professional_information', // None collected
    'education_information', // None collected
    'audio_visual', // None collected
    'inferences' // AI analysis results
  ];
  
  // Business purposes for processing
  businessPurposes: [
    'providing_services', // Primary app functionality
    'security_fraud_prevention', // Account security
    'debugging_repair', // Technical support
    'advertising_marketing', // None currently
    'research_development', // Product improvement
    'quality_assurance' // Service optimization
  ];
  
  // Consumer rights implementation
  consumerRights: {
    rightToKnow: 'Same as GDPR Article 15 implementation',
    rightToDelete: 'Same as GDPR Article 17 implementation', 
    rightToOptOut: 'No selling of personal information',
    rightToNonDiscrimination: 'No discrimination for exercising rights'
  };
}
```

### **FDA AI/ML Guidance Monitoring**
```typescript
// Monitoring FDA guidance for AI in healthcare
interface FDAComplianceMonitoring {
  currentStatus: 'monitoring'; // Not yet a medical device
  triggerCriteria: {
    medicalDiagnosis: false, // We don't diagnose
    treatmentRecommendations: false, // We don't treat
    medicalDecisionSupport: 'informational_only',
    clinicalValidation: false // Not required for informational use
  };
  
  // Monitoring for changes that could trigger FDA oversight
  complianceReview: {
    frequency: 'quarterly',
    triggers: [
      'diagnostic_capabilities_added',
      'treatment_recommendations_added',
      'clinical_decision_support_claims',
      'physician_workflow_integration'
    ],
    reviewBoard: 'Legal and Medical Advisory Board'
  };
  
  // Current position
  medicalDisclaimers: {
    notDiagnosticDevice: true,
    notTreatmentAdvice: true,
    consultPhysicianAdvice: true,
    emergencyWarning: true
  };
}
```

---

## 📋 **Compliance Monitoring & Validation**

### **Ongoing Compliance Assessment**
```typescript
// Automated compliance monitoring
class ComplianceMonitor {
  async performMonthlyAssessment(): Promise<ComplianceReport> {
    const assessment = {
      hipaa: await this.assessHIPAACompliance(),
      gdpr: await this.assessGDPRCompliance(),
      ccpa: await this.assessCCPACompliance(),
      dataSubjectRequests: await this.reviewDataSubjectRequests(),
      auditLogIntegrity: await this.validateAuditLogs(),
      encryptionStatus: await this.verifyEncryptionCompliance()
    };
    
    // Generate compliance score
    const complianceScore = this.calculateComplianceScore(assessment);
    
    // Flag issues requiring attention
    const issues = this.identifyComplianceIssues(assessment);
    
    return {
      assessmentDate: new Date(),
      overallScore: complianceScore,
      individualScores: assessment,
      criticalIssues: issues.filter(i => i.severity === 'critical'),
      recommendedActions: this.generateRecommendations(issues)
    };
  }
  
  private async assessHIPAACompliance(): Promise<ComplianceScore> {
    const checks = [
      await this.verifyAccessControls(),
      await this.validateAuditTrails(),
      await this.checkEncryption(),
      await this.reviewIncidentResponse(),
      await this.validateTrainingRecords()
    ];
    
    return {
      score: this.calculateScore(checks),
      passedChecks: checks.filter(c => c.passed).length,
      totalChecks: checks.length,
      issues: checks.filter(c => !c.passed)
    };
  }
}

// Compliance reporting schedule
const complianceSchedule = {
  monthly: 'Internal compliance assessment',
  quarterly: 'Data subject rights report + privacy training',
  annually: 'Full compliance audit + policy review',
  triggered: 'Incident response + breach notification'
};
```

### **Third-Party Compliance Validation**
```yaml
ExternalAudits:
  Schedule:
    - Provider: "Healthcare Compliance Firm"
      Type: "HIPAA Security Assessment"
      Frequency: "Annual"
      Scope: "Full technical and administrative safeguards"
    
    - Provider: "Privacy Law Firm" 
      Type: "GDPR Compliance Review"
      Frequency: "Bi-annual"
      Scope: "Data processing activities and rights implementation"
    
    - Provider: "Penetration Testing Firm"
      Type: "Security Assessment"  
      Frequency: "Quarterly"
      Scope: "Infrastructure and application security"

CertificationTargets:
  Year1: 
    - HIPAA Security Assessment (Pass)
    - GDPR Compliance Validation (Pass)
  Year2:
    - SOC 2 Type II Certification
    - ISO 27001 Certification (consideration)
  Year3:
    - HITRUST CSF Certification (if applicable)
```

---

## 🔄 **Agent Handoff Requirements**

### **For Audit Logging Agent (→ audit-logging.md)**
**Compliance Integration Requirements**:
- HIPAA audit event categories and required fields
- GDPR processing activity logging requirements
- Data subject rights request tracking and audit trails
- Compliance reporting data aggregation and analysis
- Regulatory retention requirements and automated deletion

### **For System Architecture Agent (→ system-architecture.md)**
**Infrastructure Compliance Configuration**:
- AWS HIPAA-eligible services configuration
- GDPR-compliant data residency and transfer controls
- Compliance monitoring and alerting infrastructure
- Secure audit log storage and access controls
- Backup and disaster recovery compliance requirements

### **For Database Architecture Agent (→ database-architecture.md)**
**Data Compliance Implementation**:
- Data classification and handling procedures
- Consent tracking and enforcement mechanisms
- Data subject rights implementation at database level
- Secure deletion and data anonymization procedures
- Cross-border data transfer restrictions and controls

### **For Security Implementation Agent (→ encryption-strategy.md)**
**Security Compliance Integration**:
- HIPAA Technical Safeguards implementation
- GDPR data protection by design requirements
- Regulatory encryption standards and key management
- Access control audit requirements and logging
- Incident response integration with compliance procedures

---

**Document Status**: ✅ Complete - Ready for compliance implementation and regulatory validation  
**Regulatory Coverage**: HIPAA, GDPR, CCPA with monitoring framework for FDA guidelines  
**Cross-References**: All technical implementations mapped to specific regulatory requirements  
**Next Steps**: Implementation timeline integration + compliance monitoring automation + third-party audit preparation