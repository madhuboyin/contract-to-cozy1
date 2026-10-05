const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const outcomes = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { evaluateSuggestedNextActionEligibility } = require('../../src/services/ask/suggestedActions/suggestedNextActionEligibility.ts');
const { SuggestedNextActionCandidateSchema } = require('../../src/services/ask/suggestedActions/suggestedNextActionCandidate.ts');
const { suggestionKey } = require('../../src/services/ask/askSuggestionPolicy.ts');

// Owner decision D-O10 (inventory): a STARTER-SPECIFIC prompt-history exemption, a registry property separate from repeatable completion.

const key = (op, outcome) => `${op}:${outcome}`;
const candidate = (operationId, outcomeKey, message = 'Show me the home summary') => SuggestedNextActionCandidateSchema.parse({
  source: 'CAPABILITY_RECOMMENDATION', sourceOperationId: null, label: 'Open', message, operationId, interactionType: 'CONVERSATION_CONTINUE', outcomeKey,
  slotClass: 'CURATED_STARTER', tier: 'DISCOVERY', requiredFacts: [], reasonCodes: [],
  entityContext: { propertyId: 'p1', entityType: null, entityId: null, contextVersion: null },
  signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 0, sourceConfidence: 0.5 },
  traits: { recovery: false, promotional: false, continuesPending: false },
});
const ctx = (message) => ({
  mode: 'NORMAL', sourcePropertyId: 'p1', operationAvailability: new Map([['PROPERTY_SUMMARY', null], ['MAINTENANCE_TASK_CREATE', null], ['INVENTORY_LOOKUP', null]]),
  operationRequiresProperty: () => true, operationTargetEntityType: () => null, entities: new Map(), validatedEntityTypes: new Set(), pendingInteractionActive: false,
  completedSemanticKeyHashes: new Set(), askedMessageKeys: new Set([suggestionKey(message)]), messageKey: suggestionKey, currentOutcomeKeyHashes: new Set(),
});

function withRegistered(entries, body) {
  const added = [];
  for (const [op, outcome, { exempt = false, repeatable = false } = {}] of entries) {
    const existing = outcomes.SUGGESTED_ACTION_OUTCOMES[op];
    if (!existing) { outcomes.SUGGESTED_ACTION_OUTCOMES[op] = [outcome]; added.push(['op', op]); } else if (!existing.includes(outcome)) { existing.push(outcome); added.push(['outcome', op, outcome]); }
    if (exempt) { outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.add(key(op, outcome)); added.push(['exempt', key(op, outcome)]); }
    if (repeatable) { outcomes.REPEATABLE_OUTCOMES.add(key(op, outcome)); added.push(['repeatable', key(op, outcome)]); }
  }
  try { return body(); } finally {
    for (const [kind, a, b] of added.reverse()) {
      if (kind === 'op') delete outcomes.SUGGESTED_ACTION_OUTCOMES[a];
      else if (kind === 'outcome') outcomes.SUGGESTED_ACTION_OUTCOMES[a].splice(outcomes.SUGGESTED_ACTION_OUTCOMES[a].indexOf(b), 1);
      else if (kind === 'exempt') outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.delete(a);
      else outcomes.REPEATABLE_OUTCOMES.delete(a);
    }
  }
}

test('ships empty: no starter is approved yet, so no entry is invented, and the registry validates', () => {
  assert.equal(outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.size, 0);
  assert.deepEqual(outcomes.validateSuggestedNextActionRegistry(), []);
});

test('a recently asked identical prompt is suppressed by default (unchanged behavior)', () => {
  withRegistered([['PROPERTY_SUMMARY', 'OPEN_SUMMARY']], () => {
    const verdict = evaluateSuggestedNextActionEligibility(candidate('PROPERTY_SUMMARY', 'OPEN_SUMMARY'), ctx('Show me the home summary'));
    assert.equal(verdict.state, 'SUPPRESSED');
    assert.deepEqual(verdict.reasonCodes, ['EQUIVALENT_PROMPT_ASKED']);
  });
});

