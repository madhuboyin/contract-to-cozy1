const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { normalizeAskRecordExportRequest, InvalidExportSelectionError } = require('../../src/services/ask/askRecordExportSelection.ts');
const { ASK_RECORD_SECTION_REGISTRY } = require('../../src/services/ask/governance/askRecordSectionRegistry.ts');
const { REPORT_PACK_SECTION_IDS } = require('../../src/services/planningContext/reportPackSections.ts');

const normalize = (sections, extra = {}) => normalizeAskRecordExportRequest({ sections, type: 'HOME_REPORT_PACK', role: 'CONTRIBUTOR', ...extra });
const rejects = (sections, pattern, extra) => assert.throws(() => normalize(sections, extra), (error) => error instanceof InvalidExportSelectionError && error.code === 'EXPORT_SELECTION_INVALID' && pattern.test(error.message), JSON.stringify(sections));

test('with no choice the export type decides and the whole pack is the default', () => {
  assert.deepEqual(normalize(undefined).included, [...REPORT_PACK_SECTION_IDS]);
  assert.deepEqual(normalize(null, { type: 'INVENTORY' }), { version: 1, requested: ['rooms', 'inventory'], included: ['rooms', 'inventory'], unavailable: [] });
  assert.deepEqual(normalize(undefined, { type: 'COVERAGE_SNAPSHOT' }).included, ['coverage', 'warranties']);
});

test('a choice is validated against the registry and stored normalized, in pack order, without duplicates', () => {
  assert.deepEqual(normalize(['coverage', 'inventory', 'coverage']), { version: 1, requested: ['coverage', 'inventory'], included: ['inventory', 'coverage'], unavailable: [] });
  assert.deepEqual(normalize({ include: ['rooms'] }).included, ['rooms']);
  assert.deepEqual(normalize([' inventory ']).requested, ['inventory']);
});

test('a registered section the pack cannot carry is disclosed as unavailable, not silently dropped, and the rest is exported', () => {
  const selection = normalize(['inventory', 'timeline', 'household-access', 'permits', 'buyer-records']);
  assert.deepEqual(selection.included, ['inventory']);
  assert.deepEqual(selection.requested, ['inventory', 'timeline', 'household-access', 'permits', 'buyer-records']);
  assert.deepEqual(selection.unavailable, ['timeline', 'household-access', 'permits', 'buyer-records'].map((id) => ({ id, reason: 'NOT_IN_PACK' })));
});

test('an id the registry does not know, a malformed choice, and a choice that leaves nothing are rejected', () => {
  rejects(['inventory', 'made-up'], /Unknown section: made-up/);
  rejects(['__proto__', 'constructor'], /Unknown section/);
  rejects('inventory', /list of section ids/);
  rejects({ include: 'inventory' }, /list of section ids/);
  rejects({ sections: ['inventory'] }, /list of section ids/);
  rejects([42], /short, non-empty string/);
  rejects(['  '], /short, non-empty string/);
  rejects(['x'.repeat(41)], /short, non-empty string/);
  rejects(Array.from({ length: 25 }, (_, index) => `s${index}`), /At most 24/);
  rejects([], /None of the requested sections/);
  assert.throws(() => normalize(['timeline', 'permits']), (error) => error instanceof InvalidExportSelectionError && /None of the requested/.test(error.message) && error.unavailable.length === 2);
});

test('a section above the caller’s role is unavailable as RESTRICTED, derived from the registry floor and never invented', () => {
  const owner = ASK_RECORD_SECTION_REGISTRY.map((entry) => entry.id.length).length > 0;
  assert.ok(owner);
  const registry = ASK_RECORD_SECTION_REGISTRY.map((entry) => (entry.id === 'coverage' ? { ...entry, readOperationIds: ['INVENTORY_LOOKUP', 'APPLIANCE_FAILURE_RISK'], lifecycleOperationId: 'INVENTORY_LOOKUP' } : entry));
  const asContributor = normalizeAskRecordExportRequest({ sections: ['inventory', 'coverage'], type: 'HOME_REPORT_PACK', role: 'CONTRIBUTOR', registry });
  assert.deepEqual([asContributor.included, asContributor.unavailable], [['inventory'], [{ id: 'coverage', reason: 'RESTRICTED' }]]);
  const asOwner = normalizeAskRecordExportRequest({ sections: ['inventory', 'coverage'], type: 'HOME_REPORT_PACK', role: 'OWNER', registry });
  assert.deepEqual([asOwner.included, asOwner.unavailable], [['inventory', 'coverage'], []]);
});
