export function ownerResetEligible(owner: any, membership: any, profile: any, tenantId: string): boolean {
  return Boolean(owner?.email && !owner.disabled && membership?.active === true && membership?.personType === 'OWNER' && profile?.tenantId === tenantId && profile?.active !== false);
}