test('an exempt outcome is NOT suppressed by prompt history, while everything else about eligibility still applies', () => {
  withRegistered([['PROPERTY_SUMMARY', 'OPEN_SUMMARY', { exempt: true }]], () => {
    const asked = ctx('Show me the home summary');
    assert.equal(evaluateSuggestedNextActionEligibility(candidate('PROPERTY_SUMMARY', 'OPEN_SUMMARY'), asked).state, 'ELIGIBLE');
    // Other rules still run: an unavailable operation is rejected, and a completed non-repeatable outcome is still suppressed.
    const down = { ...asked, operationAvailability: new Map([['PROPERTY_SUMMARY', 'HEALTH']]) };
    assert.equal(evaluateSuggestedNextActionEligibility(candidate('PROPERTY_SUMMARY', 'OPEN_SUMMARY'), down).state, 'UNAVAILABLE');
  });
});

test('repeatable COMPLETION does not exempt a prompt (separate concepts): a repeatable-only outcome is still suppressed when its prompt was asked', () => {
  withRegistered([['PROPERTY_SUMMARY', 'OPEN_SUMMARY', { repeatable: true }]], () => {
    const verdict = evaluateSuggestedNextActionEligibility(candidate('PROPERTY_SUMMARY', 'OPEN_SUMMARY'), ctx('Show me the home summary'));
    assert.equal(verdict.state, 'SUPPRESSED');
    assert.deepEqual(verdict.reasonCodes, ['EQUIVALENT_PROMPT_ASKED']);
  });
});

test('exempting one starter leaves the existing repeatable recovery outcomes exactly as they were', () => {
  withRegistered([['PROPERTY_SUMMARY', 'OPEN_SUMMARY', { exempt: true }]], () => {
    // The four existing repeatable outcomes are still suppressed when their prompt was just asked (the behavior a global change would have altered).
    for (const [op, outcome] of [['MAINTENANCE_TASK_CREATE', 'RESTART_AFTER_EXPIRY'], ['INVENTORY_LOOKUP', 'REVIEW_CURRENT_RECORD']]) {
      assert.equal(outcomes.isRepeatableOutcome(op, outcome), true);
      assert.equal(outcomes.isPromptHistoryExemptOutcome(op, outcome), false);
      const verdict = evaluateSuggestedNextActionEligibility(candidate(op, outcome, 'Start it again'), ctx('Start it again'));
      assert.equal(verdict.state, 'SUPPRESSED', `${op}:${outcome}`);
      assert.deepEqual(verdict.reasonCodes, ['EQUIVALENT_PROMPT_ASKED']);
    }
  });
});

test('registry validation: an exempt entry must be a registered outcome of a read-only, viewer-floor, standard-safety, property-scoped operation', () => {
  const problems = (entries) => withRegistered(entries, () => outcomes.validateSuggestedNextActionRegistry());
  assert.deepEqual(problems([['PROPERTY_SUMMARY', 'OPEN_SUMMARY', { exempt: true }]]), [], 'a read-only viewer starter is accepted');
  // A command (mutation) is rejected.
  assert.ok(problems([['MAINTENANCE_TASK_CREATE', 'RESTART_AFTER_EXPIRY', { exempt: true }]]).some((p) => /not a read-only operation family \(COMMAND\)/.test(p)));
  // A contributor-floor read is rejected.
  assert.ok(problems([['HOME_DIGITAL_WILL', 'OPEN_PLAN', { exempt: true }]]).some((p) => /not a viewer-floor operation/.test(p)));
  // A material-decision read is rejected.
  assert.ok(problems([['COVERAGE_GAPS', 'OPEN_GAPS', { exempt: true }]]).some((p) => /not standard safety/.test(p)));
  // An unregistered outcome is rejected.
  outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.add('PROPERTY_SUMMARY:NOT_REGISTERED');
  try { assert.ok(outcomes.validateSuggestedNextActionRegistry().some((p) => /not a registered outcome/.test(p))); } finally { outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.delete('PROPERTY_SUMMARY:NOT_REGISTERED'); }
  assert.deepEqual(outcomes.validateSuggestedNextActionRegistry(), [], 'cleanup left the registry valid');
});

