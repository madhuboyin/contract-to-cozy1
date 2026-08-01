import { Prisma, type RenovationReadinessItemCategory } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../lib/logger';
import { APIError } from '../middleware/error.middleware';
import * as projectTrackerService from './projectTracker.service';
import { linkContributor } from './renovationCase.service';
import { resolveAndUpsertWorkItem } from '../modules/homeOperations/application/resolveWorkItem.usecase';
import { transitionWorkItem } from '../modules/homeOperations/application/transitionWorkItem.usecase';
import { linkWorkExecution } from '../modules/homeOperations/infrastructure/workItemRepository';

type FulfillmentMode = 'PROVIDER' | 'DIY';
type ReadinessState =
  | 'NOT_EVALUATED'
  | 'NOT_READY'
  | 'READY_WITH_ACKNOWLEDGED_OPEN_ITEMS'
  | 'READY';

type Candidate = {
  itemKey: string;
  category: RenovationReadinessItemCategory;
  title: string;
  reason: string;
  exactNextAction: string;
  status: 'OPEN' | 'SATISFIED';
  isBlocking: boolean;
  overrideAllowed: boolean;
  manualSatisfactionAllowed: boolean;
  ownerUserId: string;
  dueAt: Date;
  evidenceRequired: string;
  evidenceDocumentId?: string | null;
  evidenceReference: string;
  sourceType: string;
  sourceId: string;
  sourceObservedAt?: Date | null;
};

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function dateOnly(date: Date | null | undefined): Date {
  if (date) return date;
  const fallback = new Date();
  fallback.setUTCDate(fallback.getUTCDate() + 30);
  return fallback;
}

async function loadContext(propertyId: string, renovationCaseId: string) {
  const renovationCase = await prisma.renovationCase.findFirst({
    where: { id: renovationCaseId, propertyId, archivedAt: null },
    include: {
      currentScopeVersion: true,
      participants: { where: { isActive: true }, orderBy: { addedAt: 'asc' } },
      requirements: {
        where: { recordStatus: 'CURRENT' },
        include: { relatedPermit: true, relatedHoaApproval: true },
      },
      complianceConditions: true,
      links: true,
    },
  });
  if (!renovationCase?.currentScopeVersion) {
    throw new APIError(
      'Renovation case or current scope not found.',
      404,
      'RENOVATION_READINESS_SCOPE_NOT_FOUND',
    );
  }
  const ownerUserId = renovationCase.createdByUserId
    ?? renovationCase.participants.find(participant => participant.role === 'OWNER')?.userId
    ?? renovationCase.participants[0]?.userId;
  if (!ownerUserId) {
    throw new APIError(
      'Assign a renovation case owner before evaluating readiness.',
      409,
      'RENOVATION_READINESS_OWNER_REQUIRED',
    );
  }
  return { renovationCase, scope: renovationCase.currentScopeVersion, ownerUserId };
}

function requirementSatisfied(requirement: any): boolean {
  if (requirement.determination === 'DOES_NOT_APPLY') return true;
  if (requirement.family === 'PERMIT') {
    return Boolean(
      requirement.relatedPermit
      && ['ISSUED', 'INSPECTION_PENDING', 'FINALED'].includes(requirement.relatedPermit.status),
    );
  }
  if (requirement.family === 'HOA') {
    return Boolean(
      requirement.relatedHoaApproval
      && ['APPROVED', 'APPROVED_WITH_CONDITIONS'].includes(
        requirement.relatedHoaApproval.decisionStatus,
      ),
    );
  }
  return false;
}

function requirementOverrideAllowed(family: string): boolean {
  return !new Set(['PERMIT', 'HOA', 'SAFETY', 'HAZARD', 'PROFESSIONAL']).has(family);
}

async function selectedQuoteForCase(propertyId: string, links: Array<{ linkType: string; targetId: string }>) {
  const workspaceId = links.find(link => link.linkType === 'QUOTE_WORKSPACE')?.targetId;
  if (!workspaceId) return null;
  return prisma.quoteComparisonWorkspace.findFirst({
    where: { id: workspaceId, propertyId },
    include: { selectedQuote: true },
  });
}

function readinessSummary(items: Array<{
  status: string;
  isBlocking: boolean;
  overrideAcknowledgedAt: Date | null;
}>, scopeVersionId: string, fulfillmentMode: FulfillmentMode) {
  const open = items.filter(item => item.status === 'OPEN');
  const blockingOpen = open.filter(item => item.isBlocking && !item.overrideAcknowledgedAt);
  const acknowledgedOpen = open.filter(item => Boolean(item.overrideAcknowledgedAt));
  const state: ReadinessState = blockingOpen.length
    ? 'NOT_READY'
    : acknowledgedOpen.length
      ? 'READY_WITH_ACKNOWLEDGED_OPEN_ITEMS'
      : 'READY';
  return {
    state,
    scopeVersionId,
    fulfillmentMode,
    evaluatedAt: new Date().toISOString(),
    totalItems: items.length,
    openItems: open.length,
    blockingItems: blockingOpen.length,
    acknowledgedOpenItems: acknowledgedOpen.length,
    disclaimer: 'This readiness assessment organizes project records and does not establish legal compliance.',
  };
}

