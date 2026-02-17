import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { calculateHealthScore, HealthScoreResult } from '../utils/propertyScore.util';
import RiskAssessmentService from './RiskAssessment.service';
import { FinancialReportService } from './FinancialReport.service';
import {
  getPropertyScoreSnapshotSummary,
  PropertyScoreSnapshotSummaryDTO,
} from './propertyScoreSnapshot.service';

type HomeScoreComponentKey = 'HEALTH' | 'RISK' | 'FINANCIAL';
type HomeScoreConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
type HomeScoreProvenance = 'SYSTEM_COMPUTED' | 'USER_STATED' | 'INFERRED';
type HomeScoreImpact = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

const RISK_EXPOSURE_CAP = 15000;

export type HomeScoreComponentDTO = {
  key: HomeScoreComponentKey;
  label: string;
  score: number;
  scoreMax: number;
  deltaFromPreviousWeek: number | null;
  status: string;
  confidence: HomeScoreConfidence;
  provenance: HomeScoreProvenance;
  sourceSummary: string;
  lastUpdatedAt: string | null;
};

export type HomeScoreReasonDTO = {
  id: string;
  title: string;
  detail: string;
  component: HomeScoreComponentKey;
  impact: HomeScoreImpact;
  weight: number;
  confidence: HomeScoreConfidence;
  provenance: HomeScoreProvenance;
  actionHref?: string;
};

export type HomeScoreTrendPointDTO = {
  weekStart: string;
  homeScore: number;
  healthScore: number | null;
  riskScore: number | null;
  financialScore: number | null;
};

export type HomeScoreReportDTO = {
  propertyId: string;
  generatedAt: string;
  homeScore: number;
  scoreBand: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'NEEDS_ATTENTION';
  deltaFromPreviousWeek: number | null;
  confidence: HomeScoreConfidence;
  verificationLadder: {
    userStated: number;
    inferred: number;
    systemComputed: number;
  };
  components: HomeScoreComponentDTO[];
  topReasonsScoreNotHigher: HomeScoreReasonDTO[];
  whatChangedSinceLastWeek: HomeScoreReasonDTO[];
  nextBestAction: {
    title: string;
    detail: string;
    href?: string;
  } | null;
  trend: HomeScoreTrendPointDTO[];
};

