// Live-prompt OUTCOMES, not card shape. clarificationContract.test.js proves that any clarification card is well formed; it cannot tell a prompt that should have been ANSWERED from one that should
// have been clarified. This file states, per live prompt, what the homeowner must get, and runs it through the production chain (cascade -> dispatcher -> executor -> evidence -> trust + relevance gate).
//
// KNOWN_GAPS lists prompts that do NOT yet get that outcome (none today). Each asserts today's behaviour so the gap is visible and cannot widen; fixing one makes its assertion fail until the entry is moved to DELIVERED.
// The list may only SHRINK.
const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const X = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { resolveAskSemanticEntryDecision } = require('../../src/services/ask/semantic/semanticEntryDispatcher.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');

const base = buildSeededCrossDomainSnapshot();
const permits = [
  { id: 'P1', propertyId: base.propertyId, category: 'ELECTRICAL', permitNumber: 'E-100', officialStatus: 'ISSUED', reportedStatus: null },
  { id: 'P2', propertyId: base.propertyId, category: 'PLUMBING', permitNumber: 'P-200', officialStatus: 'FINALED', reportedStatus: null },
];
const route = (message) => resolveAskRoutingCascade(message, { localMinimumConfidence: 0.42, ambiguityMargin: 0.1 });

// What the homeowner receives for a typed read: delivered text, or the withheld "not sure" card, from the real gate.
async function typedDelivery(message) {
  const routing = route(message);
  const entry = resolveAskSemanticEntryDecision({ rawMessage: message, routingStage: routing.stage, routingOperationId: routing.operation.operationId, requiresClarification: routing.requiresClarification });
  if (!entry.shouldDispatchToSemanticEntry) return { dispatched: false, routing };
  const execution = await X.executeCrossDomainSnapshot({ rawText: message, snapshot: { ...base, permits }, role: 'OWNER', propertyAuthorized: true });
  const result = attachAskAuthoritativeSourceEvidence(X.buildOperationResultFromCrossDomainExecution(execution), [completedAskAuthoritativeSourceEvidence('DATA_POINT_READ')]);
  const gate = validateAskAnswerTrustPipeline({ question: message, operationId: 'DATA_POINT_READ', result, propertyId: base.propertyId, semanticEnabled: true, routedDeterministically: routing.stage === 'DETERMINISTIC', provisionalRead: routing.stage === 'PROVISIONAL' });
  const withheld = gate.result.blocks.some((block) => block.id === 'answer-unverified') || gate.result.reasonCode === 'ASK_ANSWER_UNVERIFIED_NO_ALTERNATIVE';
  return { dispatched: true, routing, gate, withheld, summary: gate.result.blocks.find((block) => block.type === 'SUMMARY')?.body ?? '' };
}

const DELIVERED = [
  { prompt: 'are there any open claims or pending permits for this home?', mustMention: [/open claim\(s\)/, /open permit\(s\)/] },
];

for (const { prompt, mustMention } of DELIVERED) {
  test(`DELIVERED: "${prompt}" is answered, not withheld and not turned into a question`, async () => {
    const out = await typedDelivery(prompt);
    assert.equal(out.dispatched, true, 'must reach the typed stack');
    assert.equal(out.withheld, false, JSON.stringify(out.gate.trust.reasonCodes));
    assert.notEqual(out.gate.result.status, 'NEEDS_CLARIFICATION');
    for (const pattern of mustMention) assert.match(out.summary, pattern);
  });
}

// The seller-readiness prompt moved here from KNOWN_GAPS (FR-FAST-10 amended 2026-11-18): it now starts SELLER_PREP_CHECKLIST provisionally. Delivery of its narrowed answer through the real handler and gate is asserted in provisionalSellerPrep.test.js.
// "High risk" = the Appliance Oracle's failure risk by age; "missing documents" = nothing linked to the appliance or its warranties (owner definition 2026-11-18). Narrowing and delivery are asserted in provisionalApplianceRisk.test.js.
test('DELIVERED: "list appliances that have missing documents and are high risk" starts the Appliance Oracle, not a document lookup or a question', () => {
  const routing = route('list appliances that have missing documents and are high risk');
  assert.equal(routing.stage, 'PROVISIONAL');
  assert.equal(routing.operation.operationId, 'APPLIANCE_FAILURE_RISK');
  assert.equal(routing.requiresClarification, false);
});

test('DELIVERED: "show seller readiness items that involve appliances" starts the seller-prep checklist, not recalls or replacement risk', () => {
  const routing = route('show seller readiness items that involve appliances');
  assert.equal(routing.stage, 'PROVISIONAL');
  assert.equal(routing.operation.operationId, 'SELLER_PREP_CHECKLIST');
});

// No known gaps remain. A new entry belongs here only with a recorded cause and an assertion of today's behaviour; the list may only shrink.
const KNOWN_GAPS = [];

test('no live prompt is left as a known gap without an entry that records why', () => {
  assert.deepEqual(KNOWN_GAPS, []);
});
