const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Owner decision D-O12 (inventory), re-measured against the live code. A presentation identity is published for an action that declares operationId +
// interactionType + a REGISTERED outcomeKey, with or without an entity (the collector deliberately publishes entity-less response-level actions too). So an
// answer that already shows a starter's destination removes that starter from the footer. This file proves two things at runtime, with no source scanning:
// the real collector publishes exactly those identities, and the real finalizer (real producers, policy and eligibility; only the database loaders are
// injected) still reaches exactly four for EVERY starter an answer might already show, in every role and mode, with one operation disabled and the
// current outcome excluded.

const { collectPresentationIdentities } = require('../../src/services/ask/suggestedActions/suggestedNextActionPresentationIdentities.ts');
const { suggestedNextActionSemanticKey } = require('../../src/services/ask/suggestedActions/suggestedNextActionIdentity.ts');
const { SUGGESTED_ACTION_OUTCOMES, SUGGESTED_NEXT_ACTION_LIMITS } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const starters = require('../../src/services/ask/suggestedActions/starterCandidates.ts');
const { prisma } = require('../../src/lib/prisma.ts');
const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');
const { evaluateAskOperationAvailability } = require('../../src/services/ask/support/answerGuards.ts');
const { finalizeSuggestedNextActionsWithReport } = require('../../src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts');
const { suggestedNextActionSemanticKeyHash } = require('../../src/services/ask/suggestedActions/suggestedNextActionIdentity.ts');
const { seasonalHomeCareStarters } = starters;

const PROPERTY = 'p1';
const NOW = new Date('2026-10-05T12:00:00.000Z');
const ALL = [...starters.propertySummaryStarters(PROPERTY), ...starters.seasonalHomeCareStarters(PROPERTY), ...starters.homeBasicsStarters(PROPERTY), ...starters.hiringGuideStarters(PROPERTY)];
const keyOf = (c) => `${c.operationId}:${c.outcomeKey}`;
const identityOf = (c) => suggestedNextActionSemanticKey({ operationId: c.operationId, interactionType: c.interactionType, propertyId: PROPERTY, entityType: null, entityId: null, outcomeKey: c.outcomeKey });
const hashOf = (c) => suggestedNextActionSemanticKeyHash({ operationId: c.operationId, interactionType: c.interactionType, propertyId: PROPERTY, entityType: null, entityId: null, outcomeKey: c.outcomeKey });
const ONBOARDING = { UNKNOWN: null, BUYING: 'SHOPPING', OWNING: 'ESTABLISHED_OWNER', SELLING: 'PREPARING_TRANSFER' };
const responseAction = (c) => ({ id: 'shown', label: 'Shown', message: c.message, interactionType: c.interactionType, operationId: c.operationId, outcomeKey: c.outcomeKey });

async function availability(role, mode, disabled) {
  const original = prisma.propertyOnboarding.findUnique;
  prisma.propertyOnboarding.findUnique = async () => (ONBOARDING[mode] ? { ownershipState: ONBOARDING[mode] } : null);
  try { return await evaluateAskOperationAvailability({ propertyId: PROPERTY, propertyAccess: { role }, controls: { ...readAskOperationalControls(), audienceDiscoveryEnabled: true, operationEnabled: (id) => id !== disabled } }); } finally { prisma.propertyOnboarding.findUnique = original; }
}

/** One answer that already shows `shownStarter` as a response-level action, finalized with the real finalizer. */
async function finalizeAnswerShowing(shownStarter, { role, mode, disabled, current }) {
  const avail = await availability(role, mode, disabled);
  const { result, report } = await finalizeSuggestedNextActionsWithReport(
    { result: { status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 's', title: 'T', body: 'b', tone: 'DEFAULT', actions: [responseAction(shownStarter)] }], suggestions: [] }, executionId: 'e1', userId: 'u1', sessionId: 's1', propertyId: PROPERTY, operationId: 'PROPERTY_SUMMARY', message: 'Browse my home record', recentCompletedMessages: [], completedSemanticKeyHashes: new Set() },
    {
      clock: { now: () => NOW },
      loadOperationAvailability: async () => avail,
      loadExecutionExpiresAt: async () => new Date(NOW.getTime() + 24 * 3600_000),
      loadCurrentOutcomeKeyHashes: async () => new Set(current ? [hashOf(current)] : []),
      loadLifecycleState: async () => ({ cooldownKeys: new Set(), completedKeys: new Set(), lastOfferedAtMs: new Map(), ok: true }),
      loadActionableCompleteness: async () => ({ fraction: 1, audienceUncertain: false }),
      loadActionableProfileState: async () => ({ denominatorVersion: 'actionable-profile-1:BASE', audiences: [], audienceUncertain: false, fraction: 1, knownWeight: 1, totalWeight: 1, unresolved: [], unresolvedByArea: {} }),
      loadUrgentHomeActionState: async () => ({ nowCount: 0 }),
      loadHomeOpportunityState: async () => ({ contextVersion: 'v1', capitalItemsUpcoming: false, warrantyExpiring: false, openFindings: false }),
      loadActivePlanState: async () => ({ sellHoldRentActive: false }),
      loadOperationSpecificContinuationState: async () => ({}),
      recordOffers: async (input) => ({ attempted: input.offers.length, ok: true }),
      recordImpressions: () => {}, recordSuppression: () => {},
    },
  );
  return { shown: result.suggestedNextActions ?? [], report };
}

