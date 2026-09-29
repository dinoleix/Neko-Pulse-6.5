
import { auth, db } from '../firebaseConfig';
import { isTenantModeEnabled, tenantService } from './tenantService';

// Lightweight in-memory cache for rarely-changing config docs in /settings.
// Repeated reads of the same doc within a session are served from memory
// instead of billing a Firestore read each time. A short TTL bounds staleness;
// writes call invalidateSettingsDoc() so the saver sees fresh data immediately.

type Entry = { value: any; expires: number };

const cache = new Map<string, Entry>();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

export const getCachedSettingsDoc = async (docId: string, ttl: number = DEFAULT_TTL): Promise<any | null> => {
    // Sandbox tenant mode keeps operational configuration in the owning
    // tenant's settings namespace. The production path remains unchanged
    // until an explicit cutover enables tenant mode there.
    let ref = db.collection('settings').doc(docId);
    let key = `settings/${docId}`;
    if (isTenantModeEnabled) {
        const uid = auth.currentUser?.uid;
        if (!uid) return null;
        const membership = await tenantService.getActiveMembership(uid);
        if (!membership) return null;
        key = `tenantSettings/${membership.tenantId}/config/${docId}`;
        ref = db.collection('tenantSettings').doc(membership.tenantId).collection('config').doc(docId);
    }
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expires > now) return hit.value;

    const snap = await ref.get();
    const value = snap.exists ? snap.data() : null;
    cache.set(key, { value, expires: now + ttl });
    return value;
};

export const invalidateSettingsDoc = (docId: string): void => {
    for (const key of cache.keys()) {
        if (key === `settings/${docId}` || key.endsWith(`/config/${docId}`)) cache.delete(key);
    }
};
