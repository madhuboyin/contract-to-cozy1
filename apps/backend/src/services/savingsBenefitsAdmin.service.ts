// apps/backend/src/services/savingsBenefitsAdmin.service.ts
//
// Admin CRUD for the Savings and Benefits reviewed source registry
// (HIDDEN_SAVINGS_AND_BENEFITS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md
// Slice 2). Sources and programs are always saved as DRAFT (create) or with
// their existing reviewStatus preserved (update) — "saving must not publish
// it," matching knowledgeHubAdmin.service.ts. Lifecycle transitions only
// happen through savingsBenefitsGovernance.service.ts under the separated
// SAVINGS_BENEFITS_AUTHOR / _REVIEW / _PUBLISH capabilities.

import {
  HiddenAssetBenefitPeriod,
  HiddenAssetFundingStatus,
  HiddenAssetProgramReviewStatus,
  HiddenAssetRuleKind,
  HiddenAssetRuleOperator,
  HiddenAssetSourceKind,
  HiddenAssetSourceStatus,
  HiddenAssetUnknownHandling,
  Prisma,
} from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../lib/prisma';
import { recordAdminAction } from './adminAudit.service';
import { requestBroadSavingsBenefitsReevaluation } from './savingsBenefitsReevaluation.service';

const SOURCE_HEALTH_LEVELS = ['HEALTHY', 'DEGRADED', 'CRITICAL'] as const;
export type SourceHealthLevel = (typeof SOURCE_HEALTH_LEVELS)[number];

export interface HiddenAssetSourceInput {
  name: string;
  sourceKind: HiddenAssetSourceKind;
  officialUrl: string;
  reviewSlaDays?: number;
  status?: HiddenAssetSourceStatus;
}

export interface HiddenAssetProgramRuleInput {
  attribute: string;
  operator: HiddenAssetRuleOperator;
  value: string;
  sortOrder?: number;
  /**
   * MANDATORY (default): must resolve true or the program is excluded.
   * OPTIONAL: only raises/lowers confidence, never excludes.
   * DISQUALIFYING: resolving true excludes the program outright.
   * Rules sharing a groupKey are OR'd together and must share one kind —
   * createProgram/updateProgram reject a groupKey with mixed kinds.
   */
  kind?: HiddenAssetRuleKind;
  groupKey?: string | null;
  evidenceRequirement?: string | null;
  homeownerExplanation?: string | null;
  isSensitive?: boolean;
  requiresExternalVerification?: boolean;
  unknownHandling?: HiddenAssetUnknownHandling;
}

export interface HiddenAssetProgramInput {
  sourceId: string;
  name: string;
  category: Prisma.HiddenAssetProgramCreateInput['category'];
  description?: string | null;
  regionType: Prisma.HiddenAssetProgramCreateInput['regionType'];
  regionValue: string;
  benefitType: Prisma.HiddenAssetProgramCreateInput['benefitType'];
  benefitEstimateMin?: number | null;
  benefitEstimateMax?: number | null;
  /** Defaults to UNKNOWN — never assume the estimate recurs unless reviewed. */
  benefitPeriod?: HiddenAssetBenefitPeriod;
  currency?: string;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  eligibilityNotes?: string | null;
  expiresAt?: Date | null;
  /** Defaults to UNKNOWN — never blocks matching by itself; only CLOSED does. */
  fundingStatus?: HiddenAssetFundingStatus;
  applicationWindowOpensAt?: Date | null;
  applicationWindowClosesAt?: Date | null;
  /**
   * Programs sharing a non-null exclusionGroupKey are mutually exclusive —
   * a homeowner can realistically claim only one from the group. Surfaced
   * on matches as mutuallyExclusiveWith (see hiddenAssets.service.ts).
   */
  exclusionGroupKey?: string | null;
  /** Who the benefit belongs to — property or household (HSB-038). Defaults to PROPERTY. */
  beneficiaryScope?: Prisma.HiddenAssetProgramCreateInput['beneficiaryScope'];
  rules: HiddenAssetProgramRuleInput[];
}

