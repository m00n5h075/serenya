# User Flows - Serenya AI Health Agent

**Date:** September 1, 2025  
**Domain:** User Experience Design & Journey Mapping  
**AI Agent:** User Experience Agent  
**Dependencies:**
- **← ui-specifications.md**: Screen layouts and component specifications
- **← database-architecture.md**: Data flow and state management requirements
**Cross-References:**
- **→ mobile-architecture.md**: State management and navigation implementation
- **→ api-contracts.md**: API calls and data synchronization points
- **→ encryption-strategy.md**: Biometric authentication trigger points

---

## 🎯 **User Journey Architecture Overview**

### **Core User Journey Philosophy**
- **Empathy-First**: Acknowledge user anxiety around medical information
- **Privacy Confidence**: Make security and data protection visible and reassuring
- **Progressive Disclosure**: Reveal complexity gradually as user needs increase
- **Warm Guidance**: Serenya as helpful companion, not clinical tool

### **Journey Mapping Strategy**
- **Primary Flows**: Core value delivery (upload → analysis → understanding)
- **Support Flows**: Onboarding, settings, premium features
- **Error Recovery**: Three-layer unified error handling with user-focused recovery actions
- **Accessibility**: Alternative paths for different user capabilities

### **Error Handling User Experience Patterns**
**Aligned with unified three-layer error handling strategy (Issue #16):**

#### **Layer 3 - User-Facing Error Experience**
- **Contextual Messages**: Error messages match user's current task and mental model
- **Recovery Actions**: Clear, actionable next steps for every error scenario
- **Emotional Reassurance**: Warm, supportive tone that reduces user anxiety
- **Progressive Disclosure**: Essential information first, details available on request

#### **Error State UI Patterns**
```
┌─────────────────────────────────────┐
│  🔄 Analysis Temporarily Unavailable│
│                                     │
│  AI analysis is temporarily         │
│  unavailable. You can still view    │
│  your documents in the timeline.    │
│                                     │
│  [ Try Again ]  [ View Documents ]  │
└─────────────────────────────────────┘
```

#### **Recovery Strategy Implementation**
- **RETRY**: One-tap retry buttons with smart backoff timing
- **FALLBACK**: Graceful degradation with preserved core functionality  
- **ESCALATE**: Clear guidance for user action or support contact
- **IGNORE**: Continue with reduced functionality, option to retry later

---

## 🚀 **Primary User Journey: Document Analysis Flow**

### **Journey Context**
**User Goal**: Upload medical document and receive AI-powered interpretation  
**Expected Duration**: 3-5 minutes (including reading analysis)  
**Success Metric**: User gains clear understanding of their medical results  
**Emotional Arc**: Anxiety → Confidence → Understanding → Empowerment

### **Flow 1A: First-Time Document Upload (New User)**

#### **Entry Point: Timeline View (Empty State)**
```
User Mental State: "I have lab results but don't understand them"
Emotional State: Curious but slightly anxious
```

**Step 1: Upload Trigger**
- **Action**: User taps "Upload Document" button
- **UI Response**: File picker opens (**→ ui-specifications.md** upload button states)
- **Biometric Trigger**: None (session already authenticated)
- **Data Flow**: No API call yet
- **Error Paths**: File picker cancellation → return to timeline

**Step 2: File Selection**
- **Action**: User selects photo/document from device
- **UI Response**: Upload button changes to "Loading" state with processing indicator
- **API Call**: POST /api/v1/documents/upload (**→ api-contracts.md**)
- **Biometric Trigger**: None (within active session)
- **Error Paths**: 
  - File too large → Error popup with size guidance
  - Unsupported format → Error popup with format list
  - Network failure → Retry option with offline queue

**Step 3: Processing Phase**
- **Action**: Server processes document (OCR + AI analysis)
- **UI Response**: Loading state with encouraging messages
- **Duration**: 30 seconds - 3 minutes (variable)
- **API Polling**: GET /api/v1/jobs/{job_id}/status every 5 seconds
- **User Feedback**: Progress messages ("Analyzing your document...", "Almost ready...")
- **Error Paths**: 
  - Processing timeout → Fallback processing + notification
  - AI service failure → Retry with mock response for demo

**Step 4: Results Available**
- **Action**: Processing completes successfully
- **UI Response**: Upload button changes to "View Results" with success animation
- **Haptic Feedback**: Success vibration pattern
- **API Response**: Complete analysis package with all medical data
- **Data Storage**: Local SQLite with field-level encryption (**→ encryption-strategy.md**)

**Step 5: Results Viewing**
- **Action**: User taps "View Results" button
- **Navigation**: Slide transition to Results Analysis page
- **UI Response**: Content loads from local storage (no API call)
- **Content Display**: Markdown-formatted AI analysis with medical insights
- **Emotional Shift**: Anxiety → Understanding
- **Follow-up Options**: Chat with Serenya, share results, premium upgrade

#### **Success Path Completion**
**User Outcome**: Clear understanding of medical results with actionable insights  
**Emotional State**: Confident and informed  
**Next Actions**: Return to timeline, start conversation, upload more documents

---

### **Flow 1B: Returning User Document Upload**

#### **Entry Point: Timeline View (With Existing Content)**
```
User Mental State: "I want to upload another document to track changes"
Emotional State: Comfortable and confident with the process
```

**Key Differences from First-Time Flow**:
- **Faster Recognition**: User immediately understands upload process
- **Comparison Context**: New results compared to previous results in timeline
- **Premium Upsell**: Opportunity to highlight trending analysis (premium feature)
- **Streamlined Flow**: Skip explanatory messages, focus on efficiency

**Step 1-4: Same as Flow 1A** (Optimized for Speed)

**Step 5: Enhanced Results Viewing**
- **Timeline Context**: "Your glucose levels have improved since last month"
- **Trend Indicators**: Visual comparisons with previous results
- **Premium Prompts**: "See detailed trends and doctor-ready reports"
- **Follow-up Actions**: More sophisticated based on history

---

## 💬 **Interactive Conversation Flow**

### **Flow 2A: First Conversation (Post-Analysis)**

#### **Entry Point: Results Analysis Page → Chat Tab**
```
User Mental State: "I want to understand these results better"
Emotional State: Curious, seeking clarification
```

**Step 1: Chat Interface Discovery**
- **Current State**: User viewing analysis on "Report" tab
- **Action**: User notices Chat tab (initially inactive, 70% opacity)
- **UI Guidance**: Subtle animation draws attention to chat option
- **Mental Model**: "I can ask questions about this"

**Step 2: First Question via FAB**
- **Action**: User taps FAB (brain icon) → "Ask Question"
- **UI Response**: FAB expands with suggested questions
- **Question Options**: Pre-defined prompts from chat_options table (**→ database-architecture.md**)
- **Custom Option**: "Ask your own question" text input
- **Biometric Trigger**: None (within session)

**Step 3: Question Processing**
- **Action**: User selects question or types custom question
- **UI Response**: FAB shows loading state ("Serenya is thinking...")
- **API Call**: POST /api/v1/chat/messages (**→ api-contracts.md**)
- **Processing Time**: 5-15 seconds for AI response
- **Error Paths**: 
  - API timeout → Retry with fallback response
  - Rate limiting → "Please wait a moment" with countdown

**Step 4: Response Ready**
- **Action**: AI response received
- **UI Response**: FAB expands to "View Answer" button with chat tab indicator
- **Visual Cues**: Small dot appears on Chat tab
- **Haptic Feedback**: Gentle notification vibration
- **Data Storage**: Message stored locally with encryption

**Step 5: Response Viewing**
- **Action**: User taps "View Answer" or Chat tab directly
- **Navigation**: Automatic switch to Chat tab
- **UI Response**: Conversation interface with user question + Serenya response
- **Message Display**: User bubble (right) + Serenya bubble with avatar (left)
- **Follow-up**: FAB resets to "Ask Question" for continued conversation

#### **Conversation Continuation**
**User Behavior**: Users typically ask 2-4 follow-up questions  
**Flow Pattern**: Question → Response → Question → Response  
**Emotional Arc**: Curiosity → Clarification → Confidence → Satisfaction

---

### **Flow 2B: Ongoing Conversation (Returning User)**

**Key Differences**:
- **Immediate Chat Access**: User goes directly to Chat tab
- **Context Awareness**: Serenya references previous conversations
- **Advanced Questions**: Users ask more sophisticated follow-up questions
- **Premium Features**: Opportunity to showcase doctor conversation prep

---

## 🔐 **Authentication & Security Flow**

### **Flow 3A: First-Time App Launch & Setup**

#### **Entry Point: App Installation → First Launch**
```
User Mental State: "I want to try this health AI assistant"
Emotional State: Curious but cautious about health data privacy
```

**Step 1: Splash Screen**
- **Duration**: 2-3 seconds
- **Content**: Serenya logo with loading animation
- **Background Process**: Check authentication status
- **Data Flow**: No API calls (local setup check)

**Step 2: Onboarding Slide 1 - Welcome**
- **Content**: Value proposition and feature overview (**→ ui-specifications.md**)
- **User Action**: Swipe or tap "Next"
- **Emotional Focus**: Build excitement and confidence
- **Privacy Emphasis**: Highlight local data storage

**Step 3: Onboarding Slide 2 - Privacy & Security**
- **Content**: Privacy-first messaging with local storage emphasis
- **Key Messages**: "Files processed instantly, then deleted—all your data stays on your device"
- **Visual Elements**: Shield and lock icons
- **User Action**: Read and proceed with confidence

**Step 4: Onboarding Slide 3 - Medical Disclaimers**
- **Content**: Important limitations and safety information
- **Framework**: "Think of us as" vs "We are NOT"
- **User Action**: Acknowledge understanding
- **Legal Requirement**: Required for medical AI applications

**Step 5: Onboarding Slide 4 - Consent & Authentication**
- **Consent Collection**: 2 required checkboxes (bundled consent approach)
  - **Checkbox 1**: Legal agreements and AI processing consent (Terms of Service, Privacy Policy, Healthcare Consultation)
  - **Checkbox 2**: Medical disclaimers understanding (Medical Disclaimer, Emergency Care Limitation)
- **Authentication**: Google Sign-In button (WCAG compliant)
- **API Call**: POST /api/v1/auth/google (**→ api-contracts.md**)
- **Database Storage**: User record + 5 consent records (bundled from 2 checkboxes)

**Step 6: Biometric Setup (Post-Authentication)**
- **Trigger**: After successful Google authentication
- **Platform Detection**: iOS Face ID/Touch ID vs Android Fingerprint
- **Setup Flow**: System biometric enrollment prompt
- **Encryption Key**: Device root key generation (**→ encryption-strategy.md**)
- **Fallback**: Device PIN as alternative
- **Error Handling**: Skip option with reduced security (PIN only)

**Step 7: Welcome to Timeline**
- **Navigation**: Direct transition to main Timeline view
- **Content**: Empty state with encouraging upload prompt
- **User State**: Fully authenticated and ready for core functionality
- **Success Metric**: User reaches main app functionality

---

### **Flow 3B: Returning User Authentication**

#### **Entry Point: App Launch (Not First Time)**
```
User Mental State: "I want to check my health data"
Emotional State: Confident and routine
```

**Step 1: Session Check**
- **Background Process**: Check last activity timestamp
- **Session Valid**: Direct to Timeline view (no authentication required)
- **Session Expired**: Trigger biometric authentication
- **Session Timeout**: 15 minutes of inactivity (**→ encryption-strategy.md**)

**Step 2: Biometric Re-Authentication (If Needed)**
- **Trigger**: Session expired or app return from background
- **UI Prompt**: "Welcome back! Please authenticate to access your health data"
- **Biometric Options**: Face ID, Touch ID, Fingerprint, or PIN fallback
- **Success**: Direct to Timeline view
- **Failure**: Return to biometric prompt with failure count tracking
- **Lockout**: After 5 failures, temporary lockout with PIN requirement

---

## ⭐ **Premium Feature Flows**

### **Flow 4A: Premium Upgrade Discovery**

#### **Entry Point: Timeline View → Premium Content Discovery**
```
User Mental State: "I want more detailed health insights"
Emotional State: Interested in advanced features
```

**Step 1: Premium Content Teaser**
- **Context**: User sees "Professional Report" cards in timeline
- **Visual Distinction**: Green accent border vs blue for free results
- **Premium Indicator**: Small star icon and "Premium" label
- **Action**: User taps on premium content card

**Step 2: Premium Preview**
- **UI Response**: Modal or overlay showing premium content preview
- **Content**: First paragraph of report + "Unlock full report" prompt
- **Value Proposition**: "Doctor-ready reports", "Detailed analysis", "Trend tracking"
- **Call-to-Action**: "Upgrade to Premium" button
- **Alternative**: "Learn more about Premium" for feature comparison

**Step 3: Subscription Selection**
- **Navigation**: Premium subscription screen
- **Options**: Monthly vs Annual subscription with pricing
- **Platform Integration**: Apple App Store or Google Play billing
- **API Call**: POST /api/v1/subscriptions/create (**→ api-contracts.md**)
- **Biometric Trigger**: Critical operation - requires fresh biometric auth (**→ encryption-strategy.md**)

**Step 4: Payment Processing**
- **Platform Flow**: Native Apple/Google payment interface
- **Processing**: Subscription activation and verification
- **Database Update**: User subscription status and payment record
- **Success Response**: Return to app with premium features unlocked
- **Error Handling**: Payment failure → retry options or contact support

**Step 5: Premium Content Access**
- **UI Update**: Premium content cards now fully accessible
- **Feature Unlock**: Advanced charts, trend analysis, doctor reports
- **Success Confirmation**: Welcome message highlighting premium benefits

---

## ❌ **Error Recovery & Edge Case Flows**

### **Flow 5A: Network Connectivity Issues**

#### **Context: User Attempts Upload Without Internet**
```
User Mental State: "Why isn't this working?"
Emotional State: Frustrated, needs clear guidance
```

**Step 1: Upload Attempt Detection**
- **Trigger**: User taps upload with no network connectivity
- **Detection**: Network status monitoring
- **Immediate Response**: Clear error message (not technical)
- **Message**: "No internet connection. Your document will upload when connection is restored."

**Step 2: Offline Queue Management**
- **Action**: Document stored locally in upload queue
- **UI Indicator**: "Queued for upload" badge on timeline
- **Background Process**: Monitor network connectivity
- **Auto-Upload**: Resume upload when connection restored
- **User Control**: Manual retry option

**Step 3: Connection Restored**
- **Auto-Resume**: Begin upload without user intervention
- **Progress Update**: Change from "Queued" to "Uploading" state
- **Success Path**: Continue with normal processing flow
- **Notification**: Optional push notification when processing complete

---

### **Flow 5B: Biometric Authentication Failure**

#### **Context: User's Biometric Authentication Repeatedly Fails**
```
User Mental State: "I can't get into my own app"
Emotional State: Frustrated, needs immediate access
```

**Step 1: First Failure**
- **Response**: "Face ID not recognized. Please try again."
- **UI State**: Biometric prompt remains active
- **Alternative**: "Use PIN instead" option always available
- **Attempt Counter**: Track consecutive failures

**Step 2: Multiple Failures (3-4 attempts)**
- **Response**: "Having trouble with Face ID? You can use your device PIN instead."
- **UI Emphasis**: Make PIN option more prominent
- **Guidance**: Brief help text about optimal biometric conditions
- **Alternative Path**: Allow PIN authentication with same security level

**Step 3: Persistent Issues**
- **Response**: Switch to PIN as primary authentication method
- **User Control**: Option to retry biometric setup in settings
- **Support Access**: Link to help documentation or contact support
- **Graceful Degradation**: Full app functionality maintained with PIN auth

---

### **Flow 5C: AI Processing Failures**

#### **Context: Document Processing Fails or Times Out**
```
User Mental State: "My document didn't process correctly"
Emotional State: Disappointed, needs resolution
```

**Step 1: Processing Timeout Detection**
- **Timeout Limit**: 3 minutes for document processing
- **User Communication**: "Taking longer than usual. Please wait a moment more..."
- **Extended Timeout**: Additional 2 minutes with status updates
- **Background Action**: Switch to fallback processing if available

**Step 2: Processing Failure**
- **Error Response**: Clear, non-technical error message
- **Message**: "We couldn't analyze your document this time. This could be due to image quality or document format."
- **Immediate Actions**: 
  - "Try uploading again" (retry option)
  - "Tips for better results" (help documentation)
  - "Contact support" (support form or email)

**Step 3: Recovery Options**
- **Retry with Guidance**: Tips for better photo quality, supported formats
- **Manual Support**: Human review option for complex documents
- **Fallback Experience**: Demo mode with sample results for user experience
- **Future Prevention**: Improved error detection and user guidance

---

## 📊 **User Flow Success Metrics**

### **Core Flow Performance**
- **Upload Success Rate**: >95% successful document processing
- **Authentication Success**: >98% successful biometric authentication
- **Session Management**: <2% unexpected session expirations
- **Error Recovery**: >90% user success rate after first error

### **User Experience Metrics**
- **Time to Value**: <3 minutes from upload to results viewing
- **Onboarding Completion**: >85% complete all 4 onboarding slides
- **Premium Conversion**: >15% of active users upgrade to premium
- **User Retention**: >70% return within 7 days of first use

### **Emotional Journey Success**
- **Confidence Building**: Survey feedback on trust and understanding
- **Anxiety Reduction**: Before/after emotional state measurement
- **Empowerment**: Users report feeling more informed about health
- **Satisfaction**: >4.5/5 average app store rating

---

## 🔄 **Agent Handoff Requirements**

### **For Mobile Architecture Agent (→ mobile-architecture.md)**
**Navigation Implementation**:
- Screen transition animations and performance
- State management for complex flows (upload → processing → results)
- Three-layer error handling implementation with UnifiedError models
- Offline capability and queue management
- Circuit breaker patterns for external service integration
- Error recovery UI components and user guidance systems

### **For API Contracts Agent (→ api-contracts.md)**
**API Flow Integration**:
- Document upload with status tracking
- Real-time job status polling
- Chat message creation and retrieval
- Subscription management and payment processing
- Error response handling and user feedback

### **For Security Agent (→ encryption-strategy.md)**
**Authentication Flow Integration**:
- Biometric authentication triggers and fallbacks
- Session management and timeout handling
- Critical operation authentication (premium upgrade)
- Security error recovery and user guidance

---

**Document Status**: ✅ Complete - Ready for UX implementation and API integration  
**Flow Coverage**: 15+ detailed user journeys with success/error paths  
**Cross-References**: All technical integrations mapped to implementation docs  
**Next Steps**: API contracts definition + mobile architecture implementation