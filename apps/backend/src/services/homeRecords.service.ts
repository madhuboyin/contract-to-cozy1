import { createHash, randomUUID } from 'node:crypto';
import type {
  HouseholdRole,
  PropertyRecordLinkEntityType,
  PropertyRecordLinkPurpose,
  PropertyRecordSensitivity,
  PropertyRecordType,
  PropertyRecordVisibility,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { uploadPropertyRecordVersionBuffer } from './storage/reportStorage';
import { presignGetObject } from './storage/presign';

const TRASH_RECOVERY_DAYS = 30;

type RecordFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

type CreateRecordInput = {
  propertyId: string;
  userId: string;
  file: RecordFile;
  title: string;
  description?: string | null;
  recordType: PropertyRecordType;
  sensitivity: PropertyRecordSensitivity;
  visibility: PropertyRecordVisibility;
  retainUntil?: Date | null;
};

type CreateVersionInput = {
  propertyId: string;
  recordId: string;
  userId: string;
  file: RecordFile;
};

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function sanitizedFileName(fileName: string): string {
  return fileName
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9.\-_]/g, '_')
    .slice(-180);
}

function storageKey(input: {
  propertyId: string;
  recordId: string;
  versionId: string;
  fileName: string;
}): string {
  return [
    'property-records',
    input.propertyId,
    input.recordId,
    input.versionId,
    sanitizedFileName(input.fileName),
  ].join('/');
}

function allowedActions(role: HouseholdRole, lifecycleStatus: string) {
  const canMutate = role === 'OWNER' || role === 'CONTRIBUTOR';
  return {
    read: true,
    addVersion: canMutate && lifecycleStatus !== 'TRASHED',
    link: canMutate && lifecycleStatus !== 'TRASHED',
    archive: canMutate && lifecycleStatus === 'ACTIVE',
    trash: canMutate && lifecycleStatus !== 'TRASHED',
    restore: canMutate && lifecycleStatus === 'TRASHED',
    manageRetention: role === 'OWNER',
  };
}

function visibleWhere(role: HouseholdRole) {
  return role === 'OWNER' ? {} : { visibility: 'HOUSEHOLD' as const };
}

async function signedUrl(storageKeyValue: string, fileName: string) {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null;
  return presignGetObject({
    bucket,
    key: storageKeyValue,
    expiresInSeconds: 900,
    downloadFilename: fileName,
  });
}

async function publicVersion<T extends {
  storageKey: string;
  originalFileName: string;
  scanStatus: string;
  integrityStatus: string;
}>(version: T) {
  const available = version.scanStatus === 'CLEAN' && version.integrityStatus === 'VERIFIED';
  return {
    ...version,
    storageKey: undefined,
    downloadUrl: available
      ? await signedUrl(version.storageKey, version.originalFileName)
      : null,
    availability: available ? 'AVAILABLE' : version.scanStatus,
  };
}