test('the exemption is consulted only by the prompt-history rule: completed semantic history and repeatability code paths are untouched', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/ask/suggestedActions/suggestedNextActionEligibility.ts'), 'utf8');
  assert.ok(/ctx\.completedSemanticKeyHashes\.has\(hash\) && !isRepeatableOutcome\(operationId, candidate\.outcomeKey\)/.test(source), 'completion still keys on repeatability');
  assert.ok(/ctx\.askedMessageKeys\.has\(ctx\.messageKey\(candidate\.message\)\) && !isPromptHistoryExemptOutcome\(operationId, candidate\.outcomeKey\)/.test(source), 'prompt history keys on the separate exemption');
  assert.equal((source.match(/isPromptHistoryExemptOutcome\(/g) ?? []).length, 1, 'used in exactly one rule');
});

// Owner decision D-O15: the global CAPABILITY_DISCOVERY starter may take the exemption, via a narrow explicit allowlist.
test('D-O15: the property-less allowlist is exactly CAPABILITY_DISCOVERY and the registry still ships empty', () => {
  assert.deepEqual([...outcomes.PROMPT_HISTORY_EXEMPT_PROPERTYLESS_OPERATIONS], ['CAPABILITY_DISCOVERY']);
  assert.equal(outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.size, 0);
});

test('D-O15: CAPABILITY_DISCOVERY is accepted as an exempt entry, and the widening does not relax any other operation', () => {
  const problems = (entries) => withRegistered(entries, () => outcomes.validateSuggestedNextActionRegistry());
  assert.deepEqual(problems([['CAPABILITY_DISCOVERY', 'EXPLORE_TOOLS', { exempt: true }]]), [], 'the allowlisted global operation is accepted');
  // Other property-less or non-read-only operations are still rejected by the general rules.
  assert.ok(problems([['MAINTENANCE_TASK_CREATE', 'RESTART_AFTER_EXPIRY', { exempt: true }]]).some((p) => /not a read-only operation family/.test(p)));
  assert.ok(problems([['HOME_DIGITAL_WILL', 'OPEN_PLAN', { exempt: true }]]).some((p) => /not a viewer-floor operation/.test(p)));
  assert.deepEqual(outcomes.validateSuggestedNextActionRegistry(), [], 'cleanup left the registry valid');
});

test('D-O15: an allowlisted operation that stops being property-less, deterministic or standard-safety is rejected', () => {
  const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
  const definition = ASK_OPERATION_DEFINITIONS.CAPABILITY_DISCOVERY;
  const original = { requiresProperty: definition.requiresProperty, propertyRoleFloor: definition.propertyRoleFloor, safetyClass: definition.safetyClass };
  try {
    withRegistered([['CAPABILITY_DISCOVERY', 'EXPLORE_TOOLS', { exempt: true }]], () => {
      definition.requiresProperty = true; definition.propertyRoleFloor = 'VIEWER'; definition.safetyClass = 'MATERIAL_DECISION';
      const found = outcomes.validateSuggestedNextActionRegistry();
      assert.ok(found.some((p) => /requires a property/.test(p)));
      assert.ok(found.some((p) => /has a role floor/.test(p)));
      assert.ok(found.some((p) => /not standard safety/.test(p)));
    });
  } finally { Object.assign(definition, original); }
});

test('D-O15: the starter identity is per property: the candidate carries the viewed property, and a different property is rejected', () => {
  withRegistered([['CAPABILITY_DISCOVERY', 'EXPLORE_TOOLS', { exempt: true }]], () => {
    const base = { ...ctx('What can Cozy do?'), operationAvailability: new Map([['CAPABILITY_DISCOVERY', null]]), operationRequiresProperty: () => false };
    const make = (propertyId) => ({ ...candidate('CAPABILITY_DISCOVERY', 'EXPLORE_TOOLS', 'What can Cozy do?'), entityContext: { propertyId, entityType: null, entityId: null, contextVersion: null } });
    assert.equal(evaluateSuggestedNextActionEligibility(make('p1'), base).state, 'ELIGIBLE', 'viewed property, history-exempt');
    assert.notEqual(evaluateSuggestedNextActionEligibility(make('p2'), base).state, 'ELIGIBLE', 'another property is rejected');
  });
});
