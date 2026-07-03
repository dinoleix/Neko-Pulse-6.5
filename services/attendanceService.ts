
import { db, firebase } from '../firebaseConfig';
import { AttendanceLog, LeaveRequest, AttendanceConfig, CrewMember, ShiftAssignment, AppConfig } from '../types';
import { getCachedSettingsDoc } from './configCache';
// @fix: Removed parseISO from date-fns as it's not exported in the available version
import { differenceInDays } from 'date-fns';

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
        let query: firebase.firestore.Query = db.collection('attendanceLogs');
        if (since) query = query.where('timestamp', '>=', since);
        const snap = await query.orderBy('timestamp', 'desc').limit(limit).get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as AttendanceLog));
    },

    // Limit is a guardrail, not a filter: leave volume is small, but the
    // collection grows forever and balances only need leaves after each
    // member's reset date, which recent-first ordering preserves in practice.
    getAllLeaves: async (limit: number = 1000): Promise<LeaveRequest[]> => {
        const snap = await db.collection('leaveRequests').orderBy('appliedAt', 'desc').limit(limit).get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as LeaveRequest));
    },

    // One doc per crew member per day — unbounded, this was the single
    // biggest read on the admin attendance screen.
    getAllShifts: async (sinceDate?: string): Promise<ShiftAssignment[]> => {
        let query: firebase.firestore.Query = db.collection('shiftAssignments');
        if (sinceDate) query = query.where('date', '>=', sinceDate);
        const snap = await query.get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as ShiftAssignment));
    },

    // --- CONFIG ---
    getConfig: async (): Promise<AttendanceConfig | null> => {
        const snap = await db.collection('settings').doc('attendanceConfig').get();
        return snap.exists ? (snap.data() as AttendanceConfig) : null;
    },

    saveConfig: async (config: any) => {
        return await db.collection('settings').doc('attendanceConfig').set(config, { merge: true });
    },

    getAppConfig: async (): Promise<AppConfig | null> => {
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
        return await db.collection('leaveRequests').add({
            ...request,
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
        // Server-side ordering + limit so we read at most `limit` docs (×2 if a
        // legacy altId is also queried), instead of the crew member's whole history.
        // Requires composite index: attendanceLogs (crewId ASC, timestamp DESC).
        const fetch = (id: string) => db.collection('attendanceLogs')
            .where('crewId', '==', id)
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
        // Server-side ordering + limit (composite index: leaveRequests
        // crewId ASC, appliedAt DESC) instead of reading the member's whole
        // leave history and slicing client-side.
        const fetch = (id: string) => db.collection('leaveRequests')
            .where('crewId', '==', id)
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
        let fetchedShifts: ShiftAssignment[] = [];
        if (dbId) {
            const s1 = await db.collection('shiftAssignments').where('crewId', '==', dbId).get();
            fetchedShifts = [...fetchedShifts, ...s1.docs.map(d => d.data() as ShiftAssignment)];
        }
        if (uid && uid !== dbId) {
            const s2 = await db.collection('shiftAssignments').where('crewId', '==', uid).get();
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
        return await db.collection('attendanceLogs').add({
            ...data,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    // --- CONTEXT ---
    getCrew: async (): Promise<CrewMember[]> => {
        const snap = await db.collection('crew').get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as CrewMember));
    }
};
