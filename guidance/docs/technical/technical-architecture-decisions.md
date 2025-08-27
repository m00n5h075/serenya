# Technical Architecture Decision Record (ADR)
**Date:** August 26, 2025  
**Status:** Updated - AWS-First Architecture  
**Approach:** AWS-native infrastructure with free tier optimization and healthcare compliance scaling

## Executive Summary

After comprehensive team analysis involving CTO, DevOps Engineer, Backend Engineer, and founder, we have selected an **AWS-first architecture** that maximizes startup cost efficiency through free tiers while maintaining clear healthcare compliance scaling paths. This updated ADR documents our key technical decisions optimized for zero-upfront-cost launch with AWS-native services.

## Decision Context

**Business Requirements:**
- AI Health Agent providing medical interpretation of lab results
- €9.99/month premium pricing with free tier
- 8-10 week MVP timeline required
- EU-focused launch with GDPR compliance
- Future healthcare enterprise sales capability

**Technical Constraints:**
- Health data processing requirements
- AI interpretation accuracy targets (85-90%)
- Immediate PDF deletion after processing
- FHIR-compatible data storage
- Cost efficiency for startup phase

## Architecture Decisions

### ADR-001: Infrastructure Approach
**Decision:** AWS-First Architecture with Free Tier Optimization  
**Status:** Updated  

**Options Considered:**
1. **Full Healthcare Compliance:** AWS HealthLake from day one (~€300-600K year 1)
2. **Hybrid Cloud:** Mixed cloud providers with cost optimization (~€132K year 1)  
3. **AWS-First:** AWS-native with free tiers and gradual scaling (€0-50K year 1)

**Decision:** Option 3 - AWS-First Architecture

**Rationale:**
- **Zero Upfront Costs:** AWS free tiers provide 12 months of core infrastructure
- **Pay-as-you-grow:** Only pay for actual usage as user base expands
- **Healthcare Ready:** Built-in HIPAA compliance and clear path to HealthLake
- **Operational Simplicity:** Managed services reduce DevOps overhead
- **Scalability:** Seamless scaling from free tier to enterprise without architecture changes
- **Compliance Path:** AWS BAA coverage and healthcare-specific services available

**Trade-offs:**
- ✅ Pros: No upfront investment, AWS healthcare ecosystem, managed services, global scale
- ✅ Pros: Free tier covers MVP launch, clear scaling economics
- ❌ Cons: Higher per-user costs at scale, AWS service lock-in

### ADR-002: Technology Stack
**Decision:** Next.js + PostgreSQL + Anthropic Claude  
**Status:** Approved  

**Frontend:**
- **Framework:** Next.js 14 + TypeScript + Tailwind CSS
- **Rationale:** Fast development, SEO capabilities, team expertise

**Backend:**
- **Runtime:** Node.js + Express + TypeScript
- **Database:** PostgreSQL 15 with FHIR-inspired schema
- **Queue:** Redis for AI processing jobs
- **Rationale:** Standard web development patterns, FHIR evolution capability

**AI Integration:**
- **Primary:** Anthropic Claude API
- **Backup:** OpenAI GPT-4 API
- **Rationale:** Strong medical text interpretation, cost-effective, fallback protection

### ADR-003: Data Architecture
**Decision:** FHIR-inspired PostgreSQL schema  
**Status:** Approved  

**Schema Design:**
```sql
-- Core entities aligned with FHIR R4
users (id, email, google_id, age, gender, weight, created_at)
diagnostic_reports (id, user_id, report_date, ai_analysis, raw_fhir_data)
observations (id, report_id, user_id, type, value, unit, reference_range, effective_date)
audit_logs (id, user_id, action, resource_type, timestamp)
```

**Rationale:**
- **FHIR Compatible:** Can evolve to full FHIR R4 compliance
- **Performance:** Optimized for current query patterns
- **Migration Ready:** Clear path to healthcare cloud platforms
- **Compliance:** Supports audit logging and data governance

### ADR-004: Security Architecture
**Decision:** Enhanced security with healthcare preparation  
**Status:** Approved  

**Security Measures:**
- End-to-end encryption for all health data
- Database field-level encryption for sensitive fields
- Comprehensive audit logging (GDPR + healthcare ready)
- Session management with secure token handling
- API rate limiting and DDoS protection

