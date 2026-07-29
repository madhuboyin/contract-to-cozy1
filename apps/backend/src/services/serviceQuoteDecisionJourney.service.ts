import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  canTransitionServiceQuoteDecision,
} from './serviceQuoteDecisionTransitions';
import type {
  ServiceQuoteDecisionEntityType,
  ServiceQuoteDecisionOutcome,
  ServiceQuoteDecisionStage,
} from './serviceQuoteDecisionTransitions';

export { canTransitionServiceQuoteDecision } from './serviceQuoteDecisionTransitions';
export type {
  ServiceQuoteDecisionEntityType,
  ServiceQuoteDecisionOutcome,
  ServiceQuoteDecisionStage,
} from './serviceQuoteDecisionTransitions';

function validateStageOutcome(
  stage: ServiceQuoteDecisionStage,
  outcome: ServiceQuoteDecisionOutcome,
) {
  if (stage === 'COMPLETED' && outcome !== 'COMPLETED') {
    throw new APIError(
      'A completed service-quote journey requires a completed outcome.',
      400,
      'SERVICE_QUOTE_INVALID_COMPLETION_OUTCOME',
    );
  }
  if (stage === 'CLOSED' && outcome === 'OPEN') {
    throw new APIError(
      'Close the journey with a recorded outcome.',
      400,
      'SERVICE_QUOTE_OUTCOME_REQUIRED',
    );
  }
}

const database = prisma as any;

export interface AdvanceServiceQuoteDecisionInput {
  propertyId: string;
  workspaceId: string;
  actorUserId?: string | null;
  toStage: ServiceQuoteDecisionStage;
  outcome?: ServiceQuoteDecisionOutcome;
  reason?: string | null;
  relatedEntityType?: ServiceQuoteDecisionEntityType | null;
  relatedEntityId?: string | null;
  metadataJson?: Record<string, unknown> | null;
}

function homeTimelineDescriptor(
  stage: ServiceQuoteDecisionStage,
  outcome: ServiceQuoteDecisionOutcome,
) {
  if (stage === 'FINALIZATION' && outcome === 'ACCEPTED') {
    return {
      subtype: 'SERVICE_QUOTE_DECISION_ACCEPTED',
      title: 'Service quote decision recorded',
      summary: 'The selected provider, price, scope, and accepted terms were recorded.',
    };
  }
  if (stage === 'BOOKING' && outcome === 'BOOKED') {
    return {
      subtype: 'SERVICE_QUOTE_BOOKED',
      title: 'Service booking requested',
      summary: 'The accepted service quote moved into booking.',
    };
  }
  if (stage === 'COMPLETED' && outcome === 'COMPLETED') {
    return {
      subtype: 'SERVICE_QUOTE_WORK_COMPLETED',
      title: 'Quoted service completed',
      summary: 'The service-quote decision reached completed work.',
    };
  }
  if (stage === 'CLOSED' && ['DECLINED', 'DEFERRED', 'CANCELLED'].includes(outcome)) {
    return {
      subtype: `SERVICE_QUOTE_${outcome}`,
      title: 'Service quote decision closed',
      summary: `The homeowner closed this decision as ${outcome.toLowerCase()}.`,
    };
  }
  return null;
}

