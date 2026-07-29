import {
  ProductAnalyticsEventType,
  QuoteComparisonWorkspaceStatus,
  ServiceCategory,
} from '@prisma/client';
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
import {
  advanceServiceQuoteDecision,
  linkServiceQuoteDecisionContext,
  ServiceQuoteDecisionEntityType,
  ServiceQuoteDecisionOutcome,
  ServiceQuoteDecisionStage,
} from './serviceQuoteDecisionJourney.service';
import {
  emitServiceQuoteDecisionAnalytics,
  ServiceQuoteDecisionEvent,
} from './serviceQuoteDecisionAnalytics.service';

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
  clarifications: { orderBy: { createdAt: 'desc' } },
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

function assertOpenWorkspace(workspace: any) {
  if (workspace.outcome !== 'OPEN') {
    throw new APIError(
      'This service quote decision is closed. Start a new decision to evaluate revised proposals.',
      409,
      'SERVICE_QUOTE_DECISION_CLOSED',
    );
  }
}

function assertReviewMutable(workspace: any) {
  assertOpenWorkspace(workspace);
  if (['FINALIZATION', 'BOOKING', 'SCHEDULED', 'COMPLETED', 'CLOSED'].includes(workspace.journeyStage)) {
    throw new APIError(
      'Proposal controls are locked after final-term review begins.',
      409,
      'SERVICE_QUOTE_PROPOSALS_LOCKED',
    );
  }
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
        transitions: {
          create: {
            fromStage: 'QUOTE_INTAKE',
            toStage: 'QUOTE_INTAKE',
            outcome: 'OPEN',
            reason: 'Service quote decision workspace created.',
            actorUserId: userId,
          },
        },
        contextLinks: {
          create: [
            ...(input.inventoryItemId
              ? [{ entityType: 'INVENTORY_ITEM' as const, entityId: input.inventoryItemId }]
              : []),
            ...(input.guidanceJourneyId
              ? [{ entityType: 'GUIDANCE_JOURNEY' as const, entityId: input.guidanceJourneyId }]
              : []),
          ],
        },
      },
    });
    return { workspace, reused: false };
  });
}

export async function getQuoteComparisonWorkspace(propertyId: string, workspaceId: string) {
  await getWorkspaceOrThrow(propertyId, workspaceId);
  return database.quoteComparisonWorkspace.findUnique({
    where: { id: workspaceId },
    include: {
      quotes: { orderBy: { createdAt: 'desc' }, include: quoteInclude },
      selectedQuote: { include: quoteInclude },
      negotiationCase: { select: { id: true, status: true, title: true, latestAnalysisAt: true } },
      priceFinalization: {
        select: { id: true, status: true, vendorName: true, acceptedPrice: true, finalizedAt: true, bookingId: true },
      },
      booking: { select: { id: true, bookingNumber: true, status: true, scheduledDate: true, completedAt: true } },
      transitions: { orderBy: { createdAt: 'asc' } },
      contextLinks: { orderBy: { createdAt: 'asc' } },
    },
  });
}

export async function createQuoteProposal(
  propertyId: string,
  workspaceId: string,
  input: QuoteProposalInput,
) {
  const workspace = await getWorkspaceOrThrow(propertyId, workspaceId);
  assertOpenWorkspace(workspace);
  if (input.sourceType === 'SYSTEM_LINKED') {
    if (!input.sourceReferenceId) {
      throw new APIError(
        'A system-linked quote requires a source reference.',
        400,
        'QUOTE_SOURCE_REFERENCE_REQUIRED',
      );
    }
    const sourceCheck = await database.serviceRadarCheck.findFirst({
      where: { id: input.sourceReferenceId, propertyId },
      select: { id: true },
    });
    if (!sourceCheck) {
      throw new APIError(
        'The linked Service Price Radar check does not belong to this property.',
        400,
        'QUOTE_SOURCE_SCOPE_MISMATCH',
      );
    }
  }
  const quote = await database.quoteComparisonQuote.create({
    data: { workspaceId, ...proposalCreateData(input) },
    include: quoteInclude,
  });
  await advanceServiceQuoteDecision({
    propertyId,
    workspaceId,
    toStage: input.sourceType === 'SYSTEM_LINKED' ? 'PRICE_REVIEW' : 'SCOPE_REVIEW',
    relatedEntityType: input.sourceType === 'SYSTEM_LINKED' ? 'SERVICE_RADAR_CHECK' : null,
    relatedEntityId: input.sourceType === 'SYSTEM_LINKED' ? input.sourceReferenceId : null,
    reason: 'A quote proposal was added to the decision.',
  });
  return quote;
}

