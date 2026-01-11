// apps/backend/src/services/inventoryImport.service.ts
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import {
  InventoryItemCategory,
  InventoryItemCondition,
  InventoryItemSource,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';

const HEADERS = [
  'Room',
  'Item Name',
  'Category',
  'Condition',
  'Brand',
  'Model',
  'Serial No',
  'Installed On',
  'Purchased On',
  'Last Serviced On',
  'Purchase Cost (cents)',
  'Replacement Cost (cents)',
  'Currency',
  'Tags',
  'Notes',
] as const;

type ImportArgs = {
  propertyId: string;
  xlsxBuffer: Buffer;
  originalFileName: string | null;
  dryRun: boolean;
  createRooms: boolean;
};

type RowError = {
  row: number; // 2-based Excel row number (1 = header)
  field: string;
  message: string;
};

function asString(v: any): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function parseIsoDateOrExcel(v: any): Date | null {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) return v;
  // XLSX may give numbers for Excel dates depending on cell type
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }
  const s = String(v).trim();
  if (!s) return null;
  // accept YYYY-MM-DD
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseCents(v: any): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function parseTags(v: any): string[] {
  const s = asString(v);
  if (!s) return [];
  // allow: "tag1, tag2" or "tag1; tag2"
  return s
    .split(/[,;]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

function normalizeEnum<T extends string>(
  value: any,
  allowed: readonly T[]
): T | null {
  const s = asString(value);
  if (!s) return null;
  const up = s.toUpperCase() as T;
  return allowed.includes(up) ? up : null;
}

export class InventoryImportService {
  async buildTemplateXlsx(propertyId: string): Promise<Buffer> {
    // Template with headers + an example row
    const example = {
      Room: 'Kitchen',
      'Item Name': 'Refrigerator',
      Category: 'APPLIANCE',
      Condition: 'GOOD',
      Brand: 'Whirlpool',
      Model: 'WRX735SDHZ',
      'Serial No': 'ABC1234567',
      'Installed On': '2020-06-01',
      'Purchased On': '2020-05-15',
      'Last Serviced On': '',
      'Purchase Cost (cents)': 189900,
      'Replacement Cost (cents)': 219900,
      Currency: 'USD',
      Tags: 'kitchen, major',
      Notes: 'Stainless steel. Left door has minor scratch.',
    };

    const ws = XLSX.utils.json_to_sheet([example], { header: [...HEADERS] as any });
    // Force header order
    XLSX.utils.sheet_add_aoa(ws, [HEADERS as any], { origin: 'A1' });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');

    const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return out;
  }

  async importFromXlsx(args: ImportArgs) {
    // Ensure property exists (and avoid IDOR via your propertyAuthMiddleware already)
    const prop = await prisma.property.findUnique({
      where: { id: args.propertyId },
      select: { id: true },
    });
    if (!prop) throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');

    const wb = XLSX.read(args.xlsxBuffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new APIError('XLSX has no sheets', 400, 'XLSX_EMPTY');

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
      defval: '',
      raw: true,
    });

    // Validate headers (best effort): require at least required columns
    const headerRow = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 })[0] as any[] | undefined;
    const headerSet = new Set((headerRow || []).map((h) => String(h || '').trim()));
    const missing = ['Item Name', 'Category'].filter((h) => !headerSet.has(h));
    if (missing.length) {
      throw new APIError(
        `Template headers missing: ${missing.join(', ')}`,
        400,
        'XLSX_BAD_HEADERS'
      );
    }

    // Preload rooms for property
    const existingRooms = await prisma.inventoryRoom.findMany({
      where: { propertyId: args.propertyId },
      select: { id: true, name: true },
    });

    const roomByName = new Map<string, { id: string; name: string }>();
    for (const r of existingRooms) {
      roomByName.set(r.name.trim().toLowerCase(), r);
    }

    const batchId = uuidv4();
    const errors: RowError[] = [];
    const toCreate: any[] = [];

    const allowedCategories = Object.values(InventoryItemCategory) as any;
    const allowedConditions = Object.values(InventoryItemCondition) as any;

    // rows[] is data rows (header already consumed by sheet_to_json)
    for (let i = 0; i < rows.length; i++) {
      const excelRowNumber = i + 2; // header is row 1
      const r = rows[i];

      const name = asString(r['Item Name']);
      if (!name) {
        errors.push({ row: excelRowNumber, field: 'Item Name', message: 'Required' });
        continue;
      }

      const category = normalizeEnum(r['Category'], allowedCategories);
      if (!category) {
        errors.push({
          row: excelRowNumber,
          field: 'Category',
          message: `Invalid. Allowed: ${allowedCategories.join(', ')}`,
        });
        continue;
      }

      const condition =
        normalizeEnum(r['Condition'], allowedConditions) || 'UNKNOWN';

      // Room: optional; create if flag enabled
      let roomId: string | null = null;
      const roomName = asString(r['Room']);
      if (roomName) {
        const key = roomName.toLowerCase();
        const existing = roomByName.get(key);
        if (existing) {
          roomId = existing.id;
        } else if (args.createRooms) {
          // create later (batched) or now
          const created = await prisma.inventoryRoom.create({
            data: {
              propertyId: args.propertyId,
              name: roomName,
            },
            select: { id: true, name: true },
          });
          roomByName.set(key, created);
          roomId = created.id;
        } else {
          errors.push({
            row: excelRowNumber,
            field: 'Room',
            message: `Room "${roomName}" does not exist (and createRooms=false)`,
          });
          continue;
        }
      }

      const installedOn = parseIsoDateOrExcel(r['Installed On']);
      const purchasedOn = parseIsoDateOrExcel(r['Purchased On']);
      const lastServicedOn = parseIsoDateOrExcel(r['Last Serviced On']);

      const purchaseCostCents = parseCents(r['Purchase Cost (cents)']);
      if (r['Purchase Cost (cents)'] !== '' && purchaseCostCents === null) {
        errors.push({
          row: excelRowNumber,
          field: 'Purchase Cost (cents)',
          message: 'Must be a number (cents)',
        });
        continue;
      }

      const replacementCostCents = parseCents(r['Replacement Cost (cents)']);
      if (r['Replacement Cost (cents)'] !== '' && replacementCostCents === null) {
        errors.push({
          row: excelRowNumber,
          field: 'Replacement Cost (cents)',
          message: 'Must be a number (cents)',
        });
        continue;
      }

      const currency = asString(r['Currency']) || 'USD';
      const tags = parseTags(r['Tags']);
      const notes = asString(r['Notes']);

      // Optional identity fields
      const brand = asString(r['Brand']);
      const model = asString(r['Model']);
      const serialNo = asString(r['Serial No']);

      toCreate.push({
        propertyId: args.propertyId,
        roomId,
        name,
        category,
        condition,
        brand,
        model,
        serialNo,
        installedOn,
        purchasedOn,
        lastServicedOn,
        purchaseCostCents,
        replacementCostCents,
        currency,
        tags,
        notes,

        // provenance
        source: InventoryItemSource.BULK_UPLOAD,
        sourceBatchId: batchId,
        sourceRowNumber: excelRowNumber,
        sourceFileName: args.originalFileName,
      });
    }

    if (args.dryRun) {
      return {
        mode: 'DRY_RUN',
        batchId,
        totalRows: rows.length,
        validRows: toCreate.length,
        createdCount: 0,
        errors,
      };
    }

    // Create valid rows (partial import by design)
    let createdCount = 0;
    for (const data of toCreate) {
      await prisma.inventoryItem.create({ data });
      createdCount++;
    }

    return {
      mode: 'IMPORT',
      batchId,
      totalRows: rows.length,
      validRows: toCreate.length,
      createdCount,
      errors,
    };
  }
}
