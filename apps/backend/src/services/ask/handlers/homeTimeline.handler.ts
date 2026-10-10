// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { HomeEventsService } from '../../homeEvents.service';
import { humanDate, readableCode } from '../askFormatting';
import { getAskPropertyTimezone } from '../askExecutionContext';

// Home Timeline capability-card slice (FRD v1.61): the thirteenth new operation for a capability with none. Reads
// HomeEventsService.listHomeEvents with the page's default limit (80), the call GET /properties/:id/home-events makes
// for the Timeline page (signals stay out of the default view, as on the page). One difference, on purpose: the page
// shows every current event, including another member's PRIVATE ones; Ask applies the privacy rule its other home-event
// reads use (a PRIVATE event only for the person who recorded it). Dates keep the recorded precision (month, year,
// range, unknown) rather than inventing a day. Read-only: logging, correcting, confirming, evidence and visibility stay
// on the page or their own operations.
export const HOME_TIMELINE_ASK_LIMIT = 80;
type TimelineEventView = Awaited<ReturnType<HomeEventsService['listHomeEvents']>>['events'][number];
const TIMELINE_LABEL = (value: string | null | undefined) => (value ? readableCode(value).replace(/\b\w/g, (c) => c.toUpperCase()) : '');

function timelineEventDate(event: TimelineEventView): string {
  const occurred = new Date(event.occurredAt);
  if (Number.isNaN(occurred.getTime())) return 'Date unknown';
  const monthYear = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: getAskPropertyTimezone() });
  const year = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: getAskPropertyTimezone() });
  switch (event.datePrecision) {
    case 'MONTH': return monthYear.format(occurred);
    case 'YEAR': return year.format(occurred);
    case 'RANGE': return event.dateRangeStart && event.dateRangeEnd
      ? `${humanDate(new Date(event.dateRangeStart))} – ${humanDate(new Date(event.dateRangeEnd))}`
      : `Around ${humanDate(occurred)}`;
    case 'UNKNOWN': return 'Date unknown';
    default: return humanDate(occurred) ?? 'Date unknown';
  }
}

const EVIDENCE_LIMIT = 12;
function moneyLabel(value: unknown, currency: unknown): string | null {
  const amount = Number(String(value ?? ''));
  if (value == null || !Number.isFinite(amount)) return null;
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: typeof currency === 'string' && currency ? currency : 'USD', maximumFractionDigits: 0 }).format(amount); } catch { return null; }
}
/**
 * The record's own facts and the evidence behind it, for the in-Ask detail (the homeowner never has to leave Ask to see how an event is known).
 * Built only from the event this answer already read, after the privacy rule, and only from labelled fields: no file names, URLs or free-form
 * notes by other people beyond the evidence note the household recorded.
 */
function eventDetail(event: TimelineEventView) {
  const facts: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: string | null | undefined) => { if (value && value.trim()) facts.push({ label, value: value.trim().slice(0, 200) }); };
  add('Type', [TIMELINE_LABEL(event.type), event.subtype && event.subtype !== event.type ? TIMELINE_LABEL(event.subtype) : ''].filter(Boolean).join(' · '));
  add('Date', timelineEventDate(event));
  add('Verification', TIMELINE_LABEL(event.verificationStatus));
  add('Provider', event.providerName);
  add('Amount', moneyLabel(event.amount, event.currency));
  add('Value change', moneyLabel(event.valueDelta, event.currency));
  add('Importance', event.importance === 'HIGHLIGHT' ? 'Highlight' : null);
  add('Visible to', event.visibility === 'PRIVATE' ? 'Only the person who recorded it' : null);
  add('Recorded', event.createdAt ? humanDate(new Date(event.createdAt)) : null);
  const evidence = [
    ...((event.evidence ?? []) as Array<{ evidenceType?: string; note?: string | null; observedAt?: Date | string | null }>).map((row) => ({
      label: TIMELINE_LABEL(row.evidenceType) || 'Evidence',
      meta: [row.observedAt ? humanDate(new Date(row.observedAt)) : null, row.note?.trim() || null].filter(Boolean).join(' · ') || null,
    })),
    ...((event.documents ?? []) as Array<{ kind?: string; caption?: string | null }>).map((row) => ({
      label: `Document · ${TIMELINE_LABEL(row.kind) || 'Other'}`, meta: row.caption?.trim() || null,
    })),
  ].slice(0, EVIDENCE_LIMIT).map((row) => ({ label: row.label.slice(0, 120), meta: row.meta ? row.meta.slice(0, 160) : null }));
  return { facts, evidence };
}

