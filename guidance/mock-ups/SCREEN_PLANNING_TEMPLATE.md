# Generic Screen Planning Template

Complete this planning phase BEFORE creating any screen elements to ensure design system compliance from the start.

## 1. Screen Overview
- **Screen Name**: [Descriptive name]
- **Screen Purpose**: [What user goal does this serve?]
- **Screen Type**: [Onboarding/Dashboard/Form/Error/Success/Settings/etc.]
- **Frame Dimensions**: 320×690px (mobile standard)

## 2. Content Audit
**Text Elements:**
- Main heading: "[text]"
- Subheadings: "[text]", "[text]"
- Body content: "[text]"
- Interactive labels: "[text]"
- Button text: "[text]"

**Visual Elements:**
- Icons needed: [list with purposes]
- Images/graphics: [if any]
- Interactive components: [buttons, inputs, toggles, etc.]

**Navigation Elements:**
- Progress indicators: [if applicable]
- Back/forward actions: [if applicable]

## 3. Typography Planning
Apply hierarchy consistently:
- **Main heading**: 26px (#1F2937)
- **Subheadings**: 20px (#1F2937)
- **Body text**: 16px (#6B7280)
- **Interactive text**: 18px (color based on purpose)
- **Labels**: 16px (#1F2937)

## 4. Color Application
**Icons**: 
- Functional: #2563EB (primary)
- Success/trust: #059669 (secondary)
- Warnings/errors: #DC2626 (error)

**Interactive Elements**:
- Primary actions: #2563EB background
- Secondary actions: #059669 background
- Disabled states: #9CA3AF

**Text Colors**:
- Headers: #1F2937 (primary text)
- Body content: #6B7280 (secondary text)

## 5. Spacing & Layout Strategy
**Content Flow** (top to bottom):
1. [Main element] - positioned at [Y coordinate]
2. [Next element] - [spacing type: 8px/16px/20px] below previous
3. [Continue for all elements...]

**Spacing Rules Applied**:
- Sub-component spacing: 8px (tightly coupled elements)
- Element spacing: 16px (related separate elements)  
- Component spacing: 20px (major content blocks)
- Outer margins: 24px from frame edges

## 6. Component Specifications
**Icons**: 24×24px, 8px horizontal gap from text
**Touch Targets**: Minimum 44px height for interactive elements
**Content Width**: Maximum 272px (within safe area)
**Interactive Elements**: Anchored to bottom when applicable

## 7. Design System Compliance Checklist
Before implementation, confirm:
- [ ] All typography follows hierarchy (26px/20px/18px/16px)
- [ ] All colors match usage guidelines
- [ ] All spacing follows 8px/16px/20px system
- [ ] All text ≥16px (accessibility compliance)
- [ ] All touch targets ≥44px height
- [ ] Content fits within 272px safe area
- [ ] No overlapping elements planned
- [ ] Layout works within 320×690px frame

## 8. Implementation Plan
**Creation Sequence**:
1. Create frame at [position]
2. Create elements in logical order (top to bottom)
3. Apply exact measurements from planning
4. Verify each element matches specifications
5. Export PNG immediately upon completion

**Success Criteria**:
All elements positioned exactly as planned with design system compliance verified through measurement, not assumption.

---

**Key Principle**: If you haven't planned exact positions and specifications, you're not ready to implement. Complete planning ensures first-time compliance.