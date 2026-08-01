import {
  DomainEventType,
  PropertyMortgageStatus,
  RefinanceEvaluationClaimStatus,
  RefinanceRadarState,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { resolveDateRange } from './schemas';

type JsonRecord = Record<string, unknown>;

const MIN_SENSITIVE_VALUE_OBSERVATIONS = 5;
const MIN_SENSITIVE_VALUE_PROPERTIES = 5;
const MIN_USEFULNESS_RESPONSES = 20;
const MIN_NOTIFICATION_RECORDS = 20;
const APPROVED_HELPFUL_RATE = 0.6;
const APPROVED_DUPLICATE_RATE = 0.05;

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
  createdAt?: Date;
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
type MoneyValue = { toNumber(): number } | number | null;
type DecisionRow = {
  id: string;
  propertyId: string;
  status: string;
  radarOpportunityId: string | null;
  nextReviewAt: Date | null;
  metadataJson: unknown;
  createdAt: Date;
  radarOpportunity: null | { monthlySavings: MoneyValue; closingCostAssumption: MoneyValue };
  scenarioSnapshot: null | { monthlySavings: MoneyValue; closingCost: MoneyValue };
  history: Array<{ fromStatus: string | null; toStatus: string; occurredAt: Date }>;
};

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
  decisions: DecisionRow[];
  currentlyOpenProperties: number;
}

function money(value: MoneyValue): number | null {
  if (value == null) return null;
  const numeric = typeof value === 'number' ? value : value.toNumber();
  return Number.isFinite(numeric) ? numeric : null;
}

function cents(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value / 100 : null;
}

function statusAtReportEnd(decision: DecisionRow): string {
  return decision.history.at(-1)?.toStatus ?? decision.status;
}

function reached(decision: DecisionRow, status: string): boolean {
  return decision.history.length === 0
    ? decision.status === status
    : decision.history.some((item) => item.toStatus === status);
}

