export function ownerResetEligible(owner: any, membership: any, profile: any, tenantId: string): boolean {
  return Boolean(owner?.email && !owner.disabled && membership?.active === true && membership?.personType === 'OWNER' && profile?.tenantId === tenantId && profile?.active !== false);
}

export function passwordChangeError(password: unknown, confirmation: unknown, authTime: unknown, nowSeconds = Date.now() / 1000): string | null {
  if (typeof authTime !== 'number' || !Number.isFinite(authTime) || authTime > nowSeconds + 30 || nowSeconds - authTime > 300) return 'Sign out and sign in again before changing an owner password (within five minutes).';
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) return 'Use a password between 12 and 128 characters.';
  if (password !== confirmation) return 'Passwords do not match.';
  return null;
}
