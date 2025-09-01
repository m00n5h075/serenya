# Serenya Technical Overview
**Architecture:** AWS-First with Healthcare Evolution Path  
**Timeline:** 8-10 weeks MVP → 6-18 months Healthcare Compliance  
**Cost Model:** Zero upfront → Pay-as-you-grow scaling  
**Date:** August 27, 2025

---

## 📋 Executive Summary

AWS-native architecture maximizing startup cost efficiency through free tiers while maintaining clear healthcare compliance scaling paths. This technical overview consolidates all architectural decisions, implementation phases, and scaling strategies into a single reference document optimized for AI agent navigation.

**Key Business Context:**
- AI Health Agent for medical lab result interpretation
- €9.99/month premium with free tier
- EU GDPR compliance required, healthcare evolution planned
- 8-10 week MVP timeline with zero upfront infrastructure costs

---

## 🏗️ Architecture Decision Records (ADRs)

### **ADR-001: Infrastructure Approach**
**Decision:** AWS-First Architecture with Free Tier Optimization  
**Status:** Approved

**Options Evaluated:**
1. Full Healthcare Compliance: AWS HealthLake (~€300-600K year 1)
2. Hybrid Cloud: Mixed providers (~€132K year 1)
3. **AWS-First**: AWS-native with free tiers (€0-50K year 1) ← **SELECTED**

**Rationale:**
- **Zero Upfront Investment:** AWS free tiers provide 12 months core infrastructure
- **Healthcare Ready:** Built-in HIPAA compliance, clear path to HealthLake
- **Pay-as-you-grow:** Only pay for actual usage as user base expands
- **Operational Simplicity:** Managed services reduce DevOps overhead

**Trade-offs:**
- ✅ No upfront investment, AWS healthcare ecosystem, managed services
- ❌ Higher per-user costs at scale, AWS service lock-in

### **ADR-002: Technology Stack**
**Decision:** Next.js + PostgreSQL + Anthropic Claude  
**Status:** Approved

**Frontend:** Next.js 14 + TypeScript + Tailwind CSS
**Backend:** Node.js + Express + TypeScript  
**Database:** PostgreSQL 15 with FHIR-inspired schema
**AI:** Anthropic Claude API (primary) + OpenAI GPT-4 (backup)
**Queue:** Redis for AI processing jobs

**Rationale:** Fast development, team expertise, FHIR evolution capability, strong medical text interpretation

### **ADR-003: Data Architecture**
**Decision:** FHIR-inspired PostgreSQL schema  
**Status:** Approved

```sql
-- Core entities aligned with FHIR R4
users (id, email, google_id, age, gender, weight, created_at, updated_at)
user_profiles (user_id, lifestyle_context, wellbeing_baseline, preferences)

-- Medical data (FHIR-inspired)
diagnostic_reports (id, user_id, report_date, original_filename_hash, ai_analysis, raw_fhir_data)
observations (id, report_id, user_id, type, value, unit, reference_range, status, effective_date)

-- System tables
audit_logs (id, user_id, action, resource_type, resource_id, ip_address, user_agent, timestamp)
ai_processing_jobs (id, user_id, document_hash, status, ai_provider, tokens_used, cost, created_at, completed_at)

-- Compliance tracking
onboarding_consent_log (id, session_id, slide_number, viewed_at, ip_address, user_agent)
user_consent_acknowledgment (id, session_id, user_id, consent_version, consent_timestamp, digital_signature_hash)
```

**Benefits:** FHIR-compatible, performance-optimized, migration-ready, compliance-supportive

### **ADR-004: Security Architecture**
**Decision:** Enhanced security with healthcare preparation  
**Status:** Approved

**Security Implementation:**
- End-to-end encryption for all health data
- Database field-level encryption for sensitive fields
- Comprehensive audit logging (GDPR + healthcare ready)
- Session management with secure token handling
- API rate limiting and DDoS protection

**Compliance Features:**
- GDPR Article 9 consent flows
- User data export/deletion workflows
- Data retention policy enforcement
- Privacy by design architecture

### **ADR-005: File Processing Pipeline**
**Decision:** Immediate deletion after AI processing  
**Status:** Approved

**Processing Flow:**
```
PDF Upload → Virus Scan → AI Processing → FHIR Extraction → Database Storage → PDF Deletion (24h)
```

**Rationale:**
- **Privacy:** No persistent file storage reduces risk
- **Compliance:** Easier GDPR compliance with minimal data retention
- **Cost:** Reduces storage costs and security surface area

### **ADR-006: AI Processing Architecture**
**Decision:** Queue-based background processing  
**Status:** Approved

