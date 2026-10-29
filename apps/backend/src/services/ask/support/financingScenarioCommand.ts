// Saved financing scenarios inside Ask (register "Financing"; FRD v1.484). Desktop's Financing pages save a project-cost comparison as a scenario, record
// which way to pay the household is leaning toward, archive a scenario, and refresh the equity position. Ask read all of it and wrote none.
// Pure: the declared action ids, the two small forms and their validation.
//
// These are extra actions of the existing FINANCING_PROFILE_COMMAND (no new operation or registry entry), so they keep that command's owner floor: a saved
// scenario stores the equity and HELOC snapshots the profile feeds, which are owner-only on every surface. This is stricter than Desktop, whose scenario
// routes ask for a contributor.
import { z } from 'zod';

export const FINANCING_SCENARIO_ACTION_IDS = {
  SAVE: 'financing-scenario-save',
  CHOOSE: 'financing-scenario-choose',
  ARCHIVE: 'financing-scenario-archive',
  REFRESH_EQUITY: 'financing-equity-refresh',
} as const;
export type FinancingScenarioActionId = typeof FINANCING_SCENARIO_ACTION_IDS[keyof typeof FINANCING_SCENARIO_ACTION_IDS];
export const isFinancingScenarioActionId = (value: string | null | undefined): value is FinancingScenarioActionId =>
  Object.values(FINANCING_SCENARIO_ACTION_IDS).includes(value as FinancingScenarioActionId);
export const FINANCING_SCENARIO_CAPTURE_KEY = 'FINANCING_SCENARIO_INPUTS';
/** The entity type of a row's target scenario; a save carries the project cost (in cents) as its entity id under the cost type. */
export const FINANCING_SCENARIO_ENTITY_TYPE = 'FINANCING_SCENARIO';
export const FINANCING_PROJECT_COST_ENTITY_TYPE = 'FINANCING_PROJECT_COST';

export const FINANCING_OPTIONS = ['HELOC', 'HOME_EQUITY_LOAN', 'PERSONAL_LOAN', 'CONTRACTOR_FINANCING', 'PAY_CASH'] as const;
export const FINANCING_OPTION_LABELS: Record<string, string> = {
  HELOC: 'Home equity line of credit (HELOC)', HOME_EQUITY_LOAN: 'Home equity loan', PERSONAL_LOAN: 'Personal loan', CONTRACTOR_FINANCING: 'Contractor financing', PAY_CASH: 'Pay cash',
};

const SaveFormSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.preprocess((value) => (value === '' || value === null ? undefined : value), z.string().trim().max(1000).optional()),
}).strict();
const ChooseFormSchema = z.object({ option: z.enum(FINANCING_OPTIONS) }).strict();

export type FinancingScenarioSaveForm = z.infer<typeof SaveFormSchema>;
export type FinancingScenarioChooseForm = z.infer<typeof ChooseFormSchema>;

export function parseScenarioSaveAnswer(answer: unknown): { success: true; data: FinancingScenarioSaveForm } | { success: false } {
  const parsed = SaveFormSchema.safeParse(answer);
  return parsed.success ? { success: true, data: parsed.data } : { success: false };
}
export function parseScenarioChooseAnswer(answer: unknown): { success: true; data: FinancingScenarioChooseForm } | { success: false } {
  const parsed = ChooseFormSchema.safeParse(answer);
  return parsed.success ? { success: true, data: parsed.data } : { success: false };
}

/** The project cost a save was launched with, in whole cents; null when the entity id is not a usable amount. */
export function projectCostFromEntityId(entityId: string | null | undefined): number | null {
  if (!entityId || !/^\d{1,12}$/.test(entityId)) return null;
  const cents = Number(entityId);
  return Number.isSafeInteger(cents) && cents >= 100 ? cents : null;
}
