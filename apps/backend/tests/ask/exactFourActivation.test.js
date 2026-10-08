const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ACTIVATION VERIFICATION (owner decision D-O4): the REAL shared finalizer, the REAL producer registry (the four starter producers), the REAL
// exact-four policy, real eligibility and the real availability function. Only the database-backed loaders (lifecycle, current outcome, expiry)
// and the clock are injected. Every case asserts a HARD outcome: the row reaches exactly four, or reports the approved bounded diagnostic.

const { prisma } = require('../../src/lib/prisma.ts');
const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');
const { evaluateAskOperationAvailability } = require('../../src/services/ask/support/answerGuards.ts');
const { finalizeSuggestedNextActionsWithReport } = require('../../src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts');
const { SUGGESTED_NEXT_ACTION_PRODUCERS, starterProducers, actionableProfileProducer, skillHandoffProducer, urgentWorkProducer, homeOpportunityProducer, activePlanProducer, capabilityRecommendationProducer } = require('../../src/services/ask/suggestedActions/suggestedNextActionProducers.ts');
const { SUGGESTED_NEXT_ACTION_LIMITS, CURATED_STARTER_OUTCOME_KEYS, REPEATABLE_OUTCOMES, PROMPT_HISTORY_EXEMPT_OUTCOMES, SUGGESTED_NEXT_ACTION_BUDGET } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { lifecycleKey, STARTER_ROTATION_MS } = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourRegistry.ts');
const { suggestedNextActionSemanticKeyHash } = require('../../src/services/ask/suggestedActions/suggestedNextActionIdentity.ts');
const starters = require('../../src/services/ask/suggestedActions/starterCandidates.ts');

const NOW = new Date('2026-10-05T12:00:00.000Z');
const PROPERTY = 'p1';
const ALL = [...starters.propertySummaryStarters(PROPERTY), ...starters.seasonalHomeCareStarters(PROPERTY), ...starters.homeBasicsStarters(PROPERTY), ...starters.hiringGuideStarters(PROPERTY)];
const keyOf = (c) => `${c.operationId}:${c.outcomeKey}`;
const lk = (c) => lifecycleKey({ operationId: c.operationId, outcomeKey: c.outcomeKey, entityType: null, entityId: null });
const hashOf = (c) => suggestedNextActionSemanticKeyHash({ operationId: c.operationId, interactionType: c.interactionType, propertyId: PROPERTY, entityType: null, entityId: null, outcomeKey: c.outcomeKey });
const ONBOARDING = { UNKNOWN: null, BUYING: 'SHOPPING', OWNING: 'ESTABLISHED_OWNER', SELLING: 'PREPARING_TRANSFER' };

async function availability({ role = 'VIEWER', mode = 'UNKNOWN', disabled = null } = {}) {
  const original = prisma.propertyOnboarding.findUnique;
  prisma.propertyOnboarding.findUnique = async () => (ONBOARDING[mode] ? { ownershipState: ONBOARDING[mode] } : null);
  try { return await evaluateAskOperationAvailability({ propertyId: PROPERTY, propertyAccess: { role }, controls: { ...readAskOperationalControls(), audienceDiscoveryEnabled: true, operationEnabled: (id) => id !== disabled } }); } finally { prisma.propertyOnboarding.findUnique = original; }
}
const okLifecycle = (over = {}) => async () => ({ cooldownKeys: new Set(), completedKeys: new Set(), lastOfferedAtMs: new Map(), ok: true, ...over });

