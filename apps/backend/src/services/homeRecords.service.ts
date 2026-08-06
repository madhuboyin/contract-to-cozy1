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
import { auditLog, logger } from '../lib/logger';
import { APIError } from '../middleware/error.middleware';
import { uploadPropertyRecordVersionBuffer } from './storage/reportStorage';
import { presignGetObject } from './storage/presign';
import { syncPropertyRecordWorkItem } from '../modules/homeOperations/adapters/propertyRecord.adapter';

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
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
};

type ListOptions = {
  lifecycleStatus?: string;
  search?: string;
  recordType?: PropertyRecordType;
};

type ExpiryStatus = 'EXPIRED' | 'EXPIRING_SOON' | 'CURRENT' | null;

const EXPIRING_SOON_WINDOW_DAYS = 30;

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
    manageEffectivePeriod: canMutate && lifecycleStatus !== 'TRASHED',
  };
}

function visibleWhere(role: HouseholdRole) {
  return role === 'OWNER' ? {} : { visibility: 'HOUSEHOLD' as const };
}

function expiryStatus(effectiveTo: Date | null, now: Date, soonThreshold: Date): ExpiryStatus {
  if (!effectiveTo) return null;
  if (effectiveTo < now) return 'EXPIRED';
  if (effectiveTo <= soonThreshold) return 'EXPIRING_SOON';
  return 'CURRENT';
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
  // Batched rather than per-record so list() stays a single extra query
  // regardless of how many records are on the page.
  private async pendingReviewCountsByVersionId(versionIds: string[]): Promise<Map<string, number>> {
    if (versionIds.length === 0) return new Map();
    const grouped = await prisma.extractedFactCandidate.groupBy({
      by: ['propertyRecordVersionId'],
      where: {
        propertyRecordVersionId: { in: versionIds },
        reviewStatus: 'PENDING',
        fieldKey: { not: '_documentType' },
      },
      _count: { _all: true },
    });
    return new Map(grouped.map((row) => [row.propertyRecordVersionId, row._count._all]));
  }

  async list(propertyId: string, role: HouseholdRole, options?: ListOptions) {
    const { lifecycleStatus, search, recordType } = options ?? {};
    const records = await prisma.propertyRecord.findMany({
      where: {
        propertyId,
        ...visibleWhere(role),
        ...(lifecycleStatus ? { lifecycleStatus: lifecycleStatus as any } : {
          lifecycleStatus: { not: 'TRASHED' },
        }),
        ...(recordType ? { recordType } : {}),
        ...(search?.trim() ? {
          OR: [
            { title: { contains: search.trim(), mode: 'insensitive' as const } },
            { description: { contains: search.trim(), mode: 'insensitive' as const } },
            // Slice 4: full-text — searches the actual document content
            // (see extractVersionText), not just what was typed at upload.
            // Null on records where extraction hasn't run or failed, so
            // those still only match on title/description above.
            { currentVersion: { extractedText: { contains: search.trim(), mode: 'insensitive' as const } } },
          ],
        } : {}),
      },
      include: {
        currentVersion: true,
        _count: { select: { versions: true, links: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const pendingCounts = await this.pendingReviewCountsByVersionId(
      records.map((record) => record.currentVersionId).filter((id): id is string => Boolean(id)),
    );
    const now = new Date();
    const soonThreshold = new Date(now.getTime() + EXPIRING_SOON_WINDOW_DAYS * 86_400_000);

    return Promise.all(records.map(async (record) => ({
      ...record,
      currentVersion: record.currentVersion
        ? await publicVersion(record.currentVersion)
        : null,
      allowedActions: allowedActions(role, record.lifecycleStatus),
      needsReview: record.currentVersionId
        ? (pendingCounts.get(record.currentVersionId) ?? 0) > 0
        : false,
      expiryStatus: expiryStatus(record.effectiveTo, now, soonThreshold),
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
    const now = new Date();
    const soonThreshold = new Date(now.getTime() + EXPIRING_SOON_WINDOW_DAYS * 86_400_000);
    const pendingCount = record.currentVersionId
      ? (await this.pendingReviewCountsByVersionId([record.currentVersionId])).get(record.currentVersionId) ?? 0
      : 0;

    return {
      ...record,
      currentVersion: record.currentVersion
        ? await publicVersion(record.currentVersion)
        : null,
      versions: record.versions.map((version) => ({ ...version, storageKey: undefined })),
      links,
      allowedActions: allowedActions(role, record.lifecycleStatus),
      needsReview: pendingCount > 0,
      expiryStatus: expiryStatus(record.effectiveTo, now, soonThreshold),
      deletionImpact: {
        activeLinkCount: record.links.length,
        requiresImpactDecision: record.links.length > 0,
        legalHold: Boolean(record.legalHoldReason),
        retainUntil: record.retainUntil,
        brokenLinkCount,
      },
    };
  }

  // Slice 3's real duplicate/version resolution flow: a pre-flight check the
  // frontend calls *before* uploading, so a homeowner can choose "add as a
  // new version of X" and never create a redundant standalone record in the
  // first place — instead of create()'s own possibleVersionOf hint, which
  // only ever surfaced as an after-the-fact toast once the duplicate
  // already existed.
  async checkPossibleVersion(propertyId: string, title: string, recordType: PropertyRecordType) {
    return this.findPossibleVersionMatch(propertyId, title, recordType);
  }

  private async findPossibleVersionMatch(propertyId: string, title: string, recordType: PropertyRecordType) {
    return prisma.propertyRecord.findFirst({
      where: {
        propertyId,
        lifecycleStatus: { not: 'TRASHED' },
        recordType,
        title: { equals: title, mode: 'insensitive' },
      },
      select: { id: true, title: true, currentVersionId: true },
    });
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

    const possibleVersionOf = await this.findPossibleVersionMatch(input.propertyId, input.title, input.recordType);

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
        effectiveFrom: input.effectiveFrom ?? null,
        effectiveTo: input.effectiveTo ?? null,
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
            // Route-level magic-byte/content validation and content-threat
            // heuristics (validateDocumentUpload → scanBufferForThreats:
            // embedded executables, PDF active-content actions, EICAR test
            // signature) already ran before this service is invoked. This is
            // not a signature-based antivirus engine — CLEAN means "passed
            // those checks," not "verified virus-free."
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

    this.extractVersionText(versionId, input.file.buffer, input.file.mimetype);

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
        // See the comment on the record-creation path above — CLEAN means
        // magic-byte + content-threat heuristics passed, not full AV scanning.
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

    this.extractVersionText(versionId, input.file.buffer, input.file.mimetype);

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
      auditLog('HOME_RECORD_EVIDENCE_TRASH_BLOCKED', input.userId, {
        propertyId: input.propertyId,
        recordId: input.recordId,
        activeLinkCount: record._count.links,
      });
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
    // Leaving ACTIVE scope means it can no longer represent open work.
    await this.syncWorkItem(input.propertyId, input.recordId);
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

  async setEffectivePeriod(input: {
    propertyId: string;
    recordId: string;
    effectiveFrom?: Date | null;
    effectiveTo?: Date | null;
  }) {
    const result = await prisma.propertyRecord.updateMany({
      where: { id: input.recordId, propertyId: input.propertyId },
      data: {
        ...(input.effectiveFrom !== undefined ? { effectiveFrom: input.effectiveFrom } : {}),
        ...(input.effectiveTo !== undefined ? { effectiveTo: input.effectiveTo } : {}),
      },
    });
    if (result.count !== 1) {
      throw new APIError('Record not found.', 404, 'PROPERTY_RECORD_NOT_FOUND');
    }
    await this.syncWorkItem(input.propertyId, input.recordId);
  }

  // Home Continuity plan §8 (Slice 4) bridge into Home Operations — best
  // effort, never throws, never blocks the Home Records write that
  // triggered it. get() doesn't filter by lifecycleStatus, so a record
  // that just left ACTIVE scope (trashed/archived) is forced to look
  // "resolved" here regardless of its needsReview/expiryStatus — it can no
  // longer represent open work once it's not the active record.
  private async syncWorkItem(propertyId: string, recordId: string): Promise<void> {
    try {
      const record = await this.get(propertyId, recordId, 'OWNER');
      const isActive = record.lifecycleStatus === 'ACTIVE';
      await syncPropertyRecordWorkItem(propertyId, {
        id: record.id,
        title: record.title,
        recordType: record.recordType,
        sensitivity: record.sensitivity,
        needsReview: isActive && record.needsReview,
        expiryStatus: isActive ? record.expiryStatus : null,
        effectiveTo: record.effectiveTo,
      });
    } catch (err) {
      logger.warn({ err, propertyId, recordId }, 'Home Operations record-review sync failed after a Home Records write');
    }
  }

  // Slice 4 (§8): "add OCR/full-text and structured search". Fire-and-forget
  // from create()/addVersion() — never awaited by the caller, so a slow or
  // failed AI call never adds latency to (or fails) the upload response.
  // Deliberately a lazy require, not a top-level import: documentIntelligence
  // .service.ts constructs its singleton eagerly and throws if GEMINI_API_KEY
  // is unset, which would otherwise break every caller of this file (Sale
  // Case, the Home Actions bridge, etc.) at module-load time in any
  // environment/test that doesn't set the key — this file has never
  // depended on that key before and shouldn't start requiring it just to
  // be imported.
  private extractVersionText(versionId: string, buffer: Buffer, mimeType: string): void {
    void (async () => {
      try {
        const { documentIntelligenceService } = require('./documentIntelligence.service') as typeof import('./documentIntelligence.service');
        const result = await documentIntelligenceService.extractFullText(buffer, mimeType);
        if (!result?.text) return;
        await prisma.propertyRecordVersion.update({
          where: { id: versionId },
          data: { extractedText: result.text, textExtractedAt: new Date() },
        });
      } catch (err) {
        logger.warn({ err, versionId }, 'Full-text extraction failed; record remains searchable by title/description only');
      }
    })();
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
        case 'EXPENSE': return prisma.expense.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
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
