import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Prisma, type PropertyOnboarding } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  ACTIVE_TRIGGER_TYPES,
  FIRST_VALUE_TYPES,
  HOMEOWNER_ENTRY_PATHS,
  OWNERSHIP_STATES,
  PROPERTY_ORIGINS,
  TRIGGER_ENTITY_TYPES,
  adaptHomeActionSource,
  parseHomeownerEntryContext,
  type HomeAction,
  type HomeActionSourceKind,
  type HomeownerEntryContext,
} from '../productFramework';
import { emitNorthStarLineageEvent } from './analytics';
import { getOrCreateOnboarding } from './propertyOnboarding.service';
import { resolvePropertyAccess } from './propertyAccess.service';

const TRIGGER_SOURCES = ['USER_SELECTED', 'CONVERSATION', 'DOCUMENT', 'PHOTO', 'SYSTEM_SIGNAL', 'OTHER'] as const;

export const EntryContextCaptureSchema = z.object({
  entryPath: z.enum(HOMEOWNER_ENTRY_PATHS),
  ownershipState: z.enum(OWNERSHIP_STATES),
  propertyOrigin: z.enum(PROPERTY_ORIGINS),
  activeTrigger: z.object({
    type: z.enum(ACTIVE_TRIGGER_TYPES),
    label: z.string().trim().min(1).max(240),
    detail: z.string().trim().max(2000).nullable().optional(),
    entityType: z.enum(TRIGGER_ENTITY_TYPES).default('PROPERTY'),
    entityId: z.string().trim().min(1).max(120).nullable().optional(),
    source: z.enum(TRIGGER_SOURCES).default('USER_SELECTED'),
  }),
  firstValueType: z.enum(FIRST_VALUE_TYPES).optional(),
  consentContext: z.string().trim().min(1).max(300).nullable().optional(),
  sourceMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.entryPath === 'NEW_HOME_SETUP' && value.propertyOrigin !== 'NEW_CONSTRUCTION') {
    ctx.addIssue({
      code: 'custom',
      path: ['propertyOrigin'],
      message: 'The new-home setup entry path requires NEW_CONSTRUCTION property origin.',
    });
  }
  if (value.entryPath === 'EXISTING_HOME_PURCHASE' && value.propertyOrigin !== 'EXISTING_HOME') {
    ctx.addIssue({
      code: 'custom',
      path: ['propertyOrigin'],
      message: 'The existing-home purchase entry path requires EXISTING_HOME property origin.',
    });
  }
  if (value.activeTrigger.type === 'NONE_EXPLORING' && value.entryPath !== 'EXPLORATION') {
    ctx.addIssue({
      code: 'custom',
      path: ['activeTrigger', 'type'],
      message: 'NONE_EXPLORING is only valid for the EXPLORATION entry path.',
    });
  }
});

export type EntryContextCaptureInput = z.infer<typeof EntryContextCaptureSchema>;

const TRIGGER_EVIDENCE_KINDS = [
  'FREE_TEXT', 'CONVERSATION', 'DOCUMENT', 'QUOTE', 'INVOICE', 'PHOTO', 'EMAIL_PDF',
] as const;

export const TriggerEvidenceInputSchema = z.object({
  kind: z.enum(TRIGGER_EVIDENCE_KINDS),
  label: z.string().trim().min(1).max(240),
  detail: z.string().trim().min(1).max(4000).nullable().optional(),
  documentId: z.string().uuid().nullable().optional(),
  observedAt: z.string().datetime().nullable().optional(),
  consentContext: z.string().trim().min(1).max(300),
}).superRefine((value, ctx) => {
  if (['DOCUMENT', 'QUOTE', 'INVOICE', 'PHOTO', 'EMAIL_PDF'].includes(value.kind) && !value.documentId) {
    ctx.addIssue({
      code: 'custom',
      path: ['documentId'],
      message: `${value.kind} evidence requires an uploaded document.`,
    });
  }
});

export const FirstValueFeedbackSchema = z.object({
  feedback: z.enum(['USEFUL_NEW', 'USEFUL_KNOWN', 'NOT_USEFUL']),
});

export type TriggerEvidenceInput = z.infer<typeof TriggerEvidenceInputSchema>;
type StoredTriggerEvidence = TriggerEvidenceInput & { id: string; capturedAt: string };

