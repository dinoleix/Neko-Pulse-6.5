import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { randomUUID } from 'node:crypto';
import { getDownloadURL, getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { canCreateOutletStaff, isPeerManagerRole, managerProfilePatch, normalRole, staffCreationPayload, staffEditPayload, staffRoleAllowed } from '../server/employeeCreationPolicy.js';

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
        const editor = actorSnapshot.data();
        const employee = employeeSnapshot.data();
        if (!tenantSnapshot.exists || tenantSnapshot.get('accessBlocked') === true
          || !editor || editor.uid !== actor.uid || editor.active !== true || editor.tenantId !== member.tenantId
          || !employee || employee.tenantId !== editor.tenantId
          || employee.authUid === actor.uid) return false;

        const membershipRef = employee.authUid
          ? db.collection('tenantMemberships').doc(`${editor.tenantId}_${employee.authUid}`)
          : null;
        const linked = membershipRef ? (await transaction.get(membershipRef)).data() : undefined;
        if (linked && (linked.uid !== employee.authUid || linked.tenantId !== editor.tenantId
          || linked.personType !== 'CREW' || ![employeeId, employee.authUid].includes(linked.personId))) return false;

        if (!['OWNER', 'ADMINISTRATOR'].includes(editor.personType)) {
          const [profile, access] = await Promise.all([
            transaction.get(db.collection('managers').doc(editor.personId || actor.uid)),
            transaction.get(db.collection('tenantSettings').doc(editor.tenantId).collection('config').doc('accessConfig')),
          ]);
          if (normalRole(profile.get('role')) !== 'store manager'
            || !canCreateOutletStaff(editor, profile.data(), access.data())
            || !linked || !staffRoleAllowed(String(employee.role || '')) || !staffRoleAllowed(String(linked.role || ''))
            || (editor.allOutlets !== true && !editor.outletIds?.includes(employee.outletId))) return false;
        }

        const active = dateOfLeaving === null;
        transaction.update(ref, { dateOfLeaving, active });
        if (linked && membershipRef) transaction.update(membershipRef, { active, updatedAt: FieldValue.serverTimestamp() });
        transaction.set(db.collection('tenantSettings').doc(editor.tenantId).collection('crewDirectory').doc(employeeId),
          { crewName: employee.crewName, role: employee.role || null, birthMMDD: employee.birthMMDD || null, active }, { merge: true });
        transaction.create(db.collection('employeeAdministrationAudit').doc(), {
          tenantId: editor.tenantId, actorUid: actor.uid, employeeId, action: 'STAFF_RELIEVING_DATE_UPDATED',
          previousDate: employee.dateOfLeaving || null, dateOfLeaving, createdAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
      return saved ? res.json({ id: employeeId }) : res.status(403).json({ error: 'You do not have permission to update this employee’s relieving date.' });
    }
    const [profile, access] = await Promise.all([
      db.collection('managers').doc(member.personId || actor.uid).get(),
      db.collection('tenantSettings').doc(member.tenantId).collection('config').doc('accessConfig').get(),
    ]);
    const canManageStaff = canCreateOutletStaff(member, profile.data(), access.data());
    const editProfile = req.method === 'PATCH' && req.body?.action === 'editManagerProfile';
    const isTenantAdmin = ['OWNER', 'ADMINISTRATOR'].includes(member.personType);
    if (!canManageStaff && !(editProfile && isTenantAdmin)) {
      return res.status(403).json({ error: 'Employee access must be granted by the owner.' });
    }
    const canEditManagerProfiles = member.canEditManagerProfiles === true && normalRole(profile.get('role')) === 'store manager';
    if (req.method === 'GET') return res.json({ canCreateStaff: true, canEditStaff: true, canEditManagerProfiles });
    if (editProfile) {
      if (!isTenantAdmin && !canEditManagerProfiles) return res.status(403).json({ error: 'Manager profile editing must be granted by your owner.' });
      const { employeeId, collection, employee, photo } = req.body;
      if (typeof employeeId !== 'string' || !employeeId || employeeId.length > 150 || employeeId.includes('/')
        || ['.', '..'].includes(employeeId) || !['crew', 'managers'].includes(collection)) {
        return res.status(400).json({ error: 'Select a valid manager profile.' });
      }
      let patch;
      try { patch = managerProfilePatch(employee); }
      catch (error) { return res.status(400).json({ error: (error as Error).message }); }
      let jpeg: Buffer | undefined;
      if (photo !== undefined && photo !== null) {
        if (typeof photo !== 'string' || photo.length > 1_400_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo)) {
          return res.status(400).json({ error: 'Upload a JPEG photo under 1 MB.' });
        }
        jpeg = Buffer.from(photo, 'base64');
        if (jpeg.length > 1_048_576 || jpeg.length < 4 || jpeg.readUInt16BE(0) !== 0xffd8
          || jpeg.readUInt16BE(jpeg.length - 2) !== 0xffd9) {
          return res.status(400).json({ error: 'Upload a JPEG photo under 1 MB.' });
        }
      }

      let upload: Promise<string> | undefined;
      const saved = await db.runTransaction(async transaction => {
        const targetRef = db.collection(collection).doc(employeeId);
        const [editorSnap, profileSnap, accessSnap, tenantSnap, targetSnap] = await Promise.all([
          transaction.get(memberships.docs[0].ref), transaction.get(profile.ref), transaction.get(access.ref),
          transaction.get(db.collection('tenants').doc(member.tenantId)), transaction.get(targetRef),
        ]);
        const editor = editorSnap.data();
        const target = targetSnap.data();
        if (!tenantSnap.exists || tenantSnap.get('accessBlocked') === true || editor?.uid !== actor.uid
          || editor.active !== true || editor.tenantId !== member.tenantId || !target || target.tenantId !== editor.tenantId) return false;

        const tenantAdmin = ['OWNER', 'ADMINISTRATOR'].includes(editor.personType);
        if (!tenantAdmin && ((editor.personId || actor.uid) !== profile.id
          || editor.canEditManagerProfiles !== true || normalRole(profileSnap.get('role')) !== 'store manager'
          || !canCreateOutletStaff(editor, profileSnap.data(), accessSnap.data())
          || !isPeerManagerRole(target.role)
          || (editor.allOutlets !== true && !editor.outletIds?.includes(target.outletId)))) return false;

        if (target.authUid !== actor.uid && employeeId !== editor.personId) {
          const linkedTarget = target.authUid
            ? await transaction.get(db.collection('tenantMemberships').doc(`${editor.tenantId}_${target.authUid}`))
            : undefined;
          if (['OWNER', 'ADMINISTRATOR'].includes(linkedTarget?.get('personType'))
            || ['owner', 'administrator', 'admin', 'super admin', 'system admin'].includes(normalRole(target.role))) return false;
        }

        if (jpeg && !upload) {
          const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET;
          if (!bucketName) throw new Error('Employee photo storage is not configured.');
          const file = getStorage().bucket(bucketName).file(`employees/${member.tenantId}/${randomUUID()}_photo.jpg`);
          upload = file.save(jpeg, { resumable: false, metadata: {
            contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: randomUUID() },
          } }).then(() => getDownloadURL(file));
        }
        const photoUrl = upload ? await upload : photo === null ? null : undefined;
        const savedProfile = { ...patch, ...(photoUrl !== undefined ? { photoUrl } : {}) };
        transaction.update(targetRef, {
          ...savedProfile,
          updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp(),
        });
        if (collection === 'crew') {
          transaction.set(db.collection('tenantSettings').doc(editor.tenantId).collection('crewDirectory').doc(employeeId),
            { crewName: patch.crewName, birthMMDD: patch.birthMMDD }, { merge: true });
        }
        return savedProfile;
      });
      return saved ? res.json({ id: employeeId, profile: saved }) : res.status(403).json({ error: 'You cannot edit this manager profile.' });
    }
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
