
import React, { useState, useEffect } from 'react';
import { db } from '../../../firebaseConfig'; // Still needed for timestamp if constructing manually, though service handles most
import { getCachedSettingsDoc } from '../../../services/configCache';
import { taskService } from '../../../services/taskService';
import { Task, TaskTemplate, TaskLog, TaskFrequency, TaskProofType, Store, TaskConfig, CrewMember } from '../../../types';
import { Button, Card, Input, Badge, AudioRecorder, Checkbox, Select, TextArea, FullScreenImageViewer } from '../../../components/SharedComponents';
import { ClipboardList, Clock, CheckCircle, Image as ImageIcon, Plus, Trash2, Calendar, MapPin, AlertCircle, X, Filter, LayoutList, Activity, ArrowRight, Edit, Save, Copy, Bell, Volume2, Zap, Monitor, Play, Users, VolumeX, Timer, FileText, Loader2, Mic, AlignLeft, BarChart3, TrendingUp, CheckSquare, ChevronLeft, Camera, Search, BellRing } from 'lucide-react';
import { format, getDate, isSameDay, endOfDay, isAfter, eachDayOfInterval, addDays } from 'date-fns';
import { formatInTimeZone, getShiftedDate, getCurrentTimeInTimeZone, DEFAULT_TIMEZONE } from '../../../utils/dateFormatter';
import { SOUND_LIBRARY } from '../../../utils/soundLibrary';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, Cell } from 'recharts';

// --- HELPERS ---
const startOfWeek = (date: Date, options?: { weekStartsOn?: number }) => {
   const d = new Date(date);
   const day = d.getDay();
   const diff = (day < (options?.weekStartsOn || 0) ? 7 : 0) + day - (options?.weekStartsOn || 0);
   d.setDate(d.getDate() - diff);
   d.setHours(0, 0, 0, 0);
   return d;
};

const endOfWeek = (date: Date, options?: { weekStartsOn?: number }) => {
    const start = startOfWeek(date, options);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
};

const startOfMonth = (date: Date) => {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
};

const endOfMonth = (date: Date) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    d.setHours(23, 59, 59, 999);
    return d;
};

const startOfQuarter = (date: Date) => {
    const d = new Date(date);
    const q = Math.floor(d.getMonth() / 3);
    d.setMonth(q * 3);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
};

const endOfQuarter = (date: Date) => {
    const d = new Date(date);
    const q = Math.floor(d.getMonth() / 3);
    d.setMonth(q * 3 + 3);
    d.setDate(0);
    d.setHours(23, 59, 59, 999);
    return d;
};

const subDays = (date: Date, amount: number) => {
   const d = new Date(date);
   d.setDate(d.getDate() - amount);
   return d;
};

const startOfDay = (date: Date) => {
   const d = new Date(date);
   d.setHours(0, 0, 0, 0);
   return d;
};

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];


