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
  HomeTwinScenarioDecisionStatus,
  HomeTwinImpactType,
  HomeTwinImpactDirection,
  HomeTwinImpactSourceClass,
  HomeTwinComponentType,
  ProjectType,
  InventoryItemCategory,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { logger } from '../lib/logger';
import { isScenarioComputeDisabled } from '../config/homeDigitalTwinOperationalControls';
import { findInFlightRun } from './homeDigitalTwinRunLock';
import { payloadSchemaFor } from '../validators/homeDigitalTwin.validators';

// ============================================================================
// TYPES
// ============================================================================

export type CreateScenarioInput = {
  name: string;
  scenarioType: HomeTwinScenarioType;
  description?: string | null;
  inputPayload: Record<string, unknown>;
  isPinned?: boolean;
  // The specific real system this decision is about. See
  // HomeTwinScenario.componentId in the schema for why this matters now
  // that a property can have multiple components of the same type.
  componentId?: string | null;
};

export type UpdateScenarioInput = {
  isPinned?: boolean;
  isArchived?: boolean;
  name?: string;
  description?: string | null;
  inputPayload?: Record<string, unknown>;
};

type ImpactSpec = {
  impactType: HomeTwinImpactType;
  valueNumeric: number | null;
  valueLow?: number | null;
  valueHigh?: number | null;
  valueText: string | null;
  unit: string | null;
  direction: HomeTwinImpactDirection;
  confidenceScore: number | null;
  sortOrder: number;
  // True when values are caller-supplied or calculated from caller-supplied
  // assumptions. Such rows remain in the input-assumption boundary even when
  // the arithmetic itself is deterministic.
  isUserSupplied: boolean;
};

