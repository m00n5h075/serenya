# Agent Workflow Protocol

**Purpose**: Establish clear, systematic workflow for AI agent task execution and handoffs in the Serenya project.

**Scope**: All AI agents working on Linear tasks must follow this protocol for consistent, verifiable work.

---

## 🔄 **Core Workflow Phases**

### **Phase 1: Task Pickup & Validation**
**MANDATORY**: Every agent must validate predecessor's work before starting

1. **Read Linear Task Context**
   - Review full task description and acceptance criteria
   - Check **Agent Context** section for prerequisites
   - Review any existing **Handoff Notes** from previous agents

2. **Validate Prerequisites** 
   - **REQUIRED**: Verify all prerequisite tasks are genuinely complete
   - Use objective, measurable validation criteria
   - Document validation results in Linear task comments
   - **If validation fails**: Update task status to `blocked` and escalate

3. **Environment Assessment**
   - Verify current system state matches expected state
   - Check file locations, configurations, database schema
   - Confirm access to required resources and tools

### **Phase 2: Active Work Execution**

1. **Initialize Task Status**
   - Update Linear task status to `agent_active`
   - Use TodoWrite to document current task and planned approach
   - Commit to systematic progress tracking

2. **Progressive Documentation**
   - Update TodoWrite at key decision points (not just completion)
   - Document architectural/design choices and rationale
   - Note alternative approaches considered and why they were rejected
   - Preserve partial work with clear commit messages

3. **Decision Point Protocol**
   - For major decisions: Document in Linear task comments
   - Include reasoning, alternatives considered, and impact assessment
   - When uncertain: Document the uncertainty and chosen approach

### **Phase 3: Task Completion & Handoff**

1. **Completion Verification**
   - Verify all acceptance criteria are met with measurable evidence
   - Run tests, checks, or validations as specified
   - Document verification results with timestamps

2. **Handoff Documentation** 
   - Complete **Agent Completion Report** in Linear task
   - Update TodoWrite with completion status
   - Commit all code/documentation changes with clear messages

3. **Status Update**
   - Change Linear task status to `agent_complete`
   - Ensure next agent has all context needed to proceed

---

## 📊 **Task Status Definitions**

| Status | Description | Next Action |
|--------|-------------|-------------|
| `agent_ready` | Task ready for agent pickup | Agent can start Phase 1 |
| `agent_active` | Currently being worked on | Continue execution |
| `agent_blocked` | Stuck, needs escalation | Human intervention required |
| `agent_complete` | Ready for next agent | Next agent starts validation |
| `task_complete` | Fully finished | No further action needed |

---

## ✅ **Validation Requirements Between Handoffs**

### **MANDATORY VALIDATION CHECKLIST**

Before starting any task, the receiving agent MUST verify:

#### **Technical Validation**
- [ ] All files mentioned in predecessor's completion report exist
- [ ] Code compiles/runs without errors  
- [ ] Database changes are applied and functional
- [ ] Tests pass (if applicable)
- [ ] Configuration changes are active

#### **Functional Validation**
- [ ] Acceptance criteria from prerequisite tasks are demonstrably met
- [ ] Features work as described in specifications
- [ ] Integration points function correctly
- [ ] Performance meets stated requirements

#### **Documentation Validation**
- [ ] All promised documentation exists and is accurate
- [ ] Code comments match implementation
- [ ] Configuration is documented
- [ ] Known limitations are clearly stated

### **Validation Documentation Format**

```markdown
## Prerequisite Validation Report
**Validating Agent**: [Agent Type]
**Validation Date**: [ISO Date]
**Predecessor Task(s)**: [Task IDs]

### Technical Checks
- ✅ File X exists at path Y
- ✅ Database schema includes tables A, B, C
- ✅ Service responds at endpoint Z

### Functional Checks  
- ✅ Feature X works as specified
- ✅ Integration with Y system functional
- ⚠️ Performance slower than expected (documented)

### Issues Found
- [None / List specific issues]

### Overall Status
- ✅ VALIDATED - Ready to proceed
- ❌ BLOCKED - Issues must be resolved first
```

---

## 🚨 **Blocking & Escalation Protocol**

### **When Agent Gets Stuck (After 3 Attempts)**

1. **Document the Block**
   ```markdown
   ## BLOCKING ISSUE
   **Issue**: [Specific problem description]
   **Attempted Solutions**: 
   1. [Solution 1] - [Result]
   2. [Solution 2] - [Result] 
   3. [Solution 3] - [Result]
   
   **Research Done**: [Resources consulted]
   **Decision Needed**: [Specific question for human]
   **Work Preserved**: [What was completed/committed]
   ```

2. **Update Task Status**
   - Change Linear status to `agent_blocked`
   - Add blocking issue documentation to task comments
   - Preserve all partial work with clear commit messages

3. **Escalation Action**
   - Tag task with `needs-human-input` label
   - Use TodoWrite to document current status
   - Stop work and await human resolution

### **When Validation Fails**

1. **Document Validation Failure**
   - Specific criteria that failed
   - Evidence of the failure
   - Impact on current task

2. **Escalate to Previous Agent's Work**
   - Update predecessor task status to `validation_failed`
   - Document specific issues found
   - Do not proceed with current task until resolved

---

## 📝 **Agent Handoff Checklist**

### **Before Starting Any Task**
- [ ] Validate all prerequisite work is complete
- [ ] Document validation results in Linear
- [ ] Update task status to `agent_active`
- [ ] Initialize TodoWrite with task and approach

### **During Task Execution**
- [ ] Update TodoWrite at key decision points
- [ ] Document major decisions in Linear comments
- [ ] Commit partial progress with clear messages
- [ ] Follow established coding/documentation standards

### **Before Completing Task**
- [ ] Verify all acceptance criteria met
- [ ] Complete Agent Completion Report
- [ ] Update TodoWrite with completion status
- [ ] Change task status to `agent_complete`

---

## 🎯 **Success Metrics**

**Effective workflow demonstrated by:**
- Zero tasks requiring rework due to incomplete handoffs
- Clear audit trail of decisions and progress
- Smooth transitions between different agent types
- Measurable validation of all prerequisite work
- Consistent documentation standards across agents

This protocol ensures systematic, verifiable progress while maintaining the flexibility needed for complex AI-driven development.