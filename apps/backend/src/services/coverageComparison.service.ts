import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';

export const COVERAGE_EQUIVALENCE_VERSION = 1;

// Deliberately narrow reviewed field set. Annual premium is displayed but
// cannot establish protection equivalence.
export const MATERIAL_COVERAGE_FACT_KEYS = [
  'ALL_PERIL_DEDUCTIBLE',
  'DWELLING_LIMIT',
  'PERSONAL_PROPERTY_LIMIT',
  'LIABILITY_LIMIT',
  'POLICY_FORM',
  'VALUATION_BASIS',
  'ENDORSEMENTS',
] as const;

export type MaterialCoverageFactKey = typeof MATERIAL_COVERAGE_FACT_KEYS[number];
export type CoverageDecisionKind =
  | 'KEEP'
  | 'CHANGE'
  | 'SHOP'
  | 'DEFER'
  | 'PROFESSIONAL_REVIEW';

export type NormalizedCoverageFact = {
  factKey: string;
  valueType: 'AMOUNT' | 'TEXT' | 'BOOLEAN' | 'JSON';
  amountValue?: number | null;
  textValue?: string | null;
  booleanValue?: boolean | null;
  jsonValue?: unknown;
  currency?: string | null;
  confirmationStatus: 'CONFIRMED' | 'PENDING';
  sourceDocumentId?: string | null;
  sourcePage?: number | null;
  sourceFactId?: string | null;
};

export type CoverageOptionInput = {
  optionType: 'QUOTE_DOCUMENT' | 'POLICY_TERM';
  label: string;
  policyTermId?: string | null;
  sourceDocumentId?: string | null;
  carrierName?: string | null;
  facts?: NormalizedCoverageFact[];
};

type ComparableFact = NormalizedCoverageFact & { factKey: MaterialCoverageFactKey };

function jsonComparable(value: unknown): string {
  if (Array.isArray(value)) {
    return JSON.stringify(
      value.map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : item)).sort()
    );
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
      )
    );
  }
  return JSON.stringify(value);
}

function factValue(fact: NormalizedCoverageFact): unknown {
  if (fact.valueType === 'AMOUNT') return fact.amountValue ?? null;
  if (fact.valueType === 'TEXT') return fact.textValue?.trim().toLowerCase() ?? null;
  if (fact.valueType === 'BOOLEAN') return fact.booleanValue ?? null;
  return fact.jsonValue ?? null;
}

function factsEqual(left: NormalizedCoverageFact, right: NormalizedCoverageFact): boolean {
  if (left.valueType !== right.valueType) return false;
  if (
    left.valueType === 'AMOUNT' &&
    (left.currency ?? 'USD').toUpperCase() !== (right.currency ?? 'USD').toUpperCase()
  ) {
    return false;
  }
  return jsonComparable(factValue(left)) === jsonComparable(factValue(right));
}

function materialFactMap(facts: NormalizedCoverageFact[]) {
  return new Map(
    facts
      .filter(
        (fact): fact is ComparableFact =>
          MATERIAL_COVERAGE_FACT_KEYS.includes(fact.factKey as MaterialCoverageFactKey) &&
          fact.confirmationStatus === 'CONFIRMED'
      )
      .map((fact) => [fact.factKey, fact])
  );
}

export function evaluateCoverageEquivalence(
  baselineFacts: NormalizedCoverageFact[],
  candidateFacts: NormalizedCoverageFact[]
) {
  const baseline = materialFactMap(baselineFacts);
  const candidate = materialFactMap(candidateFacts);
  const materialUnknowns: Array<{
    factKey: MaterialCoverageFactKey;
    missingFrom: 'BASELINE' | 'OPTION' | 'BOTH';
  }> = [];
  const tradeoffs: Array<{
    factKey: MaterialCoverageFactKey;
    baseline: NormalizedCoverageFact;
    option: NormalizedCoverageFact;
  }> = [];

  for (const factKey of MATERIAL_COVERAGE_FACT_KEYS) {
    const baselineFact = baseline.get(factKey);
    const candidateFact = candidate.get(factKey);
    if (!baselineFact || !candidateFact) {
      materialUnknowns.push({
        factKey,
        missingFrom:
          !baselineFact && !candidateFact ? 'BOTH' : !baselineFact ? 'BASELINE' : 'OPTION',
      });
      continue;
    }
    if (!factsEqual(baselineFact, candidateFact)) {
      tradeoffs.push({ factKey, baseline: baselineFact, option: candidateFact });
    }
  }

  return {
    equivalenceStatus:
      tradeoffs.length > 0
        ? 'NON_EQUIVALENT'
        : materialUnknowns.length > 0
          ? 'INDETERMINATE'
          : 'EQUIVALENT',
    materialUnknowns,
    tradeoffs,
    recommendationAllowed: tradeoffs.length === 0 && materialUnknowns.length === 0,
    method: {
      version: COVERAGE_EQUIVALENCE_VERSION,
      premiumExcludedFromEquivalence: true,
      materialFactKeys: [...MATERIAL_COVERAGE_FACT_KEYS],
    },
  } as const;
}

function decimalNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStoredFacts(facts: Array<any>): NormalizedCoverageFact[] {
  return facts.map((fact) => ({
    factKey: fact.factKey,
    valueType: fact.valueType,
    amountValue: decimalNumber(fact.amountValue),
    textValue: fact.textValue,
    booleanValue: fact.booleanValue,
    jsonValue: fact.jsonValue,
    currency: fact.currency,
    confirmationStatus: fact.confirmationStatus === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING',
    sourceDocumentId: fact.sourceDocumentId,
    sourcePage: fact.sourcePage,
    sourceFactId: fact.id,
  }));
}

function annualPremiumFromFacts(facts: NormalizedCoverageFact[]) {
  const premium = facts.find(
    (fact) => fact.factKey === 'ANNUAL_PREMIUM' && fact.confirmationStatus === 'CONFIRMED'
  );
  return premium?.valueType === 'AMOUNT' ? premium.amountValue ?? null : null;
}

async function authorizeProperty(propertyId: string, userId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, homeownerProfile: { userId } },
    select: { id: true },
  });
  if (!property) throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');
}

const comparisonInclude = {
  baselinePolicyTerm: {
    include: {
      insurancePolicy: { select: { id: true, carrierName: true, policyNumber: true } },
      sourceDocument: { select: { id: true, name: true } },
    },
  },
  options: {
    orderBy: { createdAt: 'asc' as const },
    include: { sourceDocument: { select: { id: true, name: true } } },
  },
  decisions: { orderBy: { decidedAt: 'desc' as const } },
};

async function refreshComparisonStatus(comparisonId: string) {
  const options = await prisma.coverageComparisonOption.findMany({
    where: { comparisonId, optionType: { not: 'CURRENT_POLICY' } },
    select: { equivalenceStatus: true },
  });
  const statuses = new Set(options.map((option) => option.equivalenceStatus));
  const equivalenceStatus =
    options.length === 0
      ? 'INDETERMINATE'
      : statuses.size > 1
        ? 'MIXED'
        : options[0].equivalenceStatus;
  await prisma.coverageComparison.update({
    where: { id: comparisonId },
    data: { equivalenceStatus },
  });
}

export async function getOrCreateCoverageComparison(propertyId: string, userId: string) {
  await authorizeProperty(propertyId, userId);
  const baseline = await prisma.insurancePolicyTerm.findFirst({
    where: { propertyId, verificationStatus: 'VERIFIED' },
    orderBy: [{ termStart: 'desc' }, { createdAt: 'desc' }],
    include: {
      insurancePolicy: { select: { carrierName: true } },
      facts: { where: { confirmationStatus: 'CONFIRMED' }, orderBy: { factKey: 'asc' } },
    },
  });
  if (!baseline) {
    return { state: 'BASELINE_REQUIRED' as const, comparison: null };
  }

  const existing = await prisma.coverageComparison.findFirst({
    where: { propertyId, baselinePolicyTermId: baseline.id },
    orderBy: { updatedAt: 'desc' },
    include: comparisonInclude,
  });
  if (existing) return { state: 'READY' as const, comparison: existing };

  const normalizedFacts = normalizeStoredFacts(baseline.facts);
  const comparison = await prisma.coverageComparison.create({
    data: {
      propertyId,
      baselinePolicyTermId: baseline.id,
      materialFieldSetJson: {
        version: COVERAGE_EQUIVALENCE_VERSION,
        keys: [...MATERIAL_COVERAGE_FACT_KEYS],
        premiumExcludedFromEquivalence: true,
      },
      createdByUserId: userId,
      options: {
        create: {
          propertyId,
          optionType: 'CURRENT_POLICY',
          label: 'Current verified policy',
          policyTermId: baseline.id,
          sourceDocumentId: baseline.sourceDocumentId,
          carrierName: baseline.insurancePolicy.carrierName,
          annualPremium: annualPremiumFromFacts(normalizedFacts),
          normalizedFactsJson: normalizedFacts as unknown as Prisma.InputJsonValue,
          sourceEvidenceJson: normalizedFacts.map((fact) => ({
            factKey: fact.factKey,
            sourceFactId: fact.sourceFactId,
            sourceDocumentId: fact.sourceDocumentId,
            sourcePage: fact.sourcePage,
          })) as Prisma.InputJsonValue,
          equivalenceStatus: 'BASELINE',
          materialUnknownsJson: [] as Prisma.InputJsonValue,
          tradeoffsJson: [] as Prisma.InputJsonValue,
        },
      },
    },
    include: comparisonInclude,
  });
  return { state: 'READY' as const, comparison };
}

