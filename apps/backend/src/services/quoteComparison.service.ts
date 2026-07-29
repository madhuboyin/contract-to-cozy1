import { QuoteComparisonWorkspaceStatus, ServiceCategory } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  evaluateQuoteComparability,
  evaluateQuoteReadiness,
  QuoteLineItemInput,
  QuoteProposalFacts,
  QuoteTermInput,
} from './quoteComparability.service';
import { withSerializableDedupe } from './projectCompliance/serializableDedupe';

const OPEN_WORKSPACE_STATUSES: QuoteComparisonWorkspaceStatus[] = ['DRAFT', 'SHORTLISTED'];

export interface GetOrCreateQuoteWorkspaceInput {
  serviceCategory?: ServiceCategory | null;
  inventoryItemId?: string | null;
  guidanceJourneyId?: string | null;
  guidanceStepKey?: string | null;
  guidanceSignalIntentFamily?: string | null;
  scopeSummary?: string | null;
}

export interface QuoteProposalInput {
  vendorName: string;
  quoteAmount: number;
  currency?: string;
  quoteDate?: string | null;
  expirationDate?: string | null;
  serviceLabelRaw?: string | null;
  serviceCategory?: ServiceCategory | null;
  serviceLocation?: string | null;
  scopeKind?: string | null;
  scopeSummary?: string | null;
  notes?: string | null;
  sourceType?: string;
  sourceReferenceId?: string | null;
  providerLicenseNumber?: string | null;
  providerLicenseVerified?: boolean | null;
  providerInsuranceVerified?: boolean | null;
  lineItems?: Array<QuoteLineItemInput & {
    confirmationStatus?: string;
    confidence?: number | null;
    sourceText?: string | null;
    sourcePage?: number | null;
  }>;
  terms?: Array<QuoteTermInput & {
    label?: string | null;
    confirmationStatus?: string;
    confidence?: number | null;
    sourceText?: string | null;
    sourcePage?: number | null;
  }>;
}

export type UpdateQuoteProposalInput = Partial<QuoteProposalInput>;

const quoteInclude = {
  lineItems: { orderBy: { sortOrder: 'asc' } },
  terms: { orderBy: { createdAt: 'asc' } },
  extractions: {
    orderBy: { createdAt: 'desc' },
    include: { document: { select: { id: true, name: true, fileUrl: true, mimeType: true } } },
  },
  factConfirmations: { orderBy: { fieldKey: 'asc' } },
} as const;

const database = prisma as any;

async function getWorkspaceOrThrow(propertyId: string, workspaceId: string) {
  const workspace = await database.quoteComparisonWorkspace.findFirst({
    where: { id: workspaceId, propertyId },
  });
  if (!workspace) {
    throw new APIError('Quote comparison workspace not found for this property.', 404, 'QUOTE_WORKSPACE_NOT_FOUND');
  }
  return workspace;
}

function toFacts(input: QuoteProposalInput, homeownerConfirmedAt?: Date | null): QuoteProposalFacts {
  return {
    vendorName: input.vendorName,
    quoteAmount: input.quoteAmount,
    serviceCategory: input.serviceCategory,
    scopeKind: input.scopeKind,
    scopeSummary: input.scopeSummary,
    serviceLocation: input.serviceLocation,
    quoteDate: input.quoteDate,
    lineItems: input.lineItems,
    terms: input.terms,
    homeownerConfirmedAt,
  };
}

function readinessData(input: QuoteProposalInput, homeownerConfirmedAt?: Date | null) {
  const readiness = evaluateQuoteReadiness(toFacts(input, homeownerConfirmedAt));
  return {
    readinessStage: readiness.stage,
    readinessScore: readiness.score,
    comparabilityKey: readiness.comparabilityKey,
    missingFactsJson: readiness.missingFacts,
    ambiguitiesJson: readiness.ambiguities,
  };
}

