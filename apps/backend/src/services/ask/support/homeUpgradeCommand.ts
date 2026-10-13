// Managing saved Home Upgrade Planner options inside Ask (register P0 "Home Digital Twin / Upgrade Planner"; FRD v1.316). Pure: the declared messages and
// action ids, the forms and their validation. The handler, the capture path and the registries share it.
//
// Reached from rows of the upgrade options answer. What is offered is what the planner's own scenario routes do to a saved option: record the decision
// (open, selected, deferred, rejected or closed, with a reason when deferring or rejecting), rename it, archive and restore it, recalculate it (a queued
// job), and delete an archived one. Creating a new option takes a per-type input payload and is a separate slice.
import { z } from 'zod';

export const UPGRADE_SCENARIO_ENTITY_TYPE = 'HOME_UPGRADE_SCENARIO';
export const UPGRADE_COMMAND_MESSAGES = {
  DECIDE: 'Record my decision on this upgrade option.',
  RENAME: 'Rename this upgrade option.',
  ARCHIVE: 'Archive this upgrade option.',
  RESTORE: 'Restore this upgrade option.',
  COMPUTE: 'Recalculate this upgrade option.',
  DELETE: 'Delete this archived upgrade option.',
} as const;
export type UpgradeCommandKind = keyof typeof UPGRADE_COMMAND_MESSAGES;
export const UPGRADE_COMMAND_ACTION_IDS = {
  DECIDE: 'home-upgrade-decide', RENAME: 'home-upgrade-rename', ARCHIVE: 'home-upgrade-archive', RESTORE: 'home-upgrade-restore',
  COMPUTE: 'home-upgrade-compute', DELETE: 'home-upgrade-delete',
} as const;
export const upgradeCommandKindFromMessage = (message: string): UpgradeCommandKind | null =>
  ((Object.entries(UPGRADE_COMMAND_MESSAGES) as Array<[UpgradeCommandKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;

export const UPGRADE_FORM_CAPTURE_KEYS = { DECIDE: 'HOME_UPGRADE_DECIDE', RENAME: 'HOME_UPGRADE_RENAME' } as const;
export type UpgradeFormKind = keyof typeof UPGRADE_FORM_CAPTURE_KEYS;
export const upgradeFormKindFromCaptureKey = (key: string): UpgradeFormKind | null =>
  ((Object.entries(UPGRADE_FORM_CAPTURE_KEYS) as Array<[UpgradeFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;
export const upgradeCommandOpensForm = (kind: UpgradeCommandKind): kind is UpgradeFormKind => kind === 'DECIDE' || kind === 'RENAME';

export const UPGRADE_DECISIONS = ['OPEN', 'SELECTED', 'DEFERRED', 'REJECTED', 'CLOSED'] as const;
export const UPGRADE_DECISION_OPTION_LABELS: Record<string, string> = {
  OPEN: 'Still deciding', SELECTED: 'This is the option I choose', DEFERRED: 'Not now, revisit later', REJECTED: 'I am not doing this', CLOSED: 'Done or no longer relevant',
};

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
export const UpgradeDecisionInputSchema = z.object({
  decisionStatus: z.enum(UPGRADE_DECISIONS),
  decisionReason: z.preprocess(blank, z.string().trim().max(1000).nullable()).optional(),
}).strict();
export const UpgradeRenameInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.preprocess(blank, z.string().trim().max(1000).nullable()).optional(),
}).strict();

export interface UpgradeDecisionInput { decisionStatus: (typeof UPGRADE_DECISIONS)[number]; decisionReason: string | null }
export interface UpgradeRenameInput { name: string; description: string | null }
export type UpgradeFormData = UpgradeDecisionInput | UpgradeRenameInput;

/** Validates a submitted form (or a stored confirmation parameter). A deferred or rejected option needs a reason, as the canonical schema requires. */
export function parseUpgradeFormAnswer(kind: UpgradeFormKind, answer: unknown):
  { success: true; data: UpgradeFormData } | { success: false; reason: 'INVALID' | 'REASON_REQUIRED' } {
  if (kind === 'RENAME') {
    const parsed = UpgradeRenameInputSchema.safeParse(answer);
    return parsed.success ? { success: true, data: { name: parsed.data.name, description: (parsed.data.description ?? null) as string | null } } : { success: false, reason: 'INVALID' };
  }
  const parsed = UpgradeDecisionInputSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const reason = (parsed.data.decisionReason ?? null) as string | null;
  if ((parsed.data.decisionStatus === 'DEFERRED' || parsed.data.decisionStatus === 'REJECTED') && !reason) return { success: false, reason: 'REASON_REQUIRED' };
  return { success: true, data: { decisionStatus: parsed.data.decisionStatus, decisionReason: reason } };
}
