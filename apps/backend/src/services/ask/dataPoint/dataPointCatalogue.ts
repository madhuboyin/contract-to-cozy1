// Reviewed data-point catalogue (reliability FRD FR-DATA-1..5, D11, D12, D13). The Prisma schema says what exists; this file says what the homeowner may be shown and
// how they ask for it. FAIL CLOSED: a field not listed here cannot be read through DATA_POINT_READ, whatever the schema contains. Slice 1b-1 covers the first domain in the
// owner's order (appliances-inventory, entity InventoryItem). Each entry is an engineering PROPOSAL pending owner sign-off of the D11 field list (see the FRD §38 decisions).
export type DataPointFamily = 'text' | 'date' | 'money' | 'dollars' | 'enum' | 'tags' | 'flag';
export type DataPointEntity = 'InventoryItem' | 'Warranty' | 'InsurancePolicy' | 'PropertyMaintenanceTask';
export type DataPointDomain = 'appliances-inventory' | 'warranties' | 'insurance' | 'maintenance';
export type AudienceFloor = 'VIEWER' | 'CONTRIBUTOR' | 'OWNER';
export interface DataPointDefinition {
  /** Stable id used by plans, fixtures and tests (never a column name). */
  readonly id: string;
  readonly domain: DataPointDomain;
  readonly entity: DataPointEntity;
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
  /** The lowest household role that may be shown this data point. Explicit for every point (a point with no entry in FIELD_AUDIENCE fails the module load), enforced by the reader and re-checked on composite replay. */
  readonly audience: AudienceFloor;
  /** Words that must appear in the message for a point of a non-inventory entity ("warranty", "policy", "task"), so a bare "expires" never picks an entity. */
  readonly cues?: readonly string[];
}

