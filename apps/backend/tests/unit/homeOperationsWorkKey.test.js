const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Slice 1: resolveWorkKey must be stable-by-construction — built only from
// structured fields (property/subject/obligation/occurrence), never from
// title/copy — so that source copy changes never create duplicate work and
// the same logical obligation always resolves to the same key.

const { resolveWorkKey } = require('../../src/modules/homeOperations/domain/workKey.ts');

test('matches the parent plan\'s literal examples exactly', () => {
  assert.equal(
    resolveWorkKey({
      propertyId: 'prop-1',
      subject: { type: 'INVENTORY_ITEM', id: 'hvac-1' },
      obligationType: 'MAINTENANCE_TASK',
      occurrence: { obligationSlug: 'filter-replacement', occurrenceKey: '2026-08' },
    }),
    'property:prop-1:inventory:hvac-1:filter-replacement:2026-08',
  );

  assert.equal(
    resolveWorkKey({
      propertyId: 'prop-1',
      subject: { type: 'FINDING', id: 'finding-1' },
      obligationType: 'FINDING_RESOLUTION',
      occurrence: { obligationSlug: 'resolve' },
    }),
    'property:prop-1:finding:finding-1:resolve',
  );

  assert.equal(
    resolveWorkKey({
      propertyId: 'prop-1',
      subject: { type: 'INVENTORY_ITEM', id: 'roof-1' },
      obligationType: 'DECISION',
      occurrence: { obligationSlug: 'replacement-decision' },
    }),
    'property:prop-1:inventory:roof-1:replacement-decision',
  );

  assert.equal(
    resolveWorkKey({
      propertyId: 'prop-1',
      subject: { type: 'PROJECT', id: 'project-1' },
      obligationType: 'PROJECT_EXECUTION',
      occurrence: { obligationSlug: 'execution' },
    }),
    'property:prop-1:project:project-1:execution',
  );
});

test('identical structured input produces an identical key', () => {
  const input = {
    propertyId: 'prop-1',
    subject: { type: 'INVENTORY_ITEM', id: 'hvac-1' },
    obligationType: 'MAINTENANCE_TASK',
    occurrence: { obligationSlug: 'filter-replacement', occurrenceKey: '2026-08' },
  };
  assert.equal(resolveWorkKey(input), resolveWorkKey(structuredClone(input)));
});

test('different property, subject, obligation, or occurrence produce different keys', () => {
  const base = {
    propertyId: 'prop-1',
    subject: { type: 'INVENTORY_ITEM', id: 'hvac-1' },
    obligationType: 'MAINTENANCE_TASK',
    occurrence: { obligationSlug: 'filter-replacement' },
  };
  const baseline = resolveWorkKey(base);

  assert.notEqual(resolveWorkKey({ ...base, propertyId: 'prop-2' }), baseline);
  assert.notEqual(resolveWorkKey({ ...base, subject: { type: 'INVENTORY_ITEM', id: 'hvac-2' } }), baseline);
  assert.notEqual(resolveWorkKey({ ...base, subject: { type: 'FINDING', id: 'hvac-1' } }), baseline);
  assert.notEqual(resolveWorkKey({ ...base, occurrence: { obligationSlug: 'coil-cleaning' } }), baseline);
  assert.notEqual(
    resolveWorkKey({ ...base, occurrence: { obligationSlug: 'filter-replacement', occurrenceKey: '2026-09' } }),
    baseline,
  );
});

test('PROPERTY subject omits a redundant subject segment', () => {
  assert.equal(
    resolveWorkKey({
      propertyId: 'prop-1',
      subject: { type: 'PROPERTY', id: 'prop-1' },
      obligationType: 'DECISION',
      occurrence: { obligationSlug: 'guidance-resolution' },
    }),
    'property:prop-1:guidance-resolution',
  );
});

test('throws rather than silently collapsing an empty slug segment', () => {
  assert.throws(() => resolveWorkKey({
    propertyId: 'prop-1',
    subject: { type: 'INVENTORY_ITEM', id: 'hvac-1' },
    obligationType: 'MAINTENANCE_TASK',
    occurrence: { obligationSlug: '   ' },
  }));
  assert.throws(() => resolveWorkKey({
    propertyId: 'prop-1',
    subject: { type: 'INVENTORY_ITEM', id: '***' },
    obligationType: 'MAINTENANCE_TASK',
    occurrence: { obligationSlug: 'filter-replacement' },
  }));
});
