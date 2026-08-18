import type { PropertyContextSnapshot, PropertyFact } from '../modules/propertyContext/domain/contracts';
import type { BuyerInspectionPlanInput } from '../productFramework/buyerAcquisition.contract';

export const BUYER_INSPECTION_MODULE_VERSION = 'buyer-inspection-modules-v1';

type SpecialistScope = NonNullable<BuyerInspectionPlanInput['specialistScopes']>[number];
type ModuleStatus = 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';

export interface BuyerInspectionModuleRecommendation {
  moduleKey: string;
  title: string;
  description: string;
  whyItMatters: string;
  status: ModuleStatus;
  reasonCodes: string[];
  specialistScopes: SpecialistScope[];
  questions: string[];
  usedFactKeys: string[];
  missingFactKeys: string[];
  conflictedFactKeys: string[];
  correctionPaths: string[];
}

function fact(context: PropertyContextSnapshot, key: string): PropertyFact | undefined {
  return context.facts[key];
}

function known(context: PropertyContextSnapshot, key: string) {
  const item = fact(context, key);
  return item && item.state === 'KNOWN' && item.value !== null ? item.value : undefined;
}

function moduleResult(
  context: PropertyContextSnapshot,
  definition: Omit<BuyerInspectionModuleRecommendation, 'status' | 'reasonCodes' | 'usedFactKeys' | 'missingFactKeys' | 'conflictedFactKeys' | 'correctionPaths'>,
  factKeys: string[],
  applies: boolean,
  applicableReason: string,
  notApplicableReason: string,
): BuyerInspectionModuleRecommendation {
  const conflictedFactKeys = factKeys.filter((key) => fact(context, key)?.state === 'CONFLICTED');
  const missingFactKeys = factKeys.filter((key) => {
    const item = fact(context, key);
    return !item || item.state === 'UNKNOWN' || item.state === 'STALE' || item.value === null;
  });
  const usedFactKeys = factKeys.filter((key) => !missingFactKeys.includes(key) && !conflictedFactKeys.includes(key));
  const status: ModuleStatus = conflictedFactKeys.length
    ? 'UNKNOWN'
    : applies ? 'APPLICABLE'
      : missingFactKeys.length ? 'UNKNOWN' : 'NOT_APPLICABLE';
  return {
    ...definition,
    status,
    reasonCodes: conflictedFactKeys.length
      ? ['PROPERTY_CONTEXT_CONFLICT']
      : status === 'UNKNOWN' ? ['PROPERTY_DETAIL_REQUIRED']
        : [applies ? applicableReason : notApplicableReason],
    usedFactKeys,
    missingFactKeys,
    conflictedFactKeys,
    correctionPaths: [...new Set([...missingFactKeys, ...conflictedFactKeys]
      .map((key) => fact(context, key)?.correctionPath)
      .filter((path): path is string => Boolean(path)))],
  };
}

