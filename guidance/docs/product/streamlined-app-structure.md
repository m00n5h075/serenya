# Serenya Streamlined App Structure

**Date:** August 31, 2025  
**Focus:** Core user experience with essential flows only  

---

## 🎯 **3 CORE SCREENS**

### **1. Timeline View (Main Dashboard)**
**Purpose:** Central hub showing user's complete health history  
**Brand Values:** Warm confidence, empathy, custom Serenya experience

**Key Features:**
- Chronological display of all results analyses (newest at top)
- Quick access to all doctor reports
- Upload new document entry point with 3-state behavior
- Time-based grouping (Today, This Week, Last Month) with collapse/expand
- Haptic feedback for state transitions
- Top navigation bar with settings access

#### **Navigation Bar**
- **Position:** Fixed top of Timeline View only
- **Left:** App logo/brand name
- **Right:** Settings button (gear/cog icon, 44px touch target)
- **Function:** Settings button navigates to Settings Menu flow
- **Style:** Clean, minimal design consistent with warm brand values
- **Scope:** Settings button only visible on main Timeline View, not on Results Analysis or Doctor Reports pages

#### **Empty State**
- **Visual:** Abstract illustration/icon (warm, empathetic, Serenya-branded)
- **Message:** Encouraging call-to-action for user engagement
- **Goal:** Motivate first document upload without emphasizing "progress over time"

#### **Upload Button States**
1. **Resting State:** "Upload Document" button
2. **Loading State:** Progress indicator with variable duration (up to 3-minute timeout)
3. **Success State:** "View Results" button with haptic feedback
4. **Failure State:** Returns to resting state + popup message + haptic feedback

#### **Timeline Content**
- **Chronological Order:** Newest items at top for intuitive scrolling
- **Time Grouping:** Collapsible/expandable sections ("Today", "This Week", "Last Month")
- **Item Types:** Results analysis vs Doctor reports (distinct visual treatment)
- **Premium Indicators:** Subtle visual distinction for premium doctor reports

#### **Visual Design Specifications**

**Card Dimensions (Mobile-First):**
- Width: Full width minus 24px margins (272-327px)
- Min Height: 120px (touch target compliance)
- Padding: 16px internal
- Border Radius: 12px (warm, approachable feel)
- Shadow: Subtle elevation (0 2px 8px rgba(0,0,0,0.08))

**Item Type Distinction:**

**Results Analysis Items (Free):**
- Clean white background with soft blue accent border (2px left)
- Analysis icon in blue (20px, top-right)
- Header: "Serenya Analysis" (16px medium weight)
- Visual weight: Lighter, spacious padding

**Doctor Reports (Premium):**
- White background with subtle green accent border (2px left)
- Medical verification badge in green (20px, top-right)
- Header: "Professional Report" with micro premium indicator (16px, small star icon)
- Visual weight: Slightly more substantial, tighter density

