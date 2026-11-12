// Reviewed data-point catalogue (reliability FRD FR-DATA-1..5, D11, D12, D13). The Prisma schema says what exists; this file says what the homeowner may be shown and
// how they ask for it. FAIL CLOSED: a field not listed here cannot be read through DATA_POINT_READ, whatever the schema contains. Slice 1b-1 covers the first domain in the
// owner's order (appliances-inventory, entity InventoryItem). Each entry is an engineering PROPOSAL pending owner sign-off of the D11 field list (see the FRD §38 decisions).
export type DataPointFamily = 'text' | 'date' | 'money' | 'enum' | 'tags' | 'flag';
export interface DataPointDefinition {
  /** Stable id used by plans, fixtures and tests (never a column name). */
  readonly id: string;
  readonly domain: 'appliances-inventory';
  readonly entity: 'InventoryItem';
  /** The Prisma column the value is read from. */
  readonly field: string;
  readonly family: DataPointFamily;
  /** The question this data point answers, in homeowner words (FR-REC-3). */
  readonly label: string;
  /** Lower-case alias phrases a homeowner uses for it. Matched on whole words after routing normalisation. */
  readonly aliases: readonly string[];
  /** How the value is phrased when present. */
  readonly sentence: string;
  readonly sensitivity: 'HOME' | 'FINANCIAL';
}

const d = (x: DataPointDefinition): DataPointDefinition => x;
export const DATA_POINT_DEFINITIONS: readonly DataPointDefinition[] = Object.freeze([
  d({ id: 'item.brand', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'brand', family: 'text', label: 'The brand', aliases: ['brand', 'maker', 'who makes'], sentence: 'is made by', sensitivity: 'HOME' }),
  d({ id: 'item.manufacturer', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'manufacturer', family: 'text', label: 'The manufacturer', aliases: ['manufacturer', 'manufactured by'], sentence: 'is made by', sensitivity: 'HOME' }),
  d({ id: 'item.model', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'modelNumber', family: 'text', label: 'The model number', aliases: ['model number', 'model no', 'model'], sentence: 'has model number', sensitivity: 'HOME' }),
  d({ id: 'item.serial', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'serialNumber', family: 'text', label: 'The serial number', aliases: ['serial number', 'serial no', 'serial'], sentence: 'has serial number', sensitivity: 'HOME' }),
  d({ id: 'item.installedOn', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'installedOn', family: 'date', label: 'When it was installed', aliases: ['installed', 'installation date', 'install date'], sentence: 'was installed', sensitivity: 'HOME' }),
  d({ id: 'item.purchasedOn', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'purchasedOn', family: 'date', label: 'When it was purchased', aliases: ['purchased', 'bought', 'purchase date', 'date of purchase'], sentence: 'was purchased', sensitivity: 'HOME' }),
  d({ id: 'item.lastServicedOn', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'lastServicedOn', family: 'date', label: 'When it was last serviced', aliases: ['last serviced', 'last service', 'last service date', 'serviced last'], sentence: 'was last serviced', sensitivity: 'HOME' }),
  d({ id: 'item.expectedExpiryDate', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'expectedExpiryDate', family: 'date', label: 'When it is expected to wear out', aliases: ['expected to last', 'end of life', 'expected expiry', 'expiry date', 'life expectancy', 'wear out'], sentence: 'is expected to reach the end of its life', sensitivity: 'HOME' }),
  d({ id: 'item.condition', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'condition', family: 'enum', label: 'Its recorded condition', aliases: ['condition'], sentence: 'is recorded in', sensitivity: 'HOME' }),
  d({ id: 'item.category', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'category', family: 'enum', label: 'Its category', aliases: ['category', 'what type', 'what kind'], sentence: 'is filed under', sensitivity: 'HOME' }),
  d({ id: 'item.efficiencyRating', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'efficiencyRating', family: 'text', label: 'Its efficiency rating', aliases: ['efficiency rating', 'efficiency', 'energy rating', 'energy star'], sentence: 'has an efficiency rating of', sensitivity: 'HOME' }),
  d({ id: 'item.purchaseCost', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'purchaseCostCents', family: 'money', label: 'What it cost when bought', aliases: ['purchase price', 'purchase cost', 'paid for', 'did i pay', 'cost when i bought', 'bought for', 'price paid'], sentence: 'was bought for', sensitivity: 'FINANCIAL' }),
  d({ id: 'item.replacementCost', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'replacementCostCents', family: 'money', label: 'The recorded replacement cost', aliases: ['recorded replacement cost', 'replacement value'], sentence: 'has a recorded replacement cost of', sensitivity: 'FINANCIAL' }),
  d({ id: 'item.notes', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'notes', family: 'text', label: 'The notes you saved', aliases: ['notes'], sentence: 'has these notes', sensitivity: 'HOME' }),
  d({ id: 'item.tags', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'tags', family: 'tags', label: 'Its tags', aliases: ['tags', 'tagged'], sentence: 'is tagged', sensitivity: 'HOME' }),
]);

export const DATA_POINT_BY_ID: ReadonlyMap<string, DataPointDefinition> = new Map(DATA_POINT_DEFINITIONS.map((p) => [p.id, p]));
/** The only columns the reader may select (FR-DATA-15: the select list is built from this allowlist, never from user text). */
export const READABLE_ITEM_FIELDS: readonly string[] = Object.freeze(DATA_POINT_DEFINITIONS.map((p) => p.field));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The data point a message asks about, or null when none or more than one distinct point matches (never guess between two). Longest alias wins; ties across points = null. */
export function resolveDataPoint(message: string): DataPointDefinition | null {
  const text = ` ${message.toLowerCase().replace(/[^a-z0-9$' ]+/g, ' ').replace(/\s+/g, ' ')} `;
  let best: { point: DataPointDefinition; length: number } | null = null; let tied = false;
  for (const point of DATA_POINT_DEFINITIONS) for (const alias of point.aliases) {
    if (!new RegExp(`\\b${escapeRe(alias)}\\b`).test(text)) continue;
    if (!best || alias.length > best.length) { best = { point, length: alias.length }; tied = false; }
    else if (alias.length === best.length && best.point.id !== point.id) tied = true;
  }
  return best && !tied ? best.point : null;
}
