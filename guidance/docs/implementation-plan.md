# Serenya Implementation Plan - AWS-First Architecture
**Date:** August 26, 2025  
**Approach:** AWS-native services with free tier optimization and healthcare scaling  
**Timeline:** 8-10 weeks to production-ready MVP with zero upfront infrastructure costs

## Phase 1: MVP Foundation (Weeks 1-4)

### Week 1-2: AWS Foundation & Authentication
**AWS Infrastructure Setup:**
- **VPC Configuration**: Create VPC in EU-West-1 (Frankfurt) with public/private subnets
- **Security Groups**: Configure ingress/egress rules for web tier, application tier, database tier
- **EC2 Instance**: Deploy t2.micro instance (750 hours/month free) with Application Load Balancer
- **RDS PostgreSQL**: Deploy db.t2.micro instance (750 hours/month free) with automated backups
- **ElastiCache**: Redis t2.micro for session storage and job queuing
- **S3 Bucket**: Frankfurt region with lifecycle policies for temporary file storage (5GB free)
- **Route 53**: DNS configuration for domain management
- **Certificate Manager**: SSL certificate provisioning and management

**Database Schema (FHIR-inspired):**
```sql
-- User management
users (id, email, google_id, age, gender, weight, created_at, updated_at)
user_profiles (user_id, lifestyle_context, wellbeing_baseline, preferences)

-- Medical data (FHIR-inspired)
diagnostic_reports (id, user_id, report_date, original_filename_hash, ai_analysis, raw_fhir_data, created_at)
observations (id, report_id, user_id, type, value, unit, reference_range, status, effective_date)

-- System tables
audit_logs (id, user_id, action, resource_type, resource_id, ip_address, user_agent, timestamp)
ai_processing_jobs (id, user_id, document_hash, status, ai_provider, tokens_used, cost, created_at, completed_at)

-- Onboarding consent tracking  
onboarding_consent_log (id, session_id, slide_number, viewed_at, ip_address, user_agent)
user_consent_acknowledgment (id, session_id, user_id, consent_version, consent_timestamp, digital_signature_hash)
```

**Authentication & Security:**
- Google OAuth2 integration with proper health data consent flows
- AWS Secrets Manager for API keys and database credentials
- IAM roles and policies for least-privilege access
- CloudTrail logging for all AWS API calls

**Development Environment:**
- AWS CLI and CDK setup for Infrastructure as Code
- Local development environment with AWS LocalStack
- CI/CD pipeline using AWS CodePipeline and CodeBuild
- Environment separation (dev/staging/production)

**Compliance Tasks:**
- GDPR privacy policy implementation
- User consent management system
- Data retention policy configuration

### Week 3-4: Serverless Processing Pipeline + AWS Services Integration
**AWS Lambda Functions:**
- **PDF Processing Lambda**: File validation, virus scanning, and format conversion
- **AI Processing Lambda**: Anthropic Claude API integration with retry logic
- **FHIR Extraction Lambda**: Medical data parsing and database insertion
- **Cleanup Lambda**: Automated S3 file deletion after processing (24-hour lifecycle)

**API Gateway Configuration:**
- RESTful API endpoints with request/response transformation
- API throttling and rate limiting configuration
- Request validation and error handling
- Integration with Lambda functions and direct AWS service proxies

**Serverless Processing Pipeline:**
```
PDF Upload (S3) → SNS Notification → Lambda Trigger → AI Processing → 
FHIR Extraction → Database Storage → S3 Cleanup → User Notification
```

**AWS Observability Setup:**
- **CloudWatch Metrics**: Custom metrics for business KPIs (using free tier: 10 metrics)
- **CloudWatch Logs**: Centralized logging for all Lambda functions (5GB free)
- **CloudWatch Dashboards**: Real-time monitoring of system health
- **SNS Alerts**: Automated notifications for system issues
- **X-Ray Tracing**: Distributed tracing for Lambda function performance

