// The buyer's final walkthrough inside Ask (register P2 "Buyer Closing"; FRD v1.345). Pure: declared messages, action ids, forms, validation and the state
// rules, mirroring BuyerWalkthroughService so only what it would accept is offered.
//
// Photos and documents attach where records are added; Ask records the walkthrough's plan, what was seen, and what was done about each problem. Ask
// does not tell anyone to close, delay or withhold funds: that stays with the buyer's professionals, and the answers say so.
import { z } from 'zod';

export const WALKTHROUGH_ENTITY_TYPES = { OBSERVATION: 'BUYER_WALKTHROUGH_OBSERVATION', ISSUE: 'BUYER_WALKTHROUGH_ISSUE' } as const;
export const WALKTHROUGH_MESSAGES = {
  WORKSPACE: 'Update my final walkthrough plan.',
  OBSERVATION_ADD: 'Record a final walkthrough observation.',
  OBSERVATION_REVIEW: 'Record the result of this walkthrough observation.',
  ISSUE_ADD: 'Record an issue from this walkthrough observation.',
  ISSUE_UPDATE: 'Record what is being done about this walkthrough issue.',
  COMPLETE: 'Mark my final walkthrough complete.',
} as const;
export type WalkthroughKind = keyof typeof WALKTHROUGH_MESSAGES;
export const WALKTHROUGH_ACTION_IDS = {
  WORKSPACE: 'walkthrough-plan', OBSERVATION_ADD: 'walkthrough-observation-add', OBSERVATION_REVIEW: 'walkthrough-observation-review',
  ISSUE_ADD: 'walkthrough-issue-add', ISSUE_UPDATE: 'walkthrough-issue-update', COMPLETE: 'walkthrough-complete',
} as const;
export const walkthroughKindFromMessage = (message: string): WalkthroughKind | null =>
  ((Object.entries(WALKTHROUGH_MESSAGES) as Array<[WalkthroughKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export type WalkthroughFormKind = Exclude<WalkthroughKind, 'COMPLETE'>;
export const WALKTHROUGH_CAPTURE_KEYS: Record<WalkthroughFormKind, string> = {
  WORKSPACE: 'BUYER_WALKTHROUGH_PLAN', OBSERVATION_ADD: 'BUYER_WALKTHROUGH_OBSERVATION_ADD', OBSERVATION_REVIEW: 'BUYER_WALKTHROUGH_OBSERVATION_REVIEW',
  ISSUE_ADD: 'BUYER_WALKTHROUGH_ISSUE_ADD', ISSUE_UPDATE: 'BUYER_WALKTHROUGH_ISSUE_UPDATE',
};
export const walkthroughFormKindFromCaptureKey = (key: string): WalkthroughFormKind | null =>
  ((Object.entries(WALKTHROUGH_CAPTURE_KEYS) as Array<[WalkthroughFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;

export const OBSERVATION_CATEGORIES = [
  ['OVERALL_CONDITION', 'Overall condition'], ['INCLUDED_ITEMS', 'Items that should stay'], ['AGREED_REPAIRS', 'Agreed repairs'], ['NEW_DAMAGE', 'New damage'],
  ['LIGHTING_ELECTRICAL', 'Lights and electrical'], ['PLUMBING', 'Plumbing'], ['HVAC_APPLIANCES', 'Heating, cooling and appliances'], ['DOORS_WINDOWS', 'Doors and windows'],
  ['GARAGE_ACCESS', 'Garage and access'], ['SMOKE_CO', 'Smoke and CO alarms'], ['OTHER', 'Other'],
] as const;
export const ISSUE_CATEGORIES = [
  ['REPAIR_COMMITMENT', 'An agreed repair'], ['INCLUDED_ITEM', 'An item that should stay'], ['NEW_DAMAGE', 'New damage'], ['ACCESS_UTILITY', 'Access or utilities'],
  ['SYSTEM_SAFETY', 'A system or safety problem'], ['CLEANLINESS', 'Cleanliness'], ['OTHER', 'Other'],
] as const;
export const OBSERVATION_STATUS_LABELS: Record<string, string> = { NOT_REVIEWED: 'Not reviewed', ACCEPTABLE: 'Looks fine', ISSUE: 'A problem', NOT_APPLICABLE: 'Not applicable' };
export const ISSUE_STATUS_LABELS: Record<string, string> = { OPEN: 'Open', ROUTED_TO_PROFESSIONAL: 'With a professional', RESOLVED: 'Resolved', ACCEPTED_AS_IS: 'Accepted as is' };
export const ROUTED_ROLES = [['BUYER_AGENT', 'My agent'], ['ATTORNEY', 'My attorney'], ['TITLE_ESCROW', 'Title or escrow'], ['OTHER', 'Someone else']] as const;

const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((v) => v.value),
]);
const blank = (v: unknown) => (v === '' || v === undefined || v === null ? undefined : v);
const yesNo = z.enum(['YES', 'NO']);
const notes = z.preprocess(blank, z.string().trim().max(2000).optional());
export const WALKTHROUGH_SCHEMAS = {
  WORKSPACE: z.object({
    scheduledDate: z.preprocess(blank, exactDate.optional()), accessConfirmed: z.preprocess(blank, yesNo.optional()), utilitiesConfirmed: z.preprocess(blank, yesNo.optional()),
  }).strict().refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Fill in at least one thing.' }),
  OBSERVATION_ADD: z.object({
    area: z.string().trim().min(1).max(160), category: z.enum(OBSERVATION_CATEGORIES.map((c) => c[0]) as [string, ...string[]]),
    status: z.enum(['NOT_REVIEWED', 'ACCEPTABLE', 'ISSUE', 'NOT_APPLICABLE']), notes,
  }).strict(),
  OBSERVATION_REVIEW: z.object({ status: z.enum(['ACCEPTABLE', 'ISSUE', 'NOT_APPLICABLE']), notes }).strict(),
  ISSUE_ADD: z.object({
    category: z.enum(ISSUE_CATEGORIES.map((c) => c[0]) as [string, ...string[]]), title: z.string().trim().min(1).max(200), notes, blocking: yesNo,
  }).strict(),
  ISSUE_UPDATE: z.object({
    status: z.enum(['ROUTED_TO_PROFESSIONAL', 'RESOLVED', 'ACCEPTED_AS_IS']), routedToRole: z.preprocess(blank, z.enum(['BUYER_AGENT', 'ATTORNEY', 'TITLE_ESCROW', 'OTHER']).optional()), notes,
  }).strict().refine((v) => v.status !== 'ROUTED_TO_PROFESSIONAL' || Boolean(v.routedToRole), { message: 'Choose who is receiving it.' }),
} as const;
export function parseWalkthroughAnswer(kind: WalkthroughFormKind, answer: unknown) {
  return (WALKTHROUGH_SCHEMAS[kind] as z.ZodType<Record<string, unknown>>).safeParse(answer);
}

interface Workspace { completedAt: string | null; observations: Array<{ id: string; status: string }>; issues: Array<{ id: string; status: string; sourceObservationId: string | null }> }
/** The service's own completion rules, as a list of what still stands in the way (empty when it would accept). */
export function walkthroughCompletionBlockers(workspace: Workspace | null): string[] {
  if (!workspace || workspace.observations.length === 0) return ['Record at least one observation.'];
  const out: string[] = [];
  const notReviewed = workspace.observations.filter((o) => o.status === 'NOT_REVIEWED').length;
  if (notReviewed) out.push(`Review ${notReviewed} observation${notReviewed === 1 ? '' : 's'} you have not reviewed.`);
  const withIssue = new Set(workspace.issues.map((i) => i.sourceObservationId).filter(Boolean));
  const unescalated = workspace.observations.filter((o) => o.status === 'ISSUE' && !withIssue.has(o.id)).length;
  if (unescalated) out.push(`Record an issue for ${unescalated} observation${unescalated === 1 ? '' : 's'} marked as a problem.`);
  const open = workspace.issues.filter((i) => i.status === 'OPEN').length;
  if (open) out.push(`Route or settle ${open} open issue${open === 1 ? '' : 's'}.`);
  return out;
}
/** What an observation or issue row may offer, from its state. */
export const observationKinds = (o: { status: string }, hasIssue: boolean, completed: boolean): WalkthroughKind[] => {
  void completed;
  const out: WalkthroughKind[] = ['OBSERVATION_REVIEW'];
  if (o.status === 'ISSUE' && !hasIssue) out.push('ISSUE_ADD');
  return out;
};
export const issueKinds = (i: { status: string }): WalkthroughKind[] => (i.status === 'OPEN' ? ['ISSUE_UPDATE'] : []);