**Implementation:**
- Redis queue for AI processing jobs
- Background workers for AI API calls
- Cost tracking per API request
- Retry logic and error handling
- User notification system

**Benefits:** Non-blocking uploads, independent scaling, cost control, fault tolerance

---

## 🚀 Implementation Plan: 8-10 Week Timeline

### **Phase 1: MVP Foundation (Weeks 1-4)**

#### **Week 1-2: AWS Foundation & Authentication**
**AWS Infrastructure Setup:**
- VPC Configuration: EU-West-1 (Frankfurt) with public/private subnets
- Security Groups: Web/app/database tier rules
- EC2 t2.micro: 750 hours/month free with Application Load Balancer
- RDS PostgreSQL t2.micro: 750 hours/month free with automated backups
- ElastiCache Redis: Session storage and job queuing
- S3 Bucket: Frankfurt region with lifecycle policies (5GB free)
- Route 53: DNS + Certificate Manager SSL

**Authentication & Security:**
- Google OAuth2 integration with health data consent flows
- AWS Secrets Manager for API keys and database credentials
- IAM roles and policies for least-privilege access
- CloudTrail logging for all AWS API calls

**Database Implementation:**
- FHIR-inspired schema deployment
- Migration scripts and version control
- Optimized indexes for dashboard queries
- Compliance tracking tables

#### **Week 3-4: Serverless Processing + AI Integration**
**AWS Lambda Functions:**
- PDF Processing: File validation, virus scanning, format conversion
- AI Processing: Anthropic Claude API integration with retry logic
- FHIR Extraction: Medical data parsing and database insertion
- Cleanup: Automated S3 file deletion (24-hour lifecycle)

**API Gateway Configuration:**
- RESTful endpoints with validation
- Throttling and rate limiting
- Lambda integration and AWS service proxies

**Processing Pipeline:**
```
PDF Upload (S3) → SNS → Lambda → AI Processing → FHIR Extraction → Database → S3 Cleanup → Notification
```

**Frontend Foundation:**
- Pre-account onboarding flow (6 slides with consent tracking)
- User registration/login flow
- File upload interface with progress tracking
- Basic dashboard showing upload status

#### **Week 4: AI Prompt Engineering & Contextualization**
**Enhanced Database Schema for Contextualized AI:**
```sql
-- Prompt template management
CREATE TABLE prompt_templates (
    id UUID PRIMARY KEY,
    action_type VARCHAR(50), -- 'concern-assessment', 'explanation', 'comparison'
    template_version INTEGER,
    base_prompt_text TEXT,
    context_placeholders JSONB, -- {user_history, current_result, risk_factors}
    safety_rules JSONB, -- Medical disclaimers, consultation triggers
    created_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- User context caching
CREATE TABLE user_context_cache (
    user_id UUID REFERENCES users(id),
    medical_summary JSONB, -- Compiled medical history
    risk_factors TEXT[], -- ['diabetes', 'hypertension', 'family_history_cvd']
    current_medications TEXT[],
    last_updated TIMESTAMP,
    PRIMARY KEY (user_id)
);

-- Interaction tracking
CREATE TABLE prompt_interactions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    prompt_template_id UUID REFERENCES prompt_templates(id),
    user_action VARCHAR(50), -- 'what_does_this_mean', 'should_i_be_concerned'
    assembled_prompt TEXT, -- Final contextualized prompt sent to AI
    user_context_used JSONB, -- Medical context included
    ai_response TEXT,
    confidence_score INTEGER, -- AI confidence 1-10
    user_satisfaction INTEGER, -- Optional feedback 1-5
    processing_time_ms INTEGER,
    created_at TIMESTAMP
);
```

**Dynamic Prompt Assembly:**
- Input: User action + Current result + Medical context
- Process: Template selection → Context aggregation → Safety validation
- Output: Contextualized prompt for AI API

**Action-Specific Templates:**
1. "What does this mean?" → Educational explanation
2. "Should I be concerned?" → Risk assessment with conservative bias
3. "Compare to previous results" → Trend analysis
4. "Learn more" → Condition-specific educational content

### **Phase 2: User Experience & AWS Enhancement (Weeks 5-6)**

#### **Week 5: Frontend Interface & CloudFront CDN**
**Frontend Deployment:**
- Next.js application deployed to EC2 with nginx
- CloudFront CDN for global content delivery
- S3 static assets with optimization
- Route 53 integration with custom domain

**User Interface:**
- Medical data timeline with responsive design
- Individual result detail pages with AI interpretation
- User profile management and preferences
- Mobile-first design (320px-1920px)

**AWS Monitoring:**
- CloudWatch dashboards for system health
- Business KPIs tracking
- Cost monitoring and budget alerts

