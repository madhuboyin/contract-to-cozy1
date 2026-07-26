// Database orchestration for deterministic Home Event Radar matching.
// Geographic and impact computations live in pure domain modules.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { buildUnifiedEventEnvelope } from './eventSignalProjection.service';
import { signalService } from './signal.service';
import {
  explainRadarGeographicMatch,
  propertyWhereForRadarEvent,
  radarEventMatchesPropertyId,
} from '../modules/homeEventRadar/services/radarMatchDiscovery.service';
import { radarIncidentPromotionService } from '../modules/homeEventRadar/services/radarIncidentPromotion.service';
import {
  radarMatchVisibleFrom,
  radarMatchVisibleUntil,
} from '../modules/homeEventRadar/domain/radarVisibility';
import {
  computeRadarImpact,
  type RadarImpactPropertyInput,
} from '../modules/homeEventRadar/domain/radarImpactRules';

interface PropertySnapshot extends RadarImpactPropertyInput {
  normalizedZipCode: string | null;
  countyFips: string | null;
  latitude: number | null;
  longitude: number | null;
  geographyVersion: number;
}

const PROPERTY_FIELDS_SELECT = {
  id: true,
  yearBuilt: true,
  roofType: true,
  roofReplacementYear: true,
  heatingType: true,
  coolingType: true,
  hvacInstallYear: true,
  waterHeaterType: true,
  waterHeaterInstallYear: true,
  hasIrrigation: true,
  hasDrainageIssues: true,
  hasSumpPump: true,
  hasSumpPumpBackup: true,
  primaryHeatingFuel: true,
  hasSecondaryHeat: true,
  foundationType: true,
  propertySize: true,
  dwellingType: true,
  zipCode: true,
  normalizedZipCode: true,
  city: true,
  state: true,
  countyFips: true,
  latitude: true,
  longitude: true,
  geographyVersion: true,
  responsibilities: {
    select: {
      scope: true,
      party: true,
    },
  },
} as const;

async function findMatchingProperties(
  event: any,
  propertyIdFilter?: string[] | null,
): Promise<PropertySnapshot[]> {
  if (propertyIdFilter && propertyIdFilter.length > 0) {
    const eligibility = await Promise.all(
      propertyIdFilter.map(async (propertyId) => ({
        propertyId,
        matches: await radarEventMatchesPropertyId(event, propertyId),
      })),
    );
    const eligiblePropertyIds = eligibility
      .filter((candidate) => candidate.matches)
      .map((candidate) => candidate.propertyId);
    if (eligiblePropertyIds.length === 0) return [];
    return prisma.property.findMany({
      where: { id: { in: eligiblePropertyIds } },
      select: PROPERTY_FIELDS_SELECT,
    }) as unknown as Promise<PropertySnapshot[]>;
  }

  const where = propertyWhereForRadarEvent(event);
  if (!where) return [];
  return prisma.property.findMany({
    where,
    select: PROPERTY_FIELDS_SELECT,
  }) as unknown as Promise<PropertySnapshot[]>;
}

/**
 * Revalidates geography, computes pure impact rules, and persists/projections
 * each independently retryable property scope.
 */
export async function runMatchingForEvent(
  eventId: string,
  propertyIdFilter?: string[] | null,
  revision?: {
    radarEventRevisionId?: string | null;
    revisionIdentity?: string | null;
    sourceRunId?: string | null;
    sourceDefinitionId?: string | null;
    correlationId?: string | null;
  },
): Promise<{ matched: number; skipped: number; failedPropertyIds: string[] }> {
  const db = prisma as any;
  const event = await db.radarEvent.findUnique({ where: { id: eventId } });
  if (!event || event.status === 'archived') {
    return { matched: 0, skipped: 0, failedPropertyIds: [] };
  }

  const properties = await findMatchingProperties(event, propertyIdFilter);
  let matched = 0;
  let skipped = 0;
  const failedPropertyIds: string[] = [];

  for (const property of properties) {
    try {
      const evaluatedAt = new Date();
      const impact = computeRadarImpact(event, property, evaluatedAt);
      const visibleFrom = radarMatchVisibleFrom(event);
      const visibleUntil = radarMatchVisibleUntil(event);
      const matchExplanation = explainRadarGeographicMatch(event, property, evaluatedAt);
      const matcherVersion = `${matchExplanation.matcherVersion}+${impact.ruleVersion}`;

      const match = await db.propertyRadarMatch.upsert({
        where: {
          propertyId_radarEventId: {
            propertyId: property.id,
            radarEventId: eventId,
          },
        },
        create: {
          propertyId: property.id,
          radarEventId: eventId,
          matchScore: impact.matchScore.toFixed(4),
          impactLevel: impact.impactLevel,
          impactSummary: impact.impactSummary,
          impactFactorsJson: impact.impactFactorsJson,
          recommendedActionsJson: impact.recommendedActionsJson,
          matchedSystemsJson: impact.matchedSystemsJson,
          matchExplanationJson: matchExplanation,
          matcherVersion,
          propertyGeographyVersion: property.geographyVersion,
          lastEvaluatedAt: evaluatedAt,
          isVisible: true,
          visibleFrom,
          visibleUntil,
        },
        update: {
          matchScore: impact.matchScore.toFixed(4),
          impactLevel: impact.impactLevel,
          impactSummary: impact.impactSummary,
          impactFactorsJson: impact.impactFactorsJson,
          recommendedActionsJson: impact.recommendedActionsJson,
          matchedSystemsJson: impact.matchedSystemsJson,
          matchExplanationJson: matchExplanation,
          matcherVersion,
          propertyGeographyVersion: property.geographyVersion,
          lastEvaluatedAt: evaluatedAt,
          isVisible: true,
          visibleFrom,
          visibleUntil,
        },
      });

      const envelope = buildUnifiedEventEnvelope({
        eventType: event.eventType,
        propertyId: property.id,
        sourceModel: 'RadarEvent',
        sourceId: eventId,
        occurredAt: event.startAt,
        payloadJson: {
          eventType: event.eventType,
          eventSubType: event.eventSubType ?? null,
          severity: event.severity,
          impactLevel: impact.impactLevel,
          impactSummary: impact.impactSummary,
          impactRuleVersion: impact.ruleVersion,
        },
      });

      await signalService.publishRadarEventSignals({
        propertyId: property.id,
        radarEventId: eventId,
        eventType: envelope.eventType.toLowerCase(),
        severity: String(event.severity),
        impactLevel: String(impact.impactLevel),
        capturedAt: envelope.occurredAt,
        validUntil: event.endAt ?? null,
      });

      await radarIncidentPromotionService.project({
        propertyId: property.id,
        event,
        match: {
          ...match,
          impactLevel: impact.impactLevel,
          impactSummary: impact.impactSummary,
          matchScore: impact.matchScore,
          impactFactorsJson: impact.impactFactorsJson,
        },
        revision,
      });
      matched++;
    } catch (err) {
      logger.error(
        { propertyId: property.id, err },
        '[RadarMatcher] Failed to upsert match for property',
      );
      skipped++;
      failedPropertyIds.push(property.id);
    }
  }

  return { matched, skipped, failedPropertyIds };
}
