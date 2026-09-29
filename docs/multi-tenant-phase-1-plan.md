# Neko Pulse multi-tenant plan — Phase 1

## Purpose

Prepare Neko Pulse to support more than one independent business without disrupting Green Neko's day-to-day operation. This document records the current architecture, the target tenant model, and the controlled rollout required before any production migration.

Phase 1 is planning and inventory only. It makes no Firebase, Vercel, GitHub, or production-data changes.

## Guardrails

- Green Neko remains the first tenant, with stable ID `green-neko`.
- Existing operational collections and document IDs are retained. The migration adds tenant ownership rather than replacing the database.
- No test business records may be placed in the current production collections before tenant-aware reads and security rules are live; the current app could otherwise display them to Green Neko users.
- Every authorization decision must be enforced by Firebase rules and trusted server routes, not only by hidden user-interface controls.
- Existing attendance, kiosk, tasks, training, leave, stores, and authentication must continue working during the transition.
- Firebase rules are a separate release from the Vercel application deployment.

## Current-state inventory

### Operational Firestore collections

| Data family | Current collection(s) | Tenant migration requirement |
| --- | --- | --- |
| Identity and access | `crew`, `crewDirectory`, `managers`, `roles`, `settings/accessConfig` | Add `tenantId`; introduce a tenant membership record for every authenticated user; stop treating a global manager or crew document as sufficient authorization. |
| Outlets and shifts | `stores`, `shifts`, `shiftAssignments`, `cafeHolidays` | Add `tenantId`; retain existing stable outlet IDs; validate outlet access from membership. |
| Attendance | `attendanceLogs`, `settings/attendanceConfig`, `settings/appConfig` | Add `tenantId`; tenant-scope kiosk configuration, attendance reads, and server-side kiosk writes. |
| Tasks and daily operations | `tasks`, `taskLogs`, `taskTemplates`, `validations`, `settings/taskConfig` | Add `tenantId`; tenant-scope every task query, task proof, validation, and template. |
| Training | `trainingModules`, `trainingAssignments`, `trainingAssessmentKeys`, `trainingAudit`, `trainingCertifications` | Add `tenantId`; preserve module, assignment, certification, and audit history IDs and versions. |
| People operations | `leaveRequests`, `eom_cycles`, `eom_scores`, `eom_votes`, `settings/hrConfig`, `settings/hrTemplates` | Add `tenantId`; scope manager reports and employee records. |
| Configuration and assets | `settings` documents, `recipeConfig`, `companyLogo` | Move tenant-owned configuration to tenant-specific configuration documents, while retaining a controlled legacy read path during migration. |

### Current configuration documents

The existing root `settings` collection includes: `companyLogo`, `accessConfig`, `appConfig`, `attendanceConfig`, `taskConfig`, `recipeConfig`, `hrTemplates`, and `hrConfig`.

These documents are global today. Their replacement model should be:

```
tenantSettings/{tenantId}/config/{settingName}
```

For example, Green Neko's attendance configuration becomes:

```
tenantSettings/green-neko/config/attendanceConfig
```

The application will use a compatibility reader during the migration, then retire root-setting reads only after the Green Neko configuration has been copied and verified.

### Firebase Storage paths

Current global paths include:

```
proofs/{fileName}
employees/{fileName}
recipes/{fileName}
stores/certs/{fileName}
hr_docs/{crewId}/{fileName}
training/{moduleId}/{fileName}
settings/{fileName}
```

New uploads must be namespaced:

```
tenants/{tenantId}/proofs/{fileName}
tenants/{tenantId}/employees/{fileName}
tenants/{tenantId}/recipes/{fileName}
tenants/{tenantId}/stores/certs/{fileName}
tenants/{tenantId}/hr_docs/{crewId}/{fileName}
tenants/{tenantId}/training/{moduleId}/{fileName}
tenants/{tenantId}/settings/{fileName}
```

Existing files will not be moved in Phase 1. The migration will keep controlled legacy-path access until each asset type has a verified migration strategy.