#### **Week 6: Premium Features & AWS Scaling**
**Premium Implementation:**
- Stripe integration with webhook handling
- Feature gating via Lambda authorizers
- PDF generation for doctor reports
- Enhanced analytics with DynamoDB streams

**AWS Scaling Preparation:**
- Auto Scaling Groups for EC2 instances
- Application Load Balancer health checks
- Lambda concurrency management
- Database connection pooling

### **Phase 3: AWS Security & Production Launch (Weeks 7-8)**

#### **Week 7: Security & HIPAA Preparation**
**AWS Security Implementation:**
- AWS WAF with OWASP top 10 protection
- AWS Shield DDoS protection
- KMS integration for database encryption
- VPC security hardening and network ACLs
- Fine-grained IAM policies
- CloudTrail complete auditing

**Healthcare Compliance:**
- AWS BAA activation for HIPAA compliance
- End-to-end PHI encryption
- Access controls with MFA
- Comprehensive audit logging

**GDPR Compliance:**
- Automated data export via API Gateway
- Right to be forgotten implementation
- Granular consent tracking

#### **Week 8: Performance Optimization & Launch**
**AWS Performance Optimization:**
- Load testing with realistic traffic
- RDS Performance Insights and query optimization
- Lambda memory allocation tuning
- CloudFront edge caching optimization
- Auto Scaling policy fine-tuning

**Production Monitoring:**
- CloudWatch Synthetics for user journey monitoring
- AWS Personal Health Dashboard integration
- Cost and Usage Reports analysis
- Infrastructure drift detection

**Go-Live Preparation:**
- Blue-green deployment via AWS CodeDeploy
- Automated rollback procedures
- Comprehensive health checks
- Operational documentation

---

## 💰 AWS-First Cost Structure

### **Free Tier Benefits (Months 1-12):**
```
EC2 t2.micro (750 hours): €0/month
RDS PostgreSQL t2.micro (750 hours): €0/month
S3 Storage (5GB): €0/month
Lambda (1M requests): €0/month
API Gateway (1M calls): €0/month
CloudWatch (10 metrics, 5GB logs): €0/month
```

### **Operating Costs (Monthly):**
```
Year 1:
- Base AWS infrastructure: €15-20/month
- AI API costs: €1,500-3,000/month (500-1000 documents)
- Stripe fees: €200-500/month
- Third-party services: €10/month
- Total: €1,725-3,530/month

Year 2+:
- Infrastructure: €300-500/month + usage
- Predictable unit economics scaling
```

### **Detailed AI Cost Analysis:**

**Token Usage per Document:**
- Average medical document processing: 20,000 tokens total
- Breakdown: OCR preprocessing + AI analysis + structured output
- Document size range: 5,000-15,000 input tokens

**Volume-Based Cost Projections:**
```
Daily Processing Volume:
• 100 documents/day (MVP launch)
  - Daily tokens: 2M tokens
  - Monthly AI cost: €1,500-2,000
  
• 500 documents/day (growth phase)
  - Daily tokens: 10M tokens  
  - Monthly AI cost: €7,500-10,000
  
• 1,000 documents/day (scale phase)
  - Daily tokens: 20M tokens
  - Monthly AI cost: €15,000-20,000
```

**Additional AI Cost Factors:**
- OCR preprocessing: €0.002 per page
- Retry logic overhead: 15% additional cost
- Backup AI provider calls: 10% for redundancy
- Error handling and reprocessing: 5% overhead

**Total AI Cost Formula:**
`Base AI Cost × 1.30 (30% overhead factor)`

### **Cost Evolution Path:**
- **Months 1-6**: €20K-30K total (validation phase)
- **Months 6-12**: €50K-120K total (growth phase)
- **Year 2+**: €200K-500K/year (scale phase)
- **No upfront infrastructure investment**

---

## 🏥 Healthcare Evolution Strategy

### **AWS Healthcare Services Integration Timeline**

#### **Phase 1: Enhanced AWS Services (Months 6-9)**
- **AWS Comprehend Medical**: Medical entity extraction
- **AWS Textract**: OCR for scanned documents
- **AWS HealthLake**: FHIR R4 data store
- **AWS HealthImaging**: Medical imaging (if expanding scope)

#### **Phase 2: Enterprise Healthcare (Months 9-18)**
- **AWS HealthScribe**: Clinical note generation
- **EHR Integration**: HL7 FHIR R4 APIs
- **AWS SageMaker**: Custom ML models
- **HealthLake Analytics**: Population health insights

