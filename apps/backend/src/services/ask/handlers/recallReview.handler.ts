// Group B, recall review slice (gap audit §17; FRD v1.156/§17, v1.161). Read-only originally: Ask
// had no existing operation for product recalls at all (unlike inspection findings, which turned
// out to already be fully covered by INSPECTION_FINDINGS/INSPECTION_FINDING_UPDATE). Confirm/
// dismiss/resolve mutations (RECALL_MATCH_UPDATE, FRD v1.163) are the deferred follow-up, added
// below, mirroring how HOME_EVENT_RADAR_FEED (read) shipped before its STATE/MARK_DONE/FEEDBACK
// write siblings and how INSPECTION_FINDINGS/INSPECTION_FINDING_UPDATE split read from write.
import { HouseholdRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { type CorrectionOption } from '../askCorrectionFields';
import { ensurePropertyAccess, exactEntityMatch, type RecallResolution } from '../askHandlerSupport';
import { listPropertyRecallMatches } from '../../recalls.service';

const RECALL_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  NEEDS_CONFIRMATION: 'Needs confirmation',
  DISMISSED: 'Dismissed',
  RESOLVED: 'Resolved',
};

export function recallReviewHref(propertyId: string): string {
  return `/dashboard/properties/${encodeURIComponent(propertyId)}/recalls`;
}

// RECALL_MATCH_UPDATE item actions (FRD v1.163). The traditional RecallMatchCard.tsx (read before
// implementing, not assumed) shows three live-state-gated actions per match, driven by
// recallsService.ts's own confirmRecallMatch/dismissRecallMatch/resolveRecallMatch: Confirm (item
// identity or the whole match, depending on why applicability is UNKNOWN -- both call the same
// confirmRecallMatch), Dismiss ("Not my model"), and Resolve (only once identity is no longer
// UNKNOWN). A RESOLVED/DISMISSED match is terminal and never appears in recallReviewResult's own
// `open` list, so no gating case for those is needed here.
export const RECALL_MATCH_ACTIONS = [
  { id: 'recall-confirm', label: 'Confirm match', message: 'Confirm this recall match.', action: 'CONFIRM' },
  { id: 'recall-dismiss', label: 'Not my model', message: 'Dismiss this recall match.', action: 'DISMISS' },
  { id: 'recall-resolve', label: 'Mark resolved', message: 'Resolve this recall match.', action: 'RESOLVE' },
] as const;

export function recallMatchItemActions(role: HouseholdRole) {
  if (role === HouseholdRole.VIEWER) return [];
  return RECALL_MATCH_ACTIONS.map(({ id, label, message }) => ({ id, label, message, style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'RECALL_MATCH_UPDATE' as const }));
}

// Mirrors RecallMatchCard.tsx's own branching exactly: requiresIdentityConfirmation is
// applicability.status === 'UNKNOWN' (reused from listPropertyRecallMatches's own
// withRecallApplicability computation, not recomputed here).
export function recallMatchActionAllowed(action: 'CONFIRM' | 'DISMISS' | 'RESOLVE', match: { status: string; applicability: { status: string } }): boolean {
  if (match.status !== 'OPEN' && match.status !== 'NEEDS_CONFIRMATION') return false;
  const needsIdentityConfirmation = match.applicability.status === 'UNKNOWN';
  if (action === 'CONFIRM') return needsIdentityConfirmation;
  if (action === 'RESOLVE') return match.status === 'OPEN' && !needsIdentityConfirmation;
  return true;
}

export function recallMatchItemActionsFor(role: HouseholdRole, match: { status: string; applicability: { status: string } }) {
  const allowed = new Set(RECALL_MATCH_ACTIONS.filter(({ action }) => recallMatchActionAllowed(action, match)).map(({ id }) => id));
  return recallMatchItemActions(role).filter((action) => allowed.has(action.id));
}

