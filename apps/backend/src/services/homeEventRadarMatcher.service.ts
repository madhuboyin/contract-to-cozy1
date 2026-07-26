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
  computeRadarImpact,
  type RadarImpactPropertyInput,
} from '../modules/homeEventRadar/domain/radarImpactRules';
import { computeRadarConfidence } from '../modules/homeEventRadar/domain/radarConfidence';
import { computeRadarPriority } from '../modules/homeEventRadar/domain/radarPriority';
import {
  evaluateRadarMatchLifecycle,
  type RadarMaterialRevisionSnapshot,
} from '../modules/homeEventRadar/domain/radarMatchLifecycle';

interface PropertySnapshot extends RadarImpactPropertyInput {
  normalizedZipCode: string | null;
  countyFips: string | null;
  latitude: number | null;
  longitude: number | null;
  geographyVersion: number;
}

const TERMINAL_EVENT_STATUSES = new Set(['resolved', 'expired', 'retracted']);

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

async function findCandidateProperties(
  event: any,
  propertyIdFilter?: string[] | null,
): Promise<PropertySnapshot[]> {
  if (propertyIdFilter && propertyIdFilter.length > 0) {
    return prisma.property.findMany({
      // Durable property scopes include both currently eligible properties and
      // prior matches. Revalidation inside the loop owns the lifecycle result.
      where: { id: { in: propertyIdFilter } },
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

function revisionSnapshot(
  revisionRow: any,
  event: any,
): RadarMaterialRevisionSnapshot | null {
  if (!revisionRow) return null;
  const normalized = revisionRow.normalizedJson
    && typeof revisionRow.normalizedJson === 'object'
    ? revisionRow.normalizedJson as Record<string, any>
    : {};
  return {
    id: String(revisionRow.id),
    lifecycleStatus: String(revisionRow.lifecycleStatus ?? event.status),
    eventType: String(normalized.eventType ?? event.eventType),
    severity: String(normalized.severity ?? event.severity),
    effectiveAt: revisionRow.effectiveAt ?? normalized.effectiveAt ?? event.startAt,
    expiresAt: revisionRow.expiresAt ?? normalized.expiresAt ?? event.endAt,
    title: String(normalized.title ?? event.title),
    summary: normalized.summary ?? event.summary ?? null,
    geography: normalized.geography ?? {
      locationType: event.locationType,
      locationKey: event.locationKey,
      geoJson: event.geoJson ?? null,
    },
  };
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
  const event = await db.radarEvent.findUnique({
    where: { id: eventId },
    include: {
      sourceDefinition: {
        select: {
          isEnabled: true,
          freshnessSeconds: true,
          health: {
            select: {
              status: true,
              lastSuccessAt: true,
              dataFreshThrough: true,
            },
          },
        },
      },
      sourceRun: {
        select: {
          status: true,
          finishedAt: true,
          dataFreshThrough: true,
        },
      },
    },
  });
  if (!event || event.status === 'archived') {
    return { matched: 0, skipped: 0, failedPropertyIds: [] };
  }

  const currentRevisionRow = revision?.radarEventRevisionId
    ? await db.radarEventRevision.findFirst({
        where: {
          id: revision.radarEventRevisionId,
          radarEventId: eventId,
        },
      })
    : await db.radarEventRevision.findFirst({
        where: { radarEventId: eventId },
        orderBy: [
          { observedAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
      });
  const currentRevision = revisionSnapshot(currentRevisionRow, event);
  const revisionCache = new Map<string, RadarMaterialRevisionSnapshot | null>();
  if (currentRevision) revisionCache.set(currentRevision.id, currentRevision);
  const properties = await findCandidateProperties(event, propertyIdFilter);
  let matched = 0;
  let skipped = 0;
  const failedPropertyIds: string[] = [];

  for (const property of properties) {
    try {
      const evaluatedAt = new Date();
      const existingMatch = await db.propertyRadarMatch.findUnique({
        where: {
          propertyId_radarEventId: {
            propertyId: property.id,
            radarEventId: eventId,
          },
        },
      });
      let previousRevision: RadarMaterialRevisionSnapshot | null = null;
      const previousRevisionId = existingMatch?.lastEventRevisionId;
      if (previousRevisionId) {
        if (revisionCache.has(previousRevisionId)) {
          previousRevision = revisionCache.get(previousRevisionId) ?? null;
        } else {
          const previousRevisionRow = await db.radarEventRevision.findFirst({
            where: {
              id: previousRevisionId,
              radarEventId: eventId,
            },
          });
          previousRevision = revisionSnapshot(previousRevisionRow, event);
          revisionCache.set(previousRevisionId, previousRevision);
        }
      }
      // Terminal revisions revisit only prior matches. Preserve those matches
      // in Recently Ended even when a withdrawal omits or changes geography.
      let geographicallyApplicable: boolean;
      if (
        existingMatch
        && TERMINAL_EVENT_STATUSES.has(String(event.status))
      ) {
        geographicallyApplicable = true;
      } else {
        geographicallyApplicable = await radarEventMatchesPropertyId(
          event,
          property.id,
        );
      }
      const lifecycle = evaluateRadarMatchLifecycle(
        {
          event,
          geographicallyApplicable,
          existing: {
            exists: Boolean(existingMatch),
            lastEventRevisionId: existingMatch?.lastEventRevisionId,
            isMaterialUpdate: existingMatch?.isMaterialUpdate,
            materialUpdatedAt: existingMatch?.materialUpdatedAt,
            visibleFrom: existingMatch?.visibleFrom,
          },
          currentRevision,
          previousRevision,
        },
        evaluatedAt,
      );

      if (!geographicallyApplicable) {
        if (!existingMatch) continue;
        const inactiveMatch = await db.propertyRadarMatch.update({
          where: { id: existingMatch.id },
          data: {
            lifecycleStatus: lifecycle.status,
            lifecycleReason: lifecycle.reasonCode,
            lifecycleVersion: lifecycle.version,
            sourceFreshnessStatus: lifecycle.sourceFreshnessStatus,
            sourceFreshnessReason: lifecycle.sourceFreshnessReason,
            isMaterialUpdate: lifecycle.isMaterialUpdate,
            materialUpdatedAt: lifecycle.materialUpdatedAt,
            lastEventRevisionId: currentRevision?.id ?? previousRevisionId ?? null,
            noLongerApplicableAt: lifecycle.noLongerApplicableAt,
            lastEvaluatedAt: evaluatedAt,
            isVisible: false,
            visibleFrom: lifecycle.visibleFrom,
            visibleUntil: lifecycle.visibleUntil,
          },
        });
        await radarIncidentPromotionService.project({
          propertyId: property.id,
          event,
          match: {
            ...inactiveMatch,
            lifecycleStatus: 'no_longer_applicable',
          },
          revision,
        });
        const priority = computeRadarPriority(
          {
            severity: event.severity,
            impactLevel: inactiveMatch.impactLevel,
            confidence: inactiveMatch.confidence,
            effectiveAt: event.startAt,
            expiresAt: event.endAt,
            lifecycleStatus: event.status,
            isMaterialUpdate: lifecycle.isMaterialUpdate,
            materiallyUpdatedAt: lifecycle.materialUpdatedAt,
            hasActiveIncident: false,
            userState: 'new',
          },
          evaluatedAt,
        );
        await db.propertyRadarMatch.update({
          where: { id: inactiveMatch.id },
          data: {
            priorityBand: priority.band,
            priorityScore: priority.score.toFixed(3),
            priorityDiagnosticsJson: priority,
            priorityVersion: priority.version,
            priorityEvaluatedAt: evaluatedAt,
          },
        });
        continue;
      }

      if (TERMINAL_EVENT_STATUSES.has(String(event.status))) {
        if (!existingMatch) continue;
        const endedMatch = await db.propertyRadarMatch.update({
          where: { id: existingMatch.id },
          data: {
            lifecycleStatus: lifecycle.status,
            lifecycleReason: lifecycle.reasonCode,
            lifecycleVersion: lifecycle.version,
            sourceFreshnessStatus: lifecycle.sourceFreshnessStatus,
            sourceFreshnessReason: lifecycle.sourceFreshnessReason,
            isMaterialUpdate: lifecycle.isMaterialUpdate,
            materialUpdatedAt: lifecycle.materialUpdatedAt,
            lastEventRevisionId: currentRevision?.id ?? previousRevisionId ?? null,
            noLongerApplicableAt: null,
            lastEvaluatedAt: evaluatedAt,
            isVisible: lifecycle.isVisible,
            visibleFrom: lifecycle.visibleFrom,
            visibleUntil: lifecycle.visibleUntil,
          },
        });
        await radarIncidentPromotionService.project({
          propertyId: property.id,
          event,
          match: {
            ...endedMatch,
            lifecycleStatus: lifecycle.status,
          },
          revision,
        });
        const priority = computeRadarPriority(
          {
            severity: event.severity,
            impactLevel: endedMatch.impactLevel,
            confidence: endedMatch.confidence,
            effectiveAt: event.startAt,
            expiresAt: event.endAt,
            lifecycleStatus: event.status,
            isMaterialUpdate: lifecycle.isMaterialUpdate,
            materiallyUpdatedAt: lifecycle.materialUpdatedAt,
            hasActiveIncident: false,
            userState: 'new',
          },
          evaluatedAt,
        );
        await db.propertyRadarMatch.update({
          where: { id: endedMatch.id },
          data: {
            priorityBand: priority.band,
            priorityScore: priority.score.toFixed(3),
            priorityDiagnosticsJson: priority,
            priorityVersion: priority.version,
            priorityEvaluatedAt: evaluatedAt,
          },
        });
        matched++;
        continue;
      }

      const impact = computeRadarImpact(event, property, evaluatedAt);
      const confidence = computeRadarConfidence(
        event,
        impact.impactFactorsJson,
        evaluatedAt,
      );
      const geographicExplanation = explainRadarGeographicMatch(
        event,
        property,
        evaluatedAt,
      );
      const matcherVersion = [
        geographicExplanation.matcherVersion,
        impact.ruleVersion,
        confidence.version,
      ].join('+');
      const matchExplanation = {
        ...geographicExplanation,
        matcherVersion,
        confidence: confidence.band,
        confidenceVersion: confidence.version,
        confidenceScore: confidence.score,
        confidenceComponents: confidence.components,
        missingFactReasons: confidence.missingFactReasons,
        homeownerExplanation: confidence.homeownerExplanation,
        lifecycle: {
          version: lifecycle.version,
          status: lifecycle.status,
          reasonCode: lifecycle.reasonCode,
          sourceFreshnessStatus: lifecycle.sourceFreshnessStatus,
          sourceFreshnessReason: lifecycle.sourceFreshnessReason,
          isMaterialUpdate: lifecycle.isMaterialUpdate,
          materialReasonCodes: lifecycle.materialReasonCodes,
        },
      };

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
          confidence: confidence.band,
          confidenceScore: confidence.score.toFixed(4),
          lifecycleStatus: lifecycle.status,
          lifecycleReason: lifecycle.reasonCode,
          lifecycleVersion: lifecycle.version,
          sourceFreshnessStatus: lifecycle.sourceFreshnessStatus,
          sourceFreshnessReason: lifecycle.sourceFreshnessReason,
          isMaterialUpdate: lifecycle.isMaterialUpdate,
          materialUpdatedAt: lifecycle.materialUpdatedAt,
          lastEventRevisionId: currentRevision?.id ?? null,
          noLongerApplicableAt: null,
          matchExplanationJson: matchExplanation,
          matcherVersion,
          propertyGeographyVersion: property.geographyVersion,
          lastEvaluatedAt: evaluatedAt,
          isVisible: lifecycle.isVisible,
          visibleFrom: lifecycle.visibleFrom,
          visibleUntil: lifecycle.visibleUntil,
        },
        update: {
          matchScore: impact.matchScore.toFixed(4),
          impactLevel: impact.impactLevel,
          impactSummary: impact.impactSummary,
          impactFactorsJson: impact.impactFactorsJson,
          recommendedActionsJson: impact.recommendedActionsJson,
          matchedSystemsJson: impact.matchedSystemsJson,
          confidence: confidence.band,
          confidenceScore: confidence.score.toFixed(4),
          lifecycleStatus: lifecycle.status,
          lifecycleReason: lifecycle.reasonCode,
          lifecycleVersion: lifecycle.version,
          sourceFreshnessStatus: lifecycle.sourceFreshnessStatus,
          sourceFreshnessReason: lifecycle.sourceFreshnessReason,
          isMaterialUpdate: lifecycle.isMaterialUpdate,
          materialUpdatedAt: lifecycle.materialUpdatedAt,
          lastEventRevisionId: currentRevision?.id ?? previousRevisionId ?? null,
          noLongerApplicableAt: null,
          matchExplanationJson: matchExplanation,
          matcherVersion,
          propertyGeographyVersion: property.geographyVersion,
          lastEvaluatedAt: evaluatedAt,
          isVisible: lifecycle.isVisible,
          visibleFrom: lifecycle.visibleFrom,
          visibleUntil: lifecycle.visibleUntil,
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
          confidence: confidence.band,
          confidenceVersion: confidence.version,
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

      const incidentProjection = await radarIncidentPromotionService.project({
        propertyId: property.id,
        event,
        match: {
          ...match,
          impactLevel: impact.impactLevel,
          impactSummary: impact.impactSummary,
          matchScore: impact.matchScore,
          impactFactorsJson: impact.impactFactorsJson,
          confidence: confidence.band,
          confidenceScore: confidence.score,
          lifecycleStatus: lifecycle.status,
          matcherVersion,
          matchExplanationJson: matchExplanation,
        },
        revision,
      });
      const hasActiveIncident =
        incidentProjection.outcome === 'created'
        || incidentProjection.outcome === 'updated';
      const priority = computeRadarPriority(
        {
          severity: event.severity,
          impactLevel: impact.impactLevel,
          confidence: confidence.band,
          effectiveAt: event.startAt,
          expiresAt: event.endAt,
          lifecycleStatus: event.status,
          isMaterialUpdate: lifecycle.isMaterialUpdate,
          materiallyUpdatedAt: lifecycle.materialUpdatedAt,
          hasActiveIncident,
          userState: 'new',
        },
        evaluatedAt,
      );
      await db.propertyRadarMatch.update({
        where: { id: match.id },
        data: {
          priorityBand: priority.band,
          priorityScore: priority.score.toFixed(3),
          priorityDiagnosticsJson: priority,
          priorityVersion: priority.version,
          priorityEvaluatedAt: evaluatedAt,
        },
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
