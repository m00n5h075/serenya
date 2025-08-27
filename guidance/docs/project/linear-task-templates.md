# Serenya Linear Task Templates

Based on our agent specializations and development workflow, here are the standardized task templates for different types of work in Linear.

## AI Agent Optimization Guidelines

**For Maximum AI Agent Comprehension:**
- All requirements written in clear, numbered lists
- Technical specifications use standard formats (JSON, YAML, SQL)
- Every task includes explicit testing criteria for QA validation
- Handover documentation required for seamless agent transitions
- Success criteria measurable with specific metrics

## **Agent Workflow Integration**

**MANDATORY**: Every task must include prerequisite validation and proper handoff following the [Agent Workflow Protocol](./agent-workflow-protocol.md).

### Task Prerequisites Section
Add this section to every task description:
```
## Prerequisites & Dependencies
**Required Completed Tasks**: [List specific Linear task IDs that must be finished]
**Environment Requirements**: [System state, deployed services, database schema]
**File Dependencies**: [Existing files/configurations this task will modify]
**Access Requirements**: [Credentials, permissions, API keys needed]
```

### Validation Requirements
Before starting any task, the assigned agent must:
1. **Verify prerequisites** using objective criteria (not assumptions)
2. **Document validation results** in Linear task comments  
3. **Update task status** to `agent_active` only after validation passes

## General Task Structure

All tasks should include:
- **Clear Title** - Action-oriented (e.g., "Implement", "Create", "Build", "Configure")
- **Agent Assignment** - Which specialized agent owns this task
- **Priority Level** - Critical/High/Medium/Low
- **Labels** - Component, priority, medical/compliance tags
- **Estimate** - Story points (1, 2, 3, 5, 8)
- **Epic Link** - Parent epic this task belongs to

---

## **🏗️ Infrastructure & DevOps Tasks**

**Template for AWS/Infrastructure Work (DevOps Engineer)**

```
## Task Overview
[Brief description of the infrastructure component or service being implemented]

## Technical Requirements
- **AWS Services**: [List specific AWS services required]
- **Configuration**: [Security groups, IAM policies, networking requirements]
- **Integration**: [How this connects to existing infrastructure]
- **Compliance**: [GDPR/HIPAA requirements if applicable]

## Acceptance Criteria (QA Testable)
- [ ] AWS service configured according to technical specifications
- [ ] Security policies implemented and tested
- [ ] Monitoring and alerting configured with test alerts sent
- [ ] Infrastructure documented with CloudFormation/CDK
- [ ] Free tier optimization validated with cost report generated
- [ ] Integration tested with dependent services (all endpoints responding)
- [ ] Health checks returning 200 status codes
- [ ] Service discovery working (can connect from other AWS services)
- [ ] Backup procedures tested with successful restore

## QA Testing Criteria
### Functional Testing
1. **Service Accessibility**: Confirm service responds on expected ports/endpoints
2. **Security Validation**: Verify only authorized access allowed, unauthorized blocked
3. **Monitoring Verification**: Trigger test alerts and confirm they reach destinations
4. **Performance Baseline**: Document response times and resource usage metrics
5. **Failover Testing**: Test backup/recovery procedures work as documented

### Integration Testing
1. **Dependent Service Connectivity**: All downstream services can connect successfully
2. **Configuration Validation**: All environment variables and secrets accessible
3. **Network Security**: Security groups allow required traffic, block unauthorized

## Definition of Done
- [ ] **Prerequisites validated** (following Agent Workflow Protocol)
- [ ] Infrastructure provisioned and functional
- [ ] Security review completed with QA validation
- [ ] Monitoring dashboards created and accessible
- [ ] Documentation updated with troubleshooting guide
- [ ] Cost tracking configured with alerts
- [ ] Backup/recovery procedures documented and tested
- [ ] **Handover documentation completed** (see template below)
- [ ] **Task status updated** to `agent_complete` with validation evidence

## Technical Specifications
```yaml
# Example AWS service configuration
service_name: "example-service"
aws_region: "eu-west-1"
security_groups:
  - name: "web-tier-sg"
    ingress_rules:
      - port: 443
        protocol: "HTTPS"
        source: "0.0.0.0/0"
monitoring:
  - metric: "CPUUtilization"
    threshold: 80
    action: "scale_up"
```

## Required Handover Documentation
**File**: `handovers/infrastructure-[task-name]-handover.md`

```markdown
# Infrastructure Handover: [Task Name]
**Completed by**: DevOps Engineer | **Date**: [Date] | **Next Agent**: [Agent Name]

## What Was Implemented
- [List each AWS service/component created]
- [Configuration details and settings applied]
- [Security measures implemented]

## How to Access/Use
1. **Service Endpoints**: [URLs, ports, connection strings]
2. **Credentials**: [Where secrets are stored in AWS Secrets Manager]
3. **Monitoring**: [CloudWatch dashboard URLs, alert configurations]

## Integration Points for Next Agent
- **Database Connection**: [Connection string format, credential location]
- **API Endpoints**: [Base URLs, authentication requirements]
- **File Storage**: [S3 bucket names, access patterns]

## Testing/Validation
- **Health Check URL**: [Endpoint to verify service is running]
- **Test Commands**: [CLI commands to validate functionality]
- **Expected Responses**: [What success looks like]

## Troubleshooting
- **Common Issues**: [Known problems and solutions]
- **Log Locations**: [Where to find service logs]
- **Rollback Procedure**: [How to revert if needed]

## Cost Optimization Notes
- **Free Tier Usage**: [Current utilization status]
- **Cost Alerts**: [Budget thresholds and monitoring]
- **Scaling Triggers**: [When/how service will scale]
```

**Labels**: AWS, Infrastructure, Security, [Priority]
**Estimate**: [1-8 points based on complexity]
```

---

## **🗄️ Backend Development Tasks**

**Template for API/Server Work (Backend Engineer)**

