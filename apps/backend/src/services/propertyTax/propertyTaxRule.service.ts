import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

const DAY_MS = 24 * 60 * 60 * 1_000;

export type PropertyTaxDeadlineInput = {
  revisedNoticeDate?: string;
  revisedNoticeQualifies?: boolean;
};

type DeadlineRule = {
  id: string;
  code: string;
  type: string;
  label: string;
  trigger: 'FIXED_INSTANT' | 'DAYS_AFTER_NOTICE';
  fixedDeadlineAt: Date | null;
  daysAfterNotice: number | null;
  cutoffLocalTime: string;
  timezone: string;
  submissionRequirement: string | null;
  officialUrl: string;
  formCode: string | null;
  qualificationJson: Prisma.JsonValue | null;
};

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseDateOnly(value: string): {
  year: number;
  month: number;
  day: number;
} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
    ? { year, month, day }
    : null;
}

function offsetMinutes(at: Date, timezone: string): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  }).formatToParts(at).find((part) => part.type === 'timeZoneName')?.value;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name ?? '');
  if (!match) throw new Error(`Unable to resolve timezone offset for ${timezone}`);
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '+' ? minutes : -minutes;
}

function localCutoffToUtc(
  date: { year: number; month: number; day: number },
  cutoffLocalTime: string,
  timezone: string,
): Date {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(cutoffLocalTime);
  if (!match) throw new Error(`Invalid local cutoff time: ${cutoffLocalTime}`);
  const wallClock = new Date(Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    Number(match[1]),
    Number(match[2]),
  ));
  return new Date(wallClock.getTime() - offsetMinutes(wallClock, timezone) * 60_000);
}