function parseStoredTriggerEvidence(value: Prisma.JsonValue | null | undefined): StoredTriggerEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    const parsed = TriggerEvidenceInputSchema.safeParse(candidate);
    if (!parsed.success || typeof candidate.id !== 'string' || typeof candidate.capturedAt !== 'string') return [];
    return [{ ...parsed.data, id: candidate.id, capturedAt: candidate.capturedAt }];
  });
}

const MATERIAL_TRIGGERS = new Set<EntryContextCaptureInput['activeTrigger']['type']>([
  'REPLACEMENT',
  'CONTRACTOR_QUOTE',
  'INSURANCE_COVERAGE',
  'RENEWAL_DEADLINE',
  'PROJECT',
  'ANTICIPATED_COST',
  'CLAIM_DAMAGE',
  'SELLING_TRANSFER',
]);

function deriveFirstValueType(input: EntryContextCaptureInput): typeof FIRST_VALUE_TYPES[number] {
  if (input.firstValueType) return input.firstValueType;
  if (input.entryPath === 'NEW_HOME_SETUP') return 'NEW_HOME_PROTECTION_PLAN';
  if (input.activeTrigger.type === 'INSPECTION_FINDING') return 'INSPECTION_90_DAY_PLAN';
  if (input.activeTrigger.type === 'MAINTENANCE_BACKLOG' || input.activeTrigger.type === 'NONE_EXPLORING') {
    return 'PRIORITIZED_12_MONTH_PLAN';
  }
  return 'TRIGGER_GUIDANCE';
}

async function assertPropertyAccess(propertyId: string, userId: string) {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access) throw new Error('Property not found or access denied.');
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      yearBuilt: true,
      propertySize: true,
      dwellingType: true,
    },
  });
  if (!property) throw new Error('Property not found or access denied.');
  return property;
}

