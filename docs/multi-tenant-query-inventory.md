# Neko Pulse multi-tenant query inventory

## Scope

This is the implementation ledger for the Phase 1 tenant migration plan. It records the current global access points that must accept an explicit tenant context before a second business can be safely introduced.

No code is changed by this inventory.

## Required implementation convention

All tenant-owned repository functions will receive a tenant context derived from the authenticated session, rather than accepting an arbitrary tenant ID entered by a screen.

```ts
type TenantContext = {
  tenantId: string;
  membershipId: string;
  role: string;
  outletIds: string[];
};
```

For every Firestore create, the service must write `tenantId`. For every collection query, it must start with `where('tenantId', '==', context.tenantId)`. Document-ID reads and updates must first verify that the record belongs to the context tenant in trusted code and Firebase rules.

## Identity, session, and access

| File / boundary | Current global behavior | Tenant-aware change |
| --- | --- | --- |
| `components/LoginView.tsx` | Finds `crew` and `managers` by auth UID globally. | Resolve active `tenantMemberships` by authenticated UID first, then load the matching tenant person record. Auto-select Green Neko for a single membership. |
| `App.tsx` | Restores the signed-in user from global crew/manager documents. | Restore the active membership and include `tenantId` in `CurrentUser`. |
| `services/accessService.ts` | Reads global roles and writes global `settings/accessConfig`. | Scope roles and module access configuration to the active tenant. |
| `services/configCache.ts` | Caches `settings/{documentId}` globally. | Read `tenantSettings/{tenantId}/config/{documentId}` and key cache entries by tenant ID. |
| `components/DynamicBranding.tsx` | Reads global company logo configuration. | Load branding from tenant settings. |
| `components/CrewLayout.tsx` | Watches a store by outlet ID without tenant restriction. | Require both tenant ID and outlet ID. |

## Workforce, roles, stores, and shifts

| File / boundary | Collections / Storage | Tenant-aware change |
| --- | --- | --- |
| `services/employeeService.ts` | `crew`, `crewDirectory`, `managers`, `roles`, `employees/...` | Add tenant ID on all person records; filter lists, lookups, writes, role management, and photos by tenant. Create/update a membership when a person receives authenticated access. |
| `services/storeService.ts` | `stores`, `settings/appConfig`, `stores/certs/...` | Tenant-scope stores and config; namespace certificates; use stable outlet IDs only inside a tenant. |
| `services/shiftService.ts` | `shifts`, `shiftAssignments`, `cafeHolidays`, `crew`, `leaveRequests` | Tenant-filter every schedule, person, holiday, and approved-leave query; validate assignment outlet membership. |
| `services/eomService.ts` | `eom_cycles`, `eom_votes`, `eom_scores`, `crew`, `crewDirectory` | Attach tenant ID to cycles, votes, scores, and candidate queries. Ensure vote IDs cannot collide across tenants. |
| `services/hrService.ts` | `crew`, `settings/*`, `hr_docs/...` | Tenant-scope employee documents, HR settings, logo and templates; namespace HR uploads. |

## Attendance and kiosk

| File / boundary | Collections | Tenant-aware change |
| --- | --- | --- |
| `services/attendanceService.ts` | `attendanceLogs`, `leaveRequests`, `shiftAssignments`, `crew`, `settings/attendanceConfig` | Filter all logs, leave, shifts, configuration, and person lookups by tenant; write tenant ID on new attendance and leave documents. |
| `modules/crew/attendance/AttendanceCrewView.tsx` | `crew`, `attendanceLogs` | Load and update only the signed-in member's tenant record and tenant attendance event. |
| `modules/admin/attendance/AttendanceAdminView.tsx` | `crew` | Scope admin employee updates to the current tenant. |
| `api/kiosk-attendance.ts` | `stores`, `settings/attendanceConfig`, `settings/appConfig`, `crew`, `attendanceLogs` | The kiosk configuration must contain tenant ID. Server code must scope the outlet, crew code, attendance settings, and write to that tenant. Crew codes must be unique at the policy level within a tenant, or kiosk requests must include a non-ambiguous outlet/tenant combination. |

## Tasks, operational logs, and orders