**Frontend Tasks:**
- Pre-account creation onboarding flow (6 slides with consent tracking)
- User registration/login flow
- File upload interface with progress tracking
- Basic dashboard showing upload status

**Integration Tasks:**
- AI prompt engineering for medical interpretation
- Response formatting for consistent FHIR-like output
- Cost tracking per AI API call

### Week 4: AI Prompt Engineering & Contextualization System
**Core Requirement:** Transform predefined UI button clicks into intelligent, contextualized AI interactions

**Prompt Template Architecture:**
```sql
-- Database Schema Extensions for Epic 6.5 (M00-61 through M00-68)
CREATE TABLE prompt_templates (
    id UUID PRIMARY KEY,
    action_type VARCHAR(50), -- 'concern-assessment', 'explanation', 'comparison', 'education'
    template_version INTEGER,
    base_prompt_text TEXT,
    context_placeholders JSONB, -- {user_history, current_result, risk_factors}
    safety_rules JSONB, -- Medical disclaimers, consultation triggers
    created_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE user_context_cache (
    user_id UUID REFERENCES users(id),
    medical_summary JSONB, -- Compiled medical history
    risk_factors TEXT[], -- ['diabetes', 'hypertension', 'family_history_cvd']
    current_medications TEXT[],
    last_updated TIMESTAMP,
    PRIMARY KEY (user_id)
);

CREATE TABLE prompt_interactions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    prompt_template_id UUID REFERENCES prompt_templates(id),
    user_action VARCHAR(50), -- Button clicked: 'what_does_this_mean', 'should_i_be_concerned'
    assembled_prompt TEXT, -- Final contextualized prompt sent to AI
    user_context_used JSONB, -- Medical context included in this interaction
    ai_response TEXT,
    confidence_score INTEGER, -- AI confidence 1-10
    user_satisfaction INTEGER, -- Optional feedback 1-5
    processing_time_ms INTEGER,
    created_at TIMESTAMP
);
```

**Dynamic Prompt Assembly Engine (M00-64):**
- **Input**: User action + Current lab result + User medical context
- **Process**: Template selection → Context aggregation → Prompt assembly → Safety validation
- **Output**: Contextualized prompt ready for AI API

**Example Prompt Assembly Flow:**
```javascript
// User clicks "Should I be concerned?" on cholesterol result
const userAction = 'concern-assessment';
const currentResult = { type: 'LDL', value: 180, unit: 'mg/dL', reference: '<100' };
const userContext = {
  age: 45, gender: 'male', 
  previousResults: [{ LDL: 160, date: '2024-06-15' }],
  medications: ['atorvastatin 20mg'],
  riskFactors: ['family_history_cvd']
};

// Assembled prompt sent to AI:
// "Analyze this cholesterol result for concern level. Patient: 45-year-old male, 
// previous LDL 160 mg/dL (6 months ago), currently on atorvastatin 20mg, 
// family history of cardiovascular disease. Current LDL: 180 mg/dL (reference <100).
// Provide assessment with conservative medical bias. Always recommend healthcare provider consultation for abnormal values."
```

**Action-Specific Templates (M00-63):**
1. **"What does this mean?"** → Educational explanation with medical term translation
2. **"Should I be concerned?"** → Risk assessment with conservative bias and consultation triggers
3. **"Compare to previous results"** → Trend analysis with timeline visualization
4. **"Learn more about this condition"** → Condition-specific educational content with disclaimers

**Response Consistency Framework (M00-65):**
```javascript
// Standardized AI response format
{
  "explanation": "Plain language interpretation",
  "confidence_score": 8,
  "risk_level": "moderate", // low, moderate, high
  "recommendations": ["Consult your healthcare provider", "Continue current medication"],
  "disclaimers": ["This is not medical advice", "For educational purposes only"],
  "follow_up_actions": ["Schedule appointment", "Monitor trends", "Learn about cholesterol"]
}
```

