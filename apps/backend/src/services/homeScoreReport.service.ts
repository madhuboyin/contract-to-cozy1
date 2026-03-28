import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { calculateHealthScore, HealthScoreResult } from '../utils/propertyScore.util';
import RiskAssessmentService from './RiskAssessment.service';
import { FinancialReportService } from './FinancialReport.service';
import {
  formatMajorApplianceType,
  inferMajorApplianceType,
  majorApplianceTypeFromSourceHash,
  PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX,
} from './majorAppliance.util';
import { PreferenceProfileService } from './preferenceProfile.service';
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
type HomeScoreGrade = 'A' | 'B' | 'C' | 'D' | 'F';
type HomeScoreRatingTier = 'EXCELLENT' | 'STRONG' | 'STABLE' | 'MODERATE_RISK' | 'HIGH_RISK';
type HomeScoreProvenanceBadge = 'VERIFIED' | 'DOCUMENT_BACKED' | 'PUBLIC_RECORD' | 'USER_REPORTED' | 'INFERRED' | 'MISSING';
type HomeScoreTimelineDatePrecision = 'DATE' | 'YEAR';
type HomeScoreDataSourceStatus = 'AVAILABLE' | 'PARTIAL' | 'PLANNED';
type HomeScoreEffortLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type HomeScoreUrgencyLevel = 'LOW' | 'MEDIUM' | 'HIGH';

type HomeScoreSectionKey =
  | 'REPORT_META'
  | 'EXECUTIVE_SUMMARY'
  | 'RADAR'
  | 'SCORE_DRIVERS'
  | 'TIMELINE'
  | 'SYSTEM_HEALTH'
  | 'FINANCIAL_EXPOSURE'
  | 'TRUST_VERIFICATION'
  | 'INTEGRITY_CHECKS'
  | 'BENCHMARKS'
  | 'IMPROVEMENT_PLAN'
  | 'METHODOLOGY';

const RISK_EXPOSURE_CAP = 15000;
const HOME_SCORE_SNAPSHOT_STALE_HOURS = Math.max(1, Number(process.env.HOME_SCORE_SNAPSHOT_STALE_HOURS || 24));
const HOME_SCORE_SNAPSHOT_STALE_MS = HOME_SCORE_SNAPSHOT_STALE_HOURS * 60 * 60 * 1000;
const HOME_SCORE_GRADE_MAPPING: HomeScoreGradeBandConfigDTO[] = [
  { min: 90, max: 100, grade: 'A', ratingTier: 'EXCELLENT', label: 'Excellent' },
  { min: 80, max: 89, grade: 'B', ratingTier: 'STRONG', label: 'Strong' },
  { min: 70, max: 79, grade: 'C', ratingTier: 'STABLE', label: 'Stable' },
  { min: 60, max: 69, grade: 'D', ratingTier: 'MODERATE_RISK', label: 'Moderate Risk' },
  { min: 0, max: 59, grade: 'F', ratingTier: 'HIGH_RISK', label: 'High Risk' },
];

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

export type HomeScoreGradeBandConfigDTO = {
  min: number;
  max: number;
  grade: HomeScoreGrade;
  ratingTier: HomeScoreRatingTier;
  label: string;
};

export type HomeScoreReportMetaDTO = {
  reportTitle: string;
  propertyAddress: string;
  reportId: string;
  generatedDate: string;
  propertyType?: string | null;
  yearBuilt?: number | null;
  preparedFor: string | null;
  ownerName: string | null;
  dataCoveragePercentage: number;
  verificationStatusSummary: string;
  confidenceLevel: HomeScoreConfidence;
  reportMode: 'HOMEOWNER';
  reportVersion: string;
  gradeMapping: HomeScoreGradeBandConfigDTO[];
};

export type HomeScoreExecutiveSummaryDTO = {
  homeScore: number;
  homeScoreMax: number;
  grade: HomeScoreGrade;
  ratingTier: HomeScoreRatingTier;
  confidenceLevel: HomeScoreConfidence;
  valueProtectionScore: number;
  moneyAtRiskHeadline: number;
  moneyAtRiskHorizonMonths: number;
  scoreDeltaFromPreviousPeriod: number | null;
  trendStatus: 'AVAILABLE' | 'INSUFFICIENT_HISTORY';
};

export type HomeScoreRadarAxisDTO = {
  key: 'MAINTENANCE' | 'INSURANCE' | 'SAFETY' | 'FINANCIAL' | 'WEATHER';
  label: string;
  score: number;
  confidence: HomeScoreConfidence;
  estimated: boolean;
};

export type HomeScoreRadarDTO = {
  axes: HomeScoreRadarAxisDTO[];
  weakestArea: string;
  strongestArea: string;
  explanation: string;
};

export type HomeScoreDriverDTO = {
  id: string;
  title: string;
  explanation: string;
  scoreImpact: number;
  financialImpact: number | null;
  confidence: HomeScoreConfidence;
  provenance: HomeScoreProvenanceBadge;
  actionHref?: string;
};

export type HomeScoreTimelineEventDTO = {
  id: string;
  title: string;
  summary: string | null;
  eventType: string;
  occurredAt: string | null;
  year: number | null;
  datePrecision: HomeScoreTimelineDatePrecision;
  provenance: HomeScoreProvenanceBadge;
  verified: boolean;
};

export type HomeScoreSystemHealthDTO = {
  key:
    | 'ROOF'
    | 'HVAC'
    | 'WATER_HEATER'
    | 'PLUMBING'
    | 'ELECTRICAL'
    | 'SAFETY_SYSTEMS'
    | 'EXTERIOR_ENVELOPE'
    | 'FOUNDATION_STRUCTURE';
  label: string;
  grade: HomeScoreGrade;
  statusLabel: string;
  ageYears: number | null;
  serviceWindow: string | null;
  verification: HomeScoreProvenanceBadge;
  nextRecommendedAction: string;
  projectedRiskHorizonMonths: number | null;
  isPlaceholder: boolean;
};

export type HomeScoreFinancialExposureLineDTO = {
  id: string;
  label: string;
  exposure: number;
  confidence: HomeScoreConfidence;
  provenance: HomeScoreProvenanceBadge;
  urgency: HomeScoreUrgencyLevel;
};

export type HomeScoreFinancialExposureDTO = {
  currency: 'USD';
  headlineMoneyAtRisk: number;
  horizon12Months: number;
  horizon3Years: number;
  horizon5Years: number;
  confidenceRangeLow: number | null;
  confidenceRangeHigh: number | null;
  lines: HomeScoreFinancialExposureLineDTO[];
  whatReducesRisk: Array<{
    title: string;
    detail: string;
  }>;
};

export type HomeScoreTrustVerificationDTO = {
  dataCoveragePct: number;
  verifiedPct: number;
  estimatedPct: number;
  userReportedPct: number;
  publicRecordPct: number;
  documentBackedPct: number;
  confidenceScore: number;
  confidenceLevel: HomeScoreConfidence;
  badgeTaxonomy: HomeScoreProvenanceBadge[];
  explanation: string;
};

export type HomeScoreIntegrityCheckItemDTO = {
  id: string;
  title: string;
  status: HomeScoreConsistencyStatus;
  detail: string;
  remediation: string | null;
  actionHref?: string;
};

export type HomeScoreBenchmarkItemDTO = {
  key: 'NEIGHBORHOOD' | 'ZIP' | 'CITY' | 'STATE' | 'TOP_PERCENTILE' | 'PLATFORM_COMPARABLES';
  label: string;
  score: number;
  sampleSize: number | null;
  available: boolean;
};

export type HomeScoreBenchmarkDTO = {
  thisHomeScore: number;
  percentile: number | null;
  sources: HomeScoreBenchmarkItemDTO[];
  interpretation: string;
};

export type HomeScoreImprovementActionDTO = {
  id: string;
  title: string;
  projectedPointGain: number;
  projectedRiskReduction: number;
  estimatedCostToImprove: number | null;
  estimatedConfidenceGain: HomeScoreConfidence;
  effort: HomeScoreEffortLevel;
  urgency: HomeScoreUrgencyLevel;
  actionHref?: string;
};

export type HomeScoreImprovementPlanDTO = {
  actions: HomeScoreImprovementActionDTO[];
  potentialNewScore: number;
  potentialMoneyAtRiskReduction: number;
};

