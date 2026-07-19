
import { db, storage, auth, firebase } from '../firebaseConfig';
import { ConversationConfig, ConversationRecording, ConversationCoaching } from '../types';

const DEFAULT_CONFIG: ConversationConfig = {
    recordingEnabled: false,
    chunkMinutes: 5,
    retentionDays: 30
};

export const conversationService = {
    // --- CONFIG (the admin's remote on/off switch) ---
    getConfig: async (): Promise<ConversationConfig> => {
        const snap = await db.collection('settings').doc('conversationConfig').get();
        return snap.exists ? { ...DEFAULT_CONFIG, ...(snap.data() as ConversationConfig) } : DEFAULT_CONFIG;
    },

    saveConfig: async (config: ConversationConfig) => {
        return await db.collection('settings').doc('conversationConfig').set(config);
    },

    // Live subscription used by the counter tablet so an admin toggle takes
    // effect without any interaction on the device. Returns the unsubscriber.
    subscribeConfig: (cb: (config: ConversationConfig) => void): (() => void) => {
        return db.collection('settings').doc('conversationConfig').onSnapshot(
            snap => cb(snap.exists ? { ...DEFAULT_CONFIG, ...(snap.data() as ConversationConfig) } : DEFAULT_CONFIG),
            err => console.warn('conversationConfig subscription error:', err)
        );
    },

    // --- CAPTURE ---
    // Two steps so the tablet's retry loop can re-run the Firestore add
    // without re-putting a blob that already landed in Storage. No
    // getDownloadURL() here: that's a Storage read, and conversations/ is
    // manager-read-only — the admin resolves URLs via resolveAudioUrl().
    uploadAudio: async (blob: Blob, startedAt: Date): Promise<string> => {
        const day = startedAt.toISOString().slice(0, 10); // YYYY-MM-DD
        // Safari/iPad MediaRecorder emits audio/mp4 rather than webm.
        const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
        const path = `conversations/${day}/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;
        await storage.ref(path).put(blob);
        return path;
    },

    saveChunkDoc: async (
        storagePath: string,
        meta: { durationSec: number; recordedById: string; recordedByName: string; outletId?: string; startedAt: Date }
    ): Promise<string> => {
        const doc: Omit<ConversationRecording, 'id'> = {
            storagePath,
            startedAt: firebase.firestore.Timestamp.fromDate(meta.startedAt),
            durationSec: meta.durationSec,
            recordedById: meta.recordedById,
            recordedByName: meta.recordedByName,
            ...(meta.outletId ? { outletId: meta.outletId } : {}),
            status: 'uploaded',
            isTraining: false
        };
        const added = await db.collection('conversations').add(doc);
        return added.id;
    },

    // --- ADMIN REVIEW ---
    // Mint a playback URL for a recording (manager session — staff can't read
    // conversations/). Prefers the permanent training copy, then the legacy
    // stored URL, then resolves from the storage path.
    resolveAudioUrl: async (rec: ConversationRecording): Promise<string> => {
        if (rec.trainingUrl) return rec.trainingUrl;
        if (rec.downloadUrl) return rec.downloadUrl;
        return await storage.ref(rec.storagePath).getDownloadURL();
    },

    listByDate: async (start: Date, end: Date): Promise<ConversationRecording[]> => {
        const snap = await db.collection('conversations')
            .where('startedAt', '>=', start)
            .where('startedAt', '<=', end)
            .orderBy('startedAt', 'desc')
            .get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as ConversationRecording));
    },

    listTraining: async (): Promise<ConversationRecording[]> => {
        const snap = await db.collection('conversations')
            .where('isTraining', '==', true)
            .get();
        return snap.docs
            .map(d => ({ ...d.data(), id: d.id } as ConversationRecording))
            .sort((a, b) => (b.startedAt?.seconds || 0) - (a.startedAt?.seconds || 0));
    },

    // Copy the audio out of the auto-expiring conversations/ prefix into
    // training/, which has no lifecycle rule, so curated clips live forever.
    markAsTraining: async (rec: ConversationRecording) => {
        const sourceUrl = rec.downloadUrl || await storage.ref(rec.storagePath).getDownloadURL();
        const res = await fetch(sourceUrl);
        if (!res.ok) throw new Error('Could not fetch the recording audio.');
        const blob = await res.blob();
        const trainingPath = `training/${Date.now()}_${rec.id}.webm`;
        const ref = storage.ref(trainingPath);
        await ref.put(blob);
        const trainingUrl = await ref.getDownloadURL();
        await db.collection('conversations').doc(rec.id!).update({ isTraining: true, trainingPath, trainingUrl });
        return { trainingPath, trainingUrl };
    },

    unmarkTraining: async (rec: ConversationRecording) => {
        if (rec.trainingPath) {
            try { await storage.ref(rec.trainingPath).delete(); } catch (e) { console.warn('training object delete failed:', e); }
        }
        await db.collection('conversations').doc(rec.id!).update({
            isTraining: false,
            trainingPath: firebase.firestore.FieldValue.delete(),
            trainingUrl: firebase.firestore.FieldValue.delete()
        });
    },

    remove: async (rec: ConversationRecording) => {
        try { await storage.ref(rec.storagePath).delete(); } catch (e) { console.warn('storage delete failed (may already be expired):', e); }
        if (rec.trainingPath) {
            try { await storage.ref(rec.trainingPath).delete(); } catch (e) { console.warn('training delete failed:', e); }
        }
        await db.collection('conversations').doc(rec.id!).delete();
    },

    // Lazy metadata cleanup, run when the admin opens the module. The audio
    // objects themselves are deleted by the GCS lifecycle rule on the
    // conversations/ prefix; this only prunes the orphaned Firestore docs.
    // Training clips are kept (their audio lives under training/).
    cleanupExpired: async (retentionDays: number): Promise<number> => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - retentionDays);
        const snap = await db.collection('conversations')
            .where('startedAt', '<', cutoff)
            .get();
        const expired = snap.docs.filter(d => (d.data() as ConversationRecording).isTraining !== true);
        // Firestore batches cap at 500 writes.
        for (let i = 0; i < expired.length; i += 500) {
            const batch = db.batch();
            expired.slice(i, i + 500).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
        return expired.length;
    },

    // --- DEVICE STATUS ---
    // Written by the counter tablet on state transitions only (not on an
    // interval) to keep Firestore writes negligible; lets the admin view show
    // whether the tablet is actually recording or has its mic blocked.
    setDeviceStatus: async (uid: string, status: { state: 'recording' | 'stopped' | 'mic-blocked'; name: string; outletId?: string }) => {
        try {
            await db.collection('conversationStatus').doc(uid).set({
                ...status,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            console.warn('device status write failed:', e);
        }
    },

    getDeviceStatuses: async () => {
        const snap = await db.collection('conversationStatus').get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as any));
    },

    // --- AI ANALYSIS (on-demand per clip) ---
    analyze: async (rec: ConversationRecording): Promise<{ transcript: string; coaching: ConversationCoaching }> => {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) throw new Error('Not signed in.');
        const res = await fetch('/api/analyze-conversation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({ downloadUrl: await conversationService.resolveAudioUrl(rec) })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Analysis failed (${res.status})`);
        await db.collection('conversations').doc(rec.id!).update({
            transcript: data.transcript,
            coaching: data.coaching,
            status: 'analyzed'
        });
        return data;
    }
};