export async function getCoverageComparison(
  propertyId: string,
  comparisonId: string,
  userId: string
) {
  await authorizeProperty(propertyId, userId);
  const comparison = await prisma.coverageComparison.findFirst({
    where: { id: comparisonId, propertyId },
    include: comparisonInclude,
  });
  if (!comparison) {
    throw new APIError('Coverage comparison not found', 404, 'COVERAGE_COMPARISON_NOT_FOUND');
  }
  return comparison;
}

export async function addCoverageComparisonOption(
  propertyId: string,
  comparisonId: string,
  userId: string,
  input: CoverageOptionInput
) {
  await authorizeProperty(propertyId, userId);
  const comparison = await prisma.coverageComparison.findFirst({
    where: { id: comparisonId, propertyId, status: 'DRAFT' },
    include: {
      baselinePolicyTerm: {
        include: { facts: { where: { confirmationStatus: 'CONFIRMED' } } },
      },
    },
  });
  if (!comparison) {
    throw new APIError('Open coverage comparison not found', 404, 'COVERAGE_COMPARISON_NOT_FOUND');
  }

  let facts = input.facts ?? [];
  let policyTermId: string | null = null;
  let sourceDocumentId = input.sourceDocumentId ?? null;
  let carrierName = input.carrierName ?? null;
  if (input.optionType === 'POLICY_TERM') {
    if (!input.policyTermId) {
      throw new APIError('A verified policy term is required', 400, 'POLICY_TERM_REQUIRED');
    }
    const term = await prisma.insurancePolicyTerm.findFirst({
      where: { id: input.policyTermId, propertyId, verificationStatus: 'VERIFIED' },
      include: {
        insurancePolicy: { select: { carrierName: true } },
        facts: { where: { confirmationStatus: 'CONFIRMED' } },
      },
    });
    if (!term) throw new APIError('Verified policy term not found', 404, 'POLICY_TERM_NOT_FOUND');
    policyTermId = term.id;
    sourceDocumentId = term.sourceDocumentId;
    carrierName = term.insurancePolicy.carrierName;
    facts = normalizeStoredFacts(term.facts);
  } else {
    if (!sourceDocumentId) {
      throw new APIError('A quote source document is required', 400, 'QUOTE_DOCUMENT_REQUIRED');
    }
    const document = await prisma.document.findFirst({
      where: { id: sourceDocumentId, propertyId },
      select: { id: true },
    });
    if (!document) throw new APIError('Quote source document not found', 404, 'DOCUMENT_NOT_FOUND');
    facts = facts.map((fact) => ({
      ...fact,
      sourceDocumentId,
      confirmationStatus: fact.confirmationStatus === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING',
    }));
  }

  const baselineFacts = normalizeStoredFacts(comparison.baselinePolicyTerm.facts);
  const equivalence = evaluateCoverageEquivalence(baselineFacts, facts);
  const option = await prisma.coverageComparisonOption.create({
    data: {
      comparisonId,
      propertyId,
      optionType: input.optionType,
      label: input.label.trim(),
      policyTermId,
      sourceDocumentId,
      carrierName,
      annualPremium: annualPremiumFromFacts(facts),
      normalizedFactsJson: facts as unknown as Prisma.InputJsonValue,
      sourceEvidenceJson: facts.map((fact) => ({
        factKey: fact.factKey,
        sourceFactId: fact.sourceFactId ?? null,
        sourceDocumentId: fact.sourceDocumentId ?? sourceDocumentId,
        sourcePage: fact.sourcePage ?? null,
        confirmationStatus: fact.confirmationStatus,
      })) as Prisma.InputJsonValue,
      equivalenceStatus: equivalence.equivalenceStatus,
      materialUnknownsJson: equivalence.materialUnknowns as Prisma.InputJsonValue,
      tradeoffsJson: equivalence.tradeoffs as unknown as Prisma.InputJsonValue,
    },
  });
  await refreshComparisonStatus(comparisonId);
  return option;
}

