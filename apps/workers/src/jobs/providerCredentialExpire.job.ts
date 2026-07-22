// apps/workers/src/jobs/providerCredentialExpire.job.ts
//
// Transitions APPROVED ProviderCredential rows past their expiryDate to
// EXPIRED, then recomputes affected providers' category eligibility — a
// provider can drop out of eligibility for a category (or lose ACTIVE status
// entirely) purely because time passed, with no admin action involved.
// See docs/functional/PROVIDER_TRUST_COMPLIANCE_FRD.md, Section 11.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { providerComplianceService } from '@worker-shared/services/providerCompliance.service';

export async function providerCredentialExpireJob() {
  const now = new Date();

  const expired = await prisma.providerCredential.findMany({
    where: { status: 'APPROVED', expiryDate: { lt: now } },
    select: { id: true, providerProfileId: true },
    take: 2000,
  });

  logger.info(`[ProviderCredentialExpire] ${expired.length} credential(s) past expiry`);

  const affectedProviderIds = new Set<string>();
  let expiredOk = 0;
  let expireFailed = 0;
  // Per-item error isolation: one credential's update failing (constraint
  // violation, transient DB blip) must not abort expiry for the rest of the
  // batch — a provider whose credential should have expired but silently
  // didn't stays incorrectly eligible until the next run picks it up.
  for (const credential of expired) {
    try {
      await prisma.providerCredential.update({
        where: { id: credential.id },
        data: { status: 'EXPIRED' },
      });
      affectedProviderIds.add(credential.providerProfileId);
      expiredOk++;
    } catch (err) {
      expireFailed++;
      logger.error({ err, credentialId: credential.id }, '[ProviderCredentialExpire] expire update failed for one credential');
    }
  }

  let providersRecomputed = 0;
  for (const providerProfileId of affectedProviderIds) {
    try {
      await providerComplianceService.recomputeProviderStatus(providerProfileId);
      providersRecomputed++;
    } catch (err) {
      logger.error({ err, providerProfileId }, '[ProviderCredentialExpire] recompute failed');
    }
  }

  return { expiredCount: expiredOk, expireFailed, providersRecomputed };
}