function proposalCreateData(input: QuoteProposalInput) {
  return {
    vendorName: input.vendorName.trim(),
    quoteAmount: input.quoteAmount,
    currency: input.currency?.trim().toUpperCase() || 'USD',
    quoteDate: input.quoteDate ? new Date(input.quoteDate) : null,
    expirationDate: input.expirationDate ? new Date(input.expirationDate) : null,
    serviceLabelRaw: input.serviceLabelRaw?.trim() || null,
    serviceCategory: input.serviceCategory ?? null,
    serviceLocation: input.serviceLocation?.trim() || null,
    scopeKind: input.scopeKind ?? 'UNKNOWN',
    scopeSummary: input.scopeSummary?.trim() || null,
    notes: input.notes?.trim() || null,
    sourceType: input.sourceType ?? 'MANUAL',
    sourceReferenceId: input.sourceReferenceId ?? null,
    providerLicenseNumber: input.providerLicenseNumber?.trim() || null,
    providerLicenseVerified: input.providerLicenseVerified ?? null,
    providerInsuranceVerified: input.providerInsuranceVerified ?? null,
    ...readinessData(input),
    lineItems: {
      create: (input.lineItems ?? []).map((item, sortOrder) => ({
        kind: item.kind ?? 'OTHER',
        description: item.description.trim(),
        quantity: item.quantity ?? null,
        unit: item.unit?.trim() || null,
        unitPrice: item.unitPrice ?? null,
        total: item.total ?? null,
        sortOrder,
        confirmationStatus: item.confirmationStatus ?? 'HOMEOWNER_CONFIRMED',
        confidence: item.confidence ?? null,
        sourceText: item.sourceText?.trim() || null,
        sourcePage: item.sourcePage ?? null,
      })),
    },
    terms: {
      create: (input.terms ?? []).map((term) => ({
        type: term.type,
        label: term.label?.trim() || null,
        value: term.value.trim(),
        included: term.included ?? null,
        confirmationStatus: term.confirmationStatus ?? 'HOMEOWNER_CONFIRMED',
        confidence: term.confidence ?? null,
        sourceText: term.sourceText?.trim() || null,
        sourcePage: term.sourcePage ?? null,
      })),
    },
  };
}

async function validateScope(propertyId: string, input: GetOrCreateQuoteWorkspaceInput) {
  const inventoryItem = input.inventoryItemId
    ? await prisma.inventoryItem.findFirst({ where: { id: input.inventoryItemId, propertyId }, select: { id: true } })
    : null;
  if (input.inventoryItemId && !inventoryItem) {
    throw new APIError('Inventory item not found for this property.', 404, 'QUOTE_SCOPE_NOT_FOUND');
  }
}

