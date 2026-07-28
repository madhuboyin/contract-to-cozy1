import { Prisma, QuoteRequestSource } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  addCoverageComparisonOption,
  type CoverageOptionInput,
} from './coverageComparison.service';

export const INSURANCE_HANDOFF_DISCLOSURE_VERSION = 'coverage-handoff-v1';
const APPROVED = 'APPROVED';

export type RecipientGovernance = {
  id: string;
  name: string;
  configVersion: string;
  supportedJurisdictions: string[];
  licensingReviewStatus: string;
  licensingDisclosure: string;
  operatingModelStatus: string;
  privacyReviewStatus: string;
  commercialDisclosure: string;
  compensationDisclosure: string;
  marketScopeDisclosure: string;
  rankingDisclosure: string;
  fulfillmentSlaHours: number;
  quoteIngestionEnabled: boolean;
  isActive: boolean;
  effectiveAt: Date;
  expiresAt: Date | null;
};

export function evaluateRecipientEligibility(
  recipient: RecipientGovernance,
  jurisdictionCode: string,
  now = new Date()
) {
  const reasons: string[] = [];
  if (!recipient.isActive) reasons.push('RECIPIENT_INACTIVE');
  if (recipient.effectiveAt > now) reasons.push('CONFIG_NOT_EFFECTIVE');
  if (recipient.expiresAt && recipient.expiresAt <= now) reasons.push('CONFIG_EXPIRED');
  if (!recipient.supportedJurisdictions.includes(jurisdictionCode)) {
    reasons.push('JURISDICTION_UNSUPPORTED');
  }
  if (recipient.licensingReviewStatus !== APPROVED) reasons.push('LICENSING_NOT_APPROVED');
  if (recipient.operatingModelStatus !== APPROVED) reasons.push('OPERATING_MODEL_NOT_APPROVED');
  if (recipient.privacyReviewStatus !== APPROVED) reasons.push('PRIVACY_NOT_APPROVED');
  if (!recipient.quoteIngestionEnabled) reasons.push('QUOTE_INGESTION_DISABLED');
  if (recipient.fulfillmentSlaHours <= 0) reasons.push('FULFILLMENT_SLA_MISSING');
  if (
    !recipient.licensingDisclosure.trim() ||
    !recipient.commercialDisclosure.trim() ||
    !recipient.compensationDisclosure.trim() ||
    !recipient.marketScopeDisclosure.trim() ||
    !recipient.rankingDisclosure.trim()
  ) {
    reasons.push('DISCLOSURES_INCOMPLETE');
  }
  return { eligible: reasons.length === 0, reasons };
}

async function authorizedProperty(propertyId: string, userId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, homeownerProfile: { userId } },
    select: {
      id: true,
      state: true,
      zipCode: true,
      homeownerProfileId: true,
    },
  });
  if (!property) throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');
  return property;
}

function publicRecipient(recipient: RecipientGovernance) {
  return {
    id: recipient.id,
    name: recipient.name,
    configVersion: recipient.configVersion,
    licensingDisclosure: recipient.licensingDisclosure,
    commercialDisclosure: recipient.commercialDisclosure,
    compensationDisclosure: recipient.compensationDisclosure,
    marketScopeDisclosure: recipient.marketScopeDisclosure,
    rankingDisclosure: recipient.rankingDisclosure,
    fulfillmentSlaHours: recipient.fulfillmentSlaHours,
    disclosureVersion: `${INSURANCE_HANDOFF_DISCLOSURE_VERSION}:${recipient.configVersion}`,
  };
}

async function resolveRecipient(jurisdictionCode: string, now = new Date()) {
  const candidates = await prisma.insuranceHandoffRecipient.findMany({
    where: {
      isActive: true,
      effectiveAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      supportedJurisdictions: { has: jurisdictionCode },
    },
    orderBy: { effectiveAt: 'desc' },
  });
  return candidates.find(
    (candidate) => evaluateRecipientEligibility(candidate, jurisdictionCode, now).eligible
  ) ?? null;
}

