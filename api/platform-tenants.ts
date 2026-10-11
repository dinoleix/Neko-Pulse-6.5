import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { ownerResetEligible } from '../server/platformSupportPolicy.js';

const getAdmin = () => {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('Platform administration is not configured.');
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return { auth: getAuth(), db: getFirestore() };
};

const send = (res: any, status: number, body: Record<string, unknown>) => res.status(status).json(body);
const tenantModeEnabled = () => process.env.TENANT_MODE === 'sandbox' || process.env.TENANT_MODE === 'enabled';
const values = (name: string) => String(process.env[name] || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);

const isPlatformAdmin = (token: any) =>
  token?.platformAdmin === true || values('PLATFORM_ADMIN_EMAILS').includes(String(token?.email || '').toLowerCase()) ||
  values('PLATFORM_ADMIN_UIDS').includes(String(token?.uid || '').toLowerCase());

const slugify = (input: string) => input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const defaultAccessConfig = {
  TASKS: ['Owner', 'Store Manager'],
  EMPLOYEE: ['Owner'],
  STORES: ['Owner'],
  ATTENDANCE: ['Owner', 'Store Manager'],
  SHIFTS: ['Owner', 'Store Manager'],
  HR: ['Owner'],
  REPORTS: ['Owner', 'Store Manager'],
  EOM: ['Owner', 'Store Manager'],
  LOGIN_ACTIVITY: ['Owner'],
  TRAINING: ['Owner', 'Store Manager'],
  SETTINGS: ['Owner'],
};

