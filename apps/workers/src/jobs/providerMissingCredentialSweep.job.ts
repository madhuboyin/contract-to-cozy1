// apps/workers/src/jobs/providerMissingCredentialSweep.job.ts
//
// Weekly sweep: flags providers who list a ServiceCategory but never
// submitted one of its required credential types
// (ProviderComplianceAlert.MISSING_REQUIRED_CREDENTIAL). See
// docs/functional/PROVIDER_TRUST_COMPLIANCE_FRD.md, Section 11.
//
// Also resolves alerts for gaps that no longer apply (credential submitted,
// category removed from the provider's profile, or the requirement itself
// deactivated) so the provider's open-alerts count doesn't accumulate stale
// entries indefinitely.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export async function providerMissingCredentialSweepJob() {
  const providers = await prisma.providerProfile.findMany({
    where: { status: { in: ['PENDING_APPROVAL', 'ACTIVE'] } },
    select: { id: true, serviceCategories: true },
  });

  let alertsCreated = 0;
  let alertsResolved = 0;
  let providersFailed = 0;

  // Per-provider error isolation: this loop previously had zero try/catch
  // at all — one provider's query/update failure aborted the entire sweep,
  // so every other provider silently got no missing-credential check that
  // week. Same isolation pattern already used elsewhere in this project.
  for (const provider of providers) {
    try {
    const openAlerts = await prisma.providerComplianceAlert.findMany({
      where: {
        providerProfileId: provider.id,
        alertType: 'MISSING_REQUIRED_CREDENTIAL',
        status: { in: ['NEW', 'ACKNOWLEDGED'] },
      },
      select: { id: true, dedupeKey: true },
    });

    if (provider.serviceCategories.length === 0) {
      for (const alert of openAlerts) {
        await prisma.providerComplianceAlert.update({
          where: { id: alert.id },
          data: { status: 'RESOLVED', resolvedAt: new Date() },
        });
        alertsResolved++;
      }
      continue;
    }

    const requirements = await prisma.providerCredentialRequirement.findMany({
      where: {
        serviceCategory: { in: provider.serviceCategories },
        isRequired: true,
        isActive: true,
        stateCode: null,
      },
      select: { serviceCategory: true, credentialType: true },
    });

    const credentials = await prisma.providerCredential.findMany({
      where: { providerProfileId: provider.id },
      select: { type: true, serviceCategories: true },
    });

    const isSubmitted = (serviceCategory: string, credentialType: string) =>
      credentials.some((c) => c.type === credentialType && c.serviceCategories.includes(serviceCategory as any));

    const missingKeys = new Set(
      requirements
        .filter((r) => !isSubmitted(r.serviceCategory, r.credentialType))
        .map((r) => `${r.serviceCategory}:${r.credentialType}`)
    );

    // Resolve alerts whose gap no longer exists.
    for (const alert of openAlerts) {
      // dedupeKey format: `${providerProfileId}:MISSING_REQUIRED_CREDENTIAL:${category}:${type}`
      const [, , category, credentialType] = alert.dedupeKey.split(':');
      if (!missingKeys.has(`${category}:${credentialType}`)) {
        await prisma.providerComplianceAlert.update({
          where: { id: alert.id },
          data: { status: 'RESOLVED', resolvedAt: new Date() },
        });
        alertsResolved++;
      }
    }

    // Create or reopen alerts for gaps that still exist.
    for (const req of requirements) {
      const key = `${req.serviceCategory}:${req.credentialType}`;
      if (!missingKeys.has(key)) continue;

      const dedupeKey = `${provider.id}:MISSING_REQUIRED_CREDENTIAL:${req.serviceCategory}:${req.credentialType}`;
      const existing = await prisma.providerComplianceAlert.findUnique({ where: { dedupeKey } });

      if (existing) {
        if (existing.status === 'RESOLVED') {
          await prisma.providerComplianceAlert.update({
            where: { id: existing.id },
            data: { status: 'NEW', resolvedAt: null },
          });
        }
        continue;
      }

      await prisma.providerComplianceAlert.create({
        data: {
          providerProfileId: provider.id,
          alertType: 'MISSING_REQUIRED_CREDENTIAL',
          severity: 'WARNING',
          status: 'NEW',
          title: `Missing ${req.credentialType} for ${req.serviceCategory}`,
          summary: `You list ${req.serviceCategory} as a service but haven't submitted a ${req.credentialType} credential for it.`,
          dedupeKey,
        },
      });
      alertsCreated++;
    }
    } catch (err) {
      providersFailed++;
      logger.error({ err, providerProfileId: provider.id }, '[ProviderMissingCredentialSweep] sweep failed for one provider');
    }
  }

  logger.info(
    `[ProviderMissingCredentialSweep] ${alertsCreated} alert(s) created, ${alertsResolved} resolved, ${providersFailed} provider(s) failed, across ${providers.length} provider(s)`
  );

  return { alertsCreated, alertsResolved, providersFailed };
}
