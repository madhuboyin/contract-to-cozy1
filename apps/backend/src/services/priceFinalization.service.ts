import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  PriceFinalizationCreateInput,
  PriceFinalizationDetailDTO,
  PriceFinalizationFinalizeInput,
  PriceFinalizationListResponse,
  PriceFinalizationSourceType,
  PriceFinalizationStatus,
  PriceFinalizationTermInput,
  PriceFinalizationUpdateInput,
} from './priceFinalization.types';

const prismaAny = prisma as any;

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'object' && value && 'toNumber' in (value as Record<string, unknown>)) {
    const converted = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(converted) ? converted : null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return date.toISOString();
}

function toJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeCurrency(input?: string | null): string {
  const token = String(input ?? '').trim().toUpperCase();
  return token.length === 3 ? token : 'USD';
}

function mapTerm(term: any) {
  return {
    id: String(term.id),
    termType: String(term.termType),
    label: String(term.label),
    value: String(term.value),
    sortOrder: Number(term.sortOrder ?? 0),
    isAccepted: Boolean(term.isAccepted),
    createdAt: toIso(term.createdAt),
    updatedAt: toIso(term.updatedAt),
  };
}

function mapDetail(row: any): PriceFinalizationDetailDTO {
  return {
    id: String(row.id),
    propertyId: String(row.propertyId),
    createdByUserId: row.createdByUserId ? String(row.createdByUserId) : null,
    inventoryItemId: row.inventoryItemId ? String(row.inventoryItemId) : null,
    homeAssetId: row.homeAssetId ? String(row.homeAssetId) : null,
    guidanceJourneyId: cleanString(row.guidanceJourneyId),
    guidanceStepKey: cleanString(row.guidanceStepKey),
    guidanceSignalIntentFamily: cleanString(row.guidanceSignalIntentFamily),
    sourceType: String(row.sourceType) as PriceFinalizationSourceType,
    status: String(row.status) as PriceFinalizationStatus,
    serviceCategory: cleanString(row.serviceCategory),
    vendorName: cleanString(row.vendorName),
    acceptedPrice: asNumber(row.acceptedPrice),
    quotePrice: asNumber(row.quotePrice),
    currency: String(row.currency ?? 'USD'),
    scopeSummary: cleanString(row.scopeSummary),
    paymentTerms: cleanString(row.paymentTerms),
    warrantyTerms: cleanString(row.warrantyTerms),
    timelineTerms: cleanString(row.timelineTerms),
    notes: cleanString(row.notes),
    acceptedTermsJson: toJsonRecord(row.acceptedTermsJson),
    metadataJson: toJsonRecord(row.metadataJson),
    negotiationShieldCaseId: cleanString(row.negotiationShieldCaseId),
    serviceRadarCheckId: cleanString(row.serviceRadarCheckId),
    quoteComparisonWorkspaceId: cleanString(row.quoteComparisonWorkspaceId),
    finalizedAt: row.finalizedAt ? toIso(row.finalizedAt) : null,
    bookingId: cleanString(row.bookingId),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    terms: Array.isArray(row.terms) ? row.terms.map(mapTerm) : [],
    actualSpendCents: (() => {
      const meta = toJsonRecord(row.metadataJson);
      const v = meta?._actualSpendCents;
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    })(),
  };
}

function normalizeTerms(terms: PriceFinalizationTermInput[] | undefined): Array<{
  termType: string;
  label: string;
  value: string;
  sortOrder: number;
  isAccepted: boolean;
}> {
  if (!terms || terms.length === 0) return [];

  return terms.map((term, index) => ({
    termType: String(term.termType),
    label: String(term.label).trim(),
    value: String(term.value).trim(),
    sortOrder: typeof term.sortOrder === 'number' ? term.sortOrder : index,
    isAccepted: term.isAccepted !== false,
  }));
}

async function ensurePropertyAccess(propertyId: string, userId: string) {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfile: {
        userId,
      },
    },
    select: {
      id: true,
    },
  });

  if (!property) {
    throw new APIError('Property not found or access denied.', 404, 'PROPERTY_ACCESS_DENIED');
  }
}

