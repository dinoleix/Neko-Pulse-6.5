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
    db: { collection, batch: () => { const writes = []; return { create: (ref, data) => writes.push([ref.key, data]), commit: async () => { if (failBatch) throw new Error('batch failed'); writes.forEach(([key, data]) => records.set(key, data)); } }; } },
    auth: { verifyIdToken: async () => ({ uid: 'mgr' }), createUser: async () => { created++; return { uid: 'new-staff' }; }, deleteUser: async uid => { assert.equal(uid, 'new-staff'); deleted++; } },
  };
  return { records, counts: () => ({ created, deleted }) };
}
async function call(method, employee, authenticated = true) {
  let code = 200, body;
  const res = { setHeader() {}, status(value) { code = value; return this; }, json(value) { body = value; return this; } };
  const previous = process.env.TENANT_MODE; process.env.TENANT_MODE = 'enabled';
  try { await handler({ method, headers: authenticated ? { authorization: 'Bearer test-token' } : {}, body: { employee } }, res); }
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
