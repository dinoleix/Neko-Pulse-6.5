import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const getAdmin = () => {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('Profile repair service is not configured.');
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return { db: getFirestore(), auth: getAuth() };
};

const send = (res: any, status: number, body: Record<string, unknown>) => res.status(status).json(body);
const ownerRoles = new Set(['owner', 'super admin', 'admin', 'system admin']);

// A one-purpose migration for legacy staff records whose Firestore document
// ID differs from their Firebase Auth ID. The old profile is deliberately
// retained; the auth-ID copy restores rule checks without losing history.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });

  try {
    const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return send(res, 401, { error: 'Sign in is required.' });

    const { db, auth } = getAdmin();
    const actor = await auth.verifyIdToken(token);
    const direct = await db.collection('managers').doc(actor.uid).get();
    const byAuthUid = direct.exists
      ? direct
      : (await db.collection('managers').where('authUid', '==', actor.uid).limit(1).get()).docs[0];
    const role = String(byAuthUid?.data()?.role || '').trim().toLowerCase();
    if (!ownerRoles.has(role)) return send(res, 403, { error: 'Only an Owner or Super Admin can repair staff login mappings.' });

    let repaired = 0;
    for (const collection of ['crew', 'managers']) {
      const snapshot = await db.collection(collection).get();
      const repairs = snapshot.docs.filter(doc => {
        const authUid = doc.data().authUid;
        return typeof authUid === 'string' && authUid.length > 0 && doc.id !== authUid;
      });

      for (let index = 0; index < repairs.length; index += 400) {
        const batch = db.batch();
        repairs.slice(index, index + 400).forEach(doc => {
          const authUid = doc.data().authUid as string;
          batch.set(db.collection(collection).doc(authUid), {
            ...doc.data(),
            id: FieldValue.delete(),
          }, { merge: true });
          repaired++;
        });
        await batch.commit();
      }
    }

    return send(res, 200, { repaired });
  } catch (error: any) {
    console.error('Auth UID repair failed:', error?.message || error);
    return send(res, 503, { error: 'Profile repair could not be completed. Please try again.' });
  }
}
