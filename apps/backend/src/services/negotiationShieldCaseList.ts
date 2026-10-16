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
  /**
   * Whether the case has any saved input, and when the newest was last saved. Timestamps only: the input's text and structured data are never
   * selected. It tells Ask whether an analysis can be run and whether the saved details changed after the last one.
   */
  hasInput: boolean;
  inputsUpdatedAt: string | null;
  /**
   * What is attached, newest first (at most 25): the link id, the Home Record id, the document's role in the review, its title, whether the household can
   * see the record, and whether its file is scanned and ready. Never a file link, storage key, file name or content; a record the household cannot see
   * is returned as "Private document".
   */
  documents: Array<{ id: string; documentId: string; documentType: string; title: string; shared: boolean; ready: boolean }>;
  /** Authoritative attachment count; `documents` itself is a bounded newest-first read. */
  documentsTotal?: number;
};

/**
 * One case's stored analysis and latest draft, scoped to the property (a case of another property is "not found", not "forbidden").
 * The same ordering as NegotiationShieldService.getCaseDetail, but it selects no input content, no documents and no buyer finding links (only
 * the newest input's updatedAt), so raw input text, document storage keys and file URLs are never loaded. Returns null when the case is not on this property.
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
      inputs: { select: { updatedAt: true }, orderBy: [{ updatedAt: 'desc' }], take: 1 },
      _count: { select: { documents: true } },
      documents: {
        select: {
          id: true, documentId: true, documentType: true,
          document: { select: { title: true, visibility: true, currentVersion: { select: { scanStatus: true, integrityStatus: true } } } },
        },
        orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
        take: 25,
      },
    },
  });
  if (!record) return null;
  const newestInput = Array.isArray(record.inputs) && record.inputs[0] ? record.inputs[0] : null;
  const documents = (Array.isArray(record.documents) ? record.documents : []).map((link: any) => {
    const shared = link.document?.visibility === 'HOUSEHOLD';
    const version = link.document?.currentVersion ?? null;
    return {
      id: String(link.id),
      documentId: String(link.documentId),
      documentType: String(link.documentType),
      title: shared ? String(link.document?.title ?? 'Document') : 'Private document',
      shared,
      ready: Boolean(version) && version.scanStatus === 'CLEAN' && version.integrityStatus === 'VERIFIED',
    };
  });
  return {
    hasInput: Boolean(newestInput),
    inputsUpdatedAt: newestInput ? asIsoString(newestInput.updatedAt) : null,
    documents,
    documentsTotal: Number(record._count?.documents ?? documents.length),
    case: serializeNegotiationShieldCase(record),
    latestAnalysis: Array.isArray(record.analyses) && record.analyses[0] ? serializeNegotiationShieldAnalysis(record.analyses[0]) : null,
    latestDraft: Array.isArray(record.drafts) && record.drafts[0] ? serializeNegotiationShieldDraft(record.drafts[0]) : null,
  };
}

// ── Editing: the saved manual details of one case ─────────────────────────────────────────────────────────────

/** The marker the canonical service puts on an input it created by parsing a document; such an input is never edited by hand. */
export const PARSED_DOCUMENT_INPUT_ORIGIN = 'PARSED_DOCUMENT';

export function isParsedDocumentInputData(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const meta = (value as Record<string, unknown>)._meta;
  return Boolean(meta && typeof meta === 'object' && !Array.isArray(meta) && (meta as Record<string, unknown>).origin === PARSED_DOCUMENT_INPUT_ORIGIN);
}

export type NegotiationShieldEditableInputDTO = {
  case: { id: string; title: string; scenarioType: string; status: string };
  /** The manual input the edit would update, or null when there is none and a save would create one. */
  inputId: string | null;
  inputUpdatedAt: string | null;
  /** Only the requested keys, only primitive values: what the edit form shows and diffs against. */
  values: Record<string, string | number | boolean>;
};

/**
 * One case's saved MANUAL details, restricted to `allowedKeys`, scoped to the property. Raw text, parsed-document inputs and every other key are not
 * returned (the input rows are selected without rawText). Matches the canonical save's rule for which input a manual edit updates: the newest
 * non-parsed input of the scenario's input type. Returns null when the case is not on this property.
 */
export async function getNegotiationShieldEditableInputForProperty(
  propertyId: string, caseId: string, inputType: string, allowedKeys: readonly string[],
): Promise<NegotiationShieldEditableInputDTO | null> {
  const caseModel = (prisma as any).negotiationShieldCase;
  if (!caseModel) {
    throw new APIError('Negotiation Shield models are unavailable. Run prisma generate.', 500, 'NEGOTIATION_SHIELD_MODEL_UNAVAILABLE');
  }
  const record = await caseModel.findFirst({
    where: { id: caseId, propertyId },
    select: {
      id: true, title: true, scenarioType: true, status: true,
      inputs: { where: { inputType }, select: { id: true, structuredData: true, updatedAt: true }, orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }] },
    },
  });
  if (!record) return null;
  const manual = (Array.isArray(record.inputs) ? record.inputs : []).find((input: any) => !isParsedDocumentInputData(input.structuredData)) ?? null;
  const values: Record<string, string | number | boolean> = {};
  const data = manual && manual.structuredData && typeof manual.structuredData === 'object' && !Array.isArray(manual.structuredData) ? manual.structuredData as Record<string, unknown> : {};
  for (const key of allowedKeys) {
    const value = data[key];
    if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) values[key] = value;
  }
  return {
    case: { id: String(record.id), title: String(record.title), scenarioType: String(record.scenarioType), status: String(record.status) },
    inputId: manual ? String(manual.id) : null,
    inputUpdatedAt: manual ? asIsoString(manual.updatedAt) : null,
    values,
  };
}