// Resolving asks what the traditional ResolveRecallModal asks: how it was resolved (the same six
// RecallResolutionType values, defaulting to Fixed) and optional notes -- no cost field, unlike
// inspection findings' resolution (recalls.service.ts's resolveRecallMatch has no cost parameter).
const RECALL_RESOLUTION_TYPE_OPTIONS: readonly CorrectionOption[] = [
  { label: 'Fixed', value: 'FIXED' },
  { label: 'Replaced', value: 'REPLACED' },
  { label: 'Refunded', value: 'REFUNDED' },
  { label: 'Not applicable', value: 'NOT_APPLICABLE' },
  { label: 'Ignored', value: 'IGNORED' },
  { label: 'Other', value: 'OTHER' },
];

export const RECALL_RESOLUTION_DEFAULT: RecallResolution = { resolutionType: 'FIXED', resolutionNotes: null };

export function recallResolutionEditableFields(resolution: RecallResolution) {
  return [
    { key: 'resolutionType', label: 'How was this resolved?', type: 'SELECT' as const, value: resolution.resolutionType, options: [...RECALL_RESOLUTION_TYPE_OPTIONS] },
    { key: 'resolutionNotes', label: 'Notes (optional)', type: 'TEXTAREA' as const, value: resolution.resolutionNotes ?? '' },
  ];
}

export const recallMatchVersion = (match: { id: string; status: string; updatedAt: Date }) =>
  createHash('sha256').update(`${match.id}:${match.status}:${match.updatedAt.toISOString()}`).digest('hex');

function recallMatchAction(message: string): 'CONFIRM' | 'DISMISS' | 'RESOLVE' | null {
  if (/\b(?:confirm|verify)\b/i.test(message)) return 'CONFIRM';
  if (/\b(?:dismiss|not my model)\b/i.test(message)) return 'DISMISS';
  if (/\b(?:resolve|already (?:fixed|resolved|replaced)|completed)\b/i.test(message)) return 'RESOLVE';
  return null;
}

