// apps/backend/src/refinanceRadar/mappers/refinanceRadar.mapper.ts
//
// Converts Prisma DB records → API-safe DTOs.
// Handles Decimal → number conversion and date formatting.

import {
  RefinanceConfidenceLevel,
  RefinanceOpportunity,
  RefinanceRadarState,
  RefinanceScenarioSnapshot,
  RefinanceScenarioTerm,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  RefinanceOpportunityDTO,
  RefinanceScenarioSnapshotDTO,
} from '../types/refinanceRadar.types';
import { TERM_TO_MONTHS } from '../engine/refinanceCalculation.engine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: Decimal | null | undefined): number {
  return v ? v.toNumber() : 0;
}

function toNumOrNull(v: Decimal | null | undefined): number | null {
  return v != null ? v.toNumber() : null;
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ─── Opportunity ─────────────────────────────────────────────────────────────

export function mapOpportunityToDTO(row: RefinanceOpportunity): RefinanceOpportunityDTO {
  return {
    id: row.id,
    propertyId: row.propertyId,
    currentRatePct: row.currentRate,
    marketRatePct: row.marketRate,
    rateGapPct: row.rateGap,
    loanBalance: toNum(row.loanBalance),
    monthlySavings: toNum(row.monthlySavings),
    breakEvenMonths: row.breakEvenMonths,
    lifetimeSavings: toNum(row.lifetimeSavings),
    confidenceLevel: row.confidenceLevel,
    radarState: row.radarState,
    evaluationDate: toDateStr(row.evaluationDate),
    triggerDate: row.triggerDate ? row.triggerDate.toISOString() : null,
    closingCostAssumptionUsd: toNumOrNull(row.closingCostAssumption),
    remainingTermMonths: row.remainingTermMonths,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Scenario Snapshot ────────────────────────────────────────────────────────

export function mapScenarioToDTO(row: RefinanceScenarioSnapshot): RefinanceScenarioSnapshotDTO {
  return {
    id: row.id,
    propertyId: row.propertyId,
    targetRatePct: row.targetRate,
    targetTerm: row.targetTerm,
    targetTermMonths: TERM_TO_MONTHS[row.targetTerm as RefinanceScenarioTerm],
    closingCostUsd: toNum(row.closingCost),
    monthlySavings: toNumOrNull(row.monthlySavings),
    breakEvenMonths: row.breakEvenMonths ?? null,
    lifetimeSavings: toNumOrNull(row.lifetimeSavings),
    isSaved: row.isSaved,
    createdAt: row.createdAt.toISOString(),
  };
}
