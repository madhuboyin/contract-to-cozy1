import type { OutdoorSpaceType, PropertyResponsibilityInput, ResponsibleParty } from '@/types';
import fs from 'node:fs';
import path from 'node:path';
import {
  defaultResponsibilityParties,
  getResponsibilityPreset,
  mapResponsibilitiesToForm,
  mapResponsibilitiesToPayload,
  normalizeOutdoorSpaceTypes,
} from '../propertyContextForm';

type Archetype = {
  key: string;
  responsibilities: PropertyResponsibilityInput[];
  outdoor: OutdoorSpaceType[];
};

const responsibility = (
  scope: PropertyResponsibilityInput['scope'],
  party: ResponsibleParty,
): PropertyResponsibilityInput => ({ scope, party });

const ARCHETYPES: Archetype[] = [
  { key: 'detached-owner-aging', responsibilities: [responsibility('ROOF', 'OWNER'), responsibility('HVAC', 'OWNER')], outdoor: ['PRIVATE_YARD'] },
  { key: 'condo-association-exterior', responsibilities: [responsibility('BUILDING_EXTERIOR', 'ASSOCIATION'), responsibility('HVAC', 'OWNER')], outdoor: [] },
  { key: 'condo-balcony-unit-hvac', responsibilities: [responsibility('DECK_PATIO_BALCONY', 'OWNER'), responsibility('HVAC', 'OWNER'), responsibility('ROOF', 'ASSOCIATION')], outdoor: ['BALCONY'] },
  { key: 'townhouse-owner-yard', responsibilities: [responsibility('ROOF', 'OWNER'), responsibility('LANDSCAPING', 'OWNER')], outdoor: ['PRIVATE_YARD'] },
  { key: 'townhouse-association-managed', responsibilities: [responsibility('ROOF', 'ASSOCIATION'), responsibility('LANDSCAPING', 'ASSOCIATION'), responsibility('HVAC', 'OWNER')], outdoor: ['SHARED_YARD'] },
  { key: 'landlord-managed-rental', responsibilities: [responsibility('ROOF', 'LANDLORD'), responsibility('HVAC', 'LANDLORD')], outdoor: [] },
  { key: 'vacant-renovation', responsibilities: [responsibility('ROOF', 'OWNER'), responsibility('HVAC', 'OWNER')], outdoor: [] },
  { key: 'newer-no-overdue', responsibilities: [responsibility('ROOF', 'OWNER'), responsibility('HVAC', 'OWNER')], outdoor: ['PRIVATE_YARD', 'PATIO'] },
  { key: 'older-findings-warranty', responsibilities: [responsibility('ROOF', 'OWNER'), responsibility('HVAC', 'OWNER')], outdoor: ['DECK'] },
  { key: 'storm-drainage-exposed', responsibilities: [responsibility('LANDSCAPING', 'OWNER'), responsibility('BUILDING_EXTERIOR', 'OWNER')], outdoor: ['PRIVATE_YARD', 'GARDEN_BED'] },
];

describe('Property Context create/edit form round trips', () => {
  test.each(ARCHETYPES)('$key preserves canonical responsibility and outdoor-space facts', (archetype) => {
    const formResponsibilities = mapResponsibilitiesToForm(archetype.responsibilities);
    const payloadResponsibilities = mapResponsibilitiesToPayload(formResponsibilities);

    for (const expected of archetype.responsibilities) {
      expect(payloadResponsibilities).toContainEqual(expected);
    }
    expect(normalizeOutdoorSpaceTypes(archetype.outdoor.length > 0, archetype.outdoor)).toEqual(archetype.outdoor);
  });

  test('mixed condo responsibilities are not flattened during edit', () => {
    const form = mapResponsibilitiesToForm([
      responsibility('ROOF', 'ASSOCIATION'),
      responsibility('BUILDING_EXTERIOR', 'ASSOCIATION'),
      responsibility('HVAC', 'OWNER'),
      responsibility('PLUMBING', 'OWNER'),
    ]);

    expect(form.ROOF).toBe('ASSOCIATION');
    expect(form.HVAC).toBe('OWNER');
    expect(mapResponsibilitiesToPayload(form)).toEqual(expect.arrayContaining([
      responsibility('ROOF', 'ASSOCIATION'),
      responsibility('HVAC', 'OWNER'),
    ]));
  });

  test('disabling private outdoor space clears persisted types', () => {
    expect(normalizeOutdoorSpaceTypes(false, ['BALCONY', 'PATIO'])).toEqual([]);
  });

  test('recognizes a single maintenance preset without flattening custom responsibilities', () => {
    expect(getResponsibilityPreset(defaultResponsibilityParties('OWNER'))).toBe('OWNER');
    expect(getResponsibilityPreset(defaultResponsibilityParties('ASSOCIATION'))).toBe('ASSOCIATION');
    expect(getResponsibilityPreset(defaultResponsibilityParties('UNKNOWN'))).toBe('UNKNOWN');

    const custom = defaultResponsibilityParties('OWNER');
    custom.ROOF = 'ASSOCIATION';
    expect(getResponsibilityPreset(custom)).toBe('CUSTOM');
  });

  test('supported create and edit pages use the canonical round-trip mappers', () => {
    const appRoot = path.resolve(process.cwd(), 'src/app/(dashboard)/dashboard/properties');
    const createPage = fs.readFileSync(path.join(appRoot, 'new/page.tsx'), 'utf8');
    const editPage = fs.readFileSync(path.join(appRoot, '[id]/edit/page.tsx'), 'utf8');

    for (const source of [createPage, editPage]) {
      expect(source).toMatch(/mapResponsibilitiesToPayload/);
      expect(source).toMatch(/normalizeOutdoorSpaceTypes/);
      expect(source).not.toMatch(/outdoorSpaceTypes:\s*[^\n]*\['PRIVATE_YARD'/);
      expect(source).not.toMatch(/RESPONSIBILITY_SCOPES\.map\(\(scope\)\s*=>\s*\(\{\s*scope,\s*party:\s*[^}]*responsibilityParty/);
    }
    expect(editPage).toMatch(/mapResponsibilitiesToForm\(property\.responsibilities\)/);
  });
});
