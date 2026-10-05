
import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebaseConfig';
import { Button } from './SharedComponents';
import { LogOut, ArrowLeft, CheckCircle, ClipboardList, Users, Store as StoreIcon, ShieldCheck, CalendarClock, Calendar, Briefcase, Lock, FileBarChart, Trophy, Settings as SettingsIcon, ChefHat, LogIn, LayoutDashboard, GraduationCap, Building2 } from 'lucide-react';
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
import { SettingsAdminView } from '../modules/admin/settings/SettingsAdminView';
import { RecipeAdminView } from '../modules/admin/recipes/RecipeAdminView';
import { LoginActivityAdminView } from '../modules/admin/loginactivity/LoginActivityAdminView';
import { DailyOverviewAdminView } from '../modules/admin/overview/DailyOverviewAdminView';
import { EmployeeDevelopmentModule } from '../modules/admin/EmployeeDevelopmentModule';
import { TrainingAdminView } from '../modules/admin/training/TrainingAdminView';
import { getCachedSettingsDoc } from '../services/configCache';
import { platformTenantService } from '../services/platformTenantService';
import { PlatformAdminView } from '../modules/admin/platform/PlatformAdminView';
import { WorkspaceWelcome } from './WorkspaceWelcome';
import { BrandMark } from './BrandMark';

