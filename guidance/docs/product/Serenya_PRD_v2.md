# Serenya – Product Requirements Document (PRD v2)

**Version:** Draft v2  
**Owner:** [You]  
**Date:** August 24, 2025  

---

## 1. Product Overview

Serenya is an AI Health Agent designed to help users:
- Interpret lab results through medical analysis (PDF uploads)
- Track results over time with contextual understanding
- Generate doctor-ready reports (Premium)

### Strategic Positioning

**Core Positioning Decision:** AI Health Agent providing medical interpretation (non-medical device classification)

**Primary Value Proposition:**  
"Your friendly AI nurse that helps you understand your lab results and empowers better conversations with your healthcare provider."

### What Serenya IS:
- **AI Health Agent** - Your friendly AI nurse helping you understand your health data
- **Medical Interpreter** - Provides medical interpretation of lab results in understandable terms
- **Health Relationship Partner** - Builds ongoing relationship to help users engage with healthcare
- **Patient Empowerment Tool** - Strengthens the patient-doctor relationship through better preparation

### Core Benefits:
1. **Clarity** - Medical interpretation in plain language you can understand
2. **Confidence** - Feel prepared and empowered in healthcare conversations  
3. **Context** - Understand your health story over time
4. **Connection** - Strengthen your relationship with healthcare providers

### Design & Tone Principles:
- Trustworthy, warm, empathic relationship-building (tone + design)
- Clean, minimal UI focused on the three main actions: Upload Exam, History, Doctor's Report
- An AI health companion that provides medical interpretation assistance and empowers better healthcare relationships

---

## 2. Objectives

1. Provide clear medical interpretation of lab results for all users
2. Offer longitudinal health insights via Premium contextual analysis
3. Deliver doctor-ready reports that frame medical interpretations for healthcare consultations
4. Maintain strict privacy and compliance with HIPAA, GDPR, and FHIR standards
5. Build ongoing AI health relationships that empower users in their healthcare journey

---

## 3. Target Users

- **Primary:** Adults 25–55 seeking health clarity and empowerment
- **Secondary:** Patients with chronic conditions, frequent lab testing
- **Personas:** Curious, health-conscious, prefer simple trustworthy tools, want to reduce uncertainty before doctor visits

---

## 4. Core Features

### 4.1 Authentication & Onboarding

- Google SSO only (MVP)
- Onboarding requires basic profile setup:
  - Gender, age, weight
  - Lifestyle/environmental context
  - General well-being baseline
- Progressive onboarding flow:
  - First-time users see Profile Setup + Upload Exam
  - After setup, options become Upload Exam, History, Doctor's Report

### 4.2 User Profile & Context Tracking

- Static data: gender, age
- Dynamic data: weight, lifestyle changes, environmental conditions, general well-being
- Stored using FHIR schema for long-term interoperability
- Feeds into Premium contextual analysis

### 4.3 Lab Results Management

- Upload flow:
  - File picker or drag-and-drop PDF upload
  - Disclaimer displayed during upload: "We don't store your files. Results are parsed into structured data for analysis."
- Parsing & storage:
  - AI parses PDFs → structured medical data (FHIR)
  - Original files/images are not stored
- History view:
  - Timeline-style interface
  - Each exam displayed as a card → opens details & comparisons
  - For Premium: download "Doctor's Report" PDF per exam

### 4.4 AI Analysis Prompts

Two encapsulating prompt strategies:

- **Free Tier**
  - Medical interpretation of current results only
  - Users can export summary (PDF) with AI nurse analysis
- **Premium Tier**
  - Medical interpretation contextualized with past results + profile
  - Produces trend insights and longitudinal medical analysis
  - Doctor-ready reports with AI nurse insights, suggested questions + discussion points

### 4.5 Doctor's Reports (Premium)

- PDF-only export
- Includes:
  - Current lab results in context
  - Historical trends
  - Suggested questions for doctor
  - Framing as "discussion support," not diagnostic advice
