const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  runCapabilityCatalogOnlyDrill,
} = require('../../src/services/capabilityCatalogOnlyDrill.ts');

test('CAP-908 preserves the catalog while suppressing every promotion surface', () => {
  const report = runCapabilityCatalogOnlyDrill(
    new Date('2026-07-25T12:00:00.000Z'),
  );

  assert.equal(report.contractVersion, 'capability-catalog-only-drill-v1');
  assert.equal(report.passed, true);
  assert.equal(report.rollback.promotionsEnabled, false);
  assert.equal(report.rollback.catalogPreserved, true);
  assert.deepEqual(
    report.rollback.surfaces.map(({ surface }) => surface),
    ['HOME', 'PROPERTY', 'WORKFLOW', 'RELATED', 'COMPLETION'],
  );
  assert.equal(
    report.rollback.surfaces.every(({ suppressed }) => suppressed),
    true,
  );
  assert.equal(report.restoration.catalogRestored, true);
});
