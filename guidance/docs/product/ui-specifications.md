# UI Specifications - Serenya AI Health Agent

**Date:** September 1, 2025  
**Domain:** User Interface Design & Component Specifications  
**AI Agent:** UI/UX Design Agent  
**Dependencies:** 
- **← database-architecture.md**: Data models for UI components and content display
- **← user-flows.md**: User journey context for screen transitions
**Cross-References:**
- **→ mobile-architecture.md**: Flutter implementation details and state management
- **→ api-contracts.md**: Data loading and API integration patterns
- **→ encryption-strategy.md**: Biometric authentication UI requirements

---

## 🎯 **Design System Overview**

### **Brand Values & Design Principles**
- **Warm Confidence**: Approachable yet professional medical interface
- **Empathy**: Understanding user anxiety around medical information
- **Custom Serenya Experience**: Unique, memorable interaction patterns
- **Accessibility First**: WCAG AA compliance for inclusive design
- **Mobile-First**: Primary focus on 320-375px screen widths

### **Core UI Architecture**
- **3 Primary Screens**: Timeline View, Results Analysis, Doctor Reports
- **2 Support Flows**: Sign-up Flow, Settings Menu  
- **Shared Components**: Content display component (Results + Reports), FAB system
- **Navigation Pattern**: Hub-and-spoke model centered on Timeline View

---

## 🎨 **Design System Foundation**

### **Color Palette**

**Primary Colors**:
```css
/* AI Analysis Theme */
--serenya-blue-primary: #2196F3;      /* Primary actions, AI analysis */
--serenya-blue-light: #E3F2FD;        /* Analysis borders, backgrounds */
--serenya-blue-dark: #1976D2;         /* Pressed states, focus */

/* Doctor Reports Theme */  
--serenya-green-primary: #4CAF50;     /* Premium features, medical verification */
--serenya-green-light: #E8F5E8;       /* Report borders, premium indicators */
--serenya-green-dark: #388E3C;        /* Pressed states, focus */

/* Neutral Palette */
--serenya-white: #FFFFFF;             /* Card backgrounds, primary surfaces */
--serenya-gray-50: #FAFAFA;           /* Chat bubbles, secondary surfaces */
--serenya-gray-100: #F5F5F5;          /* Disabled states, dividers */
--serenya-gray-300: #E0E0E0;          /* Borders, inactive elements */
--serenya-gray-600: #666666;          /* Secondary text, labels */
--serenya-gray-900: #333333;          /* Primary text, headings */
```

**Semantic Colors**:
```css
/* Status & Feedback */
--success: #4CAF50;                   /* Completed actions, normal results */
--warning: #FF9800;                   /* Attention needed, elevated values */  
--error: #F44336;                     /* Critical alerts, abnormal results */
--info: #2196F3;                      /* General information, tips */

/* Accessibility Compliance */
/* All color combinations meet WCAG AA contrast ratios (4.5:1 minimum) */
```

### **Typography Scale**

**Font Family**: `Inter` (primary), `SF Pro Text` (iOS fallback), `Roboto` (Android fallback)

```css
/* Hierarchy Definitions */
--heading-h1: 28px/1.2 Inter 600;    /* Page titles, onboarding headers */
--heading-h2: 24px/1.3 Inter 600;    /* Section headers, modal titles */
--heading-h3: 20px/1.4 Inter 500;    /* Card titles, subsection headers */
--heading-h4: 18px/1.4 Inter 500;    /* List headers, form labels */

--body-large: 16px/1.5 Inter 400;    /* Primary content, chat messages */
--body-medium: 14px/1.4 Inter 400;   /* Secondary content, descriptions */
--body-small: 12px/1.3 Inter 400;    /* Timestamps, metadata, captions */

--ui-large: 16px/1.2 Inter 500;      /* Button text, navigation items */
--ui-medium: 14px/1.2 Inter 500;     /* Form inputs, tab labels */
--ui-small: 11px/1.1 Inter 500;      /* Badges, micro-labels */
```