/**
 * Rules sharing a groupKey are OR'd together into one expression group by
 * the rule engine (see hiddenAssets/ruleEngine.ts) — a group can only carry
 * one kind (MANDATORY/OPTIONAL/DISQUALIFYING), so mixing kinds under the
 * same groupKey would make the group's effect on the match decision
 * ambiguous. Reject that at write time rather than silently picking one.
 */
function assertConsistentGroupKinds(rules: HiddenAssetProgramRuleInput[]): void {
  const kindByGroup = new Map<string, HiddenAssetRuleKind>();
  for (const rule of rules) {
    if (!rule.groupKey) continue;
    const kind = rule.kind ?? 'MANDATORY';
    const existing = kindByGroup.get(rule.groupKey);
    if (existing && existing !== kind) {
      throw new Error(
        `Rules in groupKey "${rule.groupKey}" must share one kind (found ${existing} and ${kind}).`,
      );
    }
    kindByGroup.set(rule.groupKey, kind);
  }
}

function sourceHealth(source: {
  status: HiddenAssetSourceStatus;
  lastReviewedAt: Date | null;
  reviewSlaDays: number;
}, now: Date): { health: SourceHealthLevel; stale: boolean; overdueSince: string | null } {
  if (source.status !== 'ACTIVE') {
    return { health: 'CRITICAL', stale: true, overdueSince: null };
  }
  if (!source.lastReviewedAt) {
    return { health: 'CRITICAL', stale: true, overdueSince: null };
  }
  const slaMs = source.reviewSlaDays * 24 * 60 * 60 * 1000;
  const dueAt = new Date(source.lastReviewedAt.getTime() + slaMs);
  const stale = dueAt < now;
  return {
    health: stale ? 'DEGRADED' : 'HEALTHY',
    stale,
    overdueSince: stale ? dueAt.toISOString() : null,
  };
}