export type HomeScoreMethodologyDTO = {
  summary: string;
  inputsUsed: string[];
  intendedUse: string;
  disclosures: string[];
  methodologyHref: string | null;
  dataSources: Array<{
    key: string;
    label: string;
    status: HomeScoreDataSourceStatus;
  }>;
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
  reportMeta: HomeScoreReportMetaDTO;
  executiveSummary: HomeScoreExecutiveSummaryDTO;
  radar: HomeScoreRadarDTO;
  scoreDrivers: HomeScoreDriverDTO[];
  timeline: {
    events: HomeScoreTimelineEventDTO[];
    emptyState: {
      title: string;
      detail: string;
      ctaLabel: string;
      ctaHref: string;
    } | null;
  };
  systemHealth: HomeScoreSystemHealthDTO[];
  financialExposure: HomeScoreFinancialExposureDTO;
  trustAndVerification: HomeScoreTrustVerificationDTO;
  integrityChecks: HomeScoreIntegrityCheckItemDTO[];
  benchmarks: HomeScoreBenchmarkDTO;
  improvementPlan: HomeScoreImprovementPlanDTO;
  methodology: HomeScoreMethodologyDTO;
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

type HomeScoreTimelineSourceEvent = {
  id: string;
  type: string;
  occurredAt: Date;
  title: string;
  summary: string | null;
  createdById: string | null;
  documents?: Array<unknown>;
  inventoryItem?: {
    sourceHash: string | null;
    name: string;
    category: string;
  } | null;
};

type HomeScoreCanonicalApplianceInput = {
  sourceHash: string | null;
  installedOn: Date | null;
  createdAt: Date;
};

export type HomeScoreCorrectionInput = {
  fieldKey: string;
  title?: string;
  detail: string;
  proposedValue?: string;
};

export type HomeScoreEventInput = {
  event: string;
  section?: string;
  metadata?: Record<string, unknown>;
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

function scoreGrade(score: number): { grade: HomeScoreGrade; ratingTier: HomeScoreRatingTier; label: string } {
  const normalizedScore = clamp(Math.round(score), 0, 100);
  const match =
    HOME_SCORE_GRADE_MAPPING.find((row) => normalizedScore >= row.min && normalizedScore <= row.max) ??
    HOME_SCORE_GRADE_MAPPING[HOME_SCORE_GRADE_MAPPING.length - 1];
  return {
    grade: match.grade,
    ratingTier: match.ratingTier,
    label: match.label,
  };
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatAddress(parts: Array<string | null | undefined>) {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join(', ');
}

function formatPersonName(firstName?: string | null, lastName?: string | null) {
  const first = String(firstName || '').trim();
  const last = String(lastName || '').trim();
  return [first, last].filter(Boolean).join(' ').trim();
}

function toPercent(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return clamp(Math.round((numerator / denominator) * 100), 0, 100);
}

function confidenceToScore(confidence: HomeScoreConfidence) {
  if (confidence === 'HIGH') return 85;
  if (confidence === 'MEDIUM') return 65;
  return 40;
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
  private readonly preferenceProfileService = new PreferenceProfileService();

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
        address: true,
        city: true,
        state: true,
        zipCode: true,
        yearBuilt: true,
        propertyType: true,
        propertySize: true,
        homeownerProfile: {
          select: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
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

  private toCents(value: number | null | undefined): bigint | null {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    return BigInt(Math.round(value * 100));
  }

  private scoreModelVersion(weeks: number) {
    return `homescore-v2:weeks:${weeks}`;
  }

  private sectionHash(payload: unknown) {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private mapMethodologySourceName(key: string):
    | 'FEMA'
    | 'CLIMATE_RISK'
    | 'COUNTY_PERMITS'
    | 'TAX_RECORDS'
    | 'UTILITY_BENCHMARK'
    | 'INSURANCE_MODEL'
    | 'CONTRACT_TO_COZY_ENGINE'
    | null {
    const normalized = String(key || '').toUpperCase();
    if (normalized === 'FEMA_FLOOD') return 'FEMA';
    if (normalized === 'CLIMATE') return 'CLIMATE_RISK';
    if (normalized === 'PERMITS') return 'COUNTY_PERMITS';
    if (normalized === 'TAX') return 'TAX_RECORDS';
    if (normalized === 'UTILITY_BENCH') return 'UTILITY_BENCHMARK';
    if (normalized === 'INSURANCE_MODEL') return 'INSURANCE_MODEL';
    if (normalized === 'CTC_ENGINE') return 'CONTRACT_TO_COZY_ENGINE';
    return null;
  }

  private mapMethodologyRunStatus(status: HomeScoreDataSourceStatus): 'SUCCESS' | 'PARTIAL' | 'FAILED' {
    if (status === 'AVAILABLE') return 'SUCCESS';
    if (status === 'PARTIAL') return 'PARTIAL';
    return 'FAILED';
  }

  private mapSeverityFromIntegrityStatus(status: HomeScoreConsistencyStatus): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (status === 'FAIL') return 'HIGH';
    if (status === 'WARN') return 'MEDIUM';
    return 'LOW';
  }

  private sectionPayloads(report: HomeScoreReportDTO): Array<{ sectionKey: HomeScoreSectionKey; payload: unknown }> {
    return [
      {
        sectionKey: 'REPORT_META',
        payload: {
          reportMeta: report.reportMeta,
          fullReport: report,
        },
      },
      { sectionKey: 'EXECUTIVE_SUMMARY', payload: report.executiveSummary },
      { sectionKey: 'RADAR', payload: report.radar },
      { sectionKey: 'SCORE_DRIVERS', payload: report.scoreDrivers },
      { sectionKey: 'TIMELINE', payload: report.timeline },
      { sectionKey: 'SYSTEM_HEALTH', payload: report.systemHealth },
      { sectionKey: 'FINANCIAL_EXPOSURE', payload: report.financialExposure },
      { sectionKey: 'TRUST_VERIFICATION', payload: report.trustAndVerification },
      { sectionKey: 'INTEGRITY_CHECKS', payload: report.integrityChecks },
      { sectionKey: 'BENCHMARKS', payload: report.benchmarks },
      { sectionKey: 'IMPROVEMENT_PLAN', payload: report.improvementPlan },
      { sectionKey: 'METHODOLOGY', payload: report.methodology },
    ];
  }

  private normalizePersistedReport(propertyId: string, fallbackGeneratedAt: string, raw: unknown): HomeScoreReportDTO | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const report = raw as Partial<HomeScoreReportDTO>;
    if (!report.propertyId || report.propertyId !== propertyId) return null;
    if (!report.reportMeta || !report.executiveSummary || !report.financialExposure || !report.trustAndVerification) {
      return null;
    }

    const normalizedHomeScore = asNumber(report.homeScore ?? report.executiveSummary.homeScore ?? 0);
    const normalizedConfidence = (report.confidence || report.trustAndVerification.confidenceLevel || 'MEDIUM') as HomeScoreConfidence;

    return {
      ...report,
      propertyId,
      homeScore: normalizedHomeScore,
      generatedAt: report.generatedAt || fallbackGeneratedAt,
      scoreBand: report.scoreBand || scoreBand(normalizedHomeScore),
      deltaFromPreviousWeek:
        typeof report.deltaFromPreviousWeek === 'number' && Number.isFinite(report.deltaFromPreviousWeek)
          ? report.deltaFromPreviousWeek
          : report.executiveSummary.scoreDeltaFromPreviousPeriod,
      confidence: normalizedConfidence,
      verificationLadder:
        report.verificationLadder && typeof report.verificationLadder === 'object'
          ? report.verificationLadder
          : { userStated: 0, inferred: 0, systemComputed: 0 },
      components: Array.isArray(report.components) ? report.components : [],
      topReasonsScoreNotHigher: Array.isArray(report.topReasonsScoreNotHigher) ? report.topReasonsScoreNotHigher : [],
      whatChangedSinceLastWeek: Array.isArray(report.whatChangedSinceLastWeek) ? report.whatChangedSinceLastWeek : [],
      consistencyChecks: Array.isArray(report.consistencyChecks) ? report.consistencyChecks : [],
      verificationOpportunities: Array.isArray(report.verificationOpportunities) ? report.verificationOpportunities : [],
      fieldFacts: Array.isArray(report.fieldFacts) ? report.fieldFacts : [],
      correctionHistory: Array.isArray(report.correctionHistory) ? report.correctionHistory : [],
      changeLog: Array.isArray(report.changeLog) ? report.changeLog : [],
      trend: Array.isArray(report.trend) ? report.trend : [],
      scoreDrivers: Array.isArray(report.scoreDrivers) ? report.scoreDrivers : [],
      systemHealth: Array.isArray(report.systemHealth) ? report.systemHealth : [],
      integrityChecks: Array.isArray(report.integrityChecks) ? report.integrityChecks : [],
      timeline:
        report.timeline && typeof report.timeline === 'object'
          ? report.timeline
          : { events: [], emptyState: null },
      methodology:
        report.methodology && typeof report.methodology === 'object'
          ? report.methodology
          : {
              summary: '',
              inputsUsed: [],
              intendedUse: '',
              disclosures: [],
              methodologyHref: null,
              dataSources: [],
            },
      uncertainty:
        report.uncertainty && typeof report.uncertainty === 'object'
          ? report.uncertainty
          : {
              scoreRangeLow: Math.round(asNumber(report.homeScore)),
              scoreRangeHigh: Math.round(asNumber(report.homeScore)),
              riskExposureRangeLow: null,
              riskExposureRangeHigh: null,
              accuracyScore: 50,
              detail: 'Derived from persisted snapshot.',
            },
      nextBestAction:
        report.nextBestAction && typeof report.nextBestAction === 'object'
          ? report.nextBestAction
          : null,
      reportMeta: report.reportMeta,
      executiveSummary: report.executiveSummary,
      radar: report.radar || {
        axes: [],
        weakestArea: 'Unavailable',
        strongestArea: 'Unavailable',
        explanation: 'Radar data unavailable in persisted snapshot.',
      },
      financialExposure: report.financialExposure,
      trustAndVerification: report.trustAndVerification,
      benchmarks:
        report.benchmarks && typeof report.benchmarks === 'object'
          ? report.benchmarks
          : {
              thisHomeScore: Math.round(normalizedHomeScore),
              percentile: null,
              sources: [],
              interpretation: 'Benchmark data will appear as comparable score snapshots become available.',
            },
      improvementPlan:
        report.improvementPlan && typeof report.improvementPlan === 'object'
          ? report.improvementPlan
          : {
              actions: [],
              potentialNewScore: Math.round(normalizedHomeScore),
              potentialMoneyAtRiskReduction: 0,
            },
    } as HomeScoreReportDTO;
  }

  private async getPersistedReport(propertyId: string, weeks: number): Promise<HomeScoreReportDTO | null> {
    const snapshot = await prisma.homeScoreReport.findFirst({
      where: {
        propertyId,
        reportMode: 'HOMEOWNER',
        status: 'FINAL',
        scoreModelVersion: this.scoreModelVersion(weeks),
      },
      orderBy: [{ generatedAt: 'desc' }],
      include: {
        sections: {
          select: {
            sectionKey: true,
            sectionJson: true,
          },
        },
      },
    });

    if (!snapshot) return null;

    const reportMetaSection = snapshot.sections.find((section) => section.sectionKey === 'REPORT_META');
    if (!reportMetaSection) return null;
    const reportMetaPayload = this.parseJsonObject(reportMetaSection.sectionJson ?? null);
    const fullReport = this.normalizePersistedReport(
      propertyId,
      snapshot.generatedAt.toISOString(),
      reportMetaPayload.fullReport
    );

    return fullReport;
  }

  private isPersistedReportStale(generatedAtIso: string): boolean {
    const generatedAtMs = new Date(generatedAtIso).getTime();
    if (!Number.isFinite(generatedAtMs)) return true;
    return Date.now() - generatedAtMs > HOME_SCORE_SNAPSHOT_STALE_MS;
  }

  private async persistReportArtifacts(
    tx: Prisma.TransactionClient,
    reportId: string,
    propertyId: string,
    report: HomeScoreReportDTO
  ) {
    const generatedAt = new Date(report.generatedAt);
    const sectionRows = this.sectionPayloads(report).map((entry) => ({
      reportId,
      sectionKey: entry.sectionKey,
      sectionJson: entry.payload as Prisma.InputJsonValue,
      hashSha256: this.sectionHash(entry.payload),
    }));

    if (sectionRows.length > 0) {
      await tx.homeScoreReportSection.createMany({ data: sectionRows });
    }

    if (report.integrityChecks.length > 0) {
      await tx.homeScoreIntegrityCheckRun.createMany({
        data: report.integrityChecks.map((check) => ({
          propertyId,
          reportId,
          checkKey: check.id,
          status: check.status,
          severity: this.mapSeverityFromIntegrityStatus(check.status),
          detail: check.detail,
          remediationHref: check.actionHref ?? null,
          computedAt: generatedAt,
        })),
      });
    }

    const forecastHorizons: Array<{ horizonMonths: 12 | 36 | 60; value: number }> = [
      { horizonMonths: 12, value: report.financialExposure.horizon12Months },
      { horizonMonths: 36, value: report.financialExposure.horizon3Years },
      { horizonMonths: 60, value: report.financialExposure.horizon5Years },
    ];

    for (const horizon of forecastHorizons) {
      const createdForecast = await tx.homeScoreFinancialForecast.create({
        data: {
          propertyId,
          reportId,
          modelVersion: report.reportMeta.reportVersion || '2.0',
          horizonMonths: horizon.horizonMonths,
          moneyAtRiskCents: this.toCents(horizon.value) ?? BigInt(0),
          confidenceLowCents: this.toCents(report.financialExposure.confidenceRangeLow),
          confidenceHighCents: this.toCents(report.financialExposure.confidenceRangeHigh),
          computedAt: generatedAt,
        },
        select: { id: true },
      });

      if (report.financialExposure.lines.length > 0) {
        await tx.homeScoreFinancialForecastItem.createMany({
          data: report.financialExposure.lines.map((line) => ({
            forecastId: createdForecast.id,
            categoryKey: line.label,
            estimatedCostCents: this.toCents(line.exposure) ?? BigInt(0),
            verifiedCostCents:
              line.provenance === 'VERIFIED' ||
              line.provenance === 'DOCUMENT_BACKED' ||
              line.provenance === 'PUBLIC_RECORD'
                ? this.toCents(line.exposure)
                : null,
            urgency: line.urgency,
            sourceType:
              line.provenance === 'VERIFIED' ||
              line.provenance === 'DOCUMENT_BACKED' ||
              line.provenance === 'PUBLIC_RECORD'
                ? 'VERIFIED'
                : 'ESTIMATED',
          })),
        });
      }
    }

    for (const source of report.methodology.dataSources) {
      const sourceName = this.mapMethodologySourceName(source.key);
      if (!sourceName) continue;

      const run = await tx.homeScoreDataSourceRun.create({
        data: {
          propertyId,
          sourceName,
          sourceVersion: report.reportMeta.reportVersion || '2.0',
          runStatus: this.mapMethodologyRunStatus(source.status),
          startedAt: generatedAt,
          completedAt: generatedAt,
          recordsRead: 1,
          recordsWritten: source.status === 'AVAILABLE' ? 1 : 0,
          errorSummary: source.status === 'PLANNED' ? 'Source not integrated in this region yet.' : null,
        },
        select: { id: true },
      });

      await tx.homeScoreDataSourceFact.create({
        data: {
          propertyId,
          sourceName,
          factKey: 'SOURCE_STATUS',
          factValueJson: {
            key: source.key,
            label: source.label,
            status: source.status,
            generatedAt: report.generatedAt,
          } as Prisma.InputJsonValue,
          effectiveAt: generatedAt,
          runId: run.id,
        },
      });
    }
  }

  private async persistReportSnapshot(
    propertyId: string,
    userId: string,
    weeks: number,
    report: HomeScoreReportDTO,
    preferenceProfileId?: string | null
  ) {
    await prisma.$transaction(async (tx) => {
      const scoreModelVersion = this.scoreModelVersion(weeks);

      await tx.homeScoreReport.updateMany({
        where: {
          propertyId,
          reportMode: 'HOMEOWNER',
          status: 'FINAL',
          scoreModelVersion,
        },
        data: {
          status: 'SUPERSEDED',
        },
      });

      const createdReport = await tx.homeScoreReport.create({
        data: {
          propertyId,
          preferenceProfileId: preferenceProfileId ?? null,
          generatedByUserId: userId,
          reportMode: 'HOMEOWNER',
          reportVersion: report.reportMeta.reportVersion || '2.0',
          scoreModelVersion,
          status: 'FINAL',
          generatedAt: new Date(report.generatedAt),
        },
        select: { id: true },
      });

      await this.persistReportArtifacts(tx, createdReport.id, propertyId, report);
    });
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
        verifyHref: `/dashboard/documents?propertyId=${propertyId}`,
      },
      {
        id: 'fact-evidence-documents',
        key: 'evidenceDocumentCount',
        label: 'Evidence-backed docs',
        value: signals.evidenceDocumentCount,
        component: 'GENERAL',
        provenance: 'SYSTEM_COMPUTED',
        verifyHref: `/dashboard/documents?propertyId=${propertyId}`,
      },
      {
        id: 'fact-insurance-linked',
        key: 'insuranceCount',
        label: 'Insurance policies linked',
        value: signals.insuranceCount,
        component: 'FINANCIAL',
        provenance: 'SYSTEM_COMPUTED',
        verifyHref: `/dashboard/insurance?propertyId=${propertyId}`,
      },
      {
        id: 'fact-warranties-linked',
        key: 'warrantyCount',
        label: 'Warranties linked',
        value: signals.warrantyCount,
        component: 'FINANCIAL',
        provenance: 'SYSTEM_COMPUTED',
        verifyHref: `/dashboard/warranties?propertyId=${propertyId}`,
      },
      {
        id: 'fact-overdue-tasks',
        key: 'overdueTaskCount',
        label: 'Overdue maintenance tasks',
        value: signals.overdueTaskCount,
        component: 'RISK',
        provenance: 'SYSTEM_COMPUTED',
        verifyHref: `/dashboard/actions?propertyId=${propertyId}`,
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
        actionHref: `/dashboard/actions?propertyId=${propertyId}`,
      });
    } else if (overdueTaskCount > 0) {
      checks.push({
        id: 'maintenance-backlog',
        title: 'Overdue maintenance tasks',
        status: 'WARN',
        severity: 'MEDIUM',
        detail: `${overdueTaskCount} overdue task${overdueTaskCount === 1 ? '' : 's'} detected.`,
        actionHref: `/dashboard/actions?propertyId=${propertyId}`,
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
        actionHref: `/dashboard/documents?propertyId=${propertyId}`,
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
        href: `/dashboard/documents?propertyId=${propertyId}`,
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
        href: `/dashboard/insurance?propertyId=${propertyId}`,
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
        href: `/dashboard/warranties?propertyId=${propertyId}`,
      });
    }

    return opportunities.slice(0, 5).map((opportunity) => ({
      ...opportunity,
      href: this.withHomeScoreReturnContext(propertyId, opportunity.href),
    }));
  }

  private mapRiskLevelToConfidence(riskLevel: unknown): HomeScoreConfidence {
    const normalized = String(riskLevel || '').toUpperCase();
    if (normalized === 'CRITICAL' || normalized === 'HIGH') return 'HIGH';
    if (normalized === 'ELEVATED' || normalized === 'MODERATE') return 'MEDIUM';
    return 'LOW';
  }

  private mapEventProvenance(event: {
    createdById?: string | null;
    type?: string | null;
    documents?: Array<unknown>;
  }): HomeScoreProvenanceBadge {
    if ((event.documents || []).length > 0) return 'DOCUMENT_BACKED';
    if (event.createdById) return 'USER_REPORTED';
    if (event.type === 'CLAIM' || event.type === 'INSPECTION') return 'VERIFIED';
    if (event.type === 'VALUE_UPDATE') return 'PUBLIC_RECORD';
    return 'INFERRED';
  }

  private normalizeTimelineTitle(value: string) {
    return String(value || '')
      .toLowerCase()
      .replace(/^purchased(?:\s*:)?\s*/i, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private canonicalPurchaseKey(event: HomeScoreTimelineSourceEvent): string | null {
    if (event.type !== 'PURCHASE') return null;

    const sourceHashType = majorApplianceTypeFromSourceHash(event.inventoryItem?.sourceHash);
    if (sourceHashType) return `appliance:${sourceHashType}`;

    if (!/^purchased\b/i.test(event.title)) return null;

    const inferredFromTitle = inferMajorApplianceType(event.title);
    if (inferredFromTitle) return `appliance:${inferredFromTitle}`;

    const normalized = this.normalizeTimelineTitle(event.title);
    return normalized ? `purchase:${normalized}` : null;
  }

  private collapseDuplicatePurchaseEvents(events: HomeScoreTimelineSourceEvent[]): HomeScoreTimelineSourceEvent[] {
    const passthrough: HomeScoreTimelineSourceEvent[] = [];
    const groupedPurchases = new Map<string, HomeScoreTimelineSourceEvent[]>();

    for (const event of events) {
      const key = this.canonicalPurchaseKey(event);
      if (!key) {
        passthrough.push(event);
        continue;
      }
      if (!groupedPurchases.has(key)) {
        groupedPurchases.set(key, []);
      }
      groupedPurchases.get(key)!.push(event);
    }

    const collapsedPurchases = Array.from(groupedPurchases.entries()).map(([key, duplicates]) => {
      if (duplicates.length === 1) return duplicates[0];

      const sortedByDate = [...duplicates].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
      const earliest = sortedByDate[0];
      const latest = sortedByDate[sortedByDate.length - 1];
      const preferredEvent =
        sortedByDate.find((entry) => (entry.documents || []).length > 0) ??
        [...sortedByDate].reverse().find((entry) => Boolean(entry.createdById)) ??
        latest;
      const inferredType = key.startsWith('appliance:')
        ? key.replace('appliance:', '')
        : inferMajorApplianceType(earliest.title);
      const canonicalTitle = inferredType
        ? `Purchased: ${formatMajorApplianceType(inferredType)}`
        : earliest.title;
      const rangeLabel =
        toIsoDate(earliest.occurredAt) === toIsoDate(latest.occurredAt)
          ? `on ${toIsoDate(earliest.occurredAt)}`
          : `from ${toIsoDate(earliest.occurredAt)} to ${toIsoDate(latest.occurredAt)}`;
      const mergedSummary = [preferredEvent.summary, `Consolidated ${duplicates.length} similar purchase entries ${rangeLabel}.`]
        .filter(Boolean)
        .join(' ');

      return {
        ...preferredEvent,
        id: `dedup-${earliest.id}`,
        occurredAt: preferredEvent.occurredAt,
        title: canonicalTitle,
        summary: mergedSummary || null,
      };
    });

    return [...passthrough, ...collapsedPurchases].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  }

  private buildMissingCanonicalApplianceEvents(
    existingEvents: HomeScoreTimelineSourceEvent[],
    canonicalAppliances: HomeScoreCanonicalApplianceInput[]
  ): HomeScoreTimelineEventDTO[] {
    const existingTypes = new Set<string>();
    existingEvents.forEach((event) => {
      const key = this.canonicalPurchaseKey(event);
      if (key?.startsWith('appliance:')) {
        existingTypes.add(key.replace('appliance:', ''));
      }
    });

    const synthetic: HomeScoreTimelineEventDTO[] = [];
    canonicalAppliances.forEach((appliance) => {
      const applianceType = majorApplianceTypeFromSourceHash(appliance.sourceHash);
      if (!applianceType || existingTypes.has(applianceType)) return;

      const referenceDate = appliance.installedOn ?? appliance.createdAt;
      synthetic.push({
        id: `inventory-appliance-${applianceType.toLowerCase()}`,
        title: `Recorded appliance: ${formatMajorApplianceType(applianceType)}`,
        summary: 'Captured from property appliance profile. Add purchase/service records to improve timeline precision.',
        eventType: 'PURCHASE',
        occurredAt: referenceDate.toISOString(),
        year: referenceDate.getUTCFullYear(),
        datePrecision: 'YEAR',
        provenance: 'INFERRED',
        verified: false,
      });
    });

    return synthetic;
  }

  private formatSystemLabel(rawSystemType: unknown) {
    const normalized = String(rawSystemType || '')
      .replace(/^MAJOR_APPLIANCE_/, '')
      .replace(/_/g, ' ')
      .trim();
    if (!normalized) return 'General home system';
    return normalized
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private buildRadar(
    components: HomeScoreComponentDTO[],
    signals: PropertyQualitySignals,
    financialSummaryStatus: 'CALCULATED' | 'MISSING_DATA' | 'QUEUED' | 'NO_PROPERTY'
  ): HomeScoreRadarDTO {
    const componentScore = (key: HomeScoreComponentKey) => components.find((component) => component.key === key)?.score ?? 0;
    const maintenanceScore = Math.round(
      clamp(
        componentScore('HEALTH') * 0.75 +
          (signals.overdueTaskCount === 0 ? 15 : Math.max(0, 12 - signals.overdueTaskCount * 2)),
        0,
        100
      )
    );
    const insuranceScore = Math.round(
      clamp(
        signals.insuranceCount > 0 ? 70 : 38,
        0,
        100
      )
    );
    const safetySignal = [signals.property.hasSmokeDetectors, signals.property.hasCoDetectors].filter(
      (item) => item === true
    ).length;
    const safetyUnknown = [signals.property.hasSmokeDetectors, signals.property.hasCoDetectors].filter(
      (item) => item === null
    ).length;
    const safetyScore = Math.round(
      clamp(45 + safetySignal * 22 - safetyUnknown * 8 + (signals.property.hasFireExtinguisher ? 8 : 0), 0, 100)
    );
    const financialScore = Math.round(componentScore('FINANCIAL'));
    const weatherScore = Math.round(
      clamp(
        componentScore('RISK') * 0.7 + (signals.property.hasDrainageIssues ? -12 : 10),
        0,
        100
      )
    );

    const axes: HomeScoreRadarAxisDTO[] = [
      {
        key: 'MAINTENANCE',
        label: 'Maintenance',
        score: maintenanceScore,
        confidence: confidenceFromRatio(clamp(signals.profileCompletenessRatio + 0.1, 0, 1)),
        estimated: signals.overdueTaskCount === 0 && signals.criticalTaskCount === 0 ? false : signals.documentCount === 0,
      },
      {
        key: 'INSURANCE',
        label: 'Insurance',
        score: insuranceScore,
        confidence: signals.insuranceCount > 0 ? 'MEDIUM' : 'LOW',
        estimated: signals.insuranceCount === 0,
      },
      {
        key: 'SAFETY',
        label: 'Safety',
        score: safetyScore,
        confidence: safetyUnknown > 0 ? 'MEDIUM' : 'HIGH',
        estimated: safetyUnknown > 0,
      },
      {
        key: 'FINANCIAL',
        label: 'Financial',
        score: financialScore,
        confidence: financialSummaryStatus === 'CALCULATED' ? 'HIGH' : 'LOW',
        estimated: financialSummaryStatus !== 'CALCULATED',
      },
      {
        key: 'WEATHER',
        label: 'Weather',
        score: weatherScore,
        confidence: components.find((component) => component.key === 'RISK')?.confidence ?? 'MEDIUM',
        estimated: signals.documentCount === 0,
      },
    ];

    const strongestArea = [...axes].sort((a, b) => b.score - a.score)[0];
    const weakestArea = [...axes].sort((a, b) => a.score - b.score)[0];

    return {
      axes,
      weakestArea: weakestArea?.label ?? 'Maintenance',
      strongestArea: strongestArea?.label ?? 'Maintenance',
      explanation: `${weakestArea?.label ?? 'One area'} is limiting score resilience most right now, while ${
        strongestArea?.label ?? 'another area'
      } is currently performing best.`,
    };
  }

  private buildTimeline(
    propertyId: string,
    propertyContext: {
      yearBuilt: number | null;
      createdAt: Date;
    },
    homeEvents: HomeScoreTimelineSourceEvent[],
    canonicalAppliances: HomeScoreCanonicalApplianceInput[]
  ): HomeScoreReportDTO['timeline'] {
    const normalizedHomeEvents = this.collapseDuplicatePurchaseEvents(homeEvents);
    const mappedTimelineEvents: HomeScoreTimelineEventDTO[] = normalizedHomeEvents
      .map((event) => {
        const provenance = this.mapEventProvenance(event);
        return {
          id: event.id,
          title: event.title,
          summary: event.summary,
          eventType: event.type,
          occurredAt: event.occurredAt.toISOString(),
          year: event.occurredAt.getUTCFullYear(),
          datePrecision: 'DATE' as const,
          provenance,
          verified: provenance === 'VERIFIED' || provenance === 'DOCUMENT_BACKED' || provenance === 'PUBLIC_RECORD',
        };
      });
    const inferredMissingApplianceEvents = this.buildMissingCanonicalApplianceEvents(normalizedHomeEvents, canonicalAppliances);
    const timelineEvents: HomeScoreTimelineEventDTO[] = [...mappedTimelineEvents, ...inferredMissingApplianceEvents]
      .sort((a, b) => new Date(a.occurredAt || 0).getTime() - new Date(b.occurredAt || 0).getTime());

    if (propertyContext.yearBuilt) {
      timelineEvents.unshift({
        id: 'property-year-built',
        title: 'Home constructed',
        summary: null,
        eventType: 'MILESTONE',
        occurredAt: null,
        year: propertyContext.yearBuilt,
        datePrecision: 'YEAR' as const,
        provenance: 'PUBLIC_RECORD',
        verified: true,
      });
    } else {
      const createdYear = propertyContext.createdAt.getUTCFullYear();
      timelineEvents.unshift({
        id: 'property-created-on-platform',
        title: 'Property profile created',
        summary: 'Add key home history milestones to improve report confidence.',
        eventType: 'MILESTONE',
        occurredAt: null,
        year: createdYear,
        datePrecision: 'YEAR' as const,
        provenance: 'INFERRED',
        verified: false,
      });
    }

    const hasRealEvents = timelineEvents.some((event) => event.id !== 'property-year-built');

    return {
      events: timelineEvents.slice(0, 40),
      emptyState: hasRealEvents
        ? null
        : {
            title: 'Build your home timeline',
            detail: 'Add service records and key upgrades to improve report quality and trust.',
            ctaLabel: 'Add timeline event',
            ctaHref: `/dashboard/properties/${propertyId}/timeline`,
          },
    };
  }

  private buildSystemHealth(
    signals: PropertyQualitySignals,
    riskDetails: Array<Record<string, unknown>>,
    hasEvidenceDocuments: boolean
  ): HomeScoreSystemHealthDTO[] {
    const currentYear = new Date().getUTCFullYear();
    const maxRiskByKeyword = (keyword: string) =>
      riskDetails
        .filter((detail) => String(detail.systemType || '').includes(keyword))
        .reduce((max, detail) => Math.max(max, asNumber(detail.riskDollar ?? detail.outOfPocketCost ?? 0)), 0);

    const isHighRiskByKeyword = (keyword: string) =>
      riskDetails.some((detail) => {
        const systemType = String(detail.systemType || '');
        const riskLevel = String(detail.riskLevel || '').toUpperCase();
        return systemType.includes(keyword) && (riskLevel === 'HIGH' || riskLevel === 'CRITICAL');
      });

    const buildSystemRow = (args: {
      key: HomeScoreSystemHealthDTO['key'];
      label: string;
      installYear: number | null;
      expectedLifeYears: number;
      keyword: string;
      fallbackStatus: string;
      placeholder?: boolean;
    }): HomeScoreSystemHealthDTO => {
      if (args.placeholder) {
        return {
          key: args.key,
          label: args.label,
          grade: 'C',
          statusLabel: 'Pending external data support',
          ageYears: null,
          serviceWindow: null,
          verification: 'MISSING',
          nextRecommendedAction: 'Connect inspection or structural records to activate this section.',
          projectedRiskHorizonMonths: null,
          isPlaceholder: true,
        };
      }

      const ageYears = args.installYear ? Math.max(0, currentYear - args.installYear) : null;
      let score = 78;
      if (ageYears !== null) {
        const lifeRatio = ageYears / Math.max(args.expectedLifeYears, 1);
        if (lifeRatio >= 1) score -= 34;
        else if (lifeRatio >= 0.75) score -= 18;
        else if (lifeRatio >= 0.5) score -= 8;
      } else {
        score -= 12;
      }

      const riskPenalty = isHighRiskByKeyword(args.keyword) ? 16 : maxRiskByKeyword(args.keyword) > 0 ? 8 : 0;
      score = clamp(Math.round(score - riskPenalty + (hasEvidenceDocuments ? 4 : 0)), 0, 100);

      const grade = scoreGrade(score).grade;
      const statusLabel =
        grade === 'A' || grade === 'B'
          ? 'Stable'
          : grade === 'C'
          ? args.fallbackStatus
          : 'Needs attention';

      const remainingYears =
        ageYears !== null ? Math.max(0, Math.round(args.expectedLifeYears - ageYears)) : null;

      return {
        key: args.key,
        label: args.label,
        grade,
        statusLabel,
        ageYears,
        serviceWindow:
          ageYears === null
            ? 'Install year not verified'
            : remainingYears === 0
            ? 'At or beyond expected service life'
            : `${remainingYears} year${remainingYears === 1 ? '' : 's'} remaining (estimated)`,
        verification: hasEvidenceDocuments ? 'DOCUMENT_BACKED' : ageYears === null ? 'MISSING' : 'USER_REPORTED',
        nextRecommendedAction:
          grade === 'D' || grade === 'F'
            ? `Prioritize inspection for ${args.label.toLowerCase()}.`
            : ageYears === null
            ? `Verify ${args.label.toLowerCase()} install year.`
            : `Continue scheduled upkeep for ${args.label.toLowerCase()}.`,
        projectedRiskHorizonMonths: remainingYears === null ? null : clamp(remainingYears * 12, 3, 180),
        isPlaceholder: false,
      };
    };

    return [
      buildSystemRow({
        key: 'ROOF',
        label: 'Roof',
        installYear: signals.property.roofReplacementYear ?? signals.property.yearBuilt,
        expectedLifeYears: 25,
        keyword: 'ROOF',
        fallbackStatus: 'Watch condition',
      }),
      buildSystemRow({
        key: 'HVAC',
        label: 'HVAC',
        installYear: signals.property.hvacInstallYear,
        expectedLifeYears: 15,
        keyword: 'HVAC',
        fallbackStatus: 'Service planning recommended',
      }),
      buildSystemRow({
        key: 'WATER_HEATER',
        label: 'Water Heater',
        installYear: signals.property.waterHeaterInstallYear,
        expectedLifeYears: 10,
        keyword: 'WATER_HEATER',
        fallbackStatus: 'Lifecycle verification needed',
      }),
      buildSystemRow({
        key: 'PLUMBING',
        label: 'Plumbing',
        installYear: signals.property.yearBuilt,
        expectedLifeYears: 35,
        keyword: 'PLUMB',
        fallbackStatus: 'Routine checks advised',
      }),
      buildSystemRow({
        key: 'ELECTRICAL',
        label: 'Electrical',
        installYear: signals.property.yearBuilt,
        expectedLifeYears: 40,
        keyword: 'ELECT',
        fallbackStatus: 'Panel update may be needed',
      }),
      buildSystemRow({
        key: 'SAFETY_SYSTEMS',
        label: 'Safety Systems',
        installYear: signals.property.yearBuilt,
        expectedLifeYears: 8,
        keyword: 'SAFETY',
        fallbackStatus: 'Validate safety coverage',
      }),
      buildSystemRow({
        key: 'EXTERIOR_ENVELOPE',
        label: 'Exterior / Envelope',
        installYear: signals.property.yearBuilt,
        expectedLifeYears: 30,
        keyword: 'EXTERIOR',
        fallbackStatus: 'Seasonal inspection advised',
      }),
      buildSystemRow({
        key: 'FOUNDATION_STRUCTURE',
        label: 'Foundation / Structure',
        installYear: null,
        expectedLifeYears: 0,
        keyword: 'FOUNDATION',
        fallbackStatus: 'Future ready',
        placeholder: true,
      }),
    ];
  }

  private deriveFinancialExposure(
    riskExposure: number,
    uncertainty: HomeScoreUncertaintyDTO,
    riskDetails: Array<Record<string, unknown>>,
    doNothingRuns: Array<{
      horizonMonths: number;
      expectedCostDeltaCentsMin: number | null;
      expectedCostDeltaCentsMax: number | null;
      nextSteps: Prisma.JsonValue | null;
    }>
  ): HomeScoreFinancialExposureDTO {
    const averageRunExposure = (run?: {
      expectedCostDeltaCentsMin: number | null;
      expectedCostDeltaCentsMax: number | null;
    }) => {
      if (!run) return null;
      const min = run.expectedCostDeltaCentsMin ?? run.expectedCostDeltaCentsMax ?? null;
      const max = run.expectedCostDeltaCentsMax ?? run.expectedCostDeltaCentsMin ?? null;
      if (min === null || max === null) return null;
      return Math.round((min + max) / 2 / 100);
    };

    const run12 = doNothingRuns.find((run) => run.horizonMonths === 12);
    const run36 = doNothingRuns.find((run) => run.horizonMonths === 36);
    const run24 = doNothingRuns.find((run) => run.horizonMonths === 24);
    const run6 = doNothingRuns.find((run) => run.horizonMonths === 6);

    const horizon12 = averageRunExposure(run12) ?? averageRunExposure(run6) ?? Math.round(riskExposure * 0.55);
    const horizon3Years =
      averageRunExposure(run36) ?? (averageRunExposure(run24) ? Math.round((averageRunExposure(run24) as number) * 1.4) : null) ?? Math.round(riskExposure * 1.2);
    const horizon5Years = Math.round(Math.max(horizon3Years * 1.65, horizon12 * 2.1));

    const prioritizedLines = [...riskDetails]
      .sort(
        (a, b) =>
          asNumber(b.riskDollar ?? b.outOfPocketCost ?? b.replacementCost ?? 0) -
          asNumber(a.riskDollar ?? a.outOfPocketCost ?? a.replacementCost ?? 0)
      )
      .slice(0, 6)
      .map((detail, index): HomeScoreFinancialExposureLineDTO => {
        const exposure = Math.round(asNumber(detail.riskDollar ?? detail.outOfPocketCost ?? detail.replacementCost ?? 0));
        const riskLevel = String(detail.riskLevel || '').toUpperCase();
        return {
          id: `financial-line-${index}`,
          label: this.formatSystemLabel(detail.systemType ?? detail.assetName),
          exposure,
          confidence: this.mapRiskLevelToConfidence(riskLevel),
          provenance: asNumber(detail.coverageFactor ?? 0) > 0.3 ? 'VERIFIED' : 'INFERRED',
          urgency: riskLevel === 'CRITICAL' || riskLevel === 'HIGH' ? 'HIGH' : riskLevel === 'ELEVATED' ? 'MEDIUM' : 'LOW',
        };
      });

    const parsedNextSteps = (run36?.nextSteps && Array.isArray(run36.nextSteps) ? run36.nextSteps : []) as Array<
      Record<string, unknown>
    >;
    const whatReducesRisk =
      parsedNextSteps.slice(0, 3).map((step) => ({
        title: String(step.title || 'Complete priority maintenance action'),
        detail: String(step.detail || 'Timely maintenance and verification narrows downside risk.'),
      })) || [];

    return {
      currency: 'USD',
      headlineMoneyAtRisk: horizon3Years,
      horizon12Months: horizon12,
      horizon3Years,
      horizon5Years,
      confidenceRangeLow: uncertainty.riskExposureRangeLow ? Math.round(uncertainty.riskExposureRangeLow) : null,
      confidenceRangeHigh: uncertainty.riskExposureRangeHigh ? Math.round(uncertainty.riskExposureRangeHigh) : null,
      lines: prioritizedLines,
      whatReducesRisk:
        whatReducesRisk.length > 0
          ? whatReducesRisk
          : [
              {
                title: 'Address top high-risk systems first',
                detail: 'Prioritizing one high-risk system typically reduces near-term exposure materially.',
              },
            ],
    };
  }

  private buildTrustAndVerification(
    overallConfidence: HomeScoreConfidence,
    verificationLadder: {
      userStated: number;
      inferred: number;
      systemComputed: number;
    },
    signals: PropertyQualitySignals,
    timelineEvents: HomeScoreTimelineEventDTO[],
    uncertainty: HomeScoreUncertaintyDTO
  ): HomeScoreTrustVerificationDTO {
    const totalLadder = verificationLadder.userStated + verificationLadder.inferred + verificationLadder.systemComputed;
    const publicRecordCount = timelineEvents.filter((event) => event.provenance === 'PUBLIC_RECORD').length;
    const documentBackedCount = timelineEvents.filter((event) => event.provenance === 'DOCUMENT_BACKED').length;
    const dataCoveragePct = toPercent(
      signals.userStatedFilled + signals.documentCount + signals.insuranceCount + signals.warrantyCount,
      signals.userStatedTotal + 12
    );

    return {
      dataCoveragePct,
      verifiedPct: toPercent(verificationLadder.systemComputed, totalLadder),
      estimatedPct: toPercent(verificationLadder.inferred, totalLadder),
      userReportedPct: toPercent(verificationLadder.userStated, totalLadder),
      publicRecordPct: toPercent(publicRecordCount, Math.max(1, timelineEvents.length)),
      documentBackedPct: toPercent(documentBackedCount + signals.evidenceDocumentCount, Math.max(1, timelineEvents.length + 4)),
      confidenceScore: Math.round((confidenceToScore(overallConfidence) + uncertainty.accuracyScore) / 2),
      confidenceLevel: overallConfidence,
      badgeTaxonomy: ['VERIFIED', 'DOCUMENT_BACKED', 'PUBLIC_RECORD', 'USER_REPORTED', 'INFERRED', 'MISSING'],
      explanation:
        'Confidence reflects source quality, data completeness, and consistency checks. Add documents and structured records to increase trust.',
    };
  }

  private async buildBenchmarks(
    propertyId: string,
    homeScore: number,
    propertyContext: { zipCode: string; city: string; state: string }
  ): Promise<HomeScoreBenchmarkDTO> {
    const snapshotModel = (prisma as any).propertyScoreSnapshot;
    const empty: HomeScoreBenchmarkDTO = {
      thisHomeScore: Math.round(homeScore),
      percentile: null,
      sources: [
        { key: 'ZIP', label: 'ZIP average', score: 0, sampleSize: null, available: false },
        { key: 'CITY', label: 'City average', score: 0, sampleSize: null, available: false },
        { key: 'STATE', label: 'State average', score: 0, sampleSize: null, available: false },
      ],
      interpretation: 'Benchmark data will appear as comparable score snapshots become available.',
    };

    if (!snapshotModel) return empty;

    const computeLevel = async (whereProperty: Record<string, unknown>) => {
      const rows = (await snapshotModel.findMany({
        where: {
          propertyId: { not: propertyId },
          scoreType: { in: ['HEALTH', 'RISK', 'FINANCIAL'] },
          property: whereProperty,
        },
        orderBy: [{ weekStart: 'desc' }],
        take: 1800,
        select: {
          propertyId: true,
          scoreType: true,
          score: true,
          weekStart: true,
        },
      })) as Array<{
        propertyId: string;
        scoreType: HomeScoreComponentKey;
        score: number;
      }>;

      const latestByPropertyAndType = new Map<string, number>();
      for (const row of rows) {
        const key = `${row.propertyId}-${row.scoreType}`;
        if (!latestByPropertyAndType.has(key)) {
          latestByPropertyAndType.set(key, asNumber(row.score));
        }
      }

      const byProperty = new Map<string, number[]>();
      for (const [key, score] of latestByPropertyAndType.entries()) {
        const [rowPropertyId] = key.split('-');
        const existing = byProperty.get(rowPropertyId) ?? [];
        existing.push(score);
        byProperty.set(rowPropertyId, existing);
      }

      const peerScores = Array.from(byProperty.values())
        .map((scores) => Math.round(average(scores) * 10) / 10)
        .filter((score) => Number.isFinite(score));

      if (peerScores.length === 0) return null;
      return {
        score: Math.round(average(peerScores)),
        sampleSize: peerScores.length,
        peerScores,
      };
    };

    const [zip, city, state] = await Promise.all([
      computeLevel({ zipCode: propertyContext.zipCode }),
      computeLevel({ city: propertyContext.city, state: propertyContext.state }),
      computeLevel({ state: propertyContext.state }),
    ]);

    const percentileBase = zip?.peerScores || city?.peerScores || state?.peerScores || [];
    const percentile =
      percentileBase.length > 0
        ? clamp(
            Math.round(
              (percentileBase.filter((peerScore) => homeScore >= peerScore).length / Math.max(percentileBase.length, 1)) * 100
            ),
            1,
            99
          )
        : null;

    const sources: HomeScoreBenchmarkItemDTO[] = [
      {
        key: 'ZIP',
        label: 'ZIP average',
        score: zip?.score ?? 0,
        sampleSize: zip?.sampleSize ?? null,
        available: Boolean(zip),
      },
      {
        key: 'CITY',
        label: 'City average',
        score: city?.score ?? 0,
        sampleSize: city?.sampleSize ?? null,
        available: Boolean(city),
      },
      {
        key: 'STATE',
        label: 'State average',
        score: state?.score ?? 0,
        sampleSize: state?.sampleSize ?? null,
        available: Boolean(state),
      },
      {
        key: 'TOP_PERCENTILE',
        label: 'Top percentile homes',
        score:
          percentileBase.length > 0
            ? Math.round(
                [...percentileBase].sort((a, b) => a - b)[Math.max(0, Math.floor(percentileBase.length * 0.8) - 1)] || homeScore
              )
            : 0,
        sampleSize: percentileBase.length || null,
        available: percentileBase.length > 0,
      },
    ];

    const strongestSource = sources.find((source) => source.available);
    const interpretation = strongestSource
      ? homeScore >= strongestSource.score
        ? `This home is currently above the ${strongestSource.label.toLowerCase()} benchmark.`
        : `This home is currently below the ${strongestSource.label.toLowerCase()} benchmark, with clear upside from improvement actions.`
      : empty.interpretation;

    return {
      thisHomeScore: Math.round(homeScore),
      percentile,
      sources,
      interpretation,
    };
  }

  private buildImprovementPlan(
    homeScore: number,
    verificationOpportunities: HomeScoreVerificationOpportunityDTO[],
    consistencyChecks: HomeScoreConsistencyCheckDTO[],
    reasons: HomeScoreReasonDTO[],
    financialExposure: HomeScoreFinancialExposureDTO
  ): HomeScoreImprovementPlanDTO {
    const actions: HomeScoreImprovementActionDTO[] = [];

    for (const opportunity of verificationOpportunities) {
      actions.push({
        id: `improve-${opportunity.id}`,
        title: opportunity.title,
        projectedPointGain: opportunity.estimatedConfidenceGain === 'HIGH' ? 4 : opportunity.estimatedConfidenceGain === 'MEDIUM' ? 3 : 2,
        projectedRiskReduction: Math.round(financialExposure.headlineMoneyAtRisk * 0.06),
        estimatedCostToImprove: null,
        estimatedConfidenceGain: opportunity.estimatedConfidenceGain,
        effort: opportunity.verificationType === 'DOCUMENT' ? 'MEDIUM' : 'LOW',
        urgency: opportunity.component === 'RISK' ? 'HIGH' : 'MEDIUM',
        actionHref: opportunity.href,
      });
    }

    for (const check of consistencyChecks.filter((item) => item.status !== 'PASS')) {
      actions.push({
        id: `improve-check-${check.id}`,
        title: check.title,
        projectedPointGain: check.status === 'FAIL' ? 5 : 3,
        projectedRiskReduction: Math.round(financialExposure.headlineMoneyAtRisk * (check.status === 'FAIL' ? 0.08 : 0.04)),
        estimatedCostToImprove: null,
        estimatedConfidenceGain: check.status === 'FAIL' ? 'HIGH' : 'MEDIUM',
        effort: 'MEDIUM',
        urgency: check.status === 'FAIL' ? 'HIGH' : 'MEDIUM',
        actionHref: check.actionHref,
      });
    }

    for (const reason of reasons.filter((item) => item.impact === 'NEGATIVE')) {
      actions.push({
        id: `improve-reason-${reason.id}`,
        title: reason.title,
        projectedPointGain: clamp(Math.round(reason.weight / 28), 2, 6),
        projectedRiskReduction: Math.round(financialExposure.headlineMoneyAtRisk * 0.05),
        estimatedCostToImprove: null,
        estimatedConfidenceGain: reason.confidence,
        effort: 'MEDIUM',
        urgency: reason.component === 'RISK' ? 'HIGH' : 'MEDIUM',
        actionHref: reason.actionHref,
      });
    }

    const deduped = actions.filter(
      (action, index, array) =>
        index === array.findIndex((other) => other.title.toLowerCase() === action.title.toLowerCase())
    );
    const prioritized = deduped
      .sort((a, b) => b.projectedPointGain - a.projectedPointGain || (a.urgency === 'HIGH' ? -1 : 1))
      .slice(0, 3);

    const totalProjectedGain = prioritized.reduce((sum, action) => sum + action.projectedPointGain, 0);
    const potentialMoneyAtRiskReduction = prioritized.reduce((sum, action) => sum + action.projectedRiskReduction, 0);

    return {
      actions: prioritized,
      potentialNewScore: clamp(Math.round(homeScore + totalProjectedGain), 0, 100),
      potentialMoneyAtRiskReduction,
    };
  }

  private buildMethodology(): HomeScoreMethodologyDTO {
    return {
      summary:
        'HomeScore combines health, risk, and financial signals into a 0-100 score intended to support planning and value protection decisions.',
      inputsUsed: [
        'Property profile details',
        'Maintenance activity and overdue tasks',
        'Risk assessment model outputs',
        'Insurance, warranty, and utility cost signals',
        'Timeline and documentation evidence',
      ],
      intendedUse:
        'For homeowner planning, prioritization, and trust transparency. It is not a substitute for lender underwriting, appraisal, or code inspection.',
      disclosures: [
        'Some values are estimated using inferred or user-provided data.',
        'Confidence ranges widen when key fields or documents are missing.',
        'External source modules are integrated progressively and may be partially available by region.',
      ],
      methodologyHref: null,
      dataSources: [
        { key: 'CTC_ENGINE', label: 'Contract-to-Cozy analysis engine', status: 'AVAILABLE' },
        { key: 'FEMA_FLOOD', label: 'FEMA flood risk', status: 'PLANNED' },
        { key: 'CLIMATE', label: 'Climate/weather risk provider', status: 'PARTIAL' },
        { key: 'PERMITS', label: 'County permit records', status: 'PARTIAL' },
        { key: 'TAX', label: 'Property tax records', status: 'PARTIAL' },
        { key: 'UTILITY_BENCH', label: 'Utility benchmark model', status: 'AVAILABLE' },
        { key: 'INSURANCE_MODEL', label: 'Insurance adequacy model', status: 'AVAILABLE' },
      ],
    };
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
      ['Needs Attention', 'Needs Review', 'Needs Inspection', 'Missing Data', 'Needs Warranty'].includes(insight.status)
    ).length;

    return {
      health,
      lastUpdatedAt: property.updatedAt.toISOString(),
      missingCount,
      highPriorityCount,
    };
  }

  private async build(propertyId: string, userId: string, weeks: number): Promise<HomeScoreBuildResult> {
    const propertyContext = await this.assertPropertyAccess(propertyId, userId);

    const [healthResult, riskReportOrQueued, financialSummary, scoreSummary, qualitySignals, homeEvents, canonicalAppliances, doNothingRuns] = await Promise.all([
      this.getHealthScore(propertyId),
      RiskAssessmentService.getOrCreateRiskReport(propertyId),
      this.financialService.getFinancialEfficiencySummary(propertyId),
      getPropertyScoreSnapshotSummary(propertyId, userId, weeks),
      this.getPropertyQualitySignals(propertyId),
      prisma.homeEvent.findMany({
        where: { propertyId },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 60,
        select: {
          id: true,
          type: true,
          occurredAt: true,
          title: true,
          summary: true,
          createdById: true,
          inventoryItem: {
            select: {
              sourceHash: true,
              name: true,
              category: true,
            },
          },
          documents: {
            select: { id: true },
            take: 2,
          },
        },
      }),
      prisma.inventoryItem.findMany({
        where: {
          propertyId,
          sourceHash: {
            startsWith: PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX,
          },
        },
        select: {
          sourceHash: true,
          installedOn: true,
          createdAt: true,
        },
      }),
      prisma.doNothingSimulationRun.findMany({
        where: {
          propertyId,
          status: 'READY',
        },
        orderBy: { computedAt: 'desc' },
        take: 8,
        select: {
          horizonMonths: true,
          expectedCostDeltaCentsMin: true,
          expectedCostDeltaCentsMax: true,
          nextSteps: true,
        },
      }),
    ]);

    const healthScore = Math.round((healthResult.health.totalScore / Math.max(healthResult.health.maxPotentialScore || 100, 1)) * 100);

    const riskReportReady = riskReportOrQueued !== 'QUEUED';
    const riskExposure = riskReportReady ? asNumber((riskReportOrQueued as any).financialExposureTotal) : 0;
    const riskDetails = riskReportReady && Array.isArray((riskReportOrQueued as any).details)
      ? ((riskReportOrQueued as any).details as Array<Record<string, unknown>>)
      : [];
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

    const uncertainty: HomeScoreUncertaintyDTO = {
      scoreRangeLow,
      scoreRangeHigh,
      riskExposureRangeLow,
      riskExposureRangeHigh,
      accuracyScore,
      detail:
        accuracyScore >= 75
          ? 'Score range is tight because profile and evidence quality are strong.'
          : 'Score range is wider due to missing profile inputs or unverified evidence.',
    };

    const timeline = this.buildTimeline(
      propertyId,
      {
        yearBuilt: propertyContext.yearBuilt,
        createdAt: propertyContext.createdAt,
      },
      homeEvents,
      canonicalAppliances
    );
    const trustAndVerification = this.buildTrustAndVerification(
      overallConfidence,
      verificationLadder,
      qualitySignals,
      timeline.events,
      uncertainty
    );
    const systemHealth = this.buildSystemHealth(
      qualitySignals,
      riskDetails,
      qualitySignals.evidenceDocumentCount > 0
    );
    const financialExposure = this.deriveFinancialExposure(
      riskExposure,
      uncertainty,
      riskDetails,
      doNothingRuns.map((run) => ({
        horizonMonths: run.horizonMonths,
        expectedCostDeltaCentsMin: run.expectedCostDeltaCentsMin ?? null,
        expectedCostDeltaCentsMax: run.expectedCostDeltaCentsMax ?? null,
        nextSteps: run.nextSteps ?? null,
      }))
    );
    const scoreDrivers: HomeScoreDriverDTO[] = sortedReasons
      .map((reason) => {
        const baseImpact = clamp(Math.round(reason.weight / 12), 0, 15);
        const scoreImpact =
          reason.impact === 'NEGATIVE' ? -Math.max(1, baseImpact) : reason.impact === 'POSITIVE' ? Math.max(1, baseImpact) : 0;
        const provenance: HomeScoreProvenanceBadge =
          reason.provenance === 'SYSTEM_COMPUTED'
            ? 'VERIFIED'
            : reason.provenance === 'USER_STATED'
            ? 'USER_REPORTED'
            : 'INFERRED';
        return {
          id: reason.id,
          title: reason.title,
          explanation: reason.detail,
          scoreImpact,
          financialImpact:
            reason.component === 'RISK'
              ? Math.round(riskExposure * 0.14)
              : reason.component === 'FINANCIAL'
              ? Math.round(financialExposure.headlineMoneyAtRisk * 0.08)
              : null,
          confidence: reason.confidence,
          provenance,
          actionHref: reason.actionHref,
        };
      })
      .sort((a, b) => Math.abs(b.scoreImpact) - Math.abs(a.scoreImpact))
      .slice(0, 6);

    const integrityChecks: HomeScoreIntegrityCheckItemDTO[] = consistencyChecks.map((check) => ({
      id: check.id,
      title: check.title,
      status: check.status,
      detail: check.detail,
      remediation: check.status === 'PASS' ? null : 'Resolve this item to improve report consistency and confidence.',
      actionHref: check.actionHref,
    }));

    const benchmarks = await this.buildBenchmarks(propertyId, homeScore, {
      zipCode: propertyContext.zipCode,
      city: propertyContext.city,
      state: propertyContext.state,
    });

    const improvementPlan = this.buildImprovementPlan(
      homeScore,
      verificationOpportunities,
      consistencyChecks,
      sortedReasons,
      financialExposure
    );
    const methodology = this.buildMethodology();
    const reportGrade = scoreGrade(homeScore);
    const valueProtectionScore = Math.round(clamp(healthScore * 0.55 + riskScore * 0.45, 0, 100));
    const generatedAt = new Date();
    const generatedAtIso = generatedAt.toISOString();
    const ownerName = formatPersonName(
      propertyContext.homeownerProfile?.user?.firstName ?? null,
      propertyContext.homeownerProfile?.user?.lastName ?? null
    );
    const reportId = `HSR-${toIsoDate(generatedAt).replace(/-/g, '')}-${propertyId.slice(0, 8).toUpperCase()}`;
    const reportMeta: HomeScoreReportMetaDTO = {
      reportTitle: 'Contract-to-Cozy Certified HomeScore Report',
      propertyAddress: formatAddress([
        propertyContext.address,
        propertyContext.city,
        propertyContext.state,
        propertyContext.zipCode,
      ]),
      reportId,
      generatedDate: generatedAtIso,
      propertyType: propertyContext.propertyType,
      yearBuilt: propertyContext.yearBuilt,
      preparedFor: ownerName || null,
      ownerName: ownerName || null,
      dataCoveragePercentage: trustAndVerification.dataCoveragePct,
      verificationStatusSummary:
        trustAndVerification.verifiedPct >= 55
          ? 'Verification status: strong evidence coverage'
          : 'Verification status: mixed evidence quality',
      confidenceLevel: overallConfidence,
      reportMode: 'HOMEOWNER',
      reportVersion: '2.0',
      gradeMapping: HOME_SCORE_GRADE_MAPPING,
    };

    const executiveSummary: HomeScoreExecutiveSummaryDTO = {
      homeScore,
      homeScoreMax: 100,
      grade: reportGrade.grade,
      ratingTier: reportGrade.ratingTier,
      confidenceLevel: overallConfidence,
      valueProtectionScore,
      moneyAtRiskHeadline: financialExposure.headlineMoneyAtRisk,
      moneyAtRiskHorizonMonths: 36,
      scoreDeltaFromPreviousPeriod: deltaFromPreviousWeek,
      trendStatus: trend.length > 1 ? 'AVAILABLE' : 'INSUFFICIENT_HISTORY',
    };
    const radar = this.buildRadar(components, qualitySignals, financialSummary.status);

    const report: HomeScoreReportDTO = {
      propertyId,
      generatedAt: generatedAtIso,
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
      uncertainty,
      nextBestAction,
      trend,
      reportMeta,
      executiveSummary,
      radar,
      scoreDrivers,
      timeline,
      systemHealth,
      financialExposure,
      trustAndVerification,
      integrityChecks,
      benchmarks,
      improvementPlan,
      methodology,
    };

    return {
      report,
      components,
      reasons: sortedReasons,
    };
  }

  async getReport(propertyId: string, userId: string, weeks = 26): Promise<HomeScoreReportDTO> {
    await this.assertPropertyAccess(propertyId, userId);
    const preferenceProfile = await this.preferenceProfileService.getCurrentProfile(propertyId);

    const persisted = await this.getPersistedReport(propertyId, weeks);
    const persistedIsFresh = persisted ? !this.isPersistedReportStale(persisted.generatedAt) : false;
    if (persisted && persistedIsFresh) {
      return persisted;
    }

    try {
      const result = await this.build(propertyId, userId, weeks);
      try {
        await this.persistReportSnapshot(
          propertyId,
          userId,
          weeks,
          result.report,
          preferenceProfile?.id ?? null
        );
      } catch (error) {
        console.error('Failed to persist HomeScore snapshot after build:', error);
      }
      return result.report;
    } catch (error) {
      if (persisted) {
        console.error('Failed to recompute stale HomeScore snapshot; falling back to persisted snapshot:', error);
        return persisted;
      }
      throw error;
    }
  }

  async getFactors(propertyId: string, userId: string, weeks = 26) {
    const report = await this.getReport(propertyId, userId, weeks);
    return report.topReasonsScoreNotHigher || [];
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

  async trackEvent(propertyId: string, userId: string, input: HomeScoreEventInput) {
    await this.assertPropertyAccess(propertyId, userId);

    const eventName = String(input.event || 'unknown').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 80);
    const section = input.section ? String(input.section).slice(0, 80) : null;

    await prisma.auditLog.create({
      data: {
        userId,
        action: `HOME_SCORE_${eventName || 'UNKNOWN'}`,
        entityType: 'PROPERTY',
        entityId: propertyId,
        newValues: {
          section,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        } as Prisma.InputJsonValue,
      },
    });

    return { ok: true };
  }

  async refresh(propertyId: string, userId: string, weeks = 26) {
    await this.assertPropertyAccess(propertyId, userId);
    const preferenceProfile = await this.preferenceProfileService.getCurrentProfile(propertyId);

    await Promise.all([
      RiskAssessmentService.calculateAndSaveReport(propertyId),
      this.financialService.calculateAndSaveFES(propertyId),
    ]);
    const result = await this.build(propertyId, userId, weeks);
    try {
      await this.persistReportSnapshot(
        propertyId,
        userId,
        weeks,
        result.report,
        preferenceProfile?.id ?? null
      );
    } catch (error) {
      console.error('Failed to persist HomeScore snapshot after refresh:', error);
    }
    return result.report;
  }
}
