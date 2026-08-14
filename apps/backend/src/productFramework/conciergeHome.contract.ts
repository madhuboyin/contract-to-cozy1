// Ask Intelligence FRD §18.4, Phase 9B — Concierge Home. A dedicated,
// composed read surface for the Ask starting page, not an Ask operation:
// it never accepts a message, creates no AskExecution, and mutates
// nothing. Each section states its own honest status (FRD: "must
// distinguish loading, unavailable, uncovered, stale, no-change, and
// no-action states... An empty panel must never imply the home is safe,
// complete, or monitored when source coverage is unavailable") --
// `loading` is a client-only transient state, not part of this payload.
//
// Every section is built from an already-governed source this codebase
// already owns -- getHomeActionFeed/buildPriorityListView (Phase 9B
// ranking), listPropertyChanges (Phase 9A HomeChangeView), and
// DecisionThread (Phase 7A/8A) -- so this module never becomes a second
// source of truth, only a read composition of three existing ones.

import { z } from 'zod';

export const ConciergeHomeSubjectSchema = z.object({
  kind: z.enum(['INVENTORY_ITEM', 'CHECKLIST', 'PROPERTY', 'EVENT', 'SALE_READINESS_ITEM', 'GUIDANCE_JOURNEY', 'WORK_ITEM']),
  id: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(180),
});

export const ConciergeHomePriorityItemSchema = z.object({
  homeActionId: z.string(),
  title: z.string(),
  askQuestion: z.string(),
  askCategoryId: z.enum(['MAINTAIN', 'PROTECT', 'SAVE', 'PLAN_MONITOR']),
  askCategoryLabel: z.enum(['Maintain', 'Protect', 'Save', 'Plan']),
  subject: ConciergeHomeSubjectSchema.nullable(),
  consumerPriority: z.enum(['DO_NOW', 'PLAN_SOON', 'WATCH', 'OPTIONAL', 'NO_ACTION']),
  comparativeReasonCodes: z.array(z.string()),
  confidenceLabel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  deadlineAt: z.string().nullable(),
  cta: z.object({ label: z.string(), href: z.string() }).nullable(),
  watchState: z.string().nullable(),
  suppressed: z.boolean(),
  completed: z.boolean(),
  unavailable: z.boolean(),
  stale: z.boolean(),
});

export const ConciergeHomePriorityListSchema = z.object({
  state: z.enum(['AVAILABLE', 'NO_ACTION', 'UNAVAILABLE']),
  rankingPolicyVersion: z.string().nullable(),
  generatedAt: z.string().nullable(),
  items: z.array(ConciergeHomePriorityItemSchema),
  truncated: z.boolean(),
  href: z.string(),
});

export const ConciergeHomeChangeItemSchema = z.object({
  id: z.string(),
  source: z.string(),
  summary: z.string(),
  materiality: z.enum(['INFORMATIONAL', 'MEANINGFUL', 'IMPORTANT', 'URGENT']),
  detectedAt: z.string(),
  effectiveAt: z.string().nullable(),
});

export const ConciergeHomeChangesSchema = z.object({
  state: z.enum(['AVAILABLE', 'NO_CHANGE', 'UNAVAILABLE']),
  windowDays: z.number().int().positive(),
  items: z.array(ConciergeHomeChangeItemSchema),
  href: z.string(),
});

export const ConciergeHomeDecisionItemSchema = z.object({
  decisionThreadId: z.string(),
  title: z.string(),
  lifecycleStatus: z.string(),
  contextStatus: z.string(),
  verdict: z.string().nullable(),
  confidenceLabel: z.enum(['HIGH', 'MEDIUM', 'LOW']).nullable(),
  subject: ConciergeHomeSubjectSchema.nullable(),
  updatedAt: z.string(),
});

export const ConciergeHomeDecisionsSchema = z.object({
  state: z.enum(['AVAILABLE', 'NO_DECISIONS', 'UNAVAILABLE']),
  items: z.array(ConciergeHomeDecisionItemSchema),
  href: z.string(),
});

export const ConciergeHomeCapabilityPromptSchema = z.object({
  id: z.string(),
  categoryId: z.enum(['UNDERSTAND', 'MAINTAIN', 'PROTECT', 'SAVE', 'DECIDE', 'PLAN_MONITOR']),
  categoryLabel: z.string(),
  question: z.string(),
  subject: ConciergeHomeSubjectSchema.optional(),
  context: z.object({
    entityType: z.enum(['HOME_ACTION', 'DECISION_THREAD', 'INVENTORY_ITEM']),
    entityId: z.string().trim().min(1).max(160),
    actionId: z.string().trim().min(1).max(160).optional(),
    capabilityId: z.string().trim().min(1).max(120).optional(),
  }).optional(),
});

export const ConciergeHomeFeaturedPromptSchema = ConciergeHomeCapabilityPromptSchema.extend({
  source: z.enum(['PERSONALIZED', 'DISCOVERY']),
});

export const ConciergeHomeCapabilityGroupSchema = z.object({
  id: ConciergeHomeCapabilityPromptSchema.shape.categoryId,
  label: z.string(),
  description: z.string(),
  capabilityIds: z.array(z.string()),
  prompts: z.array(ConciergeHomeCapabilityPromptSchema),
});

export const ConciergeHomeJourneyContextSchema = z.object({
  state: z.enum(['AVAILABLE', 'UNKNOWN', 'UNAVAILABLE']),
  ownershipState: z.enum(['SHOPPING', 'UNDER_CONTRACT', 'RECENT_OWNER', 'ESTABLISHED_OWNER', 'PREPARING_TRANSFER', 'UNKNOWN']).nullable(),
  operatingMode: z.enum(['BUYING', 'OWNING', 'SELLING', 'UNKNOWN']),
  entryPath: z.enum(['EXISTING_OWNER_TRIGGER', 'EXISTING_HOME_PURCHASE', 'NEW_HOME_SETUP', 'MAJOR_MOMENT', 'EXPLORATION']).nullable(),
  propertyOrigin: z.enum(['EXISTING_HOME', 'NEW_CONSTRUCTION', 'UNKNOWN']).nullable(),
  contextVersion: z.string().nullable(),
  capturedAt: z.string().nullable(),
});

export const ConciergeHomeViewSchema = z.object({
  propertyId: z.string(),
  generatedAt: z.string(),
  journeyContext: ConciergeHomeJourneyContextSchema,
  priorityList: ConciergeHomePriorityListSchema,
  changes: ConciergeHomeChangesSchema,
  decisions: ConciergeHomeDecisionsSchema,
  landingSpotlight: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('ATTENTION'), entityId: z.string().trim().min(1).max(160) }),
    z.object({ kind: z.literal('DECISION'), entityId: z.string().trim().min(1).max(160) }),
  ]).nullable(),
  capabilityGroups: z.array(ConciergeHomeCapabilityGroupSchema),
  featuredPrompts: z.array(ConciergeHomeFeaturedPromptSchema),
  suggestedQuestions: z.array(z.string()),
});

export type ConciergeHomeView = z.infer<typeof ConciergeHomeViewSchema>;
