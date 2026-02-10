
import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebaseConfig';
import { Button } from './SharedComponents';
import { LogOut, ArrowLeft, Grid, CheckCircle, ClipboardList, Users, Store as StoreIcon, ShieldCheck, CalendarClock, Calendar, Briefcase, Lock, FileBarChart, Trophy, MessageSquare, Settings as SettingsIcon, BookOpen } from 'lucide-react';
import { MODULE_IDS, CurrentUser, AccessConfig } from '../types';
import { OrderAdminView } from '../modules/admin/orders/OrderAdminView'; 
import { TaskAdminView } from '../modules/admin/tasks/TaskAdminView'; 
import { EmployeeAdminView } from '../modules/admin/employees/EmployeeAdminView'; 
import { StoreAdminView } from '../modules/admin/stores/StoreAdminView';
import { AccessAdminView } from '../modules/admin/access/AccessAdminView'; 
import { AttendanceAdminView } from '../modules/admin/attendance/AttendanceAdminView'; 
import { ShiftAdminView } from '../modules/admin/shifts/ShiftAdminView'; 
import { HRAdminView } from '../modules/admin/hr/HRAdminView'; 
import { ReportsAdminView } from '../modules/admin/reports/ReportsAdminView';
import { EOMAdminView } from '../modules/admin/eom/EOMAdminView'; 
import { ManagerMeetAdminView } from '../modules/admin/meetings/ManagerMeetAdminView'; 
import { SettingsAdminView } from '../modules/admin/settings/SettingsAdminView';
import { BluebookAdminView } from '../modules/admin/bluebook/BluebookAdminView';

