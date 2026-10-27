---
name: mobile-audit
description: Audits mobile native apps (React Native, Expo, iOS, Android) for security vulnerabilities, OWASP MASVS compliance, Apple App Store Review Guidelines, and Google Play Store policies. Use whenever preparing for store submission, auditing permissions, evaluating security risks, or validating pre-flight build readiness.
---

# Mobile Native App Audit & Store Compliance Skill

This skill provides an automated, standardized protocol to audit mobile native applications across the MaskPro ecosystem (MaskPro Care, GAQ, GetSales) for **security vulnerabilities**, **OWASP MASVS compliance**, **Apple App Store Review Guidelines**, and **Google Play Policies**.

---

## 1. When to Trigger This Skill

Execute this skill whenever:
- Preparing a mobile build for submission to **Apple App Store Connect** or **Google Play Console**.
- Performing security, permission, or vulnerability audits on native mobile apps.
- A user asks if the app is "ready for production", "safe to submit", or "has any policy violations".
- Adding or modifying native modules, plugins, or OS-level permissions in `app.json` / `AndroidManifest.xml` / `Info.plist`.

---

## 2. The 6-Pillar Audit Checklist

Every audit MUST evaluate all 6 pillars before declaring an app ready for submission:

### Pillar 1: OS-Level Permission Hardening & Elimination
- **Zero Extraneous Permissions:** Verify the app does NOT request permissions it does not actively use.
  - ⚠️ *Common Gotcha:* `expo-image-picker` bundles video recording by default, which injects `android.permission.RECORD_AUDIO` (microphone). In `app.json`, you MUST explicitly configure:
    ```json
    ["expo-image-picker", { "microphonePermission": false }]
    ```
    and add `android.blockedPermissions: ["android.permission.RECORD_AUDIO"]`.
  - Remove unnecessary Location (`ACCESS_FINE_LOCATION`), Contacts (`READ_CONTACTS`), SMS, or Storage permissions if only photos are selected.
- **Apple Purpose Strings (`Info.plist`):**
  - Ensure every hardware/privacy permission has a descriptive, user-facing reason in `app.json` under `ios.infoPlist`:
    - `NSCameraUsageDescription` (Must explain *why* camera is needed, e.g. "take photos for vehicle damage reports").
    - `NSPhotoLibraryUsageDescription` (Must explain *why* photo access is needed).
  - ❌ *Rejection trigger:* Generic strings like "App needs photos" are rejected under Apple Guideline 5.1.1.

### Pillar 2: Apple App Store Review Guidelines
- **Guideline 2.1 — App Review Demo Credentials:**
  - Reviewers in the US/India cannot receive local Philippine carrier SMS OTPs.
  - **Requirement:** Maintain a dedicated test account (e.g. `09852779777`) with a fixed OTP (e.g. `777777`) that bypasses SMS gateways and rate limits on the live production API.
- **Guideline 5.1.1(v) — Account Deletion:**
  - If users can create/login to an account, the app **MUST provide an in-app account deletion flow**.
  - Must delete/anonymize user data and terminate the session.
  - ❌ *Rejection trigger:* Simply having a "Logout" button without "Delete Account" causes instant rejection.
- **Guideline 2.3 — Accurate Metadata & Clean Copy:**
  - No competitor mentions on iOS (never mention "Android" or "Google Play" in iOS copy or release notes).
  - No placeholder text (*Lorem Ipsum*, *TODO*, *test text*).
  - Active public links: Support URL, Marketing URL, Privacy URL, Terms URL.
- **Guideline 3.1.1 — In-App Purchases vs Physical Services:**
  - Physical services (auto detailing, branch appointments, physical goods) are exempt from Apple In-App Purchase (IAP) and use external/branch payments.
  - Digital features (subscriptions, digital currency, virtual unlocks) must use StoreKit.

### Pillar 3: Google Play Store Policy Center
- **Data Safety Declarations:**
  - Verify every collected data point (e.g., name, phone number, vehicle details, photos) maps to the Data Safety form in Google Play Console.
  - Declare whether data is encrypted in transit (HTTPS enforced).
- **Target API Level:**
  - Ensure build targets the latest Android API level (API 34/35 required by Google Play for new releases).
- **Account Verification & Testing Status:**
  - Legacy developer accounts (created before Nov 13, 2023) are exempt from the 20-tester / 14-day closed testing requirement.
  - New personal accounts must complete closed testing before production track release.

### Pillar 4: OWASP MASVS & Security Auditing
- **No Hardcoded Secrets (Gitleaks / TruffleHog):**
  - Verify client JavaScript bundles do NOT contain backend JWT secrets, database credentials, or private payment gateway keys.
  - Client apps must only store public endpoints (`EXPO_PUBLIC_API_URL`).
- **Encrypted Local Storage:**
  - Auth tokens and sensitive tokens MUST be stored using `expo-secure-store` (iOS Keychain / Android Keystore), NEVER unencrypted `AsyncStorage`.
- **Network Security:**
  - All API traffic must enforce HTTPS/TLS 1.2+ (`https://care.maskpro.ph`). No cleartext HTTP endpoints.
- **SQL Injection & Backend Ownership:**
  - Backend API endpoints must verify `customer_id` / ownership on every request and use parameterized SQL queries (`?` placeholders).

### Pillar 5: Store Asset Compliance
- **App Icons:**
  - Apple App Store: `icon.png` MUST be **1024×1024 solid 24-bit RGB PNG** (NO alpha channel / transparency).
  - Android: `adaptive-icon.png` must have key graphic elements centered within the **60% safe zone** (inner 660px of 1024px canvas) so circular or squircle masking does not clip branding.
- **Launch Screen / Splash:**
  - Centered high-resolution splash icon with branded background color matching `app.json`.

### Pillar 6: Native Engine & Dependency Health (Expo Doctor)
- Run `npx expo-doctor` in the mobile directory to verify:
  - All native libraries match the installed Expo SDK version.
  - No duplicate React or React Native packages in `node_modules`.
  - New Architecture (`newArchEnabled`) compatibility.
- Run `npx tsc --noEmit` to ensure zero TypeScript compilation errors.

---

## 3. Standard Audit Execution Protocol

When requested to perform an audit:

1. **Check Manifest & Config:**
   ```bash
   cd mobile && npx expo config --type public
   ```
   Inspect `infoPlist`, `permissions`, and `blockedPermissions`.

2. **Run Dependency Diagnostics:**
   ```bash
   cd mobile && npx expo-doctor
   cd mobile && npx tsc --noEmit
   ```

3. **Verify Reviewer Test Credentials:**
   ```bash
   curl -s -X POST https://<domain>/api/auth/verify \
     -H "Content-Type: application/json" \
     -d '{"mobile":"09852779777","otp":"777777"}'
   ```
   Ensure it returns HTTP 200 and a valid token.

4. **Verify Public Policy URLs:**
   ```bash
   curl -sk -o /dev/null -w "%{http_code}" https://<domain>/privacy
   curl -sk -o /dev/null -w "%{http_code}" https://<domain>/terms
   ```
   Ensure both return HTTP 200 without authentication.

5. **Generate an Audit Certificate:**
   Summarize the results in a 6-pillar score card showing Pass / Action Required for each pillar.
