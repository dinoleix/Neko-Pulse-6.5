import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, ClipboardList, ExternalLink, Loader2, Plus, RefreshCw, Store as StoreIcon } from 'lucide-react';
import { attendanceService } from '../../../services/attendanceService';
import { orderService } from '../../../services/orderService';
import { storeService } from '../../../services/storeService';
import { taskService } from '../../../services/taskService';
import { managerActionService } from '../../../services/managerActionService';
import { CurrentUser, ManagerAction, ShiftAssignment, Store, Task, TaskFrequency, TaskLog } from '../../../types';
import { Button, Card, Input, Select, TextArea } from '../../../components/SharedComponents';
import { DEFAULT_TIMEZONE, getCurrentTimeInTimeZone, getShiftedDate } from '../../../utils/dateFormatter';
import { format, isSameDay, startOfDay, subDays } from 'date-fns';

type StorePulse = {
  store: Store;
  attendanceGaps: ShiftAssignment[];
  overdueTasks: Task[];
  completedTasks: number;
  dueTasks: number;
  validationCount: number;
};

const taskAppliesToday = (task: Task, now: Date) => {
  const weekday = format(now, 'EEEE');
  if (task.frequency === TaskFrequency.DAILY) return true;
  if (task.frequency === TaskFrequency.WEEKLY) return task.repeatDays?.includes(weekday) || false;
  if (task.frequency === TaskFrequency.MONTHLY) return Number(task.repeatDate) === now.getDate();
  return false;
};

const taskIsComplete = (task: Task, logs: TaskLog[], today: Date) => logs.some(log =>
  log.taskId === task.id &&
  log.outletId === task.outletId &&
  isSameDay(getShiftedDate(log.completedAt), today)
);

export const DailyOverviewAdminView: React.FC<{
  currentUser: CurrentUser;
  onOpenTasks: () => void;
  onOpenAttendance: () => void;
}> = ({ currentUser, onOpenTasks, onOpenAttendance }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [pulse, setPulse] = useState<StorePulse[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [managerActions, setManagerActions] = useState<ManagerAction[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError('');
    setActionError('');
    try {
      const now = getCurrentTimeInTimeZone(DEFAULT_TIMEZONE);
      const todayKey = format(now, 'yyyy-MM-dd');
      // Query a small buffer then compare dates in the café timezone. This
      // avoids a browser timezone moving a near-midnight check-in to another day.
      const since = subDays(startOfDay(now), 1);
      const [loadedStores, tasks, taskLogs, attendanceLogs, assignments, validations] = await Promise.all([
        storeService.getStores(),
        taskService.getActiveTasks(),
        taskService.getLogs(since, new Date()),
        attendanceService.getAllLogs(1000, since),
        attendanceService.getAllShifts(todayKey),
        orderService.getRecentValidations(500),
      ]);

      const activeStores = loadedStores.filter(store => store.isActive);
      const todayLogs = taskLogs.filter(log => isSameDay(getShiftedDate(log.completedAt), now));
      const todayAttendance = attendanceLogs.filter(log => isSameDay(getShiftedDate(log.timestamp), now));
      const todayValidations = validations.filter(validation => isSameDay(getShiftedDate(validation.validatedAt), now));

      setPulse(activeStores.map(store => {
        const storeTasks = tasks.filter(task => task.outletId === store.outletId && taskAppliesToday(task, now));
        const completedTasks = storeTasks.filter(task => taskIsComplete(task, todayLogs, now));
        const overdueTasks = storeTasks.filter(task => {
          if (taskIsComplete(task, todayLogs, now)) return false;
          const slots = task.timeSlots?.length ? task.timeSlots : ['Anytime'];
          return slots.some(slot => {
            if (slot === 'Anytime') return false;
            const [hour, minute] = slot.split(':').map(Number);
            const dueAt = new Date(now);
            dueAt.setHours(hour, minute, 0, 0);
            return now > dueAt;
          });
        });
        const attendanceGaps = assignments.filter(assignment => {
          if (assignment.outletId !== store.outletId || assignment.date !== todayKey || assignment.isDayOff) return false;
          return !todayAttendance.some(log => log.crewId === assignment.crewId && log.type === 'CHECK_IN');
        });

        return {
          store,
          attendanceGaps,
          overdueTasks,
          completedTasks: completedTasks.length,
          dueTasks: storeTasks.length,
          validationCount: todayValidations.filter(validation => validation.outletId === store.outletId).length,
        };
      }));
      setStores(activeStores);
      // Management Actions is intentionally loaded independently. Its rules
      // can be deployed separately from the existing overview, and a missing
      // grant must never hide attendance, task, or order-check information.
      try {
        setManagerActions(await managerActionService.getRecent());
      } catch (actionLoadError) {
        console.warn('Management actions could not be loaded:', actionLoadError);
        setManagerActions([]);
        setActionError('Management Actions is not available yet. Deploy its Firestore permission to enable it.');
      }
      setUpdatedAt(new Date());
    } catch (loadError) {
      console.error('Daily overview load failed:', loadError);
      setError('Could not load today’s operations. Please refresh and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totals = useMemo(() => pulse.reduce((summary, store) => ({
    gaps: summary.gaps + store.attendanceGaps.length,
    overdue: summary.overdue + store.overdueTasks.length,
    validations: summary.validations + store.validationCount,
  }), { gaps: 0, overdue: 0, validations: 0 }), [pulse]);
  if (isLoading) return <div className="p-12 flex justify-center gap-3 text-[#0b6b4d] font-bold"><Loader2 className="animate-spin" /> Loading today’s pulse…</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="neko-eyebrow mb-2">Today · {format(getCurrentTimeInTimeZone(DEFAULT_TIMEZONE), 'EEEE, d MMMM')}</p>
          <h2 className="text-3xl font-semibold text-[#123229] neko-display">Daily manager overview</h2>
          <p className="text-slate-500 mt-2">Both stores, focused on what needs attention now.</p>
        </div>
        <Button variant="secondary" className="!w-auto" onClick={load}><RefreshCw className="w-4 h-4" /> Refresh</Button>
      </div>

      {error && <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard icon={<CalendarClock />} label="Not checked in" value={totals.gaps} tone="amber" />
        <SummaryCard icon={<AlertCircle />} label="Overdue tasks" value={totals.overdue} tone="coral" />
        <SummaryCard icon={<CheckCircle2 />} label="Order checks today" value={totals.validations} tone="forest" />
      </div>

      <ManagerActionPanel actions={managerActions} stores={stores} currentUser={currentUser} error={actionError} onChanged={load} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {pulse.map(storePulse => (
          <Card key={storePulse.store.id || storePulse.store.outletId} className="bg-[#fffdf9]">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="flex gap-3 items-center">
                <div className="w-11 h-11 rounded-xl bg-[#e6f0e9] text-[#0b6b4d] grid place-items-center"><StoreIcon className="w-5 h-5" /></div>
                <div><h3 className="font-semibold text-xl text-[#123229] neko-display">{storePulse.store.name}</h3><p className="text-xs text-slate-500">{storePulse.store.outletId}</p></div>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#f5f1e8] text-[#735f42]">{storePulse.validationCount} checks</span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-xl bg-[#f7f4ee] p-4"><p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Tasks complete</p><p className="text-2xl font-semibold text-[#123229] mt-1">{storePulse.completedTasks}<span className="text-slate-400 text-base"> / {storePulse.dueTasks}</span></p></div>
              <div className="rounded-xl bg-[#f7f4ee] p-4"><p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Attention needed</p><p className="text-2xl font-semibold text-[#123229] mt-1">{storePulse.attendanceGaps.length + storePulse.overdueTasks.length}</p></div>
            </div>

            <AlertList title="Attendance" empty="Everyone scheduled has checked in." items={storePulse.attendanceGaps.map(item => item.crewName)} action="Open attendance" onAction={onOpenAttendance} />
            <AlertList title="Tasks" empty="No overdue tasks." items={storePulse.overdueTasks.map(item => item.title)} action="Open tasks" onAction={onOpenTasks} />
          </Card>
        ))}
      </div>
      {updatedAt && <p className="text-xs text-slate-400 text-center">Updated {format(updatedAt, 'p')} · India time</p>}
    </div>
  );
};

