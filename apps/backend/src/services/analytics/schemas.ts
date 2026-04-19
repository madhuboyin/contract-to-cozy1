// apps/backend/src/services/analytics/schemas.ts
//
// Zod validation schemas for product analytics event ingestion.
// Follows the same conventions as src/validators/*.validators.ts in the CtC backend.

import { z } from 'zod';
import { ProductAnalyticsEventType } from '@prisma/client';

// ============================================================================
// BASE EVENT INPUT SCHEMA
// Used by ProductAnalyticsService.trackEvent() to validate all incoming events.
// ============================================================================

export const TrackEventSchema = z.object({
  // Required: must be a valid taxonomy value
  eventType: z.nativeEnum(ProductAnalyticsEventType),

  // Optional descriptive name for sub-classification (e.g. "bulk_upload", "ai_scan")
  eventName: z.string().trim().max(120).optional().nullable(),

  // Actor context — nullable for system-generated events
  userId:     z.string().uuid().optional().nullable(),
  propertyId: z.string().uuid().optional().nullable(),

  // Analytics dimensions for slicing/reporting
  moduleKey:  z.string().trim().max(80).optional().nullable(),
  featureKey: z.string().trim().max(80).optional().nullable(),
  screenKey:  z.string().trim().max(80).optional().nullable(),
  sessionKey: z.string().trim().max(120).optional().nullable(),

  // Originating surface (dashboard, home_tools, automation, admin, system)
  source: z.string().trim().max(80).optional().nullable(),

  // Timestamp — defaults to now() in the service if omitted
  occurredAt: z.coerce.date().optional().nullable(),

  // Arbitrary JSON metadata (bounded for safety)
  metadataJson: z
    .record(z.string(), z.unknown())
    .optional()
    .nullable()
    .refine(
      (val) => {
        if (val == null) return true;
        try {
          const s = JSON.stringify(val);
          return s.length <= 8192;
        } catch {
          return false;
        }
      },
      'metadataJson must be serializable JSON and under 8 KB'
    ),

  // Lightweight scalar measures — no heavy aggregations here
  valueNumeric: z.number().optional().nullable(),
  valueText:    z.string().trim().max(500).optional().nullable(),
});

export type TrackEventInput = z.infer<typeof TrackEventSchema>;

// ============================================================================
// CONVENIENCE INPUT SCHEMAS
// Typed helpers for common high-value event shapes.
// ============================================================================

export const TrackFeatureOpenedSchema = z.object({
  userId:     z.string().uuid().optional().nullable(),
  propertyId: z.string().uuid().optional().nullable(),
  moduleKey:  z.string().trim().max(80),
  featureKey: z.string().trim().max(80),
  screenKey:  z.string().trim().max(80).optional().nullable(),
  source:     z.string().trim().max(80).optional().nullable(),
  occurredAt: z.coerce.date().optional().nullable(),
  metadataJson: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type TrackFeatureOpenedInput = z.infer<typeof TrackFeatureOpenedSchema>;

export const TrackDecisionGuidedSchema = z.object({
  userId:       z.string().uuid().optional().nullable(),
  propertyId:   z.string().uuid().optional().nullable(),
  featureKey:   z.string().trim().max(80),
  moduleKey:    z.string().trim().max(80).optional().nullable(),
  decisionType: z.string().trim().max(120).optional().nullable(),
  occurredAt:   z.coerce.date().optional().nullable(),
  metadataJson: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type TrackDecisionGuidedInput = z.infer<typeof TrackDecisionGuidedSchema>;

export const TrackPropertyActivatedSchema = z.object({
  userId:            z.string().uuid().optional().nullable(),
  propertyId:        z.string().uuid(),
  activationVersion: z.string().trim().max(40).optional().nullable(),
  occurredAt:        z.coerce.date().optional().nullable(),
  metadataJson:      z.record(z.string(), z.unknown()).optional().nullable(),
});

export type TrackPropertyActivatedInput = z.infer<typeof TrackPropertyActivatedSchema>;

export const TrackToolUsedSchema = z.object({
  userId:      z.string().uuid().optional().nullable(),
  propertyId:  z.string().uuid().optional().nullable(),
  moduleKey:   z.string().trim().max(80),
  featureKey:  z.string().trim().max(80),
  toolName:    z.string().trim().max(120).optional().nullable(),
  occurredAt:  z.coerce.date().optional().nullable(),
  metadataJson: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type TrackToolUsedInput = z.infer<typeof TrackToolUsedSchema>;

export const TrackOutcomeGeneratedSchema = z.object({
  userId:       z.string().uuid().optional().nullable(),
  propertyId:   z.string().uuid(),
  outcomeType:  z.enum(['SAVINGS', 'RISK_PREVENTION', 'TIME_SAVED']),
  valueUsd:     z.number().optional().nullable(),
  sourceEngine: z.string().trim().max(80),
  occurredAt:   z.coerce.date().optional().nullable(),
  metadataJson: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type TrackOutcomeGeneratedInput = z.infer<typeof TrackOutcomeGeneratedSchema>;

export const TrackOutcomeActionTakenSchema = z.object({
  userId:       z.string().uuid().optional().nullable(),
  propertyId:   z.string().uuid(),
  outcomeType:  z.enum(['SAVINGS', 'RISK_PREVENTION', 'TIME_SAVED']),
  sourceEngine: z.string().trim().max(80),
  occurredAt:   z.coerce.date().optional().nullable(),
  metadataJson: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type TrackOutcomeActionTakenInput = z.infer<typeof TrackOutcomeActionTakenSchema>;
