---
name: mobile-ux
description: Comprehensive mobile app UI/UX design and interaction standard covering modal error prompts, thumb-zone hierarchy, tactile feedback, form validations, and Apple HIG / Material 3 accessibility. Trigger whenever designing, reviewing, or refactoring mobile app screens, error flows, dialogs, and interactive components.
---

# Mobile App UI/UX Design & Interaction Standard

> **Core Philosophy:** Mobile screens are small, dynamic, and thumb-driven. Users must never be left wondering what happened, forced to hunt for error messages scrolled offscreen, or subjected to raw developer error jargon.

---

## 1. Error Presentation & Feedback Architecture (CRITICAL)

### ❌ Anti-Patterns to Eliminate:
- **No Inline Top Banners for Action Failures:** Do NOT push form inputs down with red warning boxes at the top of a scrollable view. When a user taps a button at the bottom of the screen, they will not see an error banner that appeared offscreen at the top.
- **No Raw Developer Error Strings:** NEVER show `AxiosError`, `Request failed with status code 500`, SQL errors, or stack traces in the UI. Always sanitize errors into friendly, actionable human language.
- **No Conflicting Double Toasts:** Avoid firing both an inline error banner AND a bottom toast simultaneously.

### ✅ Modern Modal Prompt Dialog Pattern:
For critical action failures (submission errors, upload failures, permission rejections, deletion confirmations):
1. **Modal Alert Dialog:**
   - Dims the background with a smooth dark overlay (`rgba(0,0,0,0.5)`).
   - Pops up centered (or slides as an accessible bottom sheet).
   - Features a clean semantic icon badge (e.g. rounded red/amber circle with warning icon).
   - **Clear Title:** Concise 2-4 words (e.g., "Photo Upload Failed", "Unable to Submit Booking").
   - **Human Explanation:** Friendly sentence explaining what went wrong and how to proceed (e.g., "We couldn't upload your vehicle photo. Please ensure the file is under 10MB and try again.").
   - **Primary Action Button:** Full-width, high-contrast button labeled "Try Again", "Got It", or "Dismiss" (minimum 48pt height).

### ✅ Form Validation Micro-Feedback:
- Field-specific errors must appear directly **beneath the offending input field**, highlighted with red border and micro-copy, NOT bundled into a banner on top.

---

## 2. Thumb Zone & Reachability Hierarchy
- **Bottom 1/3 (Prime Reach Zone):** Place primary calls to action (CTAs), tab navigations, and confirmation buttons here.
- **Middle 1/3 (Comfort Zone):** Secondary cards, primary content reading, form fields.
- **Top 1/3 (Awareness Zone):** Static titles, search icons, non-interactive headers.

---

## 3. Touch Target & Accessibility Rules
- **Minimum Target Size:** Every interactive touchable (`TouchableOpacity`, button, icon) must have at least **44x44 pt** bounding box (`hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}` when visual icon is smaller).
- **Color Contrast:** Text and icons must satisfy WCAG AA contrast (minimum 4.5:1 ratio for normal text, 3:1 for large text and key graphics).
- **No Tiny Status Dots:** Use full-color background badges or clear pills for status indicators so elderly and visually impaired users can identify status at a glance without squinting.

---

## 4. Visual Feedback & Native Micro-Interactions
- **Immediate Response:** Every button press must provide immediate feedback (`activeOpacity={0.7}`, subtle scale, or loading spinner inside the button).
- **Skeleton / Non-Jarring Loaders:** Use skeleton cards or clean centered loaders rather than blank screens or layout shifts.
- **Keyboard Handling:** Forms must use `KeyboardAvoidingView` with `keyboardShouldPersistTaps="handled"` so inputs never get obscured by the virtual keyboard.
