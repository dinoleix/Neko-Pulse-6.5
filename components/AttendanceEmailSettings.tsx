import React, { useEffect, useState } from 'react';
import { auth } from '../firebaseConfig';
import { Button, Card } from './SharedComponents';

async function request(action?: string, settings?: any) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please sign in again.');
  const response = await fetch('/api/attendance-email', { method: action ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(action ? { body: JSON.stringify({ action, settings }) } : {}) });
  const result = await response.json().catch(() => ({ error: 'Email settings require the application API server.' }));
  if (!response.ok || result.error) throw new Error(result.error || 'Unable to load email settings.');
  return result;
}
export function AttendanceEmailSettings() {
  const [data, setData] = useState<any>();
  const [settings, setSettings] = useState<any>();
  const [preview, setPreview] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => { const d = await request(); setData(d); setSettings({ ...d.settings, recipients: d.settings.recipients.join('\n') }); };
  useEffect(() => { load().catch(e => setMessage(e.message)); }, []);
  const run = async (action: string) => {
    if (['test', 'send'].includes(action) && !window.confirm(`Send ${action === 'test' ? 'a test' : "yesterday’s"} attendance email to the saved recipients?`)) return;
    setBusy(true); setMessage('');
    try {
      const result = await request(action, settings);
      if (result.report) setPreview(result.report.text);
      else { setMessage(result.message); await load(); }
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  };
  return <Card title="Daily Attendance Email">
    <p className="text-sm text-slate-600 mb-4">Owner/admin only. Reports cover the previous business day and include scheduled staff who have not scanned.</p>
    {message && <p role="status" className="my-3 text-sm whitespace-pre-wrap">{message}</p>}
    {!data ? <Button variant="secondary" onClick={() => load().catch(e => setMessage(e.message))}>Load email settings</Button> : <div className="space-y-4">
      {!data.senderReady && <p className="text-amber-800 text-sm">Email sender is not configured. You can save settings and preview reports; sending requires server email configuration.</p>}
      {!data.schedulerReady && <p className="text-amber-800 text-sm">Daily scheduling needs CRON_SECRET in the server environment. Manual sending is available when the email sender is configured.</p>}
      <label className="flex gap-2 items-center"><input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })}/>Send a daily attendance email</label>
      <label className="block font-semibold text-sm">Recipients (one per line, up to 10)<textarea className="block border rounded-lg p-3 w-full mt-1" rows={3} value={settings.recipients} onChange={e => setSettings({ ...settings, recipients: e.target.value })}/></label>
      <p className="font-semibold text-sm">Daily sending window: 6–7am IST. Report timezone: {data.timezone}.</p>
      <p className="text-xs text-slate-500">The current hosting plan runs once daily. Reports cover the previous business day. Custom sending times need an additional scheduler.</p>
      <fieldset className="space-y-2"><legend className="font-semibold text-sm mb-2">Stores · leave all unchecked for all active stores</legend>{data.stores.map((s: any) => <label key={s.outletId} className="flex gap-2 items-center"><input type="checkbox" checked={settings.outletIds.includes(s.outletId)} onChange={e => setSettings({ ...settings, outletIds: e.target.checked ? [...settings.outletIds, s.outletId] : settings.outletIds.filter((id: string) => id !== s.outletId) })}/>{s.name || s.outletId}</label>)}</fieldset>
      <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => run('save')}>Save settings</Button><Button variant="secondary" disabled={busy} onClick={() => run('preview')}>Preview yesterday</Button><Button variant="secondary" disabled={busy || !data.senderReady} onClick={() => run('test')}>Send test email</Button><Button variant="secondary" disabled={busy || !data.senderReady} onClick={() => run('send')}>Send now</Button></div>
      <p className="text-xs text-slate-500">Preview and send use saved settings. Save changes first. “Send now” sends once per business day; test emails are marked TEST.</p>
      {busy && <p role="status">Working…</p>}
      {preview && <pre className="text-xs bg-slate-50 p-4 rounded-lg overflow-auto whitespace-pre-wrap max-h-96">{preview}</pre>}
      <details><summary className="cursor-pointer font-semibold">Email attempts · last 5 report days</summary>{data.history.length ? data.history.map((h: any, i: number) => <p key={i} className="text-sm py-1">{h.date} · {h.test ? 'Test · ' : ''}{h.status === 'ACCEPTED' ? 'Accepted by email provider' : h.status}</p>) : <p className="text-sm py-2">No emails sent in this period.</p>}</details>
    </div>}
  </Card>;
}
