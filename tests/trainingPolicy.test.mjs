import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../services/trainingPolicy.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const sandbox = { exports: {}, module: { exports: {} } };
vm.runInNewContext(compiled, sandbox);
const policy = sandbox.exports;
const module = { status: 'PUBLISHED', applicableOutletIds: ['SFD'], applicableRoles: ['Barista'], requiredSupervisedAttempts: 2 };

test('outlet- and role-scoped eligibility blocks irrelevant training', () => {
  assert.equal(policy.isTrainingEligible(module, 'Barista', 'SFD'), true);
  assert.equal(policy.isTrainingEligible(module, 'Kitchen', 'SFD'), false);
  assert.equal(policy.isTrainingEligible(module, 'Barista', 'B6'), false);
});
test('managers cannot act at another outlet unless operations-admin', () => {
  assert.equal(policy.canManagerActAtOutlet('SFD', 'B6'), false);
  assert.equal(policy.canManagerActAtOutlet('SFD', 'B6', true), true);
});
test('self-certification and non-passed certification are blocked', () => {
  assert.equal(policy.canCertifyAssignment('same', 'same', 'PASSED'), false);
  assert.equal(policy.canCertifyAssignment('manager', 'crew', 'LEARNING'), false);
  assert.equal(policy.canCertifyAssignment('manager', 'crew', 'PASSED'), true);
});
test('critical failures always force retraining', () => {
  assert.equal(policy.practicalResult({ criticalFailure: true, result: 'PASSED' }), 'RETRAINING_REQUIRED');
});
test('expired certifications and archived modules are correctly identified', () => {
  assert.equal(policy.certificationIsExpired(new Date('2020-01-01'), new Date('2021-01-01')), true);
  assert.equal(policy.canAssignModule({ status: 'ARCHIVED' }), false);
});
test('history remains connected to the exact module version', () => {
  assert.equal(policy.versionSnapshotId('coffee', 3), 'coffee_v3');
});
