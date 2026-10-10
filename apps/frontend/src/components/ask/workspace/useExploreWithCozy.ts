'use client';

// Explore with Cozy wiring for AskWorkspace (capability discovery plan, Phases 2-4): the focus state, the single-request starter launch, and
// every discovery event. Events carry bounded ids only -- never a message, a label or a search phrase -- and are separate from Suggested
// Next Action impressions and selections. Visibility is reported only after the element is on screen (see useVisibleOnce), once per home.
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { track } from '@/lib/analytics/events';
import { bucketResultCount, createOnceGate } from '@/features/ask/exploreTelemetry';
import type { AskCapabilityPrompt, AskDiscoveryStarter, AskDiscoveryTopicId, ConciergeHomeView } from '@/features/ask/types';
import { indicatorText, useExploreFocus, type ExploreState } from './ExploreWithCozy';

type OpenSurface = 'RAIL' | 'DISCLOSURE' | 'COLLAPSED_RAIL' | 'FOCUSED_VIEW';

export function useExploreWithCozy({ view, loading, failed, propertyId, sessionId, busy, scrollRef, ask }: {
  view: ConciergeHomeView | null;
  loading: boolean;
  failed: boolean;
  propertyId?: string;
  sessionId: string;
  /** A request is in flight, or no session exists yet. */
  busy: boolean;
  scrollRef: RefObject<HTMLElement | null>;
  ask: (message: string, attribution: undefined, context: AskCapabilityPrompt['context']) => Promise<{ status: string; executionId?: string } | undefined | void>;
}) {
  const topics = view?.discoveryTopics ?? [];
  const state: ExploreState = { topics, loading, failed };
  const focus = useExploreFocus(scrollRef, propertyId ?? '');
  const once = useRef(createOnceGate()).current;
  const chosen = useRef(false);
  const focusNow = useRef<AskDiscoveryTopicId | null>(null);
  focusNow.current = focus.focus;
  const home = propertyId ?? null;

  const openFrom = useCallback((surface: OpenSurface) => (topicId: AskDiscoveryTopicId, from?: HTMLElement | null) => {
    if (focusNow.current === null) chosen.current = false;
    focus.open(topicId, from);
    track('ask_discovery_topic_opened', { propertyId: home, topicId, surface });
  }, [focus, home]);

  const close = () => {
    if (focusNow.current && !chosen.current) track('ask_discovery_abandoned', { propertyId: home, topicId: focusNow.current, reason: 'DISMISSED' });
    focus.close();
  };

  // A different home has different topics: an open topic left behind without a starter is an abandonment, reported against the home it was on.
  const previousHome = useRef(home);
  useEffect(() => {
    if (previousHome.current === home) return;
    if (focusNow.current && !chosen.current) track('ask_discovery_abandoned', { propertyId: previousHome.current, topicId: focusNow.current, reason: 'PROPERTY_CHANGED' });
    previousHome.current = home;
  }, [home]);

  const start = async (starter: AskDiscoveryStarter) => {
    const topicId = focusNow.current;
    // Refuse a stale overview: the starter belongs to the home it was loaded for, which must still be the selected one.
    if (!topicId || !sessionId || busy || starter.availability !== 'AVAILABLE' || view?.propertyId !== propertyId) return;
    const ids = { propertyId: home, topicId, starterId: starter.id, entryId: starter.entryId, capabilityId: starter.capabilityId, operationId: starter.operationId };
    chosen.current = true;
    track('ask_discovery_starter_selected', ids);
    focus.close();
    track('ask_discovery_started', ids);
    const result = await ask(starter.message, undefined, {
      operationId: starter.operationId, propertyId: starter.entityContext?.propertyId ?? propertyId,
      discovery: { entryId: starter.entryId, surface: 'TOPIC', topicId },
    });
    const status = result ? result.status : 'REQUEST_FAILED';
    track('ask_discovery_completed', { ...ids, ...(result?.executionId ? { executionId: result.executionId } : {}), status, succeeded: Boolean(result) && !status.startsWith('FAILED') });
  };

  const topicsVisible = (surface: 'RAIL' | 'DISCLOSURE') => () => {
    for (const topic of topics) {
      if (once(`${home}:topic:${surface}:${topic.id}`)) track('ask_discovery_topic_visible', { propertyId: home, topicId: topic.id, surface, hasIndicator: indicatorText(topic.indicator) !== null });
    }
  };
  const startersVisible = (topicId: AskDiscoveryTopicId, starters: AskDiscoveryStarter[]) => {
    for (const starter of starters) {
      if (once(`${home}:starter:${topicId}:${starter.id}`)) track('ask_discovery_starter_visible', { propertyId: home, topicId, starterId: starter.id, entryId: starter.entryId, capabilityId: starter.capabilityId, operationId: starter.operationId });
    }
  };
  /** One event per explorer search interaction, however many keystrokes it took: a bucketed result count and whether a result was picked. */
  const explorerSearch = ({ resultCount, selected }: { resultCount: number; selected: boolean }) => {
    track('ask_explorer_search', { propertyId: home, resultBucket: bucketResultCount(resultCount), selected });
  };

  return { state, focus: focus.focus, openFrom, close, start, topicsVisible, startersVisible, explorerSearch };
}