export async function getInsuranceHandoffReadiness(propertyId: string, userId: string) {
  const property = await authorizedProperty(propertyId, userId);
  const jurisdictionCode = property.state.trim().toUpperCase();
  const recipient = await resolveRecipient(jurisdictionCode);
  if (!recipient) {
    return {
      available: false as const,
      code: 'INSURANCE_HANDOFF_UNAVAILABLE',
      message: `Licensed help is not available through this service in ${jurisdictionCode}.`,
      jurisdictionCode,
    };
  }
  return {
    available: true as const,
    jurisdictionCode,
    purpose: 'Request licensed help reviewing equivalent homeowners insurance choices.',
    sharedFields: [
      'preferred contact detail',
      'property ZIP code',
      'property state',
      'request purpose',
      'coverage comparison identifier, when available',
    ],
    excludedFields: ['raw policy text', 'claims history', 'full street address', 'inventory details'],
    recipient: publicRecipient(recipient),
  };
}

type CreateHandoffInput = {
  requestId: string;
  recipientId: string;
  disclosureVersion: string;
  source: QuoteRequestSource;
  purpose: string;
  preferredContact: 'EMAIL' | 'SMS' | 'PHONE';
  contactEmail?: string | null;
  contactPhone?: string | null;
  coverageComparisonId?: string | null;
  notes?: string | null;
  consent: {
    dataSharing: true;
    disclosuresAccepted: true;
    email: boolean;
    sms: boolean;
    phone: boolean;
  };
};