async function assertScopedReferences(
  propertyId: string,
  input: {
    negotiationShieldCaseId?: string | null;
    serviceRadarCheckId?: string | null;
    quoteComparisonWorkspaceId?: string | null;
  }
) {
  if (input.negotiationShieldCaseId) {
    const found = await prismaAny.negotiationShieldCase.findFirst({
      where: {
        id: input.negotiationShieldCaseId,
        propertyId,
      },
      select: { id: true },
    });

    if (!found) {
      throw new APIError('Negotiation case not found for this property.', 400, 'PRICE_FINALIZATION_INVALID_NEGOTIATION_CASE');
    }
  }

  if (input.serviceRadarCheckId) {
    const found = await prismaAny.serviceRadarCheck.findFirst({
      where: {
        id: input.serviceRadarCheckId,
        propertyId,
      },
      select: { id: true },
    });

    if (!found) {
      throw new APIError('Service Price Radar check not found for this property.', 400, 'PRICE_FINALIZATION_INVALID_RADAR_CHECK');
    }
  }

  if (input.quoteComparisonWorkspaceId) {
    const found = await prismaAny.quoteComparisonWorkspace.findFirst({
      where: {
        id: input.quoteComparisonWorkspaceId,
        propertyId,
      },
      select: { id: true },
    });

    if (!found) {
      throw new APIError('Quote comparison workspace not found for this property.', 400, 'PRICE_FINALIZATION_INVALID_QUOTE_WORKSPACE');
    }
  }
}

function buildUpdateData(input: PriceFinalizationUpdateInput) {
  const data: Record<string, unknown> = {};

  if (input.inventoryItemId !== undefined) data.inventoryItemId = input.inventoryItemId;
  if (input.homeAssetId !== undefined) data.homeAssetId = input.homeAssetId;
  if (input.guidanceJourneyId !== undefined) data.guidanceJourneyId = input.guidanceJourneyId;
  if (input.guidanceStepKey !== undefined) data.guidanceStepKey = input.guidanceStepKey;
  if (input.guidanceSignalIntentFamily !== undefined) {
    data.guidanceSignalIntentFamily = input.guidanceSignalIntentFamily;
  }

  if (input.sourceType !== undefined) data.sourceType = input.sourceType;
  if (input.serviceCategory !== undefined) data.serviceCategory = input.serviceCategory;
  if (input.vendorName !== undefined) data.vendorName = input.vendorName;
  if (input.acceptedPrice !== undefined) data.acceptedPrice = input.acceptedPrice;
  if (input.quotePrice !== undefined) data.quotePrice = input.quotePrice;
  if (input.currency !== undefined) data.currency = normalizeCurrency(input.currency);

  if (input.scopeSummary !== undefined) data.scopeSummary = input.scopeSummary;
  if (input.paymentTerms !== undefined) data.paymentTerms = input.paymentTerms;
  if (input.warrantyTerms !== undefined) data.warrantyTerms = input.warrantyTerms;
  if (input.timelineTerms !== undefined) data.timelineTerms = input.timelineTerms;
  if (input.notes !== undefined) data.notes = input.notes;

  if (input.acceptedTermsJson !== undefined) data.acceptedTermsJson = input.acceptedTermsJson;
  if (input.metadataJson !== undefined || input.actualSpendCents !== undefined) {
    // Preserve existing metadataJson and layer in actualSpendCents when provided
    const base = input.metadataJson !== undefined ? (input.metadataJson ?? {}) : undefined;
    if (input.actualSpendCents !== undefined) {
      data.metadataJson = { ...(base ?? {}), _actualSpendCents: input.actualSpendCents };
    } else if (base !== undefined) {
      data.metadataJson = base;
    }
  }

  if (input.negotiationShieldCaseId !== undefined) {
    data.negotiationShieldCaseId = input.negotiationShieldCaseId;
  }
  if (input.serviceRadarCheckId !== undefined) {
    data.serviceRadarCheckId = input.serviceRadarCheckId;
  }
  if (input.quoteComparisonWorkspaceId !== undefined) {
    data.quoteComparisonWorkspaceId = input.quoteComparisonWorkspaceId;
  }

  return data;
}

