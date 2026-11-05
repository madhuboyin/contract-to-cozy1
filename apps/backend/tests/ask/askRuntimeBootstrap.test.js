const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { existsSync, readdirSync, readFileSync, statSync } = require('node:fs');
const { join, relative, resolve } = require('node:path');

// Findings Implementation Plan, Phase 2: handler registration is an explicit bootstrap contract, not an accident of importing the facade.
const BACKEND = resolve(__dirname, '../..');
const ASK_DIR = join(BACKEND, 'src/services/ask');
const BOOTSTRAP = join(ASK_DIR, 'askRuntimeBootstrap.ts');
const bootstrapSource = readFileSync(BOOTSTRAP, 'utf8');

function tsFiles(dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}
const registers = (file) => /register(?:Confirm)?CapabilityHandler\(/.test(readFileSync(file, 'utf8'));

// A fresh process is an isolated, empty registry: nothing has loaded the facade or any handler.
function inFreshProcess(body) {
  const script = `
    process.env.TS_NODE_TRANSPILE_ONLY = 'true';
    require('ts-node/register/transpile-only');
    const emit = (value) => process.stdout.write('\\nRESULT:' + JSON.stringify(value) + '\\n');
    ${body}
  `;
  const stdout = execFileSync(process.execPath, ['-e', script], { cwd: BACKEND, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  const line = stdout.split('\n').reverse().find((entry) => entry.startsWith('RESULT:'));
  assert.ok(line, `child produced no result:\n${stdout.slice(-800)}`);
  return JSON.parse(line.slice('RESULT:'.length));
}

test('the manifest lists exactly the registration-bearing handler and lifecycle modules on disk', () => {
  const onDisk = [...tsFiles(join(ASK_DIR, 'handlers')), ...tsFiles(join(ASK_DIR, 'execution'))]
    .filter(registers)
    .map((file) => relative(ASK_DIR, file).replace(/\.ts$/, ''))
    .sort();
  const entries = [...bootstrapSource.matchAll(/\{ id: '([^']+)', load: \(\) => require\('\.\/([^']+)'\) \}/g)];
  const ids = entries.map((match) => match[1]);
  assert.deepEqual(entries.filter((match) => match[1] !== match[2]).map((match) => match[1]), [], 'each id equals the module it requires');
  assert.equal(new Set(ids).size, ids.length, 'no module is listed twice');
  const missing = onDisk.filter((id) => !ids.includes(id));
  const extra = ids.filter((id) => !onDisk.includes(id));
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, 'a registering module missing from the manifest, or a listed module that no longer registers');
  for (const id of ids) assert.ok(existsSync(join(ASK_DIR, `${id}.ts`)), `${id} exists`);
  assert.ok(ids.length > 100, `the manifest is not empty (${ids.length})`);
});

test('from an empty process, nothing is registered until the bootstrap runs, and one run makes every adapter resolve', () => {
  const result = inFreshProcess(`
    const sockets = () => process._getActiveHandles().filter((handle) => handle.constructor.name === 'Socket' && (handle.connecting || handle.remoteAddress)).length;
    const before = sockets();
    const boot = require('./src/services/ask/askRuntimeBootstrap.ts');
    const afterImport = sockets();
    const emptyIssues = boot.validateAskRuntimeRegistration().length;
    const first = boot.initializeAskRuntime();
    const second = boot.initializeAskRuntime();
    emit({ importOpenedSockets: afterImport - before, emptyIssues, firstIssues: first.issues.length, sameResult: first === second,
           afterIssues: boot.validateAskRuntimeRegistration().length });
  `);
  assert.equal(result.importOpenedSockets, 0, 'importing the bootstrap opens no network connection (database or Redis) by itself');
  assert.ok(result.emptyIssues > 100, `an unbootstrapped process reports missing handlers (${result.emptyIssues})`);
  assert.equal(result.firstIssues, 0, 'every operation adapter and every domain command confirm adapter resolves');
  assert.equal(result.sameResult, true, 'the second initialization is harmless and returns the first result');
  assert.equal(result.afterIssues, 0, 'a repeated load registers nothing twice');
});

// Handlers import each other, so omitting a module that another module loads would still register it. The omitted entry must be one that nothing
// else imports, found from the real import statements rather than assumed.
function manifestEntryNothingElseImports() {
  const ids = [...bootstrapSource.matchAll(/\{ id: '([^']+)'/g)].map((match) => match[1]);
  const sources = tsFiles(join(BACKEND, 'src')).filter((file) => file !== BOOTSTRAP).map((file) => readFileSync(file, 'utf8'));
  const importedBy = (id) => {
    const base = id.split('/').pop();
    return sources.some((source) => new RegExp(`from\\s+'[^']*/${base}'|import\\s+'[^']*/${base}'|require\\('[^']*/${base}'\\)`).test(source));
  };
  return ids.filter((id) => !importedBy(id)).sort()[0];
}

test('a deliberately omitted manifest entry is reported before any invocation', () => {
  const omitted = manifestEntryNothingElseImports();
  assert.ok(omitted, 'at least one registering module is loaded only by the manifest');
  const result = inFreshProcess(`
    const boot = require('./src/services/ask/askRuntimeBootstrap.ts');
    const subset = boot.ASK_HANDLER_MANIFEST.filter((entry) => entry.id !== ${JSON.stringify(omitted)});
    boot.loadAskHandlerManifest(subset);
    emit({ total: boot.ASK_HANDLER_MANIFEST.length, subset: subset.length, issues: boot.validateAskRuntimeRegistration(),
           errorName: new boot.AskRuntimeBootstrapError(['x']).name });
  `);
  assert.equal(result.subset, result.total - 1);
  assert.ok(result.issues.length > 0, `omitting ${omitted} leaves a registration gap that is reported`);
  assert.ok(result.issues.every((issue) => /no (?:confirm )?capability handler registered for adapter/.test(issue)), result.issues.slice(0, 3).join('\n'));
  assert.equal(result.errorName, 'AskRuntimeBootstrapError');
});

test('a duplicate registration is reported, not silently accepted', () => {
  const result = inFreshProcess(`
    const reg = require('./src/services/ask/capabilityHandlerRegistry.ts');
    reg.registerCapabilityHandler('dup.adapter', async () => ({}));
    reg.registerCapabilityHandler('dup.adapter', async () => ({}));
    emit(reg.validateCapabilityHandlerRegistry().filter((issue) => issue.startsWith('dup.adapter')));
  `);
  assert.deepEqual(result, ['dup.adapter: duplicate capability handler registration']);
});

test('every caller of the invocation entry points is a reviewed one', () => {
  const callers = tsFiles(join(BACKEND, 'src'))
    .filter((file) => /\b(?:confirmCapabilityInvoke|capabilityInvoke)\(/.test(readFileSync(file, 'utf8')))
    .map((file) => relative(join(BACKEND, 'src'), file))
    .filter((file) => !/^services\/ask\/(?:capabilityHandlerRegistry|confirmCapabilityHandlerRegistry|askRuntimeBootstrap)\.ts$/.test(file))
    .sort();
  assert.deepEqual(callers, ['services/ask/execution/askConfirm.ts', 'services/ask/execution/executeOperation.ts'], 'a new direct caller must be reviewed and bootstrap the runtime');
});

test('the supported entry points bootstrap explicitly, and the workers process never invokes Ask capabilities', () => {
  const index = readFileSync(join(BACKEND, 'src/index.ts'), 'utf8');
  assert.match(index, /import \{ initializeAskRuntime \} from '\.\/services\/ask\/askRuntimeBootstrap';/);
  assert.match(index, /^initializeAskRuntime\(\);$/m);
  assert.ok(index.indexOf('initializeAskRuntime();') < index.indexOf('const askRegistryIssues'), 'bootstrap runs before the aggregate registry validation');
  const facade = readFileSync(join(ASK_DIR, 'askOrchestrator.service.ts'), 'utf8');
  assert.match(facade, /^loadAskHandlerManifest\(\);$/m, 'the facade loads the manifest so every existing importer keeps working');

  const workerFiles = tsFiles(resolve(BACKEND, '../workers/src'));
  assert.ok(workerFiles.length > 0);
  const offenders = workerFiles.filter((file) => /askOrchestrator|askRuntimeBootstrap|capabilityInvoke|confirmCapabilityInvoke|capabilityHandlerRegistry/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map((file) => relative(BACKEND, file)), []);
});

test('a direct script that loads the invocation registries also bootstraps the runtime', () => {
  const scriptDirs = [join(BACKEND, 'scripts'), join(BACKEND, 'src/scripts')];
  const scripts = scriptDirs.flatMap((dir) => (existsSync(dir) ? readdirSync(dir).map((name) => join(dir, name)) : []))
    .filter((file) => /\.(?:js|ts)$/.test(file));
  const offenders = scripts.filter((file) => {
    const source = readFileSync(file, 'utf8');
    return /capabilityHandlerRegistry|confirmCapabilityHandlerRegistry/.test(source) && !/askRuntimeBootstrap/.test(source);
  });
  assert.deepEqual(offenders.map((file) => relative(BACKEND, file)), []);
});
