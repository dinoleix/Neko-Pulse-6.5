import { auth } from '../firebaseConfig';

export type TrialDetails = { name: string; slug: string; timezone: string; outlets: Array<{ name: string; address?: string }> };

const call = async (action: 'reserve' | 'activate', details?: TrialDetails) => {
  const token = await auth.currentUser?.getIdToken(action === 'activate');
  if (!token) throw new Error('Please sign in to continue.');
  const response = await fetch('/api/self-serve-trial', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...details }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Trial setup could not be completed.');
  return result;
};

export const trialSignupService = { reserve: (details: TrialDetails) => call('reserve', details), activate: () => call('activate') };