**Compliance Implementation:**
- GDPR Article 9 consent flows
- User data export/deletion workflows
- Data retention policy enforcement
- Privacy by design architecture

### ADR-005: File Processing Pipeline
**Decision:** Immediate deletion after AI processing  
**Status:** Approved  

**Processing Flow:**
```
PDF Upload → Virus Scan → AI Processing → FHIR Extraction → Database Storage → PDF Deletion
```

**Rationale:**
- **Privacy:** No persistent file storage reduces risk
- **Compliance:** Easier GDPR compliance with minimal data retention
- **Cost:** Reduces storage costs and security surface area
- **Performance:** Streamlined processing pipeline

### ADR-006: AI Processing Architecture
**Decision:** Queue-based background processing  
**Status:** Approved  

**Implementation:**
- Redis queue for AI processing jobs
- Background workers for AI API calls
- Cost tracking per API request
- Retry logic and error handling
- User notification system

**Rationale:**
- **User Experience:** Non-blocking uploads with progress tracking
- **Scalability:** Independent scaling of AI processing capacity
- **Cost Control:** Tracking and optimization of AI API usage
- **Reliability:** Fault tolerance with job retries

### ADR-007: Hosting & Infrastructure
**Decision:** AWS-Native Architecture with Free Tier Optimization  
**Status:** Updated  

**AWS Infrastructure Components:**
**Compute:**
- EC2 t2.micro instances (750 hours/month free for 12 months)
- Lambda functions for serverless processing (1M requests/month free permanently)
- Application Load Balancer (ALB) for traffic distribution

**Database & Storage:**
- RDS PostgreSQL t2.micro (750 hours/month free for 12 months)
- ElastiCache Redis t2.micro for session management and queuing
- S3 (5GB free storage) for temporary file uploads with lifecycle policies
- DynamoDB (25GB free) for high-frequency data like audit logs

**Networking & Security:**
- VPC with private/public subnets in EU (Frankfurt) region
- API Gateway (1M API calls/month free for 12 months)
- CloudFront CDN for global content delivery
- Route 53 for DNS management
- AWS Certificate Manager for SSL certificates
- Secrets Manager for sensitive configuration

**Monitoring & Operations:**
- CloudWatch (10 custom metrics, 5GB log ingestion free)
- CloudTrail for audit logging
- AWS X-Ray for distributed tracing
- SNS for alerts and notifications

**Healthcare & Compliance:**
- AWS Business Associate Agreement (BAA) coverage
- KMS for encryption key management
- CloudHSM for future enhanced encryption needs
- Clear migration path to AWS HealthLake

**Rationale:**
- **Zero Launch Costs:** Free tier covers MVP for entire first year
- **EU Compliance:** Frankfurt region with data residency guarantees
- **Healthcare Ready:** BAA coverage and HIPAA-eligible services
- **Operational Excellence:** Managed services eliminate server maintenance
- **Scalability:** Seamless scaling without architecture changes
- **Cost Predictability:** Pay-per-use pricing with detailed monitoring

### ADR-008: Payment & Subscription
**Decision:** Stripe for subscription management  
**Status:** Approved  

**Implementation:**
- Stripe Billing for recurring subscriptions
- Feature gating based on subscription status
- GDPR-compliant payment processing
- EU VAT handling automation

**Rationale:**
- **Compliance:** GDPR-compliant payment processor
- **Integration:** Well-documented APIs and SDKs
- **Features:** Built-in subscription management and billing
- **EU Support:** Native EU VAT and regulatory compliance

## AWS Healthcare Evolution Path

### AWS Healthcare Services Integration
**Timeline:** Months 6-18 based on business triggers
**Evolution Strategy:** Gradual adoption of AWS healthcare services

**Phase 1: Enhanced AWS Services (Months 6-9):**
- **AWS Comprehend Medical**: Extract medical entities and relationships from text
- **AWS Textract**: OCR for scanned medical documents
- **AWS HealthLake**: FHIR R4 data store for structured medical records
- **AWS HealthImaging**: Medical imaging storage and analysis (if expanding beyond lab results)