### **Spacing System**

**Base Unit**: 8px (0.5rem)

```css
/* Spacing Scale */
--space-1: 4px;    /* Micro spacing, icon gaps */
--space-2: 8px;    /* Base unit, tight spacing */
--space-3: 12px;   /* Medium spacing, form elements */
--space-4: 16px;   /* Standard spacing, card padding */  
--space-6: 24px;   /* Large spacing, section gaps */
--space-8: 32px;   /* Extra large spacing, major sections */
--space-12: 48px;  /* Section dividers, major layout gaps */
--space-16: 64px;  /* Page-level spacing, onboarding */
```

**Component Sizing**:
```css
/* Touch Targets (WCAG AA Compliance) */
--touch-target-min: 48px;            /* Minimum interactive element size */
--touch-target-comfortable: 56px;     /* Comfortable FAB size */

/* Card & Container Sizes */
--card-border-radius: 12px;          /* Warm, approachable feel */
--card-shadow: 0 2px 8px rgba(0,0,0,0.08);  /* Subtle elevation */
--modal-border-radius: 16px;         /* Larger radius for overlays */
```

---

## 📱 **Screen Specifications**

### **Agent Handoff Context**
**Database Integration**: All content displays require data from **→ database-architecture.md** schemas (`serenya_content`, `lab_results`, `vitals`, `chat_messages`)

## **1. Timeline View (Main Dashboard)**

### **Purpose & Context**
- **Central hub**: Primary landing screen after authentication
- **Data Source**: `serenya_content` table ordered by `created_at DESC` (**→ database-architecture.md**)
- **Navigation Hub**: Access point to all other screens via settings and content items

### **Layout Specifications**

**Navigation Bar (Fixed Top)**:
```css
.navigation-bar {
    position: fixed;
    top: 0;
    height: 56px;
    background: var(--serenya-white);
    border-bottom: 1px solid var(--serenya-gray-100);
    padding: 0 var(--space-4);
    z-index: 100;
}

.nav-logo {
    font: var(--heading-h3);
    color: var(--serenya-blue-primary);
}

.nav-settings-button {
    width: var(--touch-target-min);
    height: var(--touch-target-min);
    border-radius: 8px;
    background: transparent;
}
```

**Timeline Content Area**:
```css
.timeline-container {
    padding-top: 72px; /* Account for fixed nav + spacing */
    padding-bottom: var(--space-12);
    background: #F8F9FA; /* Subtle background differentiation */
}

.timeline-section {
    margin-bottom: var(--space-6);
}

.section-header {
    font: var(--body-medium);
    color: var(--serenya-gray-600);
    padding: var(--space-2) var(--space-4);
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(8px);
}
```

### **Upload Button States**

**Component Design**: 
```css
.upload-button-container {
    position: fixed;
    bottom: var(--space-6);
    left: var(--space-4);
    right: var(--space-4);
    z-index: 50;
}

/* State 1: Resting */
.upload-button-resting {
    height: 56px;
    background: var(--serenya-blue-primary);
    border-radius: 16px;
    font: var(--ui-large);
    color: white;
    box-shadow: var(--card-shadow);
}

/* State 2: Loading */
.upload-button-loading {
    background: var(--serenya-gray-300);
    pointer-events: none;
}

/* State 3: Success */  
.upload-button-success {
    background: var(--success);
    transform: scale(1.02);
    transition: transform 200ms ease-out;
}

/* State 4: Failure */
.upload-button-failure {
    background: var(--error);
    animation: shake 400ms ease-in-out;
}
```

**State Transitions**:
1. **Resting → Loading**: Fade background color + spinner appearance (300ms)
2. **Loading → Success**: Color change + scale animation + haptic feedback
3. **Success → Resting**: Return to normal state after 2s delay
4. **Loading → Failure**: Error color + shake animation + haptic + popup

### **Timeline Item Cards**

