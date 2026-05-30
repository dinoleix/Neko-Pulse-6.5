
import React, { useState, useEffect } from 'react';
import { db } from '../../../firebaseConfig';
import { getCachedSettingsDoc } from '../../../services/configCache';
import { shiftService } from '../../../services/shiftService';
import { Shift, ShiftAssignment, CrewMember, Store, LeaveRequest, CafeHoliday } from '../../../types';
import { Button, Card, Input, Select, Badge } from '../../../components/SharedComponents';
import { Clock, Store as StoreIcon, Trash2, ChevronLeft, ChevronRight, Copy, Share2, MessageCircle, Coffee, Palmtree, Edit, X, Loader2, Globe, CheckSquare, Plane } from 'lucide-react';
import { format, addDays, isSameDay, eachDayOfInterval } from 'date-fns';
import { getCurrentTimeInTimeZone, DEFAULT_TIMEZONE } from '../../../utils/dateFormatter';

// --- HELPERS ---
const startOfWeek = (date: Date, options?: { weekStartsOn?: number }) => {
   const d = new Date(date);
   const day = d.getDay();
   const diff = (day < (options?.weekStartsOn || 0) ? 7 : 0) + day - (options?.weekStartsOn || 0);
   d.setDate(d.getDate() - diff);
   d.setHours(0, 0, 0, 0);
   return d;
};

