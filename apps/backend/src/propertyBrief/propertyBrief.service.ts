import { createHash, randomBytes } from 'crypto';
import {
  DocumentVerificationStatus,
  HomeEventVerificationStatus,
  Prisma,
  PropertyBriefAccessKind,
  PropertyBriefDownloadPolicy,
  PropertyBriefPurpose,
  PropertyBriefSectionType,
  PropertyBriefShareStatus,
  PropertyBriefStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  analyticsEmitter,
  AnalyticsEvent,
  AnalyticsFeature,
  AnalyticsModule,
} from '../services/analytics';
import {
  PROPERTY_BRIEF_LIMITATION,
  PROPERTY_BRIEF_SECTIONS,
  PROPERTY_BRIEF_TEMPLATES,
  type PropertyBriefPurposeInput,
  type PropertyBriefSectionInput,
} from './propertyBrief.contracts';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const requestHash = (value?: string | null) =>
  value ? createHash('sha256').update(value).digest('hex') : null;

type EvidenceSeed = {
  itemKey: string;
  sourceEntityType: string;
  sourceEntityId: string;
  sourceLabel: string;
  sourceAsOf: Date;
  verification: string;
  documentId?: string | null;
};

type SectionSeed = {
  sectionType: PropertyBriefSectionType;
  title: string;
  payload: Prisma.InputJsonValue;
  sensitive: boolean;
  asOf: Date;
  evidence: EvidenceSeed[];
};

const purposeLabel = (purpose: PropertyBriefPurposeInput) =>
  PROPERTY_BRIEF_TEMPLATES[purpose].label;

