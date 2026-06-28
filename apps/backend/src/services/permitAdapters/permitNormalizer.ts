// These types are re-declared here because the Prisma client is generated
// from schema — importing from @prisma/client before `prisma generate` fails.
// After the client is regenerated, these can be imported directly.
type PermitRecordCategory =
  | 'BUILDING' | 'ELECTRICAL' | 'PLUMBING' | 'MECHANICAL' | 'STRUCTURAL'
  | 'ROOFING' | 'ZONING' | 'DEMOLITION' | 'GRADING' | 'FIRE' | 'OTHER';

type PermitWorkType =
  | 'HVAC_NEW' | 'HVAC_REPLACEMENT' | 'ELECTRICAL_PANEL' | 'ELECTRICAL_WIRING'
  | 'PLUMBING_NEW' | 'PLUMBING_REPAIR' | 'ROOF_REPLACEMENT' | 'ROOF_REPAIR'
  | 'ROOM_ADDITION' | 'GARAGE_CONVERSION' | 'ADU' | 'BASEMENT_FINISH' | 'DECK_PATIO'
  | 'FENCE' | 'SWIMMING_POOL' | 'SOLAR' | 'WINDOWS_DOORS' | 'FIREPLACE'
  | 'SEWER_WATER_LINE' | 'STRUCTURAL_REPAIR' | 'INTERIOR_REMODEL' | 'EXTERIOR_REMODEL'
  | 'DEMOLITION' | 'GRADING_DRAINAGE' | 'OTHER';

type PermitRecordStatus =
  | 'APPLIED' | 'ISSUED' | 'INSPECTION_PENDING' | 'INSPECTION_FAILED'
  | 'FINALED' | 'EXPIRED' | 'VOIDED' | 'UNKNOWN';

type PermitRecordSource = 'OPEN_DATA_API' | 'MANUAL_ENTRY' | 'DOCUMENT_UPLOAD';

export interface PermitDataSource {
  id: string;
  fieldMappingJson: unknown;
  queryFilterJson: unknown;
  apiKeyEnvVar: string | null;
  adapterType: string;
  slug: string;
  baseUrl: string;
  datasetId: string | null;
}

export interface PropertyAddress {
  street: string;
  city: string;
  state: string;
  postalCode?: string;
}

export interface RawPermitRecord {
  externalId: string;
  permitNumber?: string;
  categoryRaw?: string;
  description?: string;
  statusRaw?: string;
  applicantName?: string;
  contractorName?: string;
  contractorLicense?: string;
  workLocation?: string;
  applicationDate?: string;
  issueDate?: string;
  expirationDate?: string;
  finaledDate?: string;
  estimatedCostRaw?: string;
  rawData: Record<string, unknown>;
}

export interface NormalizedPermitRecord {
  propertyId: string;
  permitNumber?: string;
  category: PermitRecordCategory;
  workTypes: PermitWorkType[];
  description?: string;
  status: PermitRecordStatus;
  applicantName?: string;
  contractorName?: string;
  contractorLicense?: string;
  applicationDate?: Date;
  issueDate?: Date;
  expirationDate?: Date;
  finaledDate?: Date;
  estimatedCostCents?: number;
  source: PermitRecordSource;
  dataSourceId: string;
  externalId: string;
  dedupeKey: string;
  rawDataJson: Record<string, unknown>;
}

const CATEGORY_KEYWORDS: Array<[string[], PermitRecordCategory]> = [
  [['elec', 'electrical'], 'ELECTRICAL'],
  [['plumb'], 'PLUMBING'],
  [['mech', 'hvac', 'mechanical'], 'MECHANICAL'],
  [['struct', 'structural'], 'STRUCTURAL'],
  [['roof'], 'ROOFING'],
  [['zone', 'zoning'], 'ZONING'],
  [['demo', 'demolition'], 'DEMOLITION'],
  [['grade', 'grading'], 'GRADING'],
  [['fire'], 'FIRE'],
  [['build', 'construction', 'permit'], 'BUILDING'],
];

