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
  HiddenAssetFundingStatus,
  HiddenAssetProgramReviewStatus,
  HiddenAssetRuleKind,
  HiddenAssetRuleOperator,
  HiddenAssetSourceKind,
  HiddenAssetSourceStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

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
  currency?: string;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  eligibilityNotes?: string | null;
  expiresAt?: Date | null;
  /** Defaults to UNKNOWN — never blocks matching by itself; only CLOSED does. */
  fundingStatus?: HiddenAssetFundingStatus;
  applicationWindowOpensAt?: Date | null;
  applicationWindowClosesAt?: Date | null;
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

  async createSource(input: HiddenAssetSourceInput, actorUserId: string) {
    return prisma.hiddenAssetSource.create({
      data: {
        name: input.name.trim(),
        sourceKind: input.sourceKind,
        officialUrl: input.officialUrl.trim(),
        reviewSlaDays: input.reviewSlaDays ?? 180,
        status: input.status ?? 'ACTIVE',
        lastReviewedAt: new Date(),
        lastReviewedBy: actorUserId,
      },
    });
  }

  async updateSource(sourceId: string, input: HiddenAssetSourceInput, actorUserId: string) {
    const existing = await prisma.hiddenAssetSource.findUnique({ where: { id: sourceId } });
    if (!existing) throw new Error('Source not found');
    return prisma.hiddenAssetSource.update({
      where: { id: sourceId },
      data: {
        name: input.name.trim(),
        sourceKind: input.sourceKind,
        officialUrl: input.officialUrl.trim(),
        reviewSlaDays: input.reviewSlaDays ?? existing.reviewSlaDays,
        status: input.status ?? existing.status,
        // Re-saving the source's own details counts as a fresh human review
        // of that source's continued accuracy.
        lastReviewedAt: new Date(),
        lastReviewedBy: actorUserId,
      },
    });
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

  async createProgram(input: HiddenAssetProgramInput) {
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
          currency: input.currency ?? 'USD',
          sourceUrl: input.sourceUrl ?? null,
          sourceLabel: input.sourceLabel ?? null,
          eligibilityNotes: input.eligibilityNotes ?? null,
          expiresAt: input.expiresAt ?? null,
          fundingStatus: input.fundingStatus ?? HiddenAssetFundingStatus.UNKNOWN,
          applicationWindowOpensAt: input.applicationWindowOpensAt ?? null,
          applicationWindowClosesAt: input.applicationWindowClosesAt ?? null,
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
        })),
      });
      return this.getProgram(program.id, tx);
    });
  }

  async updateProgram(programId: string, input: HiddenAssetProgramInput) {
    assertConsistentGroupKinds(input.rules);
    const existing = await prisma.hiddenAssetProgram.findUnique({ where: { id: programId } });
    if (!existing) throw new Error('Program not found');

    return prisma.$transaction(async (tx) => {
      await tx.hiddenAssetProgram.update({
        where: { id: programId },
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
          currency: input.currency ?? existing.currency,
          sourceUrl: input.sourceUrl ?? null,
          sourceLabel: input.sourceLabel ?? null,
          eligibilityNotes: input.eligibilityNotes ?? null,
          expiresAt: input.expiresAt ?? null,
          fundingStatus: input.fundingStatus ?? existing.fundingStatus,
          applicationWindowOpensAt: input.applicationWindowOpensAt ?? null,
          applicationWindowClosesAt: input.applicationWindowClosesAt ?? null,
          // Saving content must not change lifecycle state — reviewStatus,
          // reviewedAt/By, and publishedAt/By are preserved as-is.
          reviewStatus: existing.reviewStatus,
        },
      });
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
        })),
      });
      return this.getProgram(programId, tx);
    });
  }
}

export const savingsBenefitsAdminService = new SavingsBenefitsAdminService();
