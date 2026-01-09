
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

export type IncidentActionStatus = 'PROPOSED' | 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED' | 'FAILED';
export type IncidentActionType = 'TASK' | 'BOOKING' | 'CHECKLIST_ITEM' | 'NOTIFICATION' | 'DOCUMENT' | 'NOTE';

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

export type IncidentEventDTO = {
  id: string;
  incidentId: string;
  propertyId: string;
  userId?: string | null;
  type: string;
  message?: string | null;
  payload?: any | null;
  createdAt: string;
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