test('the real collector publishes an identity for an entity-less response-level action with a registered outcome, and for none without one', () => {
  for (const starter of ALL) {
    const identities = collectPresentationIdentities([{ type: 'SUMMARY', id: 's', actions: [responseAction(starter)] }], PROPERTY);
    assert.deepEqual([...identities], [identityOf(starter)], keyOf(starter));
  }
  assert.equal(collectPresentationIdentities([{ type: 'SUMMARY', id: 's', actions: [{ operationId: 'PROPERTY_SUMMARY', outcomeKey: 'NOT_REGISTERED', interactionType: 'START_WORKFLOW' }] }], PROPERTY).size, 0);
  assert.equal(collectPresentationIdentities([], PROPERTY).size, 0);
});

test('LIVE MATRIX: an answer that already shows any approved starter still reaches exactly four in every role and mode, with one operation disabled and the launch outcome excluded; the shown starter is never duplicated in the footer', async () => {
  const operations = [null, ...new Set(ALL.map((c) => c.operationId))];
  let cells = 0;
  for (const shown of ALL) for (const role of ['VIEWER', 'CONTRIBUTOR', 'OWNER']) for (const mode of ['UNKNOWN', 'BUYING', 'OWNING', 'SELLING']) for (const disabled of operations) for (const current of [null, shown]) {
    const { shown: footer, report } = await finalizeAnswerShowing(shown, { role, mode, disabled, current });
    const label = `${keyOf(shown)} ${role} ${mode} disabled=${disabled} current=${Boolean(current)}`;
    assert.equal(footer.length, SUGGESTED_NEXT_ACTION_LIMITS.maxShown, `${label}: ${footer.map((a) => `${a.operationId}:${a.outcomeKey}`).join(',')}`);
    assert.equal(report.exactFour.shortage, 0, label);
    assert.equal(new Set(footer.map((a) => `${a.operationId}:${a.outcomeKey}`)).size, 4, `${label}: four distinct actions`);
    assert.equal(footer.some((a) => `${a.operationId}:${a.outcomeKey}` === keyOf(shown)), false, `${label}: the shown destination is not repeated`);
    cells += 1;
  }
  assert.equal(cells, ALL.length * 3 * 4 * operations.length * 2);
});

test('a presented action publishes an identity only for a REGISTERED outcome: an unregistered one publishes none, and the registered starter outcomes are the only ones a future action could collide with', () => {
  const action = (operationId, outcomeKey) => [{ type: 'GROUPED_LIST', sections: [{ items: [{ id: 'i1', entityType: 'INVENTORY_ITEM', actions: [{ operationId, outcomeKey, interactionType: 'CONVERSATION_CONTINUE' }] }] }] }];
  assert.equal(collectPresentationIdentities(action('PROPERTY_SUMMARY', 'OPEN_SUMMARY'), 'p1').size, 0, 'an unregistered outcome publishes nothing');
  // PROPERTY_SUMMARY now has registered starter outcomes (D-O4), so an entity action declaring one WOULD publish an entity-scoped identity; no handler does
  // (the scan above), and an entity-scoped identity never equals an entity-less starter key.
  assert.deepEqual(SUGGESTED_ACTION_OUTCOMES.PROPERTY_SUMMARY, ['REVIEW_HOME_SUMMARY', 'REVIEW_COMPLETENESS', 'HANDOFF_REVIEW_PROPERTY']);
  assert.equal(collectPresentationIdentities(action('PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY'), 'p1').size, 1);
});

test('the real collector with the realistic worst answer (an inventory item offering every correctable field) publishes entity identities that no starter shares', () => {
  const fields = ['ADD_PURCHASE_DATE', 'ADD_BRAND', 'ADD_MODEL', 'ADD_SERIAL_NUMBER'];
  const blocks = [{ type: 'GROUPED_LIST', sections: [{ items: [{ id: 'item-1', entityType: 'INVENTORY_ITEM', actions: fields.map((outcomeKey) => ({ operationId: 'INVENTORY_ITEM_CORRECT', outcomeKey, interactionType: 'MUTATE_RECORD' })) }] }] }];
  const identities = collectPresentationIdentities(blocks, 'p1');
  assert.equal(identities.size, 4);
  for (const starter of seasonalHomeCareStarters('p1')) {
    const key = suggestedNextActionSemanticKey({ operationId: starter.operationId, interactionType: starter.interactionType, propertyId: 'p1', entityType: null, entityId: null, outcomeKey: starter.outcomeKey });
    assert.equal(identities.has(key), false);
  }
});
