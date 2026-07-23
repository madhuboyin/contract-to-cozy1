import crypto from 'crypto';
import { chromium } from 'playwright';
import { prisma } from '../lib/prisma';
import { MaterialSpecExportStatus } from '@prisma/client';
import { uploadPdfBuffer } from '@worker-shared/services/storage/reportStorage';
import { deleteObject } from '../storage/deleteObject';
import { logger, AppLogger } from '../lib/logger';

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

const CATEGORY_LABELS: Record<string, string> = {
  PAINT: 'Paint', TILE: 'Tile', FLOORING: 'Flooring', GROUT: 'Grout',
  COUNTERTOP: 'Countertop', CABINET: 'Cabinet', HARDWARE: 'Hardware',
  TRIM_MOLDING: 'Trim & Molding', WALLPAPER: 'Wallpaper', ROOFING: 'Roofing',
  SIDING: 'Siding', WINDOW: 'Window', DOOR: 'Door', INSULATION: 'Insulation', OTHER: 'Other',
};

const SURFACE_LABELS: Record<string, string> = {
  WALLS: 'Walls', CEILING: 'Ceiling', FLOOR: 'Floor', BACKSPLASH: 'Backsplash',
  SHOWER_WALLS: 'Shower Walls', SHOWER_FLOOR: 'Shower Floor', TUB_SURROUND: 'Tub Surround',
  COUNTERTOP: 'Countertop', EXTERIOR_FACADE: 'Exterior Facade', TRIM: 'Trim',
  DOORS: 'Doors', WINDOWS: 'Windows', CABINETRY: 'Cabinetry', OTHER: 'Other',
};

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function field(label: string, value: string | null | undefined): string {
  if (!value) return '';
  return `<div class="field"><span class="field-label">${escapeHtml(label)}</span><span class="field-value">${escapeHtml(value)}</span></div>`;
}

