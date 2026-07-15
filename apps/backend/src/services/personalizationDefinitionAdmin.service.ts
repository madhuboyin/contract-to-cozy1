import { prisma } from '../lib/prisma';
import { findPersonalizationDefinition } from '../modules/personalization/catalog/personalizationDefinitions';
import { recordPersonalizationAuditEvent } from './personalizationAudit.service';

export interface PersonalizationDefinitionState {
  code: string;
  status: string;
  pausedAt: Date | null;
  pausedBy: string | null;
  pauseReason: string | null;
}

export async function pausePersonalizationDefinition(
  code: string,
  adminUserId: string,
  reason: string,
): Promise<PersonalizationDefinitionState | null> {
  if (!findPersonalizationDefinition(code)) return null;
  const existing = await prisma.recommendationDefinition.findUnique({ where: { code }, select: { id: true } });
  if (!existing) return null;

  const definition = await prisma.recommendationDefinition.update({
    where: { code },
    data: { pausedAt: new Date(), pausedBy: adminUserId, pauseReason: reason },
    select: { code: true, status: true, pausedAt: true, pausedBy: true, pauseReason: true },
  });
  await recordPersonalizationAuditEvent({
    actorUserId: adminUserId,
    action: 'PERSONALIZATION_DEFINITION_PAUSED',
    entityType: 'RECOMMENDATION_DEFINITION',
    entityId: code,
    reason,
  });
  return definition;
}

export async function resumePersonalizationDefinition(
  code: string,
  adminUserId: string,
): Promise<PersonalizationDefinitionState | null> {
  if (!findPersonalizationDefinition(code)) return null;
  const existing = await prisma.recommendationDefinition.findUnique({ where: { code }, select: { id: true } });
  if (!existing) return null;

  const definition = await prisma.recommendationDefinition.update({
    where: { code },
    data: { pausedAt: null, pausedBy: null, pauseReason: null },
    select: { code: true, status: true, pausedAt: true, pausedBy: true, pauseReason: true },
  });
  await recordPersonalizationAuditEvent({
    actorUserId: adminUserId,
    action: 'PERSONALIZATION_DEFINITION_RESUMED',
    entityType: 'RECOMMENDATION_DEFINITION',
    entityId: code,
  });
  return definition;
}
