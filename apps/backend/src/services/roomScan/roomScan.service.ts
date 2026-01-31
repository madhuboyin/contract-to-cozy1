// apps/backend/src/services/roomScan/roomScan.service.ts
import { prisma } from '../../lib/prisma';
import { APIError } from '../../middleware/error.middleware';
import sharp from 'sharp';
import crypto from 'crypto';
import { getRoomScanProvider } from './provider';
import { presignGetObject } from '../storage/presign';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

function envInt(key: string, dflt: number) {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}
function envTrue(name: string) {
  return String(process.env[name] || '').toLowerCase() === 'true';
}
function envBool(key: string, dflt = false) {
  const v = String(process.env[key] ?? '').toLowerCase().trim();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return dflt;
}
function envFloat(key: string, dflt: number) {
  const n = Number(process.env[key]);
  return Number.isFinite(n) ? n : dflt;
}
function simpleNameNorm(s: string) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
function normLabel(s: string) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function dedupeKey(label: string) {
  return normLabel(label).replace(/\s+/g, '_');
}
function sha1(buf: Buffer) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function groupForLabel(label: string): { groupKey: string; groupLabel: string } {
  const n = simpleNameNorm(label);

  if (n.includes('pillow') || n.includes('cushion')) return { groupKey: 'BEDDING', groupLabel: 'Bedding' };
  if (n.includes('blanket') || n.includes('comforter') || n.includes('duvet')) return { groupKey: 'BEDDING', groupLabel: 'Bedding' };

  if (n.includes('sofa') || n.includes('couch') || n.includes('armchair') || n.includes('chair')) {
    return { groupKey: 'SEATING', groupLabel: 'Seating' };
  }

  if (n.includes('dresser') || n.includes('cabinet') || n.includes('shelf') || n.includes('bookcase')) {
    return { groupKey: 'STORAGE', groupLabel: 'Storage' };
  }

  if (n.includes('lamp') || n.includes('light')) return { groupKey: 'LIGHTING', groupLabel: 'Lighting' };

  return { groupKey: `ITEM_${dedupeKey(label)}`, groupLabel: 'Other' };
}

function normalizeInventoryCategory(v: any): any | null {
  const up = String(v ?? '').toUpperCase().trim();
  const allowed = new Set([
    'APPLIANCE',
    'ELECTRONICS',
    'FURNITURE',
    'HVAC',
    'PLUMBING',
    'SECURITY',
    'TOOL',
    'DOCUMENT',
    'OTHER',
  ]);
  if (!up) return null;
  return allowed.has(up) ? up : 'OTHER';
}

function getS3(): { client: S3Client; bucket: string; prefix: string } | null {
  if (process.env.INVENTORY_ROOM_SCAN_STORE_IMAGES !== 'true') return null;
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null;

  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || 'us-east-1';

  const client = new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    },
  });

  return { client, bucket, prefix: process.env.S3_PREFIX || 'inventory-room-scan' };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeItems(items: any): any[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      label: String(it?.label || '').trim(),
      category: it?.category ? String(it.category).trim() : undefined,
      confidence: typeof it?.confidence === 'number' ? it.confidence : undefined,
      boxes: Array.isArray(it?.boxes) ? it.boxes : [],
      explanation: it?.explanation,
    }))
    .filter((it) => it.label);
}

function isTransientGeminiError(e: any) {
  const code = e?.statusCode || e?.status || e?.response?.status;
  return code === 429 || code === 500 || code === 503;
}

export class RoomScanService {
  private maxImages = envInt('INVENTORY_ROOM_SCAN_MAX_IMAGES', 10);
  private maxImageBytes = envInt('INVENTORY_ROOM_SCAN_MAX_IMAGE_MB', 6) * 1024 * 1024;

  private maxAttempts = envInt('ROOM_SCAN_GEMINI_MAX_ATTEMPTS', 3);
  private baseBackoffMs = envInt('ROOM_SCAN_GEMINI_BACKOFF_MS', 750);

  private async assertEnabled() {
    if (envBool('INVENTORY_ROOM_SCAN_ENABLED', true) !== true) {
      throw new APIError('Room scan is disabled', 403, 'ROOM_SCAN_DISABLED');
    }
  }

