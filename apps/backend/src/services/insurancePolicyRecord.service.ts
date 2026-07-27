import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';

export type PolicyFactValue =
  | { valueType: 'AMOUNT'; amountValue: number; currency?: string }
  | { valueType: 'TEXT'; textValue: string }
  | { valueType: 'BOOLEAN'; booleanValue: boolean }
  | { valueType: 'JSON'; jsonValue: Prisma.InputJsonValue };

export interface ExtractedPolicyTermInput {
  homeownerProfileId: string;
  userId?: string;
  propertyId: string;
  documentId: string;
  carrierName: string;
  policyNumber: string;
  coverageType?: string;
  premiumAmount?: number;
  deductibleAmount?: number;
  coverageLimits?: string;
  termStart?: Date;
  termEnd?: Date;
  confidence?: number;
  sourcePage?: number;
  sourceText?: string;
}

const excerptHash = (text?: string) =>
  text ? createHash('sha256').update(text).digest('hex') : undefined;

function extractedFacts(input: ExtractedPolicyTermInput) {
  const common = {
    sourceDocumentId: input.documentId,
    sourcePage: input.sourcePage,
    sourceExcerptHash: excerptHash(input.sourceText),
    extractionMethod: 'DOCUMENT_AI',
    confidence: input.confidence,
    confirmationStatus: 'PENDING',
  };

  return [
    input.coverageType
      ? { factKey: 'POLICY_FORM', valueType: 'TEXT', textValue: input.coverageType, ...common }
      : null,
    input.premiumAmount != null
      ? {
          factKey: 'ANNUAL_PREMIUM',
          valueType: 'AMOUNT',
          amountValue: input.premiumAmount,
          currency: 'USD',
          ...common,
        }
      : null,
    input.deductibleAmount != null
      ? {
          factKey: 'ALL_PERIL_DEDUCTIBLE',
          valueType: 'AMOUNT',
          amountValue: input.deductibleAmount,
          currency: 'USD',
          ...common,
        }
      : null,
    input.coverageLimits
      ? { factKey: 'COVERAGE_LIMITS_RAW', valueType: 'TEXT', textValue: input.coverageLimits, ...common }
      : null,
  ].filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
}

export async function stageExtractedPolicyTerm(input: ExtractedPolicyTermInput) {
  return prisma.$transaction(async (tx) => {
    const property = await tx.property.findFirst({
      where: { id: input.propertyId, homeownerProfileId: input.homeownerProfileId },
      select: { id: true },
    });
    if (!property) throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');

    const document = await tx.document.findFirst({
      where: {
        id: input.documentId,
        propertyId: input.propertyId,
        ...(input.userId ? { uploadedBy: input.userId } : {}),
      },
      select: { id: true, uploadedBy: true },
    });
    if (!document) throw new APIError('Policy source document not found', 404, 'DOCUMENT_NOT_FOUND');

    const policy =
      (await tx.insurancePolicy.findFirst({
        where: {
          homeownerProfileId: input.homeownerProfileId,
          propertyId: input.propertyId,
          policyNumber: input.policyNumber,
        },
      })) ??
      (await tx.insurancePolicy.create({
        data: {
          homeownerProfileId: input.homeownerProfileId,
          propertyId: input.propertyId,
          carrierName: input.carrierName,
          policyNumber: input.policyNumber,
          coverageType: null,
          premiumAmount: null,
          startDate: null,
          expiryDate: null,
          isVerified: false,
        },
      }));

    const existingTerm = await tx.insurancePolicyTerm.findFirst({
      where: { insurancePolicyId: policy.id, sourceDocumentId: input.documentId },
      include: { facts: true },
    });
    if (existingTerm) return { policy, term: existingTerm };

    const term = await tx.insurancePolicyTerm.create({
      data: {
        insurancePolicyId: policy.id,
        propertyId: input.propertyId,
        termStart: input.termStart,
        termEnd: input.termEnd,
        annualPremium: input.premiumAmount,
        sourceDocumentId: input.documentId,
        status: 'PENDING_CONFIRMATION',
        verificationStatus: 'UNVERIFIED',
        facts: { create: extractedFacts(input) },
      },
      include: { facts: true },
    });

    await tx.auditLog.create({
      data: {
        userId: input.userId ?? document.uploadedBy,
        action: 'insurance_policy_term_extracted',
        entityType: 'InsurancePolicyTerm',
        entityId: term.id,
        newValues: {
          propertyId: input.propertyId,
          policyId: policy.id,
          sourceDocumentId: input.documentId,
          factCount: term.facts.length,
          verificationStatus: 'UNVERIFIED',
        },
      },
    });

    return { policy, term };
  });
}