function mapEntryContext(row: PropertyOnboarding): HomeownerEntryContext | null {
  if (!row.entryPath || !row.ownershipState || !row.propertyOrigin ||
    !row.activeTriggerId || !row.activeTriggerType || !row.activeTriggerLabel ||
    !row.triggerEntityType || !row.triggerSource || !row.triggerIdentifiedAt ||
    !row.firstValueType || !row.entryContextVersion) {
    return null;
  }

  return parseHomeownerEntryContext({
    id: row.id,
    propertyId: row.propertyId,
    userId: row.userId,
    entryPath: row.entryPath,
    ownershipState: row.ownershipState,
    propertyOrigin: row.propertyOrigin,
    activeTrigger: {
      type: row.activeTriggerType,
      label: row.activeTriggerLabel,
      detail: row.activeTriggerDetail,
      entityType: row.triggerEntityType,
      entityId: row.triggerEntityId,
      identifiedAt: row.triggerIdentifiedAt.toISOString(),
      source: row.triggerSource,
    },
    firstValue: {
      type: row.firstValueType,
      deliveredAt: row.firstValueAt?.toISOString() ?? null,
      firstActionResolvedAt: row.firstActionResolvedAt?.toISOString() ?? null,
    },
    contextVersion: row.entryContextVersion,
    consentContext: row.entryConsentContext,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function getEntryContext(
  propertyId: string,
  userId: string,
): Promise<HomeownerEntryContext | null> {
  await assertPropertyAccess(propertyId, userId);
  const onboarding = await prisma.propertyOnboarding.findUnique({ where: { propertyId } });
  return onboarding ? mapEntryContext(onboarding) : null;
}

export async function captureEntryContext(
  propertyId: string,
  userId: string,
  rawInput: unknown,
): Promise<HomeownerEntryContext> {
  await assertPropertyAccess(propertyId, userId);
  const input = EntryContextCaptureSchema.parse(rawInput);
  await getOrCreateOnboarding(propertyId, userId);

  const now = new Date();
  const triggerId = randomUUID();
  const onboarding = await prisma.propertyOnboarding.update({
    where: { propertyId },
    data: {
      entryPath: input.entryPath,
      ownershipState: input.ownershipState,
      propertyOrigin: input.propertyOrigin,
      activeTriggerId: triggerId,
      activeTriggerType: input.activeTrigger.type,
      activeTriggerLabel: input.activeTrigger.label,
      activeTriggerDetail: input.activeTrigger.detail ?? null,
      triggerEntityType: input.activeTrigger.entityType,
      triggerEntityId: input.activeTrigger.entityId ?? null,
      triggerSource: input.activeTrigger.source,
      triggerEvidenceJson: [] as Prisma.InputJsonValue,
      triggerIdentifiedAt: now,
      firstValueType: deriveFirstValueType(input),
      firstValueAt: null,
      firstActionResolvedAt: null,
      firstValueFeedback: null,
      firstValueFeedbackAt: null,
      entryContextVersion: 'phase1-v1',
      entryConsentContext: input.consentContext ?? null,
      entrySourceMetadata: input.sourceMetadata
        ? input.sourceMetadata as Prisma.InputJsonValue
        : undefined,
      entryContextCapturedAt: now,
      status: 'IN_PROGRESS',
      dismissedAt: null,
    },
  });

  emitNorthStarLineageEvent({
    eventType: 'ENTRY_CONTEXT_CAPTURED',
    propertyId,
    userId,
    occurredAt: now,
    source: 'trigger_first_onboarding',
    entryId: onboarding.id,
  });
  emitNorthStarLineageEvent({
    eventType: 'ACTIVE_TRIGGER_IDENTIFIED',
    propertyId,
    userId,
    occurredAt: now,
    source: 'trigger_first_onboarding',
    entryId: onboarding.id,
    triggerId,
  });

  const context = mapEntryContext(onboarding);
  if (!context) throw new Error('Entry context could not be materialized after capture.');
  return context;
}

export async function addTriggerEvidence(
  propertyId: string,
  userId: string,
  rawInput: unknown,
): Promise<StoredTriggerEvidence[]> {
  await assertPropertyAccess(propertyId, userId);
  const input = TriggerEvidenceInputSchema.parse(rawInput);
  const onboarding = await prisma.propertyOnboarding.findUnique({ where: { propertyId } });
  if (!onboarding?.activeTriggerId) throw new Error('Entry context has not been captured.');

  if (input.documentId) {
    const document = await prisma.document.findFirst({
      where: { id: input.documentId, propertyId, uploadedBy: userId },
      select: { id: true },
    });
    if (!document) throw new Error('Uploaded evidence was not found for this property.');
  }

  const evidence = parseStoredTriggerEvidence(onboarding.triggerEvidenceJson);
  const capturedAt = new Date().toISOString();
  const next: StoredTriggerEvidence[] = [
    ...evidence,
    { ...input, id: randomUUID(), capturedAt },
  ].slice(-20);
  await prisma.propertyOnboarding.update({
    where: { propertyId },
    data: {
      triggerEvidenceJson: next as Prisma.InputJsonValue,
      activeTriggerDetail: onboarding.activeTriggerDetail ?? input.detail ?? input.label,
    },
  });
  return next;
}

export async function recordFirstValueFeedback(
  propertyId: string,
  userId: string,
  rawInput: unknown,
) {
  await assertPropertyAccess(propertyId, userId);
  const input = FirstValueFeedbackSchema.parse(rawInput);
  const onboarding = await prisma.propertyOnboarding.findUnique({ where: { propertyId } });
  if (!onboarding?.firstValueAt) throw new Error('First value has not been delivered.');
  const firstValueFeedbackAt = new Date();
  await prisma.propertyOnboarding.update({
    where: { propertyId },
    data: { firstValueFeedback: input.feedback, firstValueFeedbackAt },
  });
  return { feedback: input.feedback, recordedAt: firstValueFeedbackAt.toISOString() };
}

type TriggerGuidanceCopy = {
  why: string;
  recommendation: string;
  outcome: string;
  timing: string;
  href: (propertyId: string) => string;
};

function triggerGuidanceCopy(type: EntryContextCaptureInput['activeTrigger']['type']): TriggerGuidanceCopy {
  const guidancePath = (propertyId: string) => `/dashboard/properties/${propertyId}/tools/guidance-overview`;
  const repairPath = (propertyId: string) => `/dashboard/properties/${propertyId}/fix`;
  const maintenancePath = (propertyId: string) => `/dashboard/maintenance?propertyId=${propertyId}`;
  const quotePath = (propertyId: string) => `/dashboard/quote-comparison?propertyId=${propertyId}`;
  const capitalPath = (propertyId: string) => `/dashboard/properties/${propertyId}/tools/capital-timeline`;
  const inspectionPath = (propertyId: string) => `/dashboard/properties/${propertyId}/inspection-hub`;
  const claimsPath = (propertyId: string) => `/dashboard/properties/${propertyId}/claims`;
  const sellerPath = (propertyId: string) => `/dashboard/properties/${propertyId}/seller-prep`;
  const projectPath = (propertyId: string) => `/dashboard/properties/${propertyId}/projects`;
  const protectionPath = (propertyId: string) => `/dashboard/properties/${propertyId}/protect`;
  const mapping: Partial<Record<typeof type, TriggerGuidanceCopy>> = {
    REPAIR: {
      why: 'A clear problem statement helps separate urgent diagnosis from premature replacement decisions.',
      recommendation: 'Record the symptoms, affected system, and any immediate safety concerns before choosing a repair path.',
      outcome: 'Reach the next diagnostic step without inventing system condition or repair cost.',
      timing: 'Review now if the problem is active; escalate immediately if there is danger or active damage.',
      href: repairPath,
    },
    REPLACEMENT: {
      why: 'Replacement decisions can create material cost and lifecycle consequences.',
      recommendation: 'Confirm condition, age, repair history, and scope before comparing repair and replacement options.',
      outcome: 'Compare realistic options using explicit assumptions instead of a generic replacement estimate.',
      timing: 'Confirm the decision inputs before requesting or accepting final pricing.',
      href: repairPath,
    },
    CONTRACTOR_QUOTE: {
      why: 'Scope exclusions and unclear assumptions can make quotes look comparable when they are not.',
      recommendation: 'Upload or review the quote, then confirm scope, exclusions, credentials, and alternatives.',
      outcome: 'Enter provider selection with a comparable, evidence-backed scope.',
      timing: 'Review before accepting, paying a deposit, or allowing work to begin.',
      href: quotePath,
    },
    INSURANCE_COVERAGE: {
      why: 'Coverage decisions depend on current policy language, property facts, and jurisdiction.',
      recommendation: 'Add the current policy or coverage question before evaluating gaps or changes.',
      outcome: 'Review coverage with policy evidence and visible professional boundaries.',
      timing: 'Act before a renewal, cancellation, claim deadline, or known exposure.',
      href: protectionPath,
    },
    RENEWAL_DEADLINE: {
      why: 'A known renewal date creates a limited comparison and correction window.',
      recommendation: 'Confirm the renewal date and current policy or warranty terms.',
      outcome: 'Resolve the renewal decision before the available action window closes.',
      timing: 'Start as soon as the renewal notice is available.',
      href: protectionPath,
    },
    PROJECT: {
      why: 'Early scope and responsibility clarity reduces cost, permit, and scheduling surprises.',
      recommendation: 'Define the project outcome, scope, responsibility, and known constraints.',
      outcome: 'Begin planning with a bounded scope and explicit unknowns.',
      timing: 'Confirm scope before quotes, permits, purchasing, or scheduling.',
      href: projectPath,
    },
    MAINTENANCE_BACKLOG: {
      why: 'A bounded maintenance list makes it easier to separate overdue care from optional improvements.',
      recommendation: 'Review current maintenance items and confirm the first task that is both relevant and supported by known home facts.',
      outcome: 'Start a manageable care sequence without treating generic schedules as property-specific evidence.',
      timing: 'Review now, then schedule only tasks whose applicability is confirmed.',
      href: maintenancePath,
    },
    ANTICIPATED_COST: {
      why: 'Future home costs are easier to manage when timing and uncertainty remain visible.',
      recommendation: 'Open the capital timeline and add the system, expected window, and evidence behind the anticipated cost.',
      outcome: 'Create a planning range without presenting an unsupported price forecast.',
      timing: 'Add the known cost trigger before committing savings or financing decisions.',
      href: capitalPath,
    },
    INSPECTION_FINDING: {
      why: 'Inspection findings are most useful when the original evidence and unresolved status stay connected.',
      recommendation: 'Open the inspection workspace and confirm the finding, severity, and current resolution status.',
      outcome: 'Turn the supported finding into a traceable next action.',
      timing: 'Review within the inspection or contingency window when one exists.',
      href: inspectionPath,
    },
    PUNCH_LIST_WARRANTY: {
      why: 'Warranty and punch-list issues can lose leverage when evidence or deadlines are scattered.',
      recommendation: 'Create or open the project record and capture the issue, responsible party, evidence, and deadline.',
      outcome: 'Track the issue through documented resolution before the available window closes.',
      timing: 'Record the issue before the builder, contractor, or warranty deadline.',
      href: projectPath,
    },
    CLAIM_DAMAGE: {
      why: 'Damage decisions depend on preserving evidence, limiting further loss, and tracking claim deadlines.',
      recommendation: 'Open the claims workspace and document the incident, immediate mitigation, and available evidence.',
      outcome: 'Preserve a bounded incident record without making a coverage determination.',
      timing: 'Address active danger or damage immediately, then document the claim context promptly.',
      href: claimsPath,
    },
    SELLING_TRANSFER: {
      why: 'A transfer is smoother when open work, documents, and property facts are reviewed before listing or handoff.',
      recommendation: 'Open seller preparation and identify the first record or unresolved item that affects the transfer.',
      outcome: 'Prepare a clearer handoff without inventing property condition or market value.',
      timing: 'Begin before listing, disclosure, or handoff deadlines.',
      href: sellerPath,
    },
  };
  return mapping[type] ?? {
    why: 'Starting from the homeowner’s active situation keeps guidance relevant and bounded.',
    recommendation: 'Confirm the trigger and the minimum facts needed for the next useful action.',
    outcome: 'Receive a prioritized starting point without unsupported property assumptions.',
    timing: 'Review the starting action now and add context only where it changes the decision.',
    href: guidancePath,
  };
}

function sourceAdapterForTrigger(type: EntryContextCaptureInput['activeTrigger']['type']): HomeActionSourceKind {
  if (type === 'MAINTENANCE_BACKLOG') return 'MAINTENANCE';
  if (type === 'INSURANCE_COVERAGE' || type === 'RENEWAL_DEADLINE') return 'COVERAGE';
  if (type === 'CLAIM_DAMAGE') return 'INCIDENT';
  if (['CONTRACTOR_QUOTE', 'PROJECT', 'INSPECTION_FINDING', 'PUNCH_LIST_WARRANTY'].includes(type)) return 'PROJECT';
  if (type === 'ANTICIPATED_COST' || type === 'NONE_EXPLORING') return 'SYSTEM';
  return 'GUIDANCE';
}

export function activationPriorityForTrigger(
  type: EntryContextCaptureInput['activeTrigger']['type'],
): HomeAction['priority'] {
  if (type === 'REPAIR' || type === 'CLAIM_DAMAGE') return 'NOW';
  if (type === 'NONE_EXPLORING') return 'CONSIDER';
  return 'SOON';
}

function appendActivationHandoff(href: string, triggerId: string, triggerType: string): string {
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}activationTriggerId=${encodeURIComponent(triggerId)}&activationTriggerType=${encodeURIComponent(triggerType)}`;
}

export type ActivationFirstValue = {
  entryContext: HomeownerEntryContext;
  action: HomeAction;
  baseline: {
    supportedFacts: Array<{ label: string; value: string; source: string }>;
    unknownFacts: string[];
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  plan: Record<'NOW' | 'SOON' | 'PLAN' | 'CONSIDER', HomeAction[]>;
};

export async function getActivationFirstValue(
  propertyId: string,
  userId: string,
): Promise<ActivationFirstValue> {
  const property = await assertPropertyAccess(propertyId, userId);
  const onboarding = await prisma.propertyOnboarding.findUnique({ where: { propertyId } });
  if (!onboarding) throw new Error('Entry context has not been captured.');
  const entryContext = mapEntryContext(onboarding);
  if (!entryContext || !onboarding.activeTriggerId || !onboarding.triggerIdentifiedAt) {
    throw new Error('Entry context has not been captured.');
  }

  const material = MATERIAL_TRIGGERS.has(entryContext.activeTrigger.type);
  const copy = triggerGuidanceCopy(entryContext.activeTrigger.type);
  const now = new Date();
  const actionId = `activation:${onboarding.activeTriggerId}`;
  const storedEvidence = parseStoredTriggerEvidence(onboarding.triggerEvidenceJson);
  const evidenceDetailPresent = storedEvidence.some((item) => Boolean(item.detail));
  const missing = [
    !property.yearBuilt ? 'Year built' : null,
    !property.propertySize ? 'Property size' : null,
    !entryContext.activeTrigger.entityId && entryContext.activeTrigger.entityType !== 'PROPERTY'
      ? 'Specific affected item or record'
      : null,
    !entryContext.activeTrigger.detail && !evidenceDetailPresent ? 'Trigger details' : null,
  ].filter((value): value is string => Boolean(value));
  const confidenceLabel = missing.length >= 3 ? 'LOW' : missing.length > 0 ? 'MEDIUM' : 'HIGH';
  const confidenceScore = confidenceLabel === 'HIGH' ? 0.85 : confidenceLabel === 'MEDIUM' ? 0.65 : 0.4;

  const triggerEvidence = storedEvidence.map((item) => ({
    id: item.id,
    type: item.documentId ? 'DOCUMENT' as const : 'USER_INPUT' as const,
    label: item.label,
    source: `Activation evidence (${item.kind.toLowerCase().replace('_', ' ')})`,
    observedAt: item.observedAt ?? item.capturedAt,
    freshness: 'CURRENT' as const,
    confidence: item.documentId ? 0.8 : 1,
  }));

  const action = adaptHomeActionSource(sourceAdapterForTrigger(entryContext.activeTrigger.type), {
    id: actionId,
    propertyId,
    lineageId: onboarding.activeTriggerId,
    sourceEntityId: onboarding.activeTriggerId,
    sourceVersion: 'phase1-v1',
    job: material ? 'DECIDE' : entryContext.entryPath === 'MAJOR_MOMENT' ? 'MAJOR_MOMENT' : 'STAY_AHEAD',
    state: 'OPEN',
    priority: activationPriorityForTrigger(entryContext.activeTrigger.type),
    signal: entryContext.activeTrigger.label,
    whyItMatters: copy.why,
    recommendedAction: copy.recommendation,
    expectedOutcome: copy.outcome,
    timing: {
      dueAt: null,
      windowStart: onboarding.triggerIdentifiedAt.toISOString(),
      windowEnd: null,
      rationale: copy.timing,
    },
    evidence: [{
      id: onboarding.activeTriggerId,
      type: entryContext.activeTrigger.source === 'DOCUMENT' ? 'DOCUMENT' : 'USER_INPUT',
      label: entryContext.activeTrigger.label,
      source: `Activation trigger (${entryContext.activeTrigger.source.toLowerCase()})`,
      observedAt: onboarding.triggerIdentifiedAt.toISOString(),
      freshness: 'CURRENT',
      confidence: 1,
    }, ...triggerEvidence],
    assumptions: material ? [{
      key: 'scope_complete',
      label: 'Current scope',
      value: entryContext.activeTrigger.detail || 'Only the selected trigger and known property facts are in scope.',
      source: entryContext.activeTrigger.detail ? 'USER' : 'UNKNOWN',
      editable: true,
    }] : [],
    options: material ? [
      { id: 'confirm-context', label: 'Confirm context first', summary: 'Add the minimum evidence that changes the decision.', recommended: true },
      { id: 'continue-bounded', label: 'Continue with a bounded review', summary: 'Proceed using visible unknowns and conservative assumptions.', recommended: false },
    ] : [],
    tradeoffs: material ? [{
      optionId: 'confirm-context',
      dimension: 'TIMING',
      summary: 'Confirming context takes more time now but reduces unsupported cost or scope conclusions.',
    }] : [],
    confidence: { score: confidenceScore, label: confidenceLabel, missing },
    governance: {
      safetyTier: material ? 'MATERIAL_FINANCIAL' : 'LOW_CONSEQUENCE',
      professionalBoundary: material
        ? 'This starting guidance supports homeowner planning and is not a binding estimate, coverage opinion, or professional diagnosis.'
        : null,
      jurisdictionCheck: { status: 'NOT_REQUIRED', jurisdiction: null, checkedAt: null, source: null },
      conservativeFallback: null,
      emergencyEscalation: null,
      commercialDisclosure: {
        involvesCommercialAction: false,
        relationshipType: 'NONE',
        compensationMayOccur: false,
        rankingInfluenced: false,
        summary: 'No provider, purchase, or financing ranking is presented in this first-value action.',
        selectionCriteria: [],
        nonCommercialAlternatives: [],
      },
      reviewedBy: [],
      policyVersion: 'phase1-v1',
    },
    primaryCta: {
      kind: 'REVIEW',
      label: 'Continue with this action',
      href: appendActivationHandoff(copy.href(propertyId), onboarding.activeTriggerId, entryContext.activeTrigger.type),
    },
    secondaryCtas: [{
      kind: 'CORRECT_FACT',
      label: 'Correct or add context',
      href: `/dashboard/properties/${propertyId}/onboarding`,
    }],
    feedbackControls: ['COMPLETE', 'DEFER', 'SNOOZE', 'DISMISS', 'NOT_RELEVANT', 'CORRECT_FACT'],
    relatedJourneyId: null,
    createdAt: onboarding.triggerIdentifiedAt.toISOString(),
    lastEvaluatedAt: now.toISOString(),
  });

  const firstDelivery = await prisma.propertyOnboarding.updateMany({
    where: { propertyId, firstValueAt: null },
    data: { firstValueAt: now },
  });
  if (firstDelivery.count > 0) {
    const importantReasons = material
      ? ['MATERIAL_FINANCIAL_CONSEQUENCE'] as const
      : ['REVIEWED_DOMAIN_RULE'] as const;
    for (const eventType of ['HOME_ACTION_IDENTIFIED', 'HOME_ACTION_SURFACED'] as const) {
      emitNorthStarLineageEvent({
        eventType,
        propertyId,
        userId,
        occurredAt: now,
        source: 'trigger_first_value',
        entryId: onboarding.id,
        triggerId: onboarding.activeTriggerId,
        signalId: onboarding.activeTriggerId,
        actionId,
        recommendationVersion: 'phase1-v1',
        importantReasons: [...importantReasons],
        actionWindowClosesAt: null,
      });
    }
  }

  const supportedFacts = [
    { label: 'Active trigger', value: entryContext.activeTrigger.label, source: 'Homeowner input' },
    property.yearBuilt ? { label: 'Year built', value: String(property.yearBuilt), source: 'Property record' } : null,
    property.propertySize ? { label: 'Property size', value: `${property.propertySize} sq ft`, source: 'Property record' } : null,
    property.dwellingType ? { label: 'Dwelling type', value: property.dwellingType, source: 'Property record' } : null,
    ...storedEvidence.map((item) => ({
      label: item.label,
      value: item.detail ?? `${item.kind.replace('_', ' ').toLowerCase()} attached`,
      source: item.documentId ? 'Homeowner document' : 'Homeowner input',
    })),
  ].filter((value): value is { label: string; value: string; source: string } => Boolean(value));

  const contextAction = missing.length > 0 ? adaptHomeActionSource('SYSTEM', {
    id: `activation-context:${onboarding.activeTriggerId}`,
    propertyId,
    lineageId: onboarding.activeTriggerId,
    sourceEntityId: onboarding.id,
    sourceVersion: 'phase1-v2',
    job: 'STAY_AHEAD',
    state: 'OPEN',
    priority: 'PLAN',
    signal: 'Complete only the home facts that improve this decision',
    whyItMatters: `The current action still has ${missing.length} explicit unknown${missing.length === 1 ? '' : 's'}.`,
    recommendedAction: `Review and correct: ${missing.join(', ')}. Skip anything that does not change the active decision.`,
    expectedOutcome: 'Improve future guidance confidence without creating an unnecessary setup burden.',
    timing: {
      dueAt: null,
      windowStart: now.toISOString(),
      windowEnd: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      rationale: 'Complete within the next 12 months, or sooner if one of these facts changes the active decision.',
    },
    evidence: action.evidence,
    assumptions: [],
    options: [],
    tradeoffs: [],
    confidence: { score: 1, label: 'HIGH', missing: [] },
    governance: {
      safetyTier: 'LOW_CONSEQUENCE',
      professionalBoundary: null,
      jurisdictionCheck: { status: 'NOT_REQUIRED', jurisdiction: null, checkedAt: null, source: null },
      conservativeFallback: null,
      emergencyEscalation: null,
      commercialDisclosure: {
        involvesCommercialAction: false,
        relationshipType: 'NONE',
        compensationMayOccur: false,
        rankingInfluenced: false,
        summary: 'This context action contains no provider, product, financing, or purchase ranking.',
        selectionCriteria: [],
        nonCommercialAlternatives: [],
      },
      reviewedBy: [],
      policyVersion: 'phase1-v2',
    },
    primaryCta: {
      kind: 'CORRECT_FACT',
      label: 'Review missing context',
      href: `/dashboard/properties/${propertyId}/onboarding`,
    },
    secondaryCtas: [],
    feedbackControls: ['COMPLETE', 'DEFER', 'DISMISS', 'NOT_RELEVANT', 'CORRECT_FACT'],
    relatedJourneyId: null,
    createdAt: now.toISOString(),
    lastEvaluatedAt: now.toISOString(),
  }) : null;

  return {
    entryContext: {
      ...entryContext,
      firstValue: { ...entryContext.firstValue, deliveredAt: onboarding.firstValueAt?.toISOString() ?? now.toISOString() },
    },
    action,
    baseline: { supportedFacts, unknownFacts: missing, confidence: confidenceLabel },
    plan: {
      NOW: action.priority === 'NOW' ? [action] : [],
      SOON: action.priority === 'SOON' ? [action] : [],
      PLAN: contextAction ? [contextAction] : [],
      CONSIDER: [],
    },
  };
}

export const FirstActionResolutionSchema = z.object({
  disposition: z.enum(['COMPLETED', 'INTENTIONALLY_DEFERRED', 'DELIBERATELY_DISMISSED']),
  reason: z.string().trim().min(1).max(1000),
  consequenceAcknowledged: z.boolean().default(true),
  nextTriggerAt: z.string().datetime().nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.disposition === 'INTENTIONALLY_DEFERRED' && !value.nextTriggerAt) {
    ctx.addIssue({
      code: 'custom',
      path: ['nextTriggerAt'],
      message: 'A deferred first action requires a next trigger date.',
    });
  }
});

export async function recordFirstActionResolution(
  propertyId: string,
  userId: string,
  rawInput: unknown,
) {
  await assertPropertyAccess(propertyId, userId);
  const input = FirstActionResolutionSchema.parse(rawInput);
  const onboarding = await prisma.propertyOnboarding.findUnique({ where: { propertyId } });
  if (!onboarding?.activeTriggerId || !mapEntryContext(onboarding)) {
    throw new Error('Entry context has not been captured.');
  }

  const resolvedAt = new Date();
  const executionId = randomUUID();
  const verificationId = randomUUID();
  const outcomeId = randomUUID();
  const actionId = `activation:${onboarding.activeTriggerId}`;
  await prisma.propertyOnboarding.update({
    where: { propertyId },
    data: { firstActionResolvedAt: resolvedAt },
  });

  const common = {
    propertyId,
    userId,
    occurredAt: resolvedAt,
    source: 'trigger_first_value',
    entryId: onboarding.id,
    triggerId: onboarding.activeTriggerId,
    signalId: onboarding.activeTriggerId,
    actionId,
    recommendationVersion: 'phase1-v1',
    resolutionDisposition: input.disposition,
    verificationStatus: 'NOT_REQUIRED' as const,
    resolutionReason: input.reason,
    consequenceAcknowledged: input.consequenceAcknowledged,
    nextTriggerAt: input.nextTriggerAt ?? null,
    unresolvedSafetyRequirement: false,
  };
  emitNorthStarLineageEvent({
    ...common,
    eventType: 'HOME_ACTION_RESOLUTION_RECORDED',
    executionId,
  });
  emitNorthStarLineageEvent({
    ...common,
    eventType: 'HOME_ACTION_OUTCOME_VERIFIED',
    executionId,
    verificationId,
    outcomeId,
  });

  return {
    actionId,
    disposition: input.disposition,
    reason: input.reason,
    consequenceAcknowledged: input.consequenceAcknowledged,
    nextTriggerAt: input.nextTriggerAt ?? null,
    resolvedAt: resolvedAt.toISOString(),
    verificationStatus: 'NOT_REQUIRED' as const,
  };
}
