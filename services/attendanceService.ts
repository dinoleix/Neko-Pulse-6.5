
import { auth, db, firebase } from '../firebaseConfig';
import { AttendanceLog, LeaveRequest, AttendanceConfig, CrewMember, ShiftAssignment, AppConfig } from '../types';
import { getCachedSettingsDoc } from './configCache';
import { storeService } from './storeService';
// @fix: Removed parseISO from date-fns as it's not exported in the available version
import { differenceInDays } from 'date-fns';
import { isTenantModeEnabled, tenantService } from './tenantService';
import { currentTenantWriteId } from './tenantScope';

const currentTenantId = async (): Promise<string | undefined> => {
    if (!isTenantModeEnabled) return undefined;
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Please sign in to access this business data.');
    const membership = await tenantService.getActiveMembership(uid);
    if (!membership) throw new Error('No active business membership was found.');
    return membership.tenantId;
};

const withTenant = (query: firebase.firestore.Query, tenantId?: string) =>
    tenantId ? query.where('tenantId', '==', tenantId) : query;

const tenantPayload = async <T extends object>(payload: T) => {
    const tenantId = await currentTenantWriteId();
    return tenantId ? { ...payload, tenantId } : payload;
};

// @fix: Implemented local parseISO helper to handle YYYY-MM-DD strings in local timezone
const parseISO = (str: string) => {
  if(!str) return new Date();
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const attendanceService = {
    // --- ADMIN: DATA FETCHING ---
    // `since` bounds the read to the window the caller actually renders —
    // without it every admin view open pays for the full `limit`.
    getAllLogs: async (limit: number = 1000, since?: Date): Promise<AttendanceLog[]> => {
        const tenantId = await currentTenantId();
        let query: firebase.firestore.Query = withTenant(db.collection('attendanceLogs'), tenantId);
        if (since) query = query.where('timestamp', '>=', since);
        const snap = await query.orderBy('timestamp', 'desc').limit(limit).get();
        // Store closure stops new operational use, not access to the
        // attendance audit trail. Older logs can also use a legacy outlet ID,
        // so filtering against today's active-store list hid valid records.
        return snap.docs.map(d => ({...d.data(), id: d.id} as AttendanceLog));
    },

    // Limit is a guardrail, not a filter: leave volume is small, but the
    // collection grows forever and balances only need leaves after each
    // member's reset date, which recent-first ordering preserves in practice.
    getAllLeaves: async (limit: number = 1000): Promise<LeaveRequest[]> => {
        const tenantId = await currentTenantId();
        const [snap, activeOutletIds] = await Promise.all([
            withTenant(db.collection('leaveRequests'), tenantId).orderBy('appliedAt', 'desc').limit(limit).get(),
            storeService.getActiveOutletIds(tenantId)
        ]);
        return snap.docs.map(d => ({...d.data(), id: d.id} as LeaveRequest)).filter(request => activeOutletIds.has(request.outletId));
    },

    // One doc per crew member per day — unbounded, this was the single
    // biggest read on the admin attendance screen.
    getAllShifts: async (sinceDate?: string): Promise<ShiftAssignment[]> => {
        const tenantId = await currentTenantId();
        let query: firebase.firestore.Query = withTenant(db.collection('shiftAssignments'), tenantId);
        if (sinceDate) query = query.where('date', '>=', sinceDate);
        const [snap, activeOutletIds] = await Promise.all([query.get(), storeService.getActiveOutletIds(tenantId)]);
        return snap.docs.map(d => ({...d.data(), id: d.id} as ShiftAssignment)).filter(assignment => activeOutletIds.has(assignment.outletId));
    },

    // --- CONFIG ---
    getConfig: async (): Promise<AttendanceConfig | null> => {
        const tenantId = await currentTenantId();
        const ref = tenantId ? db.collection('tenantSettings').doc(tenantId).collection('config').doc('attendanceConfig') : db.collection('settings').doc('attendanceConfig');
        const snap = await ref.get();
        return snap.exists ? (snap.data() as AttendanceConfig) : null;
    },

    saveConfig: async (config: any) => {
        const tenantId = await currentTenantId();
        const ref = tenantId ? db.collection('tenantSettings').doc(tenantId).collection('config').doc('attendanceConfig') : db.collection('settings').doc('attendanceConfig');
        return await ref.set(config, { merge: true });
    },

    getAppConfig: async (): Promise<AppConfig | null> => {
        const tenantId = await currentTenantId();
        if (tenantId) {
            const snap = await db.collection('tenantSettings').doc(tenantId).collection('config').doc('appConfig').get();
            return snap.exists ? (snap.data() as AppConfig) : null;
        }
        return (await getCachedSettingsDoc('appConfig')) as AppConfig | null;
    },

    // --- LEAVE MANAGEMENT ---
    updateLeaveStatus: async (id: string, status: 'APPROVED' | 'REJECTED') => {
        return await db.collection('leaveRequests').doc(id).update({ status });
    },

    deleteLeave: async (id: string) => {
        return await db.collection('leaveRequests').doc(id).delete();
    },

    submitLeave: async (request: Omit<LeaveRequest, 'id' | 'appliedAt'>) => {
        const payload = await tenantPayload(request);
        return await db.collection('leaveRequests').add({
            ...payload,
            appliedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    // --- CALCULATION ENGINE ---
    calculateLeaveBalance: (crew: CrewMember, approvedLeaves: LeaveRequest[]) => {
        // Initial state is 0. 
        // PRO-RATA Accrual logic: 1.5 days for every 31-day period, calculated daily.
        
        let baseBalance = 0;
        let baseDateStr = crew.dateOfJoining;

        // If override is present, it replaces everything calculated so far
        if (crew.leaveBalanceOverride !== undefined && crew.leaveBalanceOverride !== null) {
            baseBalance = crew.leaveBalanceOverride;
            // Use the date the override was set, or default to joining if not tracked yet
            baseDateStr = crew.leaveBalanceOverrideDate || crew.dateOfJoining;
        }

        if (!baseDateStr) return 0;

        const baseDate = parseISO(baseDateStr);
        const today = new Date();

        // Inactive employees stop accruing on their relieving date — their balance
        // freezes at whatever it was the day they left and never grows again.
        let accrualEnd = today;
        if (crew.dateOfLeaving) {
            const leftDate = parseISO(crew.dateOfLeaving);
            if (leftDate < today) accrualEnd = leftDate;
        }

        // Calculate Days Passed since Reset Point
        const daysElapsed = differenceInDays(accrualEnd, baseDate);
        if (daysElapsed <= 0) return baseBalance;

        // Calculate Accrual: Pro-rata daily growth
        // Formula: Base + (Days * (1.5 / 31))
        const dailyRate = 1.5 / 31;
        const totalAccrued = baseBalance + (daysElapsed * dailyRate);

        // Calculate Taken: Subtract approved leaves that happen AFTER the base date
        const takenDays = approvedLeaves
            .filter(l => l.crewId === crew.id || l.crewId === crew.authUid)
            .filter(l => l.status === 'APPROVED')
            .filter(l => parseISO(l.startDate) >= baseDate)
            .reduce((acc, l) => {
                const duration = differenceInDays(parseISO(l.endDate), parseISO(l.startDate)) + 1;
                return acc + duration;
            }, 0);

        const finalBalance = totalAccrued - takenDays;
        
        // Return rounded to 2 decimal places to prevent float precision issues in UI
        return Math.max(0, Number(finalBalance.toFixed(2)));
    },

    // --- CREW: SPECIFIC FETCHING ---
    getCrewLogs: async (crewId: string, limit: number = 20, altId?: string): Promise<AttendanceLog[]> => {
        const tenantId = await currentTenantId();
        // Server-side ordering + limit so we read at most `limit` docs (×2 if a
        // legacy altId is also queried), instead of the crew member's whole history.
        // Requires composite index: attendanceLogs (crewId ASC, timestamp DESC).
        const fetch = (id: string) => withTenant(db.collection('attendanceLogs').where('crewId', '==', id), tenantId)
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();

        const snaps = await Promise.all(
            altId && altId !== crewId ? [fetch(crewId), fetch(altId)] : [fetch(crewId)]
        );

        const seen = new Set<string>();
        const logs: AttendanceLog[] = [];
        snaps.forEach(snap => snap.docs.forEach(d => {
            if (!seen.has(d.id)) {
                seen.add(d.id);
                logs.push({ ...d.data(), id: d.id } as AttendanceLog);
            }
        }));

        logs.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        return logs.slice(0, limit);
    },

    getCrewLeaves: async (crewId: string, limit: number = 20, altId?: string): Promise<LeaveRequest[]> => {
        const tenantId = await currentTenantId();
        // Server-side ordering + limit (composite index: leaveRequests
        // crewId ASC, appliedAt DESC) instead of reading the member's whole
        // leave history and slicing client-side.
        const fetch = (id: string) => withTenant(db.collection('leaveRequests').where('crewId', '==', id), tenantId)
            .orderBy('appliedAt', 'desc')
            .limit(limit)
            .get();

        const snaps = await Promise.all(
            altId && altId !== crewId ? [fetch(crewId), fetch(altId)] : [fetch(crewId)]
        );

        const seen = new Set<string>();
        const leaves: LeaveRequest[] = [];
        snaps.forEach(snap => snap.docs.forEach(d => {
            if (!seen.has(d.id)) {
                seen.add(d.id);
                leaves.push({ ...d.data(), id: d.id } as LeaveRequest);
            }
        }));

        leaves.sort((a, b) => (b.appliedAt?.seconds || 0) - (a.appliedAt?.seconds || 0));
        return leaves.slice(0, limit);
    },

    getCrewShifts: async (dbId?: string, uid?: string): Promise<ShiftAssignment[]> => {
        const tenantId = await currentTenantId();
        let fetchedShifts: ShiftAssignment[] = [];
        if (dbId) {
            const s1 = await withTenant(db.collection('shiftAssignments').where('crewId', '==', dbId), tenantId).get();
            fetchedShifts = [...fetchedShifts, ...s1.docs.map(d => d.data() as ShiftAssignment)];
        }
        if (uid && uid !== dbId) {
            const s2 = await withTenant(db.collection('shiftAssignments').where('crewId', '==', uid), tenantId).get();
            const s2Data = s2.docs.map(d => d.data() as ShiftAssignment);
            const existingKeys = new Set(fetchedShifts.map(s => `${s.date}_${s.shiftName}`));
            s2Data.forEach(s => {
                if (!existingKeys.has(`${s.date}_${s.shiftName}`)) fetchedShifts.push(s);
            });
        }
        return fetchedShifts;
    },

    // --- ATTENDANCE ACTIONS ---
    logAttendance: async (data: any) => {
        const payload = await tenantPayload(data);
        return await db.collection('attendanceLogs').add({
            ...payload,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    // --- CONTEXT ---
    getCrew: async (): Promise<CrewMember[]> => {
        const tenantId = await currentTenantId();
        const snap = await withTenant(db.collection('crew'), tenantId).get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as CrewMember));
    }
};
