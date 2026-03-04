
import React, { useState, useEffect } from 'react';
import { Store, AttendanceLog, ShiftAssignment, TaskLog, CrewMember, Task, CafeHoliday } from '../../../types';
import { reportsService } from '../../../services/reportsService';
import { Button, Card, Select, Input, Badge } from '../../../components/SharedComponents';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, LabelList } from 'recharts';
import { FileBarChart, Clock, CheckCircle, AlertCircle, TrendingUp, Trophy, UserMinus, AlertTriangle, ArrowUpRight, ArrowDownRight, Activity, Calendar, Award, Target, Info } from 'lucide-react';
/* @fix: Removed missing startOfMonth, endOfMonth, subMonths, subWeeks, startOfWeek from date-fns import */
import { format, endOfWeek, endOfDay, differenceInMinutes, isBefore, eachDayOfInterval, getDate, isSameDay } from 'date-fns';
import { formatInTimeZone, getShiftedDate, DEFAULT_TIMEZONE } from '../../../utils/dateFormatter';

// --- HELPERS ---
const startOfWeek = (date: Date, options?: { weekStartsOn?: number }) => {
   const d = new Date(date);
   const day = d.getDay();
   const diff = (day < (options?.weekStartsOn || 0) ? 7 : 0) + day - (options?.weekStartsOn || 0);
   d.setDate(d.getDate() - diff);
   d.setHours(0, 0, 0, 0);
   return d;
};

const startOfDay = (date: Date) => {
   const d = new Date(date);
   d.setHours(0, 0, 0, 0);
   return d;
};

/* @fix: Implemented missing subWeeks helper locally */
const subWeeks = (date: Date, amount: number) => {
   const d = new Date(date);
   d.setDate(d.getDate() - 7 * amount);
   return d;
};

/* @fix: Implemented missing startOfMonth helper locally */
const startOfMonth = (date: Date) => {
   const d = new Date(date);
   d.setDate(1);
   d.setHours(0, 0, 0, 0);
   return d;
};

/* @fix: Implemented missing subMonths helper locally */
const subMonths = (date: Date, amount: number) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() - amount);
    return d;
};

/* @fix: Implemented missing endOfMonth helper locally */
const endOfMonth = (date: Date) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    d.setHours(23, 59, 59, 999);
    return d;
};

