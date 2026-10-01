import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { canTransitionTenantStatus, validateTenantRegistration } from '../services/platformTenantPolicy';

const admin = () => {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('Platform tenant service is not configured.');
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return { db: getFirestore(), auth: getAuth() };
};

const send = (res: any, status: number, body: Record<string, unknown>) => res.status(status).json(body);
const tenantMode = () => process.env.TENANT_MODE === 'sandbox' || process.env.TENANT_MODE === 'enabled';
const allowedStatuses = new Set(['SETUP', 'ACTIVE', 'SUSPENDED']);

const platformActor = async (req: any) => {
  if (!tenantMode()) throw new Error('Tenant administration is not enabled.');
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { db, auth } = admin();
  const actor = await auth.verifyIdToken(token);
  const permission = await db.collection('platformAdmins').doc(actor.uid).get();
  return permission.exists && permission.data()?.active === true ? { uid: actor.uid, db } : null;
};

// Platform-only registry. This deliberately does not create Firebase Auth
// users, outlets, or memberships; those are the reviewed Phase 2 workflow.
export default async function handler(req: any, res: any) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) return send(res, 405, { error: 'Method not allowed.' });
  try {
    const actor = await platformActor(req);
    if (!actor) return send(res, 403, { error: 'Platform administrator access is required.' });

    if (req.method === 'GET') {
      const snap = await actor.db.collection('tenants').orderBy('displayName').get();
      return send(res, 200, { tenants: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    }

    if (req.method === 'POST') {
      const checked = validateTenantRegistration(req.body || {});
      if (!checked.ok) return send(res, 400, { error: checked.error });
      const ref = actor.db.collection('tenants').doc(checked.value.id);
      if ((await ref.get()).exists) return send(res, 409, { error: 'That tenant ID is already in use.' });
      const tenant = { ...checked.value, status: 'SETUP', createdByUid: actor.uid, createdAt: FieldValue.serverTimestamp(), updatedByUid: actor.uid, updatedAt: FieldValue.serverTimestamp() };
      const audit = { actorUid: actor.uid, action: 'TENANT_REGISTERED', tenantId: checked.value.id, newStatus: 'SETUP', createdAt: FieldValue.serverTimestamp() };
      const batch = actor.db.batch();
      batch.create(ref, tenant);
      batch.create(actor.db.collection('platformAudit').doc(), audit);
      await batch.commit();
      return send(res, 201, { tenant: { id: checked.value.id, ...tenant, createdAt: null, updatedAt: null } });
    }

    const id = String(req.body?.id || '').trim().toLowerCase();
    const status = String(req.body?.status || '');
    if (!validateTenantRegistration({ id, displayName: 'Valid name' }).ok || !allowedStatuses.has(status)) return send(res, 400, { error: 'Invalid tenant status request.' });
    const ref = actor.db.collection('tenants').doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return send(res, 404, { error: 'Tenant not found.' });
    const previousStatus = snapshot.data()?.status;
    if (!canTransitionTenantStatus(previousStatus, status as any)) return send(res, 400, { error: 'This tenant status change is not allowed.' });
    const batch = actor.db.batch();
    batch.update(ref, { status, updatedByUid: actor.uid, updatedAt: FieldValue.serverTimestamp() });
    batch.create(actor.db.collection('platformAudit').doc(), { actorUid: actor.uid, action: 'TENANT_STATUS_CHANGED', tenantId: id, previousStatus, newStatus: status, createdAt: FieldValue.serverTimestamp() });
    await batch.commit();
    return send(res, 200, { tenant: { id, ...snapshot.data(), status, updatedByUid: actor.uid, updatedAt: null } });
  } catch (error: any) {
    console.error('Platform tenant endpoint failed:', error?.message || error);
    return send(res, 503, { error: 'Platform tenant administration is temporarily unavailable.' });
  }
}
