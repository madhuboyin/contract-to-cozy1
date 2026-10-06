// Worker gate (slice 3a, docs/architecture/ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md section 12 F4): the production worker image REPLACES seven backend
// modules with the stubs in apps/workers/stubs (scripts/build-worker-backend-overrides.js). The development worker does not, so a handler that only works
// with the real modules would pass every other test and fail in production. This loads the DIY completion adapters and the real maintenance and home event
// services with those same stubs applied, and checks they load and that the injected handler path still runs. It does not run the transitive completion
// side effects (that is the real-Postgres run, slice 3c).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://x@127.0.0.1:1/scratch_stub_check';
process.env.NODE_ENV = 'test';
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');

const workersRoot = path.resolve(__dirname, '../..');
const backendSrc = path.resolve(workersRoot, '../backend/src');
const overridesScript = fs.readFileSync(path.join(workersRoot, 'scripts/build-worker-backend-overrides.js'), 'utf8');
const overrides = [...overridesScript.matchAll(/'([^']+\.ts)':\s*'([^']+)\.js'/g)].map((m) => ({ stub: path.join(workersRoot, 'stubs', m[1]), backend: path.join(backendSrc, `${m[2]}.ts`) }));

test('the override list is the seven modules this check assumes (if the image adds one, this test must be reviewed)', () => {
  assert.equal(overrides.length, 7);
  for (const { stub, backend } of overrides) { assert.ok(fs.existsSync(stub), stub); assert.ok(fs.existsSync(backend), backend); }
});

test('the DIY completion adapters and the services they wrap load with the production stubs applied, and the handler path runs', async () => {
  const cache = (file, exports) => { require.cache[file] = { id: file, filename: file, loaded: true, exports }; };
  // The image compiles each stub INTO the backend tree at the module's own path, so the stub's relative imports (for example `../lib/prisma`) resolve
  // against the backend. Do the same: transpile the stub and evaluate it as a module located at the backend file it replaces.
  const ts = require('typescript');
  const Module = require('node:module');
  const evaluateAsBackendModule = ({ stub, backend }) => {
    const output = ts.transpileModule(fs.readFileSync(stub, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const mod = new Module(backend, null);
    mod.filename = backend; mod.paths = Module._nodeModulePaths(path.dirname(backend));
    require.cache[backend] = mod;
    mod._compile(output, backend);
    mod.loaded = true;
  };
  cache(path.join(backendSrc, 'lib/prisma.ts'), { prisma: { propertyMaintenanceTask: { findUnique: async () => null }, homeEvent: { findFirst: async () => null }, diyProject: { updateMany: async () => ({ count: 1 }) }, domainEvent: { findUnique: async () => null, update: async () => ({}) } } });
  for (const override of overrides) evaluateAsBackendModule(override);

  const adapters = require(path.join(backendSrc, 'services/diy/diyCompletionEffectsAdapters.ts'));
  assert.equal(typeof adapters.processDiyProjectCompletedEventWithDefaults, 'function');
  assert.equal(typeof adapters.defaultDiyCompletionEffectDeps.completeTask, 'function');
  const reconcile = require(path.join(backendSrc, 'services/diy/diyTaskReconciliationAdapters.ts'));
  assert.equal(typeof reconcile.processDiyTaskReconciliationEventWithDefaults, 'function');
  assert.equal(typeof reconcile.defaultDiyTaskReconciliationDeps.reconcileProject, 'function');
  const maintenance = require(path.join(backendSrc, 'services/PropertyMaintenanceTask.service.ts'));
  assert.equal(typeof maintenance.completeMaintenanceTaskForDiyOutbox, 'function');

  // The real handler through the real adapters on a project with no linked task and a missing home event service result: it must reach the home event
  // step (and fail there on the stubbed prisma, which has no homeEvent.create), proving the wiring executes under the stubs.
  await assert.rejects(
    adapters.processDiyProjectCompletedEventWithDefaults({ id: 'ev-1', payload: { projectId: 'p1', propertyId: 'prop-1', actorUserId: 'dana', completedAt: '2026-10-06T12:00:00.000Z', title: 'Paint', category: 'PAINTING', maintenanceTaskId: null } }),
    (error) => error.name === 'DiyCompletionEffectsFailed' && /HOME_EVENT/.test(error.message),
  );
});

test('the reconciliation handler path runs under the production stubs too: a malformed snapshot is a terminal error, and a deleted task is the typed skip', async () => {
  const reconcile = require(path.join(backendSrc, 'services/diy/diyTaskReconciliationAdapters.ts'));
  await assert.rejects(reconcile.processDiyTaskReconciliationEventWithDefaults({ id: 'ev-1', payload: { taskId: '' } }), (error) => error.terminal === true && error.code === 'SNAPSHOT_INVALID');
  const payload = { taskId: 'gone', propertyId: 'prop-1', occurrenceId: 'o1', actorUserId: 'dana', completedAt: '2026-10-06T12:00:00.000Z', fulfillmentMode: 'DIY', projectIds: ['pA'] };
  assert.deepEqual(await reconcile.processDiyTaskReconciliationEventWithDefaults({ id: 'ev-1', payload }), { result: 'TASK_DELETED', projectOutcomes: {} });
});