function serialize(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function sectionTitle(section: PropertyBriefSectionInput) {
  return {
    PROPERTY_FACTS: 'Selected property facts',
    VERIFIED_HISTORY: 'Verified property history',
    DOCUMENTS: 'Selected documents',
    OPEN_UNKNOWNS: 'Known gaps and unknowns',
    CLAIMS: 'Selected claim records',
    INSURANCE: 'Selected insurance records',
  }[section];
}

async function assembleSections(input: {
  propertyId: string;
  selectedSections: PropertyBriefSectionInput[];
  documentIds: string[];
  asOf: Date;
}): Promise<SectionSeed[]> {
  const property = await prisma.property.findUnique({
    where: { id: input.propertyId },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      dwellingType: true,
      ownershipForm: true,
      propertyUse: true,
      occupancyStatus: true,
      propertySize: true,
      yearBuilt: true,
      bedrooms: true,
      bathrooms: true,
      roofType: true,
      roofReplacementYear: true,
      heatingType: true,
      coolingType: true,
      waterHeaterType: true,
      hvacInstallYear: true,
      waterHeaterInstallYear: true,
      foundationType: true,
      updatedAt: true,
    },
  });
  if (!property) throw new APIError('Property not found.', 404, 'PROPERTY_NOT_FOUND');

  const factDefinitions: Array<{ key: string; label: string; value: unknown }> = [
    { key: 'location.address', label: 'Address', value: `${property.address}, ${property.city}, ${property.state} ${property.zipCode}` },
    { key: 'core.dwellingType', label: 'Dwelling type', value: property.dwellingType },
    { key: 'core.ownershipForm', label: 'Ownership form', value: property.ownershipForm },
    { key: 'core.propertyUse', label: 'Property use', value: property.propertyUse },
    { key: 'core.occupancyStatus', label: 'Occupancy status', value: property.occupancyStatus },
    { key: 'core.propertySizeSqFt', label: 'Property size', value: property.propertySize },
    { key: 'core.yearBuilt', label: 'Year built', value: property.yearBuilt },
    { key: 'core.bedrooms', label: 'Bedrooms', value: property.bedrooms },
    { key: 'core.bathrooms', label: 'Bathrooms', value: property.bathrooms },
    { key: 'structure.roofType', label: 'Roof type', value: property.roofType },
    { key: 'structure.roofReplacementYear', label: 'Roof replacement year', value: property.roofReplacementYear },
    { key: 'systems.heatingType', label: 'Heating type', value: property.heatingType },
    { key: 'systems.coolingType', label: 'Cooling type', value: property.coolingType },
    { key: 'systems.waterHeaterType', label: 'Water heater type', value: property.waterHeaterType },
    { key: 'systems.hvacInstallYear', label: 'HVAC install year', value: property.hvacInstallYear },
    { key: 'systems.waterHeaterInstallYear', label: 'Water heater install year', value: property.waterHeaterInstallYear },
    { key: 'structure.foundationType', label: 'Foundation type', value: property.foundationType },
  ];
  const knownFacts = factDefinitions.filter((fact) =>
    fact.value !== null && fact.value !== undefined && fact.value !== 'UNKNOWN');
  const unknownFacts = factDefinitions.filter((fact) =>
    fact.value === null || fact.value === undefined || fact.value === 'UNKNOWN');

  const evidence = await prisma.propertyFactEvidence.findMany({
    where: {
      propertyId: input.propertyId,
      factKey: { in: knownFacts.map((fact) => fact.key) },
      supersededAt: null,
      verifiedAt: { not: null },
    },
    orderBy: { observedAt: 'desc' },
  });
  const evidenceByFact = new Map<string, (typeof evidence)[number]>();
  for (const item of evidence) {
    if (!evidenceByFact.has(item.factKey)) evidenceByFact.set(item.factKey, item);
  }
  const verifiedFacts = knownFacts.filter((fact) => evidenceByFact.has(fact.key));
  const knownButUnverifiedFacts = knownFacts.filter((fact) => !evidenceByFact.has(fact.key));
  const sections: SectionSeed[] = [];

  if (input.selectedSections.includes('PROPERTY_FACTS')) {
    const items = verifiedFacts.map((fact) => {
      const proof = evidenceByFact.get(fact.key)!;
      return {
        key: fact.key,
        label: fact.label,
        value: serialize(fact.value),
        source: proof.sourceType,
        verification: 'VERIFIED',
        asOf: proof.observedAt.toISOString(),
      };
    });
    sections.push({
      sectionType: PropertyBriefSectionType.PROPERTY_FACTS,
      title: sectionTitle('PROPERTY_FACTS'),
      payload: json({ items }),
      sensitive: false,
      asOf: input.asOf,
      evidence: items.map((item) => {
        const proof = evidenceByFact.get(item.key);
        return {
          itemKey: item.key,
          sourceEntityType: proof?.sourceEntityType ?? 'PROPERTY_FACT_EVIDENCE',
          sourceEntityId: proof?.sourceEntityId ?? proof!.id,
          sourceLabel: `Verified property fact evidence: ${proof!.sourceType}`,
          sourceAsOf: proof!.observedAt,
          verification: item.verification,
        };
      }),
    });
  }

  if (input.selectedSections.includes('VERIFIED_HISTORY')) {
    const events = await prisma.homeEvent.findMany({
      where: {
        propertyId: input.propertyId,
        isCurrent: true,
        deletedAt: null,
        verificationStatus: {
          in: [
            HomeEventVerificationStatus.HOMEOWNER_CONFIRMED,
            HomeEventVerificationStatus.EVIDENCE_VERIFIED,
          ],
        },
      },
      orderBy: { occurredAt: 'desc' },
      take: 50,
      include: { evidence: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });
    const items = events.map((event) => ({
      key: event.id,
      title: event.title,
      summary: event.summary,
      occurredAt: event.occurredAt.toISOString(),
      datePrecision: event.datePrecision,
      verification: event.verificationStatus,
      source: event.sourceType,
      asOf: (event.sourceAsOf ?? event.updatedAt).toISOString(),
    }));
    sections.push({
      sectionType: PropertyBriefSectionType.VERIFIED_HISTORY,
      title: sectionTitle('VERIFIED_HISTORY'),
      payload: json({ items }),
      sensitive: false,
      asOf: input.asOf,
      evidence: events.map((event) => ({
        itemKey: event.id,
        sourceEntityType: event.sourceEntityType ?? 'HOME_EVENT',
        sourceEntityId: event.sourceEntityId ?? event.id,
        sourceLabel: event.evidence.length > 0 ? 'Verified Timeline event with linked evidence' : 'Homeowner-confirmed Timeline event',
        sourceAsOf: event.sourceAsOf ?? event.updatedAt,
        verification: event.verificationStatus,
        documentId: event.evidence.find((item) => item.documentId)?.documentId,
      })),
    });
  }

  if (input.selectedSections.includes('DOCUMENTS')) {
    const documents = input.documentIds.length === 0 ? [] : await prisma.document.findMany({
      where: {
        id: { in: input.documentIds },
        propertyId: input.propertyId,
        verificationStatus: DocumentVerificationStatus.VERIFIED,
      },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    });
    const items = documents.map((document) => ({
      key: document.id,
      name: document.name,
      type: document.type,
      description: document.description,
      verification: document.verificationStatus,
      asOf: (document.verifiedAt ?? document.updatedAt).toISOString(),
    }));
    sections.push({
      sectionType: PropertyBriefSectionType.DOCUMENTS,
      title: sectionTitle('DOCUMENTS'),
      payload: json({
        items,
        limitation: input.documentIds.length > documents.length
          ? 'Unverified, missing, or non-property documents were excluded.'
          : null,
      }),
      sensitive: true,
      asOf: input.asOf,
      evidence: documents.map((document) => ({
        itemKey: document.id,
        sourceEntityType: 'DOCUMENT',
        sourceEntityId: document.id,
        sourceLabel: 'Verified Vault document',
        sourceAsOf: document.verifiedAt ?? document.updatedAt,
        verification: document.verificationStatus,
        documentId: document.id,
      })),
    });
  }

  if (input.selectedSections.includes('OPEN_UNKNOWNS')) {
    const items = [
      ...unknownFacts.map((fact) => ({
      key: fact.key,
      label: fact.label,
      state: 'UNKNOWN_OR_NOT_RECORDED',
      source: 'CANONICAL_PROPERTY_RECORD',
      asOf: property.updatedAt.toISOString(),
      })),
      ...knownButUnverifiedFacts.map((fact) => ({
        key: fact.key,
        label: fact.label,
        state: 'KNOWN_NOT_VERIFIED',
        source: 'CANONICAL_PROPERTY_RECORD',
        asOf: property.updatedAt.toISOString(),
      })),
    ];
    sections.push({
      sectionType: PropertyBriefSectionType.OPEN_UNKNOWNS,
      title: sectionTitle('OPEN_UNKNOWNS'),
      payload: json({ items, completenessBoundary: 'Only fields in this selected template were checked.' }),
      sensitive: false,
      asOf: input.asOf,
      evidence: items.map((item) => ({
        itemKey: item.key,
        sourceEntityType: 'PROPERTY',
        sourceEntityId: property.id,
        sourceLabel: 'Canonical property record gap',
        sourceAsOf: property.updatedAt,
        verification: item.state,
      })),
    });
  }

  if (input.selectedSections.includes('CLAIMS')) {
    const claims = await prisma.claim.findMany({
      where: { propertyId: input.propertyId },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    });
    const items = claims.map((claim) => ({
      key: claim.id,
      title: claim.title,
      type: claim.type,
      status: claim.status,
      incidentAt: claim.incidentAt?.toISOString() ?? null,
      providerName: claim.providerName,
      asOf: claim.updatedAt.toISOString(),
    }));
    sections.push({
      sectionType: PropertyBriefSectionType.CLAIMS,
      title: sectionTitle('CLAIMS'),
      payload: json({ items, excludedFields: ['claimNumber', 'loss amounts', 'settlement amounts'] }),
      sensitive: true,
      asOf: input.asOf,
      evidence: claims.map((claim) => ({
        itemKey: claim.id,
        sourceEntityType: 'CLAIM',
        sourceEntityId: claim.id,
        sourceLabel: 'Canonical claim record',
        sourceAsOf: claim.updatedAt,
        verification: claim.sourceType,
      })),
    });
  }

  if (input.selectedSections.includes('INSURANCE')) {
    const policies = await prisma.insurancePolicy.findMany({
      where: { propertyId: input.propertyId },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    });
    const items = policies.map((policy) => ({
      key: policy.id,
      carrierName: policy.carrierName,
      coverageType: policy.coverageType,
      startDate: policy.startDate?.toISOString() ?? null,
      expiryDate: policy.expiryDate?.toISOString() ?? null,
      verification: policy.isVerified ? 'VERIFIED' : 'HOMEOWNER_RECORDED',
      asOf: (policy.lastVerifiedAt ?? policy.updatedAt).toISOString(),
    }));
    sections.push({
      sectionType: PropertyBriefSectionType.INSURANCE,
      title: sectionTitle('INSURANCE'),
      payload: json({ items, excludedFields: ['policyNumber', 'premium', 'deductible', 'coverage limits'] }),
      sensitive: true,
      asOf: input.asOf,
      evidence: policies.map((policy) => ({
        itemKey: policy.id,
        sourceEntityType: 'INSURANCE_POLICY',
        sourceEntityId: policy.id,
        sourceLabel: policy.isVerified ? 'Verified insurance policy record' : 'Homeowner-recorded insurance policy',
        sourceAsOf: policy.lastVerifiedAt ?? policy.updatedAt,
        verification: policy.isVerified ? 'VERIFIED' : 'HOMEOWNER_RECORDED',
      })),
    });
  }
  return sections;
}

export async function getPropertyBriefTemplates() {
  return Object.entries(PROPERTY_BRIEF_TEMPLATES).map(([purpose, template]) => ({
    purpose,
    ...template,
  }));
}

export async function listEligiblePropertyBriefDocuments(propertyId: string) {
  return prisma.document.findMany({
    where: { propertyId, verificationStatus: DocumentVerificationStatus.VERIFIED },
    orderBy: { verifiedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      name: true,
      type: true,
      description: true,
      verifiedAt: true,
      updatedAt: true,
    },
  });
}

export async function listPropertyBriefs(propertyId: string, userId: string) {
  return prisma.propertyBrief.findMany({
    where: { propertyId, createdByUserId: userId, status: { not: PropertyBriefStatus.ARCHIVED } },
    orderBy: { createdAt: 'desc' },
    include: {
      shares: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, status: true, downloadPolicy: true, expiresAt: true,
          revokedAt: true, accessCount: true, lastAccessedAt: true, createdAt: true,
        },
      },
    },
  });
}

