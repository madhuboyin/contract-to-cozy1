'use client';

// Explore with Cozy (docs/product/ASK_COZY_LIGHTWEIGHT_CAPABILITY_DISCOVERY_IMPLEMENTATION_PLAN.md, Phase 2). A quiet, persistent group of
// topic entry points that stays inside the Ask shell. Selecting a topic is view state only: it sends nothing, creates no execution and
// navigates nowhere. A starter is the only thing that launches, through the ordinary Ask path. Topics, order, starters and their
// availability are rendered exactly as the server returned them; nothing here infers an operation from a label.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ArrowRight, ChevronDown, ChevronRight, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskDiscoveryStarter, AskDiscoveryTopic, AskDiscoveryTopicId } from '@/features/ask/types';

export interface ExploreState {
  topics: AskDiscoveryTopic[];
  loading: boolean;
  failed: boolean;
}

const REASON_COPY: Record<string, string> = {
  ASK_PERMISSION_REQUIRED: 'Needs more access to this home.',
};

/**
 * "3 need attention", "2 active", "72% complete". Shown only when the server vouches for it (CURRENT) and only when it says something: a
 * count of zero is left out so the rail stays quiet, while a percentage always shows. Absent never means zero.
 */
export function indicatorText(indicator: AskDiscoveryTopic['indicator']): string | null {
  if (!indicator || indicator.freshness !== 'CURRENT') return null;
  if (typeof indicator.value === 'number' && indicator.value === 0) return null;
  return `${indicator.value} ${indicator.label}`.trim();
}

function reasonCopy(starter: AskDiscoveryStarter): string {
  if (starter.availability === 'NEEDS_CONTEXT') return 'Needs a little more information first.';
  return starter.reasonCodes.map((code) => REASON_COPY[code]).find(Boolean) ?? 'Not available right now.';
}

/** Which topic's focused view is open (null = Ask home). Keeps the conversation mounted-but-hidden by the caller, and restores scroll and focus on return. */
export function useExploreFocus(scrollRef: RefObject<HTMLElement | null>, resetKey: string) {
  const [focus, setFocus] = useState<AskDiscoveryTopicId | null>(null);
  const savedScroll = useRef(0);
  const trigger = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  const open = (topicId: AskDiscoveryTopicId, from?: HTMLElement | null) => {
    if (!wasOpen.current) {
      savedScroll.current = scrollRef.current?.scrollTop ?? 0;
      trigger.current = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    }
    setFocus(topicId);
  };
  const close = () => setFocus(null);

  useLayoutEffect(() => {
    if (focus === null && wasOpen.current && scrollRef.current) scrollRef.current.scrollTop = savedScroll.current;
    wasOpen.current = focus !== null;
  }, [focus, scrollRef]);
  useEffect(() => {
    if (focus === null && trigger.current?.isConnected) trigger.current.focus();
    if (focus === null) trigger.current = null;
  }, [focus]);
  // A different home has different topics: never carry an open topic across a property switch.
  useEffect(() => { setFocus(null); }, [resetKey]);

  return { focus, open, close };
}

function TopicButtons({ topics, activeTopicId, onOpen, onAfterOpen, moreIdeas }: {
  topics: AskDiscoveryTopic[];
  activeTopicId: AskDiscoveryTopicId | null;
  onOpen: (topicId: AskDiscoveryTopicId, from: HTMLElement) => void;
  onAfterOpen?: () => void;
  moreIdeas?: ReactNode;
}) {
  return (
    <ul className="space-y-0.5">
      {[...topics].sort((a, b) => a.order - b.order).map((topic) => (
        <li key={topic.id}>
          <button type="button" aria-pressed={activeTopicId === topic.id} onClick={(event) => { onOpen(topic.id, event.currentTarget); onAfterOpen?.(); }}
            className={cn('flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-left text-sm text-slate-700 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600', activeTopicId === topic.id && 'bg-white font-semibold text-teal-900 shadow-sm')}>
            <span>{topic.label}{indicatorText(topic.indicator) && <span className="ml-2 text-xs font-normal text-slate-500" data-explore-indicator="">{indicatorText(topic.indicator)}</span>}</span><ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          </button>
        </li>
      ))}
      {moreIdeas && <li>{moreIdeas}</li>}
    </ul>
  );
}

function ExploreStatus({ state }: { state: ExploreState }) {
  if (state.loading && !state.topics.length) return <p className="px-3 py-2 text-xs text-slate-400" role="status">Loading ideas…</p>;
  if (!state.topics.length) return <p className="px-3 py-2 text-xs text-slate-500" role="status">{state.failed ? 'Ideas are unavailable right now. You can still ask anything.' : 'No ideas to suggest right now.'}</p>;
  return null;
}

