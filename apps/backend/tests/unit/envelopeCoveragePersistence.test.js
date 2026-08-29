const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  reconcileEnvelopeCoverageFindings,
} = require('../../src/services/intelligence/envelopeCoverageFinding.repository.ts');

const AUDITED_AT = new Date('2026-08-28T12:00:00.000Z');

function finding(overrides = {}) {
  return {
    producerModel: 'Signal',
    domain: 'SAFETY',
    determination: 'REVIEW_REQUIRED',
    evidenceBasis: 'DECLARED_AND_OBSERVED',
    auditInputsDigest: 'a'.repeat(64),
    matchedRuleIds: [],
    firstObservedAt: '2026-08-20T12:00:00.000Z',
    lastObservedAt: '2026-08-25T12:00:00.000Z',
    lastAuditedAt: AUDITED_AT.toISOString(),
    ...overrides,
  };
}

function persistenceDb(initialRows = []) {
  const rows = new Map(initialRows.map((row) => [`${row.producerModel}:${row.domain}`, { ...row }]));
  const delegate = {
    findMany: async () => [...rows.values()],
    upsert: async ({ where, create, update }) => {
      const key = `${where.producerModel_domain.producerModel}:${where.producerModel_domain.domain}`;
      const existing = rows.get(key);
      const next = existing
        ? { ...existing, ...update }
        : { id: `finding-${rows.size + 1}`, ...create };
      rows.set(key, next);
      return next;
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const [key, row] of rows) {
        if (where.id.in.includes(row.id) && row.active === where.active) {
          rows.set(key, { ...row, ...data });
          count += 1;
        }
      }
      return { count };
    },
  };
  return {
    rows,
    db: { $transaction: async (callback) => callback({ coverageAuditFinding: delegate }) },
  };
}

test('Prisma persistence uses the coarse natural key and established String[] rule-id convention', () => {
  const schema = fs.readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const start = schema.indexOf('model CoverageAuditFinding {');
  const end = schema.indexOf('\n}', start);
  const model = schema.slice(start, end + 2);

  assert.ok(start >= 0);
  assert.match(model, /matchedRuleIds\s+String\[\]\s+@default\(\[\]\)/);
  assert.match(model, /@@unique\(\[producerModel, domain\]\)/);
  assert.doesNotMatch(model, /\bpropertyId\b|\buserId\b|\benvelopeKey\b|\bitemId\b/);
});

test('reconciliation preserves the full observation range and revives current keys', async () => {
  const store = persistenceDb([{
    id: 'existing-signal',
    producerModel: 'Signal',
    domain: 'SAFETY',
    firstObservedAt: new Date('2026-08-10T12:00:00.000Z'),
    lastObservedAt: new Date('2026-08-22T12:00:00.000Z'),
    active: false,
    retiredAt: new Date('2026-08-23T12:00:00.000Z'),
  }]);

  const result = await reconcileEnvelopeCoverageFindings([finding()], {
    complete: true,
    auditedAt: AUDITED_AT,
  }, store.db);
  const row = store.rows.get('Signal:SAFETY');

  assert.deepEqual(result, { created: 0, updated: 1, retired: 0 });
  assert.equal(row.active, true);
  assert.equal(row.retiredAt, null);
  assert.equal(row.firstObservedAt.toISOString(), '2026-08-10T12:00:00.000Z');
  assert.equal(row.lastObservedAt.toISOString(), '2026-08-25T12:00:00.000Z');
});

test('only complete runs retire natural keys absent from the current universe', async () => {
  const obsolete = {
    id: 'obsolete',
    producerModel: 'Signal',
    domain: 'WEATHER',
    firstObservedAt: null,
    lastObservedAt: null,
    active: true,
    retiredAt: null,
  };
  const partialStore = persistenceDb([obsolete]);
  const partial = await reconcileEnvelopeCoverageFindings([finding()], {
    complete: false,
    auditedAt: AUDITED_AT,
  }, partialStore.db);
  assert.equal(partial.retired, 0);
  assert.equal(partialStore.rows.get('Signal:WEATHER').active, true);

  const completeStore = persistenceDb([obsolete]);
  const complete = await reconcileEnvelopeCoverageFindings([finding()], {
    complete: true,
    auditedAt: AUDITED_AT,
  }, completeStore.db);
  assert.equal(complete.retired, 1);
  assert.equal(completeStore.rows.get('Signal:WEATHER').active, false);
  assert.equal(completeStore.rows.get('Signal:WEATHER').retiredAt.toISOString(), AUDITED_AT.toISOString());
});

test('new coarse findings are stored without any item or user dimension', async () => {
  const store = persistenceDb();
  const result = await reconcileEnvelopeCoverageFindings([finding({
    producerModel: 'PropertyRadarCompoundInsight',
    domain: 'WEATHER',
    determination: 'COVERED',
    evidenceBasis: 'DECLARED_ONLY',
    matchedRuleIds: ['RADAR_COMPOUND_INSIGHT_PROMOTION'],
    firstObservedAt: null,
    lastObservedAt: null,
  })], { complete: true, auditedAt: AUDITED_AT }, store.db);
  const row = store.rows.get('PropertyRadarCompoundInsight:WEATHER');

  assert.deepEqual(result, { created: 1, updated: 0, retired: 0 });
  assert.equal('propertyId' in row, false);
  assert.equal('userId' in row, false);
  assert.equal('envelopeKey' in row, false);
  assert.deepEqual(row.matchedRuleIds, ['RADAR_COMPOUND_INSIGHT_PROMOTION']);
});