async function persistSummary(
  propertyId: string,
  renovationCaseId: string,
  scopeVersionId: string,
  fulfillmentMode: FulfillmentMode,
) {
  const items = await prisma.renovationStartReadinessItem.findMany({
    where: { propertyId, renovationCaseId, scopeVersionId },
    orderBy: [{ isBlocking: 'desc' }, { dueAt: 'asc' }, { title: 'asc' }],
  });
  const summary = readinessSummary(items, scopeVersionId, fulfillmentMode);
  await prisma.renovationCase.update({
    where: { id: renovationCaseId },
    data: { readinessSummary: json(summary) },
  });
  return { summary, items };
}

export async function evaluateReadiness(
  propertyId: string,
  renovationCaseId: string,
  actorUserId: string,
  fulfillmentMode: FulfillmentMode,
) {
  const { renovationCase, scope, ownerUserId } = await loadContext(propertyId, renovationCaseId);
  const dueAt = dateOnly(renovationCase.targetStartDate);
  const quoteWorkspace = await selectedQuoteForCase(propertyId, renovationCase.links);
  const selectedQuote = quoteWorkspace?.selectedQuote ?? null;
  const candidates: Candidate[] = [{
    itemKey: 'approved-scope',
    category: 'APPROVED_SCOPE',
    title: 'Approved scope version',
    reason: scope.approvalStatus === 'APPROVED'
      ? `Scope version ${scope.version} is approved.`
      : `Scope version ${scope.version} is ${scope.approvalStatus.toLowerCase()}.`,
    exactNextAction: 'Approve the exact scope that will be handed to Project execution.',
    status: scope.approvalStatus === 'APPROVED' ? 'SATISFIED' : 'OPEN',
    isBlocking: true,
    overrideAllowed: false,
    manualSatisfactionAllowed: false,
    ownerUserId,
    dueAt,
    evidenceRequired: 'An approved, versioned renovation scope.',
    evidenceReference: `Renovation scope v${scope.version}`,
    sourceType: 'RENOVATION_SCOPE_VERSION',
    sourceId: scope.id,
    sourceObservedAt: scope.effectiveAt,
  }];

  const requiredResearchFamilies = new Set(['PERMIT', 'HOA']);
  const researchedFamilies = new Set(renovationCase.requirements.map(requirement => requirement.family));
  const researchReady = renovationCase.requirements.length > 0
    && [...requiredResearchFamilies].every(family => researchedFamilies.has(family as any));
  candidates.push({
    itemKey: 'requirements-research',
    category: 'REQUIREMENT',
    title: 'Scope requirements evaluated',
    reason: researchReady
      ? 'Current-scope requirement candidates include permit and HOA research.'
      : 'The current scope does not have a complete requirements evaluation.',
    exactNextAction: 'Generate and source the current-scope renovation requirements before start.',
    status: researchReady ? 'SATISFIED' : 'OPEN',
    isBlocking: true,
    overrideAllowed: false,
    manualSatisfactionAllowed: false,
    ownerUserId,
    dueAt,
    evidenceRequired: 'Current-scope permit, HOA, safety, and supporting requirement records.',
    evidenceReference: `${renovationCase.requirements.length} current requirement record(s)`,
    sourceType: 'RENOVATION_REQUIREMENT_SET',
    sourceId: scope.id,
    sourceObservedAt: renovationCase.updatedAt,
  });

  for (const requirement of renovationCase.requirements) {
    const satisfied = requirementSatisfied(requirement);
    candidates.push({
      itemKey: `requirement:${requirement.id}`,
      category: 'REQUIREMENT',
      title: `${requirement.family.replace(/_/g, ' ')} requirement`,
      reason: satisfied
        ? `The sourced determination is ${requirement.determination.replace(/_/g, ' ').toLowerCase()}.`
        : requirement.exactNextAction,
      exactNextAction: requirement.exactNextAction,
      status: satisfied ? 'SATISFIED' : 'OPEN',
      isBlocking: requirement.isBlocking,
      overrideAllowed: requirementOverrideAllowed(requirement.family),
      manualSatisfactionAllowed: requirementOverrideAllowed(requirement.family),
      ownerUserId: requirement.ownerUserId ?? ownerUserId,
      dueAt: requirement.dueAt ?? dueAt,
      evidenceRequired: requirement.determination === 'DOES_NOT_APPLY'
        ? 'The sourced non-applicability determination.'
        : 'Evidence that the determined requirement has been completed.',
      evidenceDocumentId: requirement.sourceDocumentId,
      evidenceReference: requirement.sourceUrl
        ?? requirement.sourceSection
        ?? requirement.confirmedByOrg
        ?? `Requirement ${requirement.requirementKey}`,
      sourceType: 'RENOVATION_REQUIREMENT',
      sourceId: requirement.id,
      sourceObservedAt: requirement.sourceObservedAt,
    });
  }

  for (const condition of renovationCase.complianceConditions.filter(
    item => item.scopeVersionId === scope.id,
  )) {
    const satisfied = ['SATISFIED', 'WAIVED_WITH_ACKNOWLEDGMENT'].includes(condition.status);
    candidates.push({
      itemKey: `condition:${condition.id}`,
      category: 'COMPLIANCE_CONDITION',
      title: condition.title,
      reason: condition.description,
      exactNextAction: satisfied
        ? 'Keep the verification evidence with the project record.'
        : 'Complete and verify this permit or HOA condition before starting affected work.',
      status: satisfied ? 'SATISFIED' : 'OPEN',
      isBlocking: condition.isBlocking,
      overrideAllowed: false,
      manualSatisfactionAllowed: false,
      ownerUserId: condition.ownerUserId ?? ownerUserId,
      dueAt: condition.dueAt ?? dueAt,
      evidenceRequired: 'Verified evidence attached to the source condition.',
      evidenceDocumentId: condition.sourceDocumentId,
      evidenceReference: condition.sourceReference ?? `Compliance condition ${condition.id}`,
      sourceType: 'RENOVATION_COMPLIANCE_CONDITION',
      sourceId: condition.id,
      sourceObservedAt: condition.updatedAt,
    });
  }

  const providerReady = fulfillmentMode === 'DIY'
    || Boolean(selectedQuote?.homeownerConfirmedAt && quoteWorkspace?.selectedVendorName);
  candidates.push({
    itemKey: 'execution-contractor',
    category: 'CONTRACTOR',
    title: fulfillmentMode === 'DIY' ? 'DIY execution selected' : 'Contractor selected',
    reason: fulfillmentMode === 'DIY'
      ? 'The homeowner selected DIY execution for this readiness evaluation.'
      : providerReady
        ? `${quoteWorkspace?.selectedVendorName} is selected and homeowner-confirmed.`
        : 'No homeowner-confirmed contractor selection is linked to this case.',
    exactNextAction: fulfillmentMode === 'DIY'
      ? 'Confirm who owns each execution task.'
      : 'Link a quote workspace and confirm the selected contractor.',
    status: providerReady ? 'SATISFIED' : 'OPEN',
    isBlocking: true,
    overrideAllowed: true,
    manualSatisfactionAllowed: true,
    ownerUserId,
    dueAt,
    evidenceRequired: fulfillmentMode === 'DIY'
      ? 'The recorded DIY execution choice.'
      : 'A homeowner-confirmed contractor or selected proposal.',
    evidenceReference: selectedQuote
      ? `Selected quote ${selectedQuote.id}`
      : `${fulfillmentMode} execution selection`,
    sourceType: selectedQuote ? 'QUOTE_COMPARISON_QUOTE' : 'READINESS_INPUT',
    sourceId: selectedQuote?.id ?? renovationCaseId,
    sourceObservedAt: selectedQuote?.homeownerConfirmedAt,
  });

  const contractReady = fulfillmentMode === 'DIY'
    || Boolean(scope.contractCostCents != null && scope.specificationDocumentIds.length);
  candidates.push({
    itemKey: 'execution-contract',
    category: 'CONTRACT',
    title: fulfillmentMode === 'DIY' ? 'DIY scope and budget recorded' : 'Contract and price documented',
    reason: contractReady
      ? fulfillmentMode === 'DIY'
        ? 'No provider contract is required for the selected DIY execution mode.'
        : 'The approved scope records a contract amount and specification evidence.'
      : 'The approved scope is missing a contract amount or contract/specification document.',
    exactNextAction: 'Record the agreed contract amount and attach the governing contract or specification.',
    status: contractReady ? 'SATISFIED' : 'OPEN',
    isBlocking: true,
    overrideAllowed: true,
    manualSatisfactionAllowed: true,
    ownerUserId,
    dueAt,
    evidenceRequired: 'The agreed price and governing contract/scope document.',
    evidenceDocumentId: scope.specificationDocumentIds[0],
    evidenceReference: scope.specificationDocumentIds.length
      ? `${scope.specificationDocumentIds.length} scope/contract document(s)`
      : `Scope version ${scope.version}`,
    sourceType: 'RENOVATION_SCOPE_VERSION',
    sourceId: scope.id,
    sourceObservedAt: scope.effectiveAt,
  });

  candidates.push({
    itemKey: 'execution-schedule',
    category: 'SCHEDULE',
    title: 'Start date recorded',
    reason: renovationCase.targetStartDate
      ? `Target start is ${renovationCase.targetStartDate.toISOString().slice(0, 10)}.`
      : 'No target start date is recorded.',
    exactNextAction: 'Record the planned or actual start date.',
    status: renovationCase.targetStartDate ? 'SATISFIED' : 'OPEN',
    isBlocking: true,
    overrideAllowed: true,
    manualSatisfactionAllowed: true,
    ownerUserId,
    dueAt,
    evidenceRequired: 'A homeowner-confirmed planned or actual start date.',
    evidenceReference: renovationCase.targetStartDate
      ? renovationCase.targetStartDate.toISOString().slice(0, 10)
      : 'Renovation case schedule',
    sourceType: 'RENOVATION_CASE',
    sourceId: renovationCaseId,
    sourceObservedAt: renovationCase.updatedAt,
  });

  const existing = await prisma.renovationStartReadinessItem.findMany({
    where: { renovationCaseId, scopeVersionId: scope.id },
  });
  const existingByKey = new Map(existing.map(item => [item.itemKey, item]));
  await prisma.$transaction(async tx => {
    for (const candidate of candidates) {
      const prior = existingByKey.get(candidate.itemKey);
      const manuallySatisfied = candidate.manualSatisfactionAllowed && Boolean(prior?.manuallySatisfiedAt);
      const status = candidate.status === 'SATISFIED' || manuallySatisfied ? 'SATISFIED' : 'OPEN';
      await tx.renovationStartReadinessItem.upsert({
        where: {
          renovationCaseId_scopeVersionId_itemKey: {
            renovationCaseId,
            scopeVersionId: scope.id,
            itemKey: candidate.itemKey,
          },
        },
        create: {
          renovationCaseId,
          propertyId,
          scopeVersionId: scope.id,
          ...candidate,
          status,
        },
        update: {
          category: candidate.category,
          title: candidate.title,
          reason: candidate.reason,
          exactNextAction: candidate.exactNextAction,
          status,
          isBlocking: candidate.isBlocking,
          overrideAllowed: candidate.overrideAllowed,
          manualSatisfactionAllowed: candidate.manualSatisfactionAllowed,
          ownerUserId: candidate.ownerUserId,
          dueAt: candidate.dueAt,
          evidenceRequired: candidate.evidenceRequired,
          evidenceDocumentId: prior?.manuallySatisfiedAt
            ? prior.evidenceDocumentId
            : candidate.evidenceDocumentId,
          evidenceReference: candidate.evidenceReference,
          sourceType: candidate.sourceType,
          sourceId: candidate.sourceId,
          sourceObservedAt: candidate.sourceObservedAt,
          derivedAt: new Date(),
          ...(status === 'SATISFIED' && {
            overrideAcknowledgedAt: null,
            overrideAcknowledgedByUserId: null,
            overrideReason: null,
          }),
        },
      });
    }
    await tx.renovationReadinessEvent.create({
      data: {
        renovationCaseId,
        propertyId,
        scopeVersionId: scope.id,
        eventType: 'EVALUATED',
        actorUserId,
        payload: json({ fulfillmentMode, candidateCount: candidates.length }),
      },
    });
    await tx.renovationCaseEvent.create({
      data: {
        renovationCaseId,
        propertyId,
        actorUserId,
        eventType: 'READINESS_EVALUATED',
        scopeVersionId: scope.id,
        payload: json({ fulfillmentMode, candidateCount: candidates.length }),
      },
    });
  });
  return persistSummary(propertyId, renovationCaseId, scope.id, fulfillmentMode);
}

