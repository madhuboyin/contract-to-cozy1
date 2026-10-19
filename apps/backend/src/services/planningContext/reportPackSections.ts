/**
 * The home-report pack's selectable sections. This module is deliberately free of Ask imports: the snapshot builder, the PDF template,
 * the redaction, and the report-export worker all read it. The Record section registry derives its export evaluation from it, and
 * `normalizeAskRecordExportRequest` validates a request against the registry before a selection is ever stored.
 */
export type ReportPackPath =
  | 'property' | 'inventory.rooms' | 'inventory.items' | 'maintenance.tasks' | 'coverage.insurancePolicies' | 'coverage.warranties';

/** Record section id -> where it sits in the pack. These are the only sections a pack can carry. */
export const REPORT_PACK_SECTION_PATHS = {
  'property-facts': 'property',
  rooms: 'inventory.rooms',
  inventory: 'inventory.items',
  warranties: 'coverage.warranties',
  'maintenance-history': 'maintenance.tasks',
  coverage: 'coverage.insurancePolicies',
} as const satisfies Record<string, ReportPackPath>;

export type ReportPackSectionId = keyof typeof REPORT_PACK_SECTION_PATHS;
export const REPORT_PACK_SECTION_IDS = Object.keys(REPORT_PACK_SECTION_PATHS) as ReportPackSectionId[];
export const isReportPackSectionId = (value: unknown): value is ReportPackSectionId => typeof value === 'string' && value in REPORT_PACK_SECTION_PATHS;

/**
 * The home's identity is on every pack's cover and in its header, so it is not a selectable section: the street address and ZIP code
 * are in the owner's copy and never in a shared link, which carries city and state.
 */
export const REPORT_PACK_ALWAYS_INCLUDED_IDENTITY = {
  ownerFields: ['addressLine1', 'city', 'state', 'zipCode'],
  sharedFields: ['city', 'state'],
  withheldFromShared: ['addressLine1', 'zipCode'],
} as const;

/** The export `type` has always named a narrower pack; with no explicit selection it chooses these sections. */
export const REPORT_PACK_TYPE_PRESETS: Record<string, readonly ReportPackSectionId[]> = {
  HOME_REPORT_PACK: REPORT_PACK_SECTION_IDS,
  HOME_SUMMARY: ['property-facts'],
  INVENTORY: ['rooms', 'inventory'],
  MAINTENANCE_HISTORY: ['maintenance-history'],
  COVERAGE_SNAPSHOT: ['coverage', 'warranties'],
};

export interface ReportPackSelection {
  version: 1;
  /** What the caller asked for, as given. */
  requested: string[];
  /** The sections the pack carries. */
  included: ReportPackSectionId[];
  /** Requested sections the pack cannot carry, with why. */
  unavailable: Array<{ id: string; reason: 'NOT_IN_PACK' | 'RESTRICTED' }>;
}

export function defaultPackSectionsForType(type: string | null | undefined): ReportPackSectionId[] {
  return [...(REPORT_PACK_TYPE_PRESETS[String(type ?? 'HOME_REPORT_PACK')] ?? REPORT_PACK_SECTION_IDS)];
}

/**
 * The sections a stored export carries. A normalized selection is honored exactly. An export stored before selections existed (no
 * `sections`, or any other shape) carries what its type has always named, so regenerating an old export is unchanged.
 */
export function resolveStoredPackSections(stored: unknown, type?: string | null): ReportPackSectionId[] {
  const candidate = stored as Partial<ReportPackSelection> | null | undefined;
  if (candidate && typeof candidate === 'object' && candidate.version === 1 && Array.isArray(candidate.included)) {
    return REPORT_PACK_SECTION_IDS.filter((id) => (candidate.included as unknown[]).includes(id));
  }
  return defaultPackSectionsForType(type);
}
