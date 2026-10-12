const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { negotiationShieldCasesFromView, negotiationShieldReviewFromView, chunkNegotiationDraft } = require('../../src/services/ask/handlers/negotiationShield.handler.ts');

// Negotiation Shield slice 1: a row's Review action opens one case's stored analysis and latest draft, inside the conversation.

const CASE = {
  id: 'case-1', propertyId: 'prop-1', createdByUserId: 'user-1', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', status: 'ANALYZED', title: 'Roof replacement quote',
  description: 'raw description', sourceType: 'MANUAL', perspective: 'HOMEOWNER', analysisVersion: 'v1', latestAnalysisAt: new Date('2026-10-03T12:00:00Z'),
  quoteDecisionWorkspaceId: null, createdAt: new Date('2026-10-01T12:00:00Z'), updatedAt: new Date('2026-10-03T12:00:00Z'),
};
const ANALYSIS = {
  id: 'an-1', caseId: 'case-1', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', summary: 'The quote is complete but the labor line is not itemized.',
  findings: [{ key: 'labor', title: 'Labor is not itemized', detail: 'The quote gives one labor total.', status: 'MISSING' }],
  negotiationLeverage: [{ key: 'competing', title: 'You can compare quotes', detail: 'A second quote gives you a reference.', strength: 'MEDIUM' }],
  recommendedActions: [{ key: 'ask', title: 'Ask for an itemized estimate', detail: 'Request labor and materials separately.', priority: 'HIGH' }],
  pricingAssessment: { status: 'NEEDS_COMPARISON', summary: 'Compare before deciding.', rationale: ['Only one quote is on file.'], confidenceLabel: 'MEDIUM', confidenceExplanation: 'One quote and no market range.', currency: 'USD', quoteAmount: 18500 },
  confidence: 0.6, generatedAt: new Date('2026-10-03T12:00:00Z'), modelVersion: 'contractor-quote-v1', createdAt: new Date('2026-10-03T12:00:00Z'),
  // Fields the review must never carry through.
  rawText: 'RAW EXTRACTED DOCUMENT TEXT', storageKey: 'secret/key.pdf', fileUrl: 'https://files.example/secret.pdf',
};
const DRAFT = { id: 'dr-1', caseId: 'case-1', draftType: 'EMAIL', subject: 'Question about your estimate', body: 'Hello,\n\nCould you itemize the labor and materials before we proceed?\n\nThank you.', tone: 'polite', isLatest: true, createdAt: new Date('2026-10-03T12:00:00Z') };

function stub({ record = { ...CASE, analyses: [ANALYSIS], drafts: [DRAFT] }, role = 'VIEWER' } = {}) {
  const saved = { model: prisma.negotiationShieldCase, resolve: propertyAccess.resolvePropertyAccess };
  const queries = [];
  prisma.negotiationShieldCase = {
    findFirst: async (args) => { queries.push(args); return record && args.where.propertyId === record.propertyId && args.where.id === record.id ? record : null; },
    findMany: async () => [record].filter(Boolean),
  };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return { queries, restore() { prisma.negotiationShieldCase = saved.model; propertyAccess.resolvePropertyAccess = saved.resolve; } };
}
const invoke = (launchContext, propertyId = 'prop-1', role = 'VIEWER') => capabilityInvoke('NEGOTIATION_SHIELD_CASES',
  { userId: 'user-1', propertyId, message: launchContext ? 'Review this negotiation case.' : 'Show my negotiation shield cases', launchContext }, { propertyAccess: { role } });
