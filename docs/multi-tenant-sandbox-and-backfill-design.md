# Neko Pulse multi-tenant sandbox and backfill design

## Purpose

Define how Neko Pulse will be tested with two isolated businesses and how Green Neko records will later receive `tenantId: "green-neko"` safely.

This document is a design only. It does not create a Firebase project, alter production records, publish rules, or deploy code.

## Sandbox environment

Use a separate Firebase project and a Vercel preview deployment. It must not share Firestore, Storage, Auth users, service-account credentials, or production configuration with Green Neko production.

### Required sandbox configuration

| Area | Requirement |
| --- | --- |
| Firebase project | New sandbox project dedicated to Neko Pulse multi-tenant testing. |
| Vercel environment | Preview environment with Firebase client settings and server credentials for the sandbox only. |
| Authentication | Synthetic owner, manager, and crew accounts only. Do not copy production passwords or staff identities. |
| Data | Seeded fixtures only: Green Neko-like tenant plus a second fictitious tenant. |
| Storage | Sandbox bucket containing non-sensitive sample proof, HR, recipe, and training-video files. |
| Rules | Candidate tenant-aware Firestore and Storage rules, tested with emulator rules tests before sandbox publication. |

### Minimum test tenants

```
green-neko-sandbox
  owner: owner.green-neko.test
  manager: manager.green-neko.test
  crew: crew.green-neko.test
  outlets: 94a, b6

pilot-cafe
  owner: owner.pilot.test
  manager: manager.pilot.test
  crew: crew.pilot.test
  outlet: main
```

The data must intentionally contain similar names, overlapping crew codes, and similarly named training modules. This proves isolation is based on stable `tenantId`, not names or accidental uniqueness.

## Acceptance scenarios

### Tenant isolation

- Green Neko sandbox crew can see only their own attendance, tasks, training, profile, outlet and configuration.
- Pilot Cafe crew cannot read or infer Green Neko record IDs, file paths, modules, assignments, or settings.
- An owner with memberships in both tenants can switch intentionally; the active tenant must be visible in the session state and every query.
- A manager assigned only to one outlet cannot read or alter the other outlet's data.

### Kiosk and attendance

- A kiosk configured for `green-neko-sandbox` / `94a` accepts a valid matching crew code.
- The same kiosk rejects a Pilot Cafe crew code even if the code text is identical.
- A tenant ID is retained in the kiosk device configuration and must be reset explicitly before changing tenant.

### Training

- An eligible assigned crew member can view their tenant's training video and submit their tenant's quiz.
- A crew member cannot request a signed training video URL for another tenant's module, even if they know its ID or Storage path.
- Training module versions, assignments, audit events, practical assessments, and certifications retain tenant IDs.
- Self-certification and cross-tenant certification are denied in UI, Vercel routes, and Firebase rules.

### Existing operations

- Tasks, proofs, attendance, leave, shifts, reports, recipes, HR documents, and manager actions retain the active tenant.
- A failed query due to a missing tenant index is recorded and resolved in sandbox before production deployment.

## Green Neko backfill design

### Preconditions

The following are required before any production write:

1. A Firebase export or verified backup with timestamp and restoration owner.
2. Candidate application code and rules passing sandbox acceptance scenarios.
3. A production dry-run report approved by the operations owner.
4. A scheduled low-risk window and a rollback decision owner.
5. Explicit approval to write Green Neko production records.

### Backfill scope

For existing Green Neko documents, add the field below without changing document IDs or relationship fields:

```json
{ "tenantId": "green-neko" }
```

The initial pass covers these collection families:

```
crew
crewDirectory
managers
roles
stores
shifts
shiftAssignments
cafeHolidays
attendanceLogs
leaveRequests
tasks
taskLogs
taskTemplates
validations
trainingModules
trainingModules/{moduleId}/versions
trainingAssignments
trainingAssessmentKeys
trainingAudit
trainingCertifications
eom_cycles
eom_scores
eom_votes
loginActivity
managerActions
recipes
```

Any discovered live collection not in this list must be added to the ledger before the write phase begins.

### Membership creation

Create one `tenantMemberships/green-neko_{uid}` document for every active authenticated Green Neko person. Its source mapping must be recorded:

| Membership field | Source |
| --- | --- |
| `uid` | Existing document ID when it matches Firebase Auth UID, otherwise validated `authUid`. |
| `personId` | Existing crew or manager document ID. |
| `personType` | Existing crew/manager role. |
| `role` | Existing access role or staff role. |
| `outletIds` | Existing assigned outlet, or all Green Neko active outlets only for tenant-wide owner/admin roles. |
| `active` | Existing active status. |
| `tenantId` | Constant `green-neko`. |

Documents with missing or ambiguous Auth UID are not guessed. They are listed as exceptions and remain on the legacy path until resolved.

### Resumable tool behavior

The future migration tool will require all of the following modes:

| Mode | Behavior |
| --- | --- |
| `dry-run` | Reads candidate documents, validates shapes and references, writes no Firestore document, and emits the ledger report. |
| `apply` | Processes a named collection family in bounded batches, adding tenant ID only when absent. |
| `resume` | Continues from the last verified checkpoint for that collection family. |
| `verify` | Re-reads the target family and compares candidate, updated, already-compliant, and failed counts. |

Each batch must be idempotent: rerunning it cannot create duplicates or overwrite a different tenant ID. A document already carrying `tenantId: "green-neko"` is reported as compliant; a document carrying any other tenant ID is an error and is never overwritten automatically.

### Checkpoint and report schema

The migration tool should write its local, non-production checkpoint/report artifact in this form:

```json
{
  "runId": "2026-09-29T120000Z-green-neko",
  "mode": "dry-run",
  "tenantId": "green-neko",
  "collection": "attendanceLogs",
  "cursor": "last-processed-document-id",
  "candidateCount": 0,
  "updatedCount": 0,
  "alreadyCompliantCount": 0,
  "failed": [],
  "startedAt": "timestamp",
  "completedAt": "timestamp"
}
```

The first production mutation must not start if dry-run failures, ambiguous identities, or unexplained count differences exist.

## Cutover and rollback conditions

### Cutover

Tenant-aware reads are enabled only after:

1. Backfill verification is complete for every required collection.
2. Tenant settings are copied and compared with current root settings.
3. The Green Neko owner verifies core flows on real desktop, crew phone, manager phone, and kiosk hardware.
4. The tested Firebase rules and tenant-leading indexes are ready.
5. The operations owner gives explicit approval to publish rules and enable the feature flag.

### Rollback

Do not delete added `tenantId` fields as an emergency response. Instead, disable the tenant-aware feature flag and return to the prior read path while preserving the additive migration fields for investigation. Firebase rules must retain the proven compatibility route until successful production verification is complete.

## Decisions recorded as defaults

- A person with memberships in several businesses receives an explicit business switcher.
- Crew codes are unique within a tenant; kiosks also include a locked tenant and outlet to prevent ambiguity.
- Existing Green Neko asset paths remain readable only through a temporary, verified compatibility route; new uploads use tenant-prefixed paths.
- A second business is tested in sandbox and Vercel preview before it is created in production.
