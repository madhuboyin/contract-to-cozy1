// Pure sourceType/changeType -> label/summary mapping for the CHANGE_SUMMARY
// block (Ask Intelligence FRD §16.4, Phase 9A). Kept pure and DB-free so it's
// unit-testable without a database, mirroring the
// hvacRepairReplaceEngine.service.ts pure/DB-touching split. Never throws on
// an unrecognized sourceType/changeType -- new PropertyChange source
// adapters (present or future, including the dynamic `DOMAIN_EVENT_*`
// family) must degrade to a readable label, not a runtime error.

const SOURCE_TYPE_LABELS: Record<string, string> = {
  HOME_EVENT: 'Home event',
  PROPERTY_FACT: 'Property record',
  DOCUMENT: 'Document',
  CLAIM_RECORD: 'Insurance claim',
  PROJECT_RECORD: 'Project',
  MAINTENANCE_RECORD: 'Maintenance record',
  OPERATIONAL_WORK_EVENT: 'Home action',
  OPERATIONAL_WORK_DUE: 'Home action',
  DECISION_RECOMMENDATION_SNAPSHOT: 'Repair/replace recommendation',
  DECISION_PREFERENCE_VALUE: 'Saved preference',
};

function humanizeSourceType(sourceType: string): string {
  return sourceType
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function sourceTypeLabel(sourceType: string): string {
  return SOURCE_TYPE_LABELS[sourceType] ?? humanizeSourceType(sourceType) ?? sourceType;
}

const CHANGE_TYPE_VERBS: Record<string, string> = {
  SOURCE_RECORD_CREATED: 'added',
  SOURCE_RECORD_REVISED: 'updated',
  SOURCE_LIFECYCLE_CHANGED: 'changed',
  PROPERTY_FACT_CHANGED: 'updated',
  ACTION_STATE_CHANGED: 'updated',
  OUTCOME_CONFIRMED: 'confirmed',
  SOURCE_HEALTH_CHANGED: 'changed',
};

export interface ChangeSummaryTextInput {
  sourceType: string;
  changeType: string;
  // A source-specific detail sentence resolved by the caller (e.g. a
  // preference's authorized summary, or a recommendation's verdict shift) --
  // used verbatim when present. Never built here: this function has no DB
  // access and must not guess at content it can't verify.
  detailOverride?: string | null;
}

export function buildChangeSummaryText(input: ChangeSummaryTextInput): string {
  if (input.detailOverride) return input.detailOverride;
  const label = sourceTypeLabel(input.sourceType);
  const verb = CHANGE_TYPE_VERBS[input.changeType] ?? 'changed';
  return `${label} ${verb}.`;
}

export function homeChangeDisplayTitle(input: {
  sourceType: string;
  canonicalActionTitle?: string | null;
  canonicalEventTitle?: string | null;
}): string {
  return input.canonicalActionTitle ?? input.canonicalEventTitle ?? sourceTypeLabel(input.sourceType);
}

const HOME_ACTION_STATE_COPY: Record<string, string> = {
  CANDIDATE: 'A new home priority was identified.',
  ACCEPTED: 'Added to your home priorities.',
  SCHEDULED: 'The work was scheduled.',
  IN_PROGRESS: 'The work started.',
  IN_GUIDANCE: 'A guided review started.',
  IN_PROJECT: 'Moved into an active project.',
  BLOCKED: 'The work is blocked and may need your attention.',
  DEFERRED: 'Moved to a later date.',
  REPORTED_COMPLETE: 'Reported complete.',
  REOPENED: 'Reopened for follow-up.',
  VERIFIED: 'Completion was verified.',
  FOLLOW_UP_DUE: 'A follow-up is due.',
  CLOSED: 'Closed.',
};

export function homeActionStateChangeSummary(state: string): string {
  return HOME_ACTION_STATE_COPY[state] ?? `Status changed to ${state.replace(/_/g, ' ').toLowerCase()}.`;
}

const MATERIALITY_REASON_COPY: Record<string, string> = {
  URGENT_SAFETY_CONDITION: 'This may involve a safety concern and needs attention now.',
  CANONICAL_ACTION_NOW: 'This home priority needs attention now.',
  CANONICAL_ACTION_SOON: 'This home priority should be reviewed soon.',
  PROPERTY_EFFECT_CONFIRMED: 'The result was confirmed in your home records.',
  RELEVANT_LIFECYCLE_ADVANCED: 'This item moved to its next stage.',
  HOMEOWNER_RELEVANT: 'This update may affect how you manage your home.',
  CANONICAL_ACTION_PLAN: 'This is worth planning for.',
};

export function homeChangeWhyItMatters(reasonCodes: readonly string[], materiality: string): string {
  const explanations = [...new Set(reasonCodes.map((code) => MATERIALITY_REASON_COPY[code]).filter(Boolean))];
  if (explanations.length) return explanations.slice(0, 2).join(' ');
  if (materiality === 'URGENT') return 'This change needs attention now.';
  if (materiality === 'IMPORTANT') return 'This change is worth reviewing soon.';
  return 'This is a meaningful update to your home records.';
}

export function homeChangeDateLabel(sourceType: string): 'Changed' | 'Due' | 'Recorded' {
  if (sourceType === 'OPERATIONAL_WORK_DUE') return 'Due';
  if (sourceType === 'OPERATIONAL_WORK_EVENT') return 'Changed';
  return 'Recorded';
}

/**
 * A recent-change item must tell the homeowner something beyond the source
 * category. Category-only fallbacks such as "Property record updated" are
 * useful for diagnostics, but they do not answer "What changed?" and must not
 * consume a slot in the homeowner-facing summary.
 */
export function hasSpecificHomeChangeContent(input: {
  title: string;
  source: string;
  summary: string;
}): boolean {
  const title = input.title.trim().toLocaleLowerCase();
  const source = input.source.trim().toLocaleLowerCase();
  const summary = input.summary.trim().toLocaleLowerCase();
  if (!title || title === source) return false;

  const genericSummaries = new Set([
    `${source} added.`,
    `${source} updated.`,
    `${source} changed.`,
    `${source} confirmed.`,
  ]);
  return Boolean(summary) && !genericSummaries.has(summary);
}

export function homeChangeLinkedAction(input: {
  propertyId: string;
  canonicalActionId?: string | null;
  canonicalEventId?: string | null;
}): { label: string; href: string } | null {
  if (input.canonicalActionId) {
    return {
      label: 'Open in Home Operations',
      href: `/dashboard/properties/${encodeURIComponent(input.propertyId)}/home-operations?focusWorkItemId=${encodeURIComponent(input.canonicalActionId)}&openManage=1`,
    };
  }
  if (input.canonicalEventId) {
    return {
      label: 'Open in Home Timeline',
      href: `/dashboard/properties/${encodeURIComponent(input.propertyId)}/timeline?eventId=${encodeURIComponent(input.canonicalEventId)}`,
    };
  }
  return null;
}

export function homeChangeCanonicalIdentity(input: {
  sourceType: string;
  sourceEntityId: string;
  canonicalActionId?: string | null;
  canonicalEventId?: string | null;
}): string {
  if (input.canonicalActionId) return `action:${input.canonicalActionId}`;
  if (input.canonicalEventId) return `event:${input.canonicalEventId}`;
  return `source:${input.sourceType}:${input.sourceEntityId}`;
}

export interface LiveHomeChangeAction {
  id: string;
  lineageId: string;
  source: { entityId: string };
  deduplication: { canonicalKey: string; mergedActionIds: string[] };
  workItem: { id: string; workKey: string } | null;
}

/** Resolve a ledger row to the identity that the current governed Home Action
 * feed actually exposes. PropertyChange.canonicalActionId stores an
 * OperationalWorkItem id, which is not necessarily the public HomeAction id
 * (accepted work uses `operational-work:<workItemId>`). Event-backed actions
 * are matched through their exact source entity. Feed order is authoritative
 * when an action absorbed several source actions during deduplication. */
export function resolveLiveHomeChangeAction<T extends LiveHomeChangeAction>(
  actions: readonly T[],
  input: { canonicalActionId?: string | null; canonicalEventId?: string | null },
): T | null {
  if (input.canonicalActionId) {
    const match = actions.find((action) =>
      action.id === input.canonicalActionId
      || action.workItem?.id === input.canonicalActionId
      || action.deduplication.mergedActionIds.includes(input.canonicalActionId!));
    if (match) return match;
  }
  if (input.canonicalEventId) {
    return actions.find((action) =>
      action.source.entityId === input.canonicalEventId
      || action.lineageId === input.canonicalEventId) ?? null;
  }
  return null;
}

export function liveHomeChangeCanonicalIdentity(action: LiveHomeChangeAction): string {
  return `live-action:${action.deduplication.canonicalKey}`;
}

export function shouldIncludeHomeChange(input: {
  sourceType: string;
  canonicalActionId?: string | null;
  liveAction: LiveHomeChangeAction | null;
}): boolean {
  const operationalWorkChange = input.sourceType === 'OPERATIONAL_WORK_EVENT'
    || input.sourceType === 'OPERATIONAL_WORK_DUE';
  return !operationalWorkChange || !input.canonicalActionId || Boolean(input.liveAction);
}

/** Keep the first row for each canonical entity. Callers provide rows in
 * their governed order (materiality first, newest first) and apply the
 * display limit only after this selection. */
export function selectUniqueHomeChanges<T>(
  changes: readonly T[],
  identity: (change: T) => string,
  limit: number,
): T[] {
  const seen = new Set<string>();
  const selected: T[] = [];
  for (const change of changes) {
    const key = identity(change);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(change);
    if (selected.length === limit) break;
  }
  return selected;
}

export function homeChangeInlineReviewAction(input: {
  title: string;
  canonicalActionId?: string | null;
  canonicalEventId?: string | null;
}) {
  if (input.canonicalActionId) {
    return {
      id: `review-home-action-${input.canonicalActionId}`,
      label: 'Review in Ask',
      interactionType: 'START_WORKFLOW' as const,
      message: `What should I do next for “${input.title}”?`,
      operationId: 'HOME_ACTIONS',
      entityType: 'HOME_ACTION',
      entityId: input.canonicalActionId,
      actionId: input.canonicalActionId,
      style: 'SECONDARY' as const,
    };
  }
  if (input.canonicalEventId) {
    return {
      id: `review-home-event-${input.canonicalEventId}`,
      label: 'Review in Ask',
      interactionType: 'START_WORKFLOW' as const,
      message: `Show me the timeline entry “${input.title}”.`,
      operationId: 'HOME_TIMELINE_EVENTS',
      entityType: 'HOME_EVENT',
      entityId: input.canonicalEventId,
      style: 'SECONDARY' as const,
    };
  }
  return null;
}
