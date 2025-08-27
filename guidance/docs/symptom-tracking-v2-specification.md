# Serenya Symptom Tracking - V2 Feature Specification
**Date:** August 25, 2025  
**Version:** V2 Feature (Post-MVP)  
**Purpose:** Ongoing health companion functionality between lab results

## Overview

Symptom tracking transforms Serenya from a reactive lab interpretation tool to a proactive health companion. This feature addresses the 3-6 month gaps between lab results by maintaining continuous user engagement and providing contextual health insights based on symptoms and historical data.

## Core Functionality

### User Problem Solved
- **Primary Job:** "Help me understand if I should be worried about symptoms I'm experiencing"
- **Secondary Job:** "Help me track patterns between how I feel and my lab results"
- **Engagement Job:** "Keep me connected to my health journey between lab tests"

### Value Proposition
- Contextualize current symptoms with historical lab results
- Identify patterns between symptoms and health trends
- Provide proactive recommendations for lab tests or doctor consultations
- Maintain health awareness during dormant periods

## Feature Requirements

### 1. Standardized Symptom Database

#### Primary Symptom Categories
```
Cardiovascular:
- Chest pain/pressure
- Heart palpitations
- Shortness of breath
- Swelling in legs/feet
- Dizziness/lightheadedness

Gastrointestinal:
- Nausea/vomiting
- Diarrhea
- Constipation
- Abdominal pain
- Loss of appetite
- Heartburn/acid reflux

Neurological:
- Headaches
- Fatigue
- Memory issues
- Confusion
- Sleep disturbances
- Mood changes

Musculoskeletal:
- Joint pain
- Muscle weakness
- Back pain
- Stiffness
- Reduced mobility

General:
- Fever
- Weight loss/gain
- Night sweats
- Frequent urination
- Skin changes
- Vision changes
```

#### Symptom Attributes
Each symptom entry includes:
- **Severity Scale:** 1-10 rating
- **Duration:** Hours, days, weeks, months
- **Frequency:** Constant, intermittent, occasional
- **Triggers:** Food, exercise, stress, medication (optional)
- **Notes:** Free-form text for additional context

### 2. Manual Override System

#### Free-Form Input
- **Text Field:** "Describe any symptoms not listed above"
- **Character Limit:** 500 characters
- **Standardization Process:** AI-powered normalization to match existing categories

#### Standardization Algorithm
```
Manual Input → AI Analysis → Category Matching → Admin Review → Database Update

Examples:
"Feel dizzy when standing up" → "Dizziness/lightheadedness" + "Trigger: Standing"
"Stomach hurts after eating" → "Abdominal pain" + "Trigger: Food"
"Can't sleep well lately" → "Sleep disturbances" + "Duration: Recent"
```

#### Consolidation System
- **AI-Powered Clustering:** Group equivalent manual entries
- **Admin Review Dashboard:** Weekly review of new manual symptoms
- **Auto-Standardization:** Common patterns automatically categorized
- **User Feedback Loop:** "Did we categorize this correctly?" validation

### 3. Check-In System

#### Adaptive Frequency
User check-in intervals based on engagement patterns:

```
High Engagement (Weekly usage): Weekly check-ins
Medium Engagement (Monthly usage): Bi-weekly check-ins  
Low Engagement (Quarterly usage): Monthly check-ins
Dormant Users (No recent activity): Monthly gentle reminders
```

#### Check-In Interface
```
"Hi [Name], how are you feeling this week?

Quick Health Check:
○ Feeling great, no concerns
○ Some minor symptoms to report
○ Experiencing concerning symptoms
○ Prefer not to answer today

[If symptoms selected]
→ Standardized symptom selection interface
→ Manual override option
→ Contextual follow-up questions
```

#### Engagement Triggers
- **Time-based:** Scheduled check-ins based on user pattern
- **Event-based:** Post-lab result analysis follow-up
- **Symptom-based:** Follow-up on previously reported concerning symptoms
- **User-initiated:** On-demand symptom logging anytime

### 4. Contextual Analysis Integration

#### Historical Context Integration
When symptoms are reported, system analyzes:
- **Previous Lab Results:** Correlate symptoms with historical values
- **Trend Analysis:** Compare current symptoms with past symptom patterns
- **Risk Assessment:** Identify symptoms that correlate with abnormal lab values
- **Proactive Recommendations:** Suggest relevant lab tests based on symptom clusters

