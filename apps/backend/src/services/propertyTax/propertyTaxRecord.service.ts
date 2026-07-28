import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  canonicalStateForFields,
  reconcilePropertyTaxFields,
} from './propertyTaxReconciliation';
import type {
  HomeownerPropertyTaxRecordInput,
  PropertyTaxFieldObservation,
} from './propertyTaxRecord.types';

const PARCEL_FIELDS = ['parcelId'] as const;
const ASSESSMENT_FIELDS = [
  'stage',
  'valuationDate',
  'classification',
  'landValue',
  'improvementValue',
  'totalAssessedValue',
  'taxableValue',
  'assessmentRatio',
] as const;
const BILL_FIELDS = [
  'billNumber',
  'issueDate',
  'billAmount',
  'effectiveTaxRate',
  'dueDates',
] as const;

type FieldEvidenceRow = {
  id: string;
  fieldKey: string;
  valueJson: Prisma.JsonValue;
  sourceType: 'OFFICIAL_SOURCE' | 'DOCUMENT' | 'HOMEOWNER_REPORTED';
  confidence: 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERIFIED';
  reviewStatus: 'UNREVIEWED' | 'HOMEOWNER_CONFIRMED' | 'VERIFIED' | 'CONFLICTED' | 'SUPERSEDED' | 'REJECTED';
  observedAt: Date;
  effectiveAt: Date | null;
  sourceDocumentId: string | null;
  sourceDataSourceId: string | null;
  sourceExternalId: string | null;
  sourceUrl: string | null;
};

function toObservation(row: FieldEvidenceRow): PropertyTaxFieldObservation {
  return {
    id: row.id,
    fieldKey: row.fieldKey,
    value: row.valueJson,
    sourceType: row.sourceType,
    confidence: row.confidence,
    reviewStatus: row.reviewStatus,
    observedAt: row.observedAt.toISOString(),
    effectiveAt: row.effectiveAt?.toISOString() ?? null,
    sourceDocumentId: row.sourceDocumentId,
    sourceDataSourceId: row.sourceDataSourceId,
    sourceExternalId: row.sourceExternalId,
    sourceUrl: row.sourceUrl,
  };
}

function normalizedJurisdictionKey(property: {
  state: string;
  county: string | null;
  countyFips: string | null;
  city: string;
}): string {
  const parts = [
    'US',
    property.state.trim().toUpperCase(),
    property.countyFips?.trim() || property.county?.trim().toLowerCase() || 'unknown-county',
    property.city.trim().toLowerCase(),
  ];
  return parts.join(':');
}

function validDate(value: string | undefined, field: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} must be a valid date`);
  return parsed;
}

function validateMoney(value: number | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) {
    throw new Error(`${field} must be between 0 and 1,000,000,000`);
  }
  return value;
}

function validateRatio(value: number | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be between 0 and 1`);
  }
  return value;
}

function evidenceValue(value: unknown): Prisma.InputJsonValue {
  if (value instanceof Date) return value.toISOString();
  return value as Prisma.InputJsonValue;
}

function serializeRecord(record: {
  id: string;
  taxYear: number;
  sourceType: string;
  confidence: string;
  status: string;
  observedAt: Date;
  stage?: string;
  effectiveDate?: Date | null;
  radarProviderEventId?: string | null;
  sourceExternalId: string | null;
  sourceUrl: string | null;
  dataSource: { id: string; name: string } | null;
  documents: Array<{
    role: string;
    document: { id: string; name: string; verificationStatus: string };
  }>;
}) {
  return {
    id: record.id,
    taxYear: record.taxYear,
    sourceType: record.sourceType,
    confidence: record.confidence,
    status: record.status,
    observedAt: record.observedAt.toISOString(),
    stage: record.stage ?? null,
    effectiveDate: record.effectiveDate?.toISOString() ?? null,
    radarProviderEventId: record.radarProviderEventId ?? null,
    sourceExternalId: record.sourceExternalId,
    sourceUrl: record.sourceUrl,
    dataSource: record.dataSource,
    documents: record.documents.map((link) => ({
      role: link.role,
      ...link.document,
    })),
  };
}

