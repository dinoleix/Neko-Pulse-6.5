
import React, { useState, useEffect } from 'react';
import { shiftService } from '../../../services/shiftService';
import { CurrentUser, ShiftAssignment, CafeHoliday, PILOT_CAT_IMAGE } from '../../../types';
import { Card, Badge } from '../../../components/SharedComponents';
import { Clock, ChevronLeft, ChevronRight, Palmtree, Coffee, User, Plane } from 'lucide-react';
import { format, addDays, isSameDay, eachDayOfInterval } from 'date-fns';

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

export const ShiftCrewView: React.FC<{ currentUser: CurrentUser }> = ({ currentUser }) => {
    const isCounterRole = currentUser.accessRole === 'Counter';
    const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
    const [holidays, setHolidays] = useState<CafeHoliday[]>([]);
    const [viewMode, setViewMode] = useState<'WEEK' | 'MONTH'>('WEEK');
    const [currentDate, setCurrentDate] = useState(new Date());

    useEffect(() => {
        // Counter role always sees Week view to accommodate roster density
        if (isCounterRole) setViewMode('WEEK');
        loadShifts();
    }, [currentUser, viewMode, currentDate]);

    const loadShifts = async () => {
        let start = new Date();
        let end = new Date();

        if (viewMode === 'WEEK') {
            start = startOfWeek(currentDate, { weekStartsOn: 1 });
            end = endOfWeek(currentDate, { weekStartsOn: 1 });
        } else {
            start = startOfMonth(currentDate);
            end = endOfMonth(currentDate);
        }

        const startStr = format(start, 'yyyy-MM-dd');
        const endStr = format(end, 'yyyy-MM-dd');

        const dbId = currentUser.dbId;
        const uid = currentUser.uid;

        try {
            const allHolidays = await shiftService.getHolidays();
            setHolidays(allHolidays);

            let data: ShiftAssignment[] = [];

            if (isCounterRole) {
                // COUNTER ROLE: Fetch ALL assignments for the store (Roster View)
                const allAssignments = await shiftService.getAllAssignments();
                data = allAssignments.filter(a => a.outletId === currentUser.outletId);
            } else {
                // REGULAR STAFF: Fetch only MY assignments
                if (dbId) {
                    const s1 = await shiftService.getUserAssignments(dbId);
                    data = [...s1];
                }
                if (uid && uid !== dbId) {
                    const s2 = await shiftService.getUserAssignments(uid);
                    const existingKeys = new Set(data.map(s => `${s.date}_${s.shiftName}`));
                    s2.forEach(s => {
                        if (!existingKeys.has(`${s.date}_${s.shiftName}`)) {
                            data.push(s);
                        }
                    });
                }
            }

            const filtered = data.filter(d => d.date >= startStr && d.date <= endStr);
            
            // Sort: Date first, then Start Time (for roster order)
            filtered.sort((a,b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return (a.startTime || '').localeCompare(b.startTime || '');
            });
            
            setAssignments(filtered);
        } catch (e) {
            console.error("Error loading shifts", e);
        }
    };

    const days = viewMode === 'WEEK' 
        ? eachDayOfInterval({ start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) })
        : eachDayOfInterval({ start: startOfMonth(currentDate), end: endOfMonth(currentDate) });

    const getHeaderText = () => {
        if (viewMode === 'WEEK') return `${format(days[0], 'MMM d')} - ${format(days[days.length-1], 'MMM d')}`;
        return format(currentDate, 'MMMM yyyy');
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-800">{isCounterRole ? 'Store Roster' : 'My Shifts'}</h1>
                
                {/* Only show toggle for non-counter roles */}
                {!isCounterRole && (
                    <div className="flex bg-white rounded-xl border border-slate-200 p-1">
                        <button onClick={() => setViewMode('WEEK')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'WEEK' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>Week</button>
                        <button onClick={() => setViewMode('MONTH')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'MONTH' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>Month</button>
                    </div>
                )}
            </div>

            <Card className="!p-0 overflow-hidden">
                <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                    <button onClick={() => setCurrentDate(d => viewMode === 'WEEK' ? addDays(d, -7) : addDays(d, -30))} className="p-2 hover:bg-white rounded-lg transition-colors"><ChevronLeft/></button>
                    <span className="font-bold text-slate-700">
                        {getHeaderText()}
                    </span>
                    <button onClick={() => setCurrentDate(d => viewMode === 'WEEK' ? addDays(d, 7) : addDays(d, 30))} className="p-2 hover:bg-white rounded-lg transition-colors"><ChevronRight/></button>
                </div>
                
                <div className="divide-y divide-slate-100">
                    {days.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        // Filter all shifts for this day
                        const dayAssignments = assignments.filter(a => a.date === dateStr);
                        
                        const isHoliday = holidays.find(h => h.date === dateStr && (h.outletId === 'ALL' || h.outletId === currentUser.outletId));
                        const isToday = isSameDay(day, new Date());

                        return (
                            <div key={dateStr} className={`p-4 flex gap-4 ${isToday ? 'bg-indigo-50/30' : ''} ${isCounterRole ? 'items-start' : 'items-center'}`}>
                                <div className={`flex flex-col items-center w-12 flex-shrink-0 pt-1 ${isToday ? 'text-indigo-600' : 'text-slate-500'}`}>
                                    <span className="text-xs font-bold uppercase">{format(day, 'EEE')}</span>
                                    <span className="text-xl font-bold">{format(day, 'd')}</span>
                                </div>
                                
                                <div className="flex-1">
                                    {isHoliday ? (
                                        <div className="flex items-center gap-3 bg-red-50 border border-red-100 p-3 rounded-xl">
                                            <Palmtree className="w-5 h-5 text-red-500"/>
                                            <span className="font-bold text-red-800">Closed: {isHoliday.name}</span>
                                        </div>
                                    ) : (
                                        <>
                                            {/* COUNTER ROLE: ROSTER LIST VIEW */}
                                            {isCounterRole ? (
                                                <div className="space-y-2">
                                                    {dayAssignments.length > 0 ? (
                                                        dayAssignments.map(shift => {
                                                            const isMe = shift.crewId === currentUser.uid || shift.crewId === currentUser.dbId;
                                                            return (
                                                                <div key={shift.id} className={`flex justify-between items-center p-2 rounded-lg border ${shift.isPilot ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-200' : isMe ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100'}`}>
                                                                    <div className="flex items-center gap-2">
                                                                        {shift.isPilot && (
                                                                            <div className="w-8 h-8 rounded-full border border-amber-300 overflow-hidden shadow-sm flex-shrink-0 bg-amber-500 flex items-center justify-center text-white">
                                                                                <Plane className="w-4 h-4" />
                                                                            </div>
                                                                        )}
                                                                        <div>
                                                                            <div className="font-bold text-sm text-slate-700 flex items-center gap-2">
                                                                                {shift.crewName}
                                                                                {isMe && <Badge variant="neutral" className="!py-0 !text-[10px]">YOU</Badge>}
                                                                            </div>
                                                                            {!shift.isDayOff && <div className="text-[10px] text-slate-500">{shift.shiftName} {shift.isPilot && "(Shift Pilot)"}</div>}
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-xs font-bold text-slate-600">
                                                                        {shift.isDayOff ? (
                                                                            <span className="text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">OFF</span>
                                                                        ) : (
                                                                            <span>{shift.startTime} - {shift.endTime}</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    ) : (
                                                        <div className="text-slate-300 text-sm italic py-1">No shifts scheduled</div>
                                                    )}
                                                </div>
                                            ) : (
                                                // STANDARD ROLE: SINGLE CARD VIEW
                                                dayAssignments.length > 0 ? (
                                                    dayAssignments.map(shift => (
                                                        <div 
                                                            key={shift.id}
                                                            className={`flex justify-between items-center bg-white border border-slate-100 p-3 rounded-xl shadow-sm border-l-4`}
                                                            style={{borderLeftColor: shift.isDayOff ? '#94a3b8' : shift.color}}
                                                        >
                                                            {shift.isDayOff ? (
                                                                <div className="flex items-center gap-2">
                                                                    <Coffee className="w-5 h-5 text-slate-400"/>
                                                                    <span className="font-bold text-slate-600">Weekly Off</span>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-3">
                                                                    {shift.isPilot && (
                                                                        <div className="w-10 h-10 rounded-full border border-amber-200 overflow-hidden shadow-sm flex-shrink-0 bg-amber-500 flex items-center justify-center text-white">
                                                                            <Plane className="w-5 h-5" />
                                                                        </div>
                                                                    )}
                                                                    <div>
                                                                        <div className="font-bold text-slate-800 flex items-center gap-2">
                                                                            {shift.shiftName}
                                                                            {shift.isPilot && <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 rounded-full font-bold uppercase tracking-wider">Pilot On Duty</span>}
                                                                        </div>
                                                                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                                                                            <Clock className="w-3 h-3"/> {shift.startTime} - {shift.endTime}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <Badge variant="neutral">{shift.outletId}</Badge>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="text-slate-300 text-sm italic py-2">No shift scheduled</div>
                                                )
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card>
        </div>
    );
};
