import test from 'node:test';
import assert from 'node:assert/strict';
import { canCreateOutletStaff, staffCreationPayload, staffRoleAllowed } from '../server/employeeCreationPolicy.ts';
const member = { tenantId: 'one', active: true, personType: 'MANAGER', outletIds: ['B6'] };
const profile = { tenantId: 'one', active: true, role: 'Store Manager' };
const access = { EMPLOYEE: ['Store Manager'] };
const stores = [{ tenantId: 'one', outletId: 'B6' }, { tenantId: 'one', outletId: 'SFD' }, { tenantId: 'other', outletId: 'FOREIGN' }, { tenantId: 'one', outletId: 'CLOSED', isActive: false }];
const draft = { crewName: 'New Staff', crewCode: '123456', outletId: 'B6', role: 'Barista' };
const payload = (change = {}, membership = member) => staffCreationPayload({ ...draft, ...change }, membership, stores, ['Barista', 'Cook', 'Crew', 'Owner', 'Store Manager']);
test('manager needs active linked profile and explicit Employee module grant', () => {
  assert.equal(canCreateOutletStaff(member, profile, access), true);
  assert.equal(canCreateOutletStaff(member, { ...profile, role: ' store manager ' }, access), true);
  for (const m of [{ ...member, active: false }, { ...member, personType: 'CREW' }, { ...member, personType: 'OWNER' }, { ...member, tenantId: 'other' }]) assert.equal(canCreateOutletStaff(m, profile, access), false);
  assert.equal(canCreateOutletStaff(member, { ...profile, active: false }, access), false);
  assert.equal(canCreateOutletStaff(member, undefined, access), false);
  assert.equal(canCreateOutletStaff(member, profile, {}), false);
});
test('staff creation is constrained to assigned active outlets inside the tenant', () => {
  assert.equal(payload().outletId, 'B6');
  for (const outletId of ['SFD', 'FOREIGN', 'CLOSED']) assert.throws(() => payload({ outletId }));
  assert.equal(payload({ outletId: 'SFD' }, { ...member, outletIds: ['B6', 'SFD'] }).outletId, 'SFD');
  assert.equal(payload({ outletId: 'SFD' }, { ...member, allOutlets: true }).outletId, 'SFD');
  assert.throws(() => payload({ outletId: 'FOREIGN' }, { ...member, allOutlets: true }));
  assert.throws(() => payload({ outletId: 'CLOSED' }, { ...member, allOutlets: true }));
});
test('manager cannot create privileged roles or inject identity, scope or balances', () => {
  for (const role of ['Owner', 'Store Manager', 'Administrator', 'SUPER ADMIN', 'Assistant Manager', 'System Admin', '']) assert.equal(staffRoleAllowed(role), false);
  assert.throws(() => payload({ role: 'Owner' }));
  assert.throws(() => payload({ role: 'Unknown' }));
  const p = payload({ tenantId: 'other', authUid: 'owner', personType: 'OWNER', allOutlets: true, isMobile: true, leaveBalanceOverride: 999, active: false });
  assert.equal(p.tenantId, 'one'); assert.equal(p.active, true); assert.equal(p.isMobile, false);
  for (const key of ['authUid', 'personType', 'allOutlets', 'leaveBalanceOverride']) assert.equal(key in p, false);
});
test('PIN and optional fields are validated without arbitrary persisted input', () => {
  for (const crewCode of ['123', '1234567', 'abcd', '../owner']) assert.throws(() => payload({ crewCode }));
  assert.throws(() => payload({ dateOfBirth: '2026-02-31' }));
  assert.throws(() => payload({ photoUrl: 'javascript:alert(1)' }));
  assert.equal(payload({ dateOfBirth: '2000-04-12' }).birthMMDD, '04-12');
});