function localDateKey(at: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function calculatePropertyTaxDeadline(
  rule: DeadlineRule,
  input: PropertyTaxDeadlineInput,
  now: Date,
) {
  let dueAt: Date | null = null;
  let availability:
    | 'AVAILABLE'
    | 'NEEDS_NOTICE_DATE'
    | 'NEEDS_QUALIFICATION_CONFIRMATION' = 'AVAILABLE';
  if (rule.trigger === 'FIXED_INSTANT') {
    dueAt = rule.fixedDeadlineAt;
    if (!dueAt) throw new Error(`Fixed deadline ${rule.code} lacks fixedDeadlineAt`);
  } else {
    if (!input.revisedNoticeDate) {
      availability = 'NEEDS_NOTICE_DATE';
    } else if (input.revisedNoticeQualifies !== true) {
      availability = 'NEEDS_QUALIFICATION_CONFIRMATION';
    } else {
      const noticeDate = parseDateOnly(input.revisedNoticeDate);
      if (!noticeDate) throw new Error('revisedNoticeDate must use YYYY-MM-DD');
      if (!Number.isInteger(rule.daysAfterNotice) || rule.daysAfterNotice! < 1) {
        throw new Error(`Relative deadline ${rule.code} lacks daysAfterNotice`);
      }
      const dueDate = new Date(
        Date.UTC(noticeDate.year, noticeDate.month - 1, noticeDate.day)
        + rule.daysAfterNotice! * DAY_MS,
      );
      dueAt = localCutoffToUtc({
        year: dueDate.getUTCFullYear(),
        month: dueDate.getUTCMonth() + 1,
        day: dueDate.getUTCDate(),
      }, rule.cutoffLocalTime, rule.timezone);
    }
  }
  const remainingDays = dueAt
    ? Math.ceil((dueAt.getTime() - now.getTime()) / DAY_MS)
    : null;
  return {
    id: rule.id,
    code: rule.code,
    type: rule.type,
    label: rule.label,
    availability,
    status: dueAt
      ? dueAt.getTime() < now.getTime()
        ? 'PAST_DUE'
        : remainingDays !== null && remainingDays <= 30
          ? 'DUE_SOON'
          : 'OPEN'
      : 'INPUT_REQUIRED',
    dueAt: dueAt?.toISOString() ?? null,
    dueLocalDate: dueAt ? localDateKey(dueAt, rule.timezone) : null,
    remainingDays,
    timezone: rule.timezone,
    cutoffLocalTime: rule.cutoffLocalTime,
    submissionRequirement: rule.submissionRequirement,
    officialUrl: rule.officialUrl,
    formCode: rule.formCode,
    qualifications: rule.qualificationJson,
  };
}

export class PropertyTaxRuleService {
  constructor(private readonly db = prisma) {}

  async getForProperty(
    propertyId: string,
    userId: string,
    input: PropertyTaxDeadlineInput = {},
    now = new Date(),
  ) {
    const property = await this.db.property.findFirst({
      where: { id: propertyId, homeownerProfile: { userId } },
      select: {
        id: true,
        taxAssessmentRecords: {
          where: {
            sourceType: 'OFFICIAL_SOURCE',
            status: { in: ['ACTIVE', 'CONFLICTED'] },
          },
          orderBy: [{ taxYear: 'desc' }, { observedAt: 'desc' }],
          take: 1,
          select: {
            id: true,
            jurisdictionId: true,
            dataSource: {
              select: { slug: true, queryFilterJson: true },
            },
          },
        },
      },
    });
    if (!property) throw new Error('Property not found');
    const assessment = property.taxAssessmentRecords[0];
    if (!assessment?.dataSource) {
      return {
        coverage: 'UNAVAILABLE' as const,
        reason:
          'A verified official assessment match is required before jurisdiction rules are shown.',
        profile: null,
        deadlines: [],
      };
    }
    const sourceControls = jsonObject(assessment.dataSource.queryFilterJson);
    const propertyClass = typeof sourceControls.curtaxclass === 'string'
      ? sourceControls.curtaxclass
      : null;
    if (!propertyClass) {
      return {
        coverage: 'UNAVAILABLE' as const,
        reason: 'The official source did not establish a reviewed property class.',
        profile: null,
        deadlines: [],
      };
    }

    const activeProfile = await this.db.propertyTaxRuleProfile.findFirst({
      where: {
        jurisdictionId: assessment.jurisdictionId,
        propertyClass,
        status: 'ACTIVE',
      },
      orderBy: [{ version: 'desc' }],
      include: {
        citations: { orderBy: { retrievedAt: 'desc' } },
        deadlineRules: { orderBy: { code: 'asc' } },
      },
    });
    const profile = activeProfile
      ?? await this.db.propertyTaxRuleProfile.findFirst({
        where: {
          jurisdictionId: assessment.jurisdictionId,
          propertyClass,
        },
        orderBy: [{ version: 'desc' }],
        include: {
          citations: { orderBy: { retrievedAt: 'desc' } },
          deadlineRules: { orderBy: { code: 'asc' } },
        },
      });
    if (!profile) {
      return {
        coverage: 'UNAVAILABLE' as const,
        reason: 'No reviewed rule profile covers this jurisdiction and property class.',
        profile: null,
        deadlines: [],
      };
    }
    if (profile.status === 'DISABLED') {
      return {
        coverage: 'DISABLED' as const,
        reason: profile.disabledReason
          ?? 'This jurisdiction rule was disabled by an operator.',
        profile: null,
        deadlines: [],
      };
    }
    if (
      profile.status !== 'ACTIVE'
      || profile.effectiveFrom > now
      || (profile.effectiveTo && profile.effectiveTo < now)
      || profile.expiresAt < now
    ) {
      return {
        coverage: profile.expiresAt < now
          ? 'EXPIRED' as const
          : 'UNAVAILABLE' as const,
        reason: 'The reviewed rule profile is not currently effective.',
        profile: null,
        deadlines: [],
      };
    }
    const qualifications = jsonObject(profile.qualificationJson);
    if (
      qualifications.sourceSlug
      && qualifications.sourceSlug !== assessment.dataSource.slug
    ) {
      return {
        coverage: 'UNAVAILABLE' as const,
        reason: 'The rule profile does not qualify this official source.',
        profile: null,
        deadlines: [],
      };
    }

    return {
      coverage: 'REVIEWED' as const,
      reason: null,
      profile: {
        id: profile.id,
        slug: profile.slug,
        version: profile.version,
        title: profile.title,
        summary: profile.summary,
        propertyClass: profile.propertyClass,
        taxYearLabel: profile.taxYearLabel,
        timezone: profile.timezone,
        assessmentRatio: profile.assessmentRatio?.toNumber() ?? null,
        valuationRules: profile.valuationRulesJson,
        classifications: profile.classificationsJson,
        caps: profile.capsJson,
        exemptions: profile.exemptionsJson,
        correctionGrounds: profile.correctionGroundsJson,
        appealGrounds: profile.appealGroundsJson,
        stages: profile.stagesJson,
        forms: profile.formsJson,
        fees: profile.feesJson,
        officialLinks: profile.officialLinksJson,
        effectiveFrom: profile.effectiveFrom.toISOString(),
        effectiveTo: profile.effectiveTo?.toISOString() ?? null,
        reviewedAt: profile.reviewedAt.toISOString(),
        reviewerName: profile.reviewerName,
        expiresAt: profile.expiresAt.toISOString(),
        citations: profile.citations.map((citation) => ({
          title: citation.title,
          publisher: citation.publisher,
          officialUrl: citation.officialUrl,
          retrievedAt: citation.retrievedAt.toISOString(),
          effectiveAt: citation.effectiveAt?.toISOString() ?? null,
          notes: citation.notes,
        })),
      },
      deadlines: profile.deadlineRules.map((rule) =>
        calculatePropertyTaxDeadline(
          rule as DeadlineRule,
          input,
          now,
        )),
    };
  }
}

export const propertyTaxRuleService = new PropertyTaxRuleService();
