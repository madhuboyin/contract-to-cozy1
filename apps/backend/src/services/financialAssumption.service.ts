import { CashBufferPosture, PreferenceRiskTolerance, Prisma } from '@prisma/client';
import {
  AssumptionSetService,
  extractAssumptionOverrides,
  hasAssumptionOverrides,
} from './assumptionSet.service';
import { PreferenceProfileService } from './preferenceProfile.service';
import { signalService } from './signal.service';

export type FinancialAssumptions = {
  appreciationRate: number;
  inflationRate: number;
  rentGrowthRate: number;
  interestRate: number;
  propertyTaxGrowthRate: number;
  insuranceGrowthRate: number;
  maintenanceGrowthRate: number;
  sellingCostPercent: number;
};

export type FinancialAssumptionInput = Partial<FinancialAssumptions> & {
  sellingCostRate?: number;
};

export type DerivedFinancialPosture = {
  riskTolerance: PreferenceRiskTolerance | null;
  cashBufferPosture: CashBufferPosture | null;
  longTermHorizonPreference: 'SHORT' | 'BALANCED' | 'LONG';
  liquidityPreference: 'HIGH' | 'MODERATE' | 'LOW';
};

export type ResolveFinancialAssumptionsInput = {
  propertyId: string;
  toolKey: string;
  assumptionSetId?: string | null;
  requestOverrides?: FinancialAssumptionInput;
  canonicalDefaults?: FinancialAssumptionInput;
  legacyFallbacks?: FinancialAssumptionInput;
  scenarioKey?: string | null;
  createdByUserId?: string | null;
};

export type ResolveFinancialAssumptionsResult = {
  assumptions: FinancialAssumptions;
  assumptionSetId: string | null;
  preferenceProfileId: string | null;
  posture: DerivedFinancialPosture;
  sharedSignalsUsed: string[];
  savingsRealizationAnnual: number | null;
};

const GLOBAL_FINANCIAL_DEFAULTS: FinancialAssumptions = {
  appreciationRate: 0.04,
  inflationRate: 0.035,
  rentGrowthRate: 0.03,
  interestRate: 0.065,
  propertyTaxGrowthRate: 0.035,
  insuranceGrowthRate: 0.05,
  maintenanceGrowthRate: 0.04,
  sellingCostPercent: 0.06,
};

export const FINANCIAL_ASSUMPTION_KEYS = [
  'appreciationRate',
  'inflationRate',
  'rentGrowthRate',
  'interestRate',
  'propertyTaxGrowthRate',
  'insuranceGrowthRate',
  'maintenanceGrowthRate',
  'sellingCostPercent',
] as const;

type FinancialAssumptionKey = (typeof FINANCIAL_ASSUMPTION_KEYS)[number];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function asFinite(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function clampFinancialRate(key: FinancialAssumptionKey, value: number): number {
  if (key === 'interestRate') return clamp(value, 0, 0.25);
  if (key === 'sellingCostPercent') return clamp(value, 0.01, 0.2);
  if (key === 'rentGrowthRate') return clamp(value, 0, 0.2);
  if (key === 'appreciationRate') return clamp(value, 0, 0.2);
  return clamp(value, 0, 0.2);
}

export function normalizeFinancialAssumptionInput(
  input: Record<string, unknown> | FinancialAssumptionInput | undefined | null
): Partial<FinancialAssumptions> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const raw = input as Record<string, unknown>;
  const out: Partial<FinancialAssumptions> = {};

  const assign = (key: FinancialAssumptionKey, value: unknown) => {
    const numeric = asFinite(value);
    if (numeric === undefined) return;
    out[key] = clampFinancialRate(key, numeric);
  };

  assign('appreciationRate', raw.appreciationRate);
  assign('inflationRate', raw.inflationRate);
  assign('rentGrowthRate', raw.rentGrowthRate);
  assign('interestRate', raw.interestRate);
  assign('propertyTaxGrowthRate', raw.propertyTaxGrowthRate);
  assign('insuranceGrowthRate', raw.insuranceGrowthRate);
  assign('maintenanceGrowthRate', raw.maintenanceGrowthRate);
  assign('sellingCostPercent', raw.sellingCostPercent ?? raw.sellingCostRate);

  return out;
}

