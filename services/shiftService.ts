
import { db, firebase } from '../firebaseConfig';
import { Shift, ShiftAssignment, CafeHoliday, CrewMember, Store, LeaveRequest } from '../types';
import { storeService } from './storeService';
import { currentTenantContext, currentTenantId, isTenantWideMember, tenantPayload, withTenant } from './tenantScope';

// Firestore rules evaluate the query, not the client-side filter. A Store
// Manager therefore needs an outlet-constrained query for every collection
// that has outlet-scoped read rules. Without this, one failing crew/leaves
// query prevents Shift Management from loading its store selector at all.
const scopeByAllowedOutlets = async (query: firebase.firestore.Query, tenantId?: string) => {
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

export const shiftService = {
    // --- DEFINITIONS ---
    getShifts: async (): Promise<Shift[]> => {
        const tenantId = await currentTenantId();
        const [snap, activeOutletIds] = await Promise.all([(await scopeByAllowedOutlets(db.collection('shifts'), tenantId)).get(), storeService.getActiveOutletIds(tenantId)]);
        return snap.docs.map(d => ({...d.data(), id: d.id} as Shift)).filter(shift => activeOutletIds.has(shift.outletId));
    },

    saveShift: async (shift: Partial<Shift>, id?: string) => {
        const payload = await tenantPayload(shift);
        if (id) {
            return await db.collection('shifts').doc(id).update(payload);
        }
        return await db.collection('shifts').add(payload);
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
        const tenantId = await currentTenantId();
        let query: firebase.firestore.Query = await scopeByAllowedOutlets(db.collection('shiftAssignments'), tenantId);
        if (startDate) query = query.where('date', '>=', startDate);
        if (endDate) query = query.where('date', '<=', endDate);
        const [snap, activeOutletIds] = await Promise.all([query.get(), storeService.getActiveOutletIds(tenantId)]);
        return snap.docs.map(d => ({...d.data(), id: d.id} as ShiftAssignment)).filter(assignment => activeOutletIds.has(assignment.outletId));
    },

    getUserAssignments: async (crewId: string): Promise<ShiftAssignment[]> => {
        const tenantId = await currentTenantId();
        const [snap, activeOutletIds] = await Promise.all([
            (await scopeByAllowedOutlets(db.collection('shiftAssignments').where('crewId', '==', crewId), tenantId)).get(),
            storeService.getActiveOutletIds(tenantId)
        ]);
        return snap.docs.map(d => ({...d.data(), id: d.id} as ShiftAssignment)).filter(assignment => activeOutletIds.has(assignment.outletId));
    },

    // NEW: Get the Pilot for a specific store and date
    getDailyPilot: async (outletId: string, dateStr: string): Promise<ShiftAssignment | null> => {
        const tenantId = await currentTenantId();
        const snap = await withTenant(db.collection('shiftAssignments')
            .where('outletId', '==', outletId)
            .where('date', '==', dateStr)
            .where('isPilot', '==', true), tenantId)
            .limit(1)
            .get();
        
        if (snap.empty) return null;
        return { ...snap.docs[0].data(), id: snap.docs[0].id } as ShiftAssignment;
    },

    assignShift: async (assignment: ShiftAssignment) => {
        return await db.collection('shiftAssignments').add(await tenantPayload(assignment));
    },

    deleteAssignment: async (id: string) => {
        return await db.collection('shiftAssignments').doc(id).delete();
    },

    // Bulk Copy Logic
    bulkAssignShifts: async (assignments: ShiftAssignment[]) => {
        const batch = db.batch();
        const tenantId = await currentTenantId();
        assignments.forEach(a => {
            const ref = db.collection('shiftAssignments').doc();
            batch.set(ref, tenantId ? { ...a, tenantId } : a);
        });
        return await batch.commit();
    },

    // --- HOLIDAYS ---
    getHolidays: async (): Promise<CafeHoliday[]> => {
        const tenantId = await currentTenantId();
        const snap = await withTenant(db.collection('cafeHolidays'), tenantId).get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as CafeHoliday));
    },

    addHoliday: async (holiday: Partial<CafeHoliday>) => {
        return await db.collection('cafeHolidays').add(await tenantPayload(holiday));
    },

    deleteHoliday: async (id: string) => {
        return await db.collection('cafeHolidays').doc(id).delete();
    },

    // --- CONTEXT HELPERS ---
    getContextData: async () => {
        const tenantId = await currentTenantId();
        const [cSnap, stores, lSnap] = await Promise.all([
            (await scopeByAllowedOutlets(db.collection('crew').where('active', '==', true), tenantId)).get(),
            storeService.getActiveStores(tenantId),
            (await scopeByAllowedOutlets(db.collection('leaveRequests').where('status', '==', 'APPROVED'), tenantId)).get()
        ]);

        return {
            crew: cSnap.docs.map(d => ({...d.data(), id: d.id} as CrewMember)),
            stores,
            leaves: lSnap.docs.map(d => ({...d.data(), id: d.id} as LeaveRequest))
        };
    }
};
