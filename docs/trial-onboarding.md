# Trial onboarding and illustrated user guide

Activation provisions the existing tenant, owner membership and outlets. It
then attempts a transactional welcome email. Email failure does not undo the
workspace. ACCEPTED means provider acceptance, not inbox delivery.

## Configuration before release

- Choose/approve Resend as the mail provider and verify a sending domain.
- Server-only RESEND_API_KEY, TRIAL_EMAIL_FROM (verified sender), APP_PUBLIC_URL
  (trusted HTTPS app URL, not the marketing URL).
- Existing SELF_SERVICE_SIGNUP_ENABLED must be deliberately enabled.
- Firebase Authentication must allow the app domain for email-verification
  continuation URLs; configure branded verification templates separately.
- Never use VITE_ prefixes for email secrets. No production settings changed.

No scheduled trial reminders or delivery-webhook tracking are implemented.
Failed emails are recorded on trialOnboarding for operator review; automated
retry/outbox processing is a follow-up. Resend idempotency keys reduce duplicate
sends within the provider's retention window.

Setup checklist progress is manual, browser-local and scoped by tenant + owner
UID. It is not an operational readiness assessment, is not shared across devices,
and may disappear if browser storage is cleared. No new database rules required.

The public PDF at /guides/neko-pulse-user-guide.pdf contains only instructional
content and fictional demo records. It is intentionally accessible without login.
The activation screen and owner checklist offer view/download links. The welcome
email includes the same guide URL once the sender is configured.

To regenerate the PDF, install ReportLab and run python3 scripts/build_user_guide.py.
The sanitised source screenshots live in docs/guide/screens. Screenshot-only Vite
configuration: scripts/guide.vite.config.ts; it replaces Firebase with a read-only
fictional adapter. It is not used by the normal development or production build.

## Verification

Run type-check/build, existing training tests and tests/trialWelcome.test.mjs.
Before release: test complete signup using a disposable sandbox account, email
verification, activation and provider delivery; check home-screen installation
on a real iPhone and Android. Do not test signup against live data without approval.

Local release checks passed: type-check, 9 unit/regression tests, Vite build,
PDF page-count/text checks, visual review and local PDF HTTP serving. Full signup,
inbox delivery and real-device installation remain unverified; no records were
created as part of guide preparation. Activation retries return the authenticated
owner's existing trial details without reprovisioning or resending the email.

References: https://resend.com/docs/api-reference/emails/send-email
https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios
https://support.google.com/chrome/answer/9658361