| File / boundary | Collections / Storage | Tenant-aware change |
| --- | --- | --- |
| `services/taskService.ts` | `tasks`, `taskTemplates`, `taskLogs`, `settings/taskConfig`, `crew`, `proofs/...` | Tenant-scope every task, template, log, configuration, employee list, and evidence upload. |
| `services/reportsService.ts` | `crew`, `shiftAssignments`, `attendanceLogs`, `taskLogs`, `tasks`, `cafeHolidays` | Tenant-filter report source queries before applying date and outlet filters. |
| `services/orderService.ts` | `validations`, root Storage object | Tenant-scope validation reads/writes/deletes and namespace uploaded order evidence. |
| `api/parse-order.ts` | No operational collection currently | Keep stateless; if parsing output is later persisted, require tenant ID from server-authenticated context. |

## Training

| File / boundary | Collections / Storage | Tenant-aware change |
| --- | --- | --- |
| `services/trainingService.ts` | `trainingModules`, module `versions` subcollection, `trainingAssignments`, `trainingAssessmentKeys`, `trainingAudit`, `trainingCertifications`, `training/...` | Attach tenant ID to all root and version documents; tenant-filter module/assignment/certification/audit queries; namespace videos and evidence. Deletion checks must be tenant-scoped. |
| `api/training-video.ts` | `managers`, `trainingModules`, `trainingAssignments`, Firebase Storage | Determine the caller's tenant membership before retrieving a module or assignment; return only the active tenant's asset path. |
| `api/training-quiz.ts` | `trainingAssignments`, `trainingModules`, `trainingAssessmentKeys`, `trainingAudit` | Verify assignment ownership and tenant before test submission; write tenant ID on audit records and results. |
| `services/protectedStorageService.ts` | Firebase Storage / training-video route | Accept tenant context and never build a cross-tenant Storage path client-side. |

## Other operational data

| File / boundary | Collections | Tenant-aware change |
| --- | --- | --- |
| `services/loginLogService.ts` | Login activity collection | Add tenant ID to login events and filter administrative log views by tenant. |
| `services/managerActionService.ts` | Management action collection | Add tenant ID to actions, filters, and writes. |
| `modules/admin/settings/SettingsAdminView.tsx` | Dynamic collection browser/editor | Must be redesigned as a tenant-restricted administration tool; it cannot query arbitrary root collections without strict tenant validation. |

## Security-rule work list

The present rules authorize primarily from global `crew` and `managers` records, and broad crew reads apply to many root collections. Before multi-tenant production cutover, rules need:

1. An `activeMembership(tenantId)` helper reading `tenantMemberships/{tenantId}_{uid}`.
2. A tenant ownership check on every read, query, update, and delete.
3. Create validation that checks the submitted `tenantId` against membership.
4. Outlet-level validation for attendance, shifts, tasks, training and manager operations.
5. Role-specific checks for administration, certification, and restricted settings.
6. Storage path checks that ensure the first tenant path segment matches active membership.
7. Removal of broad global fallbacks after the Green Neko cutover passes verification.

## Migration ledger fields

Every backfill batch will produce the following report, without deleting or replacing source records:

| Field | Meaning |
| --- | --- |
| Collection | Source collection or subcollection path |
| Tenant ID | Expected tenant ownership, initially `green-neko` |
| Candidate count | Documents selected before mutation |
| Updated count | Documents that received the expected tenant ID |
| Already compliant | Documents already carrying the expected tenant ID |
| Failed count | Documents not updated, with record IDs and errors |
| Reference checks | Downstream relationships verified after the batch |
| Operator and timestamp | Who ran the batch and when |

No batch may proceed to the next collection family while it has unexplained failures.

## Suggested implementation order

1. Add tenant and membership types plus an in-memory session context.
2. Create tenant-aware configuration and membership repositories.
3. Convert read-only store and crew lookups in the sandbox.
4. Convert attendance/kiosk and task workflows.
5. Convert training and protected video/quiz routes.
6. Convert HR, reports, orders, EOM, and administration tooling. Retired Recipe records are excluded and retained only as a migration/export archive.
7. Add tenant-aware Firestore indexes and rules tests.
8. Build the resumable Green Neko backfill tool with a dry-run report.
