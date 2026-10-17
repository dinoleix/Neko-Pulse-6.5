import test from 'node:test';
import assert from 'node:assert/strict';
import { notScannedAttendance } from '../utils/notScannedAttendance.ts';
const staff = [{ id: 'a', authUid: 'auth-a', crewName: 'Test', active: true }];
const assignment = { crewId: 'a', crewName: 'Test', date: '2026-10-17', startTime: '09:00', outletId: 'B6' };
const run = (assignments = [assignment], logs = [], crew = staff, leaves = [], selected = 'ALL', now = new Date('2026-10-17T04:00:00Z')) => notScannedAttendance(assignments, logs, crew, leaves, '2026-10-17', '2026-10-17', 'Asia/Kolkata', now, selected);
test('started shift with no scan is shown once and employee filters apply', () => {
  assert.equal(run().length, 1);
  assert.equal(run([assignment, assignment]).length, 1);
  assert.equal(run(undefined, undefined, undefined, undefined, 'other').length, 0);
  assert.equal(run(undefined, undefined, undefined, undefined, 'auth-a').length, 1);
});
test('days off, approved leave, inactive staff, future shifts and missing schedules are excluded', () => {
  for (const change of [{ isDayOff: true }, { startTime: '10:00' }, { startTime: undefined }, { date: '2026-10-18' }]) assert.equal(run([{ ...assignment, ...change }]).length, 0);
  assert.equal(run(undefined, [], [{ ...staff[0], active: false }]).length, 0);
  const leave = { crewId: 'auth-a', startDate: assignment.date, endDate: assignment.date, status: 'APPROVED' };
  assert.equal(run(undefined, [], staff, [leave]).length, 0);
  assert.equal(run(undefined, [], staff, [{ ...leave, status: 'PENDING' }]).length, 1);
});
test('check-in, checkout-only and alias ID records prevent false missing labels in business timezone', () => {
  for (const type of ['CHECK_IN', 'CHECK_OUT']) assert.equal(run(undefined, [{ crewId: 'auth-a', type, timestamp: { toDate: () => new Date('2026-10-17T03:00:00Z') } }]).length, 0);
  assert.equal(run(undefined, [{ crewId: 'a', timestamp: new Date('2026-10-16T20:00:00Z') }]).length, 0);
  assert.equal(run(undefined, [{ crewId: 'other', timestamp: new Date('2026-10-17T03:00:00Z') }]).length, 1);
});
