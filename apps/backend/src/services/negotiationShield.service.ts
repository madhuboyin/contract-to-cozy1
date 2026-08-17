import { DocumentType, HomeEventType, MaintenanceTaskStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from './analytics';
import { APIError } from '../middleware/error.middleware';
import {
  AttachNegotiationShieldDocumentPayload,
  BuyerNegotiationFindingDTO,
  BuyerInspectionNegotiationAnalysisResult,
  CreateNegotiationShieldCaseInput,
  ContractorUrgencyPressureAnalysisResult,
  InsuranceClaimSettlementAnalysisResult,
  InsurancePremiumIncreaseAnalysisResult,
  NegotiationShieldAnalysisDTO,
  NegotiationShieldCaseDetailDTO,
  NegotiationShieldCaseSummaryDTO,
  NegotiationShieldDocumentDTO,
  NegotiationShieldDraftDTO,
  NegotiationShieldGeneratedAnalysisResult,
  NegotiationShieldInputDTO,
  NegotiationShieldEventInput,
  NegotiationShieldSourceType,
  RecordBuyerNegotiationOutcomeInput,
  SaveNegotiationShieldInputPayload,
  StartBuyerNegotiationInput,
} from './negotiationShield.types';
import { generateBuyerInspectionNegotiationAnalysis } from './negotiationShieldBuyerInspection.service';
import { generateContractorQuoteAnalysis } from './negotiationShieldContractorQuote.service';
import { generateContractorUrgencyPressureAnalysis } from './negotiationShieldContractorUrgency.service';
import { parseNegotiationShieldDocument } from './negotiationShieldDocumentParsing.service';
import { generateInsuranceClaimSettlementAnalysis } from './negotiationShieldInsuranceClaimSettlement.service';
import { generateInsurancePremiumIncreaseAnalysis } from './negotiationShieldInsurancePremium.service';
import { advanceServiceQuoteDecision } from './serviceQuoteDecisionJourney.service';
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';
import { logger } from '../lib/logger';

const PARSED_DOCUMENT_INPUT_ORIGIN = 'PARSED_DOCUMENT';

function asIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const normalized = value.replace(/[$,\s]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && 'toNumber' in (value as Record<string, unknown>)) {
    const maybe = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(maybe) ? maybe : null;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'y', 'immediate', 'urgent', 'same_day', 'same-day'].includes(normalized)) {
      return true;
    }
    if (['false', 'no', 'n', 'not_urgent', 'not-urgent'].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function firstPresent(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in source && source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }
  return undefined;
}

function hasMeaningfulText(value: string | null | undefined, minLength = 20): boolean {
  return typeof value === 'string' && value.trim().length >= minLength;
}

function readStorageKey(metadata: unknown): string | null {
  const meta = asObject(metadata);
  return typeof meta.storageKey === 'string' && meta.storageKey.trim().length > 0
    ? meta.storageKey
    : null;
}

function resolveSourceType(args: {
  hasInputs: boolean;
  hasDocuments: boolean;
  fallback: NegotiationShieldSourceType;
}): NegotiationShieldSourceType {
  if (args.hasInputs && args.hasDocuments) return 'HYBRID';
  if (args.hasInputs) return 'MANUAL';
  if (args.hasDocuments) return 'DOCUMENT_UPLOAD';
  return args.fallback;
}

function buildStoredFileUrl(fileUrl?: string | null, storageKey?: string | null): string {
  if (fileUrl && fileUrl.trim().length > 0) {
    return fileUrl.trim();
  }
  if (storageKey && storageKey.trim().length > 0) {
    return `storage://${storageKey.trim()}`;
  }
  throw new APIError('A fileUrl or storageKey is required.', 400, 'NEGOTIATION_SHIELD_FILE_REFERENCE_REQUIRED');
}

function stripInputMeta(value: unknown): Record<string, unknown> {
  const source = asObject(value);
  const next = { ...source };
  delete next._meta;
  return next;
}

function getInputMeta(value: unknown): Record<string, unknown> {
  return asObject(asObject(value)._meta);
}

function isParsedDocumentInput(value: unknown): boolean {
  return getInputMeta(value).origin === PARSED_DOCUMENT_INPUT_ORIGIN;
}

export class NegotiationShieldService {
  private get models() {
    const db = prisma as any;
    const caseModel = db.negotiationShieldCase;
    const inputModel = db.negotiationShieldInput;
    const documentModel = db.negotiationShieldDocument;
    const analysisModel = db.negotiationShieldAnalysis;
    const draftModel = db.negotiationShieldDraft;
    const buyerFindingModel = db.negotiationShieldBuyerFinding;

    if (!caseModel || !inputModel || !documentModel || !analysisModel || !draftModel || !buyerFindingModel) {
      throw new APIError(
        'Negotiation Shield models are unavailable. Run prisma generate.',
        500,
        'NEGOTIATION_SHIELD_MODEL_UNAVAILABLE'
      );
    }

    return {
      caseModel,
      inputModel,
      documentModel,
      analysisModel,
      draftModel,
      buyerFindingModel,
    };
  }

  private serializeCase(record: any): NegotiationShieldCaseSummaryDTO {
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

  private serializeInput(record: any): NegotiationShieldInputDTO {
    return {
      id: String(record.id),
      caseId: String(record.caseId),
      inputType: record.inputType,
      rawText: record.rawText ?? null,
      structuredData: asObject(record.structuredData),
      createdAt: asIsoString(record.createdAt) as string,
      updatedAt: asIsoString(record.updatedAt) as string,
    };
  }

  private serializeDocument(record: any): NegotiationShieldDocumentDTO {
    const document = record.document ?? {};
    return {
      id: String(record.id),
      caseId: String(record.caseId),
      documentId: String(record.documentId),
      documentType: record.documentType,
      fileName: document.name ?? '',
      mimeType: document.mimeType ?? null,
      fileSizeBytes:
        typeof document.fileSize === 'number' ? document.fileSize : document.fileSize ?? null,
      fileUrl: document.fileUrl ?? null,
      storageKey: readStorageKey(document.metadata),
      uploadedAt: asIsoString(record.uploadedAt ?? document.createdAt) as string,
    };
  }

  private serializeAnalysis(record: any): NegotiationShieldAnalysisDTO {
    const pa = record.pricingAssessment as Record<string, unknown> | null;
    const confidenceExplanation =
      pa && typeof pa.confidenceExplanation === 'string' ? pa.confidenceExplanation : null;

    return {
      id: String(record.id),
      caseId: String(record.caseId),
      scenarioType: record.scenarioType,
      summary: record.summary ?? null,
      findings: record.findings ?? null,
      negotiationLeverage: record.negotiationLeverage ?? null,
      recommendedActions: record.recommendedActions ?? null,
      pricingAssessment: record.pricingAssessment ?? null,
      confidence:
        typeof record.confidence === 'number' ? record.confidence : record.confidence ?? null,
      confidenceExplanation,
      generatedAt: asIsoString(record.generatedAt) as string,
      modelVersion: record.modelVersion ?? null,
      createdAt: asIsoString(record.createdAt) as string,
    };
  }

  private serializeDraft(record: any): NegotiationShieldDraftDTO {
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

  private serializeBuyerFinding(record: any): BuyerNegotiationFindingDTO {
    const finding = record.finding ?? {};
    return {
      id: String(record.id),
      findingId: String(record.findingId),
      homeSystem: String(finding.homeSystem ?? ''),
      severity: String(finding.severity ?? ''),
      inspectorDescription: String(finding.inspectorDescription ?? ''),
      estimatedCostCentsLow: finding.estimatedCostCentsLow ?? null,
      estimatedCostCentsHigh: finding.estimatedCostCentsHigh ?? null,
      buyerTaskId: finding.buyerTaskId ?? null,
      requestType: record.requestType,
      requestedCreditCents: record.requestedCreditCents ?? null,
      sellerResponse: record.sellerResponse,
      sellerResponseNotes: record.sellerResponseNotes ?? null,
      sellerRespondedAt: asIsoString(record.sellerRespondedAt),
      outcome: record.outcome,
      agreedCreditCents: record.agreedCreditCents ?? null,
      outcomeNotes: record.outcomeNotes ?? null,
      outcomeRecordedAt: asIsoString(record.outcomeRecordedAt),
      outcomeDocumentId: record.outcomeDocumentId ?? null,
      outcomeDocumentName: record.outcomeDocument?.name ?? null,
    };
  }

  private async assertCaseBelongsToProperty(propertyId: string, caseId: string) {
    const record = await this.models.caseModel.findFirst({
      where: { id: caseId, propertyId },
      select: {
        id: true,
        propertyId: true,
        sourceType: true,
        scenarioType: true,
        title: true,
        description: true,
      },
    });

    if (!record) {
      throw new APIError('Negotiation Shield case not found.', 404, 'NEGOTIATION_SHIELD_CASE_NOT_FOUND');
    }

    return record;
  }

  private async assertDocumentAttachAllowed(args: {
    propertyId: string;
    documentId: string;
    uploadedByProfileId?: string | null;
  }) {
    const document = await prisma.document.findUnique({
      where: { id: args.documentId },
      select: {
        id: true,
        propertyId: true,
        uploadedBy: true,
      },
    });

    if (!document) {
      throw new APIError('Document not found.', 404, 'NEGOTIATION_SHIELD_DOCUMENT_NOT_FOUND');
    }

    const propertyMatch = document.propertyId === args.propertyId;
    const uploaderMatch =
      !document.propertyId &&
      !!args.uploadedByProfileId &&
      document.uploadedBy === args.uploadedByProfileId;

    if (!propertyMatch && !uploaderMatch) {
      throw new APIError(
        'Document not found or access denied.',
        404,
        'NEGOTIATION_SHIELD_DOCUMENT_ACCESS_DENIED'
      );
    }
  }

  private async countCaseChildren(caseId: string) {
    const [inputCount, documentCount] = await Promise.all([
      this.models.inputModel.count({ where: { caseId } }),
      this.models.documentModel.count({ where: { caseId } }),
    ]);

    return { inputCount, documentCount };
  }

  private async assertPropertyExists(propertyId: string) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });

    if (!property) {
      throw new APIError('Property not found.', 404, 'PROPERTY_NOT_FOUND');
    }

    return property;
  }

  private buildMergedScenarioInput(
    record: any,
    expectedInputType:
      | 'CONTRACTOR_QUOTE'
      | 'INSURANCE_PREMIUM'
      | 'INSURANCE_CLAIM_SETTLEMENT'
      | 'BUYER_INSPECTION'
      | 'CONTRACTOR_URGENCY'
  ) {
    const allInputs = asArray<any>(record.inputs);
    const typedInputs = allInputs.filter((input) => input.inputType === expectedInputType);
    const relevantInputs = typedInputs.length > 0 ? typedInputs : allInputs;
    const orderedInputs = [...relevantInputs].sort(
      (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    );
    const parsedInputs = orderedInputs.filter((input) => isParsedDocumentInput(input.structuredData));
    const manualInputs = orderedInputs.filter((input) => !isParsedDocumentInput(input.structuredData));

    const mergeStructuredData = (items: any[]) =>
      items.reduce<Record<string, unknown>>((acc, input) => {
        return { ...acc, ...stripInputMeta(input.structuredData) };
      }, {});

    const parsedStructuredData = mergeStructuredData(parsedInputs);
    const manualStructuredData = mergeStructuredData(manualInputs);
    const mergedStructuredData = { ...parsedStructuredData, ...manualStructuredData };

    const collectRawText = (items: any[]) => {
      const values = items
        .map((input) => asTrimmedString(input.rawText))
        .filter((value): value is string => Boolean(value));
      return [...new Set(values)].join('\n\n');
    };

    const manualRawText = collectRawText(manualInputs);
    const parsedRawText = collectRawText(parsedInputs);
    const mergedRawText = (() => {
      if (manualRawText && parsedRawText) {
        return `Manual input:\n${manualRawText}\n\nParsed document text:\n${parsedRawText}`;
      }
      return manualRawText || parsedRawText || null;
    })();

    return {
      mergedStructuredData,
      latestRawText: mergedRawText,
    };
  }

  private async getInsurancePropertySignals(propertyId: string) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        roofReplacementYear: true,
        hasSecuritySystem: true,
        hasSmokeDetectors: true,
        hasCoDetectors: true,
        hasSumpPumpBackup: true,
        insurancePolicies: {
          orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
          take: 1,
          select: {
            carrierName: true,
            isVerified: true,
            premiumAmount: true,
            coverageType: true,
            expiryDate: true,
          },
        },
        maintenanceTasks: {
          where: { status: MaintenanceTaskStatus.COMPLETED },
          select: { id: true },
        },
        claims: {
          select: { id: true },
        },
        homeEvents: {
          where: {
            type: {
              in: [
                HomeEventType.IMPROVEMENT,
                HomeEventType.MAINTENANCE,
                HomeEventType.REPAIR,
              ],
            },
          },
          orderBy: [{ occurredAt: 'desc' }],
          take: 10,
          select: {
            id: true,
            occurredAt: true,
          },
        },
      },
    });

    if (!property) {
      throw new APIError('Property not found.', 404, 'PROPERTY_NOT_FOUND');
    }

    const currentYear = new Date().getFullYear();
    const roofAgeYears =
      property.roofReplacementYear && property.roofReplacementYear > 1900
        ? Math.max(0, currentYear - property.roofReplacementYear)
        : null;
    const recentImprovementCutoff = new Date();
    recentImprovementCutoff.setMonth(recentImprovementCutoff.getMonth() - 24);
    const recentImprovementCount = property.homeEvents.filter(
      (event) => new Date(event.occurredAt).getTime() >= recentImprovementCutoff.getTime()
    ).length;
    const latestPolicy = property.insurancePolicies[0] ?? null;

    return {
      roofReplacementYear: property.roofReplacementYear ?? null,
      roofAgeYears,
      hasSecuritySystem: property.hasSecuritySystem ?? null,
      hasSmokeDetectors: property.hasSmokeDetectors ?? null,
      hasCoDetectors: property.hasCoDetectors ?? null,
      hasSumpPumpBackup: property.hasSumpPumpBackup ?? null,
      completedMaintenanceCount: property.maintenanceTasks.length,
      recentImprovementCount,
      claimCount: property.claims.length,
      claimFreeRecorded: property.claims.length === 0,
      policyOnFile: latestPolicy
        ? {
            carrierName: latestPolicy.carrierName ?? null,
            isVerified: Boolean(latestPolicy.isVerified),
            premiumAmount: asNumber(latestPolicy.premiumAmount),
            coverageType: latestPolicy.coverageType ?? null,
            expiryDate: asIsoString(latestPolicy.expiryDate),
          }
        : null,
    };
  }

  private buildContractorQuoteContext(record: any) {
    const { mergedStructuredData, latestRawText } = this.buildMergedScenarioInput(
      record,
      'CONTRACTOR_QUOTE'
    );

    const noteFromStructured = asTrimmedString(
      firstPresent(mergedStructuredData, ['notes', 'note', 'description', 'scopeNotes'])
    );

    const documents = asArray<any>(record.documents);
    const quoteDocumentCount = documents.filter((item) => item.documentType === 'QUOTE').length;
    const supportingDocumentCount = documents.filter(
      (item) => item.documentType === 'SUPPORTING_DOCUMENT'
    ).length;

    const contractorName = asTrimmedString(
      firstPresent(mergedStructuredData, ['contractorName', 'vendorName', 'companyName'])
    );
    const quoteAmount = asNumber(
      firstPresent(mergedStructuredData, ['quoteAmount', 'amount', 'estimateAmount', 'totalAmount'])
    );
    const currency =
      asTrimmedString(firstPresent(mergedStructuredData, ['currency', 'quoteCurrency'])) ?? 'USD';
    const quoteDate = asTrimmedString(
      firstPresent(mergedStructuredData, ['quoteDate', 'estimateDate', 'proposalDate'])
    );
    const serviceCategory = asTrimmedString(
      firstPresent(mergedStructuredData, ['serviceCategory', 'jobCategory', 'tradeCategory'])
    );
    const systemCategory = asTrimmedString(
      firstPresent(mergedStructuredData, ['systemCategory', 'system', 'component'])
    );
    const urgencyClaimed = asBoolean(
      firstPresent(mergedStructuredData, ['urgencyClaimed', 'urgent', 'immediate', 'sameDay'])
    );
    const comparisonQuoteCount = asNumber(
      firstPresent(mergedStructuredData, ['comparisonQuoteCount', 'otherQuoteCount', 'quoteCount'])
    );
    const comparisonQuotesAvailable = (() => {
      const explicit = asBoolean(
        firstPresent(mergedStructuredData, ['comparisonQuotesAvailable', 'hasComparisonQuotes'])
      );
      if (explicit !== null) return explicit;
      return comparisonQuoteCount !== null ? comparisonQuoteCount > 1 : false;
    })();
    const laborBreakdownProvided = (() => {
      const explicit = asBoolean(
        firstPresent(mergedStructuredData, ['laborBreakdownProvided', 'hasLaborBreakdown'])
      );
      if (explicit !== null) return explicit;
      return asNumber(firstPresent(mergedStructuredData, ['laborCost', 'laborAmount'])) !== null;
    })();
    const materialsBreakdownProvided = (() => {
      const explicit = asBoolean(
        firstPresent(mergedStructuredData, ['materialsBreakdownProvided', 'hasMaterialsBreakdown'])
      );
      if (explicit !== null) return explicit;
      return asNumber(firstPresent(mergedStructuredData, ['materialsCost', 'materialsAmount'])) !== null;
    })();
    const lineItemBreakdownProvided = (() => {
      const explicit = asBoolean(
        firstPresent(mergedStructuredData, ['lineItemBreakdownProvided', 'itemized', 'itemizedBreakdown'])
      );
      if (explicit !== null) return explicit;
      const lineItems = firstPresent(mergedStructuredData, ['lineItems', 'items', 'breakdown']);
      return Array.isArray(lineItems) && lineItems.length > 0
        ? true
        : laborBreakdownProvided || materialsBreakdownProvided;
    })();
    const scopeClarityProvided = (() => {
      const explicit = asBoolean(
        firstPresent(mergedStructuredData, ['scopeClarityProvided', 'scopeClear'])
      );
      if (explicit !== null) return explicit;
      return (
        asTrimmedString(firstPresent(mergedStructuredData, ['scope', 'scopeDescription', 'workDescription'])) !==
          null || hasMeaningfulText(noteFromStructured, 15)
      );
    })();
    const repairOptionDiscussed = asBoolean(
      firstPresent(mergedStructuredData, ['repairOptionDiscussed', 'repairOffered', 'repairPossible'])
    );
    const replacementRecommended = asBoolean(
      firstPresent(mergedStructuredData, ['replacementRecommended', 'fullReplacementRecommended'])
    );
    const warrantyMentioned = asBoolean(
      firstPresent(mergedStructuredData, ['warrantyMentioned', 'warrantyIncluded'])
    );
    const inspectionEvidenceProvided = asBoolean(
      firstPresent(mergedStructuredData, ['inspectionEvidenceProvided', 'photosProvided', 'inspectionPhotosProvided'])
    );

    const meaningfulSignalKeys = [
      'contractorName',
      'vendorName',
      'companyName',
      'quoteAmount',
      'amount',
      'estimateAmount',
      'totalAmount',
      'quoteDate',
      'estimateDate',
      'proposalDate',
      'serviceCategory',
      'jobCategory',
      'tradeCategory',
      'systemCategory',
      'system',
      'component',
      'notes',
      'note',
      'description',
      'scopeNotes',
      'scope',
      'scopeDescription',
      'workDescription',
      'comparisonQuoteCount',
      'otherQuoteCount',
      'quoteCount',
      'comparisonQuotesAvailable',
      'hasComparisonQuotes',
      'urgencyClaimed',
      'urgent',
      'immediate',
      'sameDay',
      'laborBreakdownProvided',
      'hasLaborBreakdown',
      'materialsBreakdownProvided',
      'hasMaterialsBreakdown',
      'lineItemBreakdownProvided',
      'itemized',
      'itemizedBreakdown',
      'repairOptionDiscussed',
      'repairOffered',
      'repairPossible',
      'replacementRecommended',
      'fullReplacementRecommended',
      'warrantyMentioned',
      'warrantyIncluded',
      'inspectionEvidenceProvided',
      'photosProvided',
      'inspectionPhotosProvided',
      'lineItems',
      'items',
      'breakdown',
    ];
    const hasMeaningfulStructuredInput = meaningfulSignalKeys.some((key) => {
      if (!(key in mergedStructuredData)) return false;
      const value = mergedStructuredData[key];
      if (typeof value === 'string') return value.trim().length > 0;
      if (typeof value === 'number') return Number.isFinite(value);
      if (typeof value === 'boolean') return true;
      if (Array.isArray(value)) return value.length > 0;
      return value !== null && value !== undefined;
    });

    const hasMeaningfulInput =
      hasMeaningfulText(latestRawText, 20) ||
      hasMeaningfulStructuredInput ||
      quoteAmount !== null ||
      hasMeaningfulText(noteFromStructured, 20);

    return {
      hasMeaningfulInput,
      analysisInput: {
        caseTitle: record.title,
        caseDescription: record.description ?? null,
        contractorName,
        quoteAmount,
        currency,
        quoteDate,
        serviceCategory,
        systemCategory,
        urgencyClaimed,
        notes: noteFromStructured,
        rawText: latestRawText,
        supportingDocumentCount,
        quoteDocumentCount,
        hasAnyDocument: documents.length > 0,
        laborBreakdownProvided,
        materialsBreakdownProvided,
        lineItemBreakdownProvided,
        scopeClarityProvided,
        comparisonQuotesAvailable,
        comparisonQuoteCount,
        repairOptionDiscussed,
        replacementRecommended,
        warrantyMentioned,
        inspectionEvidenceProvided,
      },
    };
  }

  private buildInsurancePremiumIncreaseContext(record: any, propertySignals: any) {
    const { mergedStructuredData, latestRawText } = this.buildMergedScenarioInput(
      record,
      'INSURANCE_PREMIUM'
    );

    const notes = asTrimmedString(
      firstPresent(mergedStructuredData, ['notes', 'note', 'description'])
    );
    const insurerName =
      asTrimmedString(firstPresent(mergedStructuredData, ['insurerName', 'carrierName', 'providerName'])) ??
      propertySignals.policyOnFile?.carrierName ??
      null;

    const priorPremium = asNumber(
      firstPresent(mergedStructuredData, ['priorPremium', 'oldPremium', 'currentPremium'])
    );
    const newPremium = asNumber(
      firstPresent(mergedStructuredData, ['newPremium', 'renewalPremium', 'premiumAmount'])
    );
    const providedIncreaseAmount = asNumber(
      firstPresent(mergedStructuredData, ['increaseAmount', 'premiumIncreaseAmount'])
    );
    const providedIncreasePercentage = asNumber(
      firstPresent(mergedStructuredData, ['increasePercentage', 'premiumIncreasePercentage'])
    );
    const increaseAmount =
      providedIncreaseAmount !== null
        ? providedIncreaseAmount
        : priorPremium !== null && newPremium !== null
          ? Number((newPremium - priorPremium).toFixed(2))
          : null;
    const increasePercentage =
      providedIncreasePercentage !== null
        ? providedIncreasePercentage
        : priorPremium !== null &&
            newPremium !== null &&
            priorPremium > 0
          ? Number((((newPremium - priorPremium) / priorPremium) * 100).toFixed(1))
          : null;
    const renewalDate = asTrimmedString(
      firstPresent(mergedStructuredData, ['renewalDate', 'policyRenewalDate', 'effectiveDate'])
    );
    const reasonProvided = asTrimmedString(
      firstPresent(mergedStructuredData, ['reasonProvided', 'insurerReason', 'rationale', 'explanation'])
    );

    const documents = asArray<any>(record.documents);
    const premiumNoticeDocumentCount = documents.filter(
      (item) => item.documentType === 'PREMIUM_NOTICE'
    ).length;
    const supportingDocumentCount = documents.filter(
      (item) => item.documentType === 'SUPPORTING_DOCUMENT'
    ).length;

    const meaningfulSignalKeys = [
      'insurerName',
      'carrierName',
      'providerName',
      'priorPremium',
      'oldPremium',
      'currentPremium',
      'newPremium',
      'renewalPremium',
      'premiumAmount',
      'increaseAmount',
      'premiumIncreaseAmount',
      'increasePercentage',
      'premiumIncreasePercentage',
      'renewalDate',
      'policyRenewalDate',
      'effectiveDate',
      'reasonProvided',
      'insurerReason',
      'rationale',
      'explanation',
      'notes',
      'note',
      'description',
    ];
    const hasMeaningfulStructuredInput = meaningfulSignalKeys.some((key) => {
      if (!(key in mergedStructuredData)) return false;
      const value = mergedStructuredData[key];
      if (typeof value === 'string') return value.trim().length > 0;
      if (typeof value === 'number') return Number.isFinite(value);
      if (typeof value === 'boolean') return true;
      if (Array.isArray(value)) return value.length > 0;
      return value !== null && value !== undefined;
    });

    const hasMeaningfulInput =
      hasMeaningfulText(latestRawText, 20) ||
      hasMeaningfulStructuredInput ||
      priorPremium !== null ||
      newPremium !== null ||
      increaseAmount !== null ||
      increasePercentage !== null ||
      hasMeaningfulText(notes, 20);

    return {
      hasMeaningfulInput,
      analysisInput: {
        caseTitle: record.title,
        caseDescription: record.description ?? null,
        insurerName,
        priorPremium,
        newPremium,
        increaseAmount,
        increasePercentage,
        renewalDate,
        reasonProvided,
        notes,
        rawText: latestRawText,
        hasAnyDocument: documents.length > 0,
        premiumNoticeDocumentCount,
        supportingDocumentCount,
        propertySignals,
      },
    };
  }

  private buildInsuranceClaimSettlementContext(record: any, propertySignals: any) {
    const { mergedStructuredData, latestRawText } = this.buildMergedScenarioInput(
      record,
      'INSURANCE_CLAIM_SETTLEMENT'
    );

    const notes = asTrimmedString(
      firstPresent(mergedStructuredData, ['notes', 'note', 'description', 'settlementLetterText'])
    );
    const insurerName =
      asTrimmedString(firstPresent(mergedStructuredData, ['insurerName', 'carrierName', 'providerName'])) ??
      propertySignals.policyOnFile?.carrierName ??
      null;
    const claimType = asTrimmedString(
      firstPresent(mergedStructuredData, ['claimType', 'lossType', 'coverageType'])
    );
    const settlementAmount = asNumber(
      firstPresent(mergedStructuredData, ['settlementAmount', 'claimSettlementAmount', 'approvedAmount'])
    );
    const estimateAmount = asNumber(
      firstPresent(mergedStructuredData, ['estimateAmount', 'repairEstimateAmount', 'contractorEstimateAmount'])
    );
    const providedGapAmount = asNumber(
      firstPresent(mergedStructuredData, ['gapAmount', 'settlementGapAmount'])
    );
    const providedGapPercentage = asNumber(
      firstPresent(mergedStructuredData, ['gapPercentage', 'settlementGapPercentage'])
    );
    const gapAmount =
      providedGapAmount !== null
        ? providedGapAmount
        : settlementAmount !== null && estimateAmount !== null
          ? Number((estimateAmount - settlementAmount).toFixed(2))
          : null;
    const gapPercentage =
      providedGapPercentage !== null
        ? providedGapPercentage
        : settlementAmount !== null && estimateAmount !== null && settlementAmount > 0
          ? Number((((estimateAmount - settlementAmount) / settlementAmount) * 100).toFixed(1))
          : null;
    const claimDate = asTrimmedString(
      firstPresent(mergedStructuredData, ['claimDate', 'lossDate', 'settlementDate'])
    );
    const reasonProvided = asTrimmedString(
      firstPresent(mergedStructuredData, ['reasonProvided', 'insurerReason', 'rationale', 'explanation'])
    );

    const documents = asArray<any>(record.documents);
    const settlementNoticeDocumentCount = documents.filter(
      (item) => item.documentType === 'CLAIM_SETTLEMENT_NOTICE'
    ).length;
    const estimateDocumentCount = documents.filter(
      (item) => item.documentType === 'CLAIM_ESTIMATE'
    ).length;
    const supportingDocumentCount = documents.filter(
      (item) => item.documentType === 'SUPPORTING_DOCUMENT'
    ).length;

    const meaningfulSignalKeys = [
      'insurerName',
      'carrierName',
      'providerName',
      'claimType',
      'lossType',
      'coverageType',
      'settlementAmount',
      'claimSettlementAmount',
      'approvedAmount',
      'estimateAmount',
      'repairEstimateAmount',
      'contractorEstimateAmount',
      'gapAmount',
      'settlementGapAmount',
      'gapPercentage',
      'settlementGapPercentage',
      'claimDate',
      'lossDate',
      'settlementDate',
      'reasonProvided',
      'insurerReason',
      'rationale',
      'explanation',
      'notes',
      'note',
      'description',
      'settlementLetterText',
    ];
    const hasMeaningfulStructuredInput = meaningfulSignalKeys.some((key) => {
      if (!(key in mergedStructuredData)) return false;
      const value = mergedStructuredData[key];
      if (typeof value === 'string') return value.trim().length > 0;
      if (typeof value === 'number') return Number.isFinite(value);
      if (typeof value === 'boolean') return true;
      if (Array.isArray(value)) return value.length > 0;
      return value !== null && value !== undefined;
    });

    const hasMeaningfulInput =
      hasMeaningfulText(latestRawText, 20) ||
      hasMeaningfulStructuredInput ||
      settlementAmount !== null ||
      estimateAmount !== null ||
      gapAmount !== null ||
      hasMeaningfulText(notes, 20);

    return {
      hasMeaningfulInput,
      analysisInput: {
        caseTitle: record.title,
        caseDescription: record.description ?? null,
        insurerName,
        claimType,
        settlementAmount,
        estimateAmount,
        gapAmount,
        gapPercentage,
        claimDate,
        reasonProvided,
        notes,
        rawText: latestRawText,
        hasAnyDocument: documents.length > 0,
        settlementNoticeDocumentCount,
        estimateDocumentCount,
        supportingDocumentCount,
        propertySignals,
      },
    };
  }

  private buildBuyerInspectionNegotiationContext(record: any, propertySignals: any) {
    const { mergedStructuredData, latestRawText } = this.buildMergedScenarioInput(
      record,
      'BUYER_INSPECTION'
    );

    const requestedConcessionAmount = asNumber(
      firstPresent(mergedStructuredData, ['requestedConcessionAmount', 'concessionAmount', 'buyerRequestAmount'])
    );
    const inspectionIssuesSummary = asTrimmedString(
      firstPresent(mergedStructuredData, ['inspectionIssuesSummary', 'issueSummary', 'issues'])
    );
    const requestedRepairs = asTrimmedString(
      firstPresent(mergedStructuredData, ['requestedRepairs', 'repairRequests', 'buyerRequestedRepairs'])
    );
    const recentUpgradeNotes = asTrimmedString(
      firstPresent(mergedStructuredData, ['recentUpgradeNotes', 'upgradeNotes', 'sellerUpgradeNotes'])
    );
    const reportDate = asTrimmedString(
      firstPresent(mergedStructuredData, ['reportDate', 'inspectionDate', 'buyerRequestDate'])
    );
    const notes = asTrimmedString(
      firstPresent(mergedStructuredData, ['notes', 'note', 'description', 'buyerRequestText'])
    );

    const documents = asArray<any>(record.documents);
    const inspectionReportDocumentCount = documents.filter(
      (item) => item.documentType === 'INSPECTION_REPORT'
    ).length;
    const buyerRequestDocumentCount = documents.filter(
      (item) => item.documentType === 'BUYER_REQUEST'
    ).length;
    const supportingDocumentCount = documents.filter(
      (item) => item.documentType === 'SUPPORTING_DOCUMENT'
    ).length;

    const meaningfulSignalKeys = [
      'requestedConcessionAmount',
      'concessionAmount',
      'buyerRequestAmount',
      'inspectionIssuesSummary',
      'issueSummary',
      'issues',
      'requestedRepairs',
      'repairRequests',
      'buyerRequestedRepairs',
      'recentUpgradeNotes',
      'upgradeNotes',
      'sellerUpgradeNotes',
      'reportDate',
      'inspectionDate',
      'buyerRequestDate',
      'notes',
      'note',
      'description',
      'buyerRequestText',
    ];
    const hasMeaningfulStructuredInput = meaningfulSignalKeys.some((key) => {
      if (!(key in mergedStructuredData)) return false;
      const value = mergedStructuredData[key];
      if (typeof value === 'string') return value.trim().length > 0;
      if (typeof value === 'number') return Number.isFinite(value);
      if (typeof value === 'boolean') return true;
      if (Array.isArray(value)) return value.length > 0;
      return value !== null && value !== undefined;
    });

    const hasMeaningfulInput =
      hasMeaningfulText(latestRawText, 20) ||
      hasMeaningfulStructuredInput ||
      requestedConcessionAmount !== null ||
      hasMeaningfulText(inspectionIssuesSummary, 20) ||
      hasMeaningfulText(requestedRepairs, 20) ||
      hasMeaningfulText(notes, 20);

    return {
      hasMeaningfulInput,
      analysisInput: {
        perspective: (record.perspective === 'BUYER' ? 'BUYER' : 'HOMEOWNER') as 'BUYER' | 'HOMEOWNER',
        caseTitle: record.title,
        caseDescription: record.description ?? null,
        requestedConcessionAmount,
        inspectionIssuesSummary,
        requestedRepairs,
        recentUpgradeNotes,
        reportDate,
        notes,
        rawText: latestRawText,
        hasAnyDocument: documents.length > 0,
        inspectionReportDocumentCount,
        buyerRequestDocumentCount,
        supportingDocumentCount,
        propertySignals,
      },
    };
  }

  private buildContractorUrgencyPressureContext(record: any) {
    const { mergedStructuredData, latestRawText } = this.buildMergedScenarioInput(
      record,
      'CONTRACTOR_URGENCY'
    );

    const notes = asTrimmedString(
      firstPresent(mergedStructuredData, ['notes', 'note', 'description', 'recommendationText'])
    );
    const contractorName = asTrimmedString(
      firstPresent(mergedStructuredData, ['contractorName', 'vendorName', 'companyName'])
    );
    const recommendedWork = asTrimmedString(
      firstPresent(mergedStructuredData, ['recommendedWork', 'recommendedScope', 'workRecommendation'])
    );
    const urgencyClaimed = asBoolean(
      firstPresent(mergedStructuredData, ['urgencyClaimed', 'urgent', 'immediate'])
    );
    const sameDayPressure = asBoolean(
      firstPresent(mergedStructuredData, ['sameDayPressure', 'sameDay', 'sameDayApproval'])
    );
    const replacementRecommended = asBoolean(
      firstPresent(mergedStructuredData, ['replacementRecommended', 'fullReplacementRecommended'])
    );
    const repairOptionMentioned = asBoolean(
      firstPresent(mergedStructuredData, ['repairOptionMentioned', 'repairOptionDiscussed', 'repairPossible'])
    );
    const quoteAmount = asNumber(
      firstPresent(mergedStructuredData, ['quoteAmount', 'amount', 'estimateAmount', 'totalAmount'])
    );
    const inspectionEvidenceProvided = asBoolean(
      firstPresent(mergedStructuredData, ['inspectionEvidenceProvided', 'photosProvided', 'inspectionPhotosProvided'])
    );
    const itemizedExplanationProvided = asBoolean(
      firstPresent(mergedStructuredData, ['itemizedExplanationProvided', 'lineItemBreakdownProvided', 'itemized'])
    );

    const documents = asArray<any>(record.documents);
    const recommendationDocumentCount = documents.filter(
      (item) => item.documentType === 'CONTRACTOR_RECOMMENDATION'
    ).length;
    const estimateDocumentCount = documents.filter(
      (item) => item.documentType === 'CONTRACTOR_ESTIMATE'
    ).length;
    const supportingDocumentCount = documents.filter(
      (item) => item.documentType === 'SUPPORTING_DOCUMENT'
    ).length;

    const meaningfulSignalKeys = [
      'contractorName',
      'vendorName',
      'companyName',
      'recommendedWork',
      'recommendedScope',
      'workRecommendation',
      'urgencyClaimed',
      'urgent',
      'immediate',
      'sameDayPressure',
      'sameDay',
      'sameDayApproval',
      'replacementRecommended',
      'fullReplacementRecommended',
      'repairOptionMentioned',
      'repairOptionDiscussed',
      'repairPossible',
      'quoteAmount',
      'amount',
      'estimateAmount',
      'totalAmount',
      'inspectionEvidenceProvided',
      'photosProvided',
      'inspectionPhotosProvided',
      'itemizedExplanationProvided',
      'lineItemBreakdownProvided',
      'itemized',
      'notes',
      'note',
      'description',
      'recommendationText',
    ];
    const hasMeaningfulStructuredInput = meaningfulSignalKeys.some((key) => {
      if (!(key in mergedStructuredData)) return false;
      const value = mergedStructuredData[key];
      if (typeof value === 'string') return value.trim().length > 0;
      if (typeof value === 'number') return Number.isFinite(value);
      if (typeof value === 'boolean') return true;
      if (Array.isArray(value)) return value.length > 0;
      return value !== null && value !== undefined;
    });

    const hasMeaningfulInput =
      hasMeaningfulText(latestRawText, 20) ||
      hasMeaningfulStructuredInput ||
      hasMeaningfulText(recommendedWork, 12) ||
      quoteAmount !== null ||
      hasMeaningfulText(notes, 20);

    return {
      hasMeaningfulInput,
      analysisInput: {
        caseTitle: record.title,
        caseDescription: record.description ?? null,
        contractorName,
        recommendedWork,
        urgencyClaimed,
        sameDayPressure,
        replacementRecommended,
        repairOptionMentioned,
        quoteAmount,
        notes,
        rawText: latestRawText,
        hasAnyDocument: documents.length > 0,
        recommendationDocumentCount,
        estimateDocumentCount,
        supportingDocumentCount,
        inspectionEvidenceProvided,
        itemizedExplanationProvided,
      },
    };
  }

  private async persistAnalysisResult(
    caseId: string,
    scenarioType:
      | 'CONTRACTOR_QUOTE_REVIEW'
      | 'INSURANCE_PREMIUM_INCREASE'
      | 'INSURANCE_CLAIM_SETTLEMENT'
      | 'BUYER_INSPECTION_NEGOTIATION'
      | 'CONTRACTOR_URGENCY_PRESSURE',
    result: NegotiationShieldGeneratedAnalysisResult,
    propertyContextVersion?: string | null,
  ) {
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await (tx as any).negotiationShieldDraft.updateMany({
        where: { caseId, isLatest: true },
        data: { isLatest: false },
      });

      await (tx as any).negotiationShieldAnalysis.create({
        data: {
          caseId,
          scenarioType,
          summary: result.summary,
          findings: result.findings,
          negotiationLeverage: result.negotiationLeverage,
          recommendedActions: result.recommendedActions,
          pricingAssessment: {
            ...(result.pricingAssessment ?? {}),
            _propertyContextVersion: propertyContextVersion ?? null,
          },
          confidence: result.confidence,
          generatedAt: now,
          modelVersion: result.modelVersion,
        },
      });

      await (tx as any).negotiationShieldDraft.create({
        data: {
          caseId,
          draftType: result.draft.draftType,
          subject: result.draft.subject,
          body: result.draft.body,
          tone: result.draft.tone,
          isLatest: true,
        },
      });

      await (tx as any).negotiationShieldCase.update({
        where: { id: caseId },
        data: {
          status: 'ANALYZED',
          latestAnalysisAt: now,
          analysisVersion: result.modelVersion,
        },
      });
    });
  }

  async listCasesForProperty(propertyId: string): Promise<NegotiationShieldCaseSummaryDTO[]> {
    const rows = await this.models.caseModel.findMany({
      where: { propertyId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map((row: any) => this.serializeCase(row));
  }

  async getCaseDetail(propertyId: string, caseId: string): Promise<NegotiationShieldCaseDetailDTO> {
    const record = await this.models.caseModel.findFirst({
      where: { id: caseId, propertyId },
      include: {
        inputs: {
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        },
        documents: {
          include: {
            document: true,
          },
          orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
        },
        analyses: {
          orderBy: [{ generatedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
        drafts: {
          orderBy: [{ isLatest: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
        buyerFindingLinks: {
          include: { finding: true, outcomeDocument: { select: { name: true } } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!record) {
      throw new APIError('Negotiation Shield case not found.', 404, 'NEGOTIATION_SHIELD_CASE_NOT_FOUND');
    }

    return {
      case: this.serializeCase(record),
      inputs: Array.isArray(record.inputs) ? record.inputs.map((row: any) => this.serializeInput(row)) : [],
      documents: Array.isArray(record.documents)
        ? record.documents.map((row: any) => this.serializeDocument(row))
        : [],
      latestAnalysis:
        Array.isArray(record.analyses) && record.analyses[0]
          ? this.serializeAnalysis(record.analyses[0])
          : null,
      latestDraft:
        Array.isArray(record.drafts) && record.drafts[0]
          ? this.serializeDraft(record.drafts[0])
          : null,
      buyerFindings: Array.isArray(record.buyerFindingLinks)
        ? record.buyerFindingLinks.map((row: any) => this.serializeBuyerFinding(row))
        : [],
    };
  }

  async createCase(
    propertyId: string,
    createdByUserId: string,
    input: CreateNegotiationShieldCaseInput
  ): Promise<NegotiationShieldCaseDetailDTO> {
    if (input.quoteDecisionWorkspaceId) {
      const workspace = await (prisma as any).quoteComparisonWorkspace.findFirst({
        where: { id: input.quoteDecisionWorkspaceId, propertyId },
        select: { id: true },
      });
      if (!workspace) {
        throw new APIError(
          'Service quote decision workspace not found for this property.',
          400,
          'NEGOTIATION_INVALID_QUOTE_WORKSPACE',
        );
      }
      const existing = await this.models.caseModel.findFirst({
        where: { quoteDecisionWorkspaceId: input.quoteDecisionWorkspaceId },
        select: { id: true },
      });
      if (existing) return this.getCaseDetail(propertyId, existing.id);
    }
    const hasInitialInput = !!input.initialInput;
    const sourceType = resolveSourceType({
      hasInputs: hasInitialInput,
      hasDocuments: false,
      fallback: input.sourceType,
    });

    const created = await prisma.$transaction(async (tx) => {
      const createdCase = await (tx as any).negotiationShieldCase.create({
        data: {
          propertyId,
          createdByUserId,
          scenarioType: input.scenarioType,
          status: 'DRAFT',
          title: input.title.trim(),
          description: input.description?.trim() || null,
          sourceType,
          perspective: input.perspective ?? 'HOMEOWNER',
          quoteDecisionWorkspaceId: input.quoteDecisionWorkspaceId ?? null,
        },
        select: { id: true },
      });

      if (input.initialInput) {
        await (tx as any).negotiationShieldInput.create({
          data: {
            caseId: createdCase.id,
            inputType: input.initialInput.inputType,
            rawText: input.initialInput.rawText ?? null,
            structuredData: input.initialInput.structuredData ?? {},
          },
        });
      }

      return createdCase;
    });

    // Analytics: negotiation scenario launched
    analyticsEmitter.track({
      eventType: AnalyticsEvent.NEGOTIATION_SCENARIO_LAUNCHED,
      userId: createdByUserId,
      propertyId,
      moduleKey: AnalyticsModule.NEGOTIATION,
      featureKey: AnalyticsFeature.NEGOTIATION_SHIELD,
      metadataJson: {
        scenarioType: input.scenarioType ?? null,
        sourceType: sourceType ?? null,
      },
    });

    if (input.quoteDecisionWorkspaceId) {
      await advanceServiceQuoteDecision({
        propertyId,
        workspaceId: input.quoteDecisionWorkspaceId,
        actorUserId: createdByUserId,
        toStage: 'NEGOTIATION',
        relatedEntityType: 'NEGOTIATION_CASE',
        relatedEntityId: created.id,
        reason: 'Negotiation preparation started for the selected quote.',
      });
    }
    return this.getCaseDetail(propertyId, created.id);
  }

  async startBuyerNegotiation(
    propertyId: string,
    createdByUserId: string,
    input: StartBuyerNegotiationInput,
  ): Promise<NegotiationShieldCaseDetailDTO> {
    const findingIds = Array.from(new Set([...(input.findingIds ?? []), ...(input.findingId ? [input.findingId] : [])]));
    if (findingIds.length === 0) {
      throw new APIError('At least one inspection finding is required.', 400, 'BUYER_NEGOTIATION_FINDING_REQUIRED');
    }
    const findings = await prisma.inspectionFinding.findMany({
      where: { id: { in: findingIds }, propertyId },
      include: { report: { select: { status: true } } },
    });
    if (findings.length !== findingIds.length) {
      throw new APIError('One or more inspection findings were not found.', 404, 'FINDING_NOT_FOUND');
    }
    if (findings.some((finding) => (
      finding.report.status !== 'CONFIRMED'
      || finding.status === 'DISMISSED'
      || finding.buyerDisposition !== 'PRE_CLOSE_NEGOTIATION'
    ))) {
      throw new APIError(
        'Only confirmed, active inspection findings can start buyer negotiation.',
        409,
        'BUYER_NEGOTIATION_FINDING_NOT_READY',
      );
    }

    const existingLinks = await this.models.buyerFindingModel.findMany({
      where: { findingId: { in: findingIds } },
      select: { caseId: true },
    });
    const existingCaseIds = Array.from(new Set(existingLinks.map((link: { caseId: string }) => link.caseId)));
    if (existingCaseIds.length > 1) {
      throw new APIError('Selected findings already belong to different negotiation cases.', 409, 'BUYER_NEGOTIATION_CASE_CONFLICT');
    }
    const existingCaseId = existingCaseIds[0] ?? null;

    let created: { id: string };
    try {
      created = await prisma.$transaction(async (tx) => {
        const negotiationCase = existingCaseId
          ? await tx.negotiationShieldCase.findFirstOrThrow({ where: { id: existingCaseId, propertyId, perspective: 'BUYER' } })
          : await tx.negotiationShieldCase.create({
            data: {
              propertyId,
              createdByUserId,
              scenarioType: 'BUYER_INSPECTION_NEGOTIATION',
              perspective: 'BUYER',
              status: 'DRAFT',
              sourceType: 'MANUAL',
              title: findings.length === 1
                ? `Negotiate ${findings[0].homeSystem.toLowerCase().replace(/_/g, ' ')} inspection finding`
                : `Negotiate ${findings.length} inspection findings`,
              description: findings.map((finding) => finding.inspectorDescription).join('\n\n'),
            },
          });
        const createdLinks = await tx.negotiationShieldBuyerFinding.createMany({
          data: findings.map((finding) => ({
            caseId: negotiationCase.id,
            findingId: finding.id,
            requestType: input.requestType,
            requestedCreditCents: input.requestedCreditCents ?? null,
          })),
          skipDuplicates: true,
        });
        const caseFindings = await tx.negotiationShieldBuyerFinding.findMany({
          where: { caseId: negotiationCase.id },
          include: { finding: true },
          orderBy: { createdAt: 'asc' },
        });
        if (createdLinks.count > 0) await tx.negotiationShieldInput.create({
          data: {
            caseId: negotiationCase.id,
            inputType: 'BUYER_INSPECTION',
            rawText: input.notes ?? null,
            structuredData: {
              requestedConcessionAmount: input.requestedCreditCents == null
                ? null
                : input.requestedCreditCents / 100,
              inspectionIssuesSummary: caseFindings.map((link) => link.finding.inspectorDescription).join('\n'),
              requestedRepairs: input.requestType === 'CREDIT'
                ? 'Request a closing credit tied to this inspection finding.'
                : 'Request seller repair or a documented credit for this inspection finding.',
              buyerPerspective: true,
              findingIds: caseFindings.map((link) => link.findingId),
            },
          },
        });
        return negotiationCase;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrentLinks = await this.models.buyerFindingModel.findMany({
          where: { findingId: { in: findingIds } },
          select: { caseId: true },
        });
        const concurrentCaseIds = Array.from(new Set<string>(concurrentLinks.map((link: { caseId: string }) => link.caseId)));
        if (concurrentLinks.length === findingIds.length && concurrentCaseIds.length === 1) {
          return this.getCaseDetail(propertyId, concurrentCaseIds[0]);
        }
      }
      throw error;
    }

    return this.getCaseDetail(propertyId, created.id);
  }

  async recordBuyerNegotiationOutcome(
    propertyId: string,
    caseId: string,
    actorUserId: string,
    input: RecordBuyerNegotiationOutcomeInput,
  ): Promise<NegotiationShieldCaseDetailDTO> {
    const linked = await this.models.buyerFindingModel.findFirst({
      where: {
        caseId,
        findingId: input.findingId,
        negotiationCase: { propertyId, perspective: 'BUYER' },
      },
      include: { finding: true },
    });
    if (!linked) {
      throw new APIError('Buyer negotiation finding not found.', 404, 'BUYER_NEGOTIATION_FINDING_NOT_FOUND');
    }

    const effectiveCompletionDocumentId = input.completionDocumentId === undefined
      ? linked.outcomeDocumentId
      : input.completionDocumentId;
    const completionDocument = effectiveCompletionDocumentId
      ? input.completionDocumentId === undefined
        ? await prisma.document.findFirst({
          where: { id: effectiveCompletionDocumentId, propertyId },
          select: { id: true, name: true, verificationStatus: true },
        })
        : (await prisma.negotiationShieldDocument.findFirst({
          where: { caseId, documentId: effectiveCompletionDocumentId, negotiationShieldCase: { propertyId } },
          select: { document: { select: { id: true, name: true, verificationStatus: true } } },
        }))?.document ?? null
      : null;
    if (effectiveCompletionDocumentId && !completionDocument) {
      throw new APIError('Completion evidence must be attached to this negotiation case.', 409, 'BUYER_NEGOTIATION_EVIDENCE_NOT_ATTACHED');
    }

    const now = new Date();
    const closesPreCloseWork = input.outcome === 'ACCEPTED_CREDIT' || input.outcome === 'SELLER_REPAIRED';
    const transfersToBuyer = input.outcome === 'TRANSFERRED_TO_BUYER';
    await prisma.$transaction(async (tx) => {
      await tx.negotiationShieldBuyerFinding.update({
        where: { id: linked.id },
        data: {
          sellerResponse: input.sellerResponse,
          sellerResponseNotes: input.sellerResponseNotes ?? null,
          sellerRespondedAt: input.sellerResponse === 'PENDING' ? null : now,
          outcome: input.outcome,
          agreedCreditCents: input.agreedCreditCents ?? null,
          outcomeNotes: input.outcomeNotes ?? null,
          outcomeRecordedAt: input.outcome === 'PENDING' ? null : now,
          outcomeRecordedById: input.outcome === 'PENDING' ? null : actorUserId,
          outcomeDocumentId: effectiveCompletionDocumentId,
        },
      });

      await tx.inspectionFinding.update({
        where: { id: linked.findingId },
        data: {
          ...(closesPreCloseWork ? {
            status: 'RESOLVED',
            resolvedAt: now,
            resolutionMethod: input.outcome === 'ACCEPTED_CREDIT' ? 'CREDITED_AT_CLOSING' : 'SELLER_REPAIR',
            resolutionCostCents: input.outcome === 'ACCEPTED_CREDIT' ? input.agreedCreditCents ?? null : null,
            resolutionNotes: input.outcomeNotes ?? input.sellerResponseNotes ?? null,
          } : {}),
          buyerOutcomeDocumentId: effectiveCompletionDocumentId,
          ...(transfersToBuyer ? {
            buyerDisposition: 'POST_CLOSE_ACTION',
            buyerDispositionAt: now,
            buyerDispositionByUserId: actorUserId,
            status: 'OPEN',
            resolvedAt: null,
            resolutionMethod: null,
          } : {}),
        },
      });

      if (linked.finding.buyerTaskId) {
        if (closesPreCloseWork) {
          await tx.homeBuyerTask.updateMany({
            where: { id: linked.finding.buyerTaskId, checklist: { propertyId } },
            data: {
              status: 'COMPLETED',
              completedAt: now,
              completedByUserId: actorUserId,
              completionDocumentId: effectiveCompletionDocumentId,
              completionMethod: effectiveCompletionDocumentId ? 'DOCUMENT' : 'EXTERNAL_CONFIRMATION',
              statusReason: input.outcome === 'ACCEPTED_CREDIT'
                ? 'Seller credit accepted and recorded.'
                : 'Seller repair recorded as complete.',
              completionEvidenceJson: {
                proofType: 'NEGOTIATION_OUTCOME',
                negotiationCaseId: caseId,
                findingId: linked.findingId,
                outcome: input.outcome,
                sellerResponse: input.sellerResponse,
                completionDocumentId: effectiveCompletionDocumentId,
              },
            },
          });
        } else if (transfersToBuyer) {
          await tx.homeBuyerTask.updateMany({
            where: { id: linked.finding.buyerTaskId, checklist: { propertyId } },
            data: {
              title: `Address ${linked.finding.homeSystem.toLowerCase().replace(/_/g, ' ')} finding`,
              phase: 'FIRST_30_DAYS',
              status: 'PENDING',
              completedAt: null,
              completedByUserId: null,
              completionMethod: null,
              completionEvidenceJson: Prisma.DbNull,
              statusReason: 'Seller response transferred this finding to the buyer ownership plan.',
            },
          });
        } else if (input.outcome === 'ACCEPTED_REPAIR') {
          await tx.homeBuyerTask.updateMany({
            where: { id: linked.finding.buyerTaskId, checklist: { propertyId } },
            data: {
              title: `Verify seller repair for ${linked.finding.homeSystem.toLowerCase().replace(/_/g, ' ')} finding`,
              status: 'IN_PROGRESS',
              statusReason: 'Seller repair accepted; verify completion before closing.',
            },
          });
        } else if (input.outcome === 'REJECTED') {
          await tx.homeBuyerTask.updateMany({
            where: { id: linked.finding.buyerTaskId, checklist: { propertyId } },
            data: {
              status: 'BLOCKED',
              statusReason: 'Seller rejected the request; choose whether to revise, waive, or transfer the finding.',
            },
          });
        }
      }
    });

    if (
      closesPreCloseWork
      && completionDocument
      && linked.finding.buyerRepairJourneyId
    ) {
      try {
        await guidanceJourneyService.recordJourneyEvidence({
          propertyId,
          journeyId: linked.finding.buyerRepairJourneyId,
          actorUserId,
          preferredStepKeys: input.outcome === 'SELLER_REPAIRED'
            ? ['verify_outcome', 'prepare_negotiation']
            : ['finalize_price', 'prepare_negotiation'],
          sourceToolKey: 'negotiation-shield',
          sourceEntityType: 'DOCUMENT',
          sourceEntityId: completionDocument.id,
          proofType: 'buyer_negotiation_outcome_document',
          proofId: completionDocument.id,
          dedupeKey: `buyer-negotiation-outcome:${caseId}:${linked.findingId}:${completionDocument.id}`,
          status: completionDocument.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'CAPTURED',
          sourceType: 'USER_INPUT',
          producedData: {
            negotiationCaseId: caseId,
            findingId: linked.findingId,
            outcome: input.outcome,
            sellerResponse: input.sellerResponse,
            documentId: completionDocument.id,
            documentName: completionDocument.name,
          },
          metadata: {
            sourceFeatureKey: 'buyer_acquisition_plan',
            resultContextLabel: 'Buyer negotiation completion evidence',
          },
        });
      } catch (guidanceError) {
        logger.warn({
          guidanceError,
          propertyId,
          caseId,
          findingId: linked.findingId,
          journeyId: linked.finding.buyerRepairJourneyId,
        }, '[GUIDANCE] buyer negotiation evidence propagation failed');
      }
    }

    return this.getCaseDetail(propertyId, caseId);
  }

  async saveManualInput(
    propertyId: string,
    caseId: string,
    payload: SaveNegotiationShieldInputPayload
  ): Promise<NegotiationShieldCaseDetailDTO> {
    const parentCase = await this.assertCaseBelongsToProperty(propertyId, caseId);

    let existingInput: any = null;
    if (payload.inputId) {
      existingInput = await this.models.inputModel.findFirst({
        where: {
          id: payload.inputId,
          caseId,
        },
      });

      if (!existingInput) {
        throw new APIError(
          'Negotiation Shield input not found.',
          404,
          'NEGOTIATION_SHIELD_INPUT_NOT_FOUND'
        );
      }
    } else {
      const candidateInputs = await this.models.inputModel.findMany({
        where: {
          caseId,
          inputType: payload.inputType,
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      });
      existingInput =
        candidateInputs.find((input: any) => !isParsedDocumentInput(input.structuredData)) ?? null;
    }

    if (existingInput) {
      if (isParsedDocumentInput(existingInput.structuredData)) {
        throw new APIError(
          'Parsed document input must be refreshed through document parsing, not manual input save.',
          400,
          'NEGOTIATION_SHIELD_PARSED_INPUT_IMMUTABLE'
        );
      }

      await this.models.inputModel.update({
        where: { id: existingInput.id },
        data: {
          inputType: payload.inputType ?? existingInput.inputType,
          rawText: payload.rawText !== undefined ? payload.rawText : existingInput.rawText,
          structuredData:
            payload.structuredData !== undefined
              ? payload.structuredData
              : existingInput.structuredData ?? {},
        },
      });
    } else {
      await this.models.inputModel.create({
        data: {
          caseId,
          inputType: payload.inputType,
          rawText: payload.rawText ?? null,
          structuredData: payload.structuredData ?? {},
        },
      });
    }

    const { documentCount } = await this.countCaseChildren(caseId);
    const nextSourceType = resolveSourceType({
      hasInputs: true,
      hasDocuments: documentCount > 0,
      fallback: parentCase.sourceType,
    });

    if (nextSourceType !== parentCase.sourceType) {
      await this.models.caseModel.update({
        where: { id: caseId },
        data: { sourceType: nextSourceType },
      });
    }

    return this.getCaseDetail(propertyId, caseId);
  }

  async attachDocumentMetadata(args: {
    propertyId: string;
    caseId: string;
    userId: string;
    homeownerProfileId?: string | null;
    payload: AttachNegotiationShieldDocumentPayload;
  }): Promise<NegotiationShieldCaseDetailDTO> {
    const parentCase = await this.assertCaseBelongsToProperty(args.propertyId, args.caseId);
    let documentId = args.payload.documentId ?? null;

    if (documentId) {
      await this.assertDocumentAttachAllowed({
        propertyId: args.propertyId,
        documentId,
        uploadedByProfileId: args.homeownerProfileId ?? null,
      });
    } else {
      const fileUrl = buildStoredFileUrl(args.payload.fileUrl, args.payload.storageKey);
      const uploadedBy = args.homeownerProfileId ?? args.userId;

      const document = await prisma.document.create({
        data: {
          uploadedBy,
          propertyId: args.propertyId,
          type: DocumentType.OTHER,
          name: String(args.payload.fileName).trim(),
          fileUrl,
          fileSize: args.payload.fileSizeBytes ?? 0,
          mimeType: args.payload.mimeType?.trim() || 'application/octet-stream',
          metadata: {
            kind: 'NEGOTIATION_SHIELD',
            storageKey: args.payload.storageKey ?? null,
            negotiationShieldDocumentType: args.payload.documentType,
          } as any,
        },
        select: { id: true },
      });

      documentId = document.id;
    }

    const existingLink = await this.models.documentModel.findFirst({
      where: {
        caseId: args.caseId,
        documentId,
      },
      select: { id: true },
    });

    if (!existingLink) {
      await this.models.documentModel.create({
        data: {
          caseId: args.caseId,
          documentId,
          documentType: args.payload.documentType,
        },
      });
    }

    const { inputCount } = await this.countCaseChildren(args.caseId);
    const nextSourceType = resolveSourceType({
      hasInputs: inputCount > 0,
      hasDocuments: true,
      fallback: parentCase.sourceType,
    });

    if (nextSourceType !== parentCase.sourceType) {
      await this.models.caseModel.update({
        where: { id: args.caseId },
        data: { sourceType: nextSourceType },
      });
    }

    return this.getCaseDetail(args.propertyId, args.caseId);
  }

  async parseCaseDocument(
    propertyId: string,
    caseId: string,
    caseDocumentId: string
  ): Promise<NegotiationShieldCaseDetailDTO> {
    const parentCase = await this.assertCaseBelongsToProperty(propertyId, caseId);
    const supportedScenario =
      parentCase.scenarioType === 'CONTRACTOR_QUOTE_REVIEW' ||
      parentCase.scenarioType === 'INSURANCE_PREMIUM_INCREASE' ||
      parentCase.scenarioType === 'INSURANCE_CLAIM_SETTLEMENT' ||
      parentCase.scenarioType === 'BUYER_INSPECTION_NEGOTIATION' ||
      parentCase.scenarioType === 'CONTRACTOR_URGENCY_PRESSURE';

    if (!supportedScenario) {
      throw new APIError(
        'This case scenario is not supported for document parsing.',
        400,
        'NEGOTIATION_SHIELD_UNSUPPORTED_SCENARIO'
      );
    }

    const caseDocument = await this.models.documentModel.findFirst({
      where: { id: caseDocumentId, caseId },
      include: {
        document: true,
      },
    });

    if (!caseDocument?.document) {
      throw new APIError(
        'Negotiation Shield document not found for this case.',
        404,
        'NEGOTIATION_SHIELD_CASE_DOCUMENT_NOT_FOUND'
      );
    }

    const parsed = await parseNegotiationShieldDocument({
      scenarioType: parentCase.scenarioType,
      source: {
        fileUrl: caseDocument.document.fileUrl,
        fileName: caseDocument.document.name,
        mimeType: caseDocument.document.mimeType ?? null,
        metadata: caseDocument.document.metadata,
      },
    });

    const candidateInputs = await this.models.inputModel.findMany({
      where: {
        caseId,
        inputType: parsed.inputType,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    const existingParsedInput =
      candidateInputs.find((input: any) => {
        const meta = getInputMeta(input.structuredData);
        return (
          meta.origin === PARSED_DOCUMENT_INPUT_ORIGIN &&
          meta.caseDocumentId === caseDocumentId
        );
      }) ?? null;

    const parsedAt = new Date().toISOString();
    const structuredData = {
      ...parsed.structuredData,
      _meta: {
        origin: PARSED_DOCUMENT_INPUT_ORIGIN,
        caseDocumentId,
        documentId: caseDocument.documentId,
        documentType: caseDocument.documentType,
        parserVersion: parsed.parserVersion,
        parsedAt,
        parsedFieldCount: parsed.parsedFieldCount,
        parseWarnings: parsed.warnings,
        fileName: caseDocument.document.name,
        mimeType: caseDocument.document.mimeType ?? null,
      },
    };

    if (existingParsedInput) {
      await this.models.inputModel.update({
        where: { id: existingParsedInput.id },
        data: {
          rawText: parsed.rawText,
          structuredData,
        },
      });
    } else {
      await this.models.inputModel.create({
        data: {
          caseId,
          inputType: parsed.inputType,
          rawText: parsed.rawText,
          structuredData,
        },
      });
    }

    return this.getCaseDetail(propertyId, caseId);
  }

  async trackEvent(propertyId: string, userId: string, input: NegotiationShieldEventInput) {
    await this.assertPropertyExists(propertyId);

    const eventName = String(input.event || 'UNKNOWN')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .slice(0, 80);
    const section = input.section ? String(input.section).slice(0, 80) : null;

    await prisma.auditLog.create({
      data: {
        userId,
        action: `NEGOTIATION_SHIELD_${eventName || 'UNKNOWN'}`,
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

  async analyzeContractorQuoteCase(
    propertyId: string,
    caseId: string,
    propertyContextVersion?: string | null,
  ): Promise<NegotiationShieldCaseDetailDTO> {
    const record = await this.models.caseModel.findFirst({
      where: { id: caseId, propertyId },
      include: {
        inputs: {
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        },
        documents: {
          include: { document: true },
          orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
        },
      },
    });

    if (!record) {
      throw new APIError('Negotiation Shield case not found.', 404, 'NEGOTIATION_SHIELD_CASE_NOT_FOUND');
    }

    if (record.scenarioType !== 'CONTRACTOR_QUOTE_REVIEW') {
      throw new APIError(
        'This case does not support contractor quote review analysis.',
        400,
        'NEGOTIATION_SHIELD_UNSUPPORTED_SCENARIO'
      );
    }

    const context = this.buildContractorQuoteContext(record);
    if (!context.hasMeaningfulInput) {
      throw new APIError(
        'Add manual quote details before running contractor quote analysis.',
        400,
        'NEGOTIATION_SHIELD_ANALYSIS_INPUT_REQUIRED'
      );
    }

    // Phase-3: parsing sanity checks before generating
    const sanityErrors: string[] = [];
    const ai = context.analysisInput;
    if (ai.quoteAmount !== null && (ai.quoteAmount < 0 || ai.quoteAmount > 10_000_000)) {
      sanityErrors.push(`Quote amount ${ai.quoteAmount} is outside plausible range (0–$10M).`);
    }
    if (ai.rawText && ai.rawText.length > 50_000) {
      sanityErrors.push('Raw text exceeds 50,000 character limit; truncate before analysis.');
    }
    if (sanityErrors.length > 0) {
      throw new APIError(
        `Input validation failed: ${sanityErrors.join(' ')}`,
        400,
        'NEGOTIATION_SHIELD_INPUT_SANITY_FAILED'
      );
    }

    // Phase-3: AI fallback pattern — rule-based engine is the current fallback for when
    // an AI engine is unavailable. Wrap in try/catch so future AI integration can be
    // added above this line with safe degradation.
    let result: NegotiationShieldGeneratedAnalysisResult;
    try {
      result = generateContractorQuoteAnalysis(context.analysisInput);
    } catch (analysisErr) {
      // Rule-based engine should not throw; if it does, surface a minimal degraded result
      throw new APIError(
        'Analysis engine encountered an unexpected error. Please try again.',
        500,
        'NEGOTIATION_SHIELD_ANALYSIS_ENGINE_ERROR'
      );
    }

    await this.persistAnalysisResult(caseId, 'CONTRACTOR_QUOTE_REVIEW', result, propertyContextVersion);
    return this.getCaseDetail(propertyId, caseId);
  }

  async analyzeInsurancePremiumIncreaseCase(
    propertyId: string,
    caseId: string,
    propertyContextVersion?: string | null,
  ): Promise<NegotiationShieldCaseDetailDTO> {
    const record = await this.models.caseModel.findFirst({
      where: { id: caseId, propertyId },
      include: {
        inputs: {
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        },
        documents: {
          include: { document: true },
          orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
        },
      },
    });

    if (!record) {
      throw new APIError('Negotiation Shield case not found.', 404, 'NEGOTIATION_SHIELD_CASE_NOT_FOUND');
    }

    if (record.scenarioType !== 'INSURANCE_PREMIUM_INCREASE') {
      throw new APIError(
        'This case does not support insurance premium increase analysis.',
        400,
        'NEGOTIATION_SHIELD_UNSUPPORTED_SCENARIO'
      );
    }

    const propertySignals = await this.getInsurancePropertySignals(propertyId);
    const context = this.buildInsurancePremiumIncreaseContext(record, propertySignals);
    if (!context.hasMeaningfulInput) {
      throw new APIError(
        'Add premium increase details before running insurance premium analysis.',
        400,
        'NEGOTIATION_SHIELD_ANALYSIS_INPUT_REQUIRED'
      );
    }

    const result: InsurancePremiumIncreaseAnalysisResult =
      generateInsurancePremiumIncreaseAnalysis(context.analysisInput);
    await this.persistAnalysisResult(caseId, 'INSURANCE_PREMIUM_INCREASE', result, propertyContextVersion);
    return this.getCaseDetail(propertyId, caseId);
  }

  async analyzeInsuranceClaimSettlementCase(
    propertyId: string,
    caseId: string,
    propertyContextVersion?: string | null,
  ): Promise<NegotiationShieldCaseDetailDTO> {
    const record = await this.models.caseModel.findFirst({
      where: { id: caseId, propertyId },
      include: {
        inputs: {
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        },
        documents: {
          include: { document: true },
          orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
        },
      },
    });

    if (!record) {
      throw new APIError('Negotiation Shield case not found.', 404, 'NEGOTIATION_SHIELD_CASE_NOT_FOUND');
    }

    if (record.scenarioType !== 'INSURANCE_CLAIM_SETTLEMENT') {
      throw new APIError(
        'This case does not support insurance claim settlement analysis.',
        400,
        'NEGOTIATION_SHIELD_UNSUPPORTED_SCENARIO'
      );
    }

    const propertySignals = await this.getInsurancePropertySignals(propertyId);
    const context = this.buildInsuranceClaimSettlementContext(record, propertySignals);
    if (!context.hasMeaningfulInput) {
      throw new APIError(
        'Add claim settlement details before running claim settlement analysis.',
        400,
        'NEGOTIATION_SHIELD_ANALYSIS_INPUT_REQUIRED'
      );
    }

    const result: InsuranceClaimSettlementAnalysisResult =
      generateInsuranceClaimSettlementAnalysis(context.analysisInput);
    await this.persistAnalysisResult(caseId, 'INSURANCE_CLAIM_SETTLEMENT', result, propertyContextVersion);
    return this.getCaseDetail(propertyId, caseId);
  }

  async analyzeBuyerInspectionNegotiationCase(
    propertyId: string,
    caseId: string,
    propertyContextVersion?: string | null,
  ): Promise<NegotiationShieldCaseDetailDTO> {
    const record = await this.models.caseModel.findFirst({
      where: { id: caseId, propertyId },
      include: {
        inputs: {
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        },
        documents: {
          include: { document: true },
          orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
        },
      },
    });

    if (!record) {
      throw new APIError('Negotiation Shield case not found.', 404, 'NEGOTIATION_SHIELD_CASE_NOT_FOUND');
    }

    if (record.scenarioType !== 'BUYER_INSPECTION_NEGOTIATION') {
      throw new APIError(
        'This case does not support buyer inspection analysis.',
        400,
        'NEGOTIATION_SHIELD_UNSUPPORTED_SCENARIO'
      );
    }

    const propertySignals = await this.getInsurancePropertySignals(propertyId);
    const context = this.buildBuyerInspectionNegotiationContext(record, propertySignals);
    if (!context.hasMeaningfulInput) {
      throw new APIError(
        'Add buyer inspection details before running buyer inspection analysis.',
        400,
        'NEGOTIATION_SHIELD_ANALYSIS_INPUT_REQUIRED'
      );
    }

    const result: BuyerInspectionNegotiationAnalysisResult =
      generateBuyerInspectionNegotiationAnalysis(context.analysisInput);
    await this.persistAnalysisResult(caseId, 'BUYER_INSPECTION_NEGOTIATION', result, propertyContextVersion);
    return this.getCaseDetail(propertyId, caseId);
  }

  async analyzeContractorUrgencyPressureCase(
    propertyId: string,
    caseId: string,
    propertyContextVersion?: string | null,
  ): Promise<NegotiationShieldCaseDetailDTO> {
    const record = await this.models.caseModel.findFirst({
      where: { id: caseId, propertyId },
      include: {
        inputs: {
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        },
        documents: {
          include: { document: true },
          orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
        },
      },
    });

    if (!record) {
      throw new APIError('Negotiation Shield case not found.', 404, 'NEGOTIATION_SHIELD_CASE_NOT_FOUND');
    }

    if (record.scenarioType !== 'CONTRACTOR_URGENCY_PRESSURE') {
      throw new APIError(
        'This case does not support contractor urgency pressure analysis.',
        400,
        'NEGOTIATION_SHIELD_UNSUPPORTED_SCENARIO'
      );
    }

    const context = this.buildContractorUrgencyPressureContext(record);
    if (!context.hasMeaningfulInput) {
      throw new APIError(
        'Add contractor recommendation details before running urgency pressure analysis.',
        400,
        'NEGOTIATION_SHIELD_ANALYSIS_INPUT_REQUIRED'
      );
    }

    const result: ContractorUrgencyPressureAnalysisResult =
      generateContractorUrgencyPressureAnalysis(context.analysisInput);
    await this.persistAnalysisResult(caseId, 'CONTRACTOR_URGENCY_PRESSURE', result, propertyContextVersion);
    return this.getCaseDetail(propertyId, caseId);
  }

  async analyzeCase(
    propertyId: string,
    caseId: string,
    propertyContextVersion?: string | null,
  ): Promise<NegotiationShieldCaseDetailDTO> {
    const record = await this.assertCaseBelongsToProperty(propertyId, caseId);

    if (record.scenarioType === 'CONTRACTOR_QUOTE_REVIEW') {
      return this.analyzeContractorQuoteCase(propertyId, caseId, propertyContextVersion);
    }

    if (record.scenarioType === 'INSURANCE_PREMIUM_INCREASE') {
      return this.analyzeInsurancePremiumIncreaseCase(propertyId, caseId, propertyContextVersion);
    }

    if (record.scenarioType === 'INSURANCE_CLAIM_SETTLEMENT') {
      return this.analyzeInsuranceClaimSettlementCase(propertyId, caseId, propertyContextVersion);
    }

    if (record.scenarioType === 'BUYER_INSPECTION_NEGOTIATION') {
      return this.analyzeBuyerInspectionNegotiationCase(propertyId, caseId, propertyContextVersion);
    }

    if (record.scenarioType === 'CONTRACTOR_URGENCY_PRESSURE') {
      return this.analyzeContractorUrgencyPressureCase(propertyId, caseId, propertyContextVersion);
    }

    throw new APIError(
      'This case scenario is not supported for analysis.',
      400,
      'NEGOTIATION_SHIELD_UNSUPPORTED_SCENARIO'
    );
  }
}
