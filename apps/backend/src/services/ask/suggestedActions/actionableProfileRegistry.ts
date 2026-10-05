// DRAFT (not wired). ASK_COZY_EXACT_FOUR_REGISTRY_PACKET: the versioned actionable-profile registry behind the 90% rule (plan C.15.1).
// Static reviewed data plus one pure completeness function; no database, handler or catalog import, so the import-graph guardrail holds
// and the registry cannot drift at boot. A test cross-checks every entry against the Property Context fact, capture and requirement
// catalogs. Weights are PROVISIONAL (packet D1: the fact set and weights are not frozen until the owner re-scores them).
//
// Two concepts stay distinct (owner decision D11):
//  - record foundation: identity/location fields the property needs to function (state, ZIP, city). They stay in the home record and
//    remain available to consumers, but are never counted here; missing identity on a legacy/imported record is a record-integrity
//    correction, not ordinary profile backfill.
//  - actionable completeness: applicable, unresolved information a household could still add or correct through a registered capture.
//
// Deliberately absent: hazard/geography classifications (`inFloodZone`, `inHurricaneZone`, `inWildfireZone`, `isCoastal`,
// `inHistoricDistrict`) are source-backed facts; a wrong household answer could mislead safety guidance, so they wait for an
// authoritative lookup or a governed confirmation path with source/evidence semantics. `city`/`state`/`zipCode`, `timezone`
// (derive), `isPrimary` and `hasFence` have no household-answerable consumer. Sale-prep facts are answered inline on the sale case.

export const ACTIONABLE_PROFILE_REGISTRY_VERSION = 'actionable-profile-1';

