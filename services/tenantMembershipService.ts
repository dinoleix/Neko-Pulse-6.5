import { auth } from '../firebaseConfig';

export interface ManagerOutletAccess {
  uid: string;
  allOutlets: boolean;
  outletIds: string[];
}

const authorisedRequest = async (url: string, init?: RequestInit) => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please sign in again.');
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Manager outlet access could not be updated.');
  return result;
};

export const tenantMembershipService = {
  getManagerOutletAccess: (uid: string) =>
    authorisedRequest(`/api/tenant-membership?uid=${encodeURIComponent(uid)}`) as Promise<ManagerOutletAccess>,

  setManagerOutletAccess: (uid: string, allOutlets: boolean, outletIds: string[]) =>
    authorisedRequest('/api/tenant-membership', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setOutletAccess', uid, allOutlets, outletIds }),
    }) as Promise<ManagerOutletAccess>,

  resetManagerPassword: (uid: string, password: string) =>
    authorisedRequest('/api/tenant-membership', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resetPassword', uid, password }),
    }) as Promise<{ uid: string; passwordReset: true }>,
};
