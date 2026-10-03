import React, { useState } from 'react';
import { auth } from '../firebaseConfig';
import { trialSignupService } from '../services/trialSignupService';
import { Button, Input } from './SharedComponents';

export const TrialSignupView: React.FC = () => {
  const [stage, setStage] = useState<'START' | 'VERIFY' | 'ACTIVATE' | 'DONE'>('START');
  const [form, setForm] = useState({ name: '', slug: '', ownerName: '', email: '', password: '', outlets: '', timezone: 'Asia/Kolkata' });
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  const start = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const credential = await auth.createUserWithEmailAndPassword(form.email.trim(), form.password);
      await credential.user?.updateProfile({ displayName: form.ownerName.trim() });
      await trialSignupService.reserve({ name: form.name, slug: form.slug, timezone: form.timezone, outlets: form.outlets.split('\n').map(line => line.trim()).filter(Boolean).map(line => { const [name, address] = line.split('|').map(value => value.trim()); return { name, address }; }) });
      await credential.user?.sendEmailVerification(); await auth.signOut(); setStage('VERIFY');
    } catch (reason: any) { setError(reason.message || 'Could not start your trial.'); } finally { setLoading(false); }
  };
  const activate = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try { await auth.signInWithEmailAndPassword(form.email.trim(), form.password); await trialSignupService.activate(); setStage('DONE'); }
    catch (reason: any) { setError(reason.message || 'Could not activate your trial.'); } finally { setLoading(false); }
  };
  const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => <label className="block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 block">{label}</span><Input type={type} value={form[key]} onChange={e => update(key, e.target.value)} placeholder={placeholder} required /></label>;
  return <main className="min-h-screen neko-shell flex items-center justify-center p-5"><section className="w-full max-w-xl bg-[#fffdf9] rounded-3xl border border-[#e7e2d9] p-6 md:p-9 shadow-xl"><p className="neko-eyebrow">Neko Pulse for restaurants</p><h1 className="text-3xl font-semibold text-[#123229] mt-2">Start your 30-day trial.</h1><p className="text-slate-500 mt-2">No payment details now. Verify your email, then set up your first outlet.</p>{error && <p className="mt-5 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</p>}
    {stage === 'START' && <form className="space-y-4 mt-7" onSubmit={start}>{field('Restaurant or business name', 'name', 'text', 'Example Café')}{field('Tenant identifier', 'slug', 'text', 'example-cafe')}<div className="grid md:grid-cols-2 gap-4">{field('Your name', 'ownerName')}{field('Work email', 'email', 'email')}</div>{field('Create password', 'password', 'password', 'At least 6 characters')}<label className="block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 block">Outlets</span><textarea value={form.outlets} onChange={e => update('outlets', e.target.value)} placeholder={'One outlet per line\nMain Café | New Delhi'} required className="w-full min-h-24 p-3 rounded-xl border border-[#e7e2d9] bg-[#faf9f6]" /></label><Button isLoading={loading}>Create trial account</Button></form>}
    {stage === 'VERIFY' && <div className="mt-7 space-y-5"><p className="p-4 rounded-xl bg-emerald-50 text-emerald-800">Check your email and verify your address. Then return here and activate your trial.</p><Button variant="secondary" onClick={() => setStage('ACTIVATE')}>I verified my email</Button></div>}
    {stage === 'ACTIVATE' && <form className="space-y-4 mt-7" onSubmit={activate}>{field('Work email', 'email', 'email')}{field('Password', 'password', 'password')}<Button isLoading={loading}>Activate my trial</Button></form>}
    {stage === 'DONE' && <div className="mt-7 p-5 rounded-xl bg-emerald-50 text-emerald-900"><p className="font-bold">Your 30-day trial is active.</p><p className="text-sm mt-1">Continue to Neko Pulse to begin setting up your restaurant.</p><Button className="mt-4 !w-auto" onClick={() => { window.location.href = '/'; }}>Open Neko Pulse</Button></div>}
  </section></main>;
};
