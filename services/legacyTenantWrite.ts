// Production compatibility release: reads remain on the existing global model,
// while new operational records are labelled for Green Neko's future tenant
// cutover. This is intentionally inert until VITE_LEGACY_TENANT_ID is set in
// the production build environment.
const legacyTenantId = () => String(import.meta.env.VITE_LEGACY_TENANT_ID || '').trim();

export const withLegacyTenant = <T extends object>(payload: T): T | (T & { tenantId: string }) => {
  const tenantId = legacyTenantId();
  return tenantId ? { ...payload, tenantId } : payload;
};
