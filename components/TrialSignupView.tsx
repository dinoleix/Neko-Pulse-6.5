import React, { useState } from 'react';
import { auth } from '../firebaseConfig';
import { trialSignupService } from '../services/trialSignupService';
import { Button, Input } from './SharedComponents';
import { WorkspaceWelcome } from './WorkspaceWelcome';

export const TrialSignupView: React.FC = () => {
  const [stage, setStage] = useState<'START' | 'VERIFY' | 'ACTIVATE' | 'DONE'>(() => new URLSearchParams(window.location.search).get('activate') === '1' ? 'ACTIVATE' : 'START');
  const [form, setForm] = useState({ name: '', slug: '', ownerName: '', email: '', password: '', outlets: '', timezone: 'Asia/Kolkata' });
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const [activation, setActivation] = useState<{ tenantId: string; trialEndsAt: string; welcomeEmailStatus: string } | null>(null);
  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  const start = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const credential = await auth.createUserWithEmailAndPassword(form.email.trim(), form.password);
      await credential.user?.updateProfile({ displayName: form.ownerName.trim() });
      await trialSignupService.reserve({ name: form.name, slug: form.slug, timezone: form.timezone, outlets: form.outlets.split('\n').map(line => line.trim()).filter(Boolean).map(line => { const [name, address] = line.split('|').map(value => value.trim()); return { name, address }; }) });
      await credential.user?.sendEmailVerification({ url: `${window.location.origin}/?trial=1&activate=1` }); await auth.signOut(); setStage('VERIFY');
    } catch (reason: any) { setError(reason.message || 'Could not start your trial.'); } finally { setLoading(false); }
  };
  const activate = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try { await auth.signInWithEmailAndPassword(form.email.trim(), form.password); const result = await trialSignupService.activate(); setActivation(result); setStage('DONE'); }
    catch (reason: any) { setError(reason.message || 'Could not activate your trial.'); } finally { setLoading(false); }
  };
  const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => <label className="block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 block">{label}</span><Input type={type} value={form[key]} onChange={e => update(key, e.target.value)} placeholder={placeholder} required /></label>;
  return <main className="min-h-screen neko-shell flex items-center justify-center p-5"><section className="w-full max-w-xl bg-[#fffdf9] rounded-3xl border border-[#e7e2d9] p-6 md:p-9 shadow-xl"><p className="neko-eyebrow">Neko Pulse for restaurants</p><h1 className="text-3xl font-semibold text-[#123229] mt-2">Start your 30-day trial.</h1><p className="text-slate-500 mt-2">No payment details now. Verify your email, then set up your first outlet.</p>{error && <p className="mt-5 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</p>}
    {stage === 'START' && <form className="space-y-4 mt-7" onSubmit={start}>{field('Restaurant or business name', 'name', 'text', 'Example Café')}{field('Tenant identifier', 'slug', 'text', 'example-cafe')}<div className="grid md:grid-cols-2 gap-4">{field('Your name', 'ownerName')}{field('Work email', 'email', 'email')}</div>{field('Create password', 'password', 'password', 'At least 6 characters')}<label className="block"><span className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 block">Outlets</span><textarea value={form.outlets} onChange={e => update('outlets', e.target.value)} placeholder={'One outlet per line\nMain Café | New Delhi'} required className="w-full min-h-24 p-3 rounded-xl border border-[#e7e2d9] bg-[#faf9f6]" /></label><Button isLoading={loading}>Create trial account</Button></form>}
    {stage === 'START' && <button type="button" className="mt-4 min-h-11 text-sm underline text-emerald-800" onClick={() => setStage('ACTIVATE')}>Already registered? Activate your verified account</button>}
    {stage === 'VERIFY' && <div className="mt-7 space-y-5"><p className="p-4 rounded-xl bg-emerald-50 text-emerald-800">Check your email and verify your address. Check spam if needed. Then return here and activate your trial using the email and password you created.</p><Button variant="secondary" onClick={() => setStage('ACTIVATE')}>I verified my email</Button></div>}
    {stage === 'ACTIVATE' && <form className="space-y-4 mt-7" onSubmit={activate}>{field('Work email', 'email', 'email')}{field('Password', 'password', 'password')}<Button isLoading={loading}>Activate my trial</Button></form>}
    {stage === 'DONE' && activation && <div className="mt-7"><div className="p-5 rounded-xl bg-emerald-50 text-emerald-900"><h2 className="font-bold">Your workspace is ready.</h2><p className="text-sm mt-1">Your 30-day trial ends {new Date(activation.trialEndsAt).toLocaleDateString()}. No automatic charge.</p><p className="text-sm mt-2">Your login is {form.email}. Use the password you created. If asked to sign in again, choose Manager sign in.</p><p role="status" className="text-sm mt-2">{activation.welcomeEmailStatus === 'ACCEPTED' ? 'Your welcome email has been accepted for sending. Check your inbox and spam folder.' : 'Your workspace is active, but the welcome email was not sent. Bookmark the app link below; you can start now.'}</p><a href="/" className="underline text-sm block mt-3">App login: {window.location.origin}/</a><Button className="mt-4 !w-auto" onClick={() => { window.location.href = '/'; }}>Open Neko Pulse</Button></div><WorkspaceWelcome storageKey={`neko_setup:${activation.tenantId}:${auth.currentUser?.uid}`} /></div>}
  </section></main>;
};
