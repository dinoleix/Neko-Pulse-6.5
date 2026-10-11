export function validateTrialReservation(input: any) {
  const name = String(input?.name || '').trim();
  const slug = String(input?.slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const timezone = String(input?.timezone || 'Asia/Kolkata').trim();
  const outlets = Array.isArray(input?.outlets) ? input.outlets.map((item: any) => ({ name: String(item?.name || '').trim(), address: String(item?.address || '').trim() })) : [];
  if (!name || name.length > 200 || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug) || !outlets.length || outlets.length > 20) throw new Error('Add a business name, valid tenant identifier, and one to twenty outlets.');
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { throw new Error('Choose a valid timezone.'); }
  const ids = outlets.map((item: any) => item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
  if (outlets.some((item: any) => !item.name || item.name.length > 200 || item.address.length > 1000) || ids.some((id: string) => !id) || new Set(ids).size !== ids.length) throw new Error('Each outlet needs a unique valid name.');
  return { name, slug, timezone, outlets };
}

export function reservationConflict(previous: any, member: boolean, input: ReturnType<typeof validateTrialReservation>) {
  if (member || previous?.status === 'ACTIVATED') return 'This account already has a workspace. Sign in normally.';
  if (previous && (previous.status !== 'EMAIL_VERIFICATION_PENDING' || previous.slug !== input.slug || previous.name !== input.name || previous.timezone !== input.timezone || JSON.stringify(previous.outlets) !== JSON.stringify(input.outlets))) return 'A different signup is already pending for this account. Resume its activation or contact support.';
  return null;
}
