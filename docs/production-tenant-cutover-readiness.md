# Green Neko production tenant cutover readiness

## Purpose and safety boundary

This is the execution gate for moving the live Green Neko application from the
legacy global-data model to the tenant-aware model.

This document is preparation only. It does **not** authorize any production
Firestore, Storage, Firebase Authentication, Vercel, or application change.
No production data may be written and no production rules may be published
until the Operations Owner explicitly approves the named cutover plan and
change window.

The target tenant is fixed as `green-neko`. Existing collection paths and
document IDs stay in place. The migration is additive: it adds `tenantId` and
membership/configuration records without deleting or moving historical records.

## What “100% credit” means

100% means every required gate below has a dated artifact and a named owner.
It does not mean the sandbox is working, nor merely that a Vercel deployment
is `Ready`. A failed, skipped, or unverified gate means the cutover is not
approved.

| Gate | Required proof | Current preparation state |
| --- | --- | --- |
| Source baseline | Clean committed candidate, pinned commit SHA, package checks pass | Sandbox candidate is available; production candidate must be pinned before the window. |
| Recovery | Fresh Firestore export, timestamp, storage location, restore owner, restoration drill instructions | A historical export exists; a fresh pre-window export and restoration owner are still required. |
| Production inventory | Read-only report with every top-level collection, document count, tenant-field state, settings comparison, and identity exceptions | Required; run a fresh production dry-run before approval. |
| Identity plan | One validated active Auth UID per active crew/manager; outlet scope and `allOutlets` reviewed | Required; do not guess missing or duplicate UID mappings. |
| Data backfill | Bounded, idempotent collection-by-collection report with expected, updated, compliant, conflict, and failure counts | Required; no write has been authorized. |
| Query/index review | Every tenant-aware query tested with real production-shaped data; all required composite indexes `Ready` | Sandbox coverage exists; production index checklist is still required. |
| Security rules | Candidate Firestore and Storage rules compile, pass emulator checks, and prove own/cross-tenant plus own/cross-outlet denials | Sandbox rules are tested; production-rule parity and a compatibility window must be reviewed. |
| Core workflows | Owner, outlet manager, crew, kiosk, attendance, tasks, training/video/quiz, leave, and manager actions tested | Sandbox flows are tested; production acceptance is still required. |
| Trusted routes | Kiosk attendance, training video/quiz, and membership-management routes verify tenant and outlet server-side | Sandbox behavior is tested; production environment review is still required. |
| Operational cutover | Change window, observer, decision owner, stop conditions, rollback flag, and communication are scheduled | Required. |
| Post-cutover acceptance | Live checks on desktop, manager phone, crew phone, and each kiosk; error/log monitoring; sign-off | Required after cutover. |

## Production dry-run procedure

Run the existing migration tool against the production project in its default
read-only mode. It refuses writes unless all write safeguards are supplied.

```sh
PULSE_SERVICE_ACCOUNT_PATH=/secure/production-service-account.json \
  node scripts/migrateTenantData.mjs --mode=dry-run --tenant=green-neko
```

Store the generated `migration-report.json` with the cutover record. Before a
write is considered, the report must show all of the following:

- every live operational collection is present in the ledger;
- no conflicting tenant IDs;
- all active identities have exactly one valid Firebase Auth UID;
- every active crew member and manager has a valid outlet assignment, except
  explicitly tenant-wide owners, administrators, or managers with
  `allOutlets: true`;
- source and destination tenant configuration values have been compared;
- retired collections are explicitly retained as archive, rather than silently
  included or deleted.

The current tool treats `recipes`, `bluebook_items`, and
`managerRecurringAgenda` as retained, unchanged archives. Recipes are outside
this cutover unless a separately approved retention decision changes that
scope. `conversationStatus` and `tableMonitoring` were removed from production
on 3 October 2026 and must not be reintroduced into migration scope.

## Fresh production inventory — 30 September 2026

The following results were produced by read-only runs against
`order-accuracy-ce844`. No production document was written.

### Clear checks

- 21 active, unambiguous identity mappings were found: 17 crew, 3 managers,
  and 1 owner. There were no missing or duplicate Firebase Auth UID mappings.
- Green Neko tenant configuration and crew-directory copies already exist.
- 19 operational collection families, training-module versions, and all
  existing stores, people, task definitions, training records, and settings
  scanned without a conflicting tenant ID.
- At the time of this inventory, the Recipe, Blue Book, Counter Conversations,
  Manager Meetings, and table-monitoring collections were excluded and
  unchanged. Counter Conversations and tableMonitoring were subsequently
  removed from production on 3 October 2026.

### Blocking discrepancy

65 records created after the earlier backfill are missing `tenantId`. They are
not safe to include in tenant-only reads until a final bounded backfill has
been approved and verified:

| Collection | Current count | Missing `tenantId` | Previously compliant |
| --- | ---: | ---: | ---: |
| `shiftAssignments` | 2,897 | 14 | 2,883 |
| `attendanceLogs` | 2,804 | 9 | 2,795 |
| `taskLogs` | 7,381 | 29 | 7,352 |
| `loginLogs` | 26 | 13 | 13 |

