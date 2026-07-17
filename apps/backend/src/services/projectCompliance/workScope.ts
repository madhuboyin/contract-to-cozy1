export interface ProjectComplianceWorkInput {
  projectType?: string | null;
  serviceCategory?: string | null;
  homeSystemsAffected?: string[] | null;
  permitWorkTypes?: string[] | null;
  hoaWorkTypes?: string[] | null;
}

export type ProjectResponsibilityFactKey =
  | 'responsibility.roof'
  | 'responsibility.buildingExterior'
  | 'responsibility.landscaping'
  | 'responsibility.drivewayWalkways'
  | 'responsibility.deckPatioBalcony'
  | 'responsibility.plumbing'
  | 'responsibility.hvac'
  | 'responsibility.commonSafety'
  | 'responsibility.pestControl'
  | 'responsibility.sharedSystems';

const PROJECT_TYPE_RESPONSIBILITY: Record<string, ProjectResponsibilityFactKey[]> = {
  ROOF_REPLACEMENT: ['responsibility.roof'],
  HVAC_REPLACEMENT: ['responsibility.hvac'],
  HVAC_REPAIR: ['responsibility.hvac'],
  KITCHEN_REMODEL: ['responsibility.plumbing', 'responsibility.sharedSystems'],
  BATHROOM_REMODEL: ['responsibility.plumbing', 'responsibility.sharedSystems'],
  ELECTRICAL_PANEL: ['responsibility.sharedSystems'],
  PLUMBING_REPIPING: ['responsibility.plumbing'],
  WATER_HEATER: ['responsibility.plumbing'],
  FOUNDATION_WORK: ['responsibility.sharedSystems'],
  WINDOW_REPLACEMENT: ['responsibility.buildingExterior'],
  FLOORING: ['responsibility.sharedSystems'],
  PAINTING_INTERIOR: ['responsibility.sharedSystems'],
  PAINTING_EXTERIOR: ['responsibility.buildingExterior'],
  DECK_PATIO: ['responsibility.deckPatioBalcony'],
  ADDITION: ['responsibility.sharedSystems', 'responsibility.buildingExterior'],
  SEWER_LINE: ['responsibility.plumbing'],
  SOLAR_INSTALLATION: ['responsibility.roof'],
  LANDSCAPING_MAJOR: ['responsibility.landscaping'],
  GENERAL_REPAIR: ['responsibility.sharedSystems'],
  ROOM_ADDITION: ['responsibility.sharedSystems', 'responsibility.buildingExterior'],
  BATHROOM_ADDITION: ['responsibility.plumbing', 'responsibility.sharedSystems'],
  BATHROOM_FULL_REMODEL: ['responsibility.plumbing', 'responsibility.sharedSystems'],
  GARAGE_CONVERSION: ['responsibility.sharedSystems'],
  BASEMENT_FINISHING: ['responsibility.sharedSystems'],
  ADU_CONSTRUCTION: ['responsibility.sharedSystems', 'responsibility.buildingExterior'],
  DECK_ADDITION: ['responsibility.deckPatioBalcony'],
  PATIO_MAJOR_ADDITION: ['responsibility.deckPatioBalcony'],
  STRUCTURAL_WALL_REMOVAL: ['responsibility.sharedSystems'],
  STRUCTURAL_WALL_ADDITION: ['responsibility.sharedSystems'],
  STRUCTURAL_REPAIR_MAJOR: ['responsibility.sharedSystems'],
};

const SERVICE_CATEGORY_RESPONSIBILITY: Record<string, ProjectResponsibilityFactKey[]> = {
  PLUMBING: ['responsibility.plumbing'],
  HVAC: ['responsibility.hvac'],
  WATER_HEATER: ['responsibility.plumbing'],
  ROOFING: ['responsibility.roof'],
  GUTTERS: ['responsibility.roof'],
  SIDING: ['responsibility.buildingExterior'],
  WINDOWS_DOORS: ['responsibility.buildingExterior'],
  LANDSCAPING: ['responsibility.landscaping'],
  LANDSCAPING_DRAINAGE: ['responsibility.landscaping'],
  PEST_CONTROL: ['responsibility.pestControl'],
  ELECTRICAL: ['responsibility.sharedSystems'],
  FOUNDATION: ['responsibility.sharedSystems'],
  INSULATION: ['responsibility.sharedSystems'],
  FLOORING: ['responsibility.sharedSystems'],
  PAINTING: ['responsibility.sharedSystems'],
  SOLAR: ['responsibility.roof'],
  SECURITY_SAFETY: ['responsibility.commonSafety'],
  LOCKSMITH: ['responsibility.commonSafety'],
  HANDYMAN: ['responsibility.sharedSystems'],
  GENERAL_HANDYMAN: ['responsibility.sharedSystems'],
  MOLD_REMEDIATION: ['responsibility.sharedSystems'],
};

