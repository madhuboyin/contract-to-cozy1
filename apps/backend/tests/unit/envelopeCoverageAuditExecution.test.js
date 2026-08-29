const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  executeEnvelopeCoverageAudit,
} = require('../../src/services/intelligence/envelopeCoverageAuditExecution.service.ts');

const NOW = new Date('2026-08-28T12:00:00.000Z');

function page({ nextCursor = null, diagnostics = [], observedCapabilities = [] } = {}) {
  return {
    page: {
      items: [],
      nextCursor,
      diagnostics,
      contextVersion: 'context-v1',
      generatedAt: NOW.toISOString(),
    },
    observedCapabilities,
  };
}

test('a zero-property audit still reconciles the declared universe as complete', async () => {
  let reconciliationInput;
  const result = await executeEnvelopeCoverageAudit({}, {
    listProperties: async () => [],
    reconcile: async (findings, options) => {
      reconciliationInput = { findings, options };
      return { created: findings.length, updated: 0, retired: 0 };
    },
    now: () => NOW,
  });

  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.evaluationStatus, 'NOT_MEASURED');
  assert.ok(result.findings > 0);
  assert.equal(reconciliationInput.options.complete, true);
  assert.ok(reconciliationInput.findings.every(({ evidenceBasis }) => evidenceBasis === 'DECLARED_ONLY'));
});

test('stable property and Envelope paging uses resolved owners and accumulates exact observations', async () => {
  const propertyCalls = [];
  const queryCalls = [];
  let reconciledComplete = null;
  const observed = {
    producerModel: 'Signal',
    type: 'SIGNAL',
    domain: 'SAFETY',
    nativeSubtype: 'RISK_SPIKE',
    observedAt: '2026-08-20T12:00:00.000Z',
    envelopeKey: `env_${'a'.repeat(64)}`,
  };
  const result = await executeEnvelopeCoverageAudit({ propertyPageSize: 1 }, {
    listProperties: async (input) => {
      propertyCalls.push(input);
      if (input.afterId === null) return [{ id: 'property-1', homeownerProfile: { userId: 'owner-1' } }];
      return [];
    },
    queryProperty: async (input) => {
      queryCalls.push(input);
      return input.cursor ? page() : page({ nextCursor: 'cursor-1', observedCapabilities: [observed] });
    },
    reconcile: async (_findings, options) => {
      reconciledComplete = options.complete;
      return { created: 1, updated: 0, retired: 0 };
    },
    now: () => NOW,
  });

  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.propertiesAudited, 1);
  assert.equal(result.envelopePagesRead, 2);
  assert.equal(result.observedCapabilities, 1);
  assert.equal(reconciledComplete, true);
  assert.deepEqual(propertyCalls, [{ afterId: null, take: 1 }, { afterId: 'property-1', take: 1 }]);
  assert.deepEqual(queryCalls.map(({ propertyId, userId, cursor }) => ({ propertyId, userId, cursor })), [
    { propertyId: 'property-1', userId: 'owner-1', cursor: null },
    { propertyId: 'property-1', userId: 'owner-1', cursor: 'cursor-1' },
  ]);
});

test('unresolved owners and adapter failures make a run partial and prohibit retirement', async () => {
  let reconciledComplete = null;
  const result = await executeEnvelopeCoverageAudit({ propertyPageSize: 2 }, {
    listProperties: async ({ afterId }) => afterId === null ? [
      { id: 'property-1', homeownerProfile: { userId: 'owner-1' } },
      { id: 'property-2', homeownerProfile: null },
    ] : [],
    queryProperty: async () => page({
      diagnostics: [
        { producerModel: 'Signal', code: 'TIME_BUDGET_EXHAUSTED', count: 1 },
        { producerModel: 'PropertyRadarMatch', code: 'UNMAPPED_NATIVE_VALUE', count: 1, nativeValue: 'alien_landing' },
      ],
    }),
    reconcile: async (_findings, options) => {
      reconciledComplete = options.complete;
      return { created: 0, updated: 1, retired: 0 };
    },
    now: () => NOW,
  });

  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.ownerUnresolved, 1);
  assert.equal(result.adapterFailures, 1);
  assert.equal(result.propertyFailures, 1);
  assert.equal(reconciledComplete, false);
  assert.ok(result.diagnostics.includes('OWNER_UNRESOLVED:property-2'));
  assert.deepEqual(result.certificationIssues, [
    'PropertyRadarMatch:alien_landing: observed native value is not mapped',
  ]);
});

test('a repeated Envelope cursor fails closed instead of looping or retiring findings', async () => {
  let reconciledComplete = null;
  const result = await executeEnvelopeCoverageAudit({}, {
    listProperties: async ({ afterId }) => afterId === null
      ? [{ id: 'property-1', homeownerProfile: { userId: 'owner-1' } }]
      : [],
    queryProperty: async () => page({ nextCursor: 'repeated-cursor' }),
    reconcile: async (_findings, options) => {
      reconciledComplete = options.complete;
      return { created: 0, updated: 0, retired: 0 };
    },
    now: () => NOW,
  });

  assert.equal(result.status, 'PARTIAL');
  assert.equal(reconciledComplete, false);
  assert.ok(result.diagnostics.includes('ENVELOPE_CURSOR_REPEATED:property-1'));
});

test('a property-page failure produces a partial run and cannot retire findings', async () => {
  let reconciledComplete = null;
  const result = await executeEnvelopeCoverageAudit({}, {
    listProperties: async () => { throw new Error('database unavailable'); },
    reconcile: async (_findings, options) => {
      reconciledComplete = options.complete;
      return { created: 0, updated: 0, retired: 0 };
    },
    now: () => NOW,
  });

  assert.equal(result.status, 'PARTIAL');
  assert.equal(reconciledComplete, false);
  assert.deepEqual(result.diagnostics, ['PROPERTY_PAGE_FAILED:database unavailable']);
});
