import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Award, BookOpenCheck, CalendarClock, CheckCircle2, ChevronRight, CircleAlert, ClipboardCheck, GraduationCap, Heart, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { Button, Badge, Card, Checkbox, Input, Select, TextArea } from '../../components/SharedComponents';
import { CurrentUser, CrewMember, DevelopmentAction, DevelopmentObservation, DevelopmentRecognition, DevelopmentSkill, MODULE_IDS, TrainingModule } from '../../types';
import { developmentDate, developmentService, DevelopmentDataset } from '../../services/developmentService';
import { taskService } from '../../services/taskService';
import { trainingService } from '../../services/trainingService';
import { employeeService } from '../../services/employeeService';

type Tab = 'OVERVIEW' | 'MATRIX' | 'EMPLOYEES' | 'SKILLS' | 'DEVELOPMENT' | 'RECOGNITION' | 'INSIGHTS';
const tabs: Array<[Tab, string]> = [['OVERVIEW','Overview'],['MATRIX','Skills Matrix'],['EMPLOYEES','Employees'],['SKILLS','Skills Library'],['DEVELOPMENT','Development'],['RECOGNITION','Recognition'],['INSIGHTS','Insights']];
const suggestedSkills = [
  { name:'Customer Greeting', category:'Service' }, { name:'Customer Complaint Handling', category:'Service' },
  { name:'POS Operation', category:'Cash' }, { name:'Cash Handling', category:'Cash' },
  { name:'Espresso Preparation', category:'Barista', role:/barista/i }, { name:'Milk Steaming', category:'Barista', role:/barista/i },
  { name:'Boba Preparation', category:'Boba', role:/barista|boba/i }, { name:'Food Preparation', category:'Kitchen', role:/cook|chef|kitchen/i },
  { name:'Food Safety', category:'Safety', role:/cook|chef|kitchen|barista|counter/i },
  { name:'Opening Procedure', category:'Opening & closing' }, { name:'Closing Procedure', category:'Opening & closing' },
  { name:'Cleaning Procedure', category:'Cleanliness' }, { name:'Inventory Handling', category:'Operations' },
  { name:'Shift Leadership', category:'Leadership', role:/manager|leader|supervisor/i },
];
const terminalTraining = new Set(['COMPLETED','PASSED','CERTIFIED']);
const shiftDate = (value: any) => typeof value === 'string' ? new Date(`${value}T00:00:00`) : developmentDate(value);
const percent = (top: number, total: number): number | null => total ? Math.round(top / total * 100) : null;
const displayPct = (value: number | null) => value === null ? '—' : `${value}%`;
const applicableTo = (skill: DevelopmentSkill, crew: CrewMember) =>
  (skill.applicableOutletIds.length === 0 || skill.applicableOutletIds.includes(crew.outletId)) &&
  (skill.applicableRoles.length === 0 || skill.applicableRoles.some(role => role.toLowerCase() === (crew.role || '').toLowerCase()));
const departmentForRole = (role?: string) => {
  const normalized = (role || '').toLowerCase();
  if (/chef|cook|kitchen/.test(normalized)) return 'Kitchen';
  if (/barista|beverage|boba/.test(normalized)) return 'Bar';
  if (/manager|owner|admin|leader|supervisor/.test(normalized)) return 'Management';
  if (/counter|cashier|service|crew|staff/.test(normalized)) return 'Service';
  return role ? 'Other' : 'Unassigned';
};
const currentCertification = (crew: CrewMember, skill: DevelopmentSkill, certifications: any[]) => {
  const moduleIds = skill.certificationModuleIds?.length ? skill.certificationModuleIds : skill.relatedTrainingModuleIds || [];
  const earned = certifications.filter(cert => cert.employeeId === crew.id && moduleIds.includes(cert.moduleId) && cert.assessmentResult === 'PASSED');
  return earned.some(cert => !cert.expiryDate || (developmentDate(cert.expiryDate)?.getTime() || 0) > Date.now());
};
const skillState = (crew: CrewMember, skill: DevelopmentSkill, data: DevelopmentDataset): 'CERTIFIED' | 'IN_PROGRESS' | 'NOT_TRAINED' | 'NOT_APPLICABLE' | 'EXPIRED' => {
  if (!applicableTo(skill, crew)) return 'NOT_APPLICABLE';
  const moduleIds = skill.certificationModuleIds?.length ? skill.certificationModuleIds : skill.relatedTrainingModuleIds || [];
  if (currentCertification(crew, skill, data.certifications)) return 'CERTIFIED';
  const stale = data.certifications.some(cert => cert.employeeId === crew.id && moduleIds.includes(cert.moduleId) && cert.expiryDate && (developmentDate(cert.expiryDate)?.getTime() || 0) <= Date.now());
  if (stale) return 'EXPIRED';
  const underway = data.assignments.some(item => item.employeeId === crew.id && moduleIds.includes(item.moduleId) && !terminalTraining.has(item.status));
  return underway ? 'IN_PROGRESS' : 'NOT_TRAINED';
};

