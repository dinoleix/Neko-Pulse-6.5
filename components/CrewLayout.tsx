
import React, { useState, useEffect } from 'react';
import { CurrentUser, MODULE_IDS, AccessConfig, CrewMember, ShiftAssignment, TableAlertDoc } from '../types';
import { db } from '../firebaseConfig';
import { ClipboardList, CalendarClock, Shield, ArrowRight, Lock, Calendar, Trophy, Gift, PartyPopper, X, Clock, BookOpen, Plane, ShieldCheck, AlertCircle, CheckCircle, ChefHat } from 'lucide-react';
import { OrderCrewView } from '../modules/crew/orders/OrderCrewView'; 
import { TaskCrewView } from '../modules/crew/tasks/TaskCrewView'; 
import { AttendanceCrewView } from '../modules/crew/attendance/AttendanceCrewView'; 
import { ShiftCrewView } from '../modules/crew/shifts/ShiftCrewView'; 
import { EOMCrewView } from '../modules/crew/eom/EOMCrewView'; 
import { BluebookCrewView } from '../modules/crew/bluebook/BluebookCrewView';
import { RecipeCrewView } from '../modules/crew/recipes/RecipeCrewView';
import { shiftService } from '../services/shiftService';
import { getCurrentTimeInTimeZone, DEFAULT_TIMEZONE } from '../utils/dateFormatter';
import { format } from 'date-fns';

// For Admin modules accessed by Managers via Crew App
import { OrderAdminView } from '../modules/admin/orders/OrderAdminView'; 
import { TaskAdminView } from '../modules/admin/tasks/TaskAdminView'; 
import { EmployeeAdminView } from '../modules/admin/employees/EmployeeAdminView'; 
import { StoreAdminView } from '../modules/admin/stores/StoreAdminView';
import { AttendanceAdminView } from '../modules/admin/attendance/AttendanceAdminView'; 
import { ShiftAdminView } from '../modules/admin/shifts/ShiftAdminView'; 
import { EOMAdminView } from '../modules/admin/eom/EOMAdminView';
import { BluebookAdminView } from '../modules/admin/bluebook/BluebookAdminView';
import { TableMonitorAdminView } from '../modules/admin/tablemonitor/TableMonitorAdminView';
import { tableMonitorService } from '../services/tableMonitorService';

interface CrewLayoutProps {
  currentUser: CurrentUser;
  onLogout: () => void;
}