export async function updateQuoteProposal(
  propertyId: string,
  workspaceId: string,
  quoteId: string,
  userId: string,
  input: UpdateQuoteProposalInput,
) {
  const workspace = await getWorkspaceOrThrow(propertyId, workspaceId);
  assertOpenWorkspace(workspace);
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
  if (merged.sourceType === 'SYSTEM_LINKED') {
    const sourceCheck = merged.sourceReferenceId
      ? await database.serviceRadarCheck.findFirst({
          where: { id: merged.sourceReferenceId, propertyId },
          select: { id: true },
        })
      : null;
    if (!sourceCheck) {
      throw new APIError(
        'The linked Service Price Radar check does not belong to this property.',
        400,
        'QUOTE_SOURCE_SCOPE_MISMATCH',
      );
    }
  }
  const fullData = proposalCreateData(merged);
  const { lineItems, terms, ...scalarData } = fullData;

  const updated = await database.$transaction(async (tx: any) => {
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
  await database.$transaction([
    database.quoteComparisonQuote.updateMany({
      where: { workspaceId },
      data: { decision: 'UNDECIDED', isSelected: false },
    }),
    database.quoteComparisonWorkspace.update({
      where: { id: workspaceId },
      data: {
        selectedQuoteId: null,
        selectedVendorName: null,
        selectedQuoteAmount: null,
        status: 'DRAFT',
      },
    }),
  ]);
  await advanceServiceQuoteDecision({
    propertyId,
    workspaceId,
    toStage: 'SCOPE_REVIEW',
    reason: 'Proposal facts changed and comparison eligibility must be reviewed again.',
  });
  const previousMissingCount = Array.isArray(current.missingFactsJson)
    ? current.missingFactsJson.length
    : 0;
  const currentMissingCount = Array.isArray(updated.missingFactsJson)
    ? updated.missingFactsJson.length
    : 0;
  if (currentMissingCount < previousMissingCount) {
    emitServiceQuoteDecisionAnalytics({
      eventName: ServiceQuoteDecisionEvent.SCOPE_CHANGED_AFTER_WARNING,
      eventType: ProductAnalyticsEventType.ACTION_COMPLETED,
      userId,
      propertyId,
      workspaceId,
      metadata: {
        quoteId,
        previousMissingFactCount: previousMissingCount,
        currentMissingFactCount: currentMissingCount,
        resolvedMissingFactCount: previousMissingCount - currentMissingCount,
      },
    });
  }
  return updated;
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
  const workspace = await getWorkspaceOrThrow(propertyId, workspaceId);
  assertOpenWorkspace(workspace);
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

  const quote = await database.quoteComparisonQuote.create({
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
  await linkServiceQuoteDecisionContext({
    propertyId,
    workspaceId,
    entityType: 'DOCUMENT',
    entityId: documentId,
    label: document.name,
  });
  await advanceServiceQuoteDecision({
    propertyId,
    workspaceId,
    actorUserId: userId,
    toStage: 'SCOPE_REVIEW',
    relatedEntityType: 'DOCUMENT',
    relatedEntityId: documentId,
    reason: 'A quote document was extracted for homeowner review.',
  });
  return quote;
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
  const workspace = await getWorkspaceOrThrow(propertyId, workspaceId);
  assertOpenWorkspace(workspace);
  const quote = await database.quoteComparisonQuote.findFirst({
    where: { id: quoteId, workspaceId },
    include: quoteInclude,
  });
  if (!quote) throw new APIError('Quote proposal not found.', 404, 'QUOTE_NOT_FOUND');

  const confirmedAt = new Date();
  const facts = quoteToFacts({ ...quote, homeownerConfirmedAt: confirmedAt });
  const readiness = evaluateQuoteReadiness(facts);
  const confirmed = await database.$transaction(async (tx: any) => {
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
  const comparability = await getWorkspaceComparability(propertyId, workspaceId);
  await advanceServiceQuoteDecision({
    propertyId,
    workspaceId,
    actorUserId: userId,
    toStage: comparability.status === 'COMPARABLE' ? 'COMPARISON' : 'SCOPE_REVIEW',
    reason:
      comparability.status === 'COMPARABLE'
        ? 'At least two confirmed proposals are scope comparable.'
        : 'Quote facts were confirmed; more comparable scope may still be needed.',
    metadataJson: { comparabilityStatus: comparability.status },
  });
  return confirmed;
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

export async function selectQuoteForDecision(
  propertyId: string,
  workspaceId: string,
  quoteId: string,
  userId: string,
) {
  const workspace = await getWorkspaceOrThrow(propertyId, workspaceId);
  assertOpenWorkspace(workspace);
  const quote = await database.quoteComparisonQuote.findFirst({
    where: { id: quoteId, workspaceId, readinessStage: 'COMPARISON_READY' },
    include: quoteInclude,
  });
  if (!quote) {
    throw new APIError(
      'Only a comparison-ready proposal can be selected.',
      409,
      'QUOTE_NOT_COMPARISON_READY',
    );
  }
  const comparability = await getWorkspaceComparability(propertyId, workspaceId);
  if (comparability.status !== 'COMPARABLE' || !comparability.eligibleQuoteIds.includes(quoteId)) {
    throw new APIError(
      'This proposal is not part of a comparable proposal set.',
      409,
      'QUOTE_NOT_COMPARABLE',
    );
  }

  await database.$transaction([
    database.quoteComparisonQuote.updateMany({
      where: { workspaceId },
      data: { isSelected: false, decision: 'UNDECIDED' },
    }),
    database.quoteComparisonQuote.update({
      where: { id: quoteId },
      data: { isSelected: true, decision: 'SHORTLISTED' },
    }),
    database.quoteComparisonWorkspace.update({
      where: { id: workspace.id },
      data: {
        selectedQuoteId: quoteId,
        selectedVendorName: quote.vendorName,
        selectedQuoteAmount: quote.quoteAmount,
        currency: quote.currency,
        status: 'SHORTLISTED',
      },
    }),
  ]);
  await advanceServiceQuoteDecision({
    propertyId,
    workspaceId,
    actorUserId: userId,
    toStage: 'COMPARISON',
    reason: 'The homeowner selected a proposal for the next decision stage.',
    metadataJson: { selectedQuoteId: quoteId },
  });
  return getQuoteComparisonWorkspace(propertyId, workspaceId);
}

export async function transitionQuoteDecision(
  propertyId: string,
  workspaceId: string,
  userId: string,
  input: {
    toStage: ServiceQuoteDecisionStage;
    outcome?: ServiceQuoteDecisionOutcome;
    reason?: string | null;
    relatedEntityType?: ServiceQuoteDecisionEntityType | null;
    relatedEntityId?: string | null;
  },
) {
  if (
    input.toStage !== 'CLOSED' ||
    !input.outcome ||
    !['DECLINED', 'DEFERRED'].includes(input.outcome)
  ) {
    throw new APIError(
      'Homeowner transitions may only close an open decision as declined or deferred. Linked records advance other stages.',
      400,
      'SERVICE_QUOTE_MANUAL_TRANSITION_NOT_ALLOWED',
    );
  }
  return advanceServiceQuoteDecision({
    propertyId,
    workspaceId,
    actorUserId: userId,
    ...input,
  });
}

export async function addQuoteDecisionContextLink(
  propertyId: string,
  workspaceId: string,
  input: {
    entityType: ServiceQuoteDecisionEntityType;
    entityId: string;
    label?: string | null;
    metadataJson?: Record<string, unknown> | null;
  },
) {
  return linkServiceQuoteDecisionContext({ propertyId, workspaceId, ...input });
}

async function assertQuoteCanChangeDecision(workspaceId: string) {
  const workspace = await database.quoteComparisonWorkspace.findUnique({
    where: { id: workspaceId },
    select: {
      selectedQuoteId: true,
      priceFinalization: { select: { id: true, status: true } },
    },
  });
  if (workspace?.priceFinalization) {
    throw new APIError(
      'This proposal is linked to final terms. Close or revise that decision before changing the proposal.',
      409,
      'QUOTE_LINKED_TO_FINALIZATION',
    );
  }
  return workspace;
}

export async function deleteQuoteProposal(
  propertyId: string,
  workspaceId: string,
  quoteId: string,
  userId: string,
) {
  const workspace = await getWorkspaceOrThrow(propertyId, workspaceId);
  assertReviewMutable(workspace);
  const quote = await database.quoteComparisonQuote.findFirst({
    where: { id: quoteId, workspaceId },
    select: { id: true },
  });
  if (!quote) throw new APIError('Quote proposal not found.', 404, 'QUOTE_NOT_FOUND');
  const decision = await assertQuoteCanChangeDecision(workspaceId);

  await database.$transaction(async (tx: any) => {
    await tx.quoteComparisonQuote.delete({ where: { id: quoteId } });
    if (decision?.selectedQuoteId === quoteId) {
      await tx.quoteComparisonWorkspace.update({
        where: { id: workspaceId },
        data: {
          selectedQuoteId: null,
          selectedVendorName: null,
          selectedQuoteAmount: null,
          status: 'DRAFT',
        },
      });
    }
  });
  await advanceServiceQuoteDecision({
    propertyId,
    workspaceId,
    actorUserId: userId,
    toStage: 'SCOPE_REVIEW',
    reason: 'A proposal was removed and the remaining scope must be reviewed.',
    metadataJson: { deletedQuoteId: quoteId },
  });
}

export async function setQuoteProposalDisposition(
  propertyId: string,
  workspaceId: string,
  quoteId: string,
  userId: string,
  decision: 'REJECTED' | 'UNDECIDED',
) {
  const workspace = await getWorkspaceOrThrow(propertyId, workspaceId);
  assertReviewMutable(workspace);
  const quote = await database.quoteComparisonQuote.findFirst({
    where: { id: quoteId, workspaceId },
    select: { id: true },
  });
  if (!quote) throw new APIError('Quote proposal not found.', 404, 'QUOTE_NOT_FOUND');
  const current = await assertQuoteCanChangeDecision(workspaceId);
  await database.$transaction(async (tx: any) => {
    await tx.quoteComparisonQuote.update({
      where: { id: quoteId },
      data: { decision, isSelected: false },
    });
    if (current?.selectedQuoteId === quoteId) {
      await tx.quoteComparisonWorkspace.update({
        where: { id: workspaceId },
        data: {
          selectedQuoteId: null,
          selectedVendorName: null,
          selectedQuoteAmount: null,
          status: 'DRAFT',
        },
      });
    }
  });
  await advanceServiceQuoteDecision({
    propertyId,
    workspaceId,
    actorUserId: userId,
    toStage: 'SCOPE_REVIEW',
    reason: decision === 'REJECTED'
      ? 'The homeowner rejected a proposal.'
      : 'The homeowner returned a proposal to consideration.',
    metadataJson: { quoteId, decision },
  });
  return getQuoteComparisonWorkspace(propertyId, workspaceId);
}

export async function createQuoteClarification(
  propertyId: string,
  workspaceId: string,
  quoteId: string,
  userId: string,
  question: string,
) {
  const workspace = await getWorkspaceOrThrow(propertyId, workspaceId);
  assertReviewMutable(workspace);
  const quote = await database.quoteComparisonQuote.findFirst({
    where: { id: quoteId, workspaceId },
    select: { id: true },
  });
  if (!quote) throw new APIError('Quote proposal not found.', 404, 'QUOTE_NOT_FOUND');
  const normalizedQuestion = question.trim();
  const existing = await database.quoteComparisonClarification.findFirst({
    where: { quoteId, status: 'OPEN', question: normalizedQuestion },
  });
  const clarification = existing ?? await database.quoteComparisonClarification.create({
    data: { quoteId, question: normalizedQuestion, requestedByUserId: userId },
  });
  await advanceServiceQuoteDecision({
    propertyId,
    workspaceId,
    actorUserId: userId,
    toStage: 'SCOPE_REVIEW',
    reason: 'A material quote clarification is awaiting an answer.',
    metadataJson: { quoteId, clarificationId: clarification.id },
  });
  return clarification;
}

export async function resolveQuoteClarification(
  propertyId: string,
  workspaceId: string,
  quoteId: string,
  clarificationId: string,
  userId: string,
  response: string,
) {
  const workspace = await getWorkspaceOrThrow(propertyId, workspaceId);
  assertReviewMutable(workspace);
  const clarification = await database.quoteComparisonClarification.findFirst({
    where: { id: clarificationId, quoteId, quote: { workspaceId } },
  });
  if (!clarification) {
    throw new APIError('Quote clarification not found.', 404, 'QUOTE_CLARIFICATION_NOT_FOUND');
  }
  return database.quoteComparisonClarification.update({
    where: { id: clarificationId },
    data: {
      status: 'RESOLVED',
      response: response.trim(),
      resolvedByUserId: userId,
      resolvedAt: new Date(),
    },
  });
}

export async function setServiceQuoteOutcomeMeasurementConsent(
  propertyId: string,
  workspaceId: string,
  userId: string,
  input: {
    consented: boolean;
    finalPrice: boolean;
    changeOrders: boolean;
    policyVersion: 'service-quote-outcomes-v1';
  },
) {
  await getWorkspaceOrThrow(propertyId, workspaceId);
  const now = new Date();
  await database.quoteComparisonWorkspace.update({
    where: { id: workspaceId },
    data: input.consented
      ? {
          outcomeMeasurementConsentJson: {
            finalPrice: input.finalPrice,
            changeOrders: input.changeOrders,
            policyVersion: input.policyVersion,
          },
          outcomeMeasurementConsentedAt: now,
          outcomeMeasurementConsentedByUserId: userId,
          outcomeMeasurementConsentRevokedAt: null,
        }
      : {
          outcomeMeasurementConsentJson: null,
          outcomeMeasurementConsentRevokedAt: now,
        },
  });
  emitServiceQuoteDecisionAnalytics({
    eventName: ServiceQuoteDecisionEvent.CONSENT_UPDATED,
    eventType: ProductAnalyticsEventType.ACTION_COMPLETED,
    userId,
    propertyId,
    workspaceId,
    metadata: {
      consented: input.consented,
      finalPrice: input.consented && input.finalPrice,
      changeOrders: input.consented && input.changeOrders,
      policyVersion: input.policyVersion,
    },
  });
  return getQuoteComparisonWorkspace(propertyId, workspaceId);
}
