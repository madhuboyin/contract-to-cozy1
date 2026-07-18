import { PropertyContextScope } from '../domain/contracts';

export interface PropertyFactDefinition {
  key: string;
  scope: PropertyContextScope;
  canonicalOwner: string;
  correctionPath: string | null;
  writable: boolean;
}

const propertyPath = (section: string) => `/dashboard/properties/:propertyId/edit#${section}`;

export const PROPERTY_FACT_CATALOG = [
  { key: 'core.dwellingType', scope: 'CORE', canonicalOwner: 'Property.dwellingType', correctionPath: propertyPath('property-type'), writable: true },
  { key: 'core.ownershipForm', scope: 'CORE', canonicalOwner: 'Property.ownershipForm', correctionPath: propertyPath('property-type'), writable: true },
  { key: 'core.propertyUse', scope: 'CORE', canonicalOwner: 'Property.propertyUse', correctionPath: propertyPath('occupancy'), writable: true },
  { key: 'core.occupancyStatus', scope: 'CORE', canonicalOwner: 'Property.occupancyStatus', correctionPath: propertyPath('occupancy'), writable: true },
  { key: 'core.isPrimary', scope: 'CORE', canonicalOwner: 'Property.isPrimary', correctionPath: propertyPath('occupancy'), writable: true },
  { key: 'core.yearBuilt', scope: 'CORE', canonicalOwner: 'Property.yearBuilt', correctionPath: propertyPath('structure'), writable: true },
  { key: 'core.propertySizeSqFt', scope: 'CORE', canonicalOwner: 'Property.propertySize', correctionPath: propertyPath('structure'), writable: true },
  { key: 'core.bedrooms', scope: 'CORE', canonicalOwner: 'Property.bedrooms', correctionPath: propertyPath('structure'), writable: true },
  { key: 'core.bathrooms', scope: 'CORE', canonicalOwner: 'Property.bathrooms', correctionPath: propertyPath('structure'), writable: true },
  { key: 'core.activationStatus', scope: 'CORE', canonicalOwner: 'Property.activationStatus', correctionPath: null, writable: false },
  { key: 'location.city', scope: 'LOCATION', canonicalOwner: 'Property.city', correctionPath: propertyPath('address'), writable: true },
  { key: 'location.state', scope: 'LOCATION', canonicalOwner: 'Property.state', correctionPath: propertyPath('address'), writable: true },
  { key: 'location.zipCode', scope: 'LOCATION', canonicalOwner: 'Property.zipCode', correctionPath: propertyPath('address'), writable: true },
  { key: 'location.timezone', scope: 'LOCATION', canonicalOwner: 'Property.timezone', correctionPath: propertyPath('address'), writable: true },
  { key: 'location.geocoded', scope: 'LOCATION', canonicalOwner: 'Property.latitude/longitude', correctionPath: propertyPath('address'), writable: false },
  { key: 'location.climateRegion', scope: 'LOCATION', canonicalOwner: 'PropertyClimateSetting.climateRegion', correctionPath: '/dashboard/properties/:propertyId/environment', writable: false },
  { key: 'location.isCoastal', scope: 'LOCATION', canonicalOwner: 'Verified location exposure source', correctionPath: propertyPath('address'), writable: false },
  { key: 'structure.roofType', scope: 'STRUCTURE', canonicalOwner: 'Property.roofType', correctionPath: propertyPath('structure'), writable: true },
  { key: 'structure.roofReplacementYear', scope: 'STRUCTURE', canonicalOwner: 'Property.roofReplacementYear', correctionPath: propertyPath('structure'), writable: true },
  { key: 'structure.roofAgeYears', scope: 'STRUCTURE', canonicalOwner: 'Derived from Property.roofReplacementYear', correctionPath: propertyPath('structure'), writable: false },
  { key: 'structure.foundationType', scope: 'STRUCTURE', canonicalOwner: 'Property.foundationType', correctionPath: propertyPath('structure'), writable: true },
  { key: 'structure.sidingType', scope: 'STRUCTURE', canonicalOwner: 'Property.sidingType', correctionPath: propertyPath('structure'), writable: true },
  { key: 'structure.electricalPanelAgeYears', scope: 'STRUCTURE', canonicalOwner: 'Property.electricalPanelAge', correctionPath: propertyPath('structure'), writable: true },
  { key: 'exterior.hasPrivateOutdoorSpace', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasPrivateOutdoorSpace', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.outdoorSpaceTypes', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.outdoorSpaceTypes', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.lotSizeSqFt', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.lotSizeSqFt', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.hasLawn', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasLawn', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.hasTreesOrShrubs', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasTreesOrShrubs', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.hasDriveway', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasDriveway', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.hasFence', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasFence', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.hasPoolOrSpa', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasPoolOrSpa', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.hasIrrigation', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasIrrigation', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.hasOutdoorFaucets', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasOutdoorFaucets', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.hasDrainageIssues', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasDrainageIssues', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'responsibility.roof', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.ROOF', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.buildingExterior', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.BUILDING_EXTERIOR', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.landscaping', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.LANDSCAPING', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.treesShrubs', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.TREES_SHRUBS', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.drivewayWalkways', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.DRIVEWAY_WALKWAYS', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.deckPatioBalcony', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.DECK_PATIO_BALCONY', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.plumbing', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.PLUMBING', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.hvac', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.HVAC', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.commonSafety', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.COMMON_SAFETY', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.snowIce', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.SNOW_ICE', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.pestControl', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.PEST_CONTROL', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.sharedSystems', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.SHARED_SYSTEMS', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'systems.hasCooling', scope: 'SYSTEMS', canonicalOwner: 'Derived from Property.coolingType and InventoryItem', correctionPath: propertyPath('systems'), writable: false },
  { key: 'systems.heatingType', scope: 'SYSTEMS', canonicalOwner: 'Property.heatingType', correctionPath: propertyPath('systems'), writable: true },
  { key: 'systems.coolingType', scope: 'SYSTEMS', canonicalOwner: 'Property.coolingType', correctionPath: propertyPath('systems'), writable: true },
  { key: 'systems.waterHeaterType', scope: 'SYSTEMS', canonicalOwner: 'Property.waterHeaterType', correctionPath: propertyPath('systems'), writable: true },
  { key: 'systems.installedItemTypes', scope: 'SYSTEMS', canonicalOwner: 'InventoryItem', correctionPath: '/dashboard/properties/:propertyId/inventory', writable: false },
  { key: 'safety.hasSmokeDetectors', scope: 'SAFETY', canonicalOwner: 'Property.hasSmokeDetectors', correctionPath: propertyPath('safety'), writable: true },
  { key: 'safety.hasCoDetectors', scope: 'SAFETY', canonicalOwner: 'Property.hasCoDetectors', correctionPath: propertyPath('safety'), writable: true },
  { key: 'safety.hasSecuritySystem', scope: 'SAFETY', canonicalOwner: 'Property.hasSecuritySystem', correctionPath: propertyPath('safety'), writable: true },
  { key: 'safety.hasFireExtinguisher', scope: 'SAFETY', canonicalOwner: 'Property.hasFireExtinguisher', correctionPath: propertyPath('safety'), writable: true },
  { key: 'safety.hasSumpPumpBackup', scope: 'SAFETY', canonicalOwner: 'Property.hasSumpPumpBackup', correctionPath: propertyPath('safety'), writable: true },
  { key: 'maintenance.tasks', scope: 'MAINTENANCE', canonicalOwner: 'PropertyMaintenanceTask', correctionPath: '/dashboard/properties/:propertyId/maintenance', writable: false },
  { key: 'rooms.list', scope: 'ROOMS', canonicalOwner: 'InventoryRoom', correctionPath: '/dashboard/properties/:propertyId/rooms', writable: false },
  { key: 'inventory.items', scope: 'INVENTORY', canonicalOwner: 'InventoryItem', correctionPath: '/dashboard/properties/:propertyId/inventory', writable: false },
  { key: 'inspection.confirmedReports', scope: 'INSPECTION', canonicalOwner: 'InspectionReport', correctionPath: '/dashboard/properties/:propertyId/inspection-hub', writable: false },
  { key: 'inspection.openFindings', scope: 'INSPECTION', canonicalOwner: 'InspectionFinding', correctionPath: '/dashboard/properties/:propertyId/inspection-hub/open-items', writable: false },
  { key: 'coverage.insurancePolicies', scope: 'COVERAGE', canonicalOwner: 'InsurancePolicy', correctionPath: '/dashboard/insurance', writable: false },
  { key: 'coverage.warranties', scope: 'COVERAGE', canonicalOwner: 'Warranty', correctionPath: '/dashboard/warranties', writable: false },
  { key: 'coverage.activeClaims', scope: 'COVERAGE', canonicalOwner: 'Claim', correctionPath: '/dashboard/properties/:propertyId/claims', writable: false },
  { key: 'risk.report', scope: 'RISK', canonicalOwner: 'RiskAssessmentReport', correctionPath: '/dashboard/properties/:propertyId/risk-assessment', writable: false },
  { key: 'risk.activeIncidents', scope: 'RISK', canonicalOwner: 'Incident', correctionPath: '/dashboard/properties/:propertyId/incidents', writable: false },
  { key: 'financial.financingProfile', scope: 'FINANCIAL', canonicalOwner: 'PropertyFinancingProfile', correctionPath: '/dashboard/properties/:propertyId/tools/financing/profile', writable: false },
  { key: 'financial.currentMortgage', scope: 'FINANCIAL', canonicalOwner: 'PropertyFinancingProfile', correctionPath: '/dashboard/properties/:propertyId/tools/financing/profile', writable: false },
  { key: 'financial.latestEquity', scope: 'FINANCIAL', canonicalOwner: 'EquityPosition', correctionPath: '/dashboard/properties/:propertyId/tools/financing', writable: false },
  { key: 'financial.reserveFund', scope: 'FINANCIAL', canonicalOwner: 'HomeReserveFund', correctionPath: '/dashboard/properties/:propertyId/tools/reserve-fund', writable: false },
  { key: 'financial.upcomingCapitalExposure', scope: 'FINANCIAL', canonicalOwner: 'HomeCapitalTimelineItem', correctionPath: '/dashboard/properties/:propertyId/tools/capital-timeline', writable: false },
  { key: 'financial.ownershipExpenseSummary', scope: 'FINANCIAL', canonicalOwner: 'Expense', correctionPath: '/dashboard/expenses', writable: false },
  { key: 'financial.activeScenarios', scope: 'FINANCIAL', canonicalOwner: 'FinancingScenario', correctionPath: '/dashboard/properties/:propertyId/tools/financing', writable: false },
  { key: 'recalls.unresolvedMatches', scope: 'RECALLS', canonicalOwner: 'RecallMatch', correctionPath: '/dashboard/properties/:propertyId/recalls', writable: false },
  { key: 'environment.climateSetting', scope: 'ENVIRONMENT', canonicalOwner: 'PropertyClimateSetting', correctionPath: '/dashboard/seasonal/settings', writable: false },
  { key: 'events.activeRadarMatches', scope: 'EVENTS', canonicalOwner: 'PropertyRadarMatch', correctionPath: '/dashboard/properties/:propertyId/tools/home-event-radar', writable: false },
  { key: 'events.recentHomeEvents', scope: 'EVENTS', canonicalOwner: 'HomeEvent', correctionPath: '/dashboard/properties/:propertyId/timeline', writable: false },
  { key: 'guidance.activeSignals', scope: 'GUIDANCE_STATE', canonicalOwner: 'GuidanceSignal', correctionPath: '/dashboard/properties/:propertyId/tools/guidance-overview', writable: false },
  { key: 'compliance.activePermits', scope: 'COMPLIANCE', canonicalOwner: 'PropertyPermitRecord', correctionPath: '/dashboard/properties/:propertyId/tools/permits', writable: false },
  { key: 'compliance.hoaAssociation', scope: 'COMPLIANCE', canonicalOwner: 'HoaAssociation', correctionPath: '/dashboard/properties/:propertyId/tools/hoa', writable: false },
  { key: 'compliance.openHoaApprovals', scope: 'COMPLIANCE', canonicalOwner: 'HoaApprovalRecord', correctionPath: '/dashboard/properties/:propertyId/tools/hoa', writable: false },
  { key: 'compliance.openUnpermittedFlags', scope: 'COMPLIANCE', canonicalOwner: 'PermitUnpermittedFlag', correctionPath: '/dashboard/properties/:propertyId/tools/permits', writable: false },
  { key: 'projects.activeProjects', scope: 'PROJECTS', canonicalOwner: 'ProjectRecord', correctionPath: '/dashboard/properties/:propertyId/projects', writable: false },
  { key: 'projects.materialSpecs', scope: 'PROJECTS', canonicalOwner: 'MaterialSpec', correctionPath: '/dashboard/properties/:propertyId/materials', writable: false },
  { key: 'projects.openQuoteWorkspaces', scope: 'PROJECTS', canonicalOwner: 'QuoteComparisonWorkspace', correctionPath: '/dashboard/properties/:propertyId/tools/quote-comparison', writable: false },
  { key: 'projects.activeBookings', scope: 'PROJECTS', canonicalOwner: 'Booking', correctionPath: '/dashboard/bookings', writable: false },
  { key: 'projects.recentPriceChecks', scope: 'PROJECTS', canonicalOwner: 'ServiceRadarCheck', correctionPath: '/dashboard/properties/:propertyId/tools/service-price-radar', writable: false },
  { key: 'projects.openPriceFinalizations', scope: 'PROJECTS', canonicalOwner: 'PriceFinalization', correctionPath: '/dashboard/properties/:propertyId/tools/price-finalization', writable: false },
  { key: 'projects.openNegotiations', scope: 'PROJECTS', canonicalOwner: 'NegotiationShieldCase', correctionPath: '/dashboard/properties/:propertyId/tools/negotiation-shield', writable: false },
  { key: 'product.onboardingStatus', scope: 'PRODUCT_CONTEXT', canonicalOwner: 'PropertyOnboarding.status', correctionPath: '/dashboard/properties/:propertyId/onboarding', writable: false },
  { key: 'product.onboardingStep', scope: 'PRODUCT_CONTEXT', canonicalOwner: 'PropertyOnboarding.currentStep', correctionPath: '/dashboard/properties/:propertyId/onboarding', writable: false },
  { key: 'product.setupScore', scope: 'PRODUCT_CONTEXT', canonicalOwner: 'PropertyOnboarding.setupScore', correctionPath: '/dashboard/properties/:propertyId/onboarding', writable: false },
  { key: 'product.homeownerSegment', scope: 'PRODUCT_CONTEXT', canonicalOwner: 'HomeownerProfile.segment', correctionPath: '/dashboard/profile', writable: false },
  { key: 'product.canViewFacts', scope: 'PRODUCT_CONTEXT', canonicalOwner: 'HouseholdMember.role', correctionPath: null, writable: false },
  { key: 'product.canCorrectFacts', scope: 'PRODUCT_CONTEXT', canonicalOwner: 'HouseholdMember.role', correctionPath: null, writable: false },
] as const satisfies readonly PropertyFactDefinition[];

const catalogByKey = new Map<string, PropertyFactDefinition>(
  PROPERTY_FACT_CATALOG.map((definition) => [definition.key, definition]),
);

export function getFactDefinition(key: string): PropertyFactDefinition {
  const definition = catalogByKey.get(key);
  if (!definition) throw new Error(`Property Context fact key is not allowlisted: ${key}`);
  return definition;
}

export function getFactDefinitionsForScope(scope: PropertyContextScope): PropertyFactDefinition[] {
  return PROPERTY_FACT_CATALOG.filter((definition) => definition.scope === scope);
}

export function isAllowlistedFactKey(key: string): boolean {
  return catalogByKey.has(key);
}
