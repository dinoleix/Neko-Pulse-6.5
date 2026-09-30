// Controlled in-place tenant migration for Neko Pulse.
//
// Default mode is read-only. It inventories existing records, validates
// identity mappings, and writes a local report. `--mode=apply` is deliberately
// blocked unless both an explicit confirmation and a named collection scope are
// supplied. It never deletes or moves existing documents or Storage objects.
//
// Examples:
// PULSE_SERVICE_ACCOUNT_PATH=/secure/neko-pulse.json node scripts/migrateTenantData.mjs
// PULSE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' node scripts/migrateTenantData.mjs
// PULSE_SERVICE_ACCOUNT_PATH=/secure/neko-pulse.json node scripts/migrateTenantData.mjs --mode=apply --confirm=green-neko --collections=crew,stores

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const args = new Map(process.argv.slice(2).map(arg => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));
const mode = args.get('mode') || 'dry-run';
const tenantId = args.get('tenant') || 'green-neko';
const selectedCollections = (args.get('collections') || '').split(',').map(value => value.trim()).filter(Boolean);
const credentialPath = process.env.PULSE_SERVICE_ACCOUNT_PATH;
const credentialJson = process.env.PULSE_SERVICE_ACCOUNT_JSON;
const outputDir = resolve(process.env.TENANT_MIGRATION_OUTPUT_DIR || `exports/tenant-migration-${new Date().toISOString().replace(/[:.]/g, '-')}`);

if (!credentialPath && !credentialJson) throw new Error('Set PULSE_SERVICE_ACCOUNT_PATH or PULSE_SERVICE_ACCOUNT_JSON to an authorized Firebase service account.');
if (!['dry-run', 'apply', 'verify'].includes(mode)) throw new Error('mode must be dry-run, apply, or verify.');
if (mode === 'apply') {
  if (args.get('confirm') !== tenantId) throw new Error(`Apply is blocked. Pass --confirm=${tenantId} after approving the exact target.`);
  if (!selectedCollections.length) throw new Error('Apply is blocked. Pass a bounded --collections=crew,stores scope.');
  if (process.env.MIGRATION_WRITE_APPROVED !== 'YES') throw new Error('Apply is blocked. Set MIGRATION_WRITE_APPROVED=YES only in the approved change window.');
}

const serviceAccount = credentialJson
  ? JSON.parse(credentialJson)
  : JSON.parse(readFileSync(credentialPath, 'utf8'));
const app = initializeApp({ credential: cert(serviceAccount) }, 'tenant-migration');
const db = getFirestore(app);
const auth = getAuth(app);
mkdirSync(outputDir, { recursive: true });

const operationalCollections = [
  'crew', 'managers', 'roles', 'stores', 'shifts', 'shiftAssignments', 'cafeHolidays',
  'attendanceLogs', 'leaveRequests', 'tasks', 'taskLogs', 'taskTemplates', 'validations',
  'trainingModules', 'trainingAssignments', 'trainingAssessmentKeys', 'trainingAudit',
  'trainingCertifications', 'eom_cycles', 'eom_scores', 'eom_votes', 'loginLogs', 'managerActions',
];
const settingsToCopy = ['accessConfig', 'appConfig', 'attendanceConfig', 'taskConfig', 'hrTemplates', 'hrConfig', 'companyLogo'];
// These were retired from the application or are held only as a migration
// archive. They are deliberately inventoried but never backfilled.
const excludedCollections = {
  recipes: 'Retired Recipe module; retained until the NekoMetrics import is verified.',
  bluebook_items: 'Retired Blue Book module.',
  conversationStatus: 'Retired Counter Conversations module.',
  managerRecurringAgenda: 'Retired Manager Meetings module.',
  tableMonitoring: 'No active application reader; keep unchanged pending a separately scoped retention decision.',
};
const requested = selectedCollections.length ? selectedCollections : operationalCollections;
const unknownRequested = requested.filter(collection => !operationalCollections.includes(collection) && !['settings', 'crewDirectory', 'memberships'].includes(collection));
if (unknownRequested.length) throw new Error(`Unknown collection scope: ${unknownRequested.join(', ')}`);

const report = {
  runId: `${new Date().toISOString()}-${tenantId}`,
  generatedAt: new Date().toISOString(), mode, tenantId, selectedCollections: requested,
  collectionFamilies: {}, excludedCollections: {}, identityExceptions: [], membershipPlan: [], settings: {}, discoveredTopLevelCollections: [],
  writes: { attempted: 0, updated: 0, created: 0, skipped: 0, failed: [] },
};