const parseISO = (str: string) => {
  if(!str) return new Date();
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

interface TaskRanking {
    id: string;
    title: string;
    rate: number;
    completedCount: number;
    expectedCount: number;
    category?: string;
}

export const ReportsAdminView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'ATTENDANCE' | 'TASKS' | 'PUNCTUALITY'>('ATTENDANCE');
    const [isLoading, setIsLoading] = useState(true);
    
    // Filters
    const [dateRange, setDateRange] = useState({
        start: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        end: format(new Date(), 'yyyy-MM-dd')
    });
    const [selectedOutlet, setSelectedOutlet] = useState('ALL');
    const [selectedEmployee, setSelectedEmployee] = useState('ALL'); 
    
    const [stores, setStores] = useState<Store[]>([]);
    const [crew, setCrew] = useState<CrewMember[]>([]);

    // Data
    const [attendanceData, setAttendanceData] = useState<any[]>([]);
    const [latenessStats, setLatenessStats] = useState<any[]>([]);
    const [punctualityScores, setPunctualityScores] = useState<any[]>([]);
    const [taskStats, setTaskStats] = useState<{completed: number, overdue: number, rate: string}>({completed: 0, overdue: 0, rate: '0'});
    const [taskChartData, setTaskChartData] = useState<any[]>([]);
    const [taskRanking, setTaskRanking] = useState<TaskRanking[]>([]);
    
    // Improvement Metrics State
    const [improvementMetrics, setImprovementMetrics] = useState<{
        wow: { current: number, previous: number, percent: number },
        mom: { current: number, previous: number, percent: number }
    } | null>(null);

    // Config
    const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);

    useEffect(() => {
        const loadInit = async () => {
            try {
                const [storesData, crewData, appConfig] = await Promise.all([
                    reportsService.getStores(),
                    reportsService.getCrew(),
                    reportsService.getAppConfig()
                ]);
                
                setStores(storesData);
                setCrew(crewData);
                if (appConfig) setTimezone(appConfig.timezone || DEFAULT_TIMEZONE);
            } catch (e) {
                console.error("Init Error", e);
            }
        };
        loadInit();
    }, []);

    useEffect(() => {
        generateReport();
    }, [dateRange, selectedOutlet, selectedEmployee, activeTab, timezone, crew]);

    const generateReport = async () => {
        setIsLoading(true);
        const start = startOfDay(parseISO(dateRange.start));
        const end = endOfDay(parseISO(dateRange.end));

        try {
            if (activeTab === 'ATTENDANCE' || activeTab === 'PUNCTUALITY') {
                const [shiftsData, logsData, holidaysData] = await Promise.all([
                    reportsService.getShifts(dateRange.start, dateRange.end),
                    reportsService.getAttendanceLogs(start, end),
                    reportsService.getHolidays()
                ]);

                let shifts = shiftsData;
                const logs = logsData;

                // Filter shifts to only include active employees and exclude 'Counter' role for attendance reports
                const filteredCrewIds = new Set(crew.filter(c => c.role !== 'Counter').map(c => c.id));
                shifts = shifts.filter(s => filteredCrewIds.has(s.crewId));

                if (selectedOutlet !== 'ALL') {
                    shifts = shifts.filter(s => s.outletId === selectedOutlet);
                }

                if (selectedEmployee !== 'ALL') {
                    shifts = shifts.filter(s => s.crewId === selectedEmployee);
                }

                const lateRecords: any[] = [];
                const crewStats: Record<string, {totalMinutes: number, incidents: number, minor: number, major: number, absences: number}> = {};

                shifts.forEach(shift => {
                    if (shift.isDayOff) return;

                    const shiftDateStr = shift.date;

                    // NEW: Check if this shift falls on a holiday for this outlet
                    const isHoliday = holidaysData.find(h => h.date === shiftDateStr && (h.outletId === 'ALL' || h.outletId === shift.outletId));
                    if (isHoliday) return; // Skip shifts on store closure days

                    const checkIn = logs.find(l => {
                        if (l.crewId !== shift.crewId || l.type !== 'CHECK_IN') return false;
                        const logDate = l.timestamp.toDate ? l.timestamp.toDate() : new Date(l.timestamp);
                        const logDateStr = formatInTimeZone(logDate, 'yyyy-MM-dd', timezone);
                        return logDateStr === shiftDateStr;
                    });

                    if (!crewStats[shift.crewName]) {
                        crewStats[shift.crewName] = { totalMinutes: 0, incidents: 0, minor: 0, major: 0, absences: 0 };
                    }

                    if (checkIn) {
                        const startTime = shift.startTime || '00:00';
                        const [sh, sm] = startTime.split(':').map(Number);
                        const checkInDate = checkIn.timestamp.toDate();
                        const checkInInTz = getShiftedDate(checkInDate, timezone);
                        const expectedInTz = new Date(checkInInTz);
                        expectedInTz.setHours(sh, sm, 0, 0);
                        
                        const diff = differenceInMinutes(checkInInTz, expectedInTz);

                        if (diff > 0) { 
                            lateRecords.push({
                                crewName: shift.crewName,
                                date: shift.date,
                                expected: shift.startTime,
                                actual: formatInTimeZone(checkInDate, 'HH:mm', timezone),
                                lateBy: diff,
                                outletId: shift.outletId
                            });

                            crewStats[shift.crewName].totalMinutes += diff;
                            crewStats[shift.crewName].incidents += 1;
                            
                            if (diff <= 10) crewStats[shift.crewName].minor += 1;
                            else crewStats[shift.crewName].major += 1;
                        }
                    } else {
                         const nowInTz = getShiftedDate(new Date(), timezone);
                         const todayStr = format(nowInTz, 'yyyy-MM-dd');
                         if (shiftDateStr < todayStr) {
                             lateRecords.push({
                                 crewName: shift.crewName,
                                 date: shift.date,
                                 expected: shift.startTime,
                                 actual: 'ABSENT',
                                 lateBy: 0,
                                 outletId: shift.outletId
                             });
                             crewStats[shift.crewName].absences += 1;
                         }
                    }
                });

                lateRecords.sort((a,b) => b.date.localeCompare(a.date));
                setAttendanceData(lateRecords);
                
                const statsArray = Object.entries(crewStats)
                    .map(([name, data]) => ({ 
                        name, 
                        minutes: data.totalMinutes, 
                        count: data.incidents,
                        minor: data.minor,
                        major: data.major,
                        absences: data.absences,
                        score: Math.max(0, 100 - (data.minor * 2) - (data.major * 5) - (data.absences * 10))
                    }));

                setLatenessStats(statsArray.sort((a,b) => b.count - a.count).slice(0, 10));
                setPunctualityScores(statsArray.sort((a,b) => b.score - a.score));

            } else if (activeTab === 'TASKS') {
                const [logs, taskDefs] = await Promise.all([
                    reportsService.getTaskLogs(start, end, selectedOutlet),
                    reportsService.getTasks()
                ]);

                let filteredLogs = logs;
                
                // Filter task logs to only include active crew
                const activeCrewIds = new Set(crew.map(c => c.id));
                filteredLogs = filteredLogs.filter(l => activeCrewIds.has(l.crewId));

                if (selectedEmployee !== 'ALL') {
                    filteredLogs = filteredLogs.filter(l => l.crewId === selectedEmployee);
                }

                // --- CALC TIMELINE CHART DATA (DAILY VOLUME & DAILY RATE) ---
                const daysInPeriod = eachDayOfInterval({ start, end });
                const chartData = daysInPeriod.map(day => {
                    const dayStr = formatInTimeZone(day, 'MM/dd', timezone);
                    const dayName = format(day, 'EEEE');
                    const dayNum = getDate(day);

                    let dayExpected = 0;
                    taskDefs.forEach(task => {
                        if (selectedOutlet !== 'ALL' && task.outletId !== selectedOutlet) return;
                        
                        // Check if task is assigned to the selected employee or if unassigned (store-wide)
                        const isAssigned = !task.assignedCrewIds?.length || task.assignedCrewIds.includes(selectedEmployee);
                        if (selectedEmployee !== 'ALL' && !isAssigned) return;

                        const slots = task.timeSlots?.length ? task.timeSlots.length : 1;
                        if (task.frequency === 'DAILY') dayExpected += slots;
                        else if (task.frequency === 'WEEKLY' && task.repeatDays?.includes(dayName)) dayExpected += slots;
                        else if (task.frequency === 'MONTHLY' && Number(task.repeatDate) === dayNum) dayExpected += slots;
                    });

                    const dayCompleted = filteredLogs.filter(l => 
                        isSameDay(getShiftedDate(l.completedAt.toDate(), timezone), day)
                    ).length;

                    const rateValue = dayExpected > 0 ? Math.round((dayCompleted / dayExpected) * 100) : 0;

                    return { 
                        date: dayStr, 
                        count: dayCompleted, 
                        rate: Math.min(100, rateValue) 
                    };
                });
                setTaskChartData(chartData);

                // --- CALC RANKING & SUCCESS RATES ---
                const ranking: TaskRanking[] = [];
                taskDefs.forEach(task => {
                    // Respect store filter on definitions
                    if (selectedOutlet !== 'ALL' && task.outletId !== selectedOutlet) return;

                    let expectedCount = 0;
                    daysInPeriod.forEach(day => {
                        const dayName = format(day, 'EEEE');
                        const dayNum = getDate(day);
                        const slots = task.timeSlots?.length ? task.timeSlots.length : 1;

                        if (task.frequency === 'DAILY') expectedCount += slots;
                        if (task.frequency === 'WEEKLY' && task.repeatDays?.includes(dayName)) expectedCount += slots;
                        if (task.frequency === 'MONTHLY' && Number(task.repeatDate) === dayNum) expectedCount += slots;
                    });

                    if (expectedCount === 0) return;

                    const completedCount = filteredLogs.filter(l => l.taskId === task.id).length;
                    const rate = Math.min(100, Math.round((completedCount / expectedCount) * 100));

                    ranking.push({
                        id: task.id!,
                        title: task.title,
                        completedCount,
                        expectedCount,
                        rate
                    });
                });

                ranking.sort((a, b) => b.rate - a.rate);
                setTaskRanking(ranking);

                const completed = filteredLogs.length;
                setTaskStats({ completed, overdue: 0, rate: completed > 0 ? '100' : '0' });

                // --- CALC IMPROVEMENT METRICS ---
                const now = new Date();
                const startThisWeek = startOfWeek(now, { weekStartsOn: 1 });
                const startLastWeek = subWeeks(startThisWeek, 1);
                
                const thisWeekLogs = await reportsService.getTaskLogs(startThisWeek, endOfDay(now), selectedOutlet);
                const lastWeekLogs = await reportsService.getTaskLogs(startLastWeek, endOfDay(subWeeks(now, 1)), selectedOutlet);
                
                const thisWeekCount = selectedEmployee === 'ALL' 
                    ? thisWeekLogs.filter(l => activeCrewIds.has(l.crewId)).length 
                    : thisWeekLogs.filter(l => l.crewId === selectedEmployee).length;
                const lastWeekCount = selectedEmployee === 'ALL' 
                    ? lastWeekLogs.filter(l => activeCrewIds.has(l.crewId)).length 
                    : lastWeekLogs.filter(l => l.crewId === selectedEmployee).length;
                const wowPercent = lastWeekCount > 0 ? ((thisWeekCount - lastWeekCount) / lastWeekCount) * 100 : thisWeekCount > 0 ? 100 : 0;

                const startThisMonth = startOfMonth(now);
                const startLastMonth = startOfMonth(subMonths(now, 1));
                const endLastMonth = endOfMonth(subMonths(now, 1));

                const thisMonthLogs = await reportsService.getTaskLogs(startThisMonth, endOfDay(now), selectedOutlet);
                const lastMonthLogs = await reportsService.getTaskLogs(startLastMonth, endLastMonth, selectedOutlet);

                const thisMonthCount = selectedEmployee === 'ALL' 
                    ? thisMonthLogs.filter(l => activeCrewIds.has(l.crewId)).length 
                    : thisMonthLogs.filter(l => l.crewId === selectedEmployee).length;
                const lastMonthCount = selectedEmployee === 'ALL' 
                    ? lastMonthLogs.filter(l => activeCrewIds.has(l.crewId)).length 
                    : lastMonthLogs.filter(l => l.crewId === selectedEmployee).length;
                const momPercent = lastMonthCount > 0 ? ((thisMonthCount - lastMonthCount) / lastMonthCount) * 100 : thisMonthCount > 0 ? 100 : 0;

                setImprovementMetrics({
                    wow: { current: thisWeekCount, previous: lastWeekCount, percent: Math.round(wowPercent) },
                    mom: { current: thisMonthCount, previous: lastMonthCount, percent: Math.round(momPercent) }
                });
            }

        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 90) return '#10b981'; // Emerald
        if (score >= 70) return '#f59e0b'; // Amber
        return '#ef4444'; // Red
    };

    // Derived list of employees for the dropdown based on the active tab
    const visibleCrew = crew.filter(c => activeTab === 'TASKS' || c.role !== 'Counter');

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
            <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-pink-100 rounded-xl flex items-center justify-center text-pink-600">
                    <FileBarChart className="w-6 h-6"/>
                </div>
                <h1 className="text-2xl font-bold text-slate-800">Operational Reports</h1>
            </div>

            <Card>
                <div className="flex flex-col md:flex-row gap-6 items-end">
                    <div className="flex-1">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Date Range</label>
                        <div className="flex gap-2">
                            <Input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
                            <Input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
                        </div>
                    </div>
                    <div className="w-full md:w-48">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Store</label>
                        <Select value={selectedOutlet} onChange={e => setSelectedOutlet(e.target.value)}>
                            <option value="ALL">All Stores</option>
                            {stores.map(s => <option key={s.id} value={s.outletId}>{s.name}</option>)}
                        </Select>
                    </div>
                    <div className="w-full md:w-48">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Employee</label>
                        <Select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}>
                            <option value="ALL">All Employees</option>
                            {visibleCrew.map(c => <option key={c.id} value={c.id}>{c.crewName}</option>)}
                        </Select>
                    </div>
                    <Button onClick={generateReport} className="!w-auto" isLoading={isLoading}>
                        Run Report
                    </Button>
                </div>
            </Card>

            <div className="flex gap-4 border-b border-slate-200 overflow-x-auto no-scrollbar">
                <button 
                    onClick={() => setActiveTab('ATTENDANCE')}
                    className={`pb-2 px-4 font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'ATTENDANCE' ? 'text-pink-600 border-b-2 border-pink-500' : 'text-slate-400'}`}
                >
                    Punctuality Log
                </button>
                <button 
                    onClick={() => setActiveTab('PUNCTUALITY')}
                    className={`pb-2 px-4 font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'PUNCTUALITY' ? 'text-pink-600 border-b-2 border-pink-500' : 'text-slate-400'}`}
                >
                    Punctuality Scores
                </button>
                <button 
                    onClick={() => setActiveTab('TASKS')}
                    className={`pb-2 px-4 font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'TASKS' ? 'text-pink-600 border-b-2 border-pink-500' : 'text-slate-400'}`}
                >
                    Task Performance
                </button>
            </div>

            {isLoading ? (
                <div className="text-center py-12 text-slate-400">Loading Report Data...</div>
            ) : (
                <div className="animate-in fade-in space-y-6">
                    
                    {activeTab === 'PUNCTUALITY' && (
                        <>
                            <div className="grid md:grid-cols-3 gap-6">
                                <Card title="P-Score Comparison" className="md:col-span-2">
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={punctualityScores}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
                                                <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} cursor={{fill: '#f8fafc'}} />
                                                <Bar dataKey="score" name="Punctuality Score" radius={[4, 4, 0, 0]} barSize={32}>
                                                    {punctualityScores.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={getScoreColor(entry.score)} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </Card>

                                <Card title="Top Performers">
                                    <div className="space-y-4">
                                        {punctualityScores.slice(0, 3).map((p, i) => (
                                            <div key={i} className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-lg ${i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-slate-400' : 'bg-orange-400'}`}>
                                                    {i + 1}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="font-bold text-slate-800">{p.name}</div>
                                                    <div className="text-xs text-slate-500">Perfect Score Candidate</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-black text-emerald-600">{p.score}</div>
                                                    <div className="text-[10px] text-slate-400 uppercase font-bold">Points</div>
                                                </div>
                                            </div>
                                        ))}
                                        {punctualityScores.length === 0 && <p className="text-center py-4 text-slate-400">No data available.</p>}
                                    </div>
                                </Card>
                            </div>

                            <Card title="Punctuality Leaderboard & Point Breakdown">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                                            <tr>
                                                <th className="p-4 text-left">Employee</th>
                                                <th className="p-4 text-center">Minor Late (-2)</th>
                                                <th className="p-4 text-center">Major Late (-5)</th>
                                                <th className="p-4 text-center">Absences (-10)</th>
                                                <th className="p-4 text-center">Total Incidents</th>
                                                <th className="p-4 text-right">P-Score</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {punctualityScores.map((p, i) => (
                                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-4 font-bold text-slate-700">{p.name}</td>
                                                    <td className="p-4 text-center text-slate-500">{p.minor}</td>
                                                    <td className="p-4 text-center text-orange-600 font-bold">{p.major}</td>
                                                    <td className="p-4 text-center text-red-600 font-bold">{p.absences}</td>
                                                    <td className="p-4 text-center">
                                                        <Badge variant="neutral">{p.count + p.absences} events</Badge>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <div className="flex items-center justify-end gap-3">
                                                            <div className="w-12 h-2 bg-slate-100 rounded-full overflow-hidden hidden md:block">
                                                                <div className="h-full" style={{width: `${p.score}%`, backgroundColor: getScoreColor(p.score)}}></div>
                                                            </div>
                                                            <span className="text-lg font-black" style={{color: getScoreColor(p.score)}}>{p.score}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        </>
                    )}

                    {activeTab === 'ATTENDANCE' && (
                        <>
                            <div className="grid md:grid-cols-2 gap-6">
                                <Card title="Consistent Latecomers (Heatmap Basis)" className="overflow-hidden md:col-span-2">
                                     <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-red-50 text-red-700 font-bold uppercase text-xs">
                                                <tr>
                                                    <th className="p-3 text-left">Rank</th>
                                                    <th className="p-3 text-left">Employee</th>
                                                    <th className="p-3 text-center">Incidents ≤ 10m</th>
                                                    <th className="p-3 text-center">Incidents {'>'} 10m</th>
                                                    <th className="p-3 text-center">Total Late Time</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {latenessStats.map((d, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50">
                                                        <td className="p-3 font-bold text-slate-400">#{idx + 1}</td>
                                                        <td className="p-3 font-bold text-slate-800">{d.name}</td>
                                                        <td className="p-3 text-center text-slate-600">{d.minor}</td>
                                                        <td className="p-3 text-center font-bold text-red-500">{d.major}</td>
                                                        <td className="p-3 text-center text-slate-600 font-medium">{d.minutes}m</td>
                                                    </tr>
                                                ))}
                                                {latenessStats.length === 0 && (
                                                    <tr><td colSpan={5} className="p-6 text-center text-slate-400">No lateness recorded for this period.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                     </div>
                                </Card>
                            </div>

                            <Card title="Individual Incident History">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 font-bold text-slate-500 text-xs uppercase">
                                            <tr>
                                                <th className="p-3 text-left">Date</th>
                                                <th className="p-3 text-left">Employee</th>
                                                <th className="p-3 text-center">Scheduled</th>
                                                <th className="p-3 text-center">Actual In</th>
                                                <th className="p-3 text-center">Variance</th>
                                                <th className="p-3 text-center">Outlet</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {attendanceData.map((row, i) => (
                                                <tr key={i} className="hover:bg-slate-50">
                                                    <td className="p-3 font-bold text-slate-900">{format(parseISO(row.date), 'MMM d')}</td>
                                                    <td className="p-3 font-bold text-slate-700">{row.crewName}</td>
                                                    <td className="p-3 text-center text-slate-500">{row.expected}</td>
                                                    <td className={`p-3 text-center font-bold ${row.actual === 'ABSENT' ? 'text-red-500' : 'text-slate-700'}`}>
                                                        {row.actual}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        {row.lateBy > 0 && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-xs font-bold">+{row.lateBy}m</span>}
                                                        {row.actual === 'ABSENT' && <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold">MISSED</span>}
                                                    </td>
                                                    <td className="p-3 text-center text-xs text-slate-400">{row.outletId}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        </>
                    )}

                    {activeTab === 'TASKS' && (
                        <>
                            {/* --- TREND & IMPROVEMENT METRICS --- */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Card title="Trend & Growth Metrics" className="border-l-4 border-l-indigo-500">
                                    <div className="flex flex-col md:flex-row gap-6">
                                        <div className="flex-1 bg-indigo-50 p-4 rounded-2xl border border-indigo-100 relative overflow-hidden">
                                            <div className="flex justify-between items-start mb-4 relative z-10">
                                                <div>
                                                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">This Week Growth</span>
                                                    <h4 className="text-2xl font-black text-indigo-900 mt-1">{improvementMetrics?.wow.percent ?? 0}%</h4>
                                                </div>
                                                <div className={`p-2 rounded-xl ${improvementMetrics && improvementMetrics.wow.percent >= 0 ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-amber-500 text-white'}`}>
                                                    {improvementMetrics && improvementMetrics.wow.percent >= 0 ? <ArrowUpRight size={20}/> : <ArrowDownRight size={20}/>}
                                                </div>
                                            </div>
                                            <p className="text-xs text-indigo-600 font-medium relative z-10">
                                                Compared to last week: <span className="font-bold">{improvementMetrics?.wow.previous} → {improvementMetrics?.wow.current} tasks</span>
                                            </p>
                                            <div className="absolute -right-4 -bottom-4 opacity-5">
                                                <TrendingUp size={100} className="text-indigo-900"/>
                                            </div>
                                        </div>

                                        <div className="flex-1 bg-slate-50 p-4 rounded-2xl border border-slate-200 relative overflow-hidden">
                                            <div className="flex justify-between items-start mb-4 relative z-10">
                                                <div>
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Monthly Improvement</span>
                                                    <h4 className="text-2xl font-black text-slate-800 mt-1">{improvementMetrics?.mom.percent ?? 0}%</h4>
                                                </div>
                                                <div className={`p-2 rounded-xl ${improvementMetrics && improvementMetrics.mom.percent >= 0 ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-200' : 'bg-amber-500 text-white'}`}>
                                                    {improvementMetrics && improvementMetrics.mom.percent >= 0 ? <ArrowUpRight size={20}/> : <ArrowDownRight size={20}/>}
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-500 font-medium relative z-10">
                                                Last 30 Days: <span className="font-bold">{improvementMetrics?.mom.previous} → {improvementMetrics?.mom.current} completions</span>
                                            </p>
                                            <div className="absolute -right-4 -bottom-4 opacity-5">
                                                <Activity size={100} className="text-slate-900"/>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-3">
                                        <Trophy size={20} className="text-emerald-600 flex-shrink-0"/>
                                        <p className="text-xs text-emerald-800 font-medium leading-tight">
                                            {improvementMetrics && improvementMetrics.wow.percent > 0 
                                                ? "Excellent progress! The team is completing more tasks than last week. Keep this momentum for the next review."
                                                : "Consistent performance is the foundation of growth. Let's aim for a +5% completion rate next week!"}
                                        </p>
                                    </div>
                                </Card>

                                <Card title="Improvement Insights">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                                                <Calendar size={24}/>
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-sm font-bold text-slate-700">Team Consistency</div>
                                                <p className="text-xs text-slate-500">The team shows {improvementMetrics && improvementMetrics.wow.percent >= 0 ? 'upward' : 'steady'} growth in routine operations.</p>
                                            </div>
                                            {improvementMetrics && improvementMetrics.wow.percent >= 0 && <Badge variant="success">Growth</Badge>}
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                                                <CheckCircle size={24}/>
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-sm font-bold text-slate-700">Completions Today</div>
                                                <p className="text-xs text-slate-500">Based on the current trajectory, the month looks promising.</p>
                                            </div>
                                            <Badge variant="neutral">Healthy</Badge>
                                        </div>
                                    </div>
                                </Card>
                            </div>

                            {/* --- TASK COMPLETION LEADERBOARD --- */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Card title="Top Completed Tasks" className="border-l-4 border-l-emerald-500">
                                    <div className="space-y-4">
                                        {taskRanking.slice(0, 5).map((t, idx) => (
                                            <div key={t.id} className="flex items-center gap-4 bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100">
                                                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-emerald-200">#{idx+1}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-slate-800 truncate text-sm">{t.title}</div>
                                                    <div className="text-[10px] text-slate-500 uppercase font-bold">{t.completedCount}/{t.expectedCount} times done</div>
                                                    <div className="mt-2 w-full bg-white rounded-full h-1.5 overflow-hidden">
                                                        <div className="bg-emerald-500 h-full rounded-full" style={{width: `${t.rate}%`}}></div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-lg font-black text-emerald-600">{t.rate}%</div>
                                                </div>
                                            </div>
                                        ))}
                                        {taskRanking.length === 0 && <p className="text-center py-10 text-slate-300 italic">No task data for this period.</p>}
                                    </div>
                                </Card>

                                <Card title="Least Completed Tasks" className="border-l-4 border-l-red-500">
                                    <div className="space-y-4">
                                        {[...taskRanking].reverse().slice(0, 5).map((t, idx) => (
                                            <div key={t.id} className="flex items-center gap-4 bg-red-50/50 p-3 rounded-2xl border border-red-100">
                                                <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-red-200"><AlertTriangle size={20}/></div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-slate-800 truncate text-sm">{t.title}</div>
                                                    <div className="text-[10px] text-slate-500 uppercase font-bold">{t.completedCount}/{t.expectedCount} times done</div>
                                                    <div className="mt-2 w-full bg-white rounded-full h-1.5 overflow-hidden">
                                                        <div className="bg-red-500 h-full rounded-full" style={{width: `${t.rate}%`}}></div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-lg font-black text-red-600">{t.rate}%</div>
                                                </div>
                                            </div>
                                        ))}
                                        {taskRanking.length === 0 && <p className="text-center py-10 text-slate-300 italic">No task data for this period.</p>}
                                    </div>
                                </Card>
                            </div>

                            <div className="grid md:grid-cols-3 gap-6">
                                <Card className="bg-emerald-50 border border-emerald-100 text-black">
                                    <div className="flex items-center gap-2 mb-2 text-emerald-700 font-bold uppercase text-[10px]">
                                        <CheckCircle className="w-4 h-4"/> Tasks Completed (Filtered Period)
                                    </div>
                                    <div className="text-4xl font-black">{taskStats.completed}</div>
                                </Card>
                                <Card className="md:col-span-2">
                                    <div className="flex items-center gap-2 mb-2 text-slate-400 font-bold uppercase text-xs">
                                        <TrendingUp className="w-4 h-4"/> Completion Trend (%)
                                    </div>
                                    <div className="h-28">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={taskChartData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                                                <Tooltip cursor={{fill: 'transparent'}} />
                                                <Bar dataKey="rate" fill="#10b981" radius={[4, 4, 4, 4]}>
                                                    <LabelList dataKey="rate" position="top" style={{ fill: '#065f46', fontSize: 10, fontWeight: 'bold' }} formatter={(val: number) => `${val}%`} />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </Card>
                            </div>

                            <Card title="Task Completion Timeline (Daily Volume)">
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={taskChartData} margin={{ top: 25, right: 0, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                                            <XAxis dataKey="date" stroke="#cbd5e1" fontSize={12} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#cbd5e1" fontSize={12} tickLine={false} axisLine={false} />
                                            <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="Tasks Done">
                                                <LabelList dataKey="count" position="top" style={{ fill: '#4338ca', fontSize: 11, fontWeight: 'bold' }} />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </Card>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
