import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerResetEligible, passwordChangeError } from '../server/platformSupportPolicy.ts';
const owner = { email: 'owner@example.com', disabled: false };
const member = { active: true, personType: 'OWNER' };
const profile = { tenantId: 'test-cafe', active: true };
test('direct password change requires recent authentication and matching strong-length password', () => {
  const password = 'Example-test-only-26';
  assert.equal(passwordChangeError(password, password, 900, 1000), null);
  for (const time of [undefined, 699, 2000, NaN]) assert.ok(passwordChangeError(password, password, time, 1000));
  assert.ok(passwordChangeError('short', 'short', 900, 1000));
  assert.ok(passwordChangeError(password, 'different', 900, 1000));
  assert.ok(passwordChangeError('a'.repeat(129), 'a'.repeat(129), 900, 1000));
});
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
