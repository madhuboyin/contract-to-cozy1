// Material Specs domain definition for the shared RecordEditor (FRD v1.390): category-first field rules (server-owned), friendly
// lifecycle wording, the values read from a spec row, the locks the canonical service enforces, and the patch written on save.
// Authorization, freshness and idempotency stay in the handlers.
import { MaterialCategory } from '@prisma/client';
import { correctionDateString } from '../askCorrectionFields';
import { diffEditorValues, readEditorAnswer, type RecordEditorErrors, type RecordEditorField, type RecordEditorSection } from '../recordEditor/recordEditor.contract';

export const MATERIAL_CATEGORY_LABELS: Record<string, string> = {
  PAINT: 'Paint', TILE: 'Tile', FLOORING: 'Flooring', GROUT: 'Grout', COUNTERTOP: 'Countertop', CABINET: 'Cabinet', HARDWARE: 'Hardware',
  TRIM_MOLDING: 'Trim & Molding', WALLPAPER: 'Wallpaper', ROOFING: 'Roofing', SIDING: 'Siding', WINDOW: 'Window', DOOR: 'Door',
  INSULATION: 'Insulation', OTHER: 'Other',
};

export const MATERIAL_CATEGORY_OPTIONS = Object.entries(MATERIAL_CATEGORY_LABELS).map(([value, label]) => ({ label, value }));

/** Friendly lifecycle wording. The lifecycle is one fact; verification confidence is another and is never folded into it. */
export const MATERIAL_LIFECYCLE_LABELS: Record<string, string> = {
  PROPOSED: 'Planned', APPROVED: 'Approved', INSTALLED: 'Installed', AS_BUILT: 'Verified installed', SUBSTITUTED: 'Replaced',
};
export const MATERIAL_LIFECYCLE_NOTES: Record<string, string> = {
  PROPOSED: 'Not yet confirmed as installed.',
  APPROVED: 'Approved for use, not yet recorded as installed.',
  INSTALLED: 'Recorded as installed in this home.',
  AS_BUILT: 'Installed and recorded as built; its identity can only change by recording a substitution.',
  SUBSTITUTED: 'Replaced by another material.',
};
export const materialLifecycleLabel = (value: string | null | undefined): string => MATERIAL_LIFECYCLE_LABELS[value ?? ''] ?? 'Planned';

export const SURFACE_OPTIONS = [
  ['WALLS', 'Walls'], ['CEILING', 'Ceiling'], ['FLOOR', 'Floor'], ['BACKSPLASH', 'Backsplash'], ['SHOWER_WALLS', 'Shower walls'], ['SHOWER_FLOOR', 'Shower floor'],
  ['TUB_SURROUND', 'Tub surround'], ['COUNTERTOP', 'Countertop'], ['EXTERIOR_FACADE', 'Exterior facade'], ['TRIM', 'Trim'], ['DOORS', 'Doors'], ['WINDOWS', 'Windows'],
  ['CABINETRY', 'Cabinetry'], ['OTHER', 'Other'],
].map(([value, label]) => ({ label, value }));

const ALL = Object.keys(MATERIAL_CATEGORY_LABELS);
const without = (...excluded: string[]) => ALL.filter((category) => !excluded.includes(category));

/** Which matching fields matter for which category. Owned here, never duplicated in the client. */
const RELEVANT: Record<string, readonly string[]> = {
  colorCode: without('INSULATION'),
  finish: without('INSULATION', 'GROUT'),
  surface: ['PAINT', 'TILE', 'FLOORING', 'GROUT', 'WALLPAPER', 'TRIM_MOLDING', 'COUNTERTOP', 'CABINET', 'SIDING', 'OTHER'],
  dimensions: without('PAINT', 'GROUT', 'HARDWARE'),
  material: without('PAINT', 'GROUT'),
  lotBatch: ['PAINT', 'TILE', 'FLOORING', 'GROUT', 'WALLPAPER', 'ROOFING', 'SIDING', 'COUNTERTOP', 'OTHER'],
};

export const MATERIAL_EDITOR_SECTIONS: readonly RecordEditorSection[] = [
  { id: 'material', title: 'Material' },
  { id: 'product', title: 'Product' },
  { id: 'match', title: 'Match details' },
  { id: 'purchase', title: 'Purchase and notes' },
];

/** The fields the canonical service refuses to change once a material is installed or verified installed. */
const IDENTITY_KEYS = new Set(['category', 'roomId', 'manufacturer', 'productName', 'sku', 'colorCode', 'finish', 'dimensions', 'material', 'lotBatch']);
const IDENTITY_LOCK_REASON = 'Installed materials keep their recorded identity. To change it, record a substitution instead.';

export const MATERIAL_EDIT_SELECT = {
  id: true, label: true, category: true, scopeLevel: true, roomId: true, surface: true, manufacturer: true, productName: true, sku: true, colorCode: true,
  finish: true, dimensions: true, material: true, lotBatch: true, supplier: true, purchaseDate: true, quantityPurchased: true, notes: true,
  lifecycleStatus: true, updatedAt: true,
} as const;

export interface MaterialEditorRow {
  id: string;
  label: string;
  category: string;
  roomId: string | null;
  surface: string | null;
  manufacturer: string | null;
  productName: string | null;
  sku: string | null;
  colorCode: string | null;
  finish: string | null;
  dimensions: string | null;
  material: string | null;
  lotBatch: string | null;
  supplier: string | null;
  purchaseDate: Date | null;
  quantityPurchased: string | null;
  notes: string | null;
  lifecycleStatus: string;
  updatedAt: Date;
}

