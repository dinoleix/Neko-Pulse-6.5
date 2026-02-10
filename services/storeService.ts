
import { db, storage } from '../firebaseConfig';
import { Store, AppConfig } from '../types';

export const storeService = {
  // --- STORES ---
  getStores: async (): Promise<Store[]> => {
    const snap = await db.collection('stores').get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Store));
  },

  addStore: async (store: Partial<Store>) => {
    return await db.collection('stores').add({ ...store, isActive: true });
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
    const snap = await db.collection('settings').doc('appConfig').get();
    return snap.exists ? (snap.data() as AppConfig) : null;
  },

  updateAppConfig: async (config: AppConfig) => {
    return await db.collection('settings').doc('appConfig').set(config, { merge: true });
  }
};