export const PROFILE_AREAS = ['CORE', 'LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'SAFETY'] as const;
export type ProfileArea = typeof PROFILE_AREAS[number];

/** Owning audiences (owner decision D12). `ALL` is the base denominator. */
export type ProfileFactAudience = 'ALL' | 'BUYER' | 'SELLER';
export type ProfileAudience = Exclude<ProfileFactAudience, 'ALL'>;

// ---- bounded consumer references ------------------------------------------------------------------------------------------------

/**
 * A consumer reference is one of two authoritative kinds (a test resolves every declared reference):
 *  - `feature:<KEY>`: a Property Context feature requirement (`featureRequirementRegistry`) that requires or enhances the fact;
 *  - `evidence:<ID>`: an entry in `PROFILE_CONSUMER_EVIDENCE` below, for live consumers that read the fact outside that registry.
 * Free-form prose is not allowed.
 */
export type ProfileConsumerRef = `feature:${string}` | `evidence:${string}`;

export interface ProfileConsumerEvidence {
  /** Bounded token; referenced as `evidence:<id>`. */
  id: string;
  /**
   * DECISION: the consumer's output changes eligibility, applicability, risk, a score, an alert or a value estimate.
   * CONTEXT: the fact is passed along as descriptive context or tracked for completeness only.
   */
  impact: 'DECISION' | 'CONTEXT';
  /** Source file relative to `apps/backend/src`. */
  sourceFile: string;
  /** factKey -> tokens (a catalog fact key or the Property column it maps to); the file must contain at least one for each fact. */
  reads: Readonly<Record<string, readonly string[]>>;
}

/** Live consumers outside the requirement registry. Executed behavior proofs: `tests/ask/actionableProfileConsumerEvidence.test.js`. */
export const PROFILE_CONSUMER_EVIDENCE: readonly ProfileConsumerEvidence[] = [
  { id: 'SEASONAL_APPLICABILITY', impact: 'DECISION', sourceFile: 'services/seasonal/applicabilityPolicy.ts', reads: { 'exterior.hasPrivateOutdoorSpace': ['exterior.hasPrivateOutdoorSpace'], 'exterior.outdoorSpaceTypes': ['exterior.outdoorSpaceTypes'], 'exterior.hasLawn': ['exterior.hasLawn'], 'exterior.hasTreesOrShrubs': ['exterior.hasTreesOrShrubs'], 'exterior.hasDriveway': ['exterior.hasDriveway'], 'exterior.hasPoolOrSpa': ['exterior.hasPoolOrSpa'], 'exterior.hasIrrigation': ['exterior.hasIrrigation'], 'exterior.hasOutdoorFaucets': ['exterior.hasOutdoorFaucets'], 'responsibility.treesShrubs': ['responsibility.treesShrubs'], 'responsibility.snowIce': ['responsibility.snowIce'], 'safety.hasSmokeDetectors': ['safety.hasSmokeDetectors'], 'safety.hasCoDetectors': ['safety.hasCoDetectors'] } },
  { id: 'ENERGY_APPLICABILITY', impact: 'DECISION', sourceFile: 'services/energy/applicabilityPolicy.ts', reads: { 'exterior.hasPoolOrSpa': ['exterior.hasPoolOrSpa'] } },
  { id: 'EMERGENCY_APPLICABILITY', impact: 'DECISION', sourceFile: 'services/emergency/applicabilityPolicy.ts', reads: { 'safety.hasFireExtinguisher': ['safety.hasFireExtinguisher'], 'safety.hasSumpPump': ['safety.hasSumpPump'], 'safety.hasSumpPumpBackup': ['safety.hasSumpPumpBackup'] } },
  { id: 'CATALOG_APPLICABILITY', impact: 'DECISION', sourceFile: 'modules/propertyContext/catalog/factCatalog.ts', reads: { 'core.dwellingType': ['core.dwellingType'], 'core.ownershipForm': ['core.ownershipForm'] } },
  { id: 'BUYER_CHECKLIST', impact: 'DECISION', sourceFile: 'services/buyerChecklistComposition.service.ts', reads: { 'core.ownershipForm': ['core.ownershipForm'], 'structure.basementConfiguration': ['structure.basementConfiguration'], 'systems.waterSource': ['systems.waterSource'], 'systems.sewerSystem': ['systems.sewerSystem'], 'systems.hasSolar': ['systems.hasSolar'], 'systems.hasFireplace': ['systems.hasFireplace', 'hasFireplace'], 'exterior.hasPoolOrSpa': ['exterior.hasPoolOrSpa', 'hasPoolOrSpa'] } },
  { id: 'HEALTH_SCORE', impact: 'DECISION', sourceFile: 'utils/propertyScore.util.ts', reads: { 'structure.roofType': ['roofType'], 'structure.roofReplacementYear': ['roofReplacementYear'], 'systems.heatingType': ['heatingType'], 'systems.coolingType': ['coolingType'], 'systems.waterHeaterType': ['waterHeaterType'], 'systems.hvacInstallYear': ['hvacInstallYear'], 'systems.waterHeaterInstallYear': ['waterHeaterInstallYear'], 'safety.hasSecuritySystem': ['hasSecuritySystem'], 'safety.hasFireExtinguisher': ['hasFireExtinguisher'], 'exterior.hasDrainageIssues': ['hasDrainageIssues'] } },
  { id: 'RISK_CALCULATOR', impact: 'DECISION', sourceFile: 'utils/riskCalculator.util.ts', reads: { 'structure.roofReplacementYear': ['roofReplacementYear'], 'structure.foundationType': ['foundationType'], 'structure.electricalPanelAgeYears': ['electricalPanelAge'], 'systems.hvacInstallYear': ['hvacInstallYear'], 'systems.waterHeaterInstallYear': ['waterHeaterInstallYear'], 'exterior.hasDrainageIssues': ['hasDrainageIssues'] } },
  { id: 'RADAR_IMPACT_RULES', impact: 'DECISION', sourceFile: 'modules/homeEventRadar/domain/radarImpactRules.ts', reads: { 'structure.roofReplacementYear': ['roofReplacementYear'], 'structure.foundationType': ['foundationType'], 'systems.coolingType': ['coolingType'], 'systems.hvacInstallYear': ['hvacInstallYear'], 'systems.waterHeaterInstallYear': ['waterHeaterInstallYear'], 'safety.hasSumpPump': ['hasSumpPump'], 'exterior.hasDrainageIssues': ['hasDrainageIssues'] } },
  { id: 'RADAR_COMPOUND_RULES', impact: 'DECISION', sourceFile: 'modules/homeEventRadar/domain/radarCompoundRules.ts', reads: { 'safety.hasSumpPump': ['hasSumpPump'], 'safety.hasSumpPumpBackup': ['hasSumpPumpBackup'] } },
  { id: 'RISK_PREMIUM_OPTIMIZER', impact: 'DECISION', sourceFile: 'services/riskPremiumOptimizer.service.ts', reads: { 'structure.electricalPanelAgeYears': ['electricalPanelAge'], 'safety.hasSecuritySystem': ['hasSecuritySystem'] } },
  { id: 'NEGOTIATION_SHIELD_PREMIUM', impact: 'DECISION', sourceFile: 'services/negotiationShieldInsurancePremium.service.ts', reads: { 'safety.hasSecuritySystem': ['hasSecuritySystem'] } },
  { id: 'HABIT_COACH', impact: 'DECISION', sourceFile: 'services/homeHabitCoach/habitRuleEvaluator.ts', reads: { 'safety.hasFireExtinguisher': ['hasFireExtinguisher'] } },
  { id: 'SALE_PREP_VALUE_CATALOG', impact: 'DECISION', sourceFile: 'data/salePrepValueCatalog.ts', reads: { 'core.bedrooms': ['bedrooms'], 'core.bathrooms': ['bathrooms'] } },
  { id: 'SALE_CASE_MANDATORY', impact: 'DECISION', sourceFile: 'services/propertySaleCase.service.ts', reads: { 'structure.roofReplacementYear': ['roofReplacementYear'], 'systems.hvacInstallYear': ['hvacInstallYear'], 'systems.waterHeaterInstallYear': ['waterHeaterInstallYear'], 'structure.electricalPanelAgeYears': ['electricalPanelAge'] } },
  { id: 'PERSONALIZATION_TRAITS', impact: 'DECISION', sourceFile: 'modules/personalization/domain/traits.ts', reads: { 'structure.roofReplacementYear': ['roofReplacementYear'] } },
  { id: 'SERVICE_PRICE_RADAR', impact: 'CONTEXT', sourceFile: 'services/servicePriceRadar.service.ts', reads: { 'structure.foundationType': ['foundationType'], 'structure.sidingType': ['sidingType'], 'systems.coolingType': ['coolingType'] } },
  { id: 'HOME_DIGITAL_TWIN_QUALITY', impact: 'CONTEXT', sourceFile: 'services/homeDigitalTwinQuality.service.ts', reads: { 'structure.electricalPanelAgeYears': ['electricalPanelAge'], 'systems.coolingType': ['coolingType'], 'systems.hvacInstallYear': ['hvacInstallYear'] } },
  { id: 'HOME_DIGITAL_TWIN_BUILDER', impact: 'CONTEXT', sourceFile: 'services/homeDigitalTwinBuilder.service.ts', reads: { 'structure.sidingType': ['sidingType'] } },
  { id: 'PROPERTY_TAX_APPEAL_READINESS', impact: 'DECISION', sourceFile: 'services/propertyTax/propertyTaxAppealReadiness.service.ts', reads: { 'exterior.lotSizeSqFt': ['lotSizeSqFt'] } },
];

export interface ActionableProfileFact {
  factKey: string;
  area: ProfileArea;
  /**
   * Also the completeness weight. DERIVED and test-verified from the consumers (frozen for `actionable-profile-1`): 3 when `safety` or
   * four or more DECISION consumers; 2 when at least one DECISION consumer; 1 otherwise. A feature consumer is a DECISION consumer when
   * its requirement is REQUIRED_* (not ENHANCEMENT_ACCURACY); an evidence consumer by its declared `impact`.
   */
  materiality: 1 | 2 | 3;
  /** PREREQUISITE facts govern the applicability of consumer-backed facts and still count (packet D1/D2). */
  role: 'INCLUDED' | 'PREREQUISITE';
  audience: ProfileFactAudience;
  /** Bounded consumer references that justify inclusion; every one is resolved against its authoritative source by a test. */
  consumers: readonly ProfileConsumerRef[];
  /** Safety-class fact (smoke/CO detection, extinguisher, sump protection, roof). Always materiality 3. */
  safety?: true;
  /** Registry-level applicability beyond the catalog's `notApplicableWhen`: not applicable once the governing fact is KNOWN and differs. */
  appliesWhen?: { readonly factKey: string; readonly equals: unknown };
}

/**
 * Outdoor-only details are impossible without private outdoor space. Reviewed against the domain definition: `OutdoorSpaceType`
 * enumerates private yard, balcony, patio, deck, garden bed, shared yard and rooftop; `domain/facts.ts` rejects
 * `hasPrivateOutdoorSpace = false` with any space types; the OUTDOOR_SPACE_PROFILE capture already gates landscaping responsibility
 * on it. Driveway/walkway responsibility, pool or spa, and outdoor faucets are deliberately NOT governed here: a home can have them
 * with no yard, patio, deck or balcony, so "no private outdoor space" makes them uncommon, not impossible.
 */
const NEEDS_PRIVATE_OUTDOOR_SPACE = { appliesWhen: { factKey: 'exterior.hasPrivateOutdoorSpace', equals: true } } as const;

const fact = (
  factKey: string, materiality: 1 | 2 | 3, consumers: readonly ProfileConsumerRef[],
  extra: Partial<Pick<ActionableProfileFact, 'role' | 'audience' | 'appliesWhen' | 'safety'>> = {},
): ActionableProfileFact => ({
  factKey, area: factKey.split('.')[0]!.toUpperCase() as ProfileArea, materiality, role: 'INCLUDED', audience: 'ALL', consumers, ...extra,
});

export const ACTIONABLE_PROFILE_FACTS: readonly ActionableProfileFact[] = [
  // CORE
  fact('core.propertyUse', 2, ['feature:BREAK_EVEN', 'feature:BUDGET_PLANNER', 'feature:DO_NOTHING', 'feature:HIDDEN_ASSETS', 'feature:HOME_ACTIONS', 'feature:HOME_SAVINGS', 'feature:OWNERSHIP_COSTS', 'feature:SELLER_PREP', 'feature:SELL_HOLD_RENT', 'feature:TAX_APPEAL']),
  fact('core.dwellingType', 2, ['feature:BREAK_EVEN', 'feature:BUDGET_PLANNER', 'feature:HIDDEN_ASSETS', 'feature:HOME_ACTIONS', 'feature:OWNERSHIP_COSTS', 'feature:PROPERTY_TAX', 'feature:TAX_APPEAL', 'evidence:CATALOG_APPLICABILITY']),
  fact('core.occupancyStatus', 1, ['feature:BREAK_EVEN', 'feature:BUDGET_PLANNER', 'feature:DO_NOTHING', 'feature:HIDDEN_ASSETS', 'feature:HOME_ACTIONS', 'feature:HOME_SAVINGS', 'feature:OWNERSHIP_COSTS', 'feature:SELL_HOLD_RENT', 'feature:TAX_APPEAL']),
  fact('core.propertySizeSqFt', 1, ['feature:PROPERTY_TAX', 'feature:TAX_APPEAL']),
  fact('core.yearBuilt', 1, ['feature:BUDGET_PLANNER']),
  fact('core.ownershipForm', 2, ['evidence:CATALOG_APPLICABILITY', 'evidence:BUYER_CHECKLIST'], { role: 'PREREQUISITE' }),
  fact('core.bedrooms', 2, ['evidence:SALE_PREP_VALUE_CATALOG'], { audience: 'SELLER' }),
  fact('core.bathrooms', 2, ['evidence:SALE_PREP_VALUE_CATALOG'], { audience: 'SELLER' }),
  // STRUCTURE
  fact('structure.roofType', 3, ['feature:PROTECTION', 'evidence:HEALTH_SCORE'], { safety: true }),
  fact('structure.roofReplacementYear', 3, ['evidence:HEALTH_SCORE', 'evidence:RISK_CALCULATOR', 'evidence:RADAR_IMPACT_RULES', 'evidence:SALE_CASE_MANDATORY', 'evidence:PERSONALIZATION_TRAITS']),
  fact('structure.foundationType', 2, ['evidence:RISK_CALCULATOR', 'evidence:RADAR_IMPACT_RULES', 'evidence:SERVICE_PRICE_RADAR']),
  fact('structure.sidingType', 1, ['evidence:SERVICE_PRICE_RADAR', 'evidence:HOME_DIGITAL_TWIN_BUILDER']),
  fact('structure.electricalPanelAgeYears', 2, ['evidence:RISK_CALCULATOR', 'evidence:RISK_PREMIUM_OPTIMIZER', 'evidence:SALE_CASE_MANDATORY', 'evidence:HOME_DIGITAL_TWIN_QUALITY']),
  fact('structure.basementConfiguration', 2, ['evidence:BUYER_CHECKLIST'], { audience: 'BUYER' }),
  // EXTERIOR
  fact('exterior.hasPrivateOutdoorSpace', 2, ['feature:PLANT_ADVISOR', 'evidence:SEASONAL_APPLICABILITY']),
  fact('exterior.outdoorSpaceTypes', 2, ['evidence:SEASONAL_APPLICABILITY'], NEEDS_PRIVATE_OUTDOOR_SPACE),
  fact('exterior.lotSizeSqFt', 2, ['evidence:PROPERTY_TAX_APPEAL_READINESS']),
  fact('exterior.hasLawn', 2, ['feature:MAINTENANCE', 'evidence:SEASONAL_APPLICABILITY'], NEEDS_PRIVATE_OUTDOOR_SPACE),
  fact('exterior.hasTreesOrShrubs', 2, ['feature:MAINTENANCE', 'evidence:SEASONAL_APPLICABILITY'], NEEDS_PRIVATE_OUTDOOR_SPACE),
  fact('exterior.hasDriveway', 2, ['evidence:SEASONAL_APPLICABILITY']),
  fact('exterior.hasPoolOrSpa', 2, ['evidence:SEASONAL_APPLICABILITY', 'evidence:ENERGY_APPLICABILITY', 'evidence:BUYER_CHECKLIST']),
  fact('exterior.hasIrrigation', 2, ['feature:MAINTENANCE', 'feature:PLANT_ADVISOR', 'evidence:SEASONAL_APPLICABILITY'], NEEDS_PRIVATE_OUTDOOR_SPACE),
  fact('exterior.hasOutdoorFaucets', 2, ['evidence:SEASONAL_APPLICABILITY']),
  fact('exterior.hasDrainageIssues', 2, ['evidence:HEALTH_SCORE', 'evidence:RISK_CALCULATOR', 'evidence:RADAR_IMPACT_RULES']),
  // RESPONSIBILITY
  fact('responsibility.roof', 3, ['feature:COVERAGE_INTELLIGENCE', 'feature:HOA_COMPLIANCE', 'feature:MAINTENANCE', 'feature:PERMITS', 'feature:PROJECTS', 'feature:PROTECTION']),
  fact('responsibility.buildingExterior', 3, ['feature:COVERAGE_INTELLIGENCE', 'feature:HOA_COMPLIANCE', 'feature:PERMITS', 'feature:PROJECTS']),
  fact('responsibility.landscaping', 3, ['feature:HOA_COMPLIANCE', 'feature:MAINTENANCE', 'feature:PERMITS', 'feature:PLANT_ADVISOR', 'feature:PROJECTS'], NEEDS_PRIVATE_OUTDOOR_SPACE),
  fact('responsibility.plumbing', 3, ['feature:COVERAGE_INTELLIGENCE', 'feature:MAINTENANCE', 'feature:PERMITS', 'feature:PROJECTS']),
  fact('responsibility.hvac', 3, ['feature:COVERAGE_INTELLIGENCE', 'feature:ENERGY', 'feature:MAINTENANCE', 'feature:PERMITS', 'feature:PROJECTS']),
  fact('responsibility.commonSafety', 3, ['feature:COVERAGE_INTELLIGENCE', 'feature:HOA_COMPLIANCE', 'feature:MAINTENANCE', 'feature:PERMITS']),
  fact('responsibility.sharedSystems', 3, ['feature:COVERAGE_INTELLIGENCE', 'feature:HOA_COMPLIANCE', 'feature:PERMITS', 'feature:PROJECTS']),
  fact('responsibility.deckPatioBalcony', 2, ['feature:HOA_COMPLIANCE', 'feature:PERMITS', 'feature:PROJECTS'], NEEDS_PRIVATE_OUTDOOR_SPACE),
  fact('responsibility.drivewayWalkways', 2, ['feature:HOA_COMPLIANCE']),
  fact('responsibility.pestControl', 2, ['feature:MAINTENANCE']),
  fact('responsibility.treesShrubs', 2, ['evidence:SEASONAL_APPLICABILITY'], NEEDS_PRIVATE_OUTDOOR_SPACE),
  fact('responsibility.snowIce', 2, ['evidence:SEASONAL_APPLICABILITY']),
  // SYSTEMS
  fact('systems.heatingType', 2, ['feature:ENERGY', 'feature:MAINTENANCE', 'evidence:HEALTH_SCORE']),
  fact('systems.coolingType', 2, ['evidence:HEALTH_SCORE', 'evidence:RADAR_IMPACT_RULES', 'evidence:SERVICE_PRICE_RADAR', 'evidence:HOME_DIGITAL_TWIN_QUALITY']),
  fact('systems.waterHeaterType', 2, ['feature:MAINTENANCE', 'evidence:HEALTH_SCORE']),
  fact('systems.hvacInstallYear', 3, ['evidence:HEALTH_SCORE', 'evidence:RISK_CALCULATOR', 'evidence:RADAR_IMPACT_RULES', 'evidence:SALE_CASE_MANDATORY', 'evidence:HOME_DIGITAL_TWIN_QUALITY']),
  fact('systems.waterHeaterInstallYear', 3, ['evidence:HEALTH_SCORE', 'evidence:RISK_CALCULATOR', 'evidence:RADAR_IMPACT_RULES', 'evidence:SALE_CASE_MANDATORY']),
  fact('systems.waterSource', 2, ['evidence:BUYER_CHECKLIST'], { audience: 'BUYER' }),
  fact('systems.sewerSystem', 2, ['evidence:BUYER_CHECKLIST'], { audience: 'BUYER' }),
  fact('systems.hasSolar', 2, ['evidence:BUYER_CHECKLIST'], { audience: 'BUYER' }),
  fact('systems.hasFireplace', 2, ['evidence:BUYER_CHECKLIST'], { audience: 'BUYER' }),
  // SAFETY
  fact('safety.hasSmokeDetectors', 3, ['feature:MAINTENANCE', 'feature:PERSONALIZATION', 'evidence:SEASONAL_APPLICABILITY'], { safety: true }),
  fact('safety.hasCoDetectors', 3, ['feature:MAINTENANCE', 'evidence:SEASONAL_APPLICABILITY'], { safety: true }),
  fact('safety.hasFireExtinguisher', 3, ['evidence:EMERGENCY_APPLICABILITY', 'evidence:HEALTH_SCORE', 'evidence:HABIT_COACH'], { safety: true }),
  fact('safety.hasSumpPump', 3, ['evidence:EMERGENCY_APPLICABILITY', 'evidence:RADAR_IMPACT_RULES', 'evidence:RADAR_COMPOUND_RULES'], { safety: true }),
  fact('safety.hasSumpPumpBackup', 3, ['evidence:EMERGENCY_APPLICABILITY', 'evidence:RADAR_COMPOUND_RULES'], { safety: true, appliesWhen: { factKey: 'safety.hasSumpPump', equals: true } }),
  fact('safety.hasSecuritySystem', 2, ['evidence:HEALTH_SCORE', 'evidence:RISK_PREMIUM_OPTIMIZER', 'evidence:NEGOTIATION_SHIELD_PREMIUM']),
];

// ---- server-owned area mapping (owner decision D3): outcomeKey -> area scope -> permitted fact keys ------------------------------

/** One bounded outcome per area. The client never supplies a scope or a fact list; message text is display-only. */
export const PROFILE_AREA_OUTCOMES: Readonly<Record<ProfileArea, string>> = {
  CORE: 'CAPTURE_CORE_DETAILS', LOCATION: 'CAPTURE_LOCATION_DETAILS', STRUCTURE: 'CAPTURE_STRUCTURE_DETAILS',
  EXTERIOR: 'CAPTURE_EXTERIOR_DETAILS', RESPONSIBILITY: 'CAPTURE_RESPONSIBILITY_DETAILS', SYSTEMS: 'CAPTURE_SYSTEMS_DETAILS',
  SAFETY: 'CAPTURE_SAFETY_DETAILS',
};

export function profileAreaForOutcome(outcomeKey: string): ProfileArea | null {
  return PROFILE_AREAS.find((area) => PROFILE_AREA_OUTCOMES[area] === outcomeKey) ?? null;
}

/** The fact allowlist a launch for this outcome may ask about (every audience; callers narrow by active audiences). */
export function permittedFactKeysForOutcome(outcomeKey: string): readonly string[] {
  const area = profileAreaForOutcome(outcomeKey);
  return area ? ACTIONABLE_PROFILE_FACTS.filter((entry) => entry.area === area).map((entry) => entry.factKey) : [];
}

// ---- audience-aware denominator (owner decision D12) ----------------------------------------------------------------------------

export interface ProfileDenominator {
  registryVersion: string;
  /** Sorted active audiences; empty means the base denominator only. */
  audiences: ProfileAudience[];
  /** e.g. `actionable-profile-1:BASE` or `actionable-profile-1:BUYER+SELLER`, so a changed score is explainable and testable. */
  denominatorVersion: string;
}

/**
 * `activeAudiences` must come from governed workflow state: an active buyer workflow/checklist or an explicitly recorded active buyer
 * goal (BUYER); an active sale case or an explicitly recorded active selling goal (SELLER). It is never inferred from property
 * type, generic homeowner status or speculative intent. Both active apply the union; neither excludes every conditional fact.
 */
export function resolveProfileDenominator(activeAudiences: Iterable<ProfileAudience>): ProfileDenominator {
  const audiences = [...new Set(activeAudiences)].sort();
  return {
    registryVersion: ACTIONABLE_PROFILE_REGISTRY_VERSION, audiences,
    denominatorVersion: `${ACTIONABLE_PROFILE_REGISTRY_VERSION}:${audiences.length ? audiences.join('+') : 'BASE'}`,
  };
}

// ---- completeness ----------------------------------------------------------------------------------------------------------------

export interface ProfileFactObservation { state: 'KNOWN' | 'UNKNOWN' | 'CONFLICTED' | 'STALE'; value?: unknown }

export interface UnresolvedProfileFact {
  factKey: string; area: ProfileArea; materiality: 1 | 2 | 3; state: ProfileFactObservation['state'] | 'MISSING';
  /**
   * Set when this fact's governing fact is itself unresolved. It stays applicable (it counts in the denominator), but the area flow
   * asks the governor first and does not ask this fact in the same interaction until the governor is answered.
   */
  blockedBy?: string;
}

export interface ActionableCompleteness extends ProfileDenominator {
  /** Known weight over applicable weight, in [0, 1]. */
  fraction: number;
  knownWeight: number;
  totalWeight: number;
  unresolved: UnresolvedProfileFact[];
  /** Per area: the unresolved applicable, allowlisted facts that a chip's count may include. */
  unresolvedByArea: Partial<Record<ProfileArea, {
    /** Applicable, allowlisted, unresolved facts (the chip count). */
    count: number; maxMateriality: 1 | 2 | 3; factKeys: string[];
    /**
     * The server-owned allowlist for a launch from this area: unresolved facts whose governor is not itself unresolved. A chip is
     * offered only when this is non-empty (a dependent blocked by a governor in another area waits for that area's flow).
     */
    askNowFactKeys: string[];
  }>>;
}

export interface ActionableCompletenessInput {
  facts: Readonly<Record<string, ProfileFactObservation | undefined>>;
  activeAudiences: Iterable<ProfileAudience>;
  /** The catalog's `notApplicableWhen` evaluation (`isFactApplicable`); the registry cannot import the catalog. Defaults to applicable. */
  isCatalogApplicable?: (factKey: string) => boolean;
}

function appliesByRegistry(entry: ActionableProfileFact, facts: ActionableCompletenessInput['facts']): boolean {
  if (!entry.appliesWhen) return true;
  const governing = facts[entry.appliesWhen.factKey];
  // Same rule as the catalog: a governing fact that is not yet known never disqualifies.
  if (!governing || governing.state !== 'KNOWN' || governing.value === null || governing.value === undefined) return true;
  return governing.value === entry.appliesWhen.equals;
}

/** Pure. Deterministic for the same facts, audiences and applicability callback. STALE, CONFLICTED and UNKNOWN all count as unresolved. */
export function computeActionableCompleteness(input: ActionableCompletenessInput): ActionableCompleteness {
  const denominator = resolveProfileDenominator(input.activeAudiences);
  const active = new Set<ProfileFactAudience>(['ALL', ...denominator.audiences]);
  let knownWeight = 0;
  let totalWeight = 0;
  const unresolved: UnresolvedProfileFact[] = [];
  for (const entry of ACTIONABLE_PROFILE_FACTS) {
    if (!active.has(entry.audience)) continue;
    if (input.isCatalogApplicable && !input.isCatalogApplicable(entry.factKey)) continue;
    if (!appliesByRegistry(entry, input.facts)) continue;
    totalWeight += entry.materiality;
    const observed = input.facts[entry.factKey];
    if (observed?.state === 'KNOWN') { knownWeight += entry.materiality; continue; }
    const governor = entry.appliesWhen ? input.facts[entry.appliesWhen.factKey] : undefined;
    const blocked = entry.appliesWhen && governor?.state !== 'KNOWN' ? { blockedBy: entry.appliesWhen.factKey } : {};
    unresolved.push({ factKey: entry.factKey, area: entry.area, materiality: entry.materiality, state: observed?.state ?? 'MISSING', ...blocked });
  }
  const unresolvedByArea: ActionableCompleteness['unresolvedByArea'] = {};
  for (const item of unresolved) {
    const bucket = unresolvedByArea[item.area] ?? (unresolvedByArea[item.area] = { count: 0, maxMateriality: 1, factKeys: [], askNowFactKeys: [] });
    bucket.count += 1;
    bucket.maxMateriality = Math.max(bucket.maxMateriality, item.materiality) as 1 | 2 | 3;
    bucket.factKeys.push(item.factKey);
    if (!item.blockedBy) bucket.askNowFactKeys.push(item.factKey);
  }
  return { ...denominator, fraction: totalWeight === 0 ? 1 : knownWeight / totalWeight, knownWeight, totalWeight, unresolved, unresolvedByArea };
}
