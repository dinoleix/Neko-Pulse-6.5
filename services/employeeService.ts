
import { db, firebase, firebaseConfig } from '../firebaseConfig';
import { CrewMember, RoleDef } from '../types';

export const employeeService = {
    // --- CREW CRUD (Staff) ---
    getAllCrew: async (): Promise<CrewMember[]> => {
        const snap = await db.collection('crew').orderBy('crewName').get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as CrewMember));
    },

    saveCrew: async (data: Partial<CrewMember>, id?: string) => {
        if (id) {
            return await db.collection('crew').doc(id).set(data, { merge: true });
        } else {
            if (data.authUid) {
                return await db.collection('crew').doc(data.authUid).set(data, { merge: true });
            }
            return await db.collection('crew').add(data);
        }
    },

    deleteCrew: async (id: string) => {
        return await db.collection('crew').doc(id).delete();
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
