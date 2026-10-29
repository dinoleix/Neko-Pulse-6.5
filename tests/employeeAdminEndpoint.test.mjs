import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: [new URL('../api/employee-admin.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{ name: 'fake-admin', setup(build) {
  build.onResolve({ filter: /^firebase-admin\// }, args => ({ path: args.path, namespace: 'fake' }));
  build.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path.endsWith('/app') ? 'export const getApps=()=>[{}];export const cert=x=>x;export const initializeApp=()=>{};' : args.path.endsWith('/auth') ? 'export const getAuth=()=>globalThis.employeeEndpointTest.auth;' : 'export const getFirestore=()=>globalThis.employeeEndpointTest.db;export const FieldValue={serverTimestamp:()=>"server-time"};', loader: 'js' }));
} }] });
const handler = (await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)).default;
function setup({ grant = true, type = 'MANAGER', failBatch = false } = {}) {
  const records = new Map(Object.entries({
    'tenantMemberships/one_mgr': { uid: 'mgr', personId: 'mgr', tenantId: 'one', active: true, personType: type, outletIds: ['B6'] },
    'managers/mgr': { tenantId: 'one', role: 'Store Manager', active: true },
    'tenantSettings/one/config/accessConfig': { EMPLOYEE: grant ? ['Store Manager'] : [] },
    'tenantSettings/one/roles/barista': { name: 'Barista' },
    'stores/b6': { tenantId: 'one', outletId: 'B6', isActive: true },
    'stores/sfd': { tenantId: 'one', outletId: 'SFD', isActive: true },
  }));
  let auto = 0, created = 0, deleted = 0;
  const snapshot = path => ({ exists: records.has(path), data: () => records.get(path) });
  const collection = path => {
    const query = (filters = [], limit = Infinity) => ({ where: (key, op, val) => query([...filters, [key, val]], limit), limit: value => query(filters, value), get: async () => {
      const docs = [...records].filter(([key, value]) => key.startsWith(path + '/') && key.slice(path.length + 1).indexOf('/') === -1 && filters.every(([k, v]) => value[k] === v)).slice(0, limit).map(([key]) => snapshot(key));
      return { docs, size: docs.length, empty: !docs.length };
    } });
    return { ...query(), doc: id => { const key = `${path}/${id || ++auto}`; return { key, get: async () => snapshot(key), collection: child => collection(`${key}/${child}`) }; } };
  };
  globalThis.employeeEndpointTest = {
    db: { collection, runTransaction: async fn => {
      const writes = [];
      await fn({ get: ref => ref.get(), update: (ref, data) => writes.push([ref.key, { ...records.get(ref.key), ...data }]), set: (ref, data) => writes.push([ref.key, { ...records.get(ref.key), ...data }]), create: (ref, data) => writes.push([ref.key, data]) });
      if (failBatch) throw Object.assign(new Error('transaction failed'), { code: 'unavailable' });
      writes.forEach(([key, data]) => records.set(key, data));
    }, batch: () => { const writes = []; return { create: (ref, data) => writes.push([ref.key, data]), commit: async () => { if (failBatch) throw new Error('batch failed'); writes.forEach(([key, data]) => records.set(key, data)); } }; } },
    auth: { verifyIdToken: async () => ({ uid: 'mgr' }), createUser: async () => { created++; return { uid: 'new-staff' }; }, deleteUser: async uid => { assert.equal(uid, 'new-staff'); deleted++; } },
  };
  return { records, counts: () => ({ created, deleted }) };
}
async function call(method, employee, authenticated = true, employeeId = 'staff') {
  let code = 200, body;
  const res = { setHeader() {}, status(value) { code = value; return this; }, json(value) { body = value; return this; } };
  const previous = process.env.TENANT_MODE; process.env.TENANT_MODE = 'enabled';
  try { await handler({ method, headers: authenticated ? { authorization: 'Bearer test-token' } : {}, body: { employee, employeeId } }, res); }
  finally { if (previous === undefined) delete process.env.TENANT_MODE; else process.env.TENANT_MODE = previous; }
  return { code, body };
}
const draft = { crewName: 'Test Staff', crewCode: '123456', role: 'Barista', outletId: 'B6' };
test('endpoint denies unauthenticated, crew and ungranted manager creation before Auth mutation', async () => {
  let state = setup(); assert.equal((await call('POST', draft, false)).code, 401); assert.equal(state.counts().created, 0);
  for (const options of [{ type: 'CREW' }, { grant: false }]) { state = setup(options); assert.equal((await call('POST', draft)).code, 403); assert.equal(state.counts().created, 0); }
});
test('endpoint creates staff, membership, directory and audit atomically in the actor tenant', async () => {
  const state = setup(); assert.equal((await call('GET')).body.canCreateStaff, true);
  const result = await call('POST', { ...draft, tenantId: 'other', authUid: 'owner', allOutlets: true });
  assert.equal(result.code, 201); assert.equal(state.records.get('crew/new-staff').tenantId, 'one');
  const member = state.records.get('tenantMemberships/one_new-staff'); assert.equal(member.personType, 'CREW'); assert.deepEqual(member.outletIds, ['B6']); assert.equal(member.allOutlets, undefined);
  assert.ok(state.records.has('tenantSettings/one/crewDirectory/new-staff'));
  assert.ok([...state.records.keys()].some(k => k.startsWith('employeeAdministrationAudit/')));
});
test('other-store and duplicate-PIN requests cannot provision Auth accounts', async () => {
  let state = setup(); assert.equal((await call('POST', { ...draft, outletId: 'SFD' })).code, 400); assert.equal(state.counts().created, 0);
  state = setup(); state.records.set('crew/existing', { crewCode: draft.crewCode, tenantId: 'other' });
  assert.equal((await call('POST', draft)).code, 409); assert.equal(state.counts().created, 0);
});
test('failed profile commit cleans up only the freshly created, confirmed unlinked Auth identity', async () => {
  const state = setup({ failBatch: true }); assert.equal((await call('POST', draft)).code, 503);
  assert.deepEqual(state.counts(), { created: 1, deleted: 1 }); assert.equal(state.records.has('crew/new-staff'), false);
});

