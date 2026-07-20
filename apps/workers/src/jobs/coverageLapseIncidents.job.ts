// apps/workers/src/jobs/coverageLapseIncidents.job.ts
import { prisma } from '../lib/prisma';
import { IncidentStatus } from '@prisma/client';
import { IncidentService } from '../../../backend/src/services/incidents/incident.service';
import { guidanceJourneyService } from '../../../backend/src/services/guidanceEngine/guidanceJourney.service';
import { logger } from '../lib/logger';

function daysBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

const OPEN_COVERAGE_LAPSE_STATUSES: IncidentStatus[] = [
  IncidentStatus.DETECTED,
  IncidentStatus.EVALUATED,
  IncidentStatus.ACTIVE,
  IncidentStatus.ACTIONED,
  IncidentStatus.MITIGATED,
];

/**
 * WKR (risk/weather/coverage W3 fix): the creation query above only looks
 * at policies whose expiryDate is still inside the lookahead window — once
 * an unresolved incident's triggering policy ages out of that window,
 * `upsertIncident` is never called for its fingerprint again, so
 * IncidentOrchestrator's inline auto-resolve (which only runs from inside
 * upsertIncident) never re-fires either. The incident stayed open forever
 * even after the homeowner renewed coverage. This resolves any open
 * COVERAGE_LAPSE incident whose property now has a policy (the original,
 * renewed in place, or a replacement) covering the date right after the
 * original gap — independent of the creation query's window.
 */
async function resolveCoveredLapseIncidents(now: Date): Promise<number> {
  const openIncidents = await prisma.incident.findMany({
    where: {
      sourceType: 'COVERAGE',
      typeKey: 'COVERAGE_LAPSE',
      isSuppressed: false,
      status: { in: OPEN_COVERAGE_LAPSE_STATUSES },
    },
    select: { id: true, propertyId: true, details: true },
  });

  let resolved = 0;
  for (const incident of openIncidents) {
    const details = (incident.details as Record<string, unknown> | null) ?? {};
    const expiryDateRaw = typeof details.expiryDate === 'string' ? details.expiryDate : null;
    if (!expiryDateRaw) continue;
    const expiryDate = new Date(expiryDateRaw);
    if (Number.isNaN(expiryDate.getTime())) continue;

    const coveringPolicy = await prisma.insurancePolicy.findFirst({
      where: {
        propertyId: incident.propertyId,
        startDate: { lte: expiryDate },
        expiryDate: { gt: expiryDate },
      },
      select: { id: true },
    });
    if (!coveringPolicy) continue;

    // Route through IncidentService.setStatus (not a raw prisma update) so its
    // RESOLVED-transition hook archives the linked guidance journey/signal too.
    await IncidentService.setStatus(incident.id, IncidentStatus.RESOLVED);
    resolved++;
  }
  return resolved;
}

/**
 * Create COVERAGE_LAPSE incidents when policy expiryDate is within N days.
 * Uses IncidentService (not prisma.incident) to avoid schema mismatch in workers.
 */
export async function coverageLapseIncidentsJob() {
  const LOOKAHEAD_DAYS = 14;
  const now = new Date();
  const lookahead = new Date(now.getTime() + LOOKAHEAD_DAYS * 86400000);

  const policies = await prisma.insurancePolicy.findMany({
    where: {
      startDate: { lte: now },
      expiryDate: { gte: now, lte: lookahead },
      propertyId: { not: null },
    },
    include: { property: true },
    take: 2000,
  });

  let createdOrUpdated = 0;

  for (const p of policies) {
    if (!p.propertyId) continue;

    const replacementPolicy = await prisma.insurancePolicy.findFirst({
      where: {
        propertyId: p.propertyId,
        id: { not: p.id },
        startDate: { lte: p.expiryDate },
        expiryDate: { gt: p.expiryDate },
      },
      select: { id: true },
    });
    if (replacementPolicy) continue;

    const days = daysBetween(now, p.expiryDate);
    const score = days <= 3 ? 75 : days <= 7 ? 60 : 40;

    await IncidentService.upsertIncident(
      {
        propertyId: p.propertyId,
        userId: null,
        sourceType: 'COVERAGE',
        typeKey: 'COVERAGE_LAPSE',
        category: 'INSURANCE',
        title: 'Coverage Expiring Soon',
        summary: `Your policy expires in ${days} days.`,
        details: {
          insurancePolicyId: p.id,
          carrierName: p.carrierName,
          policyNumber: p.policyNumber,
          expiryDate: p.expiryDate.toISOString(),
          daysToExpiry: days,
        },
        status: 'DETECTED',
        fingerprint: `property:${p.propertyId}|COVERAGE_LAPSE|policy:${p.id}|exp:${p.expiryDate.toISOString().slice(0, 10)}`,
        dedupeWindowMins: 24 * 60,
        severityScore: score,
      },
      [
        {
          signalType: 'INSURANCE_POLICY_EXPIRY',
          externalRef: `insurancePolicy:${p.id}`,
          observedAt: now.toISOString(),
          payload: {
            insurancePolicyId: p.id,
            expiryDate: p.expiryDate.toISOString(),
            daysToExpiry: days,
          },
          scoreHint: score,
          confidence: 85,
        },
      ]
    );

    try {
      await guidanceJourneyService.ingestSignal({
        propertyId: p.propertyId,
        signalIntentFamily: 'coverage_gap',
        issueDomain: 'INSURANCE',
        decisionStage: 'AWARENESS',
        executionReadiness: days <= 7 ? 'NEEDS_CONTEXT' : 'NOT_READY',
        severity: days <= 3 ? 'HIGH' : days <= 7 ? 'MEDIUM' : 'LOW',
        severityScore: score,
        confidenceScore: 0.85,
        sourceType: 'COVERAGE',
        sourceFeatureKey: 'coverage-lapse-incidents',
        sourceEntityType: 'INSURANCE_POLICY',
        sourceEntityId: p.id,
        sourceProvenanceId: `property:${p.propertyId}|COVERAGE_LAPSE|policy:${p.id}`,
        payloadJson: {
          insurancePolicyId: p.id,
          carrierName: p.carrierName,
          expiryDate: p.expiryDate.toISOString(),
          daysToExpiry: days,
        },
      });
    } catch (guidanceError) {
      logger.warn({ err: guidanceError }, '[GUIDANCE] coverage lapse signal ingest failed');
    }

    createdOrUpdated++;
  }

  const resolved = await resolveCoveredLapseIncidents(now);

  return { createdOrUpdated, resolved };
}