```
## User Story
As a [user type], I want [functionality] so that [benefit]

## API Specifications
**Endpoints to implement:**
- `POST /api/[endpoint]` - [Description]
- `GET /api/[endpoint]` - [Description]

**Request/Response Format:**
```json
{
  "example": "request/response structure"
}
```

## Business Logic Requirements
- [List core business rules this endpoint must enforce]
- [Data validation requirements]
- [Medical safety considerations if applicable]

## Database Requirements
- **Tables affected**: [List tables that will be modified/queried]
- **Schema changes**: [Any new columns or tables needed]
- **Performance**: [Query optimization requirements]

## Integration Requirements
- **External APIs**: [Claude API, Stripe, etc.]
- **AWS Services**: [S3, Lambda, SQS integration points]
- **Error Handling**: [How to handle API failures, retries]

## Security Requirements
- **Authentication**: [JWT validation, user permissions]
- **Data Protection**: [Encryption, PII handling]
- **Audit Logging**: [What actions must be logged]

## Acceptance Criteria (QA Testable)
- [ ] API endpoints implemented with proper HTTP status codes (200, 400, 401, 404, 500)
- [ ] Request validation implemented with clear error messages
- [ ] Business logic correctly implemented and tested with unit tests
- [ ] Database queries optimized and indexed (query time <100ms)
- [ ] Integration with external services working (all API calls successful)
- [ ] Error handling implemented with proper logging to CloudWatch
- [ ] Unit tests written with >80% coverage
- [ ] API documentation updated with examples
- [ ] Performance benchmarks meet requirements (<500ms response time)

## QA Testing Criteria
### API Functional Testing
1. **Endpoint Validation**: Test all HTTP methods (GET, POST, PUT, DELETE) return correct status codes
2. **Request Validation**: Test with valid/invalid data, confirm appropriate error messages
3. **Authentication Testing**: Verify JWT token validation, unauthorized access blocked
4. **Rate Limiting**: Confirm API rate limits work as configured
5. **Response Format**: Validate JSON structure matches API documentation

### Database Testing
1. **Query Performance**: All database queries complete within 100ms
2. **Data Integrity**: Verify data validation rules prevent invalid data storage
3. **Transaction Handling**: Test rollback behavior on errors
4. **Connection Pooling**: Verify database connections properly managed

### Integration Testing
1. **External API Calls**: Test Claude API, Stripe API integration with success/failure scenarios
2. **AWS Service Integration**: Verify S3, SQS, SNS integration working
3. **Error Propagation**: Confirm external service failures handled gracefully

### Security Testing
1. **Input Sanitization**: Test SQL injection, XSS prevention
2. **Data Encryption**: Verify sensitive data encrypted in transit and at rest
3. **Audit Logging**: Confirm all data access logged with user ID and timestamp

## Medical Safety Checklist (if applicable)
- [ ] Conservative medical bias implemented (AI confidence <7 triggers "consult doctor")
- [ ] AI confidence scoring integrated (1-10 scale with traffic light display)
- [ ] Medical disclaimers included in responses ("not medical advice" prominent)
- [ ] Error scenarios handle user safety appropriately (fail safely)
- [ ] Emergency care triggers implemented for critical lab values

## Required Handover Documentation
**File**: `handovers/backend-[task-name]-handover.md`

```markdown
# Backend API Handover: [Task Name]
**Completed by**: Backend Engineer | **Date**: [Date] | **Next Agent**: Frontend Engineer

## API Endpoints Implemented
### [Endpoint Name]
- **URL**: `POST /api/[endpoint]`
- **Purpose**: [What this endpoint does]
- **Authentication**: [JWT required, user permissions]
- **Request Format**:
```json
{
  "example": "request structure",
  "required_field": "string",
  "optional_field": "number"
}
```
- **Response Format**:
```json
{
  "success": true,
  "data": {
    "result": "response data"
  },
  "ai_confidence": 8.5,
  "medical_disclaimer": "This is not medical advice..."
}
```
- **Error Responses**:
  - `400`: Invalid request data
  - `401`: Unauthorized access
  - `500`: Server error

## Database Schema Changes
- **Tables Modified**: [List tables with changes made]
- **New Indexes Created**: [Performance optimization indexes]
- **Migration Scripts**: [Location of database migration files]

## External Integrations
- **Claude API**: [How AI processing is implemented, error handling]
- **AWS Services**: [S3, SQS, SNS integration details]
- **Cost Tracking**: [How API costs are monitored per request]

## For Frontend Integration
1. **Base URL**: [API base URL for different environments]
2. **Authentication**: [How to include JWT tokens in requests]
3. **Error Handling**: [Standard error response format to expect]
4. **Loading States**: [Expected response times for user feedback]

## Testing/Validation
- **Health Check**: `GET /api/health` should return `{"status": "ok"}`
- **Test Data**: [Sample requests for testing integration]
- **Performance**: [Expected response times for each endpoint]

## Medical Safety Implementation
- **AI Confidence Thresholds**: [How confidence scoring works]
- **Conservative Bias**: [When "consult doctor" messages appear]
- **Emergency Triggers**: [Critical values that require immediate care]
- **Audit Logging**: [How medical data access is logged]

## Troubleshooting
- **Common Errors**: [Known issues and solutions]
- **Log Locations**: [Where to find API logs in CloudWatch]
- **Performance Issues**: [How to identify slow queries]
```

**Labels**: Backend, API, [Component], [Priority]
**Estimate**: [2-8 points based on complexity]
```

---

## **🎨 Frontend Development Tasks**

**Template for UI Implementation (Frontend Engineer)**

