/**
 * HomeDigitalTwinBuilderService
 *
 * Derives HomeTwinComponent records from existing CtC property data:
 * property profile fields, inventory items, and risk reports.
 *
 * All build operations are idempotent: existing non-user-confirmed
 * system-derived components are updated in place; confirmed ones are
 * left untouched.
 */

import {
  HomeTwinComponentType,
  HomeTwinComponentStatus,
  HomeTwinSourceType,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

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
// COMPONENT SPEC (internal transfer object)
// ============================================================================

type ComponentSpec = {
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
};

// ============================================================================
// SERVICE
// ============================================================================

export class HomeDigitalTwinBuilderService {
  /**
   * Derive component specs from all available CtC data for the property,
   * then upsert them into the HomeTwinComponent table.
   *
   * Returns the list of upserted component IDs.
   */
  async buildComponents(
    propertyId: string,
    digitalTwinId: string,
  ): Promise<void> {
    const [property, inventoryItems, riskReport] = await Promise.all([
      prisma.property.findUniqueOrThrow({
        where: { id: propertyId },
        select: {
          yearBuilt: true,
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
        },
      }),
      prisma.riskAssessmentReport.findUnique({
        where: { propertyId },
        select: { riskScore: true, details: true },
      }),
    ]);

    const specs = this.deriveSpecs(property, inventoryItems, riskReport);

    // Upsert: update non-confirmed system components, create new ones
    for (const spec of specs) {
      const existing = await prisma.homeTwinComponent.findFirst({
        where: {
          digitalTwinId,
          componentType: spec.componentType,
          label: spec.label,
          isUserConfirmed: false,
        },
        select: { id: true },
      });

      const sharedFields = {
        componentType: spec.componentType,
        label: spec.label,
        status: spec.status,
        sourceType: spec.sourceType,
        sourceReferenceId: spec.sourceReferenceId,
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

      if (existing) {
        await prisma.homeTwinComponent.update({
          where: { id: existing.id },
          data: sharedFields,
        });
      } else {
        await prisma.homeTwinComponent.create({
          data: {
            ...sharedFields,
            digitalTwinId,
            propertyId,
            isUserConfirmed: false,
          },
        });
      }
    }
  }

  // ============================================================================
  // DERIVATION LOGIC
  // ============================================================================

  private deriveSpecs(
    property: {
      yearBuilt: number | null;
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
    },
    inventoryItems: Array<{
      id: string;
      name: string;
      category: string;
      condition: string;
      installedOn: Date | null;
      purchasedOn: Date | null;
      replacementCostCents: number | null;
      brand: string | null;
      model: string | null;
    }>,
    riskReport: { riskScore: number; details: unknown } | null,
  ): ComponentSpec[] {
    const specs: ComponentSpec[] = [];
    const yr = currentYear();

    // ── HVAC ──────────────────────────────────────────────────────────────────
    {
      const defaults = COMPONENT_DEFAULTS.HVAC;
      const hvacInventory = inventoryItems.filter((i) => i.category === 'HVAC');
      const primaryHvac = hvacInventory[0];

      let installYear: number | null = property.hvacInstallYear ?? null;
      let sourceType: HomeTwinSourceType = 'PROPERTY_PROFILE';
      let sourceRef: string | null = null;
      let knownPoints = 0;

      if (installYear) {
        knownPoints++;
        sourceType = 'PROPERTY_PROFILE';
      } else if (primaryHvac?.installedOn || primaryHvac?.purchasedOn) {
        const invAge = ageFromDate(primaryHvac.installedOn ?? primaryHvac.purchasedOn);
        installYear = invAge ? yr - Math.floor(invAge) : null;
        sourceType = 'INVENTORY';
        sourceRef = primaryHvac.id;
        knownPoints++;
      } else if (property.yearBuilt) {
        // Assume HVAC was replaced ~5 years after build as a conservative estimate
        installYear = property.yearBuilt + 5;
        sourceType = 'SYSTEM_DERIVED';
      }

      if (property.heatingType) knownPoints++;
      if (property.coolingType) knownPoints++;

      const age = ageFromInstallYear(installYear);
      const condition = age != null ? conditionFromAgeRatio(age, defaults.usefulLifeYears) : null;

      let replacementCost = defaults.replacementCost;
      if (primaryHvac?.replacementCostCents) {
        replacementCost = primaryHvac.replacementCostCents / 100;
        knownPoints++;
      }

      specs.push({
        componentType: 'HVAC',
        label: 'HVAC System',
        status: installYear ? 'KNOWN' : 'ESTIMATED',
        sourceType,
        sourceReferenceId: sourceRef,
        installYear,
        estimatedAgeYears: age,
        usefulLifeYears: defaults.usefulLifeYears,
        conditionScore: condition,
        failureRiskScore: condition != null ? failureRiskFromCondition(condition) : null,
        replacementCostEstimate: replacementCost,
        annualOperatingCostEstimate: defaults.annualOperatingCost,
        annualMaintenanceCostEstimate: defaults.annualMaintenanceCost,
        confidenceScore: deriveConfidence(knownPoints, 4),
        metadata: {
          heatingType: property.heatingType,
          coolingType: property.coolingType,
          inventoryItemCount: hvacInventory.length,
        },
      });
    }

    // ── WATER HEATER ──────────────────────────────────────────────────────────
    {
      const defaults = COMPONENT_DEFAULTS.WATER_HEATER;
      const whInventory = inventoryItems.filter(
        (i) =>
          i.category === 'APPLIANCE' &&
          (i.name?.toLowerCase().includes('water heater') ||
            i.name?.toLowerCase().includes('water-heater')),
      );
      const primaryWh = whInventory[0];

      let installYear: number | null = property.waterHeaterInstallYear ?? null;
      let sourceType: HomeTwinSourceType = 'PROPERTY_PROFILE';
      let sourceRef: string | null = null;
      let knownPoints = 0;

      if (installYear) {
        knownPoints++;
      } else if (primaryWh?.installedOn || primaryWh?.purchasedOn) {
        const invAge = ageFromDate(primaryWh.installedOn ?? primaryWh.purchasedOn);
        installYear = invAge ? yr - Math.floor(invAge) : null;
        sourceType = 'INVENTORY';
        sourceRef = primaryWh.id;
        knownPoints++;
      } else if (property.yearBuilt) {
        installYear = property.yearBuilt;
        sourceType = 'SYSTEM_DERIVED';
      }

      if (property.waterHeaterType) knownPoints++;

      const age = ageFromInstallYear(installYear);
      const condition = age != null ? conditionFromAgeRatio(age, defaults.usefulLifeYears) : null;

      specs.push({
        componentType: 'WATER_HEATER',
        label: 'Water Heater',
        status: installYear ? 'KNOWN' : 'ESTIMATED',
        sourceType,
        sourceReferenceId: sourceRef,
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
          waterHeaterType: property.waterHeaterType,
        },
      });
    }

    // ── ROOF ──────────────────────────────────────────────────────────────────
    {
      const defaults = COMPONENT_DEFAULTS.ROOF;
      let installYear: number | null = property.roofReplacementYear ?? null;
      let sourceType: HomeTwinSourceType = 'PROPERTY_PROFILE';
      let knownPoints = 0;

      if (installYear) {
        knownPoints++;
      } else if (property.yearBuilt) {
        installYear = property.yearBuilt;
        sourceType = 'SYSTEM_DERIVED';
      }

      if (property.roofType) knownPoints++;
      if (riskReport) knownPoints++;

      const age = ageFromInstallYear(installYear);
      const condition = age != null ? conditionFromAgeRatio(age, defaults.usefulLifeYears) : null;

      // Boost failure risk from risk report if high overall risk
      let failureRisk = condition != null ? failureRiskFromCondition(condition) : null;
      if (failureRisk != null && riskReport && riskReport.riskScore > 70) {
        failureRisk = Math.min(1, failureRisk * 1.15);
      }

      specs.push({
        componentType: 'ROOF',
        label: 'Roof',
        status: property.roofReplacementYear ? 'KNOWN' : 'ESTIMATED',
        sourceType,
        sourceReferenceId: null,
        installYear,
        estimatedAgeYears: age,
        usefulLifeYears: defaults.usefulLifeYears,
        conditionScore: condition,
        failureRiskScore: failureRisk,
        replacementCostEstimate: defaults.replacementCost,
        annualOperatingCostEstimate: defaults.annualOperatingCost,
        annualMaintenanceCostEstimate: defaults.annualMaintenanceCost,
        confidenceScore: deriveConfidence(knownPoints, 3),
        metadata: { roofType: property.roofType },
      });
    }

    // ── ELECTRICAL ────────────────────────────────────────────────────────────
    {
      const defaults = COMPONENT_DEFAULTS.ELECTRICAL;
      const electricalInventory = inventoryItems.filter((i) => i.category === 'ELECTRICAL');

      let installYear: number | null = null;
      let sourceType: HomeTwinSourceType = 'SYSTEM_DERIVED';
      let knownPoints = 0;

      if (property.electricalPanelAge != null) {
        installYear = yr - property.electricalPanelAge;
        sourceType = 'PROPERTY_PROFILE';
        knownPoints++;
      } else if (property.yearBuilt) {
        installYear = property.yearBuilt;
      }

      if (electricalInventory.length > 0) knownPoints++;

      const age = ageFromInstallYear(installYear);
      const condition = age != null ? conditionFromAgeRatio(age, defaults.usefulLifeYears) : null;

      specs.push({
        componentType: 'ELECTRICAL',
        label: 'Electrical System',
        status: property.electricalPanelAge != null ? 'KNOWN' : 'ESTIMATED',
        sourceType,
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
      });
    }

    // ── PLUMBING ──────────────────────────────────────────────────────────────
    {
      const defaults = COMPONENT_DEFAULTS.PLUMBING;
      const plumbingInventory = inventoryItems.filter((i) => i.category === 'PLUMBING');

      let installYear: number | null = property.yearBuilt ?? null;
      let sourceType: HomeTwinSourceType = 'SYSTEM_DERIVED';
      let knownPoints = 0;

      if (plumbingInventory.length > 0) {
        knownPoints++;
        sourceType = 'INVENTORY';
      }
      if (property.yearBuilt) knownPoints++;

      const age = ageFromInstallYear(installYear);
      const condition = age != null ? conditionFromAgeRatio(age, defaults.usefulLifeYears) : null;

      specs.push({
        componentType: 'PLUMBING',
        label: 'Plumbing',
        status: 'ESTIMATED',
        sourceType,
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
      });
    }

    // ── SOLAR (only if inventory evidence exists) ─────────────────────────────
    {
      const solarInventory = inventoryItems.filter(
        (i) =>
          i.category === 'SMART_HOME' ||
          i.name?.toLowerCase().includes('solar') ||
          i.name?.toLowerCase().includes('panel'),
      );

      if (solarInventory.length > 0) {
        const defaults = COMPONENT_DEFAULTS.SOLAR;
        const primarySolar = solarInventory[0];
        const age = ageFromDate(primarySolar.installedOn ?? primarySolar.purchasedOn);
        const installYear = age ? yr - Math.floor(age) : null;
        const condition = age != null ? conditionFromAgeRatio(age, defaults.usefulLifeYears) : null;

        specs.push({
          componentType: 'SOLAR',
          label: 'Solar System',
          status: installYear ? 'KNOWN' : 'ESTIMATED',
          sourceType: 'INVENTORY',
          sourceReferenceId: primarySolar.id,
          installYear,
          estimatedAgeYears: age,
          usefulLifeYears: defaults.usefulLifeYears,
          conditionScore: condition,
          failureRiskScore: condition != null ? failureRiskFromCondition(condition) : null,
          replacementCostEstimate:
            primarySolar.replacementCostCents
              ? primarySolar.replacementCostCents / 100
              : defaults.replacementCost,
          annualOperatingCostEstimate: defaults.annualOperatingCost,
          annualMaintenanceCostEstimate: defaults.annualMaintenanceCost,
          confidenceScore: deriveConfidence(2, 3),
          metadata: {
            brand: primarySolar.brand,
            model: primarySolar.model,
            inventoryItemCount: solarInventory.length,
          },
        });
      }
    }

    return specs;
  }
}