/** Per-point audience floors (review 2026-11-11). Money, serial numbers, free-form coverage text and tags are not shown to viewers; plain item, date and status facts are. Pending owner sign-off like the rest of the catalogue. */
const FIELD_AUDIENCE: Readonly<Record<string, AudienceFloor>> = Object.freeze({
  'item.brand': 'VIEWER', 'item.manufacturer': 'VIEWER', 'item.model': 'VIEWER', 'item.serial': 'CONTRIBUTOR', 'item.installedOn': 'VIEWER', 'item.purchasedOn': 'VIEWER',
  'item.lastServicedOn': 'VIEWER', 'item.expectedExpiryDate': 'VIEWER', 'item.condition': 'VIEWER', 'item.category': 'VIEWER', 'item.efficiencyRating': 'VIEWER',
  'item.purchaseCost': 'CONTRIBUTOR', 'item.replacementCost': 'CONTRIBUTOR', 'item.tags': 'CONTRIBUTOR',
  'warranty.expiryDate': 'VIEWER', 'warranty.startDate': 'VIEWER', 'warranty.provider': 'VIEWER', 'warranty.coverage': 'CONTRIBUTOR', 'warranty.cost': 'CONTRIBUTOR',
  'policy.carrier': 'VIEWER', 'policy.expiryDate': 'VIEWER', 'policy.startDate': 'VIEWER', 'policy.deductible': 'CONTRIBUTOR', 'policy.premium': 'CONTRIBUTOR',
  'policy.coverageType': 'VIEWER', 'policy.personalPropertyLimit': 'CONTRIBUTOR',
  'task.nextDueDate': 'VIEWER', 'task.lastCompletedDate': 'VIEWER', 'task.status': 'VIEWER', 'task.priority': 'VIEWER', 'task.frequency': 'VIEWER',
  'task.estimatedCost': 'CONTRIBUTOR', 'task.actualCost': 'CONTRIBUTOR',
});
const d = (x: Omit<DataPointDefinition, 'audience'>): DataPointDefinition => {
  const audience = FIELD_AUDIENCE[x.id];
  if (!audience) throw new Error(`data point ${x.id} has no audience floor; the catalogue fails closed`);
  return { ...x, audience };
};
const ROLE_RANK: Readonly<Record<string, number>> = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 };
/** Whether a household role may be shown a data point. An unknown role is refused. */
export const roleMayRead = (role: string, point: DataPointDefinition): boolean => (ROLE_RANK[role] ?? 0) >= ROLE_RANK[point.audience];
const INVENTORY_POINTS: readonly DataPointDefinition[] = [
  d({ id: 'item.brand', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'brand', family: 'text', label: 'The brand', aliases: ['brand', 'maker', 'who makes'], sentence: 'is made by', sensitivity: 'HOME' }),
  d({ id: 'item.manufacturer', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'manufacturer', family: 'text', label: 'The manufacturer', aliases: ['manufacturer', 'manufactured by'], sentence: 'is made by', sensitivity: 'HOME' }),
  d({ id: 'item.model', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'modelNumber', family: 'text', label: 'The model number', aliases: ['model number', 'model no', 'model'], sentence: 'has model number', sensitivity: 'HOME' }),
  d({ id: 'item.serial', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'serialNumber', family: 'text', label: 'The serial number', aliases: ['serial number', 'serial no', 'serial'], sentence: 'has serial number', sensitivity: 'HOME' }),
  d({ id: 'item.installedOn', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'installedOn', family: 'date', label: 'When it was installed', aliases: ['installed', 'installation date', 'install date'], sentence: 'was installed', sensitivity: 'HOME' }),
  d({ id: 'item.purchasedOn', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'purchasedOn', family: 'date', label: 'When it was purchased', aliases: ['purchased', 'bought', 'purchase date', 'date of purchase'], sentence: 'was purchased', sensitivity: 'HOME' }),
  d({ id: 'item.lastServicedOn', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'lastServicedOn', family: 'date', label: 'When it was last serviced', aliases: ['last serviced', 'last service', 'last service date', 'serviced last'], sentence: 'was last serviced', sensitivity: 'HOME' }),
  d({ id: 'item.expectedExpiryDate', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'expectedExpiryDate', family: 'date', label: 'When it is expected to wear out', aliases: ['expected to last', 'end of life', 'expected expiry', 'life expectancy', 'wear out'], sentence: 'is expected to reach the end of its life', sensitivity: 'HOME' }),
  d({ id: 'item.condition', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'condition', family: 'enum', label: 'Its recorded condition', aliases: ['condition'], sentence: 'is recorded in', sensitivity: 'HOME' }),
  d({ id: 'item.category', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'category', family: 'enum', label: 'Its category', aliases: ['category', 'what type', 'what kind'], sentence: 'is filed under', sensitivity: 'HOME' }),
  d({ id: 'item.efficiencyRating', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'efficiencyRating', family: 'text', label: 'Its efficiency rating', aliases: ['efficiency rating', 'efficiency', 'energy rating', 'energy star'], sentence: 'has an efficiency rating of', sensitivity: 'HOME' }),
  d({ id: 'item.purchaseCost', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'purchaseCostCents', family: 'money', label: 'What it cost when bought', aliases: ['purchase price', 'purchase cost', 'paid for', 'did i pay', 'cost when i bought', 'bought for', 'price paid'], sentence: 'was bought for', sensitivity: 'FINANCIAL' }),
  d({ id: 'item.replacementCost', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'replacementCostCents', family: 'money', label: 'The recorded replacement cost', aliases: ['recorded replacement cost', 'replacement value'], sentence: 'has a recorded replacement cost of', sensitivity: 'FINANCIAL' }),
  // item.notes is deliberately NOT catalogued: free-form text can hold anything (review 2026-11-11).
  d({ id: 'item.tags', domain: 'appliances-inventory', entity: 'InventoryItem', field: 'tags', family: 'tags', label: 'Its tags', aliases: ['tags', 'tagged'], sentence: 'is tagged', sensitivity: 'HOME' }),
];

