/**
 * HomeDigitalTwinScenarioService
 *
 * Manages HomeTwinScenario CRUD and MVP scenario impact computation.
 *
 * Compute engine design principles:
 * - Deterministic and rules-based for MVP
 * - Accepts both canonical and aliased payload field names
 * - Emits only impacts that can be computed with reasonable confidence
 * - Replaces all prior impact rows on recompute (idempotent)
 * - Records confidence per impact, not just per scenario
 */

import {
  HomeTwinScenarioType,
  HomeTwinScenarioStatus,
  HomeTwinImpactType,
  HomeTwinImpactDirection,
  HomeTwinComponentType,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';

// ============================================================================
// TYPES
// ============================================================================

export type CreateScenarioInput = {
  name: string;
  scenarioType: HomeTwinScenarioType;
  description?: string | null;
  inputPayload: Record<string, unknown>;
  isPinned?: boolean;
};

export type UpdateScenarioInput = {
  isPinned?: boolean;
  isArchived?: boolean;
};

type ImpactSpec = {
  impactType: HomeTwinImpactType;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  direction: HomeTwinImpactDirection;
  confidenceScore: number | null;
  sortOrder: number;
};

// ============================================================================
// DEFAULT VALUES BY COMPONENT TYPE (USD, matches builder defaults)
// ============================================================================

const DEFAULT_REPLACEMENT_COST: Record<HomeTwinComponentType, number> = {
  HVAC:         9500,
  WATER_HEATER: 1200,
  ROOF:         12000,
  PLUMBING:     8000,
  ELECTRICAL:   5000,
  INSULATION:   3500,
  WINDOWS:      8000,
  SOLAR:        18000,
  APPLIANCE:    1500,
  FLOORING:     6000,
  EXTERIOR:     12000,
  FOUNDATION:   15000,
  OTHER:        3000,
};

const DEFAULT_ANNUAL_MAINTENANCE: Record<HomeTwinComponentType, number> = {
  HVAC:         500,
  WATER_HEATER: 100,
  ROOF:         200,
  PLUMBING:     200,
  ELECTRICAL:   150,
  INSULATION:   0,
  WINDOWS:      100,
  SOLAR:        300,
  APPLIANCE:    100,
  FLOORING:     200,
  EXTERIOR:     300,
  FOUNDATION:   300,
  OTHER:        100,
};

// Fraction of upfront cost typically recovered in property resale value
const PROPERTY_VALUE_ROI: Record<HomeTwinComponentType, number> = {
  HVAC:         0.50,
  WATER_HEATER: 0.45,
  ROOF:         0.65,
  PLUMBING:     0.40,
  ELECTRICAL:   0.50,
  INSULATION:   0.55,
  WINDOWS:      0.60,
  SOLAR:        0.70,
  APPLIANCE:    0.35,
  FLOORING:     0.55,
  EXTERIOR:     0.50,
  FOUNDATION:   0.45,
  OTHER:        0.35,
};

// Estimated insurance discount per component replacement (fraction of current premium, rough heuristic)
const INSURANCE_IMPACT_BY_COMPONENT: Partial<Record<HomeTwinComponentType, number>> = {
  ROOF:       0.07,  // new roof → ~7% discount
  ELECTRICAL: 0.05,
  PLUMBING:   0.03,
};

// Components where replacing has notable comfort impact
const COMFORT_IMPACT_TYPES = new Set<HomeTwinComponentType>([
  'HVAC',
  'INSULATION',
  'WINDOWS',
]);

// ============================================================================
// HELPERS
// ============================================================================

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function decimalToNumber(d: Prisma.Decimal | null | undefined): number | null {
  if (d == null) return null;
  return Number(d.toString());
}

// ============================================================================
// IMPACT COMPUTATION
// ============================================================================

function computeImpacts(
  scenarioType: HomeTwinScenarioType,
  inputPayload: Record<string, unknown>,
  component: {
    componentType: HomeTwinComponentType;
    estimatedAgeYears: number | null;
    conditionScore: number | null;
    failureRiskScore: number | null;
    annualMaintenanceCostEstimate: Prisma.Decimal | null;
    annualOperatingCostEstimate: Prisma.Decimal | null;
    replacementCostEstimate: Prisma.Decimal | null;
  } | null,
): ImpactSpec[] {
  const impacts: ImpactSpec[] = [];

  // ── REPLACE_COMPONENT / UPGRADE_COMPONENT ──────────────────────────────────
  if (
    scenarioType === 'REPLACE_COMPONENT' ||
    scenarioType === 'UPGRADE_COMPONENT'
  ) {
    const assumptions = (inputPayload.assumptions as Record<string, unknown>) ?? {};
    const compType = (inputPayload.componentType as HomeTwinComponentType) ?? 'OTHER';

    // Accept projectCost as alias for replacementCost
    const upfrontCost =
      toNum(assumptions.replacementCost) ??
      toNum(assumptions.projectCost) ??
      decimalToNumber(component?.replacementCostEstimate) ??
      DEFAULT_REPLACEMENT_COST[compType] ??
      DEFAULT_REPLACEMENT_COST.OTHER;

    const oldAnnualMaint =
      decimalToNumber(component?.annualMaintenanceCostEstimate) ??
      DEFAULT_ANNUAL_MAINTENANCE[compType] ??
      DEFAULT_ANNUAL_MAINTENANCE.OTHER;

    const oldAnnualOp = decimalToNumber(component?.annualOperatingCostEstimate) ?? 0;

    // annualSavings can be provided directly in assumptions (e.g. insulation scenario)
    const directAnnualSavings = toNum(assumptions.annualSavings);
    const efficiencyGainPct = toNum(assumptions.efficiencyGainPercent) ?? 0;

    const annualMaintSavings = oldAnnualMaint * 0.80;
    const annualEnergySavings =
      directAnnualSavings != null
        ? directAnnualSavings
        : oldAnnualOp * (efficiencyGainPct / 100);

    const totalAnnualSavings = annualMaintSavings + annualEnergySavings;
    const paybackYears = totalAnnualSavings > 0 ? upfrontCost / totalAnnualSavings : null;
    const propertyValueChange =
      upfrontCost * (PROPERTY_VALUE_ROI[compType] ?? PROPERTY_VALUE_ROI.OTHER);

    const newUsefulLife = toNum(assumptions.newUsefulLifeYears);
    const riskReductionPct = toNum(assumptions.riskReductionPercent);

    // Confidence is higher when we have the component on record
    const hasComponent = component != null;

    impacts.push(
      {
        impactType: 'UPFRONT_COST',
        valueNumeric: upfrontCost,
        valueText: null,
        unit: 'USD',
        direction: 'NEGATIVE',
        confidenceScore: hasComponent ? 0.80 : 0.55,
        sortOrder: 0,
      },
      {
        impactType: 'ANNUAL_SAVINGS',
        valueNumeric: Math.round(totalAnnualSavings),
        valueText: null,
        unit: 'USD',
        direction: totalAnnualSavings > 0 ? 'POSITIVE' : 'NEUTRAL',
        confidenceScore: hasComponent ? 0.70 : 0.45,
        sortOrder: 1,
      },
      {
        impactType: 'PAYBACK_PERIOD',
        valueNumeric: paybackYears != null ? Math.round(paybackYears * 10) / 10 : null,
        valueText: paybackYears != null ? `${paybackYears.toFixed(1)} years` : 'N/A',
        unit: 'YEARS',
        direction: paybackYears != null && paybackYears <= 10 ? 'POSITIVE' : 'NEUTRAL',
        confidenceScore: 0.65,
        sortOrder: 2,
      },
      {
        impactType: 'PROPERTY_VALUE_CHANGE',
        valueNumeric: Math.round(propertyValueChange),
        valueText: null,
        unit: 'USD',
        direction: 'POSITIVE',
        confidenceScore: 0.50,
        sortOrder: 3,
      },
      {
        impactType: 'MAINTENANCE_COST_CHANGE',
        valueNumeric: -Math.round(annualMaintSavings),
        valueText: `Save ~$${Math.round(annualMaintSavings)}/yr on maintenance`,
        unit: 'USD',
        direction: annualMaintSavings > 0 ? 'POSITIVE' : 'NEUTRAL',
        confidenceScore: hasComponent ? 0.70 : 0.45,
        sortOrder: 4,
      },
    );

    // Energy savings impact (only when meaningful)
    if (annualEnergySavings > 0) {
      impacts.push({
        impactType: 'ENERGY_USE_CHANGE',
        valueNumeric: -Math.round(annualEnergySavings),
        valueText:
          efficiencyGainPct > 0
            ? `${efficiencyGainPct}% efficiency improvement`
            : `~$${Math.round(annualEnergySavings)}/yr energy savings`,
        unit: 'USD',
        direction: 'POSITIVE',
        confidenceScore: 0.60,
        sortOrder: 5,
      });
    }

    // Risk reduction: from explicit assumption or derived from old component state
    const derivedRiskReduction =
      riskReductionPct ??
      (component?.failureRiskScore != null
        ? Math.round(component.failureRiskScore * 80) // replacing clears ~80% of failure risk
        : null);

    if (derivedRiskReduction != null) {
      const riskText = newUsefulLife != null
        ? `${derivedRiskReduction}% risk reduction; new useful life ${newUsefulLife} yrs`
        : `${derivedRiskReduction}% risk reduction`;
      impacts.push({
        impactType: 'RISK_REDUCTION',
        valueNumeric: derivedRiskReduction,
        valueText: riskText,
        unit: 'PERCENT',
        direction: 'POSITIVE',
        confidenceScore: riskReductionPct != null ? 0.80 : 0.55,
        sortOrder: 6,
      });
    }

    // Insurance discount for components with known insurer response
    const insuranceFraction = INSURANCE_IMPACT_BY_COMPONENT[compType];
    if (insuranceFraction != null) {
      // Rough estimate: median US home insurance is ~$1,800/yr
      const estimatedAnnualPremium = 1800;
      const annualInsuranceSaving = Math.round(estimatedAnnualPremium * insuranceFraction);
      impacts.push({
        impactType: 'INSURANCE_IMPACT',
        valueNumeric: -annualInsuranceSaving,
        valueText: `~$${annualInsuranceSaving}/yr insurance discount (estimate)`,
        unit: 'USD',
        direction: 'POSITIVE',
        confidenceScore: 0.40, // heuristic — low confidence
        sortOrder: 7,
      });
    }

    // Comfort impact for relevant systems
    if (COMFORT_IMPACT_TYPES.has(compType)) {
      impacts.push({
        impactType: 'COMFORT_IMPACT',
        valueNumeric: null,
        valueText: `Improved comfort expected with new ${compType.toLowerCase().replace('_', ' ')}`,
        unit: null,
        direction: 'POSITIVE',
        confidenceScore: 0.75,
        sortOrder: 8,
      });
    }

  // ── ENERGY_IMPROVEMENT ─────────────────────────────────────────────────────
  } else if (scenarioType === 'ENERGY_IMPROVEMENT') {
    const upfrontCost = toNum(inputPayload.upfrontCost) ?? 0;
    const annualSavings = toNum(inputPayload.energySavingsPerYear) ?? 0;
    const paybackYears = annualSavings > 0 ? upfrontCost / annualSavings : null;
    const carbonOffset = toNum(inputPayload.carbonOffsetTonsCO2PerYear);
    const comfortDesc = inputPayload.comfortImpactDescription as string | undefined;
    const resilienceDesc = inputPayload.resilienceImpactDescription as string | undefined;

    impacts.push(
      {
        impactType: 'UPFRONT_COST',
        valueNumeric: upfrontCost,
        valueText: null,
        unit: 'USD',
        direction: 'NEGATIVE',
        confidenceScore: 0.85,
        sortOrder: 0,
      },
      {
        impactType: 'ANNUAL_SAVINGS',
        valueNumeric: annualSavings,
        valueText: null,
        unit: 'USD',
        direction: annualSavings > 0 ? 'POSITIVE' : 'NEUTRAL',
        confidenceScore: 0.75,
        sortOrder: 1,
      },
      {
        impactType: 'PAYBACK_PERIOD',
        valueNumeric: paybackYears != null ? Math.round(paybackYears * 10) / 10 : null,
        valueText: paybackYears != null ? `${paybackYears.toFixed(1)} years` : 'N/A',
        unit: 'YEARS',
        direction: paybackYears != null && paybackYears <= 10 ? 'POSITIVE' : 'NEUTRAL',
        confidenceScore: 0.70,
        sortOrder: 2,
      },
      {
        impactType: 'ENERGY_USE_CHANGE',
        valueNumeric: -annualSavings,
        valueText: null,
        unit: 'USD',
        direction: annualSavings > 0 ? 'POSITIVE' : 'NEUTRAL',
        confidenceScore: 0.70,
        sortOrder: 3,
      },
    );

    if (carbonOffset != null && carbonOffset > 0) {
      impacts.push({
        impactType: 'EMISSIONS_IMPACT',
        valueNumeric: -carbonOffset,
        valueText: `${carbonOffset} ton(s) CO₂/yr offset`,
        unit: 'TONS_CO2',
        direction: 'POSITIVE',
        confidenceScore: 0.55,
        sortOrder: 4,
      });
    }

    if (comfortDesc) {
      impacts.push({
        impactType: 'COMFORT_IMPACT',
        valueNumeric: null,
        valueText: comfortDesc,
        unit: null,
        direction: 'POSITIVE',
        confidenceScore: 0.65,
        sortOrder: 5,
      });
    }

    if (resilienceDesc) {
      impacts.push({
        impactType: 'RISK_REDUCTION',
        valueNumeric: null,
        valueText: resilienceDesc,
        unit: null,
        direction: 'POSITIVE',
        confidenceScore: 0.50,
        sortOrder: 6,
      });
    }

  // ── RESILIENCE_IMPROVEMENT ─────────────────────────────────────────────────
  } else if (scenarioType === 'RESILIENCE_IMPROVEMENT') {
    const upfrontCost = toNum(inputPayload.upfrontCost) ?? 0;
    const riskReductionPct = toNum(inputPayload.riskReductionPercent);
    const insuranceSavings = toNum(inputPayload.estimatedInsuranceSavingsPerYear);
    const propertyValueChange = toNum(inputPayload.estimatedPropertyValueChange);
    const resilienceDesc = inputPayload.resilienceImpactDescription as string | undefined;

    impacts.push({
      impactType: 'UPFRONT_COST',
      valueNumeric: upfrontCost,
      valueText: null,
      unit: 'USD',
      direction: 'NEGATIVE',
      confidenceScore: 0.85,
      sortOrder: 0,
    });

    impacts.push({
      impactType: 'RISK_REDUCTION',
      valueNumeric: riskReductionPct,
      valueText:
        riskReductionPct != null
          ? `${riskReductionPct}% risk reduction`
          : resilienceDesc ?? null,
      unit: riskReductionPct != null ? 'PERCENT' : null,
      direction: 'POSITIVE',
      confidenceScore: riskReductionPct != null ? 0.65 : 0.45,
      sortOrder: 1,
    });

    if (insuranceSavings != null && insuranceSavings > 0) {
      const payback = insuranceSavings > 0 ? upfrontCost / insuranceSavings : null;
      impacts.push(
        {
          impactType: 'INSURANCE_IMPACT',
          valueNumeric: -insuranceSavings,
          valueText: `Save ~$${insuranceSavings}/yr on insurance`,
          unit: 'USD',
          direction: 'POSITIVE',
          confidenceScore: 0.55,
          sortOrder: 2,
        },
        {
          impactType: 'PAYBACK_PERIOD',
          valueNumeric: payback != null ? Math.round(payback * 10) / 10 : null,
          valueText: payback != null ? `${payback.toFixed(1)} years` : 'N/A',
          unit: 'YEARS',
          direction: payback != null && payback <= 10 ? 'POSITIVE' : 'NEUTRAL',
          confidenceScore: 0.55,
          sortOrder: 3,
        },
      );
    }

    if (propertyValueChange != null) {
      impacts.push({
        impactType: 'PROPERTY_VALUE_CHANGE',
        valueNumeric: propertyValueChange,
        valueText: null,
        unit: 'USD',
        direction: propertyValueChange >= 0 ? 'POSITIVE' : 'NEGATIVE',
        confidenceScore: 0.40,
        sortOrder: 4,
      });
    }

  // ── ADD_FEATURE / RENOVATION ───────────────────────────────────────────────
  } else if (scenarioType === 'ADD_FEATURE' || scenarioType === 'RENOVATION') {
    const upfrontCost = toNum(inputPayload.upfrontCost) ?? 0;
    const propertyValueChange = toNum(inputPayload.estimatedPropertyValueChange);
    const annualSavings = toNum(inputPayload.annualSavings);

    impacts.push({
      impactType: 'UPFRONT_COST',
      valueNumeric: upfrontCost,
      valueText: null,
      unit: 'USD',
      direction: 'NEGATIVE',
      confidenceScore: 0.80,
      sortOrder: 0,
    });

    if (propertyValueChange != null) {
      impacts.push({
        impactType: 'PROPERTY_VALUE_CHANGE',
        valueNumeric: propertyValueChange,
        valueText: null,
        unit: 'USD',
        direction: propertyValueChange >= 0 ? 'POSITIVE' : 'NEGATIVE',
        confidenceScore: 0.45,
        sortOrder: 1,
      });
    }

    if (annualSavings != null) {
      const payback = annualSavings > 0 ? upfrontCost / annualSavings : null;
      impacts.push(
        {
          impactType: 'ANNUAL_SAVINGS',
          valueNumeric: annualSavings,
          valueText: null,
          unit: 'USD',
          direction: annualSavings >= 0 ? 'POSITIVE' : 'NEGATIVE',
          confidenceScore: 0.55,
          sortOrder: 2,
        },
        {
          impactType: 'PAYBACK_PERIOD',
          valueNumeric: payback != null ? Math.round(payback * 10) / 10 : null,
          valueText: payback != null ? `${payback.toFixed(1)} years` : 'N/A',
          unit: 'YEARS',
          direction: payback != null && payback <= 10 ? 'POSITIVE' : 'NEUTRAL',
          confidenceScore: 0.50,
          sortOrder: 3,
        },
      );
    }

  // ── REMOVE_FEATURE ─────────────────────────────────────────────────────────
  } else if (scenarioType === 'REMOVE_FEATURE') {
    const removalCost = toNum(inputPayload.removalCost) ?? 0;
    const annualSavings = toNum(inputPayload.annualSavings);
    const propertyValueChange = toNum(inputPayload.estimatedPropertyValueChange);

    if (removalCost > 0) {
      impacts.push({
        impactType: 'UPFRONT_COST',
        valueNumeric: removalCost,
        valueText: null,
        unit: 'USD',
        direction: 'NEGATIVE',
        confidenceScore: 0.75,
        sortOrder: 0,
      });
    }

    if (annualSavings != null) {
      impacts.push({
        impactType: 'ANNUAL_SAVINGS',
        valueNumeric: annualSavings,
        valueText: null,
        unit: 'USD',
        direction: annualSavings >= 0 ? 'POSITIVE' : 'NEGATIVE',
        confidenceScore: 0.60,
        sortOrder: 1,
      });
    }

    if (propertyValueChange != null) {
      impacts.push({
        impactType: 'PROPERTY_VALUE_CHANGE',
        valueNumeric: propertyValueChange,
        valueText: null,
        unit: 'USD',
        direction: propertyValueChange >= 0 ? 'POSITIVE' : 'NEGATIVE',
        confidenceScore: 0.40,
        sortOrder: 2,
      });
    }

  // ── CUSTOM ─────────────────────────────────────────────────────────────────
  } else {
    const expectedImpacts = inputPayload.expectedImpacts;
    if (Array.isArray(expectedImpacts)) {
      expectedImpacts.forEach((ei: unknown, idx: number) => {
        const item = ei as Record<string, unknown>;
        impacts.push({
          impactType: (item.impactType as HomeTwinImpactType) ?? 'CUSTOM',
          valueNumeric: toNum(item.valueNumeric),
          valueText: item.valueText != null ? String(item.valueText) : null,
          unit: item.unit != null ? String(item.unit) : null,
          direction: (item.direction as HomeTwinImpactDirection) ?? 'UNKNOWN',
          confidenceScore: toNum(item.confidenceScore),
          sortOrder: idx,
        });
      });
    }
  }

  return impacts;
}

// ============================================================================
// SERVICE
// ============================================================================

export class HomeDigitalTwinScenarioService {
  // ── List ────────────────────────────────────────────────────────────────────
  async listScenarios(
    digitalTwinId: string,
    filters: { status?: HomeTwinScenarioStatus; includeArchived?: boolean },
  ) {
    const where: Prisma.HomeTwinScenarioWhereInput = {
      digitalTwinId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(!filters.includeArchived ? { isArchived: false } : {}),
    };

    return prisma.homeTwinScenario.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      include: { impacts: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  // ── Get one ─────────────────────────────────────────────────────────────────
  async getScenario(scenarioId: string, digitalTwinId: string) {
    const scenario = await prisma.homeTwinScenario.findFirst({
      where: { id: scenarioId, digitalTwinId },
      include: { impacts: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!scenario) {
      throw new APIError('Scenario not found', 404, 'SCENARIO_NOT_FOUND');
    }
    return scenario;
  }

  // ── Create ──────────────────────────────────────────────────────────────────
  async createScenario(
    digitalTwinId: string,
    propertyId: string,
    createdByUserId: string,
    input: CreateScenarioInput,
  ) {
    const twin = await prisma.homeDigitalTwin.findUniqueOrThrow({
      where: { id: digitalTwinId },
      select: { completenessScore: true, confidenceScore: true, status: true, version: true },
    });

    const scenario = await prisma.homeTwinScenario.create({
      data: {
        digitalTwinId,
        propertyId,
        createdByUserId,
        name: input.name,
        scenarioType: input.scenarioType,
        status: 'DRAFT',
        description: input.description ?? null,
        inputPayload: input.inputPayload as Prisma.InputJsonValue,
        baselineSnapshot: {
          completenessScore: twin.completenessScore,
          confidenceScore: twin.confidenceScore,
          twinStatus: twin.status,
          twinVersion: twin.version,
        },
        isPinned: input.isPinned ?? false,
        isArchived: false,
      },
      include: { impacts: true },
    });

    console.log(
      `[HomeDigitalTwin] scenario created — id=${scenario.id} type=${input.scenarioType} property=${propertyId}`,
    );

    return scenario;
  }

  // ── Update (archive / pin) ───────────────────────────────────────────────
  async updateScenario(
    scenarioId: string,
    digitalTwinId: string,
    input: UpdateScenarioInput,
  ) {
    const existing = await prisma.homeTwinScenario.findFirst({
      where: { id: scenarioId, digitalTwinId },
      select: { id: true },
    });
    if (!existing) {
      throw new APIError('Scenario not found', 404, 'SCENARIO_NOT_FOUND');
    }

    return prisma.homeTwinScenario.update({
      where: { id: scenarioId },
      data: {
        ...(input.isPinned !== undefined && { isPinned: input.isPinned }),
        ...(input.isArchived !== undefined && { isArchived: input.isArchived }),
      },
      include: { impacts: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  // ── Compute ─────────────────────────────────────────────────────────────────
  async computeScenario(scenarioId: string, digitalTwinId: string) {
    const scenario = await prisma.homeTwinScenario.findFirst({
      where: { id: scenarioId, digitalTwinId },
    });
    if (!scenario) {
      throw new APIError('Scenario not found', 404, 'SCENARIO_NOT_FOUND');
    }

    const inputPayload = scenario.inputPayload as Record<string, unknown>;

    // Load the relevant component for replace/upgrade scenarios
    let component: {
      componentType: HomeTwinComponentType;
      estimatedAgeYears: number | null;
      conditionScore: number | null;
      failureRiskScore: number | null;
      annualMaintenanceCostEstimate: Prisma.Decimal | null;
      annualOperatingCostEstimate: Prisma.Decimal | null;
      replacementCostEstimate: Prisma.Decimal | null;
    } | null = null;

    if (
      scenario.scenarioType === 'REPLACE_COMPONENT' ||
      scenario.scenarioType === 'UPGRADE_COMPONENT'
    ) {
      const compType = inputPayload.componentType as HomeTwinComponentType | undefined;
      if (compType) {
        component = await prisma.homeTwinComponent.findFirst({
          where: { digitalTwinId, componentType: compType },
          select: {
            componentType: true,
            estimatedAgeYears: true,
            conditionScore: true,
            failureRiskScore: true,
            annualMaintenanceCostEstimate: true,
            annualOperatingCostEstimate: true,
            replacementCostEstimate: true,
          },
          orderBy: { createdAt: 'desc' },
        });
      }
    }

    const impactSpecs = computeImpacts(scenario.scenarioType, inputPayload, component);

    // Atomically replace old impacts and mark computed
    await prisma.$transaction(async (tx) => {
      await tx.homeTwinScenarioImpact.deleteMany({ where: { scenarioId } });

      if (impactSpecs.length > 0) {
        await tx.homeTwinScenarioImpact.createMany({
          data: impactSpecs.map((s) => ({ ...s, scenarioId })),
        });
      }

      await tx.homeTwinScenario.update({
        where: { id: scenarioId },
        data: { status: 'COMPUTED', lastComputedAt: new Date() },
      });
    });

    console.log(
      `[HomeDigitalTwin] scenario computed — id=${scenarioId} type=${scenario.scenarioType} impacts=${impactSpecs.length}`,
    );

    return prisma.homeTwinScenario.findUniqueOrThrow({
      where: { id: scenarioId },
      include: { impacts: { orderBy: { sortOrder: 'asc' } } },
    });
  }
}