const parseISO = (str: string) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const ShiftAdminView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ROSTER' | 'DEFINITIONS'>('ROSTER');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [holidays, setHolidays] = useState<CafeHoliday[]>([]);
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  
  // Filter / Roster State
  const [selectedOutlet, setSelectedOutlet] = useState('');
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [isLoading, setIsLoading] = useState(false);

  // Definition State
  const [newShift, setNewShift] = useState<Partial<Shift>>({ name: '', startTime: '09:00', endTime: '17:00', color: '#10b981', outletId: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Modals
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [newHoliday, setNewHoliday] = useState<Partial<CafeHoliday>>({ name: '', date: '', outletId: 'ALL' });
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [copyWeeks, setCopyWeeks] = useState(1);
  const [copyEligibleCrew, setCopyEligibleCrew] = useState<string[]>([]);
  const [selectedCrewForCopy, setSelectedCrewForCopy] = useState<Set<string>>(new Set());
  const [isCopying, setIsCopying] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [sharePeriod, setSharePeriod] = useState<'TODAY' | 'TOMORROW' | 'WEEK'>('TODAY');

  useEffect(() => {
    getCachedSettingsDoc('appConfig').then(cfg => {
        const tz = cfg?.timezone;
        setTimezone(tz || DEFAULT_TIMEZONE);
        const nowTz = getCurrentTimeInTimeZone(tz || DEFAULT_TIMEZONE);
        setCurrentWeekStart(startOfWeek(nowTz, { weekStartsOn: 1 }));
    });
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
        const [s, a, h, context] = await Promise.all([
            shiftService.getShifts(),
            shiftService.getAllAssignments(),
            shiftService.getHolidays(),
            shiftService.getContextData()
        ]);

        setShifts(s);
        setAssignments(a);
        setHolidays(h);
        setCrew(context.crew);
        setStores(context.stores);
        setLeaves(context.leaves);
    } catch (e) {
       console.error(e);
    } finally {
       setIsLoading(false);
    }
  };

  const handleSaveShift = async () => {
    if (!newShift.name || !newShift.outletId) {
        alert("Name and Outlet are required");
        return;
    }
    setIsSaving(true);
    try {
        await shiftService.saveShift(newShift, editingId || undefined);
        setNewShift({ name: '', startTime: '09:00', endTime: '17:00', color: '#10b981', outletId: selectedOutlet || '' });
        setEditingId(null);
        const s = await shiftService.getShifts();
        setShifts(s);
    } catch (error) {
        alert("Failed to save shift template.");
    } finally {
        setIsSaving(false);
    }
  };

  const handleAddHoliday = async () => {
      if(!newHoliday.name || !newHoliday.date) { alert("Name and Date required"); return; }
      try {
          await shiftService.addHoliday(newHoliday);
          setNewHoliday({ name: '', date: '', outletId: 'ALL' });
          setIsHolidayModalOpen(false);
          const h = await shiftService.getHolidays();
          setHolidays(h);
      } catch (e) { alert("Error saving holiday"); }
  };

  const deleteHoliday = async (id: string) => {
      if(!confirm("Delete holiday?")) return;
      await shiftService.deleteHoliday(id);
      setHolidays(prev => prev.filter(h => h.id !== id));
  };

  const deleteShiftDefinition = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if(window.confirm("Delete this shift template?")) {
        setDeletingId(id);
        try {
            await shiftService.deleteShift(id);
            setShifts(prev => prev.filter(s => s.id !== id));
        } catch (error) { alert("Delete failed"); } finally { setDeletingId(null); }
    }
  };

  const assignShift = async (dateStr: string, crewId: string, shiftId: string | 'DAY_OFF', isPilot: boolean = false) => {
    const crewMember = crew.find(c => c.id === crewId);
    if(!crewMember) return;

    // Check existing
    const existing = assignments.find(a => a.crewId === crewId && a.date === dateStr);
    if(existing) {
        if(!window.confirm("Employee already has an assignment this day. Replace it?")) return;
        await shiftService.deleteAssignment(existing.id!);
        // Remove locally immediately for smooth UX
        setAssignments(prev => prev.filter(a => a.id !== existing.id));
    }

    let assignment: ShiftAssignment;

    if (shiftId === 'DAY_OFF') {
        assignment = {
            crewId: crewMember.id!,
            crewName: crewMember.crewName,
            outletId: selectedOutlet,
            date: dateStr,
            isDayOff: true
        };
    } else {
        const shiftDef = shifts.find(s => s.id === shiftId);
        if(!shiftDef) return;

        const dateObj = parseISO(dateStr);
        const isOnLeave = leaves.some(l => {
            if(l.crewId !== crewId) return false;
            const start = parseISO(l.startDate);
            const end = parseISO(l.endDate);
            return dateObj >= start && dateObj <= end;
        });

        if (isOnLeave) {
            alert(`${crewMember.crewName} is on Approved Leave for this date.`);
            return;
        }

        assignment = {
            shiftId: shiftDef.id!,
            shiftName: shiftDef.name,
            startTime: shiftDef.startTime,
            endTime: shiftDef.endTime,
            color: shiftDef.color,
            crewId: crewMember.id!,
            crewName: crewMember.crewName,
            outletId: shiftDef.outletId,
            date: dateStr,
            isDayOff: false,
            isPilot: isPilot
        };
    }

    const ref = await shiftService.assignShift(assignment);
    setAssignments(prev => [...prev, { ...assignment, id: ref.id }]);
  };

  const removeAssignment = async (assignmentId: string) => {
    if(window.confirm("Remove this assignment?")) {
        await shiftService.deleteAssignment(assignmentId);
        setAssignments(prev => prev.filter(a => a.id !== assignmentId));
    }
  };

  // --- COPY LOGIC ---
  const openCopyModal = () => {
      if (!selectedOutlet) { alert("Please select a store first."); return; }
      const start = currentWeekStart;
      const end = addDays(currentWeekStart, 6);
      const eligibleAssignments = assignments.filter(a => {
          const d = parseISO(a.date);
          return d >= start && d <= end && a.outletId === selectedOutlet;
      });
      if (eligibleAssignments.length === 0) { alert("No shifts found in the current week to copy."); return; }
      
      const uniqueCrewIds = Array.from(new Set(eligibleAssignments.map(a => a.crewId)))
          .filter(id => {
              const c = crew.find(m => m.id === id);
              return c && c.role !== 'Counter';
          });
          
      if (uniqueCrewIds.length === 0) { alert("No eligible employees found for copying (Counter role excluded)."); return; }
      
      setCopyEligibleCrew(uniqueCrewIds);
      setSelectedCrewForCopy(new Set(uniqueCrewIds)); 
      setCopyWeeks(1);
      setIsCopyModalOpen(true);
  };

  const executeCopy = async () => {
    if (selectedCrewForCopy.size === 0) { alert("Select at least one employee."); return; }
    setIsCopying(true);
    try {
        const start = currentWeekStart;
        const end = addDays(currentWeekStart, 6);
        const sourceAssignments = assignments.filter(a => {
            const d = parseISO(a.date);
            return d >= start && d <= end && a.outletId === selectedOutlet && selectedCrewForCopy.has(a.crewId);
        });
        const newAssignments: ShiftAssignment[] = [];
        let skipped = 0;
        for (let i = 1; i <= copyWeeks; i++) {
            for (const assign of sourceAssignments) {
                const oldDate = parseISO(assign.date);
                const newDate = addDays(oldDate, 7 * i);
                const newDateStr = format(newDate, 'yyyy-MM-dd');
                const alreadyExists = assignments.some(a => a.crewId === assign.crewId && a.date === newDateStr) ||
                                      newAssignments.some(a => a.crewId === assign.crewId && a.date === newDateStr);
                if (!alreadyExists) {
                    const { id, ...cleanAssign } = assign; 
                    newAssignments.push({ ...cleanAssign, date: newDateStr });
                } else {
                    skipped++;
                }
            }
        }
        if (newAssignments.length === 0) {
            alert("No changes made (targets occupied).");
        } else {
            await shiftService.bulkAssignShifts(newAssignments);
            const fresh = await shiftService.getAllAssignments();
            setAssignments(fresh);
            alert(`Added ${newAssignments.length} shifts. ${skipped > 0 ? `(${skipped} skipped)` : ''}`);
        }
        setIsCopyModalOpen(false);
    } catch (e) {
        alert("Failed to copy schedule.");
    } finally {
        setIsCopying(false);
    }
  };

  // --- SHARE LOGIC ---
  const generateShareText = () => {
      const storeName = stores.find(s => s.outletId === selectedOutlet)?.name || selectedOutlet;
      let text = `*📅 Shift Roster: ${storeName}*\n\n`;
      const nowTz = getCurrentTimeInTimeZone(timezone);
      let startRange = nowTz;
      let endRange = nowTz;

      if (sharePeriod === 'TOMORROW') {
          startRange = addDays(nowTz, 1);
          endRange = addDays(nowTz, 1);
      } else if (sharePeriod === 'WEEK') {
          startRange = currentWeekStart;
          endRange = addDays(currentWeekStart, 6);
          text += `🗓️ _Week of ${format(startRange, 'MMM d')}_\n\n`;
      }

      const days = eachDayOfInterval({ start: startRange, end: endRange });
      
      days.forEach(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isHoliday = holidays.find(h => h.date === dateStr && (h.outletId === 'ALL' || h.outletId === selectedOutlet));
          if (isHoliday) {
              text += `*${format(day, 'EEEE, MMM d')}*\n⛔ CLOSED: ${isHoliday.name}\n\n`;
              return;
          }

          const dayAssignments = assignments.filter(a => {
              if (a.date !== dateStr || a.outletId !== selectedOutlet) return false;
              return a.isDayOff || shifts.some(s => s.id === a.shiftId);
          });
          
          if (dayAssignments.length > 0) {
              text += `*${format(day, 'EEEE, MMM d')}*\n`;
              const shiftsOnDay: Record<string, string[]> = {};
              const offDuty: string[] = [];

              dayAssignments.forEach(a => {
                  if (a.isDayOff) {
                      offDuty.push(a.crewName);
                  } else {
                      const key = `${a.shiftName} (${a.startTime}-${a.endTime})`;
                      if (!shiftsOnDay[key]) shiftsOnDay[key] = [];
                      const pilotBadge = a.isPilot ? " ✈️ PILOT" : "";
                      shiftsOnDay[key].push(`${a.crewName}${pilotBadge}`);
                  }
              });

              Object.entries(shiftsOnDay).forEach(([shiftInfo, crewNames]) => {
                  text += `🕒 ${shiftInfo}\n`;
                  crewNames.forEach(name => {
                      text += `   👤 ${name}\n`;
                  });
                  text += `\n`;
              });

              if (offDuty.length > 0) {
                  text += `🏖️ Weekly Off: ${offDuty.join(', ')}\n\n`;
              }
              text += `----------------\n`;
          }
      });
      return text;
   };

  const handleWhatsAppShare = () => {
      window.open(`https://wa.me/?text=${encodeURIComponent(generateShareText())}`, '_blank');
  };

  const weekDays = eachDayOfInterval({
    start: currentWeekStart,
    end: addDays(currentWeekStart, 6)
  });

  const filteredCrew = selectedOutlet ? crew.filter(c => (c.outletId === selectedOutlet || c.isMobile) && c.role !== 'Counter') : [];
  filteredCrew.sort((a,b) => a.crewName.localeCompare(b.crewName));
  const availableShifts = selectedOutlet ? shifts.filter(s => s.outletId === selectedOutlet) : [];

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
       
       {/* SHARE MODAL */}
       {isShareModalOpen && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
               <Card className="max-w-md w-full !p-0 overflow-hidden shadow-2xl">
                   <div className="bg-[#25D366] p-4 border-b border-green-600 flex justify-between items-center text-white">
                       <h3 className="font-bold text-lg flex items-center gap-2"><MessageCircle className="w-6 h-6"/> Share Roster</h3>
                       <button onClick={() => setIsShareModalOpen(false)} className="hover:bg-green-700 p-1 rounded-full"><X className="w-5 h-5"/></button>
                   </div>
                   <div className="p-6 space-y-4">
                       <div>
                           <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Select Period</label>
                           <div className="flex bg-slate-100 p-1 rounded-xl">
                               {['TODAY', 'TOMORROW', 'WEEK'].map(p => (
                                   <button key={p} onClick={() => setSharePeriod(p as any)} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${sharePeriod === p ? 'bg-white shadow text-green-600' : 'text-slate-500'}`}>{p}</button>
                               ))}
                           </div>
                       </div>
                       <div>
                           <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Message Preview</label>
                           <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 h-48 overflow-y-auto font-mono text-xs text-slate-700 whitespace-pre-wrap">{generateShareText()}</div>
                       </div>
                       <Button onClick={handleWhatsAppShare} className="!bg-[#25D366] hover:!bg-green-600 shadow-green-200"><Share2 className="w-4 h-4 mr-2"/> Send via WhatsApp</Button>
                   </div>
               </Card>
           </div>
       )}

       {/* HOLIDAY MODAL */}
       {isHolidayModalOpen && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
               <Card title="Manage Holidays" className="max-w-lg w-full shadow-2xl">
                   <div className="space-y-4">
                       <div className="flex gap-2">
                           <Input placeholder="Holiday Name" value={newHoliday.name} onChange={e => setNewHoliday({...newHoliday, name: e.target.value})} />
                           <Input type="date" value={newHoliday.date} onChange={e => setNewHoliday({...newHoliday, date: e.target.value})} />
                       </div>
                       <div>
                           <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Apply To</label>
                           <Select value={newHoliday.outletId} onChange={e => setNewHoliday({...newHoliday, outletId: e.target.value})}>
                               <option value="ALL">All Stores</option>
                               {stores.map(s => <option key={s.id} value={s.outletId}>{s.name}</option>)}
                           </Select>
                       </div>
                       <Button onClick={handleAddHoliday} className="!w-auto">Add Holiday</Button>
                       <div className="mt-4 border-t border-slate-100 pt-4 max-h-48 overflow-y-auto space-y-2">
                           {holidays.map(h => (
                               <div key={h.id} className="flex justify-between items-center bg-red-50 p-2 rounded-lg border border-red-100">
                                   <div className="text-sm">
                                       <span className="font-bold text-red-700">{h.name}</span>
                                       <span className="text-red-400 mx-2">•</span>
                                       <span className="text-slate-500">{format(parseISO(h.date), 'MMM d, yyyy')}</span>
                                       <Badge variant="neutral" className="ml-2 !text-[10px]">{h.outletId}</Badge>
                                   </div>
                                   <button onClick={() => deleteHoliday(h.id!)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
                               </div>
                           ))}
                       </div>
                       <Button variant="secondary" onClick={() => setIsHolidayModalOpen(false)}>Close</Button>
                   </div>
               </Card>
           </div>
       )}

       {/* COPY MODAL */}
       {isCopyModalOpen && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
               <Card className="max-w-md w-full !p-0 overflow-hidden shadow-2xl">
                   <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                       <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Copy className="w-5 h-5 text-indigo-500"/> Duplicate Schedule</h3>
                       <button onClick={() => setIsCopyModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                   </div>
                   <div className="p-6 space-y-6">
                       <div>
                           <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Repeat For</label>
                           <div className="flex items-center gap-2">
                               <Input type="number" min={1} max={12} value={copyWeeks} onChange={e => setCopyWeeks(parseInt(e.target.value))} className="!text-center !text-lg font-bold !py-2" />
                               <span className="font-bold text-slate-600">Weeks</span>
                           </div>
                       </div>
                       <div>
                           <div className="flex justify-between items-center mb-2">
                               <label className="text-xs font-bold text-slate-400 uppercase">Select Employees</label>
                               <button onClick={() => setSelectedCrewForCopy(selectedCrewForCopy.size === copyEligibleCrew.length ? new Set() : new Set(copyEligibleCrew))} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
                                   {selectedCrewForCopy.size === copyEligibleCrew.length ? 'Deselect All' : 'Select All'}
                               </button>
                           </div>
                           <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50 space-y-1">
                               {copyEligibleCrew.map(id => {
                                   const c = crew.find(x => x.id === id);
                                   if (!c) return null;
                                   const isSel = selectedCrewForCopy.has(id);
                                   return (
                                       <div key={id} onClick={() => { const ns = new Set(selectedCrewForCopy); isSel ? ns.delete(id) : ns.add(id); setSelectedCrewForCopy(ns); }} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer select-none transition-colors">
                                           <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${isSel ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white border-slate-300'}`}>{isSel && <CheckSquare className="w-3 h-3" />}</div>
                                           <span className="text-sm font-bold text-slate-700">{c.crewName}</span>
                                       </div>
                                   );
                               })}
                           </div>
                       </div>
                       <div className="flex gap-3">
                           <Button variant="secondary" onClick={() => setIsCopyModalOpen(false)}>Cancel</Button>
                           <Button onClick={executeCopy} isLoading={isCopying}>Confirm Duplicate</Button>
                       </div>
                   </div>
               </Card>
           </div>
       )}

       <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-slate-800">Shift Management</h2>
          <div className="flex bg-slate-100 p-1 rounded-xl">
             <button onClick={() => setActiveTab('ROSTER')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'ROSTER' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Roster</button>
             <button onClick={() => setActiveTab('DEFINITIONS')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'DEFINITIONS' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Templates</button>
          </div>
       </div>

       {activeTab === 'DEFINITIONS' && (
          <div className="grid md:grid-cols-3 gap-6 animate-in fade-in">
             <Card title={editingId ? "Edit Shift Template" : "Create Shift Template"}>
                <div className="space-y-4">
                   <div>
                      <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Shift Name</label>
                      <Input placeholder="e.g. Morning Shift" value={newShift.name} onChange={e => setNewShift({...newShift, name: e.target.value})} />
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                      <div>
                         <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Start Time</label>
                         <Input type="time" value={newShift.startTime} onChange={e => setNewShift({...newShift, startTime: e.target.value})} />
                      </div>
                      <div>
                         <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">End Time</label>
                         <Input type="time" value={newShift.endTime} onChange={e => setNewShift({...newShift, endTime: e.target.value})} />
                      </div>
                   </div>
                   <div>
                       <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Store</label>
                       <Select value={newShift.outletId} onChange={e => setNewShift({...newShift, outletId: e.target.value})}>
                           <option value="">Select Store</option>
                           {stores.map(s => <option key={s.id} value={s.outletId}>{s.name}</option>)}
                       </Select>
                   </div>
                   <div>
                       <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Color Code</label>
                       <div className="flex gap-2">
                           {['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'].map(c => (
                               <button key={c} onClick={() => setNewShift({...newShift, color: c})} className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${newShift.color === c ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`} style={{backgroundColor: c}} />
                           ))}
                       </div>
                   </div>
                   <div className="flex gap-2 pt-4">
                       {editingId && <Button variant="secondary" onClick={() => { setNewShift({ name: '', startTime: '09:00', endTime: '17:00', color: '#10b981', outletId: selectedOutlet || '' }); setEditingId(null); }}>Cancel</Button>}
                       <Button onClick={handleSaveShift} isLoading={isSaving}>{editingId ? 'Update' : 'Create'}</Button>
                   </div>
                </div>
             </Card>

             <Card title="Shift Templates" className="md:col-span-2">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                   {shifts.map(s => (
                       <div key={s.id} className="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-start hover:shadow-md transition-all">
                           <div>
                               <div className="font-bold text-slate-800">{s.name}</div>
                               <div className="text-xs text-slate-500 flex items-center gap-1 mt-1"><Clock className="w-3 h-3"/> {s.startTime} - {s.endTime}</div>
                               <div className="text-xs text-slate-400 mt-1 flex items-center gap-1"><StoreIcon className="w-3 h-3"/> {s.outletId}</div>
                           </div>
                           <div className="flex flex-col gap-2 items-end">
                               <div className="w-3 h-3 rounded-full" style={{backgroundColor: s.color}}></div>
                               <div className="flex gap-1">
                                   <button onClick={() => { setNewShift(s); setEditingId(s.id!); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-indigo-400 hover:text-indigo-600"><Edit className="w-4 h-4"/></button>
                                   <button onClick={(e) => deleteShiftDefinition(e, s.id!)} className="text-slate-300 hover:text-red-500">{deletingId === s.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4"/>}</button>
                               </div>
                           </div>
                       </div>
                   ))}
                   {shifts.length === 0 && <p className="text-slate-400 text-sm p-4 col-span-3 text-center">No shift templates defined.</p>}
                </div>
             </Card>
          </div>
       )}

       {activeTab === 'ROSTER' && (
          <div className="space-y-6 animate-in fade-in">
             <Card>
                <div className="flex flex-col md:flex-row gap-6 justify-between items-end">
                    <div className="w-full md:w-64">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Select Outlet</label>
                        <Select value={selectedOutlet} onChange={e => setSelectedOutlet(e.target.value)}>
                            <option value="">-- Choose Store --</option>
                            {stores.map(s => <option key={s.id} value={s.outletId}>{s.name}</option>)}
                        </Select>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1">
                            <button onClick={() => setCurrentWeekStart(d => addDays(d, -7))} className="p-2 hover:bg-slate-50 rounded-lg"><ChevronLeft className="w-5 h-5"/></button>
                            <span className="px-4 font-bold text-slate-700 text-sm whitespace-nowrap">{format(currentWeekStart, 'MMM d')} - {format(addDays(currentWeekStart, 6), 'MMM d, yyyy')}</span>
                            <button onClick={() => setCurrentWeekStart(d => addDays(d, 7))} className="p-2 hover:bg-slate-50 rounded-lg"><ChevronRight className="w-5 h-5"/></button>
                        </div>
                        <Button className="!w-auto" onClick={() => setCurrentWeekStart(startOfWeek(getCurrentTimeInTimeZone(timezone), { weekStartsOn: 1 }))}>Current Week</Button>
                        
                        <div className="flex gap-2">
                            <Button variant="secondary" className="!w-auto !px-3" title="Manage Holidays" onClick={() => setIsHolidayModalOpen(true)}><Palmtree className="w-4 h-4"/></Button>
                            <Button variant="secondary" className="!w-auto !px-3" title="Duplicate this week's schedule" onClick={openCopyModal} disabled={!selectedOutlet}><Copy className="w-4 h-4"/></Button>
                            <Button className="!w-auto !px-3 !bg-[#25D366] hover:!bg-green-600 text-white border-0" title="Share Roster" onClick={() => setIsShareModalOpen(true)} disabled={!selectedOutlet}><Share2 className="w-4 h-4"/></Button>
                        </div>
                    </div>
                </div>
             </Card>

             {selectedOutlet ? (
                 <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                     <table className="w-full text-sm border-collapse min-w-[1000px]">
                         <thead>
                             <tr className="bg-slate-50 border-b border-slate-200">
                                 <th className="p-4 text-left min-w-[150px] sticky left-0 bg-slate-50 z-10 border-r border-slate-100">Employee</th>
                                 {weekDays.map(day => {
                                     const dateStr = format(day, 'yyyy-MM-dd');
                                     const isHoliday = holidays.find(h => h.date === dateStr && (h.outletId === 'ALL' || h.outletId === selectedOutlet));
                                     return (
                                         <th key={day.toString()} className={`p-4 text-center border-l border-slate-100 relative ${isSameDay(day, getCurrentTimeInTimeZone(timezone)) ? 'bg-indigo-50/50' : ''}`}>
                                             <div className="font-bold text-slate-700">{format(day, 'EEE')}</div>
                                             <div className="text-xs text-slate-400">{format(day, 'MMM d')}</div>
                                             {isHoliday && <div className="absolute inset-x-0 bottom-0 top-0 bg-red-100/50 flex flex-col items-center justify-center border-b-2 border-red-400"><span className="text-[10px] font-bold text-red-600 bg-white/80 px-1 rounded">{isHoliday.name}</span></div>}
                                         </th>
                                     );
                                 })}
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                             {filteredCrew.map(c => (
                                 <tr key={c.id} className="hover:bg-slate-50/50">
                                     <td className="p-4 sticky left-0 bg-white z-10 border-r border-slate-100">
                                         <div className="font-bold text-slate-800">{c.crewName}</div>
                                         <div className="text-xs text-slate-400 flex items-center gap-1">{c.role} {c.isMobile && <span title="Mobile Employee"><Globe className="w-3 h-3 text-indigo-400" /></span>}</div>
                                     </td>
                                     {weekDays.map(day => {
                                         const dateStr = format(day, 'yyyy-MM-dd');
                                         const assignedShift = assignments.find(a => a.crewId === c.id && a.date === dateStr);
                                         const isHoliday = holidays.find(h => h.date === dateStr && (h.outletId === 'ALL' || h.outletId === selectedOutlet));
                                         
                                         const isOnLeave = leaves.some(l => {
                                            if(l.crewId !== c.id) return false;
                                            const start = parseISO(l.startDate);
                                            const end = parseISO(l.endDate);
                                            return day >= start && day <= end;
                                         });

                                         if (isHoliday) {
                                             return <td key={dateStr} className="p-2 border-l border-slate-100 text-center bg-red-50/30"><div className="text-xs font-bold text-red-300 transform -rotate-45 mt-4">CLOSED</div></td>;
                                         }

                                         return (
                                             <td key={dateStr} className={`p-2 border-l border-slate-100 text-center align-top h-24 relative group ${isSameDay(day, getCurrentTimeInTimeZone(timezone)) ? 'bg-indigo-50/20' : ''}`}>
                                                 {isOnLeave ? (
                                                     <div className="w-full h-full bg-slate-100 rounded-lg flex items-center justify-center text-xs font-bold text-slate-400 border border-dashed border-slate-300">LEAVE</div>
                                                 ) : assignedShift ? (
                                                     <div className={`relative w-full h-full p-2 rounded-lg shadow-sm flex flex-col justify-center items-center gap-1 cursor-pointer hover:brightness-95 transition-all ${assignedShift.isDayOff ? 'bg-slate-200 border-2 border-slate-300 text-slate-500' : 'text-white'}`} style={assignedShift.isDayOff ? {} : {backgroundColor: assignedShift.color}} title="Click to Remove" onClick={() => removeAssignment(assignedShift.id!)}>
                                                         {assignedShift.isDayOff ? <><Coffee className="w-4 h-4 mb-1"/><div className="font-bold text-[10px]">WEEKLY OFF</div></> : (
                                                             <>
                                                                <div className="font-bold text-xs flex items-center gap-1">
                                                                    {assignedShift.isPilot && <Plane className="w-3 h-3 text-white"/>}
                                                                    {assignedShift.shiftName}
                                                                </div>
                                                                <div className="text-[10px] opacity-90">{assignedShift.startTime} - {assignedShift.endTime}</div>
                                                                {assignedShift.isPilot && <span className="text-[8px] font-bold bg-black/20 px-1 rounded">PILOT</span>}
                                                             </>
                                                         )}
                                                     </div>
                                                 ) : (
                                                     <div className="w-full h-full opacity-50 hover:opacity-100 transition-opacity flex flex-col gap-1 overflow-y-auto max-h-24 no-scrollbar">
                                                         <button onClick={() => assignShift(dateStr, c.id!, 'DAY_OFF')} className="text-[10px] font-bold py-1 px-2 rounded bg-slate-100 border border-slate-300 text-slate-500 hover:bg-slate-200 transition-colors shadow-sm mb-1">Mark Day Off</button>
                                                         {availableShifts.map(s => (
                                                             <div key={s.id} className="flex gap-1">
                                                                 <button onClick={() => assignShift(dateStr, c.id!, s.id!, false)} className="flex-1 text-[10px] font-bold py-1 px-2 rounded bg-white border border-slate-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-colors shadow-sm truncate">{s.name}</button>
                                                                 <button onClick={() => assignShift(dateStr, c.id!, s.id!, true)} className="w-6 flex items-center justify-center rounded bg-amber-50 border border-amber-200 text-amber-500 hover:bg-amber-100 transition-colors shadow-sm" title="Assign as Pilot"><Plane className="w-3 h-3"/></button>
                                                             </div>
                                                         ))}
                                                         {availableShifts.length === 0 && <span className="text-[10px] text-slate-300">No shifts defined</span>}
                                                     </div>
                                                 )}
                                             </td>
                                         );
                                     })}
                                 </tr>
                             ))}
                             {filteredCrew.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">No employees found for this outlet.</td></tr>}
                         </tbody>
                     </table>
                 </div>
             ) : (
                 <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                     <StoreIcon className="w-12 h-12 text-slate-300 mx-auto mb-4"/>
                     <h3 className="font-bold text-slate-600">Select an Outlet</h3>
                     <p className="text-slate-400">Choose a store to view and manage its roster.</p>
                 </div>
             )}
          </div>
       )}
    </div>
  );
};