**Color Palette:**
- AI Analysis Border: Light blue (#E3F2FD)
- Doctor Report Border: Light green (#E8F5E8)
- Background: Pure white (#FFFFFF)
- Primary Text: Dark gray (#333333)
- Secondary Text: Medium gray (#666666)

**Typography Scale:**
- Item Title: 16px (semibold for reports, medium for analysis)
- Date/Time: 12px regular, secondary color
- Content Preview: 14px regular (2-3 lines max)
- Labels: 11px medium, accent colors

**Accessibility & Warmth:**
- WCAG AA color contrast compliance
- 48px minimum touch targets
- Gentle transitions and micro-interactions
- Progressive disclosure for content details

#### **Interactions & Navigation**
- **Mobile:** Pressed state for touch interactions (44px minimum touch targets)
- **Desktop:** Optional hover states with gentle color transitions
- **Navigation:** Clean slide transitions to detail pages, fallback to direct navigation
- **Micro-interactions:** Smooth animations, haptic feedback, gentle shadow changes
- **Accessibility:** Clear focus states, screen reader compatibility, semantic markup

**User Flow:** Primary landing screen after login, central navigation hub

---

### **2. Results Analysis Page**
**Purpose:** Clean presentation of AI-interpreted medical document analysis  
**⚠️ TECHNICAL NOTE:** This page uses the **SAME COMPONENT** as Doctor Reports Page with only 2 variables:
- **Page Title Variable:** "Results"
- **FAB Options Variable:** Analysis-specific actions

**Key Features:**
- Standard markdown rendering of AI-formatted response
- Clean, content-focused design
- Back button navigation to Timeline View
- Page title: "Results" in navigation bar
- Interactive FAB for follow-up questions

#### **Content Display**
- **Format:** Standard markdown rendered from AI agent response
- **Layout:** Clean, minimal design focused on readability
- **Navigation:** Back button (top-left) to return to Timeline View
- **Title:** "Results" displayed in navigation bar

#### **FAB (Floating Action Button)**
- **Resting State:** Brain icon (represents thinking/analysis assistance)
- **Interaction:** Material Design inline expansion showing available options
- **Options:** Variable per page (to be defined later)

**FAB State Flow:**
1. **Resting:** Brain icon, expandable menu
2. **Expanded:** Options animate out inline from FAB
3. **Loading:** Selected option triggers loading animation
4. **Success:** Dual feedback (phone vibration + visual FAB animation) → return to resting
5. **Failure:** Dual feedback (phone vibration + visual FAB animation) + error popup → return to resting

#### **Serenya Interaction Pattern - Tab System**
**UI/UX Research Recommendation:** **Enhanced FAB State Change** with tab navigation

**Tab Structure:**
- **"Report" Tab:** Clean medical content (standard markdown rendering)
- **"Chat" Tab:** Always visible conversation interface with Serenya
- **Navigation:** Standard tab system at top of screen

**Chat Tab Visibility (Hybrid Approach):**
- **Always Present:** Chat tab visible from initial page load
- **Visual States:** Inactive (70% opacity) before first conversation, Active (full opacity) after
- **Consistent Structure:** No dynamic tab appearance/disappearance
- **Mental Model:** Users understand dual functionality immediately

**Enhanced FAB Behavior (Smart State Management):**

**FAB State Flow:**
1. **Initial State:** "Ask Question" FAB (56px diameter, brain icon)
2. **Loading State:** Loading spinner with "Thinking..." text
3. **Response Ready State:** Expands to "View Answer" button (140px × 48px)
4. **Navigation:** Tapping "View Answer" switches to Chat tab + shows response
5. **Reset State:** Returns to "Ask Question" state after successful navigation

**Secondary Indicators:**
- **Chat Tab Dot:** Small indicator (8px) appears when response is ready
- **Context Preservation:** Report tab maintains scroll position when returning
- **Progressive Disclosure:** Clean interface until response arrives

**Design Specifications:**
- **FAB Position:** Bottom-right, 24px margins from screen edges
- **State Transitions:** Smooth animations (300ms duration, ease-in-out)
- **Touch Targets:** All states exceed 48px minimum (56px circle, 140px×48px button)
- **Haptic Feedback:** Subtle vibration on each state transition

**Interaction Enhancements:**
- **Typing Indicator:** "Serenya is thinking..." during processing
- **Timestamps:** Subtle time references for conversation context
- **Message Actions:** Long-press for copy/share individual responses
- **Conversational Tone:** Warm, empathetic responses with follow-up suggestions

**Benefits:**
- Low cognitive load (familiar messaging pattern)
- Mobile-optimized interface (320-375px)
- Maintains conversation context naturally
- Supports Serenya's warm, empathetic brand personality
- WCAG AA accessibility compliant

**User Flow:** Accessed from Timeline View timeline items or after document processing

---

### **3. Doctor Reports Page**  
**Purpose:** Clean presentation of professional medical reports for healthcare conversations  
**⚠️ TECHNICAL NOTE:** This page uses the **SAME COMPONENT** as Results Analysis Page with only 2 variables:
- **Page Title Variable:** "Reports"
- **FAB Options Variable:** Report-specific actions (download/print/email)

**Key Features:**
- Standard markdown rendering of AI-generated professional report
- Clean, content-focused design
- Back button navigation to Timeline View
- Page title: "Reports" in navigation bar
- Interactive FAB for report actions

#### **Content Display**
- **Format:** Standard markdown rendered from AI agent response (professional report format)
- **Layout:** Clean, minimal design focused on readability
- **Navigation:** Back button (top-left) to return to Timeline View
- **Title:** "Reports" displayed in navigation bar

#### **FAB (Floating Action Button)**
- **Resting State:** Brain icon (represents thinking/analysis assistance)
- **Interaction:** Material Design inline expansion showing available options
- **Options:** Variable per page (likely download/print/email actions - to be defined)

**FAB State Flow:**
1. **Resting:** Brain icon, expandable menu
2. **Expanded:** Options animate out inline from FAB
3. **Loading:** Selected option triggers loading animation
4. **Success:** Dual feedback (phone vibration + visual FAB animation) → return to resting
5. **Failure:** Dual feedback (phone vibration + visual FAB animation) + error popup → return to resting

#### **Serenya Interaction Pattern - Tab System**
**UI/UX Research Recommendation:** **Enhanced FAB State Change** with tab navigation

**Tab Structure:**
- **"Report" Tab:** Clean professional medical report (standard markdown rendering)
- **"Chat" Tab:** Always visible conversation interface with Serenya
- **Navigation:** Standard tab system at top of screen

**Chat Tab Visibility (Hybrid Approach):**
- **Always Present:** Chat tab visible from initial page load
- **Visual States:** Inactive (70% opacity) before first conversation, Active (full opacity) after
- **Consistent Structure:** No dynamic tab appearance/disappearance
- **Mental Model:** Users understand dual functionality immediately

**Enhanced FAB Behavior (Smart State Management):**

**FAB State Flow:**
1. **Initial State:** "Ask Question" FAB (56px diameter, brain icon)
2. **Loading State:** Loading spinner with "Thinking..." text
3. **Response Ready State:** Expands to "View Answer" button (140px × 48px)
4. **Navigation:** Tapping "View Answer" switches to Chat tab + shows response
5. **Reset State:** Returns to "Ask Question" state after successful navigation

**Secondary Indicators:**
- **Chat Tab Dot:** Small indicator (8px) appears when response is ready
- **Context Preservation:** Report tab maintains scroll position when returning
- **Progressive Disclosure:** Clean interface until response arrives

**Chat Interface Design:**

**Empty State (Before First Conversation):**
- **Primary Message:** "Ask Serenya about your report" (24px, semibold)
- **Secondary Message:** "Tap the 🧠 icon to start a conversation" (16px, regular)
- **Helper Text:** "I can help explain your results or answer questions" (14px, light)
- **Layout:** Centered content with 24px outer margins, gentle warm background
- **Visual Element:** Subtle chat illustration or Serenya brand icon

**Active Chat Interface:**
- **User Questions:** Right-aligned bubbles, soft blue background (#E3F2FD)
- **Serenya Responses:** Left-aligned bubbles with brain avatar (24px), warm off-white (#FAFAFA)
- **Dimensions:** Full screen width utilization, 16px border radius
- **Typography:** Chat messages (16px), optimized line height 1.4-1.5
- **Conversation History:** Infinite scroll, chronological order

**Design Specifications:**
- **FAB Position:** Bottom-right, 24px margins from screen edges
- **State Transitions:** Smooth animations (300ms duration, ease-in-out)
- **Touch Targets:** All states exceed 48px minimum (56px circle, 140px×48px button)
- **Haptic Feedback:** Subtle vibration on each state transition

**Interaction Enhancements:**
- **Typing Indicator:** "Serenya is thinking..." during processing
- **Timestamps:** Subtle time references for conversation context
- **Message Actions:** Long-press for copy/share individual responses
- **Conversational Tone:** Warm, empathetic responses with follow-up suggestions
- **Premium Features:** Enhanced response depth, download/print conversation options

**Benefits:**
- Low cognitive load (familiar messaging pattern)
- Mobile-optimized interface (320-375px)
- Maintains conversation context naturally
- Supports Serenya's warm, empathetic brand personality
- WCAG AA accessibility compliant

**User Flow:** Premium feature accessed from Timeline View timeline items

---

## 🔧 **2 ANCILLARY FLOWS**

### **1. Sign-up Flow**
**Components:**
- **Splash Screen:** Serenya logo loading screen
- **Onboarding Slide 1:** Welcome and value proposition
- **Onboarding Slide 2:** Privacy & Security messaging + **LOCAL DATA STORAGE**
- **Onboarding Slide 3:** Medical disclaimers and expectations
- **Onboarding Slide 4:** Final consent and **Google Sign-In authentication**

#### **Slide Specifications:**

**Slide 1 - Welcome**
- Header: "Welcome to Serenya - Your AI Health Agent"
- Value proposition: Lab results interpretation and doctor conversation preparation
- Features: Upload → Understand → Confidence
- Closing: Friendly, warm messaging about health understanding

**Slide 2 - Privacy & Security**
- Header: "Your Privacy Comes First"
- **Updated Features:**
  - "Files processed instantly, then deleted—all your data stays on your device"
  - "Bank-level security & GDPR/HIPAA compliant"
  - "Never shared with anyone"
- **Key Message:** Simple, direct privacy protection with local storage emphasis
- Closing: "Your trust is everything to us"

**Slide 3 - Medical Disclaimers**
- Header: "Important Things to Know"
- Framework: "Think of us as" (helpful friend) vs "We are NOT" (replacement for doctor)
- Safety statement: Always consult healthcare professionals
- Button: "I Understand - Continue"

**Slide 4 - Consent & Authentication**
- Header: "Ready to Get Started?"
- Benefits: Join thousands using Serenya for better health understanding
- **Consent Checkboxes:**
  - ☐ I understand medical disclaimers and limitations
  - ☐ I agree to Terms of Service and Privacy Policy
- **Authentication Section:**
  - Separator line with "Create my account using:"
  - **Google Sign-In Button** (compliant with Google branding requirements)

#### **Google Sign-In Compliance Requirements:**

**Button Text:** "Continue with Google" (approved Google wording)
**Visual Specifications:**
- **Dimensions:** 328px width × 50px height (mobile optimized)
- **Colors:** Official Google "G" logo colors (Blue #4285F4, Red #EA4335, Yellow #FBBC05, Green #34A853)
- **Background:** White background with Google logo
- **Font:** Roboto Medium, 14pt size
- **Accessibility:** WCAG AA compliant, 48px minimum touch target
- **Requirements:**
  - Must use official Google logo colors (cannot be modified)
  - Logo must appear on white background within button
  - Cannot use monochrome or custom icons
  - Must preserve Google logo aspect ratio
  - Button must have similar visual weight to other sign-in options

**Implementation Notes:**
- Use official `google_sign_in` Flutter package
- Follow Material 3 design guidelines
- Include proper focus indicators for accessibility
- Support responsive design for different screen sizes
- Maintain proper semantic labels for screen readers

**User Flow:** Splash → 4-slide onboarding → Direct to Timeline View (no separate login screen)

---

### **2. Settings Menu**
**Components:**
- **Main Settings Screen:** Central settings hub
- **Disclaimers Page:** All medical and legal disclaimers
- **Biometric Settings:** Enable/disable biometric login
- **Account Management:** Delete account, data export (GDPR)
- **Profile Details:** Additional profile information

**User Flow:** Accessed from main navigation, persistent across app

---

## 📊 **Implementation Priority**

**Phase 1 (Core Value):** 
1. Shared Content Component (Results/Reports pages - MVP critical)
2. Timeline View (user retention & main hub)
3. Sign-up Flow (user onboarding)

**Phase 2 (Premium & Compliance):**
4. Premium Report Features (revenue generation using shared component)  
5. Settings Menu (compliance & user control)

**Technical Note:** Results Analysis and Doctor Reports pages share the same component architecture, reducing development time by ~50% for content display features.

---

## 🔗 **Screen Interconnections**

```
Sign-up Flow → Timeline View (main hub)
                    ↓
Timeline View ← → Shared Content Component
     ↓                    ↓
Settings Menu      Results Analysis / Doctor Reports
                   (same component, different variables)
```

**Navigation Patterns:**
- **Timeline View:** Settings button (top-right) → Settings Menu
- **Timeline View:** Timeline items → Content Component (Results/Reports)
- **Content Pages:** Back button (top-left) → Timeline View
- **Content Pages:** FAB actions → Server requests with feedback
- **Settings Menu:** Various navigation patterns (to be detailed)

**Total Screens:** 5 distinct screen groups (simplified from previous 40-screen inventory)  
**Development Focus:** Core user journey with essential compliance features  
**Technical Implementation:** 
- Shared content component reduces development complexity
- Timeline View with persistent navigation to settings
- Clean content pages with back navigation and interactive FABs
- Standard markdown rendering for AI responses

---

## 🚀 **DEVELOPMENT WORKFLOW**

### **Proposed Development Flow**

**Phase 1: Database Schema Design (1 day)**
- **Server-side storage:** User profiles (Google ID, name, email) and consent submissions/checkboxes
- **Local device storage:** Document metadata, processing results, AI analysis, doctor reports, timeline items
- Document relationships and data integrity constraints
- Timeline query optimization and search indexes
- Performance considerations for local database operations

**Phase 2: API Contract Definition (1 day)**
- Upload endpoint contracts based on local storage schema
- Processing status and results response formats
- Authentication and consent handling endpoints
- Error response structures aligned with data validation
- Request/response formats optimized for local storage patterns

**Phase 3: Frontend Implementation (3-5 days)**
- Timeline View with mock data matching database schema
- Upload functionality and state management
- FAB implementation and interactions
- API integration with defined contracts
- Full UI/UX testing with realistic data

### **Storage Architecture**

**Server-Side Storage (Minimal):**
- User authentication data (Google OAuth profile)
- Consent records and legal compliance tracking
- Session management and token validation

**Local Device Storage (Complete User Data):**
- All medical document processing results
- AI analysis responses and doctor reports
- Timeline history and user interactions
- Search indexes and user preferences
- Offline functionality support

**Benefits of This Approach:**
- Data consistency through schema-first design
- Performance optimization for local query patterns
- Clear separation of compliance vs. user data
- Efficient API contracts based on actual data relationships

---

## 📋 **DATABASE SCHEMAS**

### **Design Principles**
- **UUIDs for all primary keys**: Server-generated UUIDs used as primary keys and foreign keys
- **No document storage**: Documents processed temporarily, then deleted - only extracted medical data persists
- **Privacy-first architecture**: Complete medical data stored locally on device
- **Minimal server storage**: Only authentication, consent, and reference data on server
- **Hybrid ENUM management**: Database-level constraints + code-level constants + documentation

---

### **ENUM Definitions**

**Database ENUM Types:**
```sql
-- Authentication & User Management
CREATE TYPE auth_provider_type AS ENUM ('google', 'apple', 'facebook');
CREATE TYPE account_status_type AS ENUM ('active', 'suspended', 'deactivated', 'deleted');

-- Legal Compliance
CREATE TYPE consent_type AS ENUM ('medical_disclaimers', 'terms_of_service', 'privacy_policy');

-- Subscription & Payments
CREATE TYPE subscription_status_type AS ENUM ('active', 'expired', 'cancelled', 'pending');
CREATE TYPE subscription_type AS ENUM ('monthly', 'yearly');
CREATE TYPE payment_provider_type AS ENUM ('apple', 'google', 'stripe');
CREATE TYPE payment_status_type AS ENUM ('pending', 'completed', 'failed', 'refunded', 'disputed');

-- Content & Processing (Local Device)
CREATE TYPE content_type AS ENUM ('result', 'report');
CREATE TYPE processing_status_type AS ENUM ('processing', 'completed', 'failed');
CREATE TYPE message_sender_type AS ENUM ('user', 'serenya');
```

**ENUM Value Descriptions:**

**Account Status:**
- `active`: Normal functioning account
- `suspended`: Temporarily disabled (admin action, policy violations)
- `deactivated`: User-initiated deactivation (can be reactivated)
- `deleted`: Permanent deletion (GDPR/user request)

**Subscription Status:**
- `active`: Current subscription with valid billing
- `expired`: Subscription period ended, grace period may apply
- `cancelled`: User cancelled, access until period end
- `pending`: New subscription awaiting payment confirmation

**Payment Status:**
- `pending`: Payment initiated but not confirmed
- `completed`: Successful payment processed
- `failed`: Payment attempt unsuccessful
- `refunded`: Payment reversed to customer
- `disputed`: Payment under dispute/chargeback

**Content Type:**
- `result`: AI analysis of specific medical documents/data
- `report`: Comprehensive reports derived from complete medical history

**Code Implementation Note:**
All ENUMs will have matching constants in Flutter/Dart code for type safety and validation.

---

### **Server-Side Storage (Minimal)**

#### **`users` Table**
```sql
users:
id: UUID (primary key, server-generated - internal identifier)
external_id: STRING (unique, provider's user identifier - e.g., Google 'sub')
auth_provider: ENUM ('google', 'apple', 'facebook', etc.)
email: STRING 
email_verified: BOOLEAN 
name: STRING (full display name)
given_name: STRING 
family_name: STRING 
account_status: ENUM ('active', 'suspended', 'deactivated', 'deleted')
created_at: TIMESTAMP
updated_at: TIMESTAMP
last_login_at: TIMESTAMP
deactivated_at: TIMESTAMP (null when active)
```

**Constraints:**
- Unique constraint on `(external_id, auth_provider)`
- Index on `external_id` and `auth_provider` for authentication lookups

**Account Status Management:**
- `active`: Normal functioning account
- `suspended`: Temporarily disabled (admin action, policy violations)
- `deactivated`: User-initiated deactivation (can be reactivated)
- `deleted`: Permanent deletion (GDPR/user request)

#### **`consent_records` Table**
```sql
consent_records:
id: UUID (primary key, server-generated)
user_id: UUID (foreign key → users.id)
consent_type: ENUM ('medical_disclaimers', 'terms_of_service', 'privacy_policy')
consent_given: BOOLEAN
consent_version: STRING
withdrawn_at: TIMESTAMP (null when consent is active)
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

**Purpose:** Legal compliance tracking - one record per consent type per user (3 records per user during onboarding)

#### **`chat_options` Table**
*[Schema to be defined]*

#### **`subscriptions` Table**
```sql
subscriptions:
id: UUID (primary key, server-generated)
user_id: UUID (foreign key → users.id)
subscription_status: ENUM ('active', 'expired', 'cancelled', 'pending')
subscription_type: ENUM ('monthly', 'yearly')
provider: ENUM ('apple', 'google', 'stripe', etc.)
external_subscription_id: STRING
start_date: TIMESTAMP
end_date: TIMESTAMP
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

**Purpose:** Track user premium subscription status and billing periods

#### **`payments` Table**
```sql
payments:
id: UUID (primary key, server-generated)
subscription_id: UUID (foreign key → subscriptions.id)
user_id: UUID (foreign key → users.id) 
amount: DECIMAL (e.g., 9.99)
currency: STRING (e.g., 'USD', 'EUR')
payment_status: ENUM ('pending', 'completed', 'failed', 'refunded', 'disputed')
provider_transaction_id: STRING (Apple/Google/Stripe transaction ID)
payment_method: STRING (e.g., 'apple_pay', 'google_pay', 'credit_card')
processed_at: TIMESTAMP
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

**Purpose:** Record all subscription payment transactions and status

---

### **Local Device Storage (Complete User Data)**

#### **`medical_data` Table**
*[Schema to be defined]*

#### **`serenya_content` Table**
*[Schema to be defined]*

#### **`chat_messages` Table**
*[Schema to be defined]*

---

## 🔌 **API CONTRACTS**
*[To be added in Phase 2 - API Contract Definition]*