export class HomeRecordsService {
  async list(propertyId: string, role: HouseholdRole, lifecycleStatus?: string) {
    const records = await prisma.propertyRecord.findMany({
      where: {
        propertyId,
        ...visibleWhere(role),
        ...(lifecycleStatus ? { lifecycleStatus: lifecycleStatus as any } : {
          lifecycleStatus: { not: 'TRASHED' },
        }),
      },
      include: {
        currentVersion: true,
        _count: { select: { versions: true, links: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return Promise.all(records.map(async (record) => ({
      ...record,
      currentVersion: record.currentVersion
        ? await publicVersion(record.currentVersion)
        : null,
      allowedActions: allowedActions(role, record.lifecycleStatus),
    })));
  }

  async get(propertyId: string, recordId: string, role: HouseholdRole) {
    const record = await prisma.propertyRecord.findFirst({
      where: { id: recordId, propertyId, ...visibleWhere(role) },
      include: {
        currentVersion: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: { extractedFacts: { orderBy: { createdAt: 'asc' } } },
        },
        links: { orderBy: { createdAt: 'asc' } },
        purgeJobs: { orderBy: { requestedAt: 'desc' }, take: 1 },
      },
    });
    if (!record) throw new APIError('Record not found.', 404, 'PROPERTY_RECORD_NOT_FOUND');

    const links = await Promise.all(record.links.map(async (link) => ({
      ...link,
      // OTHER has no canonical table, so its health can never be determined —
      // it is neither reported healthy nor broken.
      broken: link.entityType === 'OTHER'
        ? null
        : !(await this.entityExists(propertyId, link.entityType, link.entityId)),
    })));
    const brokenLinkCount = links.filter((link) => link.broken === true).length;

    return {
      ...record,
      currentVersion: record.currentVersion
        ? await publicVersion(record.currentVersion)
        : null,
      versions: record.versions.map((version) => ({ ...version, storageKey: undefined })),
      links,
      allowedActions: allowedActions(role, record.lifecycleStatus),
      deletionImpact: {
        activeLinkCount: record.links.length,
        requiresImpactDecision: record.links.length > 0,
        legalHold: Boolean(record.legalHoldReason),
        retainUntil: record.retainUntil,
        brokenLinkCount,
      },
    };
  }

  async create(input: CreateRecordInput) {
    const checksum = sha256(input.file.buffer);
    const duplicate = await prisma.propertyRecordVersion.findFirst({
      where: { sha256: checksum, record: { propertyId: input.propertyId } },
      select: { id: true, recordId: true, versionNumber: true },
    });
    if (duplicate) {
      throw new APIError(
        'This exact file already exists in Home Records.',
        409,
        'PROPERTY_RECORD_DUPLICATE_CONTENT',
        duplicate,
      );
    }

    const possibleVersionOf = await prisma.propertyRecord.findFirst({
      where: {
        propertyId: input.propertyId,
        lifecycleStatus: { not: 'TRASHED' },
        recordType: input.recordType,
        title: { equals: input.title, mode: 'insensitive' },
      },
      select: { id: true, title: true, currentVersionId: true },
    });

    const recordId = randomUUID();
    const versionId = randomUUID();
    const key = storageKey({
      propertyId: input.propertyId,
      recordId,
      versionId,
      fileName: input.file.originalname,
    });

    await prisma.propertyRecord.create({
      data: {
        id: recordId,
        propertyId: input.propertyId,
        title: input.title,
        description: input.description ?? null,
        recordType: input.recordType,
        sensitivity: input.sensitivity,
        visibility: input.visibility,
        createdByUserId: input.userId,
        retainUntil: input.retainUntil ?? null,
        versions: {
          create: {
            id: versionId,
            versionNumber: 1,
            storageKey: key,
            originalFileName: input.file.originalname,
            mimeType: input.file.mimetype,
            fileSizeBytes: input.file.size,
            sha256: checksum,
            uploadedByUserId: input.userId,
            // Route-level magic-byte/content validation (validateDocumentUpload)
            // already ran before this service is invoked, so the upload is
            // clean by the time a version row exists.
            scanStatus: 'CLEAN',
          },
        },
      },
    });

    try {
      const stored = await uploadPropertyRecordVersionBuffer({
        buffer: input.file.buffer,
        storageKey: key,
        fileName: input.file.originalname,
        mimeType: input.file.mimetype,
        propertyId: input.propertyId,
        recordId,
        versionId,
        checksumSha256: checksum,
        userId: input.userId,
      });
      await prisma.$transaction([
        prisma.propertyRecordVersion.update({
          where: { id: versionId },
          data: {
            storageEtag: stored.storageEtag,
            integrityStatus: 'VERIFIED',
          },
        }),
        prisma.propertyRecord.update({
          where: { id: recordId },
          data: { currentVersionId: versionId },
        }),
      ]);
    } catch (error) {
      await prisma.propertyRecordVersion.update({
        where: { id: versionId },
        data: { scanStatus: 'FAILED' },
      }).catch(() => undefined);
      throw error;
    }

    const created = await prisma.propertyRecord.findUniqueOrThrow({
        where: { id: recordId },
        include: { currentVersion: true },
      });
    return {
      record: {
        ...created,
        currentVersion: created.currentVersion
          ? await publicVersion(created.currentVersion)
          : null,
      },
      possibleVersionOf,
    };
  }

  async addVersion(input: CreateVersionInput) {
    const checksum = sha256(input.file.buffer);
    const record = await prisma.propertyRecord.findFirst({
      where: { id: input.recordId, propertyId: input.propertyId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!record) throw new APIError('Record not found.', 404, 'PROPERTY_RECORD_NOT_FOUND');
    if (record.lifecycleStatus === 'TRASHED') {
      throw new APIError('Restore the record before adding a version.', 409, 'PROPERTY_RECORD_TRASHED');
    }
    if (record.versions[0]?.sha256 === checksum) {
      throw new APIError('This file matches the current version.', 409, 'PROPERTY_RECORD_VERSION_DUPLICATE');
    }

    const versionId = randomUUID();
    const nextVersionNumber = (record.versions[0]?.versionNumber ?? 0) + 1;
    const key = storageKey({
      propertyId: input.propertyId,
      recordId: input.recordId,
      versionId,
      fileName: input.file.originalname,
    });

    await prisma.propertyRecordVersion.create({
      data: {
        id: versionId,
        recordId: input.recordId,
        versionNumber: nextVersionNumber,
        storageKey: key,
        originalFileName: input.file.originalname,
        mimeType: input.file.mimetype,
        fileSizeBytes: input.file.size,
        sha256: checksum,
        uploadedByUserId: input.userId,
        supersedesVersionId: record.currentVersionId,
        scanStatus: 'CLEAN',
      },
    });

    try {
      const stored = await uploadPropertyRecordVersionBuffer({
        buffer: input.file.buffer,
        storageKey: key,
        fileName: input.file.originalname,
        mimeType: input.file.mimetype,
        propertyId: input.propertyId,
        recordId: input.recordId,
        versionId,
        checksumSha256: checksum,
        userId: input.userId,
      });
      await prisma.$transaction([
        prisma.propertyRecordVersion.update({
          where: { id: versionId },
          data: { storageEtag: stored.storageEtag, integrityStatus: 'VERIFIED' },
        }),
        prisma.propertyRecord.update({
          where: { id: input.recordId },
          data: { currentVersionId: versionId },
        }),
      ]);
    } catch (error) {
      await prisma.propertyRecordVersion.update({
        where: { id: versionId },
        data: { scanStatus: 'FAILED' },
      }).catch(() => undefined);
      throw error;
    }

    return prisma.propertyRecordVersion.findUniqueOrThrow({ where: { id: versionId } });
  }

  async addLink(input: {
    propertyId: string;
    recordId: string;
    userId: string;
    entityType: PropertyRecordLinkEntityType;
    entityId: string;
    purpose: PropertyRecordLinkPurpose;
    versionId?: string | null;
    label?: string | null;
  }) {
    const record = await prisma.propertyRecord.findFirst({
      where: { id: input.recordId, propertyId: input.propertyId, lifecycleStatus: { not: 'TRASHED' } },
      select: { id: true, currentVersionId: true },
    });
    if (!record) throw new APIError('Active record not found.', 404, 'PROPERTY_RECORD_NOT_FOUND');
    await this.assertEntityScope(input.propertyId, input.entityType, input.entityId);

    const versionId = input.versionId ?? record.currentVersionId;
    if (versionId) {
      const version = await prisma.propertyRecordVersion.findFirst({
        where: { id: versionId, recordId: input.recordId },
        select: { id: true },
      });
      if (!version) throw new APIError('Record version not found.', 404, 'PROPERTY_RECORD_VERSION_NOT_FOUND');
    }

    return prisma.propertyRecordLink.create({
      data: {
        recordId: input.recordId,
        versionId,
        entityType: input.entityType,
        entityId: input.entityId,
        purpose: input.purpose,
        label: input.label ?? null,
        createdByUserId: input.userId,
      },
    });
  }

  async removeLink(propertyId: string, recordId: string, linkId: string) {
    const link = await prisma.propertyRecordLink.findFirst({
      where: { id: linkId, recordId, record: { propertyId } },
      select: { id: true },
    });
    if (!link) throw new APIError('Record link not found.', 404, 'PROPERTY_RECORD_LINK_NOT_FOUND');
    await prisma.propertyRecordLink.delete({ where: { id: linkId } });
  }

  async archive(propertyId: string, recordId: string) {
    const result = await prisma.propertyRecord.updateMany({
      where: { id: recordId, propertyId, lifecycleStatus: 'ACTIVE' },
      data: { lifecycleStatus: 'ARCHIVED', archivedAt: new Date() },
    });
    if (result.count !== 1) throw new APIError('Active record not found.', 404, 'PROPERTY_RECORD_NOT_FOUND');
  }

  async trash(input: {
    propertyId: string;
    recordId: string;
    userId: string;
    impactDecision?: 'KEEP_LINKS' | 'REMOVE_LINKS';
  }) {
    const record = await prisma.propertyRecord.findFirst({
      where: { id: input.recordId, propertyId: input.propertyId },
      include: { _count: { select: { links: true } } },
    });
    if (!record) throw new APIError('Record not found.', 404, 'PROPERTY_RECORD_NOT_FOUND');
    if (record._count.links > 0 && !input.impactDecision) {
      throw new APIError(
        'This record is active evidence. Choose how its links should be handled before trashing it.',
        409,
        'PROPERTY_RECORD_EVIDENCE_IMPACT_DECISION_REQUIRED',
        { activeLinkCount: record._count.links },
      );
    }

    const recoveryEligibleAt = new Date(Date.now() + TRASH_RECOVERY_DAYS * 86_400_000);
    const eligibleAt = record.retainUntil && record.retainUntil > recoveryEligibleAt
      ? record.retainUntil
      : recoveryEligibleAt;
    const blockedReason = record.legalHoldReason
      ? `Legal hold: ${record.legalHoldReason}`
      : null;

    await prisma.$transaction(async (tx) => {
      if (input.impactDecision === 'REMOVE_LINKS') {
        await tx.propertyRecordLink.deleteMany({ where: { recordId: input.recordId } });
      }
      await tx.propertyRecord.update({
        where: { id: input.recordId },
        data: {
          lifecycleStatus: 'TRASHED',
          trashedAt: new Date(),
          trashedByUserId: input.userId,
        },
      });
      await tx.propertyRecordPurgeJob.create({
        data: {
          recordId: input.recordId,
          requestedByUserId: input.userId,
          state: blockedReason ? 'BLOCKED' : 'PENDING',
          eligibleAt: blockedReason ? null : eligibleAt,
          blockedReason,
        },
      });
    });
  }

  async restore(propertyId: string, recordId: string) {
    await prisma.$transaction(async (tx) => {
      const result = await tx.propertyRecord.updateMany({
        where: { id: recordId, propertyId, lifecycleStatus: 'TRASHED' },
        data: { lifecycleStatus: 'ACTIVE', trashedAt: null, trashedByUserId: null },
      });
      if (result.count !== 1) throw new APIError('Trashed record not found.', 404, 'PROPERTY_RECORD_NOT_FOUND');
      await tx.propertyRecordPurgeJob.updateMany({
        where: { recordId, state: { in: ['PENDING', 'ELIGIBLE', 'BLOCKED'] } },
        data: { state: 'BLOCKED', blockedReason: 'Record restored by household member.' },
      });
    });
  }

  async setRetention(input: {
    propertyId: string;
    recordId: string;
    retainUntil?: Date | null;
    legalHoldReason?: string | null;
  }) {
    const result = await prisma.propertyRecord.updateMany({
      where: { id: input.recordId, propertyId: input.propertyId },
      data: {
        ...(input.retainUntil !== undefined ? { retainUntil: input.retainUntil } : {}),
        ...(input.legalHoldReason !== undefined
          ? { legalHoldReason: input.legalHoldReason?.trim() || null }
          : {}),
      },
    });
    if (result.count !== 1) {
      throw new APIError('Record not found.', 404, 'PROPERTY_RECORD_NOT_FOUND');
    }

    if (input.legalHoldReason) {
      await prisma.propertyRecordPurgeJob.updateMany({
        where: {
          recordId: input.recordId,
          state: { in: ['PENDING', 'ELIGIBLE'] },
        },
        data: {
          state: 'BLOCKED',
          eligibleAt: null,
          blockedReason: `Legal hold: ${input.legalHoldReason.trim()}`,
        },
      });
    }
  }

  // Shared by assertEntityScope (link-creation guard) and get() (broken-link
  // health check on read) so both use one definition of "still resolves."
  private async entityExists(
    propertyId: string,
    entityType: PropertyRecordLinkEntityType,
    entityId: string,
  ): Promise<boolean> {
    const found = await (async () => {
      switch (entityType) {
        case 'HOME_EVENT': return prisma.homeEvent.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
        case 'INVENTORY_ITEM': return prisma.inventoryItem.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
        case 'MATERIAL_SPEC': return prisma.materialSpec.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
        case 'PROJECT': return prisma.projectRecord.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
        case 'WARRANTY': return prisma.warranty.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
        case 'INSURANCE_POLICY': return prisma.insurancePolicy.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
        case 'CLAIM': return prisma.claim.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
        case 'PERMIT': return prisma.propertyPermitRecord.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
        case 'PROPERTY_BRIEF': return prisma.propertyBrief.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
        // OTHER has no canonical table to verify against; the caller-supplied
        // entityId is opaque and always treated as existing.
        case 'OTHER': return { id: entityId };
      }
    })();
    return Boolean(found);
  }

  private async assertEntityScope(
    propertyId: string,
    entityType: PropertyRecordLinkEntityType,
    entityId: string,
  ) {
    const exists = await this.entityExists(propertyId, entityType, entityId);
    if (!exists) {
      throw new APIError(
        'Linked entity was not found for this property or is not supported.',
        422,
        'PROPERTY_RECORD_LINK_SCOPE_INVALID',
      );
    }
  }
}

export const homeRecordsService = new HomeRecordsService();
