import React, { useEffect, useMemo, useState } from 'react';
import { Award, BookOpen, CalendarClock, CheckCircle2, RefreshCw, TriangleAlert } from 'lucide-react';
import { CurrentUser, TrainingAssignment, TrainingModule } from '../../../types';
import { trainingService } from '../../../services/trainingService';
import { certificationIsExpired } from '../../../services/trainingPolicy';
import { Badge, Button, Card, ProtectedVideo } from '../../../components/SharedComponents';

const statusVariant = (status: TrainingAssignment['status']) => status === 'CERTIFIED' || status === 'PASSED' || status === 'COMPLETED' ? 'success' : status === 'RETRAINING_REQUIRED' || status === 'EXPIRED' ? 'danger' : status === 'ASSESSMENT_PENDING' ? 'warning' : 'neutral';
const assignmentTime = (assignment: TrainingAssignment) => assignment.updatedAt?.seconds || assignment.assignedAt?.seconds || 0;
const activeAssignmentStatuses: TrainingAssignment['status'][] = ['ASSIGNED', 'NOT_STARTED', 'LEARNING', 'DEMONSTRATION_COMPLETED', 'PRACTISING_UNDER_SUPERVISION', 'ASSESSMENT_PENDING', 'PASSED', 'RETRAINING_REQUIRED'];
const practicalStatusLabel = (status: TrainingAssignment['status']) => ({
  ASSIGNED: 'Manager will start training',
  NOT_STARTED: 'Manager will start training',
  LEARNING: 'Manager will start training',
  DEMONSTRATION_COMPLETED: 'Manager has shown you the standard',
  PRACTISING_UNDER_SUPERVISION: 'Manager is observing your practice',
  ASSESSMENT_PENDING: 'Manager assessment pending',
  PASSED: 'Passed — awaiting certification',
  CERTIFIED: 'Certified',
  RETRAINING_REQUIRED: 'More practice needed',
  EXPIRED: 'Certification expired',
  COMPLETED: 'Completed',
}[status] || status.replaceAll('_', ' '));

// A past bulk assignment may have created duplicate records. Staff should see
// one current card per module; progress/audit records remain with managers.
const visibleAssignments = (assignments: TrainingAssignment[]) => {
  const selected = new Map<string, TrainingAssignment>();
  assignments.forEach(assignment => {
    const key = assignment.moduleId;
    const current = selected.get(key);
    if (!current || (activeAssignmentStatuses.includes(assignment.status) && !activeAssignmentStatuses.includes(current.status)) || assignmentTime(assignment) > assignmentTime(current)) selected.set(key, assignment);
  });
  return [...selected.values()].sort((a, b) => assignmentTime(b) - assignmentTime(a));
};

