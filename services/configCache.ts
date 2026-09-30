
import { auth, db } from '../firebaseConfig';
import { isTenantModeEnabled, tenantService } from './tenantService';

// Lightweight in-memory cache for rarely-changing config docs in /settings.
// Repeated reads of the same doc within a session are served from memory
// instead of billing a Firestore read each time. A short TTL bounds staleness;
// writes call invalidateSettingsDoc() so the saver sees fresh data immediately.

type Entry = { value: any; expires: number };

const cache = new Map<string, Entry>();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

const activeTenantId = async (): Promise<string | null> => {
    if (!isTenantModeEnabled) return null;
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Sign in is required to read tenant settings.');
    const tenantId = (await tenantService.getActiveMembership(uid))?.tenantId;
    if (!tenantId) throw new Error('No active business membership was found.');
    return tenantId;
};

// Configuration documents live at /settings in production and under the
// tenant that owns them in sandbox/tenant mode. Keeping this lookup in one
// place prevents a new configuration screen from accidentally using globals.
export const getSettingsDocRef = async (docId: string) => {
    const tenantId = await activeTenantId();
    return tenantId
        ? db.collection('tenantSettings').doc(tenantId).collection('config').doc(docId)
        : db.collection('settings').doc(docId);
};

// Small configuration lists (currently role definitions) follow the same
// tenant boundary, while production continues to use its established root
// collection until a cutover is explicitly approved.
export const getSettingsCollectionRef = async (collectionId: string) => {
    const tenantId = await activeTenantId();
    return tenantId
        ? db.collection('tenantSettings').doc(tenantId).collection(collectionId)
        : db.collection(collectionId);
};

export const getCachedSettingsDoc = async (docId: string, ttl: number = DEFAULT_TTL): Promise<any | null> => {
    // Sandbox tenant mode keeps operational configuration in the owning
    // tenant's settings namespace. The production path remains unchanged
    // until an explicit cutover enables tenant mode there.
    if (isTenantModeEnabled && !auth.currentUser) return null;
    const ref = await getSettingsDocRef(docId);
    const key = ref.path;
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
