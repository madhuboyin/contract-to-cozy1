import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import type { NegotiationShieldAnalysisDTO, NegotiationShieldCaseSummaryDTO, NegotiationShieldDraftDTO } from './negotiationShield.types';

// The Negotiation Shield case list, kept apart from negotiationShield.service so a reader of the list (Ask's
// NEGOTIATION_SHIELD_CASES, FRD v1.56) does not load the service's document parsing and OCR dependencies. The service's
// listCasesForProperty and serializeCase delegate here, so the page and Ask run the same query and serializer. The analysis and
// draft serializers live here for the same reason, and the one-case review below reads only what Ask's "Review" shows.

function asIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function serializeNegotiationShieldCase(record: any): NegotiationShieldCaseSummaryDTO {
  return {
    id: String(record.id),
    propertyId: String(record.propertyId),
    createdByUserId: record.createdByUserId ?? null,
    scenarioType: record.scenarioType,
    status: record.status,
    title: record.title,
    description: record.description ?? null,
    sourceType: record.sourceType,
    perspective: record.perspective ?? 'HOMEOWNER',
    analysisVersion: record.analysisVersion ?? null,
    latestAnalysisAt: asIsoString(record.latestAnalysisAt),
    quoteDecisionWorkspaceId: record.quoteDecisionWorkspaceId ?? null,
    createdAt: asIsoString(record.createdAt) as string,
    updatedAt: asIsoString(record.updatedAt) as string,
  };
}

export async function listNegotiationShieldCasesForProperty(propertyId: string): Promise<NegotiationShieldCaseSummaryDTO[]> {
  const caseModel = (prisma as any).negotiationShieldCase;
  if (!caseModel) {
    throw new APIError('Negotiation Shield models are unavailable. Run prisma generate.', 500, 'NEGOTIATION_SHIELD_MODEL_UNAVAILABLE');
  }
  const rows = await caseModel.findMany({
    where: { propertyId },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map((row: any) => serializeNegotiationShieldCase(row));
}

export function serializeNegotiationShieldAnalysis(record: any): NegotiationShieldAnalysisDTO {
  const pa = record.pricingAssessment as Record<string, unknown> | null;
  const confidenceExplanation = pa && typeof pa.confidenceExplanation === 'string' ? pa.confidenceExplanation : null;
  return {
    id: String(record.id),
    caseId: String(record.caseId),
    scenarioType: record.scenarioType,
    summary: record.summary ?? null,
    findings: record.findings ?? null,
    negotiationLeverage: record.negotiationLeverage ?? null,
    recommendedActions: record.recommendedActions ?? null,
    pricingAssessment: record.pricingAssessment ?? null,
    confidence: typeof record.confidence === 'number' ? record.confidence : record.confidence ?? null,
    confidenceExplanation,
    generatedAt: asIsoString(record.generatedAt) as string,
    modelVersion: record.modelVersion ?? null,
    createdAt: asIsoString(record.createdAt) as string,
  };
}

export function serializeNegotiationShieldDraft(record: any): NegotiationShieldDraftDTO {
  return {
    id: String(record.id),
    caseId: String(record.caseId),
    draftType: record.draftType,
    subject: record.subject ?? null,
    body: record.body,
    tone: record.tone ?? null,
    isLatest: Boolean(record.isLatest),
    createdAt: asIsoString(record.createdAt) as string,
  };
}

export type NegotiationShieldCaseReviewDTO = {
  case: NegotiationShieldCaseSummaryDTO;
  latestAnalysis: NegotiationShieldAnalysisDTO | null;
  latestDraft: NegotiationShieldDraftDTO | null;
};

/**
 * One case's stored analysis and latest draft, scoped to the property (a case of another property is "not found", not "forbidden").
 * The same ordering as NegotiationShieldService.getCaseDetail, but it selects no inputs, no documents and no buyer finding links, so
 * raw input text, document storage keys and file URLs are never loaded. Returns null when the case is not on this property.
 */
export async function getNegotiationShieldCaseReviewForProperty(propertyId: string, caseId: string): Promise<NegotiationShieldCaseReviewDTO | null> {
  const caseModel = (prisma as any).negotiationShieldCase;
  if (!caseModel) {
    throw new APIError('Negotiation Shield models are unavailable. Run prisma generate.', 500, 'NEGOTIATION_SHIELD_MODEL_UNAVAILABLE');
  }
  const record = await caseModel.findFirst({
    where: { id: caseId, propertyId },
    include: {
      analyses: { orderBy: [{ generatedAt: 'desc' }, { createdAt: 'desc' }], take: 1 },
      drafts: { orderBy: [{ isLatest: 'desc' }, { createdAt: 'desc' }], take: 1 },
    },
  });
  if (!record) return null;
  return {
    case: serializeNegotiationShieldCase(record),
    latestAnalysis: Array.isArray(record.analyses) && record.analyses[0] ? serializeNegotiationShieldAnalysis(record.analyses[0]) : null,
    latestDraft: Array.isArray(record.drafts) && record.drafts[0] ? serializeNegotiationShieldDraft(record.drafts[0]) : null,
  };
}
