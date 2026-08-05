import { createHash, randomBytes } from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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
import { derivePropertyIntelligenceSafetyTier } from '../productFramework/propertyIntelligenceOwnership.contract';

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
    WARRANTIES: 'Active warranties',
    MATERIAL_SPECS: 'As-built material specs',
    PERMITS: 'Verified permits',
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
    { key: 'location.city', label: 'City', value: property.city },
    { key: 'location.state', label: 'State', value: property.state },
    { key: 'location.zipCode', label: 'ZIP code', value: property.zipCode },
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

  // Slice 10 (buyer handoff / ownership transition): successor-value
  // records — the buyer needs to know what's covered, what's installed, and
  // what's permitted, so these are NOT in sensitiveSections. Financial
  // fields (cost, purchase price, permit valuation) are excluded the same
  // way claims/insurance already exclude claim numbers and settlement
  // amounts above — successor value, not the seller's spend.
  if (input.selectedSections.includes('WARRANTIES')) {
    const warranties = await prisma.warranty.findMany({
      where: { propertyId: input.propertyId },
      orderBy: { expiryDate: 'desc' },
      take: 25,
    });
    const items = warranties.map((warranty) => ({
      key: warranty.id,
      providerName: warranty.providerName,
      category: warranty.category,
      coverageDetails: warranty.coverageDetails,
      startDate: warranty.startDate.toISOString(),
      expiryDate: warranty.expiryDate.toISOString(),
      asOf: warranty.updatedAt.toISOString(),
    }));
    sections.push({
      sectionType: PropertyBriefSectionType.WARRANTIES,
      title: sectionTitle('WARRANTIES'),
      payload: json({ items, excludedFields: ['cost', 'policy number'] }),
      sensitive: false,
      asOf: input.asOf,
      evidence: warranties.map((warranty) => ({
        itemKey: warranty.id,
        sourceEntityType: 'WARRANTY',
        sourceEntityId: warranty.id,
        sourceLabel: 'Canonical warranty record',
        sourceAsOf: warranty.updatedAt,
        verification: 'HOMEOWNER_RECORDED',
      })),
    });
  }

  if (input.selectedSections.includes('MATERIAL_SPECS')) {
    const specs = await prisma.materialSpec.findMany({
      where: { propertyId: input.propertyId, isActive: true, lifecycleStatus: 'AS_BUILT' },
      orderBy: { updatedAt: 'desc' },
      take: 25,
      include: { room: { select: { name: true } } },
    });
    const items = specs.map((spec) => ({
      key: spec.id,
      label: spec.label,
      category: spec.category,
      surface: spec.surface,
      room: spec.room?.name ?? null,
      manufacturer: spec.manufacturer,
      productLine: spec.productLine,
      productName: spec.productName,
      sku: spec.sku,
      colorCode: spec.colorCode,
      colorHex: spec.colorHex,
      finish: spec.finish,
      material: spec.material,
      supplier: spec.supplier,
      supplierUrl: spec.supplierUrl,
      supplierDiscontinued: spec.supplierDiscontinued,
      successorProductUrl: spec.successorProductUrl,
      lotBatch: spec.lotBatch,
      careInstructions: spec.careInstructions,
      quantityRemaining: spec.quantityRemaining,
      remainingStorageLocation: spec.remainingStorageLocation,
      asOf: (spec.verifiedAt ?? spec.updatedAt).toISOString(),
    }));
    sections.push({
      sectionType: PropertyBriefSectionType.MATERIAL_SPECS,
      title: sectionTitle('MATERIAL_SPECS'),
      payload: json({ items, excludedFields: ['purchase price', 'purchase date', 'quantity purchased'] }),
      sensitive: false,
      asOf: input.asOf,
      evidence: specs.map((spec) => ({
        itemKey: spec.id,
        sourceEntityType: 'MATERIAL_SPEC',
        sourceEntityId: spec.id,
        sourceLabel: 'Verified as-built material record',
        sourceAsOf: spec.verifiedAt ?? spec.updatedAt,
        verification: spec.verificationConfidence,
      })),
    });
  }

  if (input.selectedSections.includes('PERMITS')) {
    const permits = await prisma.propertyPermitRecord.findMany({
      where: { propertyId: input.propertyId, isVerified: true, isActive: true },
      orderBy: { issueDate: 'desc' },
      take: 25,
    });
    const items = permits.map((permit) => ({
      key: permit.id,
      permitNumber: permit.permitNumber,
      category: permit.category,
      workTypes: permit.workTypes,
      description: permit.description,
      status: permit.status,
      contractorName: permit.contractorName,
      issueDate: permit.issueDate?.toISOString() ?? null,
      finaledDate: permit.finaledDate?.toISOString() ?? null,
      asOf: permit.updatedAt.toISOString(),
    }));
    sections.push({
      sectionType: PropertyBriefSectionType.PERMITS,
      title: sectionTitle('PERMITS'),
      payload: json({ items, excludedFields: ['estimated cost', 'final cost'] }),
      sensitive: false,
      asOf: input.asOf,
      evidence: permits.map((permit) => ({
        itemKey: permit.id,
        sourceEntityType: 'PERMIT',
        sourceEntityId: permit.id,
        sourceLabel: 'Verified permit record',
        sourceAsOf: permit.officialObservedAt ?? permit.updatedAt,
        verification: 'VERIFIED',
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
          recipientName: true, recipientEmail: true, invitationStatus: true,
          acceptedAt: true, lastTestedAt: true,
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
  const brief = await findOwnedBrief(propertyId, userId, briefId);
  return {
    ...brief,
    safetyTier: derivePropertyIntelligenceSafetyTier({ sharesSensitivePropertyData: true }),
  };
}

export async function createPropertyBriefShare(input: {
  propertyId: string;
  userId: string;
  briefId: string;
  expiresInDays: number;
  downloadPolicy: 'VIEW_ONLY' | 'ALLOW_DOWNLOAD';
  sensitiveDataAcknowledged: true;
  recipientName?: string | null;
  recipientEmail?: string | null;
}) {
  const brief = await findOwnedBrief(input.propertyId, input.userId, input.briefId);
  if (brief.status === PropertyBriefStatus.ARCHIVED) {
    throw new APIError('Archived briefs cannot be shared.', 409, 'PROPERTY_BRIEF_ARCHIVED');
  }
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
  // A share with a named recipient is a real invitation, not just an
  // anonymous link — "accepted" (set the first time the link is opened, see
  // getSharedPropertyBrief) is the closest thing to identity binding without
  // requiring the recipient to hold a platform account: only someone with
  // access to that specific emailed link can accept it.
  const hasRecipient = Boolean(input.recipientEmail?.trim());
  const share = await prisma.$transaction(async (tx) => {
    const created = await tx.propertyBriefShare.create({
      data: {
        briefId: brief.id,
        propertyId: input.propertyId,
        createdByUserId: input.userId,
        tokenHash: tokenHash(token),
        expiresAt,
        downloadPolicy: input.downloadPolicy as PropertyBriefDownloadPolicy,
        recipientName: input.recipientName?.trim() || null,
        recipientEmail: input.recipientEmail?.trim() || null,
        invitationStatus: hasRecipient ? 'PENDING' : 'NOT_SET',
        invitedAt: hasRecipient ? new Date() : null,
      },
      select: {
        id: true, status: true, expiresAt: true, downloadPolicy: true, createdAt: true,
        recipientName: true, recipientEmail: true, invitationStatus: true,
      },
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
      hasRecipient,
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
          property: { select: { name: true, address: true, city: true, state: true, zipCode: true } },
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
  // First real open of an invited link is the acceptance event — distinct
  // from accessCount/lastAccessedAt, which also move on every later visit
  // and are deliberately left untouched by the owner's "test access" check.
  const isFirstAcceptance = share.invitationStatus === 'PENDING';
  await prisma.$transaction([
    prisma.propertyBriefShare.update({
      where: { id: share.id },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: now,
        ...(isFirstAcceptance ? { invitationStatus: 'ACCEPTED', acceptedAt: now } : {}),
      },
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
    recipientName: share.recipientName,
    safetyTier: derivePropertyIntelligenceSafetyTier({ sharesSensitivePropertyData: true }),
  };
}

export async function testPropertyBriefShareAccess(input: {
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

  const now = new Date();
  const failureReason = share.status === PropertyBriefShareStatus.REVOKED
    ? 'SHARE_REVOKED'
    : share.status === PropertyBriefShareStatus.EXPIRED || share.expiresAt <= now
      ? 'SHARE_EXPIRED'
      : null;

  // Deliberately does not touch accessCount/lastAccessedAt — this is the
  // owner verifying the link still works, not a real recipient visit.
  const updated = await prisma.propertyBriefShare.update({
    where: { id: share.id },
    data: { lastTestedAt: now, lastTestedByUserId: input.userId },
    select: { id: true, lastTestedAt: true, status: true, expiresAt: true },
  });
  return { ...updated, accessible: failureReason === null, failureReason };
}

function printable(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  if (Array.isArray(value)) return value.map(printable).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value)
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7E]/g, ' ');
}

export async function renderPropertyBriefPdf(brief: Awaited<ReturnType<typeof getSharedPropertyBrief>>) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 612;
  const height = 792;
  const margin = 48;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const ensureSpace = (needed = 40) => {
    if (y - needed >= margin) return;
    page = pdf.addPage([width, height]);
    y = height - margin;
  };
  const linesFor = (text: string, size: number, maxWidth: number, font = regular) => {
    const words = printable(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines.length > 0 ? lines : [''];
  };
  const drawText = (text: string, options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = options.size ?? 10;
    const font = options.bold ? bold : regular;
    const lines = linesFor(text, size, width - margin * 2, font);
    ensureSpace(lines.length * (size + 3) + (options.gap ?? 5));
    for (const line of lines) {
      page.drawText(line, { x: margin, y, size, font, color: options.color ?? rgb(0.15, 0.2, 0.27) });
      y -= size + 3;
    }
    y -= options.gap ?? 5;
  };

  drawText('PROPERTY BRIEF', { size: 9, bold: true, color: rgb(0.02, 0.42, 0.55), gap: 8 });
  drawText(brief.title, { size: 20, bold: true, gap: 10 });
  drawText(
    `${brief.property.name ?? 'Home'} - ${brief.property.address}, ${brief.property.city}, ${brief.property.state} ${brief.property.zipCode}`,
    { size: 11, bold: true },
  );
  drawText('Property identity from the homeowner record; evidence-verified facts are labeled separately.', { size: 8, color: rgb(0.4, 0.43, 0.47) });
  drawText(`Purpose: ${printable(brief.purpose)} | Snapshot: ${new Date(brief.asOf).toISOString()} | Expires: ${new Date(brief.expiresAt).toISOString()}`, { size: 8, color: rgb(0.35, 0.4, 0.46), gap: 12 });

  for (const section of brief.sections) {
    ensureSpace(60);
    drawText(section.title, { size: 14, bold: true, color: rgb(0.02, 0.35, 0.48), gap: 6 });
    const payload = section.payload && typeof section.payload === 'object' && !Array.isArray(section.payload)
      ? section.payload as Record<string, unknown>
      : {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0) drawText('No eligible records were included.', { size: 9 });
    for (const rawItem of items) {
      const item = rawItem && typeof rawItem === 'object' && !Array.isArray(rawItem)
        ? rawItem as Record<string, unknown>
        : {};
      const summary = Object.entries(item)
        .filter(([key, value]) => !['key', 'asOf', 'source', 'verification'].includes(key) && value != null)
        .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${printable(value)}`)
        .join(' | ');
      drawText(`- ${summary || 'Recorded item'}`, { size: 9, gap: 3 });
    }
    if (payload.completenessBoundary) drawText(printable(payload.completenessBoundary), { size: 8, color: rgb(0.4, 0.43, 0.47) });
    if (Array.isArray(payload.excludedFields)) drawText(`Excluded fields: ${payload.excludedFields.map(printable).join(', ')}`, { size: 8, color: rgb(0.4, 0.43, 0.47) });
    y -= 5;
  }

  ensureSpace(90);
  drawText('IMPORTANT LIMITATIONS', { size: 11, bold: true, color: rgb(0.55, 0.27, 0.02) });
  drawText(brief.limitationStatement, { size: 8, color: rgb(0.35, 0.25, 0.12) });
  drawText('This controlled copy may contain sensitive property information. Verify independently before making safety, financial, insurance, or purchase decisions.', { size: 8, bold: true });

  return pdf.save();
}
