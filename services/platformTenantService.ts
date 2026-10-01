import { auth } from '../firebaseConfig';
import type { PlatformTenant, TenantStatus } from '../types';

const request = async (init?: RequestInit) => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please sign in again.');
  const response = await fetch('/api/platform-tenants', {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Platform tenant administration is unavailable.');
  return result;
};

export const platformTenantService = {
  list: async (): Promise<PlatformTenant[]> => (await request()).tenants || [],
  register: async (input: { id: string; displayName: string }): Promise<PlatformTenant> =>
    (await request({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).tenant,
  setStatus: async (id: string, status: TenantStatus): Promise<PlatformTenant> =>
    (await request({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })).tenant,
};
