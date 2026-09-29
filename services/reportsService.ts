
import { db } from '../firebaseConfig';
import { Store, CrewMember, AppConfig, ShiftAssignment, AttendanceLog, TaskLog, Task, CafeHoliday } from '../types';
import { getCachedSettingsDoc } from './configCache';
import { storeService } from './storeService';
import { currentTenantId, withTenant } from './tenantScope';

export const reportsService = {
    getStores: async (): Promise<Store[]> => {
        return storeService.getActiveStores(await currentTenantId());
    },

    getCrew: async (): Promise<CrewMember[]> => {
        const tenantId = await currentTenantId();
        const snap = await withTenant(db.collection('crew').where('active', '==', true), tenantId).get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as CrewMember));
    },

    getAppConfig: async (): Promise<AppConfig | null> => {
        return (await getCachedSettingsDoc('appConfig')) as AppConfig | null;
    },

    getShifts: async (startDate: string, endDate: string): Promise<ShiftAssignment[]> => {
        const tenantId = await currentTenantId();
        const [snap, activeOutletIds] = await Promise.all([
            withTenant(db.collection('shiftAssignments').where('date', '>=', startDate).where('date', '<=', endDate), tenantId).get(),
            storeService.getActiveOutletIds(tenantId)
        ]);
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as ShiftAssignment)).filter(assignment => activeOutletIds.has(assignment.outletId));
    },

    getAttendanceLogs: async (start: Date, end: Date): Promise<AttendanceLog[]> => {
        const tenantId = await currentTenantId();
        const [snap, activeOutletIds] = await Promise.all([
            withTenant(db.collection('attendanceLogs').where('timestamp', '>=', start).where('timestamp', '<=', end), tenantId).get(),
            storeService.getActiveOutletIds(tenantId)
        ]);
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as AttendanceLog)).filter(log => activeOutletIds.has(log.outletId));
    },

    getTaskLogs: async (start: Date, end: Date, outletId: string): Promise<TaskLog[]> => {
        const tenantId = await currentTenantId();
        let query = withTenant(db.collection('taskLogs')
            .where('completedAt', '>=', start)
            .where('completedAt', '<=', end), tenantId);
        
        if (outletId !== 'ALL') {
            query = query.where('outletId', '==', outletId);
        }

        const [snap, activeOutletIds] = await Promise.all([query.get(), storeService.getActiveOutletIds(tenantId)]);
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as TaskLog)).filter(log => activeOutletIds.has(log.outletId));
    },

    getTasks: async (): Promise<Task[]> => {
        const tenantId = await currentTenantId();
        const [snap, activeOutletIds] = await Promise.all([withTenant(db.collection('tasks'), tenantId).get(), storeService.getActiveOutletIds(tenantId)]);
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as Task)).filter(task => activeOutletIds.has(task.outletId));
    },

    getHolidays: async (): Promise<CafeHoliday[]> => {
        const tenantId = await currentTenantId();
        const snap = await withTenant(db.collection('cafeHolidays'), tenantId).get();
        return snap.docs.map(d => ({ ...d.data(), id: d.id } as CafeHoliday));
    }
};
