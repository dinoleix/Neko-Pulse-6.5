
import { db, firebase } from '../firebaseConfig';
import { ManagerMeeting, MeetingActionItem, MeetingAgendaItem, CrewMember } from '../types';

export const meetingService = {
    getMeetings: async (limit: number = 20): Promise<ManagerMeeting[]> => {
        const snap = await db.collection('managerMeetings').orderBy('date', 'desc').limit(limit).get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as ManagerMeeting));
    },

    createMeeting: async (meeting: ManagerMeeting): Promise<ManagerMeeting> => {
        const ref = await db.collection('managerMeetings').add(meeting);
        return { ...meeting, id: ref.id };
    },

    updateMeeting: async (id: string, data: Partial<ManagerMeeting>) => {
        return await db.collection('managerMeetings').doc(id).update(data);
    },

    deleteMeeting: async (id: string) => {
        // 1. Delete the meeting document
        await db.collection('managerMeetings').doc(id).delete();
        
        // 2. Cleanup: Delete all action items associated with this meeting
        const actionSnap = await db.collection('managerActionItems').where('originMeetingId', '==', id).get();
        const batch = db.batch();
        actionSnap.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        return await batch.commit();
    },

    getMeetingActions: async (meetingId: string): Promise<MeetingActionItem[]> => {
        const snap = await db.collection('managerActionItems').where('originMeetingId', '==', meetingId).get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as MeetingActionItem));
    },

    getOpenActions: async (): Promise<MeetingActionItem[]> => {
        const snap = await db.collection('managerActionItems').where('status', '==', 'OPEN').get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as MeetingActionItem));
    },

    createAction: async (action: MeetingActionItem): Promise<string> => {
        const ref = await db.collection('managerActionItems').add(action);
        return ref.id;
    },

    updateActionStatus: async (id: string, status: 'OPEN' | 'DONE') => {
        return await db.collection('managerActionItems').doc(id).update({ status });
    },

    getRecurringAgenda: async (): Promise<MeetingAgendaItem[]> => {
        const snap = await db.collection('managerRecurringAgenda').where('active', '==', true).get();
        return snap.docs.map(d => ({
            id: `recurring_${d.id}_${Date.now()}`,
            text: d.data().text,
            isDiscussed: false,
            addedBy: 'System (Recurring)'
        }));
    },

    addRecurringAgenda: async (text: string, addedBy: string) => {
        return await db.collection('managerRecurringAgenda').add({
            text,
            addedBy,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            active: true
        });
    },

    getCrew: async (): Promise<CrewMember[]> => {
        const snap = await db.collection('crew').where('active', '==', true).get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as CrewMember));
    }
};
