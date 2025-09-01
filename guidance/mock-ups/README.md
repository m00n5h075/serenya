# Serenya UI/UX Mockups

**Current Status:** NO MOCKUPS EXIST - Starting fresh with improved design standards

## Quick Reference

- **🎯 NEW: Complete UI System:** `/guidance/docs/product/ui-specifications.md` (comprehensive design system)
- **Screen Requirements:** See complete-screen-inventory.md (if still needed)
- **Total Screens Needed:** 40 (20 MVP Critical, 12 Post-MVP, 8 Future)
- **Frame0 Project:** "Serenya Onboarding Flow" page ready
- **Current Progress:** 0/40 screens completed

## ⚠️ IMPORTANT UPDATE (September 1, 2025)

**UI/UX Design System Superseded**: The comprehensive design system below has been **replaced by the new domain-driven architecture**:

👉 **Use Instead**: `/guidance/docs/product/ui-specifications.md` 
- Complete component specifications with CSS implementations
- AI agent optimized for structured implementation  
- Cross-references to database, user flows, and API contracts
- Professional design system with 400+ lines of detailed specs

**Legacy Content Below**: The design system content in this file is **maintained for reference only** but should not be the primary source for UI/UX implementation.

## Design Standards Checklist

Before creating any mockup, ensure:

- [ ] **Text Containment**: All text fits within assigned containers
- [ ] **Mobile Constraints**: Works within 320-375px width
- [ ] **Touch Targets**: Minimum 44px height for interactive elements  
- [ ] **Consistent Spacing**: 24px margins, 16px between elements
- [ ] **Proper Positioning**: Use 400px spacing between frames
- [ ] **Export Required**: Save PNG to this folder immediately after creation

## Comprehensive Design System

### 1. Color System
**Primary Palette:**
- **Primary**: #2563EB (Medical blue) - main actions, active states, primary icons
- **Secondary**: #059669 (Trust green) - success, trust, final actions, positive confirmations
- **Error**: #DC2626 (Error red) - warnings, errors, critical alerts
- **Inactive**: #9CA3AF (Neutral gray) - disabled states, inactive progress indicators

**Text Colors:**
- **Text Primary**: #1F2937 (Dark gray) - main content, headers, titles
- **Text Secondary**: #6B7280 (Medium gray) - supporting text, descriptions, body content

**Background Colors:**
- **Frame Background**: #FFFFFF (White) - slide backgrounds
- **Button Fill**: Primary/Secondary colors based on action type
- **Icon Background**: Transparent (rely on stroke/fill colors)

### 2. Typography System
**Hierarchy (Mobile-First):**
- **Main Titles**: 26px (slide titles, page headers)
- **Section Headers**: 20px (feature titles, section breaks)
- **Emphasis Text**: 18px (button text, important labels, closing statements)
- **Body Text**: 16px (descriptions, content blocks)
- **Minimum**: 16px (accessibility requirement - never go below)

**Typography Rules:**
- All text must be ≥16px for accessibility
- Use consistent font weights within hierarchy levels
- Maintain proper contrast ratios (4.5:1 minimum)

### 3. Spacing System
**Hierarchical Spacing:**
- **Sub-component**: 8px - within tightly coupled elements (title→description, label→input)
- **Element**: 16px - between separate but related elements (feature→feature)
- **Component**: 20px - between major content blocks (features→closing, title→first feature)

**Layout Spacing:**
- **Outer margins**: 24px from frame edges
- **Icon-to-text**: 8px horizontal spacing
- **Vertical rhythm**: Follow spacing hierarchy consistently

### 4. Layout Standards
**Frame Specifications:**
- **Dimensions**: 320×690px (mobile-first)
- **Safe area**: 272px content width (320px - 48px margins)
- **Content positioning**: Relative to 24px margins

**Positioning Rules:**
- **Titles**: Anchored 48px from top edge (slides 2-6 get special treatment)
- **Interactive elements**: Anchored to bottom (progress + buttons)
- **Content flow**: Top-to-bottom following spacing hierarchy
- **Icon alignment**: Vertically aligned with their corresponding titles

### 5. Component Standards
**Icons:**
- **Size**: 24×24px standard
- **Color**: Primary (#2563EB) for functional, Secondary (#059669) for success/trust
- **Spacing**: 8px horizontal gap from text

**Buttons:**
- **Height**: 48px minimum (touch target requirement)
- **Width**: 272px (full content width)
- **Colors**: Primary for continue, Secondary for final actions
- **Text**: 18px (emphasis text)

**Progress Indicators:**
- **Size**: 12×12px dots
- **Colors**: Primary for active, Inactive gray for pending
- **Spacing**: 20px between dots

### 6. Content Structure Patterns
**Multi-Feature Layout (3-4 features):**
1. Title (Component spacing: 20px below)
2. Feature 1 (Icon + Title + Description)
3. Feature 2 (Element spacing: 16px above)
4. Feature 3 (Element spacing: 16px above)
5. Feature 4 (Element spacing: 16px above)
6. Closing statement (Component spacing: 20px above)
7. Interactive elements (anchored to bottom)

**Feature Component Structure:**
- Icon (24×24px)
- 8px horizontal gap
- Title (20px fontSize)
- 8px vertical gap (sub-component)
- Description (16px fontSize)

### 7. Implementation Checklist
Before creating any screen, verify:
- [ ] Typography sizes match hierarchy (26px/20px/18px/16px)
- [ ] Colors follow usage guidelines
- [ ] Spacing follows 8px/16px/20px hierarchy
- [ ] All text ≥16px (accessibility)
- [ ] Touch targets ≥44px height
- [ ] Content fits within 272px width
- [ ] Icons are 24×24px with 8px text gap
- [ ] Interactive elements anchored to bottom

## Current Frame0 Status

**Page:** "Serenya Onboarding Flow" (ID: Ie2J9QtYKb0vWz603gZrD)
**Content:** Empty - ready for design work
**Exports:** None - folder is empty

## MVP Priority Screens (Create First)

### Week 1-2: Legal Compliance & Safety
1. Onboarding Slides 1-6 (with disclaimers and consent)
2. AI Processing Failure Screen
3. Low Confidence Warning Screen
4. Medical Consultation Recommendation Screen

### Week 2-3: Authentication
5. Google SSO Login
6. Profile Setup (Basic + Health Context)  
7. Registration Completion

### Week 3-5: Core Value
8. File Upload Interface
9. Processing Status Screen
10. Dashboard/Timeline
11. Results Detail Views
12. AI Confidence Display

See complete screen inventory document for full list and business prioritization.

## File Organization

```
/guidance/mock-ups/
├── README.md (This quick reference)
└── [PNG files - exported immediately after creation]
```

## Process Requirements

1. **Audit First**: Check existing work before creating anything new
2. **Design & Validate**: Ensure mobile constraints and text containment
3. **Export Immediately**: Save PNG to this folder before moving to next screen
4. **No Overlaps**: Use consistent grid positioning to avoid element conflicts

**For Complete Requirements:** See `/guidance/docs/complete-screen-inventory.md`