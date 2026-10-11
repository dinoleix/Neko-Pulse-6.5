import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerResetEligible } from '../server/platformSupportPolicy.ts';
const owner = { email: 'owner@example.com', disabled: false };
const member = { active: true, personType: 'OWNER' };
const profile = { tenantId: 'test-cafe', active: true };
test('only an active linked owner may receive a reset', () => {
  assert.equal(ownerResetEligible(owner, member, profile, 'test-cafe'), true);
  assert.equal(ownerResetEligible(owner, member, profile, 'other-cafe'), false);
  assert.equal(ownerResetEligible({ ...owner, disabled: true }, member, profile, 'test-cafe'), false);
  assert.equal(ownerResetEligible({ ...owner, email: '' }, member, profile, 'test-cafe'), false);
  assert.equal(ownerResetEligible(owner, { ...member, active: false }, profile, 'test-cafe'), false);
  assert.equal(ownerResetEligible(owner, { ...member, personType: 'MANAGER' }, profile, 'test-cafe'), false);
  assert.equal(ownerResetEligible(owner, member, { ...profile, active: false }, 'test-cafe'), false);
  assert.equal(ownerResetEligible(owner, null, null, 'test-cafe'), false);
});
