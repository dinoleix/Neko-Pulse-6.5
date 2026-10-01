
import { db, storage, firebase, firebaseConfig } from '../firebaseConfig';
import { CrewMember, CrewDirectoryEntry, RoleDef } from '../types';
import { getSettingsCollectionRef } from './configCache';
import { currentTenantContext, currentTenantId, isTenantWideMember, tenantPayload, withTenant } from './tenantScope';

const scopePeopleByOutlet = async (query: firebase.firestore.Query, tenantId?: string) => {
    const context = await currentTenantContext();
    let scoped = withTenant(query, tenantId ?? context?.tenantId);
    if (context && !isTenantWideMember(context)) {
        const outletIds = context.outletIds || [];
        if (!outletIds.length) throw new Error('No outlet is assigned to this account.');
        scoped = outletIds.length === 1
            ? scoped.where('outletId', '==', outletIds[0])
            : scoped.where('outletId', 'in', outletIds.slice(0, 10));
    }
    return scoped;
};

// Authentication IDs can change when an Owner repairs a staff login. Keep
// the tenant membership in lockstep with the profile or the person would be
// authenticated but unable to resolve their tenant-scoped session.
const syncTenantMembership = async (
    batch: firebase.firestore.WriteBatch,
    personType: 'CREW' | 'MANAGER',
    personId: string,
    previous: Partial<CrewMember> | undefined,
    payload: Partial<CrewMember> & { tenantId?: string },
) => {
    const tenantId = payload.tenantId;
    const uid = payload.authUid;
    if (!tenantId || !uid) return;

    const previousUid = previous?.authUid;
    const membershipRef = db.collection('tenantMemberships').doc(`${tenantId}_${uid}`);
    const existingMembership = (await membershipRef.get()).data() as { outletIds?: string[] } | undefined;
    if (previousUid && previousUid !== uid) {
        batch.delete(db.collection('tenantMemberships').doc(`${tenantId}_${previousUid}`));
    }

    // Editing a manager profile must not silently collapse their selected
    // multi-outlet access back to their home outlet. Keep the managed list,
    // while ensuring a newly selected home outlet is always included.
    const outletIds = personType === 'MANAGER' && previousUid === uid
        ? [...new Set([...(existingMembership?.outletIds || []), ...(payload.outletId ? [payload.outletId] : [])])]
        : (payload.outletId ? [payload.outletId] : []);

    batch.set(membershipRef, {
        tenantId,
        uid,
        personId,
        personType,
        role: payload.role || previous?.role || null,
        outletIds,
        active: payload.active ?? previous?.active ?? true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
};

// Extract the public-safe fields mirrored into /crewDirectory. Only fields
// present on the partial are included, so merge-writes never blank a value.
const directoryFields = (data: Partial<CrewMember>): Partial<CrewDirectoryEntry> => {
    const entry: Partial<CrewDirectoryEntry> = {};
    if (data.crewName !== undefined) entry.crewName = data.crewName;
    if (data.role !== undefined) entry.role = data.role ?? null;
    if (data.birthMMDD !== undefined) entry.birthMMDD = data.birthMMDD ?? null;
    if (data.active !== undefined) entry.active = data.active;
    return entry;
};

// One-shot self-heal per page load: diff /crewDirectory against /crew and
// batch-write only what's missing, stale, or orphaned. Backfills the mirror
// for crew created before it existed. Fire-and-forget from getAllCrew.
let directoryHealAttempted = false;
const crewDirectoryRef = async () => {
    const tenantId = await currentTenantId();
    return tenantId
        ? db.collection('tenantSettings').doc(tenantId).collection('crewDirectory')
        : db.collection('crewDirectory');
};

const healCrewDirectory = async (crew: CrewMember[]) => {
    if (directoryHealAttempted) return;
    directoryHealAttempted = true;
    try {
        const directory = await crewDirectoryRef();
        const dirSnap = await directory.get();
        const existing = new Map(dirSnap.docs.map(d => [d.id, d.data() as Partial<CrewDirectoryEntry>]));
        const batch = db.batch();
        let writes = 0;

        crew.forEach(c => {
            if (!c.id) return;
            const want = directoryFields(c);
            const have = existing.get(c.id);
            const stale = !have || (Object.keys(want) as (keyof CrewDirectoryEntry)[])
                .some(k => (have as any)[k] !== (want as any)[k]);
            if (stale) {
                batch.set(directory.doc(c.id), want, { merge: true });
                writes++;
            }
        });

        existing.forEach((_, id) => {
            if (!crew.some(c => c.id === id)) {
                batch.delete(directory.doc(id));
                writes++;
            }
        });

        if (writes > 0) await batch.commit();
    } catch (e) {
        directoryHealAttempted = false; // let a later load retry
        console.warn('crewDirectory heal skipped:', e);
    }
};

export const employeeService = {
    repairAuthUidRecords: async (): Promise<number> => {
        const [crew, managers] = await Promise.all([employeeService.getAllCrew(), employeeService.getAllManagers()]);
        const entries = [...crew.map(item => ['crew', item] as const), ...managers.map(item => ['managers', item] as const)]
            .filter(([, item]) => item.authUid && item.id !== item.authUid);
        let repaired = 0;
        for (let index = 0; index < entries.length; index += 400) {
            const batch = db.batch();
            entries.slice(index, index + 400).forEach(([collection, item]) => {
                batch.set(db.collection(collection).doc(item.authUid!), { ...item, id: firebase.firestore.FieldValue.delete() }, { merge: true });
                repaired++;
            });
            if (entries.slice(index, index + 400).length) await batch.commit();
        }
        return repaired;
    },
    // --- PHOTO ---
    uploadPhoto: async (data: Blob): Promise<string> => {
        const tenantId = await currentTenantId();
        const path = tenantId ? `employees/${tenantId}/${Date.now()}_photo.jpg` : `employees/${Date.now()}_photo.jpg`;
        const ref = storage.ref(path);
        await ref.put(data);
        return await ref.getDownloadURL();
    },

    // --- CREW CRUD (Staff) ---
    getAllCrew: async (): Promise<CrewMember[]> => {
        const tenantId = await currentTenantId();
        const snap = await (await scopePeopleByOutlet(db.collection('crew'), tenantId)).get();
        const crew = snap.docs.map(d => ({...d.data(), id: d.id} as CrewMember))
            .sort((a, b) => (a.crewName || '').localeCompare(b.crewName || ''));
        healCrewDirectory(crew).catch(() => { /* non-blocking */ });
        return crew;
    },

    // Training managers only need the people at their outlet when assigning
    // or reviewing training. This query matches the outlet-scoped rule.
    getCrewAtOutlet: async (outletId: string): Promise<CrewMember[]> => {
        const tenantId = await currentTenantId();
        const snap = await withTenant(db.collection('crew').where('outletId', '==', outletId), tenantId).get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as CrewMember))
            .sort((a, b) => (a.crewName || '').localeCompare(b.crewName || ''));
    },

    saveCrew: async (data: Partial<CrewMember>, id?: string) => {
        const payload = await tenantPayload(data);
        const docId = id || payload.authUid || db.collection('crew').doc().id;
        const ref = db.collection('crew').doc(docId);
        const previous = (await ref.get()).data() as Partial<CrewMember> | undefined;
        const batch = db.batch();
        batch.set(ref, payload, { merge: true });
        await syncTenantMembership(batch, 'CREW', docId, previous, payload);
        await batch.commit();
        await (await crewDirectoryRef()).doc(docId!).set(directoryFields(payload), { merge: true });
    },

    deleteCrew: async (id: string) => {
        await db.collection('crew').doc(id).delete();
        await (await crewDirectoryRef()).doc(id).delete();
    },

    // --- MANAGER CRUD (Admins) ---
    getAllManagers: async (): Promise<CrewMember[]> => {
        const tenantId = await currentTenantId();
        const snap = await (await scopePeopleByOutlet(db.collection('managers'), tenantId)).get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as CrewMember))
            .sort((a, b) => (a.crewName || '').localeCompare(b.crewName || ''));
    },

    saveManager: async (data: Partial<CrewMember>, id?: string) => {
        const payload = await tenantPayload(data);
        // Managers MUST have an authUid for email login; preserve the legacy
        // generated-ID fallback for incomplete drafts.
        const docId = id || payload.authUid || db.collection('managers').doc().id;
        const ref = db.collection('managers').doc(docId);
        const previous = (await ref.get()).data() as Partial<CrewMember> | undefined;
        const batch = db.batch();
        batch.set(ref, payload, { merge: true });
        await syncTenantMembership(batch, 'MANAGER', docId, previous, payload);
        await batch.commit();
    },

    deleteManager: async (id: string) => {
        return await db.collection('managers').doc(id).delete();
    },

    // --- ROLES ---
    getRoles: async (): Promise<RoleDef[]> => {
        const snap = await (await getSettingsCollectionRef('roles')).get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as RoleDef));
    },

    addRole: async (name: string) => {
        return await (await getSettingsCollectionRef('roles')).add({ name });
    },

    deleteRole: async (id: string) => {
        return await (await getSettingsCollectionRef('roles')).doc(id).delete();
    },

    // --- AUTH HELPERS ---
    createAuthUser: async (email: string, pass: string): Promise<string> => {
         let secondaryApp = firebase.apps.find(a => a.name === "Secondary");
         if (!secondaryApp) {
             secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
         }
         
         const userCred = await secondaryApp.auth().createUserWithEmailAndPassword(email, pass);
         const uid = userCred.user?.uid;
         await secondaryApp.auth().signOut();
         
         if (!uid) throw new Error("Failed to generate UID");
         return uid;
    },

    recoverAuthUser: async (email: string, pass: string): Promise<string> => {
         let secondaryApp = firebase.apps.find(a => a.name === "Secondary");
         if (!secondaryApp) {
             secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
         }
         
         const userCred = await secondaryApp.auth().signInWithEmailAndPassword(email, pass);
         const uid = userCred.user?.uid;
         await secondaryApp.auth().signOut();
         
         if (!uid) throw new Error("Failed to recover UID");
         return uid;
    }
};