async function recallMatchUpdateResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const matches = await listPropertyRecallMatches(propertyId);
  const open = matches.filter((match) => match.status === 'OPEN' || match.status === 'NEEDS_CONFIRMATION');
  const href = recallReviewHref(propertyId);
  const candidates = open.map((match) => ({ ...match, title: match.inventoryItem?.name ? `${match.recall.title} — ${match.inventoryItem.name}` : match.recall.title }));
  const selected = exactEntityMatch(candidates, message, launchContext);
  const action = recallMatchAction(message);
  if (!selected || !action || !recallMatchActionAllowed(action, selected)) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'RECALL_MATCH_TARGET_REQUIRED',
      blocks: [{
        type: 'GROUPED_LIST', filters: [], id: 'recall-match-targets', title: 'Choose a recall match and action',
        description: 'Use the match id or exact recall/item name and say confirm, dismiss, or resolve.',
        sections: [{
          id: 'matches', title: 'Open recall matches', count: candidates.length,
          items: candidates.map((match) => ({
            id: match.id, title: match.title, description: String(match.recall.severity).toLowerCase(),
            meta: [], status: String(match.status), href, actions: recallMatchItemActionsFor(access.role, match),
          })),
        }],
        actions: [{ id: 'open-recalls', label: 'Open Recalls & Safety Alerts', href, style: 'SECONDARY' }],
      }],
      suggestions: [],
    };
  }
  const contextVersion = recallMatchVersion(selected);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const actionLabel = `${action[0]}${action.slice(1).toLowerCase()}`;
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'RECALL_MATCH_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      recallMatchId: selected.id, recallMatchAction: action, recallMatchContextVersion: contextVersion,
      ...(action === 'RESOLVE' ? { recallResolution: RECALL_RESOLUTION_DEFAULT } : {}),
      confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{
      type: 'SUMMARY', id: 'recall-match-review', title: `Review ${action.toLowerCase()} action`,
      body: action === 'CONFIRM'
        ? "Confirming records that this match's product identity applies to the recorded item."
        : action === 'DISMISS'
          ? 'Dismissing marks this match not applicable and closes any linked maintenance task.'
          : 'Resolving records how this recall was handled on the canonical recall match.',
      tone: 'CAUTION', actions: [{ id: 'open-recalls', label: 'Review in Recalls & Safety Alerts', href, style: 'SECONDARY' }],
    }],
    confirmation: {
      confirmationId: `recall-match-${selected.id}-1`, version: 1, title: `${actionLabel} this recall match?`, description: selected.title,
      fields: [{ label: 'Recall', value: selected.recall.title }, { label: 'Severity', value: String(selected.recall.severity).toLowerCase() }, { label: 'Action', value: action.toLowerCase() }],
      editableFields: action === 'RESOLVE' ? recallResolutionEditableFields(RECALL_RESOLUTION_DEFAULT) : [],
      confirmLabel: `${actionLabel} match`, consentText: 'I reviewed this recall match and authorize updating its canonical disposition.',
      expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function recallReviewResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const matches = await listPropertyRecallMatches(propertyId);
  const open = matches.filter((match) => match.status === 'OPEN' || match.status === 'NEEDS_CONFIRMATION');
  const href = recallReviewHref(propertyId);

  if (open.length === 0) {
    return {
      status: 'ANSWERED', reasonCode: 'NO_OPEN_RECALL_MATCHES',
      blocks: [{
        type: 'EMPTY_STATE', id: 'recall-review-empty', title: 'No open recall matches',
        body: 'Ask found no unresolved product recall matches for items recorded in this home.',
        actions: [{ id: 'open-recalls', label: 'Open Recalls & Safety Alerts', href, style: 'PRIMARY' }],
      }],
      suggestions: [],
    };
  }

  const critical = open.filter((match) => match.recall.severity === 'CRITICAL').length;
  return {
    status: 'ANSWERED', reasonCode: 'RECALL_MATCHES_FOUND',
    blocks: [{
      type: 'SUMMARY', id: 'recall-review-summary',
      title: `${open.length} open recall match${open.length === 1 ? '' : 'es'}`,
      body: critical ? `${critical} ${critical === 1 ? 'is' : 'are'} marked critical severity.` : 'None is marked critical severity.',
      tone: critical ? 'CRITICAL' : 'CAUTION',
      actions: [],
    }, {
      type: 'GROUPED_LIST', filters: [], id: 'recall-review-matches', title: 'Recall matches',
      description: 'Matched from recorded inventory items against active product recalls. Confirm, dismiss, or resolve each match below, or in Recalls & Safety Alerts.',
      sections: [{
        id: 'open', title: 'Needs review', count: open.length,
        items: open.map((match) => ({
          id: match.id,
          title: match.inventoryItem?.name ? `${match.recall.title} — ${match.inventoryItem.name}` : match.recall.title,
          description: match.recall.hazard ?? match.recall.summary ?? null,
          meta: [
            String(match.recall.severity).toLowerCase(),
            RECALL_STATUS_LABEL[match.status] ?? String(match.status),
            match.recall.remedy ? `Remedy: ${match.recall.remedy}` : null,
          ].filter((value): value is string => Boolean(value)),
          status: String(match.status),
          href,
          actions: recallMatchItemActionsFor(access.role, match),
        })),
      }],
      actions: [{ id: 'open-recalls', label: 'Open Recalls & Safety Alerts', href, style: 'SECONDARY' }],
    }, {
      type: 'BOUNDARY', id: 'recall-review-boundary', title: 'Regulator-sourced recall data',
      body: 'Recall details come from official recall records, not a safety inspection of this home.',
      severity: 'INFO', suggestions: [],
    }],
    suggestions: [],
  };
}

registerCapabilityHandler('recalls.review', async (envelope) => recallReviewResult(envelope.userId, envelope.propertyId!));

registerCapabilityHandler('recalls.update', async (envelope) => recallMatchUpdateResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));
