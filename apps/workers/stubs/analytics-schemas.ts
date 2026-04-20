// Zod-free stub for the workers Docker build.
// The real schemas.ts uses zod (not a workers dependency) for runtime validation.
// Workers call analyticsEmitter fire-and-forget — validation is best-effort and
// skipped at this layer. The pass-through parse() satisfies TypeScript and runtime.

import type { ProductAnalyticsEventType } from '@prisma/client';

export interface TrackEventInput {
  eventType:    ProductAnalyticsEventType;
  eventName?:   string | null;
  userId?:      string | null;
  propertyId?:  string | null;
  moduleKey?:   string | null;
  featureKey?:  string | null;
  screenKey?:   string | null;
  sessionKey?:  string | null;
  source?:      string | null;
  occurredAt?:  Date | null;
  metadataJson?: Record<string, unknown> | null;
  valueNumeric?: number | null;
  valueText?:   string | null;
}

export interface TrackFeatureOpenedInput {
  userId?:      string | null;
  propertyId?:  string | null;
  moduleKey:    string;
  featureKey:   string;
  screenKey?:   string | null;
  source?:      string | null;
  occurredAt?:  Date | null;
  metadataJson?: Record<string, unknown> | null;
}

export interface TrackDecisionGuidedInput {
  userId?:       string | null;
  propertyId?:   string | null;
  featureKey:    string;
  moduleKey?:    string | null;
  decisionType?: string | null;
  occurredAt?:   Date | null;
  metadataJson?: Record<string, unknown> | null;
}

export interface TrackPropertyActivatedInput {
  userId?:             string | null;
  propertyId:          string;
  activationVersion?:  string | null;
  occurredAt?:         Date | null;
  metadataJson?:       Record<string, unknown> | null;
}

export interface TrackToolUsedInput {
  userId?:      string | null;
  propertyId?:  string | null;
  moduleKey:    string;
  featureKey:   string;
  toolName?:    string | null;
  occurredAt?:  Date | null;
  metadataJson?: Record<string, unknown> | null;
}

export interface TrackOutcomeGeneratedInput {
  userId?:       string | null;
  propertyId:    string;
  outcomeType:   'SAVINGS' | 'RISK_PREVENTION' | 'TIME_SAVED';
  valueUsd?:     number | null;
  sourceEngine:  string;
  occurredAt?:   Date | null;
  metadataJson?: Record<string, unknown> | null;
}

export interface TrackOutcomeActionTakenInput {
  userId?:       string | null;
  propertyId:    string;
  outcomeType:   'SAVINGS' | 'RISK_PREVENTION' | 'TIME_SAVED';
  sourceEngine:  string;
  occurredAt?:   Date | null;
  metadataJson?: Record<string, unknown> | null;
}

// Pass-through schemas — no zod validation; workers emit fire-and-forget only.
export const TrackEventSchema             = { parse: <T>(x: T): T => x };
export const TrackFeatureOpenedSchema     = { parse: <T>(x: T): T => x };
export const TrackDecisionGuidedSchema    = { parse: <T>(x: T): T => x };
export const TrackPropertyActivatedSchema = { parse: <T>(x: T): T => x };
export const TrackToolUsedSchema          = { parse: <T>(x: T): T => x };
export const TrackOutcomeGeneratedSchema  = { parse: <T>(x: T): T => x };
export const TrackOutcomeActionTakenSchema = { parse: <T>(x: T): T => x };
