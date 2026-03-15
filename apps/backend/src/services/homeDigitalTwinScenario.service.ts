/**
 * HomeDigitalTwinScenarioService
 *
 * Manages HomeTwinScenario CRUD and MVP scenario impact computation.
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
// DEFAULT REPLACEMENT COSTS BY COMPONENT TYPE
// (mirrors builder defaults, kept in sync manually for MVP)
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

// Property value ROI multiplier per component type (fraction of replacement cost)
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
    annualMaintenanceCostEstimate: Prisma.Decimal | null;
    annualOperatingCostEstimate: Prisma.Decimal | null;
    replacementCostEstimate: Prisma.Decimal | null;
  } | null,
): ImpactSpec[] {
  const impacts: ImpactSpec[] = [];

  if (
    scenarioType === 'REPLACE_COMPONENT' ||
    scenarioType === 'UPGRADE_COMPONENT'
  ) {
    const assumptions = (inputPayload.assumptions as Record<string, unknown>) ?? {};
    const compType = (inputPayload.componentType as HomeTwinComponentType) ?? 'OTHER';

    const upfrontCost =
      toNum(assumptions.replacementCost) ??
      decimalToNumber(component?.replacementCostEstimate) ??
      DEFAULT_REPLACEMENT_COST[compType] ??
      DEFAULT_REPLACEMENT_COST.OTHER;

    const oldAnnualMaint =
      decimalToNumber(component?.annualMaintenanceCostEstimate) ??
      DEFAULT_ANNUAL_MAINTENANCE[compType] ??
      DEFAULT_ANNUAL_MAINTENANCE.OTHER;

    const efficiencyGainPct = toNum(assumptions.efficiencyGainPercent) ?? 0;
    const oldAnnualOp =
      decimalToNumber(component?.annualOperatingCostEstimate) ?? 0;

    const annualMaintSavings = oldAnnualMaint * 0.80;
    const annualEnergySavings = oldAnnualOp * (efficiencyGainPct / 100);
    const totalAnnualSavings = annualMaintSavings + annualEnergySavings;
    const paybackYears = totalAnnualSavings > 0 ? upfrontCost / totalAnnualSavings : null;
    const propertyValueChange =
      upfrontCost * (PROPERTY_VALUE_ROI[compType] ?? PROPERTY_VALUE_ROI.OTHER);

    const newUsefulLife = toNum(assumptions.newUsefulLifeYears) ?? null;

    impacts.push(
      {
        impactType: 'UPFRONT_COST',
        valueNumeric: upfrontCost,
        valueText: null,
        unit: 'USD',
        direction: 'NEGATIVE',
        confidenceScore: component ? 0.80 : 0.55,
        sortOrder: 0,
      },
      {
        impactType: 'ANNUAL_SAVINGS',
        valueNumeric: Math.round(totalAnnualSavings),
        valueText: null,
        unit: 'USD',
        direction: totalAnnualSavings > 0 ? 'POSITIVE' : 'NEUTRAL',
        confidenceScore: component ? 0.70 : 0.45,
        sortOrder: 1,
      },
      {
        impactType: 'PAYBACK_PERIOD',
        valueNumeric: paybackYears != null ? Math.round(paybackYears * 10) / 10 : null,
        valueText: paybackYears != null ? `${(paybackYears).toFixed(1)} years` : 'N/A',
        unit: 'YEARS',
        direction: paybackYears != null && paybackYears < 10 ? 'POSITIVE' : 'NEUTRAL',
        confidenceScore: 0.65,
        sortOrder: 2,
      },
      {
        impactType: 'PROPERTY_VALUE_CHANGE',
        valueNumeric: Math.round(propertyValueChange),
        valueText: null,
        unit: 'USD',
        direction: 'POSITIVE',
        confidenceScore: 0.55,
        sortOrder: 3,
      },
      {
        impactType: 'MAINTENANCE_COST_CHANGE',
        valueNumeric: -Math.round(annualMaintSavings),
        valueText: `Save ~$${Math.round(annualMaintSavings)}/yr`,
        unit: 'USD',
        direction: annualMaintSavings > 0 ? 'POSITIVE' : 'NEUTRAL',
        confidenceScore: 0.70,
        sortOrder: 4,
      },
    );

    if (efficiencyGainPct > 0) {
      impacts.push({
        impactType: 'ENERGY_USE_CHANGE',
        valueNumeric: -Math.round(annualEnergySavings),
        valueText: `${efficiencyGainPct}% efficiency improvement`,
        unit: 'USD',
        direction: 'POSITIVE',
        confidenceScore: 0.65,
        sortOrder: 5,
      });
    }

    if (newUsefulLife != null) {
      impacts.push({
        impactType: 'RISK_REDUCTION',
        valueNumeric: null,
        valueText: `New useful life: ${newUsefulLife} years`,
        unit: 'YEARS',
        direction: 'POSITIVE',
        confidenceScore: 0.75,
        sortOrder: 6,
      });
    }
  } else if (scenarioType === 'ENERGY_IMPROVEMENT') {
    const upfrontCost = toNum(inputPayload.upfrontCost) ?? 0;
    const annualSavings = toNum(inputPayload.energySavingsPerYear) ?? 0;
    const paybackYears = annualSavings > 0 ? upfrontCost / annualSavings : null;
    const carbonOffset = toNum(inputPayload.carbonOffsetTonsCO2PerYear);

    impacts.push(
      {
        impactType: 'UPFRONT_COST',
        valueNumeric: upfrontCost,
        valueText: null,
        unit: 'USD',
        direction: 'NEGATIVE',
        confidenceScore: 0.80,
        sortOrder: 0,
      },
      {
        impactType: 'ANNUAL_SAVINGS',
        valueNumeric: annualSavings,
        valueText: null,
        unit: 'USD',
        direction: annualSavings > 0 ? 'POSITIVE' : 'NEUTRAL',
        confidenceScore: 0.70,
        sortOrder: 1,
      },
      {
        impactType: 'PAYBACK_PERIOD',
        valueNumeric: paybackYears != null ? Math.round(paybackYears * 10) / 10 : null,
        valueText: paybackYears != null ? `${paybackYears.toFixed(1)} years` : 'N/A',
        unit: 'YEARS',
        direction: paybackYears != null && paybackYears < 10 ? 'POSITIVE' : 'NEUTRAL',
        confidenceScore: 0.65,
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

    if (carbonOffset != null) {
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
  } else if (scenarioType === 'RESILIENCE_IMPROVEMENT') {
    const upfrontCost = toNum(inputPayload.upfrontCost) ?? 0;
    const riskReductionPct = toNum(inputPayload.riskReductionPercent);
    const insuranceSavings = toNum(inputPayload.estimatedInsuranceSavingsPerYear);

    impacts.push(
      {
        impactType: 'UPFRONT_COST',
        valueNumeric: upfrontCost,
        valueText: null,
        unit: 'USD',
        direction: 'NEGATIVE',
        confidenceScore: 0.80,
        sortOrder: 0,
      },
      {
        impactType: 'RISK_REDUCTION',
        valueNumeric: riskReductionPct,
        valueText: riskReductionPct != null ? `${riskReductionPct}% risk reduction` : null,
        unit: 'PERCENT',
        direction: 'POSITIVE',
        confidenceScore: 0.55,
        sortOrder: 1,
      },
    );

    if (insuranceSavings != null) {
      impacts.push({
        impactType: 'INSURANCE_IMPACT',
        valueNumeric: -insuranceSavings,
        valueText: `Save ~$${insuranceSavings}/yr on insurance`,
        unit: 'USD',
        direction: 'POSITIVE',
        confidenceScore: 0.45,
        sortOrder: 2,
      });
    }
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
      confidenceScore: 0.75,
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
      impacts.push({
        impactType: 'ANNUAL_SAVINGS',
        valueNumeric: annualSavings,
        valueText: null,
        unit: 'USD',
        direction: annualSavings >= 0 ? 'POSITIVE' : 'NEGATIVE',
        confidenceScore: 0.55,
        sortOrder: 2,
      });
    }
  } else {
    // CUSTOM or REMOVE_FEATURE — use whatever the user provided
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
      include: {
        impacts: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  // ── Get one ─────────────────────────────────────────────────────────────────
  async getScenario(scenarioId: string, digitalTwinId: string) {
    const scenario = await prisma.homeTwinScenario.findFirst({
      where: { id: scenarioId, digitalTwinId },
      include: {
        impacts: { orderBy: { sortOrder: 'asc' } },
      },
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
    // Snapshot current twin state at creation time
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

    return scenario;
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

    // Find the relevant component in the twin (for REPLACE/UPGRADE scenarios)
    let component: {
      componentType: HomeTwinComponentType;
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
            annualMaintenanceCostEstimate: true,
            annualOperatingCostEstimate: true,
            replacementCostEstimate: true,
          },
          orderBy: { createdAt: 'desc' },
        });
      }
    }

    // Compute impacts
    const impactSpecs = computeImpacts(scenario.scenarioType, inputPayload, component);

    // Persist: delete old impacts, create new ones, update scenario status
    await prisma.$transaction(async (tx) => {
      await tx.homeTwinScenarioImpact.deleteMany({ where: { scenarioId } });

      if (impactSpecs.length > 0) {
        await tx.homeTwinScenarioImpact.createMany({
          data: impactSpecs.map((s) => ({ ...s, scenarioId })),
        });
      }

      await tx.homeTwinScenario.update({
        where: { id: scenarioId },
        data: {
          status: 'COMPUTED',
          lastComputedAt: new Date(),
        },
      });
    });

    return prisma.homeTwinScenario.findUniqueOrThrow({
      where: { id: scenarioId },
      include: { impacts: { orderBy: { sortOrder: 'asc' } } },
    });
  }
}