export async function createPropertyBrief(input: {
  propertyId: string;
  userId: string;
  purpose: PropertyBriefPurposeInput;
  title?: string;
  selectedSections: PropertyBriefSectionInput[];
  documentIds: string[];
}) {
  const selectedSections = [...new Set(input.selectedSections)];
  const excludedSections = PROPERTY_BRIEF_SECTIONS.filter((section) => !selectedSections.includes(section));
  const asOf = new Date();
  const sections = await assembleSections({
    propertyId: input.propertyId,
    selectedSections,
    documentIds: input.documentIds,
    asOf,
  });

  const brief = await prisma.propertyBrief.create({
    data: {
      propertyId: input.propertyId,
      createdByUserId: input.userId,
      purpose: input.purpose as PropertyBriefPurpose,
      title: input.title?.trim() || `${purposeLabel(input.purpose)} Property Brief`,
      selectedSections: selectedSections as PropertyBriefSectionType[],
      excludedSections: excludedSections as PropertyBriefSectionType[],
      limitationStatement: PROPERTY_BRIEF_LIMITATION,
      asOf,
      sections: {
        create: sections.map((section, index) => ({
          sectionType: section.sectionType,
          title: section.title,
          payload: section.payload,
          sensitive: section.sensitive,
          sortOrder: index,
          asOf: section.asOf,
          evidenceLinks: {
            create: section.evidence.map((proof) => ({
              ...proof,
              documentId: proof.documentId ?? null,
            })),
          },
        })),
      },
    },
    include: {
      sections: { orderBy: { sortOrder: 'asc' }, include: { evidenceLinks: true } },
      shares: true,
    },
  });
  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED,
    userId: input.userId,
    propertyId: input.propertyId,
    moduleKey: AnalyticsModule.DOCUMENTS,
    featureKey: AnalyticsFeature.PROPERTY_BRIEF,
    metadataJson: {
      actionType: 'property_brief_created',
      purpose: input.purpose,
      selectedSections,
      excludedSections,
    },
  });
  return brief;
}

