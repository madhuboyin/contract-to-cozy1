const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// Governance/source-shape test, not a DB integration test (linkDecisionLineage
// and recordHomeActionOpened both call into resolveHomeActionDecisionLineage
// / startOrResumeHomeActionDecisionThread, which touch the real prisma
// client with no test DB available in this environment).
//
// Phase 3 review finding 1: a DECISION_REQUIRED action whose lineage could
// not be resolved (no registered decision family, no ref, or a thrown
// resolution error) must still carry a truthy decisionLineage object, or
// the frontend falls through to its ungated plain-link render path. This
// locks in the shape of the fix: every call to degradeActionForBlockedDecision
// inside linkDecisionLineage/recordHomeActionOpened must pass an object
// literal that sets decisionLineage, never the bare original action.

const source = readFileSync(resolve(__dirname, '../../src/services/homeActions.service.ts'), 'utf8');

test('linkDecisionLineage never calls degradeActionForBlockedDecision with a bare action (decisionLineage must always be set)', () => {
  assert.doesNotMatch(source, /degradeActionForBlockedDecision\(action\)/, 'found a bare degradeActionForBlockedDecision(action) call — this drops decisionLineage back to null/undefined');
});

test('every fail-closed branch in linkDecisionLineage constructs a decisionLineage via unavailableDecisionLineage', () => {
  const linkStart = source.indexOf('export async function linkDecisionLineage');
  assert.ok(linkStart >= 0, 'linkDecisionLineage not found');
  const linkEnd = source.indexOf('\n}', linkStart);
  const block = source.slice(linkStart, linkEnd);
  const calls = [...block.matchAll(/unavailableDecisionLineage\(/g)];
  assert.ok(calls.length >= 3, `expected at least 3 unavailableDecisionLineage calls (no-registered-family, no-ref, resolution-threw), found ${calls.length}`);
});

test('recordHomeActionOpened only attempts thread creation when the action policy is DECISION_REQUIRED, and reports UNAVAILABLE otherwise', () => {
  const openStart = source.indexOf('export async function recordHomeActionOpened');
  assert.ok(openStart >= 0, 'recordHomeActionOpened not found');
  const openEnd = source.indexOf('\nexport async function getUnifiedHome', openStart);
  const block = source.slice(openStart, openEnd);
  assert.match(block, /resolveActionDecisionLineagePolicy\(action\)/, 'recordHomeActionOpened must check the same policy linkDecisionLineage uses, not just resolveDecisionFamilyRef directly');
  assert.match(block, /unavailableDecisionLineage\(/, 'recordHomeActionOpened must report UNAVAILABLE, not leave decisionLineage null, when policy requires lineage but no ref resolves');
});