export function composeBuyerInspectionModules(context: PropertyContextSnapshot) {
  const dwellingKeys = [
    'core.dwellingType',
    'core.ownershipForm',
    'responsibility.roof',
    'responsibility.buildingExterior',
    'responsibility.sharedSystems',
  ];
  const dwelling = known(context, 'core.dwellingType');
  const ownership = known(context, 'core.ownershipForm');
  const responsibilityValues = dwellingKeys.slice(2).map((key) => known(context, key));
  const sharedEnvelope = ['CONDO_UNIT', 'APARTMENT_UNIT', 'ATTACHED_SINGLE_FAMILY', 'TOWNHOUSE'].includes(String(dwelling))
    || ['CONDOMINIUM', 'COOPERATIVE'].includes(String(ownership))
    || responsibilityValues.some((value) => value === 'ASSOCIATION' || value === 'SHARED');

  const foundation = known(context, 'structure.foundationType');
  const foundationApplies = ['BASEMENT', 'CRAWL_SPACE', 'PIER_AND_BEAM', 'RAISED', 'MIXED'].includes(String(foundation));
  const foundationScopes: SpecialistScope[] = foundationApplies
    ? ['STRUCTURAL', ...(['BASEMENT', 'CRAWL_SPACE', 'MIXED'].includes(String(foundation)) ? ['RADON' as const] : [])]
    : [];

  const hasPoolOrSpa = known(context, 'exterior.hasPoolOrSpa');
  const hasDrainageIssues = known(context, 'exterior.hasDrainageIssues');

  const yearBuilt = Number(known(context, 'core.yearBuilt'));
  const homeAge = Number.isInteger(yearBuilt) ? Math.max(0, new Date().getUTCFullYear() - yearBuilt) : null;
  const ageQuestions = homeAge === null ? [] : homeAge >= 45 ? [
    'Which older electrical, plumbing, heating, insulation, window, roofing, or other major components should be discussed for condition, updates, and remaining service life?',
    'Are any age-related materials or concealed conditions outside a visual inspection and better addressed through records or qualified testing?',
  ] : homeAge >= 20 ? [
    'Which original or older major systems should be discussed for maintenance history, observed condition, and remaining service life?',
    'Which replacements or renovations should be checked against available permits, invoices, or warranties?',
  ] : [
    'Which major systems, builder-installed components, alterations, maintenance records, or warranties should be reviewed for this home?',
  ];

  const systemKeys = [
    'structure.roofType',
    'structure.electricalPanelAgeYears',
    'systems.heatingType',
    'systems.coolingType',
    'systems.waterHeaterType',
    'systems.installedItemTypes',
  ];
  const installedTypes = known(context, 'systems.installedItemTypes');
  const systemScopes: SpecialistScope[] = [
    ...(known(context, 'structure.roofType') ? ['ROOF' as const] : []),
    ...(known(context, 'structure.electricalPanelAgeYears') !== undefined ? ['ELECTRICAL' as const] : []),
    ...(known(context, 'systems.heatingType') || known(context, 'systems.coolingType') ? ['HVAC' as const] : []),
    ...(Array.isArray(installedTypes) && installedTypes.includes('CHIMNEY') ? ['CHIMNEY' as const] : []),
  ];

  const exposureKeys = [
    'location.inHistoricDistrict',
    'location.inHurricaneZone',
    'location.inFloodZone',
    'location.inWildfireZone',
  ];
  const exposureFlags = Object.fromEntries(exposureKeys.map((key) => [key, known(context, key) === true]));
  const hasExposureContext = Object.values(exposureFlags).some(Boolean);
  const exposureQuestions = [
    ...(exposureFlags['location.inFloodZone'] ? ['Ask what flood-zone, drainage, water-entry, elevation, and prior-loss observations are inside the inspection scope.'] : []),
    ...(exposureFlags['location.inHurricaneZone'] ? ['Ask how roof attachment, openings, exterior components, and storm-related records will be reviewed.'] : []),
    ...(exposureFlags['location.inWildfireZone'] ? ['Ask how roof, vents, exterior materials, and defensible-space observations will be documented.'] : []),
    ...(exposureFlags['location.inHistoricDistrict'] ? ['Ask which visible alterations or system updates should be reconciled with historic-district and permit records.'] : []),
  ];

  const modules: BuyerInspectionModuleRecommendation[] = [
    moduleResult(context, {
      moduleKey: 'buyer.inspection.dwelling-responsibility',
      title: 'Dwelling and responsibility boundaries',
      description: 'Separate the unit inspection from association, landlord, shared-system, roof, and exterior responsibilities.',
      whyItMatters: 'A visible condition can still belong to a common element; the plan should preserve both the observation and the responsibility question.',
      specialistScopes: [],
      questions: [
        'Which roof, exterior, structural, utility, and common-area components are excluded from the inspector’s scope?',
        'Which visible concerns require association records or a responsible-party follow-up instead of buyer-owned repair planning?',
      ],
    }, dwellingKeys, sharedEnvelope, 'SHARED_OR_ASSOCIATION_CONTEXT', 'PRIVATE_WHOLE_BUILDING_CONTEXT'),
    moduleResult(context, {
      moduleKey: 'buyer.inspection.foundation-spaces',
      title: 'Foundation and below-grade spaces',
      description: 'Focus access and specialist questions on the confirmed foundation and below-grade configuration.',
      whyItMatters: 'Foundation type changes what can be reached and observed without implying that a defect exists.',
      specialistScopes: foundationScopes,
      questions: [
        'Which foundation, crawl-space, basement, moisture, drainage, and structural observations are accessible and included?',
        'Are any concealed or inaccessible areas important enough to require a specialist or a documented limitation?',
      ],
    }, ['structure.foundationType'], foundationApplies, 'FOUNDATION_SPACE_CONFIRMED', 'FOUNDATION_SPACE_MODULE_NOT_TRIGGERED'),
    moduleResult(context, {
      moduleKey: 'buyer.inspection.pool-spa',
      title: 'Pool and spa systems',
      description: 'Add focused equipment, electrical, barrier, leak, safety, permit, and specialist questions.',
      whyItMatters: 'A confirmed pool or spa adds inspection scope; its presence is not itself a defect.',
      specialistScopes: hasPoolOrSpa === true ? ['POOL_SPA'] : [],
      questions: ['Are the pool or spa structure, circulation equipment, electrical bonding, barriers, leaks, and available permits inside the chosen scope?'],
    }, ['exterior.hasPoolOrSpa'], hasPoolOrSpa === true, 'POOL_SPA_CONFIRMED', 'POOL_SPA_ABSENT'),
    moduleResult(context, {
      moduleKey: 'buyer.inspection.site-drainage',
      title: 'Site drainage and water movement',
      description: 'Carry the reported drainage context into grading, water-entry, downspout, and specialist questions.',
      whyItMatters: 'A self-reported drainage concern should focus observation and evidence collection, not become an unverified diagnosis.',
      specialistScopes: hasDrainageIssues === true ? ['ENVIRONMENTAL'] : [],
      questions: ['Where should grading, drainage paths, downspouts, standing water, and visible water-entry evidence be observed and photographed?'],
    }, ['exterior.hasDrainageIssues'], hasDrainageIssues === true, 'DRAINAGE_CONTEXT_CONFIRMED', 'DRAINAGE_CONTEXT_NOT_REPORTED'),
    moduleResult(context, {
      moduleKey: 'buyer.inspection.home-age',
      title: 'Home age and major systems',
      description: homeAge === null
        ? 'Use the build year to focus questions about major systems, earlier updates, maintenance records, and remaining service life.'
        : `Use the home’s approximate ${homeAge}-year age to focus questions about major systems, earlier updates, maintenance records, and remaining service life.`,
      whyItMatters: 'Build year can help focus inspection questions without predicting a defect or replacing observed condition and professional judgment.',
      specialistScopes: [],
      questions: ageQuestions,
    }, ['core.yearBuilt'], Number.isInteger(yearBuilt), 'BUILD_YEAR_AVAILABLE', 'BUILD_YEAR_NOT_AVAILABLE'),
    moduleResult(context, {
      moduleKey: 'buyer.inspection.confirmed-systems',
      title: 'Confirmed systems and site components',
      description: 'Use known roof, electrical, HVAC, water-heating, and installed-component records to confirm inspection coverage.',
      whyItMatters: 'Known component context reduces generic questions while staying separate from professional condition findings.',
      specialistScopes: [...new Set(systemScopes)],
      questions: ['Which confirmed roof, electrical, HVAC, water-heating, chimney, and installed components are included, limited, or referred to a specialist?'],
    }, systemKeys, systemScopes.length > 0, 'CONFIRMED_SYSTEM_CONTEXT', 'SYSTEM_CONTEXT_NOT_AVAILABLE'),
    moduleResult(context, {
      moduleKey: 'buyer.inspection.exposure-context',
      title: 'Recorded location and exposure context',
      description: 'Translate only recorded flood, hurricane, wildfire, or historic-district context into focused inspection and record questions.',
      whyItMatters: 'Recorded exposure context can focus due diligence, but it is not proof of a property-specific hazard or defect.',
      specialistScopes: hasExposureContext ? ['ENVIRONMENTAL'] : [],
      questions: exposureQuestions,
    }, exposureKeys, hasExposureContext, 'RECORDED_EXPOSURE_CONTEXT', 'NO_RECORDED_EXPOSURE_CONTEXT'),
  ];

  return {
    version: BUYER_INSPECTION_MODULE_VERSION,
    contextVersion: context.contextVersion,
    generatedAt: context.generatedAt,
    modules,
  };
}
