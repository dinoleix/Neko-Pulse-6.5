import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { canCreateOutletStaff, staffCreationPayload, staffEditPayload } from '../server/employeeCreationPolicy.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST', 'PATCH', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sign in required.' });
  if (!['enabled', 'sandbox'].includes(process.env.TENANT_MODE || '')) return res.status(403).json({ error: 'Tenant access is required.' });
  try {
    if (!getApps().length) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (!raw) throw new Error('Server not configured.');
      initializeApp({ credential: cert(JSON.parse(raw)) });
    }
    const auth = getAuth(), db = getFirestore();
    const actor = await auth.verifyIdToken(token, true);
    const memberships = await db.collection('tenantMemberships').where('uid', '==', actor.uid).where('active', '==', true).limit(2).get();
    if (memberships.size !== 1) return res.status(403).json({ error: 'An active business manager membership is required.' });
    const member = memberships.docs[0].data();
    if ((await db.collection('tenants').doc(member.tenantId).get()).get('accessBlocked') === true) {
      return res.status(403).json({ error: 'Business access is blocked.' });
    }
    if (req.method === 'PUT') {
      const { employeeId, dateOfLeaving } = req.body || {};
      if (typeof employeeId !== 'string' || !employeeId || employeeId.length > 150 || employeeId.includes('/') || ['.', '..'].includes(employeeId)) {
        return res.status(400).json({ error: 'Select a valid employee.' });
      }
      if (dateOfLeaving !== null && (typeof dateOfLeaving !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfLeaving)
        || !Number.isFinite(Date.parse(dateOfLeaving)) || new Date(dateOfLeaving).toISOString().slice(0, 10) !== dateOfLeaving)) {
        return res.status(400).json({ error: 'Enter a valid relieving date.' });
      }
      const saved = await db.runTransaction(async transaction => {
        const ref = db.collection('crew').doc(employeeId);
        const [actorSnapshot, employeeSnapshot, tenantSnapshot] = await Promise.all([
          transaction.get(memberships.docs[0].ref), transaction.get(ref),
          transaction.get(db.collection('tenants').doc(member.tenantId)),
        ]);
        const owner = actorSnapshot.data();
        const employee = employeeSnapshot.data();
        if (!tenantSnapshot.exists || tenantSnapshot.get('accessBlocked') === true
          || !owner || owner.uid !== actor.uid || owner.active !== true || owner.tenantId !== member.tenantId
          || !['OWNER', 'ADMINISTRATOR'].includes(owner.personType) || !employee || employee.tenantId !== owner.tenantId
          || employee.authUid === actor.uid) return false;

        const membershipRef = employee.authUid
          ? db.collection('tenantMemberships').doc(`${owner.tenantId}_${employee.authUid}`)
          : null;
        const linked = membershipRef ? (await transaction.get(membershipRef)).data() : undefined;
        if (linked && (linked.uid !== employee.authUid || linked.tenantId !== owner.tenantId
          || linked.personType !== 'CREW' || ![employeeId, employee.authUid].includes(linked.personId))) return false;

        const active = dateOfLeaving === null;
        transaction.update(ref, { dateOfLeaving, active });
        if (linked && membershipRef) transaction.update(membershipRef, { active, updatedAt: FieldValue.serverTimestamp() });
        transaction.set(db.collection('tenantSettings').doc(owner.tenantId).collection('crewDirectory').doc(employeeId),
          { crewName: employee.crewName, role: employee.role || null, birthMMDD: employee.birthMMDD || null, active }, { merge: true });
        transaction.create(db.collection('employeeAdministrationAudit').doc(), {
          tenantId: owner.tenantId, actorUid: actor.uid, employeeId, action: 'STAFF_RELIEVING_DATE_UPDATED',
          previousDate: employee.dateOfLeaving || null, dateOfLeaving, createdAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
      return saved ? res.json({ id: employeeId }) : res.status(403).json({ error: 'Only an owner or administrator can update this employee’s relieving date.' });
    }
    const [profile, access] = await Promise.all([
      db.collection('managers').doc(member.personId || actor.uid).get(),
      db.collection('tenantSettings').doc(member.tenantId).collection('config').doc('accessConfig').get(),
    ]);
    if (!canCreateOutletStaff(member, profile.data(), access.data())) return res.status(403).json({ error: 'Employee access must be granted by the owner.' });
    if (req.method === 'GET') return res.json({ canCreateStaff: true, canEditStaff: true });
    const [stores, roles] = await Promise.all([
      db.collection('stores').where('tenantId', '==', member.tenantId).get(),
      db.collection('tenantSettings').doc(member.tenantId).collection('roles').get(),
    ]);
    if (req.method === 'PATCH') {
      const id = req.body?.employeeId;
      if (typeof id !== 'string' || !id || id.includes('/') || id.length > 150) return res.status(400).json({ error: 'Select a valid employee.' });
      try {
        await db.runTransaction(async transaction => {
          const ref = db.collection('crew').doc(id);
          const target = (await transaction.get(ref)).data();
          const membershipRef = db.collection('tenantMemberships').doc(`${member.tenantId}_${target?.authUid || id}`);
          const targetMember = (await transaction.get(membershipRef)).data();
          const patch = staffEditPayload(req.body?.employee, target, targetMember, member, stores.docs.map(d => d.data()), roles.docs.map(d => d.data().name), actor.uid);
          if (![id, target.authUid].includes(targetMember.personId)) throw new Error('Employee account needs an owner to check its linked membership.');
          transaction.update(ref, { ...patch, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
          transaction.update(membershipRef, { role: patch.role, outletIds: [patch.outletId], updatedAt: FieldValue.serverTimestamp() });
          transaction.set(db.collection('tenantSettings').doc(member.tenantId).collection('crewDirectory').doc(target.authUid), {
            crewName: patch.crewName, role: patch.role, active: target.active !== false && !target.dateOfLeaving, birthMMDD: patch.birthMMDD,
          }, { merge: true });
          transaction.create(db.collection('employeeAdministrationAudit').doc(), {
            tenantId: member.tenantId, actorUid: actor.uid, employeeId: id, outletId: patch.outletId,
            action: 'STAFF_UPDATED', changedFields: Object.keys(patch).filter(key => patch[key] !== target[key]),
            createdAt: FieldValue.serverTimestamp(),
          });
        });
      } catch (error: any) {
        if (error?.code) throw error;
        return res.status(403).json({ error: error.message || 'Employee cannot be edited.' });
      }
      return res.json({ id });
    }
    let payload;
    try { payload = staffCreationPayload(req.body?.employee, member, stores.docs.map(d => d.data()), roles.docs.map(d => d.data().name)); }
    catch (error) { return res.status(400).json({ error: (error as Error).message }); }
    // Existing staff sign-in uses a globally unique synthetic PIN email.
    // Never recover/reassign an existing account, including another tenant's.
    const [crewCodes, managerCodes] = await Promise.all(['crew', 'managers'].map(collection => db.collection(collection).where('crewCode', '==', payload.crewCode).limit(1).get()));
    if (!crewCodes.empty || !managerCodes.empty) return res.status(409).json({ error: 'This Crew PIN is unavailable. Choose another PIN.' });
    let created;
    try { created = await auth.createUser({ email: `${payload.crewCode}@neko.local`, password: `neko${payload.crewCode}pulse` }); }
    catch (error: any) {
      if (error.code === 'auth/email-already-exists') return res.status(409).json({ error: 'This Crew PIN is unavailable. Choose another PIN.' });
      throw error;
    }
    const ref = db.collection('crew').doc(created.uid);
    const batch = db.batch();
    batch.create(ref, { ...payload, authUid: created.uid, createdBy: actor.uid, createdAt: FieldValue.serverTimestamp() });
    batch.create(db.collection('tenantMemberships').doc(`${member.tenantId}_${created.uid}`), {
      tenantId: member.tenantId, uid: created.uid, personId: created.uid, personType: 'CREW', role: payload.role,
      outletIds: [payload.outletId], active: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    batch.create(db.collection('tenantSettings').doc(member.tenantId).collection('crewDirectory').doc(created.uid), {
      crewName: payload.crewName, role: payload.role, active: true, birthMMDD: payload.birthMMDD,
    });
    batch.create(db.collection('employeeAdministrationAudit').doc(), { tenantId: member.tenantId, actorUid: actor.uid, employeeId: created.uid, outletId: payload.outletId, action: 'STAFF_CREATED', createdAt: FieldValue.serverTimestamp() });
    try { await batch.commit(); }
    catch (error) {
      // A lost commit response may still mean success. Only remove this newly
      // created Auth account if the employee document is confirmed absent.
      const saved = await ref.get();
      if (!saved.exists) { await auth.deleteUser(created.uid); throw error; }
      if (saved.data()?.tenantId !== member.tenantId || saved.data()?.authUid !== created.uid) throw error;
    }
    return res.status(201).json({ id: created.uid });
  } catch (error: any) {
    console.error('Staff administration failed:', error?.code || 'server-error');
    return res.status(503).json({ error: 'Could not save staff. Please refresh the directory before retrying.' });
  }
}