function reachedAfter(decision: DecisionRow, before: string, after: string): boolean {
  const beforeIndex = decision.history.findIndex((item) => item.toStatus === before);
  return beforeIndex >= 0 && decision.history.slice(beforeIndex + 1).some((item) => item.toStatus === after);
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
  const opportunityProperties = new Set(
    refinanceEvents.flatMap((event) =>
      event.type === DomainEventType.REFINANCE_OPPORTUNITY_OPENED && event.propertyId
        ? [event.propertyId]
        : []),
  ).size;
  const opportunityAggregatesVisible =
    input.opportunities.length >= MIN_SENSITIVE_VALUE_OBSERVATIONS &&
    opportunityProperties >= MIN_SENSITIVE_VALUE_PROPERTIES;

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

  const decisionDistribution = input.decisions.reduce<Record<string, number>>(
    (counts, decision) => {
      const status = statusAtReportEnd(decision);
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const openedEvents = refinanceEvents.filter(
    (event) => event.type === DomainEventType.REFINANCE_OPPORTUNITY_OPENED,
  );
  const openingByOpportunity = new Map<string, Date>();
  for (const event of openedEvents) {
    const payload = record(event.payload);
    const opportunityId = payload.opportunityId;
    const occurredAt = typeof payload.occurredAt === 'string'
      ? new Date(payload.occurredAt)
      : event.createdAt;
    if (typeof opportunityId === 'string' && occurredAt && !Number.isNaN(occurredAt.getTime())) {
      openingByOpportunity.set(opportunityId, occurredAt);
    }
  }
  const linkedDecisions = input.decisions.filter((decision) =>
    decision.radarOpportunityId && openingByOpportunity.has(decision.radarOpportunityId));
  const openToDecisionHours = linkedDecisions.flatMap((decision) => {
    const openedAt = openingByOpportunity.get(decision.radarOpportunityId as string);
    const decidedAt = decision.history[0]?.occurredAt ?? decision.createdAt;
    if (!openedAt || decidedAt < openedAt) return [];
    return [(decidedAt.getTime() - openedAt.getTime()) / (60 * 60 * 1000)];
  });
  const deferred = input.decisions.filter((decision) => reached(decision, 'DEFERRED'));
  const returnStatuses = new Set([
    'EXPLORING',
    'KEEP_CURRENT_LOAN',
    'PROCEEDING',
    'OFFER_SELECTED',
    'APPLICATION_IN_PROGRESS',
    'CLOSED',
  ]);
  const returnedAfterDeferral = deferred.filter((decision) =>
    decision.history.some((item, index) => item.toStatus === 'DEFERRED' &&
      decision.history.slice(index + 1).some((later) => returnStatuses.has(later.toStatus))));
  const selected = input.decisions.filter((decision) => reached(decision, 'OFFER_SELECTED'));
  const applications = input.decisions.filter((decision) => reached(decision, 'APPLICATION_IN_PROGRESS'));
  const closed = input.decisions.filter((decision) => reached(decision, 'CLOSED'));
  const reopened = input.decisions.filter((decision) =>
    ['DEFERRED', 'KEEP_CURRENT_LOAN', 'DECLINED', 'ABANDONED'].some((status) =>
      reachedAfter(decision, status, 'EXPLORING')));
  const stale = input.decisions.filter((decision) =>
    statusAtReportEnd(decision) === 'DEFERRED' && decision.nextReviewAt != null && decision.nextReviewAt < input.to);
  const staleOrReopened = new Set([...stale, ...reopened].map((decision) => decision.id));

  const verifiedOutcomeRows = closed.flatMap((decision) => {
    const closing = record(record(decision.metadataJson).verifiedClosing);
    if (!closing.confirmedAt) return [];
    const prior = record(closing.priorMortgage);
    const next = record(closing.newMortgage);
    const priorPayment = cents(prior.monthlyPaymentCents);
    const newPayment = cents(next.monthlyPaymentCents);
    const recordedMonthlySavings = priorPayment != null && newPayment != null
      ? priorPayment - newPayment
      : null;
    const projectedMonthlySavings = money(
      decision.scenarioSnapshot?.monthlySavings ?? decision.radarOpportunity?.monthlySavings ?? null,
    );
    const projectedClosingCost = money(
      decision.scenarioSnapshot?.closingCost ?? decision.radarOpportunity?.closingCostAssumption ?? null,
    );
    return [{
      propertyId: decision.propertyId,
      projectedMonthlySavings,
      recordedMonthlySavings,
      projectedClosingCost,
      recordedClosingCost: cents(next.closingCostCents),
      canonicalFinancingWritebackCompleted: closing.canonicalFinancingWritebackCompleted === true,
    }];
  });
  const verifiedOutcomeProperties = new Set(verifiedOutcomeRows.map((row) => row.propertyId)).size;
  const outcomeAggregatesVisible =
    verifiedOutcomeRows.length >= MIN_SENSITIVE_VALUE_OBSERVATIONS &&
    verifiedOutcomeProperties >= MIN_SENSITIVE_VALUE_PROPERTIES;
  const visibleMedian = (values: Array<number | null>) => outcomeAggregatesVisible
    ? median(values.filter((value): value is number => value != null))
    : null;
  const paymentVariances = verifiedOutcomeRows.map((row) =>
    row.projectedMonthlySavings != null && row.recordedMonthlySavings != null
      ? row.recordedMonthlySavings - row.projectedMonthlySavings
      : null);
  const closingCostVariances = verifiedOutcomeRows.map((row) =>
    row.projectedClosingCost != null && row.recordedClosingCost != null
      ? row.recordedClosingCost - row.projectedClosingCost
      : null);
  const quoteComparisons = eventCount('refinance_loan_estimates_compared');
  const usefulnessEligible = totalFeedback >= MIN_USEFULNESS_RESPONSES;
  const duplicateEligible = input.notifications.length >= MIN_NOTIFICATION_RECORDS;

  return {
    metricVersion: 'refinance-radar-outcomes-v2',
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
      loanEstimateHandoffPackages: eventCount(
        'refinance_loan_estimate_handoff_package_exported',
      ),
      loanEstimateComparisonsDeleted: eventCount(
        'refinance_loan_estimate_comparison_deleted',
      ),
      opportunitiesOpened: openedEvents.length,
      decisionsRecorded: linkedDecisions.length,
      opportunityToDecisionRate: ratio(linkedDecisions.length, openedEvents.length),
      medianOpenToDecisionHours: median(openToDecisionHours),
      decisionDistribution,
      deferredDecisions: deferred.length,
      returnedAfterDeferral: returnedAfterDeferral.length,
      deferToReturnRate: ratio(returnedAfterDeferral.length, deferred.length),
      offersSelected: selected.length,
      quoteComparisonToSelectionRate: ratio(selected.length, quoteComparisons),
      applicationsStarted: applications.length,
      selectionToApplicationRate: ratio(
        selected.filter((decision) => reachedAfter(decision, 'OFFER_SELECTED', 'APPLICATION_IN_PROGRESS')).length,
        selected.length,
      ),
      refinanceClosings: closed.length,
      applicationToCloseRate: ratio(
        applications.filter((decision) => reachedAfter(decision, 'APPLICATION_IN_PROGRESS', 'CLOSED')).length,
        applications.length,
      ),
      staleOrReopenedDecisions: staleOrReopened.size,
      staleOrReopenedDecisionRate: ratio(staleOrReopened.size, input.decisions.length),
    },
    decisionQuality: {
      aggregateValuesSuppressed: !opportunityAggregatesVisible,
      medianProjectedMonthlySavingsUsd: opportunityAggregatesVisible ? median(opportunitySavings) : null,
      medianBreakEvenMonths: opportunityAggregatesVisible ? median(breakEvenValues) : null,
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
    verifiedOutcomes: {
      verifiedClosingCount: verifiedOutcomeRows.length,
      distinctPropertyCount: verifiedOutcomeProperties,
      canonicalMortgageWritebacks: verifiedOutcomeRows.filter(
        (row) => row.canonicalFinancingWritebackCompleted,
      ).length,
      canonicalMortgageWritebackCompletionRate: ratio(
        verifiedOutcomeRows.filter((row) => row.canonicalFinancingWritebackCompleted).length,
        verifiedOutcomeRows.length,
      ),
      aggregateValuesSuppressed: !outcomeAggregatesVisible,
      minimumObservationCount: MIN_SENSITIVE_VALUE_OBSERVATIONS,
      minimumDistinctProperties: MIN_SENSITIVE_VALUE_PROPERTIES,
      medianProjectedMonthlySavingsUsd: visibleMedian(verifiedOutcomeRows.map((row) => row.projectedMonthlySavings)),
      medianRecordedMonthlySavingsUsd: visibleMedian(verifiedOutcomeRows.map((row) => row.recordedMonthlySavings)),
      medianMonthlySavingsVarianceUsd: visibleMedian(paymentVariances),
      medianProjectedClosingCostUsd: visibleMedian(verifiedOutcomeRows.map((row) => row.projectedClosingCost)),
      medianRecordedClosingCostUsd: visibleMedian(verifiedOutcomeRows.map((row) => row.recordedClosingCost)),
      medianClosingCostVarianceUsd: visibleMedian(closingCostVariances),
    },
    controlledOptimization: {
      approvedThresholds: {
        minimumUsefulnessResponses: MIN_USEFULNESS_RESPONSES,
        helpfulRate: APPROVED_HELPFUL_RATE,
        minimumNotificationRecords: MIN_NOTIFICATION_RECORDS,
        maximumDuplicateRate: APPROVED_DUPLICATE_RATE,
      },
      usefulnessGate: usefulnessEligible
        ? (ratio(helpfulResponses, totalFeedback) ?? 0) >= APPROVED_HELPFUL_RATE ? 'PASS' : 'FAIL'
        : 'INSUFFICIENT_SAMPLE',
      duplicateGate: duplicateEligible
        ? (ratio(duplicateExternalAlerts, input.notifications.length) ?? 1) <= APPROVED_DUPLICATE_RATE ? 'PASS' : 'FAIL'
        : 'INSUFFICIENT_SAMPLE',
      optimizationApproved: usefulnessEligible && duplicateEligible &&
        (ratio(helpfulResponses, totalFeedback) ?? 0) >= APPROVED_HELPFUL_RATE &&
        (ratio(duplicateExternalAlerts, input.notifications.length) ?? 1) <= APPROVED_DUPLICATE_RATE,
    },
    privacy: {
      authorization: 'ADMIN_MFA_ANALYTICS_VIEW',
      propertyLevelRowsIncluded: false,
      rawMortgageValuesIncluded: false,
      sensitiveAggregateMinimumObservations: MIN_SENSITIVE_VALUE_OBSERVATIONS,
      sensitiveAggregateMinimumDistinctProperties: MIN_SENSITIVE_VALUE_PROPERTIES,
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
      'Projected savings and break-even medians use opportunities referenced by OPEN transition events and share the low-volume privacy floor.',
      'Decision completion comes only from durable decision history; views, exports, and downloads never count as completion.',
      'Verified outcome values are aggregated only after minimum observation and distinct-property thresholds are met; raw mortgage values are never returned.',
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
    decisions,
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
      select: { type: true, propertyId: true, payload: true, createdAt: true },
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
    prisma.refinanceDecision.findMany({
      where: {
        OR: [
          { history: { some: { occurredAt: { gte: period.from, lte: period.to } } } },
          { status: 'DEFERRED', nextReviewAt: { lt: period.to } },
        ],
      },
      select: {
        id: true,
        propertyId: true,
        status: true,
        radarOpportunityId: true,
        nextReviewAt: true,
        metadataJson: true,
        createdAt: true,
        radarOpportunity: { select: { monthlySavings: true, closingCostAssumption: true } },
        scenarioSnapshot: { select: { monthlySavings: true, closingCost: true } },
        history: {
          where: { occurredAt: { lte: period.to } },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          select: { fromStatus: true, toStatus: true, occurredAt: true },
        },
      },
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
    decisions,
    currentlyOpenProperties,
  });
}