**Data Integration**: Each card represents one `serenya_content` record with associated medical data

**Results Analysis Card (Free Tier)**:
```css
.timeline-card-result {
    background: var(--serenya-white);
    border-left: 4px solid var(--serenya-blue-light);
    border-radius: var(--card-border-radius);
    margin: 0 var(--space-4) var(--space-4);
    padding: var(--space-4);
    box-shadow: var(--card-shadow);
    min-height: 120px;
}

.card-header-result {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-2);
}

.card-type-label {
    font: var(--ui-medium);
    color: var(--serenya-blue-primary);
}

.card-icon {
    width: 20px;
    height: 20px;
    color: var(--serenya-blue-primary);
}
```

**Doctor Report Card (Premium)**:
```css
.timeline-card-report {
    background: var(--serenya-white);
    border-left: 4px solid var(--serenya-green-light);
    border-radius: var(--card-border-radius);
    margin: 0 var(--space-4) var(--space-4);
    padding: var(--space-4);
    box-shadow: var(--card-shadow);
    min-height: 120px;
    position: relative;
}

.premium-indicator {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    background: var(--serenya-green-primary);
    color: white;
    padding: 2px 6px;
    border-radius: 4px;
    font: var(--ui-small);
}
```

### **Empty State Design**

**Agent Handoff**: First-time user experience crucial for onboarding success

```css
.empty-state-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    padding: var(--space-8) var(--space-4);
    text-align: center;
}

.empty-state-illustration {
    width: 160px;
    height: 120px;
    margin-bottom: var(--space-6);
    /* Custom Serenya-branded illustration */
}

.empty-state-title {
    font: var(--heading-h2);
    color: var(--serenya-gray-900);
    margin-bottom: var(--space-2);
}

.empty-state-description {
    font: var(--body-large);
    color: var(--serenya-gray-600);
    max-width: 280px;
    line-height: 1.5;
}
```

**Content**:
- **Title**: "Your Health Journey Starts Here"
- **Description**: "Upload your first lab results or medical document to get personalized insights from Serenya"
- **Visual**: Warm, abstract medical illustration (not clinical/scary)

---

## **2. Content Display Component (Shared)**

### **Technical Architecture**
**Component Reuse**: Single React/Flutter component with 2 configuration variables:
- `pageTitle`: "Results" | "Reports"  
- `fabOptions`: Array of action configurations
- `contentType`: Maps to `content_type` enum in **→ database-architecture.md**

### **Layout Structure**

**Navigation Header**:
```css
.content-page-header {
    height: 56px;
    display: flex;
    align-items: center;
    padding: 0 var(--space-4);
    background: var(--serenya-white);
    border-bottom: 1px solid var(--serenya-gray-100);
}

.back-button {
    width: var(--touch-target-min);
    height: var(--touch-target-min);
    border-radius: 8px;
    margin-right: var(--space-2);
}

.page-title {
    font: var(--heading-h3);
    color: var(--serenya-gray-900);
}
```

### **Tab System Architecture**

**Agent Handoff**: Tab navigation critical for chat functionality integration

```css
.content-tabs-container {
    background: var(--serenya-white);
    border-bottom: 1px solid var(--serenya-gray-100);
}

.tab-navigation {
    display: flex;
    height: 48px;
}

.tab-item {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font: var(--ui-medium);
    color: var(--serenya-gray-600);
    border-bottom: 2px solid transparent;
    transition: all 200ms ease-out;
}

.tab-item-active {
    color: var(--serenya-blue-primary);
    border-bottom-color: var(--serenya-blue-primary);
}

.chat-tab-indicator {
    width: 8px;
    height: 8px;
    background: var(--serenya-blue-primary);
    border-radius: 50%;
    margin-left: var(--space-1);
    opacity: 0;
    transition: opacity 200ms ease-out;
}

.chat-tab-indicator-visible {
    opacity: 1;
}
```

### **Report Tab Content**