  private validateUpload(files: Express.Multer.File[]) {
    if (!Array.isArray(files) || files.length === 0) throw new APIError('No images uploaded', 400, 'ROOM_SCAN_IMAGES_REQUIRED');
    if (files.length > this.maxImages) throw new APIError(`Too many images (max ${this.maxImages})`, 400, 'ROOM_SCAN_TOO_MANY_IMAGES');
    for (const f of files) {
      if (!String(f.mimetype || '').startsWith('image/')) throw new APIError('Only images are allowed', 400, 'ROOM_SCAN_BAD_FILETYPE');
      if ((f.size || 0) > this.maxImageBytes) throw new APIError('Image too large', 400, 'ROOM_SCAN_IMAGE_TOO_LARGE');
    }
  }

  private async assertDailyCaps(_propertyId: string, _userId: string) {
    return;
  }

  private async preprocessImages(files: Express.Multer.File[]) {
    const out: Array<{ buf: Buffer; width: number; height: number; sha: string }> = [];

    for (const f of files) {
      const img = sharp(f.buffer);
      const meta = await img.metadata();

      const w = meta.width || 0;
      const h = meta.height || 0;

      const maxWidth = envInt('INVENTORY_ROOM_SCAN_PREPROCESS_MAX_WIDTH', 1600);
      const resized = await img
        .rotate()
        .resize({ width: Math.min(maxWidth, w || maxWidth), withoutEnlargement: true })
        .jpeg({ quality: envInt('INVENTORY_ROOM_SCAN_JPEG_QUALITY', 82) })
        .toBuffer();

      const m2 = await sharp(resized).metadata();
      out.push({
        buf: resized,
        width: m2.width || w || 0,
        height: m2.height || h || 0,
        sha: sha1(resized),
      });
    }

    return out;
  }

  private async uploadToS3IfConfigured(args: {
    propertyId: string;
    roomId: string;
    sessionId: string;
    images: Array<{ buf: Buffer; width: number; height: number; sha: string }>;
  }): Promise<{ bucket: string; keys: string[] } | null> {
    const s3 = getS3();
    if (!s3) return null;

    const keys: string[] = [];
    for (let i = 0; i < args.images.length; i++) {
      const img = args.images[i];
      const key = `${s3.prefix}/${args.propertyId}/${args.roomId}/${args.sessionId}/${i}-${img.sha}.jpg`;

      await s3.client.send(
        new PutObjectCommand({
          Bucket: s3.bucket,
          Key: key,
          Body: img.buf,
          ContentType: 'image/jpeg',
        })
      );

      keys.push(key);
    }

    return { bucket: s3.bucket, keys };
  }

  private async persistImages(args: {
    sessionId: string;
    s3Info: { bucket: string; keys: string[] } | null;
    images: Array<{ buf: Buffer; width: number; height: number; sha: string }>;
  }) {
    const rows = await prisma.$transaction(
      args.images.map((img, idx) =>
        prisma.inventoryScanImage.create({
          data: {
            scanSessionId: args.sessionId,
            bucket: args.s3Info?.bucket ?? null,
            key: args.s3Info?.keys?.[idx] ?? `local:${idx}:${img.sha}`,
            width: img.width || 0,
            height: img.height || 0,
          },
          select: { id: true, key: true, bucket: true, width: true, height: true },
        })
      )
    );

    return rows; // index-aligned with uploads
  }

  private async persistBoxes(args: {
    draftsByIdx: Array<{ draftId: string; boxes: any[]; source?: string }>;
    imageRows: Array<{ id: string }>;
  }) {
    const creates: any[] = [];
    for (const d of args.draftsByIdx) {
      const boxes = Array.isArray(d.boxes) ? d.boxes : [];
      for (const b of boxes) {
        const imageIndex = Number(b?.imageIndex);
        if (!Number.isFinite(imageIndex) || imageIndex < 0 || imageIndex >= args.imageRows.length) continue;

        creates.push(
          prisma.inventoryDraftBox.create({
            data: {
              draftItemId: d.draftId,
              imageId: args.imageRows[imageIndex].id,
              x: Number(b?.x) || 0,
              y: Number(b?.y) || 0,
              w: Number(b?.w) || 0,
              h: Number(b?.h) || 0,
              confidence: typeof b?.confidence === 'number' ? b.confidence : null,
              source: d.source || null,
            },
          })
        );
      }
    }

    if (creates.length) await prisma.$transaction(creates);
  }