export function hasFinancialAssumptionInput(input: FinancialAssumptionInput | undefined | null): boolean {
  const normalized = normalizeFinancialAssumptionInput(input);
  return Object.keys(normalized).length > 0;
}

function assignMissing(
  target: Partial<FinancialAssumptions>,
  source: Partial<FinancialAssumptions>
): Partial<FinancialAssumptions> {
  for (const key of FINANCIAL_ASSUMPTION_KEYS) {
    if (target[key] === undefined && source[key] !== undefined) {
      target[key] = source[key];
    }
  }
  return target;
}

function deriveLiquidityPreference(cashBufferPosture: CashBufferPosture | null): 'HIGH' | 'MODERATE' | 'LOW' {
  if (cashBufferPosture === 'TIGHT') return 'HIGH';
  if (cashBufferPosture === 'STRONG') return 'LOW';
  return 'MODERATE';
}

function deriveHorizonPreference(riskTolerance: PreferenceRiskTolerance | null): 'SHORT' | 'BALANCED' | 'LONG' {
  if (riskTolerance === 'LOW') return 'SHORT';
  if (riskTolerance === 'HIGH') return 'LONG';
  return 'BALANCED';
}

export function deriveFinancialPreferenceDefaults(input: {
  riskTolerance: PreferenceRiskTolerance | null;
  cashBufferPosture: CashBufferPosture | null;
}): Partial<FinancialAssumptions> {
  const baseByRisk: Record<'LOW' | 'MEDIUM' | 'HIGH', FinancialAssumptions> = {
    LOW: {
      appreciationRate: 0.032,
      inflationRate: 0.03,
      rentGrowthRate: 0.025,
      interestRate: 0.068,
      propertyTaxGrowthRate: 0.03,
      insuranceGrowthRate: 0.045,
      maintenanceGrowthRate: 0.035,
      sellingCostPercent: 0.07,
    },
    MEDIUM: {
      appreciationRate: 0.04,
      inflationRate: 0.035,
      rentGrowthRate: 0.03,
      interestRate: 0.065,
      propertyTaxGrowthRate: 0.035,
      insuranceGrowthRate: 0.05,
      maintenanceGrowthRate: 0.04,
      sellingCostPercent: 0.06,
    },
    HIGH: {
      appreciationRate: 0.05,
      inflationRate: 0.038,
      rentGrowthRate: 0.038,
      interestRate: 0.06,
      propertyTaxGrowthRate: 0.04,
      insuranceGrowthRate: 0.055,
      maintenanceGrowthRate: 0.045,
      sellingCostPercent: 0.055,
    },
  };

  const risk = input.riskTolerance ?? 'MEDIUM';
  const defaults = { ...baseByRisk[risk] };

  if (input.cashBufferPosture === 'TIGHT') {
    defaults.sellingCostPercent = clampFinancialRate('sellingCostPercent', defaults.sellingCostPercent + 0.005);
    defaults.appreciationRate = clampFinancialRate('appreciationRate', defaults.appreciationRate - 0.003);
    defaults.interestRate = clampFinancialRate('interestRate', defaults.interestRate + 0.003);
  } else if (input.cashBufferPosture === 'STRONG') {
    defaults.sellingCostPercent = clampFinancialRate('sellingCostPercent', defaults.sellingCostPercent - 0.003);
    defaults.appreciationRate = clampFinancialRate('appreciationRate', defaults.appreciationRate + 0.002);
  }

  return defaults;
}

function extractSignalNumber(
  signal: {
    valueNumber: number | null;
    valueJson: Prisma.JsonValue | null;
  },
  jsonField?: string
): number | null {
  if (signal.valueNumber !== null && Number.isFinite(signal.valueNumber)) {
    return signal.valueNumber;
  }

  if (jsonField && signal.valueJson && typeof signal.valueJson === 'object' && !Array.isArray(signal.valueJson)) {
    const value = Number((signal.valueJson as Record<string, unknown>)[jsonField]);
    if (Number.isFinite(value)) return value;
  }

  return null;
}