async function run({ role, mode, disabled, status = 'ANSWERED', message = 'What maintenance is pending?', operationId = 'MAINTENANCE_STATUS', propertyId = PROPERTY,
  current = null, recent = [], lifecycle = okLifecycle(), producers, nowMs, result: resultOver = {} } = {}) {
  const offers = []; const calls = { lifecycle: 0, completeness: 0 };
  const avail = await availability({ role, mode, disabled });
  const out = await finalizeSuggestedNextActionsWithReport(
    { result: { status, blocks: [], suggestions: [], ...resultOver }, executionId: 'e1', userId: 'u1', sessionId: 's1', propertyId, operationId, message, recentCompletedMessages: recent, completedSemanticKeyHashes: new Set() },
    {
      producers, clock: { now: () => NOW }, nowMs,
      loadOperationAvailability: async () => avail,
      loadExecutionExpiresAt: async () => new Date(NOW.getTime() + 24 * 3600_000),
      loadCurrentOutcomeKeyHashes: async () => new Set(current ? [hashOf(current)] : []),
      loadLifecycleState: async (input) => { calls.lifecycle += 1; return lifecycle(input); },
      loadActionableCompleteness: async () => { calls.completeness += 1; return { fraction: 1, audienceUncertain: false }; },
      loadActionableProfileState: async () => ({ denominatorVersion: 'actionable-profile-1:BASE', audiences: [], audienceUncertain: false, fraction: 1, knownWeight: 1, totalWeight: 1, unresolved: [], unresolvedByArea: {} }),
      loadUrgentHomeActionState: async () => ({ nowCount: 0 }),
      loadHomeOpportunityState: async () => ({ contextVersion: 'v1', capitalItemsUpcoming: false, warrantyExpiring: false, openFindings: false }),
      loadActivePlanState: async () => ({ sellHoldRentActive: false }),
      recordOffers: async (input) => { offers.push(input); return { attempted: input.offers.length, ok: true }; },
      recordImpressions: () => {}, recordSuppression: () => {},
    },
  );
  return { ...out, offers, calls, shown: (out.result.suggestedNextActions ?? []) };
}
const keysShown = (r) => r.shown.map((a) => `${a.operationId}:${a.outcomeKey}`);
/** The hard assertion: exactly four distinct starters, or the approved bounded diagnostic (never a silent short row). */
function assertFour(r, label) {
  assert.equal(r.shown.length, SUGGESTED_NEXT_ACTION_LIMITS.maxShown, `${label}: ${keysShown(r).join(',')} :: ${JSON.stringify(r.report.exactFour)}`);
  assert.equal(new Set(keysShown(r)).size, 4, `${label}: four DISTINCT actions`);
  assert.equal(r.report.exactFour.applicability, 'EXACT_FOUR'); assert.equal(r.report.exactFour.shortage, 0, label);
  for (const key of keysShown(r)) assert.ok(CURATED_STARTER_OUTCOME_KEYS.includes(key), `${label}: ${key} is an approved starter`);
}

test('the registry is populated for activation: all four starter producers are registered and all seven outcomes are BOTH repeatable and prompt-history exempt', () => {
  assert.deepEqual(SUGGESTED_NEXT_ACTION_PRODUCERS.map((p) => p.id), ['operation-result.candidates', skillHandoffProducer.id, ...starterProducers.map((p) => p.id), urgentWorkProducer.id, activePlanProducer.id, capabilityRecommendationProducer.id, actionableProfileProducer.id, homeOpportunityProducer.id]);
  assert.equal(CURATED_STARTER_OUTCOME_KEYS.length, 7);
  for (const key of CURATED_STARTER_OUTCOME_KEYS) { assert.ok(REPEATABLE_OUTCOMES.has(key), key); assert.ok(PROMPT_HISTORY_EXEMPT_OUTCOMES.has(key), key); }
  for (const producer of starterProducers) assert.equal(producer.essential, false, 'starters remain optional when the deadline was already exhausted');
});

test('EMPTY-HOME VIEWER, typed question: the settled answer shows exactly four distinct approved starters, and every offer is recorded', async () => {
  const r = await run({ role: 'VIEWER', mode: 'UNKNOWN' });
  assertFour(r, 'viewer x unknown mode');
  assert.equal(r.offers.length, 1);
  assert.equal(r.offers[0].offers.length, 4);
  assert.ok(r.offers[0].offers.every((o) => o.slotClass === 'CURATED_STARTER' && o.currentResultOwnership === false));
  assert.equal(r.calls.completeness, 0, 'a starters-only turn never loads actionable completeness');
});

