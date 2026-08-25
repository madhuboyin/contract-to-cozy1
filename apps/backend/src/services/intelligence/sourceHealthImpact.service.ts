import { prisma } from '../../lib/prisma';
import { emitPropertyChange } from '../../propertyChanges/propertyChange.service';
import type { PropertyChangeSourceHealth } from '../../propertyChanges/propertyChange.contracts';

export type SourceImpactPolicy = 'CURRENT' | 'DEGRADED' | 'STALE' | 'UNAVAILABLE' | 'NOT_CONFIGURED';

export function sourceHealthConfidenceMultiplier(status: SourceImpactPolicy): number {
  if (status === 'CURRENT') return 1;
  if (status === 'DEGRADED') return 0.7;
  if (status === 'STALE') return 0.4;
  return 0;
}

export async function emitSourceHealthChangesForProperties(input: {
  propertyIds: readonly string[];
  sourceType: string;
  sourceEntityId: string;
  sourceRevision: string;
  health: PropertyChangeSourceHealth;
}): Promise<void> {
  for (const propertyId of [...new Set(input.propertyIds)]) {
    await emitPropertyChange({
      propertyId,
      sourceType: input.sourceType,
      sourceEntityId: input.sourceEntityId,
      sourceRevision: input.sourceRevision,
      changeType: 'SOURCE_HEALTH_CHANGED',
      changedFactKeys: [],
      canonicalReferences: [{ entityType: input.sourceType, entityId: input.sourceEntityId, fieldPath: 'health.status' }],
      sourceHealth: input.health,
      confidence: sourceHealthConfidenceMultiplier(input.health),
      signals: {
        homeownerRelevant: true,
        lifecycleAdvanced: false,
        propertyEffectConfirmed: false,
        urgentSafetyCondition: false,
        canonicalActionPriority: null,
      },
    });
  }
}

export async function affectedRadarPropertyIds(sourceDefinitionId: string): Promise<string[]> {
  const rows = await prisma.propertyRadarCoverage.findMany({ where: { sourceDefinitionId }, select: { propertyId: true } });
  return rows.map((row) => row.propertyId);
}

export async function affectedPropertyIntelligencePropertyIds(sourceId: string): Promise<string[]> {
  const rows = await prisma.propertyObservationMatch.findMany({
    where: { observation: { sourceId } },
    select: { propertyId: true },
    distinct: ['propertyId'],
  });
  return rows.map((row) => row.propertyId);
}

export async function allPropertyIds(): Promise<string[]> {
  return (await prisma.property.findMany({ select: { id: true } })).map((row) => row.id);
}
