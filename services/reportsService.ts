
import { db } from '../firebaseConfig';
import { Store, CrewMember, AppConfig, ShiftAssignment, AttendanceLog, TaskLog, Task, CafeHoliday } from '../types';
import { getCachedSettingsDoc } from './configCache';
import { storeService } from './storeService';

export const reportsService = {
    getStores: async (): Promise<Store[]> => {
        return storeService.getActiveStores();
    },

    getCrew: async (): Promise<CrewMember[]> => {
        const snap = await db.collection('crew').where('active', '==', true).get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as CrewMember));
    },

    getAppConfig: async (): Promise<AppConfig | null> => {
        return (await getCachedSettingsDoc('appConfig')) as AppConfig | null;
    },

    getShifts: async (startDate: string, endDate: string): Promise<ShiftAssignment[]> => {
        const [snap, activeOutletIds] = await Promise.all([
            db.collection('shiftAssignments').where('date', '>=', startDate).where('date', '<=', endDate).get(),
            storeService.getActiveOutletIds()
        ]);
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as ShiftAssignment)).filter(assignment => activeOutletIds.has(assignment.outletId));
    },

    getAttendanceLogs: async (start: Date, end: Date): Promise<AttendanceLog[]> => {
        const [snap, activeOutletIds] = await Promise.all([
            db.collection('attendanceLogs').where('timestamp', '>=', start).where('timestamp', '<=', end).get(),
            storeService.getActiveOutletIds()
        ]);
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as AttendanceLog)).filter(log => activeOutletIds.has(log.outletId));
    },

    getTaskLogs: async (start: Date, end: Date, outletId: string): Promise<TaskLog[]> => {
        let query = db.collection('taskLogs')
            .where('completedAt', '>=', start)
            .where('completedAt', '<=', end);
        
        if (outletId !== 'ALL') {
            query = query.where('outletId', '==', outletId);
        }

        const [snap, activeOutletIds] = await Promise.all([query.get(), storeService.getActiveOutletIds()]);
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as TaskLog)).filter(log => activeOutletIds.has(log.outletId));
    },

    getTasks: async (): Promise<Task[]> => {
        const [snap, activeOutletIds] = await Promise.all([db.collection('tasks').get(), storeService.getActiveOutletIds()]);
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as Task)).filter(task => activeOutletIds.has(task.outletId));
    },

    getHolidays: async (): Promise<CafeHoliday[]> => {
        const snap = await db.collection('cafeHolidays').get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as CafeHoliday));
    }
};
