import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
const source = buildSync({ entryPoints: [new URL('../server/attendanceEmailReport.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node' }).outputFiles[0].text;
const { buildAttendanceEmail, emailAdmin, validateEmailSettings, midnight, previousDate, deliveryDecision } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const crew = [{ id: 'a', authUid: 'auth-a', crewName: '<Dino>', active: true, outletId: 'B6' }, { id: 'b', crewName: 'Staff B', active: true, outletId: 'B6' }];
const stores = [{ name: 'B6', outletId: 'B6' }];
const log = (type, timestamp, outletId = 'B6') => ({ crewId: 'auth-a', outletId, type, timestamp: new Date(timestamp) });
const build = (logs, assignments = [], leaves = []) => buildAttendanceEmail({ crew, stores, logs, assignments, leaves }, '2026-10-17', 'Asia/Kolkata', new Date('2026-10-18T02:00:00Z'));
test('hours sum closed sessions, exclude breaks, and escape employee names', () => {
  const r = build([log('CHECK_IN', '2026-10-17T03:30Z'), log('CHECK_OUT', '2026-10-17T06:30Z'), log('CHECK_IN', '2026-10-17T07:30Z'), log('CHECK_OUT', '2026-10-17T12:30Z')]);
  assert.equal(r.rows[0].duration, '8h 0m'); assert.equal(r.rows[0].first, '09:00'); assert.equal(r.rows[0].last, '18:00'); assert.equal(r.rows[0].status, 'Checked out');
  assert.ok(r.html.includes('&lt;Dino&gt;')); assert.ok(!r.html.includes('<Dino>'));
});
test('overnight checkout belongs to check-in day, previous-day sessions excluded', () => {
  const r = build([log('CHECK_IN', '2026-10-16T18:00Z'), log('CHECK_OUT', '2026-10-17T00:30Z'), log('CHECK_IN', '2026-10-17T17:30Z'), log('CHECK_OUT', '2026-10-17T20:30Z')]);
  assert.equal(r.rows[0].duration, '3h 0m'); assert.equal(r.rows[0].last, '02:00 (+1 day)');
});
test('missing checkouts and cross-outlet pairings never fabricate hours', () => {
  assert.equal(build([log('CHECK_IN', '2026-10-17T03:30Z')]).rows[0].duration, '—');
  const r = build([log('CHECK_IN', '2026-10-17T03:30Z'), log('CHECK_OUT', '2026-10-17T12:30Z', 'SFD')]);
  assert.equal(r.rows[0].duration, '—'); assert.match(r.rows[0].status, /Review/);
});
test('scheduled no-scan, approved leave, days off and unscheduled staff distinguished', () => {
  const a = { crewId: 'b', date: '2026-10-17', startTime: '09:00', outletId: 'B6' };
  assert.equal(build([], [a]).rows.find(r => r.employee === 'Staff B').status, 'Not Scanned');
  assert.equal(build([], [a], [{ crewId: 'b', status: 'APPROVED', startDate: a.date, endDate: a.date }]).rows.find(r => r.employee === 'Staff B').status, 'Approved leave');
  assert.equal(build([], [{ ...a, isDayOff: true }]).rows.find(r => r.employee === 'Staff B').status, 'Day off');
  assert.equal(build([]).rows[0].status, 'Not scheduled');
});
test('only tenant owners and administrators with active linked profiles qualify', () => {
  const m = { active: true, tenantId: 'one', personType: 'OWNER' }, p = { tenantId: 'one', active: true };
  assert.equal(emailAdmin(m, p, 'one'), true);
  for (const personType of ['CREW', 'MANAGER']) assert.equal(emailAdmin({ ...m, personType }, p, 'one'), false);
  assert.equal(emailAdmin({ ...m, personType: 'ADMINISTRATOR' }, p, 'one'), true);
  assert.equal(emailAdmin(m, p, 'two'), false); assert.equal(emailAdmin(m, { ...p, active: false }, 'one'), false);
});
test('recipient validation, outlet validation, and timezone date boundaries', () => {
  assert.deepEqual(validateEmailSettings({ recipients: 'A@b.com\na@b.com', sendTime: '06:00' }, []).recipients, ['a@b.com']);
  assert.throws(() => validateEmailSettings({ recipients: 'bad', sendTime: '06:00' }, []));
  assert.throws(() => validateEmailSettings({ recipients: 'a@b.com', sendTime: '06:00', outletIds: ['foreign'] }, ['B6']));
  assert.equal(midnight('2026-10-17', 'Asia/Kolkata').toISOString(), '2026-10-16T18:30:00.000Z');
  assert.equal(previousDate('2026-03-01'), '2026-02-28');
  assert.equal(midnight('2026-10-25', 'Europe/Paris').toISOString(), '2026-10-24T22:00:00.000Z');
});
test('daily delivery skips accepted and leased attempts, retries failures within provider window', () => {
  const now = Date.now(), stamp = age => ({ toMillis: () => now - age });
  assert.equal(deliveryDecision(undefined, false, now), 'SEND');
  assert.equal(deliveryDecision({ status: 'ACCEPTED' }, false, now), 'SKIP');
  assert.equal(deliveryDecision({ status: 'SENDING', startedAt: stamp(30000) }, false, now), 'SKIP');
  assert.equal(deliveryDecision({ status: 'FAILED', startedAt: stamp(180000), firstAttemptAt: stamp(180000) }, false, now), 'SEND');
  assert.equal(deliveryDecision({ status: 'FAILED', firstAttemptAt: stamp(24 * 3600000) }, false, now), 'REVIEW');
});
test('selected outlet excludes other-store staff, including historical scanned staff', () => {
  const result = buildAttendanceEmail({ crew: [...crew, { id: 'c', crewName: 'Other', outletId: 'SFD', active: true }], stores, logs: [{ crewId: 'c', outletId: 'SFD', type: 'CHECK_IN', timestamp: new Date('2026-10-17T03:30Z') }], assignments: [], leaves: [] }, '2026-10-17', 'Asia/Kolkata');
  assert.ok(!result.rows.some(r => r.employee === 'Other'));
});
test('COUNTER roles are excluded from scanned, unscanned, unscheduled rows and summary totals', () => {
  const counters = [
    { id: 'counter-1', authUid: 'counter-auth-1', crewName: 'Scanned counter', role: 'COUNTER', active: true, outletId: 'B6' },
    { id: 'counter-2', crewName: 'Unscanned counter', role: ' counter ', active: true, outletId: 'B6' },
    { id: 'counter-3', crewName: 'Tablet counter', role: 'Counter', active: true, outletId: 'B6' },
  ];
  const assignments = ['counter-auth-1', 'counter-2', 'b'].map(crewId => ({ crewId, date: '2026-10-17', startTime: '09:00', outletId: 'B6' }));
  const logs = [{ crewId: 'counter-auth-1', type: 'CHECK_IN', outletId: 'B6', timestamp: new Date('2026-10-17T03:30Z') }];
  const data = { crew: [...crew, ...counters], stores, logs, assignments, leaves: [] };
  const r = buildAttendanceEmail(data, '2026-10-17', 'Asia/Kolkata', new Date('2026-10-18T02:00Z'));
  assert.equal(r.rows.length, 2);
  assert.match(r.text, /1 scheduled employee\/store assignments · 0 checked in/);
  assert.match(r.text, /1 not scanned/);
  for (const counter of counters) { assert.ok(!r.text.includes(counter.crewName)); assert.ok(!r.html.includes(counter.crewName)); }
  assert.equal(data.crew.length, 5); assert.equal(data.assignments.length, 3);
});
