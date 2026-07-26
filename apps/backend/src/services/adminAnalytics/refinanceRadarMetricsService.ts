import {
  DomainEventType,
  PropertyMortgageStatus,
  RefinanceEvaluationClaimStatus,
  RefinanceRadarState,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { resolveDateRange } from './schemas';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
}

type ProfileRow = {
  mortgageStatus: string;
  currentMortgageBalanceCents: number | null;
  interestRateBps: number | null;
  remainingTermMonths: number | null;
};

type SnapshotRow = { id: string; createdAt: Date };
type ClaimRow = {
  propertyId: string;
  snapshotId: string;
  status: string;
  completedAt: Date | null;
  snapshot: { createdAt: Date };
};
type DomainEventRow = {
  type: string;
  propertyId: string | null;
  payload: unknown;
};
type AnalyticsRow = {
  eventName: string | null;
  propertyId: string | null;
  valueNumeric: number | null;
  metadataJson: unknown;
};
type OpportunityRow = {
  id: string;
  monthlySavings: { toNumber(): number } | number;
  breakEvenMonths: number;
};
type NotificationRow = { entityId: string | null; createdAt: Date };

export interface RefinanceRadarMetricsInput {
  from: Date;
  to: Date;
  profiles: ProfileRow[];
  snapshots: SnapshotRow[];
  claims: ClaimRow[];
  domainEvents: DomainEventRow[];
  analyticsEvents: AnalyticsRow[];
  opportunities: OpportunityRow[];
  notifications: NotificationRow[];
  currentlyOpenProperties: number;
}