const writeReport = () => {
  writeFileSync(resolve(outputDir, 'migration-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
};

const classifyDocs = async (collectionName) => {
  const snapshot = await db.collection(collectionName).get();
  const result = { documentCount: snapshot.size, missingTenantId: 0, alreadyCompliant: 0, conflictingTenantId: [], updated: 0 };
  const batchWrites = [];
  for (const doc of snapshot.docs) {
    const value = doc.data().tenantId;
    if (!value) {
      result.missingTenantId += 1;
      if (mode === 'apply') batchWrites.push(doc.ref);
    } else if (value === tenantId) {
      result.alreadyCompliant += 1;
    } else {
      result.conflictingTenantId.push({ id: doc.id, tenantId: value });
    }
  }
  if (mode === 'apply' && batchWrites.length) {
    for (let start = 0; start < batchWrites.length; start += 400) {
      const batch = db.batch();
      for (const ref of batchWrites.slice(start, start + 400)) batch.update(ref, { tenantId, tenantMigratedAt: FieldValue.serverTimestamp() });
      await batch.commit();
      result.updated += Math.min(400, batchWrites.length - start);
      report.writes.updated += Math.min(400, batchWrites.length - start);
    }
  }
  report.collectionFamilies[collectionName] = result;
};

const authCandidates = async (doc) => {
  const data = doc.data();
  const candidates = [...new Set([doc.id, data.authUid, data.uid].filter(value => typeof value === 'string' && value.trim()))];
  const valid = [];
  for (const uid of candidates) {
    try { await auth.getUser(uid); valid.push(uid); } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }
  }
  return { candidates, valid };
};

const managerType = (role = '') => {
  const normalized = String(role).toLowerCase();
  if (normalized.includes('owner')) return 'OWNER';
  if (normalized.includes('admin')) return 'ADMINISTRATOR';
  return 'MANAGER';
};

const planMemberships = async () => {
  const [crew, managers, stores] = await Promise.all([
    db.collection('crew').get(), db.collection('managers').get(), db.collection('stores').get(),
  ]);
  const activeOutletIds = stores.docs.filter(doc => doc.data().isActive !== false).map(doc => doc.data().outletId).filter(Boolean);
  const profiles = [
    ...crew.docs.map(doc => ({ doc, type: 'CREW' })),
    ...managers.docs.map(doc => ({ doc, type: 'MANAGER' })),
  ];
  for (const profile of profiles) {
    const data = profile.doc.data();
    if (data.active === false) continue;
    const { candidates, valid } = await authCandidates(profile.doc);
    if (valid.length !== 1) {
      report.identityExceptions.push({ collection: profile.type === 'CREW' ? 'crew' : 'managers', id: profile.doc.id, candidates, valid, reason: valid.length ? 'ambiguous-auth-uid' : 'missing-auth-user' });
      continue;
    }
    const role = data.role || data.accessRole || '';
    const personType = profile.type === 'CREW' ? 'CREW' : managerType(role);
    // A specifically flagged manager can manage every outlet in their tenant.
    // Keep this explicit: the ordinary Manager role remains outlet-scoped.
    const allOutlets = personType === 'OWNER' || personType === 'ADMINISTRATOR' || data.allOutlets === true;
    const outletIds = allOutlets
      ? activeOutletIds
      : (data.outletId ? [data.outletId] : []);
    if (!outletIds.length) {
      report.identityExceptions.push({ collection: profile.type === 'CREW' ? 'crew' : 'managers', id: profile.doc.id, uid: valid[0], reason: 'missing-outlet-assignment' });
      continue;
    }
    const membershipId = `${tenantId}_${valid[0]}`;
    report.membershipPlan.push({ membershipId, uid: valid[0], personId: profile.doc.id, personType, role, outletIds, allOutlets, active: true });
  }
};

const copySettings = async () => {
  for (const settingId of settingsToCopy) {
    const [source, destination] = await Promise.all([
      db.collection('settings').doc(settingId).get(),
      db.collection('tenantSettings').doc(tenantId).collection('config').doc(settingId).get(),
    ]);
    report.settings[settingId] = { sourceExists: source.exists, destinationExists: destination.exists, copied: false };
    if (mode === 'apply' && source.exists && !destination.exists) {
      await destination.ref.set({ ...source.data(), tenantId, tenantMigratedAt: FieldValue.serverTimestamp() });
      report.settings[settingId].copied = true;
      report.writes.created += 1;
    }
  }
};

const copyCrewDirectory = async () => {
  const source = await db.collection('crewDirectory').get();
  const result = { documentCount: source.size, missingDestination: 0, alreadyPresent: 0, copied: 0 };
  for (const doc of source.docs) {
    const destination = db.collection('tenantSettings').doc(tenantId).collection('crewDirectory').doc(doc.id);
    const existing = await destination.get();
    if (existing.exists) { result.alreadyPresent += 1; continue; }
    result.missingDestination += 1;
    if (mode === 'apply') {
      await destination.set({ ...doc.data(), tenantId, tenantMigratedAt: FieldValue.serverTimestamp() });
      result.copied += 1;
      report.writes.created += 1;
    }
  }
  report.collectionFamilies.crewDirectory = result;
};

// Role definitions are operational records at the legacy root but are read
// from the tenant settings namespace after tenant mode is enabled. Preserve
// their document IDs so existing role references remain stable.
const copyTenantRoles = async () => {
  const source = await db.collection('roles').get();
  const result = { documentCount: source.size, missingDestination: 0, alreadyPresent: 0, copied: 0 };
  for (const doc of source.docs) {
    const destination = db.collection('tenantSettings').doc(tenantId).collection('roles').doc(doc.id);
    const existing = await destination.get();
    if (existing.exists) { result.alreadyPresent += 1; continue; }
    result.missingDestination += 1;
    if (mode === 'apply') {
      await destination.set({ ...doc.data(), tenantId, tenantMigratedAt: FieldValue.serverTimestamp() });
      result.copied += 1;
      report.writes.created += 1;
    }
  }
  report.collectionFamilies.tenantRoles = result;
};

const applyMemberships = async () => {
  const tenantRef = db.collection('tenants').doc(tenantId);
  const existingTenant = await tenantRef.get();
  if (mode === 'apply' && !existingTenant.exists) {
    await tenantRef.set({ name: 'Green Neko', status: 'active', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    report.writes.created += 1;
  }
  for (const membership of report.membershipPlan) {
    const ref = db.collection('tenantMemberships').doc(membership.membershipId);
    const existing = await ref.get();
    if (existing.exists) { report.writes.skipped += 1; continue; }
    if (mode === 'apply') {
      await ref.set({ ...membership, tenantId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      report.writes.created += 1;
    }
  }
};

report.discoveredTopLevelCollections = (await db.listCollections()).map(collection => collection.id).sort();
for (const [collectionName, reason] of Object.entries(excludedCollections)) {
  if (!report.discoveredTopLevelCollections.includes(collectionName)) continue;
  const snapshot = await db.collection(collectionName).get();
  report.excludedCollections[collectionName] = { documentCount: snapshot.size, reason, action: 'retained-unchanged' };
}
for (const collectionName of requested.filter(collection => operationalCollections.includes(collection))) await classifyDocs(collectionName);
if (requested.includes('trainingModules') || !selectedCollections.length) {
  const modules = await db.collection('trainingModules').get();
  let versions = { documentCount: 0, missingTenantId: 0, alreadyCompliant: 0, conflictingTenantId: [], updated: 0 };
  for (const module of modules.docs) {
    const snapshot = await module.ref.collection('versions').get();
    versions.documentCount += snapshot.size;
    for (const version of snapshot.docs) {
      const value = version.data().tenantId;
      if (!value) { versions.missingTenantId += 1; if (mode === 'apply') { await version.ref.update({ tenantId, tenantMigratedAt: FieldValue.serverTimestamp() }); versions.updated += 1; report.writes.updated += 1; } }
      else if (value === tenantId) versions.alreadyCompliant += 1;
      else versions.conflictingTenantId.push({ moduleId: module.id, id: version.id, tenantId: value });
    }
  }
  report.collectionFamilies.trainingModuleVersions = versions;
}
if (!selectedCollections.length || requested.includes('memberships')) await planMemberships();
if (!selectedCollections.length || requested.includes('settings')) await copySettings();
if (!selectedCollections.length || requested.includes('crewDirectory')) await copyCrewDirectory();
if (!selectedCollections.length || requested.includes('roles')) await copyTenantRoles();
if (mode === 'apply' && (!selectedCollections.length || requested.includes('memberships'))) await applyMemberships();

writeReport();
console.log(JSON.stringify({ mode, tenantId, outputDir, collections: report.collectionFamilies, membershipCandidates: report.membershipPlan.length, identityExceptions: report.identityExceptions.length, writes: report.writes }, null, 2));
