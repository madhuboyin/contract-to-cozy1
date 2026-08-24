// Home Intelligence Functional Completeness FRD Phase 3 review finding 3:
// "Home Action origin is recorded only when a thread is first created...
// The current action therefore still cannot be durably linked for
// downstream acceptance or attribution." A RecommendationSnapshot only
// ever gets an origin at the moment it's created (createHvacDecisionThread
// / createThread's initial signalReferences write) — a later resume that
// reuses the same snapshot, or that recomputes a new one without an origin
// (Ask-originated, or the caller omits homeActionOrigin), had nowhere to
// record which Home Action was actually open. This is the single, shared
// write every createOrResumeThread implementation calls at the end,
// regardless of whether it created, resumed unchanged, or recomputed —
// see DecisionThreadHomeActionLink's schema comment for the durability
// rationale.

import { prisma } from '../../lib/prisma';
import type { HomeActionOriginRef } from './decisionFamilyAdapter';

export async function recordHomeActionOriginLink(
  decisionThreadId: string,
  homeActionOrigin: HomeActionOriginRef | undefined,
): Promise<void> {
  if (!homeActionOrigin) return;
  // createMany + skipDuplicates, not a bare create: the same idempotency
  // requirement as DecisionThreadExecutionLink's writes — repeatedly
  // opening the same, unchanged Home Action version must not throw P2002.
  await prisma.decisionThreadHomeActionLink.createMany({
    data: [{
      decisionThreadId,
      homeActionId: homeActionOrigin.homeActionId,
      lineageId: homeActionOrigin.lineageId,
      sourceEntityId: homeActionOrigin.sourceEntityId,
      sourceVersion: homeActionOrigin.sourceVersion,
      contextVersion: homeActionOrigin.contextVersion,
    }],
    skipDuplicates: true,
  });
}
