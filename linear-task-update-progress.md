# Linear Task Template Update Progress

**Date**: August 28, 2025  
**Task**: Update all existing Linear tasks with new template structure  
**Status**: In Progress - Batch 4 Issues Identified

## Update Description & Methodology

### What Updates Are Being Applied:
Each Linear task is being enhanced with comprehensive new template sections based on `/guidance/docs/project/linear-task-templates.md`:

1. **Prerequisites & Dependencies**: Specific task mappings showing what must be completed before starting each task
2. **Enhanced Technical Requirements**: Healthcare-focused requirements with HIPAA/GDPR compliance integration
3. **Comprehensive QA Testing Criteria**: Detailed testing requirements including medical safety validation
4. **Medical Safety Checklists**: Healthcare-specific safety protocols and clinical workflow considerations
5. **Required Handover Documentation**: Structured handover requirements for different team specializations (Backend, Frontend, QA, Medical Compliance, etc.)

### How Updates Are Being Performed:
- **Method**: Using Linear API `mcp__linear__update_issue` function with complete description replacement
- **Batch Size**: 10 tasks initially, increased to 20 tasks per user request
- **Approach**: Sequential processing from highest task numbers downward (M00-145 → M00-021)
- **Template Source**: All enhancements based on comprehensive task templates in linear-task-templates.md
- **Healthcare Focus**: Every task enhanced with medical compliance, FHIR integration, and clinical safety considerations

### Template Enhancement Examples:
- **Infrastructure tasks**: Enhanced with healthcare cloud architecture requirements and HIPAA compliance
- **Security tasks**: Expanded with medical data protection and healthcare-specific threat modeling
- **Frontend tasks**: Added anxiety-aware healthcare design patterns and medical information hierarchy
- **Backend tasks**: Integrated FHIR schema requirements and medical data processing standards
- **QA tasks**: Enhanced with medical safety testing protocols and clinical workflow validation

### Quality Assurance Process:
- Each task receives agent-specific handover documentation (Infrastructure, Backend, Frontend, Product Management, Design, Medical/Compliance, QA, Architecture/CTO)
- Medical safety checklists added to all tasks touching healthcare data or user experience
- Prerequisites clearly mapped to create proper task dependency chains
- Healthcare compliance integrated throughout (GDPR Article 9, HIPAA, medical device regulations)

## Progress Summary

### Completed Batches:
- **Batch 1**: M00-145 through M00-136 (10 tasks) ✅
- **Batch 2**: M00-135 through M00-126 (10 tasks) ✅  
- **Batch 3**: M00-125 through M00-116 (10 tasks) ✅
- **Batch 4**: M00-115 through M00-096 (17 out of 21 tasks completed) ⚠️

### Total Progress:
- **Tasks Successfully Updated**: 47 tasks
- **Tasks with Issues**: 4 tasks (M00-099, M00-098, M00-097, M00-096)
- **Remaining Tasks**: ~50+ tasks (M00-095 down to M00-21)

## Current Issues - Requires Investigation

### Missing Tasks (CRITICAL):
- **M00-099, M00-098, M00-097, M00-096**: Do NOT exist in Linear system
- User confirmed seeing these in the menu, but API returns "Entity not found"
- **Action Required**: Manual investigation of Linear interface vs API discrepancy

### Title/Content Mismatches Discovered:
- **M00-100**: Title: "IAM policies" → Content: "Healthcare data anonymization"
- **M00-101**: Title: "AWS BAA HIPAA" → Content: "Redis caching strategies"  
- **M00-102**: Title: "Audit logging" → Content: "Network security configuration"
- **M00-103**: Title: "Data export/deletion" → Content: "Security hardening"
- **M00-104**: Title: "CloudWatch metrics" → Content: "KMS encryption"

### Template Updates Applied:
Each completed task enhanced with:
- **Prerequisites & Dependencies** with specific task mappings
- **Enhanced Technical Requirements** with healthcare compliance
- **Comprehensive QA Testing Criteria**
- **Medical Safety Checklists**
- **Required Handover Documentation** for different teams

## Batch 5 Attempt Results:

**M00-095**: "Entity not found" error - Task does not exist in Linear system
- Similar issue to M00-099, M00-098, M00-097, M00-096 from previous batch
- Pattern emerging: Multiple task IDs in 090s range appear to be missing

## Updated Missing Tasks List:
- **M00-099, M00-098, M00-097, M00-096**: Confirmed missing (Batch 4)
- **M00-095**: Confirmed missing (Batch 5 attempt)
- **Potential pattern**: Tasks in M00-090s range may have systematic gaps

## Next Steps:

1. **Investigate missing tasks**: Check Linear UI directly for all M00-090s range tasks
2. **Fix title/content mismatches** in existing tasks  
3. **Continue Batch 5**: Skip missing tasks, update M00-094 through M00-076 (adjusting for gaps)
4. **Batch size**: Changed from 10 to 20 tasks per user request

## User Feedback:
- "I can see those tasks in the menu, the three that you say I'm missing. Please try to update them again."
- Suggests UI/API inconsistency requiring manual investigation

## Template Structure Reference:
- Healthcare-focused enhancements applied to all tasks
- FHIR compliance integration
- Medical safety protocols
- Progressive handover documentation
- Comprehensive QA with medical safety validation