```
## User Story
As a [user type], I want [interface functionality] so that [user benefit]

## Design Requirements
- **Mockup Reference**: [Link to Frame0 exported mockups]
- **Design System**: [Components from design system to use]
- **Responsive Requirements**: [Mobile-first 320px → Desktop breakpoints]
- **Accessibility**: [WCAG 2.1 AA compliance requirements]

## User Experience Requirements
- **User Flow**: [Step-by-step interaction flow]
- **States**: [Loading, success, error states]
- **Validation**: [Real-time form validation, error messaging]
- **Performance**: [Page load time, interaction responsiveness]

## Technical Implementation
- **Components**: [Next.js components to create/modify]
- **API Integration**: [Backend endpoints to consume]
- **State Management**: [Local state vs global state requirements]
- **Routing**: [Navigation and URL structure]

## Mobile-First Requirements
- **Touch Targets**: [44px minimum for interactive elements]
- **Content Width**: [272px safe area on mobile]
- **Typography**: [16px minimum for readability]
- **Gestures**: [Swipe, pinch-to-zoom considerations]

## Medical Context Requirements (if applicable)
- **Anxiety-Aware Design**: [Supportive messaging, clear information hierarchy]
- **Medical Disclaimers**: [Placement and prominence of legal text]
- **Trust Building**: [Security messaging, processing transparency]
- **Error Communication**: [How to communicate AI failures to users]

## Acceptance Criteria (QA Testable)
- [ ] UI matches approved mockups exactly (pixel-perfect implementation verified with overlay)
- [ ] Responsive design works on all target devices (320px-1920px tested)
- [ ] All interactive elements meet 44px touch target requirements (measured)
- [ ] Loading states and error handling implemented and tested
- [ ] Form validation provides clear, helpful feedback (tested with invalid inputs)
- [ ] API integration working with proper error handling (network failures tested)
- [ ] Accessibility requirements met (keyboard navigation, screen readers working)
- [ ] Performance requirements met (<3 second load time on 3G)
- [ ] Cross-browser testing completed (Chrome, Safari, Firefox latest versions)

## QA Testing Criteria
### Visual Testing
1. **Pixel-Perfect Accuracy**: Compare implementation to mockups using overlay method
2. **Responsive Breakpoints**: Test at 320px, 768px, 1024px, 1920px screen widths
3. **Touch Target Verification**: Measure all interactive elements are ≥44px
4. **Typography Testing**: Verify font sizes match design system (16px minimum mobile)
5. **Color Contrast**: Test color combinations meet WCAG 2.1 AA standards (4.5:1 ratio)

### Functional Testing
1. **Form Interactions**: Test all input fields with valid/invalid data
2. **Button States**: Verify hover, focus, active, disabled states work correctly
3. **Loading States**: Confirm spinners/progress indicators display during API calls
4. **Error States**: Test network failures, API errors display helpful messages
5. **Success States**: Verify successful actions show appropriate feedback

### User Experience Testing
1. **Navigation Flow**: Complete full user journey without confusion
2. **Mobile Touch**: Test all interactions work properly with finger touch
3. **Keyboard Navigation**: Tab through all interactive elements in logical order
4. **Screen Reader**: Test with VoiceOver (iOS) or TalkBack (Android)
5. **Performance**: Measure Lighthouse scores (Performance >90, Accessibility >95)

### Browser Compatibility Testing
1. **Chrome Latest**: Full functionality testing
2. **Safari Latest**: iOS Safari and macOS Safari testing
3. **Firefox Latest**: Feature compatibility testing
4. **Edge Latest**: Windows compatibility testing

### Device Testing
1. **iPhone**: iOS 16+ on actual device
2. **Android**: Android 10+ on actual device
3. **Tablet**: iPad and Android tablet testing
4. **Desktop**: Multiple screen resolutions

## Medical Context Testing (if applicable)
1. **Anxiety Reduction**: Verify supportive messaging appears for concerning results
2. **Trust Building**: Confirm security indicators visible during sensitive actions
3. **Medical Disclaimers**: Validate "not medical advice" text prominent and readable
4. **Emergency Messaging**: Test critical value warnings display correctly

## Required Handover Documentation
**File**: `handovers/frontend-[task-name]-handover.md`

```markdown
# Frontend Implementation Handover: [Task Name]
**Completed by**: Frontend Engineer | **Date**: [Date] | **Next Agent**: QA Engineer

## Components Implemented
### [Component Name]
- **Location**: `src/components/[ComponentName].tsx`
- **Purpose**: [What this component does for users]
- **Props Interface**:
```typescript
interface ComponentProps {
  required_prop: string;
  optional_prop?: number;
  onAction: (data: ActionData) => void;
}
```
- **State Management**: [Local state vs global state used]
- **API Integration**: [Which endpoints this component calls]

## Pages/Routes Created
- **Route**: `/[route-name]`
- **Component**: `src/pages/[PageName].tsx`
- **Authentication**: [Public/private route, user permissions required]
- **SEO**: [Meta tags, page title, description]