**Integration with Existing Pipeline:**
- **Triggered by**: Predefined UI button clicks (Epic 6.5 connects to Epic 6)
- **Data source**: User medical history from diagnostic_reports and observations tables
- **AI Processing**: Enhanced Claude API integration with contextualized prompts
- **Output**: Personalized responses displayed in Individual Result Detail Screen

**Cross-References:**
- **UI Screens**: Complete Screen Inventory - Screens 15 & 16 (Individual Result Detail & Plain Language Interpretation)
- **Project Tasks**: Epic 6.5 tasks M00-61 through M00-68 in Project Plan document
- **Database Schema**: Extends existing FHIR-inspired schema from Epic 2 (M00-25, M00-39)

## Phase 2: User Experience & AWS Enhancement (Weeks 5-6)

### Week 5: Frontend Interface & CloudFront CDN
**Frontend Deployment:**
- **Next.js Application**: Deployed to EC2 with nginx reverse proxy
- **CloudFront CDN**: Global content delivery for static assets
- **S3 Static Assets**: Optimized image and file serving
- **Route 53 Integration**: Custom domain with health checks

**User Interface:**
- Medical data timeline view with responsive design
- Individual result detail pages with plain language interpretation
- User profile management and preferences
- Mobile-first responsive design (320px-1920px)

**Data Management:**
- **DynamoDB Integration**: High-frequency data (user sessions, audit logs)
- **RDS Queries**: Optimized historical data retrieval
- **ElastiCache**: Session storage and frequently accessed data caching

**AWS Monitoring Dashboard:**
- **CloudWatch Dashboard**: System health, Lambda performance, database metrics
- **Business KPIs**: Files processed, conversion rates, user engagement
- **Cost Monitoring**: AWS service usage tracking and budget alerts

### Week 6: Premium Features & AWS Scaling
**Premium Implementation:**
- **Stripe Integration**: Subscription management with webhook handling
- **Feature Gating**: Lambda authorizers for API Gateway premium endpoints  
- **PDF Generation**: Lambda function for doctor report creation using AWS Lambda layers
- **Enhanced Analytics**: DynamoDB streams for real-time user behavior tracking

**AWS Scaling Preparation:**
- **Auto Scaling Groups**: EC2 instance scaling based on CloudWatch metrics
- **Application Load Balancer**: Health checks and traffic distribution
- **RDS Read Replicas**: Database read scaling preparation (available when needed)
- **Lambda Concurrency**: Reserved concurrency for critical functions

**Frontend Enhancements:**
- Premium upgrade flow with Stripe Elements integration
- Doctor report download interface with S3 pre-signed URLs
- Enhanced medical timeline with trend analysis and historical comparisons

## Phase 3: AWS Security & Production Launch (Weeks 7-8)

### Week 7: AWS Security & HIPAA Preparation
**AWS Security Implementation:**
- **AWS WAF**: Web application firewall with OWASP top 10 protection
- **AWS Shield**: DDoS protection activation
- **KMS Integration**: Database encryption at rest with customer-managed keys
- **VPC Security**: Network ACLs and security group hardening
- **IAM Policies**: Fine-grained permissions with principle of least privilege
- **CloudTrail**: Complete API call auditing and log integrity

**Healthcare Compliance:**
- **AWS BAA Activation**: Business Associate Agreement for HIPAA compliance
- **Data Encryption**: End-to-end encryption for all PHI data flows
- **Access Controls**: Multi-factor authentication and session management
- **Audit Logging**: Comprehensive tracking of all data access and modifications

**GDPR Compliance:**
- **Data Export**: Automated user data export via API Gateway endpoints
- **Right to be Forgotten**: Complete data deletion across all AWS services
- **Consent Management**: Granular consent tracking in DynamoDB

### Week 8: AWS Performance Optimization & Production Launch
**AWS Performance Optimization:**
- **Load Testing**: Using AWS Load Testing solution with realistic traffic patterns
- **Database Performance**: RDS Performance Insights and query optimization
- **Lambda Optimization**: Memory allocation tuning and cold start reduction
- **CloudFront**: Edge caching optimization and compression settings
- **Auto Scaling**: Fine-tuning scaling policies and CloudWatch alarms