export async function advanceServiceQuoteDecision(input: AdvanceServiceQuoteDecisionInput) {
  return database.$transaction(async (tx: any) => {
    const workspace = await tx.quoteComparisonWorkspace.findFirst({
      where: { id: input.workspaceId, propertyId: input.propertyId },
      select: {
        id: true,
        journeyStage: true,
        outcome: true,
        inventoryItemId: true,
        guidanceJourneyId: true,
      },
    });
    if (!workspace) {
      throw new APIError(
        'Service quote decision workspace not found.',
        404,
        'SERVICE_QUOTE_WORKSPACE_NOT_FOUND',
      );
    }

    const fromStage = String(workspace.journeyStage) as ServiceQuoteDecisionStage;
    const nextOutcome = (input.outcome ?? workspace.outcome) as ServiceQuoteDecisionOutcome;
    if (!canTransitionServiceQuoteDecision(fromStage, input.toStage)) {
      throw new APIError(
        `Cannot move a service quote decision from ${fromStage} to ${input.toStage}.`,
        409,
        'SERVICE_QUOTE_INVALID_TRANSITION',
      );
    }
    validateStageOutcome(input.toStage, nextOutcome);

    if (fromStage === input.toStage && workspace.outcome === nextOutcome) {
      return tx.quoteComparisonWorkspace.findUnique({
        where: { id: workspace.id },
        include: {
          transitions: { orderBy: { createdAt: 'asc' } },
          contextLinks: { orderBy: { createdAt: 'asc' } },
        },
      });
    }

    const now = new Date();
    await tx.quoteComparisonWorkspace.update({
      where: { id: workspace.id },
      data: {
        journeyStage: input.toStage,
        outcome: nextOutcome,
        status:
          input.toStage === 'CLOSED'
            ? 'ARCHIVED'
            : nextOutcome === 'ACCEPTED' || nextOutcome === 'BOOKED' || nextOutcome === 'COMPLETED'
              ? 'DECIDED'
              : undefined,
        decisionRecordedAt:
          nextOutcome !== 'OPEN' && workspace.outcome === 'OPEN' ? now : undefined,
        closedAt: input.toStage === 'CLOSED' ? now : undefined,
      },
    });
    await tx.serviceQuoteDecisionTransition.create({
      data: {
        workspaceId: workspace.id,
        fromStage,
        toStage: input.toStage,
        outcome: nextOutcome,
        reason: input.reason?.trim() || null,
        relatedEntityType: input.relatedEntityType ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
        metadataJson: input.metadataJson ?? null,
        actorUserId: input.actorUserId ?? null,
      },
    });
    if (input.relatedEntityType && input.relatedEntityId) {
      await tx.serviceQuoteDecisionContextLink.upsert({
        where: {
          workspaceId_entityType_entityId: {
            workspaceId: workspace.id,
            entityType: input.relatedEntityType,
            entityId: input.relatedEntityId,
          },
        },
        create: {
          workspaceId: workspace.id,
          entityType: input.relatedEntityType,
          entityId: input.relatedEntityId,
        },
        update: { metadataJson: input.metadataJson ?? undefined },
      });
    }

    const timeline = homeTimelineDescriptor(input.toStage, nextOutcome);
    if (timeline) {
      const idempotencyKey = `service-quote-decision:${workspace.id}:${input.toStage}:${nextOutcome}`;
      const existingEvent = await tx.homeEvent.findFirst({
        where: { propertyId: input.propertyId, idempotencyKey },
        select: { id: true },
      });
      if (!existingEvent) {
        await tx.homeEvent.create({
          data: {
            propertyId: input.propertyId,
            createdById: input.actorUserId ?? null,
            inventoryItemId: workspace.inventoryItemId,
            guidanceJourneyId: workspace.guidanceJourneyId,
            type: input.toStage === 'COMPLETED' ? 'MAINTENANCE' : 'MILESTONE',
            subtype: timeline.subtype,
            occurredAt: now,
            title: timeline.title,
            summary: timeline.summary,
            groupKey: `service-quote-decision:${workspace.id}`,
            idempotencyKey,
            sourceBadge: 'USER_REPORTED',
            meta: {
              serviceQuoteDecisionId: workspace.id,
              stage: input.toStage,
              outcome: nextOutcome,
              relatedEntityType: input.relatedEntityType ?? null,
              relatedEntityId: input.relatedEntityId ?? null,
            },
          },
        });
      }
    }

    return tx.quoteComparisonWorkspace.findUnique({
      where: { id: workspace.id },
      include: {
        transitions: { orderBy: { createdAt: 'asc' } },
        contextLinks: { orderBy: { createdAt: 'asc' } },
      },
    });
  });
}

export async function linkServiceQuoteDecisionContext(input: {
  propertyId: string;
  workspaceId: string;
  entityType: ServiceQuoteDecisionEntityType;
  entityId: string;
  label?: string | null;
  metadataJson?: Record<string, unknown> | null;
}) {
  const workspace = await database.quoteComparisonWorkspace.findFirst({
    where: { id: input.workspaceId, propertyId: input.propertyId },
    select: { id: true },
  });
  if (!workspace) {
    throw new APIError('Service quote decision workspace not found.', 404, 'SERVICE_QUOTE_WORKSPACE_NOT_FOUND');
  }
  const propertyScopedModels: Partial<Record<ServiceQuoteDecisionEntityType, string>> = {
    INVENTORY_ITEM: 'inventoryItem',
    DOCUMENT: 'document',
    INCIDENT: 'incident',
    SERVICE_RADAR_CHECK: 'serviceRadarCheck',
    GUIDANCE_JOURNEY: 'guidanceJourney',
    NEGOTIATION_CASE: 'negotiationShieldCase',
    PRICE_FINALIZATION: 'priceFinalization',
    BOOKING: 'booking',
    PROJECT: 'projectRecord',
  };
  const modelName = propertyScopedModels[input.entityType];
  if (modelName) {
    const entity = await database[modelName].findFirst({
      where: { id: input.entityId, propertyId: input.propertyId },
      select: { id: true },
    });
    if (!entity) {
      throw new APIError(
        'The linked decision context does not belong to this property.',
        400,
        'SERVICE_QUOTE_CONTEXT_SCOPE_MISMATCH',
      );
    }
  }
  return database.serviceQuoteDecisionContextLink.upsert({
    where: {
      workspaceId_entityType_entityId: {
        workspaceId: input.workspaceId,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      entityType: input.entityType,
      entityId: input.entityId,
      label: input.label?.trim() || null,
      metadataJson: input.metadataJson ?? null,
    },
    update: {
      label: input.label?.trim() || undefined,
      metadataJson: input.metadataJson ?? undefined,
    },
  });
}
