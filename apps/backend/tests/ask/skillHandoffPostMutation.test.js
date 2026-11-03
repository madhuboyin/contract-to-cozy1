require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');

const { ASK_OPERATION_DEFINITIONS, getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
const { requiredAskTargetEntity } = require('../../src/services/ask/askEntityResolution.ts');
const { suggestionKey } = require('../../src/services/ask/askSuggestionPolicy.ts');
const { SKILL_HANDOFF_DEFINITIONS } = require('../../src/services/skills/skillHandoff.ts');
const { skillHandoffCandidates } = require('../../src/services/ask/suggestedActions/skillHandoffCandidates.ts');
const { currentOperationOwnsOutcome } = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourRegistry.ts');
const { isPromptHistoryExemptOutcome } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { evaluateSuggestedNextActionEligibility } = require('../../src/services/ask/suggestedActions/suggestedNextActionEligibility.ts');

const PROPERTY = '11111111-1111-4111-8111-111111111111';

const candidateFor = (definition) => skillHandoffCandidates({
  result: { status: 'COMPLETED', blocks: [], suggestions: [], skillHandoff: {
    suggestedNextSkillId: definition.targetSkillId, suggestedGoal: definition.suggestedGoal, suggestedLabel: 'Next step', reasonCodes: [],
    continuity: { propertyId: PROPERTY, contextVersion: null },
  } },
  sourceOperationId: definition.sourceOperationId, propertyId: PROPERTY,
})[0];

const context = (asked) => ({
  mode: 'NORMAL', sourcePropertyId: PROPERTY,
  operationAvailability: new Map(Object.keys(ASK_OPERATION_DEFINITIONS).map((id) => [id, null])),
  operationRequiresProperty: (id) => getAskOperationDefinition(id).requiresProperty, operationTargetEntityType: (id) => requiredAskTargetEntity(id),
  entities: new Map(), validatedEntityTypes: new Set(), pendingInteractionActive: false,
  completedSemanticKeyHashes: new Set(), askedMessageKeys: new Set(asked.map(suggestionKey)), messageKey: suggestionKey, currentOutcomeKeyHashes: new Set(),
});

test('every command-sourced skill handoff owns its read destination; read-sourced handoffs get no post-mutation exemption', () => {
  let commandHandoffs = 0;
  let readHandoffs = 0;
  for (const definition of SKILL_HANDOFF_DEFINITIONS) {
    const candidate = candidateFor(definition);
    if (!candidate) continue;
    const sourceFamily = ASK_OPERATION_DEFINITIONS[definition.sourceOperationId].family;
    const verdict = evaluateSuggestedNextActionEligibility(candidate, context([candidate.message]));
    if (sourceFamily === 'COMMAND') {
      commandHandoffs += 1;
      assert.equal(currentOperationOwnsOutcome(definition.sourceOperationId, candidate), true, `${definition.sourceOperationId} must own ${candidate.operationId}:${candidate.outcomeKey}`);
      assert.equal(verdict.state, 'ELIGIBLE', `${definition.sourceOperationId} handoff is exempt from the recent-prompt rule`);
    } else {
      readHandoffs += 1;
      // A read source may own the canonical destination through its recipes; what matters is that a read is never a post-mutation return.
      // A canonical outcome that is a curated starter is separately prompt-history exempt; every other read-sourced handoff keeps the rule.
      if (!isPromptHistoryExemptOutcome(candidate.operationId, candidate.outcomeKey)) assert.deepEqual(verdict.reasonCodes, ['EQUIVALENT_PROMPT_ASKED'], `${definition.sourceOperationId} keeps the recent-prompt rule`);
    }
  }
  assert.ok(commandHandoffs >= 5 && readHandoffs >= 4, `expected the 5 command and 4 read handoffs, saw ${commandHandoffs}/${readHandoffs}`);
});