interface EmployeeMetrics {
  attendance: number | null;
  punctuality: number | null;
  tasks: number | null;
  training: number | null;
  certifications: number | null;
  objectiveScore: number | null;
  objectiveCount: number;
  managerAssessment: string;
}
const metricsFor = (crew: CrewMember, data: DevelopmentDataset): EmployeeMetrics => {
  const employeeShifts = data.shifts.filter(item => !item.isDayOff && item.crewId === crew.id && shiftDate(item.date) && shiftDate(item.date)!.getTime() >= data.windowStart.getTime() && shiftDate(item.date)!.getTime() <= Date.now());
  const checkedInDays = new Set(data.attendance.filter(log => log.crewId === crew.id && log.type === 'CHECK_IN').map(log => developmentDate(log.timestamp)?.toDateString()).filter(Boolean));
  const shiftsAttended = employeeShifts.filter(item => checkedInDays.has(shiftDate(item.date)!.toDateString()));
  const attended = percent(shiftsAttended.length, employeeShifts.length);
  const timedShifts = shiftsAttended.filter(item => /^\d{1,2}:\d{2}$/.test(String(item.startTime || '')));
  const onTime = timedShifts.filter(item => {
    const expected = shiftDate(item.date)!;
    const [hour, minute] = String(item.startTime || '').split(':').map(Number);
    if (Number.isFinite(hour)) expected.setHours(hour, minute || 0, 0, 0);
    const checkIn = data.attendance.filter(log => log.crewId === crew.id && log.type === 'CHECK_IN' && developmentDate(log.timestamp)?.toDateString() === shiftDate(item.date)?.toDateString())
      .map(log => developmentDate(log.timestamp)).find(Boolean);
    return !!checkIn && checkIn.getTime() <= expected.getTime() + 5 * 60000;
  });
  const punctuality = percent(onTime.length, timedShifts.length);
  const logs = data.taskLogs.filter(log => log.crewId === crew.id);
  const taskOnTime = percent(logs.filter(log => log.status === 'completed').length, logs.length);
  const assignments = data.assignments.filter(item => item.employeeId === crew.id && item.mandatory !== false && (developmentDate(item.assignedAt)?.getTime() || Date.now()) >= data.windowStart.getTime());
  const training = percent(assignments.filter(item => terminalTraining.has(item.status)).length, assignments.length);
  const skills = data.skills.filter(skill => applicableTo(skill, crew));
  const relevantSkills = skills.filter(skill => (skill.certificationModuleIds?.length || skill.relatedTrainingModuleIds?.length));
  const certifications = percent(relevantSkills.filter(skill => currentCertification(crew, skill, data.certifications)).length, relevantSkills.length);
  const available = [attended, punctuality, taskOnTime, training, certifications].filter((value): value is number => value !== null);
  return { attendance: attended, punctuality, tasks: taskOnTime, training, certifications, objectiveScore: available.length ? Math.round(available.reduce((sum, value) => sum + value, 0) / available.length) : null, objectiveCount: available.length, managerAssessment: 'Not recorded' };
};

