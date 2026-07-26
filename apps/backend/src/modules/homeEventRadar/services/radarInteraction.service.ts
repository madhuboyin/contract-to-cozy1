import { prisma } from '../../../config/database';
import { APIError } from '../../../middleware/error.middleware';
import {
  requestRadarPropertyReconciliation,
} from './radarPropertyReconciliation.service';
import type {
  RadarFeedbackType,
  RadarMutableInteractionState,
} from '../domain/radarInteraction';

type InteractionDependencies = {
  db?: any;
  now?: () => Date;
};

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function serializeState(state: any): Record<string, unknown> {
  return {
    id: String(state.id),
    propertyRadarMatchId: String(state.propertyRadarMatchId),
    state: state.state,
    createdAt: iso(state.createdAt),
    updatedAt: iso(state.updatedAt),
  };
}

export function serializeRadarFeedback(feedback: any | null | undefined): Record<string, unknown> | null {
  if (!feedback) return null;
  return {
    feedbackType: feedback.feedbackType,
    comment: feedback.note ?? null,
    createdAt: iso(feedback.createdAt),
    updatedAt: iso(feedback.updatedAt),
  };
}

export class RadarInteractionService {
  private readonly db: any;
  private readonly clock: () => Date;

  constructor(dependencies: InteractionDependencies = {}) {
    this.db = dependencies.db ?? prisma;
    this.clock = dependencies.now ?? (() => new Date());
  }

  private async requireMatch(propertyId: string, matchId: string): Promise<void> {
    const match = await this.db.propertyRadarMatch.findFirst({
      where: { id: matchId, propertyId },
      select: { id: true },
    });
    if (!match) throw new APIError('Radar match not found', 404, 'RADAR_MATCH_NOT_FOUND');
  }

  async updateState(
    propertyId: string,
    matchId: string,
    userId: string,
    state: RadarMutableInteractionState,
  ): Promise<Record<string, unknown>> {
    await this.requireMatch(propertyId, matchId);
    const previous = await this.db.propertyRadarState.findUnique({
      where: {
        propertyRadarMatchId_userId: {
          propertyRadarMatchId: matchId,
          userId,
        },
      },
    });
    if (previous?.state === state) return serializeState(previous);

    const changedAt = this.clock();
    const actionType = previous?.state === 'dismissed' && state === 'seen'
      ? 'restore_event'
      : ({
          saved: 'save_event',
          dismissed: 'dismiss_event',
          acted_on: 'mark_checked',
          seen: 'open_event',
        } as const)[state];
    const mitigationChanged = state === 'acted_on' || previous?.state === 'acted_on';

    const updated = await this.db.$transaction(async (tx: any) => {
      const nextState = await tx.propertyRadarState.upsert({
        where: {
          propertyRadarMatchId_userId: {
            propertyRadarMatchId: matchId,
            userId,
          },
        },
        create: {
          propertyRadarMatchId: matchId,
          userId,
          state,
          stateMetaJson: null,
        },
        update: {
          state,
          stateMetaJson: null,
        },
      });
      if (actionType) {
        await tx.propertyRadarAction.create({
          data: {
            propertyRadarMatchId: matchId,
            actionType,
            actionMetaJson: {
              actorUserId: userId,
              fromState: previous?.state ?? 'new',
              toState: state,
            },
          },
        });
      }
      if (mitigationChanged) {
        await requestRadarPropertyReconciliation(
          {
            propertyId,
            reasons: ['mitigation_changed'],
            changeToken: changedAt.toISOString(),
            correlationId:
              `radar-state:${matchId}:${userId}:${changedAt.toISOString()}`,
          },
          tx,
          changedAt,
        );
      }
      return nextState;
    });

    return serializeState(updated);
  }

  async submitFeedback(
    propertyId: string,
    matchId: string,
    userId: string,
    feedbackType: RadarFeedbackType,
    comment: string | null,
  ): Promise<Record<string, unknown>> {
    await this.requireMatch(propertyId, matchId);
    const feedback = await this.db.propertyRadarFeedback.upsert({
      where: {
        propertyRadarMatchId_userId: {
          propertyRadarMatchId: matchId,
          userId,
        },
      },
      create: {
        propertyRadarMatchId: matchId,
        userId,
        feedbackType,
        note: comment,
        metadataJson: null,
      },
      update: {
        feedbackType,
        note: comment,
        metadataJson: null,
      },
    });
    return serializeRadarFeedback(feedback) as Record<string, unknown>;
  }
}

export const radarInteractionService = new RadarInteractionService();
