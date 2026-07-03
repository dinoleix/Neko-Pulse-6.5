
import { db, storage, firebase, firebaseConfig } from '../firebaseConfig';
import { CrewMember, CrewDirectoryEntry, RoleDef } from '../types';

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
const healCrewDirectory = async (crew: CrewMember[]) => {
    if (directoryHealAttempted) return;
    directoryHealAttempted = true;
    try {
        const dirSnap = await db.collection('crewDirectory').get();
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
                batch.set(db.collection('crewDirectory').doc(c.id), want, { merge: true });
                writes++;
            }
        });

        existing.forEach((_, id) => {
            if (!crew.some(c => c.id === id)) {
                batch.delete(db.collection('crewDirectory').doc(id));
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
    // --- PHOTO ---
    uploadPhoto: async (data: Blob): Promise<string> => {
        const ref = storage.ref(`employees/${Date.now()}_photo.jpg`);
        await ref.put(data);
        return await ref.getDownloadURL();
    },

    // --- CREW CRUD (Staff) ---
    getAllCrew: async (): Promise<CrewMember[]> => {
        const snap = await db.collection('crew').orderBy('crewName').get();
        const crew = snap.docs.map(d => ({...d.data(), id: d.id} as CrewMember));
        healCrewDirectory(crew).catch(() => { /* non-blocking */ });
        return crew;
    },

    saveCrew: async (data: Partial<CrewMember>, id?: string) => {
        let docId = id;
        if (id) {
            await db.collection('crew').doc(id).set(data, { merge: true });
        } else if (data.authUid) {
            docId = data.authUid;
            await db.collection('crew').doc(data.authUid).set(data, { merge: true });
        } else {
            const ref = await db.collection('crew').add(data);
            docId = ref.id;
        }
        await db.collection('crewDirectory').doc(docId!).set(directoryFields(data), { merge: true });
    },

    deleteCrew: async (id: string) => {
        await db.collection('crew').doc(id).delete();
        await db.collection('crewDirectory').doc(id).delete();
    },

    // --- MANAGER CRUD (Admins) ---
    getAllManagers: async (): Promise<CrewMember[]> => {
        const snap = await db.collection('managers').orderBy('crewName').get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as CrewMember));
    },

    saveManager: async (data: Partial<CrewMember>, id?: string) => {
        if (id) {
            return await db.collection('managers').doc(id).set(data, { merge: true });
        } else {
            // Managers MUST have an authUid (email login)
            if (data.authUid) {
                return await db.collection('managers').doc(data.authUid).set(data, { merge: true });
            }
            return await db.collection('managers').add(data);
        }
    },

    deleteManager: async (id: string) => {
        return await db.collection('managers').doc(id).delete();
    },

    // --- ROLES ---
    getRoles: async (): Promise<RoleDef[]> => {
        const snap = await db.collection('roles').get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as RoleDef));
    },

    addRole: async (name: string) => {
        return await db.collection('roles').add({ name });
    },

    deleteRole: async (id: string) => {
        return await db.collection('roles').doc(id).delete();
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