export async function getOrCreateQuoteComparisonWorkspace(
  propertyId: string,
  userId: string,
  input: GetOrCreateQuoteWorkspaceInput,
) {
  await validateScope(propertyId, input);

  const exactScope = {
    inventoryItemId: input.inventoryItemId ?? null,
    serviceCategory: input.serviceCategory ?? null,
  };
  return withSerializableDedupe(async (tx) => {
    const existing = await tx.quoteComparisonWorkspace.findFirst({
      where: {
        propertyId,
        status: { in: OPEN_WORKSPACE_STATUSES },
        OR: [
          ...(input.guidanceJourneyId ? [{ guidanceJourneyId: input.guidanceJourneyId }] : []),
          exactScope,
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (existing) return { workspace: existing, reused: true };

    const workspace = await tx.quoteComparisonWorkspace.create({
      data: {
        propertyId,
        createdByUserId: userId,
        ...exactScope,
        guidanceJourneyId: input.guidanceJourneyId ?? null,
        guidanceStepKey: input.guidanceStepKey ?? null,
        guidanceSignalIntentFamily: input.guidanceSignalIntentFamily ?? null,
        scopeSummary: input.scopeSummary?.trim() || null,
        status: 'DRAFT',
      },
    });
    return { workspace, reused: false };
  });
}

export async function getQuoteComparisonWorkspace(propertyId: string, workspaceId: string) {
  await getWorkspaceOrThrow(propertyId, workspaceId);
  return database.quoteComparisonWorkspace.findUnique({
    where: { id: workspaceId },
    include: { quotes: { orderBy: { createdAt: 'desc' }, include: quoteInclude } },
  });
}

export async function createQuoteProposal(
  propertyId: string,
  workspaceId: string,
  input: QuoteProposalInput,
) {
  await getWorkspaceOrThrow(propertyId, workspaceId);
  return database.quoteComparisonQuote.create({
    data: { workspaceId, ...proposalCreateData(input) },
    include: quoteInclude,
  });
}

export async function updateQuoteProposal(
  propertyId: string,
  workspaceId: string,
  quoteId: string,
  input: UpdateQuoteProposalInput,
) {
  await getWorkspaceOrThrow(propertyId, workspaceId);
  const current = await database.quoteComparisonQuote.findFirst({
    where: { id: quoteId, workspaceId },
    include: { lineItems: { orderBy: { sortOrder: 'asc' } }, terms: true },
  });
  if (!current) throw new APIError('Quote proposal not found.', 404, 'QUOTE_NOT_FOUND');

  const merged: QuoteProposalInput = {
    vendorName: input.vendorName ?? current.vendorName,
    quoteAmount: input.quoteAmount ?? Number(current.quoteAmount),
    currency: input.currency ?? current.currency,
    quoteDate: input.quoteDate === undefined ? current.quoteDate?.toISOString() ?? null : input.quoteDate,
    expirationDate: input.expirationDate === undefined
      ? current.expirationDate?.toISOString() ?? null
      : input.expirationDate,
    serviceLabelRaw: input.serviceLabelRaw === undefined ? current.serviceLabelRaw : input.serviceLabelRaw,
    serviceCategory: input.serviceCategory === undefined ? current.serviceCategory : input.serviceCategory,
    serviceLocation: input.serviceLocation === undefined ? current.serviceLocation : input.serviceLocation,
    scopeKind: input.scopeKind === undefined ? current.scopeKind : input.scopeKind,
    scopeSummary: input.scopeSummary === undefined ? current.scopeSummary : input.scopeSummary,
    notes: input.notes === undefined ? current.notes : input.notes,
    sourceType: input.sourceType ?? current.sourceType,
    sourceReferenceId: input.sourceReferenceId === undefined ? current.sourceReferenceId : input.sourceReferenceId,
    providerLicenseNumber: input.providerLicenseNumber === undefined
      ? current.providerLicenseNumber
      : input.providerLicenseNumber,
    providerLicenseVerified: input.providerLicenseVerified === undefined
      ? current.providerLicenseVerified
      : input.providerLicenseVerified,
    providerInsuranceVerified: input.providerInsuranceVerified === undefined
      ? current.providerInsuranceVerified
      : input.providerInsuranceVerified,
    lineItems: input.lineItems ?? current.lineItems.map((item: any) => ({
      kind: item.kind,
      description: item.description,
      quantity: item.quantity === null ? null : Number(item.quantity),
      unit: item.unit,
      unitPrice: item.unitPrice === null ? null : Number(item.unitPrice),
      total: item.total === null ? null : Number(item.total),
      confirmationStatus: item.confirmationStatus,
      confidence: item.confidence,
      sourceText: item.sourceText,
      sourcePage: item.sourcePage,
    })),
    terms: input.terms ?? current.terms.map((term: any) => ({
      type: term.type,
      label: term.label,
      value: term.value,
      included: term.included,
      confirmationStatus: term.confirmationStatus,
      confidence: term.confidence,
      sourceText: term.sourceText,
      sourcePage: term.sourcePage,
    })),
  };
  const fullData = proposalCreateData(merged);
  const { lineItems, terms, ...scalarData } = fullData;

  return database.$transaction(async (tx: any) => {
    if (input.lineItems) await tx.quoteComparisonLineItem.deleteMany({ where: { quoteId } });
    if (input.terms) await tx.quoteComparisonTerm.deleteMany({ where: { quoteId } });
    await tx.quoteComparisonFactConfirmation.updateMany({
      where: { quoteId },
      data: { status: 'EXTRACTED_UNCONFIRMED', confirmedByUserId: null, confirmedAt: null },
    });
    return tx.quoteComparisonQuote.update({
      where: { id: quoteId },
      data: {
        ...scalarData,
        homeownerConfirmedAt: null,
        homeownerConfirmedByUserId: null,
        ...(input.lineItems ? { lineItems } : {}),
        ...(input.terms ? { terms } : {}),
      },
      include: quoteInclude,
    });
  });
}

function primitive(value: unknown): string | number | boolean | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return null;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function extractedProposal(metadata: unknown, fallbackVendor: string): QuoteProposalInput {
  const root = record(metadata);
  const insights = record(root.insights ?? root.analysis ?? root.extractedData ?? root);
  const provider = record(insights.provider ?? insights.vendor ?? insights.contractor);
  const totals = record(insights.totals ?? insights.pricing);
  const rawItems = array(insights.lineItems ?? insights.items ?? insights.scopeItems);
  const rawTerms = array(insights.terms);
  const vendorName = primitive(provider.name ?? insights.vendorName ?? insights.providerName);
  const amount = primitive(totals.total ?? insights.total ?? insights.quoteAmount ?? insights.amount);

  const allowedLineItemKinds = new Set(['LABOR', 'MATERIAL', 'EQUIPMENT', 'PERMIT', 'DISPOSAL', 'TAX', 'ALLOWANCE', 'OTHER']);
  const allowedTermTypes = new Set([
    'INCLUSION', 'EXCLUSION', 'ALLOWANCE', 'PERMIT', 'DISPOSAL', 'CLEANUP',
    'WARRANTY', 'PAYMENT', 'SCHEDULE', 'EXPIRATION', 'LICENSE', 'INSURANCE',
    'CHANGE_ORDER', 'OTHER',
  ]);
  const allowedScopeKinds = new Set(['REPAIR', 'REPLACEMENT', 'INSTALLATION', 'MAINTENANCE', 'INSPECTION', 'OTHER', 'UNKNOWN']);
  const lineItems = rawItems.flatMap((rawItem) => {
    const item = record(rawItem);
    const description = primitive(item.description ?? item.name ?? item.scope);
    if (typeof description !== 'string' || !description.trim()) return [];
    return [{
      kind: typeof item.kind === 'string' && allowedLineItemKinds.has(item.kind.toUpperCase())
        ? item.kind.toUpperCase()
        : 'OTHER',
      description,
      quantity: typeof item.quantity === 'number' ? item.quantity : null,
      unit: typeof item.unit === 'string' ? item.unit : null,
      unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : null,
      total: typeof item.total === 'number' ? item.total : null,
      confirmationStatus: 'EXTRACTED_UNCONFIRMED',
      confidence: typeof item.confidence === 'number' ? item.confidence : null,
      sourceText: typeof item.sourceText === 'string' ? item.sourceText : null,
      sourcePage: typeof item.sourcePage === 'number' ? item.sourcePage : null,
    }];
  });
  const terms = rawTerms.flatMap((rawTerm) => {
    const term = record(rawTerm);
    const value = primitive(term.value ?? term.text);
    if (typeof value !== 'string' || !value.trim()) return [];
    return [{
      type: typeof term.type === 'string' && allowedTermTypes.has(term.type.toUpperCase())
        ? term.type.toUpperCase()
        : 'OTHER',
      label: typeof term.label === 'string' ? term.label : null,
      value,
      included: typeof term.included === 'boolean' ? term.included : null,
      confirmationStatus: 'EXTRACTED_UNCONFIRMED',
      confidence: typeof term.confidence === 'number' ? term.confidence : null,
      sourceText: typeof term.sourceText === 'string' ? term.sourceText : null,
      sourcePage: typeof term.sourcePage === 'number' ? term.sourcePage : null,
    }];
  });

  return {
    vendorName: typeof vendorName === 'string' && vendorName.trim() ? vendorName : fallbackVendor,
    quoteAmount: typeof amount === 'number' && amount >= 0 ? amount : 0,
    quoteDate: typeof insights.quoteDate === 'string' ? insights.quoteDate : null,
    expirationDate: typeof insights.expirationDate === 'string' ? insights.expirationDate : null,
    serviceLabelRaw: typeof insights.serviceLabel === 'string' ? insights.serviceLabel : null,
    serviceCategory: typeof insights.serviceCategory === 'string' ? insights.serviceCategory as ServiceCategory : null,
    serviceLocation: typeof insights.serviceLocation === 'string' ? insights.serviceLocation : null,
    scopeKind: typeof insights.scopeKind === 'string' && allowedScopeKinds.has(insights.scopeKind.toUpperCase())
      ? insights.scopeKind.toUpperCase()
      : 'UNKNOWN',
    scopeSummary: typeof insights.scopeSummary === 'string' ? insights.scopeSummary : null,
    providerLicenseNumber: typeof provider.licenseNumber === 'string' ? provider.licenseNumber : null,
    lineItems,
    terms,
    sourceType: 'UPLOADED_QUOTE',
  };
}

export async function createQuoteProposalFromDocument(
  propertyId: string,
  workspaceId: string,
  userId: string,
  documentId: string,
) {
  await getWorkspaceOrThrow(propertyId, workspaceId);
  const document = await database.document.findFirst({
    where: { id: documentId, propertyId },
    select: { id: true, name: true, metadata: true, parserVersion: true },
  });
  if (!document) {
    throw new APIError('Quote document not found for this property.', 404, 'QUOTE_DOCUMENT_NOT_FOUND');
  }
  const proposal = extractedProposal(document.metadata, document.name.replace(/\.[^.]+$/, '') || 'Unconfirmed provider');
  const rawFacts = {
    vendorName: proposal.vendorName,
    quoteAmount: proposal.quoteAmount,
    quoteDate: proposal.quoteDate,
    serviceCategory: proposal.serviceCategory,
    scopeKind: proposal.scopeKind,
    scopeSummary: proposal.scopeSummary,
  };

  return database.quoteComparisonQuote.create({
    data: {
      workspaceId,
      ...proposalCreateData(proposal),
      extractions: {
        create: {
          documentId,
          status: 'EXTRACTED',
          provider: 'document-intelligence',
          schemaVersion: 'quote-proposal-v1',
          model: document.parserVersion,
          rawResultJson: document.metadata ?? {},
          completedAt: new Date(),
        },
      },
      factConfirmations: {
        create: Object.entries(rawFacts).map(([fieldKey, extractedValue]) => ({
          fieldKey,
          extractedValueJson: extractedValue === undefined ? null : extractedValue,
          status: 'EXTRACTED_UNCONFIRMED',
        })),
      },
    },
    include: quoteInclude,
  });
}

function quoteToFacts(quote: any): QuoteProposalFacts {
  return {
    id: quote.id,
    vendorName: quote.vendorName,
    quoteAmount: Number(quote.quoteAmount),
    serviceCategory: quote.serviceCategory,
    scopeKind: quote.scopeKind,
    scopeSummary: quote.scopeSummary,
    serviceLocation: quote.serviceLocation,
    quoteDate: quote.quoteDate,
    lineItems: quote.lineItems.map((item: any) => ({
      description: item.description,
      kind: item.kind,
      quantity: item.quantity === null ? null : Number(item.quantity),
      unit: item.unit,
      unitPrice: item.unitPrice === null ? null : Number(item.unitPrice),
      total: item.total === null ? null : Number(item.total),
    })),
    terms: quote.terms.map((term: any) => ({ type: term.type, value: term.value, included: term.included })),
    homeownerConfirmedAt: quote.homeownerConfirmedAt,
  };
}

export async function confirmQuoteProposal(
  propertyId: string,
  workspaceId: string,
  quoteId: string,
  userId: string,
) {
  await getWorkspaceOrThrow(propertyId, workspaceId);
  const quote = await database.quoteComparisonQuote.findFirst({
    where: { id: quoteId, workspaceId },
    include: quoteInclude,
  });
  if (!quote) throw new APIError('Quote proposal not found.', 404, 'QUOTE_NOT_FOUND');

  const confirmedAt = new Date();
  const facts = quoteToFacts({ ...quote, homeownerConfirmedAt: confirmedAt });
  const readiness = evaluateQuoteReadiness(facts);
  return database.$transaction(async (tx: any) => {
    await tx.quoteComparisonLineItem.updateMany({
      where: { quoteId, confirmationStatus: 'EXTRACTED_UNCONFIRMED' },
      data: { confirmationStatus: 'HOMEOWNER_CONFIRMED' },
    });
    await tx.quoteComparisonTerm.updateMany({
      where: { quoteId, confirmationStatus: 'EXTRACTED_UNCONFIRMED' },
      data: { confirmationStatus: 'HOMEOWNER_CONFIRMED' },
    });
    await tx.quoteComparisonFactConfirmation.updateMany({
      where: { quoteId, status: 'EXTRACTED_UNCONFIRMED' },
      data: { status: 'HOMEOWNER_CONFIRMED', confirmedByUserId: userId, confirmedAt },
    });
    await tx.quoteComparisonExtraction.updateMany({
      where: { quoteId, status: 'EXTRACTED' },
      data: { status: 'CONFIRMED', confirmedAt },
    });
    return tx.quoteComparisonQuote.update({
      where: { id: quoteId },
      data: {
        homeownerConfirmedAt: confirmedAt,
        homeownerConfirmedByUserId: userId,
        readinessStage: readiness.stage,
        readinessScore: readiness.score,
        comparabilityKey: readiness.comparabilityKey,
        missingFactsJson: readiness.missingFacts,
        ambiguitiesJson: readiness.ambiguities,
      },
      include: quoteInclude,
    });
  });
}

export async function getWorkspaceComparability(propertyId: string, workspaceId: string) {
  await getWorkspaceOrThrow(propertyId, workspaceId);
  const quotes = await database.quoteComparisonQuote.findMany({
    where: { workspaceId },
    include: { lineItems: true, terms: true },
    orderBy: { createdAt: 'asc' },
  });
  return evaluateQuoteComparability(quotes.map(quoteToFacts));
}