export function deriveExpenseGrowthRate(assumptions: FinancialAssumptions): number {
  const weighted =
    assumptions.propertyTaxGrowthRate * 0.35 +
    assumptions.insuranceGrowthRate * 0.35 +
    assumptions.maintenanceGrowthRate * 0.3;
  const stabilized = weighted * 0.9 + assumptions.inflationRate * 0.1;
  return clamp(stabilized, 0, 0.2);
}

export class FinancialAssumptionService {
  private preferenceProfileService = new PreferenceProfileService();
  private assumptionSetService = new AssumptionSetService();

  async resolveForTool(input: ResolveFinancialAssumptionsInput): Promise<ResolveFinancialAssumptionsResult> {
    const postureDefaults = await this.preferenceProfileService.resolvePostureDefaults(input.propertyId);
    const posture: DerivedFinancialPosture = {
      riskTolerance: postureDefaults.riskTolerance,
      cashBufferPosture: postureDefaults.cashBufferPosture,
      longTermHorizonPreference: deriveHorizonPreference(postureDefaults.riskTolerance),
      liquidityPreference: deriveLiquidityPreference(postureDefaults.cashBufferPosture),
    };

    let resolvedAssumptionSetId: string | null = null;
    let assumptionSetOverrides: Partial<FinancialAssumptions> = {};

    if (input.assumptionSetId) {
      const existing = await this.assumptionSetService.getById(input.propertyId, input.assumptionSetId);
      if (!existing) {
        throw new Error('Assumption set not found for this property.');
      }
      resolvedAssumptionSetId = existing.id;
      assumptionSetOverrides = normalizeFinancialAssumptionInput(
        extractAssumptionOverrides(existing.assumptionsJson)
      );
    }

    const requestOverrides = normalizeFinancialAssumptionInput(input.requestOverrides);
    const canonicalDefaults = normalizeFinancialAssumptionInput(input.canonicalDefaults);
    const legacyFallbacks = normalizeFinancialAssumptionInput(input.legacyFallbacks);
    const preferenceDefaults = deriveFinancialPreferenceDefaults({
      riskTolerance: postureDefaults.riskTolerance,
      cashBufferPosture: postureDefaults.cashBufferPosture,
    });

    const merged: Partial<FinancialAssumptions> = {
      ...canonicalDefaults,
      ...assumptionSetOverrides,
    };

    assignMissing(merged, preferenceDefaults);
    assignMissing(merged, legacyFallbacks);
    assignMissing(merged, GLOBAL_FINANCIAL_DEFAULTS);

    for (const key of FINANCIAL_ASSUMPTION_KEYS) {
      if (requestOverrides[key] !== undefined) {
        merged[key] = requestOverrides[key];
      }
    }

    const assumptions = merged as FinancialAssumptions;
    if (hasAssumptionOverrides(requestOverrides)) {
      const created = await this.assumptionSetService.create({
        propertyId: input.propertyId,
        toolKey: input.toolKey,
        scenarioKey: input.scenarioKey ?? null,
        preferenceProfileId: postureDefaults.preferenceProfileId,
        assumptionsJson: {
          version: 1,
          domain: 'FINANCIAL_MODELING',
          overrides: assumptions,
          parentAssumptionSetId: resolvedAssumptionSetId,
        },
        createdByUserId: input.createdByUserId ?? null,
      });
      resolvedAssumptionSetId = created.id;
    }

    const sharedSignals = await signalService.getLatestSignalsByKey(
      input.propertyId,
      ['SAVINGS_REALIZATION', 'FINANCIAL_DISCIPLINE'],
      { freshOnly: true }
    );
    const savingsSignal = sharedSignals.SAVINGS_REALIZATION ?? null;
    const disciplineSignal = sharedSignals.FINANCIAL_DISCIPLINE ?? null;
    const savingsRealizationAnnual = savingsSignal
      ? extractSignalNumber(savingsSignal, 'estimatedAnnualSavings')
      : null;

    return {
      assumptions,
      assumptionSetId: resolvedAssumptionSetId,
      preferenceProfileId: postureDefaults.preferenceProfileId,
      posture,
      sharedSignalsUsed: [
        ...(savingsSignal ? ['SAVINGS_REALIZATION'] : []),
        ...(disciplineSignal ? ['FINANCIAL_DISCIPLINE'] : []),
      ],
      savingsRealizationAnnual,
    };
  }
}
