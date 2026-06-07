
import { db, storage, firebase } from '../firebaseConfig';
import { Task, TaskTemplate, TaskLog, TaskConfig, Store, CrewMember, TaskProofType } from '../types';

export const taskService = {
    // --- TASKS ---
    getTasks: async (): Promise<Task[]> => {
        const snap = await db.collection('tasks').orderBy('createdAt', 'desc').get();
        return snap.docs.map(d => {
            const data = d.data() as any;
            // Migration for legacy proofType -> proofTypes array
            if (!data.proofTypes && data.proofType) data.proofTypes = [data.proofType];
            if (!data.proofTypes) data.proofTypes = ['NONE'];
            return { ...data, id: d.id } as Task;
        });
    },

    getActiveTasks: async (): Promise<Task[]> => {
        const snap = await db.collection('tasks').where('isActive', '==', true).get();
        return snap.docs.map(d => {
            const data = d.data() as any;
            if (!data.proofTypes && data.proofType) data.proofTypes = [data.proofType];
            if (!data.proofTypes) data.proofTypes = ['NONE'];
            return { ...data, id: d.id } as Task;
        });
    },

    saveTask: async (task: Partial<Task>, id?: string) => {
        const payload = { ...task };
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
        const snap = await db.collection('taskTemplates').orderBy('title').get();
        return snap.docs.map(d => {
            const data = d.data() as any;
            if (!data.proofTypes && data.proofType) data.proofTypes = [data.proofType];
            if (!data.proofTypes) data.proofTypes = ['NONE'];
            return { ...data, id: d.id } as TaskTemplate;
        });
    },

    saveTemplate: async (template: TaskTemplate, id?: string) => {
        if (id) {
            return await db.collection('taskTemplates').doc(id).update(template);
        }
        return await db.collection('taskTemplates').add(template);
    },

    deleteTemplate: async (id: string) => {
        return await db.collection('taskTemplates').doc(id).delete();
    },

    // --- LOGS (MONITORING) ---
    getLogs: async (start: Date, end: Date, outletId?: string): Promise<TaskLog[]> => {
        // Optimized: Query only by time range to avoid "outletId + completedAt" composite index error.
        // We filter by outlet in memory.
        const query = db.collection('taskLogs')
            .where('completedAt', '>=', start)
            .where('completedAt', '<=', end);
        
        const snap = await query.get();
        let logs = snap.docs.map(d => ({ ...d.data(), id: d.id } as TaskLog));

        if (outletId && outletId !== 'ALL') {
            logs = logs.filter(l => l.outletId === outletId);
        }
        return logs;
    },

    // --- CREW EXECUTION ---
    getTodaysLogs: async (outletId: string): Promise<TaskLog[]> => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        try {
            // Filter by outlet server-side so each crew device reads only its own
            // store's logs, not every outlet's. Requires the composite index
            // taskLogs (outletId ASC, completedAt ASC) in firestore.indexes.json.
            const snap = await db.collection('taskLogs')
                .where('outletId', '==', outletId)
                .where('completedAt', '>=', yesterday)
                .get();
            return snap.docs.map(d => ({ ...d.data(), id: d.id } as TaskLog));
        } catch (e) {
            // If the index isn't built yet (e.g. just after a deploy), fall back to
            // the time-only query + in-memory filter so task loading never breaks.
            console.warn('taskLogs outlet index unavailable, using fallback:', e);
            const snap = await db.collection('taskLogs')
                .where('completedAt', '>=', yesterday)
                .get();
            return snap.docs
                .map(d => ({ ...d.data(), id: d.id } as TaskLog))
                .filter(l => l.outletId === outletId);
        }
    },

    submitLog: async (log: Omit<TaskLog, 'id'>) => {
        return await db.collection('taskLogs').add({
            ...log,
            completedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    uploadProof: async (blob: Blob, type: 'IMAGE' | 'AUDIO'): Promise<string> => {
        const ext = type === 'IMAGE' ? 'jpg' : 'webm';
        const path = `proofs/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;
        const ref = storage.ref(path);
        await ref.put(blob);
        return await ref.getDownloadURL();
    },

    // --- CONFIG & HELPERS ---
    getConfig: async (): Promise<TaskConfig> => {
        const snap = await db.collection('settings').doc('taskConfig').get();
        return snap.exists ? (snap.data() as TaskConfig) : { alertEnabled: false, alertType: 'BOTH', alertDurationMinutes: 5, alertSoundId: 'BEEP' };
    },

    saveConfig: async (config: TaskConfig) => {
        return await db.collection('settings').doc('taskConfig').set(config);
    },

    getContextData: async () => {
        const [sSnap, cSnap] = await Promise.all([
            db.collection('stores').where('isActive', '==', true).get(),
            db.collection('crew').where('active', '==', true).get()
        ]);
        return {
            stores: sSnap.docs.map(d => ({ ...d.data(), id: d.id } as Store)),
            crew: cSnap.docs.map(d => ({ ...d.data(), id: d.id } as CrewMember))
        };
    }
};
