
import { db } from '../firebaseConfig';
import { AccessConfig, RoleDef } from '../types';

export const accessService = {
    getRoles: async (): Promise<string[]> => {
        const rSnap = await db.collection('roles').get();
        return rSnap.docs
            .map(d => (d.data() as RoleDef).name)
            .filter(r => !['Staff', 'Waiter', 'Server'].includes(r));
    },

    getAccessConfig: async (): Promise<AccessConfig> => {
        const cSnap = await db.collection('settings').doc('accessConfig').get();
        return cSnap.exists ? (cSnap.data() as AccessConfig) : {};
    },

    saveAccessConfig: async (config: AccessConfig) => {
        return await db.collection('settings').doc('accessConfig').set(config);
    }
};