export async function createInsuranceHandoffRequest(
  propertyId: string,
  userId: string,
  input: CreateHandoffInput
) {
  const property = await authorizedProperty(propertyId, userId);
  const jurisdictionCode = property.state.trim().toUpperCase();
  const recipient = await resolveRecipient(jurisdictionCode);
  if (!recipient || recipient.id !== input.recipientId) {
    throw new APIError(
      'No approved recipient is available for this jurisdiction',
      409,
      'INSURANCE_HANDOFF_UNAVAILABLE'
    );
  }
  const disclosureVersion = `${INSURANCE_HANDOFF_DISCLOSURE_VERSION}:${recipient.configVersion}`;
  if (input.disclosureVersion !== disclosureVersion) {
    throw new APIError('Disclosures changed; review them again', 409, 'DISCLOSURE_VERSION_STALE');
  }
  const channelConsent = {
    EMAIL: input.consent.email,
    SMS: input.consent.sms,
    PHONE: input.consent.phone,
  }[input.preferredContact];
  if (!channelConsent) {
    throw new APIError('Consent is required for the selected contact channel', 400, 'CHANNEL_CONSENT_REQUIRED');
  }
  const selectedContact =
    input.preferredContact === 'EMAIL' ? input.contactEmail?.trim() : input.contactPhone?.trim();
  if (!selectedContact) {
    throw new APIError('Contact information is required for the selected channel', 400, 'CONTACT_REQUIRED');
  }
  if (input.coverageComparisonId) {
    const comparison = await prisma.coverageComparison.findFirst({
      where: { id: input.coverageComparisonId, propertyId },
      select: { id: true },
    });
    if (!comparison) {
      throw new APIError('Coverage comparison not found', 404, 'COVERAGE_COMPARISON_NOT_FOUND');
    }
  }

  const now = new Date();
  const disclosureSnapshot = publicRecipient(recipient);
  const sharedPayload = {
    purpose: input.purpose.trim(),
    jurisdictionCode,
    zipCode: property.zipCode,
    preferredContact: input.preferredContact,
    contact: selectedContact,
    coverageComparisonId: input.coverageComparisonId ?? null,
  };
  const matchesReplay = (existing: {
    recipientId: string;
    coverageComparisonId: string | null;
    source: QuoteRequestSource;
    purpose: string;
    preferredContact: string;
    contactEmail: string | null;
    contactPhone: string | null;
    notes: string | null;
    disclosureVersion: string;
    consentSnapshotJson: Prisma.JsonValue;
  }) =>
    existing.recipientId === recipient.id &&
    existing.coverageComparisonId === (input.coverageComparisonId ?? null) &&
    existing.source === input.source &&
    existing.purpose === input.purpose.trim() &&
    existing.preferredContact === input.preferredContact &&
    existing.contactEmail === (input.preferredContact === 'EMAIL' ? selectedContact : null) &&
    existing.contactPhone === (input.preferredContact !== 'EMAIL' ? selectedContact : null) &&
    existing.notes === (input.notes?.trim() || null) &&
    existing.disclosureVersion === disclosureVersion &&
    typeof existing.consentSnapshotJson === 'object' &&
    existing.consentSnapshotJson !== null &&
    !Array.isArray(existing.consentSnapshotJson) &&
    existing.consentSnapshotJson.dataSharing === input.consent.dataSharing &&
    existing.consentSnapshotJson.disclosuresAccepted === input.consent.disclosuresAccepted &&
    existing.consentSnapshotJson.email === input.consent.email &&
    existing.consentSnapshotJson.sms === input.consent.sms &&
    existing.consentSnapshotJson.phone === input.consent.phone;
  const loadReplay = () => prisma.insuranceQuoteRequest.findFirst({
    where: {
      id: input.requestId,
      propertyId,
      homeownerProfileId: property.homeownerProfileId,
    },
    include: { recipient: true, events: { orderBy: { occurredAt: 'asc' as const } } },
  });
  const existing = await loadReplay();
  if (existing) {
    if (!matchesReplay(existing)) {
      throw new APIError(
        'The handoff request id was already used with different details',
        409,
        'INSURANCE_HANDOFF_IDEMPOTENCY_CONFLICT'
      );
    }
    return {
      ...existing,
      recipient: publicRecipient(recipient),
      quoteReceived: existing.status === 'QUOTE_RECEIVED',
      idempotentReplay: true as const,
    };
  }

  try {
    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.insuranceQuoteRequest.create({
        data: {
          id: input.requestId,
          homeownerProfileId: property.homeownerProfileId,
          propertyId,
          recipientId: recipient.id,
          coverageComparisonId: input.coverageComparisonId ?? null,
          source: input.source,
          purpose: input.purpose.trim(),
          preferredContact: input.preferredContact,
          contactEmail: input.preferredContact === 'EMAIL' ? selectedContact : null,
          contactPhone: input.preferredContact !== 'EMAIL' ? selectedContact : null,
          jurisdictionCode,
          notes: input.notes?.trim() || null,
          disclosureVersion,
          disclosureSnapshotJson: disclosureSnapshot as unknown as Prisma.InputJsonValue,
          consentSnapshotJson: input.consent as unknown as Prisma.InputJsonValue,
          sharedPayloadJson: sharedPayload as Prisma.InputJsonValue,
          consentedAt: now,
          submittedAt: now,
          status: 'SUBMITTED',
        },
        include: { recipient: true, events: true },
      });
      await tx.insuranceQuoteRequestEvent.createMany({
        data: [
          {
            quoteRequestId: created.id,
            eventType: 'CONSENT_RECORDED',
            actorType: 'HOMEOWNER',
            actorId: userId,
            status: 'CONSENTED',
            detailsJson: { disclosureVersion, preferredContact: input.preferredContact },
            occurredAt: now,
          },
          {
            quoteRequestId: created.id,
            eventType: 'REQUEST_SUBMITTED',
            actorType: 'SYSTEM',
            actorId: userId,
            status: 'SUBMITTED',
            detailsJson: { recipientId: recipient.id, quoteReceived: false },
            occurredAt: now,
          },
        ],
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'insurance_handoff_submitted',
          entityType: 'InsuranceQuoteRequest',
          entityId: created.id,
          newValues: { recipientId: recipient.id, jurisdictionCode, disclosureVersion },
        },
      });
      return created;
    });
    return {
      ...request,
      recipient: publicRecipient(recipient),
      quoteReceived: false,
      idempotentReplay: false as const,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const replay = await loadReplay();
      if (replay && matchesReplay(replay)) {
        return {
          ...replay,
          recipient: publicRecipient(recipient),
          quoteReceived: replay.status === 'QUOTE_RECEIVED',
          idempotentReplay: true as const,
        };
      }
      throw new APIError(
        'The handoff request id was already used with different details',
        409,
        'INSURANCE_HANDOFF_IDEMPOTENCY_CONFLICT'
      );
    }
    throw error;
  }
}

export async function getInsuranceHandoffRequest(
  propertyId: string,
  requestId: string,
  userId: string
) {
  await authorizedProperty(propertyId, userId);
  const request = await prisma.insuranceQuoteRequest.findFirst({
    where: { id: requestId, propertyId },
    include: { recipient: true, events: { orderBy: { occurredAt: 'asc' } } },
  });
  if (!request) throw new APIError('Help request not found', 404, 'HANDOFF_REQUEST_NOT_FOUND');
  return { ...request, recipient: publicRecipient(request.recipient) };
}