- Static disclaimer on every report: "This document provides medical interpretation assistance, not medical advice. Please consult your physician."

### 4.6 Interaction Model

- Free text queries: users ask their own questions about results
- Prompt suggestions: guided follow-ups (e.g., "Compare to last exam", "Explain in plain language")
- No annotations in v1. Future: add symptom tracking as structured inputs

---

## 5. UI/UX Principles

### 5.1 Principles

- Warm & empathic: supportive tone, plain language
- Trustworthy: emphasize privacy-first ("we don't keep your files")
- Minimalism: clean homepage with only 3 primary actions

### 5.2 Landing Page

- First-time: Profile Setup + Upload Exam
- After setup: Upload Exam, History, Doctor's Report

### 5.3 History UI

- Timeline view of submissions
- Each card = lab analysis
- Premium cards include Download Report
- Free users: summary export only (isolated analysis)

---

## 6. Technical Requirements

### 6.1 AI Integration

- MVP: one AI provider (to be recommended by CTO)
- Abstracted for future multi-agent orchestration
- Encapsulating prompts define Free vs Premium analysis scope

### 6.2 Data Storage

- Only structured medical data stored (FHIR)
- Upload files/images not retained
- Data encrypted at rest & in transit
- Audit logs for compliance

### 6.3 Compliance & Legal Protection

**Regulatory Benefits (Non-Medical Device Classification):**
- ✅ No medical device registration required (positioned as interpretation tool, not diagnostic device)
- ✅ No clinical validation studies needed  
- ✅ No FDA/CE marking required
- ✅ Reduced liability exposure through proper disclaimers
- ✅ Standard business insurance sufficient
- ✅ No medical director requirement

**Required Compliance:**
- HIPAA + GDPR from day one (health data requires enhanced protection)
- FHIR schema compliance for medical data storage
- General consumer protection laws
- Standard business licensing

**Legal Protection Strategy - Disclaimers (prominently displayed during onboarding and throughout app):**
- "This is medical interpretation assistance, not medical advice"
- "Always consult healthcare professionals for medical decisions"  
- "Serenya is like having a nurse friend help you understand your results"
- "Do not delay seeking medical care based on this information"

**Content Guidelines:**
- Provide "medical interpretation" and "analysis" of lab results
- Frame as "AI nurse helping you understand your results"
- Focus on "empowering your healthcare relationships"
- Position as "interpretation assistance" not "diagnostic tool"

---

## 7. Business Model

**Pricing Strategy:**
- **Free Tier:** Basic medical interpretation + analysis
  - Upload labs → AI nurse interpretation
  - Export summary PDF with medical interpretation
- **Premium Tier:** €9.99/month, €99/year - Historical context + doctor-ready reports  
  - Contextual medical interpretation with health history
  - Doctor-ready PDF reports with AI nurse insights
  - Trend insights and longitudinal health relationship
  - Export all interpretations + reports
- **Conversion incentive:** One free doctor report within 7 days of sign-up

**Market Position:**
- **Unique Position:** AI nurse/interpretation assistant for lab results
- **Differentiation:** Personal health relationship vs one-time tools

**Implementation Timeline:** 3-6 months to launch (vs 12-18 months for medical device)
This approach maintains 80% of planned functionality while eliminating regulatory blockers and reducing legal risk by ~90%.

---

## 8. Future Considerations

- Camera-based upload (snap a picture)
- Symptom tracking in timeline
- Multi-format exports (CSV/JSON)
- Additional SSO (Apple, email)
- Integration with Apple Health / Google Fit
- Physician portal for direct report sharing

---

## 9. Success Metrics

- % of users completing profile setup
- % uploading labs in first week
- Report generation frequency (Premium)
- Conversion rate from Free → Premium
- Retention rate (Monthly & Annual plans)
- NPS (trust, clarity, empathy)