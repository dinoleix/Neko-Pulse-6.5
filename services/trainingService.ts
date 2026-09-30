import { db, firebase, storage } from '../firebaseConfig';
import { CrewMember, TrainingAssignment, TrainingAuditEvent, TrainingCertification, TrainingModule, TrainingQuizAnswerKey } from '../types';
import { canAssignModule, canCertifyAssignment, isTrainingEligible, versionSnapshotId } from './trainingPolicy';
import { currentTenantId, tenantPayload, withTenant } from './tenantScope';

const MODULES = 'trainingModules';
const ASSIGNMENTS = 'trainingAssignments';
const CERTIFICATIONS = 'trainingCertifications';
const AUDIT = 'trainingAudit';
const KEYS = 'trainingAssessmentKeys';

const clean = <T>(snap: firebase.firestore.QuerySnapshot): T[] => snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as T));
// Firestore rejects undefined at any nesting depth. Draft modules deliberately
// omit published/archive fields, so remove those optional values before writes.
const withoutUndefined = (value: any): any => {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    // Keep Firestore sentinels (for example serverTimestamp) and Timestamp
    // values intact; only traverse ordinary application data objects.
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, withoutUndefined(item)]));
  }
  return value;
};

const audit = async (event: Omit<TrainingAuditEvent, 'id' | 'createdAt'>) =>
  db.collection(AUDIT).add({ ...(await tenantPayload(event)), createdAt: firebase.firestore.FieldValue.serverTimestamp() });

