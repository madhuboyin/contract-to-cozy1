import { getGuidanceModels } from './guidanceTypes';
import { guidanceValidationService } from './guidanceValidation.service';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function pickNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && 'toNumber' in (value as Record<string, unknown>)) {
    try {
      const parsed = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function pickString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeToolOutput(toolKey: string, producedData: Record<string, unknown>) {
  const key = toolKey.toLowerCase();

  if (key === 'replace-repair') {
    return {
      replaceRepairVerdict: pickString(producedData.verdict),
      replaceRepairConfidence: pickString(producedData.confidence),
      breakEvenMonths: pickNumber(producedData.breakEvenMonths),
      expectedAnnualRepairRiskCents: pickNumber(producedData.expectedAnnualRepairRiskCents),
      estimatedReplacementCostCents: pickNumber(producedData.estimatedReplacementCostCents),
    };
  }

  if (key === 'coverage-intelligence') {
    const insuranceInputs = asRecord(asRecord(producedData.insurance).inputsUsed);
    const warranty = asRecord(producedData.warranty);

    return {
      coverageOverallVerdict: pickString(producedData.overallVerdict),
      insuranceVerdict: pickString(producedData.insuranceVerdict),
      warrantyVerdict: pickString(producedData.warrantyVerdict),
      coverageConfidence: pickString(producedData.confidence),
      deductibleUsd: pickNumber(insuranceInputs.deductibleUsd),
      expectedCoverageNetImpactUsd: pickNumber(warranty.expectedNetImpactUsd),
    };
  }

  if (key === 'service-price-radar') {
    const confidenceScore = pickNumber(producedData.confidenceScore);
    return {
      fairPriceMin: pickNumber(producedData.fairPriceMin),
      fairPriceMax: pickNumber(producedData.fairPriceMax),
      fairPriceCurrency: pickString(producedData.currency),
      fairPriceConfidence: pickString(producedData.confidence) ?? (confidenceScore != null ? String(confidenceScore) : null),
      fairPriceConfidenceScore: confidenceScore,
    };
  }

  if (key === 'negotiation-shield') {
    return {
      negotiationLeverage: producedData.negotiationLeverage ?? null,
      negotiationScriptType: pickString(producedData.scriptType) ?? pickString(producedData.draftType),
      negotiationConfidence: pickNumber(producedData.confidence),
    };
  }

  if (key === 'inspection-report') {
    return {
      inspectionOverallScore: pickNumber(producedData.overallScore),
      inspectionCondition: pickString(producedData.overallCondition),
      inspectionCriticalIssues: pickNumber(producedData.criticalIssues),
      inspectionTotalRepairCost: pickNumber(producedData.totalRepairCost),
      inspectionSuggestedCredit: pickNumber(producedData.suggestedCredit),
    };
  }

  if (key === 'recalls') {
    return {
      recallStatus: pickString(producedData.status),
      recallResolutionType: pickString(producedData.resolutionType),
      recallResolutionNotes: pickString(producedData.resolutionNotes),
    };
  }

  if (key === 'booking') {
    return {
      bookingId: pickString(producedData.bookingId),
      bookingStatus: pickString(producedData.status),
      bookingScheduledAt: pickString(producedData.scheduledDate),
    };
  }

  if (key === 'do-nothing-simulator') {
    return {
      doNothingRunId: pickString(producedData.runId),
      costOfInactionMinCents: pickNumber(producedData.expectedCostDeltaCentsMin),
      costOfInactionMaxCents: pickNumber(producedData.expectedCostDeltaCentsMax),
      doNothingIncidentLikelihood: pickString(producedData.incidentLikelihood),
      doNothingRiskScoreDelta: pickNumber(producedData.riskScoreDelta),
      doNothingSummary: pickString(producedData.summary),
    };
  }

  if (key === 'home-savings') {
    return {
      homeSavingsRunId: pickString(producedData.runId),
      potentialMonthlySavings: pickNumber(producedData.potentialMonthlySavings),
      potentialAnnualSavings: pickNumber(producedData.potentialAnnualSavings),
      categoriesWithSavings: pickNumber(producedData.categoriesWithSavings),
    };
  }

  if (key === 'true-cost') {
    return {
      annualTotalNow: pickNumber(producedData.annualTotalNow),
      total5yCost: pickNumber(producedData.total5y),
      taxes5y: pickNumber(producedData.taxes5y),
      insurance5y: pickNumber(producedData.insurance5y),
      maintenance5y: pickNumber(producedData.maintenance5y),
      utilities5y: pickNumber(producedData.utilities5y),
      trueCostConfidence: pickString(producedData.confidence),
    };
  }

  return producedData;
}

function compactObject(input: Record<string, unknown>) {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }
  return next;
}

export class GuidanceDerivedDataService {
  async mergeStepOutput(params: {
    propertyId: string;
    journeyId: string;
    stepId?: string | null;
    stepKey: string;
    toolKey?: string | null;
    producedData?: Record<string, unknown> | null;
    actorUserId?: string | null;
    signalId?: string | null;
  }) {
    const { guidanceJourney, guidanceJourneyEvent } = getGuidanceModels();

    const journey = await guidanceJourney.findFirst({
      where: {
        id: params.journeyId,
        propertyId: params.propertyId,
      },
      select: {
        id: true,
        derivedSnapshotJson: true,
      },
    });

    if (!journey) return null;

    const nowIso = new Date().toISOString();
    const base = asRecord(journey.derivedSnapshotJson);
    const byStep = asRecord(base.byStep);
    const byTool = asRecord(base.byTool);
    const latest = asRecord(base.latest);

    const producedData = params.producedData ?? {};
    const normalized = params.toolKey
      ? compactObject(normalizeToolOutput(params.toolKey, producedData))
      : producedData;

    const observedAt =
      guidanceValidationService.inferObservedAtFromPayload(producedData) ??
      guidanceValidationService.inferObservedAtFromPayload(normalized) ??
      nowIso;
    const toolFreshness = guidanceValidationService.assessToolFreshness({
      toolKey: params.toolKey ?? null,
      observedAt,
    });

    const nextByStep = {
      ...byStep,
      [params.stepKey]: {
        updatedAt: nowIso,
        toolKey: params.toolKey ?? null,
        data: normalized,
        raw: producedData,
        freshness: toolFreshness,
      },
    };

    const nextByTool = params.toolKey
      ? {
          ...byTool,
          [params.toolKey]: {
            updatedAt: nowIso,
            stepKey: params.stepKey,
            data: normalized,
            freshness: toolFreshness,
          },
        }
      : byTool;

    const nextLatest = {
      ...latest,
      ...normalized,
      ...(params.toolKey
        ? {
            [`${params.toolKey}ObservedAt`]: observedAt,
            [`${params.toolKey}Stale`]: toolFreshness.isStale,
          }
        : {}),
    };

    const nextSnapshot = {
      ...base,
      byStep: nextByStep,
      byTool: nextByTool,
      latest: nextLatest,
      updatedAt: nowIso,
    };

    await guidanceJourney.update({
      where: { id: params.journeyId },
      data: {
        derivedSnapshotJson: nextSnapshot,
      },
    });

    await guidanceJourneyEvent.create({
      data: {
        propertyId: params.propertyId,
        journeyId: params.journeyId,
        stepId: params.stepId ?? null,
        signalId: params.signalId ?? null,
        eventType: 'DERIVED_DATA_UPDATED',
        actorType: params.actorUserId ? 'USER' : 'SYSTEM',
        actorUserId: params.actorUserId ?? null,
        changedKeys: Object.keys(normalized),
        payloadJson: {
          stepKey: params.stepKey,
          toolKey: params.toolKey ?? null,
          keys: Object.keys(normalized),
        },
      },
    });

    if (toolFreshness.isStale) {
      console.info('[GUIDANCE] stale derived data merged', {
        propertyId: params.propertyId,
        journeyId: params.journeyId,
        stepKey: params.stepKey,
        toolKey: params.toolKey ?? null,
        observedAt: toolFreshness.observedAt,
        ageDays: toolFreshness.ageDays,
        maxAgeDays: toolFreshness.maxAgeDays,
      });
    }

    return nextSnapshot;
  }
}

export const guidanceDerivedDataService = new GuidanceDerivedDataService();
