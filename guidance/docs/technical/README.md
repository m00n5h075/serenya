# Technical Documentation

**Domain:** Complete Technical Architecture & Implementation Guide  
**Last Updated:** September 5, 2025  
**Status:** Complete - Ready for Development  
**Owner:** Engineering Team

---

## 📋 **Overview**

This folder contains comprehensive technical documentation for the Serenya AI Health Agent platform, covering complete system architecture, implementation details, security frameworks, and development standards. All documents are finalized and ready for development implementation.

### **Platform Vision**
Serenya is an AI Health Agent that helps users understand their medical results through secure, local-first data processing with comprehensive privacy protection and HIPAA/GDPR compliance.

### **Technical Philosophy**
- **Local-First Architecture**: Medical data stored locally on device, processed server-side but never persisted
- **Security by Design**: Multi-layered encryption, biometric authentication, comprehensive audit logging
- **Compliance Native**: HIPAA, GDPR, CCPA compliance built into every component
- **Cloud-Native Infrastructure**: AWS serverless architecture with auto-scaling and resilience
- **Developer Experience**: Comprehensive documentation, clear standards, systematic handoffs

---

## 🏗️ **Architecture Documents**

### **Core Architecture**

#### **[system-architecture.md](./system-architecture.md)**
**Purpose**: Complete AWS cloud infrastructure design and deployment specifications

**Key Components**:
- **AWS Infrastructure**: Lambda functions, API Gateway, RDS PostgreSQL, S3 storage
- **Security Layer**: VPC configuration, KMS encryption, IAM roles and policies  
- **Monitoring & Observability**: CloudWatch dashboards, alarms, structured logging
- **CI/CD Pipeline**: GitHub Actions deployment with CDK infrastructure as code
- **Performance & Scaling**: Auto-scaling configuration, caching strategies, connection pooling
- **Disaster Recovery**: Cross-region backups, automated failover procedures

**Implementation Ready**: ✅ Complete CDK templates, deployment scripts, monitoring setup

---

#### **[database-architecture.md](./database-architecture.md)**
**Purpose**: Complete database design for server-side and local device storage

**Data Distribution Strategy**:
- **Server-Side Database**: Users, consent records, subscriptions, payments, chat options only
- **Local Device Database**: All medical data (lab results, vitals, AI analysis, chat messages)
- **Temporary Processing**: S3-based document processing with automatic cleanup

**Key Features**:
- **PostgreSQL Schema**: Complete table definitions with UUID primary keys and proper constraints
- **ENUM Management**: Comprehensive type definitions for all data categories
- **Local SQLite**: Detailed schema specifications for Flutter mobile app
- **Migration Strategy**: Version control and deployment procedures

**Implementation Ready**: ✅ Complete SQL schemas, migration scripts, connection management

---

### **Security & Compliance**

#### **[encryption-strategy.md](./encryption-strategy.md)**
**Purpose**: Multi-layered encryption and security implementation framework

**Hybrid Encryption Architecture**:
- **Device-Level**: Hardware-backed biometric authentication with secure key storage
- **Table-Level**: Full table encryption (SQLCipher) for sensitive data
- **Field-Level**: AES-256-GCM encryption for mixed-sensitivity tables
- **Network-Level**: Application-layer encryption for medical data transmission
- **Server-Side**: AWS KMS integration for PII and payment data

**Key Management**:
- **3-Layer Key Hierarchy**: Device root key → Table-specific keys → Field-specific keys
- **Biometric Integration**: iOS Secure Enclave and Android Hardware Security Module
- **Key Rotation**: Automated rotation triggers and secure key lifecycle management
- **Session Management**: 15-minute inactivity timeout with fresh authentication for critical operations

**Implementation Ready**: ✅ Complete code examples, platform-specific implementations, audit integration

---

#### **[ARCHITECTURE_ALIGNMENT_ISSUES.md](./ARCHITECTURE_ALIGNMENT_ISSUES.md)**
**Purpose**: Critical technical alignment issues and resolution tracking

