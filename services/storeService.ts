
import { db, firebase, storage } from '../firebaseConfig';
import { Store, AppConfig } from '../types';
import { getCachedSettingsDoc, invalidateSettingsDoc } from './configCache';

export const storeService = {
  // --- STORES ---
  getStores: async (tenantId?: string): Promise<Store[]> => {
    let query: firebase.firestore.Query = db.collection('stores');
    if (tenantId) query = query.where('tenantId', '==', tenantId);
    const snap = await query.get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Store));
  },

  // Old store records may not have the field yet, so treat only an explicit
  // false as closed. This keeps the migration safe while new closures take
  // effect everywhere immediately.
  getActiveStores: async (tenantId?: string): Promise<Store[]> => {
    const stores = await storeService.getStores(tenantId);
    return stores.filter(store => store.isActive !== false);
  },

  getActiveOutletIds: async (tenantId?: string): Promise<Set<string>> =>
    new Set((await storeService.getActiveStores(tenantId)).map(store => store.outletId)),

  addStore: async (store: Partial<Store>) => {
    return await db.collection('stores').add({ ...store, isActive: store.isActive ?? true });
  },

  updateStore: async (id: string, data: Partial<Store>) => {
    return await db.collection('stores').doc(id).update(data);
  },

  deleteStore: async (id: string) => {
    return await db.collection('stores').doc(id).delete();
  },

  uploadCert: async (file: File, type: 'FSSAI' | 'GST'): Promise<string> => {
    const ref = storage.ref(`stores/certs/${Date.now()}_${type}_${file.name}`);
    await ref.put(file);
    return await ref.getDownloadURL();
  },

  // --- APP CONFIG ---
  getAppConfig: async (): Promise<AppConfig | null> => {
    return (await getCachedSettingsDoc('appConfig')) as AppConfig | null;
  },

  updateAppConfig: async (config: AppConfig) => {
    const res = await db.collection('settings').doc('appConfig').set(config, { merge: true });
    invalidateSettingsDoc('appConfig');
    return res;
  }
};
