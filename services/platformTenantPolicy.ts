import type { TenantStatus } from '../types';

export const TENANT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const normalizeTenantId = (value: string) => value.trim().toLowerCase();

export const validateTenantRegistration = (input: { id?: string; displayName?: string }) => {
  const id = normalizeTenantId(input.id || '');
  const displayName = (input.displayName || '').trim().replace(/\s+/g, ' ');
  if (!TENANT_ID_PATTERN.test(id) || id.length < 3 || id.length > 64) {
    return { ok: false as const, error: 'Use a tenant ID with 3–64 lowercase letters, numbers, and hyphens.' };
  }
  if (displayName.length < 2 || displayName.length > 120) {
    return { ok: false as const, error: 'Business name must be between 2 and 120 characters.' };
  }
  return { ok: true as const, value: { id, displayName } };
};

export const canTransitionTenantStatus = (from: TenantStatus, to: TenantStatus) =>
  (from === 'SETUP' && ['ACTIVE', 'SUSPENDED'].includes(to))
  || (from === 'ACTIVE' && to === 'SUSPENDED')
  || (from === 'SUSPENDED' && to === 'ACTIVE');
