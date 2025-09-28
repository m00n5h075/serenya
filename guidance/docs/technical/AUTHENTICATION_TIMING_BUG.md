# Authentication Timing Bug - PERMANENT FIX DOCUMENTATION

## Issue: Infinite Loading After OAuth Success

**Symptom**: After Google OAuth completes successfully, app gets stuck in infinite loading state instead of showing PIN setup dialog.

**Root Cause**: Calling `completeAuthentication()` too early causes router to recreate and dispose the `OnboardingFlow` widget before PIN dialog can appear.

## Critical Code Locations

### ❌ WRONG - Do NOT call completeAuthentication() here:
**File**: `lib/screens/onboarding/onboarding_flow.dart`  
**Method**: `_completeOnboarding()`  
**Why Wrong**: This runs immediately after OAuth, before PIN setup

### ✅ CORRECT - Call completeAuthentication() here:
**File**: `lib/screens/onboarding/onboarding_flow.dart`  
**Method**: `_showPinSetupDialog() -> PinSetupDialog.onSetupComplete`  
**Why Correct**: This runs after user successfully sets up PIN

## Sequence That Must Be Maintained

1. **OAuth Success** → `startAuthentication()` (locks router)
2. **PIN Dialog Shows** → User enters PIN
3. **PIN Setup Complete** → `completeAuthentication()` (unlocks router)  
4. **Router Redirect** → User goes to home

## Regression Prevention

- **Code Comments**: Explicit warnings in critical sections
- **Defensive Coding**: Commented out wrong calls with explanations  
- **This Document**: Permanent reference for future developers

## Fixed Dates
- **First Fix**: 2025-09-26 (commit f21809c - BROKEN implementation)
- **Second Fix**: 2025-09-26 (this fix - CORRECT implementation)

## Testing
To verify fix works:
1. Complete onboarding with Google OAuth
2. Verify PIN dialog appears (not infinite loading)
3. Complete PIN setup  
4. Verify redirect to home screen

If you see infinite loading after OAuth, this bug has regressed again.