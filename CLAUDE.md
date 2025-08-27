# Development Guidelines

## Philosophy

### Core Beliefs

- **Incremental progress over big bangs** - Small changes that compile and pass tests
- **Learning from existing code** - Study and plan before implementing
- **Pragmatic over dogmatic** - Adapt to project reality
- **Clear intent over clever code** - Be boring and obvious

### Simplicity Means

- Single responsibility per function/class
- Avoid premature abstractions
- No clever tricks - choose the boring solution
- If you need to explain it, it's too complex

## Process

### 1. Planning & Staging

Break complex work into 3-5 stages. Document in `IMPLEMENTATION_PLAN.md`:

```markdown
## Stage N: [Name]
**Goal**: [Specific deliverable]
**Success Criteria**: [Testable outcomes]
**Tests**: [Specific test cases]
**Status**: [Not Started|In Progress|Complete]
```
- Update status as you progress
- Remove file when all stages are done

### 2. Implementation Flow

1. **Audit Existing Work** - ALWAYS review what exists before creating anything new
2. **Understand** - Study existing patterns in codebase
3. **Test** - Write test first (red)
4. **Implement** - Minimal code to pass (green)
5. **Refactor** - Clean up with tests passing
6. **Export/Save** - Complete all deliverables (PNG exports, file saves)
7. **Commit** - With clear message linking to plan

### 3. Design & Mockup Work

**CRITICAL**: Special rules for UI/UX mockup creation:

1. **Audit Existing Designs** - ALWAYS check existing mockups/pages before creating new ones
2. **Use Consistent Grids** - Position elements using consistent spacing (400px between frames)
3. **Organize Properly** - Keep related screens on same page, use logical grouping
4. **Complete Before Moving On** - Finish entire screen including all elements
5. **Export Immediately** - Save PNG exports to appropriate folders before continuing
6. **Audit Completeness** - Verify all required screens exist before claiming completion
7. **No Overlapping Elements** - Use positive coordinates, avoid negative positioning

**Design File Organization**:
- Use existing pages when possible, don't create duplicates
- Group related screens logically (Onboarding Flow, Core Interfaces, etc.)
- Export all mockups as PNG files to `/guidance/mockups/` folder
- Document what's completed vs missing in reports

### 4. Task Execution Requirements

**CRITICAL**: Verification-first completion for all work:

**For UI/UX Design Tasks:**
1. Execute Frame0 tool commands as specified
2. Use get_page() or get_all_pages() to verify changes were applied
3. Measure exact positions of moved/created elements
4. Compare measurements to design system requirements
5. Only report completion when verification confirms success

**For All Tasks:**
1. Execute all required tool commands
2. Verify each change was applied correctly with appropriate tools
3. Measure results against specified requirements
4. If verification shows failure, acknowledge it and retry
5. Never report completion based on intended actions

**Never:**
- Report completion based on assumptions
- Claim success without measurable proof
- Assume tool commands worked without verification
- Skip verification steps to save time

### 5. When Stuck (After 3 Attempts)

**CRITICAL**: Maximum 3 attempts per issue, then STOP.

1. **Document what failed**:
   - What you tried
   - Specific error messages
   - Why you think it failed

2. **Research alternatives**:
   - Find 2-3 similar implementations
   - Note different approaches used

3. **Question fundamentals**:
   - Is this the right abstraction level?
   - Can this be split into smaller problems?
   - Is there a simpler approach entirely?

4. **Try different angle**:
   - Different library/framework feature?
   - Different architectural pattern?
   - Remove abstraction instead of adding?

## Technical Standards

### Architecture Principles

- **Composition over inheritance** - Use dependency injection
- **Interfaces over singletons** - Enable testing and flexibility
- **Explicit over implicit** - Clear data flow and dependencies
- **Test-driven when possible** - Never disable tests, fix them

### Code Quality

- **Every commit must**:
  - Compile successfully
  - Pass all existing tests
  - Include tests for new functionality
  - Follow project formatting/linting

- **Before committing**:
  - Run formatters/linters
  - Self-review changes
  - Ensure commit message explains "why"

### Error Handling

- Fail fast with descriptive messages
- Include context for debugging
- Handle errors at appropriate level
- Never silently swallow exceptions

## Decision Framework

When multiple valid approaches exist, choose based on:

1. **Testability** - Can I easily test this?
2. **Readability** - Will someone understand this in 6 months?
3. **Consistency** - Does this match project patterns?
4. **Simplicity** - Is this the simplest solution that works?
5. **Reversibility** - How hard to change later?

## Project Integration

### Learning the Codebase

- Find 3 similar features/components
- Identify common patterns and conventions
- Use same libraries/utilities when possible
- Follow existing test patterns

### Tooling

- Use project's existing build system
- Use project's test framework
- Use project's formatter/linter settings
- Don't introduce new tools without strong justification

## Quality Gates

### Definition of Done

- [ ] Tests written and passing
- [ ] Code follows project conventions
- [ ] No linter/formatter warnings
- [ ] Commit messages are clear
- [ ] Implementation matches plan
- [ ] No TODOs without issue numbers

### Test Guidelines

- Test behavior, not implementation
- One assertion per test when possible
- Clear test names describing scenario
- Use existing test utilities/helpers
- Tests should be deterministic

## Important Reminders

**NEVER**:
- Use `--no-verify` to bypass commit hooks
- Disable tests instead of fixing them
- Commit code that doesn't compile
- Make assumptions - verify with existing code

**ALWAYS**:
- Commit working code incrementally
- Update plan documentation as you go
- Learn from existing implementations
- Stop after 3 failed attempts and reassess