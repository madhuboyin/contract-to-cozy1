require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { homeOpportunityCandidates, loadHomeOpportunityState } = require('../../src/services/ask/suggestedActions/homeOpportunityCandidates.ts');
const { warrantyFocus, WARRANTY_EXPIRING_DAYS } = require('../../src/services/ask/handlers/warranties.handler.ts');
const { parseCapitalTimelineHorizonRequest } = require('../../src/services/ask/askHandlerSupport.ts');

const fact = (value) => ({ key: 'x', state: 'KNOWN', value, evidence: [], observedAt: null, validUntil: null, correctionPath: null });

test('approved opportunity signals are derived from one scoped context read with the shared warranty window', async () => {
  const calls = [];
  const now = new Date('2026-10-07T12:00:00.000Z');
  const state = await loadHomeOpportunityState({ userId: 'u1', propertyId: 'p1' }, now, async (...args) => {
    calls.push(args);
    return {
      propertyId: 'p1', contextVersion: 'ctx-1', generatedAt: now.toISOString(), scopes: ['FINANCIAL', 'COVERAGE', 'INSPECTION'], warnings: [],
      facts: {
        'financial.upcomingCapitalExposure': fact([{ windowStart: '2028-09-01T00:00:00.000Z', windowEnd: '2028-11-01T00:00:00.000Z' }]),
        'coverage.warranties': fact([{ startDate: '2025-01-01T00:00:00.000Z', expiryDate: new Date(now.getTime() + WARRANTY_EXPIRING_DAYS * 86_400_000).toISOString() }]),
        'inspection.openFindings': fact([{ id: 'finding-1' }]),
      },
    };
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][2], { scopes: ['FINANCIAL', 'COVERAGE', 'INSPECTION'] });
  assert.deepEqual(state, { contextVersion: 'ctx-1', capitalItemsUpcoming: true, warrantyExpiring: true, openFindings: true });
});

test('O1-O3 candidates use deterministic prompts that select the intended handler focus', async () => {
  const candidates = await homeOpportunityCandidates({ userId: 'u1', propertyId: 'p1' }, async () => ({
    contextVersion: 'ctx-1', capitalItemsUpcoming: true, warrantyExpiring: true, openFindings: true,
  }));
  assert.deepEqual(candidates.map((candidate) => candidate.outcomeKey), ['REVIEW_CAPITAL_OUTLOOK', 'REVIEW_EXPIRING_WARRANTIES', 'REVIEW_OPEN_FINDINGS']);
  const capital = candidates.find((candidate) => candidate.operationId === 'CAPITAL_RESERVE_PLAN');
  const warranty = candidates.find((candidate) => candidate.operationId === 'WARRANTY_LOOKUP');
  assert.equal(parseCapitalTimelineHorizonRequest(capital.message), null, 'no explicit horizon means the handler uses its existing/default 10-year horizon');
  assert.equal(warrantyFocus(warranty.message).expiring, true);
  assert.ok(candidates.every((candidate) => candidate.slotClass === 'HOME_OPPORTUNITY'));
});

test('no opportunity is nominated without its canonical why-now signal', async () => {
  assert.deepEqual(await homeOpportunityCandidates({ userId: 'u1', propertyId: 'p1' }, async () => ({
    contextVersion: 'ctx-1', capitalItemsUpcoming: false, warrantyExpiring: false, openFindings: false,
  })), []);
});