const W = ['warranty', 'warranties', 'warrantied'];
const P = ['policy', 'policies', 'insurance', 'insurer', 'insured'];
const T = ['task', 'tasks', 'chore', 'reminder', 'maintenance'];
const w = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience'>): DataPointDefinition => d({ ...x, domain: 'warranties', entity: 'Warranty', cues: W });
const pol = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience'>): DataPointDefinition => d({ ...x, domain: 'insurance', entity: 'InsurancePolicy', cues: P });
const mt = (x: Omit<DataPointDefinition, 'domain' | 'entity' | 'cues' | 'audience'>): DataPointDefinition => d({ ...x, domain: 'maintenance', entity: 'PropertyMaintenanceTask', cues: T });
const OTHER_DOMAINS: readonly DataPointDefinition[] = [
  w({ id: 'warranty.expiryDate', field: 'expiryDate', family: 'date', label: 'When the warranty expires', aliases: ['expire', 'expires', 'expiration', 'expiry', 'expiry date', 'run out', 'runs out', 'good until', 'end'], sentence: 'expires', sensitivity: 'HOME' }),
  w({ id: 'warranty.startDate', field: 'startDate', family: 'date', label: 'When the warranty started', aliases: ['start', 'starts', 'started', 'begin', 'began', 'start date', 'effective'], sentence: 'started', sensitivity: 'HOME' }),
  w({ id: 'warranty.provider', field: 'providerName', family: 'text', label: 'Who the warranty is with', aliases: ['provider', 'who is it with', 'who provides', 'company', 'who is the warranty with', 'warranty with', 'who covers'], sentence: 'is with', sensitivity: 'HOME' }),
  w({ id: 'warranty.coverage', field: 'coverageDetails', family: 'text', label: 'What the warranty covers', aliases: ['cover', 'covers', 'covered', 'coverage', 'coverage details', 'what does'], sentence: 'has these coverage notes:', sensitivity: 'HOME' }),
  w({ id: 'warranty.cost', field: 'cost', family: 'dollars', label: 'What the warranty cost', aliases: ['cost', 'price', 'paid', 'pay'], sentence: 'cost', sensitivity: 'FINANCIAL' }),
  pol({ id: 'policy.carrier', field: 'carrierName', family: 'text', label: 'Who the policy is with', aliases: ['carrier', 'insurer', 'company', 'who is my insurance with', 'who insures', 'who is it with', 'insurance with', 'policy with', 'provider'], sentence: 'is with', sensitivity: 'HOME' }),
  pol({ id: 'policy.expiryDate', field: 'expiryDate', family: 'date', label: 'When the policy expires', aliases: ['expire', 'expires', 'expiration', 'expiry', 'expiry date', 'renew', 'renews', 'renewal', 'renewal date', 'run out', 'runs out'], sentence: 'expires', sensitivity: 'HOME' }),
  pol({ id: 'policy.startDate', field: 'startDate', family: 'date', label: 'When the policy started', aliases: ['start', 'starts', 'started', 'start date', 'effective'], sentence: 'started', sensitivity: 'HOME' }),
  pol({ id: 'policy.deductible', field: 'deductibleCents', family: 'money', label: 'The deductible', aliases: ['deductible', 'deductibles'], sentence: 'has a deductible of', sensitivity: 'FINANCIAL' }),
  pol({ id: 'policy.premium', field: 'premiumAmount', family: 'dollars', label: 'The premium', aliases: ['premium', 'premiums', 'cost', 'pay', 'paying', 'monthly cost'], sentence: 'has a premium of', sensitivity: 'FINANCIAL' }),
  pol({ id: 'policy.coverageType', field: 'coverageType', family: 'text', label: 'The type of coverage', aliases: ['coverage type', 'type of coverage', 'type of policy', 'what kind of policy'], sentence: 'has coverage type', sensitivity: 'HOME' }),
  pol({ id: 'policy.personalPropertyLimit', field: 'personalPropertyLimitCents', family: 'money', label: 'The personal property limit', aliases: ['personal property limit', 'personal property coverage', 'contents limit', 'contents coverage'], sentence: 'has a personal property limit of', sensitivity: 'FINANCIAL' }),
  mt({ id: 'task.nextDueDate', field: 'nextDueDate', family: 'date', label: 'When it is next due', aliases: ['due', 'next due', 'due date', 'when is it due', 'next time', 'scheduled'], sentence: 'is next due', sensitivity: 'HOME' }),
  mt({ id: 'task.lastCompletedDate', field: 'lastCompletedDate', family: 'date', label: 'When it was last done', aliases: ['last done', 'last complete', 'last completed', 'last time', 'last did', 'completed', 'finished', 'last finished'], sentence: 'was last completed', sensitivity: 'HOME' }),
  mt({ id: 'task.status', field: 'status', family: 'enum', label: 'Its status', aliases: ['status'], sentence: 'has status', sensitivity: 'HOME' }),
  mt({ id: 'task.priority', field: 'priority', family: 'enum', label: 'Its priority', aliases: ['priority', 'how urgent', 'urgent'], sentence: 'has priority', sensitivity: 'HOME' }),
  mt({ id: 'task.frequency', field: 'frequency', family: 'enum', label: 'How often it repeats', aliases: ['how often', 'frequency', 'repeat', 'repeats', 'recurring'], sentence: 'repeats', sensitivity: 'HOME' }),
  mt({ id: 'task.estimatedCost', field: 'estimatedCost', family: 'dollars', label: 'The estimated cost', aliases: ['estimated cost', 'estimate', 'expected cost', 'how much will', 'how much does'], sentence: 'has an estimated cost of', sensitivity: 'FINANCIAL' }),
  mt({ id: 'task.actualCost', field: 'actualCost', family: 'dollars', label: 'What it actually cost', aliases: ['actual cost', 'actually cost', 'how much did', 'cost me', 'what did it cost'], sentence: 'actually cost', sensitivity: 'FINANCIAL' }),
];