### **Migration Benefits:**
- **Seamless Transition**: No infrastructure migration needed
- **FHIR Native**: Built-in FHIR R4 compliance
- **Enterprise Ready**: Direct hospital system integration
- **AI Enhancement**: AWS medical AI + Claude integration

### **Migration Triggers:**
- €100K+ monthly recurring revenue
- 5,000+ active premium users
- Enterprise customer demand
- Healthcare provider partnerships

---

## 📊 Technical Architecture Stack

### **Core AWS Infrastructure:**
```
Frontend: Next.js 14 + TypeScript + Tailwind CSS (EC2 + CloudFront)
Backend: Node.js + Express + TypeScript + Lambda
Database: RDS PostgreSQL 15 + DynamoDB + FHIR schema
Queue: ElastiCache Redis + SNS/SQS
AI: Anthropic Claude API + AWS Comprehend Medical (future)
Compute: EC2 t2.micro + Lambda (1M free requests)
Storage: S3 (5GB free) + EBS
CDN: CloudFront with S3 origin
Networking: VPC + API Gateway + Route 53
Monitoring: CloudWatch + X-Ray + CloudTrail
Security: WAF + Shield + KMS + Secrets Manager
Payments: Stripe via Lambda
Infrastructure: AWS CDK + CloudFormation
```

### **Data Flow Architecture:**
```
PDF Upload → Virus Scan → AI Processing → FHIR Extraction → Database Storage → PDF Deletion
         ↓
Queue System → Background Worker → AI API → Response Processing → User Notification
```

---

## ✅ Success Metrics & Validation

### **Technical KPIs:**
- PDF processing success rate: >95%
- AI interpretation accuracy: >85%
- Average processing time: <2 minutes
- System uptime: >99.5%
- API response time: <500ms (95th percentile)

### **Business Validation:**
- User registration completion: >80%
- First document upload: >60% within 48 hours
- Free to premium conversion: >15% within 30 days
- Monthly churn rate: <10%
- Healthcare provider NPS: >7/10

### **Cost Validation:**
- AI processing cost per user: <€3/month
- Infrastructure cost per active user: <€1/month
- Total operational cost margin: <40% of revenue

---

## ⚠️ Risk Management

### **Technical Risks & Mitigation:**
| Risk | Impact | Mitigation |
|------|---------|------------|
| AI API failures | High | Circuit breakers, fallback providers |
| Data loss | High | Multiple backups, point-in-time recovery |
| Security breaches | High | Regular audits, incident response plan |
| Performance bottlenecks | Medium | Load testing, horizontal scaling |

### **Business Risks & Mitigation:**
| Risk | Impact | Mitigation |
|------|---------|------------|
| Regulatory compliance | High | Legal review, gradual implementation |
| Cost overruns | Medium | Weekly budget tracking, usage monitoring |
| Low user adoption | High | Early beta testing, feedback loops |
| Competition | Medium | Fast iteration, unique AI value |

---

## 🔄 AWS Service Scaling Strategy

### **Free Tier → Production Evolution:**

#### **Months 1-12: Free Tier Optimization**
- EC2 t2.micro → t3.small (CPU limits)
- RDS t2.micro → db.t3.small (storage/connections)
- Lambda scales automatically within 1M requests
- S3 transitions to standard pricing after 5GB
- CloudWatch scales to paid monitoring

#### **Year 2+: AWS-Native Scaling**
- **High Growth**: Auto Scaling → ECS Fargate → EKS
- **Database**: RDS Multi-AZ → Aurora PostgreSQL → Read Replicas
- **Healthcare**: AWS HealthLake integration
- **AI Processing**: Comprehend Medical → AWS Bedrock
- **Global**: Multi-region with Route 53 health checks

#### **Healthcare Compliance Evolution**
- **MVP (1-6 months)**: AWS BAA + basic HIPAA
- **Scale (6-12 months)**: AWS Config + enhanced encryption
- **Enterprise (Year 2+)**: HealthLake + Control Tower

---

## 📚 Cross-References

**Related Documents:**
- **Project Planning**: `../project/mvp-requirements.md` (M00-21 to M00-121)
- **Healthcare Compliance**: `healthcare-compliance-migration.md` (detailed migration strategy)
- **Observability**: `observability.md` (monitoring implementation)
- **Development**: `our-dev-rules.md` (team standards)

**Linear Task Integration:**
- Epic 1-2: AWS Foundation (M00-21 to M00-45)
- Epic 5-6.5: AI Processing & Prompt Engineering (M00-52 to M00-71)
- Epic 9: Production Security (M00-96 to M00-103)

---

This technical overview provides the complete architectural foundation for Serenya's AWS-first approach, consolidating all technical decisions, implementation phases, and scaling strategies into a single AI-agent-optimized reference document.