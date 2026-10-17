import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { buildAttendanceEmail, businessDate, previousDate, midnight, emailAdmin, validateEmailSettings, deliveryDecision } from '../server/attendanceEmailReport.js';
export const config = { maxDuration: 300 };

function admin() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('Server credentials unavailable.');
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return getFirestore();
}
const defaults = { enabled: false, recipients: [], outletIds: [], sendTime: '06:00' };
async function context(db: ReturnType<typeof getFirestore>, tenantId: string) {
  const [settings, stores, config, tenant] = await Promise.all([
    db.collection('attendanceEmailSettings').doc(tenantId).get(),
    db.collection('stores').where('tenantId', '==', tenantId).get(),
    db.collection('tenantSettings').doc(tenantId).collection('config').doc('appConfig').get(),
    db.collection('tenants').doc(tenantId).get(),
  ]);
  const timezone = config.data()?.timezone || tenant.data()?.timezone || 'Asia/Kolkata';
  new Intl.DateTimeFormat('en', { timeZone: timezone });
  return { settings: { ...defaults, ...settings.data() }, stores: stores.docs.map(d => ({ ...d.data(), id: d.id } as any)).filter(s => s.isActive !== false && s.active !== false), timezone, tenant: tenant.data() };
}
async function report(db: ReturnType<typeof getFirestore>, tenantId: string, ctx: Awaited<ReturnType<typeof context>>, date: string) {
  const start = midnight(previousDate(date), ctx.timezone);
  const end = midnight(new Date(Date.parse(`${date}T12:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10), ctx.timezone);
  const query = (name: string) => db.collection(name).where('tenantId', '==', tenantId);
  const [crew, logs, assignments, leaves] = await Promise.all([
    query('crew').get(), query('attendanceLogs').where('timestamp', '>=', start).where('timestamp', '<', end).get(),
    query('shiftAssignments').where('date', '==', date).get(),
    query('leaveRequests').get(),
  ]);
  const map = (s: any) => s.docs.map((d: any) => ({ ...d.data(), id: d.id }));
  const stores = ctx.stores.filter(s => !ctx.settings.outletIds.length || ctx.settings.outletIds.includes(s.outletId));
  const content = buildAttendanceEmail({ crew: map(crew), logs: map(logs), assignments: map(assignments), leaves: map(leaves), stores }, date, ctx.timezone);
  if (process.env.APP_PUBLIC_URL) {
    const url = new URL(process.env.APP_PUBLIC_URL);
    if (url.protocol === 'https:' && !url.username && !url.password) {
      url.search = ''; url.hash = '';
      content.text += `\nOpen Attendance & Leaves → Reports: ${url.href}`;
      // URL comes only from trusted server configuration; escape attribute characters.
      content.html += `<p><a href="${url.href.replace(/[&"<>']/g, c => `&#${c.charCodeAt(0)};`)}">Open Neko Pulse → Attendance &amp; Leaves → Reports</a></p>`;
    }
  }
  return content;
}
async function deliver(db: ReturnType<typeof getFirestore>, tenantId: string, ctx: Awaited<ReturnType<typeof context>>, date: string, test: boolean, actor: string) {
  if (!process.env.RESEND_API_KEY || !(process.env.ATTENDANCE_EMAIL_FROM || process.env.TRIAL_EMAIL_FROM)) throw new Error('Email sender is not configured.');
  if (!ctx.settings.recipients.length) throw new Error('Save recipients first.');
  const freshContent = await report(db, tenantId, ctx, date);
  const ref = db.collection('attendanceEmailDeliveries').doc(`${tenantId}_${date}${test ? '_test' : ''}`);
  const claimed = await db.runTransaction(async tx => {
    const old = (await tx.get(ref)).data();
    const decision = deliveryDecision(old, test);
    if (decision === 'SKIP') return false;
    // Resend deduplicates for 24 hours. Never retry an ambiguous old attempt
    // automatically outside that window: an administrator must investigate it.
    if (decision === 'REVIEW') throw new Error('Old delivery requires review before retrying.');
    tx.set(ref, { tenantId, date, actor, test, status: 'SENDING', startedAt: FieldValue.serverTimestamp(), firstAttemptAt: old?.firstAttemptAt || FieldValue.serverTimestamp(), payload: !test && old?.payload ? old.payload : { recipients: ctx.settings.recipients, subject: `${test ? '[TEST] ' : ''}${ctx.tenant?.name || 'Neko Pulse'} attendance · ${date}`, text: freshContent.text, html: freshContent.html, from: process.env.ATTENDANCE_EMAIL_FROM || process.env.TRIAL_EMAIL_FROM } }, { merge: true });
    return true;
  });
  if (!claimed) return { message: 'Already sent or sending. Test emails have a one-minute cooldown.' };
  try {
    const payload = (await ref.get()).data()!.payload;
    const key = `${tenantId}/${date}/${test ? Date.now() : 'daily'}`;
    // Separate requests keep recipients private from one another.
    for (const recipient of payload.recipients) {
      const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `attendance/${key}/${recipient}` }, body: JSON.stringify({ from: payload.from, to: [recipient], subject: payload.subject, text: payload.text, html: payload.html }), signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Email provider did not accept the report.');
    }
    await ref.set({ status: 'ACCEPTED', completedAt: FieldValue.serverTimestamp(), recipientCount: payload.recipients.length }, { merge: true });
    return { message: 'Email provider accepted the report. Inbox delivery is not yet confirmed.' };
  } catch (error) {
    await ref.set({ status: 'FAILED', completedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw error;
  }
}
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
    const isCron = req.method === 'GET' && req.query?.cron === '1';
    if (isCron) {
      if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorised.' });
      const db = admin();
      const settings = await db.collection('attendanceEmailSettings').where('enabled', '==', true).get();
      const results = [];
      for (const doc of settings.docs) {
        try {
          const ctx = await context(db, doc.id);
          if (!ctx.tenant || ctx.tenant.status?.toLowerCase() !== 'active') continue;
          results.push({ tenantId: doc.id, ...await deliver(db, doc.id, ctx, previousDate(businessDate(new Date(), ctx.timezone)), false, 'scheduler') });
        } catch { results.push({ tenantId: doc.id, error: 'Delivery failed; inspect delivery history.' }); }
      }
      return res.status(200).json({ results });
    }
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Sign in required.' });
    const db = admin();
    const actor = await getAuth().verifyIdToken(token, true);
    const members = await db.collection('tenantMemberships').where('uid', '==', actor.uid).where('active', '==', true).limit(2).get();
    if (members.size !== 1) return res.status(403).json({ error: 'A single active business administrator membership is required.' });
    const member = members.docs[0].data();
    const profile = (await db.collection('managers').doc(member.personId || actor.uid).get()).data();
    if (!emailAdmin(member, profile, member.tenantId)) return res.status(403).json({ error: 'Only business owners and administrators can manage attendance emails.' });
    const ctx = await context(db, member.tenantId);
    const date = previousDate(businessDate(new Date(), ctx.timezone));
    if (req.method === 'GET') {
      const refs = [];
      let historyDate = date;
      for (let i = 0; i < 5; i++) {
        for (const suffix of ['', '_test']) refs.push(db.collection('attendanceEmailDeliveries').doc(`${member.tenantId}_${historyDate}${suffix}`));
        historyDate = previousDate(historyDate);
      }
      const history = await db.getAll(...refs);
      return res.json({ settings: ctx.settings, timezone: ctx.timezone, stores: ctx.stores.map(s => ({ outletId: s.outletId, name: s.name })), senderReady: !!(process.env.RESEND_API_KEY && (process.env.ATTENDANCE_EMAIL_FROM || process.env.TRIAL_EMAIL_FROM)), schedulerReady: !!process.env.CRON_SECRET, history: history.filter(d => d.exists).map(d => ({ date: d.data()!.date, status: d.data()!.status, test: d.data()!.test })) });
    }
    if (req.body?.action === 'save') {
      const settings = validateEmailSettings(req.body.settings, ctx.stores.map(s => s.outletId));
      await db.collection('attendanceEmailSettings').doc(member.tenantId).set({ ...settings, tenantId: member.tenantId, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
      return res.json({ message: 'Attendance email settings saved.' });
    }
    if (req.body?.action === 'preview') return res.json({ report: await report(db, member.tenantId, ctx, date) });
    if (['test', 'send'].includes(req.body?.action)) return res.json(await deliver(db, member.tenantId, ctx, date, req.body.action === 'test', actor.uid));
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (error) {
    console.error('Attendance email failed', (error as any)?.code || 'operation-failed');
    const message = error instanceof Error ? error.message : '';
    const expected = /^(Enter 1–10 valid recipient|Choose a sending time|Select valid active stores|Email sender is not configured\.|Save recipients first\.|Old delivery requires review|Email provider did not accept)/.test(message);
    return res.status(400).json({ error: expected ? message : 'Attendance email unavailable. Check server configuration and indexes.' });
  }
}
