
import React, { useState, useEffect } from 'react';
import { attendanceService } from '../../../services/attendanceService';
import { AttendanceLog, LeaveRequest, AttendanceConfig, CrewMember, ShiftAssignment } from '../../../types';
import { Button, Card, Input, Badge, Select, Checkbox, TextArea } from '../../../components/SharedComponents';
import { Zap, Settings, Check, X, Trash2, LogIn, LogOut, AlertCircle, Calendar, Plus, MessageSquare, Info, ShieldAlert, RotateCcw, Lock, Unlock, ChevronDown, ChevronUp, Search, User, Eye, EyeOff, Users, CheckSquare } from 'lucide-react';
// @fix: Removed parseISO from date-fns import
import { format, endOfDay, differenceInMinutes, isSameDay, differenceInDays } from 'date-fns';
import { formatInTimeZone, getShiftedDate, DEFAULT_TIMEZONE } from '../../../utils/dateFormatter';
import { db, firebase } from '../../../firebaseConfig';

// --- HELPERS ---
// @fix: Implemented local parseISO helper to handle YYYY-MM-DD strings
const parseISO = (str: string) => {
  if(!str) return new Date();
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const startOfDay = (d: Date) => {
   const date = new Date(d);
   date.setHours(0,0,0,0);
   return date;
};

const startOfWeek = (date: Date, options?: { weekStartsOn?: number }) => {
   const d = new Date(date);
   const day = d.getDay();
   const diff = (day < (options?.weekStartsOn || 0) ? 7 : 0) + day - (options?.weekStartsOn || 0);
   d.setDate(d.getDate() - diff);
   d.setHours(0, 0, 0, 0);
   return d;
};

const startOfMonth = (date: Date) => {
   const d = new Date(date);
   d.setDate(1);
   d.setHours(0, 0, 0, 0);
   return d;
};

const subDays = (date: Date, amount: number) => {
   const d = new Date(date);
   d.setDate(d.getDate() - amount);
   return d;
};

interface ProcessedShift {
   id: string;
   crewId: string;
   crewName: string;
   date: Date;
   checkIn: Date;
   checkOut?: Date;
   durationMinutes: number;
   breakMinutes: number; 
   status: 'COMPLETED' | 'WORKING' | 'MISSING_CHECKOUT';
   methodIn: string;
   methodOut?: string;
   scheduledStart?: string;
   isLate?: boolean;
}

export const AttendanceAdminView: React.FC<{ launchKiosk: () => void }> = ({ launchKiosk }) => {
   const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'REPORT' | 'LEAVE_BALANCE' | 'SETTINGS'>('DASHBOARD');
   const [logs, setLogs] = useState<AttendanceLog[]>([]);
   const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
   const [crew, setCrew] = useState<CrewMember[]>([]);
   const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
   const [reportFilter, setReportFilter] = useState<'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH'>('TODAY');
   const [selectedEmployee, setSelectedEmployee] = useState<string>('ALL');
   const [shifts, setShifts] = useState<ProcessedShift[]>([]);
   const [totalHours, setTotalHours] = useState(0);
   const [kioskConfig, setKioskConfig] = useState<AttendanceConfig>({ enableQrScan: true, enablePinCode: true, allowLeaveOverrideEdit: false, showLeaveBalanceInApp: true, permittedPinCrewIds: [] });
   const [isSavingKiosk, setIsSavingKiosk] = useState(false);
   const [loadingError, setLoadingError] = useState<string | null>(null);
   const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
   
   // Leave History Filter State
   const [historyEmployeeFilter, setHistoryEmployeeFilter] = useState<string>('ALL');
   const [historyStoreFilter, setHistoryStoreFilter] = useState<string>('ALL');
   const [uniqueStores, setUniqueStores] = useState<string[]>([]);
   
   // Leave Balance Tab State
   const [balanceSearch, setBalanceSearch] = useState('');
   const [balanceStoreFilter, setBalanceStoreFilter] = useState('ALL');
   const [showInactiveBalance, setShowInactiveBalance] = useState(false);
   const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

   // PIN Restriction State
   const [pinSearchQuery, setPinSearchQuery] = useState('');

   // Admin Log Leave State
   const [isLoggingLeave, setIsLoggingLeave] = useState(false);
   const [adminLeave, setAdminLeave] = useState<Partial<LeaveRequest>>({
      crewId: '',
      type: 'CASUAL',
      startDate: '',
      endDate: '',
      reason: ''
   });
   const [isSubmittingAdminLeave, setIsSubmittingAdminLeave] = useState(false);

   useEffect(() => { loadData(); }, []);
   useEffect(() => { if (activeTab === 'REPORT') generateReport(); }, [activeTab, reportFilter, selectedEmployee, logs, assignments, timezone]);

   const loadData = async () => {
      setLoadingError(null);
      try {
          const [appConfig, logsData, leavesData, crewData, shiftData, attConfig] = await Promise.all([
              attendanceService.getAppConfig(),
              attendanceService.getAllLogs(1000),
              attendanceService.getAllLeaves(),
              attendanceService.getCrew(),
              attendanceService.getAllShifts(),
              attendanceService.getConfig()
          ]);

          if (appConfig) setTimezone(appConfig.timezone || DEFAULT_TIMEZONE);
          setLogs(logsData);
          setLeaves(leavesData);
          setCrew(crewData);
          setAssignments(shiftData);

          if (attConfig) {
              setKioskConfig(prev => ({ ...prev, ...attConfig, permittedPinCrewIds: attConfig.permittedPinCrewIds || [] }));
          }

          const storesFromLeaves = leavesData.map(l => l.outletId).filter(Boolean);
          const storesFromCrew = crewData.map(c => c.outletId).filter(Boolean);
          const uniqueStoreSet = new Set([...storesFromLeaves, ...storesFromCrew]);
          setUniqueStores(Array.from(uniqueStoreSet).sort());

      } catch (e: any) {
          console.error("Data Load Error", e);
          setLoadingError(e.message || "Failed to load data.");
      }
   };

   const generateReport = () => {
      const now = new Date();
      let start = startOfDay(now);
      let end = endOfDay(now);
      if (reportFilter === 'YESTERDAY') {
         start = startOfDay(subDays(now, 1));
         end = endOfDay(subDays(now, 1));
      } else if (reportFilter === 'WEEK') {
         start = startOfWeek(now);
      } else if (reportFilter === 'MONTH') {
         start = startOfMonth(now);
      }
      const filteredLogs = logs.filter(l => {
         const time = l.timestamp?.toDate ? l.timestamp.toDate() : new Date(l.timestamp);
         const inDate = time >= start && time <= end;
         const isEmp = selectedEmployee === 'ALL' || l.crewId === selectedEmployee;
         return inDate && isEmp;
      });
      const crewLogs: Record<string, AttendanceLog[]> = {};
      filteredLogs.forEach(l => {
         if (!crewLogs[l.crewId]) crewLogs[l.crewId] = [];
         crewLogs[l.crewId].push(l);
      });
      const processedShifts: ProcessedShift[] = [];
      let totalMins = 0;
      Object.values(crewLogs).forEach(userLogs => {
         userLogs.sort((a,b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
         let currentShift: Partial<ProcessedShift> | null = null;
         userLogs.forEach(log => {
            const time = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
            if (log.type === 'CHECK_IN') {
               if (currentShift) {
                  processedShifts.push({
                     ...currentShift as ProcessedShift,
                     status: 'MISSING_CHECKOUT',
                     durationMinutes: 0
                  });
               }

               const timeInTz = getShiftedDate(time, timezone);
               const dateStr = format(timeInTz, 'yyyy-MM-dd');
               const assignment = assignments.find(a => a.crewId === log.crewId && a.date === dateStr);
               let isLate = false;
               let scheduledStart = undefined;

               if (assignment && !assignment.isDayOff && assignment.startTime) {
                   scheduledStart = assignment.startTime;
                   const [h, m] = assignment.startTime.split(':').map(Number);
                   const scheduledDate = new Date(timeInTz);
                   scheduledDate.setHours(h, m, 0, 0);
                   const diff = differenceInMinutes(timeInTz, scheduledDate);
                   if (diff > 5) isLate = true;
               }

               currentShift = {
                  id: log.id,
                  crewId: log.crewId,
                  crewName: log.crewName,
                  date: time,
                  checkIn: time,
                  methodIn: log.method,
                  status: 'WORKING',
                  durationMinutes: 0,
                  scheduledStart,
                  isLate
               };
            } else if (log.type === 'CHECK_OUT') {
               if (currentShift) {
                  const duration = differenceInMinutes(time, currentShift.checkIn!);
                  processedShifts.push({
                     ...currentShift as ProcessedShift,
                     checkOut: time,
                     methodOut: log.method,
                     status: 'COMPLETED',
                     durationMinutes: duration
                  });
                  totalMins += duration;
                  currentShift = null;
               }
            }
         });
         if (currentShift) {
             const isToday = isSameDay(currentShift.checkIn!, new Date());
             processedShifts.push({
                 ...currentShift as ProcessedShift,
                 status: isToday ? 'WORKING' : 'MISSING_CHECKOUT'
             });
         }
      });
      
      const aggregatedShifts: ProcessedShift[] = [];
      const processedIds = new Set<string>();

      processedShifts.forEach(shift => {
          const dateStr = format(shift.date, 'yyyy-MM-dd');
          const key = `${shift.crewId}_${dateStr}`;
          if (processedIds.has(key)) return;
          const segments = processedShifts.filter(s => s.crewId === shift.crewId && format(s.date, 'yyyy-MM-dd') === dateStr);
          const totalWork = segments.reduce((acc, s) => acc + s.durationMinutes, 0);
          segments.sort((a,b) => a.checkIn.getTime() - b.checkIn.getTime());
          const firstIn = segments[0];
          const lastOut = segments[segments.length - 1];
          let breakMinutes = 0;
          if (lastOut.checkOut && firstIn.checkIn) {
               const grossMinutes = differenceInMinutes(lastOut.checkOut, firstIn.checkIn);
               breakMinutes = grossMinutes - totalWork;
               if(breakMinutes < 0) breakMinutes = 0;
          }
          aggregatedShifts.push({
              ...firstIn,
              checkOut: lastOut.checkOut,
              durationMinutes: totalWork,
              breakMinutes: breakMinutes,
              status: lastOut.status === 'WORKING' ? 'WORKING' : lastOut.status === 'MISSING_CHECKOUT' ? 'MISSING_CHECKOUT' : 'COMPLETED'
          });
          processedIds.add(key);
      });

      setShifts(aggregatedShifts);
      setTotalHours(totalMins / 60);
   };

   const updateLeave = async (id: string, status: 'APPROVED' | 'REJECTED') => {
      await attendanceService.updateLeaveStatus(id, status);
      loadData();
   };

   const saveKioskConfig = async () => {
       if (!kioskConfig.enableQrScan && !kioskConfig.enablePinCode) {
           alert("At least one check-in method must be enabled.");
           return;
       }
       setIsSavingKiosk(true);
       try {
           await attendanceService.saveConfig(kioskConfig);
           alert("Attendance Configuration Saved");
       } catch (e) { alert("Error saving config"); } finally { setIsSavingKiosk(false); }
   };

   const clearOverride = async (employee: CrewMember) => {
       if(!confirm(`Are you sure you want to reset leave accrual for ${employee.crewName}? This will clear the manual balance and resume calculation from their Joining Date.`)) return;
       try {
           await db.collection('crew').doc(employee.id!).update({
               leaveBalanceOverride: firebase.firestore.FieldValue.delete(),
               leaveBalanceOverrideDate: firebase.firestore.FieldValue.delete()
           });
           alert("Reset complete.");
           loadData();
       } catch (e) { alert("Reset failed."); }
   };

   const formatDuration = (mins: number) => {
      if (mins === 0) return '-';
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h}h ${m}m`;
   };

   const togglePinPermitted = (id: string) => {
       const current = [...(kioskConfig.permittedPinCrewIds || [])];
       const updated = current.includes(id) ? current.filter(cid => cid !== id) : [...current, id];
       setKioskConfig({ ...kioskConfig, permittedPinCrewIds: updated });
   };

   const submitAdminLeave = async () => {
       if (!adminLeave.crewId || !adminLeave.startDate || !adminLeave.endDate || !adminLeave.reason) {
           alert("Please fill all fields");
           return;
       }
       const employee = crew.find(c => c.id === adminLeave.crewId);
       if (!employee) return;

       setIsSubmittingAdminLeave(true);
       try {
           await attendanceService.submitLeave({
               crewId: employee.id!,
               crewName: employee.crewName,
               outletId: employee.outletId,
               type: adminLeave.type as any,
               startDate: adminLeave.startDate!,
               endDate: adminLeave.endDate!,
               reason: adminLeave.reason!,
               status: 'APPROVED'
           });
           setIsLoggingLeave(false);
           setAdminLeave({ crewId: '', type: 'CASUAL', startDate: '', endDate: '', reason: '' });
           loadData();
           alert("Leave logged successfully");
       } catch (e) {
           alert("Error logging leave");
       } finally {
           setIsSubmittingAdminLeave(false);
       }
   };

   const crewWithOverrides = crew.filter(c => c.leaveBalanceOverride !== undefined && c.leaveBalanceOverride !== null);

   // A member is inactive if explicitly marked or has a relieving date.
   const isInactiveMember = (c: CrewMember) => c.active === false || !!c.dateOfLeaving;
   const inactiveBalanceCount = crew.filter(isInactiveMember).length;
   const balanceList = crew
      .filter(c => showInactiveBalance ? isInactiveMember(c) : !isInactiveMember(c))
      .filter(c => c.crewName.toLowerCase().includes(balanceSearch.toLowerCase()))
      .filter(c => balanceStoreFilter === 'ALL' || c.outletId === balanceStoreFilter);

   return (
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
               <h2 className="text-2xl font-bold text-slate-800">Attendance & Leaves</h2>
               <div className="flex gap-4 mt-2 border-b border-slate-200">
                  <button onClick={() => setActiveTab('DASHBOARD')} className={`pb-2 text-sm font-bold transition-colors ${activeTab === 'DASHBOARD' ? 'text-emerald-600 border-b-2 border-emerald-500' : 'text-slate-400'}`}>Dashboard</button>
                  <button onClick={() => setActiveTab('REPORT')} className={`pb-2 text-sm font-bold transition-colors ${activeTab === 'REPORT' ? 'text-emerald-600 border-b-2 border-emerald-500' : 'text-slate-400'}`}>Report</button>
                  <button onClick={() => setActiveTab('LEAVE_BALANCE')} className={`pb-2 text-sm font-bold transition-colors ${activeTab === 'LEAVE_BALANCE' ? 'text-emerald-600 border-b-2 border-emerald-500' : 'text-slate-400'}`}>Leave balance</button>
                  <button onClick={() => setActiveTab('SETTINGS')} className={`pb-2 text-sm font-bold transition-colors ${activeTab === 'SETTINGS' ? 'text-emerald-600 border-b-2 border-emerald-500' : 'text-slate-400'}`}>Settings</button>
               </div>
            </div>
            <Button className="!w-auto" onClick={launchKiosk}><Zap className="w-4 h-4 mr-2"/> Launch Kiosk</Button>
         </div>

         {loadingError && (
             <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 flex items-center gap-3">
                 <AlertCircle className="w-5 h-5"/>
                 <span>{loadingError}</span>
             </div>
         )}

         {activeTab === 'SETTINGS' && (
            <div className="space-y-6 animate-in fade-in">
               <div className="grid md:grid-cols-2 gap-6">
                   <Card title="Kiosk Configuration">
                       <div className="space-y-4">
                           <p className="text-sm text-slate-500">Configure allowed authentication methods.</p>
                           
                           {/* QR SCAN (Implicitly enabled in code but keeping for future) */}
                           <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                               <div className="flex items-center gap-3">
                                   <div className="bg-white p-2 rounded text-emerald-500"><Search className="w-4 h-4"/></div>
                                   <span className="font-bold text-slate-700 text-sm">QR Code (Mobile App)</span>
                               </div>
                               <Checkbox checked={kioskConfig.enableQrScan} onChange={e => setKioskConfig({...kioskConfig, enableQrScan: e.target.checked})}/>
                           </div>

                           {/* PIN CODE KEYPAD */}
                           <div className="space-y-3">
                               <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                   <div className="flex items-center gap-3">
                                       <div className="bg-white p-2 rounded text-slate-500"><Zap className="w-4 h-4"/></div>
                                       <span className="font-bold text-slate-700 text-sm">PIN Code Keypad (Restrictable)</span>
                                   </div>
                                   <Checkbox checked={kioskConfig.enablePinCode} onChange={e => setKioskConfig({...kioskConfig, enablePinCode: e.target.checked})}/>
                               </div>

                               {kioskConfig.enablePinCode && (
                                   <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4 animate-in slide-in-from-top-2">
                                       <div className="flex justify-between items-center">
                                           <label className="text-xs font-bold text-slate-400 uppercase">Permitted Employees</label>
                                           <Badge variant="neutral" className="!bg-slate-100">{kioskConfig.permittedPinCrewIds?.length || 0} Selected</Badge>
                                       </div>
                                       
                                       <div className="relative">
                                           <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                                           <Input 
                                                placeholder="Search name..." 
                                                value={pinSearchQuery} 
                                                onChange={e => setPinSearchQuery(e.target.value)}
                                                className="!py-2 !pl-9 !text-xs !rounded-xl"
                                           />
                                       </div>

                                       <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                           {crew
                                             .filter(c => c.active && c.crewName.toLowerCase().includes(pinSearchQuery.toLowerCase()))
                                             .map(c => {
                                               const isSel = kioskConfig.permittedPinCrewIds?.includes(c.id!);
                                               return (
                                                   <div 
                                                        key={c.id} 
                                                        onClick={() => togglePinPermitted(c.id!)}
                                                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${isSel ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                                                   >
                                                       <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${isSel ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white border-slate-300'}`}>
                                                           {isSel && <CheckSquare className="w-3 h-3"/>}
                                                       </div>
                                                       <div className="min-w-0">
                                                           <div className={`text-xs font-bold truncate ${isSel ? 'text-indigo-700' : 'text-slate-700'}`}>{c.crewName}</div>
                                                           <div className="text-[10px] text-slate-400 font-mono">ID: {c.crewCode}</div>
                                                       </div>
                                                   </div>
                                               );
                                           })}
                                           {crew.length === 0 && <p className="text-center py-4 text-slate-300 text-xs italic">No active crew members found.</p>}
                                       </div>
                                       <p className="text-[10px] text-slate-400 italic">If no one is selected, all employees can use the keypad by default.</p>
                                   </div>
                               )}
                           </div>

                           <div className="flex justify-end pt-2">
                               <Button className="!w-auto" onClick={saveKioskConfig} isLoading={isSavingKiosk}>Save Configuration</Button>
                           </div>
                       </div>
                   </Card>
                   
                   <Card title="Accrual Policy">
                        <div className="flex gap-3 bg-blue-50 p-4 rounded-2xl border border-blue-100 text-blue-800">
                            <Info className="w-5 h-5 flex-shrink-0 mt-0.5"/>
                            <div className="text-sm">
                                <p className="font-bold mb-1">System Policy: Pro-Rata Accrual</p>
                                <p className="opacity-90">Employees earn leave balance <strong>daily</strong> based on a rate of 1.5 days per 31 days completed (~0.05 days/day) since joining or reset.</p>
                            </div>
                        </div>
                   </Card>

                   <Card title="Crew App Display Settings" className="border-l-4 border-l-indigo-500">
                       <div className="space-y-4">
                           <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                               <div className="flex items-center gap-3">
                                   <div className={`p-2 rounded-lg ${kioskConfig.showLeaveBalanceInApp ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
                                       {kioskConfig.showLeaveBalanceInApp ? <Eye className="w-5 h-5"/> : <EyeOff className="w-5 h-5"/>}
                                   </div>
                                   <div>
                                       <span className="font-bold text-slate-800 block">Display Leave Balance</span>
                                       <p className="text-xs text-slate-500">Show/Hide the "Available Leave Balance" badge in the Crew App.</p>
                                   </div>
                               </div>
                               <Checkbox 
                                  checked={kioskConfig.showLeaveBalanceInApp !== false} 
                                  onChange={e => setKioskConfig({...kioskConfig, showLeaveBalanceInApp: e.target.checked})}
                               />
                           </div>
                           <div className="flex justify-end pt-2">
                               <Button className="!w-auto" onClick={saveKioskConfig} isLoading={isSavingKiosk}>Save Display Settings</Button>
                           </div>
                       </div>
                   </Card>

                   <Card title="Manual Balance Management" className="border-l-4 border-l-amber-500">
                       <div className="space-y-6">
                           <div className="flex items-center justify-between p-4 bg-amber-50 rounded-2xl border border-amber-100">
                               <div className="flex items-center gap-3">
                                   <div className={`p-2 rounded-lg ${kioskConfig.allowLeaveOverrideEdit ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-500'}`}>
                                       {kioskConfig.allowLeaveOverrideEdit ? <Unlock className="w-5 h-5"/> : <Lock className="w-5 h-5"/>}
                                   </div>
                                   <div>
                                       <span className="font-bold text-slate-800 block">Allow Override Editing</span>
                                       <p className="text-xs text-slate-500">Enables editing existing manual balances in the Employee Directory.</p>
                                   </div>
                               </div>
                               <Checkbox 
                                  checked={kioskConfig.allowLeaveOverrideEdit || false} 
                                  onChange={e => setKioskConfig({...kioskConfig, allowLeaveOverrideEdit: e.target.checked})}
                               />
                           </div>

                           <div>
                               <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 px-1">Active Manual Overrides</h4>
                               <div className="space-y-2">
                                   {crewWithOverrides.map(c => (
                                       <div key={c.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                                           <div className="flex items-center gap-3">
                                               <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xs">{c.crewName[0]}</div>
                                               <div>
                                                   <span className="font-bold text-sm block">{c.crewName}</span>
                                                   <span className="text-[10px] text-slate-400">Set on {c.leaveBalanceOverrideDate || 'N/A'}</span>
                                               </div>
                                           </div>
                                           <div className="flex items-center gap-4">
                                               <Badge variant="neutral" className="!bg-indigo-50 !text-indigo-700 font-mono">{c.leaveBalanceOverride} Days</Badge>
                                               <button 
                                                  onClick={() => clearOverride(c)}
                                                  className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                                  title="Reset to System Accrual"
                                               >
                                                   <RotateCcw className="w-4 h-4"/>
                                               </button>
                                           </div>
                                       </div>
                                   ))}
                                   {crewWithOverrides.length === 0 && (
                                       <div className="text-center py-6 text-slate-300 text-sm italic">No manual overrides currently active.</div>
                                   )}
                               </div>
                           </div>

                           <div className="flex justify-end pt-2">
                               <Button className="!w-auto" onClick={saveKioskConfig} isLoading={isSavingKiosk}>Apply Management Settings</Button>
                           </div>
                       </div>
                   </Card>
               </div>
            </div>
         )}

         {activeTab === 'REPORT' && (
            <div className="space-y-6 animate-in fade-in">
               <Card>
                  <div className="flex flex-col md:flex-row gap-4 items-end">
                     <div className="flex-1">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Time Period</label>
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                           {['TODAY', 'YESTERDAY', 'WEEK', 'MONTH'].map((f: any) => (
                              <button key={f} onClick={() => setReportFilter(f)} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${reportFilter === f ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>{f}</button>
                           ))}
                        </div>
                     </div>
                     <div className="w-full md:w-64">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Employee</label>
                        <Select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}>
                           <option value="ALL">All Employees</option>
                           {crew.map(c => <option key={c.id} value={c.id}>{c.crewName}</option>)}
                        </Select>
                     </div>
                     <div className="w-full md:w-auto bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 text-right min-w-[150px]">
                        <div className="text-xs text-emerald-600 font-bold uppercase">Total Hours</div>
                        <div className="text-2xl font-bold text-emerald-800">{totalHours.toFixed(1)}h</div>
                     </div>
                  </div>
               </Card>

               <Card title="Attendance Logs" className="overflow-hidden">
                  <div className="overflow-x-auto">
                     <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                           <tr>
                              <th className="p-4 text-left">Date</th>
                              <th className="p-4 text-left">Employee</th>
                              <th className="p-4 text-center">Time In</th>
                              <th className="p-4 text-center">Time Out</th>
                              <th className="p-4 text-center">Duration</th>
                              <th className="p-4 text-center">Status</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                           {shifts.map(shift => (
                              <tr key={shift.id} className="hover:bg-slate-50">
                                 <td className="p-4 font-bold text-slate-700 whitespace-nowrap">{formatInTimeZone(shift.date, 'MMM d, yyyy', timezone)}</td>
                                 <td className="p-4 text-slate-800 font-medium">{shift.crewName}</td>
                                 <td className="p-4 text-center">
                                     <div className={`font-mono ${shift.isLate ? 'text-red-600 font-bold' : shift.scheduledStart ? 'text-emerald-600 font-bold' : 'text-slate-600'}`}>
                                         {formatInTimeZone(shift.checkIn, 'HH:mm', timezone)}
                                     </div>
                                     <div className="text-[10px] text-slate-400">{shift.methodIn}</div>
                                     {shift.scheduledStart && (
                                         <div className="text-[10px] text-slate-400">Sch: {shift.scheduledStart}</div>
                                     )}
                                 </td>
                                 <td className="p-4 text-center">{shift.checkOut ? <><div className="font-mono text-slate-600">{formatInTimeZone(shift.checkOut, 'HH:mm', timezone)}</div><div className="text-[10px] text-slate-400">{shift.methodOut}</div></> : <span className="text-slate-300">-</span>}</td>
                                 <td className="p-4 text-center font-bold text-slate-700">{formatDuration(shift.durationMinutes)}</td>
                                 <td className="p-4 text-center">
                                    {shift.status === 'COMPLETED' && <Badge variant="neutral">Completed</Badge>}
                                    {shift.status === 'WORKING' && <Badge variant="success">Working</Badge>}
                                    {shift.status === 'MISSING_CHECKOUT' && <Badge variant="danger">Missing Out</Badge>}
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </Card>
            </div>
         )}

         {activeTab === 'LEAVE_BALANCE' && (
            <div className="space-y-6 animate-in fade-in">
               <div className="grid md:grid-cols-3 gap-4">
                  <div className="relative">
                     <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                     <input
                        type="text"
                        placeholder="Search employee name..."
                        className="w-full pl-12 pr-4 py-3 rounded-2xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all text-sm font-medium"
                        value={balanceSearch}
                        onChange={(e) => setBalanceSearch(e.target.value)}
                     />
                  </div>
                  <Select value={balanceStoreFilter} onChange={e => setBalanceStoreFilter(e.target.value)}>
                     <option value="ALL">All Stores</option>
                     {uniqueStores.map(s => <option key={s} value={s}>{s}</option>)}
                  </Select>
                  <button
                     onClick={() => setShowInactiveBalance(v => !v)}
                     title={showInactiveBalance ? 'Show active employees' : 'Show inactive (former) employees'}
                     className={`rounded-2xl text-sm font-bold flex items-center justify-center gap-2 border transition-all py-3 px-4 ${
                        showInactiveBalance
                           ? 'bg-slate-700 text-white border-slate-700 shadow-md'
                           : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                     }`}
                  >
                     {showInactiveBalance ? <Users className="w-4 h-4"/> : <EyeOff className="w-4 h-4"/>}
                     {showInactiveBalance ? 'Show Active' : `Inactive${inactiveBalanceCount > 0 ? ` (${inactiveBalanceCount})` : ''}`}
                  </button>
               </div>

               <div className="bg-white rounded-[32px] shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
                  <div className="overflow-x-auto">
                     <table className="w-full text-sm">
                        <thead className="bg-slate-50/50 text-slate-500 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
                           <tr>
                              <th className="p-5 text-left">Employee</th>
                              <th className="p-5 text-left">Outlet</th>
                              <th className="p-5 text-center">Balance</th>
                              <th className="p-5 text-right w-20"></th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                           {balanceList.map(c => {
                                 const balance = attendanceService.calculateLeaveBalance(c, leaves);
                                 const history = leaves.filter(l => l.crewId === c.id || l.crewId === c.authUid);
                                 const isExpanded = expandedEmployeeId === c.id;

                                 return (
                                    <React.Fragment key={c.id}>
                                       <tr 
                                          className={`group hover:bg-emerald-50/30 transition-colors cursor-pointer ${isExpanded ? 'bg-indigo-50/20' : ''}`}
                                          onClick={() => setExpandedEmployeeId(isExpanded ? null : c.id!)}
                                       >
                                          <td className="p-5">
                                             <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg overflow-hidden transition-colors ${isInactiveMember(c) ? 'bg-slate-100 text-slate-400 grayscale' : 'bg-slate-100 text-slate-500 group-hover:bg-emerald-100 group-hover:text-emerald-600'}`}>
                                                   {c.photoUrl ? <img src={c.photoUrl} className="w-full h-full object-cover" alt={c.crewName}/> : c.crewName[0]}
                                                </div>
                                                <div>
                                                   <div className="font-bold text-slate-800 flex items-center gap-2">
                                                      {c.crewName}
                                                      {isInactiveMember(c) && <Badge variant="danger" className="!py-0 !text-[8px]">Inactive</Badge>}
                                                   </div>
                                                   <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                                                      ID: {c.crewCode}
                                                      {c.dateOfLeaving && <span className="ml-2 normal-case text-slate-400">· Left {format(parseISO(c.dateOfLeaving), 'MMM d, yyyy')}</span>}
                                                   </div>
                                                </div>
                                             </div>
                                          </td>
                                          <td className="p-5">
                                             <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                                                <Badge variant="neutral" className="!bg-white">{c.outletId}</Badge>
                                             </div>
                                          </td>
                                          <td className="p-5 text-center">
                                             <span className={`text-lg font-black ${balance > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>{balance}</span>
                                             <span className="text-[10px] ml-1 font-bold text-slate-400 uppercase">Days</span>
                                          </td>
                                          <td className="p-5 text-right">
                                             <div className={`p-2 rounded-lg transition-colors ${isExpanded ? 'bg-indigo-100 text-indigo-600' : 'text-slate-300 group-hover:text-slate-400'}`}>
                                                {isExpanded ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                                             </div>
                                          </td>
                                       </tr>
                                       {isExpanded && (
                                          <tr>
                                             <td colSpan={4} className="p-0 bg-slate-50/50">
                                                <div className="p-6 border-l-4 border-indigo-500 animate-in slide-in-from-top-2 duration-300">
                                                   <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                      <Calendar size={14}/> Leave History
                                                   </h4>
                                                   
                                                   {history.length > 0 ? (
                                                      <div className="space-y-3">
                                                         {history.map(l => (
                                                            <div key={l.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                                                               <div className="flex items-center gap-4">
                                                                  <div className={`w-2 h-2 rounded-full ${l.status === 'APPROVED' ? 'bg-emerald-500' : l.status === 'REJECTED' ? 'bg-red-500' : 'bg-amber-400'}`}></div>
                                                                  <div>
                                                                     <div className="font-bold text-slate-800 text-sm">{l.type} Leave</div>
                                                                     <div className="text-xs text-slate-500">
                                                                        {format(parseISO(l.startDate), 'MMM d')} - {format(parseISO(l.endDate), 'MMM d, yyyy')}
                                                                        <span className="text-slate-300 mx-2">•</span>
                                                                        <span className="font-bold">{differenceInDays(parseISO(l.endDate), parseISO(l.startDate)) + 1} Days</span>
                                                                     </div>
                                                                  </div>
                                                               </div>
                                                               <div className="flex items-center gap-4">
                                                                  <div className="text-xs text-slate-600 italic bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">"{l.reason}"</div>
                                                                  <Badge variant={l.status === 'APPROVED' ? 'success' : l.status === 'REJECTED' ? 'danger' : 'warning'}>
                                                                     {l.status}
                                                                  </Badge>
                                                               </div>
                                                            </div>
                                                         ))}
                                                      </div>
                                                   ) : (
                                                      <div className="text-center py-8 bg-white/50 rounded-2xl border border-dashed border-slate-200">
                                                         <Info size={24} className="mx-auto text-slate-300 mb-2"/>
                                                         <p className="text-sm text-slate-400 font-medium">No leave records found for this employee.</p>
                                                      </div>
                                                   )}
                                                   
                                                   <div className="mt-6 pt-6 border-t border-slate-200 flex justify-between items-center">
                                                      <div className="text-[10px] font-bold text-slate-400 uppercase">Employment Details</div>
                                                      <div className="flex gap-4 text-xs font-bold text-slate-600">
                                                         <div className="flex flex-col">
                                                            <span className="text-slate-400 font-medium text-[9px] uppercase">Joined On</span>
                                                            {c.dateOfJoining || 'N/A'}
                                                         </div>
                                                         {c.leaveBalanceOverride !== undefined && (
                                                            <div className="flex flex-col text-indigo-600">
                                                               <span className="text-indigo-300 font-medium text-[9px] uppercase">Last Reset Point</span>
                                                               {c.leaveBalanceOverrideDate || 'Initial'} ({c.leaveBalanceOverride} Days)
                                                            </div>
                                                         )}
                                                      </div>
                                                   </div>
                                                </div>
                                             </td>
                                          </tr>
                                       )}
                                    </React.Fragment>
                                 );
                              })}
                           {balanceList.length === 0 && (
                              <tr>
                                 <td colSpan={4} className="p-12 text-center text-slate-400">
                                    <User size={48} className="mx-auto mb-3 opacity-20"/>
                                    <p className="font-bold">
                                       {balanceSearch || balanceStoreFilter !== 'ALL'
                                          ? 'No employees found matching the filters.'
                                          : showInactiveBalance
                                             ? 'No inactive employees.'
                                             : 'No active employees.'}
                                    </p>
                                 </td>
                              </tr>
                           )}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
         )}

         {activeTab === 'DASHBOARD' && (
            <div className="space-y-6 animate-in fade-in">
               <div className="flex justify-end">
                  <Button 
                    variant={isLoggingLeave ? "secondary" : "primary"}
                    className="!w-auto" 
                    onClick={() => setIsLoggingLeave(!isLoggingLeave)}
                  >
                     {isLoggingLeave ? <X className="w-4 h-4 mr-2"/> : <Plus className="w-4 h-4 mr-2"/>}
                     {isLoggingLeave ? "Cancel Logging" : "Log Leave on Behalf"}
                  </Button>
               </div>

               {isLoggingLeave && (
                  <Card title="Log Leave for Staff" className="border-2 border-indigo-500 animate-in slide-in-from-top-4">
                     <div className="grid md:grid-cols-3 gap-4">
                        <div>
                           <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Employee</label>
                           <Select value={adminLeave.crewId} onChange={e => setAdminLeave({...adminLeave, crewId: e.target.value})}>
                              <option value="">Select Employee...</option>
                              {crew.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.crewName}</option>)}
                           </Select>
                        </div>
                        <div>
                           <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Leave Type</label>
                           <Select value={adminLeave.type} onChange={e => setAdminLeave({...adminLeave, type: e.target.value as any})}>
                              <option value="CASUAL">Casual Leave</option>
                              <option value="SICK">Sick Leave</option>
                              <option value="VACATION">Vacation</option>
                           </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                           <div>
                              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">From</label>
                              <Input type="date" value={adminLeave.startDate} onChange={e => setAdminLeave({...adminLeave, startDate: e.target.value})} />
                           </div>
                           <div>
                              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">To</label>
                              <Input type="date" value={adminLeave.endDate} onChange={e => setAdminLeave({...adminLeave, endDate: e.target.value})} />
                           </div>
                        </div>
                     </div>
                     <div className="mt-4">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Reason / Manager Note</label>
                        <TextArea 
                           placeholder="Reason for logging on behalf..." 
                           value={adminLeave.reason} 
                           onChange={e => setAdminLeave({...adminLeave, reason: e.target.value})} 
                        />
                     </div>
                     <div className="mt-4 flex justify-end">
                        <Button className="!w-auto" onClick={submitAdminLeave} isLoading={isSubmittingAdminLeave}>
                           Confirm & Log Leave
                        </Button>
                     </div>
                  </Card>
               )}

               <div className="grid md:grid-cols-2 gap-6">
                  <Card title="Today's Logs">
                     <div className="max-h-[300px] overflow-y-auto">
                        {logs.filter(l => isSameDay(l.timestamp.toDate(), new Date())).map(l => (
                           <div key={l.id} className="flex justify-between border-b py-2 last:border-0">
                              <span>{l.crewName}</span>
                              <div className="text-right">
                                 <Badge variant={l.type === 'CHECK_IN' ? 'success' : 'neutral'}>{l.type}</Badge>
                                 <div className="text-xs text-slate-400">{formatInTimeZone(l.timestamp.toDate(), 'h:mm a', timezone)}</div>
                              </div>
                           </div>
                        ))}
                        {logs.filter(l => isSameDay(l.timestamp.toDate(), new Date())).length === 0 && <p className="text-slate-400">No logs today.</p>}
                     </div>
                  </Card>
                  
                  <Card title="Pending Requests">
                     <div className="max-h-[300px] overflow-y-auto">
                        {leaves.filter(l => l.status === 'PENDING').map(l => {
                           const employee = crew.find(c => c.id === l.crewId || c.authUid === l.crewId);
                           const availableBalance = employee ? attendanceService.calculateLeaveBalance(employee, leaves) : 0;
                           
                           return (
                               <div key={l.id} className="bg-slate-50 p-4 rounded-xl mb-3 border border-slate-200 shadow-sm relative group hover:border-emerald-200 transition-colors">
                                  <div className="flex justify-between items-start mb-2">
                                     <div>
                                         <div className="font-bold text-slate-800">{l.crewName}</div>
                                         <div className="text-xs text-slate-500 font-medium">Balance: <span className="text-indigo-600 font-bold">{availableBalance} days</span></div>
                                     </div>
                                     <Badge variant="warning">Pending</Badge>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mb-3 bg-white p-2 rounded-lg border border-slate-100">
                                      <div>
                                          <span className="block text-slate-400 uppercase text-[10px] font-bold">Type</span>
                                          <span className="font-bold text-indigo-600">{l.type}</span>
                                      </div>
                                      <div>
                                          <span className="block text-slate-400 uppercase text-[10px] font-bold">Duration</span>
                                          <span className="font-bold">
                                              {format(parseISO(l.startDate), 'MMM d')} - {format(parseISO(l.endDate), 'MMM d')}
                                              <span className="text-slate-400 ml-1">
                                                  ({differenceInDays(parseISO(l.endDate), parseISO(l.startDate)) + 1} days)
                                              </span>
                                          </span>
                                      </div>
                                  </div>

                                  <div className="flex items-start gap-2 mb-3">
                                      <MessageSquare className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0"/>
                                      <p className="text-sm text-slate-700 italic">"{l.reason}"</p>
                                  </div>

                                  <div className="flex gap-2 pt-2 border-t border-slate-100">
                                     <Button className="!py-1.5 !text-xs !bg-emerald-500 hover:!bg-emerald-600 flex-1" onClick={() => updateLeave(l.id!, 'APPROVED')}>
                                         <Check className="w-3 h-3 mr-1"/> Approve
                                     </Button>
                                     <Button className="!py-1.5 !text-xs !bg-red-500 hover:!bg-red-600 flex-1" onClick={() => updateLeave(l.id!, 'REJECTED')}>
                                         <X className="w-3 h-3 mr-1"/> Reject
                                     </Button>
                                  </div>
                               </div>
                           );
                        })}
                        {leaves.filter(l => l.status === 'PENDING').length === 0 && (
                            <div className="text-center py-8 text-slate-400 flex flex-col items-center">
                                <Check size={32} className="mb-2 opacity-20"/>
                                <p>All caught up! No pending requests.</p>
                            </div>
                        )}
                     </div>
                  </Card>
               </div>

               <Card title="Leave History">
                   <div className="flex flex-col md:flex-row gap-4 mb-4">
                       <div className="flex-1">
                           <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Filter By Employee</label>
                           <Select value={historyEmployeeFilter} onChange={e => setHistoryEmployeeFilter(e.target.value)}>
                               <option value="ALL">All Employees</option>
                               {crew.map(c => <option key={c.id} value={c.id}>{c.crewName}</option>)}
                           </Select>
                       </div>
                       <div className="flex-1">
                           <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Filter By Store</label>
                           <Select value={historyStoreFilter} onChange={e => setHistoryStoreFilter(e.target.value)}>
                               <option value="ALL">All Stores</option>
                               {uniqueStores.map(s => <option key={s} value={s}>{s}</option>)}
                           </Select>
                       </div>
                   </div>
                   
                   <div className="overflow-x-auto">
                       <table className="w-full text-sm">
                           <thead>
                               <tr className="border-b border-slate-100 bg-slate-50/50">
                                   <th className="text-left p-3 font-bold text-slate-500 uppercase text-xs">Employee</th>
                                   <th className="text-left p-3 font-bold text-slate-500 uppercase text-xs">Store</th>
                                   <th className="text-left p-3 font-bold text-slate-500 uppercase text-xs">Type</th>
                                   <th className="text-left p-3 font-bold text-slate-500 uppercase text-xs">Dates</th>
                                   <th className="text-left p-3 font-bold text-slate-500 uppercase text-xs">Current Balance</th>
                                   <th className="text-center p-3 font-bold text-slate-500 uppercase text-xs">Status</th>
                                   <th className="text-right p-3 font-bold text-slate-500 uppercase text-xs">Actions</th>
                               </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100">
                               {leaves
                                   .filter(l => historyEmployeeFilter === 'ALL' || l.crewId === historyEmployeeFilter)
                                   .filter(l => historyStoreFilter === 'ALL' || l.outletId === historyStoreFilter)
                                   .map(l => {
                                       const emp = crew.find(c => c.id === l.crewId || c.authUid === l.crewId);
                                       const balance = emp ? attendanceService.calculateLeaveBalance(emp, leaves) : 0;
                                       
                                       return (
                                           <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                                               <td className="p-3 font-bold text-slate-700">{l.crewName}</td>
                                               <td className="p-3 text-xs text-slate-500">{l.outletId}</td>
                                               <td className="p-3"><Badge variant="neutral" className="!py-0.5">{l.type}</Badge></td>
                                               <td className="p-3 text-slate-600 text-xs">
                                                   {format(parseISO(l.startDate), 'MMM d')} - {format(parseISO(l.endDate), 'MMM d, yyyy')}
                                               </td>
                                               <td className="p-3 font-bold text-indigo-600">{balance} days</td>
                                               <td className="p-3 text-center">
                                                   <Badge variant={l.status === 'APPROVED' ? 'success' : l.status === 'REJECTED' ? 'danger' : 'warning'}>{l.status}</Badge>
                                               </td>
                                               <td className="p-3 text-right">
                                                    <div className="flex justify-end gap-1">
                                                       {l.status !== 'APPROVED' && (
                                                           <button onClick={() => updateLeave(l.id!, 'APPROVED')} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Approve">
                                                               <Check size={14}/>
                                                           </button>
                                                       )}
                                                       {l.status !== 'REJECTED' && (
                                                           <button onClick={() => updateLeave(l.id!, 'REJECTED')} className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg transition-colors" title="Reject">
                                                               <X size={14}/>
                                                           </button>
                                                       )}
                                                       <button 
                                                           onClick={async () => { if(confirm("Permanently delete this leave record?")) { await attendanceService.deleteLeave(l.id!); loadData(); }}} 
                                                           className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" 
                                                           title="Delete Record"
                                                       >
                                                           <Trash2 size={14}/>
                                                       </button>
                                                    </div>
                                               </td>
                                           </tr>
                                       );
                                   })}
                           </tbody>
                       </table>
                   </div>
               </Card>
            </div>
         )}
      </div>
   );
};
