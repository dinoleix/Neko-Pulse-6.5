import React, { useState } from 'react';

export const setupSteps = [
  { id: 'stores', title: 'Confirm your outlets', detail: 'Open Stores and check each outlet’s name, address and active status.', module: 'STORES' },
  { id: 'employees', title: 'Add your team', detail: 'Open Employees, add staff and managers, assign their roles and outlets, and share their login instructions privately.', module: 'EMPLOYEE' },
  { id: 'shifts', title: 'Plan your first week', detail: 'Open Shifts, define shift times and assign employees to the roster.', module: 'SHIFTS' },
  { id: 'tasks', title: 'Assign your first tasks', detail: 'Open Task Manager, create opening, cleaning or closing tasks, and assign the right people.', module: 'TASKS' },
  { id: 'attendance', title: 'Set up the store time clock', detail: 'Open Attendance and configure an authorised store device. Test check-in and check-out at the correct outlet.', module: 'ATTENDANCE' },
];

export function MobileInstallGuide() {
  return <section className="mt-5 rounded-2xl border border-[#ded9ce] bg-white p-4">
    <h3 className="font-semibold text-[#123229]">Put Neko Pulse on your phone</h3>
    <p className="text-sm text-slate-600 mt-1">Open the app login page—not the marketing website. No App Store download is needed. An internet connection is needed for live operations.</p>
    <details className="mt-3"><summary className="cursor-pointer font-medium py-2">iPhone / iPad · Safari</summary><ol className="list-decimal ml-5 space-y-2 text-sm text-slate-600"><li>Open Neko Pulse in Safari.</li><li>Tap Share (or More, then Share) and choose Add to Home Screen.</li><li>If shown, leave Open as Web App switched on, then tap Add.</li><li>Open the Neko Pulse icon and sign in. Each staff member uses their own login.</li></ol><a className="text-sm text-emerald-800 underline block mt-3" href="https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios" target="_blank" rel="noreferrer">Apple installation guide</a></details>
    <details className="mt-2"><summary className="cursor-pointer font-medium py-2">Android · Chrome</summary><ol className="list-decimal ml-5 space-y-2 text-sm text-slate-600"><li>Open Neko Pulse in Chrome.</li><li>Tap the three-dot menu, then Add to home screen or Install app.</li><li>Follow the confirmation prompt, then open the Neko Pulse icon and sign in.</li></ol><a className="text-sm text-emerald-800 underline block mt-3" href="https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&amp;hl=en-GB" target="_blank" rel="noreferrer">Google installation guide</a></details>
    <p className="text-xs text-slate-500 mt-3">Menu wording varies by browser version. If the option is missing, open the link in Safari or Chrome rather than an in-app browser. Adding an icon does not grant access or keep you signed in forever.</p>
  </section>;
}

export const WorkspaceWelcome: React.FC<{ storageKey: string; onOpenModule?: (module: string) => void }> = ({ storageKey, onOpenModule }) => {
  const [done, setDone] = useState<string[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(saved) ? saved.filter(id => setupSteps.some(step => step.id === id)) : []; } catch { return []; }
  });
  const [saveError, setSaveError] = useState('');
  const toggle = (id: string) => {
    const next = done.includes(id) ? done.filter(item => item !== id) : [...done, id];
    setDone(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setSaveError(''); } catch { setSaveError('Your browser could not save progress. These ticks will last only for this session.'); }
  };
  return <section className="rounded-2xl border border-[#ded9ce] bg-[#fffdf9] p-5 my-5">
    <h2 className="text-xl font-semibold text-[#123229]">Make your workspace ready</h2>
    <div className="mt-3 flex flex-wrap gap-3"><a href="/guides/neko-pulse-user-guide.pdf" target="_blank" rel="noreferrer" className="inline-flex items-center min-h-11 rounded-xl bg-[#063b2c] px-4 py-2 text-white font-semibold text-sm">View user guide (PDF)</a><a href="/guides/neko-pulse-user-guide.pdf" download="neko-pulse-user-guide.pdf" className="inline-flex items-center min-h-11 px-3 py-2 underline text-emerald-800 text-sm">Download guide</a></div>
    <p className="text-xs text-slate-500 mt-2">Illustrated owner, manager and crew instructions. Opens in a new tab. If your phone does not show the PDF, use Download guide.</p>
    <p className="text-sm text-slate-500 mt-1">{done.length} of {setupSteps.length} steps checked. Manual checklist saved on this device; it does not verify your setup or change operational records.</p>
    <progress className="w-full mt-3 accent-emerald-700" value={done.length} max={setupSteps.length} aria-label="Workspace setup progress" />
    <div className="mt-3 space-y-3">{setupSteps.map(step => <div key={step.id} className="rounded-xl bg-white border border-[#e7e2d9] p-3"><label className="flex gap-3 items-center cursor-pointer min-h-11"><input type="checkbox" checked={done.includes(step.id)} onChange={() => toggle(step.id)} className="w-5 h-5 accent-emerald-700" /><span className="font-medium">{step.title}</span></label><p className="ml-8 text-sm text-slate-600">{step.detail}</p>{onOpenModule && <button type="button" onClick={() => onOpenModule(step.module)} className="ml-8 mt-2 min-h-11 text-sm font-semibold text-emerald-800 underline">Open {step.title.toLowerCase()}</button>}</div>)}</div>
    {saveError && <p role="alert" className="text-sm text-amber-800 mt-3">{saveError}</p>}
    <MobileInstallGuide />
  </section>;
}