test('a settled answer with declared contextual workflow controls does not get an unrelated curated-starter footer', async () => {
  const r = await run({
    result: {
      blocks: [{
        type: 'LIST',
        actions: [{
          id: 'guide-current-project', label: 'Guide me through this project', message: 'Guide me through this project.',
          style: 'PRIMARY', interactionType: 'START_WORKFLOW', operationId: 'DIY_PROJECT_GUIDE',
        }],
      }],
    },
  });
  assert.equal(r.shown.length, 0);
  assert.deepEqual(r.report.exactFour, {
    policyVersion: 'sna-exact-four-1', applicability: 'EXEMPT', exemptReason: 'CONTEXTUAL_ACTIONS_IN_RESULT',
  });
  assert.equal(r.calls.lifecycle, 0, 'contextual results do not load starter lifecycle state');
  assert.equal(r.offers.length, 0, 'no starter offers are recorded when the rich result owns the next action');
});

test('the real finalizer shares one Property Context-backed state across profile, opportunity and completeness consumers', async () => {
  let sharedReads = 0;
  const out = await finalizeSuggestedNextActionsWithReport(
    { result: { status: 'ANSWERED', blocks: [], suggestions: [] }, executionId: 'e1', userId: 'u1', sessionId: 's1', propertyId: PROPERTY, operationId: 'MAINTENANCE_STATUS', message: 'What maintenance is pending?', completedSemanticKeyHashes: new Set() },
    {
      clock: { now: () => NOW },
      loadSharedPropertyState: async () => {
        sharedReads += 1;
        return {
          profile: { denominatorVersion: 'actionable-profile-1:BASE', audiences: [], audienceUncertain: false, fraction: 1, knownWeight: 1, totalWeight: 1, unresolved: [], unresolvedByArea: {} },
          opportunities: { contextVersion: 'ctx-shared', capitalItemsUpcoming: false, warrantyExpiring: false, openFindings: false },
        };
      },
      loadUrgentHomeActionState: async () => ({ nowCount: 0 }),
      loadActivePlanState: async () => ({ sellHoldRentActive: false }),
      loadOperationAvailability: async () => availability(),
      loadExecutionExpiresAt: async () => null,
      loadCurrentOutcomeKeyHashes: async () => new Set(),
      loadLifecycleState: okLifecycle(),
      recordOffers: async () => ({ attempted: 0, ok: true }),
      recordImpressions: () => {}, recordSuppression: () => {},
    },
  );
  assert.equal(sharedReads, 1);
  assertFour({ ...out, shown: out.result.suggestedNextActions }, 'shared Property Context state');
});

test('every role x operating mode reaches four on an empty home', async () => {
  for (const role of ['VIEWER', 'CONTRIBUTOR', 'OWNER']) for (const mode of ['UNKNOWN', 'BUYING', 'OWNING', 'SELLING']) assertFour(await run({ role, mode }), `${role}/${mode}`);
});

test('VERIFIED LAUNCH: the launched starter is excluded from its own answer and the row still reaches four (every starter as the launched one)', async () => {
  for (const current of ALL) {
    const r = await run({ current, role: 'VIEWER', operationId: current.operationId, message: current.message });
    assertFour(r, `launched ${keyOf(current)}`);
    assert.ok(!keysShown(r).includes(keyOf(current)), `${keyOf(current)} is not re-offered on its own answer`);
  }
});

test('ONE STARTER OPERATION DISABLED (each of the four, which removes every starter on it): still four', async () => {
  for (const operationId of ['PROPERTY_SUMMARY', 'SEASONAL_HOME_CARE', 'HOME_BASICS_GUIDE', 'HIRING_GUIDE']) {
    const r = await run({ disabled: operationId });
    assertFour(r, `disabled ${operationId}`);
    assert.ok(!keysShown(r).some((k) => k.startsWith(`${operationId}:`)), `${operationId} starters are absent`);
  }
});

test('DISABLED operation x VERIFIED launch together (the worst combined state the arithmetic requires 7 for): still four', async () => {
  for (const disabled of ['PROPERTY_SUMMARY', 'SEASONAL_HOME_CARE', 'HOME_BASICS_GUIDE']) for (const current of ALL.filter((c) => c.operationId !== disabled)) {
    assertFour(await run({ disabled, current }), `disabled ${disabled} + launched ${keyOf(current)}`);
  }
});