export const trainingService = {
  uploadTrainingVideo: async (moduleId: string, file: File) => {
    if (!file.type.startsWith('video/')) throw new Error('Choose a video file.');
    if (file.size > 100 * 1024 * 1024) throw new Error('Video must be 100 MB or smaller.');
    const tenantId = await currentTenantId();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = tenantId
      ? `training/${tenantId}/${moduleId}/${Date.now()}_${safeName}`
      : `training/${moduleId}/${Date.now()}_${safeName}`;
    await storage.ref(storagePath).put(file, { contentType: file.type });
    return { name: file.name, storagePath, type: 'VIDEO' as const };
  },
  getModules: async (includeArchived = false): Promise<TrainingModule[]> => {
    const tenantId = await currentTenantId();
    const snap = await withTenant(db.collection(MODULES), tenantId).get();
    return clean<TrainingModule>(snap)
      .filter(module => includeArchived || module.status !== 'ARCHIVED')
      .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  },

  // Staff must not query the whole training catalogue. Fetching a known module
  // by ID lets Firestore enforce that the signed-in employee may read this
  // specific published, outlet- and role-scoped module.
  getAssignedModule: async (moduleId: string): Promise<TrainingModule | undefined> => {
    const tenantId = await currentTenantId();
    const snap = await db.collection(MODULES).doc(moduleId).get();
    return snap.exists && (!tenantId || snap.data()?.tenantId === tenantId) ? ({ ...snap.data(), id: snap.id } as TrainingModule) : undefined;
  },

  getEligibleModules: async (role?: string, outletId?: string): Promise<TrainingModule[]> =>
    (await trainingService.getModules()).filter(module => isTrainingEligible(module, role, outletId)),

  saveModule: async (module: TrainingModule, actorId: string, actorName: string, answerKeys: TrainingQuizAnswerKey[] = []) => {
    const tenantId = await currentTenantId();
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const moduleId = module.id || db.collection(MODULES).doc().id;
    const previous = module.id ? await db.collection(MODULES).doc(moduleId).get() : null;
    const version = previous?.exists ? (previous.data()?.version || 1) + 1 : Math.max(1, module.version || 1);
    const versionId = versionSnapshotId(moduleId, version);
    const payload: TrainingModule = {
      ...module, ...(tenantId ? { tenantId } : {}), id: moduleId, version, versionId, updatedBy: actorId,
      updatedAt: now, createdAt: module.createdAt || now,
      publishedAt: module.status === 'PUBLISHED' ? (module.publishedAt || now) : module.publishedAt,
      archivedAt: module.status === 'ARCHIVED' ? now : module.archivedAt,
    };
    const batch = db.batch();
    const storedPayload = withoutUndefined(payload);
    batch.set(db.collection(MODULES).doc(moduleId), storedPayload);
    // Immutable snapshot keeps assignment history attached to the exact content.
    batch.set(db.collection(`${MODULES}/${moduleId}/versions`).doc(versionId), storedPayload);
    // Answer keys are deliberately not included in module or version payloads.
    batch.set(db.collection(KEYS).doc(versionId), { ...(tenantId ? { tenantId } : {}), moduleId, versionId, answers: answerKeys, updatedAt: now, updatedBy: actorId });
    await batch.commit();
    await audit({ actorId, actorName, action: previous?.exists ? 'MODULE_VERSION_CREATED' : 'MODULE_CREATED', moduleId, moduleVersionId: versionId, notes: module.changeSummary });
    return payload;
  },

  archiveModule: async (module: TrainingModule, actorId: string, actorName: string) =>
    trainingService.saveModule({ ...module, status: 'ARCHIVED', changeSummary: module.changeSummary || 'Archived' }, actorId, actorName),

  deleteDraftModule: async (module: TrainingModule, actorId: string, actorName: string) => {
    if (!module.id) throw new Error('This module has not been saved yet.');
    if (module.status !== 'DRAFT') throw new Error('Only unassigned draft modules can be deleted. Archive published content instead.');
    const [assignments, certifications, versions] = await Promise.all([
      withTenant(db.collection(ASSIGNMENTS).where('moduleId', '==', module.id), await currentTenantId()).limit(1).get(),
      withTenant(db.collection(CERTIFICATIONS).where('moduleId', '==', module.id), await currentTenantId()).limit(1).get(),
      db.collection(`${MODULES}/${module.id}/versions`).get(),
    ]);
    if (!assignments.empty || !certifications.empty) throw new Error('This module has training history. Archive it instead so its records remain intact.');
    const batch = db.batch();
    versions.docs.forEach(version => {
      batch.delete(version.ref);
      batch.delete(db.collection(KEYS).doc(version.id));
    });
    batch.delete(db.collection(MODULES).doc(module.id));
    await batch.commit();
    // The audit entry remains as the durable record of the deletion.
    await audit({ actorId, actorName, action: 'MODULE_DELETED', moduleId: module.id, moduleVersionId: module.versionId, notes: `Deleted unassigned draft: ${module.title}` });
  },

  duplicateModule: async (module: TrainingModule, actorId: string, actorName: string) =>
    trainingService.saveModule({ ...module, id: undefined, versionId: undefined, version: 1, title: `${module.title} (copy)`, status: 'DRAFT', publishedAt: undefined, archivedAt: undefined, changeSummary: 'Duplicated from existing module' }, actorId, actorName),

  getMyAssignments: async (uid: string): Promise<TrainingAssignment[]> => {
    const tenantId = await currentTenantId();
    const snap = await withTenant(db.collection(ASSIGNMENTS).where('employeeUid', '==', uid), tenantId).get();
    return clean<TrainingAssignment>(snap).sort((a, b) => String(b.assignedAt?.seconds || 0).localeCompare(String(a.assignedAt?.seconds || 0)));
  },

  getAssignments: async (outletId?: string): Promise<TrainingAssignment[]> => {
    const tenantId = await currentTenantId();
    let query: firebase.firestore.Query = withTenant(db.collection(ASSIGNMENTS), tenantId);
    if (outletId) query = query.where('outletId', '==', outletId);
    return clean<TrainingAssignment>(await query.get());
  },

  assignEmployees: async (module: TrainingModule, employees: CrewMember[], actorId: string, actorName: string, options: { dueDate?: string; mandatory?: boolean; reason?: string; assignmentType?: 'INITIAL' | 'REFRESHER' }) => {
    const tenantId = await currentTenantId();
    if (!canAssignModule(module)) throw new Error('Only published training can be assigned.');
    const eligible = employees.filter(employee => isTrainingEligible(module, employee.role, employee.outletId));
    // A manager can select the same person through multiple role/bulk controls.
    // Read each selected outlet once and skip any already-active assignment for
    // this exact module instead of creating duplicate cards for the employee.
    const outletIds = [...new Set(eligible.map(employee => employee.outletId))];
    const existing = (await Promise.all(outletIds.map(outletId => trainingService.getAssignments(outletId)))).flat();
    const activeStatuses: TrainingAssignment['status'][] = ['ASSIGNED', 'NOT_STARTED', 'LEARNING', 'DEMONSTRATION_COMPLETED', 'PRACTISING_UNDER_SUPERVISION', 'ASSESSMENT_PENDING', 'PASSED', 'RETRAINING_REQUIRED'];
    const alreadyAssigned = new Set(existing.filter(assignment => assignment.moduleId === module.id && activeStatuses.includes(assignment.status)).map(assignment => `${assignment.employeeUid}:${assignment.moduleId}`));
    const newAssignments = eligible.filter(employee => !alreadyAssigned.has(`${employee.authUid || employee.id}:${module.id}`));
    const batches: firebase.firestore.WriteBatch[] = [];
    let batch = db.batch(); let count = 0;
    newAssignments.forEach(employee => {
      const ref = db.collection(ASSIGNMENTS).doc();
      batch.set(ref, {
        ...(tenantId ? { tenantId } : {}),
        employeeId: employee.id, employeeUid: employee.authUid || employee.id, employeeName: employee.crewName, employeeRole: employee.role,
        outletId: employee.outletId, moduleId: module.id, moduleVersionId: module.versionId, moduleTitle: module.title, track: module.track, trainingFormat: module.trainingFormat || 'PRACTICAL',
        mandatory: options.mandatory ?? module.mandatory, assignmentType: options.assignmentType || 'INITIAL', reason: options.reason || '',
        assignedBy: actorId, assignedByName: actorName, assignedAt: firebase.firestore.FieldValue.serverTimestamp(), dueDate: options.dueDate || '',
        status: 'ASSIGNED', completedLessonIds: [], supervisedAttempts: [], quizResults: [], updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      } as TrainingAssignment);
      count++;
      if (count === 400) { batches.push(batch); batch = db.batch(); count = 0; }
    });
    if (count) batches.push(batch);
    await Promise.all(batches.map(item => item.commit()));
    await Promise.all(newAssignments.map(employee => audit({ actorId, actorName, action: 'ASSIGNED', employeeId: employee.id, employeeName: employee.crewName, moduleId: module.id!, moduleVersionId: module.versionId, outletId: employee.outletId, newStatus: 'ASSIGNED', notes: options.reason })));
    return newAssignments.length;
  },

  revokeAssignment: async (assignment: TrainingAssignment, actorId: string, actorName: string, reason: string) => {
    if (!assignment.id) throw new Error('This assignment no longer exists.');
    if (!reason.trim()) throw new Error('Add a reason before revoking an assignment.');
    if (assignment.status === 'CERTIFIED' || assignment.certificationId) throw new Error('Certified training cannot be revoked. Keep its historical record instead.');
    const batch = db.batch();
    batch.delete(db.collection(ASSIGNMENTS).doc(assignment.id));
    batch.set(db.collection(AUDIT).doc(), {
      ...(await tenantPayload({})),
      actorId, actorName, action: 'ASSIGNMENT_REVOKED', employeeId: assignment.employeeId, employeeName: assignment.employeeName,
      moduleId: assignment.moduleId, moduleVersionId: assignment.moduleVersionId, outletId: assignment.outletId,
      previousStatus: assignment.status, notes: reason.trim(), createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();
  },

  updateMyAssignment: async (assignmentId: string, patch: Partial<TrainingAssignment>) =>
    db.collection(ASSIGNMENTS).doc(assignmentId).update({ ...patch, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }),

  recordTrainerUpdate: async (assignment: TrainingAssignment, actorId: string, actorName: string, patch: Partial<TrainingAssignment>, action: string, nextStatus?: TrainingAssignment['status'], notes?: string) => {
    await db.collection(ASSIGNMENTS).doc(assignment.id!).update({ ...patch, status: nextStatus || assignment.status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    await audit({ actorId, actorName, action, employeeId: assignment.employeeId, employeeName: assignment.employeeName, moduleId: assignment.moduleId, moduleVersionId: assignment.moduleVersionId, outletId: assignment.outletId, previousStatus: assignment.status, newStatus: nextStatus || assignment.status, notes });
  },

  certify: async (assignment: TrainingAssignment, module: TrainingModule, actorId: string, actorName: string, notes?: string) => {
    const tenantId = await currentTenantId();
    if ((assignment.trainingFormat || module.trainingFormat || 'PRACTICAL') !== 'PRACTICAL') throw new Error('Theory training is completed by the employee and cannot be certified.');
    if (!canCertifyAssignment(actorId, assignment.employeeUid, assignment.status)) throw new Error(assignment.employeeUid === actorId ? 'You cannot certify yourself.' : 'Only passed training can be certified.');
    const assessment = assignment.practicalAssessment;
    if (assessment?.criticalFailure) throw new Error('Critical failures require retraining.');
    const certificationRef = db.collection(CERTIFICATIONS).doc();
    const certifiedAt = new Date();
    const expiry = module.certificationValidityDays ? new Date(certifiedAt.getTime() + module.certificationValidityDays * 86400000) : null;
    const certification: TrainingCertification = { ...(tenantId ? { tenantId } : {}), assignmentId: assignment.id!, employeeId: assignment.employeeId, employeeUid: assignment.employeeUid, employeeName: assignment.employeeName, outletId: assignment.outletId, role: assignment.employeeRole, moduleId: assignment.moduleId, moduleVersionId: assignment.moduleVersionId, moduleTitle: assignment.moduleTitle, moduleVersion: module.version, assessmentResult: 'PASSED', score: assessment?.score, criticalFailures: [], certifyingManagerId: actorId, certifyingManagerName: actorName, certificationDate: firebase.firestore.FieldValue.serverTimestamp(), ...(expiry ? { expiryDate: firebase.firestore.Timestamp.fromDate(expiry) } : {}), ...(notes?.trim() ? { managerNotes: notes.trim() } : {}) };
    const batch = db.batch();
    batch.set(certificationRef, certification);
    batch.update(db.collection(ASSIGNMENTS).doc(assignment.id!), { status: 'CERTIFIED', certifiedAt: firebase.firestore.FieldValue.serverTimestamp(), certificationId: certificationRef.id, managerFeedback: notes || assignment.managerFeedback || '', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    await audit({ actorId, actorName, action: 'CERTIFIED', employeeId: assignment.employeeId, employeeName: assignment.employeeName, moduleId: assignment.moduleId, moduleVersionId: assignment.moduleVersionId, outletId: assignment.outletId, previousStatus: assignment.status, newStatus: 'CERTIFIED', notes });
  },

  getCertifications: async (filters: { uid?: string; outletId?: string } = {}): Promise<TrainingCertification[]> => {
    const tenantId = await currentTenantId();
    let query: firebase.firestore.Query = withTenant(db.collection(CERTIFICATIONS), tenantId);
    if (filters.uid) query = query.where('employeeUid', '==', filters.uid);
    if (filters.outletId) query = query.where('outletId', '==', filters.outletId);
    return clean<TrainingCertification>(await query.get());
  },

  getAudit: async (employeeId?: string): Promise<TrainingAuditEvent[]> => {
    const tenantId = await currentTenantId();
    let query: firebase.firestore.Query = withTenant(db.collection(AUDIT), tenantId).orderBy('createdAt', 'desc').limit(300);
    if (employeeId) query = withTenant(db.collection(AUDIT).where('employeeId', '==', employeeId), tenantId).orderBy('createdAt', 'desc').limit(300);
    return clean<TrainingAuditEvent>(await query.get());
  },
};