/** Desktop rail group: near the top of the conversation rail, quieter than the composer and the current response. */
export function ExploreRailGroup({ state, activeTopicId, onOpen, moreIdeas }: {
  state: ExploreState;
  activeTopicId: AskDiscoveryTopicId | null;
  onOpen: (topicId: AskDiscoveryTopicId, from: HTMLElement) => void;
  moreIdeas?: ReactNode;
}) {
  return (
    <section className="mt-3 border-y border-stone-200 py-3" aria-labelledby="ask-explore-rail-title" data-ask-explore="rail">
      <h3 id="ask-explore-rail-title" className="px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Explore with Cozy</h3>
      <div className="mt-1">
        <ExploreStatus state={state} />
        {state.topics.length > 0 && <TopicButtons topics={state.topics} activeTopicId={activeTopicId} onOpen={onOpen} moreIdeas={moreIdeas} />}
      </div>
    </section>
  );
}

/** Narrow screens: one compact disclosure above the conversation. It is not a drawer and never overlays the page. */
export function ExploreDisclosure({ state, activeTopicId, onOpen, moreIdeas }: {
  state: ExploreState;
  activeTopicId: AskDiscoveryTopicId | null;
  onOpen: (topicId: AskDiscoveryTopicId, from: HTMLElement) => void;
  moreIdeas?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="shrink-0 border-b border-slate-200 bg-[#f7f7f5] px-4 py-1.5 lg:hidden" data-ask-explore="disclosure">
      <button ref={toggleRef} type="button" aria-expanded={expanded} aria-controls="ask-explore-disclosure-panel" onClick={() => setExpanded((current) => !current)}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
        <span className="inline-flex items-center gap-2"><Compass className="h-4 w-4 text-teal-700" aria-hidden="true" />Explore with Cozy</span>
        <ChevronDown className={cn('h-4 w-4 text-slate-400 transition', expanded && 'rotate-180')} aria-hidden="true" />
      </button>
      {expanded && <div id="ask-explore-disclosure-panel" className="pb-2">
        <ExploreStatus state={state} />
        {state.topics.length > 0 && <TopicButtons topics={state.topics} activeTopicId={activeTopicId} moreIdeas={moreIdeas}
          onOpen={(topicId) => onOpen(topicId, toggleRef.current as HTMLElement)} onAfterOpen={() => setExpanded(false)} />}
      </div>}
    </div>
  );
}

/** The focused view: a small set of starters written as homeowner outcomes, and one quiet way back. It submits nothing until a starter is chosen. */
export function ExploreFocusedView({ topics, topicId, busy, onSelectTopic, onStart, onClose }: {
  topics: AskDiscoveryTopic[];
  topicId: AskDiscoveryTopicId;
  busy: boolean;
  onSelectTopic: (topicId: AskDiscoveryTopicId) => void;
  onStart: (starter: AskDiscoveryStarter) => void;
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [topicId]);
  const ordered = [...topics].sort((a, b) => a.order - b.order);
  const topic = ordered.find((candidate) => candidate.id === topicId);
  if (!topic) return null;
  return (
    <section className="mx-auto w-full max-w-[720px] pt-2" aria-labelledby="ask-explore-focus-title" data-ask-explore="focused">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Explore with Cozy</p>
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Topics">
        {ordered.map((candidate) => (
          <button key={candidate.id} type="button" aria-pressed={candidate.id === topicId} onClick={() => onSelectTopic(candidate.id)}
            className={cn('min-h-9 rounded-full border px-3.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600', candidate.id === topicId ? 'border-teal-700 bg-teal-50 font-semibold text-teal-900' : 'border-slate-300 text-slate-600 hover:border-teal-300 hover:text-teal-900')}>
            {candidate.label}
          </button>
        ))}
      </div>
      <h2 id="ask-explore-focus-title" ref={headingRef} tabIndex={-1} className="mt-5 text-xl font-semibold tracking-tight text-slate-950 focus:outline-none">{topic.label}</h2>
      {indicatorText(topic.indicator) && <p className="mt-0.5 text-sm text-slate-500" data-explore-indicator="">{indicatorText(topic.indicator)}</p>}
      {topic.starters.length === 0
        ? <p className="mt-3 text-sm text-slate-600" role="status">Nothing to suggest here right now. You can still ask anything about your home.</p>
        : <ul className="mt-3 space-y-1.5">{topic.starters.map((starter) => {
          const available = starter.availability === 'AVAILABLE';
          return (
            <li key={starter.id}>
              <button type="button" disabled={!available || busy} aria-describedby={available ? undefined : `ask-explore-reason-${starter.id}`} onClick={() => onStart(starter)}
                className="group flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-800 shadow-sm transition hover:border-teal-300 hover:text-teal-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-slate-200 disabled:hover:text-slate-800">
                <span>{starter.label}{!available && <span id={`ask-explore-reason-${starter.id}`} className="mt-0.5 block text-xs font-normal text-slate-500">{reasonCopy(starter)}</span>}</span>
                {available && <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-teal-700" aria-hidden="true" />}
              </button>
            </li>
          );
        })}</ul>}
      <button type="button" onClick={onClose} className="mt-5 min-h-10 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">Not now</button>
    </section>
  );
}
