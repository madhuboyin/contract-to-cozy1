const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// The typed table for the missing-context keys a guided journey carries (continuation FRD section 18). It fails closed: an unlisted key is generic
// copy that never shows the raw key, an incomplete entry is treated as unlisted, and a new key a producer writes fails the coverage test below until
// it is classified.

const { GUIDANCE_CONTEXT_KEYS, SKIPPED_STEP_PREFIX, skippedStepContextKey, skippedStepKeyFrom } = require('../../src/services/guidanceEngine/guidanceContextKeys.ts');
const table = require('../../src/services/ask/askGuidanceContextKeys.ts');
const { guidanceJourneyContinuation } = require('../../src/services/ask/askOrchestrator.service.ts');

const SRC = path.join(__dirname, '../../src');
function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

test('every key the backend writes is classified, and the shipped table is valid', () => {
  assert.deepEqual(table.validateGuidanceContextKeyTable(), []);
  for (const key of Object.values(GUIDANCE_CONTEXT_KEYS)) assert.equal(table.classifyGuidanceContextKey(key).known, true, `${key} is produced but not classified`);
  assert.deepEqual(Object.keys(table.ASK_GUIDANCE_CONTEXT_KEYS).sort(), Object.values(GUIDANCE_CONTEXT_KEYS).sort(), 'the table lists exactly the produced keys');
  assert.equal(table.classifyGuidanceContextKey(skippedStepContextKey('compare_action_options')).known, true);
  assert.equal(skippedStepKeyFrom(`${SKIPPED_STEP_PREFIX}x`), 'x');
  assert.equal(skippedStepKeyFrom('refresh_signal_context'), null);
});

