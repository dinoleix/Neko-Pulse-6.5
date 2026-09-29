import { db } from '../firebaseConfig';
import { CrewMember, CurrentUser, TenantContext, TenantMembership, UserRole } from '../types';

// This stays off unless a sandbox or future tenant-aware deployment explicitly
// enables it. The current production app therefore keeps its existing login
// and data path until a separately approved cutover.
export const isTenantModeEnabled = import.meta.env.VITE_TENANT_MODE === 'sandbox'
  || import.meta.env.VITE_TENANT_MODE === 'enabled';

const activeMembershipFor = async (uid: string): Promise<TenantContext | null> => {
  if (!isTenantModeEnabled) return null;

  const snapshot = await db.collection('tenantMemberships')
    .where('uid', '==', uid)
    .where('active', '==', true)
    .limit(2)
    .get();

  if (snapshot.empty) return null;
  if (snapshot.size > 1) {
    throw new Error('This account belongs to more than one business. Tenant switching is not available yet.');
  }

  const membership = snapshot.docs[0].data() as TenantMembership;
  if (!membership.tenantId || !membership.personId || !membership.personType) {
    throw new Error('Tenant membership is incomplete. Please contact an administrator.');
  }

  return {
    tenantId: membership.tenantId,
    membershipId: snapshot.docs[0].id,
    personId: membership.personId,
    personType: membership.personType,
    role: membership.role,
    outletIds: membership.outletIds || [],
  };
};

export const tenantService = {
  getActiveMembership: activeMembershipFor,

  resolveCurrentUser: async (uid: string, fallbackEmail?: string): Promise<CurrentUser | null> => {
    const context = await activeMembershipFor(uid);
    if (!context) return null;

    const personCollection = context.personType === 'CREW' ? 'crew' : 'managers';
    const personSnapshot = await db.collection(personCollection).doc(context.personId).get();
    if (!personSnapshot.exists) {
      throw new Error('Tenant membership points to a missing user profile.');
    }

    const profile = personSnapshot.data() as CrewMember;
    if (profile.tenantId !== context.tenantId || profile.active === false) {
      throw new Error('This account is not active for the selected business.');
    }

    const role = context.personType === 'CREW' ? UserRole.CREW : UserRole.ADMIN;
    return {
      role,
      uid,
      tenantId: context.tenantId,
      membershipId: context.membershipId,
      dbId: personSnapshot.id,
      name: profile.crewName || fallbackEmail || 'Staff',
      outletId: profile.outletId,
      accessRole: profile.role || context.role,
    };
  },
};
