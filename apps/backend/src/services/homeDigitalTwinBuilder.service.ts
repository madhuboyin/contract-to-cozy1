/**
 * HomeDigitalTwinBuilderService
 *
 * Derives HomeTwinComponent + HomeTwinProjectedFact records from existing
 * CtC property data: property profile fields, inventory items, and risk
 * reports.
 *
 * Every component has a stable identityKey (see ComponentSpec) so a rebuild
 * can tell "the same real system" apart from "a different one of the same
 * type" — this is what lets multiple real systems of one type (e.g. two
 * HVAC zones) exist as distinct rows instead of collapsing into one, and
 * lets a component whose backing source disappeared be retired instead of
 * silently left stale.
 *
 * Every derived value also gets a HomeTwinProjectedFact row carrying its own
 * source and HomeTwinFactState classification (VERIFIED / REPORTED /
 * DOCUMENT_DERIVED / INFERRED / DEFAULT / CONFLICTED / UNKNOWN). Field
 * population must never imply REPORTED or VERIFIED — see resolveInstallYear,
 * which is the single place that decision is made for install-year-derived
 * fields, precisely because getting this wrong here previously let an
 * inferred date render as "known" (HOME_DIGITAL_TWIN_CAPABILITY_AUDIT_AND_
 * IMPLEMENTATION_PLAN.md HDT-001).
 *
 * Build operations are idempotent and transactional: existing derived
 * components are updated in place from their canonical sources; a mid-run
 * failure rolls back rather than leaving a partially-updated projection
 * (see HomeDigitalTwinService, which relies on this to preserve the last
 * good projection). A projection-owned confirmation flag must never freeze
 * canonical updates.
 */

import {
  HomeTwinComponentType,
  HomeTwinComponentStatus,
  HomeTwinSourceType,
  HomeTwinFactState,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getDisabledComponentTypes } from '../config/homeDigitalTwinOperationalControls';

type TxClient = Prisma.TransactionClient | PrismaClient;

// ============================================================================
// COMPONENT DEFAULTS
// ============================================================================

type ComponentDefaults = {
  usefulLifeYears: number;
  replacementCost: number; // USD
  annualOperatingCost: number; // USD
  annualMaintenanceCost: number; // USD
};

const COMPONENT_DEFAULTS: Record<HomeTwinComponentType, ComponentDefaults> = {
  HVAC:         { usefulLifeYears: 15, replacementCost: 9500,  annualOperatingCost: 1800, annualMaintenanceCost: 500  },
  WATER_HEATER: { usefulLifeYears: 12, replacementCost: 1200,  annualOperatingCost: 350,  annualMaintenanceCost: 100  },
  ROOF:         { usefulLifeYears: 25, replacementCost: 12000, annualOperatingCost: 300,  annualMaintenanceCost: 200  },
  PLUMBING:     { usefulLifeYears: 40, replacementCost: 8000,  annualOperatingCost: 400,  annualMaintenanceCost: 200  },
  ELECTRICAL:   { usefulLifeYears: 40, replacementCost: 5000,  annualOperatingCost: 200,  annualMaintenanceCost: 150  },
  INSULATION:   { usefulLifeYears: 40, replacementCost: 3500,  annualOperatingCost: 0,    annualMaintenanceCost: 0    },
  WINDOWS:      { usefulLifeYears: 25, replacementCost: 8000,  annualOperatingCost: 200,  annualMaintenanceCost: 100  },
  SOLAR:        { usefulLifeYears: 25, replacementCost: 18000, annualOperatingCost: 200,  annualMaintenanceCost: 300  },
  APPLIANCE:    { usefulLifeYears: 12, replacementCost: 1500,  annualOperatingCost: 200,  annualMaintenanceCost: 100  },
  FLOORING:     { usefulLifeYears: 25, replacementCost: 6000,  annualOperatingCost: 0,    annualMaintenanceCost: 200  },
  EXTERIOR:     { usefulLifeYears: 20, replacementCost: 12000, annualOperatingCost: 500,  annualMaintenanceCost: 300  },
  FOUNDATION:   { usefulLifeYears: 50, replacementCost: 15000, annualOperatingCost: 0,    annualMaintenanceCost: 300  },
  OTHER:        { usefulLifeYears: 15, replacementCost: 3000,  annualOperatingCost: 200,  annualMaintenanceCost: 100  },
};

// ============================================================================
// HELPERS
// ============================================================================

function currentYear(): number {
  return new Date().getFullYear();
}

/**
 * Scale HVAC replacement cost based on home square footage.
 * Base reference: $9,500 for a 1,500 sqft home.
 */
function scaledHvacCost(sqft: number | null): number {
  const base = COMPONENT_DEFAULTS.HVAC.replacementCost;
  if (!sqft || sqft <= 0) return base;
  const scaled = Math.round((sqft / 1500) * base);
  return Math.min(Math.max(scaled, 7000), 22000);
}

/**
 * Scale roof replacement cost by sqft and material type.
 * Uses per-sqft rates: metal ~$11, tile ~$9, default (asphalt) ~$7.
 */
function scaledRoofCost(sqft: number | null, roofType: string | null): number {
  const type = (roofType ?? '').toUpperCase().replace(/[-_ ]/g, '');
  const perSqFt = type.includes('METAL') ? 11 : type.includes('TILE') ? 9 : 7;
  const area = sqft && sqft > 0 ? sqft : 1700; // median US home floor area proxy
  return Math.min(Math.max(Math.round(area * perSqFt), 6000), 35000);
}

/**
 * Return useful life and replacement cost tuned to water heater technology.
 * Tankless and heat-pump units last longer and cost more upfront.
 */
function waterHeaterConfig(whType: string | null): {
  usefulLifeYears: number;
  replacementCost: number;
} {
  const type = (whType ?? '').toUpperCase().replace(/[-_ ]/g, '');
  if (type === 'TANKLESS') return { usefulLifeYears: 20, replacementCost: 2400 };
  if (type === 'HEATPUMP') return { usefulLifeYears: 15, replacementCost: 1900 };
  return { usefulLifeYears: 12, replacementCost: 1200 }; // TANK default
}

function ageFromInstallYear(installYear: number | null | undefined): number | null {
  if (!installYear) return null;
  return Math.max(0, currentYear() - installYear);
}

