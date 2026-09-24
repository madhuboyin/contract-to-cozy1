import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import type { NegotiationShieldCaseSummaryDTO } from './negotiationShield.types';

// The Negotiation Shield case list, kept apart from negotiationShield.service so a reader of the list (Ask's
// NEGOTIATION_SHIELD_CASES, FRD v1.56) does not load the service's document parsing and OCR dependencies. The service's
// listCasesForProperty and serializeCase delegate here, so the page and Ask run the same query and serializer.

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
