import type { AskExecutionResponse, AskGroupedListItem } from './types';
import { EVIDENCE_ATTACH_MESSAGES, EVIDENCE_UPLOAD_ALLOWED_TYPES, EVIDENCE_UPLOAD_MAX_BYTES } from '@/components/ask/AttachEvidenceControl';

// ACUI-004 (FRD v1.119): a typed model of the extra inputs the composer may offer right now. An affordance exists only when the
// conversation has deterministically resolved ONE record that can take evidence, using the same rule the record lists already use
// (a record type the evidence operation supports, with actions declared for this requester). It never guesses a target, and it
// attaches nothing by itself: the upload is followed by the normal review-and-confirm step (CAPTURE_EVIDENCE_CONFIRM).
export type ComposerAffordance = {
  id: 'attach-evidence';
  capability: 'PHOTO_OR_DOCUMENT';
  /** Names the purpose, never a bare "Upload". */
  label: string;
  /** Where the purpose is stated in full, for the accessible name and tooltip. */
  purpose: string;
  acceptedTypes: readonly string[];
  maxBytes: number;
  /** The file is attached to this record after review; nothing executes on upload. */
  effect: 'ATTACH_EVIDENCE_AFTER_REVIEW';
  target: { entityType: 'HOME_EVENT' | 'INVENTORY_ITEM' | 'WARRANTY'; id: string; title: string; message: string };
};

const MESSAGES: Record<ComposerAffordance['target']['entityType'], string> = {
  HOME_EVENT: EVIDENCE_ATTACH_MESSAGES.HOME_EVENT,
  INVENTORY_ITEM: EVIDENCE_ATTACH_MESSAGES.INVENTORY_ITEM,
  WARRANTY: EVIDENCE_ATTACH_MESSAGES.WARRANTY,
};
const LABELS: Record<ComposerAffordance['target']['entityType'], string> = {
  HOME_EVENT: 'Add a photo or document',
  INVENTORY_ITEM: 'Add a photo or document',
  WARRANTY: 'Add the warranty document',
};

const isTarget = (item: AskGroupedListItem): item is AskGroupedListItem & { entityType: ComposerAffordance['target']['entityType'] } =>
  (item.entityType === 'HOME_EVENT' || item.entityType === 'INVENTORY_ITEM' || item.entityType === 'WARRANTY') && (item.actions?.length ?? 0) > 0;

export function deriveComposerAffordances(execution: AskExecutionResponse | undefined | null): ComposerAffordance[] {
  // A read result is ANSWERED; only a settled result can name a target.
  if (!execution || (execution.status !== 'ANSWERED' && execution.status !== 'COMPLETED')) return [];
  // A turn still asking or confirming something owns the composer's attention.
  if (execution.confirmation || execution.clarification || execution.captureRequests.length > 0) return [];
  const targets = execution.blocks.flatMap((block) => block.type === 'GROUPED_LIST' ? block.sections.flatMap((section) => section.items) : []).filter(isTarget);
  // Exactly one distinct record: a list of several has no deterministic target.
  const distinct = new Map(targets.map((item) => [`${item.entityType}:${item.id}`, item]));
  if (distinct.size !== 1) return [];
  const [item] = Array.from(distinct.values());
  return [{
    id: 'attach-evidence', capability: 'PHOTO_OR_DOCUMENT', label: LABELS[item.entityType],
    purpose: `${LABELS[item.entityType]} for ${item.title}`,
    acceptedTypes: EVIDENCE_UPLOAD_ALLOWED_TYPES, maxBytes: EVIDENCE_UPLOAD_MAX_BYTES, effect: 'ATTACH_EVIDENCE_AFTER_REVIEW',
    target: { entityType: item.entityType, id: item.id, title: item.title, message: MESSAGES[item.entityType] },
  }];
}
