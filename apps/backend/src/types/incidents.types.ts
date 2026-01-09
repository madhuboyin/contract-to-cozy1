// backend/src/types/incidents.types.ts
import {
    AcknowledgementType,
    IncidentActionStatus,
    IncidentActionType,
    IncidentSeverity,
    IncidentSourceType,
    IncidentStatus,
    SignalType,
    SuppressionReason,
    SuppressionScope,
  } from '@prisma/client';
  
  export type CreateIncidentInput = {
    propertyId: string;
    userId?: string | null;
  
    sourceType: IncidentSourceType;
    typeKey: string;              // e.g. "FREEZE_RISK"
    category?: string | null;     // e.g. "PLUMBING"
    title: string;                // user-facing title
    summary?: string | null;      // short explanation
    details?: any | null;         // structured JSON for UI
  
    // scoring (optional at create-time)
    severity?: IncidentSeverity | null;
    severityScore?: number | null;     // 0-100
    scoreBreakdown?: any | null;       // JSON breakdown
    confidence?: number | null;        // 0-100
  
    // dedupe controls
    fingerprint: string;          // stable hash-like string
    recurrenceKey?: string | null;
    dedupeWindowMins?: number | null;
  
    // initial lifecycle
    status?: IncidentStatus;      // default DETECTED
  };
  
  export type AddIncidentSignalInput = {
    signalType: SignalType;
    externalRef?: string | null;
    observedAt?: string | Date | null;
    payload: any;
    scoreHint?: number | null;
    confidence?: number | null;
  };
  
  export type ListIncidentsQuery = {
    propertyId: string;
    status?: IncidentStatus;
    includeSuppressed?: boolean;
    limit?: number;
    cursor?: string; // incident id cursor
  };
  
  export type CreateSuppressionRuleInput = {
    scope?: SuppressionScope;
    propertyId?: string | null;
    userId?: string | null;
  
    typeKey?: string | null;
    assetId?: string | null;
  
    reason: SuppressionReason;
    params?: any | null;
    suppressUntil?: string | Date | null;
    isEnabled?: boolean;
  };
  
  export type AcknowledgeIncidentInput = {
    type: AcknowledgementType;
    note?: string | null;
    snoozeUntil?: string | Date | null;
  };
  
  export type CreateIncidentActionInput = {
    type: IncidentActionType;
    status?: IncidentActionStatus;
  
    entityType?: string | null;
    entityId?: string | null;
  
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    payload?: any | null;
  };
  