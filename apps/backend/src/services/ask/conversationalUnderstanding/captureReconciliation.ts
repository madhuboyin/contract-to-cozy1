import type { EventExtractionCandidate, ExtractionCandidate } from './extractionCandidateSchema';
import { eventAddEditorValues } from '../support/homeEventAddEditor';

// UX-04 / consolidated plan 3B: when a turn already carries a routed "add a timeline event" capture and message extraction read one event out
// of the same message, the two are one thing. The extracted values prefill the routed form, say that they were read from the message, and the
// message produces one path (the form, then its confirmation) instead of an empty form plus a second proposal for the same event.
//
// Pure: no I/O. The caller supplies the parent's stored capture requests, the property's timezone and the clock.

export const INFERRED_FROM_MESSAGE_NOTE = 'Read from your message. Check it before continuing.';
const EVENT_ADD_CAPTURE_KEY = 'CAPTURE_EVENT_ADD';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type CaptureRequestLike = Record<string, unknown> & { captureKey?: unknown; currentAnswer?: unknown; editor?: { fields?: Array<Record<string, unknown>> } & Record<string, unknown> };

export interface EventPrefill {
  /** Editor string values for the fields the message supplied (never an empty string). */
  values: Record<string, string>;
  /** Fields the message supplied and the form did not already hold. */
  inferredKeys: string[];
  /** Fields where the homeowner's own entry differs from what the message said; theirs is kept. */
  conflictKeys: string[];
  /** Fields the form already holds with exactly the message's value (a replay of an earlier reconciliation). */
  heldKeys: string[];
}

function localDate(iso: string, timezone: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** The editor value for the event's date at exactly the precision the message gave. Unknown, unparseable and future dates are left for the person. */
export function eventDateEditorValue(candidate: EventExtractionCandidate, timezone: string, now: Date): string | null {
  const start = candidate.datePrecision === 'RANGE' ? candidate.dateRangeStart : candidate.occurredAt;
  if (!start || candidate.datePrecision === 'UNKNOWN') return null;
  const day = localDate(start, timezone);
  if (!day) return null;
  if (new Date(`${day}T00:00:00Z`).getTime() > now.getTime() + ONE_DAY_MS) return null;
  if (candidate.datePrecision === 'YEAR') return `YEAR|${day.slice(0, 4)}`;
  if (candidate.datePrecision === 'MONTH') return `MONTH|${day.slice(0, 7)}`;
  if (candidate.datePrecision === 'RANGE') {
    const end = candidate.dateRangeEnd ? localDate(candidate.dateRangeEnd, timezone) : null;
    return end && end >= day ? `RANGE|${day}|${end}` : null;
  }
  return `EXACT_DATE|${day}`;
}

export function eventPrefillFromCandidate(candidate: EventExtractionCandidate, existing: Record<string, string>, timezone: string, now: Date): EventPrefill {
  const read: Record<string, string> = {};
  if (candidate.title) read.title = candidate.title;
  if (candidate.eventType) read.type = candidate.eventType;
  const date = eventDateEditorValue(candidate, timezone, now);
  if (date) read.occurredAt = date;
  if (candidate.summary) read.summary = candidate.summary;
  if (typeof candidate.amount === 'number') read.amount = candidate.amount.toFixed(2);
  if (candidate.providerName) read.providerName = candidate.providerName;

  const values: Record<string, string> = {};
  const inferredKeys: string[] = [];
  const conflictKeys: string[] = [];
  const heldKeys: string[] = [];
  for (const [key, value] of Object.entries(read)) {
    const held = (existing[key] ?? '').trim();
    if (!held) { values[key] = value; inferredKeys.push(key); } else if (held !== value) conflictKeys.push(key); else heldKeys.push(key);
  }
  return { values, inferredKeys, conflictKeys, heldKeys };
}

/** The parent's single routed event-add capture, or null when there is none (or more than one, which is ambiguous). */
export function routedEventAddCapture(captureRequests: unknown): CaptureRequestLike | null {
  if (!Array.isArray(captureRequests)) return null;
  const matches = captureRequests.filter((request): request is CaptureRequestLike => Boolean(request) && typeof request === 'object' && (request as CaptureRequestLike).captureKey === EVENT_ADD_CAPTURE_KEY);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * The one event candidate that is authoritatively the routed capture's event: the batch holds exactly one EVENT, it is not a correction of an
 * existing record, and no warranty or evidence candidate is linked to it (those need their own proposal). Anything else is left unreconciled.
 */
export function reconcilableEventCandidate(candidates: readonly ExtractionCandidate[]): { candidate: EventExtractionCandidate; remaining: ExtractionCandidate[] } | null {
  const events = candidates.filter((candidate): candidate is EventExtractionCandidate => candidate.category === 'EVENT');
  if (events.length !== 1) return null;
  const [event] = events;
  if (event.correctingEventId) return null;
  if (candidates.some((candidate) => candidate.category === 'WARRANTY' || candidate.category === 'EVIDENCE')) return null;
  return { candidate: event, remaining: candidates.filter((candidate) => candidate !== event) };
}

/** The routed capture request with the message's values filled in and each such field labelled; everything else is unchanged. */
export function applyEventPrefill(request: CaptureRequestLike, prefill: EventPrefill): CaptureRequestLike {
  const current = request.currentAnswer && typeof request.currentAnswer === 'object' && !Array.isArray(request.currentAnswer)
    ? request.currentAnswer as Record<string, unknown>
    : {};
  const merged = eventAddEditorValues({ ...current, ...prefill.values });
  // eventAddEditorValues re-encodes, but the date and amount arrive already encoded; keep those exact strings.
  for (const [key, value] of Object.entries(prefill.values)) merged[key] = value;
  const labelled = new Set(prefill.inferredKeys);
  const editor = request.editor
    ? {
      ...request.editor,
      fields: (request.editor.fields ?? []).map((field) => labelled.has(String(field.key))
        ? { ...field, helpText: [field.helpText, INFERRED_FROM_MESSAGE_NOTE].filter(Boolean).join(' ') }
        : field),
    }
    : request.editor;
  return { ...request, currentAnswer: merged, ...(editor ? { editor } : {}) };
}