**Status Overview**:
- **🟢 Issue #1 RESOLVED**: Database-API Schema Alignment (local-only architecture confirmed)
- **🔴 Issue #2 CRITICAL**: Encryption Strategy Conflicts (security architecture unclear)
- **🟡 Issues #3-#10**: High/Medium priority integration gaps

**Resolution Workflow**:
- **Phase 1 (Week 1-2)**: Critical P0 issues - encryption strategy and database alignment
- **Phase 2 (Week 3-4)**: P1 component integration issues
- **Phase 3 (Week 5-6)**: P2 feature completion issues

**Impact**: Currently blocking development teams - requires immediate P0 resolution

---

### **API & Integration**

#### **[api-contracts.md](./api-contracts.md)**
**Purpose**: Complete RESTful API design with comprehensive endpoint specifications

**API Architecture**:
- **16 REST Endpoints**: Authentication, document processing, chat, subscriptions
- **Asynchronous Processing**: S3-based job queue with polling for AI operations
- **Local-Only Medical Data**: Server processes but never persists medical information
- **Application-Layer Encryption**: Selective encryption for medical data transmission
- **Google OAuth Integration**: Complete onboarding flow with consent management

**Key Endpoints**:
- **Authentication**: `/auth/google-onboarding`, `/auth/refresh`
- **Document Processing**: `/documents/upload`, `/jobs/{jobId}/status`
- **Chat System**: `/chat/messages`, `/chat/jobs/{jobId}/status`
- **Premium Features**: `/reports/generate`, `/subscriptions/create`

**Error Handling**: Comprehensive error codes, user-friendly messages, security-conscious responses

**Implementation Ready**: ✅ Complete endpoint specs, request/response schemas, error handling

---

#### **[llm-integration-architecture.md](./llm-integration-architecture.md)**
**Purpose**: AI service integration design with provider abstraction and cost optimization

**LLM Integration Strategy**:
- **Provider Abstraction**: Mock, AWS Bedrock, Direct Anthropic with environment switching
- **Single Call Model**: One LLM request generates all structured medical data
- **Atomic Processing**: All medical content (analysis, lab results, vitals) created together
- **Cost Tracking**: Token usage monitoring with budget alerts and optimization

**Development Environment**:
- **Mock Server**: Realistic medical responses for development and testing
- **Configurable Delays**: Simulate processing times for UI development
- **Response Variation**: Randomized mock data for comprehensive testing

**Production Deployment**:
- **AWS Bedrock Preferred**: HIPAA compliance with cost efficiency
- **Direct Anthropic Fallback**: Alternative provider for redundancy
- **Cost Optimization**: Usage monitoring, intelligent routing, response caching

**Implementation Ready**: ✅ Complete provider factories, mock responses, cost tracking

---

### **Mobile Architecture**

#### **[flutter-app-architecture.md](./flutter-app-architecture.md)**
**Purpose**: Complete Flutter mobile application architecture and implementation guide

**Architecture Highlights**:
- **Local-First Data Storage**: SQLite database for all medical data with encryption
- **Biometric Authentication**: Platform-specific security integration (iOS/Android)
- **Offline Capability**: Full functionality without network connectivity
- **State Management**: BLoC pattern with comprehensive event/state definitions
- **API Integration**: HTTP client with encryption, polling, and error handling

**Database Schema**:
- **Medical Data Tables**: `serenya_content`, `lab_results`, `vitals`, `chat_messages`
- **Encrypted Storage**: Field-level and table-level encryption strategies
- **Performance Optimization**: Indexes, query patterns, memory management

**Key Features**:
- **Document Upload**: Camera integration, file selection, progress tracking
- **AI Processing**: Asynchronous job polling with real-time status updates
- **Chat Interface**: Conversation history, suggested prompts, AI responses
- **Timeline View**: Chronological medical data display with search and filtering

**Implementation Ready**: ✅ Complete Flutter project structure, database schemas, UI components

---