const INVENTORY_CATEGORY_RESPONSIBILITY: Record<string, ProjectResponsibilityFactKey[]> = {
  HVAC: ['responsibility.hvac'],
  PLUMBING: ['responsibility.plumbing'],
  ROOF_EXTERIOR: ['responsibility.roof', 'responsibility.buildingExterior'],
  EXTERIOR: ['responsibility.buildingExterior'],
  SITE: ['responsibility.landscaping'],
  SAFETY: ['responsibility.commonSafety'],
  ELECTRICAL: ['responsibility.sharedSystems'],
  STRUCTURAL: ['responsibility.sharedSystems'],
  INTERIOR: ['responsibility.sharedSystems'],
};

const PERMIT_WORK_RESPONSIBILITY: Record<string, ProjectResponsibilityFactKey[]> = {
  HVAC_NEW: ['responsibility.hvac'],
  HVAC_REPLACEMENT: ['responsibility.hvac'],
  ELECTRICAL_PANEL: ['responsibility.sharedSystems'],
  ELECTRICAL_WIRING: ['responsibility.sharedSystems'],
  PLUMBING_NEW: ['responsibility.plumbing'],
  PLUMBING_REPAIR: ['responsibility.plumbing'],
  ROOF_REPLACEMENT: ['responsibility.roof'],
  ROOF_REPAIR: ['responsibility.roof'],
  ROOM_ADDITION: ['responsibility.sharedSystems', 'responsibility.buildingExterior'],
  GARAGE_CONVERSION: ['responsibility.sharedSystems'],
  ADU: ['responsibility.sharedSystems', 'responsibility.buildingExterior'],
  BASEMENT_FINISH: ['responsibility.sharedSystems'],
  DECK_PATIO: ['responsibility.deckPatioBalcony'],
  FENCE: ['responsibility.buildingExterior'],
  SWIMMING_POOL: ['responsibility.commonSafety'],
  SOLAR: ['responsibility.roof'],
  WINDOWS_DOORS: ['responsibility.buildingExterior'],
  FIREPLACE: ['responsibility.sharedSystems'],
  SEWER_WATER_LINE: ['responsibility.plumbing'],
  STRUCTURAL_REPAIR: ['responsibility.sharedSystems'],
  INTERIOR_REMODEL: ['responsibility.sharedSystems'],
  EXTERIOR_REMODEL: ['responsibility.buildingExterior'],
  DEMOLITION: ['responsibility.sharedSystems'],
  GRADING_DRAINAGE: ['responsibility.landscaping'],
};

const HOA_WORK_RESPONSIBILITY: Record<string, ProjectResponsibilityFactKey[]> = {
  EXTERIOR_PAINT: ['responsibility.buildingExterior'],
  FENCE: ['responsibility.buildingExterior'],
  ROOFING: ['responsibility.roof'],
  ROOM_ADDITION: ['responsibility.sharedSystems', 'responsibility.buildingExterior'],
  DECK_PATIO: ['responsibility.deckPatioBalcony'],
  LANDSCAPING: ['responsibility.landscaping'],
  SOLAR: ['responsibility.roof'],
  WINDOWS_DOORS: ['responsibility.buildingExterior'],
  DRIVEWAY: ['responsibility.drivewayWalkways'],
  SHED_OUTBUILDING: ['responsibility.buildingExterior'],
  POOL: ['responsibility.commonSafety'],
  SATELLITE_ANTENNA: ['responsibility.buildingExterior'],
};

const SERVICE_CATEGORIES_WITHOUT_PROPERTY_RESPONSIBILITY = new Set([
  'INSPECTION', 'APPLIANCE_REPAIR', 'APPLIANCE_REPLACEMENT', 'CLEANING', 'MOVING',
  'INSURANCE', 'ATTORNEY', 'FINANCE', 'WARRANTY', 'ADMIN',
]);

