import { auth } from '../firebaseConfig';
import { PlatformTenant } from '../types';

export interface PlatformTenantDraft {
  name: string;
  slug: string;
  timezone: string;
  ownerName: string;
  ownerEmail: string;
  // Required only when this creates a Firebase Authentication user.
  ownerPassword?: string;
  outlets: Array<{ name: string; outletId?: string; address?: string }>;
}

const request = async (path = '', init?: RequestInit) => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please sign in again.');
  const response = await fetch(`/api/platform-tenants${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Platform administration is unavailable.');
  return result;
};

export const platformTenantService = {
  capability: async (): Promise<boolean> => (await request('?action=capability')).authorised === true,
  list: async (): Promise<PlatformTenant[]> => (await request()).tenants || [],
  create: async (draft: PlatformTenantDraft): Promise<{ tenant: PlatformTenant; ownerAccountCreated: boolean }> =>
    request('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    }),
};