function addStaff(state, overrides = {}, membership = {}) {
  state.records.set('crew/staff', { ...draft, tenantId: 'one', authUid: 'staff', active: true, isMobile: true, leaveBalanceOverride: 7, ...overrides });
  state.records.set('tenantMemberships/one_staff', { tenantId: 'one', uid: 'staff', personId: 'staff', personType: 'CREW', role: 'Barista', active: true, outletIds: ['B6'], ...membership });
}
test('manager edits staff atomically without modifying credentials, privilege or balances', async () => {
  const state = setup(); addStaff(state);
  const result = await call('PATCH', { ...draft, crewName: 'Updated', crewCode: '999999', active: false, authUid: 'mgr', tenantId: 'other', isMobile: false, leaveBalanceOverride: 100 });
  assert.equal(result.code, 200);
  const staff = state.records.get('crew/staff'); assert.equal(staff.crewName, 'Updated');
  assert.equal(staff.crewCode, draft.crewCode); assert.equal(staff.authUid, 'staff'); assert.equal(staff.active, true);
  assert.equal(staff.isMobile, true); assert.equal(staff.leaveBalanceOverride, 7); assert.equal(staff.tenantId, 'one');
  assert.equal(state.records.get('tenantSettings/one/crewDirectory/staff').crewName, 'Updated');
  assert.ok([...state.records.values()].some(v => v.action === 'STAFF_UPDATED'));
  assert.deepEqual(state.counts(), { created: 0, deleted: 0 });
});
test('edit denies foreign/current-outlet/new-outlet/privileged/unlinked targets without writes', async () => {
  for (const [existing, member, patch] of [
    [{ tenantId: 'other' }, {}, {}], [{ outletId: 'SFD' }, {}, {}], [{}, {}, { outletId: 'SFD' }],
    [{ role: 'Store Manager' }, {}, {}], [{}, { personType: 'OWNER' }, {}],
    [{ authUid: 'mgr' }, {}, {}], [{ authUid: null }, {}, {}], [{}, {}, { role: 'Store Manager' }],
  ]) {
    const state = setup(); addStaff(state, existing, member);
    const before = JSON.stringify([...state.records]);
    assert.equal((await call('PATCH', { ...draft, ...patch })).code, 403);
    assert.equal(JSON.stringify([...state.records]), before);
  }
  for (const options of [{ grant: false }, { type: 'CREW' }]) {
    const state = setup(options); addStaff(state);
    assert.equal((await call('PATCH', draft)).code, 403);
  }
});
test('multi-outlet manager can transfer staff only between authorised stores and sync membership', async () => {
  const state = setup(); addStaff(state);
  state.records.get('tenantMemberships/one_mgr').outletIds = ['B6', 'SFD'];
  assert.equal((await call('PATCH', { ...draft, outletId: 'SFD' })).code, 200);
  assert.equal(state.records.get('crew/staff').outletId, 'SFD');
  assert.deepEqual(state.records.get('tenantMemberships/one_staff').outletIds, ['SFD']);
});
test('failed edit transaction leaves profile, membership and directory unchanged', async () => {
  const state = setup({ failBatch: true }); addStaff(state);
  const before = JSON.stringify([...state.records]);
  assert.equal((await call('PATCH', { ...draft, crewName: 'Not saved' })).code, 503);
  assert.equal(JSON.stringify([...state.records]), before);
});
