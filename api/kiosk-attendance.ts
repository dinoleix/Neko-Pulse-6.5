import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

type KioskStore = { outletId: string; name: string };
    const tenantKioskMode = process.env.TENANT_MODE === 'sandbox' || process.env.TENANT_MODE === 'enabled';
    // Compatibility dual-write: preserve legacy kiosk reads until the approved
    // tenant cutover, while attaching the fixed tenant ID to new attendance.
    const legacyWriteTenantId = !tenantKioskMode ? String(process.env.LEGACY_TENANT_ID || '').trim() : '';

const attempts = new Map<string, { failures: number; resetAt: number }>();
const MAX_FAILURES = 8;
const WINDOW_MS = 15 * 60 * 1000;

const send = (res: any, status: number, body: Record<string, unknown>) => res.status(status).json(body);

const getDb = () => {
  if (!getApps().length) {
    // Reuse the existing server-side credential when the project already has
    // one configured. The JSON-specific name remains supported for new setups.
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('Kiosk service is not configured.');
    const serviceAccount = JSON.parse(raw);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
};

const requestKey = (req: any) => String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
const isRateLimited = (key: string) => {
  const item = attempts.get(key);
  if (!item) return false;
  if (item.resetAt <= Date.now()) { attempts.delete(key); return false; }
  return item.failures >= MAX_FAILURES;
};
const recordFailure = (key: string) => {
  const now = Date.now();
  const item = attempts.get(key);
  if (!item || item.resetAt <= now) attempts.set(key, { failures: 1, resetAt: now + WINDOW_MS });
  else item.failures++;
};
const clearFailures = (key: string) => attempts.delete(key);

const indiaDayStart = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return Timestamp.fromDate(new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00+05:30`));
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  const key = requestKey(req);

  try {
    const db = getDb();
    const action = req.body?.action;
    const tenantId = String(req.body?.tenantId || '');
    if (tenantKioskMode && !/^[A-Za-z0-9_-]{1,128}$/.test(tenantId)) {
      return send(res, 400, { error: 'This Time Clock needs a valid business configuration.' });
    }

    if (action === 'config') {
      const [storesSnap, configSnap, appConfigSnap] = await Promise.all([
        (tenantKioskMode ? db.collection('stores').where('tenantId', '==', tenantId) : db.collection('stores')).get(),
        tenantKioskMode ? db.collection('tenantSettings').doc(tenantId).collection('config').doc('attendanceConfig').get() : db.collection('settings').doc('attendanceConfig').get(),
        tenantKioskMode ? db.collection('tenantSettings').doc(tenantId).collection('config').doc('appConfig').get() : db.collection('settings').doc('appConfig').get(),
      ]);
      const stores: KioskStore[] = storesSnap.docs
        .map(doc => doc.data())
        .filter(store => store.isActive !== false && typeof store.outletId === 'string' && typeof store.name === 'string')
        .map(store => ({ outletId: store.outletId, name: store.name }));
      const attendanceSettings = configSnap.exists ? configSnap.data() || {} : {};
      return send(res, 200, {
        stores,
        // Do not return employee IDs or other attendance policy details to a
        // public kiosk. The endpoint enforces those rules during clocking.
        attendanceConfig: {
          enableQrScan: attendanceSettings.enableQrScan !== false,
          enablePinCode: attendanceSettings.enablePinCode !== false,
        },
        timezone: appConfigSnap.exists ? appConfigSnap.data()?.timezone || 'Asia/Kolkata' : 'Asia/Kolkata',
      });
    }

    if (action !== 'clock') return send(res, 400, { error: 'Invalid kiosk request.' });
    if (isRateLimited(key)) return send(res, 429, { error: 'Too many incorrect codes. Please wait 15 minutes and try again.' });

    const crewCode = String(req.body?.crewCode || '');
    const outletId = String(req.body?.outletId || '');
    if (!/^\d{4,6}$/.test(crewCode) || !/^[A-Za-z0-9_-]{1,64}$/.test(outletId)) {
      recordFailure(key);
      return send(res, 400, { error: 'Invalid time-clock request.' });
    }

    const [storeSnap, attendanceConfigSnap] = await Promise.all([
      (tenantKioskMode ? db.collection('stores').where('tenantId', '==', tenantId).where('outletId', '==', outletId) : db.collection('stores').where('outletId', '==', outletId)).limit(1).get(),
      tenantKioskMode ? db.collection('tenantSettings').doc(tenantId).collection('config').doc('attendanceConfig').get() : db.collection('settings').doc('attendanceConfig').get(),
    ]);
    if (storeSnap.empty || storeSnap.docs[0].data().isActive === false) return send(res, 403, { error: 'This store is closed or unavailable.' });

    let crewQuery = db.collection('crew').where('crewCode', '==', crewCode).where('active', '==', true);
    if (tenantKioskMode) crewQuery = crewQuery.where('tenantId', '==', tenantId);
    const crewSnap = await crewQuery.limit(2).get();
    if (crewSnap.size !== 1) {
      recordFailure(key);
      return send(res, 401, { error: 'Crew code not recognised.' });
    }
    const crewDoc = crewSnap.docs[0];
    const crew = crewDoc.data();
    if (crew.outletId !== outletId) {
      recordFailure(key);
      return send(res, 403, { error: 'This crew code is not assigned to this store.' });
    }
    const permittedIds = attendanceConfigSnap.data()?.permittedPinCrewIds || [];
    if (Array.isArray(permittedIds) && permittedIds.length > 0 && !permittedIds.includes(crewDoc.id)) {
      recordFailure(key);
      return send(res, 403, { error: 'Keypad access is restricted for this employee.' });
    }

    let logQuery = db.collection('attendanceLogs').where('crewId', '==', crewDoc.id);
    if (tenantKioskMode) logQuery = logQuery.where('tenantId', '==', tenantId);
    const logSnap = await logQuery.get();
    const todayStart = indiaDayStart();
    const todayLogs = logSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() as any }))
      .filter(log => log.timestamp?.toMillis?.() >= todayStart.toMillis())
      .sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
    const lastLog = todayLogs[todayLogs.length - 1];
    if (lastLog?.timestamp?.toMillis && Date.now() - lastLog.timestamp.toMillis() < 5 * 60 * 1000) {
      return send(res, 429, { error: 'Please wait 5 minutes between scans.' });
    }

    const existingIn = todayLogs.find(log => log.type === 'CHECK_IN');
    const existingOut = todayLogs.find(log => log.type === 'CHECK_OUT');
    const type = existingIn ? 'CHECK_OUT' : 'CHECK_IN';
    if (existingIn && existingOut) {
      await db.collection('attendanceLogs').doc(existingOut.id).update({ timestamp: FieldValue.serverTimestamp(), method: 'PIN' });
    } else {
      await db.collection('attendanceLogs').add({
        crewId: crewDoc.id, crewName: crew.crewName, outletId,
        ...((tenantKioskMode ? tenantId : legacyWriteTenantId) ? { tenantId: tenantKioskMode ? tenantId : legacyWriteTenantId } : {}),
        timestamp: FieldValue.serverTimestamp(), type, method: 'PIN',
      });
    }
    clearFailures(key);
    return send(res, 200, { type, crewName: crew.crewName, occurredAt: new Date().toISOString() });
  } catch (error: any) {
    console.error('Kiosk attendance endpoint failed:', error?.message || error);
    return send(res, 503, { error: 'Time Clock is temporarily unavailable. Please contact a manager.' });
  }
}