type ComponentRecord = {
  id: string;
  componentType: HomeTwinComponentType;
  identityKey: string;
  sourceType: string;
  sourceReferenceId: string | null;
  installYear: number | null;
  estimatedAgeYears: number | null;
  conditionScore: number | null;
  usefulLifeYears: number | null;
  annualMaintenanceCostEstimate: Prisma.Decimal | null;
  annualOperatingCostEstimate: Prisma.Decimal | null;
  replacementCostEstimate: Prisma.Decimal | null;
  lastModeledAt: Date | null;
  projectedFacts: Array<{
    fieldName: string;
    factState: string;
    sourceType: string;
    sourceRecordType: string | null;
    sourceRecordId: string | null;
    sourceField: string | null;
    observedAt: Date | null;
    derivationMethod: string | null;
    derivationVersion: number;
    modelVersion: string;
    sourceVerified: boolean | null;
  }>;
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

// Components where replacing has notable comfort impact
const COMFORT_IMPACT_TYPES = new Set<HomeTwinComponentType>([
  'HVAC',
  'INSULATION',
  'WINDOWS',
]);

// A repair is assumed to cost this fraction of full replacement, and to
// address the immediate issue without resetting overall age-related risk
// the way a replacement does. Both are reviewed rough planning defaults,
// not quotes — see the wide uncertainty band applied via rangeFromPoint.
const REPAIR_COST_FRACTION_OF_REPLACEMENT = 0.3;
const REPAIR_DEFAULT_EXTENDED_LIFE_YEARS = 3;

// Category-specific professional/safety boundary shown alongside any
// scenario touching that component type — HDT: "a safe recommendation
// boundary" must accompany safety-sensitive systems, not just cost/savings
// figures.
const SAFETY_BOUNDARY_BY_COMPONENT: Partial<Record<HomeTwinComponentType, string>> = {
  ELECTRICAL: 'Electrical panel and wiring work should be scoped and performed by a licensed electrician. Do not attempt panel or wiring work yourself.',
  ROOF: 'Roof condition should be confirmed by a physical inspection before committing to repair or replacement — age and evidence-based estimates cannot substitute for seeing the actual surface and flashing.',
  FOUNDATION: 'Foundation issues should be evaluated by a structural engineer or licensed contractor before any repair decision — this estimate is a planning range, not a structural assessment.',
};

// Maps a component type to the Project Tracker's own category/type
// vocabulary, so "create a project from this decision" can hand off to the
// existing project creation flow pre-filled instead of asking the homeowner
// to re-describe what they just decided (HDT slice 5: "move from question to
// decision to accepted next action without duplicate entry").
const PROJECT_TYPE_BY_COMPONENT: Partial<Record<HomeTwinComponentType, ProjectType>> = {
  ROOF: 'ROOF_REPLACEMENT',
  HVAC: 'HVAC_REPLACEMENT',
  WATER_HEATER: 'WATER_HEATER',
  PLUMBING: 'PLUMBING_REPIPING',
  ELECTRICAL: 'ELECTRICAL_PANEL',
  WINDOWS: 'WINDOW_REPLACEMENT',
  SOLAR: 'SOLAR_INSTALLATION',
  FLOORING: 'FLOORING',
  FOUNDATION: 'FOUNDATION_WORK',
};

const CATEGORY_BY_COMPONENT: Record<HomeTwinComponentType, InventoryItemCategory> = {
  ROOF: 'ROOF_EXTERIOR',
  HVAC: 'HVAC',
  WATER_HEATER: 'PLUMBING',
  PLUMBING: 'PLUMBING',
  ELECTRICAL: 'ELECTRICAL',
  INSULATION: 'STRUCTURAL',
  WINDOWS: 'EXTERIOR',
  SOLAR: 'EXTERIOR',
  FLOORING: 'INTERIOR',
  EXTERIOR: 'EXTERIOR',
  FOUNDATION: 'STRUCTURAL',
  APPLIANCE: 'APPLIANCE',
  OTHER: 'OTHER',
};

/**
 * Only HVAC has a dedicated "_REPAIR" ProjectType — every other component
 * falls back to GENERAL_REPAIR for a repair-only scenario rather than
 * mislabeling a repair as a replacement project.
 */
export function projectContextForScenario(
  componentType: HomeTwinComponentType | null,
  scenarioType: HomeTwinScenarioType,
): { projectType: ProjectType; category: InventoryItemCategory | null } {
  const category = componentType ? CATEGORY_BY_COMPONENT[componentType] : null;
  if (scenarioType === 'MAINTAIN_COMPONENT' || scenarioType === 'REPAIR_COMPONENT') {
    return { projectType: componentType === 'HVAC' ? 'HVAC_REPAIR' : 'GENERAL_REPAIR', category };
  }
  return { projectType: (componentType && PROJECT_TYPE_BY_COMPONENT[componentType]) || 'CUSTOM', category };
}

/**
 * Turns a point estimate into a low/base/high range, with the spread
 * reflecting how much basis the estimate actually has:
 *  - a real component/inventory record narrows the range
 *  - a category default (no home-specific data) widens it
 * This is the mechanism behind HDT-004 ("use ranges rather than
 * unsupported point values") — every system-computed dollar figure below
 * goes through this rather than being presented as a single confident
 * number.
 */
export function rangeFromPoint(base: number, uncertaintyPct: number): { low: number; base: number; high: number } {
  const spread = Math.abs(base) * uncertaintyPct;
  return {
    low: Math.round(base - spread),
    base: Math.round(base),
    high: Math.round(base + spread),
  };
}

type SensitivityFactor = {
  assumption: string;
  baselineYears: number | null;
  lowYears: number | null;
  highYears: number | null;
  swingYears: number;
};

/**
 * Which assumption (cost vs. savings) moves the payback estimate more,
 * holding the other fixed at its base value. This is what "sensitivity
 * analysis" means for a two-input payback calculation — not a fabricated
 * confidence claim, just: if you're going to double-check one number
 * before trusting this range, check the one with the bigger swing.
 */
export function computePaybackSensitivity(
  costBase: number,
  costUncertaintyPct: number,
  savingsBase: number,
  savingsUncertaintyPct: number,
): SensitivityFactor[] {
  if (savingsBase <= 0) return [];
  const paybackAt = (cost: number, savings: number): number | null => (savings > 0 ? cost / savings : null);
  const baseline = paybackAt(costBase, savingsBase);

  const costLow = paybackAt(costBase * (1 - costUncertaintyPct), savingsBase);
  const costHigh = paybackAt(costBase * (1 + costUncertaintyPct), savingsBase);
  const costSwing = costLow != null && costHigh != null ? Math.abs(costHigh - costLow) : 0;

  // Higher savings shortens payback, so the "low" payback case is at high savings.
  const savingsLowPayback = paybackAt(costBase, savingsBase * (1 + savingsUncertaintyPct));
  const savingsHighPayback = paybackAt(costBase, savingsBase * (1 - savingsUncertaintyPct));
  const savingsSwing = savingsLowPayback != null && savingsHighPayback != null
    ? Math.abs(savingsHighPayback - savingsLowPayback)
    : 0;

  const round1 = (n: number | null) => (n != null ? Math.round(n * 10) / 10 : null);

  return [
    {
      assumption: 'Upfront cost estimate',
      baselineYears: round1(baseline),
      lowYears: round1(costLow),
      highYears: round1(costHigh),
      swingYears: round1(costSwing) ?? 0,
    },
    {
      assumption: 'Annual savings estimate',
      baselineYears: round1(baseline),
      lowYears: round1(savingsLowPayback),
      highYears: round1(savingsHighPayback),
      swingYears: round1(savingsSwing) ?? 0,
    },
  ].sort((a, b) => b.swingYears - a.swingYears);
}

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

type PersistedImpactSpec = ImpactSpec & {
  sourceClass: HomeTwinImpactSourceClass;
  sourceAsOf: Date;
  assumptionsJson: Prisma.InputJsonValue;
  qualificationText: string;
};

export function qualifyImpact(
  impact: ImpactSpec,
  inputPayload: Record<string, unknown>,
  component: ComponentRecord | null,
  computedAt: Date,
): PersistedImpactSpec {
  if (impact.isUserSupplied) {
    return {
      ...impact,
      sourceClass: 'HOMEOWNER_ASSUMPTION',
      sourceAsOf: computedAt,
      assumptionsJson: inputPayload as Prisma.InputJsonValue,
      qualificationText:
        'Entered or calculated from input assumptions; not independently verified.',
    };
  }

  const costFact = component?.projectedFacts.find(
    (fact) => fact.fieldName === 'replacementCostEstimate',
  );
  const canonicalCost =
    impact.impactType === 'UPFRONT_COST' &&
    costFact &&
    ['VERIFIED', 'REPORTED', 'DOCUMENT_DERIVED'].includes(costFact.factState);
  const categoryDefault =
    impact.impactType === 'UPFRONT_COST' &&
    (!costFact || ['DEFAULT', 'INFERRED', 'UNKNOWN'].includes(costFact.factState));

  return {
    ...impact,
    sourceClass: canonicalCost
      ? 'CANONICAL_RECORD'
      : categoryDefault
        ? 'CATEGORY_DEFAULT'
        : 'SYSTEM_CALCULATION',
    sourceAsOf: costFact?.observedAt ?? component?.lastModeledAt ?? computedAt,
    assumptionsJson: inputPayload as Prisma.InputJsonValue,
    qualificationText: canonicalCost
      ? 'Calculated from a recorded home-system cost; verify current market pricing before committing.'
      : categoryDefault
        ? 'Broad category planning default, not a quote.'
        : 'Deterministic planning calculation from the disclosed model inputs.',
  };
}

export function reconcileActualCost(
  impacts: Array<{
    impactType: HomeTwinImpactType;
    valueLow: number | null;
    valueHigh: number | null;
    valueNumeric: number | null;
    sourceClass: HomeTwinImpactSourceClass;
  }>,
  actualCostCents: number,
) {
  const projectedCost = impacts.find((impact) => impact.impactType === 'UPFRONT_COST');
  const projectedCostLow = projectedCost?.valueLow ?? projectedCost?.valueNumeric ?? null;
  const projectedCostHigh = projectedCost?.valueHigh ?? projectedCost?.valueNumeric ?? null;
  const projectedMidCents = projectedCostLow != null && projectedCostHigh != null
    ? Math.round(((projectedCostLow + projectedCostHigh) / 2) * 100)
    : null;
  return {
    projectedCostLow,
    projectedCostHigh,
    projectedCostSourceClass: projectedCost?.sourceClass ?? null,
    actualCostCents,
    varianceCents: projectedMidCents != null ? actualCostCents - projectedMidCents : null,
  };
}

// ============================================================================
// IMPACT COMPUTATION
// ============================================================================

export function computeImpacts(
  scenarioType: HomeTwinScenarioType,
  inputPayload: Record<string, unknown>,
  component: ComponentRecord | null,
): { impacts: ImpactSpec[]; sensitivity: SensitivityFactor[] } {
  const impacts: ImpactSpec[] = [];
  let sensitivity: SensitivityFactor[] = [];

  // ── MAINTAIN_COMPONENT ───────────────────────────────────────────────────
  if (scenarioType === 'MAINTAIN_COMPONENT') {
    const assumptions = (inputPayload.assumptions as Record<string, unknown>) ?? {};
    const compType = (inputPayload.componentType as HomeTwinComponentType) ?? component?.componentType ?? 'OTHER';
    const suppliedCost = toNum(assumptions.maintenanceCost);
    const maintenanceCost =
      suppliedCost ??
      decimalToNumber(component?.annualMaintenanceCostEstimate) ??
      DEFAULT_ANNUAL_MAINTENANCE[compType] ??
      DEFAULT_ANNUAL_MAINTENANCE.OTHER;
    const costRange = rangeFromPoint(maintenanceCost, suppliedCost != null ? 0.15 : 0.35);
    const intervalMonths = toNum(assumptions.serviceIntervalMonths) ?? 12;
    impacts.push(
      {
        impactType: 'UPFRONT_COST',
        valueNumeric: costRange.base,
        valueLow: costRange.low,
        valueHigh: costRange.high,
        valueText: null,
        unit: 'USD',
        direction: 'NEGATIVE',
        confidenceScore: suppliedCost != null ? 0.65 : component ? 0.5 : 0.3,
        sortOrder: 0,
        isUserSupplied: suppliedCost != null,
      },
      {
        impactType: 'CUSTOM',
        valueNumeric: null,
        valueText: `Schedule preventive service about every ${intervalMonths} months. Maintenance supports performance but does not guarantee remaining life or prevent failure.`,
        unit: null,
        direction: 'NEUTRAL',
        confidenceScore: 0.6,
        sortOrder: 9,
        isUserSupplied: toNum(assumptions.serviceIntervalMonths) != null,
      },
    );

  // ── REPAIR_COMPONENT ─────────────────────────────────────────────────────
  } else if (scenarioType === 'REPAIR_COMPONENT') {
    const assumptions = (inputPayload.assumptions as Record<string, unknown>) ?? {};
    const compType = (inputPayload.componentType as HomeTwinComponentType) ?? component?.componentType ?? 'OTHER';

    const replacementBasis =
      decimalToNumber(component?.replacementCostEstimate) ??
      DEFAULT_REPLACEMENT_COST[compType] ??
      DEFAULT_REPLACEMENT_COST.OTHER;
    const userRepairCost = toNum(assumptions.repairCost);
    const repairCostBase = userRepairCost ?? Math.round(replacementBasis * REPAIR_COST_FRACTION_OF_REPLACEMENT);
    // A homeowner-supplied number still gets a range — it's an estimate,
    // not an accepted quote — but a narrower one than a category default.
    const repairCostUncertainty = userRepairCost != null ? 0.15 : 0.4;
    const repairCostRange = rangeFromPoint(repairCostBase, repairCostUncertainty);

    const extendedLifeYears = toNum(assumptions.extendedLifeYears) ?? REPAIR_DEFAULT_EXTENDED_LIFE_YEARS;
    const hasComponent = component != null;

    impacts.push({
      impactType: 'UPFRONT_COST',
      valueNumeric: repairCostRange.base,
      valueLow: repairCostRange.low,
      valueHigh: repairCostRange.high,
      valueText: null,
      unit: 'USD',
      direction: 'NEGATIVE',
      confidenceScore: userRepairCost != null ? 0.65 : hasComponent ? 0.4 : 0.25,
      sortOrder: 0,
      isUserSupplied: userRepairCost != null,
    });

    impacts.push({
      impactType: 'CUSTOM',
      valueNumeric: null,
      valueText: `A repair may buy time; the ${extendedLifeYears}-year extension is a planning assumption, not a prediction of condition or failure.`,
      unit: null,
      direction: 'NEUTRAL',
      confidenceScore: 0.5,
      sortOrder: 9,
      isUserSupplied: toNum(assumptions.extendedLifeYears) != null,
    });

  // ── WAIT_MONITOR ─────────────────────────────────────────────────────────
  } else if (scenarioType === 'WAIT_MONITOR') {
    const reviewMonths = toNum(inputPayload.reviewMonths) ?? 6;

    impacts.push(
      {
        impactType: 'UPFRONT_COST',
        valueNumeric: 0,
        valueLow: 0,
        valueHigh: 0,
        valueText: 'Nothing spent now',
        unit: 'USD',
        direction: 'NEUTRAL',
        confidenceScore: 1,
        sortOrder: 0,
        isUserSupplied: false,
      },
      {
        impactType: 'CUSTOM',
        valueNumeric: null,
        valueText: `Revisit this decision in about ${reviewMonths} months, or sooner if condition changes (leaks, noise, reduced performance).`,
        unit: null,
        direction: 'NEUTRAL',
        confidenceScore: 0.6,
        sortOrder: 9,
        isUserSupplied: toNum(inputPayload.reviewMonths) != null,
      },
    );

  // ── REPLACE_COMPONENT / UPGRADE_COMPONENT ──────────────────────────────────
  } else if (
    scenarioType === 'REPLACE_COMPONENT' ||
    scenarioType === 'UPGRADE_COMPONENT'
  ) {
    const assumptions = (inputPayload.assumptions as Record<string, unknown>) ?? {};
    const compType = (inputPayload.componentType as HomeTwinComponentType) ?? component?.componentType ?? 'OTHER';

    // Accept projectCost as alias for replacementCost
    const userProvidedCost = toNum(assumptions.replacementCost) ?? toNum(assumptions.projectCost);
    const grossUpfrontCost =
      userProvidedCost ??
      decimalToNumber(component?.replacementCostEstimate) ??
      DEFAULT_REPLACEMENT_COST[compType] ??
      DEFAULT_REPLACEMENT_COST.OTHER;
    const incentiveAmount = toNum(assumptions.incentiveAmount) ?? 0;
    const upfrontCost = Math.max(0, grossUpfrontCost - incentiveAmount);
    const upfrontCostUncertainty = userProvidedCost != null ? 0.1 : component?.replacementCostEstimate != null ? 0.15 : 0.35;
    const upfrontCostRange = rangeFromPoint(upfrontCost, upfrontCostUncertainty);

    const oldAnnualMaint =
      decimalToNumber(component?.annualMaintenanceCostEstimate) ??
      DEFAULT_ANNUAL_MAINTENANCE[compType] ??
      DEFAULT_ANNUAL_MAINTENANCE.OTHER;

    const oldAnnualOp = decimalToNumber(component?.annualOperatingCostEstimate) ?? 0;

    // annualSavings can be provided directly in assumptions (e.g. insulation scenario)
    const directAnnualSavings = toNum(assumptions.annualSavings);
    const suppliedEfficiencyGainPct = toNum(assumptions.efficiencyGainPercent);
    const efficiencyGainPct = suppliedEfficiencyGainPct ?? 0;
    const savingsUsesInputAssumption =
      directAnnualSavings != null || suppliedEfficiencyGainPct != null;

    const annualMaintSavings = oldAnnualMaint * 0.80;
    const annualEnergySavings =
      directAnnualSavings != null
        ? directAnnualSavings
        : oldAnnualOp * (efficiencyGainPct / 100);

    const totalAnnualSavings = annualMaintSavings + annualEnergySavings;
    const paybackYears = totalAnnualSavings > 0 ? upfrontCost / totalAnnualSavings : null;
    // Savings estimates are inherently rougher than the cost estimate —
    // fixed uncertainty band regardless of source.
    const savingsRange = rangeFromPoint(totalAnnualSavings, 0.25);
    // Payback range from the combination that makes it best/worst case,
    // not just the range of one input in isolation.
    const paybackRange = totalAnnualSavings > 0
      ? {
          low: savingsRange.high > 0 ? Math.round((upfrontCostRange.low / savingsRange.high) * 10) / 10 : null,
          high: savingsRange.low > 0 ? Math.round((upfrontCostRange.high / savingsRange.low) * 10) / 10 : null,
        }
      : { low: null, high: null };
    sensitivity = computePaybackSensitivity(upfrontCost, upfrontCostUncertainty, totalAnnualSavings, 0.25);

    const newUsefulLife = toNum(assumptions.newUsefulLifeYears);
    const riskReductionPct = toNum(assumptions.riskReductionPercent);

    // Confidence is higher when we have the component on record
    const hasComponent = component != null;

    // NOTE: PROPERTY_VALUE_CHANGE is intentionally not computed here. It was
    // previously derived from a static ROI-of-upfront-cost table with no
    // appraisal or market evidence and presented as a confident dollar
    // figure. Suppressed until a real evidence source exists (see
    // HOME_DIGITAL_TWIN_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md HDT-004).

    impacts.push(
      {
        impactType: 'UPFRONT_COST',
        valueNumeric: upfrontCostRange.base,
        valueLow: upfrontCostRange.low,
        valueHigh: upfrontCostRange.high,
        valueText: null,
        unit: 'USD',
        direction: 'NEGATIVE',
        confidenceScore: hasComponent ? 0.80 : 0.55,
        sortOrder: 0,
        isUserSupplied: userProvidedCost != null || incentiveAmount > 0,
      },
      {
        impactType: 'ANNUAL_SAVINGS',
        valueNumeric: savingsRange.base,
        valueLow: savingsRange.low,
        valueHigh: savingsRange.high,
        valueText: null,
        unit: 'USD',
        direction: totalAnnualSavings > 0 ? 'POSITIVE' : 'NEUTRAL',
        confidenceScore: hasComponent ? 0.70 : 0.45,
        sortOrder: 1,
        isUserSupplied: savingsUsesInputAssumption,
      },
      {
        impactType: 'PAYBACK_PERIOD',
        valueNumeric: paybackYears != null ? Math.round(paybackYears * 10) / 10 : null,
        valueLow: paybackRange.low,
        valueHigh: paybackRange.high,
        valueText: paybackYears != null
          ? paybackRange.low != null && paybackRange.high != null
            ? `${paybackRange.low}–${paybackRange.high} years`
            : `${paybackYears.toFixed(1)} years`
          : 'N/A',
        unit: 'YEARS',
        direction: paybackYears != null && paybackYears <= 10 ? 'POSITIVE' : 'NEUTRAL',
        confidenceScore: 0.65,
        sortOrder: 2,
        isUserSupplied: userProvidedCost != null || savingsUsesInputAssumption,
      },
      {
        impactType: 'MAINTENANCE_COST_CHANGE',
        valueNumeric: Math.round(annualMaintSavings),
        valueText: `Save ~$${Math.round(annualMaintSavings)}/yr on maintenance`,
        unit: 'USD',
        direction: annualMaintSavings > 0 ? 'POSITIVE' : 'NEUTRAL',
        confidenceScore: hasComponent ? 0.70 : 0.45,
        sortOrder: 4,
        isUserSupplied: false,
      },
    );

    // Energy savings impact (only when meaningful)
    if (annualEnergySavings > 0) {
      impacts.push({
        impactType: 'ENERGY_USE_CHANGE',
        valueNumeric: Math.round(annualEnergySavings),
        valueText:
          efficiencyGainPct > 0
            ? `${efficiencyGainPct}% efficiency improvement`
            : `~$${Math.round(annualEnergySavings)}/yr energy savings`,
        unit: 'USD',
        direction: 'POSITIVE',
        confidenceScore: 0.60,
        sortOrder: 5,
        isUserSupplied: true,
      });
    }

    // Risk reduction is never derived from age/service-life depletion. If a
    // homeowner enters an expectation, preserve it strictly as an input
    // assumption rather than system evidence.
    if (riskReductionPct != null) {
      const riskText = newUsefulLife != null
        ? `${riskReductionPct}% expected risk reduction (your assumption); new useful life ${newUsefulLife} yrs`
        : `${riskReductionPct}% expected risk reduction (your assumption)`;
      impacts.push({
        impactType: 'RISK_REDUCTION',
        valueNumeric: riskReductionPct,
        valueText: riskText,
        unit: 'PERCENT',
        direction: 'POSITIVE',
        confidenceScore: null,
        sortOrder: 6,
        isUserSupplied: true,
      });
    }

    const financingApr = toNum(assumptions.financingAprPercent);
    const financingTermMonths = toNum(assumptions.financingTermMonths);
    const downPayment = Math.min(upfrontCost, toNum(assumptions.downPayment) ?? 0);
    if (financingApr != null && financingTermMonths != null) {
      const principal = Math.max(0, upfrontCost - downPayment);
      const monthlyRate = financingApr / 100 / 12;
      const monthlyPayment = principal === 0
        ? 0
        : monthlyRate === 0
          ? principal / financingTermMonths
          : principal * monthlyRate * ((1 + monthlyRate) ** financingTermMonths)
            / (((1 + monthlyRate) ** financingTermMonths) - 1);
      const totalFinancedCost = downPayment + monthlyPayment * financingTermMonths;
      impacts.push({
        impactType: 'CUSTOM',
        valueNumeric: Math.round(monthlyPayment),
        valueText: `About $${Math.round(monthlyPayment)}/month for ${financingTermMonths} months; approximately $${Math.round(totalFinancedCost)} total including the entered down payment.`,
        unit: 'USD',
        direction: 'NEUTRAL',
        confidenceScore: null,
        sortOrder: 7,
        isUserSupplied: true,
      });
    }

    const decisionDate = typeof assumptions.decisionDate === 'string' ? assumptions.decisionDate : null;
    const energyEscalation = toNum(assumptions.energyPriceEscalationPercent);
    if (decisionDate || energyEscalation != null || incentiveAmount > 0) {
      const notes = [
        decisionDate ? `Decision timing: ${decisionDate}` : null,
        incentiveAmount > 0 ? `Entered incentive: $${Math.round(incentiveAmount)}` : null,
        energyEscalation != null ? `Energy-price change assumption: ${energyEscalation}% per year` : null,
      ].filter(Boolean);
      impacts.push({
        impactType: 'CUSTOM',
        valueNumeric: null,
        valueText: notes.join(' · '),
        unit: null,
        direction: 'NEUTRAL',
        confidenceScore: null,
        sortOrder: 8,
        isUserSupplied: true,
      });
    }

    // NOTE: INSURANCE_IMPACT is intentionally not computed here. It was
    // previously derived from a fixed national premium assumption ($1,800/yr)
    // and a per-component discount fraction with no carrier evidence, and
    // presented as a specific dollar discount. Suppressed until a real
    // insurer-eligibility source exists (see
    // HOME_DIGITAL_TWIN_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md HDT-004).

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
        isUserSupplied: false,
      });
    }

  // ── ENERGY_IMPROVEMENT ─────────────────────────────────────────────────────
  } else if (scenarioType === 'ENERGY_IMPROVEMENT') {
    const upfrontCost = toNum(inputPayload.upfrontCost) ?? 0;
    const annualSavings = toNum(inputPayload.energySavingsPerYear);
    const paybackYears = annualSavings != null && annualSavings > 0 ? upfrontCost / annualSavings : null;
    const carbonOffset = toNum(inputPayload.carbonOffsetTonsCO2PerYear);
    const comfortDesc = inputPayload.comfortImpactDescription as string | undefined;
    const resilienceDesc = inputPayload.resilienceImpactDescription as string | undefined;

    // Values supplied through inputPayload, plus calculations that depend on
    // them, remain grouped as input assumptions. A missing utility baseline
    // suppresses savings and payback instead of silently treating it as zero.
    impacts.push({
      impactType: 'UPFRONT_COST',
      valueNumeric: upfrontCost,
      valueText: null,
      unit: 'USD',
      direction: 'NEGATIVE',
      confidenceScore: 0.85,
      sortOrder: 0,
      isUserSupplied: true,
    });

    if (annualSavings != null) {
      impacts.push({
        impactType: 'ANNUAL_SAVINGS',
        valueNumeric: annualSavings,
        valueText: null,
        unit: 'USD',
        direction: annualSavings > 0 ? 'POSITIVE' : 'NEUTRAL',
        confidenceScore: 0.75,
        sortOrder: 1,
        isUserSupplied: true,
      });
      impacts.push({
        impactType: 'PAYBACK_PERIOD',
        valueNumeric: paybackYears != null ? Math.round(paybackYears * 10) / 10 : null,
        valueText: paybackYears != null ? `${paybackYears.toFixed(1)} years` : 'N/A',
        unit: 'YEARS',
        direction: paybackYears != null && paybackYears <= 10 ? 'POSITIVE' : 'NEUTRAL',
        confidenceScore: 0.70,
        sortOrder: 2,
        isUserSupplied: true,
      });
      impacts.push({
        impactType: 'ENERGY_USE_CHANGE',
        valueNumeric: -annualSavings,
        valueText: null,
        unit: 'USD',
        direction: annualSavings > 0 ? 'POSITIVE' : 'NEUTRAL',
        confidenceScore: 0.70,
        sortOrder: 3,
        isUserSupplied: true,
      });
    }

    if (carbonOffset != null && carbonOffset > 0) {
      impacts.push({
        impactType: 'EMISSIONS_IMPACT',
        valueNumeric: -carbonOffset,
        valueText: `${carbonOffset} ton(s) CO₂/yr offset`,
        unit: 'TONS_CO2',
        direction: 'POSITIVE',
        confidenceScore: 0.55,
        sortOrder: 4,
        isUserSupplied: true,
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
        isUserSupplied: true,
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
        isUserSupplied: true,
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
      isUserSupplied: true,
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
      isUserSupplied: true,
    });

    // Insurance savings and property-value change here are homeowner-entered
    // assumptions (inputPayload.estimated*), not engine-computed claims — they
    // are echoed back, not derived from carrier or appraisal evidence.
    if (insuranceSavings != null && insuranceSavings > 0) {
      const payback = insuranceSavings > 0 ? upfrontCost / insuranceSavings : null;
      impacts.push(
        {
          impactType: 'INSURANCE_IMPACT',
          valueNumeric: -insuranceSavings,
          valueText: `Save ~$${insuranceSavings}/yr on insurance (your estimate)`,
          unit: 'USD',
          direction: 'POSITIVE',
          confidenceScore: 0.55,
          sortOrder: 2,
          isUserSupplied: true,
        },
        {
          impactType: 'PAYBACK_PERIOD',
          valueNumeric: payback != null ? Math.round(payback * 10) / 10 : null,
          valueText: payback != null ? `${payback.toFixed(1)} years` : 'N/A',
          unit: 'YEARS',
          direction: payback != null && payback <= 10 ? 'POSITIVE' : 'NEUTRAL',
          confidenceScore: 0.55,
          sortOrder: 3,
          isUserSupplied: true,
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
        isUserSupplied: true,
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
      isUserSupplied: true,
    });

    // Homeowner-entered assumption, echoed back — not appraisal evidence.
    if (propertyValueChange != null) {
      impacts.push({
        impactType: 'PROPERTY_VALUE_CHANGE',
        valueNumeric: propertyValueChange,
        valueText: null,
        unit: 'USD',
        direction: propertyValueChange >= 0 ? 'POSITIVE' : 'NEGATIVE',
        confidenceScore: 0.45,
        sortOrder: 1,
        isUserSupplied: true,
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
          isUserSupplied: true,
        },
        {
          impactType: 'PAYBACK_PERIOD',
          valueNumeric: payback != null ? Math.round(payback * 10) / 10 : null,
          valueText: payback != null ? `${payback.toFixed(1)} years` : 'N/A',
          unit: 'YEARS',
          direction: payback != null && payback <= 10 ? 'POSITIVE' : 'NEUTRAL',
          confidenceScore: 0.50,
          sortOrder: 3,
          isUserSupplied: true,
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
        isUserSupplied: true,
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
        isUserSupplied: true,
      });
    }

    // Homeowner-entered assumption, echoed back — not appraisal evidence.
    if (propertyValueChange != null) {
      impacts.push({
        impactType: 'PROPERTY_VALUE_CHANGE',
        valueNumeric: propertyValueChange,
        valueText: null,
        unit: 'USD',
        direction: propertyValueChange >= 0 ? 'POSITIVE' : 'NEGATIVE',
        confidenceScore: 0.40,
        sortOrder: 2,
        isUserSupplied: true,
      });
    }

  // ── CUSTOM ─────────────────────────────────────────────────────────────────
  } else {
    // Caller-supplied — must never be presented as system-computed evidence.
    // See HOME_DIGITAL_TWIN_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md HDT-005.
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
          isUserSupplied: true,
        });
      });
    }
  }

  return { impacts, sensitivity };
}

