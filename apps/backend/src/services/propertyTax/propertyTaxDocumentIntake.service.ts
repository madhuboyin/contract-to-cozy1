import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  deleteDocumentObject,
  uploadDocumentBuffer,
} from '../storage/reportStorage';
import { propertyTaxFieldsToExtractionEnvelope } from './propertyTaxExtractionEnvelope.adapter';
import { emitPropertyChangeWithTransaction } from '../../propertyChanges/propertyChange.service';

export const PROPERTY_TAX_PRIVACY_CONSENT_VERSION = 'property-tax-vault-v1';

const ASSESSMENT_FIELDS = new Set([
  'stage',
  'valuationDate',
  'classification',
  'landValue',
  'improvementValue',
  'totalAssessedValue',
  'taxableValue',
  'assessmentRatio',
  'exemptions',
]);
const BILL_FIELDS = new Set([
  'billNumber',
  'issueDate',
  'billAmount',
  'effectiveTaxRate',
  'dueDates',
]);
const ALL_FIELDS = new Set([
  'parcelId',
  'taxYear',
  ...ASSESSMENT_FIELDS,
  ...BILL_FIELDS,
]);

type StagedField = {
  fieldKey: string;
  value: unknown;
  confidence?: number;
  pageNumber?: number;
  boundingBox?: unknown;
  sourceText?: string;
};

type FieldDecision = {
  fieldKey: string;
  status: 'CONFIRMED' | 'CORRECTED' | 'REJECTED';
  correctedValue?: unknown;
};

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function normalizedJurisdictionKey(property: {
  state: string;
  countyFips: string | null;
  city: string;
}) {
  return [
    'US',
    property.state.trim().toUpperCase(),
    property.countyFips?.trim() || 'unknown-county',
    property.city.trim().toLowerCase(),
  ].join(':');
}

function finiteNumber(value: unknown, fieldKey: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000_000) {
    throw new Error(`${fieldKey} is invalid`);
  }
  return parsed;
}

function ratio(value: unknown, fieldKey: string): number | undefined {
  const parsed = finiteNumber(value, fieldKey);
  if (parsed !== undefined && parsed > 1) throw new Error(`${fieldKey} must be between 0 and 1`);
  return parsed;
}

