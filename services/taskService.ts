
import { db, storage, firebase } from '../firebaseConfig';
import { Task, TaskTemplate, TaskLog, TaskConfig, Store, CrewMember, TaskProofType } from '../types';
import { storeService } from './storeService';
import { auth } from '../firebaseConfig';
import { isTenantModeEnabled, tenantService } from './tenantService';

const currentTenantId = async (): Promise<string | undefined> => {
    if (!isTenantModeEnabled) return undefined;
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Please sign in to access this business data.');
    const membership = await tenantService.getActiveMembership(uid);
    if (!membership) throw new Error('No active business membership was found.');
    return membership.tenantId;
};

const withTenant = (query: firebase.firestore.Query, tenantId?: string) =>
    tenantId ? query.where('tenantId', '==', tenantId) : query;

const tenantPayload = async <T extends object>(payload: T) => {
    const tenantId = await currentTenantId();
    return tenantId ? { ...payload, tenantId } : payload;
};

export const taskService = {
    // --- TASKS ---
    getTasks: async (): Promise<Task[]> => {
        const tenantId = await currentTenantId();
        const [snap, activeOutletIds] = await Promise.all([
            withTenant(db.collection('tasks'), tenantId).orderBy('createdAt', 'desc').get(),
            storeService.getActiveOutletIds(tenantId)
        ]);
        return snap.docs.map(d => {
            const data = d.data() as any;
            // Migration for legacy proofType -> proofTypes array
            if (!data.proofTypes && data.proofType) data.proofTypes = [data.proofType];
            if (!data.proofTypes) data.proofTypes = ['NONE'];
            return { ...data, id: d.id } as Task;
        }).filter(task => activeOutletIds.has(task.outletId));
    },

    getActiveTasks: async (): Promise<Task[]> => {
        const tenantId = await currentTenantId();
        const [snap, stores] = await Promise.all([
            withTenant(db.collection('tasks').where('isActive', '==', true), tenantId).get(),
            storeService.getActiveStores(tenantId)
        ]);
        const activeOutletIds = new Set(stores.map(store => store.outletId));
        return snap.docs.map(d => {
            const data = d.data() as any;
            if (!data.proofTypes && data.proofType) data.proofTypes = [data.proofType];
            if (!data.proofTypes) data.proofTypes = ['NONE'];
            return { ...data, id: d.id } as Task;
        }).filter(task => activeOutletIds.has(task.outletId));
    },

    saveTask: async (task: Partial<Task>, id?: string) => {
        const payload = await tenantPayload({ ...task });
        if (!payload.createdAt) payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        
        if (id) {
            return await db.collection('tasks').doc(id).update(payload);
        }
        return await db.collection('tasks').add(payload);
    },

    deleteTask: async (id: string) => {
        return await db.collection('tasks').doc(id).delete();
    },

    // --- TEMPLATES ---
    getTemplates: async (): Promise<TaskTemplate[]> => {
        const tenantId = await currentTenantId();
        const snap = await withTenant(db.collection('taskTemplates'), tenantId).orderBy('title').get();
        return snap.docs.map(d => {
            const data = d.data() as any;
            if (!data.proofTypes && data.proofType) data.proofTypes = [data.proofType];
            if (!data.proofTypes) data.proofTypes = ['NONE'];
            return { ...data, id: d.id } as TaskTemplate;
        });
    },

    saveTemplate: async (template: TaskTemplate, id?: string) => {
        const payload = await tenantPayload(template);
        if (id) {
            return await db.collection('taskTemplates').doc(id).update(payload);
        }
        return await db.collection('taskTemplates').add(payload);
    },

    deleteTemplate: async (id: string) => {
        return await db.collection('taskTemplates').doc(id).delete();
    },

    // --- LOGS (MONITORING) ---
    getLogs: async (start: Date, end: Date, outletId?: string): Promise<TaskLog[]> => {
        const tenantId = await currentTenantId();
        // Optimized: Query only by time range to avoid "outletId + completedAt" composite index error.
        // We filter by outlet in memory.
        const query = withTenant(db.collection('taskLogs'), tenantId)
            .where('completedAt', '>=', start)
            .where('completedAt', '<=', end);
        
        const [snap, activeOutletIds] = await Promise.all([query.get(), storeService.getActiveOutletIds(tenantId)]);
        let logs = snap.docs.map(d => ({ ...d.data(), id: d.id } as TaskLog)).filter(log => activeOutletIds.has(log.outletId));

        if (outletId && outletId !== 'ALL') {
            logs = logs.filter(l => l.outletId === outletId);
        }
        return logs;
    },

    // --- CREW EXECUTION ---
    getTodaysLogs: async (outletId: string): Promise<TaskLog[]> => {
        const tenantId = await currentTenantId();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        try {
            // Filter by outlet server-side so each crew device reads only its own
            // store's logs, not every outlet's. Requires the composite index
            // taskLogs (outletId ASC, completedAt ASC) in firestore.indexes.json.
            const snap = await withTenant(db.collection('taskLogs').where('outletId', '==', outletId), tenantId)
                .where('completedAt', '>=', yesterday)
                .get();
            return snap.docs.map(d => ({ ...d.data(), id: d.id } as TaskLog));
        } catch (e) {
            // If the index isn't built yet (e.g. just after a deploy), fall back to
            // the time-only query + in-memory filter so task loading never breaks.
            console.warn('taskLogs outlet index unavailable, using fallback:', e);
            const snap = await withTenant(db.collection('taskLogs'), tenantId)
                .where('completedAt', '>=', yesterday)
                .get();
            return snap.docs
                .map(d => ({ ...d.data(), id: d.id } as TaskLog))
                .filter(l => l.outletId === outletId);
        }
    },

    submitLog: async (log: Omit<TaskLog, 'id'>) => {
        const payload = await tenantPayload(log);
        return await db.collection('taskLogs').add({
            ...payload,
            completedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    uploadProof: async (blob: Blob, type: 'IMAGE' | 'AUDIO'): Promise<string> => {
        const ext = type === 'IMAGE' ? 'jpg' : 'webm';
        const tenantId = await currentTenantId();
        const path = tenantId
            ? `proofs/${tenantId}/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`
            : `proofs/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;
        const ref = storage.ref(path);
        await ref.put(blob);
        return path;
    },

    // --- CONFIG & HELPERS ---
    getConfig: async (): Promise<TaskConfig> => {
        const tenantId = await currentTenantId();
        const ref = tenantId ? db.collection('tenantSettings').doc(tenantId).collection('config').doc('taskConfig') : db.collection('settings').doc('taskConfig');
        const snap = await ref.get();
        return snap.exists ? (snap.data() as TaskConfig) : { alertEnabled: false, alertType: 'BOTH', alertDurationMinutes: 5, alertSoundId: 'BEEP' };
    },

    saveConfig: async (config: TaskConfig) => {
        const tenantId = await currentTenantId();
        const ref = tenantId ? db.collection('tenantSettings').doc(tenantId).collection('config').doc('taskConfig') : db.collection('settings').doc('taskConfig');
        return await ref.set(config);
    },

    getContextData: async () => {
        const tenantId = await currentTenantId();
        const [stores, cSnap] = await Promise.all([
            storeService.getActiveStores(tenantId),
            withTenant(db.collection('crew').where('active', '==', true), tenantId).get()
        ]);
        return {
            stores,
            crew: cSnap.docs.map(d => ({ ...d.data(), id: d.id } as CrewMember))
        };
    }
};
