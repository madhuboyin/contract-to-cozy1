// Exporting the home record as a conversation (Sole Homeowner Interface FRD v1.2 §1.2). Pure: the typed grammar ("export my warranties and
// appliances"), the section vocabulary, and the declared action ids. The export itself is the route's own create rules
// (homeReportExportCreate.service), behind a review that names exactly what is and is not included.
import type { AskRecordSectionId } from '../governance/askRecordSectionRegistry';

export const HOME_RECORD_EXPORT_ENTITY_TYPE = 'HOME_REPORT_EXPORT';
export const HOME_RECORD_EXPORT_ACTION_IDS = { STATUS: 'home-record-export-status', START: 'home-record-export-start' } as const;
export const HOME_RECORD_EXPORT_STATUS_MESSAGE = 'Is my home record export ready?';
export const HOME_RECORD_EXPORT_START_MESSAGE = 'Export my home record';

// An explicit export request. "Show my home report", "the environment report" and "download the inspection report" are other operations'
// questions, so the word "export" or an explicit PDF/copy of the home record is required, never a bare noun or a bare "download".
const EXPORT_OBJECT = /\b(?:my|our|the|all|everything|home|house|property|record|records|warrant(?:y|ies)|appliances?|inventory|rooms?|insurance|coverage|maintenance|systems?|details|facts)\b/i;
const HOME_RECORD_COPY = /\b(?:pdf|copy|package|printout|printable)\b.{0,30}\b(?:of|for)\b.{0,24}\b(?:my|our|the)\b.{0,16}\b(?:home|house|property)\s+records?\b|\b(?:save|download|print|get)\b.{0,30}\b(?:my|our|the)\s+(?:home|house|property)\s+records?\b.{0,24}\b(?:pdf|file|copy)\b|\bdownload\b.{0,12}\b(?:my|our|the)\s+(?:home|house|property)\s+records?\b/i;
/** True when the message asks to export something about the home. */
export const isHomeRecordExportRequest = (message: string): boolean =>
  !isHomeRecordExportStatusRequest(message) && !isHomeRecordExportShareRequest(message) && ((/\bexport\b/i.test(message) && EXPORT_OBJECT.test(message)) || HOME_RECORD_COPY.test(message));

/** "Is my export ready?", "export status", "how is my home record export going?". */
export const isHomeRecordExportStatusRequest = (message: string): boolean =>
  /\b(?:is|are|check|how(?:'s| is)|what(?:'s| is)|any (?:news|update)(?: on)?)\b.{0,40}\b(?:export|home record (?:pdf|download)|report pack)\b.{0,30}\b(?:ready|done|finished|status|progress|going|yet)\b|\bexport status\b|\b(?:status|progress) of my (?:home record )?(?:export|download)\b/i.test(message);

/** What the pack can carry, in the words a homeowner uses. Sections it cannot carry are still recognized so the review can say why they are left out. */
const SECTION_WORDS: ReadonlyArray<{ id: AskRecordSectionId; test: RegExp }> = [
  { id: 'warranties', test: /\bwarrant(?:y|ies)\b/i },
  { id: 'inventory', test: /\b(?:appliances?|systems?|inventory|equipment|belongings)\b/i },
  { id: 'rooms', test: /\brooms?\b/i },
  { id: 'maintenance-history', test: /\bmaintenance\b/i },
  { id: 'coverage', test: /\b(?:insurance|coverage|polic(?:y|ies))\b/i },
  { id: 'property-facts', test: /\b(?:property (?:details|facts)|home (?:details|facts|profile)|about the home)\b/i },
  { id: 'documents', test: /\b(?:documents?|receipts?|paperwork|files)\b/i },
  { id: 'timeline', test: /\b(?:timeline|events?)\b|(?<!maintenance )\bhistory\b/i },
  { id: 'inspections', test: /\binspections?\b/i },
  { id: 'permits', test: /\bpermits?\b/i },
  { id: 'projects-renovations', test: /\b(?:projects?|renovations?)\b/i },
  { id: 'incidents-claims', test: /\b(?:claims?|incidents?)\b/i },
  { id: 'financing-ownership', test: /\b(?:financing|mortgage|loans?)\b/i },
  { id: 'buyer-records', test: /\bbuyer\b/i },
  { id: 'seller-records', test: /\b(?:seller|sale)\b/i },
  { id: 'household-access', test: /\b(?:household|members?|who has access)\b/i },
];
const WHOLE_RECORD = /\b(?:everything|all of (?:it|my)|the whole|whole|entire|complete|full|all (?:my )?(?:home )?records?)\b/i;