type HomeScoreBuildResult = {
  report: HomeScoreReportDTO;
  components: HomeScoreComponentDTO[];
  reasons: HomeScoreReasonDTO[];
};

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (
    value &&
    typeof value === 'object' &&
    'toNumber' in (value as Record<string, unknown>) &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  ) {
    const decimalValue = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(decimalValue) ? decimalValue : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function scoreBand(score: number): HomeScoreReportDTO['scoreBand'] {
  if (score >= 85) return 'EXCELLENT';
  if (score >= 70) return 'GOOD';
  if (score >= 50) return 'FAIR';
  return 'NEEDS_ATTENTION';
}

function confidenceFromRatio(ratio: number): HomeScoreConfidence {
  if (ratio >= 0.75) return 'HIGH';
  if (ratio >= 0.45) return 'MEDIUM';
  return 'LOW';
}

function average(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (valid.length === 0) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function summarizeFinancialStatus(status: string | undefined) {
  if (status === 'MISSING_DATA') {
    return 'Financial inputs are incomplete; add policy, warranty, or utility costs for a stronger score.';
  }
  if (status === 'QUEUED') {
    return 'Financial score is recalculating in the background.';
  }
  return 'Financial score is based on annual cost data and benchmark comparison.';
}

function summarizeRiskStatus(exposure: number, reportStatus: 'READY' | 'QUEUED') {
  if (reportStatus === 'QUEUED') {
    return 'Risk report is recalculating in the background.';
  }
  return `Risk score factors include current exposure of $${Math.round(exposure).toLocaleString()}.`;
}

function buildHomeScoreTrend(summary: PropertyScoreSnapshotSummaryDTO): HomeScoreTrendPointDTO[] {
  const byWeek = new Map<
    string,
    {
      weekStart: string;
      healthScore: number | null;
      riskScore: number | null;
      financialScore: number | null;
    }
  >();

  const addPoints = (key: HomeScoreComponentKey, points: PropertyScoreSnapshotSummaryDTO['scores']['HEALTH']['trend']) => {
    for (const point of points) {
      const record = byWeek.get(point.weekStart) ?? {
        weekStart: point.weekStart,
        healthScore: null,
        riskScore: null,
        financialScore: null,
      };

      if (key === 'HEALTH') record.healthScore = point.score;
      if (key === 'RISK') record.riskScore = point.score;
      if (key === 'FINANCIAL') record.financialScore = point.score;

      byWeek.set(point.weekStart, record);
    }
  };

  addPoints('HEALTH', summary.scores.HEALTH.trend);
  addPoints('RISK', summary.scores.RISK.trend);
  addPoints('FINANCIAL', summary.scores.FINANCIAL.trend);

  return Array.from(byWeek.values())
    .sort((a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime())
    .map((point) => {
      const homeScore = Math.round(
        average([point.healthScore, point.riskScore, point.financialScore]) * 10
      ) / 10;
      return {
        weekStart: point.weekStart,
        homeScore,
        healthScore: point.healthScore,
        riskScore: point.riskScore,
        financialScore: point.financialScore,
      };
    });
}

export class HomeScoreReportService {
  private readonly financialService = new FinancialReportService();

  private async assertPropertyAccess(propertyId: string, userId: string) {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId },
      },
      select: {
        id: true,
        name: true,
        yearBuilt: true,
        propertyType: true,
        propertySize: true,
        zipCode: true,
        createdAt: true,
      },
    });

    if (!property) {
      throw new Error('Property not found or access denied.');
    }

    return property;
  }

  private async getHealthScore(propertyId: string): Promise<{
    health: HealthScoreResult;
    lastUpdatedAt: string;
    missingCount: number;
    highPriorityCount: number;
  }> {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        homeAssets: true,
        warranties: true,
      },
    });

    if (!property) {
      throw new Error('Property not found while calculating health score.');
    }

    const documentCount = await prisma.document.count({
      where: { propertyId },
    });

    const activeBookings = await prisma.booking.findMany({
      where: {
        propertyId,
        status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
      },
      select: {
        id: true,
        category: true,
        status: true,
        insightFactor: true,
        insightContext: true,
        propertyId: true,
      },
    });

    const health = calculateHealthScore(property, documentCount, activeBookings as never);
    const missingCount = health.insights.filter((insight) => insight.status === 'Missing Data').length;
    const highPriorityCount = health.insights.filter((insight) =>
      ['Needs Attention', 'Needs Review', 'Needs Inspection', 'Missing Data'].includes(insight.status)
    ).length;

    return {
      health,
      lastUpdatedAt: property.updatedAt.toISOString(),
      missingCount,
      highPriorityCount,
    };
  }

  private async build(propertyId: string, userId: string, weeks: number): Promise<HomeScoreBuildResult> {
    await this.assertPropertyAccess(propertyId, userId);

    const [healthResult, riskReportOrQueued, financialSummary, scoreSummary] = await Promise.all([
      this.getHealthScore(propertyId),
      RiskAssessmentService.getOrCreateRiskReport(propertyId),
      this.financialService.getFinancialEfficiencySummary(propertyId),
      getPropertyScoreSnapshotSummary(propertyId, userId, weeks),
    ]);

    const healthScore = Math.round((healthResult.health.totalScore / Math.max(healthResult.health.maxPotentialScore || 100, 1)) * 100);

    const riskReportReady = riskReportOrQueued !== 'QUEUED';
    const riskExposure = riskReportReady ? asNumber((riskReportOrQueued as any).financialExposureTotal) : 0;
    const riskScore = riskReportReady
      ? clamp(asNumber((riskReportOrQueued as any).riskScore), 0, 100)
      : scoreSummary.scores.RISK.latest?.score ?? 0;

    const financialScore =
      financialSummary.status === 'CALCULATED'
        ? clamp(asNumber(financialSummary.financialEfficiencyScore), 0, 100)
        : scoreSummary.scores.FINANCIAL.latest?.score ?? 0;

    const healthConfidenceRatio = 1 - healthResult.missingCount / Math.max(healthResult.health.insights.length || 1, 1);
    const healthConfidence = confidenceFromRatio(healthConfidenceRatio);
    const riskConfidence: HomeScoreConfidence = riskReportReady ? 'HIGH' : 'LOW';
    const financialConfidence: HomeScoreConfidence =
      financialSummary.status === 'CALCULATED'
        ? 'HIGH'
        : financialSummary.status === 'MISSING_DATA'
        ? 'LOW'
        : 'MEDIUM';

    const components: HomeScoreComponentDTO[] = [
      {
        key: 'HEALTH',
        label: 'Property Health',
        score: healthScore,
        scoreMax: 100,
        deltaFromPreviousWeek: scoreSummary.scores.HEALTH.deltaFromPreviousWeek,
        status: healthResult.highPriorityCount > 0 ? `${healthResult.highPriorityCount} action${healthResult.highPriorityCount === 1 ? '' : 's'} needed` : 'Stable',
        confidence: healthConfidence,
        provenance: 'USER_STATED',
        sourceSummary: `Based on ${healthResult.health.insights.length} health factors and uploaded home profile details.`,
        lastUpdatedAt: healthResult.lastUpdatedAt,
      },
      {
        key: 'RISK',
        label: 'Risk Assessment',
        score: riskScore,
        scoreMax: 100,
        deltaFromPreviousWeek: scoreSummary.scores.RISK.deltaFromPreviousWeek,
        status: summarizeRiskStatus(riskExposure, riskReportReady ? 'READY' : 'QUEUED'),
        confidence: riskConfidence,
        provenance: 'SYSTEM_COMPUTED',
        sourceSummary: riskReportReady
          ? 'Derived from calculated risk report and current exposure details.'
          : 'Using latest stored snapshot while risk report recalculates.',
        lastUpdatedAt: riskReportReady ? (riskReportOrQueued as any).lastCalculatedAt : null,
      },
      {
        key: 'FINANCIAL',
        label: 'Financial Efficiency',
        score: clamp(financialScore, 0, 100),
        scoreMax: 100,
        deltaFromPreviousWeek: scoreSummary.scores.FINANCIAL.deltaFromPreviousWeek,
        status: summarizeFinancialStatus(financialSummary.status),
        confidence: financialConfidence,
        provenance: financialSummary.status === 'CALCULATED' ? 'SYSTEM_COMPUTED' : 'INFERRED',
        sourceSummary: financialSummary.status === 'CALCULATED'
          ? 'Derived from premiums, warranties, and utility expenses versus benchmark.'
          : 'Derived from available snapshot signals; add complete cost data to improve confidence.',
        lastUpdatedAt: financialSummary.lastCalculatedAt ? new Date(financialSummary.lastCalculatedAt).toISOString() : null,
      },
    ];

    const homeScore = Math.round(
      (healthScore * 0.4 + riskScore * 0.35 + clamp(financialScore, 0, 100) * 0.25) * 10
    ) / 10;

    const previousHomeScore =
      scoreSummary.scores.HEALTH.previous ||
      scoreSummary.scores.RISK.previous ||
      scoreSummary.scores.FINANCIAL.previous
        ? Math.round(
            average([
              scoreSummary.scores.HEALTH.previous?.score ?? null,
              scoreSummary.scores.RISK.previous?.score ?? null,
              scoreSummary.scores.FINANCIAL.previous?.score ?? null,
            ]) * 10
          ) / 10
        : null;

    const deltaFromPreviousWeek =
      previousHomeScore === null ? null : Math.round((homeScore - previousHomeScore) * 10) / 10;

    const reasons: HomeScoreReasonDTO[] = [];

    if (healthResult.missingCount > 0) {
      reasons.push({
        id: 'health-missing-data',
        title: 'Missing property details reduce score confidence',
        detail: `${healthResult.missingCount} health factor${healthResult.missingCount === 1 ? '' : 's'} are missing source details.`,
        component: 'HEALTH',
        impact: 'NEGATIVE',
        weight: 88,
        confidence: 'HIGH',
        provenance: 'USER_STATED',
        actionHref: `/dashboard/properties/${propertyId}/edit`,
      });
    }

    if (!riskReportReady) {
      reasons.push({
        id: 'risk-report-queued',
        title: 'Risk report is still refreshing',
        detail: 'Latest risk inputs are processing; score can move when recalculation finishes.',
        component: 'RISK',
        impact: 'NEUTRAL',
        weight: 76,
        confidence: 'MEDIUM',
        provenance: 'SYSTEM_COMPUTED',
        actionHref: `/dashboard/properties/${propertyId}/risk-assessment`,
      });
    } else {
      const riskDetails = Array.isArray((riskReportOrQueued as any).details)
        ? ((riskReportOrQueued as any).details as Array<Record<string, unknown>>)
        : [];
      const elevatedCount = riskDetails.filter((detail) =>
        ['HIGH', 'CRITICAL', 'ELEVATED'].includes(String(detail.riskLevel || '').toUpperCase())
      ).length;

      if (elevatedCount > 0) {
        reasons.push({
          id: 'risk-high-assets',
          title: `${elevatedCount} elevated-risk assets are driving exposure`,
          detail: `Risk exposure is currently $${Math.round(riskExposure).toLocaleString()}.`,
          component: 'RISK',
          impact: 'NEGATIVE',
          weight: 86,
          confidence: 'HIGH',
          provenance: 'SYSTEM_COMPUTED',
          actionHref: `/dashboard/properties/${propertyId}/risk-assessment`,
        });
      }
    }

    if (financialSummary.status === 'MISSING_DATA') {
      reasons.push({
        id: 'financial-missing-data',
        title: 'Financial efficiency is using incomplete cost inputs',
        detail: 'Add insurance, warranty, and utility costs to tighten this score.',
        component: 'FINANCIAL',
        impact: 'NEGATIVE',
        weight: 82,
        confidence: 'HIGH',
        provenance: 'USER_STATED',
        actionHref: `/dashboard/properties/${propertyId}/financial-efficiency`,
      });
    } else if (financialSummary.status === 'CALCULATED' && financialSummary.financialEfficiencyScore < 75) {
      reasons.push({
        id: 'financial-benchmark-gap',
        title: 'Annual home cost is above benchmark',
        detail: `Your efficiency score is ${Math.round(financialSummary.financialEfficiencyScore)}.`,
        component: 'FINANCIAL',
        impact: 'NEGATIVE',
        weight: 74,
        confidence: 'MEDIUM',
        provenance: 'SYSTEM_COMPUTED',
        actionHref: `/dashboard/properties/${propertyId}/financial-efficiency`,
      });
    }

    const whatChangedSinceLastWeek: HomeScoreReasonDTO[] = [];

    for (const component of components) {
      if (component.deltaFromPreviousWeek === null) continue;
      const delta = component.deltaFromPreviousWeek;
      whatChangedSinceLastWeek.push({
        id: `${component.key.toLowerCase()}-delta`,
        title: `${component.label} moved ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}`,
        detail:
          delta > 0
            ? `Improved by ${delta.toFixed(1)} points since last week.`
            : delta < 0
            ? `Dropped by ${Math.abs(delta).toFixed(1)} points since last week.`
            : 'No change recorded since last week.',
        component: component.key,
        impact: delta > 0 ? 'POSITIVE' : delta < 0 ? 'NEGATIVE' : 'NEUTRAL',
        weight: Math.round(Math.min(100, Math.abs(delta) * 15 + 40)),
        confidence: component.confidence,
        provenance: component.provenance,
      });
    }

    if (whatChangedSinceLastWeek.length === 0) {
      whatChangedSinceLastWeek.push({
        id: 'no-delta',
        title: 'No material score movement yet',
        detail: 'Weekly deltas will appear once at least two snapshots are available.',
        component: 'HEALTH',
        impact: 'NEUTRAL',
        weight: 40,
        confidence: 'LOW',
        provenance: 'INFERRED',
      });
    }

    const sortedReasons = [...reasons].sort((a, b) => b.weight - a.weight);

    const topReason = sortedReasons[0];
    const nextBestAction = topReason
      ? {
          title: topReason.title,
          detail: topReason.detail,
          href: topReason.actionHref,
        }
      : null;

    const trend = buildHomeScoreTrend(scoreSummary);

    const confidenceRank = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const;
    const overallConfidence = (
      Object.entries(confidenceRank).find(
        ([key, rank]) =>
          rank ===
          Math.min(
            confidenceRank[healthConfidence],
            confidenceRank[riskConfidence],
            confidenceRank[financialConfidence]
          ) &&
          key
      )?.[0] ?? 'MEDIUM'
    ) as HomeScoreConfidence;

    const report: HomeScoreReportDTO = {
      propertyId,
      generatedAt: new Date().toISOString(),
      homeScore,
      scoreBand: scoreBand(homeScore),
      deltaFromPreviousWeek,
      confidence: overallConfidence,
      verificationLadder: {
        userStated: 1,
        inferred: 1,
        systemComputed: 1,
      },
      components,
      topReasonsScoreNotHigher: sortedReasons.slice(0, 5),
      whatChangedSinceLastWeek: whatChangedSinceLastWeek.slice(0, 5),
      nextBestAction,
      trend,
    };

    return {
      report,
      components,
      reasons: sortedReasons,
    };
  }

  async getReport(propertyId: string, userId: string, weeks = 26): Promise<HomeScoreReportDTO> {
    const result = await this.build(propertyId, userId, weeks);
    return result.report;
  }

  async getFactors(propertyId: string, userId: string, weeks = 26) {
    const result = await this.build(propertyId, userId, weeks);
    return result.reasons;
  }

  async getHistory(propertyId: string, userId: string, weeks = 52) {
    const report = await this.getReport(propertyId, userId, weeks);
    return report.trend;
  }

  async refresh(propertyId: string, userId: string, weeks = 26) {
    await this.assertPropertyAccess(propertyId, userId);

    await Promise.all([
      RiskAssessmentService.calculateAndSaveReport(propertyId),
      this.financialService.calculateAndSaveFES(propertyId),
    ]);

    return this.getReport(propertyId, userId, weeks);
  }
}