export const DATA_POINT_DEFINITIONS: readonly DataPointDefinition[] = Object.freeze([...INVENTORY_POINTS, ...OTHER_DOMAINS]);
export const DATA_POINT_BY_ID: ReadonlyMap<string, DataPointDefinition> = new Map(DATA_POINT_DEFINITIONS.map((p) => [p.id, p]));
/** The only columns the reader may select per entity (FR-DATA-15: the select list is built from this allowlist, never from user text). */
export const READABLE_FIELDS: Readonly<Record<DataPointEntity, readonly string[]>> = Object.freeze({
  InventoryItem: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'InventoryItem').map((p) => p.field),
  Warranty: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'Warranty').map((p) => p.field),
  InsurancePolicy: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'InsurancePolicy').map((p) => p.field),
  PropertyMaintenanceTask: DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'PropertyMaintenanceTask').map((p) => p.field),
});
export const READABLE_ITEM_FIELDS: readonly string[] = READABLE_FIELDS.InventoryItem;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The data point a message asks about, or null when none or more than one distinct point matches (never guess between two). Longest alias wins; ties across points = null. */
export function resolveDataPoint(message: string): DataPointDefinition | null {
  const text = ` ${message.toLowerCase().replace(/[^a-z0-9$' ]+/g, ' ').replace(/\s+/g, ' ')} `;
  let best: { point: DataPointDefinition; length: number } | null = null; let tied = false;
  for (const point of DATA_POINT_DEFINITIONS) for (const alias of point.aliases) {
    // Points of a non-inventory entity need that entity's cue word in the message; the cue also breaks ties against inventory points.
    if (point.cues && !point.cues.some((cue) => new RegExp(`\\b${escapeRe(cue)}\\b`).test(text))) continue;
    if (!new RegExp(`\\b${escapeRe(alias)}\\b`).test(text)) continue;
    const weight = alias.length + (point.cues ? 100 : 0);
    if (!best || weight > best.length) { best = { point, length: weight }; tied = false; }
    else if (weight === best.length && best.point.id !== point.id) tied = true;
  }
  return best && !tied ? best.point : null;
}
