import React, { useEffect, useState } from 'react';
import { Badge, Button, Card, Input } from '../../../components/SharedComponents';
import type { PlatformTenant, TenantStatus } from '../../../types';
import { platformTenantService } from '../../../services/platformTenantService';
import { Building2, CircleAlert, Plus, RefreshCw, ShieldCheck } from 'lucide-react';

const statusVariant = (status: TenantStatus) => status === 'ACTIVE' ? 'success' : status === 'SUSPENDED' ? 'danger' : 'warning';

export const PlatformTenantAdminView: React.FC = () => {
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ id: '', displayName: '' });

  const load = async () => {
    setLoading(true); setError('');
    try { setTenants(await platformTenantService.list()); }
    catch (err: any) { setError(err.message || 'Could not load the tenant registry.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const register = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try { const tenant = await platformTenantService.register(form); setTenants(current => [...current, tenant].sort((a, b) => a.displayName.localeCompare(b.displayName))); setForm({ id: '', displayName: '' }); }
    catch (err: any) { setError(err.message || 'Could not register the tenant.'); }
    finally { setSaving(false); }
  };

  return <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
    <Card>
      <div className="flex gap-4 items-start"><div className="p-3 bg-[#e6f0e9] rounded-xl text-[#063b2c]"><ShieldCheck /></div><div><p className="neko-eyebrow mb-1">Platform only</p><h2 className="text-2xl font-semibold text-[#123229]">Tenant registry</h2><p className="text-sm text-slate-500 mt-1">Register a business safely. New tenants remain in setup until Phase 2 creates their owner, outlets, and onboarding configuration.</p></div></div>
    </Card>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex gap-2"><CircleAlert className="w-5 h-5 shrink-0"/>{error}</div>}
    <div className="grid lg:grid-cols-[.85fr_1.15fr] gap-6">
      <Card title="Register a business"><form className="space-y-4" onSubmit={register}>
        <div><label className="text-xs font-bold uppercase tracking-wide text-slate-500 block mb-2">Business name</label><Input required value={form.displayName} onChange={event => setForm({ ...form, displayName: event.target.value })} placeholder="Example Café" /></div>
        <div><label className="text-xs font-bold uppercase tracking-wide text-slate-500 block mb-2">Tenant ID</label><Input required value={form.id} onChange={event => setForm({ ...form, id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="example-cafe" /><p className="text-xs text-slate-400 mt-2">Lowercase letters, numbers, and hyphens only. This cannot be renamed later.</p></div>
        <Button isLoading={saving} type="submit" className="!w-auto"><Plus className="w-4 h-4"/>Register tenant</Button>
      </form></Card>
      <Card title="Businesses"><div className="flex justify-end -mt-12 mb-6"><Button variant="outline" onClick={load} isLoading={loading} className="!w-auto !py-2"><RefreshCw className="w-4 h-4"/>Refresh</Button></div>
        {loading ? <p className="text-sm text-slate-500">Loading registry…</p> : tenants.length === 0 ? <div className="text-center py-10 text-slate-500"><Building2 className="w-10 h-10 mx-auto mb-3 text-slate-300"/><p className="font-medium text-slate-700">No platform tenants yet</p><p className="text-sm mt-1">Green Neko will appear here after the platform-admin bootstrap is completed.</p></div> : <div className="divide-y divide-[#eeeae2]">{tenants.map(tenant => <div key={tenant.id} className="py-4 flex items-center justify-between gap-4"><div><p className="font-semibold text-[#123229]">{tenant.displayName}</p><p className="text-xs text-slate-500 mt-1 font-mono">{tenant.id}</p></div><Badge variant={statusVariant(tenant.status)}>{tenant.status === 'SETUP' ? 'Setup pending' : tenant.status}</Badge></div>)}</div>}
      </Card>
    </div>
  </main>;
};