export const CrewLayout: React.FC<CrewLayoutProps> = ({ currentUser, onLogout }) => {
  const isCounterRole = currentUser.accessRole === 'Counter';
  const [activeTab, setActiveTab] = useState<string>(isCounterRole ? 'tasks' : 'attendance'); 
  const [allowedAdmin, setAllowedAdmin] = useState<string[]>([]);
  const [adminModule, setAdminModule] = useState<string | null>(null);
  
  // Crew Feature Permissions
  const [canViewOrders, setCanViewOrders] = useState(true);
  const [canViewTasks, setCanViewTasks] = useState(true);
  const [canViewShifts, setCanViewShifts] = useState(true);
  const [canViewEOM, setCanViewEOM] = useState(true);
  const [canViewBluebook, setCanViewBluebook] = useState(true);
  const [canViewRecipe, setCanViewRecipe] = useState(false);
  
  // Birthday State
  const [birthdays, setBirthdays] = useState<CrewMember[]>([]);
  const [showBirthday, setShowBirthday] = useState(true);
  
  // Pilot State
  const [todayPilot, setTodayPilot] = useState<ShiftAssignment | null>(null);
  const [dirtyTableAlerts, setDirtyTableAlerts] = useState<(TableAlertDoc & { id: string })[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
     const checkAccess = async () => {
        setIsLoading(true);
        try {
            const role = currentUser.accessRole;
            
            const confDoc = await db.collection('settings').doc('accessConfig').get();
            if(confDoc.exists && role) {
               const conf = confDoc.data() as AccessConfig;
               
               const allowed = Object.entries(conf)
                    .filter(([key, roles]) => roles.includes(role) && !key.startsWith('CREW_')) 
                    .map(([k]) => k);
               setAllowedAdmin(allowed);

               setCanViewOrders(conf[MODULE_IDS.CREW_ORDERS] ? conf[MODULE_IDS.CREW_ORDERS].includes(role) : true);
               setCanViewTasks(conf[MODULE_IDS.CREW_TASKS] ? conf[MODULE_IDS.CREW_TASKS].includes(role) : true);
               setCanViewEOM(conf[MODULE_IDS.CREW_EOM] ? conf[MODULE_IDS.CREW_EOM].includes(role) : true);
               setCanViewBluebook(conf[MODULE_IDS.CREW_BLUEBOOK] ? conf[MODULE_IDS.CREW_BLUEBOOK].includes(role) : true);
               setCanViewRecipe(conf[MODULE_IDS.CREW_RECIPE] ? conf[MODULE_IDS.CREW_RECIPE].includes(role) : false);
            }

            const crewSnap = await db.collection('crew').where('active', '==', true).get();
            const today = new Date();
            const m = today.getMonth() + 1;
            const d = today.getDate();
            
            const bdayMatches = crewSnap.docs
                .map(doc => ({...doc.data(), id: doc.id} as CrewMember))
                .filter(c => {
                    if(!c.dateOfBirth) return false;
                    const [y, bm, bd] = c.dateOfBirth.split('-').map(Number);
                    return bm === m && bd === d;
                });
            setBirthdays(bdayMatches);

            if (currentUser.outletId) {
                const appConfigDoc = await db.collection('settings').doc('appConfig').get();
                const tz = appConfigDoc.exists ? appConfigDoc.data()?.timezone : DEFAULT_TIMEZONE;
                const nowTz = getCurrentTimeInTimeZone(tz);
                const dateStr = format(nowTz, 'yyyy-MM-dd');
                const pilotAssignment = await shiftService.getDailyPilot(currentUser.outletId, dateStr);
                setTodayPilot(pilotAssignment);
            }

        } catch (e) {
            console.error("Initialization failed", e);
        } finally {
            setIsLoading(false);
        }
     };
     checkAccess();
  }, [currentUser]);

  useEffect(() => {
     if (!currentUser.outletId) return;
     return tableMonitorService.subscribeToActiveAlerts(currentUser.outletId, setDirtyTableAlerts);
  }, [currentUser.outletId]);

  const acknowledgeDirtyTable = async (alertId: string) => {
     await tableMonitorService.acknowledgeAlert(alertId, currentUser.dbId || currentUser.uid);
  };

  const renderContent = () => {
     if (activeTab === 'admin') {
        if(adminModule) {
           return (
              <div className="pb-24 pt-4">
                 <button onClick={() => setAdminModule(null)} className="mb-4 text-sm font-bold text-slate-500">Back to Admin Menu</button>
                 {adminModule === MODULE_IDS.ACCURACY && <OrderAdminView />}
                 {adminModule === MODULE_IDS.TASKS && <TaskAdminView />}
                 {/* @fix: Added currentUser prop to EmployeeAdminView */}
                 {adminModule === MODULE_IDS.EMPLOYEE && <EmployeeAdminView currentUser={currentUser} />}
                 {adminModule === MODULE_IDS.STORES && <StoreAdminView />}
                 {adminModule === MODULE_IDS.SHIFTS && <ShiftAdminView />}
                 {adminModule === MODULE_IDS.BLUEBOOK && <BluebookAdminView />}
                 {adminModule === MODULE_IDS.TABLE_MONITOR && <TableMonitorAdminView />}
                 {adminModule === MODULE_IDS.EOM && <EOMAdminView />}
                 {adminModule === MODULE_IDS.ATTENDANCE && <AttendanceAdminView launchKiosk={() => {}} />}
              </div>
           );
        }
        return (
           <div className="space-y-4 pt-6">
              <h1 className="text-2xl font-bold">Admin Tools</h1>
              {allowedAdmin.map(mod => (
                 <div key={mod} onClick={() => setAdminModule(mod)} className="bg-white p-4 rounded-xl border flex justify-between items-center cursor-pointer hover:bg-slate-50">
                    <span className="font-bold">{mod}</span>
                    <ArrowRight className="w-5 h-5 text-slate-300"/>
                 </div>
              ))}
              {allowedAdmin.length === 0 && <p>No admin access granted.</p>}
           </div>
        );
     }

     return (
        <div className="pb-24 pt-4">
           {activeTab === 'attendance' && <AttendanceCrewView currentUser={currentUser} />}
           {activeTab === 'bluebook' && (canViewBluebook ? <BluebookCrewView currentUser={currentUser} /> : <AccessDenied/>)}
           {activeTab === 'tasks' && (canViewTasks ? <TaskCrewView currentUser={currentUser} /> : <AccessDenied/>)}
           {activeTab === 'orders' && (canViewOrders ? <OrderCrewView currentUser={currentUser} /> : <AccessDenied/>)}
           {activeTab === 'shifts' && (canViewShifts ? <ShiftCrewView currentUser={currentUser} /> : <AccessDenied/>)}
           {activeTab === 'eom' && (canViewEOM ? <EOMCrewView currentUser={currentUser} /> : <AccessDenied/>)}
           {activeTab === 'recipe' && (canViewRecipe ? <RecipeCrewView currentUser={currentUser} /> : <AccessDenied/>)}
        </div>
     );
  };

  if(isLoading) return <div className="min-h-screen flex items-center justify-center text-emerald-600 font-bold">Loading...</div>;

  const myBirthday = birthdays.find(b => b.id === currentUser.dbId || b.id === currentUser.uid);
  const otherBirthdays = birthdays.filter(b => b.id !== myBirthday?.id);

  return (
    <div className="min-h-screen bg-slate-50 px-4">
       
       {/* PILOT BANNER */}
       {todayPilot && (
           <div className="mx-[-1rem] bg-gradient-to-r from-amber-200 to-amber-400 p-3 shadow-md mb-2 flex items-center justify-center gap-3 animate-in slide-in-from-top">
               <div className="w-12 h-12 rounded-full border-2 border-amber-600 overflow-hidden shadow-sm bg-amber-500 flex items-center justify-center text-white flex-shrink-0">
                   <Plane className="w-6 h-6 drop-shadow-md" />
               </div>
               <div className="flex-1">
                   <div className="text-[10px] font-bold text-amber-900 uppercase tracking-widest leading-none mb-0.5">Shift Pilot</div>
                   <div className="font-bold text-amber-950 text-sm flex items-center gap-2">
                       {todayPilot.crewName} 
                       <span className="font-normal opacity-80 text-xs flex items-center">
                           <Clock className="w-3 h-3 mr-0.5"/> {todayPilot.startTime}-{todayPilot.endTime}
                       </span>
                   </div>
               </div>
           </div>
       )}

       <div className="flex justify-between items-center py-4 border-b border-slate-200 mb-2">
          <div>
             <h3 className="text-xl font-bold text-slate-800">{currentUser.name}</h3>
             <p className="text-xs text-slate-500">{currentUser.outletId}</p>
          </div>
          <button onClick={onLogout} className="text-xs border px-3 py-1 rounded-lg">Exit</button>
       </div>

       {dirtyTableAlerts.length > 0 && (
           <div className="mb-4 mt-2 bg-red-600 text-white p-4 rounded-2xl shadow-lg animate-in slide-in-from-top">
              <div className="flex items-start gap-3">
                 <AlertCircle className="w-6 h-6 mt-0.5 flex-shrink-0"/>
                 <div className="flex-1">
                    <h3 className="font-black text-lg leading-tight">{dirtyTableAlerts.length} table{dirtyTableAlerts.length === 1 ? '' : 's'} need clearing</h3>
                    <p className="text-red-100 text-sm">{dirtyTableAlerts.map(alert => alert.tableName).join(', ')}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                       {dirtyTableAlerts.slice(0, 3).map(alert => (
                          <button key={alert.id} onClick={() => acknowledgeDirtyTable(alert.id)} className="px-3 py-2 rounded-xl bg-white text-red-700 font-black text-xs flex items-center gap-1">
                             <CheckCircle className="w-4 h-4"/>
                             {alert.tableName} Done
                          </button>
                       ))}
                    </div>
                 </div>
              </div>
           </div>
       )}

       {/* BIRTHDAY BANNER */}
       {showBirthday && birthdays.length > 0 && (
           <div className="mb-4 mt-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white p-4 rounded-2xl shadow-lg relative overflow-hidden animate-in slide-in-from-top">
               <button onClick={() => setShowBirthday(false)} className="absolute top-2 right-2 text-white/80 hover:text-white p-1 z-20">
                   <X size={16}/>
               </button>
               <PartyPopper className="absolute -left-4 -bottom-4 w-24 h-24 text-white/10 rotate-12"/>
               <div className="relative z-10 flex items-center gap-4">
                   <div className="bg-white/20 p-3 rounded-full backdrop-blur-sm shadow-inner">
                       <Gift className="w-8 h-8 text-white"/>
                   </div>
                   <div className="flex-1">
                       {myBirthday && (
                           <div className="mb-2">
                               <h3 className="font-bold text-lg leading-tight">Happy Birthday, {myBirthday.crewName.split(' ')[0]}! 🎂</h3>
                               <p className="text-pink-100 text-sm">Have a wonderful day!</p>
                           </div>
                       )}
                       {otherBirthdays.length > 0 && (
                           <div>
                               <h4 className="font-bold text-[10px] uppercase tracking-wider text-pink-200 mb-1">
                                   {myBirthday ? "Also Celebrating Today:" : "Today's Birthdays:"}
                               </h4>
                               <div className="flex flex-wrap gap-2">
                                   {otherBirthdays.map(o => (
                                       <span key={o.id} className="bg-white/20 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                                           {o.crewName} 🎂
                                       </span>
                                   ))}
                               </div>
                           </div>
                       )}
                   </div>
               </div>
           </div>
       )}

       {renderContent()}

       <div className="fixed bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 p-2 flex justify-around z-30 overflow-x-auto">
          {!isCounterRole && (
             <NavBtn icon={<CalendarClock/>} label="Time" active={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')} color="orange"/>
          )}
          {canViewBluebook && (
             <NavBtn icon={<BookOpen/>} label="Bluebook" active={activeTab === 'bluebook'} onClick={() => setActiveTab('bluebook')} color="blue"/>
          )}
          {canViewTasks && (
             <NavBtn icon={<ClipboardList/>} label="Tasks" active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} color="indigo"/>
          )}
          {canViewOrders && (
             <NavBtn icon={<ShieldCheck/>} label="Accuracy" active={activeTab === 'orders'} onClick={() => setActiveTab('orders')} color="emerald"/>
          )}
          {canViewShifts && !isCounterRole && (
             <NavBtn icon={<Calendar/>} label="Shifts" active={activeTab === 'shifts'} onClick={() => setActiveTab('shifts')} color="slate"/>
          )}
          {canViewEOM && (
             <NavBtn icon={<Trophy/>} label="Awards" active={activeTab === 'eom'} onClick={() => setActiveTab('eom')} color="amber"/>
          )}
          {canViewRecipe && (
             <NavBtn icon={<ChefHat/>} label="Recipes" active={activeTab === 'recipe'} onClick={() => setActiveTab('recipe')} color="teal"/>
          )}
          {allowedAdmin.length > 0 && (
             <NavBtn icon={<Shield/>} label="Admin" active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} color="rose"/>
          )}
       </div>
    </div>
  );
};

const AccessDenied = () => (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Lock className="w-12 h-12 mb-4"/>
        <h3 className="font-bold text-lg">Access Restricted</h3>
        <p className="text-sm">You do not have permission to view this module.</p>
    </div>
);

const NavBtn = ({ icon, label, active, onClick, color }: any) => {
   const colors: any = { 
       emerald: 'bg-emerald-500 shadow-emerald-200', 
       indigo: 'bg-indigo-500 shadow-indigo-200', 
       orange: 'bg-orange-500 shadow-orange-200', 
       rose: 'bg-rose-500 shadow-rose-200',
       blue: 'bg-blue-600 shadow-blue-200', 
       slate: 'bg-slate-600 shadow-slate-200',
       amber: 'bg-amber-500 shadow-amber-200',
       teal: 'bg-teal-500 shadow-teal-200'
    };
   return (
      <button onClick={onClick} className={`flex-1 flex flex-col items-center py-2 min-w-[50px] rounded-xl transition-all ${active ? `${colors[color]} text-white shadow-lg` : 'text-slate-400'}`}>
         {React.cloneElement(icon, { className: 'w-6 h-6 mb-0.5' })}
         <span className="text-[10px] font-bold">{label}</span>
      </button>
   );
};
