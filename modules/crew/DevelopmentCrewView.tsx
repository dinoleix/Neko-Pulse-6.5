import React, { useEffect, useState } from 'react';
import { Award, BookOpenCheck, RefreshCw, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { Badge, Card } from '../../components/SharedComponents';
import { CurrentUser, DevelopmentSkill, TrainingAssignment } from '../../types';
import { developmentService, developmentDate } from '../../services/developmentService';

export const DevelopmentCrewView: React.FC<{ currentUser: CurrentUser }> = ({ currentUser }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try { setData(await developmentService.getMyDevelopment(currentUser.uid)); }
    catch (err: any) { setError(err?.message || 'Your development information is not available yet.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [currentUser.uid]);
  if (loading) return <div className="p-12 text-center text-emerald-800 font-semibold"><RefreshCw className="inline w-5 h-5 animate-spin mr-2"/>Loading your progress…</div>;
  if (error || !data) return <Card title="My Development"><p className="text-sm text-rose-700">{error || 'No development data is available.'}</p><button onClick={load} className="mt-3 text-sm font-bold text-emerald-800">Try again</button></Card>;
  const skills: DevelopmentSkill[] = data.skills.filter((skill: DevelopmentSkill) =>
    (skill.applicableOutletIds?.length === 0 || skill.applicableOutletIds?.includes(currentUser.outletId || '')) &&
    (skill.applicableRoles?.length === 0 || skill.applicableRoles?.some(role => role.toLowerCase() === (currentUser.accessRole || '').toLowerCase()))
  );
  const stateFor = (skill: DevelopmentSkill) => {
    const ids = skill.certificationModuleIds?.length ? skill.certificationModuleIds : skill.relatedTrainingModuleIds || [];
    const cert = data.certifications.find((item: any) => item.employeeId === (currentUser.dbId || currentUser.uid) && ids.includes(item.moduleId) && (!item.expiryDate || (developmentDate(item.expiryDate)?.getTime() || 0) > Date.now()));
    if (cert) return 'Certified';
    const inProgress = data.assignments.find((item: TrainingAssignment) => item.employeeId === (currentUser.dbId || currentUser.uid) && ids.includes(item.moduleId) && !['COMPLETED','PASSED','CERTIFIED'].includes(item.status));
    if (inProgress) return 'In progress';
    const expired = data.certifications.find((item: any) => item.employeeId === (currentUser.dbId || currentUser.uid) && ids.includes(item.moduleId) && item.expiryDate && (developmentDate(item.expiryDate)?.getTime() || 0) <= Date.now());
    if (expired) return 'Expired';
    return ids.length ? 'Not yet certified' : 'Not set up yet';
  };
  const activeTraining = data.assignments.filter((item: TrainingAssignment) => !['COMPLETED','PASSED','CERTIFIED','EXPIRED'].includes(item.status));
  const completedTraining = data.assignments.filter((item: TrainingAssignment) => ['COMPLETED','PASSED','CERTIFIED'].includes(item.status));
  return <div className="space-y-4 px-1"><div><p className="neko-eyebrow">Your progress</p><h1 className="text-2xl font-semibold text-[#123229]">My Development</h1><p className="text-sm text-slate-500 mt-1">Your skills, training, goals and recognition in one place.</p></div>
    <div className="grid grid-cols-2 gap-3"><Card className="!p-4"><BookOpenCheck className="w-5 h-5 text-emerald-700"/><b className="block text-2xl text-[#123229] mt-2">{activeTraining.length}</b><span className="text-xs text-slate-500">Training in progress</span></Card><Card className="!p-4"><ShieldCheck className="w-5 h-5 text-emerald-700"/><b className="block text-2xl text-[#123229] mt-2">{data.certifications.filter((item:any)=>!item.expiryDate||(developmentDate(item.expiryDate)?.getTime()||0)>Date.now()).length}</b><span className="text-xs text-slate-500">Valid certifications</span></Card></div>
    <Card title="My skills"><div className="space-y-2">{skills.map((skill: DevelopmentSkill)=><div key={skill.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3"><div><b className="text-sm text-[#123229]">{skill.name}</b><p className="text-xs text-slate-400">{skill.category}</p></div><Badge variant={stateFor(skill)==='Certified'?'success':stateFor(skill)==='Expired'?'danger':stateFor(skill)==='In progress'?'warning':'neutral'}>{stateFor(skill)}</Badge></div>)}{skills.length===0&&<p className="text-sm text-slate-400">No skills have been added for your role and outlet yet.</p>}</div></Card>
    <Card title="Training"><div className="space-y-2">{data.assignments.map((assignment: TrainingAssignment)=><div key={assignment.id} className="rounded-xl border border-slate-100 bg-white p-3"><div className="flex justify-between gap-2"><b className="text-sm">{assignment.moduleTitle}</b><Badge variant={assignment.status==='CERTIFIED'?'success':assignment.status==='RETRAINING_REQUIRED'?'danger':'neutral'}>{assignment.status.replaceAll('_',' ')}</Badge></div>{assignment.managerFeedback&&<p className="text-sm text-slate-500 mt-2">Manager feedback: {assignment.managerFeedback}</p>}{assignment.dueDate&&<p className="text-xs text-slate-400 mt-1">Due {assignment.dueDate}</p>}</div>)}{data.assignments.length===0&&<p className="text-sm text-slate-400">No training assigned yet.</p>}</div></Card>
    <Card title="My goals"><div className="space-y-2">{data.actions.map((action:any)=><div key={action.id} className="rounded-xl border border-slate-100 bg-white p-3"><div className="flex items-start gap-2"><Target className="w-4 h-4 mt-0.5 text-emerald-700"/><div className="flex-1"><b className="text-sm">{action.title}</b><p className="text-xs text-slate-400">{action.status==='COMPLETED'?'Complete':'In progress'}{action.targetDate?` · Due ${action.targetDate}`:''}</p><div className="h-1.5 rounded-full bg-slate-100 mt-2 overflow-hidden"><div className="h-full bg-emerald-600" style={{width:`${action.requirements?.length?Math.round(action.requirements.filter((item:any)=>item.completed).length/action.requirements.length*100):0}%`}}/></div></div></div></div>)}{data.actions.length===0&&<p className="text-sm text-slate-400">No development goals yet.</p>}</div></Card>
    <Card title="Recognition"><div className="space-y-2">{data.recognitions.map((item:any)=><div key={item.id} className="rounded-xl bg-amber-50 p-3 flex gap-2"><Award className="w-4 h-4 text-amber-600 mt-0.5"/><div><b className="text-sm">{item.title}</b><p className="text-sm text-slate-600">{item.reason}</p></div></div>)}{data.recognitions.length===0&&<p className="text-sm text-slate-400">Recognition from your managers will show here.</p>}</div></Card>
    <div className="rounded-xl bg-emerald-50 px-4 py-3 text-xs text-emerald-900 flex gap-2"><Sparkles className="w-4 h-4 shrink-0"/>Watching a lesson or completing training does not automatically certify practical competence. Your manager records any practical result or certification.</div>
  </div>;
};
