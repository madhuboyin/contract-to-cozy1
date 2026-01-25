// apps/backend/src/services/roomScan/roomScan.service.ts
import { prisma } from '../../lib/prisma';
import { APIError } from '../../middleware/error.middleware';
import { InventoryItemCategory } from '@prisma/client';
import sharp from 'sharp';
import crypto from 'crypto';
import { getRoomScanProvider } from './provider';

// Optional S3 upload (only if you set S3_BUCKET + INVENTORY_ROOM_SCAN_STORE_IMAGES=true)
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { S3Client } from '@aws-sdk/client-s3';

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

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function normLabel(s: string) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function dedupeKey(label: string) {
  const cleaned = normLabel(label);
  return cleaned.replace(/\b(the|a|an|with|and|for|of)\b/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeInventoryCategory(cat: any) {
  const v = String(cat || '').toUpperCase().trim();
  const allowed = new Set([
    'APPLIANCE',
    'ELECTRONICS',
    'FURNITURE',
    'PLUMBING',
    'HVAC',
    'OTHER',
  ]);
  return allowed.has(v) ? v : 'OTHER';
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransientGeminiError(e: any) {
  const msg = String(e?.message || '');
  const status = e?.statusCode || e?.status || e?.response?.status;
  if (status === 429 || status === 503 || status === 504) return true;
  if (msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('socket hang up')) return true;
  return false;
}

function getS3(): S3Client | null {
  if (process.env.INVENTORY_ROOM_SCAN_STORE_IMAGES !== 'true') return null;
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null;

  return new S3Client({
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        }
      : undefined,
  });
}

async function compressImageToJpeg(buf: Buffer) {
  // keep it small + fast for provider
  return sharp(buf)
    .rotate()
    .resize({ width: 1280, withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer();
}

function normalizeItems(items: any): Array<{ label: string; category?: string; confidence?: number }> {
  const arr = Array.isArray(items) ? items : [];
  return arr
    .map((x: any) => ({
      label: String(x?.label || x?.name || '').trim(),
      category: x?.category,
      confidence: Number(x?.confidence),
    }))
    .filter((x) => x.label);
}

function jaccard(a: string, b: string) {
  const A = new Set(normLabel(a).split(' ').filter(Boolean));
  const B = new Set(normLabel(b).split(' ').filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

async function loadInventoryCandidates(propertyId: string, roomId: string) {
  // Keep it cheap: room items + a small slice of property items
  const [roomItems, propertyItems] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { propertyId, roomId },
      select: { id: true, name: true, category: true, roomId: true },
      orderBy: { updatedAt: 'desc' as any },
      take: 250,
    }),
    prisma.inventoryItem.findMany({
      where: { propertyId },
      select: { id: true, name: true, category: true, roomId: true },
      orderBy: { updatedAt: 'desc' as any },
      take: 400,
    }),
  ]);

  // avoid dup ids
  const seen = new Set<string>();
  const merged: Array<{ id: string; name: string | null; category: string | null; roomId: string | null }> = [];
  for (const it of [...roomItems, ...propertyItems]) {
    if (!it?.id || seen.has(it.id)) continue;
    seen.add(it.id);
    merged.push(it as any);
  }
  return merged;
}

function bestDuplicateMatch(
  draftName: string,
  roomId: string,
  candidates: Array<{ id: string; name: string | null; roomId: string | null }>
) {
  const dn = normLabel(draftName);
  if (!dn) return null;

  let best: { id: string; score: number; sameRoom: boolean } | null = null;

  for (const c of candidates) {
    const cn = normLabel(c.name || '');
    if (!cn) continue;

    // strong signals
    let score = 0;
    if (cn === dn) score = 1;
    else {
      const jac = jaccard(draftName, c.name || '');
      score = jac;
      // small boost if one contains the other
      if (dn.length >= 6 && cn.includes(dn)) score = Math.max(score, 0.92);
      if (cn.length >= 6 && dn.includes(cn)) score = Math.max(score, 0.92);
    }

    if (score < 0.82) continue;

    const sameRoom = String(c.roomId || '') === String(roomId || '');
    const adjusted = score + (sameRoom ? 0.02 : 0);

    if (!best || adjusted > best.score) {
      best = { id: c.id, score: Math.min(1, adjusted), sameRoom };
    }
  }

  return best;
}

export class RoomScanService {
  private maxAttempts = envInt('INVENTORY_ROOM_SCAN_PROVIDER_MAX_ATTEMPTS', 3);
  private baseBackoffMs = envInt('INVENTORY_ROOM_SCAN_PROVIDER_BACKOFF_MS', 800);

  async startScan(args: { propertyId: string; roomId: string; userId: string; images: Buffer[] }) {
    const imagesCount = args.images?.length || 0;
    if (imagesCount < 1) throw new APIError('At least one image is required', 400, 'VALIDATION_ERROR');

    // caps
    const disableCaps = envBool('INVENTORY_ROOM_SCAN_DISABLE_CAPS', false);
    const userDailyCap = envInt('INVENTORY_ROOM_SCAN_MAX_SCANS_PER_USER_PER_DAY', 6);
    const propertyDailyCap = envInt('INVENTORY_ROOM_SCAN_MAX_SCANS_PER_PROPERTY_PER_DAY', 20);

    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));

    if (!disableCaps) {
      const [userCount, propCount] = await Promise.all([
        prisma.inventoryRoomScanSession.count({
          where: { userId: args.userId, createdAt: { gte: dayStart, lte: dayEnd } },
        }),
        prisma.inventoryRoomScanSession.count({
          where: { propertyId: args.propertyId, createdAt: { gte: dayStart, lte: dayEnd } },
        }),
      ]);

      if (userCount >= userDailyCap) {
        throw new APIError(
          `Daily room scan limit reached (${userDailyCap}/day). Try again tomorrow.`,
          429,
          'ROOM_SCAN_USER_DAILY_LIMIT'
        );
      }
      if (propCount >= propertyDailyCap) {
        throw new APIError(
          `Daily property room scan limit reached (${propertyDailyCap}/day). Try again tomorrow.`,
          429,
          'ROOM_SCAN_PROPERTY_DAILY_LIMIT'
        );
      }
    }

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
      },
      select: { id: true },
    });

    let s3Info: { bucket: string; keys: string[] } | null = null;

    try {
      // compress images
      const compressed = await Promise.all(args.images.map((b) => compressImageToJpeg(b)));

      // optional s3 store
      const s3 = getS3();
      if (s3) {
        const bucket = process.env.S3_BUCKET!;
        const keys: string[] = [];

        for (let i = 0; i < compressed.length; i++) {
          const key = `inventory-room-scan/${session.id}/${i}-${crypto.randomUUID()}.jpg`;
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: compressed[i],
              ContentType: 'image/jpeg',
            })
          );
          keys.push(key);
        }

        s3Info = { bucket, keys };
      }

      const images = compressed;
      const bytesTotal = images.reduce((a, b) => a + (b?.length || 0), 0);

      const t0 = Date.now();
      let result: any = null;

      // provider call with retry
      for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
        try {
          result = await provider.extractItemsFromImages({
            images,
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
      if (items.length === 0) {
        const isProd = process.env.NODE_ENV === 'production';
        const preview = String((result as any)?.raw?.text || '').slice(0, 500);

        console.warn('[room-scan][empty-items]', {
          sessionId: session.id,
          provider: provider.name,
          roomType: room.type || null,
          imagesCount,
          latencyMs,
          textPreview: isProd ? undefined : preview,
        });
      }

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

      // Dedupe within session (prevents “3 sofas” from 3 angles)
      const seen = new Map<string, { label: string; category?: string; confidence: number }>();
      for (const it of items) {
        const label = String(it?.label || '').trim();
        if (!label) continue;

        const key = dedupeKey(label);
        const conf = clamp01(Number(it.confidence ?? 0.6));

        const prev = seen.get(key);
        if (!prev || conf > prev.confidence) {
          seen.set(key, { label, category: it.category, confidence: conf });
        }
      }

      const deduped = Array.from(seen.values());

      // Duplicate detection vs inventory (room-aware)
      const dupCheckEnabled = envBool('INVENTORY_ROOM_SCAN_DUP_CHECK', true);
      const candidates = dupCheckEnabled ? await loadInventoryCandidates(args.propertyId, args.roomId) : [];

      const enriched = deduped.map((it) => {
        const dup = dupCheckEnabled ? bestDuplicateMatch(it.label, args.roomId, candidates as any) : null;
        return {
          ...it,
          duplicate: dup
            ? {
                inventoryItemId: dup.id,
                score: dup.score,
                sameRoom: dup.sameRoom,
              }
            : null,
        };
      });

      // Create drafts
      const drafts =
        enriched.length === 0
          ? []
          : await prisma.$transaction(
              enriched.map((it) =>
                prisma.inventoryDraftItem.create({
                  data: {
                    propertyId: args.propertyId,
                    userId: args.userId,
                    status: 'DRAFT',
                    roomId: args.roomId,
                    scanSessionId: session.id,
                    draftSource: 'ROOM_PHOTO_AI',

                    name: it.label,

                    // prevent Prisma enum validation error
                    category: normalizeInventoryCategory(it.category) as InventoryItemCategory,

                    confidenceJson: {
                      name: it.confidence,
                      category: typeof it.category === 'string' ? it.confidence : undefined,
                      duplicate: it.duplicate || undefined,
                    },
                  },
                  select: { id: true, name: true, category: true, confidenceJson: true },
                })
              )
            );

      await prisma.inventoryRoomScanSession.update({
        where: { id: session.id },
        data: {
          status: 'COMPLETE',
          imageKeys: s3Info ? { bucket: s3Info.bucket, keys: s3Info.keys } : undefined,
          resultJson: (result as any).raw ?? undefined,
        },
      });

      return { sessionId: session.id, drafts };
    } catch (e: any) {
      await prisma.inventoryRoomScanSession.update({
        where: { id: session.id },
        data: {
          status: 'FAILED',
          error: e?.message || 'Room scan failed',
        },
      });
      throw e;
    }
  }

  async getSession(args: { propertyId: string; roomId: string; sessionId: string; userId: string }) {
    const s = await prisma.inventoryRoomScanSession.findFirst({
      where: {
        id: args.sessionId,
        propertyId: args.propertyId,
        roomId: args.roomId,
        userId: args.userId,
      },
      select: {
        id: true,
        status: true,
        provider: true,
        error: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!s) throw new APIError('Scan session not found', 404, 'ROOM_SCAN_SESSION_NOT_FOUND');

    const draftCount = await prisma.inventoryDraftItem.count({
      where: { scanSessionId: args.sessionId, status: 'DRAFT' },
    });

    return {
      sessionId: s.id,
      status: s.status,
      provider: s.provider,
      error: s.error,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      draftCount,
    };
  }
}
