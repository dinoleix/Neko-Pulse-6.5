
import { db, storage, firebase } from '../firebaseConfig';
import { BluebookItem, BluebookConfig } from '../types';

const COLLECTION = 'bluebook_items';

export const bluebookService = {
    // --- LESSONS ---
    getItems: async (): Promise<BluebookItem[]> => {
        const snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as BluebookItem));
    },

    saveItem: async (item: Partial<BluebookItem>, id?: string) => {
        if (id) {
            return await db.collection(COLLECTION).doc(id).update(item);
        }
        return await db.collection(COLLECTION).add({
            ...item,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    deleteItem: async (id: string) => {
        return await db.collection(COLLECTION).doc(id).delete();
    },

    uploadImage: async (data: Blob, fileName?: string): Promise<string> => {
        const name = fileName || `lesson_image_${Date.now()}.jpg`;
        const ref = storage.ref(`bluebook/${Date.now()}_${name}`);
        await ref.put(data);
        return await ref.getDownloadURL();
    },

    // --- CONFIG ---
    getConfig: async (): Promise<BluebookConfig> => {
        const snap = await db.collection('settings').doc('bluebookConfig').get();
        if (!snap.exists) {
            return { categories: ['Customer Service', 'Behaviour & Attitude', 'Rules & Regulations', 'Hygiene & Safety', 'Software & POS', 'Protocols & Emergency', 'Café Culture'] };
        }
        return snap.data() as BluebookConfig;
    },

    saveConfig: async (config: BluebookConfig) => {
        return await db.collection('settings').doc('bluebookConfig').set(config);
    }
};
