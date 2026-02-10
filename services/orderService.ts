
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
        // Optimized: Removed .orderBy('validatedAt', 'desc') combined with .where()
        // This avoids requiring a composite index on [validatedByCrewId, validatedAt].
        const snap = await db.collection('validations')
            .where('validatedByCrewId', '==', crewId)
            .limit(20) // Fetch slightly more to ensure top 10 after sort
            .get();
        
        const data = snap.docs.map(d => ({...d.data(), id: d.id} as OrderValidation));
        
        // Client-side Sort
        return data.sort((a,b) => (b.validatedAt?.seconds || 0) - (a.validatedAt?.seconds || 0)).slice(0, limit);
    }
};
