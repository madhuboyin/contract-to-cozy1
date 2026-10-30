import { z } from 'zod';

export const COVERAGE_ANALYSIS_RUN_MESSAGE = 'Run a coverage check for this journey step.';

// The household's own on-demand run (register "Coverage Intelligence"; FRD v1.491): the same saved analysis, for the whole home, started from the coverage answer
// rather than from a journey step. Another declared action of COVERAGE_ANALYSIS_RUN (no new operation), contributor and up like the route.
export const COVERAGE_PROPERTY_ANALYSIS_MESSAGE = 'Run a coverage analysis for my home.';
export const COVERAGE_PROPERTY_ANALYSIS_ACTION_ID = 'coverage-analysis-run-property';

// Desktop's item "Get coverage" page (FRD v1.492): is a warranty or service plan worth it for this item, from the household's own numbers. The same saved item analysis the
// page runs. A declared action on a coverage-gap item card, another action of COVERAGE_ANALYSIS_RUN; nothing is bought and no plan is contacted.
export const COVERAGE_ITEM_ANALYSIS_MESSAGE = 'Check whether coverage is worth it for this item.';
export const COVERAGE_ITEM_ANALYSIS_ACTION_ID = 'coverage-item-analysis';
export const COVERAGE_ITEM_ANALYSIS_CAPTURE_KEY = 'COVERAGE_ITEM_ANALYSIS_INPUTS';
export const COVERAGE_ITEM_TYPES = ['WARRANTY', 'SERVICE_PLAN'] as const;
export const COVERAGE_ITEM_TYPE_LABELS: Record<string, string> = { WARRANTY: 'A warranty', SERVICE_PLAN: 'A service plan' };
export const COVERAGE_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const COVERAGE_RISK_LABELS: Record<string, string> = { LOW: 'Low: I would rather avoid surprises', MEDIUM: 'Medium', HIGH: 'High: I can absorb a surprise repair' };
const blank = (value: unknown) => (value === '' || value === null || value === undefined ? undefined : value);
const money = (max: number) => z.preprocess(blank, z.coerce.number().nonnegative().max(max).optional());
const ItemAnalysisSchema = z.object({
  coverageType: z.enum(COVERAGE_ITEM_TYPES), riskTolerance: z.enum(COVERAGE_RISK_LEVELS),
  annualCostUsd: money(1_000_000), serviceFeeUsd: money(100_000), replacementCostUsd: money(100_000_000), expectedRemainingYears: money(100), cashBufferUsd: money(100_000_000),
}).strict();
export type CoverageItemAnalysisForm = z.infer<typeof ItemAnalysisSchema>;
export function parseCoverageItemAnalysisForm(answer: unknown): { success: true; data: CoverageItemAnalysisForm } | { success: false } {
  const parsed = ItemAnalysisSchema.safeParse(answer);
  return parsed.success ? { success: true, data: parsed.data } : { success: false };
}
/** The overrides the canonical item analysis takes, as the page sends them: only what was entered, so the rest comes from the home's records. */
export const coverageItemAnalysisOverrides = (form: CoverageItemAnalysisForm) => ({
  coverageType: form.coverageType, riskTolerance: form.riskTolerance,
  ...(form.annualCostUsd !== undefined ? { annualCostUsd: form.annualCostUsd } : {}), ...(form.serviceFeeUsd !== undefined ? { serviceFeeUsd: form.serviceFeeUsd } : {}),
  ...(form.replacementCostUsd !== undefined ? { replacementCostUsd: form.replacementCostUsd } : {}), ...(form.expectedRemainingYears !== undefined ? { expectedRemainingYears: form.expectedRemainingYears } : {}),
  ...(form.cashBufferUsd !== undefined ? { cashBufferUsd: form.cashBufferUsd } : {}),
});
