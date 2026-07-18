// apps/backend/src/services/adminProviderOps.service.ts
//
// Provider Operations workspace backend (ADMIN_MODULE_FRD.md §10.2, Phase 2
// slice). Expands the credential-centric Provider Compliance surface into a
// provider-centric directory: search/filter the directory, view one
// provider's operational context (credentials, compliance alerts, bookings,
// reviews), and take one governed action — a provider-status transition
// under PROVIDER_SUSPEND. This acts on ProviderProfile.status (the
// marketplace footprint), NOT User.status — account-level suspension stays
// in adminUserSupport.service.ts.

import { Request } from 'express';
import { Prisma, ProviderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { recordAdminAction } from './adminAudit.service';

export class AdminProviderOpsError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AdminProviderOpsError';
  }
}

interface ActionContext {
  req?: Pick<Request, 'ip' | 'headers'> | null;
}

export interface ListProvidersInput {
  q?: string;
  status?: ProviderStatus;
  page?: number;
  limit?: number;
}

/** Directory search: business name or provider user name/email, optional status filter. */
export async function listProviders(input: ListProvidersInput = {}) {
  const page = input.page ?? 1;
  const limit = Math.min(input.limit ?? 25, 100);
  const q = input.q?.trim();

  const where: Prisma.ProviderProfileWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(q
      ? {
          OR: [
            { businessName: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
            { user: { firstName: { contains: q, mode: 'insensitive' } } },
            { user: { lastName: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [providers, total] = await Promise.all([
    prisma.providerProfile.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        businessName: true,
        status: true,
        serviceCategories: true,
        averageRating: true,
        totalReviews: true,
        totalCompletedJobs: true,
        insuranceVerified: true,
        licenseVerified: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true, status: true } },
        _count: {
          select: {
            credentials: { where: { status: 'PENDING_REVIEW' } },
            complianceAlerts: { where: { status: 'NEW' } },
          },
        },
      },
    }),
    prisma.providerProfile.count({ where }),
  ]);

  return {
    providers: providers.map(({ _count, ...p }) => ({
      ...p,
      pendingCredentialCount: _count.credentials,
      openComplianceAlertCount: _count.complianceAlerts,
    })),
    total,
    page,
    limit,
  };
}

/**
 * Operational detail for one provider: identity/business context, credential
 * list, open compliance alerts, booking counts, and review counts. Support-
 * safe scope — no tax ID, no Stripe identifiers, no payment amounts.
 */
export async function getProviderDetail(providerProfileId: string) {
  const provider = await prisma.providerProfile.findUnique({
    where: { id: providerProfileId },
    select: {
      id: true,
      businessName: true,
      businessType: true,
      status: true,
      serviceCategories: true,
      serviceRadius: true,
      yearsInBusiness: true,
      teamSize: true,
      website: true,
      insuranceVerified: true,
      licenseVerified: true,
      backgroundCheckDate: true,
      averageRating: true,
      totalReviews: true,
      totalCompletedJobs: true,
      createdAt: true,
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, status: true, lastLoginAt: true },
      },
      credentials: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          status: true,
          issuingAuthority: true,
          issueDate: true,
          expiryDate: true,
          serviceCategories: true,
          reviewedAt: true,
          rejectionReason: true,
        },
      },
      complianceAlerts: {
        where: { status: { not: 'RESOLVED' } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, alertType: true, severity: true, status: true, title: true, summary: true, createdAt: true },
      },
      services: {
        select: { id: true, name: true, category: true, isActive: true },
      },
    },
  });

  if (!provider) {
    throw new AdminProviderOpsError('PROVIDER_NOT_FOUND', `No provider profile with id "${providerProfileId}".`);
  }

  const [bookingCounts, reviewCounts] = await Promise.all([
    prisma.booking.groupBy({
      by: ['status'],
      where: { providerProfileId },
      _count: { _all: true },
    }),
    prisma.review.groupBy({
      by: ['status'],
      where: { providerId: provider.user.id },
      _count: { _all: true },
    }),
  ]);

  const toCounts = (rows: { status: string; _count: { _all: number } }[]) => {
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = row._count._all;
    return counts;
  };

  return {
    ...provider,
    bookingCounts: toCounts(bookingCounts),
    reviewCounts: toCounts(reviewCounts),
  };
}

const GOVERNED_PROVIDER_STATUSES = ['ACTIVE', 'SUSPENDED', 'INACTIVE'] as const;
export type GovernedProviderStatus = (typeof GOVERNED_PROVIDER_STATUSES)[number];

export interface ChangeProviderStatusInput {
  providerProfileId: string;
  actorId: string;
  status: GovernedProviderStatus;
  reason: string;
}

/**
 * Governed marketplace-status transition (FRD §10.2: "suspend and reinstate
 * providers through governed transitions"). PENDING_APPROVAL is a signup
 * state and not reachable here. Leaving ACTIVE deactivates the provider's
 * service listings in the same transaction; reinstating deliberately does
 * NOT re-enable them — the provider must relist, so a reinstated provider
 * never silently reappears in the marketplace. An admin cannot change the
 * status of their own provider profile.
 */
export async function changeProviderStatus(input: ChangeProviderStatusInput, ctx: ActionContext = {}) {
  const provider = await prisma.providerProfile.findUnique({
    where: { id: input.providerProfileId },
    select: { id: true, status: true, userId: true },
  });
  if (!provider) {
    throw new AdminProviderOpsError('PROVIDER_NOT_FOUND', `No provider profile with id "${input.providerProfileId}".`);
  }

  if (provider.userId === input.actorId) {
    throw new AdminProviderOpsError(
      'SELF_ACTION_FORBIDDEN',
      'An administrator cannot change the status of their own provider profile through this tool.'
    );
  }

  if (provider.status === input.status) {
    return { previousStatus: provider.status, status: input.status, noop: true };
  }

  const leavingActive = input.status !== 'ACTIVE';

  await prisma.$transaction(async (tx) => {
    await tx.providerProfile.update({
      where: { id: input.providerProfileId },
      data: { status: input.status },
    });
    if (leavingActive) {
      await tx.service.updateMany({
        where: { providerProfileId: input.providerProfileId },
        data: { isActive: false },
      });
    }
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_CHANGE_PROVIDER_STATUS',
    entityType: 'PROVIDER_PROFILE',
    entityId: input.providerProfileId,
    capability: 'PROVIDER_SUSPEND',
    reason: input.reason,
    oldValues: { status: provider.status } as Prisma.InputJsonValue,
    newValues: { status: input.status } as Prisma.InputJsonValue,
    relatedRefs: { providerUserId: provider.userId },
    req: ctx.req,
  });

  return { previousStatus: provider.status, status: input.status, noop: false };
}
