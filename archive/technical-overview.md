# Serenya Technical Overview

**Architecture**: Device-Only Storage with Flutter Mobile App  
**Timeline**: 16 weeks MVP development  
**Cost Model**: Processing-only with minimal infrastructure  
**Date**: August 30, 2025  

---

## Executive Summary

Flutter-native mobile architecture with device-only health data storage and temporary server-side AI processing. This approach maximizes user privacy while maintaining efficient AI-powered health document interpretation through a privacy-first business model.

**Key Business Context:**
- AI Health Agent for medical document interpretation (non-emergency tool)
- Premium Medical Report Export feature
- Privacy-first positioning against health startups
- Device storage with acceptable data loss approach

---

## Architecture Decision Records (ADRs)

### **ADR-001: Data Storage Strategy**
**Decision**: Device-Only Storage with Temporary Server Processing  
**Status**: Approved  

**Approach**:
- **Local Storage**: All user health data stored on device only (encrypted SQLite)
- **Server Processing**: Temporary file storage during AI processing only
- **No Permanent Storage**: Files deleted after success or terminal failure
- **Acceptable Data Loss**: Device loss = data loss (user backup responsibility)

**Rationale**:
- **Ultimate Privacy**: "Your health data never leaves your device permanently"
- **Trust Differentiation**: Cannot access user data vs competitors
- **Cost Reduction**: No database hosting, backup, or long-term storage costs
- **Simplified Compliance**: Reduced HIPAA scope with processing-only architecture

### **ADR-002: Technology Stack**
**Decision**: Flutter Mobile App with AWS Processing Backend  
**Status**: Approved  

**Frontend**: Flutter with dart  
**Local Database**: SQLite with `sqflite_cipher` encryption  
**Backend**: AWS Lambda + Node.js for processing  
**Storage**: S3 temporary buckets with auto-cleanup  
**AI**: Anthropic Claude API for medical interpretation  
**Authentication**: JWT tokens for stateless sessions  

**Rationale**: Mobile-first healthcare experience, cross-platform efficiency, secure local storage, scalable processing

### **ADR-003: Processing Architecture**
**Decision**: Stateless Processing with Progressive Retry  
**Status**: Approved  

**Processing Flow**:
```
Flutter Upload → S3 Temporary → Lambda Processing → Claude AI → Results Return → Cleanup
```

**Key Specifications**:
- **File Limits**: 5MB maximum, PDF and image formats
- **Processing Timeout**: 3 minutes default (adjustable during testing)
- **Retry Logic**: 30s → 2m → 5m (3 attempts max) with exponential backoff
- **Cleanup**: 1-hour Lambda cleanup + 24-hour failsafe deletion
- **Storage Structure**: `temp-processing/{user_id}/{session_id}/`

### **ADR-004: Security & Compliance**
**Decision**: Privacy-by-Design with HIPAA Processing Compliance  
**Status**: Approved  

**Device Security**:
- SQLite encryption with `sqflite_cipher`
- Flutter Secure Storage for encryption keys
- Biometric authentication (optional)
- Session timeout and screenshot prevention

**Server Security**:
- S3 bucket encryption for temporary PHI
- IAM roles with minimal necessary permissions
- JWT authentication with 1-hour expiration
- Audit logging without PHI content

**Compliance**: HIPAA-compliant temporary processing only, no permanent PHI storage

---

## Implementation Plan: 16-Week Timeline

### **Sprint 1-2 (Weeks 1-4): Foundation**
- Flutter app architecture setup
- SQLite encryption implementation with `sqflite_cipher`
- Basic UI components (Timeline, Settings)
- REST API specification finalization
- AWS Lambda processing functions
- S3 temporary storage with encryption

### **Sprint 3-4 (Weeks 5-8): Core Features**
- REST API integration with Flutter
- File upload/processing workflow
- Progressive retry mechanism (30s → 2m → 5m)
- Basic disclaimer implementation (onboarding + Settings)
- Timeline navigation for health records
- User authentication and session management

### **Sprint 5-6 (Weeks 9-12): Testing & Optimization**
- Comprehensive Flutter testing suite (`flutter_test`, `integration_test`, `flutter_driver`)
- S3 temporary storage setup and cleanup automation
- DevOps automation (Lambda cleanup functions)
- Performance optimization and battery efficiency
- Security features (biometric auth, session timeout)
- Accessibility implementation (screen reader, font scaling)