// ============================================================================
// SERVICE
// ============================================================================

const COMPONENT_SELECT = {
  id: true,
  identityKey: true,
  componentType: true,
  label: true,
  sourceType: true,
  sourceReferenceId: true,
  installYear: true,
  estimatedAgeYears: true,
  conditionScore: true,
  usefulLifeYears: true,
  annualMaintenanceCostEstimate: true,
  annualOperatingCostEstimate: true,
  replacementCostEstimate: true,
  lastModeledAt: true,
  projectedFacts: {
    select: {
      fieldName: true,
      factState: true,
      sourceType: true,
      sourceRecordType: true,
      sourceRecordId: true,
      sourceField: true,
      observedAt: true,
      derivationMethod: true,
      derivationVersion: true,
      modelVersion: true,
      sourceVerified: true,
    },
  },
} satisfies Prisma.HomeTwinComponentSelect;

const SCENARIO_INCLUDE = {
  impacts: { orderBy: { sortOrder: 'asc' as const } },
  component: { select: { id: true, componentType: true, label: true, sourceType: true, sourceReferenceId: true } },
  computationRuns: {
    where: { runType: 'SCENARIO_COMPUTE' as const },
    orderBy: { startedAt: 'desc' as const },
    take: 1,
    select: { id: true, status: true, summary: true, startedAt: true, completedAt: true, errorMessage: true },
  },
} satisfies Prisma.HomeTwinScenarioInclude;