async function loadDetailOrThrow(propertyId: string, finalizationId: string): Promise<any> {
  const row = await prismaAny.priceFinalization.findFirst({
    where: {
      id: finalizationId,
      propertyId,
    },
    include: {
      terms: {
        orderBy: {
          sortOrder: 'asc',
        },
      },
    },
  });

  if (!row) {
    throw new APIError('Price finalization record not found.', 404, 'PRICE_FINALIZATION_NOT_FOUND');
  }

  return row;
}

export class PriceFinalizationService {
  async listForProperty(propertyId: string, userId: string, limit = 20): Promise<PriceFinalizationListResponse> {
    await ensurePropertyAccess(propertyId, userId);

    const rows = await prismaAny.priceFinalization.findMany({
      where: {
        propertyId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: Math.min(Math.max(limit, 1), 50),
      include: {
        terms: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
    });

    return {
      items: rows.map(mapDetail),
    };
  }

  async getDetail(propertyId: string, userId: string, finalizationId: string): Promise<PriceFinalizationDetailDTO> {
    await ensurePropertyAccess(propertyId, userId);
    const row = await loadDetailOrThrow(propertyId, finalizationId);
    return mapDetail(row);
  }

  async createDraft(
    propertyId: string,
    userId: string,
    input: PriceFinalizationCreateInput
  ): Promise<PriceFinalizationDetailDTO> {
    await ensurePropertyAccess(propertyId, userId);
    await assertScopedReferences(propertyId, input);

    const normalizedTerms = normalizeTerms(input.terms);

    const created = await prismaAny.priceFinalization.create({
      data: {
        propertyId,
        createdByUserId: userId,

        inventoryItemId: input.inventoryItemId ?? null,
        homeAssetId: input.homeAssetId ?? null,
        guidanceJourneyId: input.guidanceJourneyId ?? null,
        guidanceStepKey: input.guidanceStepKey ?? null,
        guidanceSignalIntentFamily: input.guidanceSignalIntentFamily ?? null,

        sourceType: input.sourceType ?? 'MANUAL',
        status: 'DRAFT',

        serviceCategory: input.serviceCategory ?? null,
        vendorName: input.vendorName ?? null,
        acceptedPrice: input.acceptedPrice ?? null,
        quotePrice: input.quotePrice ?? null,
        currency: normalizeCurrency(input.currency),

        scopeSummary: input.scopeSummary ?? null,
        paymentTerms: input.paymentTerms ?? null,
        warrantyTerms: input.warrantyTerms ?? null,
        timelineTerms: input.timelineTerms ?? null,
        notes: input.notes ?? null,

        acceptedTermsJson: input.acceptedTermsJson ?? null,
        metadataJson: input.actualSpendCents !== undefined
          ? { ...(input.metadataJson ?? {}), _actualSpendCents: input.actualSpendCents }
          : (input.metadataJson ?? null),

        negotiationShieldCaseId: input.negotiationShieldCaseId ?? null,
        serviceRadarCheckId: input.serviceRadarCheckId ?? null,
        quoteComparisonWorkspaceId: input.quoteComparisonWorkspaceId ?? null,
      },
    });

    if (normalizedTerms.length > 0) {
      await prismaAny.priceFinalizationTerm.createMany({
        data: normalizedTerms.map((term) => ({
          priceFinalizationId: created.id,
          ...term,
        })),
      });
    }

    const full = await loadDetailOrThrow(propertyId, created.id);
    return mapDetail(full);
  }

  async updateDraft(
    propertyId: string,
    userId: string,
    finalizationId: string,
    input: PriceFinalizationUpdateInput
  ): Promise<PriceFinalizationDetailDTO> {
    await ensurePropertyAccess(propertyId, userId);

    const existing = await loadDetailOrThrow(propertyId, finalizationId);
    if (String(existing.status) === 'FINALIZED' && !input.allowPostFinalizeEdits) {
      throw new APIError(
        'This price finalization is already finalized. Create a new draft to revise terms.',
        409,
        'PRICE_FINALIZATION_ALREADY_FINALIZED'
      );
    }

    await assertScopedReferences(propertyId, input);

    await prismaAny.$transaction(async (tx: any) => {
      await tx.priceFinalization.update({
        where: {
          id: finalizationId,
        },
        data: buildUpdateData(input),
      });

      if (input.terms !== undefined) {
        await tx.priceFinalizationTerm.deleteMany({
          where: {
            priceFinalizationId: finalizationId,
          },
        });

        const normalizedTerms = normalizeTerms(input.terms);
        if (normalizedTerms.length > 0) {
          await tx.priceFinalizationTerm.createMany({
            data: normalizedTerms.map((term) => ({
              priceFinalizationId: finalizationId,
              ...term,
            })),
          });
        }
      }
    });

    const full = await loadDetailOrThrow(propertyId, finalizationId);
    return mapDetail(full);
  }

  async finalize(
    propertyId: string,
    userId: string,
    finalizationId: string,
    input: PriceFinalizationFinalizeInput
  ): Promise<PriceFinalizationDetailDTO> {
    await ensurePropertyAccess(propertyId, userId);
    await assertScopedReferences(propertyId, input);

    const existing = await loadDetailOrThrow(propertyId, finalizationId);

    const nextAcceptedPrice =
      input.acceptedPrice !== undefined ? input.acceptedPrice : asNumber(existing.acceptedPrice);

    if (nextAcceptedPrice === null || !Number.isFinite(nextAcceptedPrice) || nextAcceptedPrice <= 0) {
      throw new APIError(
        'Accepted price is required before finalizing.',
        400,
        'PRICE_FINALIZATION_ACCEPTED_PRICE_REQUIRED'
      );
    }

    const finalizedAt = new Date();

    await prismaAny.$transaction(async (tx: any) => {
      await tx.priceFinalization.update({
        where: {
          id: finalizationId,
        },
        data: {
          ...buildUpdateData(input),
          acceptedPrice: nextAcceptedPrice,
          status: 'FINALIZED',
          finalizedAt,
        },
      });

      if (input.terms !== undefined) {
        await tx.priceFinalizationTerm.deleteMany({
          where: {
            priceFinalizationId: finalizationId,
          },
        });

        const normalizedTerms = normalizeTerms(input.terms);
        if (normalizedTerms.length > 0) {
          await tx.priceFinalizationTerm.createMany({
            data: normalizedTerms.map((term) => ({
              priceFinalizationId: finalizationId,
              ...term,
            })),
          });
        }
      }
    });

    const full = await loadDetailOrThrow(propertyId, finalizationId);
    return mapDetail(full);
  }

  async attachBooking(params: {
    propertyId: string;
    finalizationId: string;
    bookingId: string;
  }): Promise<void> {
    const record = await prismaAny.priceFinalization.findFirst({
      where: {
        id: params.finalizationId,
        propertyId: params.propertyId,
      },
      select: {
        id: true,
        status: true,
        bookingId: true,
      },
    });

    if (!record) {
      throw new APIError('Price finalization record not found for this booking.', 400, 'PRICE_FINALIZATION_NOT_FOUND');
    }

    if (String(record.status) !== 'FINALIZED') {
      throw new APIError(
        'Price finalization must be finalized before linking to booking.',
        400,
        'PRICE_FINALIZATION_NOT_FINALIZED'
      );
    }

    if (record.bookingId && String(record.bookingId) !== params.bookingId) {
      throw new APIError(
        'Price finalization is already linked to a different booking.',
        409,
        'PRICE_FINALIZATION_ALREADY_LINKED'
      );
    }

    await prismaAny.priceFinalization.update({
      where: {
        id: params.finalizationId,
      },
      data: {
        bookingId: params.bookingId,
      },
    });
  }
}

export const priceFinalizationService = new PriceFinalizationService();
