# Agent Workflow Protocol - Serenya Implementation

**Purpose**: Streamlined workflow for sequential AI agent task execution in Serenya's healthcare platform development.

**Scope**: Optimized for single-implementer using specialized agents with clear handoff requirements.

**Principle**: Thorough documentation exists in task descriptions - agents focus on **essential handoff information** only.

---

## 🔄 **Streamlined Workflow**

### **Phase 1: Task Pickup** (2-3 minutes)

1. **Linear Task Review**
   - Read task description and acceptance criteria
   - Check dependencies and handoff notes from previous agent

2. **Quick Validation** (Only if critical dependency)
   - **AWS → Flutter handoffs**: Verify APIs accessible
   - **Database changes**: Confirm schema updates applied
   - **Authentication**: Test login flow working
   - **Skip validation** for foundational tasks (1-4) - just start building

3. **Status Update**
   - Change Linear task status to `In Progress`

### **Phase 2: Implementation** (Focus on building)

1. **Build According to Spec**
   - Follow task description and acceptance criteria
   - Use TodoWrite for progress tracking only if complex
   - Code/implement as specified

2. **Document Only Deviations**
   - **IF** you deviate from original spec: Document why in Linear comments
   - **IF** you discover missing requirements: Note them for next agent
   - **OTHERWISE**: Just build what's specified

3. **Commit Frequently**
   - Clear commit messages describing what was implemented
   - Working increments that next agent can pick up

### **Phase 3: Handoff** (5 minutes max)

1. **Verify Acceptance Criteria**
   - Check each acceptance criterion is met
   - Test that implementation works as specified

2. **Essential Handoff Info** (Linear comment)
   ```markdown
   ## Handoff to Next Agent
   **Completed**: [What was built]
   **Location**: [Key files/endpoints created] 
   **Next Agent Needs**: [Specific info for next task]
   **Issues/Notes**: [Any deviations or discoveries]
   ```

3. **Status Update**
   - Change Linear task status to `Done`
   - Next agent can start immediately

---

## 📊 **Linear Task Status Flow**

| Status | When to Use | Next Step |
|--------|-------------|----------|
| `Backlog` | Task waiting to be started | Ready for agent pickup |
| `In Progress` | Agent actively working | Implementation in progress |
| `Blocked` | Stuck, need help | Human intervention required |
| `Done` | Task completed with handoff | Next agent can start |

---

## ✅ **Critical Handoff Validation** 

**Only validate when crossing domains** (AWS → Flutter, Flutter → AWS)

### **Quick Validation Checklist**

**AWS Cloud Engineer → Flutter Developer**:
- [ ] API endpoints respond (test with curl/Postman)
- [ ] Database tables exist and are accessible
- [ ] Authentication flow returns valid tokens

**Flutter Developer → AWS Cloud Engineer**:
- [ ] Mobile app builds and runs
- [ ] Local database encryption working
- [ ] Biometric authentication functional

**Same Agent Consecutive Tasks**: Skip validation, just start building

### **If Validation Fails**
- Update task status to `Blocked`
- Add comment: "Validation failed: [specific issue]"
- Don't proceed until resolved

---

## 🚨 **When Things Go Wrong**

### **Stuck After 3 Attempts**

**Simple Escalation**:
1. **Linear Comment**:
   ```markdown
   ## BLOCKED - Need Help
   **Problem**: [What you're trying to do]
   **Tried**: [3 things you attempted]
   **Need**: [Specific question or decision]
   ```

2. **Update Status**: Change to `Blocked`
3. **Preserve Work**: Commit what you have with clear message

### **Can't Validate Previous Work**

1. **Add Linear Comment**: "Can't validate: [specific issue]"
2. **Set Status**: `Blocked` 
3. **Wait**: Don't proceed until resolved

---

## 📝 **Quick Reference: Agent Workflow**

### **Starting a Task** (2 minutes)
- [ ] Read Linear task description
- [ ] Check handoff notes from previous agent
- [ ] Quick validation **only if** cross-domain handoff (AWS ↔ Flutter)
- [ ] Update status to `In Progress`

### **During Implementation**
- [ ] Build according to acceptance criteria
- [ ] Commit working increments
- [ ] Document **only deviations** from spec

### **Completing Task** (5 minutes)
- [ ] Verify acceptance criteria met
- [ ] Test implementation works
- [ ] Add handoff comment with essential info for next agent
- [ ] Update status to `Done`

---

## 🎯 **Success = Speed + Clarity**

**Fast handoffs with essential information only**
- Tasks completed according to detailed specs
- Clear Linear comments for next agent
- Working code/infrastructure ready for next phase
- Minimal documentation overhead

**Focus**: Build healthcare platform efficiently with clear agent communication.