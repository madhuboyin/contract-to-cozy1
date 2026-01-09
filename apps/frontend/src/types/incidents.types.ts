// apps/frontend/src/types/incidents.types.ts

export type IncidentSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type IncidentStatus =
  | 'DETECTED'
  | 'EVALUATED'
  | 'ACTIVE'
  | 'ACTIONED'
  | 'MITIGATED'
  | 'RESOLVED'
  | 'SUPPRESSED'
  | 'EXPIRED';

export type IncidentActionStatus =
  | 'PROPOSED'
  | 'CREATED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELED'
  | 'FAILED';

/**
 * NOTE:
 * - Incidents must NOT create/propose bookings going forward (tasks are the bridge).
 * - Keeping 'BOOKING' here for backward compatibility with existing DB rows.
 */
export type IncidentActionType =
  | 'TASK'
  | 'BOOKING' // deprecated (legacy only)
  | 'CHECKLIST_ITEM'
  | 'NOTIFICATION'
  | 'DOCUMENT'
  | 'NOTE';

export type IncidentActionDTO = {
  id: string;
  incidentId: string;
  type: IncidentActionType;
  status: IncidentActionStatus;

  entityType?: string | null;
  entityId?: string | null;

  ctaLabel?: string | null;
  ctaUrl?: string | null;
  payload?: any | null;

  createdAt: string;
  updatedAt: string;
};

export type IncidentSignalDTO = {
  id: string;
  incidentId: string;
  signalType: string;
  externalRef?: string | null;
  observedAt: string;
  payload: any;
  scoreHint?: number | null;
  confidence?: number | null;
  createdAt: string;
};

export type IncidentAckDTO = {
  id: string;
  incidentId: string;
  userId: string;
  type: 'ACKNOWLEDGED' | 'DISMISSED' | 'SNOOZED';
  note?: string | null;
  snoozeUntil?: string | null;
  createdAt: string;
};

/**
 * Strongly type your IncidentEventType enum (frontend mirror)
 * Matches backend enum values you shared.
 */
export type IncidentEventType =
  | 'CREATED'
  | 'STATUS_CHANGED'
  | 'SEVERITY_COMPUTED'
  | 'ACTION_PROPOSED'
  | 'ACTION_CREATED'
  | 'SUPPRESSED'
  | 'ACKNOWLEDGED'
  | 'DISMISSED'
  | 'SNOOZED'
  | 'RESOLVED'
  | 'EXPIRED';

export type IncidentEventDTO = {
  id: string;
  incidentId: string;
  propertyId: string;
  userId?: string | null;
  type: IncidentEventType; // ✅ was string
  message?: string | null;
  payload?: any | null;
  createdAt: string;
};

export type IncidentDTO = {
  id: string;
  propertyId: string;
  userId?: string | null;

  sourceType: string;
  typeKey: string;
  category?: string | null;

  title: string;
  summary?: string | null;
  details?: any | null;

  status: IncidentStatus;
  severity?: IncidentSeverity | null;
  severityScore?: number | null;
  confidence?: number | null;

  /**
   * Existing explainability field you already use in UI.
   * This can be populated by evaluator and/or stored in SEVERITY_COMPUTED event payload.
   */
  scoreBreakdown?: any | null;

  isSuppressed: boolean;

  openedAt: string;
  activatedAt?: string | null;
  suppressedAt?: string | null;

  createdAt: string;
  updatedAt: string;

  // included in list
  actions?: IncidentActionDTO[];

  // included in detail
  signals?: IncidentSignalDTO[];
  acknowledgements?: IncidentAckDTO[];
};

export type ListIncidentsResponse = {
  items: IncidentDTO[];
  nextCursor: string | null;
};

export type ExecuteIncidentActionResponse = {
  incident: IncidentDTO;
  action: IncidentActionDTO;
  linkedEntity: { entityType: string; entityId: string; actionUrl?: string | null };
};

/**
 * ✅ New: property-scoped incident detail response envelope
 * Returned by GET /properties/:propertyId/incidents/:incidentId
 */
export type GetIncidentDetailResponse = {
  incident: IncidentDTO;
  latestActionProposedEvent: IncidentEventDTO | null;
  decisionTrace: any | null;
};

/**
 * ✅ New: reevaluate response
 * Returned by POST /properties/:propertyId/incidents/:incidentId/reevaluate
 */
export type ReevaluateIncidentResponse = {
  incidentId: string;
  evaluated: any;
  orchestrated: any;
};