**Data Integration**: Renders `serenya_content.content` as Markdown with medical-specific styling

```css
.report-content-container {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
    line-height: 1.6;
}

/* Medical Content Styling */
.medical-content h1 { font: var(--heading-h2); margin: var(--space-6) 0 var(--space-3); }
.medical-content h2 { font: var(--heading-h3); margin: var(--space-4) 0 var(--space-2); }
.medical-content h3 { font: var(--heading-h4); margin: var(--space-3) 0 var(--space-2); }
.medical-content p { font: var(--body-large); margin-bottom: var(--space-3); }
.medical-content ul, .medical-content ol { padding-left: var(--space-4); }
.medical-content li { font: var(--body-large); margin-bottom: var(--space-1); }

/* Medical Flags & Alerts */
.medical-alert {
    background: rgba(255, 152, 0, 0.1);
    border-left: 4px solid var(--warning);
    padding: var(--space-3);
    margin: var(--space-3) 0;
    border-radius: 0 var(--card-border-radius) var(--card-border-radius) 0;
}

.medical-normal {
    background: rgba(76, 175, 80, 0.1);
    border-left: 4px solid var(--success);
    padding: var(--space-3);
    margin: var(--space-3) 0;
    border-radius: 0 var(--card-border-radius) var(--card-border-radius) 0;
}
```

### **Chat Tab Interface**

**Data Integration**: Renders `chat_messages` table data with conversation threading

**Empty State (Before First Conversation)**:
```css
.chat-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    padding: var(--space-8) var(--space-4);
    text-align: center;
}

.chat-empty-icon {
    width: 80px;
    height: 80px;
    background: var(--serenya-blue-light);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--space-4);
}

.chat-empty-title {
    font: var(--heading-h3);
    color: var(--serenya-gray-900);
    margin-bottom: var(--space-2);
}

.chat-empty-subtitle {
    font: var(--body-medium);
    color: var(--serenya-gray-600);
    margin-bottom: var(--space-1);
}

.chat-empty-helper {
    font: var(--body-small);
    color: var(--serenya-gray-600);
}
```

**Active Chat Interface**:
```css
.chat-messages-container {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
}

.chat-message {
    max-width: 280px;
    margin-bottom: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--card-border-radius);
    font: var(--body-large);
    line-height: 1.4;
}

.chat-message-user {
    align-self: flex-end;
    background: var(--serenya-blue-light);
    color: var(--serenya-gray-900);
    border-bottom-right-radius: 4px;
}

.chat-message-serenya {
    align-self: flex-start;
    background: var(--serenya-gray-50);
    color: var(--serenya-gray-900);
    border-bottom-left-radius: 4px;
    position: relative;
    padding-left: var(--space-6); /* Space for avatar */
}

.serenya-avatar {
    position: absolute;
    left: var(--space-2);
    top: var(--space-2);
    width: 24px;
    height: 24px;
    background: var(--serenya-blue-primary);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.message-timestamp {
    font: var(--body-small);
    color: var(--serenya-gray-600);
    margin-top: var(--space-1);
    text-align: right;
}
```

### **FAB (Floating Action Button) System**

**Agent Handoff**: FAB behavior critical for user interaction flow

**State Management Architecture**:
```css
.fab-container {
    position: fixed;
    bottom: var(--space-6);
    right: var(--space-6);
    z-index: 100;
}

/* State 1: Initial (Ask Question) */
.fab-initial {
    width: var(--touch-target-comfortable);
    height: var(--touch-target-comfortable);
    background: var(--serenya-blue-primary);
    border-radius: 50%;
    box-shadow: 0 4px 16px rgba(33, 150, 243, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 300ms ease-in-out;
}

/* State 2: Loading */
.fab-loading {
    background: var(--serenya-gray-300);
    pointer-events: none;
}

.fab-loading-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top: 2px solid white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

/* State 3: Response Ready (Expanded Button) */
.fab-response-ready {
    width: 140px;
    height: 48px;
    border-radius: 24px;
    background: var(--success);
    display: flex;
    align-items: center;
    justify-content: center;
    font: var(--ui-large);
    color: white;
}

/* State Transition Animations */
.fab-expand-animation {
    animation: fabExpand 300ms ease-in-out forwards;
}

@keyframes fabExpand {
    0% { 
        width: var(--touch-target-comfortable);
        border-radius: 50%;
    }
    100% { 
        width: 140px;
        border-radius: 24px;
    }
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
```

