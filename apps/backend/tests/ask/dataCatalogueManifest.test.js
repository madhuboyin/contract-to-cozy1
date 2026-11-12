// Reliability FRD FR-DATA-1 / FR-DATA-9: every property-scoped entity in the data model has a recorded disposition, so a new table cannot silently
// escape the Ask data-point catalogue. Regenerate with `node scripts/ask-data-catalogue.js --write` and review the diff.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { deriveCatalogue, DOMAINS } = require('../../scripts/lib/askDataCatalogue');

const MANIFEST = path.resolve(__dirname, '../../src/services/ask/dataCatalogue/entityDispositions.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).entities;
const { entities } = deriveCatalogue();
const KNOWN_DOMAINS = new Set([...DOMAINS.map(([name]) => name), 'everything-else']);

test('every property-scoped entity has a disposition in the committed manifest (a new table fails until it is dispositioned)', () => {
  const missing = entities.map((e) => e.entity).filter((name) => !manifest[name]);
  assert.deepEqual(missing, [], `entities without a disposition: ${missing.slice(0, 12).join(', ')} — run: node scripts/ask-data-catalogue.js --write`);
});

test('the manifest has no entity the data model no longer has or no longer scopes to a property', () => {
  const live = new Set(entities.map((e) => e.entity));
  const stale = Object.keys(manifest).filter((name) => !live.has(name));
  assert.deepEqual(stale, [], `stale manifest entries: ${stale.join(', ')}`);
});

test('every disposition is CANDIDATE or EXCLUDED_DEFAULT with a reason, and every domain is a known domain', () => {
  for (const [name, row] of Object.entries(manifest)) {
    assert.ok(['CANDIDATE', 'EXCLUDED_DEFAULT'].includes(row.disposition), `${name}: ${row.disposition}`);
    if (row.disposition === 'EXCLUDED_DEFAULT') assert.ok(row.reason, `${name} is excluded without a reason`);
    assert.ok(KNOWN_DOMAINS.has(row.domain), `${name}: unknown domain ${row.domain}`);
  }
});

test('operational and security entities are excluded by default, and analytics is not excluded as a category (D11)', () => {
  assert.equal(manifest.AskExecution?.disposition ?? 'EXCLUDED_DEFAULT', 'EXCLUDED_DEFAULT');
  assert.equal(manifest.AgentRun.disposition, 'EXCLUDED_DEFAULT');
  assert.equal(manifest.ProductAnalyticsEvent.disposition, 'CANDIDATE', 'homeowner-visible analytics must remain a candidate');
  assert.equal(manifest.Property.disposition, 'CANDIDATE');
});

test('the manifest marks every row a PROPOSAL until the owner signs it off, and proposes nothing as visible (fail closed)', () => {
  for (const [name, row] of Object.entries(manifest)) assert.equal(row.proposal, true, `${name} claims to be approved`);
});
