// apps/backend/src/services/providerCompliance.service.ts
//
// Derives per-category ProviderCategoryEligibility from ProviderCredential rows
// and owns the ProviderStatus transitions that hang off it. See
// docs/functional/PROVIDER_TRUST_COMPLIANCE_FRD.md, Section 5.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { ProviderCredentialType, ProviderCredentialStatus, ProviderStatus, ServiceCategory } from '@prisma/client';

export type CategoryEligibilityResult = {
  serviceCategory: ServiceCategory;
  isEligible: boolean;
  missingCredentialTypes: ProviderCredentialType[];
};

export type RecomputeResult = {
  providerProfileId: string;
  categories: CategoryEligibilityResult[];
  status: ProviderStatus;
  statusChanged: boolean;
};

function isCredentialLive(
  credential: { status: ProviderCredentialStatus; expiryDate: Date | null },
  now: Date
): boolean {
  if (credential.status !== ProviderCredentialStatus.APPROVED) return false;
  if (credential.expiryDate && credential.expiryDate <= now) return false;
  return true;
}

class ProviderComplianceService {
  /**
   * Recompute per-category eligibility and the PENDING_APPROVAL -> ACTIVE /
   * ACTIVE -> SUSPENDED transitions. Called whenever a credential is
   * approved, rejected, expires, or is revoked (Section 5).
   */
  async recomputeProviderStatus(providerProfileId: string): Promise<RecomputeResult> {
    const now = new Date();

    const provider = await prisma.providerProfile.findUnique({
      where: { id: providerProfileId },
      select: {
        id: true,
        status: true,
        serviceCategories: true,
        teamSize: true,
      },
    });

    if (!provider) {
      throw new Error(`ProviderProfile ${providerProfileId} not found`);
    }

    const categories = provider.serviceCategories;

    if (categories.length === 0) {
      return { providerProfileId, categories: [], status: provider.status, statusChanged: false };
    }

    // Phase 1: ProviderProfile doesn't track a state yet, so only
    // universal (stateCode: null) requirement rows apply. Once per-provider
    // state is available, prefer a state-specific row over the null one here.
    const requirements = await prisma.providerCredentialRequirement.findMany({
      where: {
        serviceCategory: { in: categories },
        isRequired: true,
        isActive: true,
        stateCode: null,
      },
      select: { serviceCategory: true, credentialType: true },
    });

    const requiredTypesByCategory = new Map<ServiceCategory, Set<ProviderCredentialType>>();
    for (const category of categories) {
      requiredTypesByCategory.set(category, new Set());
    }
    for (const req of requirements) {
      requiredTypesByCategory.get(req.serviceCategory)?.add(req.credentialType);
    }

    // WORKERS_COMP_INSURANCE isn't a requirement-matrix row (Section 4.2) —
    // it's required only where teamSize > 1, evaluated dynamically here.
    if ((provider.teamSize ?? 0) > 1) {
      for (const category of categories) {
        requiredTypesByCategory.get(category)?.add(ProviderCredentialType.WORKERS_COMP_INSURANCE);
      }
    }

    const credentials = await prisma.providerCredential.findMany({
      where: { providerProfileId, status: ProviderCredentialStatus.APPROVED },
      select: { type: true, serviceCategories: true, expiryDate: true, status: true },
    });

    const liveCredentials = credentials.filter((c) => isCredentialLive(c, now));

    const results: CategoryEligibilityResult[] = categories.map((category) => {
      const requiredTypes = requiredTypesByCategory.get(category) ?? new Set<ProviderCredentialType>();
      const missing: ProviderCredentialType[] = [];

      for (const type of requiredTypes) {
        const covered = liveCredentials.some((c) => c.type === type && c.serviceCategories.includes(category));
        if (!covered) missing.push(type);
      }

      return {
        serviceCategory: category,
        isEligible: missing.length === 0,
        missingCredentialTypes: missing,
      };
    });

    await prisma.$transaction(
      results.map((r) =>
        prisma.providerCategoryEligibility.upsert({
          where: {
            providerProfileId_serviceCategory: {
              providerProfileId,
              serviceCategory: r.serviceCategory,
            },
          },
          create: {
            providerProfileId,
            serviceCategory: r.serviceCategory,
            isEligible: r.isEligible,
            missingCredentialTypes: r.missingCredentialTypes,
            computedAt: now,
          },
          update: {
            isEligible: r.isEligible,
            missingCredentialTypes: r.missingCredentialTypes,
            computedAt: now,
          },
        })
      )
    );

    const eligibleCount = results.filter((r) => r.isEligible).length;

    let nextStatus = provider.status;
    if (provider.status === ProviderStatus.PENDING_APPROVAL && eligibleCount >= 1) {
      // At least one eligible category, not "eligible for all" — a provider
      // shouldn't be blocked from ever going live because one of several
      // listed categories hasn't cleared review yet (Section 5).
      nextStatus = ProviderStatus.ACTIVE;
    } else if (provider.status === ProviderStatus.ACTIVE && eligibleCount === 0) {
      // Every listed category lost eligibility — first real behavior behind
      // ProviderStatus.SUSPENDED as an automatic consequence (Section 5).
      nextStatus = ProviderStatus.SUSPENDED;
    }

    // Derived, backward-compatible booleans (Section 13, Phase 1) — read-only
    // mirrors of ProviderCategoryEligibility, kept only so existing frontend
    // code still reading them directly doesn't see permanently-stale data.
    const insuranceVerified = eligibleCount > 0;
    const licenseVerified = liveCredentials.some((c) => c.type === ProviderCredentialType.TRADE_LICENSE);

    const statusChanged = nextStatus !== provider.status;

    await prisma.providerProfile.update({
      where: { id: providerProfileId },
      data: {
        status: nextStatus,
        insuranceVerified,
        licenseVerified,
      },
    });

    if (statusChanged) {
      logger.info(
        { providerProfileId, from: provider.status, to: nextStatus },
        '[PROVIDER_COMPLIANCE] provider status transitioned'
      );
    }

    return { providerProfileId, categories: results, status: nextStatus, statusChanged };
  }
}

export const providerComplianceService = new ProviderComplianceService();