### Server routes requiring tenant context

| Route | Current data use | Required change |
| --- | --- | --- |
| `/api/kiosk-attendance` | Global stores, crew, attendance logs, and attendance settings | Resolve the kiosk's tenant before loading a store or recording attendance; validate the crew member belongs to that tenant and outlet. |
| `/api/training-video` | Global managers, training modules, assignments, and Storage paths | Verify tenant membership and assignment eligibility; issue access only to that tenant's module asset. |
| `/api/training-quiz` | Global assignments, module assessment keys, and training audit records | Tenant-scope the assignment, module, assessment key, result, and audit event. |
| `/api/parse-order` | No current operational document ownership | Keep stateless unless its result is saved; if persisted later, attach the active tenant ID. |

### Client application boundaries requiring tenant context

- Login/profile lookup currently resolves from global `crew` and `managers` records. It needs a membership lookup by authenticated UID before loading tenant data.
- `CurrentUser`, `CrewMember`, `Store`, task, attendance, training, leave, and configuration types do not currently carry `tenantId`.
- Existing reads of root collections such as `stores`, `crew`, `tasks`, `taskLogs`, `attendanceLogs`, `trainingAssignments`, and `trainingAudit` are not tenant-filtered.
- The configuration cache currently keys entries by `settings/{documentId}`. It must key tenant settings by tenant ID and setting name.
- Current kiosk device configuration stored locally must include the tenant ID so a configured device cannot silently switch businesses.
- Existing module access is based on global `settings/accessConfig`; it must become tenant configuration.

### Current indexes that need tenant-aware replacements

The following existing compound-query patterns need a leading `tenantId` field once client queries are tenant-scoped:

- `attendanceLogs`: `tenantId`, `crewId`, `timestamp`
- `leaveRequests`: `tenantId`, `crewId`, `appliedAt`
- `taskLogs`: `tenantId`, `outletId`, `completedAt`
- `validations`: `tenantId`, `validatedByCrewId`, `validatedAt`
- `trainingAssignments`: `tenantId`, `employeeUid`, `assignedAt`
- `trainingAudit`: `tenantId`, `employeeId`, `createdAt`

Exact index definitions will be generated from real Firestore query errors in the sandbox before production rules are changed.

## Target tenant model

### Tenant

```
tenants/{tenantId}
  name
  status                 // active, suspended, archived
  primaryOwnerUid
  timezone
  locale
  currency
  featureFlags
  createdAt
  updatedAt
```

Initial record:

```
tenants/green-neko
  name: Green Neko
  status: active
```

### Membership

```
tenantMemberships/{tenantId}_{uid}
  tenantId
  uid
  personType             // crew, manager, owner, administrator
  personId               // existing crew or manager document ID
  role
  outletIds              // stable outlet IDs; empty only for tenant-wide owners/admins
  active
  createdAt
  updatedAt
```

This collection is the initial authenticated-user lookup. A user with one active membership enters that tenant automatically. A user with more than one active membership will later receive a business switcher.

### Operational records

Every tenant-owned existing record receives:

```
tenantId: "green-neko"
```

This includes, at minimum, people, stores, shifts, attendance, tasks, task logs, leave, training modules, assignments, assessment material, audit events, certifications, and configuration-derived records.

Existing IDs remain unchanged, so historical links between assignments, logs, employees, training versions, and certifications remain intact.

## Permission model

Firebase rules and trusted Vercel routes will use tenant membership as the common authorization source.

- A signed-in user may read or modify a record only when the record's `tenantId` matches an active membership.
- Creates must validate `request.resource.data.tenantId` against active membership; tenant ownership cannot be supplied arbitrarily by the client.
- Outlet-scoped actions additionally require the outlet to be in `membership.outletIds`, unless the member is a tenant-wide owner or administrator.
- Owners and administrators may manage all outlets in their tenant, but never another tenant.
- Training certification and manager actions remain role-protected within the tenant; a manager cannot certify themselves.
- Legacy broad rules must be removed only after backfill, compatibility verification, and a tested cutover.

