import {
  getProviderResponsibilityConfig,
  isResponsibilityAssignedElsewhere,
  isResponsibilityUnknown,
  responsibilityPartyLabel,
} from '../providerResponsibility';
import {
  getProviderCategoryForSystemType,
  getProviderWorkCategory,
} from '@/lib/config/serviceCategoryMapping';

const context = (status: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN', reasonCodes: string[], missingFactKeys: string[] = []) => ({
  contextVersion: 'v1',
  decision: {
    status,
    reasonCodes,
    missingFactKeys,
    usedFactKeys: [],
    conflictedFactKeys: [],
    validUntil: null,
  },
});

describe('provider responsibility presentation', () => {
  test.each([
    ['HVAC', 'responsibility.hvac', 'HVAC service'],
    ['PLUMBING', 'responsibility.plumbing', 'plumbing service'],
    ['WATER_HEATER', 'responsibility.plumbing', 'water heater service'],
    ['ROOFING', 'responsibility.roof', 'roof work'],
    ['GUTTERS', 'responsibility.roof', 'gutter work'],
    ['SIDING', 'responsibility.buildingExterior', 'siding work'],
    ['ELECTRICAL', 'responsibility.sharedSystems', 'electrical service'],
    ['SECURITY_SAFETY', 'responsibility.commonSafety', 'safety and security service'],
    ['LANDSCAPING', 'responsibility.landscaping', 'landscaping work'],
    ['PEST_CONTROL', 'responsibility.pestControl', 'pest control'],
  ])('maps %s to its responsibility fact', (category, factKey, subject) => {
    expect(getProviderResponsibilityConfig(category)).toMatchObject({ factKey, subject });
  });

  test('does not ask a responsibility question for categories without a responsibility gate', () => {
    expect(getProviderResponsibilityConfig('CLEANING')).toBeNull();
    expect(getProviderResponsibilityConfig('INSPECTION')).toBeNull();
    expect(getProviderResponsibilityConfig('APPLIANCE_REPAIR')).toBeNull();
    expect(getProviderResponsibilityConfig('WARRANTY')).toBeNull();
    expect(getProviderResponsibilityConfig('ALL')).toBeNull();
  });

  test.each([
    ['HVAC_FURNACE', 'HVAC', 'HVAC'],
    ['WATER_HEATER_TANK', 'PLUMBING', 'WATER_HEATER'],
    ['ROOF_SHINGLE', 'INSPECTION', 'ROOFING'],
    ['ROOF_EXTERIOR', 'INSPECTION', 'ROOFING'],
    ['ELECTRICAL_PANEL', 'ELECTRICAL', 'ELECTRICAL'],
    ['SAFETY_SMOKE_CO_DETECTORS', 'HANDYMAN', 'SECURITY_SAFETY'],
    ['APPLIANCE', 'HANDYMAN', 'APPLIANCE_REPAIR'],
  ])('keeps provider and work categories separate for %s', (raw, providerCategory, workCategory) => {
    expect(getProviderCategoryForSystemType(raw)).toBe(providerCategory);
    expect(getProviderWorkCategory(raw)).toBe(workCategory);
  });

  test('distinguishes an unknown fact from work assigned elsewhere', () => {
    const config = getProviderResponsibilityConfig('HVAC');
    expect(isResponsibilityUnknown(context('UNKNOWN', ['WORK_SCOPE_RESPONSIBILITY_UNKNOWN'], ['responsibility.hvac']), config)).toBe(true);
    expect(isResponsibilityAssignedElsewhere(context('NOT_APPLICABLE', ['WORK_SCOPE_RESPONSIBILITY_ASSIGNED_ELSEWHERE']))).toBe(true);
    expect(isResponsibilityUnknown(context('NOT_APPLICABLE', ['WORK_SCOPE_RESPONSIBILITY_ASSIGNED_ELSEWHERE']), config)).toBe(false);
  });

  test('uses homeowner-facing party names', () => {
    expect(responsibilityPartyLabel('LANDLORD')).toBe('your landlord or property manager');
    expect(responsibilityPartyLabel('ASSOCIATION')).toBe('your HOA or condo association');
    expect(responsibilityPartyLabel('SHARED')).toBe('you and another responsible party');
  });
});