export class PropertyTaxRecordService {
  async getCenter(propertyId: string, userId: string) {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId },
      },
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        taxParcelMatches: {
          where: { status: { notIn: ['REJECTED'] } },
          orderBy: [{ homeownerConfirmedAt: 'desc' }, { updatedAt: 'desc' }],
          include: { fieldEvidence: true, jurisdiction: true, dataSource: true },
        },
        taxAssessmentRecords: {
          where: { status: { in: ['ACTIVE', 'CONFLICTED'] } },
          orderBy: [{ taxYear: 'desc' }, { observedAt: 'desc' }],
          include: {
            fieldEvidence: true,
            dataSource: { select: { id: true, name: true } },
            documents: {
              include: {
                document: { select: { id: true, name: true, verificationStatus: true } },
              },
            },
          },
        },
        taxBillRecords: {
          where: { status: { in: ['ACTIVE', 'CONFLICTED'] } },
          orderBy: [{ taxYear: 'desc' }, { observedAt: 'desc' }],
          include: {
            fieldEvidence: true,
            dataSource: { select: { id: true, name: true } },
            documents: {
              include: {
                document: { select: { id: true, name: true, verificationStatus: true } },
              },
            },
          },
        },
      },
    });

    if (!property) throw new Error('Property not found');

    const latestTaxYear = Math.max(
      0,
      ...property.taxAssessmentRecords.map((record) => record.taxYear),
      ...property.taxBillRecords.map((record) => record.taxYear),
    ) || null;

    const assessmentRecords = latestTaxYear === null
      ? []
      : property.taxAssessmentRecords.filter((record) => record.taxYear === latestTaxYear);
    const billRecords = latestTaxYear === null
      ? []
      : property.taxBillRecords.filter((record) => record.taxYear === latestTaxYear);

    const parcelObservations = property.taxParcelMatches
      .flatMap((match) => match.fieldEvidence)
      .map(toObservation);
    const assessmentObservations = assessmentRecords
      .flatMap((record) => record.fieldEvidence)
      .map(toObservation);
    const billObservations = billRecords
      .flatMap((record) => record.fieldEvidence)
      .map(toObservation);

    const parcelFields = reconcilePropertyTaxFields(PARCEL_FIELDS, parcelObservations);
    const assessmentFields = reconcilePropertyTaxFields(ASSESSMENT_FIELDS, assessmentObservations);
    const billFields = reconcilePropertyTaxFields(BILL_FIELDS, billObservations);
    const allFields = { ...parcelFields, ...assessmentFields, ...billFields };
    const conflicts = Object.values(allFields)
      .filter((field) => field.state === 'CONFLICTED')
      .map((field) => ({
        fieldKey: field.fieldKey,
        observations: field.observations,
      }));

    const primaryParcelMatch = property.taxParcelMatches[0] ?? null;

    return {
      property: {
        id: property.id,
        addressLabel: `${property.address}, ${property.city} ${property.state} ${property.zipCode}`,
      },
      state: canonicalStateForFields(allFields),
      latestTaxYear,
      parcel: {
        matchStatus: primaryParcelMatch?.status ?? 'UNMATCHED',
        matchMethod: primaryParcelMatch?.matchMethod ?? null,
        confidence: primaryParcelMatch?.confidence?.toNumber() ?? null,
        jurisdiction: primaryParcelMatch?.jurisdiction
          ? {
              id: primaryParcelMatch.jurisdiction.id,
              normalizedKey: primaryParcelMatch.jurisdiction.normalizedKey,
              stateCode: primaryParcelMatch.jurisdiction.stateCode,
              countyName: primaryParcelMatch.jurisdiction.countyName,
              municipality: primaryParcelMatch.jurisdiction.municipality,
              status: primaryParcelMatch.jurisdiction.status,
            }
          : null,
        fields: parcelFields,
      },
      assessment: {
        fields: assessmentFields,
        sourceRecords: assessmentRecords.map(serializeRecord),
      },
      bill: {
        fields: billFields,
        sourceRecords: billRecords.map(serializeRecord),
      },
      conflicts,
      provenanceComplete: Object.values(allFields)
        .filter((field) => field.state === 'KNOWN')
        .every((field) => field.observations.length > 0),
    };
  }

  async recordHomeownerValues(
    propertyId: string,
    userId: string,
    rawInput: HomeownerPropertyTaxRecordInput,
  ) {
    const nowYear = new Date().getFullYear();
    if (!Number.isInteger(rawInput.taxYear) || rawInput.taxYear < 1900 || rawInput.taxYear > nowYear + 2) {
      throw new Error(`taxYear must be between 1900 and ${nowYear + 2}`);
    }

    const input = {
      ...rawInput,
      parcelId: rawInput.parcelId?.trim() || undefined,
      classification: rawInput.classification?.trim() || undefined,
      billNumber: rawInput.billNumber?.trim() || undefined,
      valuationDate: validDate(rawInput.valuationDate, 'valuationDate'),
      issueDate: validDate(rawInput.issueDate, 'issueDate'),
      dueDates: rawInput.dueDates?.map((date) => validDate(date, 'dueDates')!),
      landValue: validateMoney(rawInput.landValue, 'landValue'),
      improvementValue: validateMoney(rawInput.improvementValue, 'improvementValue'),
      totalAssessedValue: validateMoney(rawInput.totalAssessedValue, 'totalAssessedValue'),
      taxableValue: validateMoney(rawInput.taxableValue, 'taxableValue'),
      billAmount: validateMoney(rawInput.billAmount, 'billAmount'),
      assessmentRatio: validateRatio(rawInput.assessmentRatio, 'assessmentRatio'),
      effectiveTaxRate: validateRatio(rawInput.effectiveTaxRate, 'effectiveTaxRate'),
    };

    const hasAssessment = [
      input.stage,
      input.valuationDate,
      input.classification,
      input.landValue,
      input.improvementValue,
      input.totalAssessedValue,
      input.taxableValue,
      input.assessmentRatio,
    ].some((value) => value !== undefined);
    const hasBill = [
      input.billAmount,
      input.effectiveTaxRate,
      input.billNumber,
      input.issueDate,
      input.dueDates?.length ? input.dueDates : undefined,
    ].some((value) => value !== undefined);

    if (!input.parcelId && !hasAssessment && !hasBill) {
      throw new Error('At least one parcel, assessment, or bill value is required');
    }

    const property = await prisma.property.findFirst({
      where: { id: propertyId, homeownerProfile: { userId } },
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        county: true,
        countyFips: true,
      },
    });
    if (!property) throw new Error('Property not found');

    await prisma.$transaction(async (tx) => {
      const jurisdiction = await tx.propertyTaxJurisdiction.upsert({
        where: { normalizedKey: normalizedJurisdictionKey(property) },
        create: {
          normalizedKey: normalizedJurisdictionKey(property),
          countryCode: 'US',
          stateCode: property.state.trim().toUpperCase(),
          countyName: property.county,
          countyFips: property.countyFips,
          municipality: property.city,
        },
        update: {
          countyName: property.county,
          countyFips: property.countyFips,
          municipality: property.city,
        },
      });

      let parcelMatchId: string | undefined;
      if (input.parcelId) {
        const parcelMatch = await tx.propertyTaxParcelMatch.upsert({
          where: {
            propertyId_jurisdictionId_parcelId: {
              propertyId,
              jurisdictionId: jurisdiction.id,
              parcelId: input.parcelId,
            },
          },
          create: {
            propertyId,
            jurisdictionId: jurisdiction.id,
            parcelId: input.parcelId,
            situsAddress: property.address,
            situsCity: property.city,
            situsState: property.state,
            situsPostalCode: property.zipCode,
            matchMethod: 'HOMEOWNER_REPORTED',
            status: 'HOMEOWNER_CONFIRMED',
            confidence: 0.7,
            matchedAt: new Date(),
            homeownerConfirmedAt: new Date(),
            homeownerConfirmedByUserId: userId,
          },
          update: {
            status: 'HOMEOWNER_CONFIRMED',
            homeownerConfirmedAt: new Date(),
            homeownerConfirmedByUserId: userId,
          },
        });
        parcelMatchId = parcelMatch.id;
        await tx.propertyTaxFieldEvidence.create({
          data: {
            parcelMatchId,
            fieldKey: 'parcelId',
            valueJson: input.parcelId,
            sourceType: 'HOMEOWNER_REPORTED',
            confidence: 'MEDIUM',
            reviewStatus: 'HOMEOWNER_CONFIRMED',
            confirmedAt: new Date(),
            confirmedByUserId: userId,
          },
        });
      }

      let assessmentRecordId: string | undefined;
      if (hasAssessment) {
        const assessment = await tx.propertyTaxAssessmentRecord.create({
          data: {
            propertyId,
            jurisdictionId: jurisdiction.id,
            parcelMatchId,
            taxYear: input.taxYear,
            stage: input.stage ?? 'UNKNOWN',
            sourceType: 'HOMEOWNER_REPORTED',
            confidence: 'MEDIUM',
            valuationDate: input.valuationDate,
            classification: input.classification,
            landValue: input.landValue,
            improvementValue: input.improvementValue,
            totalAssessedValue: input.totalAssessedValue,
            taxableValue: input.taxableValue,
            assessmentRatio: input.assessmentRatio,
          },
        });
        assessmentRecordId = assessment.id;

        await tx.propertyTaxAssessmentRecord.updateMany({
          where: {
            propertyId,
            taxYear: input.taxYear,
            sourceType: 'HOMEOWNER_REPORTED',
            status: 'ACTIVE',
            id: { not: assessment.id },
          },
          data: { status: 'SUPERSEDED', supersededById: assessment.id },
        });

        const assessmentValues: Array<[string, unknown]> = [
          ['stage', input.stage],
          ['valuationDate', input.valuationDate],
          ['classification', input.classification],
          ['landValue', input.landValue],
          ['improvementValue', input.improvementValue],
          ['totalAssessedValue', input.totalAssessedValue],
          ['taxableValue', input.taxableValue],
          ['assessmentRatio', input.assessmentRatio],
        ];
        for (const [fieldKey, value] of assessmentValues) {
          if (value === undefined) continue;
          await tx.propertyTaxFieldEvidence.create({
            data: {
              assessmentRecordId: assessment.id,
              fieldKey,
              valueJson: evidenceValue(value),
              sourceType: 'HOMEOWNER_REPORTED',
              confidence: 'MEDIUM',
              reviewStatus: 'HOMEOWNER_CONFIRMED',
              confirmedAt: new Date(),
              confirmedByUserId: userId,
            },
          });
        }
      }

      if (hasBill) {
        const bill = await tx.propertyTaxBillRecord.create({
          data: {
            propertyId,
            jurisdictionId: jurisdiction.id,
            parcelMatchId,
            assessmentRecordId,
            taxYear: input.taxYear,
            sourceType: 'HOMEOWNER_REPORTED',
            confidence: 'MEDIUM',
            billNumber: input.billNumber,
            issueDate: input.issueDate,
            billAmount: input.billAmount,
            effectiveTaxRate: input.effectiveTaxRate,
            dueDatesJson: input.dueDates?.map((date) => date.toISOString()),
          },
        });

        await tx.propertyTaxBillRecord.updateMany({
          where: {
            propertyId,
            taxYear: input.taxYear,
            sourceType: 'HOMEOWNER_REPORTED',
            status: 'ACTIVE',
            id: { not: bill.id },
          },
          data: { status: 'SUPERSEDED', supersededById: bill.id },
        });

        const billValues: Array<[string, unknown]> = [
          ['billNumber', input.billNumber],
          ['issueDate', input.issueDate],
          ['billAmount', input.billAmount],
          ['effectiveTaxRate', input.effectiveTaxRate],
          ['dueDates', input.dueDates],
        ];
        for (const [fieldKey, value] of billValues) {
          if (value === undefined) continue;
          await tx.propertyTaxFieldEvidence.create({
            data: {
              billRecordId: bill.id,
              fieldKey,
              valueJson: evidenceValue(value instanceof Array
                ? value.map((item) => item instanceof Date ? item.toISOString() : item)
                : value),
              sourceType: 'HOMEOWNER_REPORTED',
              confidence: 'MEDIUM',
              reviewStatus: 'HOMEOWNER_CONFIRMED',
              confirmedAt: new Date(),
              confirmedByUserId: userId,
            },
          });
        }
      }
    });

    return this.getCenter(propertyId, userId);
  }
}

export const propertyTaxRecordService = new PropertyTaxRecordService();