**Production Monitoring:**
- **CloudWatch Synthetics**: Automated user journey monitoring
- **AWS Personal Health Dashboard**: Service health and maintenance notifications
- **Cost and Usage Reports**: Detailed billing analysis and cost optimization
- **CloudFormation Stack Monitoring**: Infrastructure drift detection

**Go-Live Preparation:**
- **Blue-Green Deployment**: Zero-downtime deployment strategy using AWS CodeDeploy
- **Rollback Strategy**: Automated rollback procedures for failed deployments
- **Health Checks**: Comprehensive application and infrastructure health monitoring
- **Documentation**: AWS service configuration, troubleshooting guides, and operational runbooks

## AWS-Native Technical Stack

### Core AWS Architecture
```
Frontend: Next.js 14 + TypeScript + Tailwind CSS (EC2 + CloudFront)
Backend: Node.js + Express + TypeScript + AWS Lambda Functions
Database: RDS PostgreSQL 15 + DynamoDB + FHIR-inspired schema
Queue: ElastiCache Redis + SNS/SQS for event-driven processing
AI: Anthropic Claude API (primary) + AWS Comprehend Medical (future)
Compute: EC2 t2.micro + Lambda (1M requests/month free)
Storage: S3 (5GB free) + EBS for EC2 instances
CDN: CloudFront with S3 origin
Networking: VPC + API Gateway + Route 53
Monitoring: CloudWatch + X-Ray + CloudTrail
Security: WAF + Shield + KMS + Secrets Manager
Payments: Stripe (integrated via Lambda functions)
Infrastructure as Code: AWS CDK + CloudFormation
```

### Security Implementation
- End-to-end encryption for all health data
- Database field-level encryption for sensitive data
- Comprehensive audit logging
- Session management with secure tokens
- API rate limiting and DDoS protection

### Data Flow Architecture
```
PDF Upload → Virus Scan → AI Processing → FHIR Extraction → Database Storage → PDF Deletion
         ↓
    Queue System → Background Worker → AI API → Response Processing → User Notification
```

## AWS-First Resource Requirements

### Development Team (AI-Driven)
- **AI Development Agents** (Weeks 1-8): All development handled by Claude Code agents
- **External Security Audit** (Week 8): Third-party HIPAA compliance validation
- **Total Development Cost:** ~€25,000-40,000 (primarily external auditing and AI API costs)

### AWS Infrastructure Costs (Monthly)
**Free Tier Benefits (Months 1-12):**
```
EC2 t2.micro (750 hours): €0/month (free tier)
RDS PostgreSQL t2.micro (750 hours): €0/month (free tier)
S3 Storage (5GB): €0/month (free tier)
Lambda (1M requests): €0/month (free tier)
API Gateway (1M calls): €0/month (free tier)
CloudWatch (10 metrics, 5GB logs): €0/month (free tier)
ElastiCache t2.micro: ~€15/month
Route 53 hosted zone: €0.50/month
CloudFront CDN: €0/month (1TB transfer free)
KMS (20,000 requests): €0/month (free tier)
```

**Operating Costs (Monthly):**
```
Base AWS infrastructure: €15-20/month (Year 1)
AI API costs: €1,500-3,000/month (500-1000 documents)
Stripe transaction fees: €200-500/month
Third-party services (domain, SSL): €10/month
Total Monthly (Year 1): €1,725-3,530/month
Total Monthly (Year 2+): €300-500/month base + usage
```

**Cost Evolution:**
- **Months 1-12**: ~€20,000-42,000 total (mostly AI API costs)
- **Year 2+**: Pay-per-usage scaling with predictable unit economics
- **No upfront infrastructure investment required**

## Success Metrics & KPIs