export const TaskAdminView: React.FC = () => {
   const [activeTab, setActiveTab] = useState<'MONITOR' | 'DEFINITIONS' | 'TEMPLATES' | 'SETTINGS'>('MONITOR');
   const [tasks, setTasks] = useState<Task[]>([]);
   const [templates, setTemplates] = useState<TaskTemplate[]>([]);
   const [stores, setStores] = useState<Store[]>([]);
   const [allCrew, setAllCrew] = useState<CrewMember[]>([]); 
   const [config, setConfig] = useState<TaskConfig>({ alertEnabled: false, alertType: 'BOTH', alertDurationMinutes: 5, alertSoundId: 'BEEP' });
   const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
   
   // --- MONITOR STATE ---
   const [monitorDateFilter, setMonitorDateFilter] = useState<'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'QUARTER'>('TODAY');
   const [monitorOutletFilter, setMonitorOutletFilter] = useState<string>('ALL');
   const [monitorStatusFilter, setMonitorStatusFilter] = useState<'ALL' | 'COMPLETED' | 'OVERDUE' | 'SCHEDULED'>('ALL');
   const [taskInstances, setTaskInstances] = useState<any[]>([]);
   const [trendData, setTrendData] = useState<any[]>([]);
   const [storePerformance, setStorePerformance] = useState<any[]>([]);
   const [stats, setStats] = useState({ total: 0, completed: 0, overdue: 0, scheduled: 0, rate: 0 });
   const [isLoadingMonitor, setIsLoadingMonitor] = useState(false);

   // --- DEFINITION STATE ---
   const [definitionOutletFilter, setDefinitionOutletFilter] = useState<string>('ALL');
   const [definitionFrequencyFilter, setDefinitionFrequencyFilter] = useState<string>('ALL');
   const [taskSearchQuery, setTaskSearchQuery] = useState('');
   const [isCreating, setIsCreating] = useState(false);
   const [editingId, setEditingId] = useState<string | null>(null);
   const [isSavingTemplate, setIsSavingTemplate] = useState(false);
   const [isSavingSettings, setIsSavingSettings] = useState(false);
   const [deletingId, setDeletingId] = useState<string | null>(null);
   const [newTask, setNewTask] = useState<Partial<Task>>({ 
      title: '', 
      frequency: TaskFrequency.DAILY, 
      outletId: '', 
      timeSlots: ['09:00'],
      repeatDays: [],
      repeatDate: 1,
      proofTypes: [TaskProofType.NONE], 
      assignedCrewIds: []
   });

   // --- TEMPLATE EDIT STATE ---
   const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

   useEffect(() => {
      loadData();
   }, []);

   useEffect(() => {
      if (activeTab === 'MONITOR') {
         generateMonitorData();
      }
   }, [activeTab, monitorDateFilter, monitorOutletFilter, tasks, timezone]);

   const loadData = async () => {
      try {
          getCachedSettingsDoc('appConfig').then(cfg => {
              if(cfg) setTimezone(cfg.timezone || DEFAULT_TIMEZONE);
          });

          const [tData, templData, configData, contextData] = await Promise.all([
              taskService.getTasks(),
              taskService.getTemplates(),
              taskService.getConfig(),
              taskService.getContextData()
          ]);

          setTasks(tData);
          setTemplates(templData);
          setConfig(configData);
          setStores(contextData.stores);
          setAllCrew(contextData.crew);
      } catch (e) {
          console.error("Data Load Error", e);
      }
   };

   // --- MONITOR LOGIC ---
   const generateMonitorData = async () => {
      setIsLoadingMonitor(true);
      try {
         // 1. Determine Date Range based on TIMEZONE
         const nowTz = getCurrentTimeInTimeZone(timezone);
         let start = startOfDay(nowTz);
         let end = endOfDay(nowTz);

         if (monitorDateFilter === 'TODAY') {
            start = startOfDay(nowTz);
            end = endOfDay(nowTz);
         } else if (monitorDateFilter === 'YESTERDAY') {
             // Calculate yesterday relative to timezone
             const yesterdayTz = subDays(nowTz, 1);
             start = startOfDay(yesterdayTz);
             end = endOfDay(yesterdayTz);
         } else if (monitorDateFilter === 'WEEK') {
            start = startOfWeek(nowTz, { weekStartsOn: 1 });
            end = endOfWeek(nowTz, { weekStartsOn: 1 });
         } else if (monitorDateFilter === 'MONTH') {
            start = startOfMonth(nowTz);
            end = endOfMonth(nowTz);
         } else if (monitorDateFilter === 'QUARTER') {
            start = startOfQuarter(nowTz);
            end = endOfQuarter(nowTz);
         }

         // Buffer Query to ensure offsets don't exclude data
         const queryStart = subDays(start, 2);
         const queryEnd = addDays(end, 2);

         const logs = await taskService.getLogs(queryStart, queryEnd, monitorOutletFilter);

         const instances: any[] = [];
         const daysInRange = eachDayOfInterval({ start, end });

         for (const currentDay of daysInRange) {
            const dayName = format(currentDay, 'EEEE');
            const dayNum = getDate(currentDay);

            tasks.forEach(task => {
               let applies = false;
               if (task.frequency === TaskFrequency.DAILY) applies = true;
               if (task.frequency === TaskFrequency.WEEKLY && task.repeatDays?.includes(dayName)) applies = true;
               // Ensure monthly repeat date matches day number (e.g. 1st, 15th)
               if (task.frequency === TaskFrequency.MONTHLY && Number(task.repeatDate) === dayNum) applies = true;

               if (applies && task.outletId) {
                  // FILTER BY OUTLET
                  if (monitorOutletFilter !== 'ALL' && task.outletId !== monitorOutletFilter) return;

                  const outletId = task.outletId;
                  const slots = task.timeSlots?.length ? task.timeSlots : ['Anytime'];
                  slots.forEach(slot => {
                     const foundLog = logs.find(l => {
                         const logDate = l.completedAt.toDate ? l.completedAt.toDate() : new Date(l.completedAt);
                         // Use helper to shift to IST and check same day
                         const logDateTz = getShiftedDate(logDate, timezone);
                         
                         return l.taskId === task.id && 
                                l.outletId === outletId && 
                                (l.scheduledTime === slot || slot === 'Anytime' || l.scheduledTime === 'Anytime') &&
                                isSameDay(logDateTz, currentDay);
                     });

                     let status = 'SCHEDULED';
                     if (foundLog) {
                        status = 'COMPLETED';
                     } else {
                        if (slot !== 'Anytime') {
                           const [h, m] = slot.split(':').map(Number);
                           const slotTime = new Date(currentDay);
                           slotTime.setHours(h, m, 0, 0);
                           if (isAfter(nowTz, slotTime)) status = 'OVERDUE';
                        } else {
                           if (isAfter(nowTz, endOfDay(currentDay))) status = 'OVERDUE';
                        }
                     }

                     instances.push({
                        id: `${task.id}_${outletId}_${slot}_${currentDay.getTime()}`,
                        taskTitle: task.title,
                        outletId,
                        slot,
                        date: currentDay,
                        status,
                        log: foundLog
                     });
                  });
               }
            });
         }

         const total = instances.length;
         const completed = instances.filter(i => i.status === 'COMPLETED').length;
         const overdue = instances.filter(i => i.status === 'OVERDUE').length;
         const scheduled = instances.filter(i => i.status === 'SCHEDULED').length;
         const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

         setStats({ total, completed, overdue, scheduled, rate });
         setTaskInstances(instances);

         // Helper for charts
         const trendMap: Record<string, { total: number, completed: number }> = {};
         daysInRange.forEach(d => {
             const dStr = format(d, 'MMM d');
             trendMap[dStr] = { total: 0, completed: 0 };
         });

         instances.forEach(i => {
             const dStr = format(i.date, 'MMM d');
             if (trendMap[dStr]) {
                 trendMap[dStr].total++;
                 if (i.status === 'COMPLETED') trendMap[dStr].completed++;
             }
         });

         const chartData = Object.entries(trendMap).map(([date, data]) => ({
             date,
             rate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0
         }));
         setTrendData(chartData);

         const storeMap: Record<string, { total: number, completed: number }> = {};
         instances.forEach(i => {
             if (!storeMap[i.outletId]) storeMap[i.outletId] = { total: 0, completed: 0 };
             storeMap[i.outletId].total++;
             if (i.status === 'COMPLETED') storeMap[i.outletId].completed++;
         });

         const storeChartData = Object.entries(storeMap).map(([name, data]) => ({
             name,
             rate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
             completed: data.completed,
             total: data.total
         }));
         storeChartData.sort((a,b) => b.rate - a.rate);
         setStorePerformance(storeChartData);

      } catch (e) {
         console.error(e);
      } finally {
         setIsLoadingMonitor(false);
      }
   };

   // --- DEFINITION ACTIONS ---
   const toggleProofType = (type: TaskProofType) => {
       let current = [...(newTask.proofTypes || [])];
       if (type === TaskProofType.NONE) { setNewTask({...newTask, proofTypes: [TaskProofType.NONE]}); return; }
       current = current.filter(t => t !== TaskProofType.NONE);
       if (current.includes(type)) current = current.filter(t => t !== type);
       else current.push(type);
       if (current.length === 0) current = [TaskProofType.NONE];
       setNewTask({...newTask, proofTypes: current});
   };

   const toggleDay = (day: string) => {
      const current = newTask.repeatDays || [];
      const updated = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
      setNewTask({...newTask, repeatDays: updated});
   };

   const addTimeSlot = () => setNewTask({...newTask, timeSlots: [...(newTask.timeSlots || []), '12:00']});
   const updateTimeSlot = (index: number, val: string) => {
      const slots = [...(newTask.timeSlots || [])];
      slots[index] = val;
      setNewTask({...newTask, timeSlots: slots});
   };
   const removeTimeSlot = (index: number) => {
      const slots = (newTask.timeSlots || []).filter((_, i) => i !== index);
      setNewTask({...newTask, timeSlots: slots});
   };
   const toggleCrewAssignment = (crewId: string) => {
      const current = newTask.assignedCrewIds || [];
      const updated = current.includes(crewId) ? current.filter(id => id !== crewId) : [...current, crewId];
      setNewTask({...newTask, assignedCrewIds: updated});
   };

   const handleSaveTask = async () => {
      if(!newTask.title || !newTask.outletId) { alert("Title and store required."); return; }
      if(!newTask.proofTypes || newTask.proofTypes.length === 0) { alert("Select at least one proof type."); return; }
      
      try {
         const payload = { 
             title: newTask.title || '',
             outletId: newTask.outletId || '',
             frequency: newTask.frequency || TaskFrequency.DAILY,
             timeSlots: newTask.timeSlots || ['09:00'],
             proofTypes: newTask.proofTypes,
             description: newTask.description || '',
             instructions: newTask.instructions || '',
             repeatDays: newTask.repeatDays || [],
             repeatDate: Number(newTask.repeatDate) || 1, 
             assignedCrewIds: newTask.assignedCrewIds || [],
             isActive: true,
             proofType: newTask.proofTypes[0] // Legacy support
         };
         await taskService.saveTask(payload, editingId || undefined);
         resetForm(); loadData();
      } catch (err: any) { alert("Error: " + err.message); }
   };

   const handleSaveTemplateDirectly = async () => {
       if (!newTask.title) { alert("Template title required."); return; }
       setIsSavingTemplate(true);
       try {
           const payload: TaskTemplate = {
               title: newTask.title || '',
               description: newTask.description || '',
               instructions: newTask.instructions || '',
               frequency: newTask.frequency || TaskFrequency.DAILY,
               repeatDays: newTask.repeatDays || [],
               repeatDate: Number(newTask.repeatDate) || 1,
               timeSlots: newTask.timeSlots || ['09:00'],
               proofTypes: newTask.proofTypes || [TaskProofType.NONE],
               proofType: newTask.proofTypes ? newTask.proofTypes[0] : TaskProofType.NONE // Legacy support
           };
           await taskService.saveTemplate(payload, editingTemplateId || undefined);
           alert("Template Saved!"); resetForm(); loadData();
       } catch (e: any) { alert("Error: " + e.message); } finally { setIsSavingTemplate(false); }
   };

   const handleSaveAsTemplate = async () => {
      if (!newTask.title) { alert("Title required."); return; }
      const templateName = prompt("Template name:", newTask.title);
      if (!templateName) return;
      setIsSavingTemplate(true);
      try {
         const template: TaskTemplate = {
            title: templateName,
            description: newTask.description || '',
            instructions: newTask.instructions || '',
            frequency: newTask.frequency || TaskFrequency.DAILY,
            repeatDays: newTask.repeatDays || [],
            repeatDate: Number(newTask.repeatDate) || 1,
            timeSlots: newTask.timeSlots || ['09:00'],
            proofTypes: newTask.proofTypes || [TaskProofType.NONE],
            proofType: newTask.proofTypes ? newTask.proofTypes[0] : TaskProofType.NONE 
         };
         await taskService.saveTemplate(template);
         alert("Saved!"); loadData(); 
      } catch (e: any) { alert("Failed: " + e.message); } finally { setIsSavingTemplate(false); }
   };

   const loadTemplate = (templateId: string) => {
      const t = templates.find(temp => temp.id === templateId);
      if (t) {
         setNewTask({
            ...newTask, 
            title: t.title,
            description: t.description || '',
            instructions: t.instructions || '',
            frequency: t.frequency,
            repeatDays: t.repeatDays || [],
            repeatDate: t.repeatDate || 1,
            timeSlots: t.timeSlots || ['09:00'],
            proofTypes: t.proofTypes || [TaskProofType.NONE]
         });
      }
   };

   const startEditTemplate = (t: TaskTemplate) => {
       setNewTask({
           title: t.title,
           description: t.description || '',
           instructions: t.instructions || '',
           frequency: t.frequency,
           repeatDays: t.repeatDays || [],
           repeatDate: t.repeatDate || 1,
           timeSlots: t.timeSlots || ['09:00'],
           proofTypes: t.proofTypes || [TaskProofType.NONE]
       });
       setEditingTemplateId(t.id!);
   };

   const deleteTemplate = async (e: React.MouseEvent, id: string) => {
       e.stopPropagation(); e.preventDefault();
       if (window.confirm("Delete template?")) {
           setDeletingId(id);
           try {
               await taskService.deleteTemplate(id);
               setTemplates(prev => prev.filter(t => t.id !== id));
               if (editingTemplateId === id) resetForm();
           } catch(e: any) { alert("Error: " + e.message); } finally { setDeletingId(null); }
       }
   };

   const startEdit = (t: Task) => {
       setNewTask({
           ...t,
           outletId: t.outletId || '', 
           assignedCrewIds: t.assignedCrewIds || [],
           repeatDays: t.repeatDays || [],
           timeSlots: t.timeSlots || ['09:00'],
           proofTypes: t.proofTypes || [TaskProofType.NONE]
       });
       setEditingId(t.id!);
       setIsCreating(true);
       window.scrollTo({ top: 0, behavior: 'smooth' });
   };

   const resetForm = () => {
       setIsCreating(false);
       setEditingId(null);
       setEditingTemplateId(null);
       setNewTask({ 
          title: '', 
          frequency: TaskFrequency.DAILY, 
          outletId: '',
          timeSlots: ['09:00'],
          repeatDays: [],
          repeatDate: 1,
          proofTypes: [TaskProofType.NONE],
          assignedCrewIds: []
       });
   };

   const deleteTask = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation(); e.preventDefault();
      if(window.confirm("Delete task?")) {
         setDeletingId(id);
         try {
             await taskService.deleteTask(id);
             setTasks(prev => prev.filter(t => t.id !== id));
         } catch(err: any) { alert("Error: " + err.message); } finally { setDeletingId(null); }
      }
   };

   const saveConfig = async () => {
      setIsSavingSettings(true);
      try {
         await taskService.saveConfig(config);
         alert("Saved!");
      } catch (e) { alert("Error saving settings"); } finally { setIsSavingSettings(false); }
   };

   const previewSound = () => {
       const sound = SOUND_LIBRARY.find(s => s.id === config.alertSoundId);
       if(sound) {
           const audio = new Audio(sound.url);
           audio.play().catch(e => alert("Play failed. Please check sound settings."));
       }
   };

   const filteredCrew = allCrew.filter(c => c.outletId === newTask.outletId);

   // Reusable Form Logic for Tasks & Templates
   const renderCommonFormFields = () => (
       <>
           <div className="space-y-4">
               <div>
                   <label className="text-xs font-bold text-slate-400 uppercase">Title</label>
                   <Input placeholder="e.g. Clean Coffee Machine" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} />
               </div>
               <div>
                   <label className="text-xs font-bold text-slate-400 uppercase">Instructions (Optional)</label>
                   <TextArea placeholder="Details for the crew..." value={newTask.instructions} onChange={e => setNewTask({...newTask, instructions: e.target.value})} />
               </div>
               <div>
                   <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Proof Required (Select all that apply)</label>
                   <div className="flex flex-wrap gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-2">
                            <Checkbox checked={newTask.proofTypes?.includes(TaskProofType.NONE)} onChange={() => toggleProofType(TaskProofType.NONE)} />
                            <span className="text-sm font-bold text-slate-600">None (Checkbox only)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox checked={newTask.proofTypes?.includes(TaskProofType.PHOTO)} onChange={() => toggleProofType(TaskProofType.PHOTO)} />
                            <span className="text-sm font-bold text-slate-600 flex items-center gap-1"><ImageIcon className="w-3 h-3"/> Photo</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox checked={newTask.proofTypes?.includes(TaskProofType.TEXT)} onChange={() => toggleProofType(TaskProofType.TEXT)} />
                            <span className="text-sm font-bold text-slate-600 flex items-center gap-1"><AlignLeft className="w-3 h-3"/> Text Note</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox checked={newTask.proofTypes?.includes(TaskProofType.AUDIO)} onChange={() => toggleProofType(TaskProofType.AUDIO)} />
                            <span className="text-sm font-bold text-slate-600 flex items-center gap-1"><Mic className="w-3 h-3"/> Audio</span>
                        </div>
                   </div>
               </div>
           </div>
       </>
   );

   // Reusable Schedule Logic
   const renderScheduleFields = () => (
       <div className="bg-slate-50 p-6 rounded-2xl space-y-5">
           <h3 className="font-bold text-slate-700 flex items-center gap-2">
               <Calendar className="w-5 h-5 text-indigo-500"/> Schedule Configuration
           </h3>
           
           <div>
               <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Frequency</label>
               <div className="flex gap-2 p-1 bg-white rounded-xl border border-slate-200 inline-flex">
                   {[TaskFrequency.DAILY, TaskFrequency.WEEKLY, TaskFrequency.MONTHLY].map(f => (
                       <button
                           key={f}
                           onClick={() => setNewTask({...newTask, frequency: f})}
                           className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                               newTask.frequency === f ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
                           }`}
                       >
                           {f}
                       </button>
                   ))}
               </div>
           </div>

           {newTask.frequency === TaskFrequency.WEEKLY && (
               <div className="animate-in slide-in-from-top-2">
                   <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Repeat On</label>
                   <div className="flex flex-wrap gap-2">
                       {DAYS_OF_WEEK.map(day => (
                           <button
                               key={day}
                               onClick={() => toggleDay(day)}
                               className={`w-10 h-10 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                                   newTask.repeatDays?.includes(day)
                                       ? 'bg-indigo-500 text-white'
                                       : 'bg-white border border-slate-200 text-slate-400'
                               }`}
                           >
                               {day.substr(0, 3)}
                           </button>
                       ))}
                   </div>
               </div>
           )}

           {newTask.frequency === TaskFrequency.MONTHLY && (
               <div className="animate-in slide-in-from-top-2">
                   <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Day of Month</label>
                   <div className="flex items-center gap-2">
                       <span className="text-sm font-bold text-slate-600">Repeat on the</span>
                       <Input 
                           type="number" 
                           min={1} max={31} 
                           className="!w-20 text-center"
                           value={newTask.repeatDate}
                           onChange={e => setNewTask({...newTask, repeatDate: parseInt(e.target.value)})}
                       />
                       <span className="text-sm font-bold text-slate-600">of every month</span>
                   </div>
               </div>
           )}

           <div>
               <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Time Slots</label>
               <div className="space-y-2">
                   {newTask.timeSlots?.map((time, idx) => (
                       <div key={idx} className="flex gap-2">
                           <Input 
                               type="time" 
                               value={time} 
                               onChange={e => updateTimeSlot(idx, e.target.value)}
                               className="!py-2"
                           />
                           {newTask.timeSlots!.length > 1 && (
                               <Button variant="danger" className="!w-auto !p-2" onClick={() => removeTimeSlot(idx)}>
                                   <X className="w-4 h-4"/>
                               </Button>
                           )}
                       </div>
                   ))}
                   <Button variant="secondary" className="!w-auto !py-2 !text-xs" onClick={addTimeSlot}>
                       <Plus className="w-3 h-3 mr-1"/> Add Time Slot
                   </Button>
               </div>
           </div>
       </div>
   );

   return (
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
         {/* HEADER & TABS */}
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h2 className="text-2xl font-bold text-slate-800">Task Manager</h2>
            <div className="bg-slate-100 p-1 rounded-xl flex overflow-x-auto">
               <button onClick={() => setActiveTab('MONITOR')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'MONITOR' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Monitor</button>
               <button onClick={() => setActiveTab('DEFINITIONS')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'DEFINITIONS' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Tasks</button>
               <button onClick={() => setActiveTab('TEMPLATES')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'TEMPLATES' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Templates</button>
               <button onClick={() => setActiveTab('SETTINGS')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'SETTINGS' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Alerts</button>
            </div>
         </div>

         {/* --- MONITOR TAB --- */}
         {activeTab === 'MONITOR' && (
            <div className="animate-in fade-in space-y-6">
               <div className="flex flex-col md:flex-row gap-6 items-start">
                   <Card className="flex-1 w-full">
                      <div className="space-y-4">
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Performance Period (IST)</label>
                              <div className="flex gap-2">
                                 {['TODAY', 'YESTERDAY', 'WEEK', 'MONTH', 'QUARTER'].map(f => (
                                    <button key={f} onClick={() => setMonitorDateFilter(f as any)} className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${monitorDateFilter === f ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}>{f}</button>
                                 ))}
                              </div>
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Filter by Store</label>
                              <Select value={monitorOutletFilter} onChange={e => setMonitorOutletFilter(e.target.value)}>
                                  <option value="ALL">All Stores</option>
                                  {stores.map(s => <option key={s.id} value={s.outletId}>{s.name} ({s.outletId})</option>)}
                              </Select>
                          </div>
                      </div>
                   </Card>
                   
                   {/* SUMMARY METRICS */}
                   <div className="grid grid-cols-3 gap-4 w-full md:w-auto flex-[2]">
                       <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                           <div className="text-xs font-bold text-slate-400 uppercase mb-1">Total Tasks</div>
                           <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
                       </div>
                       <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                           <div className="text-xs font-bold text-slate-400 uppercase mb-1">Completed</div>
                           <div className="text-2xl font-bold text-emerald-600">{stats.completed}</div>
                       </div>
                       <div className="bg-indigo-600 p-4 rounded-2xl shadow-lg shadow-indigo-200 text-white">
                           <div className="text-xs font-bold text-indigo-200 uppercase mb-1">Compliance</div>
                           <div className="text-2xl font-bold">{stats.rate}%</div>
                       </div>
                   </div>
               </div>

               <div className="grid md:grid-cols-2 gap-6">
                   {/* TREND CHART */}
                   <Card title="Performance Trend">
                       <div className="h-64">
                           <ResponsiveContainer width="100%" height="100%">
                               <AreaChart data={trendData}>
                                   <defs>
                                       <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                                           <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                                           <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                       </linearGradient>
                                   </defs>
                                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                                   <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} minTickGap={20} />
                                   <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} unit="%"/>
                                   <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                   <Area type="monotone" dataKey="rate" stroke="#6366f1" fillOpacity={1} fill="url(#colorRate)" name="Completion Rate"/>
                               </AreaChart>
                           </ResponsiveContainer>
                       </div>
                   </Card>

                   {/* STORE PERFORMANCE */}
                   <Card title="Store Comparison">
                       <div className="h-64">
                           <ResponsiveContainer width="100%" height="100%">
                               <BarChart data={storePerformance} layout="vertical">
                                   <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                                   <YAxis dataKey="name" type="category" width={80} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                                   <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '12px'}} />
                                   <Bar dataKey="rate" name="Compliance %" radius={[0, 4, 4, 0]} barSize={20}>
                                       {storePerformance.map((entry, index) => (
                                           <Cell key={`cell-${index}`} fill={entry.rate >= 80 ? '#10b981' : entry.rate >= 50 ? '#f59e0b' : '#ef4444'} />
                                       ))}
                                   </Bar>
                               </BarChart>
                           </ResponsiveContainer>
                           {storePerformance.length === 0 && <p className="text-center text-slate-400 mt-[-100px]">No data available.</p>}
                       </div>
                   </Card>
               </div>

               {/* DETAILED LOGS */}
               <Card title="Detailed Logs">
                   <div className="flex gap-2 overflow-x-auto pb-4 border-b border-slate-100 mb-4">
                       {[
                          { id: 'ALL', label: 'All Tasks' },
                          { id: 'COMPLETED', label: 'Completed' },
                          { id: 'OVERDUE', label: 'Overdue' },
                          { id: 'SCHEDULED', label: 'Scheduled' },
                       ].map(f => (
                          <button key={f.id} onClick={() => setMonitorStatusFilter(f.id as any)} className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all whitespace-nowrap ${monitorStatusFilter === f.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}>
                             {f.label}
                          </button>
                       ))}
                   </div>

                   <div className="space-y-3 max-h-[500px] overflow-y-auto">
                      {taskInstances.filter(i => monitorStatusFilter === 'ALL' || i.status === monitorStatusFilter).map(inst => (
                         <div key={inst.id} className="bg-white p-4 rounded-xl border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:shadow-md transition-all">
                            <div className="flex items-start gap-4">
                               <div className={`p-3 rounded-xl flex-shrink-0 ${inst.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-500' : inst.status === 'OVERDUE' ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-400'}`}>
                                  {inst.status === 'COMPLETED' ? <CheckCircle className="w-6 h-6"/> : inst.status === 'OVERDUE' ? <AlertCircle className="w-6 h-6"/> : <Clock className="w-6 h-6"/>}
                                </div>
                               <div>
                                  <div className="flex items-center gap-2">
                                     <h3 className="font-bold text-slate-800">{inst.taskTitle}</h3>
                                     <Badge variant={inst.status === 'COMPLETED' ? 'success' : inst.status === 'OVERDUE' ? 'danger' : 'neutral'}>{inst.status}</Badge>
                                  </div>
                                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-3">
                                     <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {inst.outletId}</span>
                                     <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {format(inst.date, 'MMM d')}</span>
                                     <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {inst.slot}</span>
                                  </div>
                                  {inst.log && (
                                     <div className="mt-2 text-xs bg-slate-50 p-2 rounded-lg inline-block border border-slate-100">
                                        <span className="font-bold text-slate-600">Done by {inst.log.crewName}</span> at {formatInTimeZone(inst.log.completedAt.toDate(), 'h:mm a', timezone)}
                                     </div>
                                  )}
                               </div>
                            </div>
                            <div className="flex gap-2">
                                 {inst.log?.proofData ? (
                                     inst.log.proofData.map((p: any, i: number) => (
                                         <div key={i} className="flex-shrink-0">
                                            {p.type === TaskProofType.PHOTO && (
                                                <FullScreenImageViewer src={p.value}>
                                                    <img src={p.value} className="w-16 h-16 rounded-lg object-cover border border-slate-200 cursor-pointer" title="Click to view full size"/>
                                                </FullScreenImageViewer>
                                            )}
                                            {p.type === TaskProofType.TEXT && <div className="max-w-[400px] min-w-[200px] text-xs p-2 bg-slate-50 rounded border italic whitespace-pre-wrap break-words" title={p.value}>"{p.value}"</div>}
                                         </div>
                                     ))
                                 ) : inst.log?.proofValue ? (
                                     <div className="flex-shrink-0">
                                        {inst.log.proofType === 'PHOTO' && (
                                            <FullScreenImageViewer src={inst.log.proofValue}>
                                                <img src={inst.log.proofValue} className="w-16 h-16 rounded-lg object-cover border border-slate-200 cursor-pointer" />
                                            </FullScreenImageViewer>
                                        )}
                                        {inst.log.proofType === 'TEXT' && <div className="max-w-[400px] min-w-[200px] text-xs p-2 bg-slate-50 rounded border italic truncate">"{inst.log.proofValue}"</div>}
                                     </div>
                                 ) : null}
                            </div>
                         </div>
                      ))}
                   </div>
               </Card>
            </div>
         )}
         
         {/* --- DEFINITIONS TAB --- */}
         {activeTab === 'DEFINITIONS' && (
            <div className="animate-in fade-in">
               <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                  <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto flex-1">
                      <div className="w-full md:w-48">
                          <Select value={definitionOutletFilter} onChange={e => setDefinitionOutletFilter(e.target.value)}>
                              <option value="ALL">All Stores</option>
                              {stores.map(s => <option key={s.id} value={s.outletId}>{s.name} ({s.outletId})</option>)}
                          </Select>
                      </div>
                      <div className="w-full md:w-40">
                          <Select value={definitionFrequencyFilter} onChange={e => setDefinitionFrequencyFilter(e.target.value)}>
                              <option value="ALL">All Frequencies</option>
                              <option value="DAILY">Daily</option>
                              <option value="WEEKLY">Weekly</option>
                              <option value="MONTHLY">Monthly</option>
                          </Select>
                      </div>
                      <div className="relative w-full md:w-64">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input 
                              placeholder="Search tasks..." 
                              value={taskSearchQuery} 
                              onChange={e => setTaskSearchQuery(e.target.value)} 
                              className="pl-10 !py-2"
                          />
                      </div>
                  </div>
                  <Button className="!w-auto" onClick={() => {
                      if (isCreating) resetForm();
                      else setIsCreating(true);
                  }}>
                     {isCreating ? 'Cancel' : '+ New Task'}
                  </Button>
               </div>

               {isCreating && (
                  <Card title={editingId ? "Edit Task" : "Create New Task"} className="mb-8 border-2 border-indigo-100">
                     {/* Template Loader */}
                     <div className="mb-6 bg-slate-50 p-4 rounded-xl flex items-center gap-3">
                         <div className="flex-1">
                             <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Load from Template</label>
                             <Select onChange={e => loadTemplate(e.target.value)}>
                                 <option value="">-- Select Template --</option>
                                 {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                             </Select>
                         </div>
                         <div className="flex-shrink-0 pt-5">
                             <span className="text-xs text-slate-400 font-medium">or start fresh below</span>
                         </div>
                     </div>
                     <div className="grid md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                           {renderCommonFormFields()}
                           <div className="pt-4 border-t border-slate-200 mt-4">
                              <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Assigned Store</label>
                              <Select value={newTask.outletId} onChange={e => setNewTask({...newTask, outletId: e.target.value, assignedCrewIds: []})}>
                                 <option value="">Select a Store</option>
                                 {stores.map(s => (
                                    <option key={s.id} value={s.outletId}>{s.name} ({s.outletId})</option>
                                 ))}
                              </Select>
                           </div>
                           {newTask.outletId && (
                              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 animate-in slide-in-from-top-2">
                                 <label className="text-xs font-bold text-indigo-500 uppercase mb-2 flex items-center gap-1"><Users className="w-3 h-3"/> Assign to Staff</label>
                                 <div className="space-y-2 max-h-40 overflow-y-auto">
                                    {filteredCrew.length > 0 ? filteredCrew.map(c => (
                                       <div key={c.id} className="flex items-center gap-2">
                                          <Checkbox checked={newTask.assignedCrewIds?.includes(c.id!) || false} onChange={() => toggleCrewAssignment(c.id!)} />
                                          <span className="text-sm text-slate-700">{c.crewName}</span>
                                       </div>
                                    )) : <p className="text-xs text-slate-400 italic">No staff found.</p>}
                                 </div>
                              </div>
                           )}
                        </div>
                        {renderScheduleFields()}
                     </div>
                     <div className="mt-8 flex gap-3">
                         <div className="flex-1"><Button onClick={handleSaveAsTemplate} variant="secondary" className="w-full" isLoading={isSavingTemplate}><Copy className="w-4 h-4 mr-2"/> Save as Template</Button></div>
                        <Button onClick={handleSaveTask} className="flex-[2]">{editingId ? 'Update Task' : 'Create Task'}</Button>
                     </div>
                  </Card>
               )}

               {/* List of Tasks */}
               <div className="space-y-3">
                  {tasks
                    .filter(t => definitionOutletFilter === 'ALL' || t.outletId === definitionOutletFilter)
                    .filter(t => definitionFrequencyFilter === 'ALL' || t.frequency === definitionFrequencyFilter)
                    .filter(t => t.title.toLowerCase().includes(taskSearchQuery.toLowerCase()))
                    .map(t => (
                     <div key={t.id} className="bg-white p-4 rounded-xl border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-4">
                           <div className={`p-3 rounded-lg ${t.isActive ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}><ClipboardList className="w-6 h-6"/></div>
                           <div>
                              <h3 className="font-bold text-slate-800 text-lg">{t.title}</h3>
                              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 mt-1">
                                 <Badge variant="neutral">{t.frequency}</Badge>
                                 <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {t.timeSlots?.join(', ') || t.dueTime}</span>
                                 <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {t.outletId || 'Unassigned'}</span>
                              </div>
                              {t.assignedCrewIds && t.assignedCrewIds.length > 0 && (
                                 <div className="text-xs text-emerald-600 font-bold mt-1 flex items-center gap-1">
                                    <Users className="w-3 h-3"/> Assigned to {t.assignedCrewIds.length} staff
                                 </div>
                              )}
                           </div>
                        </div>
                        <div className="flex items-center gap-2 self-end md:self-auto relative z-10">
                           <button type="button" onClick={() => startEdit(t)} className="p-2 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit"><Edit className="w-5 h-5"/></button>
                           <button type="button" onClick={(e) => deleteTask(e, t.id!)} disabled={deletingId === t.id} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete">{deletingId === t.id ? <Loader2 className="w-5 h-5 animate-spin"/> : <Trash2 className="w-5 h-5 pointer-events-none"/>}</button>
                        </div>
                     </div>
                  ))}
                  {tasks.length === 0 && <div className="text-center p-8 text-slate-400">No tasks defined matching filters. Create one above.</div>}
               </div>
            </div>
         )}

         {/* --- TEMPLATES TAB --- */}
         {activeTab === 'TEMPLATES' && (
             <div className="grid md:grid-cols-3 gap-6 animate-in fade-in">
                 {/* Template Form */}
                 <Card title={editingTemplateId ? "Edit Template" : "New Template"} className="h-fit">
                     <div className="space-y-4">
                         {renderCommonFormFields()}
                         {/* RESTORED SCHEDULE FIELDS IN TEMPLATE FORM */}
                         {renderScheduleFields()}

                         <div className="flex gap-2 pt-4">
                             {editingTemplateId && <Button variant="secondary" onClick={resetForm}>Cancel</Button>}
                             <Button onClick={handleSaveTemplateDirectly} isLoading={isSavingTemplate}>{editingTemplateId ? 'Update Template' : 'Save Template'}</Button>
                         </div>
                     </div>
                 </Card>
                 <div className="md:col-span-2 space-y-3">
                     {templates.map(t => (
                         <div key={t.id} className={`bg-white p-4 rounded-xl border transition-all flex justify-between items-start ${editingTemplateId === t.id ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-100 hover:shadow-md'}`}>
                             <div className="flex items-start gap-3">
                                 <div className="p-2 bg-indigo-50 text-indigo-500 rounded-lg"><FileText className="w-6 h-6"/></div>
                                 <div>
                                     <h3 className="font-bold text-slate-800">{t.title}</h3>
                                     <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-2">
                                         <Badge variant="neutral">{t.frequency}</Badge>
                                         <span>{t.proofTypes?.length} Proofs</span>
                                     </div>
                                 </div>
                             </div>
                             <div className="flex gap-1 relative z-10">
                                 <button type="button" onClick={() => startEditTemplate(t)} className="p-2 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"><Edit className="w-4 h-4"/></button>
                                 <button type="button" onClick={(e) => deleteTemplate(e, t.id!)} disabled={deletingId === t.id} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">{deletingId === t.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4 pointer-events-none"/>}</button>
                             </div>
                         </div>
                     ))}
                 </div>
             </div>
         )}

         {/* --- SETTINGS TAB --- */}
         {activeTab === 'SETTINGS' && (
             <div className="animate-in fade-in max-w-2xl mx-auto">
                 <Card title="Global Alert Configuration">
                    <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                            <div className="flex items-center gap-3"><Bell className="w-6 h-6 text-slate-600"/><span className="font-bold text-slate-700">Enable Task Alerts</span></div>
                            <Checkbox checked={config.alertEnabled} onChange={e => setConfig({...config, alertEnabled: e.target.checked})}/>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Alert Type</label><Select value={config.alertType} onChange={e => setConfig({...config, alertType: e.target.value as any})} disabled={!config.alertEnabled}><option value="SOUND">Sound Only</option><option value="FLASH">Flash Screen Only</option><option value="BOTH">Sound & Flash</option></Select></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Duration (Minutes)</label><Input type="number" min={1} max={60} value={config.alertDurationMinutes} onChange={e => setConfig({...config, alertDurationMinutes: parseInt(e.target.value)})} disabled={!config.alertEnabled} /></div>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100"><label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Alert Sound</label><div className="flex gap-2"><Select value={config.alertSoundId} onChange={e => setConfig({...config, alertSoundId: e.target.value})} disabled={!config.alertEnabled}>{SOUND_LIBRARY.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select><Button onClick={previewSound} disabled={!config.alertEnabled} variant="secondary" className="!w-auto"><Play className="w-4 h-4"/></Button></div></div>
                        <Button onClick={saveConfig} isLoading={isSavingSettings} disabled={!config.alertEnabled && false}>Save Configuration</Button>
                    </div>
                 </Card>
             </div>
         )}
      </div>
   );
};