This is expected while production continues using the legacy compatibility
write path: new operational activity remains live, but does not yet attach a
tenant value. The cutover candidate therefore needs a compatibility dual-write
mode that attaches `green-neko` to new operational records **without** enabling
tenant-only reads or publishing restrictive rules. That candidate must be
rehearsed in sandbox, then released and observed before the final dry-run and
approved cutover window.

## Required migration ledger

The dry-run report must be converted into a reviewed ledger before the window.
Each row needs the exact production counts and a verifier signature.

| Family | Required action | Verification |
| --- | --- | --- |
| `crew`, `managers`, `roles`, `stores` | Add `tenantId`; create validated memberships | Count parity, Auth UID mapping, outlet scope |
| `shifts`, `shiftAssignments`, `cafeHolidays` | Add `tenantId` | Outlet-scoped manager and crew reads |
| `attendanceLogs`, `leaveRequests` | Add `tenantId` | Crew self-read, manager outlet read, kiosk write |
| `tasks`, `taskLogs`, `taskTemplates`, `validations` | Add `tenantId` | Daily task creation/completion/validation |
| Training collections and module versions | Add `tenantId` without changing historical IDs | Assignment, video/quiz, certification, audit history |
| `eom_cycles`, `eom_scores`, `eom_votes`, `managerActions`, `loginLogs` | Add `tenantId` | Manager reports and audit access |
| Root settings | Copy selected values to `tenantSettings/green-neko/config/*` | Field-by-field comparison and controlled compatibility read |
| `crewDirectory` | Copy to tenant settings directory | Crew login lookup and record parity |

Any collection discovered in production but missing from the ledger stops the
write phase until it has a documented ownership decision.

## Candidate cutover sequence

1. Freeze the release candidate and record its Git SHA. Run lint, tests, and
   production build from that exact SHA.
2. Take a fresh Firestore export and record the bucket path, timestamp, and
   restoration owner. Confirm the export is complete before proceeding.
3. Run the production dry-run and resolve every identity exception, count
   discrepancy, unknown collection, tenant conflict, and configuration
   difference.
4. Review the exact production Firebase client/server environment values. The
   production application must point only to the production Firebase project;
   sandbox variables and sandbox service accounts must not be present.
   For the compatibility dual-write release, set both
   `VITE_LEGACY_TENANT_ID=green-neko` (client writes) and
   `LEGACY_TENANT_ID=green-neko` (trusted kiosk-attendance writes). These
   values add tenant ownership to new records only; they must not set
   `VITE_TENANT_MODE=enabled` or `TENANT_MODE=enabled`.
5. Rehearse the same collection scope in sandbox from the final candidate SHA.
   Produce the same ledger and acceptance evidence.
6. Publish the tenant-aware application in compatibility mode only. Confirm
   existing Green Neko traffic still uses the proven legacy read path.
7. During the approved window, apply the migration in bounded named collection
   scopes. After each scope, run `--mode=verify` and reconcile its counts with
   the dry-run report before moving on.
8. Create `tenants/green-neko`, `tenantMemberships`, tenant configuration, and
   required indexes only when their prerequisite ledger entries are approved.
9. Publish the reviewed Firestore and Storage rules, then enable tenant-aware
   reads for an owner-only pilot. Do not expose another tenant in production.
10. Expand acceptance to managers, crew, and kiosk devices only after the
    owner pilot passes. Keep the compatibility route during the monitoring
    period.

## Stop and rollback rules

Stop immediately if any write reports a conflict, a count differs from the
approved ledger, a login cannot resolve a valid membership, a tenant query
requires an unprepared index, or a core operational workflow fails.

The first response is to disable the tenant-aware application feature flag and
return to the proven compatibility read path. Do **not** remove `tenantId`
fields, memberships, or copied settings during an incident. Preserve the
evidence, stop further batches, and use the export only under a separately
approved recovery procedure.

## Explicit approvals still needed

Before the actual cutover, the Operations Owner must separately approve:

1. the production dry-run using the production service account;
2. the exact ledger and any exception handling;
3. the named production migration collection scopes and change window;
4. production Firebase Firestore and Storage rule publication;
5. enabling the tenant-aware feature flag; and
6. any production restoration, should it become necessary.

## Acceptance script

The named verifier must sign off on each result below after the actual
cutover:

- Green Neko owner sees both active outlets and no other tenant.
- Outlet-scoped manager sees only assigned outlets; an authorised
  `allOutlets` manager sees every Green Neko outlet but no other tenant.
- Crew sees only their own profile, attendance, tasks, and training.
- Each physical kiosk remains locked to `green-neko` and its configured outlet.
- An eligible crew member can play assigned training video and take an eligible
  quiz; an ineligible or cross-tenant request is denied.
- Task creation, completion, proof, validation, leave, attendance, and manager
  reports continue working.
- Firestore and Storage rules deny cross-tenant document, query, and media
  access.
- Browser sessions on desktop and iPhone receive the release without serving a
  stale application bundle.
