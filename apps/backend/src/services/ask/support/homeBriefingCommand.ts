// Home Briefing inside Ask (register P1 "Home Briefing / Home Gazette"; FRD v1.327). Pure: declared messages, action ids, the preferences form and its
// validation (the route's own schema, mirrored).
//
// A briefing is the caller's own: preferences, deliveries and item outcomes are stored per user and property. Sharing selected items creates a public link
// and is not offered here (an owner decision). The Home Gazette is retired and has no Ask surface.
import { z } from 'zod';

export const BRIEFING_PROPERTY_ENTITY_TYPE = 'HOME_BRIEFING_PROPERTY';
export const BRIEFING_ITEM_ENTITY_TYPE = 'HOME_BRIEFING_ITEM';
export const BRIEFING_COMMAND_MESSAGES = {
  GENERATE: 'Prepare my home briefing now.',
  PREFERENCES: 'Change my home briefing settings.',
  SEEN: 'Mark this briefing item as seen.',
  DISMISS: 'Dismiss this briefing item.',
  NOT_USEFUL: 'Mark this briefing item as not useful.',
} as const;
export type BriefingCommandKind = keyof typeof BRIEFING_COMMAND_MESSAGES;
export const BRIEFING_COMMAND_ACTION_IDS = {
  GENERATE: 'home-briefing-generate', PREFERENCES: 'home-briefing-preferences', SEEN: 'home-briefing-seen', DISMISS: 'home-briefing-dismiss', NOT_USEFUL: 'home-briefing-not-useful',
} as const;
export const briefingCommandKindFromMessage = (message: string): BriefingCommandKind | null =>
  ((Object.entries(BRIEFING_COMMAND_MESSAGES) as Array<[BriefingCommandKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const briefingCommandEntityType = (kind: BriefingCommandKind) =>
  kind === 'GENERATE' || kind === 'PREFERENCES' ? BRIEFING_PROPERTY_ENTITY_TYPE : BRIEFING_ITEM_ENTITY_TYPE;
export const BRIEFING_ITEM_OUTCOME: Record<'SEEN' | 'DISMISS' | 'NOT_USEFUL', 'SEEN' | 'DISMISSED' | 'NOT_USEFUL'> = { SEEN: 'SEEN', DISMISS: 'DISMISSED', NOT_USEFUL: 'NOT_USEFUL' };
export const BRIEFING_PREFERENCES_CAPTURE_KEY = 'HOME_BRIEFING_PREFERENCES';

export const BRIEFING_CADENCES = ['IMMEDIATE', 'WEEKLY', 'MONTHLY', 'IMPORTANT_ONLY'] as const;
export const BRIEFING_CADENCE_LABELS: Record<string, string> = { IMMEDIATE: 'As things change', WEEKLY: 'Weekly', MONTHLY: 'Monthly', IMPORTANT_ONLY: 'Only what is important' };
export const BRIEFING_TOPICS = ['HOME_ACTION', 'HOME_HISTORY', 'LOCAL_CHANGE', 'HAZARD', 'PROPERTY_FACT', 'SOURCE_HEALTH', 'OTHER'] as const;
export const BRIEFING_TOPIC_LABELS: Record<string, string> = {
  HOME_ACTION: 'Things to do', HOME_HISTORY: 'Home history', LOCAL_CHANGE: 'Changes nearby', HAZARD: 'Hazards', PROPERTY_FACT: 'Facts about the home', SOURCE_HEALTH: 'Source updates', OTHER: 'Other',
};
export const BRIEFING_CHANNELS = ['IN_APP', 'EMAIL', 'PUSH'] as const;
export const BRIEFING_CHANNEL_LABELS: Record<string, string> = { IN_APP: 'In the app', EMAIL: 'Email', PUSH: 'Push notification' };

export const BriefingPreferencesInputSchema = z.object({
  enabled: z.enum(['YES', 'NO']),
  cadence: z.enum(BRIEFING_CADENCES),
  topics: z.array(z.enum(BRIEFING_TOPICS)).max(7).default([]),
  channels: z.array(z.enum(BRIEFING_CHANNELS)).min(1).max(3),
}).strict();
export type BriefingPreferencesForm = z.infer<typeof BriefingPreferencesInputSchema>;
export function parseBriefingPreferencesAnswer(answer: unknown): { success: true; data: BriefingPreferencesForm } | { success: false } {
  const parsed = BriefingPreferencesInputSchema.safeParse(answer);
  return parsed.success ? { success: true, data: parsed.data } : { success: false };
}
/** What the canonical updateHomeBriefingPreference takes. */
export const briefingPreferencesInput = (form: BriefingPreferencesForm) =>
  ({ enabled: form.enabled === 'YES', cadence: form.cadence, topics: form.topics, channels: form.channels });
