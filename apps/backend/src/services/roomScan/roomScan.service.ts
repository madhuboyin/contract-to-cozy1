// apps/backend/src/services/roomScan/roomScan.service.ts
import { prisma } from '../../lib/prisma';
import { APIError } from '../../middleware/error.middleware';
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
  return normLabel(label).replace(/\s+/g, '_');
}

function sha1(buf: Buffer) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

/**
 * Prevent Prisma validation errors when AI returns a category that isn't in the enum.
 * IMPORTANT: Update allowed values to match your Prisma InventoryItemCategory enum exactly.
 */
function normalizeInventoryCategory(v: any): any | null {
  const up = String(v ?? '').toUpperCase().trim();

  // ✅ Keep in sync with your Prisma enum values
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
  return allowed.has(up) ? up : 'OTHER'; // fallback to OTHER to avoid 400 VALIDATION_ERROR
}

function getS3(): { client: S3Client; bucket: string; prefix: string } | null {
  // ✅ only store images when explicitly enabled
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

function isTransientGeminiError(e: any) {
  const status = Number(e?.statusCode || e?.status || e?.response?.status);
  if (status === 429 || status === 503) return true;

  const msg = String(e?.message || '').toLowerCase();
  return msg.includes('rate limit') || msg.includes('quota') || msg.includes('temporarily') || msg.includes('unavailable');
}

function normalizeItems(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}

export class RoomScanService {
  // ----------------------------
  // Cost guards
  // ----------------------------
  private maxImages = envInt('INVENTORY_ROOM_SCAN_MAX_IMAGES', 10);
  private maxImageMB = envInt('INVENTORY_ROOM_SCAN_MAX_IMAGE_MB', 6);
  private maxUserPerDay = envInt('INVENTORY_ROOM_SCAN_MAX_SCANS_PER_USER_PER_DAY', 100);
  private maxPropertyPerDay = envInt('INVENTORY_ROOM_SCAN_MAX_SCANS_PER_PROPERTY_PER_DAY', 50);

  private targetWidth = envInt('INVENTORY_ROOM_SCAN_TARGET_WIDTH', 1024);
  private jpegQuality = envInt('INVENTORY_ROOM_SCAN_JPEG_QUALITY', 72);

  // ✅ operational escape hatch
  private disableDailyCaps = envBool('INVENTORY_ROOM_SCAN_DISABLE_DAILY_CAPS', false);

  private maxAttempts = envInt('INVENTORY_ROOM_SCAN_GEMINI_MAX_RETRIES', 4); // total attempts = 1 + retries
  private baseBackoffMs = envInt('INVENTORY_ROOM_SCAN_GEMINI_BACKOFF_MS', 500);

  async assertEnabled() {
    if (process.env.INVENTORY_ROOM_SCAN_ENABLED === 'false') {
      throw new APIError('Room scan is disabled', 403, 'ROOM_SCAN_DISABLED');
    }
  }

  async assertDailyCaps(propertyId: string, userId: string) {
    // ✅ allow temporary bypass in staging / debugging
    if (this.disableDailyCaps) return;

    const since = new Date(Date.now() - 24 * 3600 * 1000);

    const [userCount, propCount] = await Promise.all([
      prisma.inventoryRoomScanSession.count({
        where: { userId, createdAt: { gte: since } },
      }),
      prisma.inventoryRoomScanSession.count({
        where: { propertyId, createdAt: { gte: since } },
      }),
    ]);

    if (userCount >= this.maxUserPerDay) {
      throw new APIError(
        `Daily room scan limit reached (${this.maxUserPerDay}/day). Try again tomorrow.`,
        429,
        'ROOM_SCAN_USER_DAILY_LIMIT'
      );
    }

    if (propCount >= this.maxPropertyPerDay) {
      throw new APIError(
        `This property reached its daily room scan limit (${this.maxPropertyPerDay}/day). Try again tomorrow.`,
        429,
        'ROOM_SCAN_PROPERTY_DAILY_LIMIT'
      );
    }
  }

  validateUpload(files: Express.Multer.File[]) {
    if (!files?.length) throw new APIError('At least one image is required', 400, 'ROOM_SCAN_IMAGES_REQUIRED');
    if (files.length > this.maxImages) {
      throw new APIError(`Too many images. Max allowed is ${this.maxImages}.`, 400, 'ROOM_SCAN_TOO_MANY_IMAGES');
    }

    const maxBytes = this.maxImageMB * 1024 * 1024;
    for (const f of files) {
      if (!f.mimetype?.startsWith('image/')) {
        throw new APIError('Only image uploads are allowed', 400, 'ROOM_SCAN_IMAGE_ONLY');
      }
      if (f.size > maxBytes) {
        throw new APIError(
          `Image too large (${Math.round(f.size / 1024 / 1024)}MB). Max is ${this.maxImageMB}MB.`,
          400,
          'ROOM_SCAN_IMAGE_TOO_LARGE'
        );
      }
    }
  }

  async preprocessImages(files: Express.Multer.File[]) {
    // Downscale + compress BEFORE any AI call (cost guard + speed)
    const out: Buffer[] = [];
    for (const f of files) {
      const buf = await sharp(f.buffer, { failOn: 'none' })
        .rotate()
        .resize({ width: this.targetWidth, withoutEnlargement: true })
        .jpeg({ quality: this.jpegQuality, mozjpeg: true })
        .toBuffer();

      out.push(buf);
    }
    return out;
  }

  async uploadToS3IfConfigured(args: { propertyId: string; roomId: string; sessionId: string; images: Buffer[] }) {
    const s3 = getS3();
    if (!s3) return null;

    const keys: string[] = [];
    for (let i = 0; i < args.images.length; i++) {
      const img = args.images[i];
      const digest = sha1(img).slice(0, 12);
      const key = `${s3.prefix}/${args.propertyId}/${args.roomId}/${args.sessionId}/${i}-${digest}.jpg`;

      await s3.client.send(
        new PutObjectCommand({
          Bucket: s3.bucket,
          Key: key,
          Body: img,
          ContentType: 'image/jpeg',
        })
      );

      keys.push(key);
    }

    return { bucket: s3.bucket, keys };
  }

  /**
   * Main entry: create session + run provider + create drafts
   * (Sync implementation; can be moved to worker later without changing API.)
   */
  async runRoomScan(args: { propertyId: string; roomId: string; userId: string; files: Express.Multer.File[] }) {
    await this.assertEnabled();
    await this.assertDailyCaps(args.propertyId, args.userId);
    this.validateUpload(args.files);

    // Verify room belongs to property (security & correctness)
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

      // Budget meter inputs
      const imagesCount = images.length;
      const bytesTotal = images.reduce((sum, b) => sum + (b?.byteLength || 0), 0);

      // Optional: store preprocessed JPEGs for debugging/auditing (not required)
      const s3Info = await this.uploadToS3IfConfigured({
        propertyId: args.propertyId,
        roomId: args.roomId,
        sessionId: session.id,
        images,
      });

      const t0 = Date.now();

      let result: any = null;
      let attempt = 0;
      
      while (true) {
        try {
          attempt++;
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
      // Token usage if provider returns it (Gemini may return usageMetadata)
      const usage = (result as any)?.raw?.usageMetadata || null;

      // ✅ Budget meter log (structured)
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

      // Create drafts
      const drafts =
      deduped.length === 0
        ? []
        : await prisma.$transaction(
        deduped.map((it) =>
          prisma.inventoryDraftItem.create({
            data: {
              propertyId: args.propertyId,
              userId: args.userId,
              status: 'DRAFT',
              roomId: args.roomId,
              scanSessionId: session.id,
              draftSource: 'ROOM_PHOTO_AI',

              name: it.label,

              // ✅ prevent Prisma enum validation error
              category: normalizeInventoryCategory(it.category),

              confidenceJson: {
                name: it.confidence,
                category: typeof it.category === 'string' ? it.confidence : undefined,
              },
            },
            select: { id: true, name: true, category: true },
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

    return { ...s, draftCount };
  }
}
