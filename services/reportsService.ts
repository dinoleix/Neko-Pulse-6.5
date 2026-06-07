
import { db } from '../firebaseConfig';
import { Store, CrewMember, AppConfig, ShiftAssignment, AttendanceLog, TaskLog, Task, CafeHoliday } from '../types';
import { getCachedSettingsDoc } from './configCache';

export const reportsService = {
    getStores: async (): Promise<Store[]> => {
        const snap = await db.collection('stores').get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as Store));
    },

    getCrew: async (): Promise<CrewMember[]> => {
        const snap = await db.collection('crew').where('active', '==', true).get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as CrewMember));
    },

    getAppConfig: async (): Promise<AppConfig | null> => {
        return (await getCachedSettingsDoc('appConfig')) as AppConfig | null;
    },

    getShifts: async (startDate: string, endDate: string): Promise<ShiftAssignment[]> => {
        const snap = await db.collection('shiftAssignments')
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
            .get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as ShiftAssignment));
    },

    getAttendanceLogs: async (start: Date, end: Date): Promise<AttendanceLog[]> => {
        const snap = await db.collection('attendanceLogs')
            .where('timestamp', '>=', start)
            .where('timestamp', '<=', end)
            .get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as AttendanceLog));
    },

    getTaskLogs: async (start: Date, end: Date, outletId: string): Promise<TaskLog[]> => {
        let query = db.collection('taskLogs')
            .where('completedAt', '>=', start)
            .where('completedAt', '<=', end);
        
        if (outletId !== 'ALL') {
            query = query.where('outletId', '==', outletId);
        }

        const snap = await query.get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as TaskLog));
    },

    getTasks: async (): Promise<Task[]> => {
        const snap = await db.collection('tasks').get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as Task));
    },

    getHolidays: async (): Promise<CafeHoliday[]> => {
        const snap = await db.collection('cafeHolidays').get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as CafeHoliday));
    }
};