**Phase 2: Enterprise Healthcare Integration (Months 9-18):**
- **AWS HealthScribe**: Clinical note generation and medical transcription
- **EHR Integration**: HL7 FHIR R4 APIs for healthcare system connectivity
- **Clinical Decision Support**: Integration with AWS SageMaker for custom ML models
- **Healthcare Data Analytics**: Amazon HealthLake Analytics for population health insights

**Migration Benefits:**
- **Seamless Transition**: No infrastructure migration needed - just service additions
- **FHIR Native**: Built-in FHIR R4 compliance with AWS HealthLake
- **Enterprise Ready**: Direct integration capabilities with hospital systems
- **AI Enhancement**: AWS medical AI services complement our Claude integration

**Migration Triggers:**
- €100K+ monthly recurring revenue
- 5,000+ active premium users
- Enterprise customer demand
- Healthcare provider partnership opportunities

## AWS-First Implementation Phases

### Phase 1: AWS Foundation Setup (Weeks 1-4)
**Infrastructure:**
- VPC and security group configuration (Frankfurt region)
- EC2 t2.micro instances with Application Load Balancer
- RDS PostgreSQL t2.micro setup with automated backups
- ElastiCache Redis for session management
- S3 bucket with lifecycle policies for temporary file storage
- API Gateway and Lambda function deployment
- CloudWatch monitoring and log aggregation setup

**Application:**
- Authentication and user management
- PDF processing pipeline with Lambda + S3
- Basic AI integration (Claude API)
- Database schema implementation (FHIR-inspired)

### Phase 2: User Experience & AWS Services (Weeks 5-6)
**Features:**
- Frontend interface development
- Premium features implementation  
- Subscription management (Stripe integration)

**AWS Enhancements:**
- CloudFront CDN setup for global performance
- Advanced CloudWatch dashboards and alarms
- SNS notifications for system alerts
- AWS Secrets Manager for API key management

### Phase 3: Production Readiness & Compliance (Weeks 7-8)
**Security & Compliance:**
- AWS BAA agreement activation
- KMS encryption implementation
- CloudTrail audit logging configuration
- Security group and IAM policy hardening

**Performance & Monitoring:**
- X-Ray distributed tracing setup
- Auto Scaling configuration
- Performance optimization and load testing
- Comprehensive monitoring and alerting

## Success Metrics

### Technical KPIs
- PDF processing success rate: >95%
- AI interpretation accuracy: >85%
- Average processing time: <2 minutes
- System uptime: >99.5%
- API response time: <500ms (95th percentile)

### Business Validation
- User registration completion: >80%
- First document upload: >60% within 48 hours
- Free to premium conversion: >15%
- Monthly churn rate: <10%

### Cost Validation
- AI processing cost per user: <€3/month
- Infrastructure cost per active user: <€1/month
- Total operational cost margin: <40% of revenue

## Risk Assessment & Mitigation

### Technical Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| AI API failures | Medium | High | Implement circuit breakers, fallback providers |
| Data loss | Low | High | Multiple backup strategies, point-in-time recovery |
| Security breaches | Medium | High | Regular audits, incident response plan |
| Performance bottlenecks | Medium | Medium | Load testing, horizontal scaling design |

### Business Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Regulatory compliance issues | Medium | High | Legal review, gradual compliance implementation |
| Cost overruns | Medium | Medium | Weekly budget tracking, AI usage monitoring |
| Low user adoption | High | High | Early beta testing, user feedback loops |
| Competition | High | Medium | Fast iteration, unique AI interpretation value |

## Decision Rationale Summary

The hybrid pragmatic approach balances the competing demands of:
1. **Speed:** 8-10 week MVP vs 3-6 months full compliance
2. **Cost:** €132K savings vs €300-600K year 1 infrastructure investment  
3. **Risk:** Reduced operational risk through managed services
4. **Scalability:** Container-ready architecture for Kubernetes migration
5. **Control:** VPS control with managed service reliability

This architecture enables rapid market validation while maintaining a credible path to healthcare compliance and enterprise sales. The technical decisions prioritize proven technologies and standard development practices, reducing implementation risk while providing the flexibility to evolve as business requirements mature.

The decision framework can be summarized as: **Start fast, scale smart, migrate when validated.**