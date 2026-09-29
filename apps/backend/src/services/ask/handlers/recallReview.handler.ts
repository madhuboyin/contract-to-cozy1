// Group B, recall review slice (gap audit §17; FRD v1.156/§17, v1.161). Read-only for now: Ask
// has no existing operation for product recalls at all (unlike inspection findings, which turned
// out to already be fully covered by INSPECTION_FINDINGS/INSPECTION_FINDING_UPDATE). Confirm/
// dismiss/resolve mutations would need a new branch in the shared workflowConfirm.handler.ts
// confirmation dispatcher -- deliberately deferred to a later pass, mirroring how
// HOME_EVENT_RADAR_FEED (read) shipped before its STATE/MARK_DONE/FEEDBACK write siblings.
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
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

async function recallReviewResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
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
      description: 'Matched from recorded inventory items against active product recalls. Confirm, dismiss, or resolve each match in Recalls & Safety Alerts.',
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
        })),
      }],
      actions: [{ id: 'open-recalls', label: 'Open Recalls & Safety Alerts', href, style: 'SECONDARY' }],
    }, {
      type: 'BOUNDARY', id: 'recall-review-boundary', title: 'Regulator-sourced recall data',
      body: 'Recall details come from official recall records, not a safety inspection of this home. Confirming, dismissing, or resolving a match happens in Recalls & Safety Alerts.',
      severity: 'INFO', suggestions: [],
    }],
    suggestions: ['Open Recalls & Safety Alerts'],
  };
}

registerCapabilityHandler('recalls.review', async (envelope) => recallReviewResult(envelope.userId, envelope.propertyId!));
