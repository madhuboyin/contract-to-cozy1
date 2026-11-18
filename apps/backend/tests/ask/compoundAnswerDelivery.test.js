// Regression for the live prompt "are there any open claims or pending permits for this home?".
// The executor test (typedPermitRecordQueries) proved the answer was CORRECT; this proves it is DELIVERED. It runs the production chain the executor test skips:
// routing cascade -> semantic entry dispatch -> cross-domain execution -> source evidence -> the trust + relevance gate createAskExecution applies, with the
// same flags (a PROVISIONAL stage start is a provisional read). Before the fix the gate withheld the answer ("I'm not sure that answers your question").
const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const X = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { resolveAskSemanticEntryDecision } = require('../../src/services/ask/semantic/semanticEntryDispatcher.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { groundedReadVerdict } = require('../../src/services/ask/support/provisionalRead.ts');

const base = buildSeededCrossDomainSnapshot();
const permit = (id, category, number, officialStatus, reportedStatus) => ({ id, propertyId: base.propertyId, category, permitNumber: number, officialStatus, reportedStatus });
const permits = [permit('P1', 'ELECTRICAL', 'E-100', 'ISSUED', null), permit('P2', 'PLUMBING', 'P-200', 'FINALED', null)];

async function deliver(message, snapshot = { ...base, permits }) {
  const routing = resolveAskRoutingCascade(message, { localMinimumConfidence: 0.42, ambiguityMargin: 0.1 });
  const entry = resolveAskSemanticEntryDecision({ rawMessage: message, routingStage: routing.stage, routingOperationId: routing.operation.operationId, requiresClarification: routing.requiresClarification });
  assert.equal(entry.shouldDispatchToSemanticEntry, true, 'the dispatcher must hand this prompt to the typed stack');
  const execution = await X.executeCrossDomainSnapshot({ rawText: message, snapshot, role: 'OWNER', propertyAuthorized: true });
  const raw = X.buildOperationResultFromCrossDomainExecution(execution);
  const result = attachAskAuthoritativeSourceEvidence(raw, [completedAskAuthoritativeSourceEvidence('DATA_POINT_READ')]);
  const gate = validateAskAnswerTrustPipeline({
    question: message, operationId: 'DATA_POINT_READ', result, propertyId: base.propertyId, semanticEnabled: true,
    routedDeterministically: routing.stage === 'DETERMINISTIC', provisionalRead: routing.stage === 'PROVISIONAL',
  });
  return { routing, execution, result, gate };
}

test('open claims or pending permits is delivered, both parts answered, not replaced by "I’m not sure that answers your question"', async () => {
  const { gate } = await deliver('are there any open claims or pending permits for this home?');
  assert.notEqual(gate.result.reasonCode, 'ASK_ANSWER_UNVERIFIED_NO_ALTERNATIVE', JSON.stringify(gate.trust.reasonCodes));
  assert.deepEqual(gate.result.blocks.map((b) => b.id).includes('answer-unverified'), false);
  assert.equal(gate.trust.outcome, 'PASS', JSON.stringify(gate.trust.reasonCodes));
  const summary = gate.result.blocks.find((b) => b.type === 'SUMMARY');
  assert.match(summary.body, /open claim\(s\)/);
  assert.match(summary.body, /open permit\(s\)/);
});

test('grounding is per facet: a compound answer whose receipt does not match its own question stays withheld', async () => {
  const { result } = await deliver('are there any open claims or pending permits for this home?');
  assert.equal(groundedReadVerdict('are there any open claims or pending permits for this home?', result).outcome, 'PASS');
  // The same answer offered for a different compound question is not grounded.
  const other = groundedReadVerdict('which permits are open and which warranties are expiring', result);
  assert.equal(other.outcome, 'FAIL');
  // A tampered second receipt (wrong projection) is not grounded.
  const tampered = JSON.parse(JSON.stringify(result));
  tampered.parameters.crossDomainExecution.facetResults[1].receipt.projection = 'COUNT';
  tampered.parameters.crossDomainExecution.facetResults[1].receipt.population.confirmedCount = 1;
  tampered.parameters.crossDomainExecution.facetResults[1].receipt.population.totalMatchCount = 2;
  const verdict = groundedReadVerdict('are there any open claims or pending permits for this home?', tampered);
  assert.equal(verdict.outcome, 'FAIL');
});

test('a compound answer that left a part unanswered is not grounded (it names its own gap instead)', async () => {
  const message = 'are there any open claims or pending permits for this home?';
  const { result } = await deliver(message);
  const partial = JSON.parse(JSON.stringify(result));
  partial.parameters.crossDomainExecution.status = 'PARTIAL';
  assert.equal(groundedReadVerdict(message, partial).outcome, 'FAIL');
  const overflow = JSON.parse(JSON.stringify(result));
  overflow.parameters.crossDomainExecution.overflowFacets = [{ facetId: 'x' }];
  assert.equal(groundedReadVerdict(message, overflow).outcome, 'FAIL');
});
