const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  scopeTrustedContactSections,
} = require('../../src/services/homeDigitalWill.service.ts');

function buildSection(type, isEmergencyEntry) {
  return {
    id: `${type}-section`,
    digitalWillId: 'will-1',
    type,
    title: `${type} title`,
    description: null,
    sortOrder: 0,
    isEnabled: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    entries: [
      {
        id: `${type}-entry`,
        sectionId: `${type}-section`,
        entryType: 'INSTRUCTION',
        title: `${type} entry`,
        content: null,
        summary: null,
        priority: 'HIGH',
        sortOrder: 0,
        isPinned: false,
        isEmergency: isEmergencyEntry,
        effectiveFrom: null,
        effectiveTo: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  };
}

test('EMERGENCY_ONLY contact receives emergency section only with emergency entries', () => {
  const sections = [
    buildSection('EMERGENCY', true),
    buildSection('INSURANCE', false),
  ];
  const scoped = scopeTrustedContactSections(sections, 'EMERGENCY_ONLY');
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].type, 'EMERGENCY');
  assert.equal(scoped[0].entries.length, 1);
  assert.equal(scoped[0].entries[0].isEmergency, true);
});

test('EMERGENCY_ONLY contact cannot request non-emergency section explicitly', () => {
  const sections = [buildSection('EMERGENCY', true), buildSection('INSURANCE', false)];
  assert.throws(
    () => scopeTrustedContactSections(sections, 'EMERGENCY_ONLY', 'INSURANCE'),
    /restricted to emergency section/,
  );
});

test('VIEW contact can request a specific section type', () => {
  const sections = [buildSection('EMERGENCY', true), buildSection('INSURANCE', false)];
  const scoped = scopeTrustedContactSections(sections, 'VIEW', 'INSURANCE');
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].type, 'INSURANCE');
});
