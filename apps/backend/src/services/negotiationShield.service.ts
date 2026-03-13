import { DocumentType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  AttachNegotiationShieldDocumentPayload,
  ContractorQuoteAnalysisResult,
  CreateNegotiationShieldCaseInput,
  NegotiationShieldAnalysisDTO,
  NegotiationShieldCaseDetailDTO,
  NegotiationShieldCaseSummaryDTO,
  NegotiationShieldDocumentDTO,
  NegotiationShieldDraftDTO,
  NegotiationShieldInputDTO,
  NegotiationShieldSourceType,
  SaveNegotiationShieldInputPayload,
} from './negotiationShield.types';
import { generateContractorQuoteAnalysis } from './negotiationShieldContractorQuote.service';

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

export class NegotiationShieldService {
  private get models() {
    const db = prisma as any;
    const caseModel = db.negotiationShieldCase;
    const inputModel = db.negotiationShieldInput;
    const documentModel = db.negotiationShieldDocument;
    const analysisModel = db.negotiationShieldAnalysis;
    const draftModel = db.negotiationShieldDraft;

    if (!caseModel || !inputModel || !documentModel || !analysisModel || !draftModel) {
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
      analysisVersion: record.analysisVersion ?? null,
      latestAnalysisAt: asIsoString(record.latestAnalysisAt),
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

  private buildContractorQuoteContext(record: any) {
    const allInputs = asArray<any>(record.inputs);
    const contractorInputs =
      allInputs.filter((input) => input.inputType === 'CONTRACTOR_QUOTE');
    const relevantInputs = contractorInputs.length > 0 ? contractorInputs : allInputs;
    const orderedInputs = [...relevantInputs].sort(
      (a, b) =>
        new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    );

    const mergedStructuredData = orderedInputs.reduce<Record<string, unknown>>((acc, input) => {
      return { ...acc, ...asObject(input.structuredData) };
    }, {});

    const latestRawText =
      orderedInputs
        .map((input) => asTrimmedString(input.rawText))
        .find((value) => !!value) ?? null;

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

  private async persistContractorQuoteAnalysis(
    caseId: string,
    result: ContractorQuoteAnalysisResult
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
          scenarioType: 'CONTRACTOR_QUOTE_REVIEW',
          summary: result.summary,
          findings: result.findings,
          negotiationLeverage: result.negotiationLeverage,
          recommendedActions: result.recommendedActions,
          pricingAssessment: result.pricingAssessment,
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
    };
  }

  async createCase(
    propertyId: string,
    createdByUserId: string,
    input: CreateNegotiationShieldCaseInput
  ): Promise<NegotiationShieldCaseDetailDTO> {
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

    return this.getCaseDetail(propertyId, created.id);
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
      existingInput = await this.models.inputModel.findFirst({
        where: {
          caseId,
          inputType: payload.inputType,
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      });
    }

    if (existingInput) {
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

  async analyzeContractorQuoteCase(
    propertyId: string,
    caseId: string
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

    const result = generateContractorQuoteAnalysis(context.analysisInput);
    await this.persistContractorQuoteAnalysis(caseId, result);
    return this.getCaseDetail(propertyId, caseId);
  }
}
