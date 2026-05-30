
import { db, storage, firebase } from '../firebaseConfig';
import { Recipe, RecipeConfig } from '../types';

const COLLECTION = 'recipes';

export const recipeService = {
    getAll: async (): Promise<Recipe[]> => {
        const snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as Recipe));
    },

    getShared: async (): Promise<Recipe[]> => {
        const snap = await db.collection(COLLECTION).where('isShared', '==', true).get();
        const items = snap.docs.map(d => ({ ...d.data(), id: d.id } as Recipe));
        return items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    },

    save: async (recipe: Partial<Recipe>, id?: string) => {
        if (id) {
            return await db.collection(COLLECTION).doc(id).update(recipe);
        }
        return await db.collection(COLLECTION).add({
            ...recipe,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    toggleShare: async (id: string, isShared: boolean) => {
        return await db.collection(COLLECTION).doc(id).update({ isShared });
    },

    delete: async (id: string) => {
        return await db.collection(COLLECTION).doc(id).delete();
    },

    uploadImage: async (data: Blob): Promise<string> => {
        const ref = storage.ref(`recipes/${Date.now()}_photo.jpg`);
        await ref.put(data);
        return await ref.getDownloadURL();
    },

    getConfig: async (): Promise<RecipeConfig> => {
        const snap = await db.collection('settings').doc('recipeConfig').get();
        if (!snap.exists) {
            return { categories: ['Main Course', 'Beverage', 'Dessert', 'Snack', 'Sauce & Condiment'] };
        }
        return snap.data() as RecipeConfig;
    },

    saveConfig: async (config: RecipeConfig) => {
        return await db.collection('settings').doc('recipeConfig').set(config);
    }
};