export const materialEditorValues = (row: MaterialEditorRow): Record<string, string> => ({
  category: row.category, label: row.label, roomId: row.roomId ?? '', manufacturer: row.manufacturer ?? '', productName: row.productName ?? '', sku: row.sku ?? '',
  colorCode: row.colorCode ?? '', finish: row.finish ?? '', surface: row.surface ?? '', dimensions: row.dimensions ?? '', material: row.material ?? '', lotBatch: row.lotBatch ?? '',
  supplier: row.supplier ?? '', purchaseDate: correctionDateString(row.purchaseDate) ?? '', quantityPurchased: row.quantityPurchased ?? '', notes: row.notes ?? '',
});

/** The fields for one category. `mode: 'type'` is the first Add step: only the type is asked, so the rest can be category-specific. */
export function materialEditorFields(category: string | null, rooms: ReadonlyArray<{ id: string; name: string }>, opts: { mode: 'type' | 'add' | 'edit'; lifecycle?: string }): RecordEditorField[] {
  const typeField: RecordEditorField = {
    key: 'category', label: 'Type', kind: 'SELECT', section: 'material', required: true, options: MATERIAL_CATEGORY_OPTIONS,
    ...(opts.mode === 'add' ? { disabledReason: 'Chosen in the previous step. Cancel to start over with a different type.' }
      : opts.mode === 'edit' ? { disabledReason: 'The type is fixed. Changing it needs a separate reclassification, so nothing is cleared by accident.' } : {}),
  };
  if (opts.mode === 'type') return [typeField];
  const has = (key: keyof typeof RELEVANT) => !category || RELEVANT[key].includes(category);
  const fields: RecordEditorField[] = [
    typeField,
    { key: 'label', label: 'Name', kind: 'TEXT', section: 'material', required: true, maxLength: 120, helpText: 'For example: Kitchen wall paint' },
    { key: 'roomId', label: 'Where', kind: 'SELECT', section: 'material', required: false, emptyLabel: 'Whole home', options: rooms.map((room) => ({ label: room.name, value: room.id })) },
    { key: 'manufacturer', label: 'Brand', kind: 'TEXT', section: 'product', required: false, maxLength: 120 },
    { key: 'productName', label: 'Product', kind: 'TEXT', section: 'product', required: false, maxLength: 120 },
    { key: 'sku', label: 'SKU or part number', kind: 'TEXT', section: 'product', required: false, maxLength: 120 },
  ];
  if (has('colorCode')) fields.push({ key: 'colorCode', label: category === 'PAINT' ? 'Colour code' : 'Colour', kind: 'TEXT', section: 'match', required: false, maxLength: 60, helpText: category === 'PAINT' ? 'The code on the can makes it easy to match later.' : undefined });
  if (has('finish')) fields.push({ key: 'finish', label: 'Finish', kind: 'TEXT', section: 'match', required: false, maxLength: 60 });
  if (has('surface')) fields.push({ key: 'surface', label: 'Surface', kind: 'SELECT', section: 'match', required: false, emptyLabel: 'Not specified', options: SURFACE_OPTIONS });
  if (has('dimensions')) fields.push({ key: 'dimensions', label: 'Size', kind: 'TEXT', section: 'match', required: false, maxLength: 120 });
  if (has('material')) fields.push({ key: 'material', label: 'Material', kind: 'TEXT', section: 'match', required: false, maxLength: 120 });
  if (has('lotBatch')) fields.push({ key: 'lotBatch', label: 'Lot or batch', kind: 'TEXT', section: 'match', required: false, maxLength: 120, helpText: 'Needed to match colour across purchases.' });
  fields.push(
    { key: 'supplier', label: 'Supplier', kind: 'TEXT', section: 'purchase', required: false, maxLength: 120 },
    { key: 'purchaseDate', label: 'Purchase date', kind: 'DATE', section: 'purchase', required: false },
    { key: 'quantityPurchased', label: 'Quantity', kind: 'TEXT', section: 'purchase', required: false, maxLength: 60 },
    { key: 'notes', label: 'Notes', kind: 'TEXTAREA', section: 'purchase', required: false, maxLength: 1000 },
  );
  if (opts.mode === 'edit' && (opts.lifecycle === 'INSTALLED' || opts.lifecycle === 'AS_BUILT')) {
    return fields.map((field) => (IDENTITY_KEYS.has(field.key) && !field.disabledReason ? { ...field, disabledReason: IDENTITY_LOCK_REASON } : field));
  }
  return fields;
}

/** Only the sections that still hold a field for this category. */
export const materialEditorSections = (fields: readonly RecordEditorField[]) => MATERIAL_EDITOR_SECTIONS.filter((section) => fields.some((field) => field.section === section.id));

export function validateMaterialEditorAnswer(fields: readonly RecordEditorField[], original: Record<string, string>, answer: unknown): { values: Record<string, string>; errors: RecordEditorErrors } {
  return readEditorAnswer(fields, answer, original);
}

export const materialEditorChanges = (fields: readonly RecordEditorField[], original: Record<string, string>, values: Record<string, string>) => diffEditorValues(fields, original, values);

export const isMaterialCategory = (value: unknown): value is MaterialCategory => typeof value === 'string' && Object.prototype.hasOwnProperty.call(MATERIAL_CATEGORY_LABELS, value);

/** The narrowed service payload for ONLY the given keys: a cleared optional field is null, a room choice also sets the scope. */
export function materialEditorPayload(keys: readonly string[], values: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of keys) {
    const value = values[key];
    if (key === 'roomId') { payload.roomId = value || null; payload.scopeLevel = value ? 'ROOM' : 'PROPERTY'; }
    else if (key === 'category' || key === 'label') payload[key] = value;
    else payload[key] = value || null;
  }
  return payload;
}
