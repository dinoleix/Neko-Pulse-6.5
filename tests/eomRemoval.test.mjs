import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
test('retired module has no functional navigation or provisioning references', () => {
  for (const file of ['components/AdminLayout.tsx', 'components/CrewLayout.tsx', 'modules/admin/access/AccessAdminView.tsx', 'modules/admin/settings/SettingsAdminView.tsx', 'types.ts', 'api/platform-tenants.ts', 'api/self-serve-trial.ts']) assert.doesNotMatch(read(file), /\bEOM\b|CREW_EOM|eom_votes|Employee of the Month/);
  for (const file of ['services/eomService.ts', 'modules/EOMModule.tsx', 'modules/admin/eom/EOMAdminView.tsx', 'modules/crew/eom/EOMCrewView.tsx']) assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false);
});
test('retired collections have no explicit client grants in rules sources', () => {
  for (const file of ['firestore.rules', 'firestore.production.rules', 'firestore.sandbox.rules']) assert.doesNotMatch(read(file), /match \/eom_|hasManagerAccess\('EOM'\)/);
});