export async function getReadiness(propertyId: string, renovationCaseId: string) {
  const { renovationCase, scope } = await loadContext(propertyId, renovationCaseId);
  const items = await prisma.renovationStartReadinessItem.findMany({
    where: { propertyId, renovationCaseId, scopeVersionId: scope.id },
    orderBy: [{ isBlocking: 'desc' }, { dueAt: 'asc' }, { title: 'asc' }],
  });
  if (!items.length) {
    return {
      summary: {
        state: 'NOT_EVALUATED' as ReadinessState,
        scopeVersionId: scope.id,
        disclaimer: 'This readiness assessment organizes project records and does not establish legal compliance.',
      },
      items,
      project: null,
    };
  }
  const earliestDerivedAt = items.reduce(
    (earliest, item) => item.derivedAt < earliest ? item.derivedAt : earliest,
    items[0].derivedAt,
  );
  const sourceChanged = [
    ...renovationCase.requirements.map(requirement => requirement.updatedAt),
    ...renovationCase.complianceConditions.map(condition => condition.updatedAt),
  ].some(updatedAt => updatedAt > earliestDerivedAt);
  const scopeItem = items.find(item => item.itemKey === 'approved-scope');
  const scopeStateChanged = Boolean(scopeItem)
    && (scope.approvalStatus === 'APPROVED') !== (scopeItem?.status === 'SATISFIED');
  const scheduleItem = items.find(item => item.itemKey === 'execution-schedule');
  const scheduleStateChanged = Boolean(scheduleItem)
    && Boolean(renovationCase.targetStartDate) !== (scheduleItem?.status === 'SATISFIED');
  if (sourceChanged || scopeStateChanged || scheduleStateChanged) {
    const project = await prisma.projectRecord.findUnique({
      where: { renovationCaseId },
      select: { id: true, name: true, status: true, startDate: true },
    });
    return {
      summary: {
        state: 'NOT_EVALUATED' as ReadinessState,
        scopeVersionId: scope.id,
        stale: true,
        staleReason: 'A source requirement, condition, approved scope, or schedule changed after evaluation.',
        disclaimer: 'This readiness assessment organizes project records and does not establish legal compliance.',
      },
      items,
      project,
    };
  }
  const stored = renovationCase.readinessSummary as Record<string, unknown> | null;
  const fulfillmentMode = stored?.scopeVersionId === scope.id && stored?.fulfillmentMode === 'DIY'
    ? 'DIY'
    : 'PROVIDER';
  const result = readinessSummary(items, scope.id, fulfillmentMode);
  const project = await prisma.projectRecord.findUnique({
    where: { renovationCaseId },
    select: { id: true, name: true, status: true, startDate: true },
  });
  return { summary: result, items, project };
}

