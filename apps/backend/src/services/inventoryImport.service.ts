// apps/backend/src/services/inventoryImport.service.ts
import ExcelJS from 'exceljs';
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
  // exceljs returns native Date objects for date-formatted cells — no serial conversion needed
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  if (!s) return null;
  // accept YYYY-MM-DD strings
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
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Inventory');

    // Define columns — this sets the header row (row 1) and column keys
    ws.columns = HEADERS.map((h) => ({ header: h, key: h, width: 20 }));

    // Add the example data row
    ws.addRow({
      'Room': 'Kitchen',
      'Item Name': 'Refrigerator',
      'Category': 'APPLIANCE',
      'Condition': 'GOOD',
      'Brand': 'Whirlpool',
      'Model': 'WRX735SDHZ',
      'Serial No': 'ABC1234567',
      'Installed On': '2020-06-01',
      'Purchased On': '2020-05-15',
      'Last Serviced On': '',
      'Purchase Cost (cents)': 189900,
      'Replacement Cost (cents)': 219900,
      'Currency': 'USD',
      'Tags': 'kitchen, major',
      'Notes': 'Stainless steel. Left door has minor scratch.',
    });

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  async importFromXlsx(args: ImportArgs) {
    // Ensure property exists
    const prop = await prisma.property.findUnique({
      where: { id: args.propertyId },
      select: { id: true },
    });
    if (!prop) throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(args.xlsxBuffer as unknown as ArrayBuffer);

    const ws = wb.worksheets[0];
    if (!ws) throw new APIError('XLSX has no sheets', 400, 'XLSX_EMPTY');

    // Extract header row (row 1) for validation
    const headerRow = ws.getRow(1);
    const headerSet = new Set<string>();
    headerRow.eachCell((cell) => {
      const val = asString(cell.value);
      if (val) headerSet.add(val);
    });

    const missing = ['Item Name', 'Category'].filter((h) => !headerSet.has(h));
    if (missing.length) {
      throw new APIError(
        `Template headers missing: ${missing.join(', ')}`,
        400,
        'XLSX_BAD_HEADERS'
      );
    }

    // Build column-index → header-name map from row 1
    const colIndexToHeader = new Map<number, string>();
    headerRow.eachCell((cell, colNumber) => {
      const val = asString(cell.value);
      if (val) colIndexToHeader.set(colNumber, val);
    });

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

    // Iterate data rows (skip row 1 = header)
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header

      // Build a keyed record from this row using the column map
      const r: Record<string, any> = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = colIndexToHeader.get(colNumber);
        if (header) {
          // exceljs returns cell.value — may be string, number, Date, RichText, etc.
          const val = cell.value;
          // Unwrap RichText objects to plain string
          if (val && typeof val === 'object' && 'richText' in (val as any)) {
            r[header] = (val as any).richText.map((rt: any) => rt.text).join('');
          } else {
            r[header] = val;
          }
        }
      });

      const excelRowNumber = rowNumber;

      const name = asString(r['Item Name']);
      if (!name) {
        errors.push({ row: excelRowNumber, field: 'Item Name', message: 'Required' });
        return;
      }

      const category = normalizeEnum(r['Category'], allowedCategories);
      if (!category) {
        errors.push({
          row: excelRowNumber,
          field: 'Category',
          message: `Invalid. Allowed: ${allowedCategories.join(', ')}`,
        });
        return;
      }

      const condition =
        normalizeEnum(r['Condition'], allowedConditions) || 'UNKNOWN';

      toCreate.push({ r, name, category, condition, excelRowNumber });
    });

    // Second pass: resolve rooms (needs async)
    const resolved: any[] = [];
    for (const item of toCreate) {
      const { r, name, category, condition, excelRowNumber } = item;

      let roomId: string | null = null;
      const roomName = asString(r['Room']);
      if (roomName) {
        const key = roomName.toLowerCase();
        const existing = roomByName.get(key);
        if (existing) {
          roomId = existing.id;
        } else if (args.createRooms) {
          const created = await prisma.inventoryRoom.create({
            data: { propertyId: args.propertyId, name: roomName },
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
      if (r['Purchase Cost (cents)'] !== '' && r['Purchase Cost (cents)'] !== null && purchaseCostCents === null) {
        errors.push({
          row: excelRowNumber,
          field: 'Purchase Cost (cents)',
          message: 'Must be a number (cents)',
        });
        continue;
      }

      const replacementCostCents = parseCents(r['Replacement Cost (cents)']);
      if (r['Replacement Cost (cents)'] !== '' && r['Replacement Cost (cents)'] !== null && replacementCostCents === null) {
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

      const brand = asString(r['Brand']);
      const model = asString(r['Model']);
      const serialNo = asString(r['Serial No']);

      resolved.push({
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
        totalRows: ws.rowCount - 1, // subtract header
        validRows: resolved.length,
        createdCount: 0,
        errors,
      };
    }

    let createdCount = 0;
    for (const data of resolved) {
      await prisma.inventoryItem.create({ data });
      createdCount++;
    }

    return {
      mode: 'IMPORT',
      batchId,
      totalRows: ws.rowCount - 1,
      validRows: resolved.length,
      createdCount,
      errors,
    };
  }
}
