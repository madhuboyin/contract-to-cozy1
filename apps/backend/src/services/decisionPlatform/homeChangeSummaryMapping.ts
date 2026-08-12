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
