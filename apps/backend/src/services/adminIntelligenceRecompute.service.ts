// apps/backend/src/services/adminIntelligenceRecompute.service.ts
//
// Home Intelligence Functional Completeness FRD §15 Phase 2 work item 7 —
// "add admin manual full refresh and failed-target retry." Thin wrappers
// over intelligenceRecompute.service.ts's already-built pipeline
// (requestRecompute/requestTargetRetry/getPropertyRefreshState); this file
// adds only the admin-specific lookups (does the property exist, does the
// target exist and belong to the given run) those functions don't do
// themselves.

import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import {
  requestRecompute,
  requestTargetRetry,
  getPropertyRefreshDetails,
} from './intelligenceRecompute/intelligenceRecompute.service';

export class AdminIntelligenceRecomputeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AdminIntelligenceRecomputeError';
  }
}

export async function triggerManualRefresh(propertyId: string) {
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
  if (!property) {
    throw new AdminIntelligenceRecomputeError('PROPERTY_NOT_FOUND', `No property with id "${propertyId}".`);
  }
  // HI-REC-003: MANUAL_REFRESH executes every applicable consumer
  // (resolveApplicableConsumers), so triggerEntityType/triggerEntityId
  // don't gate consumer selection here — 'Property'/propertyId is simply a
  // stable, real identity for this trigger's idempotency key.
  // requestedContextVersion must be set to something unique per call:
  // computeRecomputeIdempotencyKey falls back to a constant 'v0' when it's
  // omitted, and DomainEventsService.emit returns the FIRST-ever matching
  // DomainEvent for a duplicate idempotencyKey — without this, every manual
  // refresh after the very first one for a property would silently return
  // that original event instead of starting a new run. Unlike a real
  // PropertyChange (which has a durable sourceRevision), a manual refresh
  // has no natural revision, so each call mints its own — randomUUID(), not
  // a timestamp: two admin clicks landing in the same millisecond would
  // otherwise still collide (caught by this file's own test).
  const event = await requestRecompute({
    propertyId,
    triggerType: 'MANUAL_REFRESH',
    triggerEntityType: 'Property',
    triggerEntityId: propertyId,
    changedFactKeys: [],
    requestedContextVersion: randomUUID(),
  });
  return { requested: true, eventId: event.id };
}

export async function retryFailedTarget(recomputeRunId: string, targetId: string) {
  const target = await prisma.intelligenceRecomputeTarget.findUnique({ where: { id: targetId } });
  if (!target || target.recomputeRunId !== recomputeRunId) {
    throw new AdminIntelligenceRecomputeError('TARGET_NOT_FOUND', `No recompute target "${targetId}" on run "${recomputeRunId}".`);
  }
  if (target.status !== 'FAILED') {
    throw new AdminIntelligenceRecomputeError('TARGET_NOT_FAILED', `Target "${targetId}" is "${target.status}", not FAILED — nothing to retry.`);
  }
  const event = await requestTargetRetry({
    recomputeRunId,
    targetId,
    attempts: target.attempts,
    requestId: randomUUID(),
  });
  return { requested: true, eventId: event.id };
}

export async function getAdminPropertyRefreshState(propertyId: string) {
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
  if (!property) {
    throw new AdminIntelligenceRecomputeError('PROPERTY_NOT_FOUND', `No property with id "${propertyId}".`);
  }
  const refresh = await getPropertyRefreshDetails(prisma, propertyId);
  const recentRuns = await prisma.intelligenceRecomputeRun.findMany({
    where: { propertyId },
    orderBy: { requestedAt: 'desc' },
    take: 10,
    include: { targets: true },
  });
  return { propertyId, ...refresh, recentRuns };
}
