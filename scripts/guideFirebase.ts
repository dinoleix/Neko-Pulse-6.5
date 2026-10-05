// Screenshot-only local adapter. No Firebase connection and no writes.
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
const tenantId = 'guide-demo';
const member = { tenantId, uid: 'guide-owner', personType: 'OWNER', personId: 'guide-owner', role: 'Owner', active: true, allOutlets: true, outletIds: ['demo-main'] };
const fixtures: Record<string, any[]> = {
  stores: [{ id: 'demo-main', tenantId, outletId: 'demo-main', name: 'Demo Café - Main Outlet', address: 'Demonstration address', isActive: true }],
  crew: [{ id: 'demo-staff', tenantId, crewName: 'Sample Team Member', crewCode: 'DEMO', outletId: 'demo-main', role: 'Barista', active: true }],
  managers: [{ id: 'guide-owner', tenantId, crewName: 'Demo Owner', role: 'Owner', active: true }],
  tenantMemberships: [{ id: 'guide-demo_guide-owner', ...member }],
  roles: [{ id: 'owner', name: 'Owner' }, { id: 'barista', name: 'Barista' }, { id: 'manager', name: 'Store Manager' }],
};
const denied = () => { throw new Error('Read-only guide preview: saving is disabled.'); };
function ref(path: string): any {
  const key = path.split('/').at(-1)!;
  const docs = (fixtures[key] || []).map(item => ({ id: item.id, exists: true, data: () => item }));
  const config = key === 'appConfig' ? { timezone: 'Asia/Kolkata', currencySymbol: '₹' } : key === 'accessConfig' ? {} : key === 'guide-demo_guide-owner' ? member : undefined;
  const snapshot = { docs, size: docs.length, empty: docs.length === 0, exists: Boolean(config), id: key, data: () => config, forEach: (fn: any) => docs.forEach(fn) };
  return { path, id: key, collection: (name: string) => ref(`${path}/${name}`), doc: (name = 'demo') => ref(`${path}/${name}`), where() { return this; }, orderBy() { return this; }, limit() { return this; }, get: async () => snapshot, onSnapshot: (fn: any) => { fn(snapshot); return () => {}; }, set: denied, update: denied, delete: denied, add: denied };
}
export const db: any = { collection: (name: string) => ref(name), batch: denied, runTransaction: denied };
export const auth: any = { currentUser: { uid: 'guide-owner', email: 'demo@example.invalid', getIdToken: async () => 'demo-no-token' }, onAuthStateChanged: (fn: any) => { fn(null); return () => {}; }, signOut: async () => {} };
export const storage: any = { ref: () => ({ put: denied, getDownloadURL: denied }) };
export const firebaseConfig = {};
export const app = {};
export { firebase };
