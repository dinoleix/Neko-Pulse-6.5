import { notScannedAttendance } from '../utils/notScannedAttendance.js';

export const businessDate = (date: Date, timezone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export const previousDate = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
export function midnight(date: string, timezone: string) {
  const target = Date.parse(`${date}T00:00:00Z`);
  let value = target;
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
    const p = Object.fromEntries(parts.map(p => [p.type, p.value]));
    value += target - Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  }
  return new Date(value);
}
export const emailAdmin = (membership: any, profile: any, tenantId: string) => membership?.active === true && membership.tenantId === tenantId && ['OWNER', 'ADMINISTRATOR'].includes(membership.personType) && profile?.tenantId === tenantId && profile.active !== false;
export function deliveryDecision(old: any, test: boolean, now = Date.now()) {
  if (old?.status === 'ACCEPTED' && !test) return 'SKIP';
  if (old?.startedAt?.toMillis() > now - (test ? 60000 : 120000)) return 'SKIP';
  if (!test && old?.firstAttemptAt?.toMillis() < now - 23 * 3600000) return 'REVIEW';
  return 'SEND';
}
export function validateEmailSettings(input: any, outletIds: string[]) {
  const recipients = [...new Set(String(input.recipients || '').split(/[,;\n]/).map(e => e.trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length || recipients.length > 10 || recipients.some(e => e.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e))) throw new Error('Enter 1–10 valid recipient email addresses.');
  if (input.sendTime !== '06:00') throw new Error('Choose a sending time of 06:00 for the daily scheduler.');
  const selected = Array.isArray(input.outletIds) ? [...new Set(input.outletIds)] as string[] : [];
  if (selected.some(id => !outletIds.includes(id))) throw new Error('Select valid active stores.');
  return { enabled: input.enabled === true, recipients, sendTime: input.sendTime, outletIds: selected };
}
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function buildAttendanceEmail(data: { crew: any[]; logs: any[]; assignments: any[]; leaves: any[]; stores: any[] }, date: string, timezone: string, now = new Date()) {
  const missing = notScannedAttendance(data.assignments, data.logs, data.crew, data.leaves, date, date, timezone, now);
  const time = (d?: Date) => d ? new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d) + (businessDate(d, timezone) !== date ? ' (+1 day)' : '') : '—';
  const rows: any[] = [];
  for (const person of data.crew) {
    const ids = new Set([person.id, person.authUid].filter(Boolean));
    const logs = data.logs.filter(l => ids.has(l.crewId)).map(l => ({ ...l, at: l.timestamp?.toDate ? l.timestamp.toDate() : new Date(l.timestamp) })).sort((a, b) => +a.at - +b.at);
    const perStore = new Map<string, any>();
    const row = (id: string) => {
      if (!perStore.has(id)) perStore.set(id, { employee: person.crewName, outletId: id, first: undefined, last: undefined, minutes: 0, issues: [] as string[], sessions: 0 });
      return perStore.get(id);
    };
    let open: any;
    for (const log of logs) {
      if (log.type === 'CHECK_IN') {
        if (open && businessDate(open.at, timezone) === date) row(open.outletId).issues.push('Missing check-out');
        open = log;
        if (businessDate(log.at, timezone) === date) row(log.outletId).first ??= log.at;
      } else if (log.type === 'CHECK_OUT') {
        if (open) {
          if (businessDate(open.at, timezone) === date) {
            const r = row(open.outletId);
            if (log.outletId !== open.outletId || +log.at - +open.at > 86400000) r.issues.push('Review scan pairing');
            else { r.minutes += Math.floor((+log.at - +open.at) / 60000); r.last = log.at; r.sessions++; }
          }
          open = undefined;
        } else if (businessDate(log.at, timezone) === date) row(log.outletId).issues.push('Check-out without check-in');
      }
    }
    if (open && businessDate(open.at, timezone) === date) row(open.outletId).issues.push('Still checked in / missing check-out');
    for (const a of missing.filter(a => ids.has(a.crewId))) row(a.outletId).issues.push('Not Scanned');
    if (!perStore.size && person.active !== false && (!person.dateOfLeaving || person.dateOfLeaving > date) && (!person.dateOfJoining || person.dateOfJoining <= date)) {
      const a = data.assignments.find(a => ids.has(a.crewId) && a.date === date);
      const leave = data.leaves.some(l => ids.has(l.crewId) && l.status === 'APPROVED' && l.startDate <= date && l.endDate >= date);
      row(a?.outletId || person.outletId).issues.push(leave ? 'Approved leave' : a?.isDayOff ? 'Day off' : a ? 'Shift not started / no scan' : 'Not scheduled');
    }
    for (const r of perStore.values()) if (data.stores.some(s => s.outletId === r.outletId)) rows.push({ ...r, first: time(r.first), last: time(r.last), duration: r.sessions ? `${Math.floor(r.minutes / 60)}h ${r.minutes % 60}m` : '—', status: [...new Set(r.issues)].join('; ') || 'Checked out' });
  }
  const groups = data.stores.map(s => ({ name: s.name || s.outletId, rows: rows.filter(r => r.outletId === s.outletId) }));
  const scheduled = new Set(data.assignments.filter(a => a.date === date && !a.isDayOff && data.stores.some(s => s.outletId === a.outletId)).map(a => `${a.crewId}/${a.outletId}`)).size;
  const summary = `${scheduled} scheduled employee/store assignments · ${rows.filter(r => r.first !== '—').length} checked in · ${rows.filter(r => r.status === 'Checked out').length} checked out · ${rows.filter(r => r.status.includes('Still checked in')).length} still checked in · ${rows.filter(r => r.status.includes('Not Scanned')).length} not scanned · ${rows.filter(r => /missing|Review|without/.test(r.status)).length} need review`;
  const text = `${date} · ${timezone}\n${summary}\n\n` + groups.map(g => `${g.name}\nEmployee | In | Out | Completed hours | Status\n${g.rows.map(r => `${r.employee} | ${r.first} | ${r.last} | ${r.duration} | ${r.status}`).join('\n')}`).join('\n\n') + '\n\nHours sum completed sessions only. Overnight sessions belong to their check-in date. Not Scanned means a scheduled shift started with no recorded event; it is not confirmed absence. Generated ' + now.toISOString();
  const html = `<h1>Daily attendance · ${escape(date)}</h1><p>${escape(timezone)} · ${escape(summary)}</p>${groups.map(g => `<h2>${escape(g.name)}</h2><table cellpadding="8" style="border-collapse:collapse;width:100%;text-align:left" border="1"><tr><th>Employee</th><th>In</th><th>Out</th><th>Completed hours</th><th>Status</th></tr>${g.rows.map(r => `<tr>${[r.employee, r.first, r.last, r.duration, r.status].map(v => `<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</table>`).join('')}<p>Hours sum completed sessions only. Overnight sessions belong to their check-in date. Not Scanned is not confirmed absence. Generated ${escape(now.toISOString())}.</p>`;
  return { rows, text, html, date, timezone };
}