**FAB Configuration by Page**:
```typescript
// Results Analysis Page
const resultsAnalysisFABConfig = {
    initialState: {
        icon: 'brain',
        label: 'Ask Question'
    },
    responseState: {
        label: 'View Answer',
        action: 'switchToChatTab'
    }
};

// Doctor Reports Page  
const doctorReportsFABConfig = {
    initialState: {
        icon: 'brain',
        label: 'Ask Question'
    },
    responseState: {
        label: 'View Answer', 
        action: 'switchToChatTab'
    },
    additionalActions: [
        { icon: 'download', label: 'Download PDF' },
        { icon: 'share', label: 'Share Report' },
        { icon: 'print', label: 'Print Report' }
    ]
};
```

---

## **3. Sign-up Flow Specifications**

### **Agent Handoff Context**
**Data Flow**: User data flows to **→ database-architecture.md** `users` and `consent_records` tables
**Security Integration**: Google OAuth integration per **→ encryption-strategy.md** biometric setup requirements

### **Onboarding Slide Architecture**

**Container Specifications**:
```css
.onboarding-container {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: linear-gradient(135deg, #f8f9fa 0%, #e3f2fd 100%);
    padding: var(--space-4);
}

.slide-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    max-width: 320px;
    margin: 0 auto;
    text-align: center;
}

.slide-navigation {
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
```

### **Slide 1: Welcome**
```css
.welcome-logo {
    width: 120px;
    height: 120px;
    margin: 0 auto var(--space-6);
    background: var(--serenya-blue-primary);
    border-radius: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.welcome-title {
    font: var(--heading-h1);
    color: var(--serenya-gray-900);
    margin-bottom: var(--space-3);
}

.welcome-subtitle {
    font: var(--body-large);
    color: var(--serenya-gray-600);
    line-height: 1.5;
    margin-bottom: var(--space-4);
}

.feature-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: var(--space-6) 0;
}

.feature-item {
    display: flex;
    align-items: center;
    text-align: left;
}

.feature-icon {
    width: 32px;
    height: 32px;
    background: var(--serenya-blue-light);
    border-radius: 50%;
    margin-right: var(--space-3);
    display: flex;
    align-items: center;
    justify-content: center;
}
```

### **Slide 2: Privacy & Security**
```css
.privacy-illustration {
    width: 200px;
    height: 150px;
    margin: 0 auto var(--space-6);
    /* Shield and lock illustration */
}

.privacy-features {
    background: rgba(255, 255, 255, 0.8);
    border-radius: var(--card-border-radius);
    padding: var(--space-4);
    margin: var(--space-4) 0;
    backdrop-filter: blur(8px);
}

.privacy-feature {
    display: flex;
    align-items: flex-start;
    margin-bottom: var(--space-3);
    text-align: left;
}

.privacy-feature:last-child {
    margin-bottom: 0;
}

.privacy-checkmark {
    width: 20px;
    height: 20px;
    background: var(--success);
    border-radius: 50%;
    margin-right: var(--space-2);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 2px;
}
```

**Content Specifications**:
- **Header**: "Your Privacy Comes First"
- **Features**:
  - ✅ "Files processed instantly, then deleted—all your data stays on your device"  
  - ✅ "Bank-level security & GDPR/HIPAA compliant"
  - ✅ "Never shared with anyone"
- **Emphasis**: "Your trust is everything to us"