interface AdminLayoutProps {
  currentUser: CurrentUser;
  onLogout: () => void;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ currentUser, onLogout }) => {
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [accessConfig, setAccessConfig] = useState<AccessConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
     // Load Access Matrix
     const loadConfig = async () => {
         try {
             const doc = await db.collection('settings').doc('accessConfig').get();
             if (doc.exists) {
                 setAccessConfig(doc.data() as AccessConfig);
             }
         } catch(e) {
             console.error("Failed to load access config", e);
         } finally {
             setIsLoading(false);
         }
     };
     loadConfig();
  }, []);

  const hasAccess = (moduleId: string): boolean => {
      if (!currentUser.accessRole) return true;
      const SUPER_ROLES = ['Super Admin', 'Admin', 'System Admin'];
      if (currentUser.accessRole.includes('Owner') || SUPER_ROLES.includes(currentUser.accessRole)) {
          return true;
      }
      if (!accessConfig) return false; 
      const allowedRoles = accessConfig[moduleId];
      if (allowedRoles === undefined) return false;
      return allowedRoles.includes(currentUser.accessRole);
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-emerald-600 font-bold">Loading Admin Hub...</div>;

  if (!activeModule) {
    return (
      <div className="min-h-screen bg-emerald-50/50 p-6">
        <header className="max-w-6xl mx-auto flex justify-between items-center mb-12 py-4">
          <div>
             <h1 className="text-3xl font-bold text-slate-800">Admin Hub</h1>
             <p className="text-slate-500">
                Welcome, {currentUser.name} 
                {currentUser.accessRole && <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5 rounded ml-2">{currentUser.accessRole}</span>}
             </p>
          </div>
          <Button variant="secondary" className="!w-auto" onClick={onLogout}>
             <LogOut className="w-4 h-4 mr-2"/> Logout
          </Button>
        </header>
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {hasAccess(MODULE_IDS.ACCURACY) && <ModuleCard title="Order Accuracy" icon={<CheckCircle/>} color="bg-emerald-500" onClick={() => setActiveModule(MODULE_IDS.ACCURACY)}/>}
           {hasAccess(MODULE_IDS.TASKS) && <ModuleCard title="Task Manager" icon={<ClipboardList/>} color="bg-indigo-500" onClick={() => setActiveModule(MODULE_IDS.TASKS)}/>}
           {hasAccess(MODULE_IDS.EMPLOYEE) && <ModuleCard title="Employees" icon={<Users/>} color="bg-cyan-500" onClick={() => setActiveModule(MODULE_IDS.EMPLOYEE)}/>}
           {hasAccess(MODULE_IDS.SHIFTS) && <ModuleCard title="Shift Management" icon={<Calendar/>} color="bg-blue-500" onClick={() => setActiveModule(MODULE_IDS.SHIFTS)}/>}
           {hasAccess(MODULE_IDS.BLUEBOOK) && <ModuleCard title="Bluebook Training" icon={<BookOpen/>} color="bg-blue-700" onClick={() => setActiveModule(MODULE_IDS.BLUEBOOK)}/>}
           {hasAccess(MODULE_IDS.ATTENDANCE) && <ModuleCard title="Attendance" icon={<CalendarClock/>} color="bg-orange-500" onClick={() => setActiveModule(MODULE_IDS.ATTENDANCE)}/>}
           {hasAccess(MODULE_IDS.MANAGER_MEET) && <ModuleCard title="Manager Meetings" icon={<MessageSquare/>} color="bg-teal-600" onClick={() => setActiveModule(MODULE_IDS.MANAGER_MEET)}/>}
           {hasAccess(MODULE_IDS.REPORTS) && <ModuleCard title="Reports" icon={<FileBarChart/>} color="bg-pink-600" onClick={() => setActiveModule(MODULE_IDS.REPORTS)}/>}
           {hasAccess(MODULE_IDS.EOM) && <ModuleCard title="Emp. of Month" icon={<Trophy/>} color="bg-amber-500" onClick={() => setActiveModule(MODULE_IDS.EOM)}/>}
           {hasAccess(MODULE_IDS.HR) && <ModuleCard title="HR & Letters" icon={<Briefcase/>} color="bg-pink-400" onClick={() => setActiveModule(MODULE_IDS.HR)}/>}
           {hasAccess(MODULE_IDS.STORES) && <ModuleCard title="Stores" icon={<StoreIcon/>} color="bg-purple-500" onClick={() => setActiveModule(MODULE_IDS.STORES)}/>}
           {hasAccess(MODULE_IDS.SETTINGS) && <ModuleCard title="System Maint." icon={<SettingsIcon/>} color="bg-slate-700" onClick={() => setActiveModule(MODULE_IDS.SETTINGS)}/>}
           {hasAccess('ACCESS') && <ModuleCard title="Access" icon={<ShieldCheck/>} color="bg-rose-500" onClick={() => setActiveModule('ACCESS')}/>}
        </div>
      </div>
    );
  }

  if (activeModule !== 'ACCESS' && !hasAccess(activeModule)) {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
              <Lock className="w-16 h-16 text-slate-300 mb-4"/>
              <h2 className="text-2xl font-bold text-slate-800">Access Denied</h2>
              <p className="text-slate-500 mb-6">You do not have permission to view the {activeModule} module.</p>
              <Button onClick={() => setActiveModule(null)} className="!w-auto">Back to Dashboard</Button>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-emerald-50/50 pb-24 md:pb-0">
       <nav className="bg-white border-b border-emerald-100 sticky top-0 z-20 px-6 py-4 flex justify-between items-center shadow-sm">
          <div className="flex items-center gap-4">
             <button onClick={() => setActiveModule(null)} className="p-2 hover:bg-slate-100 rounded-xl"><ArrowLeft/></button>
             <h1 className="font-bold text-xl">{activeModule === MODULE_IDS.EOM ? 'Employee of the Month' : activeModule === MODULE_IDS.MANAGER_MEET ? 'Manager Meetings' : activeModule}</h1>
          </div>
          <Button variant="secondary" className="!w-auto !text-xs" onClick={onLogout}>Logout</Button>
       </nav>
       <div className="animate-in fade-in">
          {activeModule === MODULE_IDS.ACCURACY && <OrderAdminView />}
          {activeModule === MODULE_IDS.TASKS && <TaskAdminView />}
          {activeModule === MODULE_IDS.EMPLOYEE && <EmployeeAdminView currentUser={currentUser} />}
          {activeModule === MODULE_IDS.SHIFTS && <ShiftAdminView />}
          {activeModule === MODULE_IDS.BLUEBOOK && <BluebookAdminView />}
          {activeModule === MODULE_IDS.HR && <HRAdminView />}
          {activeModule === MODULE_IDS.REPORTS && <ReportsAdminView />}
          {activeModule === MODULE_IDS.EOM && <EOMAdminView />}
          {activeModule === MODULE_IDS.MANAGER_MEET && <ManagerMeetAdminView currentUser={currentUser} />}
          {activeModule === MODULE_IDS.STORES && <StoreAdminView />}
          {activeModule === MODULE_IDS.SETTINGS && <SettingsAdminView />}
          {activeModule === 'ACCESS' && <AccessAdminView />}
          {activeModule === MODULE_IDS.ATTENDANCE && <AttendanceAdminView launchKiosk={() => window.open(`${window.location.origin}?mode=kiosk`, '_blank')} />}
       </div>
    </div>
  );
};

const ModuleCard = ({ title, icon, color, onClick }: any) => (
  <div onClick={onClick} className="bg-white p-6 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer border border-slate-100">
     <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 text-white shadow-lg ${color}`}>
        {React.cloneElement(icon, { className: 'w-8 h-8' })}
     </div>
     <h3 className="text-xl font-bold text-slate-800">{title}</h3>
  </div>
);