const WORK_TYPE_KEYWORDS: Array<[string[], PermitWorkType]> = [
  [['hvac new', 'new hvac', 'new air', 'install hvac'], 'HVAC_NEW'],
  [['hvac replace', 'replace hvac', 'furnace replace', 'ac replace'], 'HVAC_REPLACEMENT'],
  [['electrical panel', 'panel upgrade', 'panel replace', 'service panel'], 'ELECTRICAL_PANEL'],
  [['wiring', 'rewire', 'electrical wir'], 'ELECTRICAL_WIRING'],
  [['new plumb', 'plumb new', 'plumb install'], 'PLUMBING_NEW'],
  [['plumb repair', 'repair plumb'], 'PLUMBING_REPAIR'],
  [['roof replace', 'replace roof', 'new roof'], 'ROOF_REPLACEMENT'],
  [['roof repair', 'repair roof'], 'ROOF_REPAIR'],
  [['room addition', 'addition', 'room add'], 'ROOM_ADDITION'],
  [['garage conversion', 'garage convert'], 'GARAGE_CONVERSION'],
  [['adu', 'accessory dwelling', 'in-law', 'granny flat'], 'ADU'],
  [['basement finish', 'finish basement'], 'BASEMENT_FINISH'],
  [['deck', 'patio', 'pergola'], 'DECK_PATIO'],
  [['fence'], 'FENCE'],
  [['pool', 'swimming'], 'SWIMMING_POOL'],
  [['solar', 'photovoltaic', 'pv install'], 'SOLAR'],
  [['window', 'door replace'], 'WINDOWS_DOORS'],
  [['fireplace', 'chimney'], 'FIREPLACE'],
  [['sewer', 'water line', 'water main'], 'SEWER_WATER_LINE'],
  [['structural repair', 'struct repair'], 'STRUCTURAL_REPAIR'],
  [['interior remodel', 'kitchen remodel', 'bath remodel'], 'INTERIOR_REMODEL'],
  [['exterior remodel', 'siding', 'exterior'], 'EXTERIOR_REMODEL'],
  [['demolition', 'demo'], 'DEMOLITION'],
  [['grading', 'drainage', 'retaining wall'], 'GRADING_DRAINAGE'],
];

const STATUS_MAP: Record<string, PermitRecordStatus> = {
  issued: 'ISSUED',
  active: 'ISSUED',
  open: 'ISSUED',
  applied: 'APPLIED',
  application: 'APPLIED',
  pending: 'APPLIED',
  final: 'FINALED',
  finaled: 'FINALED',
  completed: 'FINALED',
  closed: 'FINALED',
  expired: 'EXPIRED',
  void: 'VOIDED',
  voided: 'VOIDED',
  cancelled: 'VOIDED',
  canceled: 'VOIDED',
  failed: 'INSPECTION_FAILED',
};

function inferCategory(raw?: string): PermitRecordCategory {
  if (!raw) return 'BUILDING';
  const lower = raw.toLowerCase();
  for (const [keywords, category] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return 'OTHER';
}

function inferWorkTypes(description?: string, categoryRaw?: string): PermitWorkType[] {
  const text = `${description ?? ''} ${categoryRaw ?? ''}`.toLowerCase();
  const found: PermitWorkType[] = [];
  for (const [keywords, wt] of WORK_TYPE_KEYWORDS) {
    if (keywords.some((k) => text.includes(k))) found.push(wt);
  }
  return found.length > 0 ? found : ['OTHER'];
}

function inferStatus(raw?: string): PermitRecordStatus {
  if (!raw) return 'UNKNOWN';
  const key = raw.toLowerCase().trim();
  for (const [k, v] of Object.entries(STATUS_MAP)) {
    if (key.includes(k)) return v;
  }
  return 'UNKNOWN';
}

function parseDate(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : d;
}

function parseCostCents(raw?: string): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const val = parseFloat(cleaned);
  if (isNaN(val)) return undefined;
  return Math.round(val * 100);
}

export class PermitNormalizer {
  normalize(
    raw: RawPermitRecord,
    dataSource: PermitDataSource,
    propertyId: string,
  ): NormalizedPermitRecord {
    const category = inferCategory(raw.categoryRaw);
    const workTypes = inferWorkTypes(raw.description, raw.categoryRaw);
    const dedupeKey = `${propertyId}:${dataSource.id}:${raw.externalId}`;

    return {
      propertyId,
      permitNumber: raw.permitNumber,
      category,
      workTypes,
      description: raw.description,
      status: inferStatus(raw.statusRaw),
      applicantName: raw.applicantName,
      contractorName: raw.contractorName,
      contractorLicense: raw.contractorLicense,
      applicationDate: parseDate(raw.applicationDate),
      issueDate: parseDate(raw.issueDate),
      expirationDate: parseDate(raw.expirationDate),
      finaledDate: parseDate(raw.finaledDate),
      estimatedCostCents: parseCostCents(raw.estimatedCostRaw),
      source: 'OPEN_DATA_API',
      dataSourceId: dataSource.id,
      externalId: raw.externalId,
      dedupeKey,
      rawDataJson: raw.rawData,
    };
  }
}

export const permitNormalizer = new PermitNormalizer();
