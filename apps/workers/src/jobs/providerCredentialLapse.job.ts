// apps/workers/src/jobs/providerCredentialLapse.job.ts
//
// Daily lookahead over ProviderCredential rows nearing expiry, distinguishing
// the two jeopardy states from
// docs/functional/PROVIDER_TRUST_COMPLIANCE_FRD.md, Section 6:
//
//   Case A — general drift, no affected booking: provider/admin housekeeping
//   only, via ProviderComplianceAlert. No homeowner ever sees this.
//
//   Case B — an already-scheduled booking is at risk: routed through the
//   existing Incident pipeline via providerCredentialLapse.adapter.ts, the
//   only writer of PROVIDER_CREDENTIAL_LAPSE incidents.

import { prisma } from '../lib/prisma';
import { logger, AppLogger } from '../lib/logger';
import { ProviderCredentialLapseAdapter } from '@worker-shared/services/incidents/integrations/providerCredentialLapse.adapter';

const LOOKAHEAD_DAYS = 30;

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern).
export interface ProviderCredentialLapseDeps {
  prisma: Pick<typeof prisma, 'providerCredential' | 'booking' | 'providerComplianceAlert'>;
  logger: AppLogger;
  providerCredentialLapseAdapter: Pick<typeof ProviderCredentialLapseAdapter, 'emitBookingRiskIncident'>;
}

const defaultDeps: ProviderCredentialLapseDeps = {
  prisma,
  logger,
  providerCredentialLapseAdapter: ProviderCredentialLapseAdapter,
};

export async function providerCredentialLapseJob(deps: ProviderCredentialLapseDeps = defaultDeps) {
  const { prisma, logger, providerCredentialLapseAdapter } = deps;
  const now = new Date();
  const lookahead = new Date(now.getTime() + LOOKAHEAD_DAYS * 86400000);

  const credentials = await prisma.providerCredential.findMany({
    where: {
      status: 'APPROVED',
      expiryDate: { gte: now, lte: lookahead },
    },
    include: {
      providerProfile: { select: { id: true, businessName: true } },
    },
    take: 2000,
  });

  logger.info(`[ProviderCredentialLapse] ${credentials.length} credential(s) expiring within ${LOOKAHEAD_DAYS} days`);

  let bookingIncidents = 0;
  let generalAlerts = 0;
  const currentlyExpiringIds = new Set(credentials.map((c) => c.id));

  for (const credential of credentials) {
    if (!credential.expiryDate) continue;
    const expiryDate = credential.expiryDate;
    const days = daysBetween(now, expiryDate);

    // Case B: an already-scheduled booking on a specific property is at risk
    const atRiskBooking = await prisma.booking.findFirst({
      where: {
        providerProfileId: credential.providerProfileId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        category: { in: credential.serviceCategories },
        OR: [
          { scheduledDate: { gt: expiryDate } },
          { AND: [{ scheduledDate: null }, { requestedDate: { gt: expiryDate } }] },
        ],
      },
      select: { id: true, propertyId: true, homeownerId: true, category: true },
      orderBy: { scheduledDate: 'asc' },
    });

    if (atRiskBooking) {
      await providerCredentialLapseAdapter.emitBookingRiskIncident({
        credential: { id: credential.id, type: credential.type, expiryDate },
        booking: atRiskBooking,
        provider: { id: credential.providerProfileId, businessName: credential.providerProfile.businessName },
        now,
      });
      bookingIncidents++;
      continue;
    }

    // Case A: general drift, no affected booking — housekeeping alert only
    const severity = days <= 3 ? 'WARNING' : 'INFO';
    const dedupeKey = `${credential.providerProfileId}:EXPIRING_SOON:${credential.id}`;

    await prisma.providerComplianceAlert.upsert({
      where: { dedupeKey },
      create: {
        providerProfileId: credential.providerProfileId,
        credentialId: credential.id,
        alertType: 'EXPIRING_SOON',
        severity,
        status: 'NEW',
        title: `${credential.type} expires in ${days} day${days === 1 ? '' : 's'}`,
        summary: 'Submit a renewal before it expires to stay bookable for the categories it covers.',
        dedupeKey,
      },
      update: {
        severity,
        title: `${credential.type} expires in ${days} day${days === 1 ? '' : 's'}`,
      },
    });
    generalAlerts++;
  }

  // Resolve stale EXPIRING_SOON alerts for credentials that renewed, were
  // revoked, or already transitioned to EXPIRED since the last run.
  const staleAlerts = await prisma.providerComplianceAlert.findMany({
    where: { alertType: 'EXPIRING_SOON', status: { in: ['NEW', 'ACKNOWLEDGED'] }, credentialId: { not: null } },
    select: { id: true, credentialId: true },
  });
  let alertsResolved = 0;
  for (const alert of staleAlerts) {
    if (alert.credentialId && !currentlyExpiringIds.has(alert.credentialId)) {
      await prisma.providerComplianceAlert.update({
        where: { id: alert.id },
        data: { status: 'RESOLVED', resolvedAt: now },
      });
      alertsResolved++;
    }
  }

  return { checked: credentials.length, bookingIncidents, generalAlerts, alertsResolved };
}