#### Example Contextual Analysis
```
User reports: "Fatigue, heart palpitations, dizziness"
System analysis:
- Previous lab: Low iron levels (6 months ago)
- Symptom pattern: Similar symptoms reported before iron diagnosis
- Recommendation: "These symptoms may be related to your previous iron levels. 
  Consider requesting a complete blood count (CBC) and iron studies from your doctor."
```

### 5. On-Demand Reporting

#### Symptom Report Generation
- **User-Initiated:** Generate symptom summary report anytime
- **Pre-Doctor Visit:** Compile recent symptoms for appointment preparation
- **Historical Timeline:** Visual representation of symptoms over time
- **Lab Correlation:** Highlight symptoms that coincide with lab result periods

#### Report Format
```
SYMPTOM SUMMARY REPORT
Generated: [Date]
Period: [Last 30/60/90 days]

CURRENT CONCERNS:
• [Symptom] - [Severity] - [Duration] - [Frequency]

PATTERNS IDENTIFIED:
• Symptoms correlating with [previous lab finding]
• Recurring symptoms: [pattern analysis]

RECOMMENDATIONS:
• Lab tests to consider: [specific tests based on symptoms]
• Discussion points for your doctor: [relevant questions]

HISTORICAL CONTEXT:
• Similar symptoms experienced: [dates]
• Previous lab results related to current symptoms: [summary]
```

## Technical Implementation

### Database Schema (Additional Tables)

```sql
-- Standardized symptom categories
CREATE TABLE symptom_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_name VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    description TEXT,
    severity_scale_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User symptom entries
CREATE TABLE user_symptoms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    symptom_category_id UUID REFERENCES symptom_categories(id),
    custom_symptom_text VARCHAR(500), -- For manual overrides
    severity_rating INTEGER CHECK (severity_rating >= 1 AND severity_rating <= 10),
    duration_value INTEGER,
    duration_unit VARCHAR(20), -- 'hours', 'days', 'weeks', 'months'
    frequency VARCHAR(50), -- 'constant', 'intermittent', 'occasional'
    triggers TEXT,
    additional_notes TEXT,
    reported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    standardized_category_id UUID REFERENCES symptom_categories(id) -- For standardized manual entries
);

-- Check-in scheduling and responses
CREATE TABLE user_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    checkin_type VARCHAR(50), -- 'scheduled', 'follow_up', 'user_initiated'
    scheduled_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    response_type VARCHAR(50), -- 'no_symptoms', 'symptoms_reported', 'skipped'
    next_checkin_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Symptom-lab correlation tracking
CREATE TABLE symptom_lab_correlations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    symptom_id UUID REFERENCES user_symptoms(id),
    diagnostic_report_id UUID REFERENCES diagnostic_reports(id),
    correlation_strength NUMERIC(3,2), -- 0.00 to 1.00
    ai_analysis_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Manual symptom standardization queue
CREATE TABLE manual_symptom_standardization (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_text VARCHAR(500) NOT NULL,
    suggested_category_id UUID REFERENCES symptom_categories(id),
    admin_reviewed BOOLEAN DEFAULT FALSE,
    approved_category_id UUID REFERENCES symptom_categories(id),
    occurrence_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE
);
```

### AI Integration Points

#### Symptom Analysis Service
```javascript
class SymptomAnalysisService {
  async analyzeSymptomContext(userId, symptoms) {
    // Get user's historical lab results
    const labHistory = await this.getLabHistory(userId);
    
    // Get previous symptom patterns
    const symptomHistory = await this.getSymptomHistory(userId);
    
    // Correlate symptoms with lab abnormalities
    const correlations = await this.findSymptomLabCorrelations(symptoms, labHistory);
    
    // Generate AI analysis and recommendations
    const analysis = await this.generateContextualAnalysis(symptoms, correlations, symptomHistory);
    
    return {
      riskLevel: analysis.riskLevel, // 'low', 'medium', 'high'
      recommendations: analysis.recommendations,
      suggestedTests: analysis.suggestedTests,
      doctorDiscussion: analysis.doctorDiscussion
    };
  }
  
  async standardizeManualSymptom(symptomText) {
    const prompt = `
    Standardize this symptom description to match medical categories:
    "${symptomText}"
    
    Return the most appropriate standardized category and any relevant attributes.
    `;
    
    const response = await this.aiService.analyze(prompt);
    return this.parseStandardizationResponse(response);
  }
}
```

