// Exploring upgrade ideas inside Ask (register "Renovation Risk Advisor"; FRD v1.487). Desktop's "Explore a renovation" page takes the household's goals, spaces,
// budget and timing, has the home-upgrade advisor produce a short list of options for this property, lets the household save or set aside each option, and
// turns a chosen option into a renovation case. Ask had none of it (found by the 2026-10-29 register check).
// Pure: the declared action ids and messages, the goals form and its validation, and the exact input the canonical createExploration takes.
//
// These are extra actions of the existing RENOVATION_CASE_START command (no new operation or registry entry), so they keep its contributor floor, which is
// also the floor of the three explore routes. Nothing is applied for, bought or started by any of them.
import { z } from 'zod';

export const RENOVATION_EXPLORE_ACTION_IDS = {
  START: 'renovation-explore-start',
  SAVE: 'renovation-option-save',
  SET_ASIDE: 'renovation-option-set-aside',
  CREATE_PLAN: 'renovation-option-create-plan',
} as const;
export type RenovationExploreActionId = typeof RENOVATION_EXPLORE_ACTION_IDS[keyof typeof RENOVATION_EXPLORE_ACTION_IDS];
export const isRenovationExploreActionId = (value: string | null | undefined): value is RenovationExploreActionId =>
  Object.values(RENOVATION_EXPLORE_ACTION_IDS).includes(value as RenovationExploreActionId);
export const RENOVATION_EXPLORE_MESSAGES: Record<RenovationExploreActionId, string> = {
  'renovation-explore-start': 'Explore upgrade ideas for this home.',
  'renovation-option-save': 'Save this upgrade idea.',
  'renovation-option-set-aside': 'Set this upgrade idea aside.',
  'renovation-option-create-plan': 'Turn this upgrade idea into a renovation plan.',
};
export const RENOVATION_OPTION_ENTITY_TYPE = 'RENOVATION_UPGRADE_OPTION';
export const RENOVATION_EXPLORE_CAPTURE_KEY = 'RENOVATION_EXPLORE_INPUTS';

/** The option's entity id carries both ids, because the canonical calls take the exploration and the option. */
export const optionEntityId = (explorationId: string, optionId: string) => `${explorationId}:${optionId}`;
export function parseOptionEntityId(entityId: string | null | undefined): { explorationId: string; optionId: string } | null {
  const match = /^([^:\s]{1,80}):([^:\s]{1,80})$/.exec(entityId ?? '');
  return match ? { explorationId: match[1], optionId: match[2] } : null;
}

export const RENOVATION_OPTION_STATUS_LABELS: Record<string, string> = { GENERATED: 'New idea', SAVED: 'Saved', REJECTED: 'Set aside', SELECTED: 'Plan created' };

/** Desktop's ten goals, in its words; the ids pick the preference lists Desktop sends beside them. */
export const RENOVATION_GOALS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'accessibility', label: 'Accessibility improvements (wheelchair, mobility)' },
  { id: 'aging', label: 'Aging in place modifications' },
  { id: 'family', label: 'Growing family / additional space' },
  { id: 'resale', label: 'Increase resale value' },
  { id: 'energy', label: 'Energy efficiency / lower bills' },
  { id: 'safety', label: 'Safety and security upgrades' },
  { id: 'modern', label: 'Modernize outdated features' },
  { id: 'outdoor', label: 'Outdoor living spaces' },
  { id: 'resilience', label: 'Improve resilience to weather or outages' },
  { id: 'maintenance', label: 'Reduce ongoing maintenance burden' },
];
const GOAL_IDS = RENOVATION_GOALS.map((goal) => goal.id) as [string, ...string[]];
export const RENOVATION_EXPLORE_RESPONSIBILITIES = ['UNKNOWN', 'HOMEOWNER', 'ASSOCIATION', 'SHARED', 'LANDLORD', 'OTHER'] as const;