export default async function handler(req: any, res: any) {
  if (!['GET', 'POST'].includes(req.method)) return send(res, 405, { error: 'Method not allowed.' });

  try {
    const rawToken = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!rawToken) return send(res, 401, { error: 'Sign in is required.' });
    const { auth, db } = getAdmin();
    const actor = await auth.verifyIdToken(rawToken, true);
    const authorised = isPlatformAdmin(actor);

    // Login needs this lightweight answer before a platform administrator has
    // any tenant membership. Do not couple it to TENANT_MODE: deployments
    // have the client tenant flag and server flag configured separately.
    if (req.method === 'GET' && req.query?.action === 'capability') return send(res, 200, { authorised });
    if (!authorised) return send(res, 403, { error: 'Platform administrator access is required.' });
    if (!tenantModeEnabled()) return send(res, 404, { error: 'Tenant mode is not enabled.' });

    if (req.query?.action === 'details' || req.body?.action === 'resetOwnerPassword') {
      const tenantId = String(req.query?.tenantId || req.body?.tenantId || '');
      if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantId)) return send(res, 400, { error: 'Invalid business identifier.' });
      const tenant = (await db.collection('tenants').doc(tenantId).get()).data();
      if (!tenant) return send(res, 404, { error: 'Business not found.' });
      const ownerUid = String(tenant.ownerUid || '');
      if (!ownerUid) return send(res, 409, { error: 'Owner account is not linked. Contact support before changing access.' });
      let owner;
      try { owner = await auth.getUser(ownerUid); } catch { return send(res, 409, { error: 'Linked owner login was not found.' }); }
      const membership = (await db.collection('tenantMemberships').doc(`${tenantId}_${ownerUid}`).get()).data();
      const profile = (await db.collection('managers').doc(ownerUid).get()).data();
      if (req.method === 'GET' && req.query?.action === 'details') {
        const stores = await db.collection('stores').where('tenantId', '==', tenantId).get();
        const subscription = (await db.collection('tenantSubscriptions').doc(tenantId).get()).data();
        return send(res, 200, { details: {
          id: tenantId, name: tenant.name, status: tenant.status,
          owner: { name: owner.displayName || (profile?.tenantId === tenantId ? profile.crewName : '') || 'Name unavailable', email: owner.email || '', disabled: owner.disabled, emailVerified: owner.emailVerified },
          diagnostics: { membershipActive: membership?.active === true, ownerRole: membership?.personType === 'OWNER', profileLinked: profile?.tenantId === tenantId && profile?.active !== false, emailMatches: tenant.ownerEmail === owner.email },
          outlets: stores.docs.map(doc => ({ id: doc.id, name: doc.data().name, active: doc.data().isActive !== false })),
          subscription: { status: subscription?.status || tenant.subscriptionStatus || 'Not configured', trialEndsAt: subscription?.trialEndsAt?.toDate?.().toISOString() || null },
        } });
      }
      if (req.method !== 'POST' || req.body?.action !== 'resetOwnerPassword') return send(res, 405, { error: 'Method not allowed.' });
      if (!ownerResetEligible(owner, membership, profile, tenantId)) return send(res, 409, { error: 'Resolve the owner account diagnostics before sending a reset.' });
      const key = process.env.VITE_FIREBASE_API_KEY;
      if (!key) return send(res, 503, { error: 'Firebase password-reset email is not configured.' });
      const throttle = db.collection('platformSupportResetLimits').doc(ownerUid);
      const allowed = await db.runTransaction(async tx => {
        const previous = (await tx.get(throttle)).data();
        if (previous?.requestedAt?.toMillis() > Date.now() - 60000) return false;
        tx.set(throttle, { requestedAt: FieldValue.serverTimestamp() });
        return true;
      });
      if (!allowed) return send(res, 429, { error: 'Wait one minute before requesting another reset email.' });
      const audit = db.collection('platformSupportAudit').doc();
      await audit.create({ tenantId, actorUid: actor.uid, action: 'OWNER_PASSWORD_RESET_REQUESTED', targetUid: ownerUid, createdAt: FieldValue.serverTimestamp(), result: 'PENDING' });
      let accepted = false;
      try {
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestType: 'PASSWORD_RESET', email: owner.email }), signal: AbortSignal.timeout(8000) });
        accepted = response.ok;
      } catch { /* Never expose reset links or provider errors. */ }
      await audit.update({ result: accepted ? 'ACCEPTED' : 'FAILED', completedAt: FieldValue.serverTimestamp() });
      return accepted ? send(res, 200, { message: 'Firebase accepted the password-reset email request. Ask the owner to check inbox and spam; delivery is not confirmed.' }) : send(res, 503, { error: 'Reset email could not be requested. Please try later.' });
    }

    if (req.method === 'GET') {
      const tenants = await db.collection('tenants').orderBy('createdAt', 'desc').limit(200).get();
      return send(res, 200, {
        tenants: tenants.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      });
    }

    const name = String(req.body?.name || '').trim();
    const slug = slugify(String(req.body?.slug || name));
    const timezone = String(req.body?.timezone || 'Asia/Kolkata').trim();
    const ownerName = String(req.body?.ownerName || '').trim();
    const ownerEmail = String(req.body?.ownerEmail || '').trim().toLowerCase();
    const ownerPassword = String(req.body?.ownerPassword || '');
    const submittedOutlets = Array.isArray(req.body?.outlets) ? req.body.outlets : [];
    if (!name || !slug || slug.length < 3 || !ownerName || !/^\S+@\S+\.\S+$/.test(ownerEmail)) {
      return send(res, 400, { error: 'Business name, tenant identifier, owner name, and a valid owner email are required.' });
    }
    if (!submittedOutlets.length || submittedOutlets.length > 50) return send(res, 400, { error: 'Add between one and fifty outlets.' });
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) return send(res, 400, { error: 'Use a lowercase tenant identifier with letters, numbers, and hyphens.' });

    const tenantRef = db.collection('tenants').doc(slug);
    if ((await tenantRef.get()).exists) return send(res, 409, { error: 'That tenant identifier is already in use.' });

    let owner: any;
    let ownerAccountCreated = false;
    try {
      owner = await auth.getUserByEmail(ownerEmail);
      const memberships = await db.collection('tenantMemberships').where('uid', '==', owner.uid).where('active', '==', true).limit(1).get();
      if (!memberships.empty) return send(res, 409, { error: 'That owner account already belongs to a business. Tenant switching is not available yet.' });
    } catch (error: any) {
      if (error?.code !== 'auth/user-not-found') throw error;
      if (ownerPassword.length < 12) return send(res, 400, { error: 'Use a temporary owner password of at least 12 characters for a new account.' });
      owner = await auth.createUser({ email: ownerEmail, password: ownerPassword, displayName: ownerName });
      ownerAccountCreated = true;
    }

    const outletIds = new Set<string>();
    const outlets = submittedOutlets.map((outlet: any, index: number) => {
      const outletName = String(outlet?.name || '').trim();
      const outletId = slugify(String(outlet?.outletId || outletName));
      if (!outletName || !outletId || outletIds.has(outletId)) throw new Error('Each outlet needs a unique name or outlet identifier.');
      outletIds.add(outletId);
      return { id: `${slug}_${outletId}`, tenantId: slug, outletId, name: outletName, address: String(outlet?.address || '').trim(), isActive: true, sortOrder: index };
    });

    const batch = db.batch();
    const now = FieldValue.serverTimestamp();
    batch.create(tenantRef, { name, slug, status: 'ACTIVE', timezone, ownerEmail, ownerUid: owner.uid, outletCount: outlets.length, createdAt: now, createdBy: actor.uid, updatedAt: now });
    batch.create(db.collection('managers').doc(owner.uid), { tenantId: slug, authUid: owner.uid, crewName: ownerName, crewCode: 'OWNER', email: ownerEmail, outletId: outlets[0].outletId, active: true, role: 'Owner', createdAt: now });
    batch.create(db.collection('tenantMemberships').doc(`${slug}_${owner.uid}`), { tenantId: slug, uid: owner.uid, personId: owner.uid, personType: 'OWNER', role: 'Owner', outletIds: outlets.map(outlet => outlet.outletId), allOutlets: true, active: true, createdAt: now, updatedAt: now });
    outlets.forEach(outlet => batch.create(db.collection('stores').doc(outlet.id), { ...outlet, createdAt: now, updatedAt: now }));
    const settings = db.collection('tenantSettings').doc(slug).collection('config');
    batch.create(settings.doc('appConfig'), { timezone, currencySymbol: '₹' });
    batch.create(settings.doc('attendanceConfig'), { enableQrScan: true, enablePinCode: true, permittedPinCrewIds: [] });
    batch.create(settings.doc('accessConfig'), defaultAccessConfig);
    ['Owner', 'Store Manager', 'Crew'].forEach(role => batch.create(db.collection('tenantSettings').doc(slug).collection('roles').doc(slugify(role)), { name: role }));

    try {
      await batch.commit();
    } catch (error) {
      if (ownerAccountCreated) await auth.deleteUser(owner.uid).catch(() => undefined);
      throw error;
    }

    return send(res, 201, { tenant: { id: slug, name, slug, status: 'ACTIVE', timezone, outletCount: outlets.length, ownerEmail }, ownerAccountCreated });
  } catch (error: any) {
    console.error('Platform tenant endpoint failed:', error?.code || 'unknown');
    return send(res, 503, { error: 'Platform request could not be completed. Please try again or contact support.' });
  }
}
