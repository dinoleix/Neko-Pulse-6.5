import { TrainingAssignmentStatus, TrainingModule, TrainingPracticalAssessment } from '../types';

export const isTrainingEligible = (module: TrainingModule, role?: string, outletId?: string) =>
  module.status === 'PUBLISHED' &&
  !!outletId && module.applicableOutletIds.includes(outletId) &&
  (!module.applicableRoles.length || (!!role && module.applicableRoles.includes(role)));

export const canAssignModule = (module: TrainingModule) => module.status === 'PUBLISHED';
export const canManagerActAtOutlet = (managerOutletId: string | undefined, targetOutletId: string, isOperationsAdmin = false) =>
  isOperationsAdmin || (!!managerOutletId && managerOutletId === targetOutletId);
export const canCertifyAssignment = (actorUid: string, employeeUid: string, status: TrainingAssignmentStatus) =>
  actorUid !== employeeUid && status === 'PASSED';
export const versionSnapshotId = (moduleId: string, version: number) => `${moduleId}_v${version}`;

export const remainingPracticeAttempts = (module: TrainingModule, completed: number) =>
  Math.max(0, module.requiredSupervisedAttempts - completed);

export const practicalResult = (assessment: TrainingPracticalAssessment): TrainingAssignmentStatus =>
  assessment.criticalFailure || assessment.result === 'RETRAINING_REQUIRED' ? 'RETRAINING_REQUIRED' : 'PASSED';

export const certificationExpiry = (certifiedAt: Date, validityDays?: number) => {
  if (!validityDays || validityDays <= 0) return undefined;
  const expiry = new Date(certifiedAt);
  expiry.setDate(expiry.getDate() + validityDays);
  return expiry;
};

export const certificationIsExpired = (expiry?: Date | null, now = new Date()) => !!expiry && expiry.getTime() < now.getTime();
