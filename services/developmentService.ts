import { auth, db, firebase } from '../firebaseConfig';
import { isTenantModeEnabled, tenantService } from './tenantService';
import { currentTenantContext, tenantPayload, withTenant } from './tenantScope';
import { storeService } from './storeService';
import { CrewMember, DevelopmentAction, DevelopmentObservation, DevelopmentRecognition, DevelopmentSkill, TrainingModule } from '../types';

export interface DevelopmentDataset {
  crew: CrewMember[];
  skills: DevelopmentSkill[];
  observations: DevelopmentObservation[];
  actions: DevelopmentAction[];
  recognitions: DevelopmentRecognition[];
  attendance: any[];
  taskLogs: any[];
  tasks: any[];
  assignments: any[];
  certifications: any[];
  shifts: any[];
  trainingModules: TrainingModule[];
  stores: any[];
  outletIds: string[];
  tenantId?: string;
  windowStart: Date;
}

type ManagerScope = { tenantId?: string; outletIds: string[]; isCompanyWide: boolean };
const mapDocs = <T,>(snapshot: firebase.firestore.QuerySnapshot) => snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as T));
const safeDate = (value: any): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? undefined : result;
};
const securityRoles = ['owner', 'administrator', 'admin', 'super admin', 'system admin'];
const tenantQuery = (collection: string, tenantId?: string) => withTenant(db.collection(collection), tenantId);
const withoutUndefined = (value: any): any => {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, withoutUndefined(item)]));
  }
  return value;
};

async function getManagerScope(): Promise<ManagerScope> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to view Employee Development.');
  const context = await currentTenantContext();
  const tenantId = context?.tenantId;
  const profile = context
    ? undefined
    : (await db.collection('managers').doc(uid).get()).data() as Partial<CrewMember> & { outletIds?: string[]; allOutlets?: boolean } | undefined;
  if (isTenantModeEnabled && !context) throw new Error('No active business membership was found.');
  if (!context && !profile) throw new Error('Manager profile not found.');
  const role = String(context?.role || profile?.role || '').trim().toLowerCase();
  const isCompanyWide = context
    ? context.personType === 'OWNER' || context.personType === 'ADMINISTRATOR' || context.allOutlets === true
    : securityRoles.includes(role) || profile?.allOutlets === true;
  const assigned = context?.outletIds?.length ? context.outletIds : profile?.outletIds?.length ? profile.outletIds : profile?.outletId ? [profile.outletId] : [];
  if (!isCompanyWide && !assigned.length) throw new Error('No outlet is assigned to this account.');
  const stores = await storeService.getActiveStores(tenantId);
  const outletIds = (isCompanyWide ? stores.map(store => store.outletId) : assigned)
    .filter((outletId, index, values) => values.indexOf(outletId) === index && stores.some(store => store.outletId === outletId));
  if (!outletIds.length) throw new Error('No active outlet is available to this account.');
  return { tenantId, outletIds, isCompanyWide };
}

const scopedDocs = async <T,>(collection: string, outletIds: string[], tenantId?: string, global = false, sinceField?: string, since?: Date | string, limit = 2500): Promise<T[]> => {
  const queryFor = (outletId?: string) => {
    let query: firebase.firestore.Query = tenantQuery(collection, tenantId);
    if (outletId) query = query.where('outletId', '==', outletId);
    if (sinceField && since) query = query.where(sinceField, '>=', since);
    return query.limit(limit);
  };
  const snapshots = global
    ? [await queryFor().get()]
    : await Promise.all(outletIds.map(outletId => queryFor(outletId).get()));
  return snapshots.flatMap(snapshot => mapDocs<T>(snapshot));
};