### **Sprint 7-8 (Weeks 13-16): Launch Preparation**
- User acceptance testing with privacy-conscious early adopters
- Security audit and penetration testing
- Performance optimization and load testing
- App store preparation (iOS App Store, Google Play)
- Marketing material preparation
- Legal review of disclaimers and privacy policy

---

## Technical Architecture

### **Mobile App (Flutter)**:
- **Database**: SQLite with `sqflite_cipher` encryption
- **Storage**: Flutter Secure Storage for encryption keys
- **UI Framework**: Adapted Frame0 design system patterns
- **Navigation**: Timeline-based health record organization
- **File Handling**: PDF and image upload with 5MB limits
- **Security**: Biometric auth, session timeout, screenshot prevention

### **Backend Infrastructure (AWS)**:
- **Processing**: Lambda functions with 3-minute timeout
- **Storage**: S3 temporary buckets with per-user folder structure
- **Cleanup**: Hourly Lambda cleanup with 24-hour failsafe
- **Security**: Encryption at rest, IAM role restrictions
- **Monitoring**: CloudWatch for processing metrics and performance

### **API Architecture**:
- **Protocol**: REST with JSON responses
- **Authentication**: JWT tokens for stateless sessions
- **Error Handling**: User-friendly messages with retry suggestions
- **Retry Mechanism**: Progressive backoff with user progress indicators
- **File Processing**: Temporary storage with guaranteed cleanup

---

## Cost Structure

### **Processing-Only Model:**
- **No Infrastructure Costs**: No databases, no persistent storage
- **AI Processing**: Pay-per-use Claude API costs only
- **AWS Costs**: Minimal Lambda + S3 temporary storage
- **Scaling**: Linear cost scaling with usage

### **Estimated Monthly Costs:**
```
100 documents/day: €1,500-2,000 (AI) + €50 (AWS) = €1,550-2,050
500 documents/day: €7,500-10,000 (AI) + €200 (AWS) = €7,700-10,200  
1,000 documents/day: €15,000-20,000 (AI) + €400 (AWS) = €15,400-20,400
```

---

## MVP Scope & Features

### **Core MVP Features:**
1. **Health Data Processing**: 3-minute timeout, device-only storage
2. **Local Encryption**: SQLite with `sqflite_cipher`
3. **Timeline Navigation**: Chronological health record view
4. **Progressive Retry**: 3 attempts with exponential backoff
5. **Interpretation Display**: View AI interpretations locally
6. **Disclaimers**: Onboarding + comprehensive Settings page

### **Premium Features:**
- **Medical Report Export**: PDF generation for healthcare providers

### **File Support:**
- **Formats**: PDF and images (5MB maximum)
- **Processing**: Server-side AI interpretation with temporary storage

---

## Marketing & Launch Strategy

### **Target Market:**
- **Primary**: Privacy-conscious health consumers
- **Launch Approach**: Early adopters → mainstream expansion

### **Positioning:**
- **Against**: Health startups (not big tech)
- **Value Proposition**: "Your health data never leaves your device permanently"
- **Differentiation**: Technical inability to access user data

### **User Experience:**
- **Onboarding**: Minimal backup education emphasizing privacy benefits
- **Disclaimers**: Layered approach - brief onboarding + detailed Settings page
- **Data Organization**: Timeline navigation for submissions and interpretations

---

## Success Metrics

### **Technical Targets:**
- **Processing Success Rate**: >95% within 3-minute timeout
- **App Performance**: <2 second startup time
- **Security**: Pass independent security audit
- **Test Coverage**: 85% code coverage for core health data processing

### **Business Targets:**
- **User Adoption**: 1,000+ early adopter signups in first month
- **Retention**: 70% 30-day retention rate
- **Privacy Trust**: Net Promoter Score >50 for privacy perception
- **Premium Conversion**: Medical Report export usage metrics

---

## Next Steps

### **Immediate Actions (Week 1):**
1. **CTO + Backend Engineer**: Finalize REST API specifications
2. **DevOps**: Set up S3 infrastructure and Lambda cleanup functions
3. **UI/UX Designer**: Create Flutter component library from Frame0 patterns
4. **QA Engineer**: Establish testing infrastructure and Firebase Test Lab

### **Development Start (Week 2):**
- Begin Sprint 1: Flutter app architecture and encryption setup
- Daily standups: Cross-team coordination and progress tracking
- Legal review: Disclaimer language and compliance validation

---

**Status**: All agents aligned on device-only storage strategy - ready for Sprint 1 development with Flutter mobile app and privacy-first positioning.