async function findOwnedBrief(propertyId: string, userId: string, briefId: string) {
  const brief = await prisma.propertyBrief.findFirst({
    where: { id: briefId, propertyId, createdByUserId: userId },
    include: {
      property: { select: { name: true, address: true, city: true, state: true, zipCode: true } },
      sections: { orderBy: { sortOrder: 'asc' }, include: { evidenceLinks: true } },
      shares: {
        orderBy: { createdAt: 'desc' },
        include: { accesses: { orderBy: { occurredAt: 'desc' }, take: 100 } },
      },
    },
  });
  if (!brief) throw new APIError('Property Brief not found.', 404, 'PROPERTY_BRIEF_NOT_FOUND');
  return brief;
}

export async function getPropertyBriefPreview(propertyId: string, userId: string, briefId: string) {
  return findOwnedBrief(propertyId, userId, briefId);
}

export async function createPropertyBriefShare(input: {
  propertyId: string;
  userId: string;
  briefId: string;
  expiresInDays: number;
  downloadPolicy: 'VIEW_ONLY' | 'ALLOW_DOWNLOAD';
}) {
  const brief = await findOwnedBrief(input.propertyId, input.userId, input.briefId);
  if (brief.status === PropertyBriefStatus.ARCHIVED) {
    throw new APIError('Archived briefs cannot be shared.', 409, 'PROPERTY_BRIEF_ARCHIVED');
  }
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
  const share = await prisma.$transaction(async (tx) => {
    const created = await tx.propertyBriefShare.create({
      data: {
        briefId: brief.id,
        propertyId: input.propertyId,
        createdByUserId: input.userId,
        tokenHash: tokenHash(token),
        expiresAt,
        downloadPolicy: input.downloadPolicy as PropertyBriefDownloadPolicy,
      },
      select: { id: true, status: true, expiresAt: true, downloadPolicy: true, createdAt: true },
    });
    await tx.propertyBrief.update({
      where: { id: brief.id },
      data: { status: PropertyBriefStatus.SHARED },
    });
    return created;
  });
  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED,
    userId: input.userId,
    propertyId: input.propertyId,
    moduleKey: AnalyticsModule.DOCUMENTS,
    featureKey: AnalyticsFeature.PROPERTY_BRIEF,
    metadataJson: {
      actionType: 'property_brief_shared',
      briefId: brief.id,
      downloadPolicy: input.downloadPolicy,
      expiresInDays: input.expiresInDays,
    },
  });
  return { ...share, token };
}

