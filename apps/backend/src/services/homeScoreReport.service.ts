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
type HomeScoreConsistencyStatus = 'PASS' | 'WARN' | 'FAIL';
type HomeScoreConsistencySeverity = 'LOW' | 'MEDIUM' | 'HIGH';
type HomeScoreVerificationStatus = 'VERIFIED' | 'REVIEW_NEEDED' | 'UNVERIFIED' | 'UNKNOWN';
type HomeScoreCorrectionStatus = 'SUBMITTED' | 'APPLIED' | 'REJECTED';

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

export type HomeScoreConsistencyCheckDTO = {
  id: string;
  title: string;
  status: HomeScoreConsistencyStatus;
  severity: HomeScoreConsistencySeverity;
  detail: string;
  actionHref?: string;
};

export type HomeScoreVerificationOpportunityDTO = {
  id: string;
  title: string;
  detail: string;
  component: HomeScoreComponentKey | 'GENERAL';
  verificationType: 'PROFILE' | 'DOCUMENT' | 'SYSTEM';
  estimatedConfidenceGain: HomeScoreConfidence;
  href?: string;
};

export type HomeScoreFieldFactDTO = {
  id: string;
  key: string;
  label: string;
  value: string;
  component: HomeScoreComponentKey | 'GENERAL';
  provenance: HomeScoreProvenance;
  confidence: HomeScoreConfidence;
  verificationStatus: HomeScoreVerificationStatus;
  lastUpdatedAt: string | null;
  verifyHref?: string;
};

export type HomeScoreCorrectionDTO = {
  id: string;
  fieldKey: string;
  title: string;
  detail: string;
  proposedValue: string | null;
  status: HomeScoreCorrectionStatus;
  submittedAt: string;
  submittedBy: string | null;
};

export type HomeScoreChangeLogEntryDTO = {
  id: string;
  weekStart: string;
  title: string;
  detail: string;
  component: HomeScoreComponentKey | 'GENERAL';
  impact: HomeScoreImpact;
  delta: number | null;
  confidence: HomeScoreConfidence;
  provenance: HomeScoreProvenance;
};

export type HomeScoreUncertaintyDTO = {
  scoreRangeLow: number;
  scoreRangeHigh: number;
  riskExposureRangeLow: number | null;
  riskExposureRangeHigh: number | null;
  accuracyScore: number;
  detail: string;
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
  consistencyChecks: HomeScoreConsistencyCheckDTO[];
  verificationOpportunities: HomeScoreVerificationOpportunityDTO[];
  fieldFacts: HomeScoreFieldFactDTO[];
  correctionHistory: HomeScoreCorrectionDTO[];
  changeLog: HomeScoreChangeLogEntryDTO[];
  uncertainty: HomeScoreUncertaintyDTO;
  nextBestAction: {
    title: string;
    detail: string;
    href?: string;
  } | null;
  trend: HomeScoreTrendPointDTO[];
};

type PropertyQualitySignals = {
  property: {
    yearBuilt: number | null;
    propertyType: string | null;
    propertySize: number | null;
    ownershipType: string | null;
    occupantsCount: number | null;
    heatingType: string | null;
    coolingType: string | null;
    waterHeaterType: string | null;
    roofType: string | null;
    hvacInstallYear: number | null;
    waterHeaterInstallYear: number | null;
    roofReplacementYear: number | null;
    hasSmokeDetectors: boolean | null;
    hasCoDetectors: boolean | null;
    hasSecuritySystem: boolean | null;
    hasFireExtinguisher: boolean | null;
    hasDrainageIssues: boolean | null;
    hasIrrigation: boolean | null;
  };
  userStatedFilled: number;
  userStatedTotal: number;
  profileCompletenessRatio: number;
  documentCount: number;
  evidenceDocumentCount: number;
  inventoryCount: number;
  warrantyCount: number;
  insuranceCount: number;
  overdueTaskCount: number;
  criticalTaskCount: number;
};

type HomeScoreBuildResult = {
  report: HomeScoreReportDTO;
  components: HomeScoreComponentDTO[];
  reasons: HomeScoreReasonDTO[];
};