const SummaryCard: React.FC<{ icon: React.ReactNode; label: string; value: number; tone: 'amber' | 'coral' | 'forest' }> = ({ icon, label, value, tone }) => {
  const tones = { amber: 'bg-amber-50 text-amber-700 border-amber-100', coral: 'bg-[#fff0ed] text-[#bd4c3f] border-[#f4d3cd]', forest: 'bg-[#e6f0e9] text-[#0b6b4d] border-[#d2e5d8]' };
  return <div className={`rounded-2xl border p-5 ${tones[tone]}`}><div className="flex items-center justify-between"><span className="text-sm font-semibold">{label}</span>{icon}</div><p className="text-4xl font-semibold mt-4 neko-display">{value}</p></div>;
};

const AlertList: React.FC<{ title: string; empty: string; items: string[]; action: string; onAction: () => void }> = ({ title, empty, items, action, onAction }) => (
  <div className="border-t border-[#eeeae2] pt-4 mt-4">
    <div className="flex justify-between gap-4 items-center"><p className="font-semibold text-sm text-[#123229]">{title}</p>{items.length > 0 && <button onClick={onAction} className="text-xs font-bold text-[#0b6b4d] hover:text-[#ec5b4c] flex items-center gap-1">{action}<ExternalLink className="w-3 h-3" /></button>}</div>
    {items.length === 0 ? <p className="text-sm text-slate-500 mt-2">{empty}</p> : <ul className="mt-2 space-y-1">{items.slice(0, 4).map(item => <li key={item} className="text-sm text-slate-600 flex gap-2"><span className="text-[#ec5b4c]">•</span>{item}</li>)}{items.length > 4 && <li className="text-xs text-slate-400">+{items.length - 4} more</li>}</ul>}
  </div>
);