export async function withdrawInsuranceHandoffRequest(
  propertyId: string,
  requestId: string,
  userId: string
) {
  await authorizedProperty(propertyId, userId);
  const existing = await prisma.insuranceQuoteRequest.findFirst({
    where: { id: requestId, propertyId },
  });
  if (!existing) throw new APIError('Help request not found', 404, 'HANDOFF_REQUEST_NOT_FOUND');
  if (['WITHDRAWN', 'QUOTE_RECEIVED', 'CLOSED'].includes(existing.status)) {
    throw new APIError('This request can no longer be withdrawn', 409, 'HANDOFF_NOT_WITHDRAWABLE');
  }
  const withdrawnAt = new Date();
  return prisma.$transaction(async (tx) => {
    const request = await tx.insuranceQuoteRequest.update({
      where: { id: requestId },
      data: { status: 'WITHDRAWN', withdrawnAt, outcome: 'WITHDRAWN_BY_HOMEOWNER' },
      include: { recipient: true, events: { orderBy: { occurredAt: 'asc' } } },
    });
    await tx.insuranceQuoteRequestEvent.create({
      data: {
        quoteRequestId: requestId,
        eventType: 'REQUEST_WITHDRAWN',
        actorType: 'HOMEOWNER',
        actorId: userId,
        status: 'WITHDRAWN',
        detailsJson: { contactRevoked: true },
        occurredAt: withdrawnAt,
      },
    });
    await tx.auditLog.create({
      data: {
        userId,
        action: 'insurance_handoff_withdrawn',
        entityType: 'InsuranceQuoteRequest',
        entityId: requestId,
        newValues: { status: 'WITHDRAWN', withdrawnAt: withdrawnAt.toISOString() },
      },
    });
    return { ...request, recipient: publicRecipient(request.recipient) };
  });
}

export async function ingestReturnedInsuranceQuote(
  propertyId: string,
  requestId: string,
  userId: string,
  input: CoverageOptionInput & { comparisonId?: string | null }
) {
  await authorizedProperty(propertyId, userId);
  const request = await prisma.insuranceQuoteRequest.findFirst({
    where: { id: requestId, propertyId },
    include: { recipient: true },
  });
  if (!request) throw new APIError('Help request not found', 404, 'HANDOFF_REQUEST_NOT_FOUND');
  if (['WITHDRAWN', 'FAILED', 'CLOSED'].includes(request.status)) {
    throw new APIError('Returned quote cannot be attached to this request', 409, 'HANDOFF_CLOSED');
  }
  if (!request.recipient.quoteIngestionEnabled) {
    throw new APIError('Quote ingestion is not enabled', 409, 'QUOTE_INGESTION_DISABLED');
  }
  const comparisonId = input.comparisonId ?? request.coverageComparisonId;
  if (!comparisonId) {
    throw new APIError('A coverage comparison is required', 400, 'COVERAGE_COMPARISON_REQUIRED');
  }
  const option = await addCoverageComparisonOption(propertyId, comparisonId, userId, {
    ...input,
    optionType: 'QUOTE_DOCUMENT',
  });
  const fulfilledAt = new Date();
  await prisma.$transaction([
    prisma.insuranceQuoteRequest.update({
      where: { id: requestId },
      data: {
        status: 'QUOTE_RECEIVED',
        fulfilledAt,
        returnedQuoteDocumentId: input.sourceDocumentId,
        comparisonOptionId: option.id,
        outcome: 'QUOTE_RETURNED_TO_COMPARISON',
      },
    }),
    prisma.insuranceQuoteRequestEvent.create({
      data: {
        quoteRequestId: requestId,
        eventType: 'QUOTE_INGESTED',
        actorType: 'RECIPIENT',
        status: 'QUOTE_RECEIVED',
        detailsJson: {
          sourceDocumentId: input.sourceDocumentId,
          comparisonId,
          comparisonOptionId: option.id,
          commercialFactorsUsedForRanking: false,
        },
        occurredAt: fulfilledAt,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId,
        action: 'insurance_handoff_quote_ingested',
        entityType: 'InsuranceQuoteRequest',
        entityId: requestId,
        newValues: { comparisonId, comparisonOptionId: option.id, status: 'QUOTE_RECEIVED' },
      },
    }),
  ]);
  return { requestId, status: 'QUOTE_RECEIVED' as const, option };
}
