import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const admin = () => {
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}')) });
  return { db: getFirestore(), auth: getAuth() };
};

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Sign in required.' });
    let uid: string;
    try { ({ uid } = await admin().auth.verifyIdToken(token)); }
    catch { return res.status(401).json({ error: 'Please sign in again to watch this video.' }); }
    const path = String(req.query.path || '');
    const tenantPathMatch = /^training\/([^/]+)\/([^/]+)\//.exec(path);
    const legacyPathMatch = /^training\/([^/]+)\//.exec(path);
    const moduleId = tenantPathMatch?.[2] || legacyPathMatch?.[1];
    if (!moduleId) return res.status(400).json({ error: 'Invalid training video.' });
    const { db } = admin();
    const module = await db.collection('trainingModules').doc(moduleId).get();
    if (!module.exists || module.data()?.status !== 'PUBLISHED') return res.status(403).json({ error: 'Not authorised.' });
    const tenantId = String(module.data()?.tenantId || '');
    if (process.env.TENANT_MODE === 'sandbox' || process.env.TENANT_MODE === 'enabled') {
      if (!tenantPathMatch || tenantPathMatch[1] !== tenantId) return res.status(403).json({ error: 'Not authorised.' });
      const membership = await db.collection('tenantMemberships').where('uid', '==', uid).where('tenantId', '==', tenantId).where('active', '==', true).limit(1).get();
      if (membership.empty) return res.status(403).json({ error: 'Not authorised.' });
    }
    const [manager, assignments] = await Promise.all([
      db.collection('managers').doc(uid).get(),
      db.collection('trainingAssignments').where('employeeUid', '==', uid).get(),
    ]);
    const managerAllowed = manager.exists && (!tenantId || manager.data()?.tenantId === tenantId);
    const assigned = assignments.docs.some(doc => doc.data().moduleId === moduleId && (!tenantId || doc.data().tenantId === tenantId));
    if ((!managerAllowed && !assigned)) return res.status(403).json({ error: 'Not authorised.' });
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET;
    if (!bucketName) throw new Error('Training video storage bucket is not configured.');
    const file = getStorage().bucket(bucketName).file(path); const [exists] = await file.exists(); if (!exists) return res.status(404).json({ error: 'Video not found.' });
    // Native video players, especially Safari on iPhone, need a real URL so
    // they can request only the ranges needed for playback. A blob made from a
    // full authenticated fetch is memory-heavy and often stays blank on iOS.
    if (req.query.format === 'url') {
      const [url] = await file.getSignedUrl({ action: 'read', version: 'v4', expires: Date.now() + 5 * 60 * 1000 });
      return res.status(200).json({ url });
    }
    res.setHeader('Content-Type', (await file.getMetadata())[0].contentType || 'video/mp4');
    res.setHeader('Cache-Control', 'private, max-age=300');
    file.createReadStream().pipe(res);
  } catch (error: any) {
    console.error('Training video service failed', { code: error?.code || 'unknown' });
    return res.status(500).json({ error: 'Video service is temporarily unavailable. Please try again.' });
  }
}
