// apps/workers/tests/unit/checkWorkerImportBoundary.test.js
//
// Unit coverage for the worker/backend import boundary. The current Docker
// build consumes the compiled backend artifact; legacy COPY-map helpers stay
// covered because they also validate synthetic Dockerfile instructions.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  parseDockerfileCopyRules,
  resolveAvailableSharedModules,
  findImportViolationsFromSources,
  findCopiedRelativeImportViolationsFromSources,
  findMissingCopySources,
  usesCompiledBackendArtifact,
  DOCKERFILE_PATH,
  DOCKER_TSCONFIG_PATH,
} = require('../../scripts/check-worker-import-boundary.js');

test('parseDockerfileCopyRules extracts a single-source, directory-destination COPY', () => {
  const dockerfile = `COPY apps/backend/src/config/workerJobRegistry.ts src/shared/backend/config/`;
  const rules = parseDockerfileCopyRules(dockerfile);
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].sources, ['apps/backend/src/config/workerJobRegistry.ts']);
  assert.equal(rules[0].dest, 'src/shared/backend/config/');
});

test('parseDockerfileCopyRules follows backslash line continuations for a multi-source COPY', () => {
  const dockerfile = [
    `COPY apps/backend/src/services/a.ts \\`,
    `     apps/backend/src/services/b.ts \\`,
    `     src/shared/backend/services/`,
  ].join('\n');
  const rules = parseDockerfileCopyRules(dockerfile);
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].sources, ['apps/backend/src/services/a.ts', 'apps/backend/src/services/b.ts']);
  assert.equal(rules[0].dest, 'src/shared/backend/services/');
});

test('parseDockerfileCopyRules drops comment-only lines inside a continuation, matching Docker\'s own joiner', () => {
  const dockerfile = [
    `COPY apps/backend/src/services/a.ts \\`,
    `     # this comment must not become part of the source list`,
    `     src/shared/backend/services/`,
  ].join('\n');
  const rules = parseDockerfileCopyRules(dockerfile);
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].sources, ['apps/backend/src/services/a.ts']);
});

test('parseDockerfileCopyRules ignores stage-to-stage --from= copies', () => {
  const dockerfile = `COPY --from=builder /app/apps/workers/dist ./dist`;
  const rules = parseDockerfileCopyRules(dockerfile);
  assert.equal(rules.length, 0);
});

test('resolveAvailableSharedModules exposes a directory-destination COPY source under its dest dir, extension stripped', () => {
  const available = resolveAvailableSharedModules([
    { sources: ['apps/backend/src/config/workerJobRegistry.ts'], dest: 'src/shared/backend/config/' },
  ]);
  assert.ok(available.has('src/shared/backend/config/workerJobRegistry'));
});

test('resolveAvailableSharedModules treats a single source with a non-slash-terminated, differently-named dest as a rename (stub swap)', () => {
  const available = resolveAvailableSharedModules([
    { sources: ['apps/workers/stubs/job-queue-service.ts'], dest: 'src/shared/backend/services/JobQueue.service.ts' },
  ]);
  assert.ok(available.has('src/shared/backend/services/JobQueue.service'));
  assert.equal(available.size, 1);
});

test('resolveAvailableSharedModules ignores COPY rules whose dest is outside src/shared/', () => {
  const available = resolveAvailableSharedModules([
    { sources: ['apps/workers/package.json'], dest: './apps/workers/package.json' },
  ]);
  assert.equal(available.size, 0);
});

test('real Docker build uses the complete compiled backend artifact', () => {
  assert.equal(
    usesCompiledBackendArtifact(
      fs.readFileSync(DOCKERFILE_PATH, 'utf8'),
      fs.readFileSync(DOCKER_TSCONFIG_PATH, 'utf8'),
    ),
    true,
  );
});

test('findImportViolationsFromSources flags an @worker-shared import with no matching COPY destination', () => {
  const entries = [
    { relFile: 'src/jobs/new.job.ts', source: `import { foo } from '@worker-shared/services/foo';` },
  ];
  const violations = findImportViolationsFromSources(entries, new Set());
  assert.equal(violations.length, 1);
  assert.equal(violations[0].file, 'src/jobs/new.job.ts');
  assert.equal(violations[0].spec, '@worker-shared/services/foo');
});

test('findImportViolationsFromSources does not flag an @worker-shared import that IS covered by a COPY destination', () => {
  const entries = [
    { relFile: 'src/jobs/covered.job.ts', source: `import { foo } from '@worker-shared/services/foo';` },
  ];
  const available = new Set(['src/shared/backend/services/foo']);
  const violations = findImportViolationsFromSources(entries, available);
  assert.equal(violations.length, 0);
});

test('findImportViolationsFromSources resolves a copied directory through its index module', () => {
  const entries = [
    {
      relFile: 'src/jobs/covered-directory.job.ts',
      source: `import { foo } from '@worker-shared/modules/contracts';`,
    },
  ];
  const available = new Set([
    'src/shared/backend/modules/contracts/index',
  ]);
  const violations = findImportViolationsFromSources(entries, available);
  assert.equal(violations.length, 0);
});

test('findImportViolationsFromSources ignores imports that are not @worker-shared', () => {
  const entries = [
    { relFile: 'src/jobs/local.job.ts', source: `import { foo } from '../lib/localHelper';\nimport { bar } from 'bullmq';` },
  ];
  const violations = findImportViolationsFromSources(entries, new Set());
  assert.equal(violations.length, 0);
});

test('copied backend relative imports fail when their image sibling is absent', () => {
  const entries = [{
    sourceFile: 'apps/backend/src/refinanceRadar/service.ts',
    imageFile: 'src/shared/backend/refinanceRadar/service.ts',
    source: `import type { Input } from './validators/input.validators';`,
  }];
  const violations = findCopiedRelativeImportViolationsFromSources(
    entries,
    new Set(['src/shared/backend/refinanceRadar/service']),
  );
  assert.deepEqual(violations, [{
    file: 'apps/backend/src/refinanceRadar/service.ts',
    spec: './validators/input.validators',
    expectedImageModule:
      'src/shared/backend/refinanceRadar/validators/input.validators',
  }]);
});

test('copied backend relative imports pass when the image sibling is copied', () => {
  const entries = [{
    sourceFile: 'apps/backend/src/refinanceRadar/service.ts',
    imageFile: 'src/shared/backend/refinanceRadar/service.ts',
    source: `import type { Input } from './validators/input.validators';`,
  }];
  const available = new Set([
    'src/shared/backend/refinanceRadar/service',
    'src/shared/backend/refinanceRadar/validators/input.validators',
  ]);
  assert.equal(
    findCopiedRelativeImportViolationsFromSources(entries, available).length,
    0,
  );
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
