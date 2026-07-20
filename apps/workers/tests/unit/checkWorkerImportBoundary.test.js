// apps/workers/tests/unit/checkWorkerImportBoundary.test.js
//
// W4 item 7: unit coverage for the Dockerfile sed-rule parser that backs
// scripts/check-worker-import-boundary.js. Uses synthetic Dockerfile
// snippets, not the real one, so this stays fast/deterministic and
// exercises the parser's escaping logic directly rather than only via
// "does it currently pass against the real Dockerfile" (which the script
// itself already proves when run — this covers the failure path too).

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseDockerfileSedRules,
  findImportViolationsFromSources,
  findMissingCopySources,
} = require('../../scripts/check-worker-import-boundary.js');

test('parseDockerfileSedRules extracts a single-line sed rule', () => {
  const dockerfile = `RUN sed -i 's/\\.\\.\\/\\.\\.\\/backend\\/src\\/services\\/foo/\\.\\.\\/shared\\/backend\\/services\\/foo/g' src/worker.ts`;
  const rules = parseDockerfileSedRules(dockerfile);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].file, 'src/worker.ts');
  assert.equal(rules[0].pattern, '../../backend/src/services/foo');
  assert.equal(rules[0].replacement, '../shared/backend/services/foo');
});

test('parseDockerfileSedRules follows backslash line continuations chained with &&', () => {
  const dockerfile = [
    `RUN sed -i 's/\\.\\.\\/backend\\/src\\/a/\\.\\/shared\\/backend\\/a/g' src/worker.ts && \\`,
    `    sed -i 's/\\.\\.\\/backend\\/src\\/b/\\.\\/shared\\/backend\\/b/g' src/worker.ts`,
  ].join('\n');
  const rules = parseDockerfileSedRules(dockerfile);
  assert.equal(rules.length, 2);
  assert.equal(rules[0].pattern, '../backend/src/a');
  assert.equal(rules[1].pattern, '../backend/src/b');
});

test('parseDockerfileSedRules drops comment-only lines inside a continuation, matching Docker\'s own joiner', () => {
  const dockerfile = [
    `RUN sed -i 's/\\.\\.\\/backend\\/src\\/a/\\.\\/shared\\/backend\\/a/g' \\`,
    `    # this comment must not become part of the file list`,
    `    src/worker.ts`,
  ].join('\n');
  const rules = parseDockerfileSedRules(dockerfile);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].file, 'src/worker.ts');
});

test('parseDockerfileSedRules applies one sed command to multiple listed files', () => {
  const dockerfile = [
    `RUN sed -i 's/\\.\\.\\/\\.\\.\\/\\.\\.\\/backend\\/src\\/services\\/notification\\.service/\\.\\.\\/shared\\/backend\\/services\\/notification\\.service/g' \\`,
    `    src/jobs/a.job.ts \\`,
    `    src/jobs/b.job.ts`,
  ].join('\n');
  const rules = parseDockerfileSedRules(dockerfile);
  assert.equal(rules.length, 2);
  assert.deepEqual(rules.map((r) => r.file).sort(), ['src/jobs/a.job.ts', 'src/jobs/b.job.ts']);
  assert.equal(rules[0].pattern, '../../../backend/src/services/notification.service');
});

test('findImportViolationsFromSources flags a backend import with no covering sed rule', () => {
  const entries = [
    { relFile: 'src/jobs/new.job.ts', source: `import { foo } from '../../../backend/src/services/foo';` },
  ];
  const violations = findImportViolationsFromSources(entries, new Map());
  assert.equal(violations.length, 1);
  assert.equal(violations[0].file, 'src/jobs/new.job.ts');
  assert.equal(violations[0].spec, '../../../backend/src/services/foo');
});

test('findImportViolationsFromSources does not flag a backend import that IS covered by a matching sed rule', () => {
  const entries = [
    { relFile: 'src/jobs/covered.job.ts', source: `import { foo } from '../../../backend/src/services/foo';` },
  ];
  const rulesByFile = new Map([
    ['src/jobs/covered.job.ts', [{ file: 'src/jobs/covered.job.ts', pattern: '../../../backend/src/services/foo', replacement: '../shared/backend/services/foo' }]],
  ]);
  const violations = findImportViolationsFromSources(entries, rulesByFile);
  assert.equal(violations.length, 0);
});

test('findImportViolationsFromSources ignores imports that never reach into backend/src', () => {
  const entries = [
    { relFile: 'src/jobs/local.job.ts', source: `import { foo } from '../lib/localHelper';\nimport { bar } from 'bullmq';` },
  ];
  const violations = findImportViolationsFromSources(entries, new Map());
  assert.equal(violations.length, 0);
});

test('findImportViolationsFromSources does not credit a sed rule registered for a different file', () => {
  const entries = [
    { relFile: 'src/jobs/uncovered.job.ts', source: `import { foo } from '../../../backend/src/services/foo';` },
  ];
  const rulesByFile = new Map([
    ['src/jobs/other.job.ts', [{ file: 'src/jobs/other.job.ts', pattern: '../../../backend/src/services/foo', replacement: '../shared/backend/services/foo' }]],
  ]);
  const violations = findImportViolationsFromSources(entries, rulesByFile);
  assert.equal(violations.length, 1);
});

test('findMissingCopySources reports a COPY source that does not exist on disk', () => {
  const missing = findMissingCopySources(['apps/backend/src/services/definitely-does-not-exist.ts']);
  assert.equal(missing.length, 1);
});

test('findMissingCopySources does not flag a COPY source that exists on disk', () => {
  // This file's own script lives under apps/workers, so pick a real,
  // stable backend file that's already part of the curated COPY list.
  const missing = findMissingCopySources(['apps/backend/src/config/workerExecutionPolicy.ts']);
  assert.equal(missing.length, 0);
});
