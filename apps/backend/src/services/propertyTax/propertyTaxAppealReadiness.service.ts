import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { propertyTaxRecordService } from './propertyTaxRecord.service';
import { propertyTaxRuleService } from './propertyTaxRule.service';

type AppealGround = 'ASSESSED_VALUE' | 'TAX_CLASS' | 'EXEMPTION';
type AppealEvidenceType =
  | 'FACTUAL_ERROR'
  | 'CONDITION'
  | 'EXEMPTION_DECISION'
  | 'SUPPORTING_DOCUMENT';

type CanonicalField = {
  state: 'UNKNOWN' | 'KNOWN' | 'CONFLICTED';
  value: unknown | null;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function objects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(object).filter((item) => Object.keys(item).length > 0)
    : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function decimal(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const converted = typeof value === 'object' && value && 'toNumber' in value
    ? (value as { toNumber(): number }).toNumber()
    : Number(value);
  return Number.isFinite(converted) ? converted : null;
}

function normalizedClass(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim().toUpperCase()
    .replace(/^NYC\s+TAX\s+CLASS\s+/, '')
    .replace(/^TAX\s+CLASS\s+/, '')
    .replace(/^CLASS\s+/, '');
  return normalized || null;
}

function canonicalValue(
  fields: Record<string, CanonicalField>,
  key: string,
): unknown | null {
  const field = fields[key];
  return field?.state === 'KNOWN' ? field.value : null;
}

function dateValue(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function money(value: unknown): number | null {
  const converted = decimal(value);
  return converted !== null && converted >= 0 ? converted : null;
}

function evidenceHasSource(evidence: {
  sourceUrl: string | null;
  supportingDocumentId: string | null;
}) {
  return Boolean(evidence.sourceUrl || evidence.supportingDocumentId);
}

export class PropertyTaxAppealReadinessService {
  constructor(
    private readonly db = prisma,
    private readonly rules = propertyTaxRuleService,
    private readonly records = propertyTaxRecordService,
  ) {}

  async upsertEvidence(input: {
    propertyId: string;
    userId: string;
    evidenceKey: string;
    ground: AppealGround;
    type: AppealEvidenceType;
    title: string;
    description?: string;
    facts: Record<string, unknown>;
    sourceUrl?: string;
    supportingDocumentId?: string;
  }) {
    const ruleResult = await this.rules.getForProperty(
      input.propertyId,
      input.userId,
    );
    if (ruleResult.coverage !== 'REVIEWED' || !ruleResult.profile) {
      throw new Error(ruleResult.reason ?? 'No reviewed appeal rules cover this property');
    }
    const configuredGround = objects(
      object(ruleResult.profile.appealGrounds).grounds,
    ).some((ground) => ground.code === input.ground);
    if (!configuredGround) {
      throw new Error('The selected appeal ground is not covered by the reviewed rule');
    }
    if (input.supportingDocumentId) {
      const document = await this.db.document.findFirst({
        where: {
          id: input.supportingDocumentId,
          propertyId: input.propertyId,
        },
        select: { id: true },
      });
      if (!document) throw new Error('Supporting document not found for this property');
    }
    const now = new Date();
    return this.db.propertyTaxAppealEvidence.upsert({
      where: {
        propertyId_evidenceKey: {
          propertyId: input.propertyId,
          evidenceKey: input.evidenceKey,
        },
      },
      create: {
        propertyId: input.propertyId,
        ruleProfileId: ruleResult.profile.id,
        evidenceKey: input.evidenceKey,
        ground: input.ground,
        type: input.type,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        factsJson: json(input.facts),
        sourceUrl: input.sourceUrl?.trim() || null,
        supportingDocumentId: input.supportingDocumentId,
        confirmedAt: now,
        confirmedByUserId: input.userId,
      },
      update: {
        ruleProfileId: ruleResult.profile.id,
        ground: input.ground,
        type: input.type,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        factsJson: json(input.facts),
        sourceUrl: input.sourceUrl?.trim() || null,
        supportingDocumentId: input.supportingDocumentId ?? null,
        confirmedAt: now,
        confirmedByUserId: input.userId,
      },
    });
  }

  async upsertComparable(input: {
    propertyId: string;
    userId: string;
    comparableKey: string;
    address: string;
    saleDate: string;
    salePrice: number;
    propertyClass: string;
    livingAreaSqFt?: number;
    lotSizeSqFt?: number;
    condition?: string;
    sourceUrl?: string;
    sourceDocumentId?: string;
    adjustments?: {
      time?: number;
      condition?: number;
      size?: number;
      other?: number;
      rationale?: string;
    };
  }) {
    const ruleResult = await this.rules.getForProperty(
      input.propertyId,
      input.userId,
    );
    if (ruleResult.coverage !== 'REVIEWED' || !ruleResult.profile) {
      throw new Error(ruleResult.reason ?? 'No reviewed appeal rules cover this property');
    }
    const saleDate = new Date(input.saleDate);
    if (!Number.isFinite(saleDate.getTime())) throw new Error('saleDate is invalid');
    if (saleDate.getTime() > Date.now()) throw new Error('saleDate cannot be in the future');
    if (input.sourceDocumentId) {
      const document = await this.db.document.findFirst({
        where: { id: input.sourceDocumentId, propertyId: input.propertyId },
        select: { id: true },
      });
      if (!document) throw new Error('Comparable source document not found for this property');
    }
    const adjustments = input.adjustments ?? {};
    const adjustmentValues = [
      adjustments.time ?? 0,
      adjustments.condition ?? 0,
      adjustments.size ?? 0,
      adjustments.other ?? 0,
    ];
    if (
      adjustmentValues.some((value) => value !== 0)
      && !adjustments.rationale?.trim()
    ) {
      throw new Error('A rationale is required for comparable adjustments');
    }
    const now = new Date();
    return this.db.propertyTaxAppealComparable.upsert({
      where: {
        propertyId_comparableKey: {
          propertyId: input.propertyId,
          comparableKey: input.comparableKey,
        },
      },
      create: {
        propertyId: input.propertyId,
        ruleProfileId: ruleResult.profile.id,
        comparableKey: input.comparableKey,
        address: input.address.trim(),
        saleDate,
        salePrice: input.salePrice,
        propertyClass: input.propertyClass.trim(),
        livingAreaSqFt: input.livingAreaSqFt,
        lotSizeSqFt: input.lotSizeSqFt,
        condition: input.condition?.trim() || null,
        sourceUrl: input.sourceUrl?.trim() || null,
        sourceDocumentId: input.sourceDocumentId,
        timeAdjustment: adjustments.time ?? 0,
        conditionAdjustment: adjustments.condition ?? 0,
        sizeAdjustment: adjustments.size ?? 0,
        otherAdjustment: adjustments.other ?? 0,
        adjustmentRationale: adjustments.rationale?.trim() || null,
        confirmedAt: now,
        confirmedByUserId: input.userId,
      },
      update: {
        ruleProfileId: ruleResult.profile.id,
        address: input.address.trim(),
        saleDate,
        salePrice: input.salePrice,
        propertyClass: input.propertyClass.trim(),
        livingAreaSqFt: input.livingAreaSqFt ?? null,
        lotSizeSqFt: input.lotSizeSqFt ?? null,
        condition: input.condition?.trim() || null,
        sourceUrl: input.sourceUrl?.trim() || null,
        sourceDocumentId: input.sourceDocumentId ?? null,
        timeAdjustment: adjustments.time ?? 0,
        conditionAdjustment: adjustments.condition ?? 0,
        sizeAdjustment: adjustments.size ?? 0,
        otherAdjustment: adjustments.other ?? 0,
        adjustmentRationale: adjustments.rationale?.trim() || null,
        confirmedAt: now,
        confirmedByUserId: input.userId,
      },
    });
  }

  async evaluate(
    propertyId: string,
    userId: string,
    selectedGround: AppealGround,
    now = new Date(),
    deadlineInput: {
      revisedNoticeDate?: string;
      revisedNoticeQualifies?: boolean;
    } = {},
  ) {
    const [ruleResult, center] = await Promise.all([
      this.rules.getForProperty(propertyId, userId, deadlineInput, now),
      this.records.getCenter(propertyId, userId),
    ]);
    const empty = {
      selectedGround,
      reviewedGrounds: [] as Array<{
        code: string;
        label: string;
        formCode: string | null;
      }>,
      gaps: [] as string[],
      evidence: [] as unknown[],
      comparables: [] as unknown[],
      taxAtStake: null,
      effort: 'HIGH' as const,
      professionalBoundary:
        'This is preparation support, not legal, appraisal, or tax advice. Verify the current form, deadline, eligibility, and evidence standard with the official authority or a qualified professional.',
    };
    if (ruleResult.coverage !== 'REVIEWED' || !ruleResult.profile) {
      return {
        ...empty,
        status: 'NOT_COVERED' as const,
        reason: ruleResult.reason,
        ruleProfile: null,
      };
    }

    const groundDefinitions = objects(
      object(ruleResult.profile.appealGrounds).grounds,
    );
    const reviewedGrounds = groundDefinitions.map((ground) => ({
      code: String(ground.code ?? ''),
      label: String(ground.label ?? ground.code ?? ''),
      formCode: typeof ground.formCode === 'string' ? ground.formCode : null,
    })).filter((ground) => ground.code);
    const definition = groundDefinitions.find(
      (ground) => ground.code === selectedGround,
    );
    if (!definition) {
      return {
        ...empty,
        reviewedGrounds,
        status: 'NO_SUPPORTED_GROUND' as const,
        reason: 'The active reviewed rule does not support the selected ground.',
        ruleProfile: {
          id: ruleResult.profile.id,
          title: ruleResult.profile.title,
          version: ruleResult.profile.version,
          reviewedAt: ruleResult.profile.reviewedAt,
          expiresAt: ruleResult.profile.expiresAt,
        },
      };
    }

    const [evidenceRows, comparableRows] = await Promise.all([
      this.db.propertyTaxAppealEvidence.findMany({
        where: {
          propertyId,
          ruleProfileId: ruleResult.profile.id,
          ground: selectedGround,
        },
        orderBy: { confirmedAt: 'desc' },
      }),
      this.db.propertyTaxAppealComparable.findMany({
        where: { propertyId, ruleProfileId: ruleResult.profile.id },
        orderBy: { saleDate: 'desc' },
      }),
    ]);
    const assessmentFields = center.assessment.fields as Record<string, CanonicalField>;
    const billFields = center.bill.fields as Record<string, CanonicalField>;
    const requirements = object(definition.requirements);
    const gaps: string[] = [];
    const canonicalFields = strings(requirements.canonicalFields);
    for (const fieldKey of canonicalFields) {
      const field = assessmentFields[fieldKey];
      if (!field || field.state === 'UNKNOWN') {
        gaps.push(`Confirm the canonical ${fieldKey} field.`);
      } else if (field.state === 'CONFLICTED') {
        gaps.push(`Resolve the canonical ${fieldKey} conflict.`);
      }
    }

    const canonicalClass = normalizedClass(
      canonicalValue(assessmentFields, 'classification'),
    );
    const valuationDate = dateValue(
      canonicalValue(assessmentFields, 'valuationDate'),
    );
    const profileRatio = decimal(ruleResult.profile.assessmentRatio);
    const canonicalRatio = decimal(
      canonicalValue(assessmentFields, 'assessmentRatio'),
    );
    const assessmentRatio = canonicalRatio ?? profileRatio;
    const currentAssessedValue = money(
      canonicalValue(assessmentFields, 'totalAssessedValue'),
    );
    const taxableValue = money(
      canonicalValue(assessmentFields, 'taxableValue'),
    );
    const billAmount = money(canonicalValue(billFields, 'billAmount'));
    const canonicalTaxRate = decimal(
      canonicalValue(billFields, 'effectiveTaxRate'),
    );
    const effectiveTaxRate = canonicalTaxRate
      ?? (
        billAmount !== null
        && taxableValue !== null
        && taxableValue > 0
          ? billAmount / taxableValue
          : null
      );
    if (requirements.assessmentRatioRequired === true && assessmentRatio === null) {
      gaps.push('Confirm the assessment ratio or use a reviewed jurisdiction ratio.');
    }

    const windowDays = Number(requirements.comparableWindowDays ?? 365);
    const comparableResults = comparableRows.map((row) => {
      const reasons: string[] = [];
      const rowClass = normalizedClass(row.propertyClass);
      if (!valuationDate) {
        reasons.push('Canonical valuation date is missing.');
      } else {
        const differenceDays = Math.abs(
          row.saleDate.getTime() - valuationDate.getTime(),
        ) / 86_400_000;
        if (differenceDays > windowDays) {
          reasons.push(`Sale is outside the ${windowDays}-day valuation window.`);
        }
      }
      if (!canonicalClass) {
        reasons.push('Canonical property class is missing.');
      } else if (rowClass !== canonicalClass) {
        reasons.push('Comparable property class does not match.');
      }
      if (!row.sourceUrl && !row.sourceDocumentId) {
        reasons.push('A source URL or Vault document is required.');
      }
      const adjustments = {
        time: decimal(row.timeAdjustment) ?? 0,
        condition: decimal(row.conditionAdjustment) ?? 0,
        size: decimal(row.sizeAdjustment) ?? 0,
        other: decimal(row.otherAdjustment) ?? 0,
      };
      if (
        Object.values(adjustments).some((value) => value !== 0)
        && !row.adjustmentRationale
      ) {
        reasons.push('Adjustment rationale is missing.');
      }
      const salePrice = decimal(row.salePrice) ?? 0;
      return {
        id: row.id,
        comparableKey: row.comparableKey,
        address: row.address,
        saleDate: row.saleDate.toISOString(),
        salePrice,
        propertyClass: row.propertyClass,
        sourceUrl: row.sourceUrl,
        sourceDocumentId: row.sourceDocumentId,
        adjustments,
        adjustmentRationale: row.adjustmentRationale,
        adjustedSalePrice: salePrice
          + adjustments.time
          + adjustments.condition
          + adjustments.size
          + adjustments.other,
        qualification: reasons.length === 0 ? 'QUALIFIED' as const : 'NOT_QUALIFIED' as const,
        reasons,
      };
    });
    const qualified = comparableResults.filter(
      (comparable) => comparable.qualification === 'QUALIFIED',
    );
    let taxAtStake: {
      low: number;
      high: number;
      currency: 'USD';
      method: string;
      effectiveTaxRate: number;
      assessmentRatio: number;
      indicatedMarketValueRange: { low: number; high: number };
      indicatedAssessedValueRange: { low: number; high: number };
    } | null = null;
    let evidenceSupportsGround = true;
    let unsupportedReason: string | null = null;
    const appealDeadlines = (
      'deadlines' in ruleResult && Array.isArray(ruleResult.deadlines)
        ? ruleResult.deadlines
        : []
    ).filter((deadline) => deadline.type === 'ASSESSMENT_APPEAL');
    if (appealDeadlines.length > 0) {
      const hasOpenWindow = appealDeadlines.some((deadline) =>
        deadline.status === 'OPEN' || deadline.status === 'DUE_SOON'
      );
      if (!hasOpenWindow) {
        const inputDeadline = appealDeadlines.find((deadline) =>
          deadline.status === 'INPUT_REQUIRED'
        );
        if (inputDeadline) {
          gaps.push(
            inputDeadline.availability === 'NEEDS_NOTICE_DATE'
              ? 'Add the qualifying revised-notice date to establish an available filing window.'
              : 'Confirm that the revised notice meets the reviewed filing-window exception.',
          );
        } else {
          evidenceSupportsGround = false;
          unsupportedReason =
            'The active reviewed rule has no open assessment-appeal filing window.';
        }
      }
    }

    if (selectedGround === 'ASSESSED_VALUE') {
      const minimumComparables = Number(
        requirements.minimumQualifiedComparables ?? 3,
      );
      if (qualified.length < minimumComparables) {
        gaps.push(
          `Add ${minimumComparables - qualified.length} more jurisdiction-qualified comparable record(s).`,
        );
      }
      if (effectiveTaxRate === null || effectiveTaxRate <= 0) {
        gaps.push('Confirm the effective tax rate or bill and taxable value to calculate tax at stake.');
      }
      if (
        qualified.length >= minimumComparables
        && assessmentRatio !== null
        && currentAssessedValue !== null
        && effectiveTaxRate !== null
        && effectiveTaxRate > 0
      ) {
        const adjusted = qualified
          .map((comparable) => comparable.adjustedSalePrice)
          .filter((value) => value >= 0)
          .sort((a, b) => a - b);
        const marketLow = adjusted[0];
        const marketHigh = adjusted[adjusted.length - 1];
        const assessedLow = marketLow * assessmentRatio;
        const assessedHigh = marketHigh * assessmentRatio;
        const reductionLow = Math.max(0, currentAssessedValue - assessedHigh);
        const reductionHigh = Math.max(0, currentAssessedValue - assessedLow);
        taxAtStake = {
          low: Math.round(reductionLow * effectiveTaxRate * 100) / 100,
          high: Math.round(reductionHigh * effectiveTaxRate * 100) / 100,
          currency: 'USD',
          method:
            'Range from qualified adjusted sale prices × reviewed assessment ratio, compared with current assessed value, then × sourced effective tax rate. Caps, exemptions, abatements, and the authority’s determination can change the result.',
          effectiveTaxRate,
          assessmentRatio,
          indicatedMarketValueRange: { low: marketLow, high: marketHigh },
          indicatedAssessedValueRange: {
            low: assessedLow,
            high: assessedHigh,
          },
        };
        if (taxAtStake.high <= 0) {
          evidenceSupportsGround = false;
          unsupportedReason =
            'The qualified comparable range does not indicate an assessed value below the current canonical assessment.';
        }
      }
    }

    if (selectedGround === 'TAX_CLASS') {
      const factual = evidenceRows.find((row) => {
        const facts = object(row.factsJson);
        return row.type === 'FACTUAL_ERROR'
          && typeof facts.claimedClassification === 'string'
          && facts.officialRecordMismatch === true
          && evidenceHasSource(row);
      });
      if (!factual) {
        gaps.push(
          'Add sourced factual-error evidence identifying the claimed class and official-record mismatch.',
        );
      } else if (
        normalizedClass(object(factual.factsJson).claimedClassification)
        === canonicalClass
      ) {
        evidenceSupportsGround = false;
        unsupportedReason =
          'The sourced claimed tax class matches the current canonical class.';
      }
    }

    if (selectedGround === 'EXEMPTION') {
      const accepted = strings(requirements.acceptedDecisionTypes);
      const exemption = evidenceRows.find((row) => {
        const facts = object(row.factsJson);
        return row.type === 'EXEMPTION_DECISION'
          && typeof facts.programName === 'string'
          && typeof facts.noticeDate === 'string'
          && accepted.includes(String(facts.decisionType))
          && evidenceHasSource(row);
      });
      if (!exemption) {
        gaps.push(
          'Add the sourced exemption notice with program, notice date, and denial, revocation, reduction, or omission status.',
        );
      }
    }

    const incompleteCondition = evidenceRows.some((row) =>
      row.type === 'CONDITION' && !evidenceHasSource(row)
    );
    if (incompleteCondition) {
      gaps.push('Attach a source URL or Vault document to each condition claim.');
    }

    const status = gaps.length > 0
      ? 'NOT_READY' as const
      : evidenceSupportsGround
        ? 'READY' as const
        : 'NO_SUPPORTED_GROUND' as const;
    const effort = status === 'READY'
      ? evidenceRows.length + qualified.length >= 5
        ? 'LOW' as const
        : 'MEDIUM' as const
      : gaps.length >= 4
        ? 'HIGH' as const
        : 'MEDIUM' as const;
    return {
      selectedGround,
      status,
      reason: status === 'READY'
        ? 'The reviewed ground has the required canonical facts and evidence for preparation.'
        : status === 'NO_SUPPORTED_GROUND'
          ? unsupportedReason
          : 'Evidence or canonical facts are still missing.',
      reviewedGrounds,
      ground: {
        code: selectedGround,
        label: String(definition.label ?? selectedGround),
        formCode: typeof definition.formCode === 'string'
          ? definition.formCode
          : null,
        requirements,
      },
      ruleProfile: {
        id: ruleResult.profile.id,
        title: ruleResult.profile.title,
        version: ruleResult.profile.version,
        reviewedAt: ruleResult.profile.reviewedAt,
        expiresAt: ruleResult.profile.expiresAt,
      },
      evaluatedAt: now.toISOString(),
      canonical: {
        valuationDate: valuationDate?.toISOString() ?? null,
        classification: canonicalValue(assessmentFields, 'classification'),
        totalAssessedValue: currentAssessedValue,
        taxableValue,
        assessmentRatio,
        effectiveTaxRate,
      },
      gaps,
      effort,
      evidence: evidenceRows.map((row) => ({
        id: row.id,
        evidenceKey: row.evidenceKey,
        ground: row.ground,
        type: row.type,
        title: row.title,
        description: row.description,
        facts: row.factsJson,
        sourceUrl: row.sourceUrl,
        supportingDocumentId: row.supportingDocumentId,
        confirmedAt: row.confirmedAt.toISOString(),
      })),
      comparables: comparableResults,
      taxAtStake,
      professionalBoundary:
        'Readiness means the reviewed preparation requirements are present; it does not predict success. This is not legal, appraisal, or tax advice. Verify the current form, deadline, and filing standard with the official authority, and consider a qualified professional for material or complex claims.',
    };
  }
}

export const propertyTaxAppealReadinessService =
  new PropertyTaxAppealReadinessService();
