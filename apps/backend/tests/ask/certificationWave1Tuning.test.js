const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const tuning = require('../fixtures/certification/wave1-tuning.json');
const frozen = require('../fixtures/certification/wave1-frozen.json');
const core = require('../../scripts/lib/askFastPathCertification.js');
const { resolveAskOperation, ruleIdOfResolution, ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { correctKnownMisspellings } = require('../../src/services/ask/support/commonMisspellings.ts');
const { normalizeForRouting } = require('../../src/services/ask/support/routingNormalization.ts');
const cert = require('../../src/services/ask/fastPath/fastPathCertificates.ts');

// First certification wave (owner decision 2026-11-22, FRD §18 D22): DATA_POINT_READ, INVENTORY_LOOKUP, SELL_HOLD_RENT_ANALYSIS.
// These are TUNING prompts: they find rules to fix and can never certify one.
const resolvePrompt = (prompt) => {
  const raw = resolveAskOperation(correctKnownMisspellings(prompt));
  const resolution = /BOUNDARY$/.test(raw.operationId) ? raw : resolveAskOperation(normalizeForRouting(prompt));
  return { operationId: resolution.operationId, ruleId: resolution.operationId === 'GROUNDED_GUIDANCE' ? null : ruleIdOfResolution(resolution) };
};

test('the wave-1 prompts are tuning evidence: not human-confirmed, not sealed, with AI-assisted provenance recorded', () => {
  assert.equal(tuning.role, 'TUNING');
  assert.equal(tuning.humanConfirmed, false);
  assert.equal(tuning.provenance.reviewedBy, null);
  assert.equal(tuning.provenance.aiAssisted, true);
  // The certify runner refuses it as a sealed set (FR-EVAL-1b), so it cannot be used as certification evidence by mistake.
  assert.match(core.validateSealedSet(tuning).join(' '), /not marked humanConfirmed/);
});

test('every pool has positives, at least 30 adjacent and 30 cross-operation negatives, positives at most half, and no duplicate prompts', () => {
  const seen = new Set();
  for (const pool of tuning.pools) {
    const rows = tuning.rows.filter((row) => row.pool === pool);
    const count = (kind) => rows.filter((row) => row.kind === kind).length;
    assert.ok(count('ADJACENT_NEGATIVE') >= core.MIN_ADJACENT, `${pool} adjacent`);
    assert.ok(count('CROSS_OPERATION') >= core.MIN_CROSS, `${pool} cross`);
    assert.ok(count('POSITIVE') / rows.length <= core.MAX_POSITIVE_SHARE, `${pool} positive share`);
    for (const row of rows) { const key = `${pool}|${row.prompt.trim().toLowerCase()}`; assert.ok(!seen.has(key), `duplicate ${key}`); seen.add(key); }
  }
});

test('labels name registered operations or null, and a negative never expects its own pool operation', () => {
  for (const row of tuning.rows) {
    if (row.kind === 'POSITIVE') { assert.equal(row.expected, row.pool); continue; }
    assert.notEqual(row.expected, row.pool, row.prompt);
    assert.ok(row.expected === null || ASK_OPERATION_DEFINITIONS[row.expected], `${row.prompt}: unknown operation ${row.expected}`);
  }
});

// The behaviour this wave freezes: no rule of a wave-1 pool claims a prompt that belongs elsewhere (zero wrong claims on tuning).
test('no wave-1 rule claims a negative prompt', () => {
  const wrong = tuning.rows.filter((row) => row.kind !== 'POSITIVE').map((row) => ({ row, got: resolvePrompt(row.prompt) })).filter(({ row, got }) => got.operationId === row.pool && got.ruleId);
  assert.deepEqual(wrong.map(({ row, got }) => `${row.prompt} -> ${got.ruleId}`), []);
});

// Freeze: behaviour and thresholds do not move once the sealed shard is being authored.
test('the frozen rule versions and thresholds still match (a change ends the freeze and burns any shard that saw them)', () => {
  for (const [pool, rules] of Object.entries(frozen.ruleVersions)) {
    const current = Object.fromEntries(cert.FAST_PATH_RULES.filter((rule) => rule.operationId === pool).map((rule) => [rule.id, rule.version]));
    assert.deepEqual(current, rules, `${pool}: a rule changed after the freeze`);
  }
  assert.deepEqual(frozen.thresholds, { minTrials: core.MIN_TRIALS, maxError: core.MAX_ERROR, minAdjacentPerRule: core.MIN_ADJACENT, minCrossPerRule: core.MIN_CROSS, maxPositiveShare: core.MAX_POSITIVE_SHARE });
});