export function aggregateRefinanceRadarMetrics(input: RefinanceRadarMetricsInput) {
  const mortgagedProfiles = input.profiles.filter(
    (profile) => profile.mortgageStatus === PropertyMortgageStatus.MORTGAGED,
  );
  const eligibleProfiles = mortgagedProfiles.filter(
    (profile) =>
      profile.currentMortgageBalanceCents != null &&
      profile.interestRateBps != null &&
      profile.remainingTermMonths != null,
  );
  const expectedEvaluations = eligibleProfiles.length * input.snapshots.length;
  const completedClaims = input.claims.filter(
    (claim) => claim.status === RefinanceEvaluationClaimStatus.COMPLETED,
  );
  const completedWithin24Hours = completedClaims.filter(
    (claim) =>
      claim.completedAt != null &&
      claim.completedAt.getTime() - claim.snapshot.createdAt.getTime() <=
        24 * 60 * 60 * 1000,
  ).length;

  const refinanceEventTypes = new Set<string>([
      DomainEventType.REFINANCE_OPPORTUNITY_OPENED,
      DomainEventType.REFINANCE_OPPORTUNITY_UPDATED,
      DomainEventType.REFINANCE_OPPORTUNITY_CLOSED,
      DomainEventType.REFINANCE_DATA_REQUIRED,
    ]);
  const refinanceEvents = input.domainEvents.filter((event) =>
    refinanceEventTypes.has(event.type),
  );
  const transitionCount = (type: DomainEventType) =>
    refinanceEvents.filter((event) => event.type === type).length;
  const suppressionByReason: Record<string, number> = {};
  let admittedExternalAlerts = 0;
  for (const event of refinanceEvents) {
    const outcome = record(record(event.payload).processingOutcome);
    if (outcome.status === 'CREATED') admittedExternalAlerts += 1;
    if (outcome.status === 'SUPPRESSED') {
      const reason =
        typeof outcome.reason === 'string' ? outcome.reason : 'UNKNOWN';
      suppressionByReason[reason] = (suppressionByReason[reason] ?? 0) + 1;
    }
  }

  const eventCount = (name: string) =>
    input.analyticsEvents.filter((event) => event.eventName === name).length;
  const uniqueHomes = (name: string) =>
    new Set(
      input.analyticsEvents
        .filter((event) => event.eventName === name && event.propertyId)
        .map((event) => event.propertyId as string),
    ).size;
  const feedbackByType: Record<string, number> = {
    HELPFUL: 0,
    NOT_NOW: 0,
    NOT_RELEVANT: 0,
  };
  for (const event of input.analyticsEvents.filter(
    (item) => item.eventName === 'refinance_feedback_recorded',
  )) {
    const value = record(event.metadataJson).feedback;
    if (typeof value === 'string') {
      feedbackByType[value] = (feedbackByType[value] ?? 0) + 1;
    }
  }

  const opportunitySavings = input.opportunities.map((opportunity) =>
    typeof opportunity.monthlySavings === 'number'
      ? opportunity.monthlySavings
      : opportunity.monthlySavings.toNumber(),
  );
  const breakEvenValues = input.opportunities.map(
    (opportunity) => opportunity.breakEvenMonths,
  );

  const notificationsByProperty = new Map<string, Date[]>();
  for (const notification of input.notifications) {
    if (!notification.entityId) continue;
    const dates = notificationsByProperty.get(notification.entityId) ?? [];
    dates.push(notification.createdAt);
    notificationsByProperty.set(notification.entityId, dates);
  }
  let duplicateExternalAlerts = 0;
  for (const dates of notificationsByProperty.values()) {
    const sorted = dates.sort((left, right) => left.getTime() - right.getTime());
    for (let index = 1; index < sorted.length; index += 1) {
      if (
        sorted[index].getTime() - sorted[index - 1].getTime() <
        30 * 24 * 60 * 60 * 1000
      ) {
        duplicateExternalAlerts += 1;
      }
    }
  }

  const scenarioRuns =
    eventCount('refinance_scenario_run') +
    eventCount('refinance_scenario_saved');
  const opportunityViews = eventCount('refinance_opportunity_viewed');
  const homeCardOpens = eventCount('refinance_home_card_opened');
  const homeStatusChecks = eventCount('refinance_home_status_checked');
  const helpfulResponses = feedbackByType.HELPFUL ?? 0;
  const totalFeedback = Object.values(feedbackByType).reduce(
    (sum, value) => sum + value,
    0,
  );

  return {
    period: {
      from: input.from.toISOString(),
      to: input.to.toISOString(),
    },
    population: {
      mortgagedProfiles: mortgagedProfiles.length,
      eligibleProfiles: eligibleProfiles.length,
      eligibleProfileActivationRate: ratio(
        eligibleProfiles.length,
        mortgagedProfiles.length,
      ),
      currentlyOpenProperties: input.currentlyOpenProperties,
    },
    monitoring: {
      snapshotsInPeriod: input.snapshots.length,
      expectedEvaluations,
      claimsCreated: input.claims.length,
      completedEvaluations: completedClaims.length,
      completedWithin24Hours,
      evaluationCoverageRate: ratio(completedClaims.length, expectedEvaluations),
      coverageWithin24HoursRate: ratio(
        completedWithin24Hours,
        expectedEvaluations,
      ),
      failedClaims: input.claims.filter(
        (claim) => claim.status === RefinanceEvaluationClaimStatus.FAILED,
      ).length,
      deadLetteredClaims: input.claims.filter(
        (claim) => claim.status === RefinanceEvaluationClaimStatus.DEAD_LETTER,
      ).length,
    },
    transitions: {
      opened: transitionCount(DomainEventType.REFINANCE_OPPORTUNITY_OPENED),
      materiallyUpdated: transitionCount(
        DomainEventType.REFINANCE_OPPORTUNITY_UPDATED,
      ),
      closed: transitionCount(DomainEventType.REFINANCE_OPPORTUNITY_CLOSED),
      dataRequired: transitionCount(DomainEventType.REFINANCE_DATA_REQUIRED),
    },
    funnel: {
      opportunityViews,
      opportunityViewHomes: uniqueHomes('refinance_opportunity_viewed'),
      homeStatusChecks,
      homeCardOpens,
      homeToRadarConversionRate: ratio(homeCardOpens, homeStatusChecks),
      scenarioRuns,
      scenarioRunRate: ratio(scenarioRuns, opportunityViews),
      scenariosSaved: eventCount('refinance_scenario_saved'),
      markdownExports: eventCount('refinance_scenario_markdown_exported'),
      loanEstimateComparisons: eventCount(
        'refinance_loan_estimates_compared',
      ),
      loanEstimateComparisonsSaved: eventCount(
        'refinance_loan_estimate_comparison_saved',
      ),
      loanEstimateDocumentsExtracted: eventCount(
        'refinance_loan_estimate_extracted',
      ),
      loanEstimateImageOcrExtractions: input.analyticsEvents.filter(
        (event) =>
          event.eventName === 'refinance_loan_estimate_extracted' &&
          record(event.metadataJson).extractionMethod === 'IMAGE_OCR',
      ).length,
      loanEstimatePdfOcrExtractions: input.analyticsEvents.filter(
        (event) =>
          event.eventName === 'refinance_loan_estimate_extracted' &&
          record(event.metadataJson).extractionMethod === 'PDF_OCR',
      ).length,
      loanEstimatePageSetIssues: input.analyticsEvents.filter((event) => {
        if (event.eventName !== 'refinance_loan_estimate_extracted') {
          return false;
        }
        const status = record(event.metadataJson).pageSetStatus;
        return (
          typeof status === 'string' &&
          ['PARTIAL', 'DUPLICATE', 'OUT_OF_ORDER', 'UNVERIFIED'].includes(
            status,
          )
        );
      }).length,
      loanEstimatePagesProcessed: input.analyticsEvents
        .filter(
          (event) => event.eventName === 'refinance_loan_estimate_extracted',
        )
        .reduce((sum, event) => {
          const pageCount = record(event.metadataJson).pageCount;
          return sum +
            (typeof pageCount === 'number' && Number.isFinite(pageCount)
              ? pageCount
              : 1);
        }, 0),
      loanEstimateMarkdownExports: eventCount(
        'refinance_loan_estimate_markdown_exported',
      ),
      loanEstimateComparisonsDeleted: eventCount(
        'refinance_loan_estimate_comparison_deleted',
      ),
    },
    decisionQuality: {
      medianProjectedMonthlySavingsUsd: median(opportunitySavings),
      medianBreakEvenMonths: median(breakEvenValues),
      feedbackByType,
      helpfulRate: ratio(helpfulResponses, totalFeedback),
    },
    notifications: {
      admittedExternalAlerts,
      suppressionByReason,
      notificationRecords: input.notifications.length,
      duplicateExternalAlerts,
      duplicateRate: ratio(
        duplicateExternalAlerts,
        input.notifications.length,
      ),
    },
    guardrails: {
      inputsNotCurrentSuppressions:
        suppressionByReason.INPUTS_NOT_CURRENT ?? 0,
      noConsentSuppressions:
        suppressionByReason.NO_EXPLICIT_CONSENT ?? 0,
      cooldownSuppressions: suppressionByReason.COOLDOWN_ACTIVE ?? 0,
      confidenceSuppressions:
        suppressionByReason.CONFIDENCE_BELOW_PREFERENCE ?? 0,
      notificationPolicySuppressions:
        suppressionByReason.NOTIFICATION_POLICY ?? 0,
    },
    notes: [
      'Evaluation coverage uses the current eligible-profile population multiplied by snapshots created in the selected period.',
      'External alert suppression outcomes come from durable DomainEvent processingOutcome records.',
      'Projected savings and break-even medians use opportunities referenced by OPEN transition events.',
    ],
  };
}

