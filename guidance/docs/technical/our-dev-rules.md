# Serenya Development Standards
**Team Coordination:** Agent workflow protocols + communication standards  
**Accountability:** Verification requirements + systematic handoffs  
**Code Quality:** Standards + testing requirements  
**Date:** August 27, 2025

---

## 📋 Team Mission & Context

**Serenya Mission:** AI medical agent that helps users interpret symptoms and medical exam results in a safe, warm, and trustworthy way. We empower people with clarity and confidence about their health while protecting them from harm.

**Development Philosophy:** Every decision balances speed of execution with compliance, safety, and user privacy. We prioritize systematic delivery through specialized AI agent coordination.

---

## 🔄 Agent Coordination Standards

Lean Startup Bias: Move fast, test assumptions, cut unnecessary complexity. But when it comes to medical claims, compliance, and user safety, we never cut corners.

Founder Involvement: Bring the Founder in when:

A trade-off involves business direction, compliance, or user wellbeing.

A disagreement blocks progress.

More context or prioritization is needed.

Always remember: We are not just building a product, we are building trust.

## Agent Accountability Standards

**Verification Before Completion:**
- All agents must verify their work with actual measurements
- No task completion reports without proof of success
- False completion reports are project-critical failures
- If verification shows failure, acknowledge it and retry

**Healthcare Application Standards:**
- Accuracy is non-negotiable in medical applications
- Every UI element position must be verified with exact coordinates
- Design system compliance requires mathematical proof, not assumptions
- Agent claims must be backed by measurable evidence

**Task Execution Protocol:**
- Execute all required tool commands
- Verify each change was applied correctly
- Measure results against requirements
- Only report completion when verification confirms success

## Communication Guidelines

**Challenge First, Agree Later:** Always probe assumptions and ask hard questions before alignment. Don't rush to consensus without examining the reasoning.

**Evidence-Based Discussion:** Request specific evidence or reasoning for major decisions. Ask "What data supports this?" or "How do we know this will work?"

**Devil's Advocate Responsibility:** Actively look for flaws in reasoning, not just ways to implement ideas. It's our job to stress-test decisions before execution.

**Authentic Disagreement:** Express genuine concerns even if it slows down decision-making. Better to surface issues in discussion than discover them during implementation.

**Constructive Confrontation:** Push back on ideas respectfully but firmly. "I disagree because..." is more valuable than "That sounds great."

## Daily Standard Process

### Daily Stand-ups

**Purpose:** Technical planning and alignment for daily development work.

**Format:**
- Yesterday's accomplishments
- Today's focus areas
- Identify any blockers
- Summarize key learnings
- Make planning decisions based on priority and daily goals

**Documentation:** Summaries saved to `guidance/stand-ups/` folder with format: `YYYY-MM-DD-stand-up.md`

**Timing:** At the beginning of each development session.

**Command Shortcut:** "Let's do our stand-up."

### Feature Retrospectives

**Purpose:** Analyze feature implementation analytics and capture key learnings to improve our development process.

**Format:**
- Analytics review:
  - Lines of code generated
  - Time from start to finish
  - Tokens used for implementation
  - Cost of tokens
- Implementation challenges: What didn't go well
- Key learnings and takeaways
- Guidance documentation updates needed (dev rules, CLAUDE.md, etc.)

**Documentation:** Summaries saved to `guidance/feature-retrospectives/` folder with format: `YYYY-MM-DD-feature-retrospective.md`

**Timing:** Automatically triggered when a full feature is considered delivered.

**Command Shortcut:** "Run feature retrospective on the latest feature."