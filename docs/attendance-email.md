# Daily attendance email

Location: Attendance & Leaves → Reports → Daily Attendance Email. Owner and Administrator memberships only; server verifies the active membership and linked active manager profile. The client cannot select a tenant or read the settings/delivery collections directly. Store managers and crew are denied by the API. Existing default-deny rules cover both new collections, so no new client grants are needed.

Save recipients (up to ten), selected active outlets (empty means all), and enabled flag. Current hosting uses a fixed daily 6–7am IST window (00:30 UTC cron with Hobby timing tolerance). Preview/send use saved configuration. Preview and daily email cover yesterday in the business timezone; all active staff appear, with separate leave/day-off/not-scheduled labels. Historical staff with scans still appear. Not Scanned reuses the existing helper. Complete sessions are summed, gaps excluded. Overnight sessions belong to check-in day. Missing, duplicate-in, checkout-only and cross-store anomalies require review; no hours are invented. Sessions longer than 24 hours require review.

## Deployment prerequisites

- No new indexes or rules changes required. History reads deterministic daily document IDs for the last five report days; leave exclusions filter tenant-scoped records in trusted logic.
- Configure server-only `RESEND_API_KEY`, verified `ATTENDANCE_EMAIL_FROM` (falls back to existing `TRIAL_EMAIL_FROM`), `CRON_SECRET`, and the existing Firebase service account.
- Vercel daily cron in vercel.json runs at 00:30 UTC, nominally 6am IST. Hobby may execute within the scheduled hour. Custom sending times require a different scheduler; the UI explicitly shows the fixed window.
- The platform does not backfill dates missed during an outage. Other timezones still use their local previous business date at this fixed UTC dispatch time.
- Only enable after preview and a deliberate test to approved recipients. Do not send emails or change real settings during automated verification.

## Reliability and privacy

Settings in `attendanceEmailSettings/{tenantId}` include updatedBy/updatedAt. Attempts in `attendanceEmailDeliveries/{tenantId}_{date}` (test has `_test`) contain actor, status, timestamps and a frozen payload for stable provider idempotency. Each recipient gets a private email. Transactions lease delivery for two minutes; provider idempotency protects same-day manual retries within 24 hours, and old ambiguous attempts require investigation. Provider acceptance does not confirm inbox delivery. Test attempts have a one-minute cooldown. Failed daily attempts can be retried with Send now that same report day; daily cron does not retry previous report days. No webhooks/bounce tracking are included. Delivery payloads contain attendance PII; add a retention policy before large-scale rollout. Current scheduler processes enabled tenants sequentially with a five-minute function budget; a queue is needed at larger scale.

Plain Vite cannot serve these API routes; use the full Vercel development runtime for integration testing. Automated tests cover calculations and policy, not live mail delivery or Firebase enforcement.
