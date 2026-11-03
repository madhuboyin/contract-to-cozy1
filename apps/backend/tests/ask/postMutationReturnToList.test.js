require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');

const { ASK_OPERATION_DEFINITIONS, getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
const { requiredAskTargetEntity } = require('../../src/services/ask/askEntityResolution.ts');
const { suggestionKey } = require('../../src/services/ask/askSuggestionPolicy.ts');
const { OPERATION_SPECIFIC_CONTINUATION_RECIPES } = require('../../src/services/ask/suggestedActions/operationSpecificContinuationRecipes.ts');
const { operationSpecificContinuationCandidates } = require('../../src/services/ask/suggestedActions/operationSpecificContinuationCandidates.ts');
const { isPromptHistoryExemptOutcome } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { evaluateSuggestedNextActionEligibility } = require('../../src/services/ask/suggestedActions/suggestedNextActionEligibility.ts');

const PROPERTY = '11111111-1111-4111-8111-111111111111';
const READ = new Set(['RECORD_QUERY', 'STATUS_SUMMARY']);

const context = (askedMessages) => ({
  mode: 'NORMAL', sourcePropertyId: PROPERTY,
  operationAvailability: new Map(Object.keys(ASK_OPERATION_DEFINITIONS).map((id) => [id, null])),
  operationRequiresProperty: (id) => getAskOperationDefinition(id).requiresProperty,
  operationTargetEntityType: (id) => requiredAskTargetEntity(id),
  entities: new Map([['DECISION_THREAD:t', { exists: true, propertyId: PROPERTY, currentContextVersion: 'v' }]]), validatedEntityTypes: new Set(['DECISION_THREAD']), pendingInteractionActive: false,
  completedSemanticKeyHashes: new Set(), askedMessageKeys: new Set(askedMessages.map(suggestionKey)), messageKey: suggestionKey, currentOutcomeKeyHashes: new Set(),
});
const verdict = (candidate) => evaluateSuggestedNextActionEligibility(candidate, context([candidate.message]));

test('a completed command may offer its owned return-to-list even though that exact prompt was just asked', () => {
  const samples = {
    MAINTENANCE_TASK_COMPLETE: 'MAINTENANCE_STATUS', MAINTENANCE_TASK_CREATE: 'MAINTENANCE_STATUS', MAINTENANCE_TASK_UPDATE: 'MAINTENANCE_STATUS',
    INVENTORY_ITEM_CORRECT: 'INVENTORY_LOOKUP', WARRANTY_UPDATE: 'WARRANTY_LOOKUP',
  };
  for (const [source, destination] of Object.entries(samples)) {
    const candidate = operationSpecificContinuationCandidates(source, PROPERTY).find((c) => c.operationId === destination);
    assert.ok(candidate, `${source} -> ${destination}`);
    assert.equal(verdict(candidate).state, 'ELIGIBLE', `${source} -> ${destination}`);
  }
});

test('every command source with a read destination recipe is exempt; the same prompt is still suppressed after a READ source', () => {
  let commandEdges = 0;
  for (const [source, recipes] of Object.entries(OPERATION_SPECIFIC_CONTINUATION_RECIPES)) {
    const sourceFamily = ASK_OPERATION_DEFINITIONS[source].family;
    for (const candidate of operationSpecificContinuationCandidates(source, PROPERTY, undefined, { id: 't', contextVersion: 'v' })) {
      const destinationFamily = ASK_OPERATION_DEFINITIONS[candidate.operationId].family;
      const result = verdict(candidate);
      if (sourceFamily === 'COMMAND' && READ.has(destinationFamily)) {
        commandEdges += 1;
        assert.equal(result.state, 'ELIGIBLE', `${source} -> ${candidate.operationId}: ${result.reasonCodes}`);
      } else if (!isPromptHistoryExemptOutcome(candidate.operationId, candidate.outcomeKey)) {
        assert.deepEqual(result.reasonCodes, ['EQUIVALENT_PROMPT_ASKED'], `${source} -> ${candidate.operationId} must keep the recent-prompt rule`);
      }
    }
  }
  assert.ok(commandEdges >= 20, `expected many command -> read edges, got ${commandEdges}`);

});