export async function getPolicyRecord(policyId: string, homeownerProfileId: string) {
  const policy = await prisma.insurancePolicy.findFirst({
    where: { id: policyId, homeownerProfileId },
    include: {
      documents: true,
      terms: {
        orderBy: [{ termStart: 'desc' }, { createdAt: 'desc' }],
        include: {
          sourceDocument: { select: { id: true, name: true } },
          facts: {
            orderBy: { factKey: 'asc' },
            include: { sourceDocument: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  if (!policy) throw new APIError('Insurance policy not found', 404, 'POLICY_NOT_FOUND');

  const latestTerm = policy.terms[0] ?? null;
  const pendingFactCount =
    latestTerm?.facts.filter((fact) => fact.confirmationStatus === 'PENDING').length ?? 0;
  const confirmedFactCount =
    latestTerm?.facts.filter((fact) => fact.confirmationStatus === 'CONFIRMED').length ?? 0;

  return {
    ...policy,
    readiness: latestTerm
      ? {
          state: pendingFactCount > 0 ? 'NEEDS_CONFIRMATION' : confirmedFactCount > 0 ? 'CONFIRMED' : 'UNKNOWN',
          pendingFactCount,
          confirmedFactCount,
          unknownFactKeys: [
            'ANNUAL_PREMIUM',
            'ALL_PERIL_DEDUCTIBLE',
            'DWELLING_LIMIT',
            'LIABILITY_LIMIT',
            'POLICY_FORM',
          ].filter(
            (key) =>
              !latestTerm.facts.some(
                (fact) => fact.factKey === key && fact.confirmationStatus !== 'REJECTED'
              )
          ),
        }
      : {
          state: 'NO_TERM',
          pendingFactCount: 0,
          confirmedFactCount: 0,
          unknownFactKeys: [
            'ANNUAL_PREMIUM',
            'ALL_PERIL_DEDUCTIBLE',
            'DWELLING_LIMIT',
            'LIABILITY_LIMIT',
            'POLICY_FORM',
          ],
        },
  };
}

export async function confirmPolicyFact(params: {
  policyId: string;
  factId: string;
  homeownerProfileId: string;
  userId: string;
  confirmationStatus: 'CONFIRMED' | 'REJECTED';
  correction?: PolicyFactValue;
}) {
  return prisma.$transaction(async (tx) => {
    const fact = await tx.insurancePolicyFact.findFirst({
      where: {
        id: params.factId,
        policyTerm: {
          insurancePolicyId: params.policyId,
          insurancePolicy: { homeownerProfileId: params.homeownerProfileId },
        },
      },
      include: { policyTerm: true },
    });
    if (!fact) throw new APIError('Policy fact not found', 404, 'POLICY_FACT_NOT_FOUND');

    const correction = params.correction;
    const valuePatch: Prisma.InsurancePolicyFactUpdateInput = correction
      ? {
          valueType: correction.valueType,
          amountValue: correction.valueType === 'AMOUNT' ? correction.amountValue : null,
          currency: correction.valueType === 'AMOUNT' ? correction.currency ?? 'USD' : null,
          textValue: correction.valueType === 'TEXT' ? correction.textValue : null,
          booleanValue: correction.valueType === 'BOOLEAN' ? correction.booleanValue : null,
          jsonValue: correction.valueType === 'JSON' ? correction.jsonValue : Prisma.JsonNull,
          extractionMethod: 'HOMEOWNER_CORRECTION',
          confidence: null,
        }
      : {};

    const updated = await tx.insurancePolicyFact.update({
      where: { id: fact.id },
      data: {
        ...valuePatch,
        confirmationStatus: params.confirmationStatus,
        confirmedByUserId: params.userId,
        confirmedAt: new Date(),
      },
    });

    const remainingPending = await tx.insurancePolicyFact.count({
      where: { policyTermId: fact.policyTermId, confirmationStatus: 'PENDING' },
    });
    const confirmedCount = await tx.insurancePolicyFact.count({
      where: { policyTermId: fact.policyTermId, confirmationStatus: 'CONFIRMED' },
    });
    const termVerified = remainingPending === 0 && confirmedCount > 0;

    await tx.insurancePolicyTerm.update({
      where: { id: fact.policyTermId },
      data: {
        status: remainingPending > 0 ? 'PENDING_CONFIRMATION' : 'REVIEWED',
        verificationStatus: termVerified ? 'VERIFIED' : 'UNVERIFIED',
        verifiedAt: termVerified ? new Date() : null,
        ...(updated.factKey === 'ANNUAL_PREMIUM' &&
        updated.confirmationStatus === 'CONFIRMED' &&
        updated.amountValue != null
          ? { annualPremium: updated.amountValue }
          : {}),
      },
    });

    const policyPatch: Prisma.InsurancePolicyUpdateInput = {
      isVerified: termVerified,
      lastVerifiedAt: termVerified ? new Date() : null,
    };
    if (
      updated.confirmationStatus === 'CONFIRMED' &&
      updated.factKey === 'ANNUAL_PREMIUM' &&
      updated.amountValue != null
    ) {
      policyPatch.premiumAmount = updated.amountValue;
    }
    if (
      updated.confirmationStatus === 'CONFIRMED' &&
      updated.factKey === 'ALL_PERIL_DEDUCTIBLE' &&
      updated.amountValue != null
    ) {
      policyPatch.deductibleAmount = updated.amountValue;
      policyPatch.deductibleCents = Math.round(Number(updated.amountValue) * 100);
    }
    if (
      updated.confirmationStatus === 'CONFIRMED' &&
      updated.factKey === 'POLICY_FORM' &&
      updated.textValue
    ) {
      policyPatch.coverageType = updated.textValue;
    }
    await tx.insurancePolicy.update({ where: { id: params.policyId }, data: policyPatch });

    await tx.auditLog.create({
      data: {
        userId: params.userId,
        action:
          params.confirmationStatus === 'CONFIRMED'
            ? 'insurance_policy_fact_confirmed'
            : 'insurance_policy_fact_rejected',
        entityType: 'InsurancePolicyFact',
        entityId: fact.id,
        oldValues: {
          confirmationStatus: fact.confirmationStatus,
          valueType: fact.valueType,
        },
        newValues: {
          confirmationStatus: updated.confirmationStatus,
          valueType: updated.valueType,
          corrected: Boolean(correction),
          policyTermId: fact.policyTermId,
        },
      },
    });

    return updated;
  });
}