### **Monitoring & Operations**

#### **[observability.md](./observability.md)**
**Purpose**: Comprehensive monitoring, metrics, and operational observability system

**Observability Strategy**:
- **4 Metric Categories**: Business, Technical Performance, Security, User Experience
- **Real-Time Dashboards**: CloudWatch integration with custom metrics
- **Alert Management**: Tiered alerting with escalation procedures
- **Performance Monitoring**: Database queries, API response times, encryption overhead

**Key Metrics**:
- **Business Metrics**: Document processing success rates, premium conversion, user retention
- **Technical Metrics**: API latency, database performance, error rates, encryption performance
- **Security Metrics**: Authentication failures, encryption events, audit compliance
- **User Experience**: App responsiveness, offline capability, feature adoption

**Enhanced Features**:
- **Encryption Monitoring**: Key access tracking, biometric authentication events
- **Database Performance**: Query optimization, connection pool monitoring
- **Business Intelligence**: User engagement patterns, feature usage analytics

**Implementation Ready**: ✅ Complete CloudWatch setup, dashboard definitions, alert configurations

---

## 🔄 **Development & Process**

### **Development Standards**

#### **[our-dev-rules.md](./our-dev-rules.md)**
**Purpose**: Team coordination standards and agent workflow protocols

**Core Standards**:
- **Verification-First Completion**: All work must be verified with actual measurements
- **Healthcare Application Standards**: Accuracy is non-negotiable in medical applications
- **Agent Accountability**: No false completion reports, systematic handoffs required
- **Evidence-Based Discussion**: Challenge assumptions, request specific evidence

**Team Coordination**:
- **Daily Stand-ups**: Technical planning and progress alignment
- **Feature Retrospectives**: Implementation analytics and process improvement
- **Constructive Confrontation**: Push back respectfully but firmly on ideas

**Implementation Standards**:
- **Maximum 3 Attempts**: Stop after 3 failed attempts and reassess approach
- **Systematic Delivery**: Break complex work into 3-5 stages with clear success criteria
- **Quality Gates**: Code compilation, test passing, linting compliance required

---

### **Compliance Framework**

#### **[../compliance/README.md](../compliance/README.md)**
**Purpose**: Legal and regulatory compliance framework for global operation

**Regulatory Coverage**:
- **HIPAA**: US healthcare data protection with technical safeguards
- **GDPR**: EU personal data protection with data subject rights
- **CCPA**: California privacy rights and consumer protections
- **PCI DSS**: Payment card industry data security standards

**Compliance Implementation**:
- **Audit Logging**: Comprehensive event tracking with 7-year retention
- **Data Subject Rights**: Automated request handling for access and erasure
- **Consent Management**: 5 consent types required for onboarding
- **Security Monitoring**: Real-time incident detection and response

**Privacy by Design**:
- **Local-Only Medical Data**: Maximum privacy protection strategy
- **Encryption at Rest and Transit**: Multi-layered security approach  
- **Automated Compliance**: Continuous monitoring and validation
- **Breach Notification**: Automated detection with regulatory notification

---

## 📊 **Technical Metrics & Analytics**

### **Implementation Readiness Status**

| Component | Status | Implementation Ready | Blocking Issues |
|-----------|--------|---------------------|-----------------|
| **System Architecture** | ✅ Complete | Ready for deployment | None |
| **Database Design** | ✅ Complete | Ready for setup | None |
| **API Contracts** | ✅ Complete | Ready for development | None |
| **Mobile Architecture** | ✅ Complete | Ready for Flutter setup | None |
| **LLM Integration** | ✅ Complete | Ready for provider setup | None |
| **Encryption Strategy** | ⚠️ Conflicts | **BLOCKED** | Issue #2 - Strategy unclear |
| **Observability** | ✅ Complete | Ready for monitoring setup | None |
| **Compliance Framework** | ✅ Complete | Ready for implementation | None |

### **Development Timeline Estimate**

