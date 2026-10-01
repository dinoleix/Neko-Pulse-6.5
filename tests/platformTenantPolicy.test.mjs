import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../services/platformTenantPolicy.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const sandbox = { exports: {}, module: { exports: {} } };
vm.runInNewContext(compiled, sandbox);
const policy = sandbox.exports;

test('tenant IDs are normalised and safely validated', () => {
  const valid = policy.validateTenantRegistration({ id: '  North-Cafe  ', displayName: ' North   Café ' });
  assert.equal(valid.value.id, 'north-cafe');
  assert.equal(valid.value.displayName, 'North Café');
  assert.equal(policy.validateTenantRegistration({ id: 'Green Neko', displayName: 'Green Neko' }).ok, false);
  assert.equal(policy.validateTenantRegistration({ id: 'ab', displayName: 'A business' }).ok, false);
});

test('tenant status transitions cannot bypass onboarding or suspension', () => {
  assert.equal(policy.canTransitionTenantStatus('SETUP', 'ACTIVE'), true);
  assert.equal(policy.canTransitionTenantStatus('SETUP', 'SUSPENDED'), true);
  assert.equal(policy.canTransitionTenantStatus('ACTIVE', 'SUSPENDED'), true);
  assert.equal(policy.canTransitionTenantStatus('SUSPENDED', 'ACTIVE'), true);
  assert.equal(policy.canTransitionTenantStatus('ACTIVE', 'SETUP'), false);
  assert.equal(policy.canTransitionTenantStatus('SUSPENDED', 'SETUP'), false);
});
