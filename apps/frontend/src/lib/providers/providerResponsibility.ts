import type { PropertyContextEnvelope } from '@/components/property-context/propertyContextTypes';

export type ProviderResponsibilityParty = 'OWNER' | 'ASSOCIATION' | 'LANDLORD' | 'SHARED' | 'UNKNOWN';

export type ProviderResponsibilityConfig = {
  factKey: string;
  scope: string;
  subject: string;
};

const RESPONSIBILITY_BY_CATEGORY: Record<string, ProviderResponsibilityConfig> = {
  HVAC: { factKey: 'responsibility.hvac', scope: 'HVAC', subject: 'HVAC service' },
  PLUMBING: { factKey: 'responsibility.plumbing', scope: 'PLUMBING', subject: 'plumbing service' },
  WATER_HEATER: { factKey: 'responsibility.plumbing', scope: 'PLUMBING', subject: 'water heater service' },
  ROOFING: { factKey: 'responsibility.roof', scope: 'ROOF', subject: 'roof work' },
  GUTTERS: { factKey: 'responsibility.roof', scope: 'ROOF', subject: 'gutter work' },
  SOLAR: { factKey: 'responsibility.roof', scope: 'ROOF', subject: 'solar work' },
  SIDING: { factKey: 'responsibility.buildingExterior', scope: 'BUILDING_EXTERIOR', subject: 'siding work' },
  WINDOWS_DOORS: { factKey: 'responsibility.buildingExterior', scope: 'BUILDING_EXTERIOR', subject: 'window and door work' },
  LANDSCAPING: { factKey: 'responsibility.landscaping', scope: 'LANDSCAPING', subject: 'landscaping work' },
  LANDSCAPING_DRAINAGE: { factKey: 'responsibility.landscaping', scope: 'LANDSCAPING', subject: 'drainage work' },
  PEST_CONTROL: { factKey: 'responsibility.pestControl', scope: 'PEST_CONTROL', subject: 'pest control' },
  ELECTRICAL: { factKey: 'responsibility.sharedSystems', scope: 'SHARED_SYSTEMS', subject: 'electrical service' },
  HANDYMAN: { factKey: 'responsibility.sharedSystems', scope: 'SHARED_SYSTEMS', subject: 'this repair work' },
  GENERAL_HANDYMAN: { factKey: 'responsibility.sharedSystems', scope: 'SHARED_SYSTEMS', subject: 'this repair work' },
  FOUNDATION: { factKey: 'responsibility.sharedSystems', scope: 'SHARED_SYSTEMS', subject: 'foundation work' },
  INSULATION: { factKey: 'responsibility.sharedSystems', scope: 'SHARED_SYSTEMS', subject: 'insulation work' },
  FLOORING: { factKey: 'responsibility.sharedSystems', scope: 'SHARED_SYSTEMS', subject: 'flooring work' },
  PAINTING: { factKey: 'responsibility.sharedSystems', scope: 'SHARED_SYSTEMS', subject: 'painting work' },
  MOLD_REMEDIATION: { factKey: 'responsibility.sharedSystems', scope: 'SHARED_SYSTEMS', subject: 'mold remediation' },
  SECURITY_SAFETY: { factKey: 'responsibility.commonSafety', scope: 'COMMON_SAFETY', subject: 'safety and security service' },
  LOCKSMITH: { factKey: 'responsibility.commonSafety', scope: 'COMMON_SAFETY', subject: 'lock and security service' },
};

export function getProviderResponsibilityConfig(category?: string | null): ProviderResponsibilityConfig | null {
  if (!category || category === 'ALL') return null;
  return RESPONSIBILITY_BY_CATEGORY[category.trim().toUpperCase()] ?? null;
}

export function isResponsibilityAssignedElsewhere(context?: PropertyContextEnvelope | null): boolean {
  return Boolean(context?.decision.reasonCodes.some((code) =>
    code === 'WORK_SCOPE_RESPONSIBILITY_ASSIGNED_ELSEWHERE' ||
    code === 'PROJECT_RESPONSIBILITY_ASSIGNED_ELSEWHERE'
  ));
}

export function isResponsibilityUnknown(
  context?: PropertyContextEnvelope | null,
  config?: ProviderResponsibilityConfig | null,
): boolean {
  if (!context || context.decision.status !== 'UNKNOWN') return false;
  if (!config) return false;
  return context.decision.missingFactKeys.includes(config.factKey) ||
    context.decision.reasonCodes.includes('WORK_SCOPE_RESPONSIBILITY_UNKNOWN');
}

export function responsibilityPartyLabel(party?: ProviderResponsibilityParty | null): string {
  switch (party) {
    case 'OWNER': return 'you or the homeowner';
    case 'LANDLORD': return 'your landlord or property manager';
    case 'ASSOCIATION': return 'your HOA or condo association';
    case 'SHARED': return 'you and another responsible party';
    default: return 'another responsible party';
  }
}