interface AdminLayoutProps {
  currentUser: CurrentUser;
  onLogout: () => void;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ currentUser, onLogout }) => {
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [accessConfig, setAccessConfig] = useState<AccessConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRepairingLegacyLogins, setIsRepairingLegacyLogins] = useState(false);
  const [legacyRepairMessage, setLegacyRepairMessage] = useState<string | null>(null);
  const [isPlatformAdministrator, setIsPlatformAdministrator] = useState(false);

  useEffect(() => {
     // Load Access Matrix
     const loadConfig = async () => {
         try {
             const conf = (await getCachedSettingsDoc('accessConfig')) as AccessConfig | null;
             if (conf) {
                 setAccessConfig(conf);
             }
         } catch(e) {
             console.error("Failed to load access config", e);
         } finally {
             setIsLoading(false);
         }
     };
     loadConfig();
     platformTenantService.capability().then(setIsPlatformAdministrator).catch(() => setIsPlatformAdministrator(false));
  }, []);

  const hasAccess = (moduleId: string): boolean => {
      // A missing role denies everything (it used to grant everything), and
      // super roles are exact-match — a role merely *containing* "Owner"
      // used to unlock every module including this access matrix.
      const role = currentUser.accessRole?.trim().toLowerCase();
      if (!role) return false;
      const SUPER_ROLES = ['owner', 'super admin', 'admin', 'system admin'];
      if (SUPER_ROLES.includes(role)) return true;
      // Store Managers run training today. Keep this explicit so the Training
      // workspace remains available even if an older access-matrix document
      // does not yet include the Store Manager role.
      if (moduleId === MODULE_IDS.TRAINING && role === 'store manager') return true;
      if (moduleId === MODULE_IDS.DEVELOPMENT && role === 'store manager') return true;
      if (!accessConfig) return false;
      const allowedRoles = accessConfig[moduleId];
      if (allowedRoles === undefined) return false;
      return allowedRoles.includes(currentUser.accessRole!);
  };

  const isSecurityAdmin = ['owner', 'super admin', 'admin', 'system admin']
    .includes(currentUser.accessRole?.trim().toLowerCase() || '');

  const repairLegacyLogins = async () => {
    setIsRepairingLegacyLogins(true);
    setLegacyRepairMessage(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in again before repairing staff logins.');
      const response = await fetch('/api/repair-auth-uids', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'The repair could not be completed.');
      setLegacyRepairMessage(`${body.repaired || 0} legacy login profile${body.repaired === 1 ? '' : 's'} repaired.`);
    } catch (error: any) {
      setLegacyRepairMessage(error?.message || 'The repair could not be completed.');
    } finally {
      setIsRepairingLegacyLogins(false);
    }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-emerald-600 font-bold">Loading Admin Hub...</div>;

  if (!activeModule) {
    return (
      <div className="min-h-screen neko-shell p-4 md:p-8">
        <header className="max-w-6xl mx-auto flex justify-between items-center mb-8 md:mb-12 py-4 border-b border-[#ded9ce]">
          <div>
             <div className="flex items-center gap-1.5 mb-2"><BrandMark className="w-10 h-8"/><p className="neko-eyebrow mb-0">Neko Pulse · Operations</p></div>
             <h1 className="text-3xl md:text-4xl font-semibold text-[#123229]">Good to see you, {currentUser.name?.split(' ')[0] || 'there'}.</h1>
             <p className="text-slate-500 mt-2">
                Your café operations, in one considered place.
                {currentUser.accessRole && <span className="bg-[#e6f0e9] text-[#063b2c] text-xs font-bold px-2.5 py-1 rounded-full ml-2">{currentUser.accessRole}</span>}
             </p>
          </div>
          <Button variant="secondary" className="!w-auto" onClick={onLogout}>
             <LogOut className="w-4 h-4 mr-2"/> Logout
          </Button>
        </header>
        {currentUser.accessRole === 'Owner' && <details className="max-w-6xl mx-auto mb-6"><summary className="cursor-pointer min-h-11 py-3 font-semibold text-[#123229]">Getting started · Setup checklist & phone installation</summary><WorkspaceWelcome key={`${currentUser.tenantId}:${currentUser.uid}`} storageKey={`neko_setup:${currentUser.tenantId}:${currentUser.uid}`} onOpenModule={module => { if (hasAccess(module)) setActiveModule(module); }} /></details>}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
           {hasAccess(MODULE_IDS.REPORTS) && <ModuleCard featured title="Today’s Overview" description="Start here: see what needs attention across both stores" icon={<LayoutDashboard/>} color="bg-[#0b6b4d]" onClick={() => setActiveModule('DAILY_OVERVIEW')}/>}
           {hasAccess(MODULE_IDS.ACCURACY) && <ModuleCard title="Order Accuracy" description="Get every handoff right" icon={<CheckCircle/>} color="bg-[#0b6b4d]" onClick={() => setActiveModule(MODULE_IDS.ACCURACY)}/>}
           {hasAccess(MODULE_IDS.TASKS) && <ModuleCard title="Task Manager" description="Keep the day moving" icon={<ClipboardList/>} color="bg-[#315e97]" onClick={() => setActiveModule(MODULE_IDS.TASKS)}/>}
           {hasAccess(MODULE_IDS.EMPLOYEE) && <ModuleCard title="Employees" description="Your people, thoughtfully managed" icon={<Users/>} color="bg-[#4b7b72]" onClick={() => setActiveModule(MODULE_IDS.EMPLOYEE)}/>}
           {hasAccess(MODULE_IDS.SHIFTS) && <ModuleCard title="Shift Management" description="Plan every service" icon={<Calendar/>} color="bg-[#456a93]" onClick={() => setActiveModule(MODULE_IDS.SHIFTS)}/>}
           {hasAccess(MODULE_IDS.RECIPE) && <ModuleCard title="Kitchen Recipes" description="Protect every detail" icon={<ChefHat/>} color="bg-[#b9683f]" onClick={() => setActiveModule(MODULE_IDS.RECIPE)}/>}
           {hasAccess(MODULE_IDS.ATTENDANCE) && <ModuleCard title="Attendance" description="A clear view of the team" icon={<CalendarClock/>} color="bg-[#bd7144]" onClick={() => setActiveModule(MODULE_IDS.ATTENDANCE)}/>}
           {hasAccess(MODULE_IDS.REPORTS) && <ModuleCard title="Reports" description="See the important signals" icon={<FileBarChart/>} color="bg-[#a55261]" onClick={() => setActiveModule(MODULE_IDS.REPORTS)}/>}
           {hasAccess(MODULE_IDS.EOM) && <ModuleCard title="Emp. of Month" description="Celebrate the people who shine" icon={<Trophy/>} color="bg-[#bd8538]" onClick={() => setActiveModule(MODULE_IDS.EOM)}/>}
           {hasAccess(MODULE_IDS.HR) && <ModuleCard title="HR & Letters" description="Support the team well" icon={<Briefcase/>} color="bg-[#a55d73]" onClick={() => setActiveModule(MODULE_IDS.HR)}/>}
           {hasAccess(MODULE_IDS.STORES) && <ModuleCard title="Stores" description="Keep every outlet aligned" icon={<StoreIcon/>} color="bg-[#665b8c]" onClick={() => setActiveModule(MODULE_IDS.STORES)}/>}
           {hasAccess(MODULE_IDS.LOGIN_ACTIVITY) && <ModuleCard title="Login Activity" description="A record of daily access" icon={<LogIn/>} color="bg-[#477b8d]" onClick={() => setActiveModule(MODULE_IDS.LOGIN_ACTIVITY)}/>}
           {hasAccess(MODULE_IDS.TRAINING) && <ModuleCard title="Training" description="Build skills and certify competence" icon={<GraduationCap/>} color="bg-[#4f6f56]" onClick={() => setActiveModule(MODULE_IDS.TRAINING)}/>}
           {hasAccess(MODULE_IDS.DEVELOPMENT) && <ModuleCard title="Employee Development" description="See team skills, readiness, coaching, and growth" icon={<Users/>} color="bg-[#0b6b4d]" onClick={() => setActiveModule(MODULE_IDS.DEVELOPMENT)}/>}
           {hasAccess(MODULE_IDS.SETTINGS) && <ModuleCard title="System Maint." description="Keep the system in shape" icon={<SettingsIcon/>} color="bg-[#4f5f57]" onClick={() => setActiveModule(MODULE_IDS.SETTINGS)}/>}
           {hasAccess('ACCESS') && <ModuleCard title="Access" description="Set the right permissions" icon={<ShieldCheck/>} color="bg-[#ae5e5c]" onClick={() => setActiveModule('ACCESS')}/>}
           {isPlatformAdministrator && <ModuleCard title="Platform Administration" description="Onboard and manage businesses" icon={<Building2/>} color="bg-[#473b68]" onClick={() => setActiveModule('PLATFORM_ADMIN')}/>}
        </div>
        {isSecurityAdmin && (
          <div className="max-w-6xl mx-auto mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <p className="font-bold text-amber-950">Legacy staff login repair</p>
              <p className="text-sm text-amber-800">Restores access for older staff accounts whose login ID differs from their profile ID.</p>
              {legacyRepairMessage && <p className="text-sm font-bold text-amber-900 mt-1">{legacyRepairMessage}</p>}
            </div>
            <Button onClick={repairLegacyLogins} isLoading={isRepairingLegacyLogins} className="!w-auto !bg-amber-700 hover:!bg-amber-800">Repair staff logins</Button>
          </div>
        )}
      </div>
    );
  }

  // No exemption for the ACCESS module — the matrix editor is super-role-only
  // (it never appears as a matrix row, so hasAccess only passes via SUPER_ROLES).
  if (activeModule !== 'DAILY_OVERVIEW' && activeModule !== 'PLATFORM_ADMIN' && !hasAccess(activeModule)) {
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
    <div className="min-h-screen neko-shell pb-24 md:pb-0">
       <nav className="bg-[#fffdf9]/95 border-b border-[#e7e2d9] sticky top-0 z-20 px-4 md:px-6 py-4 flex justify-between items-center backdrop-blur">
          <div className="flex items-center gap-4">
             <button onClick={() => setActiveModule(null)} className="p-2 hover:bg-slate-100 rounded-xl"><ArrowLeft/></button>
             <BrandMark className="w-9 h-9"/>
             <h1 className="font-bold text-xl">{activeModule === 'DAILY_OVERVIEW' ? 'Today’s Overview' : activeModule === 'PLATFORM_ADMIN' ? 'Platform Administration' : activeModule === MODULE_IDS.EOM ? 'Employee of the Month' : activeModule === MODULE_IDS.RECIPE ? 'Kitchen Recipes' : activeModule === MODULE_IDS.LOGIN_ACTIVITY ? 'Login Activity' : activeModule === MODULE_IDS.TRAINING ? 'Training' : activeModule === MODULE_IDS.DEVELOPMENT ? 'Employee Development' : activeModule}</h1>
          </div>
          <Button variant="secondary" className="!w-auto !text-xs" onClick={onLogout}>Logout</Button>
       </nav>
       <div className="animate-in fade-in">
          {activeModule === MODULE_IDS.ACCURACY && <OrderAdminView />}
          {activeModule === MODULE_IDS.TASKS && <TaskAdminView />}
          {activeModule === MODULE_IDS.EMPLOYEE && <EmployeeAdminView currentUser={currentUser} />}
          {activeModule === MODULE_IDS.SHIFTS && <ShiftAdminView />}
          {activeModule === MODULE_IDS.RECIPE && <RecipeAdminView />}
          {activeModule === MODULE_IDS.LOGIN_ACTIVITY && <LoginActivityAdminView canClearLogs={isSecurityAdmin} />}
          {activeModule === MODULE_IDS.TRAINING && <TrainingAdminView currentUser={currentUser} canManageContent={hasAccess(MODULE_IDS.TRAINING)} />}
          {activeModule === MODULE_IDS.DEVELOPMENT && <EmployeeDevelopmentModule currentUser={currentUser} />}
          {activeModule === MODULE_IDS.HR && <HRAdminView />}
          {activeModule === MODULE_IDS.REPORTS && <ReportsAdminView />}
          {activeModule === 'DAILY_OVERVIEW' && <DailyOverviewAdminView currentUser={currentUser} onOpenTasks={() => setActiveModule(MODULE_IDS.TASKS)} onOpenAttendance={() => setActiveModule(MODULE_IDS.ATTENDANCE)} />}
          {activeModule === MODULE_IDS.EOM && <EOMAdminView />}
          {activeModule === MODULE_IDS.STORES && <StoreAdminView />}
          {activeModule === MODULE_IDS.SETTINGS && <SettingsAdminView />}
          {activeModule === 'ACCESS' && <AccessAdminView />}
          {activeModule === 'PLATFORM_ADMIN' && isPlatformAdministrator && <PlatformAdminView />}
          {activeModule === MODULE_IDS.ATTENDANCE && <AttendanceAdminView launchKiosk={() => {
            const tenant = currentUser.tenantId ? `&tenant=${encodeURIComponent(currentUser.tenantId)}` : '';
            window.open(`${window.location.origin}?mode=kiosk${tenant}`, '_blank');
          }} />}
       </div>
    </div>
  );
};