function buildHtml(args: {
  title: string;
  propertyLabel: string;
  generatedAt: string;
  specs: any[];
  groupedByRoom: boolean;
  groups: Array<{ heading: string; specs: any[] }>;
}): string {
  const { title, propertyLabel, generatedAt, groups } = args;

  const specHtml = (spec: any) => {
    const colorSwatch = spec.colorHex
      ? `<span class="color-swatch" style="background:${escapeHtml(spec.colorHex)};"></span>`
      : '';
    const colorField = spec.colorCode || spec.colorHex
      ? `<div class="field">
          <span class="field-label">Color</span>
          <span class="field-value">${colorSwatch}${escapeHtml(spec.colorCode || '')}${spec.colorHex ? ` <small style="color:#999">${escapeHtml(spec.colorHex)}</small>` : ''}</span>
        </div>`
      : '';

    return `
      <div class="spec-card">
        <div class="spec-header">
          <span class="spec-label">${escapeHtml(spec.label)}</span>
          <span class="spec-category">${escapeHtml(CATEGORY_LABELS[spec.category] ?? spec.category)}</span>
          ${spec.surface ? `<span class="spec-surface">${escapeHtml(SURFACE_LABELS[spec.surface] ?? spec.surface)}</span>` : ''}
          ${!spec.isActive ? '<span class="spec-archived">Archived</span>' : ''}
        </div>
        <div class="spec-fields">
          ${field('Manufacturer', spec.manufacturer)}
          ${field('Product Line', spec.productLine)}
          ${field('Product Name', spec.productName)}
          ${field('SKU', spec.sku)}
          ${colorField}
          ${field('Finish', spec.finish)}
          ${field('Dimensions', spec.dimensions)}
          ${field('Material', spec.material)}
          ${field('Supplier', spec.supplier)}
          ${spec.supplierUrl ? `<div class="field"><span class="field-label">Supplier URL</span><span class="field-value">${escapeHtml(spec.supplierUrl)}</span></div>` : ''}
          ${field('Purchase Date', spec.purchaseDate ? formatDate(spec.purchaseDate) : null)}
          ${field('Quantity', spec.quantityPurchased)}
          ${field('Lot / Batch', spec.lotBatch)}
          ${spec.notes ? `<div class="field notes"><span class="field-label">Notes</span><span class="field-value">${escapeHtml(spec.notes)}</span></div>` : ''}
        </div>
      </div>
    `;
  };

  const groupsHtml = groups.map((g) => `
    <div class="group">
      <h2 class="group-heading">${escapeHtml(g.heading)}</h2>
      <div class="specs-grid">
        ${g.specs.map(specHtml).join('')}
      </div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a2e; background: #fff; padding: 8mm 12mm; }
  .cover { margin-bottom: 20px; border-bottom: 2px solid #0f766e; padding-bottom: 16px; }
  .cover-title { font-size: 22px; font-weight: 700; color: #0f766e; margin-bottom: 4px; }
  .cover-property { font-size: 13px; color: #374151; margin-bottom: 2px; }
  .cover-meta { font-size: 10px; color: #6b7280; }
  .group { margin-bottom: 20px; }
  .group-heading { font-size: 13px; font-weight: 700; color: #0f766e; border-bottom: 1px solid #d1fae5; padding-bottom: 4px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  .specs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .spec-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; page-break-inside: avoid; }
  .spec-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
  .spec-label { font-weight: 600; font-size: 11.5px; color: #111827; flex: 1; }
  .spec-category { font-size: 9px; font-weight: 600; background: #dbeafe; color: #1e40af; border-radius: 3px; padding: 1px 5px; white-space: nowrap; }
  .spec-surface { font-size: 9px; background: #f3f4f6; color: #374151; border-radius: 3px; padding: 1px 5px; }
  .spec-archived { font-size: 9px; background: #f9fafb; color: #9ca3af; border-radius: 3px; padding: 1px 5px; }
  .spec-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; }
  .field { display: flex; flex-direction: column; padding: 1px 0; }
  .field.notes { grid-column: 1 / -1; }
  .field-label { font-size: 8.5px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.04em; }
  .field-value { font-size: 10px; color: #374151; }
  .color-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 1px solid #d1d5db; margin-right: 4px; vertical-align: middle; }
  .empty { text-align: center; padding: 32px; color: #9ca3af; font-size: 12px; }
</style>
</head>
<body>
  <div class="cover">
    <div class="cover-title">${escapeHtml(title)}</div>
    <div class="cover-property">${escapeHtml(propertyLabel)}</div>
    <div class="cover-meta">Generated ${formatDate(generatedAt)} · ContractToCozy</div>
  </div>
  ${args.specs.length === 0
    ? '<div class="empty">No material specs found for this export scope.</div>'
    : groupsHtml
  }
</body>
</html>`;
}

async function renderPdf(html: string): Promise<Buffer> {
  const executablePath =
    process.env.CHROMIUM_PATH?.trim()
      ? process.env.CHROMIUM_PATH
      : chromium.executablePath();

  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluateHandle('document.fonts.ready');

    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern). `renderPdf` (a real
// Playwright/Chromium launch) is injected directly rather than requiring
// tests to mock the `playwright` package itself.
export interface GenerateMaterialSpecExportDeps {
  prisma: Pick<typeof prisma, 'materialSpecExport' | 'materialSpec'>;
  uploadPdfBuffer: typeof uploadPdfBuffer;
  deleteObject: typeof deleteObject;
  renderPdf: typeof renderPdf;
  logger: AppLogger;
}

const defaultDeps: GenerateMaterialSpecExportDeps = {
  prisma,
  uploadPdfBuffer,
  deleteObject,
  renderPdf,
  logger,
};

export async function generateMaterialSpecExportJob(
  exportId: string,
  deps: GenerateMaterialSpecExportDeps = defaultDeps,
): Promise<void> {
  const { prisma, uploadPdfBuffer, deleteObject, renderPdf, logger } = deps;
  const exportRecord = await prisma.materialSpecExport.findUnique({
    where: { id: exportId },
    include: { property: { select: { id: true, address: true, city: true, state: true } } },
  });

  if (!exportRecord) return;
  if (exportRecord.status !== MaterialSpecExportStatus.PENDING) return;

  // Atomic claim (W3/exports — "safe claim ownership"): see
  // generateHomeReportExport.job.ts for the same fix and full rationale —
  // two overlapping poll ticks could otherwise both claim and generate for
  // the same PENDING row.
  const claim = await prisma.materialSpecExport.updateMany({
    where: { id: exportId, status: MaterialSpecExportStatus.PENDING },
    data: { status: MaterialSpecExportStatus.GENERATING },
  });
  if (claim.count !== 1) return;

  // Cleanup-on-terminal-failure (W3/exports — "object cleanup"): see
  // generateHomeReportExport.job.ts for the same fix and full rationale.
  let uploaded: { bucket: string; key: string } | undefined;

  try {
    // Build where clause based on scopeType
    const specWhere: any = { propertyId: exportRecord.propertyId, isActive: true };

    if (exportRecord.scopeType === 'ROOM') {
      // Title encodes the room — filter by room name match from title or fetch all and filter
      // We stored room name in title, so fetch from DB using a raw scope filter
      // The export record doesn't store roomId directly, use a best-effort: fetch all and let PDF show them grouped
    } else if (exportRecord.scopeType === 'CATEGORY') {
      // Category name is encoded in the title; extract via prefix matching
      const categoryHint = Object.keys(CATEGORY_LABELS).find((k) =>
        exportRecord.title.toLowerCase().includes(CATEGORY_LABELS[k].toLowerCase())
      );
      if (categoryHint) specWhere.category = categoryHint;
    }

    const specs = await prisma.materialSpec.findMany({
      where: specWhere,
      orderBy: [{ category: 'asc' }, { label: 'asc' }],
      include: { room: { select: { id: true, name: true } } },
    });

    const property = exportRecord.property as any;
    const propertyLabel = [property?.address, property?.city, property?.state]
      .filter(Boolean)
      .join(', ') || 'Property';

    // Group specs
    let groups: Array<{ heading: string; specs: any[] }>;
    const groupedByRoom = exportRecord.scopeType === 'ROOM';

    if (groupedByRoom) {
      const roomMap = new Map<string, { heading: string; specs: any[] }>();
      const noRoom: any[] = [];
      for (const s of specs) {
        if (s.room) {
          const key = s.room.id;
          if (!roomMap.has(key)) roomMap.set(key, { heading: s.room.name, specs: [] });
          roomMap.get(key)!.specs.push(s);
        } else {
          noRoom.push(s);
        }
      }
      groups = [...roomMap.values()];
      if (noRoom.length) groups.push({ heading: 'No Room Assigned', specs: noRoom });
    } else {
      const catMap = new Map<string, any[]>();
      for (const s of specs) {
        if (!catMap.has(s.category)) catMap.set(s.category, []);
        catMap.get(s.category)!.push(s);
      }
      groups = [...catMap.entries()].map(([cat, catSpecs]) => ({
        heading: CATEGORY_LABELS[cat] ?? cat,
        specs: catSpecs,
      }));
    }

    const html = buildHtml({
      title: exportRecord.title,
      propertyLabel,
      generatedAt: new Date().toISOString(),
      specs,
      groupedByRoom,
      groups,
    });

    const pdfBuffer = await renderPdf(html);
    const checksum = sha256(pdfBuffer);
    const slug = exportRecord.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 40);
    const fileName = `material-specs-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;

    uploaded = await uploadPdfBuffer({
      buffer: pdfBuffer,
      fileName,
      checksumSha256: checksum,
      propertyId: exportRecord.propertyId,
      userId: exportRecord.requestedByUserId,
    });

    await prisma.materialSpecExport.update({
      where: { id: exportId },
      data: {
        status: MaterialSpecExportStatus.COMPLETED,
        totalSpecs: specs.length,
        fileKey: uploaded.key,
        fileUrl: uploaded.key,
      },
    });
    // COMPLETED committed with the file key persisted — a later failure
    // must not delete a now-properly-referenced object.
    uploaded = undefined;

    logger.info({ exportId, totalSpecs: specs.length }, '[materialSpecExport] completed');
  } catch (err: any) {
    logger.error({ err, exportId }, '[materialSpecExport] failed');

    if (uploaded) {
      try {
        await deleteObject(uploaded.bucket, uploaded.key);
      } catch (cleanupErr) {
        logger.warn({ err: cleanupErr, exportId }, '[materialSpecExport] orphaned-object cleanup failed');
      }
    }

    await prisma.materialSpecExport.update({
      where: { id: exportId },
      data: {
        status: MaterialSpecExportStatus.FAILED,
        errorMessage: (err?.message ?? 'Unknown error').slice(0, 1000),
      },
    });

    throw err;
  }
}