export async function revokePropertyBriefShare(input: {
  propertyId: string;
  userId: string;
  briefId: string;
  shareId: string;
}) {
  await findOwnedBrief(input.propertyId, input.userId, input.briefId);
  const share = await prisma.propertyBriefShare.findFirst({
    where: { id: input.shareId, briefId: input.briefId, propertyId: input.propertyId },
  });
  if (!share) throw new APIError('Share not found.', 404, 'PROPERTY_BRIEF_SHARE_NOT_FOUND');
  const updated = await prisma.propertyBriefShare.update({
    where: { id: share.id },
    data: { status: PropertyBriefShareStatus.REVOKED, revokedAt: new Date() },
  });
  const activeShareCount = await prisma.propertyBriefShare.count({
    where: { briefId: input.briefId, status: PropertyBriefShareStatus.ACTIVE, expiresAt: { gt: new Date() } },
  });
  if (activeShareCount === 0) {
    await prisma.propertyBrief.update({
      where: { id: input.briefId },
      data: { status: PropertyBriefStatus.REVOKED },
    });
  }
  return updated;
}

export async function getSharedPropertyBrief(input: {
  token: string;
  accessKind?: 'VIEW' | 'DOWNLOAD';
  ip?: string | null;
  userAgent?: string | null;
}) {
  const now = new Date();
  const share = await prisma.propertyBriefShare.findUnique({
    where: { tokenHash: tokenHash(input.token) },
    include: {
      brief: {
        include: {
          property: { select: { name: true, city: true, state: true } },
          sections: { orderBy: { sortOrder: 'asc' }, include: { evidenceLinks: true } },
        },
      },
    },
  });
  const deniedReason = !share
    ? 'TOKEN_NOT_FOUND'
    : share.status === PropertyBriefShareStatus.REVOKED
      ? 'SHARE_REVOKED'
      : share.expiresAt <= now
        ? 'SHARE_EXPIRED'
        : input.accessKind === 'DOWNLOAD' && share.downloadPolicy !== PropertyBriefDownloadPolicy.ALLOW_DOWNLOAD
          ? 'DOWNLOAD_NOT_ALLOWED'
          : null;
  if (share && deniedReason) {
    await prisma.propertyBriefAccessLog.create({
      data: {
        shareId: share.id,
        kind: PropertyBriefAccessKind.DENIED,
        reason: deniedReason,
        ipHash: requestHash(input.ip),
        userAgentHash: requestHash(input.userAgent),
      },
    });
    if (deniedReason === 'SHARE_EXPIRED' && share.status === PropertyBriefShareStatus.ACTIVE) {
      await prisma.propertyBriefShare.update({
        where: { id: share.id },
        data: { status: PropertyBriefShareStatus.EXPIRED },
      });
    }
  }
  if (!share || deniedReason) {
    throw new APIError('This Property Brief share is unavailable.', 410, deniedReason ?? 'SHARE_UNAVAILABLE');
  }
  const kind = input.accessKind === 'DOWNLOAD'
    ? PropertyBriefAccessKind.DOWNLOAD
    : PropertyBriefAccessKind.VIEW;
  await prisma.$transaction([
    prisma.propertyBriefShare.update({
      where: { id: share.id },
      data: { accessCount: { increment: 1 }, lastAccessedAt: now },
    }),
    prisma.propertyBriefAccessLog.create({
      data: {
        shareId: share.id,
        kind,
        ipHash: requestHash(input.ip),
        userAgentHash: requestHash(input.userAgent),
      },
    }),
  ]);
  return {
    id: share.brief.id,
    title: share.brief.title,
    purpose: share.brief.purpose,
    asOf: share.brief.asOf,
    selectedSections: share.brief.selectedSections,
    excludedSections: share.brief.excludedSections,
    limitationStatement: share.brief.limitationStatement,
    templateVersion: share.brief.templateVersion,
    property: share.brief.property,
    sections: share.brief.sections,
    expiresAt: share.expiresAt,
    downloadPolicy: share.downloadPolicy,
  };
}
