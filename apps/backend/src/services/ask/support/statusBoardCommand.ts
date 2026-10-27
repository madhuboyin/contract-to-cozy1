// Correcting and refreshing the Status Board inside Ask (register P1 "Status Board"; FRD v1.319). Pure: messages, action ids, the form and validation.
//
// The board's condition and recommendation are estimates from age, expected life, warranty and maintenance. A household can override either, correct the
// purchase or install date, add a note, pin an item or hide it; and can ask for the whole board to be recomputed. Ask does the same through the same
// service. The recorded override never replaces the computed estimate: both stay on the item.
import { z } from 'zod';

export const STATUS_BOARD_PROPERTY_ENTITY_TYPE = 'STATUS_BOARD_PROPERTY';
export const STATUS_BOARD_ITEM_ENTITY_TYPE = 'STATUS_BOARD_ITEM';
export const STATUS_BOARD_COMMAND_MESSAGES = {
  REFRESH: 'Refresh the status board from my current records.',
  CORRECT: 'Correct the status of this home item.',
} as const;
export type StatusBoardCommandKind = keyof typeof STATUS_BOARD_COMMAND_MESSAGES;
/** Desktop's "Include hidden": the read of items kept off the board, where each can be shown again (a declared action on the board summary, never typed). */
export const STATUS_BOARD_HIDDEN_MESSAGE = 'Show the home items I have hidden from my status board.';
export const STATUS_BOARD_HIDDEN_ACTION_ID = 'status-board-hidden';
export const STATUS_BOARD_COMMAND_ACTION_IDS = { REFRESH: 'status-board-refresh', CORRECT: 'status-board-correct' } as const;
export const statusBoardCommandKindFromMessage = (message: string): StatusBoardCommandKind | null =>
  ((Object.entries(STATUS_BOARD_COMMAND_MESSAGES) as Array<[StatusBoardCommandKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const STATUS_BOARD_CORRECT_CAPTURE_KEY = 'STATUS_BOARD_CORRECT';

export const CONDITION_OVERRIDES = ['GOOD', 'MONITOR', 'ACTION_NEEDED'] as const;
export const RECOMMENDATION_OVERRIDES = ['OK', 'REPAIR', 'REPLACE_SOON'] as const;
export const CONDITION_LABELS: Record<string, string> = { GOOD: 'In good shape', MONITOR: 'Monitor', ACTION_NEEDED: 'Needs action' };
export const RECOMMENDATION_LABELS: Record<string, string> = { OK: 'Fine as it is', REPAIR: 'Repair', REPLACE_SOON: 'Replace soon' };
/** "Use the estimate" is how a household clears an override: the form value, stored as null. */
export const USE_ESTIMATE = 'USE_ESTIMATE';

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
]);
export const StatusBoardCorrectInputSchema = z.object({
  condition: z.preprocess(blank, z.enum([...CONDITION_OVERRIDES, USE_ESTIMATE]).nullable()).optional(),
  recommendation: z.preprocess(blank, z.enum([...RECOMMENDATION_OVERRIDES, USE_ESTIMATE]).nullable()).optional(),
  installedAt: z.preprocess(blank, exactDate.nullable()).optional(),
  purchaseDate: z.preprocess(blank, exactDate.nullable()).optional(),
  notes: z.preprocess(blank, z.string().trim().max(2000).nullable()).optional(),
  pinned: z.preprocess(blank, z.enum(['PIN', 'UNPIN']).nullable()).optional(),
  hidden: z.preprocess(blank, z.enum(['HIDE', 'SHOW']).nullable()).optional(),
}).strict();

/** The partial the canonical patchItemStatus takes: only what the form set, with "use the estimate" as an explicit null. */
export interface StatusBoardPatch {
  overrideCondition?: (typeof CONDITION_OVERRIDES)[number] | null;
  overrideRecommendation?: (typeof RECOMMENDATION_OVERRIDES)[number] | null;
  overrideInstalledAt?: string; overridePurchaseDate?: string; overrideNotes?: string; isPinned?: boolean; isHidden?: boolean;
}

export function parseStatusBoardCorrectAnswer(answer: unknown): { success: true; data: StatusBoardPatch } | { success: false; reason: 'INVALID' | 'NOTHING' } {
  const parsed = StatusBoardCorrectInputSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const v = parsed.data;
  const patch: StatusBoardPatch = {};
  if (v.condition) patch.overrideCondition = v.condition === USE_ESTIMATE ? null : (v.condition as StatusBoardPatch['overrideCondition']);
  if (v.recommendation) patch.overrideRecommendation = v.recommendation === USE_ESTIMATE ? null : (v.recommendation as StatusBoardPatch['overrideRecommendation']);
  if (v.installedAt) patch.overrideInstalledAt = `${v.installedAt}T12:00:00.000Z`;
  if (v.purchaseDate) patch.overridePurchaseDate = `${v.purchaseDate}T12:00:00.000Z`;
  if (v.notes) patch.overrideNotes = v.notes as string;
  if (v.pinned) patch.isPinned = v.pinned === 'PIN';
  if (v.hidden) patch.isHidden = v.hidden === 'HIDE';
  if (!Object.keys(patch).length) return { success: false, reason: 'NOTHING' };
  return { success: true, data: patch };
}