export function hasWorkDescriptor(work?: ProjectComplianceWorkInput): boolean {
  return Boolean(
    work?.projectType ||
    work?.serviceCategory ||
    work?.homeSystemsAffected?.length ||
    work?.permitWorkTypes?.length ||
    work?.hoaWorkTypes?.length,
  );
}

export function resolveResponsibilityFactKeys(work?: ProjectComplianceWorkInput): ProjectResponsibilityFactKey[] {
  if (!work) return [];
  const keys = new Set<ProjectResponsibilityFactKey>();
  const add = (values?: ProjectResponsibilityFactKey[]) => values?.forEach((key) => keys.add(key));
  if (work.projectType) add(PROJECT_TYPE_RESPONSIBILITY[work.projectType]);
  if (work.serviceCategory) add(SERVICE_CATEGORY_RESPONSIBILITY[work.serviceCategory]);
  for (const category of work.homeSystemsAffected ?? []) add(INVENTORY_CATEGORY_RESPONSIBILITY[category]);
  for (const workType of work.permitWorkTypes ?? []) add(PERMIT_WORK_RESPONSIBILITY[workType]);
  for (const workType of work.hoaWorkTypes ?? []) add(HOA_WORK_RESPONSIBILITY[workType]);
  return [...keys];
}

export function hasUnresolvedResponsibilityScope(work?: ProjectComplianceWorkInput): boolean {
  if (!work) return false;
  if (work.projectType && !PROJECT_TYPE_RESPONSIBILITY[work.projectType]) return true;
  if (
    work.serviceCategory &&
    !SERVICE_CATEGORY_RESPONSIBILITY[work.serviceCategory] &&
    !SERVICE_CATEGORIES_WITHOUT_PROPERTY_RESPONSIBILITY.has(work.serviceCategory)
  ) return true;
  if ((work.homeSystemsAffected ?? []).some((value) => !INVENTORY_CATEGORY_RESPONSIBILITY[value])) return true;
  if ((work.permitWorkTypes ?? []).some((value) => !PERMIT_WORK_RESPONSIBILITY[value])) return true;
  if ((work.hoaWorkTypes ?? []).some((value) => !HOA_WORK_RESPONSIBILITY[value])) return true;
  return false;
}

export type PermitApplicabilityClass = 'REQUIRED' | 'LIKELY_REQUIRED' | 'CONDITIONAL' | 'UNSCOPED';

export type ExecutionAppropriatenessClass =
  | 'LICENSED_PROFESSIONAL_REQUIRED'
  | 'PROFESSIONAL_REVIEW_RECOMMENDED'
  | 'DIY_ELIGIBLE'
  | 'UNSCOPED';

const REQUIRED_PERMIT_WORK = new Set([
  'HVAC_NEW', 'ELECTRICAL_PANEL', 'ELECTRICAL_WIRING', 'PLUMBING_NEW', 'ROOM_ADDITION',
  'GARAGE_CONVERSION', 'ADU', 'BASEMENT_FINISH', 'SOLAR', 'SEWER_WATER_LINE',
  'STRUCTURAL_REPAIR', 'DEMOLITION',
]);

const LIKELY_PERMIT_WORK = new Set([
  'HVAC_REPLACEMENT', 'ROOF_REPLACEMENT', 'DECK_PATIO', 'FENCE', 'SWIMMING_POOL',
  'WINDOWS_DOORS', 'FIREPLACE', 'INTERIOR_REMODEL', 'EXTERIOR_REMODEL', 'GRADING_DRAINAGE',
]);

const REGULATED_SERVICE_CATEGORIES = new Set([
  'ELECTRICAL', 'PLUMBING', 'HVAC', 'ROOFING', 'FOUNDATION', 'SOLAR',
  'WATER_HEATER', 'MOLD_REMEDIATION', 'SECURITY_SAFETY',
]);

const DIY_ELIGIBLE_PROJECT_TYPES = new Set([
  'FLOORING', 'PAINTING_INTERIOR', 'GENERAL_REPAIR',
]);

const DIY_ELIGIBLE_SERVICE_CATEGORIES = new Set([
  'PAINTING', 'CLEANING', 'HANDYMAN', 'GENERAL_HANDYMAN',
]);