export async function updateReadinessItem(
  propertyId: string,
  renovationCaseId: string,
  itemId: string,
  actorUserId: string,
  input: any,
) {
  const { renovationCase, scope } = await loadContext(propertyId, renovationCaseId);
  const item = await prisma.renovationStartReadinessItem.findFirst({
    where: { id: itemId, propertyId, renovationCaseId, scopeVersionId: scope.id },
  });
  if (!item) throw new APIError('Readiness item not found.', 404, 'RENOVATION_READINESS_ITEM_NOT_FOUND');
  if (!item.manualSatisfactionAllowed) {
    throw new APIError(
      'This item is controlled by its source record and cannot be manually completed here.',
      409,
      'RENOVATION_READINESS_SOURCE_CONTROLLED',
    );
  }
  if (input.status === 'SATISFIED') {
    const evidence = await prisma.document.findFirst({
      where: { id: input.evidenceDocumentId, propertyId },
      select: { id: true },
    });
    if (!evidence) {
      throw new APIError(
        'Readiness evidence must belong to this property.',
        409,
        'RENOVATION_READINESS_EVIDENCE_SCOPE_MISMATCH',
      );
    }
  }
  await prisma.$transaction([
    prisma.renovationStartReadinessItem.update({
      where: { id: itemId },
      data: input.status === 'SATISFIED'
        ? {
            status: 'SATISFIED',
            evidenceDocumentId: input.evidenceDocumentId,
            manuallySatisfiedAt: new Date(),
            manuallySatisfiedByUserId: actorUserId,
            satisfactionNotes: input.satisfactionNotes,
            overrideAcknowledgedAt: null,
            overrideAcknowledgedByUserId: null,
            overrideReason: null,
          }
        : {
            status: 'OPEN',
            manuallySatisfiedAt: null,
            manuallySatisfiedByUserId: null,
            satisfactionNotes: input.satisfactionNotes,
          },
    }),
    prisma.renovationReadinessEvent.create({
      data: {
        renovationCaseId,
        propertyId,
        scopeVersionId: scope.id,
        readinessItemId: itemId,
        eventType: input.status === 'SATISFIED' ? 'ITEM_SATISFIED' : 'ITEM_REOPENED',
        actorUserId,
        reason: input.satisfactionNotes,
        payload: input.status === 'SATISFIED'
          ? json({ evidenceDocumentId: input.evidenceDocumentId })
          : undefined,
      },
    }),
  ]);
  const fulfillmentMode = (renovationCase.readinessSummary as any)?.fulfillmentMode === 'DIY'
    ? 'DIY'
    : 'PROVIDER';
  return persistSummary(propertyId, renovationCaseId, scope.id, fulfillmentMode);
}