test('RECENT STARTER HISTORY: five just-asked starter messages plus the current one do not suppress a starter (the prompt-history exemption), and completion does not either (repeatable)', async () => {
  const recent = ALL.slice(0, 5).map((c) => c.message);
  assertFour(await run({ recent }), 'five starters asked recently');
  const completed = new Set(ALL.map(hashOf));
  const out = await finalizeSuggestedNextActionsWithReport(
    { result: { status: 'ANSWERED', blocks: [], suggestions: [] }, executionId: 'e1', userId: 'u1', sessionId: 's1', propertyId: PROPERTY, operationId: 'MAINTENANCE_STATUS', message: 'What maintenance is pending?', completedSemanticKeyHashes: completed },
    { clock: { now: () => NOW }, loadOperationAvailability: async () => availability(), loadExecutionExpiresAt: async () => null, loadCurrentOutcomeKeyHashes: async () => new Set(), loadLifecycleState: okLifecycle(), loadActionableProfileState: async () => ({ denominatorVersion: 'actionable-profile-1:BASE', audiences: [], audienceUncertain: false, fraction: 1, knownWeight: 1, totalWeight: 1, unresolved: [], unresolvedByArea: {} }), loadUrgentHomeActionState: async () => ({ nowCount: 0 }), loadHomeOpportunityState: async () => ({ contextVersion: 'v1', capitalItemsUpcoming: false, warrantyExpiring: false, openFindings: false }), loadActivePlanState: async () => ({ sellHoldRentActive: false }), recordOffers: async () => ({ attempted: 0, ok: true }), recordImpressions: () => {}, recordSuppression: () => {} },
  );
  assert.equal(out.result.suggestedNextActions.length, 4, 'every starter completed in the session: repeatable, so still four');
});

test('DISMISSAL: dismissed starters (cooldown/dismissal keys) are skipped and the remaining starters still reach four; up to three dismissed is within the supported state', async () => {
  const dismissed = [ALL[0], ALL[2], ALL[4]];
  const r = await run({ lifecycle: okLifecycle({ cooldownKeys: new Set(dismissed.map(lk)) }) });
  assertFour(r, 'three dismissed');
  for (const d of dismissed) assert.ok(!keysShown(r).includes(keyOf(d)), `${keyOf(d)} dismissed`);
});

test('ROTATION: the least recently offered starters fill the row first, and an offer inside the rotation window is only reused when nothing older exists', async () => {
  const recentlyOffered = new Map(ALL.slice(0, 3).map((c, i) => [lk(c), NOW.getTime() - (i + 1) * 3600_000]));
  const r = await run({ lifecycle: okLifecycle({ lastOfferedAtMs: recentlyOffered }) });
  assertFour(r, 'rotation');
  const neverOffered = ALL.slice(3).map(keyOf);
  assert.deepEqual([...keysShown(r)].sort(), [...neverOffered].sort(), 'the four never-offered starters win over the three recently offered');
  assert.equal(r.report.exactFour.startersWithinRotationWindow, 0);
  // With only recently offered starters available, the row is still four and reports the within-window count.
  const allRecent = new Map(ALL.map((c, i) => [lk(c), NOW.getTime() - (i + 1) * 1000]));
  const reused = await run({ lifecycle: okLifecycle({ lastOfferedAtMs: allRecent }) });
  assertFour(reused, 'all recently offered');
  assert.equal(reused.report.exactFour.startersWithinRotationWindow, 4);
  assert.ok(STARTER_ROTATION_MS > 0);
});

test('BUDGET-DROPPED OPPORTUNITY PRODUCER: a nonessential producer dropped for budget never shortens the row, and is reported as dropped', async () => {
  let ticks = 0;
  const opportunity = { id: 'opportunity.fake', source: 'CAPABILITY_RECOMMENDATION', essential: false, nominate: () => [{ ...ALL[0], slotClass: 'HOME_OPPORTUNITY', operationId: 'WARRANTY_LOOKUP', outcomeKey: 'REVIEW_X' }] };
  // The clock stays inside the budget for the essential and starter producers, then jumps past it before the last producer.
  // Calls: start, one per producer (result producer, four starters, the opportunity producer), then the finish.
  const nowMs = () => { ticks += 1; return ticks <= 8 + starterProducers.length ? 0 : SUGGESTED_NEXT_ACTION_BUDGET.pipelineMs + 1; };
  const r = await run({ producers: [...SUGGESTED_NEXT_ACTION_PRODUCERS, opportunity], nowMs });
  assert.deepEqual(r.report.droppedProducers, [{ producer: 'opportunity.fake', reason: 'BUDGET' }]);
  assertFour(r, 'budget-dropped opportunity');
});

