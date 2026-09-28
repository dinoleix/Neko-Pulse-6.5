import { db, firebase } from '../firebaseConfig';
import { ManagerAction } from '../types';

const COLLECTION = 'managerActions';

export const managerActionService = {
  getRecent: async (limit = 50): Promise<ManagerAction[]> => {
    const snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as ManagerAction));
  },

  create: async (action: Omit<ManagerAction, 'id' | 'createdAt'>) => {
    return db.collection(COLLECTION).add({
      ...action,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  },

  saveUpdate: async (id: string, note: string, userId: string, userName: string) => {
    return db.collection(COLLECTION).doc(id).update({
      actionNote: note,
      actionUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      actionUpdatedBy: userId,
      actionUpdatedByName: userName,
    });
  },

  complete: async (id: string, note: string, userId: string, userName: string) => {
    return db.collection(COLLECTION).doc(id).update({
      status: 'COMPLETED',
      actionNote: note,
      actionUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      actionUpdatedBy: userId,
      actionUpdatedByName: userName,
      completedAt: firebase.firestore.FieldValue.serverTimestamp(),
      completedBy: userId,
      completedByName: userName,
    });
  },
};
