
import { db, firebase } from '../firebaseConfig';
import { AttendanceLog, LeaveRequest, AttendanceConfig, CrewMember, ShiftAssignment, AppConfig } from '../types';
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
    getAllLogs: async (limit: number = 1000): Promise<AttendanceLog[]> => {
        const snap = await db.collection('attendanceLogs').orderBy('timestamp', 'desc').limit(limit).get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as AttendanceLog));
    },

    getAllLeaves: async (): Promise<LeaveRequest[]> => {
        const snap = await db.collection('leaveRequests').orderBy('appliedAt', 'desc').get();
        return snap.docs.map(d => ({...d.data(), id: d.id} as LeaveRequest));
    },

    getAllShifts: async (): Promise<ShiftAssignment[]> => {
        const snap = await db.collection('shiftAssignments').get();
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
        const snap = await db.collection('settings').doc('appConfig').get();
        return snap.exists ? (snap.data() as AppConfig) : null;
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

        // Calculate Days Passed since Reset Point
        const daysElapsed = differenceInDays(today, baseDate);
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
    getCrewLogs: async (crewId: string, limit: number = 20): Promise<AttendanceLog[]> => {
        const snap = await db.collection('attendanceLogs')
            .where('crewId', '==', crewId)
            .get();
            
        let logs = snap.docs.map(d => ({...d.data(), id: d.id} as AttendanceLog));
        
        logs.sort((a, b) => {
            const tA = a.timestamp?.seconds || 0;
            const tB = b.timestamp?.seconds || 0;
            return tB - tA;
        });
        
        return logs.slice(0, limit);
    },

    getCrewLeaves: async (crewId: string, limit: number = 20): Promise<LeaveRequest[]> => {
        const snap = await db.collection('leaveRequests')
            .where('crewId', '==', crewId)
            .get();
            
        let leaves = snap.docs.map(d => ({...d.data(), id: d.id} as LeaveRequest));
        
        leaves.sort((a, b) => {
            const tA = a.appliedAt?.seconds || 0;
            const tB = b.appliedAt?.seconds || 0;
            return tB - tA;
        });
        
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
