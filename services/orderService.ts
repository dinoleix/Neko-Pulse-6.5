
import { db, storage, firebase } from '../firebaseConfig';
import { OrderValidation } from '../types';
import { storeService } from './storeService';
import { currentTenantId, tenantPayload, withTenant } from './tenantScope';
import { isTenantModeEnabled, tenantService } from './tenantService';

export const orderService = {
    // --- ADMIN: FETCHING ---
    getRecentValidations: async (limit: number = 500): Promise<OrderValidation[]> => {
        const tenantId = await currentTenantId();
        const membership = isTenantModeEnabled && firebase.auth().currentUser
            ? await tenantService.getActiveMembership(firebase.auth().currentUser.uid)
            : null;
        const activeOutletIds = await storeService.getActiveOutletIds(tenantId);
        const permittedOutletIds = tenantId
            ? [...activeOutletIds].filter(outletId => membership?.outletIds.includes(outletId))
            : [...activeOutletIds];

        // Each outlet is queried independently in tenant mode. This keeps the
        // query compatible with outlet-scoped Firestore rules: a manager never
        // asks Firestore for records from an outlet outside their membership.
        const snapshots = await Promise.all(permittedOutletIds.map(outletId =>
            withTenant(db.collection('validations'), tenantId)
                .where('outletId', '==', outletId)
                .orderBy('validatedAt', 'desc')
                .limit(limit)
                .get()
        ));
        return snapshots.flatMap(snap => snap.docs.map(d => ({...d.data(), id: d.id} as OrderValidation)))
            .sort((a, b) => (b.validatedAt?.seconds || 0) - (a.validatedAt?.seconds || 0))
            .slice(0, limit);
    },

    // --- ADMIN: ACTIONS ---
    deleteValidation: async (id: string) => {
        return await db.collection('validations').doc(id).delete();
    },

    // --- CREW: SUBMISSION ---
    saveValidation: async (data: Omit<OrderValidation, 'id'>) => {
        return await db.collection('validations').add({
            ...(await tenantPayload(data)),
            validatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    uploadProof: async (blob: Blob): Promise<string> => {
        const filename = `proofs/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.jpg`;
        const ref = storage.ref(filename);
        await ref.put(blob);
        return filename;
    },

    // --- CREW: HISTORY ---
    getMyHistory: async (crewId: string, limit: number = 10): Promise<OrderValidation[]> => {
        // Server-side order + limit so we truly get the newest N. Requires the
        // composite index validations (validatedByCrewId ASC, validatedAt DESC).
        // The old where()+limit() without orderBy returned the first N by doc
        // ID — effectively random records once history grew past the limit.
        const tenantId = await currentTenantId();
        try {
            const snap = await withTenant(db.collection('validations'), tenantId)
                .where('validatedByCrewId', '==', crewId)
                .orderBy('validatedAt', 'desc')
                .limit(limit)
                .get();
            return snap.docs.map(d => ({...d.data(), id: d.id} as OrderValidation));
        } catch (e) {
            // Index may still be building right after a deploy — fall back to
            // the unordered query rather than showing an empty history.
            console.warn('validations index unavailable, using fallback:', e);
            const snap = await withTenant(db.collection('validations'), tenantId)
                .where('validatedByCrewId', '==', crewId)
                .limit(limit * 2)
                .get();
            const data = snap.docs.map(d => ({...d.data(), id: d.id} as OrderValidation));
            return data.sort((a,b) => (b.validatedAt?.seconds || 0) - (a.validatedAt?.seconds || 0)).slice(0, limit);
        }
    }
};
