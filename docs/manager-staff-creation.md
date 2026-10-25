# Manager Add Employee

Root cause: Employee module access allows visibility, but EmployeeAdminView separately gates all add/edit controls on owner/admin role; production Firestore rules also restrict direct profile and membership creation to tenant administrators.

Managers with an active MANAGER membership, linked active manager profile, and an explicit EMPLOYEE role grant now see Add Employee in Staff Directory. The existing active store selector remains membership-scoped. Staff roles exclude owner/admin/manager labels. Existing edit/delete/role-management/manager-account, any-store mobility grants, and leave-balance administration remain owner/admin-only.

Creation uses `/api/employee-admin`, with revoked-token validation, membership-derived tenant, server-side Employee access check, and validation of the chosen active outlet against assigned outlets or explicitly granted allOutlets. The endpoint ignores injected identity, tenant, elevated scope and leave balance fields. No security-rule publication is required; direct client writes stay denied.

The trusted endpoint creates a new Auth identity compatible with existing staff PIN login, then atomically creates the crew profile, CREW membership, safe directory entry, and administration audit event. Existing PINs/accounts are never recovered or reassigned. Auth creation uniqueness also prevents concurrent reuse of the same PIN. On a failed profile commit it verifies whether the commit succeeded before cleaning up its new Auth identity; if the verification fails, it leaves the account for investigation rather than deleting an uncertain result. No real employee records or login accounts are created during automated checks.

PIN sign-in retains the existing global synthetic-email convention; PINs must remain globally unique across businesses. This change does not redesign that authentication system.

Verification: policy tests for explicit module grant, inactive/crew denial, linked-tenant mismatch, assigned and all-outlet scope, closed stores, cross-tenant stores, privileged role rejection and payload validation. Mocked endpoint tests verify auth/access rejection before provisioning, atomic profile/membership/directory/audit creation, duplicate PIN rejection and cleanup after a failed commit. Existing test suite, type check and production build also run. Actual authenticated staff creation must be verified using an authorised test account, not a real staff profile without approval.
