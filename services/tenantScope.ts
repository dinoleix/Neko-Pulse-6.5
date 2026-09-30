import { auth, firebase } from '../firebaseConfig';
import { isTenantModeEnabled, tenantService } from './tenantService';
import { TenantContext } from '../types';

export const currentTenantContext = async (): Promise<TenantContext | undefined> => {
  if (!isTenantModeEnabled) return undefined;
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Please sign in to access this business data.');
  const membership = await tenantService.getActiveMembership(uid);
  if (!membership) throw new Error('No active business membership was found.');
  return membership;
};

// Keeps service-layer reads and writes aligned with Firestore rules. In
// production mode this deliberately returns undefined so legacy behaviour is
// unchanged until the production cutover is explicitly enabled.
export const currentTenantId = async (): Promise<string | undefined> => {
  return (await currentTenantContext())?.tenantId;
};

export const isTenantWideMember = (context?: TenantContext) =>
  context?.personType === 'OWNER' || context?.personType === 'ADMINISTRATOR' || context?.allOutlets === true;

export const withTenant = (query: firebase.firestore.Query, tenantId?: string) =>
  tenantId ? query.where('tenantId', '==', tenantId) : query;

export const tenantPayload = async <T extends object>(payload: T) => {
  const tenantId = await currentTenantId();
  return tenantId ? { ...payload, tenantId } : payload;
};