export class SavingsBenefitsAdminService {
  async listSources(now = new Date()) {
    const sources = await prisma.hiddenAssetSource.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { programs: true } } },
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      sourceKind: source.sourceKind,
      officialUrl: source.officialUrl,
      reviewSlaDays: source.reviewSlaDays,
      status: source.status,
      lastReviewedAt: source.lastReviewedAt?.toISOString() ?? null,
      lastReviewedBy: source.lastReviewedBy,
      programCount: source._count.programs,
      ...sourceHealth(source, now),
    }));
  }

  async getSource(sourceId: string) {
    const source = await prisma.hiddenAssetSource.findUnique({ where: { id: sourceId } });
    if (!source) throw new Error('Source not found');
    return source;
  }

  async createSource(
    input: HiddenAssetSourceInput,
    actorUserId: string,
    req?: Pick<Request, 'ip' | 'headers'> | null,
  ) {
    return prisma.$transaction(async (tx) => {
      const source = await tx.hiddenAssetSource.create({
        data: {
          name: input.name.trim(),
          sourceKind: input.sourceKind,
          officialUrl: input.officialUrl.trim(),
          reviewSlaDays: input.reviewSlaDays ?? 180,
          status: input.status ?? 'ACTIVE',
          lastReviewedAt: null,
          lastReviewedBy: null,
          reviewedVersion: null,
          lastAuthoredBy: actorUserId,
        },
      });
      await recordAdminAction({
        actorId: actorUserId,
        action: 'ADMIN_SAVINGS_BENEFITS_SOURCE_CREATE',
        entityType: 'HIDDEN_ASSET_SOURCE',
        entityId: source.id,
        capability: 'SAVINGS_BENEFITS_AUTHOR',
        reason: 'Source created through the Savings & Benefits admin console.',
        disposition: 'CREATED_UNREVIEWED',
        newValues: JSON.parse(JSON.stringify(source)),
        req,
      }, tx);
      return source;
    });
  }

  async updateSource(
    sourceId: string,
    input: HiddenAssetSourceInput,
    actorUserId: string,
    req?: Pick<Request, 'ip' | 'headers'> | null,
  ) {
    const existing = await prisma.hiddenAssetSource.findUnique({ where: { id: sourceId } });
    if (!existing) throw new Error('Source not found');
    const nextReviewSlaDays = input.reviewSlaDays ?? existing.reviewSlaDays;
    const materialChange =
      existing.name !== input.name.trim()
      || existing.sourceKind !== input.sourceKind
      || existing.officialUrl !== input.officialUrl.trim()
      || existing.reviewSlaDays !== nextReviewSlaDays;

    const source = await prisma.$transaction(async (tx) => {
      const updated = await tx.hiddenAssetSource.updateMany({
        where: { id: sourceId, version: existing.version },
        data: {
          name: input.name.trim(),
          sourceKind: input.sourceKind,
          officialUrl: input.officialUrl.trim(),
          reviewSlaDays: nextReviewSlaDays,
          status: input.status ?? existing.status,
          lastAuthoredBy: actorUserId,
          ...(materialChange
            ? {
                version: { increment: 1 },
                lastReviewedAt: null,
                lastReviewedBy: null,
                reviewedVersion: null,
              }
            : {}),
        },
      });
      if (updated.count !== 1) {
        throw new Error('Source changed concurrently. Refresh and try again.');
      }
      const source = await tx.hiddenAssetSource.findUniqueOrThrow({ where: { id: sourceId } });
      await recordAdminAction({
        actorId: actorUserId,
        action: 'ADMIN_SAVINGS_BENEFITS_SOURCE_UPDATE',
        entityType: 'HIDDEN_ASSET_SOURCE',
        entityId: sourceId,
        capability: 'SAVINGS_BENEFITS_AUTHOR',
        reason: materialChange
          ? 'Material source metadata changed; prior review attestation invalidated.'
          : 'Source operational status updated.',
        disposition: materialChange ? 'REVIEW_INVALIDATED' : 'UPDATED',
        oldValues: JSON.parse(JSON.stringify(existing)),
        newValues: JSON.parse(JSON.stringify(source)),
        req,
      }, tx);
      return source;
    });
    if (materialChange || source.status !== existing.status) {
      const queued = await requestBroadSavingsBenefitsReevaluation(
        `source:${sourceId}:${materialChange ? 'review-invalidated' : `status-${source.status.toLowerCase()}`}`,
      );
      if (!queued) {
        throw new Error('Source updated, but Savings & Benefits reevaluation could not be queued.');
      }
    }
    return source;
  }

  async reviewSource(
    sourceId: string,
    actorUserId: string,
    reason: string,
    req?: Pick<Request, 'ip' | 'headers'> | null,
  ) {
    const reviewed = await prisma.$transaction(async (tx) => {
      const source = await tx.hiddenAssetSource.findUnique({ where: { id: sourceId } });
      if (!source) throw new Error('Source not found');
      if (source.lastAuthoredBy === actorUserId) {
        throw new Error('Source review must be performed by a different administrator than the current author.');
      }

      const reviewedAt = new Date();
      const reviewedSource = await tx.hiddenAssetSource.update({
        where: { id: sourceId },
        data: {
          lastReviewedAt: reviewedAt,
          lastReviewedBy: actorUserId,
          reviewedVersion: source.version,
        },
      });
      await recordAdminAction({
        actorId: actorUserId,
        action: 'ADMIN_SAVINGS_BENEFITS_SOURCE_REVIEW',
        entityType: 'HIDDEN_ASSET_SOURCE',
        entityId: sourceId,
        capability: 'SAVINGS_BENEFITS_REVIEW',
        reason,
        disposition: 'REVIEW_ATTESTED',
        oldValues: {
          lastReviewedAt: source.lastReviewedAt?.toISOString() ?? null,
          lastReviewedBy: source.lastReviewedBy,
        },
        newValues: {
          lastReviewedAt: reviewedAt.toISOString(),
          lastReviewedBy: actorUserId,
          reviewedVersion: source.version,
        },
        relatedRefs: { name: source.name, officialUrl: source.officialUrl },
        req,
      }, tx);
      return reviewedSource;
    });
    const queued = await requestBroadSavingsBenefitsReevaluation(`source:${sourceId}:reviewed`);
    if (!queued) {
      throw new Error('Source review was recorded, but Savings & Benefits reevaluation could not be queued.');
    }
    return reviewed;
  }

  async listPrograms(filters: { sourceId?: string; reviewStatus?: HiddenAssetProgramReviewStatus } = {}) {
    const programs = await prisma.hiddenAssetProgram.findMany({
      where: {
        ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
        ...(filters.reviewStatus ? { reviewStatus: filters.reviewStatus } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }],
      include: { source: { select: { id: true, name: true } }, rules: true },
    });
    return programs;
  }

  async getProgram(programId: string, client: Prisma.TransactionClient | typeof prisma = prisma) {
    const program = await client.hiddenAssetProgram.findUnique({
      where: { id: programId },
      include: { source: true, rules: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!program) throw new Error('Program not found');
    return program;
  }

  async createProgram(
    input: HiddenAssetProgramInput,
    actorUserId: string,
    req?: Pick<Request, 'ip' | 'headers'> | null,
  ) {
    assertConsistentGroupKinds(input.rules);
    return prisma.$transaction(async (tx) => {
      const program = await tx.hiddenAssetProgram.create({
        data: {
          sourceId: input.sourceId,
          name: input.name.trim(),
          category: input.category,
          description: input.description ?? null,
          regionType: input.regionType,
          regionValue: input.regionValue.trim(),
          benefitType: input.benefitType,
          benefitEstimateMin: input.benefitEstimateMin ?? null,
          benefitEstimateMax: input.benefitEstimateMax ?? null,
          benefitPeriod: input.benefitPeriod ?? HiddenAssetBenefitPeriod.UNKNOWN,
          currency: input.currency ?? 'USD',
          sourceUrl: input.sourceUrl ?? null,
          sourceLabel: input.sourceLabel ?? null,
          eligibilityNotes: input.eligibilityNotes ?? null,
          expiresAt: input.expiresAt ?? null,
          fundingStatus: input.fundingStatus ?? HiddenAssetFundingStatus.UNKNOWN,
          applicationWindowOpensAt: input.applicationWindowOpensAt ?? null,
          applicationWindowClosesAt: input.applicationWindowClosesAt ?? null,
          exclusionGroupKey: input.exclusionGroupKey ?? null,
          beneficiaryScope: input.beneficiaryScope ?? 'PROPERTY',
          authoredBy: actorUserId,
          // "Saving must not publish it" — new programs always start DRAFT;
          // lifecycle moves only through savingsBenefitsGovernance.service.ts.
          reviewStatus: 'DRAFT',
          isActive: true,
        },
      });
      await tx.hiddenAssetProgramRule.createMany({
        data: input.rules.map((rule, index) => ({
          programId: program.id,
          attribute: rule.attribute,
          operator: rule.operator,
          value: rule.value,
          sortOrder: rule.sortOrder ?? index,
          kind: rule.kind ?? 'MANDATORY',
          groupKey: rule.groupKey ?? null,
          evidenceRequirement: rule.evidenceRequirement ?? null,
          homeownerExplanation: rule.homeownerExplanation ?? null,
          isSensitive: rule.isSensitive ?? false,
          requiresExternalVerification: rule.requiresExternalVerification ?? false,
          unknownHandling: rule.unknownHandling ?? 'HOLD_CANDIDATE',
        })),
      });
      const detail = await this.getProgram(program.id, tx);
      await recordAdminAction({
        actorId: actorUserId,
        action: 'ADMIN_SAVINGS_BENEFITS_PROGRAM_CREATE',
        entityType: 'HIDDEN_ASSET_PROGRAM',
        entityId: program.id,
        capability: 'SAVINGS_BENEFITS_AUTHOR',
        reason: 'Program created through the Savings & Benefits admin console.',
        disposition: 'CREATED_DRAFT',
        newValues: JSON.parse(JSON.stringify(detail)),
        req,
      }, tx);
      return detail;
    });
  }

  async updateProgram(
    programId: string,
    input: HiddenAssetProgramInput,
    actorUserId: string,
    req?: Pick<Request, 'ip' | 'headers'> | null,
  ) {
    assertConsistentGroupKinds(input.rules);
    const existing = await prisma.hiddenAssetProgram.findUnique({ where: { id: programId } });
    if (!existing) throw new Error('Program not found');
    if (existing.reviewStatus !== 'DRAFT') {
      throw new Error(
        `Only DRAFT programs can be edited. Return this ${existing.reviewStatus} program to DRAFT first.`,
      );
    }

    return prisma.$transaction(async (tx) => {
      // Rule rows are destructively deleted/recreated below, which would
      // otherwise make rule history untraceable (HSB-014) — capture what
      // this version looked like right before the edit lands.
      const priorDetail = await this.getProgram(programId, tx);
      await tx.hiddenAssetProgramVersionSnapshot.create({
        data: {
          programId,
          version: existing.version,
          snapshotJson: JSON.parse(JSON.stringify(priorDetail)),
          changeReason: 'Program edited via admin console',
          recordedBy: actorUserId,
        },
      });

      const updated = await tx.hiddenAssetProgram.updateMany({
        where: { id: programId, version: existing.version, reviewStatus: 'DRAFT' },
        data: {
          sourceId: input.sourceId,
          name: input.name.trim(),
          category: input.category,
          description: input.description ?? null,
          regionType: input.regionType,
          regionValue: input.regionValue.trim(),
          benefitType: input.benefitType,
          benefitEstimateMin: input.benefitEstimateMin ?? null,
          benefitEstimateMax: input.benefitEstimateMax ?? null,
          benefitPeriod: input.benefitPeriod ?? existing.benefitPeriod,
          currency: input.currency ?? existing.currency,
          sourceUrl: input.sourceUrl ?? null,
          sourceLabel: input.sourceLabel ?? null,
          eligibilityNotes: input.eligibilityNotes ?? null,
          expiresAt: input.expiresAt ?? null,
          fundingStatus: input.fundingStatus ?? existing.fundingStatus,
          applicationWindowOpensAt: input.applicationWindowOpensAt ?? null,
          applicationWindowClosesAt: input.applicationWindowClosesAt ?? null,
          exclusionGroupKey: input.exclusionGroupKey !== undefined ? input.exclusionGroupKey : existing.exclusionGroupKey,
          beneficiaryScope: input.beneficiaryScope ?? existing.beneficiaryScope,
          authoredBy: actorUserId,
          version: { increment: 1 },
          approvedVersion: null,
          reviewedAt: null,
          reviewedBy: null,
          lastVerifiedAt: null,
        },
      });
      if (updated.count !== 1) {
        throw new Error('Program changed concurrently. Refresh and try again.');
      }
      await tx.hiddenAssetProgramRule.deleteMany({ where: { programId } });
      await tx.hiddenAssetProgramRule.createMany({
        data: input.rules.map((rule, index) => ({
          programId,
          attribute: rule.attribute,
          operator: rule.operator,
          value: rule.value,
          sortOrder: rule.sortOrder ?? index,
          kind: rule.kind ?? 'MANDATORY',
          groupKey: rule.groupKey ?? null,
          evidenceRequirement: rule.evidenceRequirement ?? null,
          homeownerExplanation: rule.homeownerExplanation ?? null,
          isSensitive: rule.isSensitive ?? false,
          requiresExternalVerification: rule.requiresExternalVerification ?? false,
          unknownHandling: rule.unknownHandling ?? 'HOLD_CANDIDATE',
        })),
      });
      const detail = await this.getProgram(programId, tx);
      await recordAdminAction({
        actorId: actorUserId,
        action: 'ADMIN_SAVINGS_BENEFITS_PROGRAM_UPDATE',
        entityType: 'HIDDEN_ASSET_PROGRAM',
        entityId: programId,
        capability: 'SAVINGS_BENEFITS_AUTHOR',
        reason: 'Draft program content and rules updated.',
        disposition: 'DRAFT_UPDATED',
        oldValues: JSON.parse(JSON.stringify(priorDetail)),
        newValues: JSON.parse(JSON.stringify(detail)),
        req,
      }, tx);
      return detail;
    });
  }

  async listProgramVersionHistory(programId: string) {
    return prisma.hiddenAssetProgramVersionSnapshot.findMany({
      where: { programId },
      orderBy: { version: 'desc' },
    });
  }
}

export const savingsBenefitsAdminService = new SavingsBenefitsAdminService();
