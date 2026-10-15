const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Presentation Quality 3A: a small fixture runner. A fixture declares what a homeowner asked, which pattern and profile the answer
// is, and the semantic expectations; the runner calls the real pure builder and asserts them. Semantic assertions are used rather than
// payload snapshots so a copy edit does not break a test that is really about behavior.

const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { evaluatePresentationQuality } = require('../../src/services/ask/presentation/evaluatePresentationQuality.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

const PATTERNS = [
  'DIRECT_ANSWER', 'PRIORITIZED_LIST', 'RECORD_EXPLORER', 'COMPARISON', 'TIMELINE', 'GUIDE', 'DOCUMENT_EVIDENCE', 'MONITOR', 'EMPTY_ERROR_RECOVERY',
];

/**
 * fixture = {
 *   id, pattern (one of PATTERNS), profile (AskPresentationProfile), message, operationId?,
 *   build(): AskOperationResult,
 *   expect: {
 *     status?: string | string[],
 *     directAnswer: RegExp,              // matched against the first block's title + body
 *     maxBlocks?: number,                // simple answers stay simple
 *     requiredBlockTypes?: string[],     // trust: evidence / assumptions / boundary
 *     degradation?: 'NONE' | 'EMPTY' | 'PARTIAL' | 'ERROR',
 *     issues?: string[],                 // evaluator codes expected (default none)
 *     allowMultiplePrimaryActions?: boolean, material?: boolean, comparisonBlockIds?: string[],
 *     check?: (result) => void,          // fixture-specific assertions
 *   }
 * }
 */
function runFixture(fixture) {
  assert.ok(PATTERNS.includes(fixture.pattern), `${fixture.id}: unknown pattern ${fixture.pattern}`);
  const result = fixture.build();
  const { expect: want } = fixture;
  assert.ok(result && Array.isArray(result.blocks) && result.blocks.length > 0, `${fixture.id}: no blocks`);
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);

  if (want.status) assert.ok([].concat(want.status).includes(result.status), `${fixture.id}: status ${result.status}`);

  const first = result.blocks[0];
  const lead = [first.title, first.body, first.headline, first.supportLine].filter(Boolean).join(' ');
  assert.match(lead, want.directAnswer, `${fixture.id}: the first block does not answer first`);

  if (want.maxBlocks) assert.ok(result.blocks.length <= want.maxBlocks, `${fixture.id}: ${result.blocks.length} blocks for a simple answer`);
  for (const type of want.requiredBlockTypes ?? []) assert.ok(result.blocks.some((block) => block.type === type), `${fixture.id}: missing ${type}`);

  if (fixture.operationId) {
    const allowed = ASK_OPERATION_DEFINITIONS[fixture.operationId].allowedBlockTypes;
    for (const block of result.blocks) assert.ok(allowed.includes(block.type), `${fixture.id}: ${block.type} is not allowed for ${fixture.operationId}`);
  }

  const issues = evaluatePresentationQuality({
    profile: fixture.profile, result, allowMultiplePrimaryActions: want.allowMultiplePrimaryActions, material: want.material, comparisonBlockIds: want.comparisonBlockIds,
  }).map((issue) => issue.code);
  assert.deepEqual(issues.sort(), [...(want.issues ?? [])].sort(), `${fixture.id}: presentation quality issues`);

  const degradation = want.degradation ?? 'NONE';
  const states = {
    ERROR: result.blocks.some((block) => block.type === 'ERROR_STATE'),
    EMPTY: result.blocks.some((block) => block.type === 'EMPTY_STATE') || (result.reasonCode ?? '').endsWith('_EMPTY'),
    PARTIAL: result.status === 'READY_WITH_LIMITATIONS',
  };
  if (degradation === 'NONE') assert.ok(!states.ERROR && !states.PARTIAL, `${fixture.id}: unexpectedly degraded`);
  else assert.ok(states[degradation], `${fixture.id}: expected ${degradation} state`);

  if (want.check) want.check(result);
  return result;
}

module.exports = { runFixture, PATTERNS };