## Design System Compliance
- **Typography**: Uses design system scale (26px/20px/18px/16px)
- **Colors**: Implements color palette (#2563EB primary, #059669 secondary)
- **Spacing**: Follows 8px/16px/20px spacing system
- **Layout**: 24px margins, 272px content width on mobile verified

## API Integration Details
### [API Endpoint]
- **URL**: [Backend endpoint URL]
- **Method**: [HTTP method]
- **Authentication**: [How JWT token is included]
- **Request Format**: [Data structure sent to backend]
- **Response Handling**: [How success/error responses are processed]
- **Loading States**: [How loading indicators are managed]
- **Error Handling**: [How API errors are displayed to users]

## User Experience Implementation
- **Loading States**: [Where spinners/progress bars appear]
- **Error Messages**: [How validation and API errors are shown]
- **Success Feedback**: [Confirmation messages and visual feedback]
- **Accessibility**: [Screen reader text, keyboard shortcuts]

## For QA Testing
### Test Data
- **Valid Inputs**: [Examples of correct form data]
- **Invalid Inputs**: [Examples to test validation]
- **API Test URLs**: [Endpoints to verify integration]

### Expected Behavior
1. **Happy Path**: [Normal user flow should work like this]
2. **Error Scenarios**: [How errors should be displayed]
3. **Mobile Experience**: [Key mobile-specific behaviors]
4. **Performance**: [Expected load times and responsiveness]

### Critical Test Cases
1. **Form Validation**: [Specific validation rules to test]
2. **API Error Handling**: [Network failure behavior]
3. **Mobile Touch**: [Touch interactions that must work]
4. **Accessibility**: [Screen reader announcements expected]

## Medical Safety Implementation (if applicable)
- **Anxiety-Aware Design**: [Supportive messaging patterns used]
- **Trust Indicators**: [Security/processing transparency elements]
- **Medical Disclaimers**: [How "not medical advice" is displayed]
- **Conservative Bias**: [How "consult doctor" messages appear]

## Troubleshooting
- **Common Issues**: [Known browser compatibility issues]
- **Performance**: [If slow, check these API calls]
- **Mobile Problems**: [Common mobile-specific issues]
```

**Labels**: Frontend, UI, [Component], [Priority]
**Estimate**: [2-5 points based on complexity]
```

---

## **🎯 Product Management Tasks**

**Template for Feature Definition (Product Manager)**

```
## Feature Overview
[Clear description of the feature and its business value]

## Business Objectives
- **Primary Goal**: [Main business objective this feature achieves]
- **Success Metrics**: [Specific, measurable KPIs]
- **User Segment**: [Which users benefit from this feature]
- **Revenue Impact**: [How this affects conversion, retention, etc.]

## Market Context
- **User Research**: [Supporting user feedback or research]
- **Competitive Analysis**: [How competitors handle this feature]
- **Regulatory Requirements**: [GDPR, medical compliance considerations]

## User Jobs to be Done
1. **[User type]** wants to **[job]** so they can **[outcome]**
2. **[User type]** wants to **[job]** so they can **[outcome]**

## Feature Requirements
### Must Have (MVP)
- [Essential functionality for launch]
- [Core user value proposition]

### Should Have (Post-MVP)
- [Important but not blocking features]

### Could Have (Future)
- [Nice-to-have enhancements]

## User Stories
```
As a [user type]
I want [functionality]  
So that [benefit]
```

## Medical Safety Considerations (if applicable)
- **Risk Assessment**: [Potential user safety implications]
- **Mitigation Strategies**: [How to protect users from harm]
- **Conservative Bias**: [When to recommend medical consultation]
- **Provider Relations**: [How this affects healthcare provider relationships]

## Acceptance Criteria (QA Testable)
- [ ] Feature requirements documented and approved by stakeholders
- [ ] User stories written with clear, measurable acceptance criteria
- [ ] Success metrics defined with tracking implementation plan
- [ ] Regulatory compliance requirements identified and documented
- [ ] Medical safety considerations documented with risk mitigation
- [ ] Go-to-market strategy defined with launch timeline
- [ ] Feature flag implementation planned with rollout strategy

## QA Validation Criteria
### Requirements Validation
1. **Completeness Check**: All user stories have acceptance criteria that can be tested
2. **Success Metrics**: Metrics can be measured and tracked (not aspirational)
3. **Medical Safety**: Risk assessment includes specific mitigation steps
4. **Regulatory Compliance**: Requirements map to specific GDPR/HIPAA articles
5. **Technical Feasibility**: Engineering team confirmed implementation approach

### Documentation Quality
1. **User Story Format**: All follow "As a [user], I want [goal], so that [benefit]" format
2. **Acceptance Criteria**: Each criterion is testable with pass/fail outcome
3. **Business Value**: Success metrics tied to specific business objectives
4. **Risk Assessment**: Medical and business risks identified with severity levels

## Definition of Done
- [ ] Complete feature specification approved by stakeholders
- [ ] Technical requirements handed off to engineering with estimates
- [ ] Design requirements handed off to UI/UX with mockup specifications
- [ ] Success metrics instrumentation planned with implementation details
- [ ] Launch plan and success criteria defined with measurable targets
- [ ] **Handover documentation completed** (see template below)

## Required Handover Documentation
**File**: `handovers/product-[feature-name]-requirements.md`

```markdown
# Product Requirements Handover: [Feature Name]
**Completed by**: Product Manager | **Date**: [Date] | **Next Agent**: UI/UX Designer, CTO

## Feature Overview
- **Business Objective**: [Primary goal this feature achieves]
- **User Value**: [How this benefits users directly]
- **Success Metrics**: [Specific, measurable KPIs with targets]
- **Priority**: [Critical/High/Medium/Low with justification]

## User Stories
### Primary User Flow
1. **Story**: As a [user type], I want [functionality], so that [benefit]
   **Acceptance Criteria**:
   - [ ] [Specific, testable criterion]
   - [ ] [Another measurable requirement]
   - [ ] [Performance or usability requirement]

2. **Story**: [Next user story in sequence]
   **Acceptance Criteria**: [Testable criteria]

## Technical Requirements for CTO/Engineering
### API Requirements
- **New Endpoints Needed**: [List with HTTP methods and purposes]
- **Database Changes**: [New tables, columns, indexes required]
- **External Integrations**: [Claude API, Stripe, AWS services needed]
- **Performance Requirements**: [Response times, throughput, availability]

### Security & Compliance
- **Data Sensitivity**: [What type of health data is involved]
- **Encryption Requirements**: [At rest, in transit specifications]
- **Audit Logging**: [What actions must be logged for compliance]
- **Access Controls**: [User permissions and role requirements]

## Design Requirements for UI/UX
### User Experience Goals
- **Primary User Journey**: [Step-by-step flow description]
- **Emotional Outcome**: [How users should feel using this feature]
- **Mobile-First Requirements**: [Specific mobile considerations]
- **Accessibility**: [WCAG compliance requirements]

### Medical Context Considerations
- **Anxiety Management**: [How to reduce health anxiety through design]
- **Trust Building**: [Visual cues needed for credibility]
- **Medical Disclaimers**: [Where and how to display legal text]
- **Conservative Bias**: [When to encourage medical consultation]

### Screen/Component Requirements
- **New Screens Needed**: [List with purposes and content]
- **Components to Update**: [Existing components needing modifications]
- **Design System**: [New patterns or components to create]

## Business Context
### Market Research
- **User Feedback**: [Supporting research or user quotes]
- **Competitive Analysis**: [How competitors handle this feature]
- **Healthcare Provider Input**: [Provider feedback if applicable]

### Revenue Impact
- **Conversion Impact**: [How this affects free-to-premium conversion]
- **Retention Impact**: [How this affects user retention]
- **Cost Implications**: [Development and operational costs]

## Medical Safety Requirements
### Risk Assessment
- **Patient Safety Risks**: [Potential harms to users]
- **Mitigation Strategies**: [Specific steps to protect users]
- **Conservative Bias**: [When to recommend medical consultation]
- **Emergency Protocols**: [Critical value handling procedures]

### Regulatory Compliance
- **GDPR Requirements**: [Specific articles and implementation]
- **Medical Regulations**: [Relevant healthcare compliance needs]
- **Audit Requirements**: [What must be tracked and reported]

## Success Measurement
### Primary KPIs
- **Metric 1**: [Specific measurement with target value]
- **Metric 2**: [Another measurable outcome]
- **Timeline**: [When success will be measured]

### Secondary Metrics
- **User Engagement**: [How engagement will be measured]
- **Error Rates**: [Acceptable failure thresholds]
- **Performance**: [Speed and reliability targets]

## Launch Strategy
- **Feature Flags**: [Rollout strategy and user segments]
- **Beta Testing**: [Who will test and how]
- **Success Criteria**: [When feature is considered successful]
- **Rollback Plan**: [What to do if feature fails]

## For Next Agents
### For UI/UX Designer
1. **Priority Screens**: [Which screens to design first]
2. **User Flow Complexity**: [Expected interaction complexity]
3. **Medical Context**: [Special design considerations for health data]

### For CTO/Backend Engineer
1. **Technical Complexity**: [Expected development effort]
2. **Architecture Decisions**: [New patterns or services needed]
3. **Integration Points**: [External services to coordinate]
```

**Labels**: Product, Feature, Requirements, [Priority]
**Estimate**: [3-5 points for research and specification]
```

---

## **🎨 Design Tasks**

**Template for UI/UX Work (UI/UX Designer)**

```
## Design Brief
[Clear description of the design challenge and user need]

## User Experience Goals
- **Primary User Journey**: [Main flow user will take]
- **Emotional Outcome**: [How user should feel using this feature]
- **Usability Goals**: [Specific interaction improvements]
- **Accessibility Goals**: [Inclusive design requirements]

## Design System Requirements
- **Components**: [Which design system components to use/create]
- **Typography**: [Hierarchy using 26px/20px/18px/16px scale]
- **Colors**: [Primary #2563EB, Secondary #059669, usage]
- **Spacing**: [8px/16px/20px spacing system application]
- **Layout**: [24px margins, 272px content width on mobile]

## Mobile-First Constraints
- **Frame Size**: [320×690px mobile design frame]
- **Content Area**: [272px safe area for content]
- **Touch Targets**: [48px preferred, 44px minimum]
- **Typography**: [16px minimum for mobile readability]

## Medical Context Considerations (if applicable)
- **Anxiety Awareness**: [How to reduce health anxiety through design]
- **Trust Building**: [Visual cues that build credibility]
- **Information Hierarchy**: [How to present medical information clearly]
- **Conservative Bias**: [Design patterns that encourage medical consultation]

## Technical Constraints
- **Implementation**: [Next.js/Tailwind CSS constraints]
- **Performance**: [Image optimization, loading states]
- **Responsive Breakpoints**: [Mobile/tablet/desktop specifications]

## Deliverables (QA Testable)
- [ ] User flow diagram documenting complete interaction path
- [ ] Wireframes for all screen states (empty, loading, error, success, failure)
- [ ] High-fidelity mockups exported as PNG from Frame0 (positioned at 400px spacing)
- [ ] Design system compliance verified with measurements documented
- [ ] Accessibility annotations for development team (WCAG 2.1 AA)
- [ ] Responsive behavior specifications for 320px, 768px, 1024px, 1920px
- [ ] Interaction specifications and micro-animations timing

## QA Design Validation Criteria
### Design System Compliance (Mathematical Verification)
1. **Typography Scale**: Verify 26px/20px/18px/16px hierarchy used correctly
2. **Color Usage**: Confirm #2563EB primary, #059669 secondary colors applied
3. **Spacing System**: Measure 8px/16px/20px spacing between elements
4. **Layout Constraints**: Verify 24px margins, 272px content width on mobile
5. **Touch Targets**: Measure all interactive elements are ≥44px (preferred 48px)

### Mobile-First Validation
1. **Frame Size**: Confirm 320×690px mobile design frame used
2. **Content Safety**: Verify content fits within 272px safe area
3. **Text Legibility**: Confirm minimum 16px font size on mobile
4. **Touch Accessibility**: Ensure adequate spacing between touch elements

### Accessibility Compliance
1. **Color Contrast**: Test all color combinations meet 4.5:1 ratio minimum
2. **Text Size**: Verify no text smaller than 16px on mobile, 14px on desktop
3. **Focus States**: Confirm all interactive elements have visible focus indicators
4. **Screen Reader**: Design includes appropriate labels and hierarchies

## Acceptance Criteria (QA Testable)
- [ ] Design solves identified user problem effectively (validated with user stories)
- [ ] All screens and states designed (minimum 5 states per flow documented)
- [ ] Design system compliance verified mathematically with measurements
- [ ] Mobile-first responsive design completed for all breakpoints
- [ ] Accessibility requirements met (color contrast, text size measured)
- [ ] Mockups exported and positioned correctly in Frame0 (400px spacing verified)
- [ ] Design handoff documentation completed with implementation details
- [ ] Usability assumptions documented for future testing

## Review Requirements (Validation Checklist)
- [ ] Medical User Advocate review completed (for medical interfaces)
- [ ] Technical feasibility review with Frontend Engineer (implementation confirmed)
- [ ] Product Manager approval for business requirements (user stories met)
- [ ] Accessibility compliance verification (WCAG 2.1 AA standards met)

## Required Handover Documentation
**File**: `handovers/design-[feature-name]-handover.md`

```markdown
# Design Handover: [Feature Name]
**Completed by**: UI/UX Designer | **Date**: [Date] | **Next Agent**: Frontend Engineer

## Design Overview
- **User Problem Solved**: [What user need this design addresses]
- **Design Approach**: [Key design decisions and rationale]
- **User Flow**: [Step-by-step interaction path]
- **Emotional Goal**: [How users should feel using this interface]

## Mockup Locations
### Frame0 Export Details
- **Project URL**: [Frame0 project link]
- **Export Format**: PNG at 2x resolution
- **Frame Positioning**: Positioned at 400px intervals to prevent overlap
- **Screen List**:
  1. **[Screen Name]** - Frame position (X: 0px, Y: 0px) - Purpose: [Screen function]
  2. **[Screen Name]** - Frame position (X: 400px, Y: 0px) - Purpose: [Screen function]
  3. **[Error State]** - Frame position (X: 800px, Y: 0px) - Purpose: [Error handling]
  4. **[Loading State]** - Frame position (X: 1200px, Y: 0px) - Purpose: [Loading indication]
  5. **[Success State]** - Frame position (X: 1600px, Y: 0px) - Purpose: [Success feedback]

## Design System Implementation
### Typography Implementation
- **Headlines (26px)**: Used for [specific elements]
- **Subheads (20px)**: Used for [specific elements]
- **Body Text (18px)**: Used for [specific elements]
- **Small Text (16px)**: Used for [specific elements, minimum on mobile]

### Color Implementation
```css
/* Primary Colors */
--primary-blue: #2563EB;     /* Used for: primary buttons, links, focus states */
--secondary-green: #059669;   /* Used for: success states, positive indicators */
--neutral-gray: #6B7280;      /* Used for: secondary text, borders */
--background-white: #FFFFFF;  /* Used for: main backgrounds */
--text-dark: #111827;         /* Used for: primary text */
```

### Spacing Implementation
```css
/* Spacing System */
--spacing-xs: 8px;   /* Used for: tight element spacing */
--spacing-sm: 16px;  /* Used for: standard element spacing */
--spacing-md: 20px;  /* Used for: component spacing */
--spacing-lg: 24px;  /* Used for: section margins */
```

## Responsive Behavior Specifications
### Breakpoint Implementations
1. **Mobile (320px-767px)**:
   - 24px side margins
   - 272px content width maximum
   - Single column layout
   - 48px touch targets (44px minimum)

2. **Tablet (768px-1023px)**:
   - 40px side margins
   - Two-column layout where appropriate
   - Increased white space

3. **Desktop (1024px+)**:
   - Centered content with maximum width
   - Multi-column layouts
   - Hover states for interactive elements

## Component Specifications
### [Component Name]
- **Purpose**: [What this component does]
- **States**: Default, Hover, Focus, Active, Disabled, Loading, Error
- **Props Required**:
```typescript
interface ComponentProps {
  required_prop: string;
  optional_prop?: boolean;
  onAction: () => void;
}
```
- **Accessibility**: [Screen reader text, keyboard navigation]
- **Medical Context**: [Special health-related considerations]

## Interaction Specifications
### User Flow Details
1. **Entry Point**: [How users arrive at this interface]
2. **Primary Actions**: [Main interactions available]
3. **Success Path**: [Expected user journey]
4. **Error Handling**: [How errors are communicated]
5. **Exit Points**: [How users leave this interface]

### Micro-Interactions
- **Button Press**: [Animation timing and feedback]
- **Form Validation**: [Real-time validation patterns]
- **Loading States**: [Progress indication methods]
- **Transitions**: [Page/screen transition specifications]

## Medical Context Implementation (if applicable)
### Anxiety-Aware Design
- **Supportive Messaging**: [Specific copy patterns used]
- **Visual Hierarchy**: [How concerning information is presented]
- **Trust Indicators**: [Security/credibility visual cues]
- **Progressive Disclosure**: [How complex medical information is revealed]

### Medical Disclaimers
- **Placement**: [Where "not medical advice" appears]
- **Visual Treatment**: [How disclaimers are styled]
- **Prominence**: [Ensuring legal text is noticeable without being alarming]

## Accessibility Implementation
### WCAG 2.1 AA Compliance
- **Color Contrast Ratios**: [Specific measurements for all color combinations]
- **Focus Indicators**: [How keyboard focus is shown]
- **Screen Reader Support**: [Alt text, ARIA labels, heading hierarchy]
- **Keyboard Navigation**: [Tab order and keyboard shortcuts]

### Mobile Accessibility
- **Touch Target Size**: [All interactive elements ≥44px]
- **Touch Target Spacing**: [Minimum spacing between touch elements]
- **One-Handed Use**: [Key actions accessible with thumb]
- **Screen Reader**: [Mobile screen reader specific considerations]

## Implementation Notes for Frontend Engineer
### Critical Design Details
1. **Pixel-Perfect Requirements**: [Elements that must match exactly]
2. **Responsive Priority**: [Which breakpoints are most critical]
3. **Performance Considerations**: [Image optimization, loading priorities]
4. **Animation Timing**: [Specific duration and easing requirements]

### Technical Constraints
- **Image Assets**: [Required image formats and resolutions]
- **Icon System**: [Icon library and sizing requirements]
- **Font Loading**: [Web font loading and fallback strategy]
- **CSS Framework**: [Tailwind CSS utility classes to use]

### Testing Priorities
1. **Visual Regression**: [Key screens to test for pixel accuracy]
2. **Responsive Testing**: [Critical breakpoints to validate]
3. **Accessibility Testing**: [Screen reader and keyboard testing priorities]
4. **Performance Testing**: [Page load and interaction responsiveness]

## Medical Safety Design Validation
- **Conservative Bias**: [How design encourages medical consultation]
- **Emergency Messaging**: [Critical alert design patterns]
- **Trust Building**: [Visual credibility and security indicators]
- **Error Communication**: [How AI failures are communicated safely]
```

**Labels**: Design, UX, [Component], [Priority]
**Estimate**: [3-8 points based on complexity and screen count]
```

---

## **⚕️ Medical/Compliance Tasks**

**Template for Medical Safety Work (Medical User Advocate)**

```
## Medical Context
[Description of the medical/healthcare aspect being addressed]

## Patient Safety Objectives
- **Primary Safety Goal**: [Main patient protection objective]
- **Risk Mitigation**: [What patient harms we're preventing]
- **Clinical Workflow**: [How this fits into healthcare delivery]

## Regulatory Compliance Requirements
- **GDPR Article 9**: [Special category health data requirements]
- **Medical Device Regulations**: [If applicable, what compliance needed]
- **Clinical Guidelines**: [Relevant medical standards or practices]
- **Healthcare Provider Standards**: [Professional requirements to consider]

## User Safety Requirements
### AI Interpretation Safety
- [ ] AI confidence thresholds defined and implemented
- [ ] Conservative bias implemented for abnormal values
- [ ] Clear "not medical advice" disclaimers included
- [ ] Medical consultation triggers identified and implemented

### Emergency Care Detection
- [ ] Critical lab value thresholds defined
- [ ] Emergency care escalation workflows created
- [ ] "Seek immediate medical attention" triggers implemented

### User Communication
- [ ] Plain language medical terminology used
- [ ] Anxiety-aware messaging implemented
- [ ] Supportive tone for concerning results
- [ ] Clear next steps provided for all scenarios

## Healthcare Provider Integration
- **Provider Reception**: [How providers will receive this feature]
- **Clinical Utility**: [Value proposition for healthcare professionals]
- **Medical-Legal Considerations**: [Liability and professional standards]

## Validation Requirements
- [ ] Clinical accuracy validation framework defined
- [ ] Healthcare provider feedback collection planned
- [ ] User safety monitoring system implemented
- [ ] Adverse event reporting capability created

## Acceptance Criteria (QA Testable)
- [ ] Patient safety risks identified and mitigated with specific measures
- [ ] Conservative medical bias implemented throughout (AI confidence <7 triggers consultation)
- [ ] Healthcare provider concerns addressed with documented responses
- [ ] Regulatory compliance requirements documented with implementation steps
- [ ] User safety monitoring and reporting implemented with trackable metrics
- [ ] Medical disclaimers legally reviewed and approved by legal counsel
- [ ] Clinical validation plan approved by medical advisors

## QA Validation Criteria
### Medical Safety Testing
1. **AI Confidence Thresholds**: Verify confidence scoring triggers "consult doctor" at <7/10
2. **Emergency Triggers**: Test critical lab values display immediate care warnings
3. **Conservative Bias**: Confirm abnormal results always include medical consultation advice
4. **Disclaimer Prominence**: Verify "not medical advice" visible on all medical content
5. **Error Safety**: Test AI processing failures maintain user safety (no false reassurance)

### Regulatory Compliance Testing
1. **GDPR Article 9**: Verify special category health data consent flows working
2. **Data Retention**: Test automated deletion of health data per retention policies
3. **User Rights**: Validate data export and deletion requests function correctly
4. **Audit Logging**: Confirm all health data access logged with user ID and timestamp
5. **Consent Tracking**: Verify consent can be withdrawn and data handling stops

### Healthcare Provider Integration Testing
1. **Report Format**: Validate AI reports formatted for clinical review
2. **Medical Accuracy**: Test AI interpretations against medical professional review
3. **Clinical Context**: Verify reports include appropriate medical context
4. **Liability Protection**: Confirm reports clearly state AI limitations

## Medical Review Checklist (QA Validated)
- [ ] All medical content reviewed for accuracy by qualified medical professional
- [ ] Risk/benefit analysis completed with specific risk mitigation measures
- [ ] Healthcare provider impact assessment completed with provider feedback
- [ ] User safety incident prevention measures implemented and tested
- [ ] Emergency care escalation protocols defined with clear trigger criteria
- [ ] Clinical accuracy validation framework established with success metrics

## Required Handover Documentation
**File**: `handovers/medical-[feature-name]-compliance.md`

```markdown
# Medical Safety & Compliance Handover: [Feature Name]
**Completed by**: Medical User Advocate | **Date**: [Date] | **Next Agent**: QA Engineer, Backend Engineer

## Medical Safety Implementation
### AI Safety Framework
- **Confidence Thresholds**: AI scores below 7/10 trigger "consult your doctor" messaging
- **Conservative Bias Implementation**:
  - Any lab value outside normal range → "Discuss with healthcare provider"
  - Abnormal patterns detected → "Important to review with doctor"
  - Processing errors → "Unable to provide interpretation, consult healthcare professional"

### Emergency Care Detection
- **Critical Lab Values**: [List specific values requiring immediate care warnings]
  - Glucose < 50 mg/dL or > 400 mg/dL → "Seek emergency care immediately"
  - Potassium < 2.5 or > 6.0 mEq/L → "Contact healthcare provider urgently"
  - [Additional critical thresholds based on medical guidelines]
- **Warning Messages**: "These results may indicate a serious condition requiring immediate medical attention"

### Medical Disclaimer Implementation
- **Prominent Placement**: Appears on all result screens, email reports, and printed summaries
- **Required Text**: "This AI interpretation is for educational purposes only and does not constitute medical advice. Always consult with a qualified healthcare professional for medical decisions."
- **Legal Review Status**: Approved by legal counsel on [Date]

## Regulatory Compliance Status
### GDPR Article 9 Implementation
- **Special Category Data Handling**: Health data encrypted at rest and in transit
- **Consent Mechanisms**: 
  - Explicit consent for health data processing collected during onboarding
  - Granular consent options for data sharing with healthcare providers
  - Consent withdrawal process implemented with 30-day data deletion

### HIPAA Readiness (Future Healthcare Scaling)
- **AWS BAA Coverage**: Business Associate Agreement activated for healthcare data
- **Encryption Standards**: AES-256 encryption for data at rest, TLS 1.3 for data in transit
- **Access Controls**: Role-based access with audit logging of all PHI access
- **Breach Notification**: Incident response plan for potential data breaches

### Clinical Validation Framework
- **Accuracy Benchmarks**: AI interpretations validated against medical professional review
- **Success Metrics**: Target >85% accuracy for standard lab interpretations
- **Review Process**: Monthly review of AI interpretations by qualified medical professionals
- **Feedback Integration**: Process for incorporating medical professional feedback into AI training

## Healthcare Provider Relations
### Provider-Friendly Report Design
- **Clinical Format**: Reports structured for easy integration into clinical workflow
- **Source Data**: Original lab values prominently displayed alongside AI interpretation
- **Limitations**: Clear documentation of AI capabilities and limitations
- **Contact Information**: Provider contact for questions about AI reports

### Professional Standards Compliance
- **Medical Ethics**: Reports support rather than replace clinical judgment
- **Liability Considerations**: Clear documentation that reports are for patient education only
- **Professional Communication**: Language appropriate for healthcare professional review

## User Safety Monitoring
### Incident Tracking System
- **Safety Incidents**: Process for reporting and tracking user safety concerns
- **Escalation Procedures**: Clear protocols for serious safety incidents
- **Root Cause Analysis**: Framework for investigating and addressing safety issues
- **Improvement Process**: Continuous improvement based on safety incident learnings

### Adverse Event Reporting
- **Event Categories**: False reassurance, missed critical findings, inappropriate recommendations
- **Reporting Mechanism**: User and provider feedback system for safety concerns
- **Response Timeline**: 24-hour response for critical safety incidents
- **Documentation**: Comprehensive logging of all safety-related events

## For QA Testing
### Critical Test Scenarios
1. **AI Confidence Testing**: Verify low confidence scores (<7) trigger consultation messaging
2. **Emergency Value Testing**: Test critical lab values display immediate care warnings
3. **Conservative Bias Testing**: Confirm abnormal results include medical consultation advice
4. **Error Safety Testing**: Verify AI failures maintain user safety (no false reassurance)
5. **Disclaimer Visibility**: Confirm medical disclaimers visible and prominent

### Regulatory Compliance Testing
1. **Consent Flow Testing**: Verify GDPR consent collection and withdrawal processes
2. **Data Deletion Testing**: Test user data deletion requests complete successfully
3. **Audit Log Testing**: Confirm all health data access properly logged
4. **Export Testing**: Validate user data export functionality works correctly

### Provider Integration Testing
1. **Report Format Testing**: Verify reports formatted for clinical use
2. **Medical Accuracy Testing**: Validate AI interpretations against medical standards
3. **Limitation Communication**: Confirm AI limitations clearly communicated

## For Backend Implementation
### API Safety Requirements
- **Confidence Scoring**: All AI responses must include confidence scores (1-10)
- **Safety Triggers**: Implement automatic "consult doctor" triggers for confidence <7
- **Emergency Detection**: API must flag critical lab values for immediate care warnings
- **Audit Logging**: Log all health data access with user ID, timestamp, and action
- **Error Handling**: AI processing failures must fail safely (no medical advice)

### Database Safety Requirements
- **Data Encryption**: All health data encrypted using AES-256
- **Access Controls**: Role-based permissions for health data access
- **Retention Policies**: Automated deletion of health data per GDPR requirements
- **Audit Trail**: Comprehensive logging of all data access and modifications

## Medical Professional Consultation
- **Medical Advisor**: [Name and credentials of consulting medical professional]
- **Review Date**: [Date of medical professional review]
- **Approval Status**: Medical safety implementation approved with recommendations
- **Follow-up Required**: [Any additional medical review requirements]

## Risk Mitigation Summary
- **Primary Risk**: False medical reassurance leading to delayed care
- **Mitigation**: Conservative bias with prominent "consult doctor" messaging
- **Secondary Risk**: User anxiety from medical information
- **Mitigation**: Supportive messaging and clear action steps
- **Tertiary Risk**: Healthcare provider rejection of AI reports
- **Mitigation**: Provider-friendly format emphasizing clinical judgment support
```

**Labels**: Medical-Safety, HIPAA, GDPR, Compliance, [Priority]
**Estimate**: [2-5 points based on medical complexity]
```

---

## **🔍 QA Testing Tasks**

**Template for Quality Assurance (QA Engineer)**

```
## Testing Scope
[Description of what is being tested and why]

## Testing Objectives
- **Functional Testing**: [Core functionality to validate]
- **Performance Testing**: [Speed and reliability requirements]
- **Security Testing**: [Data protection and access control]
- **Compliance Testing**: [GDPR/medical regulatory requirements]

## Test Scenarios
### Happy Path Testing
- [ ] [Primary user flow works as expected]
- [ ] [All required fields accept valid input]
- [ ] [Success states display correctly]

### Error Path Testing  
- [ ] [Invalid input handled gracefully]
- [ ] [Network errors handled properly]
- [ ] [System failures fail safely]

### Edge Case Testing
- [ ] [Boundary value testing]
- [ ] [Concurrent user scenarios]
- [ ] [Large data set handling]

## Medical Safety Testing (if applicable)
- [ ] AI confidence scoring displays accurately
- [ ] Conservative bias triggers work correctly
- [ ] Medical disclaimers appear appropriately
- [ ] Emergency care triggers activate when needed
- [ ] Error handling maintains user safety

## Performance Requirements
- **API Response Time**: [<500ms for 95th percentile]
- **Page Load Time**: [<3 seconds initial load]
- **Mobile Performance**: [Specific mobile performance criteria]
- **Database Query Time**: [<100ms for standard queries]

## Security Testing
- [ ] Authentication and authorization working
- [ ] Data encryption validated
- [ ] Input validation prevents injection attacks
- [ ] Session management secure
- [ ] Audit logging captures required events

## Cross-Platform Testing
### Browsers
- [ ] Chrome (latest 2 versions)
- [ ] Safari (latest 2 versions)  
- [ ] Firefox (latest 2 versions)
- [ ] Edge (latest version)

### Devices
- [ ] iPhone (iOS 16+)
- [ ] Android (Android 10+)
- [ ] iPad/Tablet
- [ ] Desktop (1920x1080, 1366x768)

## Acceptance Criteria
- [ ] All test scenarios pass with no critical defects
- [ ] Performance requirements met
- [ ] Security vulnerabilities addressed
- [ ] Cross-platform compatibility validated
- [ ] Medical safety requirements verified
- [ ] Accessibility compliance tested
- [ ] Test documentation completed
- [ ] Defects logged and prioritized appropriately

## Test Deliverables
- [ ] Test plan document
- [ ] Test case execution results
- [ ] Defect reports with severity classification
- [ ] Performance benchmarks
- [ ] Security test results
- [ ] Sign-off recommendation for production release

**Labels**: QA, Testing, [Component], [Priority]
**Estimate**: [2-5 points based on scope and complexity]
```

---

## **⚙️ Architecture/CTO Tasks**

**Template for Technical Architecture (CTO)**

```
## Architecture Decision Context
[Background on what architectural decision needs to be made and why]

## Business Requirements
- **Performance Requirements**: [Specific performance criteria]
- **Scalability Requirements**: [Expected growth and scaling needs]  
- **Compliance Requirements**: [GDPR, HIPAA, medical regulations]
- **Cost Constraints**: [Budget limitations and cost optimization goals]

## Technical Requirements
- **Integration Points**: [External services, APIs, data sources]
- **Data Requirements**: [Volume, velocity, variety of data]
- **Security Requirements**: [Encryption, access control, audit logging]
- **Availability Requirements**: [Uptime, disaster recovery, backup]

## Architecture Options Considered
### Option 1: [Approach Name]
- **Pros**: [Benefits of this approach]
- **Cons**: [Limitations and risks]
- **Cost**: [Implementation and operational costs]
- **Complexity**: [Development and maintenance complexity]

### Option 2: [Approach Name]  
- **Pros**: [Benefits of this approach]
- **Cons**: [Limitations and risks]
- **Cost**: [Implementation and operational costs]
- **Complexity**: [Development and maintenance complexity]

## Recommended Decision
**Selected Approach**: [Chosen architecture option]
**Rationale**: [Why this option was selected over alternatives]

## Implementation Requirements
- **Infrastructure Changes**: [AWS services, database modifications]
- **Code Changes**: [Application architecture modifications]  
- **Migration Strategy**: [How to transition from current state]
- **Risk Mitigation**: [How to address identified risks]

## Success Criteria
- **Technical KPIs**: [Measurable technical outcomes]
- **Performance Benchmarks**: [Specific performance targets]
- **Cost Targets**: [Budget and operational cost goals]
- **Timeline**: [Implementation milestones and deadlines]

## Acceptance Criteria
- [ ] Architecture decision documented with rationale
- [ ] Technical specifications completed
- [ ] Risk assessment and mitigation plan created
- [ ] Implementation plan approved by team
- [ ] Cost analysis completed and approved
- [ ] Migration strategy defined and validated
- [ ] Performance requirements and testing plan defined
- [ ] Security and compliance requirements addressed

## Documentation Deliverables
- [ ] Architecture Decision Record (ADR) updated
- [ ] Technical specification document
- [ ] Implementation timeline and milestones
- [ ] Risk assessment and mitigation plan
- [ ] Cost analysis and budget impact
- [ ] Migration guide for development team

**Labels**: Architecture, Technical-Debt, [AWS/Database/Security], [Priority]
**Estimate**: [3-8 points based on architectural complexity]
```

---

## **Task Lifecycle & Workflow**

### Task States in Linear
1. **Backlog** - Task created and prioritized
2. **Medical Review** - Medical safety review (if applicable)  
3. **Architecture Review** - Technical architecture review (if needed)
4. **Ready for Development** - All reviews complete, ready to start
5. **In Progress** - Active development work
6. **Code Review** - Peer review and technical validation
7. **Safety Testing** - Medical safety and compliance validation
8. **Done** - Complete and deployed

### Task Dependencies
- **Sequential**: Some tasks must be completed before others can start
- **Parallel**: Independent tasks can be worked on simultaneously  
- **Cross-functional**: Tasks requiring input from multiple agents

### Estimation Guidelines
- **1 point**: Simple configuration or small bug fix (< 2 hours)
- **2 points**: Straightforward feature or standard task (< 4 hours)  
- **3 points**: Moderate complexity with some unknowns (< 1 day)
- **5 points**: Complex task requiring research/design (< 2 days)
- **8 points**: Large task that should be broken down (< 3 days)

---

This template system ensures consistent task creation across all agent specializations while maintaining the specific requirements for healthcare AI development and our compliance needs.