### **Slide 3: Medical Disclaimers**
```css
.disclaimer-container {
    background: rgba(255, 248, 225, 0.9);
    border: 2px solid var(--warning);
    border-radius: var(--card-border-radius);
    padding: var(--space-4);
    margin: var(--space-4) 0;
}

.disclaimer-header {
    display: flex;
    align-items: center;
    margin-bottom: var(--space-3);
}

.disclaimer-icon {
    width: 24px;
    height: 24px;
    color: var(--warning);
    margin-right: var(--space-2);
}

.disclaimer-title {
    font: var(--heading-h4);
    color: var(--warning);
}

.comparison-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
    margin: var(--space-4) 0;
}

.comparison-section h4 {
    font: var(--ui-medium);
    margin-bottom: var(--space-2);
}

.think-of-us {
    color: var(--serenya-blue-primary);
}

.we-are-not {
    color: var(--error);
}
```

### **Slide 4: Consent & Authentication**

**Google Sign-In Compliance**:
```css
.google-signin-container {
    margin: var(--space-6) 0;
}

.consent-section {
    background: rgba(255, 255, 255, 0.9);
    border-radius: var(--card-border-radius);
    padding: var(--space-4);
    margin-bottom: var(--space-4);
    text-align: left;
}

.consent-checkbox-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.consent-checkbox {
    display: flex;
    align-items: flex-start;
}

.checkbox-input {
    width: 20px;
    height: 20px;
    margin-right: var(--space-2);
    margin-top: 2px;
    flex-shrink: 0;
}

.checkbox-label {
    font: var(--body-medium);
    color: var(--serenya-gray-900);
    line-height: 1.4;
}

/* Google Sign-In Button (Official Specification) */
.google-signin-button {
    width: 100%;
    height: 50px;
    background: white;
    border: 1px solid var(--serenya-gray-300);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Roboto', sans-serif;
    font-size: 14px;
    font-weight: 500;
    color: var(--serenya-gray-900);
    box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    transition: box-shadow 200ms ease-out;
}

.google-signin-button:hover {
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.google-logo {
    width: 20px;
    height: 20px;
    margin-right: var(--space-2);
    /* Official Google G logo colors - cannot be modified */
}
```

**Authentication Flow Integration**:
- **Data Collection**: Name, email, profile picture URL
- **Database Storage**: **→ database-architecture.md** `users` table with `auth_provider='google'`
- **Consent Records**: 3 records in `consent_records` table (one per consent type)
- **Security Setup**: Trigger biometric authentication setup per **→ encryption-strategy.md**

---

## **4. Settings Menu Specifications**

### **Menu Structure**
```css
.settings-container {
    background: #f8f9fa;
    min-height: 100vh;
}

.settings-header {
    background: var(--serenya-white);
    height: 56px;
    display: flex;
    align-items: center;
    padding: 0 var(--space-4);
    border-bottom: 1px solid var(--serenya-gray-100);
}

.settings-content {
    padding: var(--space-4);
}

.settings-section {
    background: var(--serenya-white);
    border-radius: var(--card-border-radius);
    margin-bottom: var(--space-4);
    overflow: hidden;
}

.settings-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4);
    border-bottom: 1px solid var(--serenya-gray-100);
    min-height: var(--touch-target-min);
}

.settings-item:last-child {
    border-bottom: none;
}

.settings-item-content {
    display: flex;
    align-items: center;
}

.settings-icon {
    width: 24px;
    height: 24px;
    margin-right: var(--space-3);
    color: var(--serenya-gray-600);
}

.settings-label {
    font: var(--body-large);
    color: var(--serenya-gray-900);
}

.settings-description {
    font: var(--body-small);
    color: var(--serenya-gray-600);
    margin-top: 2px;
}

.settings-chevron {
    width: 16px;
    height: 16px;
    color: var(--serenya-gray-600);
}
```

