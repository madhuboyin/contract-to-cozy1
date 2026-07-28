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
 * Build operations are idempotent and transactional: existing non-user-
 * confirmed system-derived components are updated in place; confirmed ones
 * are left untouched; a mid-run failure rolls back rather than leaving a
 * partially-updated projection (see HomeDigitalTwinService, which relies on
 * this to preserve the last good projection).
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

/** Failure risk is inversely related to condition. */
function failureRiskFromCondition(conditionScore: number): number {
  return Math.round((1 - conditionScore) * 100) / 100;
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
  confidenceScore?: number | null;
  conflictGroupId?: string | null;
  correctionDestination?: string | null;
};

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
    // No inventory record backs this estimate — the fix is adding the item,
    // not editing a field that doesn't exist yet.
    return `/dashboard/properties/${propertyId}/inventory`;
  }
  if (STRUCTURE_SECTION_TYPES.has(componentType)) {
    return `/dashboard/properties/${propertyId}/edit#structure`;
  }
  if (componentType === 'EXTERIOR') {
    return `/dashboard/properties/${propertyId}/edit#exterior`;
  }
  // ELECTRICAL, PLUMBING, FOUNDATION: no dedicated field exists in the edit
  // form yet. Point at the general edit page rather than fabricate an
  // anchor that goes nowhere.
  return `/dashboard/properties/${propertyId}/edit`;
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
      select: { id: true, isUserConfirmed: true },
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
      failureRiskScore: spec.failureRiskScore,
      replacementCostEstimate: toDecimal(spec.replacementCostEstimate),
      annualOperatingCostEstimate: toDecimal(spec.annualOperatingCostEstimate),
      annualMaintenanceCostEstimate: toDecimal(spec.annualMaintenanceCostEstimate),
      confidenceScore: spec.confidenceScore,
      metadata: (spec.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      lastModeledAt: new Date(),
    };

    // Homeowner-confirmed components are left untouched — the whole point of
    // confirmation is that the system stops overwriting it on every rebuild.
    if (existing?.isUserConfirmed) {
      return existing.id;
    }

    const componentId = existing
      ? (await tx.homeTwinComponent.update({ where: { id: existing.id }, data: sharedFields })).id
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
          confidenceScore: fact.confidenceScore ?? null,
          conflictGroupId: fact.conflictGroupId ?? null,
          correctionDestination: fact.correctionDestination ?? null,
        },
      });
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
      select: { id: true, identityKey: true, isUserConfirmed: true },
    });

    const orphaned = activeComponents.filter(
      (c) => !currentKeys.has(c.identityKey) && !upsertedIds.has(c.id) && !c.isUserConfirmed,
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
          failureRiskScore: condition != null ? failureRiskFromCondition(condition) : null,
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
          failureRiskScore: condition != null ? failureRiskFromCondition(condition) : null,
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
      const resolved = resolveInstallYear({
        reportedYear: property.roofReplacementYear,
        reportedSourceField: 'roofReplacementYear',
        inventoryItem: undefined,
        inferredYear: property.yearBuilt ?? null,
        inferredMethod: 'year_built_direct',
        inferredNote: 'Age estimated from year built (original roof assumed)',
        yr,
      });
      // Roof replacement year is a dedicated, explicit profile field —
      // reclassify as VERIFIED-strength REPORTED rather than the generic
      // property-profile path used by systems without a dedicated field.
      if (resolved.fact.factState === 'REPORTED') {
        resolved.fact.confidenceScore = 0.75;
      }

      let knownPoints = resolved.isKnownSource ? 1 : 0;
      if (property.roofType) knownPoints++;
      if (riskReport) knownPoints++;

      const age = ageFromInstallYear(resolved.installYear);
      const condition = age != null ? conditionFromAgeRatio(age, defaults.usefulLifeYears) : null;

      // Boost failure risk from risk report if high overall risk
      let failureRisk = condition != null ? failureRiskFromCondition(condition) : null;
      if (failureRisk != null && riskReport && riskReport.riskScore > 70) {
        failureRisk = Math.min(1, failureRisk * 1.15);
      }

      const cost = replacementCostFact({
        reportedCents: null,
        scaledValue: scaledRoofCost(property.propertySize, property.roofType),
        scaledMethod: 'sqft_and_material_scaled',
      });

      specs.push({
        identityKey: 'ROOF:PRIMARY',
        componentType: 'ROOF',
        label: 'Roof',
        status: statusFromResolution(resolved),
        sourceType: resolved.sourceType,
        sourceReferenceId: resolved.sourceReferenceId,
        installYear: resolved.installYear,
        estimatedAgeYears: age,
        usefulLifeYears: defaults.usefulLifeYears,
        conditionScore: condition,
        failureRiskScore: failureRisk,
        replacementCostEstimate: cost.value,
        annualOperatingCostEstimate: defaults.annualOperatingCost,
        annualMaintenanceCostEstimate: defaults.annualMaintenanceCost,
        confidenceScore: deriveConfidence(knownPoints, 3),
        metadata: {
          roofType: property.roofType,
          propertySizeSqft: property.propertySize,
          dataSourceNote: resolved.dataSourceNote,
        },
        facts: [resolved.fact, cost.fact],
      });
    }

    // ── ELECTRICAL ────────────────────────────────────────────────────────────
    {
      const defaults = COMPONENT_DEFAULTS.ELECTRICAL;
      const electricalInventory = inventoryItems.filter((i) => i.category === 'ELECTRICAL');

      const isKnownSource = property.electricalPanelAge != null;
      const installYear = isKnownSource
        ? yr - (property.electricalPanelAge as number)
        : property.yearBuilt ?? null;

      const installYearFact: ProjectedFactSpec = isKnownSource
        ? {
            fieldName: 'installYear',
            valueNumeric: installYear,
            factState: 'REPORTED',
            sourceType: 'PROPERTY_PROFILE',
            sourceRecordType: 'Property',
            sourceField: 'electricalPanelAge',
            derivationMethod: 'direct',
            confidenceScore: 0.7,
          }
        : installYear
          ? {
              fieldName: 'installYear',
              valueNumeric: installYear,
              factState: 'INFERRED',
              sourceType: 'SYSTEM_DERIVED',
              sourceRecordType: 'Property',
              sourceField: 'yearBuilt',
              derivationMethod: 'year_built_direct',
              confidenceScore: 0.25,
            }
          : {
              fieldName: 'installYear',
              valueNumeric: null,
              factState: 'DEFAULT',
              sourceType: 'SYSTEM_DERIVED',
              derivationMethod: 'category_default',
              confidenceScore: 0.1,
            };

      let knownPoints = isKnownSource ? 1 : 0;
      if (electricalInventory.length > 0) knownPoints++;

      const age = ageFromInstallYear(installYear);
      const condition = age != null ? conditionFromAgeRatio(age, defaults.usefulLifeYears) : null;

      specs.push({
        identityKey: 'ELECTRICAL:PRIMARY',
        componentType: 'ELECTRICAL',
        label: 'Electrical System',
        status: isKnownSource ? 'KNOWN' : 'ESTIMATED',
        sourceType: isKnownSource ? 'PROPERTY_PROFILE' : 'SYSTEM_DERIVED',
        sourceReferenceId: null,
        installYear,
        estimatedAgeYears: age,
        usefulLifeYears: defaults.usefulLifeYears,
        conditionScore: condition,
        failureRiskScore: condition != null ? failureRiskFromCondition(condition) : null,
        replacementCostEstimate: defaults.replacementCost,
        annualOperatingCostEstimate: defaults.annualOperatingCost,
        annualMaintenanceCostEstimate: defaults.annualMaintenanceCost,
        confidenceScore: deriveConfidence(knownPoints, 2),
        metadata: {
          electricalPanelAge: property.electricalPanelAge,
          inventoryItemCount: electricalInventory.length,
        },
        facts: [installYearFact],
      });
    }

    // ── PLUMBING ──────────────────────────────────────────────────────────────
    {
      const defaults = COMPONENT_DEFAULTS.PLUMBING;
      const plumbingInventory = inventoryItems.filter((i) => i.category === 'PLUMBING');

      const installYear = property.yearBuilt ?? null;
      let knownPoints = 0;
      if (plumbingInventory.length > 0) knownPoints++;
      if (property.yearBuilt) knownPoints++;

      const age = ageFromInstallYear(installYear);
      const condition = age != null ? conditionFromAgeRatio(age, defaults.usefulLifeYears) : null;

      specs.push({
        identityKey: 'PLUMBING:PRIMARY',
        componentType: 'PLUMBING',
        label: 'Plumbing',
        status: 'ESTIMATED',
        sourceType: plumbingInventory.length > 0 ? 'INVENTORY' : 'SYSTEM_DERIVED',
        sourceReferenceId: null,
        installYear,
        estimatedAgeYears: age,
        usefulLifeYears: defaults.usefulLifeYears,
        conditionScore: condition,
        failureRiskScore: condition != null ? failureRiskFromCondition(condition) : null,
        replacementCostEstimate: defaults.replacementCost,
        annualOperatingCostEstimate: defaults.annualOperatingCost,
        annualMaintenanceCostEstimate: defaults.annualMaintenanceCost,
        confidenceScore: deriveConfidence(knownPoints, 3),
        metadata: {
          inventoryItemCount: plumbingInventory.length,
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
        failureRiskScore: condition != null ? failureRiskFromCondition(condition) : null,
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
        failureRiskScore: condition != null ? failureRiskFromCondition(condition) : null,
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
          failureRiskScore: condition != null ? failureRiskFromCondition(condition) : null,
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
        fact.correctionDestination = correctionDestinationFor(spec.componentType, fact, propertyId);
      }
    }

    return specs;
  }
}
