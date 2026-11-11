import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { ownerResetEligible, passwordChangeError } from '../server/platformSupportPolicy.js';

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
  LOGIN_ACTIVITY: ['Owner'],
  TRAINING: ['Owner', 'Store Manager'],
  SETTINGS: ['Owner'],
};

export default async function handler(req: any, res: any) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) return send(res, 405, { error: 'Method not allowed.' });

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

    if (req.method === 'GET' && req.query?.action === 'summary') {
      const tenantId = req.query.tenantId;
      if (typeof tenantId !== 'string' || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantId)) {
        return send(res, 400, { error: 'Invalid business identifier.' });
      }
      const tenant = (await db.collection('tenants').doc(tenantId).get()).data();
      if (!tenant) return send(res, 404, { error: 'Business not found.' });

      const [profiles, crew, stores, subscription] = await Promise.all([
        db.collection('managers').where('tenantId', '==', tenantId).select('role', 'crewName', 'email', 'authUid').get(),
        db.collection('crew').where('tenantId', '==', tenantId).count().get(),
        db.collection('stores').where('tenantId', '==', tenantId).select('name', 'isActive').get(),
        db.collection('tenantSubscriptions').doc(tenantId).get(),
      ]);
      const owners = new Map<string, { name: string; email: string }>();
      let managers = 0;
      for (const doc of profiles.docs) {
        const profile = doc.data();
        const uid = profile.authUid || doc.id;
        if (uid === tenant.ownerUid || String(profile.role || '').trim().toLowerCase() === 'owner') {
          owners.set(uid, { name: profile.crewName || '', email: profile.email || '' });
        } else {
          managers += 1;
        }
      }
      if (tenant.ownerUid || tenant.ownerEmail) {
        const key = tenant.ownerUid || tenant.ownerEmail;
        const primary = owners.get(key);
        owners.set(key, { name: primary?.name || '', email: primary?.email || tenant.ownerEmail || '' });
      }
      const crewCount = crew.data().count;
      return send(res, 200, {
        summary: {
          billing: {
            status: subscription.get('status') || tenant.subscriptionStatus || 'Not configured',
            trialEnd: subscription.get('trialEndsAt')?.toDate?.().toISOString().slice(0, 10) || '',
            paymentMethod: subscription.get('paymentMethod') || '',
            paymentReference: subscription.get('paymentReference') || '',
            blocked: tenant.accessBlocked === true,
            canBlock: process.env.TENANT_BLOCKING_ENABLED === 'true',
          },
          owners: [...owners.values()],
          managers,
          crew: crewCount,
          staff: managers + crewCount,
          stores: stores.docs.map(doc => ({
            id: doc.id,
            name: doc.get('name') || doc.id,
            active: doc.get('isActive') !== false,
          })),
        },
      });
    }

    if (req.query?.action === 'details' || ['resetOwnerPassword', 'setOwnerPassword'].includes(req.body?.action)) {
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
          owner: { uid: ownerUid, name: owner.displayName || (profile?.tenantId === tenantId ? profile.crewName : '') || 'Name unavailable', email: owner.email || '', disabled: owner.disabled, emailVerified: owner.emailVerified },
          diagnostics: { membershipActive: membership?.active === true, ownerRole: membership?.personType === 'OWNER', profileLinked: profile?.tenantId === tenantId && profile?.active !== false, emailMatches: tenant.ownerEmail === owner.email },
          outlets: stores.docs.map(doc => ({ id: doc.id, name: doc.data().name, active: doc.data().isActive !== false })),
          subscription: { status: subscription?.status || tenant.subscriptionStatus || 'Not configured', trialEndsAt: subscription?.trialEndsAt?.toDate?.().toISOString() || null },
        } });
      }
      if (req.method !== 'POST' || !['resetOwnerPassword', 'setOwnerPassword'].includes(req.body?.action)) return send(res, 405, { error: 'Method not allowed.' });
      if (!ownerResetEligible(owner, membership, profile, tenantId)) return send(res, 409, { error: 'Resolve the owner account diagnostics before sending a reset.' });
      if (req.body.action === 'setOwnerPassword') {
        const validation = passwordChangeError(req.body.password, req.body.confirmation, actor.auth_time);
        if (validation) return send(res, 400, { error: validation });
        if (req.body.confirmOwnerUid !== ownerUid || req.body.confirmed !== true) return send(res, 409, { error: 'Reload owner details and confirm the password change.' });
        const audit = db.collection('platformSupportAudit').doc();
        await audit.create({ tenantId, actorUid: actor.uid, targetUid: ownerUid, action: 'OWNER_PASSWORD_CHANGE', result: 'PENDING', createdAt: FieldValue.serverTimestamp() });
        let changed = false;
        try {
          await auth.updateUser(ownerUid, { password: req.body.password });
          changed = true;
          await auth.revokeRefreshTokens(ownerUid);
          await audit.update({ result: 'COMPLETED', completedAt: FieldValue.serverTimestamp() });
          return send(res, 200, { message: 'Owner password changed and refresh sessions revoked. Existing ID tokens may remain valid until expiry unless the endpoint checks revocation.' });
        } catch {
          await audit.update({ result: changed ? 'PASSWORD_CHANGED_FOLLOWUP_FAILED' : 'FAILED', completedAt: FieldValue.serverTimestamp() }).catch(() => undefined);
          return send(res, 503, { error: changed ? 'Password changed, but session revocation or audit completion failed. Do not repeat the change; contact support.' : 'Password could not be changed. Please try later.' });
        }
      }
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

    if (req.method === 'PATCH' && req.body?.action === 'billing') {
      const { tenantId, operation, trialEnd, method, reference } = req.body;
      if (typeof tenantId !== 'string' || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantId)) {
        return send(res, 400, { error: 'Invalid business identifier.' });
      }
      const tenantRef = db.collection('tenants').doc(tenantId);
      const subscriptionRef = db.collection('tenantSubscriptions').doc(tenantId);
      const now = FieldValue.serverTimestamp();
      const changes: Record<string, unknown> = {};
      const tenantChanges: Record<string, unknown> = {};
      switch (operation) {
        case 'trial': {
          const date = typeof trialEnd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(trialEnd)
            ? new Date(trialEnd + 'T23:59:59.999Z') : new Date(NaN);
          if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== trialEnd || date.getTime() <= Date.now()) {
            return send(res, 400, { error: 'Choose a valid trial end date today or later.' });
          }
          Object.assign(changes, { status: 'TRIAL_ACTIVE', trialEndsAt: Timestamp.fromDate(date), planId: 'free_trial' });
          break;
        }
        case 'no-expiry':
          Object.assign(changes, { status: 'NO_EXPIRY', trialEndsAt: null, planId: 'free_no_expiry' });
          break;
        case 'paid':
          if (!['UPI', 'MANUAL'].includes(method) || typeof reference !== 'string' || reference.length > 160) {
            return send(res, 400, { error: 'Choose UPI or manual confirmation and use a reference of up to 160 characters.' });
          }
          Object.assign(changes, { status: 'PAID', paymentMethod: method, paymentReference: reference.trim(), paymentConfirmedAt: now });
          break;
        case 'unpaid':
          changes.status = 'UNPAID';
          break;
        case 'block':
        case 'unblock':
          if (operation === 'block' && process.env.TENANT_BLOCKING_ENABLED !== 'true') {
            return send(res, 503, { error: 'Tenant blocking is unavailable until access enforcement is enabled.' });
          }
          tenantChanges.accessBlocked = operation === 'block';
          break;
        default:
          return send(res, 400, { error: 'Unknown billing action.' });
      }
      if ('status' in changes) tenantChanges.subscriptionStatus = changes.status;
      if ('trialEndsAt' in changes) tenantChanges.trialEndsAt = changes.trialEndsAt;
      if ('planId' in changes) tenantChanges.planId = changes.planId;
      const auditRef = db.collection('platformBillingAudit').doc();
      const updated = await db.runTransaction(async transaction => {
        if (!(await transaction.get(tenantRef)).exists) return false;
        transaction.update(tenantRef, { ...tenantChanges, updatedAt: now });
        if (Object.keys(changes).length) {
          transaction.set(subscriptionRef, { ...changes, tenantId, updatedAt: now }, { merge: true });
        }
        transaction.create(auditRef, { tenantId, actorUid: actor.uid, operation, changes: { ...changes, ...tenantChanges }, createdAt: now });
        return true;
      });
      return updated ? send(res, 200, { saved: true }) : send(res, 404, { error: 'Business not found.' });
    }

    if (req.method === 'PATCH') {
      const { tenantId, name, timezone } = req.body || {};
      if (typeof tenantId !== 'string' || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantId)) {
        return send(res, 400, { error: 'Invalid business identifier.' });
      }
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
        return send(res, 400, { error: 'Enter a business name of up to 120 characters.' });
      }
      if (typeof timezone !== 'string' || !timezone.trim() || timezone.length > 100) {
        return send(res, 400, { error: 'Enter a valid time zone.' });
      }
      const cleanTimezone = timezone.trim();
      try {
        new Intl.DateTimeFormat('en', { timeZone: cleanTimezone });
      } catch {
        return send(res, 400, { error: 'Enter a valid time zone, such as Asia/Kolkata.' });
      }

      const tenantRef = db.collection('tenants').doc(tenantId);
      const configRef = db.collection('tenantSettings').doc(tenantId).collection('config').doc('appConfig');
      const updated = await db.runTransaction(async transaction => {
        if (!(await transaction.get(tenantRef)).exists) return false;
        transaction.update(tenantRef, { name: name.trim(), timezone: cleanTimezone, updatedAt: FieldValue.serverTimestamp() });
        transaction.set(configRef, { timezone: cleanTimezone }, { merge: true });
        return true;
      });
      if (!updated) return send(res, 404, { error: 'Business not found.' });
      return send(res, 200, { name: name.trim(), timezone: cleanTimezone });
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