const ManagerActionPanel: React.FC<{
  actions: ManagerAction[];
  stores: Store[];
  currentUser: CurrentUser;
  error: string;
  onChanged: () => Promise<void>;
}> = ({ actions, stores, currentUser, error, onChanged }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [outletId, setOutletId] = useState<string>('ALL');
  const [priority, setPriority] = useState<'HIGH' | 'NORMAL'>('NORMAL');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const userName = currentUser.name || 'Manager';
  const openActions = actions.filter(action => action.status === 'OPEN');
  const completedActions = actions.filter(action => action.status === 'COMPLETED').slice(0, 5);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      await managerActionService.create({
        title: title.trim(), details: details.trim(), outletId, priority, status: 'OPEN',
        createdBy: currentUser.uid, createdByName: userName,
      });
      setTitle(''); setDetails(''); setOutletId('ALL'); setPriority('NORMAL'); setIsAdding(false);
      await onChanged();
    } finally { setIsSaving(false); }
  };

  const saveUpdate = async (action: ManagerAction, complete = false) => {
    if (!action.id) return;
    setIsSaving(true);
    try {
      const note = notes[action.id] ?? action.actionNote ?? '';
      if (complete) await managerActionService.complete(action.id, note.trim(), currentUser.uid, userName);
      else await managerActionService.saveUpdate(action.id, note.trim(), currentUser.uid, userName);
      await onChanged();
    } finally { setIsSaving(false); }
  };

  return <Card className="border-[#cfe3d7] shadow-[0_16px_40px_rgba(6,59,44,0.08)]">
    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5">
      <div>
        <p className="neko-eyebrow mb-2">Manager priority</p>
        <h3 className="text-2xl text-[#123229] neko-display">Management actions</h3>
        <p className="text-sm text-slate-500 mt-1">Record what management needs done, then add an update or close it once complete.</p>
      </div>
      <Button variant="primary" className="!w-auto" disabled={Boolean(error)} onClick={() => setIsAdding(value => !value)}><Plus className="w-4 h-4" /> {isAdding ? 'Cancel' : 'Add action'}</Button>
    </div>

    {error && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 p-4 text-sm">{error}</div>}
    {isAdding && <form onSubmit={create} className="rounded-xl bg-[#f7f4ee] border border-[#e7e2d9] p-4 mb-5 space-y-3">
      <Input value={title} onChange={event => setTitle(event.target.value)} placeholder="What needs to be done?" maxLength={140} required />
      <TextArea value={details} onChange={event => setDetails(event.target.value)} placeholder="Context, expected outcome, or instructions (optional)" className="min-h-[88px]" maxLength={1000} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Select value={outletId} onChange={event => setOutletId(event.target.value)}><option value="ALL">Both stores</option>{stores.map(store => <option key={store.outletId} value={store.outletId}>{store.name}</option>)}</Select>
        <Select value={priority} onChange={event => setPriority(event.target.value as 'HIGH' | 'NORMAL')}><option value="NORMAL">Normal priority</option><option value="HIGH">High priority</option></Select>
      </div>
      <Button isLoading={isSaving} type="submit" className="!w-auto">Assign action</Button>
    </form>}

    {openActions.length === 0 ? <div className="rounded-xl bg-[#e6f0e9] text-[#0b6b4d] p-4 text-sm">No open management actions. The day is clear.</div> : <div className="space-y-3">
      {openActions.map(action => <div key={action.id} className="rounded-xl border border-[#e7e2d9] p-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold text-[#123229]">{action.title}</h4><span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full ${action.priority === 'HIGH' ? 'bg-[#fff0ed] text-[#bd4c3f]' : 'bg-[#f5f1e8] text-[#735f42]'}`}>{action.priority}</span><span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500">{action.outletId === 'ALL' ? 'Both stores' : stores.find(store => store.outletId === action.outletId)?.name || action.outletId}</span></div><p className="text-xs text-slate-500 mt-1">Requested by {action.createdByName}</p>{action.details && <p className="text-sm text-slate-600 mt-3 whitespace-pre-wrap">{action.details}</p>}</div>
          <Button variant="secondary" className="!w-auto !text-xs" disabled={isSaving} onClick={() => saveUpdate(action, true)}>Mark complete</Button>
        </div>
        <div className="mt-4 flex flex-col md:flex-row gap-2"><Input value={notes[action.id || ''] ?? action.actionNote ?? ''} onChange={event => setNotes(current => ({ ...current, [action.id || '']: event.target.value }))} placeholder="Manager update: what was done, or what is blocked?" maxLength={1000} /><Button variant="outline" className="!w-auto whitespace-nowrap" disabled={isSaving} onClick={() => saveUpdate(action)}>Save update</Button></div>
        {action.actionUpdatedByName && <p className="mt-2 text-xs text-slate-400">Last update by {action.actionUpdatedByName}</p>}
      </div>)}
    </div>}
    {completedActions.length > 0 && <div className="mt-5 pt-4 border-t border-[#eeeae2]"><p className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-2">Recently completed</p>{completedActions.map(action => <p key={action.id} className="text-sm text-slate-500 py-1"><span className="text-[#0b6b4d] mr-2">✓</span>{action.title}<span className="text-slate-400"> · closed by {action.completedByName || 'Manager'}</span></p>)}</div>}
  </Card>;
};