## Safe rollout plan

### Stage 0 — Baseline and recovery preparation

1. Export a read-only inventory of production collections, document counts, field shapes, storage prefixes, and Firebase indexes.
2. Create a Firestore export/backup and record its timestamp and recovery instructions.
3. Produce a migration ledger with one row per document family, expected count, backfilled count, failures, and verification query.
4. Confirm the current Green Neko user, outlet, kiosk, task, attendance, and training flows against production before change.

### Stage 1 — Sandbox implementation

1. Use a separate Firebase sandbox project and Vercel preview environment.
2. Add tenant types, membership resolution, tenant-scoped repositories, and tenant-aware server routes.
3. Seed only synthetic test data for Green Neko-like and second-tenant scenarios.
4. Test cross-tenant denial, outlet denial, kiosk attendance, training video/quiz access, task workflows, and phone sessions.

### Stage 2 — Production-compatible application release

1. Release tenant-aware code behind a feature flag, still reading legacy Green Neko records through a controlled compatibility layer.
2. Do not create a second tenant in production yet.
3. Verify that existing Green Neko workflows remain unchanged on desktop, crew phone, manager phone, kiosk, and server endpoints.

### Stage 3 — Green Neko backfill and access pilot

1. Write `tenants/green-neko` and active Green Neko membership records.
2. Backfill `tenantId: "green-neko"` in bounded, resumable batches without changing document IDs.
3. Copy settings into `tenantSettings/green-neko` and compare values before use.
4. Enable tenant-aware reads for a small owner-only pilot group first; compare results with legacy reads.
5. Expand to managers, crew, kiosk, and all Green Neko workflows only after verification.

### Stage 4 — Security cutover and second-tenant pilot

1. Deploy tested Firestore and Storage rules that require tenant membership.
2. Remove legacy global query fallbacks after all Green Neko records and settings are verified.
3. Create one controlled pilot tenant with a dedicated owner and synthetic test staff.
4. Validate that neither tenant can enumerate, read, write, download, or infer the other's data.

### Stage 5 — Operational readiness

1. Add tenant onboarding, tenant switching for multi-business owners, data retention, offboarding, and support tooling.
2. Document recurring tenant administration and incident-recovery procedures.
3. Enable new customer onboarding only after the pilot passes acceptance checks.

## Required verification

Before any production cutover, automated rules and application tests must prove:

- A crew member cannot read another tenant's people, attendance, tasks, training, settings, or files.
- A manager cannot access another tenant or an outlet outside their membership.
- Kiosk attendance rejects a crew member from a different tenant or outlet.
- Training video and quiz routes reject cross-tenant access and accept an eligible assigned crew member.
- Existing Green Neko attendance, task, authentication, training, leave, and role workflows continue working.
- Historical training results remain connected to their original module version and certification.
- Legacy records remain readable only during the controlled compatibility window.
- New tenant queries use tenant-leading indexes and do not produce unbounded/global reads.
- A production backfill can be resumed safely and reports exact success and failure counts.

## Phase 1 decisions recorded as defaults

- First tenant ID: `green-neko`.
- Collection strategy: retain current root operational collections and add `tenantId`; do not immediately move everything under `/tenants/{tenantId}/...`.
- Settings strategy: introduce `tenantSettings/{tenantId}/config/{settingName}` with a temporary compatibility reader.
- Asset strategy: namespace new uploads under `tenants/{tenantId}/...`; do not move existing assets until a verified migration pass.
- Testing strategy: use a sandbox Firebase project and Vercel preview for the second tenant and security tests before adding test-business data to production.
- Release strategy: feature-gated, reversible application rollout; explicit approval is required before production data migration or Firebase rule publication.

## Next Phase 1 deliverables

1. Produce the exact field-by-field migration ledger from the live schema export.
2. Identify every repository/service query and mutation in the codebase that needs a tenant context parameter.
3. Write the sandbox data-seeding and rules-test plan.
4. Draft the production backfill script design, dry-run report format, rollback conditions, and approval gate.