test('SLOW OPTIONAL ENRICHMENT cannot consume the budget before static exact-four starters are nominated', async () => {
  let elapsed = 0;
  const slowEnrichment = { id: 'enrichment.slow', source: 'PLATFORM_STATE', essential: false, nominate: () => { elapsed = SUGGESTED_NEXT_ACTION_BUDGET.pipelineMs + 1; return []; } };
  const trailingEnrichment = { id: 'enrichment.trailing', source: 'PLATFORM_STATE', essential: false, nominate: () => [] };
  const r = await run({
    producers: [skillHandoffProducer, ...starterProducers, slowEnrichment, trailingEnrichment],
    nowMs: () => elapsed,
  });
  assert.deepEqual(r.report.droppedProducers, [{ producer: 'enrichment.trailing', reason: 'BUDGET' }]);
  assertFour(r, 'slow enrichment after starters');
});

test('BOUNDED DIAGNOSTIC: when the starters themselves are dropped for budget, nothing is invented: zero actions and the approved shortage diagnostic naming the cause', async () => {
  let ticks = 0;
  const nowMs = () => { ticks += 1; return ticks === 1 ? 0 : SUGGESTED_NEXT_ACTION_BUDGET.pipelineMs + 1; };
  const r = await run({ nowMs });
  assert.equal(r.shown.length, 0);
  assert.equal(r.report.droppedProducers.length, starterProducers.length + 5);
  assert.ok(r.report.droppedProducers.every((d) => d.reason === 'BUDGET'));
  assert.equal(r.report.exactFour.applicability, 'EXACT_FOUR');
  assert.equal(r.report.exactFour.shortage, 4);
  assert.deepEqual(r.report.exactFour.shortageReasons, ['NO_CANDIDATES', 'PRODUCER_DROPPED']);
});

test('BOUNDED DIAGNOSTIC: all seven starters in cooldown is a degraded row with the approved reason (COOLDOWN_SUPPRESSED), not a silent short row', async () => {
  const r = await run({ lifecycle: okLifecycle({ cooldownKeys: new Set(ALL.map(lk)) }) });
  assert.equal(r.shown.length, 0);
  assert.equal(r.report.exactFour.applicability, 'EXACT_FOUR');
  assert.equal(r.report.exactFour.shortage, 4);
  assert.ok(r.report.exactFour.shortageReasons.includes('COOLDOWN_SUPPRESSED'));
});

test('LIFECYCLE OUTAGE fails open: the row still reaches four, and the offer is recorded best effort', async () => {
  const r = await run({ lifecycle: okLifecycle({ ok: false }) });
  assertFour(r, 'lifecycle read failed');
});

test('EXEMPT STATES keep the starters out: a recovery status, a pending clarification, and a property-less turn show no starter', async () => {
  const recovery = await run({ status: 'UNAVAILABLE' });
  assert.equal(recovery.report.exactFour.applicability, 'EXEMPT');
  assert.ok(!keysShown(recovery).some((k) => CURATED_STARTER_OUTCOME_KEYS.includes(k)), 'no starter in recovery');
  const clarifying = await run({ result: { clarification: { question: 'Which home?', options: [] } } });
  assert.equal(clarifying.report.exactFour.applicability, 'EXEMPT');
  assert.equal(clarifying.report.exactFour.exemptReason, 'PENDING_INTERACTION');
  const noProperty = await run({ propertyId: null });
  assert.equal(noProperty.shown.length, 0);
  assert.equal(noProperty.calls.lifecycle, 0, 'a property-less turn loads no lifecycle');
});
