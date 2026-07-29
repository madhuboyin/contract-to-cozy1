import { prisma } from '../../lib/prisma';
import { resolveDateRange } from './schemas';

const MIN_INTERNAL_BENCHMARK_OBSERVATIONS = 20;
const MIN_INTERNAL_BENCHMARK_PROPERTIES = 10;
const database = prisma as any;

type WorkspaceMetricRow = {
  id: string;
  propertyId: string;
  outcome: string;
  journeyStage: string;
  outcomeMeasurementConsentedAt?: Date | null;
  outcomeMeasurementConsentRevokedAt?: Date | null;
  quotes: Array<{ readinessStage: string; homeownerConfirmedAt: Date | null }>;
  transitions: Array<{ toStage: string; outcome: string }>;
  booking?: { status: string; finalPrice: unknown; completedAt: Date | null } | null;
};

type CheckMetricRow = {
  serviceCategory: string;
  pricingFactorsJson: unknown;
};

type AnalyticsMetricRow = {
  eventName: string | null;
  propertyId: string | null;
  valueNumeric: number | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function aggregateServiceQuoteDecisionMetrics(input: {
  from: Date;
  to: Date;
  workspaces: WorkspaceMetricRow[];
  checks: CheckMetricRow[];
  analyticsEvents: AnalyticsMetricRow[];
  benchmarkSources: Array<{
    isActive: boolean;
    rightsStatus: string;
    reviewStatus: string;
    health?: { status: string } | null;
  }>;
}) {
  const countEvent = (name: string) =>
    input.analyticsEvents.filter((event) => event.eventName === name).length;
  const decisions = input.workspaces.filter((workspace) => workspace.outcome !== 'OPEN');
  const completed = input.workspaces.filter((workspace) => workspace.outcome === 'COMPLETED');
  const booked = input.workspaces.filter((workspace) =>
    ['BOOKED', 'COMPLETED'].includes(workspace.outcome));
  const accepted = input.workspaces.filter((workspace) =>
    ['ACCEPTED', 'BOOKED', 'COMPLETED'].includes(workspace.outcome));
  const comparisonReached = input.workspaces.filter((workspace) =>
    workspace.transitions.some((transition) => transition.toStage === 'COMPARISON'));
  const confirmedQuotes = input.workspaces.flatMap((workspace) => workspace.quotes)
    .filter((quote) => Boolean(quote.homeownerConfirmedAt));
  const comparisonReadyQuotes = confirmedQuotes.filter(
    (quote) => quote.readinessStage === 'COMPARISON_READY',
  );

  const evidenceByCategory = new Map<string, { total: number; qualified: number }>();
  let qualifiedChecks = 0;
  for (const check of input.checks) {
    const benchmark = record(record(check.pricingFactorsJson).benchmark);
    const qualified = benchmark.evidenceLevel === 'QUALIFIED_BENCHMARK';
    if (qualified) qualifiedChecks += 1;
    const current = evidenceByCategory.get(check.serviceCategory) ?? { total: 0, qualified: 0 };
    current.total += 1;
    if (qualified) current.qualified += 1;
    evidenceByCategory.set(check.serviceCategory, current);
  }

  const consentedCompleted = completed.filter((workspace) =>
    Boolean(workspace.outcomeMeasurementConsentedAt)
    && !workspace.outcomeMeasurementConsentRevokedAt);
  const verifiedFinalPriceEvents = input.analyticsEvents.filter(
    (event) => event.eventName === 'service_quote_work_completed' && event.valueNumeric != null,
  );
  const distinctLearningProperties = new Set(
    verifiedFinalPriceEvents.flatMap((event) => event.propertyId ? [event.propertyId] : []),
  ).size;
  const learningEligible =
    verifiedFinalPriceEvents.length >= MIN_INTERNAL_BENCHMARK_OBSERVATIONS
    && distinctLearningProperties >= MIN_INTERNAL_BENCHMARK_PROPERTIES;

  return {
    metricVersion: 'service-quote-decision-v1',
    period: { from: input.from.toISOString(), to: input.to.toISOString() },
    funnel: {
      activeDecisions: input.workspaces.length,
      quoteIntakes: input.workspaces.reduce((sum, workspace) => sum + workspace.quotes.length, 0),
      confirmedQuotes: confirmedQuotes.length,
      comparisonReadyQuotes: comparisonReadyQuotes.length,
      comparisonReached: comparisonReached.length,
      explicitDecisions: decisions.length,
      accepted: accepted.length,
      booked: booked.length,
      completedWork: completed.length,
      decisionRate: ratio(decisions.length, input.workspaces.length),
      completionRate: ratio(completed.length, input.workspaces.length),
    },
    decisionQuality: {
      clarificationRequests: countEvent('service_quote_clarification_requested'),
      clarificationResolutions: countEvent('service_quote_clarification_resolved'),
      scopeChangesAfterWarnings: countEvent('service_quote_scope_changed_after_warning'),
      comparisonEligibilityRate: ratio(comparisonReadyQuotes.length, confirmedQuotes.length),
      recommendationOverrides: countEvent('service_quote_recommendation_overridden'),
      disputeSignals: countEvent('service_quote_dispute_reported'),
    },
    evidence: {
      totalChecks: input.checks.length,
      qualifiedChecks,
      qualifiedCoverageRate: ratio(qualifiedChecks, input.checks.length),
      byCategory: [...evidenceByCategory.entries()]
        .map(([serviceCategory, counts]) => ({
          serviceCategory,
          ...counts,
          coverageRate: ratio(counts.qualified, counts.total),
        }))
        .sort((left, right) => left.serviceCategory.localeCompare(right.serviceCategory)),
      sources: {
        total: input.benchmarkSources.length,
        activeQualified: input.benchmarkSources.filter((source) =>
          source.isActive
          && source.rightsStatus === 'APPROVED'
          && source.reviewStatus === 'APPROVED'
          && source.health?.status === 'HEALTHY').length,
        degraded: input.benchmarkSources.filter((source) =>
          source.isActive && source.health?.status !== 'HEALTHY').length,
      },
    },
    consent: {
      completedWork: completed.length,
      consentedCompletedWork: consentedCompleted.length,
      consentRate: ratio(consentedCompleted.length, completed.length),
      verifiedFinalPriceCaptures: verifiedFinalPriceEvents.length,
      consentedChangeOrderCaptures: countEvent('service_quote_change_order_approved'),
    },
    governedLearning: {
      eligibleForInternalBenchmarkDerivation: learningEligible,
      verifiedObservationCount: verifiedFinalPriceEvents.length,
      distinctPropertyCount: distinctLearningProperties,
      minimumObservationCount: MIN_INTERNAL_BENCHMARK_OBSERVATIONS,
      minimumDistinctProperties: MIN_INTERNAL_BENCHMARK_PROPERTIES,
      rules: [
        'Only consented final prices from completed work are eligible.',
        'Homeowner-entered estimates and unverified quotes are excluded.',
        'Cohorts below either minimum remain suppressed.',
        'Winsorization and manual source review are required before activation.',
        'Derived data cannot activate itself as a homeowner-facing benchmark.',
      ],
    },
  };
}

export async function getServiceQuoteDecisionMetrics(from?: Date, to?: Date) {
  const range = resolveDateRange(from, to, 30);
  const [workspaces, checks, analyticsEvents, benchmarkSources] = await Promise.all([
    database.quoteComparisonWorkspace.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      select: {
        id: true,
        propertyId: true,
        outcome: true,
        journeyStage: true,
        outcomeMeasurementConsentedAt: true,
        outcomeMeasurementConsentRevokedAt: true,
        quotes: { select: { readinessStage: true, homeownerConfirmedAt: true } },
        transitions: { select: { toStage: true, outcome: true } },
        booking: { select: { status: true, finalPrice: true, completedAt: true } },
      },
    }),
    database.serviceRadarCheck.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      select: { serviceCategory: true, pricingFactorsJson: true },
    }),
    prisma.productAnalyticsEvent.findMany({
      where: {
        occurredAt: { gte: range.from, lte: range.to },
        featureKey: 'service_price_radar',
        eventName: { startsWith: 'service_quote_' },
      },
      select: { eventName: true, propertyId: true, valueNumeric: true },
    }),
    database.servicePriceBenchmarkSource.findMany({
      select: {
        isActive: true,
        rightsStatus: true,
        reviewStatus: true,
        health: { select: { status: true } },
      },
    }),
  ]);
  return aggregateServiceQuoteDecisionMetrics({
    from: range.from,
    to: range.to,
    workspaces,
    checks,
    analyticsEvents,
    benchmarkSources,
  });
}
