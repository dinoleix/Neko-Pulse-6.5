
import { db, storage, firebase } from '../firebaseConfig';
import { OrderValidation } from '../types';

export const orderService = {
    // --- ADMIN: FETCHING ---
    getRecentValidations: async (limit: number = 500): Promise<OrderValidation[]> => {
        const snap = await db.collection('validations').orderBy('validatedAt', 'desc').limit(limit).get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as OrderValidation));
    },

    // --- ADMIN: ACTIONS ---
    deleteValidation: async (id: string) => {
        return await db.collection('validations').doc(id).delete();
    },

    // --- CREW: SUBMISSION ---
    saveValidation: async (data: Omit<OrderValidation, 'id'>) => {
        return await db.collection('validations').add({
            ...data,
            validatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    uploadProof: async (blob: Blob): Promise<string> => {
        const filename = `proofs/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.jpg`;
        const ref = storage.ref(filename);
        await ref.put(blob);
        return await ref.getDownloadURL();
    },

    // --- CREW: HISTORY ---
    getMyHistory: async (crewId: string, limit: number = 10): Promise<OrderValidation[]> => {
        // Server-side order + limit so we truly get the newest N. Requires the
        // composite index validations (validatedByCrewId ASC, validatedAt DESC).
        // The old where()+limit() without orderBy returned the first N by doc
        // ID — effectively random records once history grew past the limit.
        try {
            const snap = await db.collection('validations')
                .where('validatedByCrewId', '==', crewId)
                .orderBy('validatedAt', 'desc')
                .limit(limit)
                .get();
            return snap.docs.map(d => ({...d.data(), id: d.id} as OrderValidation));
        } catch (e) {
            // Index may still be building right after a deploy — fall back to
            // the unordered query rather than showing an empty history.
            console.warn('validations index unavailable, using fallback:', e);
            const snap = await db.collection('validations')
                .where('validatedByCrewId', '==', crewId)
                .limit(limit * 2)
                .get();
            const data = snap.docs.map(d => ({...d.data(), id: d.id} as OrderValidation));
            return data.sort((a,b) => (b.validatedAt?.seconds || 0) - (a.validatedAt?.seconds || 0)).slice(0, limit);
        }
    }
};