export const developmentService = {
  load: async (windowDays = 30): Promise<DevelopmentDataset> => {
    const scope = await getManagerScope();
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - Math.max(1, Math.min(windowDays, 180)));
    windowStart.setHours(0, 0, 0, 0);
    const tenantId = scope.tenantId;
    const [crewSnaps, managerSnaps, skillsSnap, observations, actions, recognitions, attendance, taskLogs, tasks, assignments, certifications, shifts, modulesSnap, stores] = await Promise.all([
      Promise.all(scope.outletIds.map(outletId => withTenant(db.collection('crew').where('outletId', '==', outletId), tenantId).get())),
      Promise.all(scope.outletIds.map(outletId => withTenant(db.collection('managers').where('outletId', '==', outletId), tenantId).get())),
      tenantQuery('developmentSkills', tenantId).where('active', '==', true).get(),
      scopedDocs<DevelopmentObservation>('developmentObservations', scope.outletIds, tenantId, false, 'createdAt', windowStart),
      scopedDocs<DevelopmentAction>('developmentActions', scope.outletIds, tenantId, false),
      scopedDocs<DevelopmentRecognition>('developmentRecognitions', scope.outletIds, tenantId, false, 'awardedAt', windowStart),
      scopedDocs<any>('attendanceLogs', scope.outletIds, tenantId, false, 'timestamp', windowStart),
      scopedDocs<any>('taskLogs', scope.outletIds, tenantId, false, 'completedAt', windowStart),
      scopedDocs<any>('tasks', scope.outletIds, tenantId, false),
      scopedDocs<any>('trainingAssignments', scope.outletIds, tenantId, false),
      scopedDocs<any>('trainingCertifications', scope.outletIds, tenantId, false),
      scopedDocs<any>('shiftAssignments', scope.outletIds, tenantId, false, 'date', windowStart.toISOString().slice(0,10)),
      tenantQuery('trainingModules', tenantId).get(),
      storeService.getActiveStores(tenantId),
    ]);
    const crew = [...crewSnaps.flatMap(snapshot => mapDocs<CrewMember>(snapshot)), ...managerSnaps.flatMap(snapshot => mapDocs<CrewMember>(snapshot))]
      .filter(person => person.active !== false && !person.dateOfLeaving);
    const uniqueById = <T extends { id?: string }>(items: T[]) => [...new Map(items.map(item => [item.id, item])).values()];
    return {
      crew, skills: mapDocs<DevelopmentSkill>(skillsSnap), observations: uniqueById(observations), actions: uniqueById(actions),
      recognitions: uniqueById(recognitions), attendance, taskLogs, tasks, assignments, certifications, shifts, trainingModules: mapDocs<TrainingModule>(modulesSnap), stores,
      outletIds: scope.outletIds, tenantId, windowStart,
    };
  },

  saveSkill: async (skill: DevelopmentSkill, id?: string) => {
    if (!skill.name.trim() || !skill.category.trim()) throw new Error('Skill name and category are required.');
    if (!skill.applicableOutletIds.length) throw new Error('Choose at least one active outlet.');
    const payload = await tenantPayload({ ...skill, name: skill.name.trim(), category: skill.category.trim(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    if (id) return db.collection('developmentSkills').doc(id).set(withoutUndefined(payload), { merge: true });
    return db.collection('developmentSkills').add(withoutUndefined({ ...payload, createdAt: firebase.firestore.FieldValue.serverTimestamp() }));
  },

  addObservation: async (observation: DevelopmentObservation) => {
    if (!observation.comment.trim()) throw new Error('Add a short observation first.');
    const payload = await tenantPayload({ ...observation, comment: observation.comment.trim(), createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    return db.collection('developmentObservations').add(withoutUndefined(payload));
  },

  addAction: async (action: DevelopmentAction) => {
    if (!action.title.trim()) throw new Error('Add a goal or action title.');
    const payload = await tenantPayload({ ...action, title: action.title.trim(), status: 'OPEN' as const, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    return db.collection('developmentActions').add(withoutUndefined(payload));
  },

  updateAction: async (action: DevelopmentAction) => {
    if (!action.id) throw new Error('Development action is missing its ID.');
    return db.collection('developmentActions').doc(action.id).set({ requirements: action.requirements, status: action.status, targetDate: action.targetDate || '', updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  },

  addRecognition: async (award: DevelopmentRecognition) => {
    if (!award.title.trim() || !award.reason.trim()) throw new Error('Add a recognition title and reason.');
    const payload = await tenantPayload({ ...award, approved: true, awardedAt: firebase.firestore.FieldValue.serverTimestamp() });
    return db.collection('developmentRecognitions').add(withoutUndefined(payload));
  },

  getMyDevelopment: async (uid: string) => {
    const tenantId = await currentTenantContext().then(context => context?.tenantId);
    const [skills, assignments, certifications, actions, recognitions] = await Promise.all([
      tenantQuery('developmentSkills', tenantId).where('active', '==', true).get(),
      withTenant(db.collection('trainingAssignments').where('employeeUid', '==', uid), tenantId).get(),
      withTenant(db.collection('trainingCertifications').where('employeeUid', '==', uid), tenantId).get(),
      withTenant(db.collection('developmentActions').where('employeeUid', '==', uid), tenantId).get(),
      withTenant(db.collection('developmentRecognitions').where('employeeUid', '==', uid), tenantId).get(),
    ]);
    return {
      skills: mapDocs<DevelopmentSkill>(skills), assignments: mapDocs<any>(assignments), certifications: mapDocs<any>(certifications),
      actions: mapDocs<DevelopmentAction>(actions), recognitions: mapDocs<DevelopmentRecognition>(recognitions),
    };
  },
};

export const developmentDate = safeDate;
