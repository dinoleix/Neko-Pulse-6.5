
import { db, storage } from '../firebaseConfig';
import { CrewMember, CrewDocument } from '../types';
import { getCachedSettingsDoc, getSettingsDocRef, invalidateSettingsDoc } from './configCache';

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
        return {
            id: Date.now().toString(),
            name: file.name,
            type: docType as any,
            storagePath: ref.fullPath,
            uploadedAt: new Date()
        };
    },

    // --- SETTINGS (LOGO) ---
    getCompanyLogo: async (): Promise<string> => {
        return ((await getCachedSettingsDoc('companyLogo')) as { url?: string } | null)?.url || '';
    },

    uploadCompanyLogo: async (file: File): Promise<string> => {
        const ref = storage.ref(`settings/company_logo_${Date.now()}`);
        await ref.put(file);
        const url = await ref.getDownloadURL();
        await (await getSettingsDocRef('companyLogo')).set({ url });
        invalidateSettingsDoc('companyLogo');
        return url;
    },

    // --- SETTINGS (TEMPLATES & CONFIG) ---
    getTemplates: async () => {
        return (await getCachedSettingsDoc('hrTemplates')) || {};
    },

    saveTemplates: async (templates: any) => {
        const res = await (await getSettingsDocRef('hrTemplates')).set(templates, { merge: true });
        invalidateSettingsDoc('hrTemplates');
        return res;
    },

    getLetterheadConfig: async () => {
        return await getCachedSettingsDoc('hrConfig');
    },

    saveLetterheadConfig: async (config: any) => {
        const res = await (await getSettingsDocRef('hrConfig')).set(config);
        invalidateSettingsDoc('hrConfig');
        return res;
    }
};
