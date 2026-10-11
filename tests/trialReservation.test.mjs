import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTrialReservation, reservationConflict } from '../server/trialReservation.ts';
const input = { name: 'Test Cafe', slug: 'test-cafe', timezone: 'Asia/Kolkata', outlets: [{ name: 'Main', address: '' }] };
test('valid reservation normalizes data', () => { assert.deepEqual(validateTrialReservation(input), input); });
test('invalid timezone, empty and duplicate outlet names are rejected', () => {
  for (const change of [{ timezone: 'bad-zone' }, { outlets: [] }, { outlets: [{ name: '' }] }, { outlets: [{ name: 'Main' }, { name: 'MAIN' }] }]) assert.throws(() => validateTrialReservation({ ...input, ...change }));
});
test('active memberships and activated requests cannot be overwritten', () => {
  assert.ok(reservationConflict(null, true, input));
  assert.ok(reservationConflict({ ...input, status: 'ACTIVATED' }, false, input));
});
test('matching retries are idempotent and changed reservations are blocked', () => {
  const previous = { ...input, status: 'EMAIL_VERIFICATION_PENDING' };
  assert.equal(reservationConflict(previous, false, input), null);
  assert.ok(reservationConflict(previous, false, { ...input, slug: 'other' }));
  assert.equal(reservationConflict(null, false, input), null);
});