export async function governOverride(
  propertyId: string,
  renovationCaseId: string,
  itemId: string,
  actorUserId: string,
  input: any,
) {
  const { renovationCase, scope } = await loadContext(propertyId, renovationCaseId);
  const item = await prisma.renovationStartReadinessItem.findFirst({
    where: { id: itemId, propertyId, renovationCaseId, scopeVersionId: scope.id },
  });
  if (!item) throw new APIError('Readiness item not found.', 404, 'RENOVATION_READINESS_ITEM_NOT_FOUND');
  if (item.status !== 'OPEN') {
    throw new APIError('Only an open readiness item can be overridden.', 409, 'RENOVATION_READINESS_OVERRIDE_NOT_OPEN');
  }
  if (!item.overrideAllowed) {
    throw new APIError(
      'This authority, safety, or source-controlled blocker cannot be overridden.',
      409,
      'RENOVATION_READINESS_OVERRIDE_PROHIBITED',
    );
  }
  const acknowledging = input.action === 'ACKNOWLEDGE';
  await prisma.$transaction([
    prisma.renovationStartReadinessItem.update({
      where: { id: itemId },
      data: acknowledging
        ? {
            overrideAcknowledgedAt: new Date(),
            overrideAcknowledgedByUserId: actorUserId,
            overrideReason: input.reason,
          }
        : {
            overrideAcknowledgedAt: null,
            overrideAcknowledgedByUserId: null,
            overrideReason: null,
          },
    }),
    prisma.renovationReadinessEvent.create({
      data: {
        renovationCaseId,
        propertyId,
        scopeVersionId: scope.id,
        readinessItemId: itemId,
        eventType: acknowledging ? 'OVERRIDE_RECORDED' : 'OVERRIDE_REVOKED',
        actorUserId,
        reason: input.reason,
        payload: json({ riskAcknowledged: input.riskAcknowledged ?? null }),
      },
    }),
    prisma.renovationCaseEvent.create({
      data: {
        renovationCaseId,
        propertyId,
        actorUserId,
        eventType: acknowledging ? 'READINESS_OVERRIDE_RECORDED' : 'READINESS_OVERRIDE_REVOKED',
        scopeVersionId: scope.id,
        payload: json({ readinessItemId: itemId, reason: input.reason }),
      },
    }),
  ]);
  const fulfillmentMode = (renovationCase.readinessSummary as any)?.fulfillmentMode === 'DIY'
    ? 'DIY'
    : 'PROVIDER';
  return persistSummary(propertyId, renovationCaseId, scope.id, fulfillmentMode);
}