export type HomeScoreCorrectionInput = {
  fieldKey: string;
  title?: string;
  detail: string;
  proposedValue?: string;
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

function isPopulated(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return value !== null && value !== undefined && value !== '';
}

function toDisplayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Unknown';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : 'Unknown';
  return String(value);
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

  private withHomeScoreReturnContext(propertyId: string, targetHref?: string): string | undefined {
    if (!targetHref) {
      return undefined;
    }

    const params = new URLSearchParams({
      fromHomeScore: '1',
      returnTo: `/dashboard/properties/${propertyId}/home-score`,
    });

    return `${targetHref}${targetHref.includes('?') ? '&' : '?'}${params.toString()}`;
  }

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

  private async getPropertyQualitySignals(propertyId: string): Promise<PropertyQualitySignals> {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        yearBuilt: true,
        propertyType: true,
        propertySize: true,
        ownershipType: true,
        occupantsCount: true,
        heatingType: true,
        coolingType: true,
        waterHeaterType: true,
        roofType: true,
        hvacInstallYear: true,
        waterHeaterInstallYear: true,
        roofReplacementYear: true,
        hasSmokeDetectors: true,
        hasCoDetectors: true,
        hasSecuritySystem: true,
        hasFireExtinguisher: true,
        hasDrainageIssues: true,
        hasIrrigation: true,
      },
    });

    if (!property) {
      throw new Error('Property not found while collecting HomeScore quality signals.');
    }

    const now = new Date();

    const [
      documentCount,
      evidenceDocumentCount,
      inventoryCount,
      warrantyCount,
      insuranceCount,
      overdueTaskCount,
      criticalTaskCount,
    ] = await Promise.all([
      prisma.document.count({ where: { propertyId } }),
      prisma.document.count({
        where: {
          propertyId,
          OR: [{ inventoryItemId: { not: null } }, { warrantyId: { not: null } }, { policyId: { not: null } }],
        },
      }),
      prisma.inventoryItem.count({ where: { propertyId } }),
      prisma.warranty.count({ where: { propertyId } }),
      prisma.insurancePolicy.count({ where: { propertyId } }),
      prisma.propertyMaintenanceTask.count({
        where: {
          propertyId,
          status: 'PENDING',
          nextDueDate: { not: null, lt: now },
        },
      }),
      prisma.propertyMaintenanceTask.count({
        where: {
          propertyId,
          status: 'PENDING',
          priority: 'HIGH',
          OR: [{ nextDueDate: { not: null, lt: now } }, { riskLevel: { in: ['HIGH', 'CRITICAL'] } }],
        },
      }),
    ]);

    const userStatedFields = [
      property.yearBuilt,
      property.propertyType,
      property.propertySize,
      property.ownershipType,
      property.occupantsCount,
      property.heatingType,
      property.coolingType,
      property.waterHeaterType,
      property.roofType,
      property.hvacInstallYear,
      property.waterHeaterInstallYear,
      property.roofReplacementYear,
      property.hasSmokeDetectors,
      property.hasCoDetectors,
      property.hasSecuritySystem,
      property.hasFireExtinguisher,
      property.hasDrainageIssues,
      property.hasIrrigation,
    ];

    const userStatedFilled = userStatedFields.filter(isPopulated).length;
    const userStatedTotal = userStatedFields.length;
    const profileCompletenessRatio = userStatedFilled / Math.max(userStatedTotal, 1);

    return {
      property,
      userStatedFilled,
      userStatedTotal,
      profileCompletenessRatio,
      documentCount,
      evidenceDocumentCount,
      inventoryCount,
      warrantyCount,
      insuranceCount,
      overdueTaskCount,
      criticalTaskCount,
    };
  }

  private normalizeCorrectionStatus(action: string): HomeScoreCorrectionStatus {
    if (action === 'HOME_SCORE_CORRECTION_APPLIED') return 'APPLIED';
    if (action === 'HOME_SCORE_CORRECTION_REJECTED') return 'REJECTED';
    return 'SUBMITTED';
  }

  private parseJsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private async getCorrectionHistory(propertyId: string, limit = 20): Promise<HomeScoreCorrectionDTO[]> {
    const logs = await prisma.auditLog.findMany({
      where: {
        entityType: 'PROPERTY',
        entityId: propertyId,
        action: {
          in: [
            'HOME_SCORE_CORRECTION_SUBMITTED',
            'HOME_SCORE_CORRECTION_APPLIED',
            'HOME_SCORE_CORRECTION_REJECTED',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs.map((log) => {
      const payload = this.parseJsonObject(log.newValues ?? null);
      const fieldKey = typeof payload.fieldKey === 'string' ? payload.fieldKey : 'general';
      const title =
        typeof payload.title === 'string'
          ? payload.title
          : fieldKey === 'general'
          ? 'General correction submitted'
          : `Correction: ${fieldKey}`;
      const detail =
        typeof payload.detail === 'string' && payload.detail.trim().length > 0
          ? payload.detail
          : 'Correction request submitted from HomeScore report.';
      const proposedValue =
        typeof payload.proposedValue === 'string' && payload.proposedValue.trim().length > 0
          ? payload.proposedValue
          : null;

      return {
        id: log.id,
        fieldKey,
        title,
        detail,
        proposedValue,
        status: this.normalizeCorrectionStatus(log.action),
        submittedAt: log.createdAt.toISOString(),
        submittedBy: log.userId ?? null,
      };
    });
  }

  private buildFieldFacts(
    propertyId: string,
    signals: PropertyQualitySignals,
    components: HomeScoreComponentDTO[]
  ): HomeScoreFieldFactDTO[] {
    const confidenceByComponent = new Map<HomeScoreComponentKey, HomeScoreConfidence>(
      components.map((component) => [component.key, component.confidence])
    );
    const nowIso = new Date().toISOString();

    const qualityFacts: Array<{
      id: string;
      key: string;
      label: string;
      value: unknown;
      component: HomeScoreComponentKey | 'GENERAL';
      provenance: HomeScoreProvenance;
      verifyHref?: string;
    }> = [
      {
        id: 'fact-year-built',
        key: 'yearBuilt',
        label: 'Year built',
        value: signals.property.yearBuilt,
        component: 'HEALTH',
        provenance: 'USER_STATED',
        verifyHref: `/dashboard/properties/${propertyId}/edit`,
      },
      {
        id: 'fact-roof-replacement-year',
        key: 'roofReplacementYear',
        label: 'Roof replacement year',
        value: signals.property.roofReplacementYear,
        component: 'RISK',
        provenance: 'USER_STATED',
        verifyHref: `/dashboard/properties/${propertyId}/edit`,
      },
      {
        id: 'fact-hvac-install-year',
        key: 'hvacInstallYear',
        label: 'HVAC install year',
        value: signals.property.hvacInstallYear,
        component: 'HEALTH',
        provenance: 'USER_STATED',
        verifyHref: `/dashboard/properties/${propertyId}/edit`,
      },
      {
        id: 'fact-water-heater-install-year',
        key: 'waterHeaterInstallYear',
        label: 'Water heater install year',
        value: signals.property.waterHeaterInstallYear,
        component: 'RISK',
        provenance: 'USER_STATED',
        verifyHref: `/dashboard/properties/${propertyId}/edit`,
      },
      {
        id: 'fact-smoke-detectors',
        key: 'hasSmokeDetectors',
        label: 'Smoke detectors',
        value: signals.property.hasSmokeDetectors,
        component: 'HEALTH',
        provenance: 'USER_STATED',
        verifyHref: `/dashboard/properties/${propertyId}/edit`,
      },
      {
        id: 'fact-co-detectors',
        key: 'hasCoDetectors',
        label: 'CO detectors',
        value: signals.property.hasCoDetectors,
        component: 'HEALTH',
        provenance: 'USER_STATED',
        verifyHref: `/dashboard/properties/${propertyId}/edit`,
      },
      {
        id: 'fact-linked-documents',
        key: 'documentCount',
        label: 'Linked documents',
        value: signals.documentCount,
        component: 'GENERAL',
        provenance: 'SYSTEM_COMPUTED',
        verifyHref: `/dashboard/properties/${propertyId}/documents`,
      },
      {
        id: 'fact-evidence-documents',
        key: 'evidenceDocumentCount',
        label: 'Evidence-backed docs',
        value: signals.evidenceDocumentCount,
        component: 'GENERAL',
        provenance: 'SYSTEM_COMPUTED',
        verifyHref: `/dashboard/properties/${propertyId}/documents`,
      },
      {
        id: 'fact-insurance-linked',
        key: 'insuranceCount',
        label: 'Insurance policies linked',
        value: signals.insuranceCount,
        component: 'FINANCIAL',
        provenance: 'SYSTEM_COMPUTED',
        verifyHref: `/dashboard/insurance`,
      },
      {
        id: 'fact-warranties-linked',
        key: 'warrantyCount',
        label: 'Warranties linked',
        value: signals.warrantyCount,
        component: 'FINANCIAL',
        provenance: 'SYSTEM_COMPUTED',
        verifyHref: `/dashboard/warranties`,
      },
      {
        id: 'fact-overdue-tasks',
        key: 'overdueTaskCount',
        label: 'Overdue maintenance tasks',
        value: signals.overdueTaskCount,
        component: 'RISK',
        provenance: 'SYSTEM_COMPUTED',
        verifyHref: `/dashboard/actions`,
      },
    ];

    return qualityFacts.map((fact) => {
      const hasValue = fact.value !== null && fact.value !== undefined && fact.value !== '';
      const componentConfidence =
        fact.component === 'GENERAL' ? 'MEDIUM' : confidenceByComponent.get(fact.component) ?? 'MEDIUM';

      let verificationStatus: HomeScoreVerificationStatus = 'UNKNOWN';
      let confidence: HomeScoreConfidence = componentConfidence;

      if (!hasValue || toDisplayValue(fact.value) === 'Unknown') {
        verificationStatus = 'UNKNOWN';
        confidence = 'LOW';
      } else if (fact.provenance === 'SYSTEM_COMPUTED') {
        verificationStatus = 'VERIFIED';
      } else if (signals.evidenceDocumentCount > 0) {
        verificationStatus = 'REVIEW_NEEDED';
        if (confidence === 'LOW') confidence = 'MEDIUM';
      } else {
        verificationStatus = 'UNVERIFIED';
        confidence = confidence === 'HIGH' ? 'MEDIUM' : confidence;
      }

      return {
        id: fact.id,
        key: fact.key,
        label: fact.label,
        value: toDisplayValue(fact.value),
        component: fact.component,
        provenance: fact.provenance,
        confidence,
        verificationStatus,
        lastUpdatedAt: nowIso,
        verifyHref: this.withHomeScoreReturnContext(propertyId, fact.verifyHref),
      };
    });
  }

  private buildChangeLog(
    scoreSummary: PropertyScoreSnapshotSummaryDTO,
    correctionHistory: HomeScoreCorrectionDTO[]
  ): HomeScoreChangeLogEntryDTO[] {
    const entries: HomeScoreChangeLogEntryDTO[] = [];
    const componentMeta: Record<HomeScoreComponentKey, { label: string; confidence: HomeScoreConfidence }> = {
      HEALTH: { label: 'Property Health', confidence: 'HIGH' },
      RISK: { label: 'Risk Assessment', confidence: 'HIGH' },
      FINANCIAL: { label: 'Financial Efficiency', confidence: 'MEDIUM' },
    };

    (['HEALTH', 'RISK', 'FINANCIAL'] as const).forEach((key) => {
      const points = [...scoreSummary.scores[key].trend].sort(
        (a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime()
      );
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        const delta = Math.round((current.score - previous.score) * 10) / 10;
        if (Math.abs(delta) < 0.1) continue;

        entries.push({
          id: `${key.toLowerCase()}-${current.weekStart}`,
          weekStart: current.weekStart,
          title: `${componentMeta[key].label} ${delta > 0 ? 'improved' : 'declined'} ${Math.abs(delta).toFixed(1)} pts`,
          detail:
            delta > 0
              ? `${componentMeta[key].label} trended upward compared with the prior weekly snapshot.`
              : `${componentMeta[key].label} trended downward compared with the prior weekly snapshot.`,
          component: key,
          impact: delta > 0 ? 'POSITIVE' : 'NEGATIVE',
          delta,
          confidence: componentMeta[key].confidence,
          provenance: 'SYSTEM_COMPUTED',
        });
      }
    });

    correctionHistory.slice(0, 6).forEach((correction) => {
      entries.push({
        id: `correction-${correction.id}`,
        weekStart: correction.submittedAt,
        title: `Correction ${correction.status.toLowerCase()}: ${correction.title}`,
        detail: correction.detail,
        component: 'GENERAL',
        impact: correction.status === 'APPLIED' ? 'POSITIVE' : correction.status === 'REJECTED' ? 'NEGATIVE' : 'NEUTRAL',
        delta: null,
        confidence: 'MEDIUM',
        provenance: 'USER_STATED',
      });
    });

    return entries
      .sort((a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime())
      .slice(0, 12);
  }

  private buildConsistencyChecks(propertyId: string, signals: PropertyQualitySignals): HomeScoreConsistencyCheckDTO[] {
    const checks: HomeScoreConsistencyCheckDTO[] = [];
    const currentYear = new Date().getFullYear();
    const {
      property,
      profileCompletenessRatio,
      overdueTaskCount,
      criticalTaskCount,
      documentCount,
      insuranceCount,
      warrantyCount,
    } = signals;

    const chronologyIssues: string[] = [];
    if (property.yearBuilt && property.hvacInstallYear && property.hvacInstallYear < property.yearBuilt - 1) {
      chronologyIssues.push('HVAC install year is earlier than year built.');
    }
    if (
      property.yearBuilt &&
      property.waterHeaterInstallYear &&
      property.waterHeaterInstallYear < property.yearBuilt - 1
    ) {
      chronologyIssues.push('Water heater install year is earlier than year built.');
    }
    if (property.yearBuilt && property.roofReplacementYear && property.roofReplacementYear < property.yearBuilt - 1) {
      chronologyIssues.push('Roof replacement year is earlier than year built.');
    }
    if (property.roofReplacementYear && property.roofReplacementYear > currentYear + 1) {
      chronologyIssues.push('Roof replacement year appears to be in the future.');
    }

    if (chronologyIssues.length > 0) {
      checks.push({
        id: 'chronology-consistency',
        title: 'System timelines need correction',
        status: 'FAIL',
        severity: 'HIGH',
        detail: chronologyIssues[0],
        actionHref: `/dashboard/properties/${propertyId}/edit`,
      });
    } else {
      checks.push({
        id: 'chronology-consistency',
        title: 'System timeline consistency',
        status: 'PASS',
        severity: 'LOW',
        detail: 'System ages are chronologically consistent with property details.',
      });
    }

    const missingSafety = ['smoke detector', 'CO detector'].filter((label) => {
      if (label === 'smoke detector') return property.hasSmokeDetectors === false;
      return property.hasCoDetectors === false;
    });
    const unknownSafety = [property.hasSmokeDetectors, property.hasCoDetectors].filter((value) => value === null).length;

    if (missingSafety.length > 0) {
      checks.push({
        id: 'safety-equipment-check',
        title: 'Critical safety equipment incomplete',
        status: 'FAIL',
        severity: 'HIGH',
        detail: `Missing ${missingSafety.join(' and ')} confirmation.`,
        actionHref: `/dashboard/properties/${propertyId}/edit`,
      });
    } else if (unknownSafety > 0) {
      checks.push({
        id: 'safety-equipment-check',
        title: 'Safety profile needs verification',
        status: 'WARN',
        severity: 'MEDIUM',
        detail: 'Confirm smoke and CO detector coverage to improve confidence.',
        actionHref: `/dashboard/properties/${propertyId}/edit`,
      });
    } else {
      checks.push({
        id: 'safety-equipment-check',
        title: 'Safety baseline confirmation',
        status: 'PASS',
        severity: 'LOW',
        detail: 'Smoke and CO detector data is present.',
      });
    }

    if (criticalTaskCount > 0) {
      checks.push({
        id: 'maintenance-backlog',
        title: 'Critical maintenance backlog',
        status: 'FAIL',
        severity: 'HIGH',
        detail: `${criticalTaskCount} critical overdue task${criticalTaskCount === 1 ? '' : 's'} are increasing uncertainty and risk.`,
        actionHref: `/dashboard/actions`,
      });
    } else if (overdueTaskCount > 0) {
      checks.push({
        id: 'maintenance-backlog',
        title: 'Overdue maintenance tasks',
        status: 'WARN',
        severity: 'MEDIUM',
        detail: `${overdueTaskCount} overdue task${overdueTaskCount === 1 ? '' : 's'} detected.`,
        actionHref: `/dashboard/actions`,
      });
    } else {
      checks.push({
        id: 'maintenance-backlog',
        title: 'Maintenance hygiene',
        status: 'PASS',
        severity: 'LOW',
        detail: 'No overdue maintenance tasks detected.',
      });
    }

    if ((insuranceCount > 0 || warrantyCount > 0) && documentCount === 0) {
      checks.push({
        id: 'coverage-documentation',
        title: 'Coverage documentation missing',
        status: 'WARN',
        severity: 'MEDIUM',
        detail: 'Policies/warranties exist but no supporting documents are linked.',
        actionHref: `/dashboard/properties/${propertyId}/documents`,
      });
    } else if (documentCount > 0) {
      checks.push({
        id: 'coverage-documentation',
        title: 'Documentation coverage',
        status: 'PASS',
        severity: 'LOW',
        detail: `${documentCount} supporting document${documentCount === 1 ? '' : 's'} linked to this property.`,
      });
    }

    if (profileCompletenessRatio < 0.6) {
      checks.push({
        id: 'profile-completeness',
        title: 'Property profile is sparse',
        status: 'WARN',
        severity: 'MEDIUM',
        detail: 'Low profile completeness widens HomeScore uncertainty ranges.',
        actionHref: `/dashboard/properties/${propertyId}/edit`,
      });
    } else {
      checks.push({
        id: 'profile-completeness',
        title: 'Property profile completeness',
        status: 'PASS',
        severity: 'LOW',
        detail: `Profile completeness is ${Math.round(profileCompletenessRatio * 100)}%.`,
      });
    }

    const statusRank = { FAIL: 3, WARN: 2, PASS: 1 } as const;
    const severityRank = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;

    return checks
      .map((check) => ({
        ...check,
        actionHref: this.withHomeScoreReturnContext(propertyId, check.actionHref),
      }))
      .sort((a, b) => statusRank[b.status] - statusRank[a.status] || severityRank[b.severity] - severityRank[a.severity])
      .slice(0, 6);
  }

  private buildVerificationOpportunities(
    propertyId: string,
    signals: PropertyQualitySignals,
    riskReportReady: boolean,
    financialStatus: 'CALCULATED' | 'MISSING_DATA' | 'QUEUED' | 'NO_PROPERTY'
  ): HomeScoreVerificationOpportunityDTO[] {
    const opportunities: HomeScoreVerificationOpportunityDTO[] = [];

    if (signals.profileCompletenessRatio < 0.8) {
      opportunities.push({
        id: 'verify-profile-fields',
        title: 'Complete missing property fields',
        detail: 'Add missing system ages and safety details to reduce uncertainty.',
        component: 'HEALTH',
        verificationType: 'PROFILE',
        estimatedConfidenceGain: signals.profileCompletenessRatio < 0.6 ? 'HIGH' : 'MEDIUM',
        href: `/dashboard/properties/${propertyId}/edit`,
      });
    }

    if (signals.evidenceDocumentCount < 2) {
      opportunities.push({
        id: 'upload-supporting-docs',
        title: 'Attach evidence documents',
        detail: 'Upload photos, invoices, or reports to verify key systems and coverage.',
        component: 'GENERAL',
        verificationType: 'DOCUMENT',
        estimatedConfidenceGain: 'HIGH',
        href: `/dashboard/properties/${propertyId}/documents`,
      });
    }

    if (!riskReportReady) {
      opportunities.push({
        id: 'refresh-risk-report',
        title: 'Refresh risk assessment',
        detail: 'Risk analysis is queued; rerun for updated exposure factors.',
        component: 'RISK',
        verificationType: 'SYSTEM',
        estimatedConfidenceGain: 'MEDIUM',
        href: `/dashboard/properties/${propertyId}/risk-assessment`,
      });
    }

    if (financialStatus !== 'CALCULATED') {
      opportunities.push({
        id: 'complete-financial-inputs',
        title: 'Add insurance and warranty cost inputs',
        detail: 'Complete annual premium and coverage details to firm up financial confidence.',
        component: 'FINANCIAL',
        verificationType: 'PROFILE',
        estimatedConfidenceGain: 'HIGH',
        href: `/dashboard/properties/${propertyId}/financial-efficiency`,
      });
    }

    if (signals.insuranceCount === 0) {
      opportunities.push({
        id: 'link-insurance-policy',
        title: 'Link an active insurance policy',
        detail: 'Policy details improve risk and financial credibility in the report.',
        component: 'RISK',
        verificationType: 'DOCUMENT',
        estimatedConfidenceGain: 'MEDIUM',
        href: `/dashboard/insurance`,
      });
    }

    if (signals.inventoryCount > 0 && signals.warrantyCount === 0) {
      opportunities.push({
        id: 'link-warranty-data',
        title: 'Link warranties to major items',
        detail: 'Coverage links reduce uncertainty in lifecycle and risk calculations.',
        component: 'FINANCIAL',
        verificationType: 'DOCUMENT',
        estimatedConfidenceGain: 'MEDIUM',
        href: `/dashboard/warranties`,
      });
    }

    return opportunities.slice(0, 5).map((opportunity) => ({
      ...opportunity,
      href: this.withHomeScoreReturnContext(propertyId, opportunity.href),
    }));
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

    const [healthResult, riskReportOrQueued, financialSummary, scoreSummary, qualitySignals] = await Promise.all([
      this.getHealthScore(propertyId),
      RiskAssessmentService.getOrCreateRiskReport(propertyId),
      this.financialService.getFinancialEfficiencySummary(propertyId),
      getPropertyScoreSnapshotSummary(propertyId, userId, weeks),
      this.getPropertyQualitySignals(propertyId),
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

    const reasonsWithReturn = reasons.map((reason) => ({
      ...reason,
      actionHref: this.withHomeScoreReturnContext(propertyId, reason.actionHref),
    }));

    const sortedReasons = [...reasonsWithReturn].sort((a, b) => b.weight - a.weight);

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

    const verificationLadder = {
      userStated: qualitySignals.userStatedFilled,
      inferred:
        healthResult.missingCount +
        (riskReportReady ? 0 : 1) +
        (financialSummary.status === 'CALCULATED' ? 0 : 1),
      systemComputed:
        Number(riskReportReady) +
        Number(financialSummary.status === 'CALCULATED') +
        Number(qualitySignals.documentCount > 0) +
        Number(scoreSummary.scores.HEALTH.latest !== null) +
        Number(scoreSummary.scores.RISK.latest !== null) +
        Number(scoreSummary.scores.FINANCIAL.latest !== null),
    };

    const confidenceWeight = overallConfidence === 'HIGH' ? 0.9 : overallConfidence === 'MEDIUM' ? 0.7 : 0.5;
    const dataCompletenessWeight = clamp(
      qualitySignals.profileCompletenessRatio * 0.55 +
        (qualitySignals.documentCount > 0 ? 0.15 : 0) +
        (riskReportReady ? 0.15 : 0) +
        (financialSummary.status === 'CALCULATED' ? 0.15 : 0),
      0,
      1
    );
    const accuracyScore = Math.round(
      clamp((confidenceWeight * 0.45 + dataCompletenessWeight * 0.55) * 100, 15, 99)
    );
    const scoreSpread = clamp(
      (overallConfidence === 'HIGH' ? 4 : overallConfidence === 'MEDIUM' ? 8 : 13) +
        Math.round((1 - dataCompletenessWeight) * 10),
      3,
      20
    );
    const scoreRangeLow = Math.round(clamp(homeScore - scoreSpread, 0, 100));
    const scoreRangeHigh = Math.round(clamp(homeScore + Math.max(2, scoreSpread - 2), 0, 100));

    let riskExposureRangeLow: number | null = null;
    let riskExposureRangeHigh: number | null = null;
    if (riskReportReady) {
      const exposureSpreadPct =
        (overallConfidence === 'HIGH' ? 0.12 : overallConfidence === 'MEDIUM' ? 0.22 : 0.35) +
        Math.max(0, (1 - dataCompletenessWeight) * 0.1);
      riskExposureRangeLow = Math.max(0, Math.round(riskExposure * (1 - exposureSpreadPct)));
      riskExposureRangeHigh = Math.round(riskExposure * (1 + exposureSpreadPct));
    }

    const consistencyChecks = this.buildConsistencyChecks(propertyId, qualitySignals);
    const verificationOpportunities = this.buildVerificationOpportunities(
      propertyId,
      qualitySignals,
      riskReportReady,
      financialSummary.status
    );
    const correctionHistory = await this.getCorrectionHistory(propertyId);
    const fieldFacts = this.buildFieldFacts(propertyId, qualitySignals, components);
    const changeLog = this.buildChangeLog(scoreSummary, correctionHistory);

    const report: HomeScoreReportDTO = {
      propertyId,
      generatedAt: new Date().toISOString(),
      homeScore,
      scoreBand: scoreBand(homeScore),
      deltaFromPreviousWeek,
      confidence: overallConfidence,
      verificationLadder,
      components,
      topReasonsScoreNotHigher: sortedReasons.slice(0, 5),
      whatChangedSinceLastWeek: whatChangedSinceLastWeek.slice(0, 5),
      consistencyChecks,
      verificationOpportunities,
      fieldFacts,
      correctionHistory,
      changeLog,
      uncertainty: {
        scoreRangeLow,
        scoreRangeHigh,
        riskExposureRangeLow,
        riskExposureRangeHigh,
        accuracyScore,
        detail:
          accuracyScore >= 75
            ? 'Score range is tight because profile and evidence quality are strong.'
            : 'Score range is wider due to missing profile inputs or unverified evidence.',
      },
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

  async getCorrections(propertyId: string, userId: string, limit = 20) {
    await this.assertPropertyAccess(propertyId, userId);
    return this.getCorrectionHistory(propertyId, limit);
  }

  async submitCorrection(propertyId: string, userId: string, input: HomeScoreCorrectionInput) {
    await this.assertPropertyAccess(propertyId, userId);
    const fieldKey = input.fieldKey.trim();
    const detail = input.detail.trim();
    const title = (input.title || `Correction requested for ${fieldKey}`).trim();
    const proposedValue = input.proposedValue?.trim() || null;

    if (!fieldKey || !detail) {
      throw new Error('fieldKey and detail are required to submit a correction.');
    }

    const signals = await this.getPropertyQualitySignals(propertyId);
    const propertyFactMap: Record<string, unknown> = {
      yearBuilt: signals.property.yearBuilt,
      propertyType: signals.property.propertyType,
      propertySize: signals.property.propertySize,
      roofReplacementYear: signals.property.roofReplacementYear,
      hvacInstallYear: signals.property.hvacInstallYear,
      waterHeaterInstallYear: signals.property.waterHeaterInstallYear,
      hasSmokeDetectors: signals.property.hasSmokeDetectors,
      hasCoDetectors: signals.property.hasCoDetectors,
      hasSecuritySystem: signals.property.hasSecuritySystem,
      hasFireExtinguisher: signals.property.hasFireExtinguisher,
    };
    const currentValue = Object.prototype.hasOwnProperty.call(propertyFactMap, fieldKey)
      ? propertyFactMap[fieldKey]
      : null;

    const createdLog = await prisma.auditLog.create({
      data: {
        userId,
        action: 'HOME_SCORE_CORRECTION_SUBMITTED',
        entityType: 'PROPERTY',
        entityId: propertyId,
        oldValues: {
          fieldKey,
          currentValue: toDisplayValue(currentValue),
        },
        newValues: {
          fieldKey,
          title,
          detail,
          proposedValue,
          status: 'SUBMITTED',
        },
      },
    });

    return {
      correction: {
        id: createdLog.id,
        fieldKey,
        title,
        detail,
        proposedValue,
        status: 'SUBMITTED' as HomeScoreCorrectionStatus,
        submittedAt: createdLog.createdAt.toISOString(),
        submittedBy: userId,
      },
    };
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