export const EmployeeDevelopmentModule: React.FC<{ currentUser: CurrentUser }> = ({ currentUser }) => {
  const [data, setData] = useState<DevelopmentDataset | null>(null);
  const [tab, setTab] = useState<Tab>('OVERVIEW');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState(30);
  const [outlet, setOutlet] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [query, setQuery] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<CrewMember | null>(null);
  const [observationFor, setObservationFor] = useState<CrewMember | null>(null);
  const [actionFor, setActionFor] = useState<CrewMember | null>(null);
  const [awardFor, setAwardFor] = useState<CrewMember | null>(null);
  const [editingSkill, setEditingSkill] = useState<Partial<DevelopmentSkill> | null>(null);
  const [skillSearch, setSkillSearch] = useState('');
  const [formError, setFormError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setData(await developmentService.load(period)); }
    catch (err: any) { setError(err?.message || 'Employee Development could not load. Check your access and try again.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [period]);

  const filteredCrew = useMemo(() => (data?.crew || []).filter(person =>
    (!outlet || person.outletId === outlet) && (!role || person.role === role) && (!department || departmentForRole(person.role) === department) && person.crewName.toLowerCase().includes(query.trim().toLowerCase())
  ), [data, outlet, role, department, query]);
  const roles = useMemo(() => [...new Set((data?.crew || []).map(person => person.role).filter(Boolean) as string[])].sort(), [data]);
  const skills = useMemo(() => (data?.skills || []).filter(skill => !skillSearch || `${skill.name} ${skill.category}`.toLowerCase().includes(skillSearch.toLowerCase())), [data, skillSearch]);
  const teamMetrics = useMemo(() => {
    if (!data) return [] as Array<{ label: string; value: number | null; note: string; icon: React.ReactNode }>;
    const list = filteredCrew.map(person => metricsFor(person, data));
    const average = (key: keyof EmployeeMetrics) => {
      const values = list.map(item => item[key]).filter((value): value is number => typeof value === 'number');
      return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    };
    const attention = filteredCrew.filter(person => {
      const stats = metricsFor(person, data);
      return data.assignments.some(item => item.employeeId === person.id && item.mandatory !== false && item.dueDate && item.dueDate < new Date().toISOString().slice(0,10) && !terminalTraining.has(item.status)) ||
        (stats.attendance !== null && stats.attendance < 80) || (stats.certifications !== null && stats.certifications < 50);
    }).length;
    const ready = filteredCrew.filter(person => {
      const stats = metricsFor(person, data);
      return stats.objectiveScore !== null && stats.objectiveScore >= 85 && (stats.attendance === null || stats.attendance >= 95) && (stats.training === null || stats.training >= 90);
    }).length;
    return [
      { label: 'Team readiness', value: average('objectiveScore'), note: 'Average of available objective signals', icon: <Activity/> },
      { label: 'Training completion', value: average('training'), note: 'Mandatory assignments in selected period', icon: <GraduationCap/> },
      { label: 'Certification coverage', value: average('certifications'), note: 'Only skills linked to certification modules', icon: <ShieldCheck/> },
      { label: 'Attendance reliability', value: average('attendance'), note: 'Scheduled shifts with a check-in', icon: <CalendarClock/> },
      { label: 'Needs attention', value: attention, note: 'Overdue training, low attendance, or skill coverage', icon: <CircleAlert/> },
      { label: 'Ready for development', value: ready, note: 'Guidance based on available objective signals', icon: <Sparkles/> },
    ];
  }, [data, filteredCrew]);

  const saveObservation = async (values: { type: string; category: string; skillId: string; comment: string }) => {
    if (!data || !observationFor) return;
    setWorking(true); setFormError('');
    try {
      const employee = observationFor;
      await developmentService.addObservation({ employeeId: employee.id!, employeeUid: employee.authUid || employee.id, employeeName: employee.crewName, outletId: employee.outletId, type: values.type as any, category: values.category, skillId: values.skillId || undefined, comment: values.comment, createdBy: currentUser.uid, createdByName: currentUser.name || 'Manager' });
      setObservationFor(null); await load();
    } catch (err: any) { setFormError(err.message || 'Observation could not be saved.'); }
    finally { setWorking(false); }
  };
  const saveAction = async (values: { title: string; kind: string; targetDate: string; skillId: string; trainingModuleId: string; requirements: string }) => {
    if (!actionFor) return;
    setWorking(true); setFormError('');
    try {
      const employee = actionFor;
      const selectedModule = data?.trainingModules.find(module => module.id === values.trainingModuleId);
      if (['ASSIGN_TRAINING','REFRESHER','CERTIFICATION'].includes(values.kind)) {
        if (!selectedModule || selectedModule.status !== 'PUBLISHED') throw new Error('Choose a published training module for this action.');
        await trainingService.assignEmployees(selectedModule, [employee], currentUser.uid, currentUser.name || 'Manager', { assignmentType: values.kind === 'REFRESHER' ? 'REFRESHER' : 'INITIAL', reason: values.title, dueDate: values.targetDate || undefined });
      }
      await developmentService.addAction({ employeeId: employee.id!, employeeUid: employee.authUid || employee.id, employeeName: employee.crewName, outletId: employee.outletId, title: values.title, kind: values.kind as any, targetDate: values.targetDate || undefined, skillId: values.skillId || undefined, trainingModuleId: values.trainingModuleId || undefined, requirements: values.requirements.split('\n').map(label => label.trim()).filter(Boolean).map(label => ({ label, completed: false })), status: 'OPEN', createdBy: currentUser.uid, createdByName: currentUser.name || 'Manager' });
      setActionFor(null); await load();
    } catch (err: any) { setFormError(err.message || 'Development action could not be saved.'); }
    finally { setWorking(false); }
  };
  const awardRecognition = async (values: { title: string; reason: string }) => {
    if (!awardFor) return;
    setWorking(true); setFormError('');
    try {
      await developmentService.addRecognition({ employeeId: awardFor.id!, employeeUid: awardFor.authUid || awardFor.id, employeeName: awardFor.crewName, outletId: awardFor.outletId, title: values.title, reason: values.reason, approved: true, awardedBy: currentUser.uid, awardedByName: currentUser.name || 'Manager' });
      setAwardFor(null); await load();
    } catch (err: any) { setFormError(err.message || 'Recognition could not be recorded.'); }
    finally { setWorking(false); }
  };
  const saveSkill = async () => {
    if (!editingSkill || !data) return;
    setWorking(true); setFormError('');
    try { await developmentService.saveSkill(editingSkill as DevelopmentSkill, editingSkill.id); setEditingSkill(null); await load(); }
    catch (err: any) { setFormError(err.message || 'Skill could not be saved.'); }
    finally { setWorking(false); }
  };
  const addSuggestedSkills = async () => {
    if (!data) return;
    setWorking(true); setFormError('');
    try {
      const additions = suggestedSkills.map(item => ({ ...item, applicableRoles: item.role ? roles.filter(candidate => item.role!.test(candidate)) : [] }))
        .filter(item => !item.role || item.applicableRoles.length > 0)
        .filter(item => !data.skills.some(skill => skill.name.toLowerCase() === item.name.toLowerCase()));
      for (const item of additions) await developmentService.saveSkill({
        name: item.name, category: item.category, description: `Define the expected standard for ${item.name.toLowerCase()} at this outlet.`,
        applicableRoles: item.applicableRoles, applicableOutletIds: data.outletIds, relatedSopIds: [], relatedTrainingModuleIds: [],
        certificationModuleIds: [], relatedTaskIds: [], active: true, ownerId: currentUser.uid, ownerName: currentUser.name || 'Manager',
      });
      await load();
    } catch (err: any) { setFormError(err.message || 'Suggested skills could not be added.'); }
    finally { setWorking(false); }
  };
  const toggleRequirement = async (action: DevelopmentAction, index: number) => {
    const requirements = action.requirements.map((item, idx) => idx === index ? { ...item, completed: !item.completed } : item);
    const next = { ...action, requirements, status: requirements.length > 0 && requirements.every(item => item.completed) ? 'COMPLETED' as const : 'OPEN' as const };
    setWorking(true); try { await developmentService.updateAction(next); await load(); } catch (err: any) { setError(err.message || 'Action could not be updated.'); } finally { setWorking(false); }
  };

  if (loading) return <div className="p-12 text-center font-semibold text-emerald-800"><RefreshCw className="inline w-5 h-5 animate-spin mr-2"/>Preparing team development view…</div>;
  if (!data) return <div className="max-w-6xl mx-auto p-4 md:p-8"><Card title="Employee Development"><p className="text-rose-700">{error || 'No team data is available.'}</p><Button className="!w-auto mt-4" onClick={load}>Try again</Button></Card></div>;
  const accessibleOutlets = data.stores.filter(store => data.outletIds.includes(store.outletId));
  const selected = selectedEmployee;
  const selectedMetrics = selected ? metricsFor(selected, data) : null;

  return <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="neko-eyebrow">Neko Pulse · Team capability</p><h1 className="text-2xl md:text-3xl font-semibold text-[#123229]">Employee Development</h1><p className="text-sm text-slate-500 mt-1">Understand who can do what, where skills are missing, and what to do next.</p></div><Button variant="secondary" className="!w-auto" onClick={load}><RefreshCw className="w-4 h-4"/>Refresh</Button></div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    <div className="flex gap-2 overflow-x-auto border-b border-[#ded9ce] pb-1">{tabs.map(([key,label]) => <button key={key} onClick={() => setTab(key)} className={`shrink-0 px-3 py-2 text-sm font-semibold ${tab === key ? 'border-b-2 border-[#0b6b4d] text-[#0b6b4d]' : 'text-slate-500'}`}>{label}</button>)}</div>
    <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3"><Select aria-label="Filter by outlet" value={outlet} onChange={event => setOutlet(event.target.value)}><option value="">All accessible outlets</option>{accessibleOutlets.map(store => <option key={store.outletId} value={store.outletId}>{store.name}</option>)}</Select><Select aria-label="Filter by department" value={department} onChange={event => setDepartment(event.target.value)}><option value="">All departments</option>{['Service','Bar','Kitchen','Management','Other','Unassigned'].map(item=><option key={item}>{item}</option>)}</Select><Select aria-label="Filter by role" value={role} onChange={event => setRole(event.target.value)}><option value="">All roles</option>{roles.map(item => <option key={item}>{item}</option>)}</Select><label className="relative"><Search className="absolute left-3 top-3 w-4 h-4 text-slate-400"/><Input aria-label="Filter by employee" className="!pl-9" placeholder="Employee name" value={query} onChange={event=>setQuery(event.target.value)}/></label><Select aria-label="Data period" value={period} onChange={event => setPeriod(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></Select></div>

    {tab === 'OVERVIEW' && <div className="space-y-4">
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{teamMetrics.map(metric => <Card key={metric.label} className="!p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{metric.label}</p><p className="text-3xl font-semibold text-[#123229] mt-2">{metric.value === null ? '—' : metric.label.includes('attention') || metric.label.includes('development') ? metric.value : `${metric.value}%`}</p><p className="text-xs text-slate-400 mt-1">{metric.note}</p></div><span className="rounded-xl bg-[#e6f0e9] p-2 text-[#0b6b4d]">{metric.icon}</span></div></Card>)}</div>
      <div className="grid lg:grid-cols-2 gap-4"><Card title="Team strengths"><InsightList rows={strengthsFor(data, filteredCrew)} empty="Not enough recent records yet. As staff shifts and training are recorded, strengths will appear here." tone="good"/></Card><Card title="Development areas"><InsightList rows={gapsFor(data, filteredCrew)} empty="No clear development gaps in the selected period." tone="warn"/></Card></div>
      <OperationalRisks data={data} crew={filteredCrew}/>
    </div>}

    {tab === 'MATRIX' && <Card title="Store Skills Matrix"><div className="flex items-center justify-between flex-wrap gap-2 mb-3"><p className="text-sm text-slate-500">Tap a skill status to open the employee profile. Certification is based only on valid linked certification records.</p><label className="relative"><Search className="absolute left-3 top-3 w-4 h-4 text-slate-400"/><Input className="!pl-9" placeholder="Find a skill…" value={skillSearch} onChange={event => setSkillSearch(event.target.value)}/></label></div><div className="overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full text-sm"><thead><tr className="bg-slate-50"><th className="sticky left-0 bg-slate-50 p-3 text-left">Employee</th>{skills.map(skill => <th key={skill.id} className="p-3 text-left min-w-36">{skill.name}<span className="block text-[10px] font-normal text-slate-400">{skill.category}</span></th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filteredCrew.map(person => <tr key={person.id} className="hover:bg-emerald-50/40"><td className="sticky left-0 bg-white p-3"><button className="text-left" onClick={() => setSelectedEmployee(person)}><b>{person.crewName}</b><span className="block text-xs text-slate-500">{person.role || 'Role not set'} · {storeName(data, person.outletId)}</span></button></td>{skills.map(skill => { const state = skillState(person, skill, data); return <td key={skill.id} className="p-2 text-center"><button onClick={() => setSelectedEmployee(person)} title={`${skill.name}: ${stateLabel(state)} — View development`} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${stateClass(state)}`}>{stateLabel(state)}</button></td>; })}</tr>)}</tbody></table>{filteredCrew.length === 0 && <p className="p-8 text-center text-slate-500">No active employees match these filters.</p>}</div><p className="text-xs text-slate-400 mt-3">Certified · In progress · Skill gap · N/A by role/outlet. If no skills have been configured, add them in Skills Library.</p></Card>}

    {tab === 'EMPLOYEES' && <Card title="Employee development profiles"><div className="relative mb-4"><Search className="absolute left-3 top-3 w-4 h-4 text-slate-400"/><Input className="!pl-10" placeholder="Search employee…" value={query} onChange={event => setQuery(event.target.value)}/></div><div className="grid md:grid-cols-2 gap-3">{filteredCrew.map(person => { const stats = metricsFor(person, data); return <button key={person.id} onClick={() => setSelectedEmployee(person)} className="text-left rounded-xl border border-slate-200 p-4 hover:border-emerald-300 hover:bg-emerald-50/30"><div className="flex justify-between gap-3"><div><b className="text-[#123229]">{person.crewName}</b><p className="text-xs text-slate-500 mt-1">{person.role || 'Role not set'} · {storeName(data, person.outletId)}</p></div><span className="text-xl font-semibold text-[#0b6b4d]">{stats.objectiveScore === null ? '—' : `${stats.objectiveScore}/100`}</span></div><div className="flex flex-wrap gap-2 mt-3"><Badge variant="neutral">{data.assignments.filter(item => item.employeeId === person.id && !terminalTraining.has(item.status)).length} training open</Badge><Badge variant="neutral">{data.actions.filter(action => action.employeeId === person.id && action.status === 'OPEN').length} goals open</Badge><ChevronRight className="ml-auto w-4 h-4 text-slate-400"/></div></button>; })}</div>{filteredCrew.length === 0 && <p className="py-8 text-center text-slate-500">No employee records found.</p>}</Card>}

    {tab === 'SKILLS' && <div className="space-y-4"><Card title={editingSkill ? 'Add or edit a skill' : 'Skills Library'}><p className="text-sm text-slate-500 mb-4">Skills connect to existing training, tasks and certifications. A skill only counts as certified when it has a linked certification module and an unexpired record.</p>{editingSkill ? <SkillEditor skill={editingSkill} data={data} roles={roles} onChange={setEditingSkill} onSave={saveSkill} onCancel={() => {setEditingSkill(null);setFormError('');}} saving={working}/> : <div className="flex flex-wrap justify-between gap-3"><label className="relative"><Search className="absolute left-3 top-3 w-4 h-4 text-slate-400"/><Input className="!pl-9" placeholder="Search skills…" value={skillSearch} onChange={event => setSkillSearch(event.target.value)}/></label><div className="flex gap-2">{data.skills.length === 0 && <Button variant="secondary" className="!w-auto" isLoading={working} onClick={addSuggestedSkills}>Add suggested skills</Button>}<Button className="!w-auto" onClick={() => { setFormError(''); setEditingSkill({ name: '', category: 'Service', description: '', applicableRoles: [], applicableOutletIds: data.outletIds, relatedSopIds: [], relatedTrainingModuleIds: [], certificationModuleIds: [], relatedTaskIds: [], active: true }); }}><Plus className="w-4 h-4"/>Add skill</Button></div></div>}{formError && <p className="text-sm text-rose-700 mt-3">{formError}</p>}</Card>{!editingSkill && <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{skills.map(skill => <Card key={skill.id}><div className="flex justify-between gap-3"><div><Badge variant="neutral">{skill.category}</Badge><h3 className="font-semibold text-[#123229] mt-2">{skill.name}</h3><p className="text-sm text-slate-500 mt-1">{skill.description || 'Add a clear standard and link the existing SOP, training, and task.'}</p></div><Button className="!w-auto !py-1.5 !px-3" variant="secondary" onClick={() => setEditingSkill(skill)}>Edit</Button></div><p className="text-xs text-slate-400 mt-3">{skill.applicableRoles.length ? skill.applicableRoles.join(', ') : 'All roles'} · {skill.applicableOutletIds.length ? skill.applicableOutletIds.map(id => storeName(data,id)).join(', ') : 'All outlets'}</p><div className="flex flex-wrap gap-2 mt-3">{(skill.relatedTrainingModuleIds || []).map(id => <Badge key={id} variant="neutral">{trainingName(data.trainingModules,id)}</Badge>)}{(skill.relatedTaskIds || []).map(id => <Badge key={id} variant="neutral">{taskName(data,id)}</Badge>)}{!(skill.relatedTrainingModuleIds?.length || skill.relatedTaskIds?.length) && <span className="text-xs text-amber-700">No linked training or task yet</span>}</div></Card>)}{skills.length === 0 && <Card><p className="text-center py-6 text-slate-500">No skills configured. Start with the capabilities that matter for your outlet.</p></Card>}</div>}</div>}

    {tab === 'DEVELOPMENT' && <Card title="Open development goals and actions"><p className="text-sm text-slate-500 mb-4">Turn a skill gap or manager observation into a clear next step. Progress here does not certify an employee; the existing Training module remains authoritative.</p><ActionList actions={data.actions.filter(action => action.status === 'OPEN' && filteredCrew.some(person => person.id === action.employeeId))} onToggle={toggleRequirement} working={working}/>{filteredCrew.length > 0 && <div className="mt-5 border-t pt-4"><h3 className="text-sm font-bold mb-3">Create an action</h3><div className="flex flex-wrap gap-2">{filteredCrew.slice(0,8).map(person => <Button key={person.id} variant="secondary" className="!w-auto !py-2" onClick={() => {setActionFor(person);setFormError('');}}><Plus className="w-4 h-4"/>{person.crewName}</Button>)}</div><p className="text-xs text-slate-400 mt-2">Open an employee profile to create an action for anyone in the filtered team.</p></div>}</Card>}

    {tab === 'RECOGNITION' && <Card title="Recognition"><p className="text-sm text-slate-500 mb-4">Positive, manager-approved moments. Suggestions use objective data only and never publish automatically.</p><div className="grid md:grid-cols-2 gap-3">{data.recognitions.filter(item => filteredCrew.some(person => person.id === item.employeeId)).sort((a,b) => (developmentDate(b.awardedAt)?.getTime()||0)-(developmentDate(a.awardedAt)?.getTime()||0)).map(item => <div key={item.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4"><div className="flex items-start gap-3"><Award className="w-5 h-5 text-amber-600"/><div><b>{item.title}</b><p className="text-sm text-slate-600">{item.employeeName} · {storeName(data,item.outletId)}</p><p className="text-sm text-slate-500 mt-1">{item.reason}</p><p className="text-xs text-slate-400 mt-2">Given by {item.awardedByName} · {developmentDate(item.awardedAt)?.toLocaleDateString() || 'Recently'}</p></div></div></div>)}</div><div className="flex flex-wrap gap-2 mt-5">{filteredCrew.map(person => <Button key={person.id} className="!w-auto !py-2" variant="secondary" onClick={() => {setAwardFor(person);setFormError('');}}><Heart className="w-4 h-4"/>Recognize {person.crewName.split(' ')[0]}</Button>)}</div></Card>}

    {tab === 'INSIGHTS' && <div className="space-y-4"><Card title={`Team insights · last ${period} days`}><InsightList rows={[...strengthsFor(data,filteredCrew).map(text => `Strength · ${text}`),...gapsFor(data,filteredCrew).map(text => `Opportunity · ${text}`)]} empty="Insights will appear when enough operational and training records exist." tone="good"/><div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Signals are calculated from records in this app and the selected period. No synthetic/sample metrics are shown. Manager observations are not used in objective scores.</div></Card><OperationalRisks data={data} crew={filteredCrew}/></div>}

    {selected && selectedMetrics && <div className="fixed inset-0 z-40 bg-slate-950/40 p-3 md:p-8 overflow-y-auto" role="dialog" aria-modal="true" aria-label={`${selected.crewName} development profile`}><div className="max-w-4xl mx-auto rounded-2xl bg-[#faf9f6] shadow-2xl p-4 md:p-6"><div className="flex justify-between gap-4"><div><p className="neko-eyebrow">Employee development profile</p><h2 className="text-2xl font-semibold text-[#123229]">{selected.crewName}</h2><p className="text-sm text-slate-500">{selected.role || 'Role not set'} · {storeName(data,selected.outletId)}</p></div><button aria-label="Close profile" onClick={() => setSelectedEmployee(null)} className="h-10 w-10 rounded-xl hover:bg-slate-200"><X/></button></div><div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-5">{[['Attendance reliability',selectedMetrics.attendance],['Punctuality',selectedMetrics.punctuality],['On-time task completion',selectedMetrics.tasks],['Mandatory training',selectedMetrics.training],['Certification coverage',selectedMetrics.certifications]].map(([label,value]) => <div key={String(label)} className="rounded-xl bg-white border p-3"><p className="text-xs text-slate-500">{label}</p><b className="text-xl text-[#123229]">{displayPct(value as number|null)}</b></div>)}<div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3"><p className="text-xs text-emerald-800">Objective development score</p><b className="text-xl text-emerald-900">{selectedMetrics.objectiveScore === null ? '—' : `${selectedMetrics.objectiveScore}/100`}</b><p className="text-[10px] text-emerald-800">Average of {selectedMetrics.objectiveCount} available measures</p></div></div><div className="mt-4 rounded-xl bg-slate-100 p-3 text-sm"><b>Manager assessment:</b> Not recorded as a numeric assessment. This subjective judgment is kept separate and is not included in the objective score.</div><h3 className="font-semibold mt-5 mb-2">Skills</h3><div className="flex flex-wrap gap-2">{data.skills.filter(skill => applicableTo(skill,selected)).map(skill => <button key={skill.id} onClick={() => {setTab('MATRIX');setSelectedEmployee(null);}} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${stateClass(skillState(selected,skill,data))}`}>{skill.name} · {stateLabel(skillState(selected,skill,data))}</button>)}{data.skills.filter(skill => applicableTo(skill,selected)).length === 0 && <span className="text-sm text-slate-500">No applicable skills have been configured.</span>}</div><div className="grid md:grid-cols-2 gap-4 mt-5"><Card title="Manager observations"><div className="space-y-2 max-h-64 overflow-y-auto">{data.observations.filter(item => item.employeeId === selected.id).map(item => <div key={item.id} className="rounded-lg bg-white border p-3"><div className="flex justify-between gap-2"><b className="text-sm">{item.type.replaceAll('_',' ')} · {item.category}</b><span className="text-[10px] text-slate-400">{developmentDate(item.createdAt)?.toLocaleDateString()}</span></div><p className="text-sm text-slate-600 mt-1">{item.comment}</p><p className="text-xs text-slate-400 mt-1">{item.createdByName}</p><Button className="!w-auto !py-1.5 !px-2 mt-2" variant="secondary" onClick={() => {setSelectedEmployee(null);setActionFor(selected);}}>Create action</Button></div>)}{data.observations.filter(item => item.employeeId === selected.id).length === 0 && <p className="text-sm text-slate-400 py-4">No manager observations yet.</p>}</div></Card><Card title="Development goals"><ActionList actions={data.actions.filter(item => item.employeeId === selected.id)} onToggle={toggleRequirement} working={working}/></Card></div><div className="flex flex-wrap gap-2 mt-5"><Button className="!w-auto" onClick={() => {setObservationFor(selected);setFormError('');}}><Plus className="w-4 h-4"/>Observation</Button><Button className="!w-auto" variant="secondary" onClick={() => {setActionFor(selected);setFormError('');}}><ClipboardCheck className="w-4 h-4"/>Development action</Button><Button className="!w-auto" variant="secondary" onClick={() => {setAwardFor(selected);setFormError('');}}><Award className="w-4 h-4"/>Recognition</Button></div></div></div>}
    {observationFor && <SimpleDialog title={`Quick observation · ${observationFor.crewName}`} error={formError} onClose={() => setObservationFor(null)}><ObservationForm skills={data.skills.filter(skill => applicableTo(skill,observationFor))} working={working} onSave={saveObservation}/></SimpleDialog>}
    {actionFor && <SimpleDialog title={`Development action · ${actionFor.crewName}`} error={formError} onClose={() => setActionFor(null)}><ActionForm skills={data.skills.filter(skill => applicableTo(skill,actionFor))} modules={data.trainingModules} working={working} onSave={saveAction}/></SimpleDialog>}
    {awardFor && <SimpleDialog title={`Recognition · ${awardFor.crewName}`} error={formError} onClose={() => setAwardFor(null)}><RecognitionForm working={working} onSave={awardRecognition}/></SimpleDialog>}
  </div>;
};

const storeName = (data: DevelopmentDataset, outletId: string) => data.stores.find(store => store.outletId === outletId)?.name || outletId;
const trainingName = (modules: TrainingModule[], id: string) => modules.find(module => module.id === id)?.title || `Training ${id.slice(0,7)}`;
const taskName = (data: DevelopmentDataset, id: string) => data.tasks.find(task => task.id === id)?.title || `Task ${id.slice(0,7)}`;
const stateLabel = (state: string) => ({ CERTIFIED:'Certified', IN_PROGRESS:'In progress', NOT_TRAINED:'Skill gap', NOT_APPLICABLE:'N/A', EXPIRED:'Expired' } as Record<string,string>)[state] || state;
const stateClass = (state: string) => ({ CERTIFIED:'bg-emerald-100 text-emerald-800', IN_PROGRESS:'bg-amber-100 text-amber-800', NOT_TRAINED:'bg-rose-100 text-rose-800', NOT_APPLICABLE:'bg-slate-100 text-slate-500', EXPIRED:'bg-red-100 text-red-800' } as Record<string,string>)[state] || '';
const strengthsFor = (data: DevelopmentDataset, crew: CrewMember[]) => {
  const items: string[] = [];
  const training = data.assignments.filter(item => crew.some(person => person.id === item.employeeId) && item.mandatory !== false);
  const trainingRate = percent(training.filter(item => terminalTraining.has(item.status)).length, training.length);
  if (trainingRate !== null && trainingRate >= 80) items.push(`${trainingRate}% mandatory training is complete.`);
  const logged = data.taskLogs.filter(item => crew.some(person => person.id === item.crewId));
  const punctual = percent(logged.filter(item => item.status === 'completed').length, logged.length);
  if (punctual !== null && punctual >= 90) items.push(`${punctual}% of logged task completions were on time.`);
  const certified = data.certifications.filter(item => crew.some(person => person.id === item.employeeId) && (!item.expiryDate || (developmentDate(item.expiryDate)?.getTime() || 0) > Date.now())).length;
  if (certified > 0) items.push(`${certified} valid certification${certified === 1 ? '' : 's'} are recorded for this team.`);
  return items;
};
const gapsFor = (data: DevelopmentDataset, crew: CrewMember[]) => {
  const items: string[] = [];
  const incomplete = data.assignments.filter(item => crew.some(person => person.id === item.employeeId) && item.mandatory !== false && !terminalTraining.has(item.status));
  if (incomplete.length) items.push(`${incomplete.length} mandatory training assignment${incomplete.length === 1 ? '' : 's'} remain open.`);
  const skillCoverage = data.skills.map(skill => {
    const applicable = crew.filter(person => applicableTo(skill,person));
    const coverage = percent(applicable.filter(person => skillState(person,skill,data) === 'CERTIFIED').length, applicable.length);
    return { skill, coverage };
  }).filter(item => item.coverage !== null).sort((a,b) => a.coverage! - b.coverage!);
  for (const item of skillCoverage.slice(0,3)) if (item.coverage! < 70) items.push(`${item.skill.name}: ${item.coverage}% certified coverage.`);
  const openActions = data.actions.filter(item => item.status === 'OPEN' && crew.some(person => person.id === item.employeeId));
  if (openActions.length) items.push(`${openActions.length} development goal${openActions.length === 1 ? '' : 's'} need follow-up.`);
  return items;
};

const InsightList = ({ rows, empty, tone }: { rows: string[]; empty: string; tone: 'good'|'warn' }) => <div className="space-y-2">{rows.length ? rows.map((row,index) => <div key={index} className={`flex gap-2 rounded-lg p-3 text-sm ${tone === 'good' ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0"/>{row}</div>) : <p className="text-sm text-slate-400 py-4">{empty}</p>}</div>;
const OperationalRisks = ({ data, crew }: { data: DevelopmentDataset; crew: CrewMember[] }) => {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1); const day = tomorrow.toISOString().slice(0,10);
  const shifts = data.shifts.filter(item => item.date === day && crew.some(person => person.id === item.crewId));
  const relevant = data.skills.filter(skill => /open|clos|leader|food safety|kitchen/i.test(`${skill.name} ${skill.category}`));
  const warnings: string[] = [];
  if (!shifts.length) warnings.push('No roster records were found for tomorrow in the selected team.');
  relevant.forEach(skill => {
    const onShift = [...new Set(shifts.map(item => item.crewId))].map(id => crew.find(person => person.id === id)).filter((person): person is CrewMember => Boolean(person) && applicableTo(skill,person));
    if (!onShift.length) return;
    const certified = onShift.filter(person => data.certifications.some(cert => cert.employeeId === person.id && (skill.certificationModuleIds || skill.relatedTrainingModuleIds || []).includes(cert.moduleId) && (!cert.expiryDate || (developmentDate(cert.expiryDate)?.getTime() || 0) > Date.now())));
    if (certified.length < 2) warnings.push(`${storeName(data, onShift[0].outletId)} · ${skill.name}: only ${certified.length} scheduled certified employee${certified.length === 1 ? '' : 's'} for tomorrow.`);
  });
  return <Card title="Operational coverage risks"><p className="text-sm text-slate-500 mb-3">Tomorrow’s roster compared with valid certifications linked in the Skills Library.</p>{warnings.length ? <InsightList rows={warnings} empty="No skill coverage risks detected." tone="warn"/> : <p className="text-sm text-slate-400 py-3">No coverage risks detected from the configured skills. Link certifications and add shift plans to improve this check.</p>}</Card>;
};

const SkillEditor = ({ skill, data, roles, onChange, onSave, onCancel, saving }: { skill: Partial<DevelopmentSkill>; data: DevelopmentDataset; roles: string[]; onChange: (skill: Partial<DevelopmentSkill>) => void; onSave: () => void; onCancel: () => void; saving: boolean }) => {
  const stores = data.stores.filter(store => data.outletIds.includes(store.outletId));
  const modules = data.trainingModules.filter(module => module.status !== 'ARCHIVED');
  const tasks = data.tasks.filter(task => task.isActive);
  const updateIds = (key: 'relatedSopIds'|'relatedTrainingModuleIds'|'certificationModuleIds'|'relatedTaskIds', value: string) => onChange({ ...skill, [key]: value.split(',').map(item=>item.trim()).filter(Boolean) });
  return <div className="grid md:grid-cols-2 gap-3"><Field label="Skill name"><Input value={skill.name || ''} onChange={event=>onChange({...skill,name:event.target.value})}/></Field><Field label="Category"><Select value={skill.category || 'Service'} onChange={event=>onChange({...skill,category:event.target.value})}>{['Service','Barista','Boba','Kitchen','Safety','Opening & closing','Cash','Leadership','Cleanliness','Operations'].map(item=><option key={item}>{item}</option>)}</Select></Field><Field label="Description"><TextArea value={skill.description || ''} onChange={event=>onChange({...skill,description:event.target.value})}/></Field><Field label="Certification validity (days; blank = no expiry)"><Input type="number" min="1" value={skill.certificationValidityDays || ''} onChange={event=>onChange({...skill,certificationValidityDays:event.target.value?Number(event.target.value):undefined})}/></Field><Field label="Applicable roles" hint="Leave all unchecked for every role."><div className="flex flex-wrap gap-3">{roles.map(item=><label key={item} className="text-sm flex gap-1.5"><Checkbox checked={skill.applicableRoles?.includes(item)||false} onChange={()=>onChange({...skill,applicableRoles:(skill.applicableRoles||[]).includes(item)?skill.applicableRoles!.filter(role=>role!==item):[...(skill.applicableRoles||[]),item]})}/>{item}</label>)}</div></Field><Field label="Applicable outlets" hint="Required; select one or more."><div className="flex flex-wrap gap-3">{stores.map(store=><label key={store.outletId} className="text-sm flex gap-1.5"><Checkbox checked={skill.applicableOutletIds?.includes(store.outletId)||false} onChange={()=>onChange({...skill,applicableOutletIds:(skill.applicableOutletIds||[]).includes(store.outletId)?skill.applicableOutletIds!.filter(id=>id!==store.outletId):[...(skill.applicableOutletIds||[]),store.outletId]})}/>{store.name}</label>)}</div></Field><Field label="Training modules" hint="Choose the existing modules that teach this skill."><div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">{modules.map(module=><label key={module.id} className="text-xs flex gap-1.5 items-center"><Checkbox checked={skill.relatedTrainingModuleIds?.includes(module.id!)||false} onChange={()=>{const values=skill.relatedTrainingModuleIds||[];const next=values.includes(module.id!)?values.filter(id=>id!==module.id):[...values,module.id!];onChange({...skill,relatedTrainingModuleIds:next});}}/>{module.title}</label>)}</div></Field><Field label="Certification modules" hint="Only these valid certifications count toward coverage."><div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">{modules.map(module=><label key={module.id} className="text-xs flex gap-1.5 items-center"><Checkbox checked={skill.certificationModuleIds?.includes(module.id!)||false} onChange={()=>{const values=skill.certificationModuleIds||[];const next=values.includes(module.id!)?values.filter(id=>id!==module.id):[...values,module.id!];onChange({...skill,certificationModuleIds:next});}}/>{module.title}</label>)}</div></Field><Field label="Related tasks" hint="Select existing operational tasks; this does not create or duplicate tasks."><div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">{tasks.map(task=><label key={task.id} className="text-xs flex gap-1.5 items-center"><Checkbox checked={skill.relatedTaskIds?.includes(task.id!)||false} onChange={()=>{const values=skill.relatedTaskIds||[];const next=values.includes(task.id!)?values.filter(id=>id!==task.id):[...values,task.id!];onChange({...skill,relatedTaskIds:next});}}/>{task.title}</label>)}</div></Field><Field label="Related SOP IDs" hint="Optional existing SOP identifiers, comma-separated."><Input value={(skill.relatedSopIds||[]).join(', ')} onChange={event=>updateIds('relatedSopIds',event.target.value)}/></Field><div className="md:col-span-2 flex justify-end gap-2"><Button variant="secondary" className="!w-auto" onClick={onCancel}>Cancel</Button><Button className="!w-auto" onClick={onSave} isLoading={saving}>Save skill</Button></div></div>;
};

const Field = ({ label, hint, children }: { label:string; hint?:string; children:React.ReactNode }) => <label className="block space-y-1.5"><span className="block text-xs font-semibold text-slate-700">{label}</span>{hint&&<span className="block text-[11px] text-slate-400">{hint}</span>}{children}</label>;
const ActionList = ({ actions, onToggle, working }: { actions: DevelopmentAction[]; onToggle: (action:DevelopmentAction,index:number)=>void; working:boolean }) => <div className="space-y-2">{actions.map(action=><div key={action.id} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex justify-between gap-2"><div><b>{action.employeeName}</b><span className="text-slate-500"> · {action.title}</span><p className="text-xs text-slate-400">{action.kind.replaceAll('_',' ')}{action.targetDate?` · Due ${action.targetDate}`:''}</p></div><Badge variant={action.status==='COMPLETED'?'success':'warning'}>{action.status}</Badge></div><div className="mt-2 space-y-1">{(action.requirements||[]).map((requirement,index)=><label key={index} className="flex items-center gap-2 text-sm"><Checkbox checked={requirement.completed} disabled={working} onChange={()=>onToggle(action,index)}/><span className={requirement.completed?'line-through text-slate-400':''}>{requirement.label}</span></label>)}</div></div>)}{actions.length===0&&<p className="text-sm text-slate-400 py-4">No actions to show.</p>}</div>;

const SimpleDialog = ({ title, error, children, onClose }: { title:string; error:string; children:React.ReactNode; onClose:()=>void }) => <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-3" role="dialog" aria-modal="true"><div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"><div className="flex justify-between gap-3 mb-4"><h3 className="font-semibold text-[#123229]">{title}</h3><button aria-label="Close" onClick={onClose}><X className="w-5 h-5"/></button></div>{error&&<p role="alert" className="text-sm text-rose-700 mb-3">{error}</p>}{children}</div></div>;
const ObservationForm = ({ skills, working, onSave }: { skills:DevelopmentSkill[]; working:boolean; onSave:(values:{type:string;category:string;skillId:string;comment:string})=>void }) => { const [type,setType]=useState('RECOGNITION');const [category,setCategory]=useState('Customer Service');const [skillId,setSkillId]=useState('');const [comment,setComment]=useState('');return <div className="space-y-3"><Select value={type} onChange={event=>setType(event.target.value)}><option value="RECOGNITION">Recognition</option><option value="COACHING">Coaching</option><option value="PERFORMANCE_ISSUE">Performance issue</option><option value="INCIDENT">Incident</option></Select><Select value={category} onChange={event=>setCategory(event.target.value)}>{['Customer Service','Teamwork','Food Preparation','Cleanliness','Leadership','SOP Compliance','Safety','Other'].map(item=><option key={item}>{item}</option>)}</Select><Select value={skillId} onChange={event=>setSkillId(event.target.value)}><option value="">No linked skill</option>{skills.map(skill=><option key={skill.id} value={skill.id}>{skill.name}</option>)}</Select><TextArea autoFocus maxLength={500} placeholder="Short note: what happened, and what was done well or needs practice?" value={comment} onChange={event=>setComment(event.target.value)}/><p className="text-[11px] text-slate-400">{comment.length}/500 · This note is visible to authorised managers only and does not automatically affect scores.</p><div className="flex justify-end"><Button className="!w-auto" disabled={!comment.trim()} isLoading={working} onClick={()=>onSave({type,category,skillId,comment})}>Save observation</Button></div></div>; };
const ActionForm = ({ skills, modules, working, onSave }: { skills:DevelopmentSkill[]; modules:TrainingModule[]; working:boolean; onSave:(values:{title:string;kind:string;targetDate:string;skillId:string;trainingModuleId:string;requirements:string})=>void }) => {const [title,setTitle]=useState('');const [kind,setKind]=useState('GOAL');const [targetDate,setTargetDate]=useState('');const [skillId,setSkillId]=useState('');const [trainingModuleId,setTrainingModuleId]=useState('');const [requirements,setRequirements]=useState('');const needsTraining=['ASSIGN_TRAINING','REFRESHER','CERTIFICATION'].includes(kind);return <div className="space-y-3"><Input autoFocus placeholder="Goal or next action" value={title} onChange={event=>setTitle(event.target.value)}/><Select value={kind} onChange={event=>setKind(event.target.value)}>{[['GOAL','Development goal'],['ASSIGN_TRAINING','Assign training'],['REFRESHER','Refresher training'],['CERTIFICATION','Certification preparation'],['COACHING','Manager coaching'],['REASSESSMENT','Reassessment']].map(([value,label])=><option value={value} key={value}>{label}</option>)}</Select><Select value={skillId} onChange={event=>setSkillId(event.target.value)}><option value="">No linked skill</option>{skills.map(skill=><option key={skill.id} value={skill.id}>{skill.name}</option>)}</Select>{needsTraining&&<Select value={trainingModuleId} onChange={event=>{setTrainingModuleId(event.target.value);const module=modules.find(item=>item.id===event.target.value);if(module)setTitle(`${kind==='REFRESHER'?'Refresher: ':kind==='CERTIFICATION'?'Certification preparation: ':''}${module.title}`);}}><option value="">Choose published training to assign</option>{modules.filter(module=>module.status==='PUBLISHED').map(module=><option key={module.id} value={module.id}>{module.title}</option>)}</Select>}<Input aria-label="Target date" type="date" value={targetDate} onChange={event=>setTargetDate(event.target.value)}/><TextArea placeholder="Milestones, one per line" value={requirements} onChange={event=>setRequirements(event.target.value)}/><div className="flex justify-end"><Button className="!w-auto" disabled={!title.trim()||(needsTraining&&!trainingModuleId)} isLoading={working} onClick={()=>onSave({title,kind,targetDate,skillId,trainingModuleId,requirements})}>{needsTraining?'Assign and create action':'Create action'}</Button></div></div>;};
const RecognitionForm = ({ working, onSave }: { working:boolean; onSave:(values:{title:string;reason:string})=>void }) => {const [title,setTitle]=useState('Customer Hero');const [reason,setReason]=useState('');return <div className="space-y-3"><Select value={title} onChange={event=>setTitle(event.target.value)}>{['Customer Hero','Training Champion','Task Master','Perfect Attendance','Barista Expert','Team Player','Rising Star','Other'].map(item=><option key={item}>{item}</option>)}</Select>{title==='Other'&&<Input placeholder="Recognition title" onChange={event=>setTitle(event.target.value)}/>}<TextArea autoFocus placeholder="Why are you recognising this person?" value={reason} onChange={event=>setReason(event.target.value)}/><p className="text-xs text-slate-400">Recognition is recorded with the approving manager and time.</p><div className="flex justify-end"><Button className="!w-auto" disabled={!reason.trim()} isLoading={working} onClick={()=>onSave({title,reason})}>Award recognition</Button></div></div>;};
