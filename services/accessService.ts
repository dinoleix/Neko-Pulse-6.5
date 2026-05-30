
import { db } from '../firebaseConfig';
import { AccessConfig, RoleDef } from '../types';
import { getCachedSettingsDoc, invalidateSettingsDoc } from './configCache';

export const accessService = {
    getRoles: async (): Promise<string[]> => {
        const rSnap = await db.collection('roles').get();
        return rSnap.docs
            .map(d => (d.data() as RoleDef).name)
            .filter(r => !['Staff', 'Waiter', 'Server'].includes(r));
    },

    getAccessConfig: async (): Promise<AccessConfig> => {
        return ((await getCachedSettingsDoc('accessConfig')) as AccessConfig) || {};
    },

    saveAccessConfig: async (config: AccessConfig) => {
        const res = await db.collection('settings').doc('accessConfig').set(config);
        invalidateSettingsDoc('accessConfig');
        return res;
    }
};