function date(value: unknown, fieldKey: string): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error(`${fieldKey} must be a date`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${fieldKey} must be a valid date`);
  return parsed;
}

function text(value: unknown, max = 200): string | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  if (!normalized) return undefined;
  if (normalized.length > max) throw new Error(`Value exceeds ${max} characters`);
  return normalized;
}

function sourceTextHash(value?: string): string | undefined {
  return value
    ? createHash('sha256').update(value).digest('hex')
    : undefined;
}

function assessmentStage(value: unknown):
  | 'UNKNOWN'
  | 'PRELIMINARY'
  | 'TENTATIVE'
  | 'CURRENT_ROLL'
  | 'FINAL'
  | 'CORRECTED'
  | undefined {
  const normalized = text(value)?.toUpperCase();
  if (!normalized) return undefined;
  if (![
    'UNKNOWN',
    'PRELIMINARY',
    'TENTATIVE',
    'CURRENT_ROLL',
    'FINAL',
    'CORRECTED',
  ].includes(normalized)) {
    throw new Error('stage is invalid');
  }
  return normalized as ReturnType<typeof assessmentStage>;
}

function dueDates(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 12) {
    throw new Error('dueDates must be an array of at most 12 dates');
  }
  return value.map((item) => {
    const parsed = date(item, 'dueDates');
    if (!parsed) throw new Error('dueDates contains an invalid date');
    return parsed.toISOString();
  });
}

export class PropertyTaxDocumentIntakeService {
  constructor(
    private readonly db = prisma,
    private readonly upload = uploadDocumentBuffer,
    private readonly removeUpload = deleteDocumentObject,
    private readonly emitChange = emitPropertyChangeWithTransaction,
  ) {}

  async createVaultIntake(input: {
    propertyId: string;
    userId: string;
    kind: 'ASSESSMENT_NOTICE' | 'TAX_BILL' | 'EXEMPTION_NOTICE' | 'CORRECTION_NOTICE' | 'OTHER';
    privacyConsent: boolean;
    file: Express.Multer.File;
  }) {
    if (!input.privacyConsent) {
      throw new Error('Privacy consent is required before storing a tax document');
    }
    const property = await this.db.property.findFirst({
      where: {
        id: input.propertyId,
        homeownerProfile: { userId: input.userId },
      },
      select: {
        id: true,
        homeownerProfileId: true,
      },
    });
    if (!property) throw new Error('Property not found');

    const uploaded = await this.upload({
      buffer: input.file.buffer,
      fileName: input.file.originalname,
      mimeType: input.file.mimetype,
      userId: property.homeownerProfileId,
      propertyId: property.id,
    });
    try {
      return await this.db.$transaction(async (tx) => {
        const document = await tx.document.create({
          data: {
            uploadedBy: property.homeownerProfileId,
            propertyId: property.id,
            type: 'OTHER',
            name: input.file.originalname,
            description: `Property tax ${input.kind.toLowerCase().replace(/_/g, ' ')}`,
            fileUrl: uploaded.key,
            fileSize: input.file.size,
            mimeType: input.file.mimetype,
            sha256: createHash('sha256').update(input.file.buffer).digest('hex'),
            verificationStatus: 'PENDING',
            metadata: {
              category: 'PROPERTY_TAX',
              kind: input.kind,
              storageMode: 'VAULT',
              privacyConsentVersion: PROPERTY_TAX_PRIVACY_CONSENT_VERSION,
            },
          },
        });
        return tx.propertyTaxDocumentIntake.create({
          data: {
            propertyId: property.id,
            documentId: document.id,
            kind: input.kind,
            status: 'UPLOADED',
            storageMode: 'VAULT',
            extractionMethod: 'MANUAL',
            privacyConsentVersion: PROPERTY_TAX_PRIVACY_CONSENT_VERSION,
            privacyConsentedAt: new Date(),
          },
          include: { document: true, fields: true },
        });
      });
    } catch (error) {
      await this.removeUpload(uploaded.key).catch(() => undefined);
      throw error;
    }
  }

  async list(propertyId: string, userId: string) {
    const owned = await this.db.property.findFirst({
      where: { id: propertyId, homeownerProfile: { userId } },
      select: { id: true },
    });
    if (!owned) throw new Error('Property not found');
    return this.db.propertyTaxDocumentIntake.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      include: {
        document: {
          select: {
            id: true,
            name: true,
            mimeType: true,
            fileSize: true,
            verificationStatus: true,
            createdAt: true,
          },
        },
        fields: { orderBy: { fieldKey: 'asc' } },
      },
    });
  }

  async stageManualFields(
    intakeId: string,
    propertyId: string,
    userId: string,
    fields: StagedField[],
    now = new Date(),
  ) {
    if (fields.length === 0) throw new Error('At least one field is required');
    const intake = await this.db.propertyTaxDocumentIntake.findFirst({
      where: {
        id: intakeId,
        propertyId,
        property: { homeownerProfile: { userId } },
      },
      select: { id: true, status: true, documentId: true },
    });
    if (!intake) throw new Error('Tax document intake not found');
    if (intake.status === 'CONFIRMED' || intake.status === 'REJECTED') {
      throw new Error('Confirmed or rejected intake cannot be restaged');
    }

    const extractionEnvelope = propertyTaxFieldsToExtractionEnvelope({
      documentId: intake.documentId,
      fields,
      method: 'MANUAL',
      extractedAt: now,
    });
    const updated = await this.db.$transaction(async (tx) => {
      for (const field of fields) {
        if (!ALL_FIELDS.has(field.fieldKey)) {
          throw new Error(`Unsupported property tax field: ${field.fieldKey}`);
        }
        const confidence = field.confidence ?? 1;
        if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
          throw new Error(`Invalid confidence for ${field.fieldKey}`);
        }
        await tx.propertyTaxExtractedField.upsert({
          where: {
            intakeId_fieldKey: {
              intakeId,
              fieldKey: field.fieldKey,
            },
          },
          create: {
            intakeId,
            fieldKey: field.fieldKey,
            proposedValueJson: inputJson(field.value),
            confidence,
            status: 'PROPOSED',
            pageNumber: field.pageNumber,
            boundingBoxJson: field.boundingBox === undefined
              ? undefined
              : inputJson(field.boundingBox),
            sourceText: field.sourceText,
            sourceTextHash: sourceTextHash(field.sourceText),
          },
          update: {
            proposedValueJson: inputJson(field.value),
            confidence,
            status: 'PROPOSED',
            correctedValueJson: Prisma.JsonNull,
            pageNumber: field.pageNumber,
            boundingBoxJson: field.boundingBox === undefined
              ? undefined
              : inputJson(field.boundingBox),
            sourceText: field.sourceText,
            sourceTextHash: sourceTextHash(field.sourceText),
          },
        });
      }
      return tx.propertyTaxDocumentIntake.update({
        where: { id: intakeId },
        data: {
          status: 'NEEDS_REVIEW',
          extractionMethod: 'MANUAL',
          extractionProvider: null,
          extractionModel: null,
          extractionStartedAt: now,
          extractionCompletedAt: now,
          extractionError: null,
        },
        include: { document: true, fields: { orderBy: { fieldKey: 'asc' } } },
      });
    });
    return { ...updated, extractionEnvelope };
  }

  async confirm(
    intakeId: string,
    propertyId: string,
    userId: string,
    decisions: FieldDecision[],
    now = new Date(),
  ) {
    return this.db.$transaction(async (tx) => {
      const intake = await tx.propertyTaxDocumentIntake.findFirst({
        where: {
          id: intakeId,
          propertyId,
          property: { homeownerProfile: { userId } },
        },
        include: {
          document: true,
          fields: true,
          confirmedAssessmentRecord: true,
          confirmedBillRecord: true,
        },
      });
      if (!intake) throw new Error('Tax document intake not found');
      if (intake.status === 'CONFIRMED') return intake;
      if (intake.fields.length === 0) throw new Error('No staged fields are available to confirm');

      const byField = new Map(decisions.map((decision) => [
        decision.fieldKey,
        decision,
      ]));
      const values = new Map<string, unknown>();
      for (const field of intake.fields) {
        const decision = byField.get(field.fieldKey);
        if (!decision) throw new Error(`A decision is required for ${field.fieldKey}`);
        if (decision.status === 'CORRECTED' && decision.correctedValue === undefined) {
          throw new Error(`A corrected value is required for ${field.fieldKey}`);
        }
        if (decision.status !== 'REJECTED') {
          values.set(
            field.fieldKey,
            decision.status === 'CORRECTED'
              ? decision.correctedValue
              : field.proposedValueJson,
          );
        }
        await tx.propertyTaxExtractedField.update({
          where: { id: field.id },
          data: {
            status: decision.status,
            correctedValueJson: decision.status === 'CORRECTED'
              ? inputJson(decision.correctedValue)
              : undefined,
            confirmedAt: now,
            confirmedByUserId: userId,
          },
        });
      }

      const taxYear = Number(values.get('taxYear'));
      if (!Number.isInteger(taxYear) || taxYear < 1900 || taxYear > now.getFullYear() + 2) {
        throw new Error('A valid taxYear must be confirmed');
      }
      const property = await tx.property.findUniqueOrThrow({
        where: { id: propertyId },
        select: {
          id: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          county: true,
          countyFips: true,
          taxAssessmentRecords: {
            where: { sourceType: 'OFFICIAL_SOURCE' },
            orderBy: { observedAt: 'desc' },
            take: 1,
            select: { jurisdictionId: true },
          },
        },
      });
      const existingJurisdictionId =
        property.taxAssessmentRecords[0]?.jurisdictionId;
      const jurisdiction = existingJurisdictionId
        ? await tx.propertyTaxJurisdiction.findUniqueOrThrow({
            where: { id: existingJurisdictionId },
          })
        : await tx.propertyTaxJurisdiction.upsert({
            where: {
              normalizedKey: normalizedJurisdictionKey(property),
            },
            create: {
              normalizedKey: normalizedJurisdictionKey(property),
              countryCode: 'US',
              stateCode: property.state.trim().toUpperCase(),
              countyName: property.county,
              countyFips: property.countyFips,
              municipality: property.city,
            },
            update: {},
          });

      let parcelMatchId: string | undefined;
      const parcelId = text(values.get('parcelId'), 120);
      if (parcelId) {
        const existing = await tx.propertyTaxParcelMatch.findFirst({
          where: {
            propertyId,
            jurisdictionId: jurisdiction.id,
            parcelId,
          },
        });
        const parcel = existing
          ?? await tx.propertyTaxParcelMatch.create({
            data: {
              ingestKey: `document-parcel:${intake.id}`,
              propertyId,
              jurisdictionId: jurisdiction.id,
              parcelId,
              situsAddress: property.address,
              situsCity: property.city,
              situsState: property.state,
              situsPostalCode: property.zipCode,
              matchMethod: 'DOCUMENT',
              status: 'HOMEOWNER_CONFIRMED',
              confidence: 0.9,
              matchedAt: now,
              homeownerConfirmedAt: now,
              homeownerConfirmedByUserId: userId,
            },
          });
        parcelMatchId = parcel.id;
      }

      const hasAssessment = [...values.keys()].some((key) =>
        ASSESSMENT_FIELDS.has(key));
      const hasBill = [...values.keys()].some((key) => BILL_FIELDS.has(key));
      if (!parcelId && !hasAssessment && !hasBill) {
        throw new Error('Confirm at least one parcel, assessment, or bill field');
      }
      let assessmentRecordId: string | undefined;
      let billRecordId: string | undefined;

      if (hasAssessment) {
        const assessment = await tx.propertyTaxAssessmentRecord.create({
          data: {
            propertyId,
            jurisdictionId: jurisdiction.id,
            parcelMatchId,
            taxYear,
            stage: assessmentStage(values.get('stage')),
            sourceType: 'DOCUMENT',
            confidence: 'HIGH',
            valuationDate: date(values.get('valuationDate'), 'valuationDate'),
            classification: text(values.get('classification')),
            landValue: finiteNumber(values.get('landValue'), 'landValue'),
            improvementValue: finiteNumber(values.get('improvementValue'), 'improvementValue'),
            totalAssessedValue: finiteNumber(values.get('totalAssessedValue'), 'totalAssessedValue'),
            taxableValue: finiteNumber(values.get('taxableValue'), 'taxableValue'),
            assessmentRatio: ratio(values.get('assessmentRatio'), 'assessmentRatio'),
            exemptionsJson: values.has('exemptions')
              ? inputJson(values.get('exemptions'))
              : undefined,
            observedAt: now,
            rawDataJson: { intakeId: intake.id },
          },
        });
        assessmentRecordId = assessment.id;
        await tx.propertyTaxAssessmentDocument.create({
          data: {
            assessmentRecordId: assessment.id,
            documentId: intake.documentId,
            role: intake.kind === 'CORRECTION_NOTICE'
              ? 'CORRECTION_NOTICE'
              : intake.kind === 'EXEMPTION_NOTICE'
                ? 'EXEMPTION_NOTICE'
                : 'ASSESSMENT_NOTICE',
          },
        });
      }

      if (hasBill) {
        const bill = await tx.propertyTaxBillRecord.create({
          data: {
            propertyId,
            jurisdictionId: jurisdiction.id,
            parcelMatchId,
            assessmentRecordId,
            taxYear,
            sourceType: 'DOCUMENT',
            confidence: 'HIGH',
            billNumber: text(values.get('billNumber')),
            issueDate: date(values.get('issueDate'), 'issueDate'),
            billAmount: finiteNumber(values.get('billAmount'), 'billAmount'),
            effectiveTaxRate: ratio(values.get('effectiveTaxRate'), 'effectiveTaxRate'),
            dueDatesJson: dueDates(values.get('dueDates')),
            observedAt: now,
            rawDataJson: { intakeId: intake.id },
          },
        });
        billRecordId = bill.id;
        await tx.propertyTaxBillDocument.create({
          data: {
            billRecordId: bill.id,
            documentId: intake.documentId,
            role: 'TAX_BILL',
          },
        });
      }

      for (const [fieldKey, value] of values) {
        if (fieldKey === 'taxYear') continue;
        const parent = fieldKey === 'parcelId'
          ? { parcelMatchId, assessmentRecordId: undefined, billRecordId: undefined }
          : ASSESSMENT_FIELDS.has(fieldKey)
            ? { parcelMatchId: undefined, assessmentRecordId, billRecordId: undefined }
            : { parcelMatchId: undefined, assessmentRecordId: undefined, billRecordId };
        if (!parent.parcelMatchId && !parent.assessmentRecordId && !parent.billRecordId) continue;
        await tx.propertyTaxFieldEvidence.create({
          data: {
            ...parent,
            fieldKey,
            valueJson: inputJson(value),
            sourceType: 'DOCUMENT',
            confidence: 'HIGH',
            reviewStatus: 'HOMEOWNER_CONFIRMED',
            sourceDocumentId: intake.documentId,
            observedAt: now,
            confirmedAt: now,
            confirmedByUserId: userId,
          },
        });
      }

      await tx.document.update({
        where: { id: intake.documentId },
        data: {
          verificationStatus: 'VERIFIED',
          verifiedAt: now,
          verifiedByUserId: userId,
          parserVersion: 'property-tax-manual-v1',
        },
      });
      await this.emitChange(tx, {
        propertyId,
        sourceType: 'DOCUMENT',
        sourceEntityId: intake.documentId,
        sourceRevision: `confirmed:${intake.id}:${now.toISOString()}`,
        changeType: 'DOCUMENT_PROMOTED',
        changedFactKeys: [
          ...(assessmentRecordId ? ['financial.propertyTaxAssessment'] : []),
          ...(billRecordId ? ['financial.propertyTaxBill'] : []),
        ],
        canonicalReferences: [
          ...(assessmentRecordId ? [{ entityType: 'PROPERTY_TAX_ASSESSMENT_RECORD', entityId: assessmentRecordId }] : []),
          ...(billRecordId ? [{ entityType: 'PROPERTY_TAX_BILL_RECORD', entityId: billRecordId }] : []),
        ],
        occurredAt: now,
        detectedAt: now,
        confidence: 1,
        sourceHealth: 'CURRENT',
        signals: { homeownerRelevant: true, lifecycleAdvanced: true, propertyEffectConfirmed: true, urgentSafetyCondition: false, canonicalActionPriority: null },
      });
      return tx.propertyTaxDocumentIntake.update({
        where: { id: intake.id },
        data: {
          status: 'CONFIRMED',
          confirmedAssessmentRecordId: assessmentRecordId,
          confirmedBillRecordId: billRecordId,
          confirmedAt: now,
          confirmedByUserId: userId,
        },
        include: { document: true, fields: true },
      });
    });
  }
}

export const propertyTaxDocumentIntakeService =
  new PropertyTaxDocumentIntakeService();
