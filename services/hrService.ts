
import { db, storage } from '../firebaseConfig';
import { CrewMember, CrewDocument } from '../types';

export const hrService = {
    // --- CREW ---
    getActiveCrew: async (): Promise<CrewMember[]> => {
        const snap = await db.collection('crew').where('active', '==', true).get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as CrewMember));
    },

    updateCrewDocuments: async (crewId: string, documents: CrewDocument[]) => {
        return await db.collection('crew').doc(crewId).update({ documents });
    },

    // --- DOCUMENTS ---
    uploadDocument: async (file: File, crewId: string, docType: string): Promise<CrewDocument> => {
        const ref = storage.ref(`hr_docs/${crewId}/${Date.now()}_${file.name}`);
        await ref.put(file);
        const url = await ref.getDownloadURL();

        return {
            id: Date.now().toString(),
            name: file.name,
            type: docType as any,
            url: url,
            uploadedAt: new Date()
        };
    },

    // --- SETTINGS (LOGO) ---
    getCompanyLogo: async (): Promise<string> => {
        const snap = await db.collection('settings').doc('companyLogo').get();
        return snap.exists ? snap.data()?.url || '' : '';
    },

    uploadCompanyLogo: async (file: File): Promise<string> => {
        const ref = storage.ref(`settings/company_logo_${Date.now()}`);
        await ref.put(file);
        const url = await ref.getDownloadURL();
        await db.collection('settings').doc('companyLogo').set({ url });
        return url;
    },

    // --- SETTINGS (TEMPLATES & CONFIG) ---
    getTemplates: async () => {
        const snap = await db.collection('settings').doc('hrTemplates').get();
        return snap.exists ? snap.data() : {};
    },

    saveTemplates: async (templates: any) => {
        return await db.collection('settings').doc('hrTemplates').set(templates, { merge: true });
    },

    getLetterheadConfig: async () => {
        const snap = await db.collection('settings').doc('hrConfig').get();
        return snap.exists ? snap.data() : null;
    },

    saveLetterheadConfig: async (config: any) => {
        return await db.collection('settings').doc('hrConfig').set(config);
    }
};
