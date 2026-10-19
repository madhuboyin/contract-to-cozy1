const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  ASK_RECORD_SECTION_REGISTRY,
  evaluateRecordSectionApplicability,
  recordSectionRoleFloor,
  validateAskRecordSectionRegistry,
} = require('../../src/services/ask/governance/askRecordSectionRegistry.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { composeAskRecordIndex } = require('../../src/services/ask/askRecordIndex.service.ts');

const RANK = { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 };
const byId = (id) => ASK_RECORD_SECTION_REGISTRY.find((entry) => entry.id === id);
const property = { name: 'Test home', address: '1 Main St', city: 'Austin', state: 'TX' };

// FR-REC-002: every listed homeowner record section is declared; buyer and seller records are separate lifecycle sections.
const REQUIRED_SECTIONS = [
  'property-facts', 'rooms', 'inventory', 'documents', 'warranties', 'timeline', 'maintenance-history', 'inspections', 'permits',
  'projects-renovations', 'incidents-claims', 'coverage', 'financing-ownership', 'buyer-records', 'seller-records', 'household-access',
];

function overviewFixture() {
  return {
    generatedAt: '2026-10-19T12:00:00.000Z',
    context: { status: 'AVAILABLE', knownFactCount: 1, completeness: { completenessPercent: 40, scopes: [{ missingFactKeys: ['a', 'b'], conflictedFactKeys: ['c'], staleFactKeys: [] }] } },
    sections: {
      rooms: { status: 'AVAILABLE', data: { count: 2, items: [{ updatedAt: new Date('2026-10-01T00:00:00Z') }, { updatedAt: new Date('2026-10-05T00:00:00Z') }] } },
      inventory: { status: 'AVAILABLE', data: { totalCount: 1, items: [{ updatedAt: new Date('2026-09-01T00:00:00Z') }] } },
      documents: { status: 'AVAILABLE', data: { totalCount: 3, latest: { addedAt: new Date('2026-10-10T00:00:00Z') } } },
      warranties: { status: 'AVAILABLE', data: { totalCount: 0 } },
      household: { status: 'AVAILABLE', data: { totalCount: 2 } },
    },
    tools: { homeTimeline: { status: 'AVAILABLE', data: { confirmedCount: 4, recent: [{ updatedAt: new Date('2026-10-12T00:00:00Z') }] } } },
  };
}

test('record section registry is structurally valid and declares every FR-REC-002 section', () => {
  assert.deepEqual(validateAskRecordSectionRegistry(), []);
  assert.deepEqual(ASK_RECORD_SECTION_REGISTRY.map((entry) => entry.id).sort(), [...REQUIRED_SECTIONS].sort());
});

test('registry validation rejects duplicates, unregistered operations, a foreign lifecycle operation, and an unexplained export exclusion', () => {
  const base = byId('rooms');
  const issues = validateAskRecordSectionRegistry([
    base,
    { ...base },
    { ...byId('inventory'), id: 'documents', readOperationIds: ['NOT_AN_OPERATION'], lifecycleOperationId: 'WARRANTY_LOOKUP', owner: ' ', exportEligibility: { state: 'NOT_IN_PACK', reason: ' ' } },
    { ...byId('warranties'), id: 'timeline', commandOperationIds: ['INVENTORY_LOOKUP'] },
  ]);
  const text = issues.join('\n');
  assert.match(text, /Duplicate record section id: rooms/);
  assert.match(text, /unregistered operation NOT_AN_OPERATION/);
  assert.match(text, /lifecycle operation WARRANTY_LOOKUP is not one of its reads/);
  assert.match(text, /documents has no owner/);
  assert.match(text, /is not in the pack but gives no reason/);
  assert.match(text, /lists non-command operation INVENTORY_LOOKUP/);
});

test('every section role floor is the strictest floor of its registered read operations, never an independent classification', () => {
  for (const entry of ASK_RECORD_SECTION_REGISTRY) {
    const floors = entry.readOperationIds.map((id) => ASK_OPERATION_DEFINITIONS[id].propertyRoleFloor).filter(Boolean);
    const expected = floors.reduce((strictest, floor) => (strictest === null || RANK[floor] > RANK[strictest] ? floor : strictest), null);
    assert.equal(recordSectionRoleFloor(entry), expected, entry.id);
    for (const id of entry.commandOperationIds) assert.equal(ASK_OPERATION_DEFINITIONS[id].family, 'COMMAND', `${entry.id}:${id}`);
  }
  // Coverage, financing and documents reads keep the existing VIEWER boundary; the routes admit members only (financing.routes, coverageAnalysis.routes).
  for (const id of ['coverage', 'financing-ownership', 'documents']) assert.equal(recordSectionRoleFloor(byId(id)), 'VIEWER', id);
});

test('a section that mixes read floors takes the strictest one and restricts lower roles', () => {
  const mixed = { ...byId('inventory'), readOperationIds: ['INVENTORY_LOOKUP', 'APPLIANCE_FAILURE_RISK'], lifecycleOperationId: 'INVENTORY_LOOKUP' };
  assert.equal(recordSectionRoleFloor(mixed), 'OWNER');
  assert.equal(evaluateRecordSectionApplicability(mixed, { householdRole: 'VIEWER', operatingMode: 'OWNING' }), 'RESTRICTED');
  assert.equal(evaluateRecordSectionApplicability(mixed, { householdRole: 'CONTRIBUTOR', operatingMode: 'OWNING' }), 'RESTRICTED');
  assert.equal(evaluateRecordSectionApplicability(mixed, { householdRole: 'OWNER', operatingMode: 'OWNING' }), 'APPLICABLE');
});

test('lifecycle applicability follows each read operation audience policy', () => {
  const at = (id, operatingMode) => evaluateRecordSectionApplicability(byId(id), { householdRole: 'OWNER', operatingMode });
  assert.equal(at('buyer-records', 'BUYING'), 'APPLICABLE');
  for (const mode of ['OWNING', 'SELLING']) assert.equal(at('buyer-records', mode), 'NOT_APPLICABLE', mode);
  assert.equal(at('seller-records', 'BUYING'), 'NOT_APPLICABLE');
  for (const mode of ['OWNING', 'SELLING']) assert.equal(at('seller-records', mode), 'APPLICABLE', mode);
  // KNOWN_MODES reads need a lifecycle stage; an unknown stage asks for context instead of hiding or answering.
  assert.equal(at('inspections', 'UNKNOWN'), 'CONTEXT_REQUIRED');
  assert.equal(at('inspections', 'OWNING'), 'APPLICABLE');
  for (const mode of ['BUYING', 'OWNING', 'SELLING', 'UNKNOWN']) assert.equal(at('rooms', mode), 'APPLICABLE', mode);
});

test('the index lists every registered section in every lifecycle and role', () => {
  for (const operatingMode of ['BUYING', 'OWNING', 'SELLING', 'UNKNOWN']) {
    for (const accessRole of ['VIEWER', 'CONTRIBUTOR', 'OWNER']) {
      const index = composeAskRecordIndex({ propertyId: 'p1', accessRole, operatingMode, overview: overviewFixture(), property });
      assert.deepEqual(index.sections.map((entry) => entry.id), ASK_RECORD_SECTION_REGISTRY.map((entry) => entry.id), `${operatingMode}/${accessRole}`);
      for (const entry of index.sections) {
        if (entry.state === 'AVAILABLE') assert.ok(entry.primaryAction && entry.count !== null, entry.id);
        else assert.equal(entry.count, null, entry.id);
        assert.ok(entry.reasonCode === null || entry.state !== 'AVAILABLE', entry.id);
      }
    }
  }
});

test('the index reports canonical counts, freshness, completeness, and the lifecycle states', () => {
  const index = composeAskRecordIndex({ propertyId: 'p1', accessRole: 'OWNER', operatingMode: 'OWNING', overview: overviewFixture(), property });
  const get = (id) => index.sections.find((entry) => entry.id === id);
  assert.deepEqual([get('rooms').count, get('inventory').count, get('documents').count, get('warranties').count, get('property-facts').count], [2, 1, 3, 0, 1]);
  assert.equal(get('rooms').freshAsOf, '2026-10-05T00:00:00.000Z');
  assert.equal(get('documents').freshAsOf, '2026-10-10T00:00:00.000Z');
  assert.equal(get('warranties').freshAsOf, null);
  assert.deepEqual(index.completeness, { state: 'AVAILABLE', percent: 40, pendingDetails: 3 });
  assert.equal(get('buyer-records').state, 'NOT_APPLICABLE');
  assert.equal(get('buyer-records').primaryAction, null);
  assert.equal(get('seller-records').state, 'UNAVAILABLE');
  assert.equal(get('seller-records').reasonCode, 'READER_NOT_CONNECTED');
  assert.equal(get('seller-records').primaryAction.question.length > 0, true);
  // Sections counted through their own paged reader: absent totals are "not connected", never a silent zero.
  assert.equal(get('timeline').reasonCode, 'READER_NOT_CONNECTED');
  const counted = composeAskRecordIndex({
    propertyId: 'p1', accessRole: 'OWNER', operatingMode: 'OWNING', overview: overviewFixture(), property,
    collectionTotals: { 'household-access': { total: 2, freshAsOf: null }, timeline: { total: 1, freshAsOf: '2026-10-12T00:00:00.000Z' }, 'maintenance-history': { total: 7, freshAsOf: null }, inspections: 'FAILED' },
  });
  const at = (id) => counted.sections.find((entry) => entry.id === id);
  assert.deepEqual([at('timeline').count, at('timeline').countLabel, at('timeline').freshAsOf, at('timeline').pagedCollection], [1, 'event', '2026-10-12T00:00:00.000Z', true]);
  assert.deepEqual([at('maintenance-history').count, at('maintenance-history').countLabel], [7, 'completed tasks']);
  assert.deepEqual([at('inspections').state, at('inspections').reasonCode], ['UNAVAILABLE', 'PROVIDER_FAILED']);
  assert.deepEqual([at('household-access').count, at('household-access').countLabel], [2, 'members']);
  assert.equal(counted.partial, true);
  assert.equal(index.partial, false);
});

test('unconnected readers report UNAVAILABLE rather than disappearing or claiming zero', () => {
  const index = composeAskRecordIndex({ propertyId: 'p1', accessRole: 'OWNER', operatingMode: 'OWNING', overview: overviewFixture(), property });
  for (const entry of index.sections.filter((section) => byId(section.id).collectionReader === null && section.state !== 'NOT_APPLICABLE')) {
    assert.equal(entry.state, 'UNAVAILABLE', entry.id);
    assert.equal(entry.reasonCode, 'READER_NOT_CONNECTED', entry.id);
    assert.equal(entry.count, null, entry.id);
  }
  const unknown = composeAskRecordIndex({ propertyId: 'p1', accessRole: 'OWNER', operatingMode: 'UNKNOWN', overview: overviewFixture(), property });
  assert.equal(unknown.sections.find((entry) => entry.id === 'inspections').reasonCode, 'LIFECYCLE_CONTEXT_REQUIRED');
});

test('a failed overview provider keeps every section, marks the index partial, and fails each section independently', () => {
  const failed = composeAskRecordIndex({ propertyId: 'p1', accessRole: 'OWNER', operatingMode: 'OWNING', overview: null, property: null });
  assert.equal(failed.sections.length, ASK_RECORD_SECTION_REGISTRY.length);
  assert.equal(failed.partial, true);
  assert.equal(failed.completeness.state, 'UNAVAILABLE');
  assert.equal(failed.sections.find((entry) => entry.id === 'rooms').reasonCode, 'PROVIDER_FAILED');

  const one = overviewFixture();
  one.sections.rooms = { status: 'UNAVAILABLE', data: null };
  const partial = composeAskRecordIndex({ propertyId: 'p1', accessRole: 'OWNER', operatingMode: 'OWNING', overview: one, property });
  assert.equal(partial.partial, true);
  assert.equal(partial.sections.find((entry) => entry.id === 'rooms').state, 'UNAVAILABLE');
  assert.equal(partial.sections.find((entry) => entry.id === 'inventory').state, 'AVAILABLE');
});

test('a section below its role floor is listed as RESTRICTED with no count or action', () => {
  const restrictedRegistry = [{ ...byId('inventory'), readOperationIds: ['INVENTORY_LOOKUP', 'APPLIANCE_FAILURE_RISK'] }];
  const index = composeAskRecordIndex({ propertyId: 'p1', accessRole: 'VIEWER', operatingMode: 'OWNING', overview: overviewFixture(), property, registry: restrictedRegistry });
  assert.deepEqual(index.sections.map((entry) => [entry.id, entry.state, entry.reasonCode, entry.count, entry.primaryAction]), [['inventory', 'RESTRICTED', 'ROLE_FLOOR', null, null]]);
});