const REVIEW_LAUNCH = { operationId: 'NEGOTIATION_SHIELD_CASES', entityType: 'NEGOTIATION_SHIELD_CASE', entityId: 'case-1', surface: 'ASK_PAGE' };
const evidence = { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'negotiation-shield.cases', operationId: 'NEGOTIATION_SHIELD_CASES', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-03T00:00:00.000Z' }] } };

test('each case row offers Review as an in-conversation read of that case, and the list no longer says the analysis is unavailable', () => {
  const result = negotiationShieldCasesFromView([{ ...CASE, latestAnalysisAt: '2026-10-03T12:00:00.000Z', createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-03T12:00:00.000Z' }], 'prop-1');
  const list = result.blocks.find((block) => block.id === 'negotiation-shield-cases');
  const [row] = list.sections[0].items;
  assert.equal(row.entityType, 'NEGOTIATION_SHIELD_CASE');
  assert.equal(row.id, 'case-1');
  assert.deepEqual(row.actions.map((a) => [a.id, a.label, a.operationId, a.interactionType]), [['negotiation-shield-review', 'Review', 'NEGOTIATION_SHIELD_CASES', 'CONVERSATION_CONTINUE']]);
  assert.equal(row.href, null);
  assert.doesNotMatch(JSON.stringify(result), /not currently available in Ask\.[^"]*analysis|analysis and draft of each review are not currently available/);
});

test('Review shows the analysis, then the draft collapsed-by-design in its own block, with the boundary and a way back', async () => {
  const s = stub();
  try {
    const result = await invoke(REVIEW_LAUNCH);
    assert.equal(result.status, 'ANSWERED');
    assert.equal(result.reasonCode, 'NEGOTIATION_SHIELD_REVIEW_READY');
    assert.deepEqual(result.blocks.map((b) => b.id), [
      'negotiation-shield-review-summary', 'negotiation-shield-pricing', 'negotiation-shield-findings', 'negotiation-shield-leverage',
      'negotiation-shield-next-steps', 'negotiation-shield-confidence', 'negotiation-shield-draft', 'negotiation-shield-boundary',
    ]);
    const summary = result.blocks[0];
    assert.equal(summary.title, 'Roof replacement quote');
    assert.match(summary.body, /labor line is not itemized/);
    assert.match(summary.supportLine, /Contractor quote review/);
    assert.match(summary.supportLine, /Medium confidence/);
    assert.deepEqual(summary.actions.map((a) => a.id), ['negotiation-shield-back']);
    assert.match(JSON.stringify(result.blocks[1]), /\$18,500/);

    const draft = result.blocks.find((b) => b.id === 'negotiation-shield-draft');
    assert.match(draft.title, /nothing has been sent/);
    assert.match(draft.description, /cannot send it/);
    const [part] = draft.sections[0].items;
    assert.equal(part.status, 'Draft');
    assert.match(part.detail, /itemize the labor and materials/);
    assert.equal(part.description ?? null, null, 'the body is only in the on-demand detail, never in the always-visible description');
    assert.deepEqual(draft.actions, []);
  } finally { s.restore(); }
});

test('the review never carries raw input text, document keys, file URLs or desktop links', async () => {
  const s = stub();
  try {
    const result = await invoke(REVIEW_LAUNCH);
    const serialized = JSON.stringify(result);
    for (const forbidden of ['RAW EXTRACTED DOCUMENT TEXT', 'secret/key.pdf', 'files.example', 'raw description', '/dashboard', 'http']) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
    // The query reads the case, its latest analysis and its latest draft, and only the NEWEST INPUT'S TIMESTAMP (whether a run is possible and whether
    // the details changed since the analysis): never an input's text or data, documents or buyer finding links.
    const [query] = s.queries;
    assert.deepEqual(Object.keys(query.include).sort(), ['analyses', 'documents', 'drafts', 'inputs']);
    assert.deepEqual(query.include.inputs.select, { updatedAt: true });
    assert.equal(query.include.inputs.take, 1);
    // The attached documents are selected by link id, record id, role, title, visibility and scan state: never a storage key, file name, file link or content.
    assert.deepEqual(Object.keys(query.include.documents.select).sort(), ['document', 'documentId', 'documentType', 'id']);
    assert.deepEqual(query.include.documents.select.document.select, { title: true, visibility: true, currentVersion: { select: { scanStatus: true, integrityStatus: true } } });
    assert.equal(query.include.documents.take, 25);
    assert.deepEqual(query.where, { id: 'case-1', propertyId: 'prop-1' });
  } finally { s.restore(); }
});

test('a case is resolved inside the property: another property\'s case id is "no longer available"', async () => {
  const s = stub();
  try {
    const result = await invoke({ ...REVIEW_LAUNCH, entityId: 'case-1' }, 'prop-2');
    assert.equal(result.status, 'NOT_APPLICABLE');
    assert.equal(result.reasonCode, 'NEGOTIATION_SHIELD_CASE_NOT_FOUND');
    assert.equal(s.queries[0].where.propertyId, 'prop-2');
    assert.deepEqual(result.blocks[0].actions.map((a) => a.id), ['negotiation-shield-back']);
  } finally { s.restore(); }
});

test('a case with no analysis says so plainly and offers only the way back', async () => {
  const s = stub({ record: { ...CASE, status: 'DRAFT', latestAnalysisAt: null, analyses: [], drafts: [] } });
  try {
    const result = await invoke(REVIEW_LAUNCH);
    assert.equal(result.reasonCode, 'NEGOTIATION_SHIELD_REVIEW_NOT_ANALYZED');
    assert.deepEqual(result.blocks.map((b) => b.id), ['negotiation-shield-review-summary', 'negotiation-shield-boundary']);
    assert.match(result.blocks[0].body, /has not been analyzed yet/);
    assert.deepEqual(result.blocks[0].actions.map((a) => a.id), ['negotiation-shield-back']);
    assert.equal(JSON.stringify(result).includes('negotiation-shield-draft'), false);
  } finally { s.restore(); }
});

test('without a launched case the same operation is still the list, and a viewer may read both', async () => {
  const s = stub();
  try {
    const list = await invoke(null, 'prop-1', 'VIEWER');
    assert.equal(list.reasonCode, 'NEGOTIATION_SHIELD_CASES_READY');
    const review = await invoke(REVIEW_LAUNCH, 'prop-1', 'VIEWER');
    assert.equal(review.reasonCode, 'NEGOTIATION_SHIELD_REVIEW_READY');
  } finally { s.restore(); }
});

test('every block and action of the list and the review survives the answer-trust validator', async () => {
  const s = stub();
  try {
    for (const launch of [null, REVIEW_LAUNCH]) {
      const raw = await invoke(launch);
      const result = { ...raw, parameters: evidence };
      const { result: validated } = validateAskAnswerTrust({ question: 'Review this negotiation case.', operationId: 'NEGOTIATION_SHIELD_CASES', result, propertyId: 'prop-1' });
      assert.deepEqual(validated.blocks.map((b) => b.id), result.blocks.map((b) => b.id));
      const actions = (blocks) => blocks.flatMap((b) => [...(b.actions ?? []), ...((b.sections ?? []).flatMap((sec) => sec.items.flatMap((i) => i.actions ?? [])))]).map((a) => a.id);
      assert.deepEqual(actions(validated.blocks), actions(result.blocks), 'no action was stripped');
      assert.ok(actions(result.blocks).length > 0);
    }
  } finally { s.restore(); }
});

test('a long draft is split at paragraph boundaries into pieces the on-demand detail can hold', () => {
  const paragraph = 'Sentence one is here. '.repeat(20).trim();
  const body = [paragraph, paragraph, paragraph, paragraph].join('\n\n');
  const parts = chunkNegotiationDraft(body);
  assert.ok(parts.length >= 2);
  for (const part of parts) assert.ok(part.length <= 1200, `${part.length}`);
  assert.equal(parts.join(' ').replace(/\s+/g, ' ').trim(), body.replace(/\s+/g, ' ').trim());
  assert.deepEqual(chunkNegotiationDraft('short'), ['short']);
  const unbroken = chunkNegotiationDraft('word '.repeat(600));
  for (const part of unbroken) assert.ok(part.length <= 1200);
});
