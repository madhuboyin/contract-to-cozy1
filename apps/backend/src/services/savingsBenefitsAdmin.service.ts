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
  HiddenAssetProgramReviewStatus,
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
  rules: HiddenAssetProgramRuleInput[];
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

  async getProgram(programId: string) {
    const program = await prisma.hiddenAssetProgram.findUnique({
      where: { id: programId },
      include: { source: true, rules: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!program) throw new Error('Program not found');
    return program;
  }

  async createProgram(input: HiddenAssetProgramInput) {
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
          groupKey: rule.groupKey ?? null,
        })),
      });
      return this.getProgram(program.id);
    });
  }

  async updateProgram(programId: string, input: HiddenAssetProgramInput) {
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
          groupKey: rule.groupKey ?? null,
        })),
      });
      return this.getProgram(programId);
    });
  }
}

export const savingsBenefitsAdminService = new SavingsBenefitsAdminService();