### Technical Metrics
- PDF processing success rate: >95%
- AI interpretation accuracy: >85% (measured against medical professional review)
- Average processing time: <2 minutes per document
- System uptime: >99.5%
- API response time: <500ms (95th percentile)

### Business Metrics
- User registration completion: >80%
- First document upload: >60% within 48 hours
- Free to premium conversion: >15% within 30 days
- Monthly churn rate: <10%

## Risk Mitigation Strategies

### Technical Risks
- **AI API failures**: Implement circuit breakers and fallback providers
- **Data loss**: Multiple backup strategies and point-in-time recovery
- **Security breaches**: Regular security audits and incident response plan
- **Scaling bottlenecks**: Design for horizontal scaling from day one

### Business Risks
- **Regulatory compliance**: Legal review at weeks 4 and 8
- **Cost overruns**: Weekly budget tracking and AI usage monitoring
- **User adoption**: Early beta testing with healthcare professionals

## AWS Service Scaling Strategy

### Free Tier to Production Evolution
**Months 1-12: Free Tier Optimization**
- EC2 t2.micro → t3.small when approaching CPU limits
- RDS t2.micro → db.t3.small when storage/connections max out  
- Lambda stays within 1M requests (scales automatically)
- S3 free tier (5GB) → Standard pricing after threshold
- CloudWatch free tier → paid monitoring as metrics scale

**Year 2+: AWS-Native Scaling**
- **High Growth**: Auto Scaling Groups → ECS Fargate → EKS
- **Database**: RDS Multi-AZ → Aurora PostgreSQL → Read Replicas
- **Healthcare Scale**: AWS HealthLake integration for FHIR compliance
- **AI Processing**: Amazon Comprehend Medical → AWS Bedrock integration
- **Global Reach**: Multi-region deployment with Route 53 health checks

### Healthcare Compliance Evolution
**MVP (Months 1-6):** AWS BAA + basic HIPAA compliance
**Scale (Months 6-12):** AWS Config compliance rules + enhanced encryption
**Enterprise (Year 2+):** Full HealthLake integration + AWS Control Tower

## Sequential Feature Pipeline: Maximum Agent Specialization

### Feature Development Workflow (Per Feature)
**Complete pipeline ownership with minimal handoffs - each agent becomes the domain expert for their phase.**

#### Phase 1: Product Definition & Design (Product Manager → UI/UX Designer)
**Product Manager** (Feature Owner - Weeks allocated per feature):
- Feature requirements analysis and acceptance criteria definition
- User story creation with explicit success metrics
- Business logic specification and edge case documentation
- Compliance and regulatory requirement mapping
- **Deliverable**: Feature specification document with clear acceptance criteria

**UI/UX Designer** (Mockup & Flow Expert):
- Complete UI mockup creation using Frame0 (all screens for the feature)
- User flow design with interaction specifications
- Design system compliance verification and documentation
- Mobile-first responsive design specifications
- **Deliverable**: Complete mockups exported as PNG + interaction specifications

#### Phase 2: Technical Architecture (CTO → DevOps Engineer)
**CTO** (Architecture Decision Maker):
- Technical architecture design specific to this feature
- AWS service selection and integration patterns
- Database schema extensions and API endpoint definitions
- Security and compliance architecture for this feature
- **Deliverable**: Technical specification with AWS service map

**DevOps Engineer** (AWS Infrastructure Specialist):
- Complete infrastructure setup for this feature (all AWS services)
- Lambda functions, API Gateway endpoints, database modifications
- CloudWatch monitoring and alerting for this specific feature
- CI/CD pipeline modifications for feature deployment
- **Deliverable**: Fully functional infrastructure ready for backend code

#### Phase 3: Backend Implementation (Backend Engineer → QA Engineer)
**Backend Engineer** (API & Logic Specialist):
- Database schema implementation and migration scripts
- Complete API endpoint development with validation
- Business logic implementation and error handling
- Integration with external services (AI APIs, Stripe, etc.)
- **Deliverable**: Fully functional backend API with documentation