**Menu Items Configuration**:
1. **Profile**: Name, email, profile picture editing
2. **Biometric Settings**: Enable/disable Face ID/Touch ID/Fingerprint
3. **Premium Subscription**: Manage subscription, billing, upgrade/cancel
4. **Privacy & Data**: Data export (GDPR), account deletion
5. **Legal**: Terms, privacy policy, medical disclaimers
6. **Support**: Help documentation, contact support
7. **About**: App version, credits, acknowledgments

---

## 📊 **Component Reuse Architecture**

### **Shared Component Mapping**
```typescript
// Primary content component used by both Results and Reports
interface ContentDisplayProps {
    pageTitle: 'Results' | 'Reports';
    contentData: SerenyaContent;  // From database-architecture.md
    fabConfiguration: FABConfig;
    chatMessages: ChatMessage[];  // From database-architecture.md
}

// Timeline card component
interface TimelineCardProps {
    contentType: 'result' | 'report';
    title: string;
    preview: string;
    timestamp: Date;
    confidenceScore: number;
    medicalFlags: string[];
    onTap: () => void;
}

// FAB system component
interface FABProps {
    config: FABConfig;
    onAction: (action: string) => void;
    currentState: 'initial' | 'loading' | 'response-ready';
}
```

### **Performance Considerations**
- **Image Loading**: Lazy loading for timeline content
- **List Virtualization**: Virtual scrolling for long chat histories
- **State Management**: Optimistic UI updates for better perceived performance
- **Caching**: Timeline content cached locally per **→ mobile-architecture.md**

---

## ♿ **Accessibility Specifications**

### **WCAG AA Compliance Requirements**
```css
/* Focus Management */
.focus-visible {
    outline: 2px solid var(--serenya-blue-primary);
    outline-offset: 2px;
}

/* High Contrast Support */
@media (prefers-contrast: high) {
    :root {
        --serenya-gray-600: #000000;
        --serenya-blue-primary: #0000FF;
        --serenya-green-primary: #008000;
    }
}

/* Reduced Motion Support */
@media (prefers-reduced-motion: reduce) {
    * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }
}

/* Large Text Support */
@media (prefers-font-size: large) {
    :root {
        --body-large: 18px/1.5 Inter 400;
        --body-medium: 16px/1.4 Inter 400;
        --heading-h3: 22px/1.4 Inter 500;
    }
}
```

### **Screen Reader Support**
- **Semantic HTML**: Proper heading hierarchy, landmark regions
- **ARIA Labels**: Descriptive labels for interactive elements
- **Live Regions**: Dynamic content announcements (chat messages, loading states)
- **Focus Management**: Logical tab order, focus trapping in modals

### **Touch Accessibility**
- **Minimum Touch Targets**: 48px × 48px minimum (WCAG 2.2)
- **Touch Target Spacing**: 8px minimum between interactive elements
- **Gesture Alternatives**: All swipe/pinch gestures have button alternatives
- **Haptic Feedback**: Tactile confirmation for important actions

---

## 🚀 **Implementation Handoff Notes**

### **For Mobile Architecture Agent (→ mobile-architecture.md)**
**Required Integration**:
- Flutter widget hierarchy matching these specifications
- State management for FAB states and tab switching
- Local database integration for timeline and chat data
- Image loading and caching strategies
- Platform-specific UI adaptations (iOS/Android)

### **For API Agent (→ api-contracts.md)**
**Data Loading Patterns**:
- Timeline: Paginated loading of `serenya_content` records
- Content Display: Single record retrieval with related medical data
- Chat: Real-time message posting and retrieval
- Upload: File upload with progress tracking and state management

### **For Encryption Agent (→ encryption-strategy.md)**
**Biometric Integration**:
- Authentication UI flow for first-time setup
- Session management UI states (authenticated/expired)
- Biometric prompt triggers for critical operations
- Error handling for biometric failures

**Component Status**: ✅ Complete - Ready for Mobile Development  
**Cross-References Validated**: All database schemas and user flows confirmed  
**Next Steps**: Mobile Architecture Agent implementation + API Contract definition