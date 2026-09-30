import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const getAdmin = () => {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('Tenant membership service is not configured.');
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return { db: getFirestore(), auth: getAuth() };
};

const send = (res: any, status: number, body: Record<string, unknown>) => res.status(status).json(body);
const isTenantMode = () => process.env.TENANT_MODE === 'sandbox' || process.env.TENANT_MODE === 'enabled';
const isTenantAdministrator = (membership: any) =>
  membership?.active === true && ['OWNER', 'ADMINISTRATOR'].includes(membership?.personType);

// This endpoint deliberately manages one narrowly scoped permission only:
// whether an existing manager can access every outlet in their own tenant.
// It never creates memberships, changes a tenant, or lets a manager alter
// their own access.
export default async function handler(req: any, res: any) {
  if (!['GET', 'PATCH'].includes(req.method)) return send(res, 405, { error: 'Method not allowed.' });
  if (!isTenantMode()) return send(res, 404, { error: 'Tenant access management is not enabled.' });

  try {
    const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return send(res, 401, { error: 'Sign in is required.' });

    const { db, auth } = getAdmin();
    const actor = await auth.verifyIdToken(token);
    const actorMemberships = await db.collection('tenantMemberships')
      .where('uid', '==', actor.uid)
      .where('active', '==', true)
      .limit(2)
      .get();
    if (actorMemberships.size !== 1 || !isTenantAdministrator(actorMemberships.docs[0]?.data())) {
      return send(res, 403, { error: 'Only a tenant owner or administrator can manage manager outlet access.' });
    }

    const actorMembership = actorMemberships.docs[0].data();
    const tenantId = String(actorMembership.tenantId || '');
    const targetUid = String(req.method === 'GET' ? req.query?.uid : req.body?.uid || '');
    if (!tenantId || !targetUid) return send(res, 400, { error: 'A manager is required.' });
    if (targetUid === actor.uid) return send(res, 403, { error: 'You cannot change your own outlet access.' });

    const targetRef = db.collection('tenantMemberships').doc(`${tenantId}_${targetUid}`);
    const targetSnap = await targetRef.get();
    const target = targetSnap.data();
    if (!targetSnap.exists || target?.tenantId !== tenantId || target?.uid !== targetUid
      || target?.active !== true || target?.personType !== 'MANAGER') {
      return send(res, 404, { error: 'An active manager in this business was not found.' });
    }

    if (req.method === 'GET') {
      return send(res, 200, {
        uid: targetUid,
        allOutlets: target.allOutlets === true,
        outletIds: Array.isArray(target.outletIds) ? target.outletIds : [],
      });
    }

    if (req.body?.action === 'resetPassword') {
      const password = String(req.body?.password || '');
      if (password.length < 12) return send(res, 400, { error: 'Use a password with at least 12 characters.' });
      await auth.updateUser(targetUid, { password });
      await targetRef.update({ updatedAt: FieldValue.serverTimestamp() });
      return send(res, 200, { uid: targetUid, passwordReset: true });
    }

    if (req.body?.action !== 'setAllOutlets' || typeof req.body?.allOutlets !== 'boolean') {
      return send(res, 400, { error: 'Invalid manager access request.' });
    }
    await targetRef.update({ allOutlets: req.body.allOutlets, updatedAt: FieldValue.serverTimestamp() });
    return send(res, 200, { uid: targetUid, allOutlets: req.body.allOutlets });
  } catch (error: any) {
    console.error('Tenant membership endpoint failed:', error?.message || error);
    return send(res, 503, { error: 'Manager access could not be updated. Please try again.' });
  }
}