// FRD v1.77 (homeowner decision): five colour categories for the timeline track instead of the twelve event types.
const HOME_TIMELINE_CATEGORIES: Record<string, { id: string; label: string }> = {
  REPAIR: { id: 'work', label: 'Work done' }, MAINTENANCE: { id: 'work', label: 'Work done' },
  IMPROVEMENT: { id: 'work', label: 'Work done' }, VERIFIED_RESOLUTION: { id: 'work', label: 'Work done' },
  INSPECTION: { id: 'inspections', label: 'Inspections' },
  CLAIM: { id: 'claims', label: 'Claims' },
  PURCHASE: { id: 'purchases', label: 'Purchases and value' }, VALUE_UPDATE: { id: 'purchases', label: 'Purchases and value' },
};
export function homeTimelineCategory(type: string | null | undefined): { id: string; label: string } {
  return HOME_TIMELINE_CATEGORIES[type ?? ''] ?? { id: 'records', label: 'Records and notes' };
}

type HomeTimelinePlacement = { date: string; precision: 'DAY' | 'MONTH' | 'YEAR' };
/**
 * Where an event sits on the track, in the property's time zone, at no more precision than was recorded: YYYY-MM-DD,
 * YYYY-MM or YYYY. A range sits at its start (its own start date, or the recorded date when the start is missing).
 * An unknown or unreadable date returns null, and the event is listed under the track instead. Exported for tests.
 */
export function homeTimelinePlacement(event: { occurredAt: Date | string; datePrecision: string | null; dateRangeStart?: Date | string | null }): HomeTimelinePlacement | null {
  if (event.datePrecision === 'UNKNOWN') return null;
  const source = event.datePrecision === 'RANGE' && event.dateRangeStart ? new Date(event.dateRangeStart) : new Date(event.occurredAt);
  if (Number.isNaN(source.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: getAskPropertyTimezone() })
    .formatToParts(source).map((part) => [part.type, part.value]));
  if (event.datePrecision === 'YEAR') return { date: parts.year, precision: 'YEAR' };
  if (event.datePrecision === 'MONTH') return { date: `${parts.year}-${parts.month}`, precision: 'MONTH' };
  return { date: `${parts.year}-${parts.month}-${parts.day}`, precision: 'DAY' };
}

