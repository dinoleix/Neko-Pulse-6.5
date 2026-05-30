
import { db } from '../firebaseConfig';

// Lightweight in-memory cache for rarely-changing config docs in /settings.
// Repeated reads of the same doc within a session are served from memory
// instead of billing a Firestore read each time. A short TTL bounds staleness;
// writes call invalidateSettingsDoc() so the saver sees fresh data immediately.

type Entry = { value: any; expires: number };

const cache = new Map<string, Entry>();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

export const getCachedSettingsDoc = async (docId: string, ttl: number = DEFAULT_TTL): Promise<any | null> => {
    const key = `settings/${docId}`;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expires > now) return hit.value;

    const snap = await db.collection('settings').doc(docId).get();
    const value = snap.exists ? snap.data() : null;
    cache.set(key, { value, expires: now + ttl });
    return value;
};

export const invalidateSettingsDoc = (docId: string): void => {
    cache.delete(`settings/${docId}`);
};
