export const normalRole = (value: unknown) => String(value || '').trim().toLowerCase();
export const staffRoleAllowed = (role: string) => !!role.trim() && !/(owner|admin|manager)/i.test(role.trim());
export function canCreateOutletStaff(member: any, profile: any, access: any) {
  return member?.active === true && member.personType === 'MANAGER'
    && profile?.active !== false && !!profile && profile.tenantId === member.tenantId
    && Array.isArray(access?.EMPLOYEE) && access.EMPLOYEE.some((role: unknown) => normalRole(role) === normalRole(profile.role));
}
export function staffCreationPayload(input: any, member: any, stores: any[], roles: string[]) {
  const name = String(input?.crewName || '').trim();
  const code = String(input?.crewCode || '').trim();
  const role = String(input?.role || '').trim();
  const outletId = String(input?.outletId || '').trim();
  if (!name || name.length > 150) throw new Error('Enter a staff name (up to 150 characters).');
  if (!/^\d{4,6}$/.test(code)) throw new Error('Use a Crew PIN of 4–6 digits.');
  if (!staffRoleAllowed(role) || !roles.includes(role)) throw new Error('Select an existing staff role. Manager and administrator accounts require an owner.');
  if (!stores.some(s => s.tenantId === member.tenantId && s.outletId === outletId && s.isActive !== false)
    || (member.allOutlets !== true && !member.outletIds?.includes(outletId))) throw new Error('Select an active store assigned to your account.');
  const text = (key: string, max: number) => {
    const value = String(input?.[key] || '').trim();
    if (value.length > max) throw new Error('One of the employee details is too long.');
    return value || null;
  };
  const date = (key: string) => {
    const value = text(key, 10);
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error('Enter a valid employee date.');
    return value;
  };
  const photoUrl = text('photoUrl', 2000);
  if (photoUrl) { try { if (new URL(photoUrl).protocol !== 'https:') throw new Error(); } catch { throw new Error('Upload a valid employee photo.'); } }
  const dateOfBirth = date('dateOfBirth');
  return { tenantId: member.tenantId, crewName: name, crewCode: code, role, outletId, active: true,
    email: text('email', 254), phoneNumber: text('phoneNumber', 50), photoUrl,
    gender: ['Male', 'Female', 'Others'].includes(input?.gender) ? input.gender : null,
    dateOfBirth, birthMMDD: dateOfBirth?.slice(5) || null, dateOfJoining: date('dateOfJoining'),
    dateOfLeaving: null, isMobile: false };
}
