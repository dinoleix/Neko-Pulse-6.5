
import { db, firebase, storage } from '../firebaseConfig';
import { Store, AppConfig } from '../types';
import { getCachedSettingsDoc, getSettingsDocRef, invalidateSettingsDoc } from './configCache';
import { currentTenantContext, currentTenantId, isTenantWideMember, tenantPayload } from './tenantScope';

export const storeService = {
  // --- STORES ---
  getStores: async (tenantId?: string): Promise<Store[]> => {
    // Callers such as the Store Administration view do not need to know about
    // the active tenant. Resolve it here so an unscoped collection read can
    // never slip into a tenant-enabled build.
    const context = await currentTenantContext();
    const resolvedTenantId = tenantId ?? context?.tenantId;
    let query: firebase.firestore.Query = db.collection('stores');
    if (resolvedTenantId) query = query.where('tenantId', '==', resolvedTenantId);
    if (context && resolvedTenantId === context.tenantId && !isTenantWideMember(context)) {
      const outletIds = context.outletIds || [];
      if (!outletIds.length) throw new Error('No outlet is assigned to this account.');
      query = outletIds.length === 1
        ? query.where('outletId', '==', outletIds[0])
        : query.where('outletId', 'in', outletIds.slice(0, 10));
    }
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
    return await db.collection('stores').add(await tenantPayload({ ...store, isActive: store.isActive ?? true }));
  },

  updateStore: async (id: string, data: Partial<Store>) => {
    return await db.collection('stores').doc(id).update(data);
  },

  deleteStore: async (id: string) => {
    return await db.collection('stores').doc(id).delete();
  },

  uploadCert: async (file: File, type: 'FSSAI' | 'GST'): Promise<string> => {
    const tenantId = await currentTenantId();
    const path = tenantId
      ? `stores/${tenantId}/certs/${Date.now()}_${type}_${file.name}`
      : `stores/certs/${Date.now()}_${type}_${file.name}`;
    const ref = storage.ref(path);
    await ref.put(file);
    return await ref.getDownloadURL();
  },

  // --- APP CONFIG ---
  getAppConfig: async (): Promise<AppConfig | null> => {
    return (await getCachedSettingsDoc('appConfig')) as AppConfig | null;
  },

  updateAppConfig: async (config: AppConfig) => {
    const res = await (await getSettingsDocRef('appConfig')).set(config, { merge: true });
    invalidateSettingsDoc('appConfig');
    return res;
  }
};