/**
 * The sections a message names. `null` means no choice was made (the whole pack: "export my home record", "everything"); a list is exactly
 * the named sections, in registry order. A message that names sections and also says "everything" means everything.
 */
export function parseExportSections(message: string): AskRecordSectionId[] | null {
  if (WHOLE_RECORD.test(message)) return null;
  const named = SECTION_WORDS.filter((entry) => entry.test.test(message)).map((entry) => entry.id);
  return named.length ? named : null;
}

// Sharing an export by link (FRD v1.6). A share request names the export (or the home record export) and a share verb; "share my briefing" or
// "share this property brief" are other operations' questions, so the word "export" or "home record" is required.
export const HOME_RECORD_EXPORT_SHARE_ENTITY_TYPE = HOME_RECORD_EXPORT_ENTITY_TYPE;
export const HOME_RECORD_EXPORT_SHARE_MESSAGES = { SHARE: 'Create a share link for this export', REVOKE: 'Stop sharing this export' } as const;
export type HomeRecordExportShareKind = keyof typeof HOME_RECORD_EXPORT_SHARE_MESSAGES;
export const HOME_RECORD_EXPORT_SHARE_ACTION_IDS = { SHARE: 'home-record-export-share', REVOKE: 'home-record-export-unshare' } as const;
export const HOME_RECORD_SHARE_DEFAULT_DAYS = 14;
export const HOME_RECORD_SHARE_MAX_DAYS = 30;

const SHARE_OBJECT = /\b(?:export|home record|home report|record pdf|pdf)\b/i;
const REVOKE_PATTERN = /\b(?:stop sharing|unshare|revoke|disable|turn off|cancel|remove|delete)\b.{0,30}\b(?:share|sharing|shared|link)\b|\bstop sharing\b/i;
const SHARE_VERB = /\b(?:share|send)\b|\b(?:create|make|get|generate)\b.{0,24}\b(?:share|shareable|sharing)\b.{0,12}\blink\b|\blink\b.{0,24}\b(?:to|for)\b.{0,16}\b(?:share|send)\b/i;
const NOT_OTHER_SHARE = /\b(?:briefing|property brief|brief)\b/i;
/** The kind of share request a message is, or null: "share my home record export", "stop sharing my export". */
export function homeRecordExportShareKind(message: string): HomeRecordExportShareKind | null {
  if (NOT_OTHER_SHARE.test(message) || !SHARE_OBJECT.test(message)) return null;
  if (REVOKE_PATTERN.test(message)) return 'REVOKE';
  return SHARE_VERB.test(message) ? 'SHARE' : null;
}
export const isHomeRecordExportShareRequest = (message: string): boolean => homeRecordExportShareKind(message) !== null;

/** "for 7 days", "for a week", "for two weeks", "for a month": the days asked for, within what a link may last; null when none were named. */
export function shareDaysFromWords(message: string): number | null {
  const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4 };
  const match = message.toLowerCase().match(/\bfor\s+(?:the next\s+)?(\d+|a|one|two|three|four)\s+(day|week|month)s?\b/);
  if (!match) return null;
  const count = /^\d+$/.test(match[1]) ? Number(match[1]) : words[match[1]];
  const days = count * (match[2] === 'week' ? 7 : match[2] === 'month' ? 30 : 1);
  return Math.max(1, Math.min(HOME_RECORD_SHARE_MAX_DAYS, days));
}

export const shareMessage = (kind: HomeRecordExportShareKind, label: string, days?: number): string =>
  `${HOME_RECORD_EXPORT_SHARE_MESSAGES[kind]}${days ? ` for ${days} days` : ''}: ${label}`.slice(0, 300);
export const shareKindFromMessage = (message: string): HomeRecordExportShareKind | null =>
  ((Object.entries(HOME_RECORD_EXPORT_SHARE_MESSAGES) as Array<[HomeRecordExportShareKind, string]>).find(([, prefix]) => message.startsWith(prefix))?.[0]) ?? homeRecordExportShareKind(message);
