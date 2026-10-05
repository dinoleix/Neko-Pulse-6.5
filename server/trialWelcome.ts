export type WelcomeDetails = { uid: string; tenantId: string; email: string; name: string; business: string; trialEndsAt: string };

export function welcomeContent(details: WelcomeDetails, appUrl: string) {
  const url = new URL(appUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('APP_PUBLIC_URL must be a trusted HTTPS URL.');
  url.search = ''; url.hash = '';
  const end = new Date(details.trialEndsAt).toISOString().slice(0, 10);
  return {
    subject: 'Welcome to Neko Pulse — your workspace is ready',
    text: `Hello ${details.name},\n\n${details.business} is ready on Neko Pulse. Your 30-day trial ends on ${end} (UTC).\n\nOpen your app: ${url.href}\nUse Manager sign in with this email address and the password you created. We never send your password by email.\n\nIllustrated user guide: ${new URL('/guides/neko-pulse-user-guide.pdf', url).href}\n\nGetting started:\n1. Confirm outlets in Stores.\n2. Add your team in Employees and assign roles and outlets.\n3. Plan shifts.\n4. Assign opening, cleaning and closing tasks.\n5. Set up an authorised store time clock and test attendance.\n\niPhone: Open the app in Safari, tap Share, then Add to Home Screen. Keep Open as Web App enabled if shown and tap Add.\nAndroid: Open the app in Chrome, tap the three-dot menu, then Add to home screen or Install app.\n\nYour owner dashboard includes the setup checklist and phone installation guide. Live operations need an internet connection.\n\nNo card is required for the trial and there is no automatic charge.\n\nThe Neko Pulse team`,
  };
}

// No client-supplied recipient, sender or login URL. Call only after trusted
// provisioning succeeds. Failure must never undo a working workspace.
export async function sendTrialWelcome(details: WelcomeDetails): Promise<'ACCEPTED' | 'NOT_CONFIGURED' | 'FAILED'> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.TRIAL_EMAIL_FROM;
  const appUrl = process.env.APP_PUBLIC_URL;
  if (!key || !from || !appUrl) return 'NOT_CONFIGURED';
  try {
    const content = welcomeContent(details, appUrl);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `trial-welcome/${details.tenantId}/${details.uid}` },
      body: JSON.stringify({ from, to: [details.email], ...content }),
      signal: AbortSignal.timeout(8000),
    });
    return response.ok ? 'ACCEPTED' : 'FAILED';
  } catch { return 'FAILED'; }
}