const ModuleCard = ({ title, description, icon, color, onClick, featured = false }: any) => (
  <div onClick={onClick} className={`group p-6 rounded-2xl transition-all cursor-pointer border ${featured ? 'md:col-span-2 bg-[#063b2c] border-[#063b2c] shadow-[0_18px_42px_rgba(6,59,44,0.22)] hover:shadow-[0_24px_50px_rgba(6,59,44,0.3)] hover:-translate-y-1' : 'bg-[#fffdf9] shadow-[0_10px_30px_rgba(22,44,35,0.05)] hover:shadow-[0_18px_42px_rgba(22,44,35,0.12)] hover:-translate-y-1 border-[#e7e2d9]'}`}>
     <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 text-white shadow-lg ${featured ? 'bg-[#ec5b4c]' : color}`}>
        {React.cloneElement(icon, { className: 'w-8 h-8' })}
     </div>
     {featured && <span className="inline-block mb-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#f5c4b8]">Manager priority</span>}
     <h3 className={`text-xl font-semibold neko-display ${featured ? 'text-white' : 'text-[#123229]'}`}>{title}</h3>
     <p className={`text-sm mt-2 ${featured ? 'text-[#d6e8dc]' : 'text-slate-500'}`}>{description}</p>
     <span className={`inline-block mt-6 text-xs font-bold uppercase tracking-[.14em] transition-colors ${featured ? 'text-[#f5c4b8] group-hover:text-white' : 'text-[#0b6b4d] group-hover:text-[#ec5b4c]'}`}>{featured ? 'Open overview →' : 'Open module →'}</span>
  </div>
);