const blank = (value: unknown) => (value === '' || value === null || value === undefined ? undefined : value);
const ExploreSchema = z.object({
  goal: z.enum(GOAL_IDS),
  secondGoal: z.preprocess(blank, z.enum(GOAL_IDS).optional()),
  responsibilityContext: z.preprocess(blank, z.enum(RENOVATION_EXPLORE_RESPONSIBILITIES).optional()),
  spaces: z.preprocess(blank, z.string().trim().max(400).optional()),
  budgetMax: z.preprocess(blank, z.coerce.number().positive().max(100_000_000).optional()),
  targetTiming: z.preprocess(blank, z.string().trim().max(240).optional()),
}).strict().refine((value) => !value.secondGoal || value.secondGoal !== value.goal, { message: 'Pick a different second goal', path: ['secondGoal'] });
export type RenovationExploreForm = z.infer<typeof ExploreSchema>;

export function parseRenovationExploreAnswer(answer: unknown): { success: true; data: RenovationExploreForm } | { success: false } {
  const parsed = ExploreSchema.safeParse(answer);
  return parsed.success ? { success: true, data: parsed.data } : { success: false };
}

export const goalLabel = (id: string) => RENOVATION_GOALS.find((goal) => goal.id === id)?.label ?? id;
const selectedGoalIds = (form: RenovationExploreForm) => [...new Set([form.goal, form.secondGoal].filter((id): id is string => Boolean(id)))];

/** What the canonical createExploration takes (its route schema's defaults filled in, since Ask calls the service directly), as Desktop's page builds it. */
export function renovationExploreServiceInput(form: RenovationExploreForm, idempotencyKey: string) {
  const ids = selectedGoalIds(form);
  return {
    goals: ids.map(goalLabel),
    responsibilityContext: form.responsibilityContext ?? 'UNKNOWN',
    spacesAffected: String(form.spaces ?? '').split(',').map((part) => part.trim()).filter(Boolean).slice(0, 20).map((part) => part.slice(0, 160)),
    systemsAffected: [] as string[],
    ...(form.budgetMax !== undefined ? { budgetMaxCents: Math.round(form.budgetMax * 100) } : {}),
    ...(form.targetTiming ? { targetTiming: form.targetTiming } : {}),
    accessibilityPreferences: ids.includes('accessibility') ? ['ACCESSIBILITY'] : [],
    resiliencePreferences: ids.includes('resilience') ? ['RESILIENCE'] : [],
    efficiencyPreferences: ids.includes('energy') ? ['ENERGY_EFFICIENCY'] : [],
    maintenancePreferences: ids.includes('maintenance') ? ['LOW_MAINTENANCE'] : [],
    idempotencyKey,
  };
}
export const exploreGoalLabels = (form: RenovationExploreForm) => selectedGoalIds(form).map(goalLabel);

// Side by side (FRD v1.493): Desktop lets the household tick up to three ideas to compare. Ask's cards have no multi-select, so the shortlist is the ideas the household
// saved: up to three, saved ones first, then new ones, never set-aside ideas or ideas that already have a plan. Pure; a read that writes nothing.
export const RENOVATION_IDEAS_COMPARE_ACTION_ID = 'renovation-ideas-compare';
export const RENOVATION_IDEAS_COMPARE_MESSAGE = 'Compare my upgrade ideas side by side.';
export const RENOVATION_COMPARE_LIMIT = 3;
export function pickIdeasToCompare<T extends { status: string; position?: number }>(options: readonly T[]): { picked: T[]; savedCount: number; activeCount: number } {
  const byPosition = (a: T, b: T) => (a.position ?? 0) - (b.position ?? 0);
  const saved = options.filter((option) => option.status === 'SAVED').sort(byPosition);
  const fresh = options.filter((option) => option.status === 'GENERATED').sort(byPosition);
  return { picked: [...saved, ...fresh].slice(0, RENOVATION_COMPARE_LIMIT), savedCount: saved.length, activeCount: saved.length + fresh.length };
}