## User Experience Design

### Check-In Flow
```
1. Push Notification/Email: "How are you feeling this week?"
2. Quick Response Options:
   - "Feeling great" → Thank you message, schedule next check-in
   - "Some symptoms" → Symptom selection interface
   - "Concerning symptoms" → Priority symptom interface + doctor consultation prompt
3. Symptom Entry:
   - Visual symptom category selector
   - Severity slider (1-10)
   - Duration/frequency dropdowns
   - "Add custom symptom" option
4. Contextual Analysis:
   - "We notice these symptoms may be related to your [previous condition]"
   - "Consider discussing with your doctor"
   - "Would you like a summary report for your next appointment?"
```

### Mobile-First Design
- **Quick Entry:** Swipe-based symptom logging
- **Visual Severity:** Color-coded severity indicators
- **Voice Input:** Optional voice-to-text for manual symptoms
- **Offline Capability:** Cache symptoms, sync when connected

## Integration with Existing Features

### Premium Feature Enhancement
- **Basic Users:** Symptom tracking only
- **Premium Users:** Symptom tracking + AI contextual analysis + historical correlation + on-demand reports

### Timeline Integration
- **Enhanced Timeline:** Lab results + symptom entries chronologically
- **Pattern Visualization:** Symptom intensity overlaid with lab value trends
- **Correlation Indicators:** Visual connections between symptoms and lab abnormalities

### Doctor Report Enhancement
```
ENHANCED DOCTOR REPORT (with symptom data):

RECENT LAB ANALYSIS: [Existing lab interpretation]

SYMPTOM CORRELATION ANALYSIS:
• Patient reported symptoms: [list with dates]
• Symptoms correlating with lab findings: [specific correlations]
• New symptoms since last visit: [highlighted items]
• Symptom progression: [improving/worsening/stable]

RECOMMENDED DISCUSSION POINTS:
• [Lab-symptom correlations to explore]
• [Potential follow-up tests based on symptom patterns]
```

## Success Metrics

### Engagement Metrics
- **Check-in Response Rate:** % users responding to scheduled check-ins
- **Symptom Entry Frequency:** Average symptoms logged per user per month
- **Manual Override Usage:** % symptoms entered via custom text vs standardized categories
- **Report Generation:** Frequency of on-demand symptom reports

### Health Outcome Metrics
- **Symptom-Lab Correlation Accuracy:** % of AI-identified correlations validated by healthcare providers
- **Early Detection Value:** % cases where symptom tracking identified concerns before scheduled lab work
- **User Health Confidence:** Survey metrics on health management confidence

### Business Metrics
- **Premium Conversion Enhancement:** % increase in conversion rate with symptom tracking
- **User Retention:** Retention improvement during dormant lab periods
- **Engagement Frequency:** Average user sessions per month vs lab-only usage

## Implementation Timeline (V2 - Post-MVP)

### Phase 1: Foundation (Months 1-2 after MVP launch)
- Standardized symptom database creation
- Basic symptom entry interface
- Check-in scheduling system
- Manual override normalization

### Phase 2: Intelligence (Months 3-4)
- AI symptom-lab correlation analysis
- Contextual analysis integration
- Enhanced reporting capabilities
- Historical pattern recognition

### Phase 3: Optimization (Months 5-6)
- Mobile app symptom tracking
- Voice input capabilities
- Advanced visualization
- Provider feedback integration

## Privacy and Compliance Considerations

### Data Sensitivity
- **Symptom data classification:** Equally sensitive to lab data under HIPAA
- **Consent requirements:** Explicit consent for symptom tracking and analysis
- **Data retention:** Same retention policies as medical data

### User Control
- **Opt-in/opt-out:** Users can disable symptom tracking anytime
- **Data deletion:** Users can delete specific symptom entries or all symptom data
- **Sharing control:** Users control whether symptoms are included in doctor reports

This symptom tracking specification transforms Serenya from a reactive lab interpretation tool into a comprehensive health companion that maintains user engagement and provides continuous value between medical tests.