  private async computeAndPersistDeltas(args: {
    propertyId: string;
    roomId: string;
    sessionId: string;
    userId: string;
    currentDrafts: Array<{ id: string; name: string | null; duplicateOfItemId?: string | null }>;
  }) {
    const prev = await prisma.inventoryRoomScanSession.findFirst({
      where: {
        propertyId: args.propertyId,
        roomId: args.roomId,
        userId: args.userId,
        status: 'COMPLETE',
        NOT: { id: args.sessionId },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const prevId = prev?.id ?? null;

    const prevDrafts = prevId
      ? await prisma.inventoryDraftItem.findMany({
          where: { scanSessionId: prevId, status: 'DRAFT' },
          select: { id: true, name: true, firstSeenSessionId: true },
        })
      : [];

    const prevKeys = new Map(prevDrafts.map((d) => [dedupeKey(String(d.name || '')), d]));
    const currentKeys = new Set(args.currentDrafts.map((d) => dedupeKey(String(d.name || ''))).filter(Boolean));

    const tx: any[] = [];

    for (const d of args.currentDrafts) {
      const key = dedupeKey(String(d.name || ''));

      let deltaType: any = 'NEW';
      if (d.duplicateOfItemId) deltaType = 'DUPLICATE';
      else if (prevKeys.has(key)) deltaType = 'UNCHANGED';

      tx.push(
        prisma.inventoryScanDelta.create({
          data: {
            scanSessionId: args.sessionId,
            previousSessionId: prevId,
            draftItemId: d.id,
            deltaType,
          },
        })
      );
    }

    if (prevId) {
      for (const [key, p] of prevKeys.entries()) {
        if (!key) continue;
        if (!currentKeys.has(key)) {
          tx.push(
            prisma.inventoryScanDelta.create({
              data: {
                scanSessionId: args.sessionId,
                previousSessionId: prevId,
                draftItemId: null,
                deltaType: 'REMOVED',
                metaJson: { label: p.name || null, key },
              },
            })
          );
        }
      }
    }

    if (tx.length) await prisma.$transaction(tx);

    // Update firstSeen/lastSeen for “unchanged” items
    if (prevId) {
      const updates: any[] = [];
      for (const d of args.currentDrafts) {
        const key = dedupeKey(String(d.name || ''));
        const prevDraft = prevKeys.get(key);
        if (prevDraft?.firstSeenSessionId) {
          updates.push(
            prisma.inventoryDraftItem.update({
              where: { id: d.id },
              data: { firstSeenSessionId: prevDraft.firstSeenSessionId, lastSeenSessionId: args.sessionId },
            })
          );
        }
      }
      if (updates.length) await prisma.$transaction(updates);
    }

    return { previousSessionId: prevId };
  }

  private async listSessionImages(args: { sessionId: string }) {
    const imgs = await prisma.inventoryScanImage.findMany({
      where: { scanSessionId: args.sessionId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, bucket: true, key: true, width: true, height: true, createdAt: true },
    });

    const out: any[] = [];
    for (const img of imgs) {
      let url: string | null = null;
      if (img.bucket && img.key && !String(img.key).startsWith('local:')) {
        try {
          url = await presignGetObject({ bucket: img.bucket, key: img.key, expiresInSeconds: 300 });
        } catch {
          url = null;
        }
      }
      out.push({ ...img, url });
    }
    return out;
  }

  async runRoomScan(args: { propertyId: string; roomId: string; userId: string; files: Express.Multer.File[] }) {
    await this.assertEnabled();
    await this.assertDailyCaps(args.propertyId, args.userId);
    this.validateUpload(args.files);

    const room = await prisma.inventoryRoom.findFirst({
      where: { id: args.roomId, propertyId: args.propertyId },
      select: { id: true, type: true, name: true },
    });
    if (!room) throw new APIError('Room not found', 404, 'ROOM_NOT_FOUND');

    const provider = getRoomScanProvider();

    const session = await prisma.inventoryRoomScanSession.create({
      data: {
        propertyId: args.propertyId,
        roomId: args.roomId,
        userId: args.userId,
        status: 'PROCESSING',
        provider: provider.name,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
      select: { id: true },
    });

    try {
      const images = await this.preprocessImages(args.files);

      const s3Info = await this.uploadToS3IfConfigured({
        propertyId: args.propertyId,
        roomId: args.roomId,
        sessionId: session.id,
        images,
      });

      const imageRows = await this.persistImages({ sessionId: session.id, s3Info, images });

      const imagesCount = images.length;
      const bytesTotal = images.reduce((sum, b) => sum + (b?.buf?.byteLength || 0), 0);

      const t0 = Date.now();
      let result: any = null;
      let attempt = 0;

      while (true) {
        try {
          attempt++;
          result = await provider.extractItemsFromImages({
            images: images.map((x) => x.buf),
            roomType: room.type || null,
          });
          break;
        } catch (e: any) {
          if (!isTransientGeminiError(e) || attempt >= this.maxAttempts) throw e;

          const jitter = Math.floor(Math.random() * 150);
          const backoff = Math.min(8000, this.baseBackoffMs * Math.pow(2, attempt - 1)) + jitter;

          console.warn('[room-scan][retry]', {
            sessionId: session.id,
            attempt,
            backoffMs: backoff,
            statusCode: e?.statusCode || e?.status || e?.response?.status,
            message: e?.message,
          });

          await sleep(backoff);
        }
      }

      const latencyMs = Date.now() - t0;
      const items = normalizeItems(result?.items);
      const usage = (result as any)?.raw?.usageMetadata || null;

      console.info('[room-scan][budget]', {
        sessionId: session.id,
        provider: provider.name,
        model: (result as any)?.raw?.model,
        propertyId: args.propertyId,
        roomId: args.roomId,
        roomType: room.type || null,
        imagesCount,
        bytesTotal,
        avgBytes: imagesCount ? Math.round(bytesTotal / imagesCount) : 0,
        latencyMs,
        promptTokenCount: usage?.promptTokenCount ?? usage?.promptTokens ?? undefined,
        candidatesTokenCount: usage?.candidatesTokenCount ?? usage?.completionTokens ?? undefined,
        totalTokenCount: usage?.totalTokenCount ?? usage?.totalTokens ?? undefined,
      });

      const seen = new Map<
        string,
        { label: string; category?: string; confidence: number; boxes?: any[]; explanation?: any }
      >();

      for (const it of items) {
        const label = String(it?.label || '').trim();
        if (!label) continue;

        const key = dedupeKey(label);
        const conf = clamp01(Number(it.confidence ?? 0.6));

        const prev = seen.get(key);
        if (!prev || conf > prev.confidence) {
          seen.set(key, { label, category: it.category, confidence: conf, boxes: it.boxes || [], explanation: it.explanation });
        }
      }

      const deduped = Array.from(seen.values());

      const autoSelectThreshold = envFloat('INVENTORY_ROOM_SCAN_AUTOSELECT_THRESHOLD', 0.72);
      const dupeThreshold = envFloat('INVENTORY_ROOM_SCAN_DUPLICATE_THRESHOLD', 0.92);

      const existingRoomItems = await prisma.inventoryItem.findMany({
        where: { propertyId: args.propertyId, roomId: args.roomId },
        select: { id: true, name: true },
      });

      function duplicateMatch(label: string) {
        const ln = simpleNameNorm(label);
        if (!ln) return null;

        let best: { id: string; score: number; reason: string } | null = null;

        for (const it of existingRoomItems) {
          const inorm = simpleNameNorm(it.name || '');
          if (!inorm) continue;

          const score = ln === inorm ? 1.0 : 0.0;
          if (!best || score > best.score) best = { id: it.id, score, reason: score === 1.0 ? 'NAME_EXACT_MATCH' : 'NONE' };
        }

        if (best && best.score >= dupeThreshold) return best;
        return null;
      }

      const drafts =
        deduped.length === 0
          ? []
          : await prisma.$transaction(
              deduped.map((it) => {
                const conf = clamp01(Number(it.confidence ?? 0.6));
                const g = groupForLabel(it.label);
                const dupe = duplicateMatch(it.label);

                return prisma.inventoryDraftItem.create({
                  data: {
                    propertyId: args.propertyId,
                    userId: args.userId,
                    status: 'DRAFT',
                    roomId: args.roomId,
                    scanSessionId: session.id,
                    draftSource: 'ROOM_PHOTO_AI',

                    name: it.label,
                    category: normalizeInventoryCategory(it.category),

                    autoSelected: conf >= autoSelectThreshold,
                    groupKey: g.groupKey,
                    groupLabel: g.groupLabel,

                    duplicateOfItemId: dupe?.id ?? null,
                    duplicateScore: dupe?.score ?? null,
                    duplicateReason: dupe?.reason ?? null,

                    confidenceJson: {
                      name: conf,
                      category: typeof it.category === 'string' ? conf : undefined,
                    },

                    explanationJson: it.explanation ? it.explanation : undefined,

                    firstSeenSessionId: session.id,
                    lastSeenSessionId: session.id,

                    aiRawJson: envTrue('INVENTORY_ROOM_SCAN_STORE_AI_RAW') ? (result as any)?.raw ?? undefined : undefined,
                  },
                  select: {
                    id: true,
                    name: true,
                    category: true,
                    autoSelected: true,
                    groupKey: true,
                    groupLabel: true,
                    duplicateOfItemId: true,
                    duplicateScore: true,
                    duplicateReason: true,
                    confidenceJson: true,
                    explanationJson: true,
                  },
                });
              })
            );

      await this.persistBoxes({
        draftsByIdx: drafts.map((d: any, idx: number) => ({ draftId: d.id, boxes: deduped[idx]?.boxes || [], source: provider.name })),
        imageRows,
      });

      await this.computeAndPersistDeltas({
        propertyId: args.propertyId,
        roomId: args.roomId,
        sessionId: session.id,
        userId: args.userId,
        currentDrafts: drafts.map((d: any) => ({ id: d.id, name: d.name, duplicateOfItemId: d.duplicateOfItemId })),
      });

      await prisma.inventoryRoomScanSession.update({
        where: { id: session.id },
        data: {
          status: 'COMPLETE',
          imageKeys: s3Info ? { bucket: s3Info.bucket, keys: s3Info.keys } : undefined,
          resultJson: (result as any).raw ?? undefined,
        },
      });

      const imagesOut = await this.listSessionImages({ sessionId: session.id });

      return { sessionId: session.id, drafts, images: imagesOut };
    } catch (e: any) {
      await prisma.inventoryRoomScanSession.update({
        where: { id: session.id },
        data: { status: 'FAILED', error: e?.message || 'Room scan failed' },
      });
      throw e;
    }
  }

  async getSession(args: { propertyId: string; roomId: string; sessionId: string; userId: string }) {
    const s = await prisma.inventoryRoomScanSession.findFirst({
      where: { id: args.sessionId, propertyId: args.propertyId, roomId: args.roomId, userId: args.userId },
      select: { id: true, status: true, provider: true, error: true, createdAt: true, updatedAt: true },
    });
    if (!s) throw new APIError('Session not found', 404, 'ROOM_SCAN_SESSION_NOT_FOUND');

    const drafts = await prisma.inventoryDraftItem.findMany({
      where: { scanSessionId: args.sessionId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        category: true,
        autoSelected: true,
        groupKey: true,
        groupLabel: true,
        duplicateOfItemId: true,
        duplicateScore: true,
        duplicateReason: true,
        confidenceJson: true,
        explanationJson: true,
        firstSeenSessionId: true,
        lastSeenSessionId: true,
      },
    });

    const boxes = await prisma.inventoryDraftBox.findMany({
      where: { draftItemId: { in: drafts.map((d) => d.id) } },
      select: { id: true, draftItemId: true, imageId: true, x: true, y: true, w: true, h: true, confidence: true, source: true },
    });

    const deltas = await prisma.inventoryScanDelta.findMany({
      where: { scanSessionId: args.sessionId },
      select: { id: true, draftItemId: true, deltaType: true, metaJson: true, previousSessionId: true },
    });

    const images = await this.listSessionImages({ sessionId: args.sessionId });

    return { ...s, images, drafts, boxes, deltas };
  }

  async listRoomSessions(args: { propertyId: string; roomId: string; userId: string; limit: number }) {
    const sessions = await prisma.inventoryRoomScanSession.findMany({
      where: { propertyId: args.propertyId, roomId: args.roomId, userId: args.userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(50, Math.max(1, args.limit || 12)),
      select: {
        id: true,
        status: true,
        provider: true,
        error: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { drafts: true, images: true } },
      },
    });

    return sessions.map((s) => ({
      ...s,
      counts: { drafts: s._count.drafts, images: s._count.images },
    }));
  }
}
