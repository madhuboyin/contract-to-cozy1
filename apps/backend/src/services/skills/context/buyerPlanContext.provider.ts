import { createHash } from 'node:crypto';
import { HomeBuyerTaskService } from '../../HomeBuyerTask.service';
import type { SkillContextProviderDefinition } from './skillContext.contract';
import { BUYER_PLAN_CONTEXT_PROVIDER, type BuyerPlanContext } from './buyerPlanContext.contract';

const definition: SkillContextProviderDefinition<BuyerPlanContext> = {
  ...BUYER_PLAN_CONTEXT_PROVIDER,
  canonicalOwner: 'HomeBuyerTaskService',
  description: 'Canonical, permission-scoped Buyer Plan status, progress, blockers, and exact next task for pre-close Ask guidance.',
  minimumRole: 'VIEWER',
  sensitivity: 'STANDARD',
  defaultTimeoutMs: 2_000,
  maxSerializedBytes: 24_000,
  supportedOperations: ['HOME_ACTIONS'],
  async load({ userId, propertyId }) {
    const presentation = await HomeBuyerTaskService.getClosingHomePresentation(userId, propertyId);
    const contextVersion = createHash('sha256')
      .update(JSON.stringify(presentation))
      .digest('hex');
    const overview = presentation.overview;
    const entityCount = overview
      ? 1 + (overview.nextAction ? 1 : 0) + overview.blockers.length + overview.milestones.length
      : 1;

    return {
      status: 'AVAILABLE',
      data: {
        propertyId,
        presentationMode: presentation.presentationMode,
        overview,
        contextVersion,
      },
      observedAt: null,
      sourceVersion: contextVersion,
      entityCount,
      factCount: overview ? 12 + overview.blockers.length + overview.milestones.length : 1,
    };
  },
};

export const buyerPlanContextProvider = Object.freeze(definition);