function projectRequirementProjection(requirements: any[], family: 'PERMIT' | 'HOA') {
  const relevant = requirements.filter(requirement => requirement.family === family);
  if (!relevant.length || relevant.some(requirement => requirement.determination === 'UNDETERMINED')) {
    return { applicability: 'UNKNOWN', basis: undefined };
  }
  if (relevant.some(requirement => ['APPLIES', 'CONDITIONAL'].includes(requirement.determination))) {
    return {
      applicability: 'REQUIRED',
      basis: relevant.map(requirement =>
        requirement.sourceUrl ?? requirement.confirmedByOrg ?? requirement.exactNextAction,
      ).join(' | '),
    };
  }
  return {
    applicability: 'NOT_REQUIRED_CONFIRMED',
    basis: relevant.map(requirement =>
      requirement.sourceUrl ?? requirement.confirmedByOrg ?? requirement.evidenceNotes ?? requirement.question,
    ).join(' | '),
  };
}

function homeSystems(values: string[]) {
  const supported = new Set([
    'APPLIANCE', 'HVAC', 'PLUMBING', 'ELECTRICAL', 'ROOF_EXTERIOR', 'SAFETY',
    'SMART_HOME', 'FURNITURE', 'ELECTRONICS', 'OTHER', 'INTERIOR',
    'STRUCTURAL', 'EXTERIOR', 'SITE',
  ]);
  const mapped = values.map(value => value.toUpperCase().replace(/[^A-Z0-9]+/g, '_'));
  const valid = mapped.filter(value => supported.has(value));
  return valid.length ? [...new Set(valid)] : ['OTHER'];
}

async function ensureProjectWorkItem(
  propertyId: string,
  project: { id: string; name: string; description: string | null; startDate: Date; expectedEndDate: Date | null; updatedAt: Date },
  actorUserId: string,
) {
  const workItem = await resolveAndUpsertWorkItem({
    propertyId,
    subject: { type: 'PROJECT', id: project.id },
    obligationType: 'PROJECT_EXECUTION',
    occurrence: { obligationSlug: 'execution' },
    title: `${project.name}: begin execution`,
    homeownerReason: project.description ?? 'The approved renovation scope is now linked to Project execution.',
    expectedOutcome: 'Complete the versioned project scope with conditions and evidence preserved.',
    priority: 'PLAN',
    safetyTier: 'MATERIAL_FINANCIAL',
    dueWindowStart: project.startDate,
    dueAt: project.expectedEndDate,
    dueWindowEnd: project.expectedEndDate,
    confidence: 1,
    missingContext: [],
    source: {
      sourceType: 'PROJECT',
      sourceEntityId: project.id,
      sourceVersion: project.updatedAt.toISOString(),
      sourceRole: 'TRIGGER',
    },
  });
  let state = workItem.state;
  if (state === 'CANDIDATE') {
    const accepted = await transitionWorkItem({
      workItemId: workItem.id,
      to: 'ACCEPTED',
      actorType: 'USER',
      actorUserId,
      idempotencyKey: `renovation-project-accepted:${project.id}`,
    });
    state = accepted.state;
  }
  if (state === 'ACCEPTED') {
    await transitionWorkItem({
      workItemId: workItem.id,
      to: 'IN_PROJECT',
      actorType: 'USER',
      actorUserId,
      idempotencyKey: `renovation-project-started:${project.id}`,
    });
  }
  await linkWorkExecution({
    workItemId: workItem.id,
    executionType: 'PROJECT',
    executionEntityId: project.id,
  });
}