**QA Engineer** (Quality Assurance Specialist):
- Backend API testing (unit, integration, performance)
- Database integrity and migration testing
- Security testing and compliance validation
- Load testing and AWS service integration verification
- **Deliverable**: Test reports and performance benchmarks

#### Phase 4: Frontend Implementation (Frontend Engineer → QA Engineer)
**Frontend Engineer** (UI Implementation Specialist):
- Complete frontend implementation matching exact mockup specifications
- API integration and state management
- Responsive design implementation and testing
- Performance optimization and bundling
- **Deliverable**: Fully functional frontend feature

**QA Engineer** (End-to-End Validation):
- Frontend functionality testing and user journey validation
- Cross-browser and device testing
- Integration testing with backend APIs
- Final acceptance criteria validation
- **Deliverable**: Feature acceptance report

### Feature Prioritization for Sequential Development

#### Feature 1: AWS Foundation + Authentication (Weeks 1-2)
**High Priority - Core Infrastructure**
- Product Manager: Define authentication flows and security requirements
- UI/UX Designer: Login/registration mockups (Google SSO + profile setup)
- CTO: AWS VPC, security groups, authentication architecture
- DevOps Engineer: EC2, RDS, ElastiCache, IAM setup
- Backend Engineer: User management APIs, Google OAuth integration
- QA Engineer: Security testing, authentication flow validation
- Frontend Engineer: Login/registration UI implementation

#### Feature 2: Onboarding Flow (Weeks 3-4)
**High Priority - Legal Compliance**
- Product Manager: Define 6-slide onboarding with consent tracking
- UI/UX Designer: Complete 6-slide mockups with proper spacing/design system
- CTO: Consent logging architecture and GDPR compliance
- DevOps Engineer: Analytics tracking, audit logging infrastructure
- Backend Engineer: Consent APIs, session tracking, audit logs
- QA Engineer: Compliance validation, consent flow testing
- Frontend Engineer: Onboarding slide implementation with tracking

#### Feature 3: File Upload + AI Processing (Weeks 5-6)
**Core Value Proposition**
- Product Manager: Define upload flows, AI processing requirements
- UI/UX Designer: Upload interface, processing status, results display mockups
- CTO: S3 + Lambda + AI API architecture, error handling patterns
- DevOps Engineer: S3 buckets, Lambda functions, SNS/SQS processing pipeline
- Backend Engineer: Upload APIs, AI integration, FHIR data extraction
- QA Engineer: Processing pipeline testing, AI accuracy validation
- Frontend Engineer: Upload interface, progress tracking, results display

#### Feature 4: Dashboard + Results (Weeks 7-8)
**User Experience Core**
- Product Manager: Define timeline view, result interpretation requirements
- UI/UX Designer: Dashboard layout, result detail views, mobile optimization
- CTO: Data aggregation patterns, caching strategy
- DevOps Engineer: DynamoDB integration, CloudWatch dashboards
- Backend Engineer: Dashboard APIs, data aggregation, result formatting
- QA Engineer: Performance testing, data accuracy validation
- Frontend Engineer: Dashboard implementation, responsive design

### Token Optimization Strategy

**Context Preservation:**
- Each agent maintains complete feature context throughout their phase
- No knowledge transfer between agents during active development
- Agent expertise compounds over multiple features
- Documentation serves as lightweight handoff mechanism

**Minimal Handoff Protocol:**
- **Input**: Previous phase deliverable + feature specification
- **Process**: Agent completes their entire domain responsibility
- **Output**: Documented deliverable ready for next phase
- **Verification**: QA validation at each major phase boundary

**Agent Expertise Building:**
- Each agent becomes the definitive expert in their domain
- Knowledge accumulates across features rather than diluting
- Specialized tooling and patterns develop naturally
- Context switches minimized to feature boundaries only

This AWS-first implementation plan maximizes free tier benefits while providing a clear scaling path to enterprise healthcare compliance, eliminating upfront infrastructure costs and enabling pay-as-you-grow economics.