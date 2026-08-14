
import { db, firebase } from '../firebaseConfig';
import { Shift, ShiftAssignment, CafeHoliday, CrewMember, Store, LeaveRequest } from '../types';

export const shiftService = {
    // --- DEFINITIONS ---
    getShifts: async (): Promise<Shift[]> => {
        const snap = await db.collection('shifts').get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as Shift));
    },

    saveShift: async (shift: Partial<Shift>, id?: string) => {
        if (id) {
            return await db.collection('shifts').doc(id).update(shift);
        }
        return await db.collection('shifts').add(shift);
    },

    deleteShift: async (id: string) => {
        return await db.collection('shifts').doc(id).delete();
    },

    // --- ASSIGNMENTS (ROSTER) ---
    // Bounded by date because shiftAssignments grows forever (one doc per crew
    // member per day) while every caller only renders a week or a month. Left
    // unbounded this was by far the largest read on the whole app. `date` is a
    // plain YYYY-MM-DD string, so the range uses the automatic single-field
    // index — no composite index needed.
    getAllAssignments: async (startDate?: string, endDate?: string): Promise<ShiftAssignment[]> => {
        let query: firebase.firestore.Query = db.collection('shiftAssignments');
        if (startDate) query = query.where('date', '>=', startDate);
        if (endDate) query = query.where('date', '<=', endDate);
        const snap = await query.get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as ShiftAssignment));
    },

    getUserAssignments: async (crewId: string): Promise<ShiftAssignment[]> => {
        const snap = await db.collection('shiftAssignments').where('crewId', '==', crewId).get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as ShiftAssignment));
    },

    // NEW: Get the Pilot for a specific store and date
    getDailyPilot: async (outletId: string, dateStr: string): Promise<ShiftAssignment | null> => {
        const snap = await db.collection('shiftAssignments')
            .where('outletId', '==', outletId)
            .where('date', '==', dateStr)
            .where('isPilot', '==', true)
            .limit(1)
            .get();
        
        if (snap.empty) return null;
        return { ...snap.docs[0].data(), id: snap.docs[0].id } as ShiftAssignment;
    },

    assignShift: async (assignment: ShiftAssignment) => {
        return await db.collection('shiftAssignments').add(assignment);
    },

    deleteAssignment: async (id: string) => {
        return await db.collection('shiftAssignments').doc(id).delete();
    },

    // Bulk Copy Logic
    bulkAssignShifts: async (assignments: ShiftAssignment[]) => {
        const batch = db.batch();
        assignments.forEach(a => {
            const ref = db.collection('shiftAssignments').doc();
            batch.set(ref, a);
        });
        return await batch.commit();
    },

    // --- HOLIDAYS ---
    getHolidays: async (): Promise<CafeHoliday[]> => {
        const snap = await db.collection('cafeHolidays').get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as CafeHoliday));
    },

    addHoliday: async (holiday: Partial<CafeHoliday>) => {
        return await db.collection('cafeHolidays').add(holiday);
    },

    deleteHoliday: async (id: string) => {
        return await db.collection('cafeHolidays').doc(id).delete();
    },

    // --- CONTEXT HELPERS ---
    getContextData: async () => {
        const [cSnap, sSnap, lSnap] = await Promise.all([
            db.collection('crew').where('active', '==', true).get(),
            db.collection('stores').where('isActive', '==', true).get(),
            db.collection('leaveRequests').where('status', '==', 'APPROVED').get()
        ]);

        return {
            crew: cSnap.docs.map(d => ({...d.data(), id: d.id} as CrewMember)),
            stores: sSnap.docs.map(d => ({...d.data(), id: d.id} as Store)),
            leaves: lSnap.docs.map(d => ({...d.data(), id: d.id} as LeaveRequest))
        };
    }
};
