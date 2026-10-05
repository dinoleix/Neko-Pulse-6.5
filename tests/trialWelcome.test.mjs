import test from 'node:test';
import assert from 'node:assert/strict';
import { welcomeContent, sendTrialWelcome } from '../server/trialWelcome.ts';

const details = { uid: 'test-owner', tenantId: 'test-cafe', email: 'owner@example.com', name: 'Owner', business: 'Test Café', trialEndsAt: '2026-11-04T12:00:00Z' };

test('welcome includes safe login link, expiry and installation guidance', () => {
  const content = welcomeContent(details, 'https://app.example.com/?secret=not-a-token#fragment');
  assert.match(content.text, /https:\/\/app.example.com\//);
  assert.doesNotMatch(content.text, /not-a-token|fragment/);
  assert.match(content.text, /2026-11-04/);
  assert.match(content.text, /Manager sign in/);
  assert.match(content.text, /https:\/\/app.example.com\/guides\/neko-pulse-user-guide.pdf/);
  assert.match(content.text, /Add to Home Screen/);
  assert.match(content.text, /Android/);
  assert.match(content.text, /no automatic charge/i);
});

test('reject insecure or credential-bearing app URLs', () => {
  assert.throws(() => welcomeContent(details, 'http://app.example.com'));
  assert.throws(() => welcomeContent(details, 'https://user:password@app.example.com'));
});

test('mail configuration, provider acceptance and failure are explicit; tests never send email', async () => {
  const previous = { key: process.env.RESEND_API_KEY, from: process.env.TRIAL_EMAIL_FROM, url: process.env.APP_PUBLIC_URL, fetch: globalThis.fetch };
  try {
    delete process.env.RESEND_API_KEY;
    globalThis.fetch = async () => { throw new Error('Unexpected network call'); };
    assert.equal(await sendTrialWelcome(details), 'NOT_CONFIGURED');
    process.env.RESEND_API_KEY = 'test-only';
    process.env.TRIAL_EMAIL_FROM = 'Neko Pulse <hello@example.com>';
    process.env.APP_PUBLIC_URL = 'https://app.example.com';
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      const body = JSON.parse(options.body);
      assert.deepEqual(body.to, [details.email]);
      assert.equal(options.headers['Idempotency-Key'], 'trial-welcome/test-cafe/test-owner');
      return { ok: true };
    };
    assert.equal(await sendTrialWelcome(details), 'ACCEPTED');
    globalThis.fetch = async () => ({ ok: false });
    assert.equal(await sendTrialWelcome(details), 'FAILED');
    globalThis.fetch = async () => { throw new Error('Timeout'); };
    assert.equal(await sendTrialWelcome(details), 'FAILED');
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [name, value] of [['RESEND_API_KEY', previous.key], ['TRIAL_EMAIL_FROM', previous.from], ['APP_PUBLIC_URL', previous.url]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
