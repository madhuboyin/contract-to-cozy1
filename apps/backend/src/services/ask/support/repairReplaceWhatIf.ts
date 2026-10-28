// Repair or replace: try different numbers (register "Repair or Replace"; FRD v1.466). Desktop's per-item analysis page lets a contributor type their own
// repair cost, replacement cost, remaining years, cash buffer, risk tolerance and usage, then re-run the analysis. Ask offered the analysis without them.
// Pure: the declared message and action id, the form, and the overrides the canonical ReplaceRepairService takes.
//
// A what-if computes the same analysis from the given numbers and SAVES NOTHING (ReplaceRepairService.runItemAnalysis with `preview`): the item's saved
// analysis, which other views read, is not replaced by a guess. Desktop's Run analysis does save; this is a deliberate difference.
import { z } from 'zod';

export const REPAIR_REPLACE_WHAT_IF_MESSAGE = 'Try different numbers for this repair or replace analysis.';
export const REPAIR_REPLACE_WHAT_IF_ACTION_ID = 'repair-replace-what-if';
export const REPAIR_REPLACE_WHAT_IF_CAPTURE_KEY = 'REPAIR_REPLACE_WHAT_IF_INPUTS';

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? undefined : value);
const dollars = z.preprocess(blank, z.coerce.number().nonnegative().max(10_000_000).optional());
const level = z.preprocess(blank, z.enum(['LOW', 'MEDIUM', 'HIGH']).optional());

export const RepairReplaceWhatIfAnswerSchema = z.object({
  estimatedNextRepairCostUsd: dollars,
  estimatedReplacementCostUsd: dollars,
  expectedRemainingYears: z.preprocess(blank, z.coerce.number().min(0).max(40).optional()),
  cashBufferUsd: dollars,
  riskTolerance: level,
  usageIntensity: level,
}).strict();
export type RepairReplaceWhatIfAnswer = z.infer<typeof RepairReplaceWhatIfAnswerSchema>;

export interface RepairReplaceOverrides {
  estimatedNextRepairCostCents?: number;
  estimatedReplacementCostCents?: number;
  expectedRemainingYears?: number;
  cashBufferCents?: number;
  riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
  usageIntensity?: 'LOW' | 'MEDIUM' | 'HIGH';
}

const cents = (value: number | undefined) => (value === undefined ? undefined : Math.round(value * 100));

/** The overrides the canonical service takes, from a validated form. A field left blank is left out, so the model's own number stands. */
export function whatIfOverrides(answer: RepairReplaceWhatIfAnswer): RepairReplaceOverrides {
  const overrides: RepairReplaceOverrides = {
    estimatedNextRepairCostCents: cents(answer.estimatedNextRepairCostUsd), estimatedReplacementCostCents: cents(answer.estimatedReplacementCostUsd),
    expectedRemainingYears: answer.expectedRemainingYears, cashBufferCents: cents(answer.cashBufferUsd), riskTolerance: answer.riskTolerance, usageIntensity: answer.usageIntensity,
  };
  return Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)) as RepairReplaceOverrides;
}

/** What the homeowner changed, in words, for the answer to state exactly which numbers it used. */
export function whatIfSummary(overrides: RepairReplaceOverrides): string[] {
  const money = (value: number) => `$${(value / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const word = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();
  return [
    ...(overrides.estimatedNextRepairCostCents !== undefined ? [`next repair ${money(overrides.estimatedNextRepairCostCents)}`] : []),
    ...(overrides.estimatedReplacementCostCents !== undefined ? [`replacement ${money(overrides.estimatedReplacementCostCents)}`] : []),
    ...(overrides.expectedRemainingYears !== undefined ? [`${overrides.expectedRemainingYears} ${overrides.expectedRemainingYears === 1 ? 'year' : 'years'} of life left`] : []),
    ...(overrides.cashBufferCents !== undefined ? [`${money(overrides.cashBufferCents)} set aside`] : []),
    ...(overrides.riskTolerance ? [`${word(overrides.riskTolerance)} risk tolerance`] : []),
    ...(overrides.usageIntensity ? [`${word(overrides.usageIntensity)} usage`] : []),
  ];
}
