import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, CirclePlus, Globe2, Loader2, ShieldCheck, Store } from 'lucide-react';
import { Button, Card, Input } from '../../../components/SharedComponents';
import { PlatformTenant } from '../../../types';
import { platformTenantService } from '../../../services/platformTenantService';

const emptyDraft = () => ({
  name: '', slug: '', timezone: 'Asia/Kolkata', ownerName: '', ownerEmail: '', ownerPassword: '',
  outletsText: '',
});

export const PlatformAdminView: React.FC = () => {
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [details, setDetails] = useState<any>(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const openDetails = async (tenantId: string) => {
    setDetails(null); setError(''); setSupportLoading(true);
    try { setDetails(await platformTenantService.details(tenantId)); }
    catch (reason: any) { setError(reason.message || 'Could not load business details.'); }
    finally { setSupportLoading(false); }
  };
  const resetOwner = async () => {
    if (!details || !window.confirm(`Send a password-reset email to ${details.owner.email}? This does not change the password until the owner completes the reset.`)) return;
    setSupportLoading(true); setError(''); setMessage('');
    try { const result = await platformTenantService.resetOwnerPassword(details.id); setMessage(result.message); }
    catch (reason: any) { setError(reason.message || 'Reset request failed.'); }
    finally { setSupportLoading(false); }
  };

  const load = async () => {
    setLoading(true);
    try { setTenants(await platformTenantService.list()); }
    catch (reason: any) { setError(reason.message || 'Could not load tenants.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const parsedOutlets = useMemo(() => draft.outletsText.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const [name, address] = line.split('|').map(value => value.trim());
    return { name, address };
  }), [draft.outletsText]);

  const update = (key: keyof typeof draft, value: string) => setDraft(current => ({ ...current, [key]: value }));
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setMessage(''); setSaving(true);
    try {
      const result = await platformTenantService.create({
        name: draft.name, slug: draft.slug, timezone: draft.timezone, ownerName: draft.ownerName,
        ownerEmail: draft.ownerEmail, ownerPassword: draft.ownerPassword || undefined, outlets: parsedOutlets,
      });
      setTenants(current => [result.tenant, ...current]);
      setMessage(`${result.tenant.name} is ready. The owner can now sign in using the usual Neko Pulse URL.`);
      setDraft(emptyDraft());
    } catch (reason: any) { setError(reason.message || 'Tenant creation failed.'); }
    finally { setSaving(false); }
  };

  return <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
    <section className="rounded-2xl bg-[#063b2c] text-white p-6 md:p-8 shadow-[0_18px_42px_rgba(6,59,44,0.18)]">
      <div className="flex items-start gap-4"><div className="p-3 rounded-xl bg-white/10"><ShieldCheck className="w-7 h-7" /></div><div>
        <p className="text-xs font-bold tracking-[.18em] uppercase text-[#b9ddc8]">Platform administration</p>
        <h2 className="text-2xl md:text-3xl font-semibold neko-display mt-1">Businesses on Neko Pulse</h2>
        <p className="mt-2 text-sm text-[#d6e8dc] max-w-2xl">Create a business, its first owner, and its outlets in one controlled step. A business owner remains restricted to that business.</p>
      </div></div>
    </section>

    {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 flex gap-3"><CheckCircle2 className="w-5 h-5 shrink-0" />{message}</div>}
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>}
    <Card title="Business support">
      <p className="text-sm text-slate-500 mb-3">Inspect owner access without entering the business or impersonating its staff.</p>
      <label className="block text-sm font-semibold">Select business<select className="block w-full border rounded-xl p-3 mt-2" defaultValue="" disabled={supportLoading || loading} onChange={e => { if (e.target.value) openDetails(e.target.value); else setDetails(null); }}><option value="">Choose a business</option>{tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>
      {supportLoading && <p role="status" className="mt-3">Loading support request…</p>}
      {details && <div className="mt-4 space-y-3">
        <h3 className="font-bold">{details.name} · {details.status}</h3>
        <p>Owner: {details.owner.name} · {details.owner.email}</p>
        <p className="text-sm">Login: {details.owner.disabled ? 'Disabled' : 'Enabled'} · Email: {details.owner.emailVerified ? 'Verified' : 'Not verified'}</p>
        <ul className="text-sm space-y-1">{Object.entries(details.diagnostics).map(([key, value]) => <li key={key}>{({ membershipActive: 'Active membership', ownerRole: 'Owner membership role', profileLinked: 'Active profile linked to business', emailMatches: 'Business email matches login' } as Record<string, string>)[key]}: {value ? 'OK' : 'Needs attention'}</li>)}</ul>
        <p className="text-sm">Subscription: {details.subscription.status}{details.subscription.trialEndsAt ? ` · Trial ends ${new Date(details.subscription.trialEndsAt).toLocaleDateString()}` : ''}</p>
        <p className="text-sm">Outlets: {details.outlets.map((outlet: any) => `${outlet.name} (${outlet.active ? 'Active' : 'Closed'})`).join(', ') || 'None'}</p>
        <Button className="!w-auto" variant="secondary" disabled={supportLoading || details.owner.disabled || !details.diagnostics.membershipActive || !details.diagnostics.ownerRole || !details.diagnostics.profileLinked} onClick={resetOwner}>Send owner password-reset email</Button>
        <p className="text-xs text-slate-500">The owner chooses their own password. Requests are recorded and limited to one per minute. No passwords or reset links are displayed here.</p>
      </div>}
    </Card>

    <div className="grid lg:grid-cols-[1.15fr_.85fr] gap-6 items-start">
      <Card title="Create a new business">
        <form className="space-y-5" onSubmit={create}>
          <div className="grid md:grid-cols-2 gap-4"><Field label="Business name"><Input value={draft.name} onChange={e => update('name', e.target.value)} placeholder="Example Café" required /></Field><Field label="Tenant identifier"><Input value={draft.slug} onChange={e => update('slug', e.target.value.toLowerCase())} placeholder="example-cafe" required /></Field></div>
          <Field label="Timezone"><Input value={draft.timezone} onChange={e => update('timezone', e.target.value)} placeholder="Asia/Kolkata" required /></Field>
          <div className="pt-2 border-t border-[#eeeae2]"><p className="text-sm font-bold text-[#123229]">First business owner</p><p className="text-xs text-slate-500 mt-1">This is the owner inside the new business—not a platform administrator.</p></div>
          <div className="grid md:grid-cols-2 gap-4"><Field label="Owner name"><Input value={draft.ownerName} onChange={e => update('ownerName', e.target.value)} required /></Field><Field label="Owner email"><Input type="email" value={draft.ownerEmail} onChange={e => update('ownerEmail', e.target.value)} required /></Field></div>
          <Field label="Temporary password for a new account"><Input type="password" value={draft.ownerPassword} onChange={e => update('ownerPassword', e.target.value)} minLength={12} placeholder="At least 12 characters" /><p className="text-xs text-slate-500 mt-1">Required only if this email does not already have a Neko Pulse account. Share it securely; it is never shown again.</p></Field>
          <Field label="Outlets"><textarea className="w-full px-4 py-3 rounded-xl bg-[#faf9f6] border border-[#e7e2d9] focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-900/10 focus:border-[#0b6b4d] min-h-28" value={draft.outletsText} onChange={e => update('outletsText', e.target.value)} placeholder={'One outlet per line\nB6 Market | Deer Park, New Delhi\nSafdarjung | Safdarjung Enclave, New Delhi'} required /><p className="text-xs text-slate-500 mt-1">Write one outlet per line. Add an address after a <code>|</code> if useful.</p></Field>
          <Button isLoading={saving} disabled={!parsedOutlets.length}><CirclePlus className="w-4 h-4" /> Create tenant</Button>
        </form>
      </Card>
      <Card title={`Businesses (${tenants.length})`}>
        {loading ? <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-700" /></div> : tenants.length ? <div className="space-y-3">{tenants.map(tenant => <div key={tenant.id} className="border border-[#eeeae2] rounded-xl p-4 bg-[#faf9f6]"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-[#123229]">{tenant.name}</p><p className="text-xs text-slate-500 mt-1">{tenant.slug} · {tenant.timezone}</p></div><span className={`text-[10px] font-bold px-2 py-1 rounded-full ${tenant.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{tenant.status}</span></div><div className="flex gap-4 mt-3 text-xs text-slate-600"><span className="flex items-center gap-1"><Store className="w-3.5 h-3.5" />{tenant.outletCount ?? 0} outlets</span><span className="flex items-center gap-1"><Globe2 className="w-3.5 h-3.5" />{tenant.ownerEmail || 'Owner configured'}</span></div></div>)}</div> : <div className="py-10 text-center text-slate-500"><Building2 className="w-8 h-8 mx-auto mb-3 text-slate-300" />No businesses have been created yet.</div>}
      </Card>
    </div>
  </main>;
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block"><span className="text-xs font-bold tracking-wide uppercase text-slate-500 mb-2 block">{label}</span>{children}</label>;