export function homeTimelineFromView(allEvents: readonly TimelineEventView[], propertyId: string, userId: string): AskOperationResult {
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'home-timeline-boundary', title: 'History as recorded',
    body: 'Events are shown as they were recorded, with how well each is verified and how precise its date is. Unverified and inferred events have not been confirmed. Private events recorded by other household members are not shown.',
    severity: 'INFO', suggestions: [],
  };
  const events = allEvents.filter((event) => event.visibility !== 'PRIVATE' || event.createdById === userId);
  if (!events.length) {
    return {
      status: 'ANSWERED', reasonCode: 'HOME_TIMELINE_EMPTY',
      blocks: [{
        type: 'SUMMARY', id: 'home-timeline-summary', title: 'No events on the timeline yet',
        body: 'The Home Timeline keeps a history of what happened to this home: repairs, improvements, purchases, inspections and claims. Events you record will appear here.',
        tone: 'DEFAULT', actions: [],
      }, boundary],
      suggestions: [],
    };
  }
  const verified = events.filter((event) => event.verificationStatus === 'EVIDENCE_VERIFIED' || event.verificationStatus === 'HOMEOWNER_CONFIRMED').length;
  const disputed = events.filter((event) => event.verificationStatus === 'DISPUTED').length;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'home-timeline-summary',
    title: `${events.length} event${events.length === 1 ? '' : 's'} on the home timeline`,
    body: [
      `${verified} confirmed or verified by evidence.`,
      disputed ? `${disputed} ${disputed === 1 ? 'is' : 'are'} disputed.` : null,
      `Most recent event: ${timelineEventDate(events[0])}.`,
    ].filter(Boolean).join(' '),
    tone: disputed ? 'CAUTION' : 'DEFAULT',
    actions: [],
  }];
  if (allEvents.length >= HOME_TIMELINE_ASK_LIMIT) {
    blocks.push({
      type: 'LIMITATION', id: 'home-timeline-limit', title: `Showing the ${HOME_TIMELINE_ASK_LIMIT} most recent events`,
      body: 'Ask about a specific year or kind of event to see older history.', severity: 'INFO',
    });
  }
  // IW-PRES-017 (FRD v1.77): dated events go on a timeline track; events whose date is unknown are listed under it.
  const dated = events.map((event) => ({ event, placement: homeTimelinePlacement(event) }));
  const onTrack = dated.filter((entry): entry is { event: TimelineEventView; placement: HomeTimelinePlacement } => entry.placement !== null);
  const undated = dated.filter((entry) => entry.placement === null).map((entry) => entry.event);
  const eventMeta = (event: TimelineEventView) => [
    TIMELINE_LABEL(event.type),
    ...(event.subtype && event.subtype !== event.type ? [TIMELINE_LABEL(event.subtype)] : []),
    ...(event.importance === 'HIGHLIGHT' ? ['Highlight'] : []),
    ...(event.visibility === 'PRIVATE' ? ['Private'] : []),
  ];
  if (onTrack.length) {
    blocks.push({
      type: 'TIMELINE', id: 'home-timeline-events', title: 'Home timeline',
      description: 'Each event sits at its recorded date; a month or a year is shown as recorded, and a range at its start. Open an event on the timeline for its details and evidence.',
      items: onTrack.map(({ event, placement }) => {
        const category = homeTimelineCategory(event.type);
        return {
          id: event.id,
          label: event.title,
          date: placement.date,
          datePrecision: placement.precision,
          description: event.summary ?? null,
          status: TIMELINE_LABEL(event.verificationStatus),
          detail: eventDetail(event),
          category,
          entityType: 'HOME_EVENT',
          meta: [...(event.datePrecision === 'RANGE' ? [timelineEventDate(event)] : []), ...eventMeta(event)].slice(0, 6),
        };
      }),
    });
  }
  if (undated.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'home-timeline-undated', title: 'Date unknown', description: 'These events have no recorded date, so they are not placed on the timeline.',
      sections: [{
        id: 'home-timeline-date-unknown', title: 'Date unknown', count: undated.length,
        items: undated.map((event) => ({
          id: event.id, title: event.title, description: event.summary ?? null,
          meta: ['Date unknown', ...eventMeta(event)],
          status: TIMELINE_LABEL(event.verificationStatus),
        })),
      }],
      actions: [],
    });
  }
  blocks.push(boundary);
  return { status: 'ANSWERED', reasonCode: 'HOME_TIMELINE_READY', blocks, suggestions: [] };
}

async function homeTimelineResult(propertyId: string, userId: string): Promise<AskOperationResult> {
  const { events } = await new HomeEventsService().listHomeEvents(propertyId, { limit: HOME_TIMELINE_ASK_LIMIT });
  return homeTimelineFromView(events, propertyId, userId);
}

registerCapabilityHandler('home-timeline.events', async (envelope) => homeTimelineResult(envelope.propertyId!, envelope.userId));
