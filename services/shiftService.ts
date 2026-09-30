
import { db, firebase } from '../firebaseConfig';
import { Shift, ShiftAssignment, CafeHoliday, CrewMember, Store, LeaveRequest } from '../types';
import { storeService } from './storeService';
import { withLegacyTenant } from './legacyTenantWrite';

export const shiftService = {
    // --- DEFINITIONS ---
    getShifts: async (): Promise<Shift[]> => {
        const [snap, activeOutletIds] = await Promise.all([db.collection('shifts').get(), storeService.getActiveOutletIds()]);
        return snap.docs.map(d => ({...d.data(), id: d.id} as Shift)).filter(shift => activeOutletIds.has(shift.outletId));
    },

    saveShift: async (shift: Partial<Shift>, id?: string) => {
        if (id) {
            return await db.collection('shifts').doc(id).update(withLegacyTenant(shift));
        }
        return await db.collection('shifts').add(withLegacyTenant(shift));
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
        const [snap, activeOutletIds] = await Promise.all([query.get(), storeService.getActiveOutletIds()]);
        return snap.docs.map(d => ({...d.data(), id: d.id} as ShiftAssignment)).filter(assignment => activeOutletIds.has(assignment.outletId));
    },

    getUserAssignments: async (crewId: string): Promise<ShiftAssignment[]> => {
        const [snap, activeOutletIds] = await Promise.all([
            db.collection('shiftAssignments').where('crewId', '==', crewId).get(),
            storeService.getActiveOutletIds()
        ]);
        return snap.docs.map(d => ({...d.data(), id: d.id} as ShiftAssignment)).filter(assignment => activeOutletIds.has(assignment.outletId));
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
        return await db.collection('shiftAssignments').add(withLegacyTenant(assignment));
    },

    deleteAssignment: async (id: string) => {
        return await db.collection('shiftAssignments').doc(id).delete();
    },

    // Bulk Copy Logic
    bulkAssignShifts: async (assignments: ShiftAssignment[]) => {
        const batch = db.batch();
        assignments.forEach(a => {
            const ref = db.collection('shiftAssignments').doc();
            batch.set(ref, withLegacyTenant(a));
        });
        return await batch.commit();
    },

    // --- HOLIDAYS ---
    getHolidays: async (): Promise<CafeHoliday[]> => {
        const snap = await db.collection('cafeHolidays').get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as CafeHoliday));
    },

    addHoliday: async (holiday: Partial<CafeHoliday>) => {
        return await db.collection('cafeHolidays').add(withLegacyTenant(holiday));
    },

    deleteHoliday: async (id: string) => {
        return await db.collection('cafeHolidays').doc(id).delete();
    },

    // --- CONTEXT HELPERS ---
    getContextData: async () => {
        const [cSnap, stores, lSnap] = await Promise.all([
            db.collection('crew').where('active', '==', true).get(),
            storeService.getActiveStores(),
            db.collection('leaveRequests').where('status', '==', 'APPROVED').get()
        ]);

        return {
            crew: cSnap.docs.map(d => ({...d.data(), id: d.id} as CrewMember)),
            stores,
            leaves: lSnap.docs.map(d => ({...d.data(), id: d.id} as LeaveRequest))
        };
    }
};