function ageFromDate(date: Date | null | undefined): number | null {
  if (!date) return null;
  const ms = Date.now() - new Date(date).getTime();
  return Math.max(0, ms / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * Condition score 0–1 derived from age-to-useful-life ratio.
 * Higher = better condition.
 */
function conditionFromAgeRatio(ageYears: number, usefulLifeYears: number): number {
  const ratio = ageYears / usefulLifeYears;
  if (ratio <= 0.20) return 0.95;
  if (ratio <= 0.40) return 0.80;
  if (ratio <= 0.60) return 0.65;
  if (ratio <= 0.80) return 0.45;
  if (ratio <= 1.00) return 0.30;
  return 0.15; // past useful life
}

/**
 * Simple confidence score based on how many known data points we have
 * relative to the max possible.
 */
function deriveConfidence(knownPoints: number, maxPoints: number): number {
  const ratio = maxPoints > 0 ? knownPoints / maxPoints : 0;
  if (ratio >= 0.80) return 0.85;
  if (ratio >= 0.50) return 0.65;
  if (ratio >= 0.20) return 0.40;
  return 0.20;
}

function toDecimal(v: number | null | undefined): Prisma.Decimal | null {
  if (v == null) return null;
  return new Prisma.Decimal(v);
}

// ============================================================================
// PROJECTED FACT SPEC (internal transfer object)
// ============================================================================

type ProjectedFactSpec = {
  fieldName: string;
  valueNumeric?: number | null;
  valueText?: string | null;
  unit?: string | null;
  factState: HomeTwinFactState;
  sourceType: HomeTwinSourceType;
  sourceRecordType?: string | null;
  sourceRecordId?: string | null;
  sourceField?: string | null;
  observedAt?: Date | null;
  derivationMethod?: string | null;
  modelVersion?: string;
  sourceVerified?: boolean | null;
  confidenceScore?: number | null;
  conflictGroupId?: string | null;
  correctionDestination?: string | null;
};

type ProjectedFactSnapshotInput = Pick<
  ProjectedFactSpec,
  | 'valueNumeric'
  | 'valueText'
  | 'unit'
  | 'factState'
  | 'sourceType'
  | 'sourceRecordType'
  | 'sourceRecordId'
  | 'sourceField'
  | 'observedAt'
  | 'derivationMethod'
  | 'modelVersion'
  | 'sourceVerified'
  | 'confidenceScore'
  | 'conflictGroupId'
  | 'correctionDestination'
>;

function projectedFactSnapshot(fact: ProjectedFactSnapshotInput) {
  return {
    valueNumeric: fact.valueNumeric ?? null,
    valueText: fact.valueText ?? null,
    unit: fact.unit ?? null,
    factState: fact.factState,
    sourceType: fact.sourceType,
    sourceRecordType: fact.sourceRecordType ?? null,
    sourceRecordId: fact.sourceRecordId ?? null,
    sourceField: fact.sourceField ?? null,
    observedAt: fact.observedAt?.toISOString() ?? null,
    derivationMethod: fact.derivationMethod ?? null,
    modelVersion: fact.modelVersion ?? PROJECTION_MODEL_VERSION,
    sourceVerified: fact.sourceVerified ?? null,
    confidenceScore: fact.confidenceScore ?? null,
    conflictGroupId: fact.conflictGroupId ?? null,
    correctionDestination: fact.correctionDestination ?? null,
  };
}

/** A conflicted fact always needs homeowner review, regardless of source type. */
function statusFromResolution(resolved: { isKnownSource: boolean; fact: ProjectedFactSpec }): HomeTwinComponentStatus {
  if (resolved.fact.factState === 'CONFLICTED') return 'NEEDS_REVIEW';
  return resolved.isKnownSource ? 'KNOWN' : 'ESTIMATED';
}

/**
 * The single place that decides whether an install year is REPORTED
 * (homeowner self-report or a dated inventory record) or INFERRED /
 * DEFAULT (a system assumption). Every component type that derives age
 * from an install year must route through this so the KNOWN-vs-ESTIMATED
 * distinction (and the underlying fact state) can never drift out of sync
 * with where the value actually came from.
 */
function resolveInstallYear(params: {
  reportedYear: number | null;
  reportedSourceField: string;
  inventoryItem: { id: string; installedOn: Date | null; purchasedOn: Date | null } | undefined;
  inferredYear: number | null;
  inferredMethod: string;
  inferredNote: string;
  yr: number;
}): {
  installYear: number | null;
  sourceType: HomeTwinSourceType;
  sourceReferenceId: string | null;
  isKnownSource: boolean;
  dataSourceNote: string;
  fact: ProjectedFactSpec;
} {
  const invDate = params.inventoryItem?.installedOn ?? params.inventoryItem?.purchasedOn ?? null;
  const invAge = ageFromDate(invDate);
  const inventoryYear = invAge != null ? params.yr - Math.floor(invAge) : null;

  // Two independent signals for the same real-world date that disagree by
  // more than a year is a conflict, not a priority order to silently
  // resolve — the homeowner needs to reconcile it at the source, not have
  // one value quietly win.
  if (params.reportedYear && inventoryYear != null && Math.abs(params.reportedYear - inventoryYear) > 1) {
    const conflictGroupId = `${params.reportedSourceField}:installYear`;
    return {
      installYear: params.reportedYear,
      sourceType: 'PROPERTY_PROFILE',
      sourceReferenceId: params.inventoryItem!.id,
      isKnownSource: false,
      dataSourceNote:
        `Property profile (${params.reportedYear}) and inventory record (${inventoryYear}) disagree on install year`,
      fact: {
        fieldName: 'installYear',
        valueNumeric: params.reportedYear,
        factState: 'CONFLICTED',
        sourceType: 'PROPERTY_PROFILE',
        sourceRecordType: 'Property',
        sourceRecordId: params.inventoryItem!.id,
        sourceField: params.reportedSourceField,
        derivationMethod: 'conflict_property_vs_inventory',
        confidenceScore: 0.2,
        conflictGroupId,
      },
    };
  }

  if (params.reportedYear) {
    return {
      installYear: params.reportedYear,
      sourceType: 'PROPERTY_PROFILE',
      sourceReferenceId: null,
      isKnownSource: true,
      dataSourceNote: 'Install year from property profile',
      fact: {
        fieldName: 'installYear',
        valueNumeric: params.reportedYear,
        factState: 'REPORTED',
        sourceType: 'PROPERTY_PROFILE',
        sourceRecordType: 'Property',
        sourceField: params.reportedSourceField,
        derivationMethod: 'direct',
        confidenceScore: 0.7,
      },
    };
  }

  if (params.inventoryItem && invDate) {
    return {
      installYear: inventoryYear,
      sourceType: 'INVENTORY',
      sourceReferenceId: params.inventoryItem.id,
      isKnownSource: inventoryYear != null,
      dataSourceNote: 'Age derived from inventory item date',
      fact: {
        fieldName: 'installYear',
        valueNumeric: inventoryYear,
        factState: inventoryYear != null ? 'REPORTED' : 'UNKNOWN',
        sourceType: 'INVENTORY',
        sourceRecordType: 'InventoryItem',
        sourceRecordId: params.inventoryItem.id,
        sourceField: params.inventoryItem.installedOn ? 'installedOn' : 'purchasedOn',
        observedAt: invDate,
        derivationMethod: 'inventory_item_date',
        confidenceScore: 0.65,
      },
    };
  }

  if (params.inferredYear) {
    return {
      installYear: params.inferredYear,
      sourceType: 'SYSTEM_DERIVED',
      sourceReferenceId: null,
      isKnownSource: false,
      dataSourceNote: params.inferredNote,
      fact: {
        fieldName: 'installYear',
        valueNumeric: params.inferredYear,
        factState: 'INFERRED',
        sourceType: 'SYSTEM_DERIVED',
        sourceRecordType: 'Property',
        sourceField: 'yearBuilt',
        derivationMethod: params.inferredMethod,
        confidenceScore: 0.3,
      },
    };
  }

  return {
    installYear: null,
    sourceType: 'SYSTEM_DERIVED',
    sourceReferenceId: null,
    isKnownSource: false,
    dataSourceNote: 'No install date available — using category defaults',
    fact: {
      fieldName: 'installYear',
      valueNumeric: null,
      factState: 'DEFAULT',
      sourceType: 'SYSTEM_DERIVED',
      derivationMethod: 'category_default',
      confidenceScore: 0.1,
    },
  };
}

function replacementCostFact(params: {
  reportedCents: number | null | undefined;
  inventoryItemId?: string | null;
  scaledValue: number;
  scaledMethod: string;
}): { value: number; fact: ProjectedFactSpec } {
  if (params.reportedCents) {
    const value = params.reportedCents / 100;
    return {
      value,
      fact: {
        fieldName: 'replacementCostEstimate',
        valueNumeric: value,
        unit: 'USD',
        factState: 'REPORTED',
        sourceType: 'INVENTORY',
        sourceRecordType: 'InventoryItem',
        sourceRecordId: params.inventoryItemId ?? null,
        sourceField: 'replacementCostCents',
        derivationMethod: 'direct',
        confidenceScore: 0.75,
      },
    };
  }
  return {
    value: params.scaledValue,
    fact: {
      fieldName: 'replacementCostEstimate',
      valueNumeric: params.scaledValue,
      unit: 'USD',
      factState: 'DEFAULT',
      sourceType: 'SYSTEM_DERIVED',
      derivationMethod: params.scaledMethod,
      confidenceScore: 0.35,
    },
  };
}

// Component types whose install-year-relevant fields have a dedicated
// section in the property edit form (the "structure" subsection of
// "Critical systems" — see edit/page.tsx). Other types either have no
// dedicated field yet (ELECTRICAL, PLUMBING, FOUNDATION) or live elsewhere
// (EXTERIOR — "exterior" section).
const STRUCTURE_SECTION_TYPES = new Set<HomeTwinComponentType>(['HVAC', 'WATER_HEATER', 'ROOF']);
const INVENTORY_CORRECTION_CATEGORY: Partial<Record<HomeTwinComponentType, string>> = {
  HVAC: 'HVAC',
  WATER_HEATER: 'PLUMBING',
  ROOF: 'ROOF_EXTERIOR',
  ELECTRICAL: 'ELECTRICAL',
  PLUMBING: 'PLUMBING',
  FOUNDATION: 'STRUCTURAL',
  INSULATION: 'STRUCTURAL',
  WINDOWS: 'STRUCTURAL',
  SOLAR: 'ELECTRICAL',
  FLOORING: 'INTERIOR',
  APPLIANCE: 'APPLIANCE',
  OTHER: 'OTHER',
};

/**
 * Where a homeowner would go to correct this fact at its canonical source.
 * Per the Slice 2 scope decision, this must point at an existing surface —
 * property edit, a specific inventory item, or the inventory list — never a
 * new correction UI. Returns null when no such surface exists yet (e.g.
 * ELECTRICAL/PLUMBING/FOUNDATION install dates have no dedicated edit
 * field) rather than link to something that won't actually help.
 */
function correctionDestinationFor(
  componentType: HomeTwinComponentType,
  fact: ProjectedFactSpec,
  propertyId: string,
): string | null {
  if (fact.sourceType === 'INVENTORY' && fact.sourceRecordId) {
    return `/dashboard/properties/${propertyId}/inventory/items/${fact.sourceRecordId}`;
  }
  if (fact.fieldName === 'replacementCostEstimate' && fact.factState === 'DEFAULT') {
    const category = INVENTORY_CORRECTION_CATEGORY[componentType] ?? 'OTHER';
    return `/dashboard/properties/${propertyId}/inventory?action=add-item&category=${encodeURIComponent(category)}&from=home-digital-twin`;
  }
  if (STRUCTURE_SECTION_TYPES.has(componentType)) {
    return `/dashboard/properties/${propertyId}/edit#structure`;
  }
  if (componentType === 'EXTERIOR') {
    return `/dashboard/properties/${propertyId}/edit#exterior`;
  }
  // When the property profile has no field for this system, open the
  // canonical inventory add form with the correct system category selected.
  // This is a specific, authorized write destination rather than a generic
  // edit page that cannot change the flagged fact.
  const category = INVENTORY_CORRECTION_CATEGORY[componentType] ?? 'OTHER';
  return `/dashboard/properties/${propertyId}/inventory?action=add-item&category=${encodeURIComponent(category)}&from=home-digital-twin`;
}

// ============================================================================
// COMPONENT SPEC (internal transfer object)
// ============================================================================

type ComponentSpec = {
  identityKey: string;
  componentType: HomeTwinComponentType;
  label: string;
  status: HomeTwinComponentStatus;
  sourceType: HomeTwinSourceType;
  sourceReferenceId: string | null;
  installYear: number | null;
  estimatedAgeYears: number | null;
  usefulLifeYears: number;
  conditionScore: number | null;
  failureRiskScore: number | null;
  replacementCostEstimate: number | null;
  annualOperatingCostEstimate: number | null;
  annualMaintenanceCostEstimate: number | null;
  confidenceScore: number;
  metadata: Record<string, unknown> | null;
  facts: ProjectedFactSpec[];
};

const PROJECTION_MODEL_VERSION = 'home-projection-v2';

/**
 * Every value exposed on a projected component must have field-level lineage.
 * Component builders provide the most specific canonical facts; this fills in
 * the derived/default planning fields so downstream consumers never receive a
 * value that has no source classification or derivation contract.
 */
function ensureCompleteFactLineage(spec: ComponentSpec): void {
  const existing = new Set(spec.facts.map((fact) => fact.fieldName));
  const installFact = spec.facts.find((fact) => fact.fieldName === 'installYear');
  const derivedState: HomeTwinFactState =
    installFact?.factState === 'CONFLICTED'
      ? 'CONFLICTED'
      : spec.estimatedAgeYears == null
        ? 'UNKNOWN'
        : 'INFERRED';

  const add = (fact: ProjectedFactSpec) => {
    if (!existing.has(fact.fieldName)) {
      spec.facts.push({ modelVersion: PROJECTION_MODEL_VERSION, ...fact });
      existing.add(fact.fieldName);
    }
  };

  add({
    fieldName: 'estimatedAgeYears',
    valueNumeric: spec.estimatedAgeYears,
    unit: 'YEARS',
    factState: derivedState,
    sourceType: installFact?.sourceType ?? 'SYSTEM_DERIVED',
    sourceRecordType: installFact?.sourceRecordType,
    sourceRecordId: installFact?.sourceRecordId,
    sourceField: installFact?.fieldName,
    observedAt: installFact?.observedAt,
    derivationMethod: 'current_year_minus_install_year',
    sourceVerified: installFact?.sourceVerified ?? false,
    confidenceScore: installFact?.confidenceScore ?? 0.1,
  });
  add({
    fieldName: 'usefulLifeYears',
    valueNumeric: spec.usefulLifeYears,
    unit: 'YEARS',
    factState: 'DEFAULT',
    sourceType: 'SYSTEM_DERIVED',
    derivationMethod: `category_service_life_default:${spec.componentType}`,
    sourceVerified: false,
    confidenceScore: 0.35,
  });
  add({
    fieldName: 'conditionScore',
    valueNumeric: spec.conditionScore,
    unit: 'RATIO',
    factState: spec.conditionScore == null ? 'UNKNOWN' : derivedState,
    sourceType: 'SYSTEM_DERIVED',
    sourceRecordType: installFact?.sourceRecordType,
    sourceRecordId: installFact?.sourceRecordId,
    sourceField: 'estimatedAgeYears,usefulLifeYears',
    observedAt: installFact?.observedAt,
    derivationMethod: 'age_service_life_planning_bucket_not_physical_condition',
    sourceVerified: false,
    confidenceScore: Math.min(installFact?.confidenceScore ?? 0.1, 0.4),
  });
  add({
    fieldName: 'replacementCostEstimate',
    valueNumeric: spec.replacementCostEstimate,
    unit: 'USD',
    factState: 'DEFAULT',
    sourceType: 'SYSTEM_DERIVED',
    derivationMethod: `category_replacement_cost_default:${spec.componentType}`,
    sourceVerified: false,
    confidenceScore: 0.25,
  });
  add({
    fieldName: 'annualOperatingCostEstimate',
    valueNumeric: spec.annualOperatingCostEstimate,
    unit: 'USD_PER_YEAR',
    factState: 'DEFAULT',
    sourceType: 'SYSTEM_DERIVED',
    derivationMethod: `category_operating_cost_default:${spec.componentType}`,
    sourceVerified: false,
    confidenceScore: 0.25,
  });
  add({
    fieldName: 'annualMaintenanceCostEstimate',
    valueNumeric: spec.annualMaintenanceCostEstimate,
    unit: 'USD_PER_YEAR',
    factState: 'DEFAULT',
    sourceType: 'SYSTEM_DERIVED',
    derivationMethod: `category_maintenance_cost_default:${spec.componentType}`,
    sourceVerified: false,
    confidenceScore: 0.25,
  });
  add({
    fieldName: 'confidenceScore',
    valueNumeric: spec.confidenceScore,
    unit: 'RATIO',
    factState: 'INFERRED',
    sourceType: 'SYSTEM_DERIVED',
    derivationMethod: 'known_points_ratio_v1',
    sourceVerified: false,
    confidenceScore: 0.5,
  });
}

type PropertyRow = {
  yearBuilt: number | null;
  propertySize: number | null;
  hvacInstallYear: number | null;
  waterHeaterInstallYear: number | null;
  roofReplacementYear: number | null;
  electricalPanelAge: number | null;
  heatingType: string | null;
  coolingType: string | null;
  waterHeaterType: string | null;
  roofType: string | null;
  foundationType: string | null;
  sidingType: string | null;
  primaryHeatingFuel: string | null;
  hasSumpPumpBackup: boolean | null;
  updatedAt: Date;
};

type InventoryItemRow = {
  id: string;
  name: string;
  category: string;
  condition: string;
  installedOn: Date | null;
  purchasedOn: Date | null;
  replacementCostCents: number | null;
  brand: string | null;
  model: string | null;
  updatedAt: Date;
};

type RiskReportRow = { riskScore: number; details: unknown; lastCalculatedAt: Date } | null;

// ============================================================================
// SERVICE
// ============================================================================

export class HomeDigitalTwinBuilderService {
  /**
   * Derive component + fact specs from all available CtC data for the
   * property, then reconcile them into HomeTwinComponent /
   * HomeTwinProjectedFact records inside one transaction. Components whose
   * identityKey is no longer present (source deleted) are retired rather
   * than silently left stale.
   *
   * Returns a dependency fingerprint the caller can persist for staleness
   * detection.
   */
  async buildComponents(
    propertyId: string,
    digitalTwinId: string,
  ): Promise<{ dependencyFingerprint: string }> {
    const [property, inventoryItems, riskReport] = await Promise.all([
      prisma.property.findUniqueOrThrow({
        where: { id: propertyId },
        select: {
          yearBuilt: true,
          propertySize: true,
          hvacInstallYear: true,
          waterHeaterInstallYear: true,
          roofReplacementYear: true,
          electricalPanelAge: true,
          heatingType: true,
          coolingType: true,
          waterHeaterType: true,
          roofType: true,
          foundationType: true,
          sidingType: true,
          primaryHeatingFuel: true,
          hasSumpPumpBackup: true,
          updatedAt: true,
        },
      }),
      prisma.inventoryItem.findMany({
        where: { propertyId },
        select: {
          id: true,
          name: true,
          category: true,
          condition: true,
          installedOn: true,
          purchasedOn: true,
          replacementCostCents: true,
          brand: true,
          model: true,
          updatedAt: true,
        },
      }),
      prisma.riskAssessmentReport.findUnique({
        where: { propertyId },
        select: { riskScore: true, details: true, lastCalculatedAt: true },
      }),
    ]);

    const allSpecs = this.deriveSpecs(property, inventoryItems, riskReport, propertyId);
    const disabledTypes = new Set(getDisabledComponentTypes());
    const specs = disabledTypes.size > 0
      ? allSpecs.filter((s) => !disabledTypes.has(s.componentType))
      : allSpecs;
    // The fingerprint is computed from raw dependency data, not from specs —
    // a disabled category doesn't change whether the underlying data moved,
    // so re-enabling it later still triggers a correct rebuild rather than
    // being masked by a fingerprint that never changed while it was off.
    const dependencyFingerprint = this.computeDependencyFingerprint(property, inventoryItems, riskReport);

    await prisma.$transaction(async (tx) => {
      const upsertedIds = new Set<string>();

      for (const spec of specs) {
        const componentId = await this.upsertComponent(tx, digitalTwinId, propertyId, spec);
        upsertedIds.add(componentId);
      }

      // Use allSpecs (not the disabled-filtered specs) so a disabled type's
      // existing components are treated as "not touched this run," not
      // "orphaned" — they must survive a disable/re-enable cycle untouched.
      await this.retireOrphanedComponents(tx, digitalTwinId, allSpecs, upsertedIds);
    });

    return { dependencyFingerprint };
  }

  /**
   * Cheap, read-only fingerprint recompute — the same hash `buildComponents`
   * produces, but without deriving specs or writing anything. Lets a caller
   * (see HomeDigitalTwinService.checkNeedsRecompute) detect "the property
   * profile, inventory, or risk report changed since the last build" on
   * every read, not just when a homeowner happens to click Refresh — this is
   * the dependency-driven-recomputation signal from Slice 7 of the audit
   * plan. Only the three timestamp-bearing fields each dependency needs are
   * selected, so this stays cheap even on a hot read path.
   */
  async getCurrentDependencyFingerprint(propertyId: string): Promise<string> {
    const [property, inventoryItems, riskReport] = await Promise.all([
      prisma.property.findUniqueOrThrow({
        where: { id: propertyId },
        select: { updatedAt: true },
      }),
      prisma.inventoryItem.findMany({
        where: { propertyId },
        select: { id: true, updatedAt: true },
      }),
      prisma.riskAssessmentReport.findUnique({
        where: { propertyId },
        select: { lastCalculatedAt: true },
      }),
    ]);
    return this.computeDependencyFingerprint(
      property as PropertyRow,
      inventoryItems as InventoryItemRow[],
      riskReport as RiskReportRow,
    );
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  private async upsertComponent(
    tx: TxClient,
    digitalTwinId: string,
    propertyId: string,
    spec: ComponentSpec,
  ): Promise<string> {
    const existing = await tx.homeTwinComponent.findUnique({
      where: { digitalTwinId_identityKey: { digitalTwinId, identityKey: spec.identityKey } },
      select: { id: true },
    });

    const sharedFields = {
      componentType: spec.componentType,
      label: spec.label,
      status: spec.status,
      sourceType: spec.sourceType,
      sourceReferenceId: spec.sourceReferenceId,
      lifecycleState: 'ACTIVE' as const,
      retiredAt: null,
      installYear: spec.installYear,
      estimatedAgeYears: spec.estimatedAgeYears,
      usefulLifeYears: spec.usefulLifeYears,
      conditionScore: spec.conditionScore,
      // Age/service-life heuristics are planning signals, not calibrated
      // failure probabilities. Keep the legacy column empty until a
      // validated evidence model exists.
      failureRiskScore: null,
      replacementCostEstimate: toDecimal(spec.replacementCostEstimate),
      annualOperatingCostEstimate: toDecimal(spec.annualOperatingCostEstimate),
      annualMaintenanceCostEstimate: toDecimal(spec.annualMaintenanceCostEstimate),
      confidenceScore: spec.confidenceScore,
      metadata: (spec.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      lastModeledAt: new Date(),
    };

    const componentId = existing
      ? (
          await tx.homeTwinComponent.update({
            where: { id: existing.id },
            data: { ...sharedFields, isUserConfirmed: false },
          })
        ).id
      : (
          await tx.homeTwinComponent.create({
            data: {
              ...sharedFields,
              identityKey: spec.identityKey,
              digitalTwinId,
              propertyId,
              isUserConfirmed: false,
            },
          })
        ).id;

    await this.upsertFacts(tx, digitalTwinId, componentId, spec.facts);
    return componentId;
  }

  private async upsertFacts(
    tx: TxClient,
    digitalTwinId: string,
    componentId: string,
    facts: ProjectedFactSpec[],
  ): Promise<void> {
    for (const fact of facts) {
      const existing = await tx.homeTwinProjectedFact.findUnique({
        where: { componentId_fieldName: { componentId, fieldName: fact.fieldName } },
        select: {
          valueNumeric: true,
          valueText: true,
          unit: true,
          factState: true,
          sourceType: true,
          sourceRecordType: true,
          sourceRecordId: true,
          sourceField: true,
          observedAt: true,
          derivationMethod: true,
          modelVersion: true,
          sourceVerified: true,
          confidenceScore: true,
          conflictGroupId: true,
          correctionDestination: true,
        },
      });
      const previousSnapshot = existing ? projectedFactSnapshot(existing) : null;
      const nextSnapshot = projectedFactSnapshot(fact);

      await tx.homeTwinProjectedFact.upsert({
        where: { componentId_fieldName: { componentId, fieldName: fact.fieldName } },
        create: {
          componentId,
          digitalTwinId,
          fieldName: fact.fieldName,
          valueNumeric: fact.valueNumeric ?? null,
          valueText: fact.valueText ?? null,
          unit: fact.unit ?? null,
          factState: fact.factState,
          sourceType: fact.sourceType,
          sourceRecordType: fact.sourceRecordType ?? null,
          sourceRecordId: fact.sourceRecordId ?? null,
          sourceField: fact.sourceField ?? null,
          observedAt: fact.observedAt ?? null,
          derivationMethod: fact.derivationMethod ?? null,
          modelVersion: fact.modelVersion ?? PROJECTION_MODEL_VERSION,
          sourceVerified: fact.sourceVerified ?? null,
          confidenceScore: fact.confidenceScore ?? null,
          conflictGroupId: fact.conflictGroupId ?? null,
          correctionDestination: fact.correctionDestination ?? null,
        },
        update: {
          valueNumeric: fact.valueNumeric ?? null,
          valueText: fact.valueText ?? null,
          unit: fact.unit ?? null,
          factState: fact.factState,
          sourceType: fact.sourceType,
          sourceRecordType: fact.sourceRecordType ?? null,
          sourceRecordId: fact.sourceRecordId ?? null,
          sourceField: fact.sourceField ?? null,
          observedAt: fact.observedAt ?? null,
          derivationMethod: fact.derivationMethod ?? null,
          modelVersion: fact.modelVersion ?? PROJECTION_MODEL_VERSION,
          sourceVerified: fact.sourceVerified ?? null,
          confidenceScore: fact.confidenceScore ?? null,
          conflictGroupId: fact.conflictGroupId ?? null,
          correctionDestination: fact.correctionDestination ?? null,
        },
      });

      if (!previousSnapshot || JSON.stringify(previousSnapshot) !== JSON.stringify(nextSnapshot)) {
        await tx.homeTwinProjectedFactRevision.create({
          data: {
            digitalTwinId,
            componentId,
            fieldName: fact.fieldName,
            previousFactState: existing?.factState ?? null,
            nextFactState: fact.factState,
            ...(previousSnapshot
              ? { previousSnapshot: previousSnapshot as Prisma.InputJsonValue }
              : {}),
            nextSnapshot: nextSnapshot as Prisma.InputJsonValue,
            changeReason: existing ? 'SOURCE_REFRESH' : 'INITIAL_PROJECTION',
          },
        });
      }
    }
  }

  /**
   * A component is orphaned when this build run no longer produces its
   * identityKey (its backing inventory item was deleted, or a property
   * field was cleared). Retire rather than delete — the record and its
   * facts remain inspectable, just no longer active.
   */
  private async retireOrphanedComponents(
    tx: TxClient,
    digitalTwinId: string,
    specs: ComponentSpec[],
    upsertedIds: Set<string>,
  ): Promise<void> {
    const currentKeys = new Set(specs.map((s) => s.identityKey));
    const activeComponents = await tx.homeTwinComponent.findMany({
      where: { digitalTwinId, lifecycleState: 'ACTIVE' },
      select: { id: true, identityKey: true },
    });

    const orphaned = activeComponents.filter(
      (c) => !currentKeys.has(c.identityKey) && !upsertedIds.has(c.id),
    );
    if (orphaned.length === 0) return;

    await tx.homeTwinComponent.updateMany({
      where: { id: { in: orphaned.map((c) => c.id) } },
      data: { lifecycleState: 'RETIRED', retiredAt: new Date() },
    });
  }

  /**
   * Cheap fingerprint of the source records the projection depends on.
   * A changed fingerprint means the projection is stale relative to
   * canonical data — the caller persists this for staleness detection.
   */
  private computeDependencyFingerprint(
    property: PropertyRow,
    inventoryItems: InventoryItemRow[],
    riskReport: RiskReportRow,
  ): string {
    const parts = [
      property.updatedAt.toISOString(),
      ...inventoryItems
        .map((i) => `${i.id}:${i.updatedAt.toISOString()}`)
        .sort(),
      riskReport ? riskReport.lastCalculatedAt.toISOString() : 'no-risk-report',
    ];
    return parts.join('|');
  }

  // ============================================================================
  // DERIVATION LOGIC
  // ============================================================================

  private deriveSpecs(
    property: PropertyRow,
    inventoryItems: InventoryItemRow[],
    riskReport: RiskReportRow,
    propertyId: string,
  ): ComponentSpec[] {
    const specs: ComponentSpec[] = [];
    const yr = currentYear();

    // ── HVAC (one component per HVAC inventory item, or one PRIMARY when
    //    none exist) ────────────────────────────────────────────────────────
    {
      const defaults = COMPONENT_DEFAULTS.HVAC;
      const hvacInventory = inventoryItems.filter((i) => i.category === 'HVAC');

      const buildHvacSpec = (
        identityKey: string,
        label: string,
        item: InventoryItemRow | undefined,
        useReportedYear: boolean,
      ): ComponentSpec => {
        const resolved = resolveInstallYear({
          reportedYear: useReportedYear ? property.hvacInstallYear : null,
          reportedSourceField: 'hvacInstallYear',
          inventoryItem: item,
          inferredYear: property.yearBuilt ? property.yearBuilt + 5 : null,
          inferredMethod: 'year_built_offset_5',
          inferredNote: 'Age estimated from year built (assumed replaced ~5 yrs after construction)',
          yr,
        });

        const age = ageFromInstallYear(resolved.installYear);
        const condition = age != null ? conditionFromAgeRatio(age, defaults.usefulLifeYears) : null;
        const cost = replacementCostFact({
          reportedCents: item?.replacementCostCents,
          inventoryItemId: item?.id,
          scaledValue: scaledHvacCost(property.propertySize),
          scaledMethod: 'sqft_scaled',
        });

        let knownPoints = resolved.isKnownSource ? 1 : 0;
        if (property.heatingType) knownPoints++;
        if (property.coolingType) knownPoints++;
        if (item?.replacementCostCents) knownPoints++;

        return {
          identityKey,
          componentType: 'HVAC',
          label,
          status: statusFromResolution(resolved),
          sourceType: resolved.sourceType,
          sourceReferenceId: resolved.sourceReferenceId,
          installYear: resolved.installYear,
          estimatedAgeYears: age,
          usefulLifeYears: defaults.usefulLifeYears,
          conditionScore: condition,
          failureRiskScore: null,
          replacementCostEstimate: cost.value,
          annualOperatingCostEstimate: defaults.annualOperatingCost,
          annualMaintenanceCostEstimate: defaults.annualMaintenanceCost,
          confidenceScore: deriveConfidence(knownPoints, 4),
          metadata: {
            heatingType: property.heatingType,
            coolingType: property.coolingType,
            inventoryItemId: item?.id ?? null,
            propertySizeSqft: property.propertySize,
            dataSourceNote: resolved.dataSourceNote,
          },
          facts: [resolved.fact, cost.fact],
        };
      };

      if (hvacInventory.length > 0) {
        hvacInventory.forEach((item, idx) => {
          specs.push(
            buildHvacSpec(
              `HVAC:${item.id}`,
              hvacInventory.length > 1 ? `HVAC System ${idx + 1} (${item.name})` : 'HVAC System',
              item,
              // property.hvacInstallYear only applies when there's exactly one
              // tracked HVAC system — with multiple systems it can't be
              // attributed to a specific one.
              hvacInventory.length === 1,
            ),
          );
        });
      } else {
        specs.push(buildHvacSpec('HVAC:PRIMARY', 'HVAC System', undefined, true));
      }
    }

    // ── WATER HEATER (one component per matching inventory item, or one
    //    PRIMARY when none exist) ───────────────────────────────────────────
    {
      const defaults = COMPONENT_DEFAULTS.WATER_HEATER;
      const whConfig = waterHeaterConfig(property.waterHeaterType);
      const whInventory = inventoryItems.filter(
        (i) =>
          i.category === 'APPLIANCE' &&
          (i.name?.toLowerCase().includes('water heater') ||
            i.name?.toLowerCase().includes('water-heater')),
      );

      const buildWhSpec = (
        identityKey: string,
        label: string,
        item: InventoryItemRow | undefined,
        useReportedYear: boolean,
      ): ComponentSpec => {
        const resolved = resolveInstallYear({
          reportedYear: useReportedYear ? property.waterHeaterInstallYear : null,
          reportedSourceField: 'waterHeaterInstallYear',
          inventoryItem: item,
          inferredYear: property.yearBuilt ?? null,
          inferredMethod: 'year_built_direct',
          inferredNote: 'Age estimated from year built (original installation assumed)',
          yr,
        });

        const age = ageFromInstallYear(resolved.installYear);
        const condition = age != null ? conditionFromAgeRatio(age, whConfig.usefulLifeYears) : null;
        const cost = replacementCostFact({
          reportedCents: item?.replacementCostCents,
          inventoryItemId: item?.id,
          scaledValue: whConfig.replacementCost,
          scaledMethod: 'type_default',
        });

        let knownPoints = resolved.isKnownSource ? 1 : 0;
        if (property.waterHeaterType) knownPoints++;

        return {
          identityKey,
          componentType: 'WATER_HEATER',
          label,
          status: statusFromResolution(resolved),
          sourceType: resolved.sourceType,
          sourceReferenceId: resolved.sourceReferenceId,
          installYear: resolved.installYear,
          estimatedAgeYears: age,
          usefulLifeYears: whConfig.usefulLifeYears,
          conditionScore: condition,
          failureRiskScore: null,
          replacementCostEstimate: cost.value,
          annualOperatingCostEstimate: defaults.annualOperatingCost,
          annualMaintenanceCostEstimate: defaults.annualMaintenanceCost,
          confidenceScore: deriveConfidence(knownPoints, 3),
          metadata: {
            waterHeaterType: property.waterHeaterType,
            inventoryItemId: item?.id ?? null,
            dataSourceNote: resolved.dataSourceNote,
          },
          facts: [resolved.fact, cost.fact],
        };
      };

      if (whInventory.length > 0) {
        whInventory.forEach((item, idx) => {
          specs.push(
            buildWhSpec(
              `WATER_HEATER:${item.id}`,
              whInventory.length > 1 ? `Water Heater ${idx + 1} (${item.name})` : 'Water Heater',
              item,
              whInventory.length === 1,
            ),
          );
        });
      } else {
        specs.push(buildWhSpec('WATER_HEATER:PRIMARY', 'Water Heater', undefined, true));
      }
    }

    // ── ROOF ──────────────────────────────────────────────────────────────────
    {
      const defaults = COMPONENT_DEFAULTS.ROOF;
      const roofInventory = inventoryItems.filter(
        (item) =>
          item.category === 'ROOF_EXTERIOR' &&
          /\b(roof|shingle|membrane)\b/i.test(item.name),
      );

      const buildRoofSpec = (
        identityKey: string,
        label: string,
        item: InventoryItemRow | undefined,
        useReportedYear: boolean,
      ): ComponentSpec => {
        const resolved = resolveInstallYear({
          reportedYear: useReportedYear ? property.roofReplacementYear : null,
          reportedSourceField: 'roofReplacementYear',
          inventoryItem: item,
          inferredYear: property.yearBuilt ?? null,
          inferredMethod: 'year_built_direct',
          inferredNote: 'Age estimated from year built (original roof assumed)',
          yr,
        });
        if (resolved.fact.factState === 'REPORTED') resolved.fact.confidenceScore = 0.75;
        const age = ageFromInstallYear(resolved.installYear);
        const cost = replacementCostFact({
          reportedCents: item?.replacementCostCents,
          inventoryItemId: item?.id,
          scaledValue: scaledRoofCost(property.propertySize, property.roofType),
          scaledMethod: 'sqft_and_material_scaled',
        });
        let knownPoints = resolved.isKnownSource ? 1 : 0;
        if (property.roofType) knownPoints++;
        if (riskReport) knownPoints++;
        return {
          identityKey,
          componentType: 'ROOF',
          label,
          status: statusFromResolution(resolved),
          sourceType: resolved.sourceType,
          sourceReferenceId: resolved.sourceReferenceId,
          installYear: resolved.installYear,
          estimatedAgeYears: age,
          usefulLifeYears: defaults.usefulLifeYears,
          conditionScore: age != null ? conditionFromAgeRatio(age, defaults.usefulLifeYears) : null,
          failureRiskScore: null,
          replacementCostEstimate: cost.value,
          annualOperatingCostEstimate: defaults.annualOperatingCost,
          annualMaintenanceCostEstimate: defaults.annualMaintenanceCost,
          confidenceScore: deriveConfidence(knownPoints, 3),
          metadata: {
            roofType: property.roofType,
            propertySizeSqft: property.propertySize,
            inventoryItemId: item?.id ?? null,
            dataSourceNote: resolved.dataSourceNote,
          },
          facts: [resolved.fact, cost.fact],
        };
      };

      if (roofInventory.length > 0) {
        roofInventory.forEach((item, index) => specs.push(buildRoofSpec(
          `ROOF:${item.id}`,
          roofInventory.length > 1 ? `Roof ${index + 1} (${item.name})` : 'Roof',
          item,
          roofInventory.length === 1,
        )));
      } else {
        specs.push(buildRoofSpec('ROOF:PRIMARY', 'Roof', undefined, true));
      }
    }

    // ── ELECTRICAL ────────────────────────────────────────────────────────────
    {
      const defaults = COMPONENT_DEFAULTS.ELECTRICAL;
      const electricalInventory = inventoryItems.filter((i) => i.category === 'ELECTRICAL');
      const buildElectricalSpec = (
        identityKey: string,
        label: string,
        item: InventoryItemRow | undefined,
        useReportedAge: boolean,
      ): ComponentSpec => {
        const reportedYear = useReportedAge && property.electricalPanelAge != null
          ? yr - property.electricalPanelAge
          : null;
        const resolved = resolveInstallYear({
          reportedYear,
          reportedSourceField: 'electricalPanelAge',
          inventoryItem: item,
          inferredYear: property.yearBuilt ?? null,
          inferredMethod: 'year_built_direct',
          inferredNote: 'Age estimated from year built (original electrical system assumed)',
          yr,
        });
        const age = ageFromInstallYear(resolved.installYear);
        const cost = replacementCostFact({
          reportedCents: item?.replacementCostCents,
          inventoryItemId: item?.id,
          scaledValue: defaults.replacementCost,
          scaledMethod: 'category_default',
        });
        return {
          identityKey,
          componentType: 'ELECTRICAL',
          label,
          status: statusFromResolution(resolved),
          sourceType: resolved.sourceType,
          sourceReferenceId: resolved.sourceReferenceId,
          installYear: resolved.installYear,
          estimatedAgeYears: age,
          usefulLifeYears: defaults.usefulLifeYears,
          conditionScore: age != null ? conditionFromAgeRatio(age, defaults.usefulLifeYears) : null,
          failureRiskScore: null,
          replacementCostEstimate: cost.value,
          annualOperatingCostEstimate: defaults.annualOperatingCost,
          annualMaintenanceCostEstimate: defaults.annualMaintenanceCost,
          confidenceScore: deriveConfidence(
            (resolved.isKnownSource ? 1 : 0) + (item?.replacementCostCents ? 1 : 0),
            2,
          ),
          metadata: {
            electricalPanelAge: useReportedAge ? property.electricalPanelAge : null,
            inventoryItemId: item?.id ?? null,
            dataSourceNote: resolved.dataSourceNote,
          },
          facts: [resolved.fact, cost.fact],
        };
      };

      if (electricalInventory.length > 0) {
        electricalInventory.forEach((item, index) => specs.push(buildElectricalSpec(
          `ELECTRICAL:${item.id}`,
          electricalInventory.length > 1 ? `Electrical Panel ${index + 1} (${item.name})` : 'Electrical System',
          item,
          electricalInventory.length === 1,
        )));
      } else {
        specs.push(buildElectricalSpec('ELECTRICAL:PRIMARY', 'Electrical System', undefined, true));
      }
    }

    // ── PLUMBING ──────────────────────────────────────────────────────────────
    {
      const defaults = COMPONENT_DEFAULTS.PLUMBING;
      const plumbingInventory = inventoryItems.filter((i) => i.category === 'PLUMBING');
      const buildPlumbingSpec = (
        identityKey: string,
        label: string,
        item?: InventoryItemRow,
      ): ComponentSpec => {
        const resolved = resolveInstallYear({
          reportedYear: null,
          reportedSourceField: 'installedOn',
          inventoryItem: item,
          inferredYear: property.yearBuilt ?? null,
          inferredMethod: 'year_built_direct',
          inferredNote: 'Age estimated from year built (original plumbing assumed)',
          yr,
        });
        const age = ageFromInstallYear(resolved.installYear);
        const cost = replacementCostFact({
          reportedCents: item?.replacementCostCents,
          inventoryItemId: item?.id,
          scaledValue: defaults.replacementCost,
          scaledMethod: 'category_default',
        });
        return {
          identityKey,
          componentType: 'PLUMBING',
          label,
          status: statusFromResolution(resolved),
          sourceType: resolved.sourceType,
          sourceReferenceId: resolved.sourceReferenceId,
          installYear: resolved.installYear,
          estimatedAgeYears: age,
          usefulLifeYears: defaults.usefulLifeYears,
          conditionScore: age != null ? conditionFromAgeRatio(age, defaults.usefulLifeYears) : null,
          failureRiskScore: null,
          replacementCostEstimate: cost.value,
          annualOperatingCostEstimate: defaults.annualOperatingCost,
          annualMaintenanceCostEstimate: defaults.annualMaintenanceCost,
          confidenceScore: deriveConfidence(
            (resolved.isKnownSource ? 1 : 0) + (item?.replacementCostCents ? 1 : 0),
            2,
          ),
          metadata: {
            inventoryItemId: item?.id ?? null,
            dataSourceNote: resolved.dataSourceNote,
          },
          facts: [resolved.fact, cost.fact],
        };
      };

      if (plumbingInventory.length > 0) {
        plumbingInventory.forEach((item, index) => specs.push(buildPlumbingSpec(
          `PLUMBING:${item.id}`,
          plumbingInventory.length > 1 ? `Plumbing System ${index + 1} (${item.name})` : 'Plumbing',
          item,
        )));
      } else {
        specs.push(buildPlumbingSpec('PLUMBING:PRIMARY', 'Plumbing'));
      }
    }

    // ── FOUNDATION ────────────────────────────────────────────────────────────
    {
      const defaults = COMPONENT_DEFAULTS.FOUNDATION;
      const installYear = property.yearBuilt ?? null;
      const age = ageFromInstallYear(installYear);
      const condition = age != null ? conditionFromAgeRatio(age, defaults.usefulLifeYears) : null;
      const knownPoints = property.yearBuilt ? 1 : 0;

      specs.push({
        identityKey: 'FOUNDATION:PRIMARY',
        componentType: 'FOUNDATION',
        label: 'Foundation',
        status: 'ESTIMATED',
        sourceType: 'SYSTEM_DERIVED',
        sourceReferenceId: null,
        installYear,
        estimatedAgeYears: age,
        usefulLifeYears: defaults.usefulLifeYears,
        conditionScore: condition,
        failureRiskScore: null,
        replacementCostEstimate: defaults.replacementCost,
        annualOperatingCostEstimate: defaults.annualOperatingCost,
        annualMaintenanceCostEstimate: defaults.annualMaintenanceCost,
        confidenceScore: deriveConfidence(knownPoints, 2),
        metadata: {
          foundationType: property.foundationType,
        },
        facts: [
          installYear
            ? {
                fieldName: 'installYear',
                valueNumeric: installYear,
                factState: 'INFERRED',
                sourceType: 'SYSTEM_DERIVED',
                sourceRecordType: 'Property',
                sourceField: 'yearBuilt',
                derivationMethod: 'year_built_direct',
                confidenceScore: 0.2,
              }
            : {
                fieldName: 'installYear',
                valueNumeric: null,
                factState: 'DEFAULT',
                sourceType: 'SYSTEM_DERIVED',
                derivationMethod: 'category_default',
                confidenceScore: 0.1,
              },
        ],
      });
    }

    // ── EXTERIOR ──────────────────────────────────────────────────────────────
    {
      const defaults = COMPONENT_DEFAULTS.EXTERIOR;
      const roofExteriorInventory = inventoryItems.filter((i) => i.category === 'ROOF_EXTERIOR');
      const installYear = property.yearBuilt ?? null;
      const age = ageFromInstallYear(installYear);
      const condition = age != null ? conditionFromAgeRatio(age, defaults.usefulLifeYears) : null;
      const knownPoints =
        (property.yearBuilt ? 1 : 0) +
        (property.sidingType ? 1 : 0) +
        (roofExteriorInventory.length > 0 ? 1 : 0);

      specs.push({
        identityKey: 'EXTERIOR:PRIMARY',
        componentType: 'EXTERIOR',
        label: 'Exterior / Siding',
        status: 'ESTIMATED',
        sourceType: 'SYSTEM_DERIVED',
        sourceReferenceId: null,
        installYear,
        estimatedAgeYears: age,
        usefulLifeYears: defaults.usefulLifeYears,
        conditionScore: condition,
        failureRiskScore: null,
        replacementCostEstimate: defaults.replacementCost,
        annualOperatingCostEstimate: defaults.annualOperatingCost,
        annualMaintenanceCostEstimate: defaults.annualMaintenanceCost,
        confidenceScore: deriveConfidence(knownPoints, 3),
        metadata: {
          sidingType: property.sidingType,
          inventoryItemCount: roofExteriorInventory.length,
        },
        facts: [
          installYear
            ? {
                fieldName: 'installYear',
                valueNumeric: installYear,
                factState: 'INFERRED',
                sourceType: 'SYSTEM_DERIVED',
                sourceRecordType: 'Property',
                sourceField: 'yearBuilt',
                derivationMethod: 'year_built_direct',
                confidenceScore: 0.2,
              }
            : {
                fieldName: 'installYear',
                valueNumeric: null,
                factState: 'DEFAULT',
                sourceType: 'SYSTEM_DERIVED',
                derivationMethod: 'category_default',
                confidenceScore: 0.1,
              },
        ],
      });
    }

    // ── SOLAR (one component per solar/panel inventory item; none if no
    //    evidence exists) ────────────────────────────────────────────────────
    {
      const solarInventory = inventoryItems.filter(
        (i) =>
          i.category === 'SMART_HOME' ||
          i.name?.toLowerCase().includes('solar') ||
          i.name?.toLowerCase().includes('panel'),
      );

      const defaults = COMPONENT_DEFAULTS.SOLAR;
      solarInventory.forEach((item, idx) => {
        const resolved = resolveInstallYear({
          reportedYear: null,
          reportedSourceField: 'n/a',
          inventoryItem: item,
          inferredYear: null,
          inferredMethod: 'n/a',
          inferredNote: 'No install date available',
          yr,
        });
        const age = ageFromInstallYear(resolved.installYear);
        const condition = age != null ? conditionFromAgeRatio(age, defaults.usefulLifeYears) : null;
        const cost = replacementCostFact({
          reportedCents: item.replacementCostCents,
          inventoryItemId: item.id,
          scaledValue: defaults.replacementCost,
          scaledMethod: 'category_default',
        });

        specs.push({
          identityKey: `SOLAR:${item.id}`,
          componentType: 'SOLAR',
          label: solarInventory.length > 1 ? `Solar System ${idx + 1} (${item.name})` : 'Solar System',
          status: statusFromResolution(resolved),
          sourceType: 'INVENTORY',
          sourceReferenceId: item.id,
          installYear: resolved.installYear,
          estimatedAgeYears: age,
          usefulLifeYears: defaults.usefulLifeYears,
          conditionScore: condition,
          failureRiskScore: null,
          replacementCostEstimate: cost.value,
          annualOperatingCostEstimate: defaults.annualOperatingCost,
          annualMaintenanceCostEstimate: defaults.annualMaintenanceCost,
          confidenceScore: deriveConfidence(2, 3),
          metadata: {
            brand: item.brand,
            model: item.model,
            inventoryItemId: item.id,
          },
          facts: [resolved.fact, cost.fact],
        });
      });
    }

    for (const spec of specs) {
      for (const fact of spec.facts) {
        fact.modelVersion ??= PROJECTION_MODEL_VERSION;
        fact.sourceVerified ??=
          fact.factState === 'VERIFIED' || fact.factState === 'DOCUMENT_DERIVED';
      }
      ensureCompleteFactLineage(spec);
      for (const fact of spec.facts) {
        fact.correctionDestination = correctionDestinationFor(spec.componentType, fact, propertyId);
      }
    }

    return specs;
  }
}