export async function getRefinanceRadarMetrics(from?: Date, to?: Date) {
  const period = resolveDateRange(from, to, 30);
  const eventTypes = [
    DomainEventType.REFINANCE_OPPORTUNITY_OPENED,
    DomainEventType.REFINANCE_OPPORTUNITY_UPDATED,
    DomainEventType.REFINANCE_OPPORTUNITY_CLOSED,
    DomainEventType.REFINANCE_DATA_REQUIRED,
  ];
  const [
    profiles,
    snapshots,
    claims,
    domainEvents,
    analyticsEvents,
    notifications,
    currentlyOpenProperties,
  ] = await Promise.all([
    prisma.propertyFinancingProfile.findMany({
      select: {
        mortgageStatus: true,
        currentMortgageBalanceCents: true,
        interestRateBps: true,
        remainingTermMonths: true,
      },
    }),
    prisma.mortgageRateSnapshot.findMany({
      where: { createdAt: { gte: period.from, lte: period.to } },
      select: { id: true, createdAt: true },
    }),
    prisma.refinanceEvaluationClaim.findMany({
      where: {
        snapshot: { createdAt: { gte: period.from, lte: period.to } },
      },
      select: {
        propertyId: true,
        snapshotId: true,
        status: true,
        completedAt: true,
        snapshot: { select: { createdAt: true } },
      },
    }),
    prisma.domainEvent.findMany({
      where: {
        type: { in: eventTypes },
        createdAt: { gte: period.from, lte: period.to },
      },
      select: { type: true, propertyId: true, payload: true },
    }),
    prisma.productAnalyticsEvent.findMany({
      where: {
        featureKey: 'mortgage_refinance_radar',
        occurredAt: { gte: period.from, lte: period.to },
      },
      select: {
        eventName: true,
        propertyId: true,
        valueNumeric: true,
        metadataJson: true,
      },
    }),
    prisma.notification.findMany({
      where: {
        type: {
          in: [
            'REFINANCE_OPPORTUNITY_OPENED',
            'REFINANCE_OPPORTUNITY_UPDATED',
          ],
        },
        entityType: 'PROPERTY',
        createdAt: { gte: period.from, lte: period.to },
      },
      select: { entityId: true, createdAt: true },
    }),
    prisma.propertyRefinanceRadarState.count({
      where: { radarState: RefinanceRadarState.OPEN },
    }),
  ]);

  const opportunityIds = domainEvents
    .filter((event) => event.type === DomainEventType.REFINANCE_OPPORTUNITY_OPENED)
    .map((event) => record(event.payload).opportunityId)
    .filter((value): value is string => typeof value === 'string');
  const opportunities = opportunityIds.length > 0
    ? await prisma.refinanceOpportunity.findMany({
        where: { id: { in: opportunityIds } },
        select: {
          id: true,
          monthlySavings: true,
          breakEvenMonths: true,
        },
      })
    : [];

  return aggregateRefinanceRadarMetrics({
    from: period.from,
    to: period.to,
    profiles,
    snapshots,
    claims,
    domainEvents,
    analyticsEvents,
    opportunities,
    notifications,
    currentlyOpenProperties,
  });
}
