const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Capital planning batch of the handler sweep: the property-tax appeal readiness answer links to no Property Tax Center page (owner
// decision, 2026-10-10), and a capture card built for it carries no desktop fallback link. The real handler runs with the readiness
// service, the feature-context evaluation and access stubbed.
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const taxService = require('../../src/services/propertyTax/propertyTaxAppealReadiness.service.ts');
const featureContext = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const originals = { prisma: prismaModule.prisma, evaluate: taxService.propertyTaxAppealReadinessService.evaluate, context: featureContext.evaluateFeatureContext, access: propertyAccess.resolvePropertyAccess };
const requirement = { requirementId: 'r1', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', capture: { captureKey: 'TAX_FACT', title: 'Assessed value', question: 'What is the assessed value?', inputSchema: { type: 'DECIMAL', min: 0, max: 1e9, unit: 'USD' }, allowNotSure: true, sensitivity: 'STANDARD' } };

test.beforeEach(() => {
  prismaModule.prisma = new Proxy({}, { get: (_t, model) => (model === 'then' ? undefined : new Proxy({}, { get: () => async () => null })) });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
  featureContext.evaluateFeatureContext = async () => ({ contextVersion: 'ctx-1', requirements: [requirement] });
});
test.afterEach(() => {
  prismaModule.prisma = originals.prisma;
  taxService.propertyTaxAppealReadinessService.evaluate = originals.evaluate;
  featureContext.evaluateFeatureContext = originals.context;
  propertyAccess.resolvePropertyAccess = originals.access;
});

const ask = () => capabilityInvoke('PROPERTY_TAX_APPEAL_READINESS', { userId: 'u1', propertyId: 'p1', message: 'Am I ready to appeal my property tax?' }, { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'p1' } });

test('a covered jurisdiction with gaps, and one with no reviewed rules, link nowhere and carry no desktop fallback', async () => {
  taxService.propertyTaxAppealReadinessService.evaluate = async () => ({
    status: 'GAPS', reason: 'Two items are missing.', gaps: ['Recent comparable sales', 'Assessment notice'], evidence: [], effort: 'MEDIUM', taxAtStake: { low: 400, high: 900 },
    ground: { label: 'Overvaluation' }, canonical: null, ruleProfile: null, professionalBoundary: 'Verify with the authority.', evaluatedAt: '2026-10-01T00:00:00.000Z',
  });
  const gaps = await ask();
  assert.equal(JSON.stringify(gaps).includes('/dashboard/'), false);
  assert.deepEqual(gaps.blocks.find((block) => block.id === 'tax-readiness-summary').actions, []);
  for (const block of gaps.blocks) for (const section of block.sections ?? []) for (const entry of section.items) assert.ok(entry.href == null, entry.id);
  assert.ok(gaps.captureRequests.length > 0, 'the capture card is still offered');
  assert.equal(gaps.captureRequests.every((request) => request.fallbackHref === undefined || request.fallbackHref === null), true);

  taxService.propertyTaxAppealReadinessService.evaluate = async () => ({ status: 'NOT_COVERED', reason: null, professionalBoundary: 'Verify with the authority.' });
  const notCovered = await ask();
  assert.equal(notCovered.reasonCode, 'PROPERTY_TAX_RULE_COVERAGE_UNAVAILABLE');
  assert.deepEqual(notCovered.blocks[0].actions, []);
  assert.equal(JSON.stringify(notCovered).includes('/dashboard/'), false);
});
