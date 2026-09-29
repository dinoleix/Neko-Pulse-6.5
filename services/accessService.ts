
import { auth, db } from '../firebaseConfig';
import { AccessConfig, RoleDef } from '../types';
import { getCachedSettingsDoc, invalidateSettingsDoc } from './configCache';
import { isTenantModeEnabled, tenantService } from './tenantService';

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
        let ref = db.collection('settings').doc('accessConfig');
        if (isTenantModeEnabled) {
            const uid = auth.currentUser?.uid;
            if (!uid) throw new Error('Sign in is required to update access settings.');
            const membership = await tenantService.getActiveMembership(uid);
            if (!membership) throw new Error('No active business membership was found.');
            ref = db.collection('tenantSettings').doc(membership.tenantId).collection('config').doc('accessConfig');
        }
        const res = await ref.set(config);
        invalidateSettingsDoc('accessConfig');
        return res;
    }
};
