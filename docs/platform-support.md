# Platform support — first release

Platform administrators can select a business, inspect owner login/membership
diagnostics and outlet/subscription metadata, and explicitly request a Firebase
password-reset email to the linked owner. A separate Set owner password action
requires sign-in within five minutes, matching 12–128-character entries, and
explicit confirmation. It verifies revoked administrator tokens, resolves the
owner server-side, and rejects a stale owner UID supplied by the UI. Passwords
are sent only to Firebase Authentication, never included in audit documents,
logs or browser storage, and the form clears on submission/cancel/business change.
No workspace impersonation is implemented. Operational/HR records are not returned.

Direct changes write a PENDING audit before mutation, update Firebase Auth, revoke
refresh tokens, then mark completion. Partial failures distinguish a changed
password from a failed change. Revocation is NOT immediate termination of every
existing ID token: clients/endpoints without revocation checks can retain access
until token expiry. Real-account password changes were not exercised locally.

The existing server platform-admin gate protects both new actions. Reset
recipients are resolved from Firebase Auth using tenants.ownerUid, never a
client-supplied email. Active owner membership and matching active profile are
required. Requests are throttled per owner UID and recorded in server-only
platformSupportAudit; platformSupportResetLimits stores the last request time.
Existing default-deny database rules protect these new collections; no client
permission changes are requested. No production records were changed in testing.

Uses server VITE_FIREBASE_API_KEY for Firebase's standard PASSWORD_RESET email
endpoint. Confirm that the configured key belongs to the same Firebase project
as the service account and that Firebase reset templates/authorized domains are
correct. Provider acceptance does not confirm inbox delivery. Never log tokens,
passwords or reset links. Authenticated sandbox UI/email integration testing is
still required before release; no real reset email was sent during local checks.

Next phases: tenant consent and time-limited audited read-only support sessions,
then permission-accurate reproduction. These are not part of this implementation.