export const TrainingCrewView: React.FC<{ currentUser: CurrentUser }> = ({ currentUser }) => {
  const [assignments, setAssignments] = useState<TrainingAssignment[]>([]);
  const [modules, setModules] = useState<Record<string, TrainingModule>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [openModuleId, setOpenModuleId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const nextAssignments = visibleAssignments(await trainingService.getMyAssignments(currentUser.uid));
      // Do not list the catalogue here: a crew user is intentionally denied
      // drafts and modules outside their outlet/role. Read only modules that
      // have already been assigned to this employee.
      const assignedModules = await Promise.all(nextAssignments.map(async assignment => {
        try { return await trainingService.getAssignedModule(assignment.moduleId); }
        catch (error) { console.warn(`Could not load assigned training ${assignment.moduleId}`, error); return undefined; }
      }));
      setAssignments(nextAssignments);
      setModules(Object.fromEntries(assignedModules.filter((module): module is TrainingModule => Boolean(module)).map(module => [module.id!, module])));
    } catch (error) { console.error('Training load failed', error); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [currentUser.uid]);

  const certifications = useMemo(() => assignments.filter(item => item.status === 'CERTIFIED'), [assignments]);
  const needsAttention = assignments.filter(item => ['RETRAINING_REQUIRED', 'EXPIRED', 'ASSESSMENT_PENDING'].includes(item.status));
  const update = async (assignment: TrainingAssignment, patch: Partial<TrainingAssignment>) => {
    setSavingId(assignment.id!);
    try { await trainingService.updateMyAssignment(assignment.id!, patch); await load(); } finally { setSavingId(''); }
  };

  if (loading) return <div className="py-16 text-center text-emerald-700 font-bold"><RefreshCw className="inline w-5 h-5 animate-spin mr-2"/>Loading your training…</div>;
  return <div className="space-y-5">
    <div className="flex items-start justify-between gap-4"><div><p className="neko-eyebrow">Green Neko · Development</p><h1 className="text-2xl font-semibold text-[#123229]">My Training</h1><p className="text-sm text-slate-500 mt-1">Theory is read or watched and completed by you. Practical training is checked by a manager.</p></div><Button variant="secondary" className="!w-auto" onClick={load}><RefreshCw className="w-4 h-4"/>Refresh</Button></div>
    {needsAttention.length > 0 && <Card className="border-l-4 border-l-amber-500"><div className="flex gap-3"><TriangleAlert className="text-amber-600 flex-shrink-0"/><div><p className="font-bold text-slate-800">Training needs your attention</p><p className="text-sm text-slate-500">{needsAttention.length} item{needsAttention.length === 1 ? '' : 's'} need assessment, retraining, or follow-up.</p></div></div></Card>}
    <div className="grid sm:grid-cols-3 gap-3"><Metric icon={<BookOpen/>} label="Assigned" value={assignments.filter(a => !['CERTIFIED'].includes(a.status)).length}/><Metric icon={<Award/>} label="Certified" value={certifications.length}/><Metric icon={<CalendarClock/>} label="Assessment pending" value={assignments.filter(a => a.status === 'ASSESSMENT_PENDING').length}/></div>
    <div className="space-y-3">
      {assignments.map(assignment => {
        const module = modules[assignment.moduleId];
        const completed = assignment.completedLessonIds?.length || 0;
        const total = module?.lessons?.length || 1;
        const canLearn = ['ASSIGNED', 'NOT_STARTED', 'LEARNING'].includes(assignment.status);
        const isTheory = (assignment.trainingFormat || module?.trainingFormat || 'PRACTICAL') === 'THEORETICAL';
        return <Card key={assignment.id} className={assignment.mandatory ? 'border-l-4 border-l-[#0b6b4d]' : ''}><div className="flex flex-col gap-4"><div className="flex justify-between gap-3"><div><div className="flex items-center gap-2 flex-wrap"><h2 className="font-bold text-slate-800">{assignment.moduleTitle}</h2>{assignment.mandatory && <Badge variant="warning">Mandatory</Badge>}<Badge variant={statusVariant(assignment.status)}>{isTheory ? assignment.status.replaceAll('_', ' ') : practicalStatusLabel(assignment.status)}</Badge></div><p className="text-sm text-slate-500 mt-1">{assignment.track.replaceAll('_', ' ')} · {isTheory ? 'Theory' : 'Practical'} · Due {assignment.dueDate || 'not set'}</p>{assignment.managerFeedback && <p className="text-sm mt-2 rounded-lg bg-amber-50 p-3 text-amber-900">Manager feedback: {assignment.managerFeedback}</p>}</div><div className="text-right text-sm font-bold text-[#0b6b4d]">{Math.min(100, Math.round(completed / total * 100))}%<div className="text-[11px] text-slate-400 font-normal">{completed}/{total} steps</div></div></div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-[#0b6b4d]" style={{ width: `${Math.min(100, completed / total * 100)}%` }}/></div>
          {module && <div className="border rounded-xl bg-slate-50 overflow-hidden"><button className="w-full flex justify-between items-center gap-3 text-left px-4 py-3 text-sm font-bold text-slate-700" onClick={() => setOpenModuleId(current => current === assignment.id ? '' : assignment.id!)}><span>View training material</span><span className="text-emerald-700">{openModuleId === assignment.id ? 'Hide' : 'Open'}</span></button>{openModuleId === assignment.id && <div className="border-t bg-white px-4 py-4 space-y-4"><div className="whitespace-pre-wrap text-sm text-slate-700 leading-6">{module.instructions || module.description || 'Your manager will provide the training material.'}</div>{module.media?.filter(item => item.type === 'VIDEO').map(item => <ProtectedVideo key={item.storagePath || item.url} fileRef={item.storagePath || item.url}/>) }{module.safetyWarnings?.length > 0 && <div className="rounded-lg bg-amber-50 border border-amber-100 p-3"><p className="text-xs font-bold text-amber-900 uppercase mb-1">Safety warnings</p><ul className="text-sm text-amber-900 list-disc ml-5">{module.safetyWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}</div>}</div>}
          <div className="flex flex-wrap gap-2">{canLearn && isTheory && <Button className="!w-auto !py-2" isLoading={savingId === assignment.id} onClick={() => update(assignment, { status: 'COMPLETED', completedLessonIds: module?.lessons?.map(lesson => lesson.id) || [], acknowledgementAt: new Date() as any })}><CheckCircle2 className="w-4 h-4"/>Mark complete</Button>}{!isTheory && <p className="text-sm text-slate-500">Your manager will update this training after showing, observing and assessing the skill.</p>}{assignment.status === 'COMPLETED' && <span className="text-sm text-emerald-700 font-bold flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/>Theory completed</span>}{assignment.status === 'CERTIFIED' && <span className="text-sm text-emerald-700 font-bold flex items-center gap-2"><Award className="w-4 h-4"/>Certification earned</span>}</div>
        </div></Card>;
      })}
      {assignments.length === 0 && <Card><div className="py-12 text-center text-slate-400"><BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40"/><p className="font-bold">No training assigned yet.</p><p className="text-sm mt-1">Your manager will assign role- and outlet-relevant training here.</p></div></Card>}
    </div>
  </div>;
};

const Metric = ({ icon, label, value }: any) => <Card className="!p-0"><div className="p-4 flex items-center gap-3"><div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">{React.cloneElement(icon, { className: 'w-5 h-5' })}</div><div><div className="text-2xl font-bold text-slate-800">{value}</div><div className="text-[10px] uppercase font-bold text-slate-400">{label}</div></div></div></Card>;
