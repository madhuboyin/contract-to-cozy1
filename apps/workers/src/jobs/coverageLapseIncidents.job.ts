// apps/workers/src/jobs/coverageLapseIncidents.job.ts
import { prisma } from '../lib/prisma';
import { IncidentService } from '../../../backend/src/services/incidents/incident.service';

function daysBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
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
      expiryDate: { gte: now, lte: lookahead },
      propertyId: { not: null },
    },
    include: { property: true },
    take: 2000,
  });

  let createdOrUpdated = 0;

  for (const p of policies) {
    if (!p.propertyId) continue;

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

    createdOrUpdated++;
  }

  return { createdOrUpdated };
}
