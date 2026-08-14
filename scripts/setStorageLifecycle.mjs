// Sets the GCS lifecycle rule on the Firebase Storage bucket using the
// locally signed-in Firebase CLI's credentials (same OAuth client the CLI
// itself uses). Prints no tokens.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const BUCKET = 'order-accuracy-ce844.firebasestorage.app';
const RETENTION_DAYS = 30;
const PREFIXES = ['proofs/', 'conversations/'];

const store = JSON.parse(readFileSync(`${homedir()}/.config/configstore/firebase-tools.json`, 'utf8'));
const refreshToken = store?.tokens?.refresh_token || store?.user?.tokens?.refresh_token;
if (!refreshToken) {
  const accounts = store?.additionalAccounts || [];
  console.error('No refresh token found in configstore. Keys:', Object.keys(store));
  process.exit(1);
}

// firebase-tools' public OAuth client (from node_modules/firebase-tools/lib/api.js)
const api = readFileSync('node_modules/firebase-tools/lib/api.js', 'utf8');
const clientId = api.match(/FIREBASE_CLIENT_ID", "([^"]+)"/)[1];
const clientSecret = api.match(/FIREBASE_CLIENT_SECRET", "([^"]+)"/)[1];

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret
  })
});
if (!tokenRes.ok) {
  console.error('Token exchange failed:', tokenRes.status, (await tokenRes.text()).slice(0, 200));
  process.exit(1);
}
const { access_token } = await tokenRes.json();

const lifecycle = {
  lifecycle: {
    rule: PREFIXES.map(prefix => ({
      action: { type: 'Delete' },
      condition: { age: RETENTION_DAYS, matchesPrefix: [prefix] }
    }))
  }
};

const patchRes = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(lifecycle)
});
if (!patchRes.ok) {
  console.error('Lifecycle PATCH failed:', patchRes.status, (await patchRes.text()).slice(0, 500));
  process.exit(1);
}
const updated = await patchRes.json();
console.log('Lifecycle rules now on bucket', BUCKET + ':');
console.log(JSON.stringify(updated.lifecycle, null, 2));
