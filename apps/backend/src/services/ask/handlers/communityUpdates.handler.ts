// Community in Ask (register "Community"; FRD v1.479): what is happening near the home, the city's alerts, and trash and recycling, read from the same
// providers Desktop's Community page reads. Read-only, deterministic, no model: Desktop's AI-extracted trash schedule is deliberately not mirrored, so where a
// city publishes no feed the answer names the city's official source and says so. Each section says WHY it has nothing (no event found, no feed for this city,
// the source did not answer), because an unreachable source is never the same as "nothing is happening". Source links are not shown: Ask keeps its links in
// the conversation, so each item names its source instead. Public feeds, as published; never a substitute for the city's own emergency notifications.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { prisma } from '../../../lib/prisma';
import { CommunityService } from '../../../community/community.service';
import { getCategoryDisplayName } from '../../../community/utils/categorizeEvent';
import { readCityAlerts, readCityTrash, readCommunityEvents, type CommunityEventsSource, type CommunityNotice, type CommunitySection } from '../../../community/communityAskReader';
import type { CommunityEvent } from '../../../community/types/community.types';
import { collectionDescriptor } from '../support/collectionDescriptor';
import { COMMUNITY_ACTION_IDS, COMMUNITY_MESSAGES, COMMUNITY_VIEW_LABELS, communityDateWindow, communityViewFor, type CommunityView } from '../support/communityUpdates';
import { getAskPropertyTimezone } from '../askExecutionContext';

const OVERVIEW_LIMIT = 5;
const VIEW_LIMIT = 20;

const BOUNDARY: AskPresentationBlock = {
  type: 'BOUNDARY', id: 'community-boundary', title: 'Public feeds, as published',
  body: 'Events, alerts and trash information come from public sources for your city and can be late or incomplete. They are not a substitute for your city\'s own emergency notifications or its official pickup calendar.',
  severity: 'INFO', suggestions: [],
};

const clip = (value: string | null | undefined, max: number) => (value && value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value ?? null);
const when = (iso: string | null | undefined) => (iso ? humanDate(new Date(iso)) : null);
const asOf = (iso: string) => humanDate(new Date(iso));

type SectionKey = 'EVENTS' | 'ALERTS' | 'TRASH';
const SECTION_TITLES: Record<SectionKey, string> = { EVENTS: 'Community events', ALERTS: 'City alerts', TRASH: 'Trash and recycling' };