const PROJECT_TYPE_PERMIT_WORK: Record<string, string[]> = {
  ROOF_REPLACEMENT: ['ROOF_REPLACEMENT'],
  HVAC_REPLACEMENT: ['HVAC_REPLACEMENT'],
  ELECTRICAL_PANEL: ['ELECTRICAL_PANEL'],
  PLUMBING_REPIPING: ['PLUMBING_NEW'],
  WATER_HEATER: ['PLUMBING_REPAIR'],
  FOUNDATION_WORK: ['STRUCTURAL_REPAIR'],
  WINDOW_REPLACEMENT: ['WINDOWS_DOORS'],
  KITCHEN_REMODEL: ['INTERIOR_REMODEL'],
  BATHROOM_REMODEL: ['INTERIOR_REMODEL'],
  DECK_PATIO: ['DECK_PATIO'],
  ADDITION: ['ROOM_ADDITION'],
  SEWER_LINE: ['SEWER_WATER_LINE'],
  SOLAR_INSTALLATION: ['SOLAR'],
  LANDSCAPING_MAJOR: ['GRADING_DRAINAGE'],
  ROOM_ADDITION: ['ROOM_ADDITION'],
  BATHROOM_ADDITION: ['ROOM_ADDITION', 'PLUMBING_NEW', 'ELECTRICAL_WIRING'],
  BATHROOM_FULL_REMODEL: ['INTERIOR_REMODEL'],
  GARAGE_CONVERSION: ['GARAGE_CONVERSION'],
  BASEMENT_FINISHING: ['BASEMENT_FINISH'],
  ADU_CONSTRUCTION: ['ADU'],
  DECK_ADDITION: ['DECK_PATIO'],
  PATIO_MAJOR_ADDITION: ['DECK_PATIO'],
  STRUCTURAL_WALL_REMOVAL: ['STRUCTURAL_REPAIR'],
  STRUCTURAL_WALL_ADDITION: ['STRUCTURAL_REPAIR'],
  STRUCTURAL_REPAIR_MAJOR: ['STRUCTURAL_REPAIR'],
};

const SERVICE_CATEGORY_PERMIT_WORK: Record<string, string[]> = {
  ROOFING: ['ROOF_REPLACEMENT'],
  HVAC: ['HVAC_REPLACEMENT'],
  ELECTRICAL: ['ELECTRICAL_WIRING'],
  PLUMBING: ['PLUMBING_REPAIR'],
  WATER_HEATER: ['PLUMBING_REPAIR'],
  FOUNDATION: ['STRUCTURAL_REPAIR'],
  WINDOWS_DOORS: ['WINDOWS_DOORS'],
  SOLAR: ['SOLAR'],
  LANDSCAPING_DRAINAGE: ['GRADING_DRAINAGE'],
};

export function resolvePermitWorkTypes(work?: ProjectComplianceWorkInput): string[] {
  const types = new Set(work?.permitWorkTypes ?? []);
  if (work?.projectType) PROJECT_TYPE_PERMIT_WORK[work.projectType]?.forEach((type) => types.add(type));
  if (work?.serviceCategory) SERVICE_CATEGORY_PERMIT_WORK[work.serviceCategory]?.forEach((type) => types.add(type));
  return [...types];
}

export function classifyPermitApplicability(workTypes?: string[] | null): PermitApplicabilityClass {
  if (!workTypes?.length) return 'UNSCOPED';
  if (workTypes.some((workType) => REQUIRED_PERMIT_WORK.has(workType))) return 'REQUIRED';
  if (workTypes.some((workType) => LIKELY_PERMIT_WORK.has(workType))) return 'LIKELY_REQUIRED';
  return 'CONDITIONAL';
}

export function classifyExecutionAppropriateness(
  work?: ProjectComplianceWorkInput,
): ExecutionAppropriatenessClass {
  if (!hasWorkDescriptor(work)) return 'UNSCOPED';

  const permitClass = classifyPermitApplicability(resolvePermitWorkTypes(work));
  if (
    permitClass === 'REQUIRED' ||
    (work?.serviceCategory && REGULATED_SERVICE_CATEGORIES.has(work.serviceCategory))
  ) {
    return 'LICENSED_PROFESSIONAL_REQUIRED';
  }
  if (permitClass === 'LIKELY_REQUIRED') return 'PROFESSIONAL_REVIEW_RECOMMENDED';
  if (
    (work?.projectType && DIY_ELIGIBLE_PROJECT_TYPES.has(work.projectType)) ||
    (work?.serviceCategory && DIY_ELIGIBLE_SERVICE_CATEGORIES.has(work.serviceCategory))
  ) {
    return 'DIY_ELIGIBLE';
  }
  return 'PROFESSIONAL_REVIEW_RECOMMENDED';
}
