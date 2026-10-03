import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

const admin = () => {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('Trial provisioning is not configured.');
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return { auth: getAuth(), db: getFirestore() };
};
const send = (res: any, code: number, body: Record<string, unknown>) => res.status(code).json(body);
const slugify = (text: string) => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const accessConfig = { TASKS: ['Owner', 'Store Manager'], EMPLOYEE: ['Owner'], STORES: ['Owner'], ATTENDANCE: ['Owner', 'Store Manager'], SHIFTS: ['Owner', 'Store Manager'], HR: ['Owner'], REPORTS: ['Owner', 'Store Manager'], EOM: ['Owner', 'Store Manager'], LOGIN_ACTIVITY: ['Owner'], TRAINING: ['Owner', 'Store Manager'], SETTINGS: ['Owner'] };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  // Secure by default. The public page may be deployed, but cannot provision
  // businesses until the operator deliberately enables this server setting.
  if (process.env.SELF_SERVICE_SIGNUP_ENABLED !== 'true') return send(res, 503, { error: 'Self-service trials are not available yet.' });
  try {
    const bearer = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!bearer) return send(res, 401, { error: 'Sign in is required.' });
    const { auth, db } = admin();
    const user = await auth.verifyIdToken(bearer);
    const requestRef = db.collection('trialOnboarding').doc(user.uid);
    if (req.body?.action === 'reserve') {
      const name = String(req.body?.name || '').trim(); const slug = slugify(String(req.body?.slug || name));
      const timezone = String(req.body?.timezone || 'Asia/Kolkata').trim(); const outlets = Array.isArray(req.body?.outlets) ? req.body.outlets : [];
      if (!name || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug) || !outlets.length || outlets.length > 20) return send(res, 400, { error: 'Add a business name, valid tenant identifier, and at least one outlet.' });
      if ((await db.collection('tenants').doc(slug).get()).exists) return send(res, 409, { error: 'That tenant identifier is already in use.' });
      await requestRef.set({ uid: user.uid, ownerEmail: user.email || '', ownerName: user.name || user.email || 'Owner', name, slug, timezone, outlets: outlets.map((item: any) => ({ name: String(item?.name || '').trim(), address: String(item?.address || '').trim() })), status: 'EMAIL_VERIFICATION_PENDING', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: false });
      return send(res, 201, { reserved: true });
    }
    if (req.body?.action !== 'activate') return send(res, 400, { error: 'Invalid trial request.' });
    if (!user.email_verified) return send(res, 403, { error: 'Verify your email address before starting the trial.' });
    const request = (await requestRef.get()).data();
    if (!request || request.uid !== user.uid || request.status !== 'EMAIL_VERIFICATION_PENDING') return send(res, 404, { error: 'No pending trial signup was found.' });
    const existing = await db.collection('tenantMemberships').where('uid', '==', user.uid).where('active', '==', true).limit(1).get();
    if (!existing.empty) return send(res, 409, { error: 'This account already belongs to a business.' });
    const tenantRef = db.collection('tenants').doc(request.slug);
    if ((await tenantRef.get()).exists) return send(res, 409, { error: 'That tenant identifier is no longer available.' });
    const outlets = request.outlets.map((item: any, index: number) => ({ outletId: slugify(item.name), name: item.name, address: item.address || '', index }));
    if (outlets.some((item: any) => !item.outletId) || new Set(outlets.map((item: any) => item.outletId)).size !== outlets.length) return send(res, 400, { error: 'Outlet names must be unique.' });
    const now = FieldValue.serverTimestamp(); const trialEndsAt = Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000); const batch = db.batch();
    batch.create(tenantRef, { name: request.name, slug: request.slug, status: 'ACTIVE', timezone: request.timezone, ownerEmail: user.email, ownerUid: user.uid, outletCount: outlets.length, subscriptionStatus: 'TRIAL_ACTIVE', planId: 'standard_monthly', trialEndsAt, createdAt: now, updatedAt: now });
    batch.create(db.collection('tenantSubscriptions').doc(request.slug), { tenantId: request.slug, status: 'TRIAL_ACTIVE', planId: 'standard_monthly', trialStartedAt: now, trialEndsAt, createdAt: now, updatedAt: now });
    batch.create(db.collection('managers').doc(user.uid), { tenantId: request.slug, authUid: user.uid, crewName: request.ownerName, crewCode: 'OWNER', email: user.email, outletId: outlets[0].outletId, active: true, role: 'Owner', createdAt: now });
    batch.create(db.collection('tenantMemberships').doc(`${request.slug}_${user.uid}`), { tenantId: request.slug, uid: user.uid, personId: user.uid, personType: 'OWNER', role: 'Owner', outletIds: outlets.map((item: any) => item.outletId), allOutlets: true, active: true, createdAt: now, updatedAt: now });
    outlets.forEach((item: any) => batch.create(db.collection('stores').doc(`${request.slug}_${item.outletId}`), { tenantId: request.slug, outletId: item.outletId, name: item.name, address: item.address, isActive: true, sortOrder: item.index, createdAt: now }));
    const config = db.collection('tenantSettings').doc(request.slug).collection('config'); batch.create(config.doc('appConfig'), { timezone: request.timezone, currencySymbol: '₹' }); batch.create(config.doc('attendanceConfig'), { enableQrScan: true, enablePinCode: true, permittedPinCrewIds: [] }); batch.create(config.doc('accessConfig'), accessConfig);
    ['Owner', 'Store Manager', 'Crew'].forEach(role => batch.create(db.collection('tenantSettings').doc(request.slug).collection('roles').doc(slugify(role)), { name: role }));
    batch.set(requestRef, { status: 'ACTIVATED', tenantId: request.slug, activatedAt: now, updatedAt: now }, { merge: true }); await batch.commit();
    return send(res, 201, { tenantId: request.slug, trialEndsAt: trialEndsAt.toDate().toISOString() });
  } catch (error: any) { console.error('Self-service trial failed:', error?.message || error); return send(res, 503, { error: error?.message || 'Trial setup could not be completed.' }); }
}
