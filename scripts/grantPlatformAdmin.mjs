import { readFileSync } from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const email = process.argv[2]?.trim().toLowerCase();
const apply = process.argv.includes('--apply');
const credentialPath = process.env.PULSE_SERVICE_ACCOUNT_PATH;
const credentialJson = process.env.PULSE_SERVICE_ACCOUNT_JSON;

if (!email) throw new Error('Usage: node scripts/grantPlatformAdmin.mjs owner@example.com [--apply]');
if (!credentialPath && !credentialJson) throw new Error('Set PULSE_SERVICE_ACCOUNT_PATH or PULSE_SERVICE_ACCOUNT_JSON to an authorised Firebase service account.');

const serviceAccount = JSON.parse(credentialJson || readFileSync(credentialPath, 'utf8'));
if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();
const user = await auth.getUserByEmail(email);
const ref = db.collection('platformAdmins').doc(user.uid);
const existing = await ref.get();

console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', email, uid: user.uid, existing: existing.exists, projectId: serviceAccount.project_id }, null, 2));
if (!apply) process.exit(0);

await ref.set({ uid: user.uid, email, active: true, grantedAt: FieldValue.serverTimestamp(), grantedBy: 'controlled-bootstrap' }, { merge: true });
await db.collection('platformAudit').add({ actorUid: user.uid, action: 'PLATFORM_ADMIN_GRANTED', tenantId: '_platform', createdAt: FieldValue.serverTimestamp() });
console.log('Platform administrator granted.');