export async function recordCoverageDecision(
  propertyId: string,
  comparisonId: string,
  userId: string,
  input: {
    decision: CoverageDecisionKind;
    selectedOptionId?: string | null;
    rationale?: string | null;
    guidanceJourneyId?: string | null;
    guidanceStepKey?: string | null;
    sourceActionId?: string | null;
  }
) {
  await authorizeProperty(propertyId, userId);
  const comparison = await prisma.coverageComparison.findFirst({
    where: { id: comparisonId, propertyId, status: 'DRAFT' },
    include: { options: true },
  });
  if (!comparison) {
    throw new APIError('Open coverage comparison not found', 404, 'COVERAGE_COMPARISON_NOT_FOUND');
  }
  const selected = input.selectedOptionId
    ? comparison.options.find((option) => option.id === input.selectedOptionId)
    : null;
  if (input.selectedOptionId && !selected) {
    throw new APIError('Selected option is not part of this comparison', 400, 'INVALID_OPTION');
  }
  if (input.decision === 'CHANGE' && !selected) {
    throw new APIError('Select the option you intend to change to', 400, 'OPTION_REQUIRED');
  }
  if (
    input.decision === 'CHANGE' &&
    selected?.equivalenceStatus !== 'EQUIVALENT' &&
    !input.rationale?.trim()
  ) {
    throw new APIError(
      'Record why you accept the known or unresolved protection tradeoff',
      400,
      'TRADEOFF_ACKNOWLEDGEMENT_REQUIRED'
    );
  }

  const decisionId = randomUUID();
  const occurredAt = new Date();
  return prisma.$transaction(async (tx) => {
    const decision = await tx.coverageDecision.create({
      data: {
        id: decisionId,
        comparisonId,
        propertyId,
        decision: input.decision,
        selectedOptionId: selected?.id ?? null,
        rationale: input.rationale?.trim() || null,
        decidedByUserId: userId,
        decidedAt: occurredAt,
        guidanceJourneyId: input.guidanceJourneyId ?? comparison.guidanceJourneyId,
        guidanceStepKey: input.guidanceStepKey ?? comparison.guidanceStepKey,
        sourceActionId: input.sourceActionId ?? comparison.sourceActionId,
      },
    });
    const homeEvent = await tx.homeEvent.create({
      data: {
        propertyId,
        createdById: userId,
        type: 'MILESTONE',
        subtype: 'COVERAGE_DECISION_RECORDED',
        importance: 'HIGH',
        occurredAt,
        title: 'Coverage decision recorded',
        summary:
          input.decision === 'CHANGE' && selected
            ? `Decision: change to ${selected.label}.`
            : `Decision: ${input.decision.toLowerCase().replace(/_/g, ' ')}.`,
        idempotencyKey: `coverage-decision:${decisionId}`,
        sourceBadge: 'USER_REPORTED',
        guidanceJourneyId: input.guidanceJourneyId ?? comparison.guidanceJourneyId,
        meta: {
          coverageDecisionId: decisionId,
          coverageComparisonId: comparisonId,
          decision: input.decision,
          selectedOptionId: selected?.id ?? null,
          selectedOptionEquivalenceStatus: selected?.equivalenceStatus ?? null,
          rationale: input.rationale?.trim() || null,
          sourceActionId: input.sourceActionId ?? comparison.sourceActionId,
        },
      },
    });
    const recorded = await tx.coverageDecision.update({
      where: { id: decision.id },
      data: { homeEventId: homeEvent.id },
    });
    await tx.coverageComparison.update({
      where: { id: comparisonId },
      data: { status: 'DECIDED' },
    });
    await tx.auditLog.create({
      data: {
        userId,
        action: 'coverage_decision_recorded',
        entityType: 'CoverageDecision',
        entityId: decision.id,
        newValues: {
          propertyId,
          comparisonId,
          decision: input.decision,
          selectedOptionId: selected?.id ?? null,
          homeEventId: homeEvent.id,
        },
      },
    });
    return { decision: recorded, homeEvent };
  });
}
