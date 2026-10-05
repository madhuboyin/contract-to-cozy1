const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ONE pinned registry test for the seven exact-four starters (owner decision D-O4, conditionally approved October 5, 2026): the outcome
// registrations, the launch messages, the producer grants, and the TWO entries each starter needs, a prompt-history exemption AND a repeatable
// declaration. The live registries deliberately do NOT contain those entries yet: final approval waits on content and safety review and on the
// real-database checks. The target set is applied PROVISIONALLY here to prove what approval will do.

const { prisma } = require('../../src/lib/prisma.ts');
const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');
const { evaluateAskOperationAvailability } = require('../../src/services/ask/support/answerGuards.ts');
const { getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
const { requiredAskTargetEntity } = require('../../src/services/ask/askEntityResolution.ts');
const { suggestionKey } = require('../../src/services/ask/askSuggestionPolicy.ts');
const outcomes = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const exactFour = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourRegistry.ts');
const { selectExactFourSuggestedNextActions } = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourPolicy.ts');
const { evaluateSuggestedNextActionEligibility } = require('../../src/services/ask/suggestedActions/suggestedNextActionEligibility.ts');
const { suggestedNextActionSemanticKeyHash } = require('../../src/services/ask/suggestedActions/suggestedNextActionIdentity.ts');
const starters = require('../../src/services/ask/suggestedActions/starterCandidates.ts');

const PROPERTY = 'p1';
const PRODUCERS = {
  [starters.STARTER_PROPERTY_SUMMARY_PRODUCER_ID]: starters.propertySummaryStarters(PROPERTY),
  [starters.STARTER_SEASONAL_PRODUCER_ID]: starters.seasonalHomeCareStarters(PROPERTY),
  [starters.STARTER_HOME_BASICS_PRODUCER_ID]: starters.homeBasicsStarters(PROPERTY),
  [starters.STARTER_HIRING_GUIDE_PRODUCER_ID]: starters.hiringGuideStarters(PROPERTY),
};
const ALL = Object.values(PRODUCERS).flat();
const keyOf = (c) => `${c.operationId}:${c.outcomeKey}`;

const EXPECTED = [
  ['PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY', 'Give me a summary of my home record'],
  ['PROPERTY_SUMMARY', 'REVIEW_COMPLETENESS', 'How complete is my home record?'],
  ['SEASONAL_HOME_CARE', 'REVIEW_THIS_SEASON', 'What home care should I do this season?'],
  ['SEASONAL_HOME_CARE', 'PREPARE_NEXT_SEASON', 'What should I do to get ready for next season?'],
  ['HOME_BASICS_GUIDE', 'REVIEW_SAFETY_BASICS', 'What home safety basics should I know?'],
  ['HOME_BASICS_GUIDE', 'REVIEW_MONTHLY_ROUTINE', 'What should I check around my home each month?'],
  ['HIRING_GUIDE', 'REVIEW_HIRING_CHECKLIST', 'What should I ask before hiring a contractor?'],
];

test('PINNED: seven starters on four operations, each with a registered outcome, the exact launch message, a CURATED_STARTER-only producer grant and a dismissal rule', () => {
  assert.deepEqual(ALL.map((c) => [c.operationId, c.outcomeKey, c.message]), EXPECTED);
  assert.equal(new Set(ALL.map(keyOf)).size, 7);
  assert.equal(new Set(ALL.map((c) => c.operationId)).size, 4);
  for (const candidate of ALL) {
    assert.equal(outcomes.isRegisteredOutcome(candidate.operationId, candidate.outcomeKey), true, keyOf(candidate));
    assert.equal(candidate.slotClass, 'CURATED_STARTER'); assert.equal(candidate.entityContext.entityId, null);
    assert.deepEqual(exactFour.dismissalReasonsFor(candidate.operationId, candidate.outcomeKey), ['NOT_NOW', 'NOT_RELEVANT'], keyOf(candidate));
  }
  for (const id of Object.keys(PRODUCERS)) assert.deepEqual([...exactFour.PRODUCER_SLOT_GRANTS[id].allowed], ['CURATED_STARTER'], id);
  assert.deepEqual(outcomes.validateSuggestedNextActionRegistry(), []);
});

test('PINNED, conditional approval: the live exemption and repeatable registries do NOT yet contain the starters (waiting on content/safety review and real-database checks)', () => {
  assert.equal(outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.size, 0);
  for (const candidate of ALL) assert.equal(outcomes.isRepeatableOutcome(candidate.operationId, candidate.outcomeKey), false, keyOf(candidate));
});

const ONBOARDING = { UNKNOWN: null, BUYING: 'SHOPPING', OWNING: 'ESTABLISHED_OWNER', SELLING: 'PREPARING_TRANSFER' };
async function availability(role, mode, disabled) {
  const original = prisma.propertyOnboarding.findUnique;
  prisma.propertyOnboarding.findUnique = async () => (ONBOARDING[mode] ? { ownershipState: ONBOARDING[mode] } : null);
  try { return await evaluateAskOperationAvailability({ propertyId: PROPERTY, propertyAccess: { role }, controls: { ...readAskOperationalControls(), audienceDiscoveryEnabled: true, operationEnabled: (id) => id !== disabled } }); } finally { prisma.propertyOnboarding.findUnique = original; }
}
const withEntries = async (body, { exempt, repeatable }) => {
  const added = [];
  for (const candidate of ALL) {
    const key = keyOf(candidate);
    if (exempt) { outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES.add(key); added.push(['E', key]); }
    if (repeatable) { outcomes.REPEATABLE_OUTCOMES.add(key); added.push(['R', key]); }
  }
  const undo = () => { for (const [kind, key] of added) (kind === 'E' ? outcomes.PROMPT_HISTORY_EXEMPT_OUTCOMES : outcomes.REPEATABLE_OUTCOMES).delete(key); };
  try { return await body(); } finally { undo(); }
};

async function row({ role = 'VIEWER', mode = 'UNKNOWN', disabled = null, asked = [], completed = [], current = null }) {
  const eligibility = {
    mode: 'NORMAL', sourcePropertyId: PROPERTY, operationAvailability: await availability(role, mode, disabled),
    operationRequiresProperty: (id) => getAskOperationDefinition(id).requiresProperty, operationTargetEntityType: (id) => requiredAskTargetEntity(id),
    entities: new Map(), validatedEntityTypes: new Set(), pendingInteractionActive: false,
    completedSemanticKeyHashes: new Set(completed.map(hashOf)), askedMessageKeys: new Set(asked.map((c) => suggestionKey(c.message))), messageKey: suggestionKey,
    currentOutcomeKeyHashes: new Set(current ? [hashOf(current)] : []),
  };
  const slotGrants = Object.fromEntries(Object.keys(PRODUCERS).map((id) => [id, { allowed: new Set(['CURATED_STARTER']), fallback: 'CURATED_STARTER' }]));
  const nominations = new Map(Object.entries(PRODUCERS));
  return selectExactFourSuggestedNextActions({ nominations, eligibility, actionableCompleteness: 0.95, slotGrants });
}
const hashOf = (c) => suggestedNextActionSemanticKeyHash({ operationId: c.operationId, interactionType: 'CONVERSATION_CONTINUE', propertyId: PROPERTY, entityType: null, entityId: null, outcomeKey: c.outcomeKey });

test('with BOTH entries (the approved target), every state still reaches exactly four: one operation disabled x the launched outcome excluded x five starters asked and completed, for every role and mode', async () => {
  await withEntries(async () => {
    const operations = [...new Set(ALL.map((c) => c.operationId))];
    let rows = 0;
    for (const role of ['VIEWER', 'OWNER']) for (const mode of ['UNKNOWN', 'OWNING']) for (const disabled of [null, ...operations]) for (const current of [null, ...ALL]) {
      const result = await row({ role, mode, disabled, current, asked: ALL.slice(0, 5), completed: ALL.slice(0, 5) });
      assert.equal(result.selected.length, 4, JSON.stringify({ role, mode, disabled, current: current && keyOf(current) }));
      rows += 1;
    }
    assert.ok(rows > 100);
  }, { exempt: true, repeatable: true });
});

test('BOTH are required: exemption alone fails after completion, repeatability alone fails after recent asking, and the same state passes with both (a state each mechanism uniquely covers)', async () => {
  await withEntries(async () => {
    assert.equal((await row({ asked: ALL, completed: ALL, disabled: 'HIRING_GUIDE', current: ALL[0] })).selected.length, 4, 'both entries: the control passes');
  }, { exempt: true, repeatable: true });
  await withEntries(async () => {
    assert.ok((await row({ asked: ALL, completed: ALL, disabled: 'HIRING_GUIDE', current: ALL[0] })).selected.length < 4, 'exempt only: completed outcomes are suppressed');
  }, { exempt: true, repeatable: false });
  await withEntries(async () => {
    assert.ok((await row({ asked: ALL, completed: [], disabled: 'HIRING_GUIDE', current: ALL[0] })).selected.length < 4, 'repeatable only: recently asked messages are suppressed');
  }, { exempt: false, repeatable: true });
});

test('the unlaunched worst case (typed question, one operation disabled) needs 6 and the launched worst case needs 7; the supply is exactly 7 starters on 4 operations', async () => {
  const largestGroup = Math.max(...Object.values(Object.groupBy ? Object.groupBy(ALL, (c) => c.operationId) : ALL.reduce((m, c) => ({ ...m, [c.operationId]: [...(m[c.operationId] ?? []), c] }), {})).map((g) => g.length));
  assert.equal(largestGroup, 2);
  assert.equal(ALL.length, 4 + largestGroup + 1, 'supply 7 = 4 + largest group + 1 for the verified launch outcome');
});