test('no producer writes a missing-context key as a string literal: a new key must be added to guidanceContextKeys.ts, which this test then requires to be classified', () => {
  const literal = /missingContextKeys\s*[:=][^;\n]*\[[^\]\n]*['"`][A-Za-z_:]+['"`]|missingContextKeys\.push\(\s*['"`]|['"`]skipped:|['"`]refresh_signal_context['"`]|['"`]inventory_item_link['"`]/;
  const offenders = sourceFiles(SRC)
    .filter((file) => !file.endsWith(path.join('guidanceEngine', 'guidanceContextKeys.ts')) && !file.endsWith(path.join('ask', 'askGuidanceContextKeys.ts')))
    .filter((file) => !file.includes(`${path.sep}tests${path.sep}`))
    .flatMap((file) => fs.readFileSync(file, 'utf8').split('\n').map((line, index) => ({ file: path.relative(SRC, file), index: index + 1, line })).filter(({ line }) => literal.test(line) && !/^\s*\/\//.test(line)));
  assert.deepEqual(offenders.map((o) => `${o.file}:${o.index}`), [], 'use the constants in guidanceContextKeys.ts');
});

test('an unlisted key is generic copy and is never shown raw; the raw key is logged once for coverage analysis', () => {
  const classified = table.classifyGuidanceContextKey('review_current_policy_context');
  assert.deepEqual({ known: classified.known, label: classified.label, explanation: classified.explanation, type: classified.resolution.type }, { known: false, label: 'More information', explanation: 'This journey needs additional information that Ask can’t collect yet.', type: 'UNAVAILABLE' });
  assert.equal(JSON.stringify(classified).includes('review_current_policy_context'), false);
  const logger = require('../../src/lib/logger.ts').logger;
  const original = logger.warn;
  const logged = [];
  logger.warn = (payload) => { logged.push(payload); };
  try {
    table.reportUnclassifiedGuidanceContextKey('weird_key_1');
    table.reportUnclassifiedGuidanceContextKey('weird_key_1');
  } finally { logger.warn = original; }
  assert.deepEqual(logged, [{ guidanceContextKey: 'weird_key_1' }], 'logged once with the raw key');
  assert.equal(table.classifyGuidanceContextKey('constructor').known, false, 'inherited object keys are not entries');
});

test('the skipped-step marker names the step when the journey\'s steps are known', () => {
  const labels = new Map([['compare_action_options', 'Compare Act Now vs Delay']]);
  assert.equal(table.classifyGuidanceContextKey('skipped:compare_action_options', labels).label, 'Skipped: Compare Act Now vs Delay');
  assert.equal(table.classifyGuidanceContextKey('skipped:other').label, 'A skipped step');
});

test('validation fails closed: each missing piece of an entry is reported, and a broken entry is treated as unlisted', () => {
  const ok = { label: 'A', explanation: 'B' };
  assert.deepEqual(table.validateGuidanceContextKeyTable({ k: { ...ok, resolution: { type: 'UNAVAILABLE' } } }), []);
  assert.match(table.validateGuidanceContextKeyTable({ k: { label: '', explanation: 'B', resolution: { type: 'UNAVAILABLE' } } })[0], /missing homeowner label/);
  assert.match(table.validateGuidanceContextKeyTable({ k: { label: 'A', explanation: ' ', resolution: { type: 'UNAVAILABLE' } } })[0], /missing homeowner explanation/);
  assert.match(table.validateGuidanceContextKeyTable({ k: { ...ok } })[0], /missing resolution/);
  assert.match(table.validateGuidanceContextKeyTable({ k: { ...ok, resolution: { type: 'WAT' } } })[0], /unknown resolution type/);
  assert.equal(table.validateGuidanceContextKeyTable({ k: { ...ok, resolution: { type: 'CAPTURE_FIELD', schema: 'S', field: 'f', canonicalOwner: '' } } }).length, 1);
  assert.equal(table.validateGuidanceContextKeyTable({ k: { ...ok, resolution: { type: 'CAPTURE_FIELD', schema: 'S', field: 'f', canonicalOwner: 'Property' } } }).length, 0);
  assert.equal(table.validateGuidanceContextKeyTable({ k: { ...ok, resolution: { type: 'RUN_OPERATION', operationId: 'NOT_AN_OPERATION', message: 'm', label: 'l' } } }).length, 1);
  assert.equal(table.validateGuidanceContextKeyTable({ k: { ...ok, resolution: { type: 'RUN_OPERATION', operationId: 'DO_NOTHING_SIMULATION_RUN', message: '', label: 'l' } } }).length, 1);
  table.ASK_GUIDANCE_CONTEXT_KEYS.temp_broken_key = { label: 'x', explanation: '', resolution: { type: 'UNAVAILABLE' } };
  try { assert.equal(table.classifyGuidanceContextKey('temp_broken_key').known, false); } finally { delete table.ASK_GUIDANCE_CONTEXT_KEYS.temp_broken_key; }
});

// ── in the journey workspace ──
const step = (key, status, order, extra = {}) => ({ id: `id-${key}`, journeyId: 'j1', stepKey: key, stepOrder: order, label: `Step ${key}`, status, skippedReasonCode: null, toolKey: 'coverage-intelligence', governanceJson: { safetyTier: 'LOW_CONSEQUENCE' }, ...extra });
const journey = (missing) => ({
  id: 'j1', propertyId: 'p1', status: 'ACTIVE', issueDomain: 'ASSET_LIFECYCLE', executionReadiness: 'NEEDS_CONTEXT', isLowContext: true, primarySignalId: 's', primarySignal: { id: 's', signalIntentFamily: 'lifecycle_end_or_past_life' },
  inventoryItem: { name: 'Water heater' }, currentStepKey: 'b', missingContextKeys: missing, steps: [step('a', 'SKIPPED', 1), step('b', 'IN_PROGRESS', 2)], evidences: [],
});
const workspace = (result) => result.blocks.find((block) => block.id === 'guidance-journey-workspace');

test('the workspace names what is missing in words, says when Ask cannot collect it, and never shows a raw key', () => {
  const result = guidanceJourneyContinuation(journey(['refresh_signal_context', 'skipped:a', 'mystery_a', 'mystery_b']), 'p1', { requestedJourneyId: 'j1', canContribute: true });
  const guide = workspace(result);
  const facts = Object.fromEntries(guide.main.facts.map((fact) => [fact.label, fact.value]));
  assert.match(facts['Missing: Up-to-date information'], /gone out of date.*Ask can’t collect this yet\./);
  assert.match(facts['Missing: Skipped: Step a'], /You skipped a step this plan relies on/);
  assert.equal(guide.main.facts.filter((fact) => fact.label === 'Missing: More information').length, 1, 'two unclassified keys are one generic line');
  assert.equal(guide.chips[0].label, 'Needs information Ask can’t collect yet');
  const text = JSON.stringify(result);
  for (const raw of ['refresh_signal_context', 'skipped:a', 'mystery_a', 'mystery_b']) assert.equal(text.includes(raw), false, raw);
  const unknownOnly = guidanceJourneyContinuation(journey(['mystery_a', 'mystery_b']), 'p1', { requestedJourneyId: 'j1' });
  assert.equal(workspace(unknownOnly).main.facts.filter((fact) => fact.label === 'Missing: More information').length, 1, 'unknown keys collapse into one line');
});

test('a key an Ask operation resolves becomes a governed action for a contributor, offered after the step\'s own action; others see none', () => {
  table.ASK_GUIDANCE_CONTEXT_KEYS.temp_resolvable = { label: 'Your policy', explanation: 'The policy on file is out of date.', minimumRole: 'CONTRIBUTOR', resolution: { type: 'RUN_OPERATION', operationId: 'DO_NOTHING_SIMULATION_RUN', message: 'Run the do-nothing simulation.', label: 'Update it here' } };
  try {
    const contributor = workspace(guidanceJourneyContinuation(journey(['temp_resolvable']), 'p1', { requestedJourneyId: 'j1', canContribute: true }));
    const resolve = contributor.actions.find((action) => action.id === 'resolve-missing-context-1');
    assert.deepEqual({ t: resolve.interactionType, o: resolve.operationId, m: resolve.message, l: resolve.label }, { t: 'START_WORKFLOW', o: 'DO_NOTHING_SIMULATION_RUN', m: 'Run the do-nothing simulation.', l: 'Update it here' });
    assert.equal(contributor.chips[0].label, 'Add 1 detail to continue');
    const viewer = workspace(guidanceJourneyContinuation(journey(['temp_resolvable']), 'p1', { requestedJourneyId: 'j1', canContribute: false }));
    assert.equal(viewer.actions.some((action) => action.id.startsWith('resolve-missing-context')), false);
    assert.equal(viewer.chips[0].label, 'Needs information Ask can’t collect yet');
  } finally { delete table.ASK_GUIDANCE_CONTEXT_KEYS.temp_resolvable; }
});
