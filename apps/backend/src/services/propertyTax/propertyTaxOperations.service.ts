import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  recordAdminAction,
  type RecordAdminActionInput,
} from '../adminAudit.service';

const PROPERTY_TAX_AI_SETTING = 'property_tax_ai_enabled';
const SOURCE_STALE_AFTER_MS = 72 * 60 * 60 * 1000;
const RULE_EXPIRING_WITHIN_MS = 30 * 24 * 60 * 60 * 1000;
const ACTIVE_CASE_STATUSES = [
  'PREPARING',
  'PACKET_READY',
  'FILED',
  'AWAITING_RESPONSE',
  'RESPONSE_RECEIVED',
  'HEARING_SCHEDULED',
  'DETERMINED',
] as const;

type AuditWriter = (input: RecordAdminActionInput) => Promise<void>;

export class PropertyTaxOperationsService {
  constructor(
    private readonly db = prisma,
    private readonly writeAudit: AuditWriter = recordAdminAction,
  ) {}

  async getDashboard(now = new Date()) {
    const staleBefore = new Date(now.getTime() - SOURCE_STALE_AFTER_MS);
    const ruleExpiringBefore = new Date(now.getTime() + RULE_EXPIRING_WITHIN_MS);

    const [
      sources,
      rules,
      aiSetting,
      falseMatchCount,
      missedReminderCount,
      staleRuleCaseCount,
      unsupportedClaimCount,
      extractionFailureCount,
    ] = await Promise.all([
      this.db.taxAssessorDataSource.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: {
              parcelMatches: true,
              assessmentRecords: true,
              billRecords: true,
            },
          },
        },
      }),
      this.db.propertyTaxRuleProfile.findMany({
        orderBy: [{ status: 'asc' }, { expiresAt: 'asc' }],
        include: {
          jurisdiction: {
            select: { normalizedKey: true },
          },
          _count: {
            select: {
              citations: true,
              deadlineRules: true,
              appealCases: true,
            },
          },
          controlEvents: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              action: true,
              actorUserId: true,
              reason: true,
              createdAt: true,
            },
          },
        },
      }),
      this.db.systemSetting.findUnique({
        where: { key: PROPERTY_TAX_AI_SETTING },
      }),
      this.db.propertyTaxParcelMatch.count({
        where: {
          status: { in: ['AMBIGUOUS', 'CONFLICTED', 'REJECTED'] },
        },
      }),
      this.db.propertyTaxAppealReminder.count({
        where: {
          status: 'PENDING',
          dueAt: { lt: now },
          appealCase: {
            status: { in: [...ACTIVE_CASE_STATUSES] },
          },
        },
      }),
      this.db.propertyTaxAppealCase.count({
        where: {
          status: { in: [...ACTIVE_CASE_STATUSES] },
          OR: [
            { ruleProfile: { status: { not: 'ACTIVE' } } },
            { ruleProfile: { expiresAt: { lte: now } } },
          ],
        },
      }),
      this.db.propertyTaxAppealCase.count({
        where: {
          officialFormUrl: '',
        },
      }),
      this.db.propertyTaxDocumentIntake.count({
        where: { status: 'EXTRACTION_FAILED' },
      }),
    ]);

    const aiEnabled = aiSetting?.value === true;
    const normalizedSources = sources.map((source) => {
      const stale = source.status === 'ACTIVE'
        && (!source.lastFetchAt || source.lastFetchAt < staleBefore);
      return {
        id: source.id,
        name: source.name,
        slug: source.slug,
        status: source.status,
        adapterType: source.adapterType,
        normalizedCoverageKey: source.normalizedCoverageKey,
        lastFetchAt: source.lastFetchAt?.toISOString() ?? null,
        lastFetchError: source.lastFetchError,
        stale,
        health: source.status !== 'ACTIVE'
          ? 'DISABLED'
          : source.lastFetchError
            ? 'DEGRADED'
            : stale
              ? 'STALE'
              : 'HEALTHY',
        counts: source._count,
      };
    });
    const normalizedRules = rules.map((rule) => {
      const expired = rule.expiresAt <= now;
      const expiringSoon = !expired && rule.expiresAt <= ruleExpiringBefore;
      return {
        id: rule.id,
        title: rule.title,
        version: rule.version,
        status: rule.status,
        jurisdictionKey: rule.jurisdiction.normalizedKey,
        propertyClass: rule.propertyClass,
        reviewedAt: rule.reviewedAt.toISOString(),
        expiresAt: rule.expiresAt.toISOString(),
        expired,
        expiringSoon,
        counts: rule._count,
        latestControl: rule.controlEvents[0]
          ? {
              ...rule.controlEvents[0],
              createdAt: rule.controlEvents[0].createdAt.toISOString(),
            }
          : null,
      };
    });

    const guardrails = [
      {
        code: 'FALSE_MATCH',
        severity: falseMatchCount > 0 ? 'WARNING' : 'HEALTHY',
        count: falseMatchCount,
        explanation: 'Ambiguous, conflicting, and rejected parcel matches remain suppressed from canonical promotion.',
      },
      {
        code: 'MISSED_DEADLINE_RISK',
        severity: missedReminderCount > 0 ? 'CRITICAL' : 'HEALTHY',
        count: missedReminderCount,
        explanation: 'Pending appeal-case reminders whose homeowner-recorded due date has passed.',
      },
      {
        code: 'UNSUPPORTED_CLAIM',
        severity: unsupportedClaimCount > 0 ? 'CRITICAL' : 'HEALTHY',
        count: unsupportedClaimCount,
        explanation: 'Appeal cases missing an official reviewed form URL; case creation should fail closed before this state.',
      },
      {
        code: 'STALE_RULE',
        severity: staleRuleCaseCount > 0 ? 'CRITICAL' : 'HEALTHY',
        count: staleRuleCaseCount,
        explanation: 'Open appeal cases linked to a disabled, superseded, or expired rule release.',
      },
      {
        code: 'DOCUMENT_EXTRACTION_FAILURE',
        severity: extractionFailureCount > 0 ? 'WARNING' : 'HEALTHY',
        count: extractionFailureCount,
        explanation: 'Failed document extractions remain outside canonical evidence until manually reviewed.',
      },
    ] as const;

    return {
      generatedAt: now.toISOString(),
      sourceStaleAfterHours: SOURCE_STALE_AFTER_MS / 3_600_000,
      sources: normalizedSources,
      rules: normalizedRules,
      ai: {
        enabled: aiEnabled,
        status: aiEnabled ? 'ENABLED' : 'DISABLED',
        failClosed: true,
        reason: aiEnabled
          ? 'AI processing was explicitly enabled by an operator setting.'
          : 'Property-tax document extraction and appeal narratives remain manual unless explicitly enabled.',
        updatedAt: aiSetting?.updatedAt.toISOString() ?? null,
      },
      guardrails,
      summary: {
        sourcesTotal: normalizedSources.length,
        sourcesDegraded: normalizedSources.filter((source) => source.health !== 'HEALTHY').length,
        activeRules: normalizedRules.filter((rule) => rule.status === 'ACTIVE' && !rule.expired).length,
        rulesExpiringSoon: normalizedRules.filter((rule) => rule.status === 'ACTIVE' && rule.expiringSoon).length,
        criticalGuardrails: guardrails.filter((guardrail) => guardrail.severity === 'CRITICAL').length,
      },
    };
  }

  async setSourceEnabled(input: {
    sourceId: string;
    enabled: boolean;
    actorUserId: string;
    reason: string;
    req?: RecordAdminActionInput['req'];
  }) {
    if (input.reason.trim().length < 8) {
      throw new Error('Source control requires a specific reason');
    }
    const source = await this.db.taxAssessorDataSource.findUnique({
      where: { id: input.sourceId },
    });
    if (!source) throw new Error('Property-tax source not found');

    const nextStatus = input.enabled ? 'ACTIVE' : 'INACTIVE';
    const updated = await this.db.taxAssessorDataSource.update({
      where: { id: source.id },
      data: { status: nextStatus },
    });
    await this.writeAudit({
      actorId: input.actorUserId,
      action: input.enabled
        ? 'PROPERTY_TAX_SOURCE_ENABLED'
        : 'PROPERTY_TAX_SOURCE_EMERGENCY_DISABLED',
      entityType: 'TaxAssessorDataSource',
      entityId: source.id,
      capability: 'INTEGRATION_MANAGE',
      reason: input.reason.trim(),
      oldValues: { status: source.status } as Prisma.InputJsonValue,
      newValues: { status: updated.status } as Prisma.InputJsonValue,
      req: input.req,
    });
    return updated;
  }

  async emergencyDisableAi(input: {
    actorUserId: string;
    reason: string;
    req?: RecordAdminActionInput['req'];
  }) {
    if (input.reason.trim().length < 8) {
      throw new Error('AI emergency disable requires a specific reason');
    }
    const previous = await this.db.systemSetting.findUnique({
      where: { key: PROPERTY_TAX_AI_SETTING },
    });
    const setting = await this.db.systemSetting.upsert({
      where: { key: PROPERTY_TAX_AI_SETTING },
      create: {
        key: PROPERTY_TAX_AI_SETTING,
        value: false,
        description: 'Fail-closed switch for property-tax AI document extraction and appeal narrative processing.',
      },
      update: {
        value: false,
        description: 'Fail-closed switch for property-tax AI document extraction and appeal narrative processing.',
      },
    });
    await this.writeAudit({
      actorId: input.actorUserId,
      action: 'PROPERTY_TAX_AI_EMERGENCY_DISABLED',
      entityType: 'SystemSetting',
      entityId: PROPERTY_TAX_AI_SETTING,
      capability: 'INTEGRATION_MANAGE',
      reason: input.reason.trim(),
      oldValues: { enabled: previous?.value === true } as Prisma.InputJsonValue,
      newValues: { enabled: false } as Prisma.InputJsonValue,
      req: input.req,
    });
    return setting;
  }
}

export const propertyTaxOperationsService =
  new PropertyTaxOperationsService();