export async function handoffToProject(
  propertyId: string,
  renovationCaseId: string,
  actorUserId: string,
  input: any,
) {
  const existingProject = await prisma.projectRecord.findUnique({
    where: { renovationCaseId },
  });
  if (existingProject) {
    return projectTrackerService.getProjectDetail(existingProject.id, propertyId);
  }
  const { renovationCase, scope } = await loadContext(propertyId, renovationCaseId);
  const readiness = await getReadiness(propertyId, renovationCaseId);
  const summary = readiness.summary as any;
  const bypassReadiness = input.intakeMode !== 'PLANNED';
  if (!bypassReadiness && !['READY', 'READY_WITH_ACKNOWLEDGED_OPEN_ITEMS'].includes(summary.state)) {
    throw new APIError(
      'Resolve or explicitly acknowledge every permitted readiness blocker before creating the Project.',
      409,
      'RENOVATION_PROJECT_NOT_READY',
      { readiness: summary },
    );
  }
  if (!bypassReadiness && summary.fulfillmentMode !== input.fulfillmentMode) {
    throw new APIError(
      'Re-evaluate readiness for the selected execution mode before handoff.',
      409,
      'RENOVATION_READINESS_MODE_MISMATCH',
    );
  }
  const documents = [...new Set<string>((input.contractDocumentIds ?? []) as string[])];
  if (documents.length) {
    const count = await prisma.document.count({ where: { id: { in: documents }, propertyId } });
    if (count !== documents.length) {
      throw new APIError(
        'Every handoff document must belong to this property.',
        409,
        'RENOVATION_PROJECT_DOCUMENT_SCOPE_MISMATCH',
      );
    }
  }
  const quoteWorkspace = await selectedQuoteForCase(propertyId, renovationCase.links);
  const quote = quoteWorkspace?.selectedQuote;
  const conditions = renovationCase.complianceConditions
    .filter(condition => condition.scopeVersionId === scope.id)
    .map(condition => ({
      id: condition.id,
      title: condition.title,
      description: condition.description,
      status: condition.status,
      isBlocking: condition.isBlocking,
      dueAt: condition.dueAt?.toISOString() ?? null,
      evidenceDocumentId: condition.sourceDocumentId,
    }));
  const openConditions = conditions.filter(condition =>
    !['SATISFIED', 'WAIVED_WITH_ACKNOWLEDGMENT'].includes(condition.status),
  );
  const permit = projectRequirementProjection(renovationCase.requirements, 'PERMIT');
  const hoa = projectRequirementProjection(renovationCase.requirements, 'HOA');
  const contractAmountCents = input.contractAmountCents
    ?? scope.contractCostCents
    ?? (quoteWorkspace?.selectedQuoteAmount
      ? Math.round(Number(quoteWorkspace.selectedQuoteAmount) * 100)
      : 0);
  const contractorName = input.contractorName ?? quoteWorkspace?.selectedVendorName ?? undefined;
  const contractorLicense = input.contractorLicense ?? quote?.providerLicenseNumber ?? undefined;
  const inheritedDocumentIds = [...new Set([
    ...scope.drawingDocumentIds,
    ...scope.specificationDocumentIds,
    ...documents,
  ])];
  let project: Awaited<ReturnType<typeof projectTrackerService.createProject>>;
  try {
    project = await projectTrackerService.createProject(propertyId, {
    name: renovationCase.name,
    projectType: input.projectType,
    contractorName,
    contractorLicense,
    contractorPhone: input.contractorPhone,
    contractorEmail: input.contractorEmail,
    contractorId: input.contractorId,
    description: [
      scope.summary ?? renovationCase.objective ?? 'Renovation project',
      `Source scope: version ${scope.version}.`,
      'Readiness organizes records and does not establish legal compliance.',
    ].join(' '),
    sourceType: 'MANUAL',
    sourceActionId: `renovation-handoff:${input.idempotencyKey}`,
    sourceEntityType: 'RENOVATION_CASE',
    sourceEntityId: renovationCaseId,
    fulfillmentMode: input.fulfillmentMode,
    fundingMode: input.fundingMode,
    complexity: renovationCase.governanceTier === 'LOW_CONSEQUENCE' ? 'MINOR' : 'MAJOR',
    permitApplicability: permit.applicability,
    permitApplicabilityBasis: permit.basis,
    hoaApplicability: hoa.applicability,
    hoaApplicabilityBasis: hoa.basis,
    contractAmountCents,
    startDate: input.startDate,
    expectedEndDate: input.expectedEndDate,
    homeSystemsAffected: homeSystems(renovationCase.systemsAffected),
    contractDocumentKey: input.contractDocumentKey,
    renovationCaseId,
    renovationScopeVersionId: scope.id,
    renovationScopeSnapshot: {
      version: scope.version,
      summary: scope.summary,
      workItems: scope.workItems,
      spacesAffected: scope.spacesAffected,
      systemsAffected: scope.systemsAffected,
      intendedUse: scope.intendedUse,
      dimensions: scope.dimensions,
      structuralEffects: scope.structuralEffects,
      exteriorEffects: scope.exteriorEffects,
      approvalStatus: scope.approvalStatus,
      contractCostCents: scope.contractCostCents,
    },
    inheritedConditions: conditions,
    inheritedDependencies: readiness.items
      .filter(item => item.status === 'OPEN')
      .map(item => ({
        readinessItemId: item.id,
        title: item.title,
        isBlocking: item.isBlocking,
        overrideAcknowledgedAt: item.overrideAcknowledgedAt,
        dueAt: item.dueAt,
      })),
    evidenceRequirements: readiness.items.map(item => ({
      readinessItemId: item.id,
      title: item.title,
      evidenceRequired: item.evidenceRequired,
      evidenceDocumentId: item.evidenceDocumentId,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
    })),
    contractDocumentIds: inheritedDocumentIds,
      milestones: openConditions.map((condition, index) => ({
        name: condition.title,
        description: `Inherited compliance condition ${condition.id}: ${condition.description}`,
        milestoneType: 'CUSTOM',
        scheduledDate: condition.dueAt?.slice(0, 10),
        requiresPhotoEvidence: true,
        position: index,
      })),
    });
  } catch (error: any) {
    if (error?.code === 'P2002' || error?.code === 'ACTIVE_PROJECT_DUPLICATE') {
      const concurrent = await prisma.projectRecord.findUnique({ where: { renovationCaseId } });
      if (concurrent) return projectTrackerService.getProjectDetail(concurrent.id, propertyId);
    }
    throw error;
  }
  const projectStatus = input.intakeMode === 'ALREADY_STARTED' ? 'IN_PROGRESS' : 'PLANNING';
  const updatedProject = await prisma.projectRecord.update({
    where: { id: project.id },
    data: { status: projectStatus },
  });
  if (openConditions.length) {
    await prisma.projectMilestone.updateMany({
      where: { projectId: project.id },
      data: { status: 'BLOCKED' },
    });
  }
  await linkContributor(propertyId, renovationCaseId, actorUserId, {
    linkType: 'PROJECT',
    targetId: project.id,
    scopeVersionId: scope.id,
    metadata: {
      role: 'EXECUTION_HANDOFF',
      intakeMode: input.intakeMode,
      idempotencyKey: input.idempotencyKey,
    },
  });
  const nextLifecycle = input.intakeMode === 'ALREADY_STARTED'
    ? 'IN_EXECUTION'
    : input.intakeMode === 'HISTORICAL'
      ? renovationCase.lifecycle
      : renovationCase.lifecycle === 'PREPARING_TO_START'
        ? 'READY_TO_START'
        : renovationCase.lifecycle;
  await prisma.$transaction([
    prisma.renovationCase.update({
      where: { id: renovationCaseId },
      data: { lifecycle: nextLifecycle },
    }),
    prisma.renovationReadinessEvent.create({
      data: {
        renovationCaseId,
        propertyId,
        scopeVersionId: scope.id,
        eventType: 'PROJECT_HANDOFF',
        actorUserId,
        reason: input.historicalReason,
        payload: json({
          projectId: project.id,
          intakeMode: input.intakeMode,
          readinessState: summary.state,
          readinessBypassed: bypassReadiness,
          idempotencyKey: input.idempotencyKey,
        }),
      },
    }),
    prisma.renovationCaseEvent.create({
      data: {
        renovationCaseId,
        propertyId,
        actorUserId,
        eventType: 'PROJECT_HANDOFF_STARTED',
        fromLifecycle: renovationCase.lifecycle,
        toLifecycle: nextLifecycle,
        scopeVersionId: scope.id,
        idempotencyKey: `project-handoff:${input.idempotencyKey}`,
        payload: json({
          projectId: project.id,
          intakeMode: input.intakeMode,
          readinessState: summary.state,
          readinessBypassed: bypassReadiness,
        }),
      },
    }),
  ]);
  // Home Operations §15: a secondary sync alongside the project handoff
  // already committed above — best-effort, must never block the handoff
  // that already succeeded.
  try {
    await ensureProjectWorkItem(propertyId, updatedProject, actorUserId);
  } catch (err) {
    logger.error({ err, propertyId, projectId: project.id }, '[RenovationReadiness] Failed to sync the project execution work item');
  }
  return projectTrackerService.getProjectDetail(project.id, propertyId);
}
