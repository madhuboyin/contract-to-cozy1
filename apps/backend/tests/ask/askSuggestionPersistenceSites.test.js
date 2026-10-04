const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const { scan, diff, unclassified, BASELINE } = require('../../scripts/ask-suggestion-sites.js');

// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN §5.3 / Phase 1: the persistence-boundary inventory is a baseline, not a
// guess. Every place that can persist an Ask result is a place compact follow-ups can escape the shared finalizer (Phase 2), so a
// new or removed site must be a conscious, reviewed change: re-run `node scripts/ask-suggestion-sites.js --write`, review the
// diff, and update the plan's inventory.

test('the set of files that persist an Ask result matches the reviewed baseline', () => {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).files;
  const problems = diff(scan().persistence, baseline);
  assert.deepEqual(problems, [], `persistence-boundary baseline drifted:\n${problems.join('\n')}`);
});

test('the baseline covers every lifecycle the plan names: normal, confirm, clarification, capture, retry/refresh, failure, session', () => {
  const files = Object.keys(JSON.parse(readFileSync(BASELINE, 'utf8')).files);
  for (const required of [
    'createAskExecution.ts', 'executeOperation.ts', 'askConfirm.ts', 'askClarification.ts', 'askCapture.ts', 'askRetry.ts', 'askSessions.ts', 'askFeedback.ts',
  ]) assert.ok(files.some((file) => file.endsWith(`/execution/${required}`)), `${required} must be inventoried`);
  assert.ok(files.some((file) => /handlers\/.*Confirm\.handler\.ts$/.test(file)), 'confirm handlers must be inventoried');
});

test('the persisted ledger field is carried by the main result-writing lifecycle sites (no silent drop on refresh/confirm/clarify)', () => {
  const read = (file) => readFileSync(resolve(__dirname, '../../src/services/ask', file), 'utf8');
  for (const file of ['execution/createAskExecution.ts', 'execution/executeOperation.ts', 'execution/askConfirm.ts', 'execution/askClarification.ts', 'execution/askCapture.ts']) {
    assert.match(read(file), /suggestedNextActions:/, `${file} must persist suggestedNextActions alongside suggestions`);
  }
});

test('a verified selection cannot take its operation or entity from the client (stored action wins)', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/execution/createAskExecution.ts'), 'utf8');
  const verified = source.slice(source.indexOf("suggestionResolution?.kind === 'VERIFIED') {"));
  assert.match(verified, /operationId: action\.operationId/);
  assert.match(verified, /entityId: action\.entityContext\.entityId/);
  assert.match(verified, /message: action\.message/);
  const from = source.indexOf('resolveSuggestedActionSelection({');
  const to = source.indexOf("suggestionResolution?.kind === 'REJECTED'");
  assert.ok(from > 0 && to > from);
  assert.doesNotMatch(source.slice(from, to), /launchContext/, 'resolution inputs must not include client launch context');
});

test('every file that persists an Ask result carries a reviewed finalizer classification', () => {
  assert.deepEqual(unclassified(scan().persistence), [], 'classify the new persistence site in scripts/ask-suggestion-sites.js (WIRED, VIA_EXECUTE_OPERATION, PENDING_INTERACTION, RECOVERY_PHASE_4, LEDGER_PRESERVING)');
  const files = JSON.parse(readFileSync(BASELINE, 'utf8')).files;
  assert.deepEqual(Object.entries(files).filter(([, info]) => info.finalizer === 'UNCLASSIFIED' || !info.note).map(([file]) => file), []);
});

test('the shared finalizer is wired at every seam classified WIRED, and nothing else constructs final typed actions', () => {
  const srcRoot = resolve(__dirname, '../../src');
  const files = JSON.parse(readFileSync(BASELINE, 'utf8')).files;
  for (const [file, info] of Object.entries(files)) {
    if (info.finalizer !== 'WIRED') continue;
    const source = readFileSync(resolve(__dirname, '../..', file), 'utf8');
    assert.match(source, /finalizeSuggestedNextActions\(/, `${file} is classified WIRED but does not call the shared finalizer`);
  }
  // Only the finalizer (via materializeSuggestedNextAction) may mint a typed action; persistence sites merely carry the field.
  const offenders = [];
  const { readdirSync, statSync } = require('node:fs');
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    if (name === 'graphify-out' || name === 'node_modules') return [];
    return statSync(path).isDirectory() ? walk(path) : (name.endsWith('.ts') ? [path] : []);
  });
  for (const file of walk(resolve(srcRoot, 'services'))) {
    const source = readFileSync(file, 'utf8');
    if (/materializeSuggestedNextAction\(/.test(source) && !/suggestedActions\/(finalizeSuggestedNextActions|suggestedNextActionCandidate)\.ts$/.test(file.replace(/\\/g, '/'))) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});