type ScenarioWithRelations = Prisma.HomeTwinScenarioGetPayload<{ include: typeof SCENARIO_INCLUDE }>;

/**
 * Attaches the category-specific professional/safety boundary, computed
 * from the linked component (or, for scenarios created before componentId
 * existed, from inputPayload.componentType). Not persisted — it's a pure
 * function of component type, so it can't go stale.
 */
function withSafetyBoundary(scenario: ScenarioWithRelations) {
  const inputPayload = scenario.inputPayload as Record<string, unknown>;
  const componentType = scenario.component?.componentType
    ?? (inputPayload.componentType as HomeTwinComponentType | undefined)
    ?? null;
  const latestRun = scenario.computationRuns[0] ?? null;
  const projectContext = projectContextForScenario(componentType, scenario.scenarioType);
  return {
    ...scenario,
    safetyBoundary: componentType ? SAFETY_BOUNDARY_BY_COMPONENT[componentType] ?? null : null,
    sensitivity: (latestRun?.summary as { sensitivity?: SensitivityFactor[] } | null)?.sensitivity ?? [],
    latestRun: latestRun
      ? { status: latestRun.status, startedAt: latestRun.startedAt, completedAt: latestRun.completedAt, errorMessage: latestRun.errorMessage }
      : null,
    // Pre-fill for the existing "new project" flow, which already accepts
    // sourceEntityType/sourceEntityId/projectType/category/itemId as query
    // params — see homeDigitalTwinScenario.service.ts getHandoffContext().
    projectPrefill: {
      projectType: projectContext.projectType,
      category: projectContext.category,
      inventoryItemId: scenario.component?.sourceType === 'INVENTORY' ? scenario.component.sourceReferenceId : null,
    },
  };
}

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

    const scenarios = await prisma.homeTwinScenario.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      include: SCENARIO_INCLUDE,
    });
    return scenarios.map(withSafetyBoundary);
  }

  // ── Get one ─────────────────────────────────────────────────────────────────
  async getScenario(scenarioId: string, digitalTwinId: string) {
    const scenario = await prisma.homeTwinScenario.findFirst({
      where: { id: scenarioId, digitalTwinId },
      include: SCENARIO_INCLUDE,
    });
    if (!scenario) {
      throw new APIError('Scenario not found', 404, 'SCENARIO_NOT_FOUND');
    }
    return withSafetyBoundary(scenario);
  }

  async listScenarioRuns(scenarioId: string, digitalTwinId: string) {
    const scenario = await prisma.homeTwinScenario.findFirst({
      where: { id: scenarioId, digitalTwinId },
      select: { id: true, scenarioType: true },
    });
    if (!scenario) {
      throw new APIError('Scenario not found', 404, 'SCENARIO_NOT_FOUND');
    }

    return prisma.homeTwinComputationRun.findMany({
      where: { scenarioId, digitalTwinId, runType: 'SCENARIO_COMPUTE' },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        status: true,
        modelVersion: true,
        calculationVersion: true,
        startedAt: true,
        completedAt: true,
        errorMessage: true,
        inputSnapshot: true,
        sourceSnapshot: true,
        outputSnapshot: true,
        summary: true,
      },
    });
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
      select: {
        completenessScore: true,
        confidenceScore: true,
        status: true,
        version: true,
        dependencyFingerprint: true,
      },
    });

    let componentId = input.componentId ?? null;
    if (componentId) {
      const component = await prisma.homeTwinComponent.findFirst({
        where: { id: componentId, digitalTwinId },
        select: { id: true },
      });
      if (!component) {
        throw new APIError('Component not found on this twin', 404, 'COMPONENT_NOT_FOUND');
      }
    } else {
      // Backward-compat convenience: if the caller only sent a
      // componentType (the old contract) and exactly one ACTIVE component
      // of that type exists, resolve it unambiguously. If there are
      // multiple (now possible — see HomeTwinComponent identityKey), don't
      // guess; leave componentId null rather than silently picking one.
      const inputPayload = input.inputPayload as Record<string, unknown>;
      const compType = inputPayload?.componentType as HomeTwinComponentType | undefined;
      if (compType) {
        const candidates = await prisma.homeTwinComponent.findMany({
          where: { digitalTwinId, componentType: compType, lifecycleState: 'ACTIVE' },
          select: { id: true },
          take: 2,
        });
        if (candidates.length === 1) componentId = candidates[0].id;
      }
    }

    const scenario = await prisma.homeTwinScenario.create({
      data: {
        digitalTwinId,
        propertyId,
        createdByUserId,
        componentId,
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
          dependencyFingerprint: twin.dependencyFingerprint,
        },
        baselineDependencyFingerprint: twin.dependencyFingerprint,
        isPinned: input.isPinned ?? false,
        isArchived: false,
      },
      include: SCENARIO_INCLUDE,
    });

    logger.info(
      `[HomeDigitalTwin] scenario created — id=${scenario.id} type=${input.scenarioType} property=${propertyId}`,
    );

    return withSafetyBoundary(scenario);
  }

  // ── Update (archive / pin) ───────────────────────────────────────────────
  async updateScenario(
    scenarioId: string,
    digitalTwinId: string,
    input: UpdateScenarioInput,
  ) {
    const existing = await prisma.homeTwinScenario.findFirst({
      where: { id: scenarioId, digitalTwinId },
      select: { id: true, scenarioType: true },
    });
    if (!existing) {
      throw new APIError('Scenario not found', 404, 'SCENARIO_NOT_FOUND');
    }
    if (input.inputPayload !== undefined) {
      const payloadResult = payloadSchemaFor(existing.scenarioType).safeParse(input.inputPayload);
      if (!payloadResult.success) {
        throw new APIError(
          'Scenario assumptions are invalid for this option type',
          400,
          'INVALID_SCENARIO_PAYLOAD',
          payloadResult.error.flatten(),
        );
      }
    }

    const scenario = await prisma.homeTwinScenario.update({
      where: { id: scenarioId },
      data: {
        ...(input.isPinned !== undefined && { isPinned: input.isPinned }),
        ...(input.isArchived !== undefined && { isArchived: input.isArchived }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.inputPayload !== undefined && {
          inputPayload: input.inputPayload as Prisma.InputJsonValue,
          status: 'READY' as const,
          staleAt: new Date(),
          staleReason: 'Assumptions changed; recompute this option to refresh its results.',
        }),
      },
      include: SCENARIO_INCLUDE,
    });
    return withSafetyBoundary(scenario);
  }

  // ── Delete (permanent) ──────────────────────────────────────────────────────
  /**
   * Hard delete — only allowed once a scenario is archived, so removing it
   * is always a deliberate second step after the reversible "Archive"
   * action, not a one-click accidental loss. Also refuses to delete a
   * scenario with a linked project (see homeDigitalTwinScenario.service.ts
   * getHandoffContext) since that link is looked up by scenarioId — deleting
   * the scenario out from under it would orphan the reference.
   */
  async deleteScenario(scenarioId: string, digitalTwinId: string, propertyId: string) {
    const existing = await prisma.homeTwinScenario.findFirst({
      where: { id: scenarioId, digitalTwinId },
      select: { id: true, isArchived: true },
    });
    if (!existing) {
      throw new APIError('Scenario not found', 404, 'SCENARIO_NOT_FOUND');
    }
    if (!existing.isArchived) {
      throw new APIError('Archive this option before deleting it.', 409, 'SCENARIO_NOT_ARCHIVED');
    }

    const linkedProject = await prisma.projectRecord.findFirst({
      where: { propertyId, sourceEntityType: 'HomeTwinScenario', sourceEntityId: scenarioId },
      select: { id: true },
    });
    if (linkedProject) {
      throw new APIError('This option has a linked project and cannot be deleted.', 409, 'SCENARIO_HAS_LINKED_PROJECT');
    }

    await prisma.homeTwinScenario.delete({ where: { id: scenarioId } });
    logger.info(`[HomeDigitalTwin] scenario deleted — id=${scenarioId}`);
  }

  // ── Compute ─────────────────────────────────────────────────────────────────
  async computeScenario(
    scenarioId: string,
    digitalTwinId: string,
    computationRunId?: string,
  ) {
    if (isScenarioComputeDisabled()) {
      throw new APIError(
        'Scenario computation is temporarily unavailable. Your saved options and their prior results are unaffected.',
        503,
        'SCENARIO_COMPUTE_DISABLED',
      );
    }

    const scenario = await prisma.homeTwinScenario.findFirst({
      where: { id: scenarioId, digitalTwinId },
    });
    if (!scenario) {
      throw new APIError('Scenario not found', 404, 'SCENARIO_NOT_FOUND');
    }

    if (scenario.isArchived) {
      throw new APIError(
        'Archived scenarios cannot be recomputed. Restore the scenario first.',
        409,
        'SCENARIO_ARCHIVED',
      );
    }

    if (!computationRunId) {
      const inFlight = await findInFlightRun(digitalTwinId, 'SCENARIO_COMPUTE', scenarioId);
      if (inFlight) {
        throw new APIError(
          'This option is already being computed. Please wait for it to finish.',
          409,
          'COMPUTATION_IN_PROGRESS',
        );
      }
    }

    const inputPayload = scenario.inputPayload as Record<string, unknown>;

    // Resolve the specific component this decision is about. componentId
    // (set at creation) is authoritative; inputPayload.componentType is a
    // fallback for scenarios created before componentId existed.
    let component: ComponentRecord | null = null;
    const needsComponent =
      scenario.componentId != null ||
      ['MAINTAIN_COMPONENT', 'REPAIR_COMPONENT', 'REPLACE_COMPONENT', 'UPGRADE_COMPONENT', 'WAIT_MONITOR'].includes(
        scenario.scenarioType,
      );
    if (needsComponent) {
      if (scenario.componentId) {
        component = await prisma.homeTwinComponent.findFirst({
          where: { id: scenario.componentId, digitalTwinId, lifecycleState: 'ACTIVE' },
          select: COMPONENT_SELECT,
        });
      } else {
        const compType = inputPayload.componentType as HomeTwinComponentType | undefined;
        if (compType) {
          component = await prisma.homeTwinComponent.findFirst({
            where: { digitalTwinId, componentType: compType, lifecycleState: 'ACTIVE' },
            select: COMPONENT_SELECT,
            orderBy: { createdAt: 'desc' },
          });
        }
      }
    }

    const twin = await prisma.homeDigitalTwin.findUniqueOrThrow({
      where: { id: digitalTwinId },
      select: {
        version: true,
        dependencyFingerprint: true,
        contextVersion: true,
        lastGoodComputedAt: true,
      },
    });
    const runData = {
      status: 'RUNNING' as const,
      startedAt: new Date(),
      completedAt: null,
      errorMessage: null,
      inputSnapshot: {
        inputPayload,
        component: component ? {
          ...component,
          replacementCostEstimate: decimalToNumber(component.replacementCostEstimate),
          annualMaintenanceCostEstimate: decimalToNumber(component.annualMaintenanceCostEstimate),
          annualOperatingCostEstimate: decimalToNumber(component.annualOperatingCostEstimate),
        } : null,
      } as Prisma.InputJsonValue,
      sourceSnapshot: {
        twinVersion: twin.version,
        dependencyFingerprint: twin.dependencyFingerprint,
        contextVersion: twin.contextVersion,
        lastGoodComputedAt: twin.lastGoodComputedAt,
        componentFacts: component?.projectedFacts ?? [],
      } as Prisma.InputJsonValue,
      modelVersion: 'hdt-scenario-v2',
    };
    const run = computationRunId
      ? await prisma.homeTwinComputationRun.update({
          where: { id: computationRunId },
          data: runData,
        })
      : await prisma.homeTwinComputationRun.create({
          data: {
            digitalTwinId,
            scenarioId,
            runType: 'SCENARIO_COMPUTE',
            ...runData,
          },
        });

    let impactSpecs: ImpactSpec[];
    let sensitivity: SensitivityFactor[];
    try {
      const result = computeImpacts(scenario.scenarioType, inputPayload, component);
      impactSpecs = result.impacts;
      sensitivity = result.sensitivity;
    } catch (err) {
      await prisma.homeTwinComputationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        },
      });
      logger.error({ err }, `[HomeDigitalTwin] scenario compute failed — id=${scenarioId}`);
      throw err;
    }

    const computedAt = new Date();
    const persistedImpactSpecs = impactSpecs.map((impact) =>
      qualifyImpact(impact, inputPayload, component, computedAt),
    );

    // Atomically replace current impacts and preserve the immutable run output.
    await prisma.$transaction(async (tx) => {
      await tx.homeTwinScenarioImpact.deleteMany({ where: { scenarioId } });

      if (impactSpecs.length > 0) {
        await tx.homeTwinScenarioImpact.createMany({
          data: persistedImpactSpecs.map((s) => ({ ...s, scenarioId })),
        });
      }

      await tx.homeTwinScenario.update({
        where: { id: scenarioId },
        data: {
          status: 'COMPUTED',
          lastComputedAt: computedAt,
          baselineDependencyFingerprint: twin.dependencyFingerprint,
          staleAt: null,
          staleReason: null,
        },
      });

      await tx.homeTwinComputationRun.update({
        where: { id: run.id },
        data: {
          status: 'SUCCEEDED',
          completedAt: computedAt,
          summary: { impactCount: impactSpecs.length, sensitivity } as Prisma.InputJsonValue,
          outputSnapshot: {
            impacts: persistedImpactSpecs,
            sensitivity,
          } as Prisma.InputJsonValue,
        },
      });
    });

    logger.info(
      `[HomeDigitalTwin] scenario computed — id=${scenarioId} type=${scenario.scenarioType} impacts=${impactSpecs.length}`,
    );

    const updated = await prisma.homeTwinScenario.findUniqueOrThrow({
      where: { id: scenarioId },
      include: SCENARIO_INCLUDE,
    });
    return withSafetyBoundary(updated);
  }

  // ── Scenario-specific readiness ────────────────────────────────────────────
  /**
   * What's known vs. missing for THIS decision, not the twin's global
   * completeness score. A repair/replace/upgrade decision about one HVAC
   * system doesn't need the roof's data to be trustworthy — see HDT-008.
   */
  async getReadiness(
    digitalTwinId: string,
    params: { componentId?: string; componentType?: HomeTwinComponentType; scenarioType: HomeTwinScenarioType },
  ) {
    const component = params.componentId
      ? await prisma.homeTwinComponent.findFirst({
          where: { id: params.componentId, digitalTwinId, lifecycleState: 'ACTIVE' },
          include: { projectedFacts: true },
        })
      : params.componentType
        ? await prisma.homeTwinComponent.findFirst({
            where: { digitalTwinId, componentType: params.componentType, lifecycleState: 'ACTIVE' },
            include: { projectedFacts: true },
            orderBy: { createdAt: 'desc' },
          })
        : null;

    const known: string[] = [];
    const missing: { field: string; whyItMatters: string }[] = [];
    const trustedStates = new Set(['REPORTED', 'VERIFIED', 'DOCUMENT_DERIVED']);
    const fact = (fieldName: string) =>
      component?.projectedFacts.find((candidate) => candidate.fieldName === fieldName);
    const addFactRequirement = (
      fieldName: string,
      knownLabel: string,
      missingReason: string,
      conflictedReason = missingReason,
    ) => {
      const candidate = fact(fieldName);
      if (candidate && trustedStates.has(candidate.factState)) {
        known.push(knownLabel);
      } else {
        missing.push({
          field: fieldName,
          whyItMatters: candidate?.factState === 'CONFLICTED' ? conflictedReason : missingReason,
        });
      }
    };

    const componentScoped = [
      'MAINTAIN_COMPONENT',
      'REPAIR_COMPONENT',
      'REPLACE_COMPONENT',
      'UPGRADE_COMPONENT',
      'WAIT_MONITOR',
    ].includes(params.scenarioType);
    if (componentScoped && !component) {
      missing.push({
        field: 'component',
        whyItMatters: 'Choose the specific home system this decision applies to.',
      });
    } else if (params.scenarioType === 'WAIT_MONITOR') {
      known.push('Specific system to monitor');
    } else if (params.scenarioType === 'MAINTAIN_COMPONENT') {
      addFactRequirement(
        'conditionScore',
        'Recorded condition',
        'Current condition helps determine whether routine maintenance is still appropriate.',
      );
      addFactRequirement(
        'annualMaintenanceCostEstimate',
        'Recorded maintenance-cost basis',
        'Add a service estimate before treating maintenance cost as decision-grade.',
      );
    } else if (params.scenarioType === 'REPAIR_COMPONENT') {
      addFactRequirement(
        'conditionScore',
        'Recorded condition',
        'A repair decision needs a current inspection or homeowner-observed condition.',
        'Resolve the conflicting condition evidence before deciding whether repair is appropriate.',
      );
      missing.push({
        field: 'repairQuote',
        whyItMatters: 'A contractor quote is needed before treating repair cost as decision-grade.',
      });
    } else if (
      params.scenarioType === 'REPLACE_COMPONENT' ||
      params.scenarioType === 'UPGRADE_COMPONENT'
    ) {
      addFactRequirement(
        'replacementCostEstimate',
        'Recorded replacement cost basis',
        'The current cost is a category default, not a quote.',
      );
      if (params.scenarioType === 'UPGRADE_COMPONENT') {
        addFactRequirement(
          'annualOperatingCostEstimate',
          'Recorded operating-cost baseline',
          'Without a current operating-cost baseline, upgrade savings cannot be measured.',
        );
      }
    } else if (params.scenarioType === 'ENERGY_IMPROVEMENT') {
      missing.push({
        field: 'energyUsageBaseline',
        whyItMatters: 'Add recent utility usage before treating annual savings as measured.',
      });
      missing.push({
        field: 'incentiveEligibility',
        whyItMatters: 'Confirm current incentive eligibility before using rebates in net cost.',
      });
    } else if (params.scenarioType === 'RESILIENCE_IMPROVEMENT') {
      missing.push({
        field: 'riskEvidence',
        whyItMatters: 'Use a current inspection or property-specific risk assessment to define the resilience need.',
      });
    } else {
      known.push('Scenario scope supplied by homeowner');
      missing.push({
        field: 'projectQuote',
        whyItMatters: 'A scoped quote is needed before treating project cost as decision-grade.',
      });
    }

    const readiness: 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT' =
      missing.length === 0 ? 'SUFFICIENT' : known.length > 0 ? 'PARTIAL' : 'INSUFFICIENT';

    return {
      readiness,
      componentFound: component != null,
      known,
      missing,
      safetyBoundary: component ? SAFETY_BOUNDARY_BY_COMPONENT[component.componentType] ?? null : null,
    };
  }

  // ── Compare options for one component ──────────────────────────────────────
  /**
   * All non-archived, computed scenarios targeting one specific component,
   * side by side. Reuses whatever the homeowner already created and
   * computed via the normal CRUD — this does not compute anything new, it
   * just assembles the comparison view (HDT-011: repair/replace/upgrade/
   * wait, compared with ranges, not a single winner picked for them).
   */
  async compareScenarios(digitalTwinId: string, componentId: string) {
    const component = await prisma.homeTwinComponent.findFirst({
      where: { id: componentId, digitalTwinId },
      select: { id: true, componentType: true, label: true },
    });
    if (!component) {
      throw new APIError('Component not found', 404, 'COMPONENT_NOT_FOUND');
    }

    const scenarios = await prisma.homeTwinScenario.findMany({
      where: { digitalTwinId, componentId, isArchived: false, status: 'COMPUTED' },
      orderBy: { createdAt: 'asc' },
      include: SCENARIO_INCLUDE,
    });

    return {
      component,
      options: scenarios.map(withSafetyBoundary),
    };
  }

  async ensureComparisonOptions(
    digitalTwinId: string,
    propertyId: string,
    componentId: string,
    userId: string,
  ) {
    const component = await prisma.homeTwinComponent.findFirst({
      where: { id: componentId, digitalTwinId, lifecycleState: 'ACTIVE' },
      select: { id: true, componentType: true, label: true },
    });
    if (!component) {
      throw new APIError('Component not found', 404, 'COMPONENT_NOT_FOUND');
    }

    const optionTemplates: Array<{
      scenarioType: HomeTwinScenarioType;
      name: string;
      description: string;
      inputPayload: Record<string, unknown>;
    }> = [
      {
        scenarioType: 'MAINTAIN_COMPONENT',
        name: `Maintain ${component.label ?? component.componentType}`,
        description: 'Continue preventive service while monitoring current performance.',
        inputPayload: { componentType: component.componentType, assumptions: {} },
      },
      {
        scenarioType: 'REPAIR_COMPONENT',
        name: `Repair ${component.label ?? component.componentType}`,
        description: 'Address the immediate issue while retaining the existing system.',
        inputPayload: { componentType: component.componentType, assumptions: {} },
      },
      {
        scenarioType: 'REPLACE_COMPONENT',
        name: `Replace ${component.label ?? component.componentType}`,
        description: 'Replace with a comparable system using current Home Record planning inputs.',
        inputPayload: { componentType: component.componentType, assumptions: {} },
      },
      {
        scenarioType: 'UPGRADE_COMPONENT',
        name: `Upgrade ${component.label ?? component.componentType}`,
        description: 'Compare a higher-performance replacement without assuming unverified savings.',
        inputPayload: { componentType: component.componentType, assumptions: {} },
      },
      {
        scenarioType: 'WAIT_MONITOR',
        name: `Wait and monitor ${component.label ?? component.componentType}`,
        description: 'Take no action now and revisit after a defined monitoring period.',
        inputPayload: { componentType: component.componentType, reviewMonths: 6 },
      },
    ];

    const existing = await prisma.homeTwinScenario.findMany({
      where: {
        digitalTwinId,
        componentId,
        isArchived: false,
        scenarioType: { in: optionTemplates.map((option) => option.scenarioType) },
      },
      select: { id: true, scenarioType: true, status: true },
    });
    const byType = new Map(existing.map((scenario) => [scenario.scenarioType, scenario]));

    for (const template of optionTemplates) {
      let option = byType.get(template.scenarioType);
      if (!option) {
        const created = await this.createScenario(digitalTwinId, propertyId, userId, {
          ...template,
          componentId,
        });
        option = { id: created.id, scenarioType: created.scenarioType, status: created.status };
      }
    }

    const options = await prisma.homeTwinScenario.findMany({
      where: {
        digitalTwinId,
        componentId,
        isArchived: false,
        scenarioType: { in: optionTemplates.map((option) => option.scenarioType) },
      },
      orderBy: { createdAt: 'asc' },
      include: SCENARIO_INCLUDE,
    });

    return {
      component,
      options: options.map(withSafetyBoundary),
    };
  }

  // ── Decision (select / defer / reject / close) ─────────────────────────────
  /**
   * Records the homeowner's disposition on a computed option. This is a
   * deliberate action distinct from `status` (which just tracks whether the
   * numbers have been computed) — see HDT slice 5's decision-and-execution
   * loop. "Revise" is just calling this again with a new status; there's no
   * separate state machine to enforce since a homeowner can always change
   * their mind (e.g. DEFERRED -> SELECTED later).
   */
  async recordDecision(
    scenarioId: string,
    digitalTwinId: string,
    input: { decisionStatus: HomeTwinScenarioDecisionStatus; decisionReason?: string | null; userId: string },
  ) {
    const existing = await prisma.homeTwinScenario.findFirst({
      where: { id: scenarioId, digitalTwinId },
      select: { id: true },
    });
    if (!existing) {
      throw new APIError('Scenario not found', 404, 'SCENARIO_NOT_FOUND');
    }

    const scenario = await prisma.homeTwinScenario.update({
      where: { id: scenarioId },
      data: {
        decisionStatus: input.decisionStatus,
        decisionReason: input.decisionReason ?? null,
        decidedAt: new Date(),
        decidedByUserId: input.userId,
      },
      include: SCENARIO_INCLUDE,
    });

    logger.info(
      `[HomeDigitalTwin] scenario decision recorded — id=${scenarioId} decision=${input.decisionStatus}`,
    );

    return withSafetyBoundary(scenario);
  }

  // ── Handoff (execute the decision without duplicate entry) ────────────────
  /**
   * Everything the UI needs to move from "I've decided" to "I've acted,"
   * pointing at each option's actual owning surface rather than rebuilding
   * project creation, inspection, quote review, etc. inside the twin — see
   * HDT-002/HDT-012 ("the twin is a lens over canonical data, not a new
   * system of record").
   */
  async getHandoffContext(scenarioId: string, digitalTwinId: string, propertyId: string) {
    const scenario = await prisma.homeTwinScenario.findFirst({
      where: { id: scenarioId, digitalTwinId },
      include: SCENARIO_INCLUDE,
    });
    if (!scenario) {
      throw new APIError('Scenario not found', 404, 'SCENARIO_NOT_FOUND');
    }

    const linkedProjectRow = await prisma.projectRecord.findFirst({
      where: { propertyId, sourceEntityType: 'HomeTwinScenario', sourceEntityId: scenarioId },
      select: { id: true, name: true, status: true, projectType: true, actualCostCents: true, outcomeStatus: true },
      orderBy: { createdAt: 'desc' },
    });
    const linkedProject = linkedProjectRow
      ? { id: linkedProjectRow.id, name: linkedProjectRow.name, status: linkedProjectRow.status, projectType: linkedProjectRow.projectType }
      : null;

    // Expected-vs-actual cost — only computed once real work is verified
    // complete, and only ever returned inside this scenario's own detail
    // response (homeowner-scoped by construction: this endpoint already
    // requires access to the specific property and scenario). See HOME_
    // DIGITAL_TWIN_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md Slice 8:
    // "Measure expected-versus-actual cost and outcome only with homeowner
    // control" — nothing here is aggregated for platform-wide reporting.
    let actualOutcome: {
      projectedCostLow: number | null;
      projectedCostHigh: number | null;
      projectedCostSourceClass: HomeTwinImpactSourceClass | null;
      actualCostCents: number;
      varianceCents: number | null;
    } | null = null;
    if (linkedProjectRow?.outcomeStatus === 'VERIFIED_SUCCESS' && linkedProjectRow.actualCostCents != null) {
      // A homeowner-entered quote/estimate is still the decision's expected
      // baseline. Keep its HOMEOWNER_ASSUMPTION provenance visible instead
      // of dropping the comparison entirely.
      actualOutcome = reconcileActualCost(scenario.impacts, linkedProjectRow.actualCostCents);
    }

    const { projectPrefill } = withSafetyBoundary(scenario);
    const base = `/dashboard/properties/${propertyId}`;
    const prefillParams = new URLSearchParams({
      sourceEntityType: 'HomeTwinScenario',
      sourceEntityId: scenarioId,
      projectType: projectPrefill.projectType,
      name: scenario.name,
    });
    if (projectPrefill.category) prefillParams.set('category', projectPrefill.category);
    if (projectPrefill.inventoryItemId) prefillParams.set('itemId', projectPrefill.inventoryItemId);
    const handoffParams = new URLSearchParams({
      sourceEntityType: 'HOME_TWIN_SCENARIO',
      sourceEntityId: scenarioId,
      entityType: 'HOME_TWIN_SCENARIO',
      entityId: scenarioId,
      scenarioId,
      scenarioName: scenario.name,
    });
    if (projectPrefill.category) handoffParams.set('category', projectPrefill.category);
    if (projectPrefill.inventoryItemId) {
      handoffParams.set('itemId', projectPrefill.inventoryItemId);
      handoffParams.set('inventoryItemId', projectPrefill.inventoryItemId);
    }
    const handoffQuery = handoffParams.toString();

    return {
      linkedProject,
      actualOutcome,
      projectPrefill,
      createProjectHref: `${base}/projects/new?${prefillParams.toString()}`,
      handoffLinks: {
        inspection: `${base}/tools/inspection-hub?${handoffQuery}`,
        servicePriceRadar: `${base}/tools/service-price-radar?${handoffQuery}`,
        renovationAdvisor: `${base}/tools/home-renovation-risk-advisor?${handoffQuery}`,
        incentives: `${base}/tools/savings-benefits?${handoffQuery}`,
        reserveFund: `${base}/tools/reserve-fund?${handoffQuery}`,
        capitalTimeline: `${base}/tools/capital-timeline?${handoffQuery}`,
      },
    };
  }
}