/** What a section with no items says, by why it has none. */
function sectionNote(key: SectionKey, section: CommunitySection<unknown>, city: string, windowLabel?: string | null): { title: string; body: string; severity: 'INFO' | 'CAUTION' } | null {
  const sources = section.sourceNames.length ? ` Source: ${section.sourceNames.join(', ')}.` : '';
  switch (section.status) {
    case 'NONE': return { title: key === 'EVENTS' ? `No upcoming events found near ${city}${windowLabel ? ` ${windowLabel}` : ''}` : key === 'ALERTS' ? `No current city alerts for ${city}` : `Nothing recent in the ${city} recycling feed`, body: `Checked ${asOf(section.fetchedAt)}.${sources}`, severity: 'INFO' };
    case 'UNSUPPORTED': return { title: `Cozy has no ${key === 'ALERTS' ? 'alerts' : 'trash and recycling'} feed for ${city} yet`, body: 'Alerts and trash information are available for Jersey City and Princeton, NJ and for New York City so far. This is not a statement that nothing is happening.', severity: 'INFO' };
    case 'NO_FEED': return { title: `${city} publishes no public trash and recycling feed`, body: `Cozy does not guess a pickup schedule.${section.sourceNames.length ? ` The city's official information is at ${section.sourceNames.join(', ')}.` : ''}`, severity: 'INFO' };
    case 'UNAVAILABLE': return { title: `The ${SECTION_TITLES[key].toLowerCase()} source did not answer`, body: `This is not the same as nothing happening. Try again in a few minutes.${sources}`, severity: 'CAUTION' };
    default: return null;
  }
}

const eventItem = (event: CommunityEvent) => ({
  id: `event:${event.externalId}`, title: event.title, description: null as string | null, entityType: null, href: null, status: null as string | null,
  meta: [when(event.startTime), event.venueName ?? null, event.category ? getCategoryDisplayName(event.category) : null].filter((value): value is string => Boolean(value)),
});
const noticeItem = (notice: CommunityNotice, index: number, kind: string) => ({
  id: `${kind}:${index}:${notice.title.slice(0, 40)}`, title: notice.title, description: clip(notice.description, 240), entityType: null, href: null, status: null as string | null,
  meta: [notice.sourceName, when(notice.publishedAt)].filter((value): value is string => Boolean(value)),
});

function listBlock(key: SectionKey, items: ReturnType<typeof eventItem>[], total: number, shownAll: boolean, windowLabel: string | null = null): AskPresentationBlock {
  const title = windowLabel ? `${SECTION_TITLES[key]}, ${windowLabel}` : SECTION_TITLES[key];
  const sections = [{ id: `community-${key.toLowerCase()}`, title, count: items.length, items }];
  return {
    type: 'GROUPED_LIST', filters: [], id: `community-${key.toLowerCase()}-list`, title, sections,
    collection: collectionDescriptor({ sourceTotal: shownAll ? total : null, fetchedCount: items.length, sections, nextPageAvailable: false }), actions: [],
  };
}

export interface CommunityFeeds { events: CommunitySection<CommunityEvent>; alerts: CommunitySection<CommunityNotice>; trash: CommunitySection<CommunityNotice> }

/** Pure: the answer from the sections read, exported for tests. A section that was not asked for is null. */
export function communityFromSections(view: CommunityView, city: string, state: string, feeds: { [K in keyof CommunityFeeds]: CommunityFeeds[K] | null }, windowLabel: string | null = null): AskOperationResult {
  const limit = view === 'ALL' ? OVERVIEW_LIMIT : VIEW_LIMIT;
  const blocks: AskPresentationBlock[] = [];
  const parts: string[] = [];
  const sections: Array<[SectionKey, CommunitySection<unknown> | null, () => ReturnType<typeof eventItem>[]]> = [
    ['EVENTS', feeds.events, () => (feeds.events?.items ?? []).slice(0, limit).map(eventItem)],
    ['ALERTS', feeds.alerts, () => (feeds.alerts?.items ?? []).slice(0, limit).map((item, index) => noticeItem(item, index, 'alert'))],
    ['TRASH', feeds.trash, () => (feeds.trash?.items ?? []).slice(0, limit).map((item, index) => noticeItem(item, index, 'trash'))],
  ];
  const notes: AskPresentationBlock[] = [];
  const lists: AskPresentationBlock[] = [];
  let unavailable = 0;
  for (const [key, section, build] of sections) {
    if (!section) continue;
    const items = build();
    if (section.status === 'UNAVAILABLE') unavailable += 1;
    if (items.length) {
      lists.push(listBlock(key, items, section.items.length, section.items.length <= items.length, key === 'EVENTS' ? windowLabel : null));
      parts.push(`${section.items.length} ${key === 'EVENTS' ? (section.items.length === 1 ? 'event' : 'events') : key === 'ALERTS' ? (section.items.length === 1 ? 'alert' : 'alerts') : (section.items.length === 1 ? 'recycling update' : 'recycling updates')}`);
      if (section.partial) notes.push({ type: 'LIMITATION', id: `community-${key.toLowerCase()}-partial`, title: `Some ${SECTION_TITLES[key].toLowerCase()} sources did not answer`, body: 'What is listed came from the sources that did. Try again to check the rest.', severity: 'CAUTION' });
    } else {
      const note = sectionNote(key, section, city, key === 'EVENTS' ? windowLabel : null);
      if (note) notes.push({ type: 'LIMITATION', id: `community-${key.toLowerCase()}-note`, title: note.title, body: note.body, severity: note.severity });
    }
  }
  const otherViews = (['ALL', 'EVENTS', 'ALERTS', 'TRASH'] as CommunityView[]).filter((candidate) => candidate !== view).slice(0, 3);
  const summary: AskPresentationBlock = {
    type: 'SUMMARY', id: 'community-summary',
    title: view === 'ALL' ? `Near ${city}, ${state}` : `${COMMUNITY_VIEW_LABELS[view]} near ${city}, ${state}${view === 'EVENTS' && windowLabel ? `, ${windowLabel}` : ''}`,
    body: parts.length ? `${parts.join(', ')} found for ${city}.` : unavailable ? `Some sources did not answer for ${city}. Nothing here means nothing is happening.` : `Nothing to show for ${city} right now.`,
    tone: unavailable ? 'CAUTION' : 'DEFAULT',
    actions: otherViews.map((candidate) => ({ id: COMMUNITY_ACTION_IDS[candidate], label: COMMUNITY_VIEW_LABELS[candidate], interactionType: 'START_WORKFLOW' as const, message: COMMUNITY_MESSAGES[candidate], operationId: 'COMMUNITY_UPDATES' as const, style: 'SECONDARY' as const })),
  };
  blocks.push(summary, ...lists, ...notes, BOUNDARY);
  const reasonCode = unavailable && !lists.length ? 'COMMUNITY_SOURCES_UNAVAILABLE' : lists.length ? 'COMMUNITY_READY' : 'COMMUNITY_NOTHING_FOUND';
  return { status: unavailable && !lists.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', reasonCode, blocks, suggestions: [] };
}

export async function communityResult(propertyId: string, message: string, events: CommunityEventsSource = new CommunityService(prisma as never)): Promise<AskOperationResult> {
  const property = await prisma.property.findFirst({ where: { id: propertyId }, select: { city: true, state: true } });
  const city = property?.city?.trim(); const state = property?.state?.trim();
  if (!city || !state) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'COMMUNITY_LOCATION_REQUIRED',
      blocks: [{ type: 'SUMMARY', id: 'community-location', title: 'Add the home\'s city first', body: 'Community events, alerts and trash information come from the city, and this home has no city and state recorded. Nothing was looked up.', tone: 'CAUTION', actions: [] }, BOUNDARY],
      suggestions: [],
    };
  }
  const view = communityViewFor(message);
  const limit = view === 'ALL' ? OVERVIEW_LIMIT : VIEW_LIMIT;
  // A span of days ("this weekend") narrows the events only, in the home's own time zone; alerts and trash have no dates to narrow.
  const window = view === 'ALL' || view === 'EVENTS' ? communityDateWindow(message, new Date(), getAskPropertyTimezone()) : null;
  const [eventsSection, alertsSection, trashSection] = await Promise.all([
    view === 'ALL' || view === 'EVENTS' ? readCommunityEvents(events, city, state, limit, window) : null,
    view === 'ALL' || view === 'ALERTS' ? readCityAlerts(city, state, limit) : null,
    view === 'ALL' || view === 'TRASH' ? readCityTrash(city, state, limit) : null,
  ]);
  return communityFromSections(view, city, state, { events: eventsSection, alerts: alertsSection, trash: trashSection }, window?.label ?? null);
}

registerCapabilityHandler('community.updates', async (envelope, deps) => {
  if (!deps.propertyAccess) await ensurePropertyAccess(envelope.userId, envelope.propertyId!);
  return communityResult(envelope.propertyId!, envelope.message);
});