**Phase 1: Infrastructure (Months 1-2)**
- AWS infrastructure deployment (CDK)
- Database setup and migration system
- Basic API endpoints and authentication
- Mobile app foundation and local storage

**Phase 2: Core Features (Months 2-3)**
- Document processing pipeline
- LLM integration and AI processing
- Chat system and conversation history
- Premium features and subscription system

**Phase 3: Security & Compliance (Month 3)**
- Complete encryption implementation
- Audit logging and compliance monitoring
- Security testing and penetration testing
- HIPAA/GDPR compliance validation

**Phase 4: Launch Preparation (Month 4)**
- Performance optimization and load testing
- User acceptance testing and feedback integration
- App store submission and approval
- Production deployment and monitoring

### **Technical Complexity Assessment**

- **High Complexity**: Encryption strategy integration, HIPAA compliance validation
- **Medium Complexity**: LLM provider integration, mobile biometric authentication
- **Low Complexity**: Basic CRUD operations, UI implementation, monitoring setup

---

## 🔗 **Cross-References & Dependencies**

### **Product & User Experience**
- [`../product/README.md`](../product/README.md) - Complete product requirements and user experience design
- [`../product/ui-specifications.md`](../product/ui-specifications.md) - UI component library and design system
- [`../product/user-flows.md`](../product/user-flows.md) - User journey mapping and flow specifications

### **Compliance & Legal**
- [`../compliance/audit-logging.md`](../compliance/audit-logging.md) - Comprehensive audit trail system
- [`../compliance/regulatory-requirements.md`](../compliance/regulatory-requirements.md) - Legal framework compliance

### **Development Guidelines**
- [`../../CLAUDE.md`](../../CLAUDE.md) - Development guidelines and best practices
- Project root documentation for team coordination and standards

---

## 🚀 **Implementation Roadmap**

### **Immediate Actions (Next 30 Days)**
1. **Resolve Architecture Alignment Issues**: Focus on Issue #2 (Encryption Strategy Conflicts)
2. **AWS Infrastructure Setup**: Deploy CDK templates for development environment
3. **Database Initialization**: Set up PostgreSQL with initial schema and encryption
4. **Mobile Project Setup**: Initialize Flutter project with local database architecture
5. **LLM Integration Testing**: Set up mock provider for development workflow

### **Critical Dependencies**
- **Issue #2 Resolution**: Encryption strategy must be clarified before any data handling implementation
- **AWS Account Setup**: Required for infrastructure deployment and KMS key management
- **Google OAuth Configuration**: Needed for authentication flow implementation
- **Anthropic API Access**: Required for production LLM integration

### **Success Criteria**
- All architectural alignment issues resolved
- Complete development environment deployed and tested
- Mobile app displaying mock data from local database
- API endpoints responding with encrypted payloads
- Monitoring dashboards showing system health metrics

---

## 📞 **Support & Contact**

### **Document Ownership**
- **System Architecture**: Infrastructure Team Lead
- **Database Design**: Database Engineer  
- **API Development**: Backend Team Lead
- **Mobile Architecture**: Flutter Developer
- **Security Implementation**: Security Engineer
- **Compliance Framework**: Chief Technology Officer

### **Implementation Support**
- **Technical Questions**: Engineering Team Lead
- **Security Concerns**: Security Implementation Agent
- **Compliance Issues**: Compliance Team + CTO
- **Architecture Decisions**: System Architecture Agent

### **Review Schedule**
- **Weekly Reviews**: Architecture alignment issue resolution progress
- **Monthly Reviews**: Complete technical documentation updates
- **Quarterly Reviews**: Compliance framework and security posture
- **Annual Reviews**: Complete architecture evaluation and optimization

---

**Document Status**: ✅ Complete Technical Architecture  
**Implementation Readiness**: Ready for development (pending encryption strategy resolution)  
**Compliance Coverage**: HIPAA + GDPR + CCPA + PCI DSS  
**Next Milestone**: Resolve critical architecture alignment issues and begin infrastructure deployment