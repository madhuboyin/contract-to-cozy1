'use client';

// Explore with Cozy (docs/product/ASK_COZY_LIGHTWEIGHT_CAPABILITY_DISCOVERY_IMPLEMENTATION_PLAN.md, Phase 2). A quiet, persistent group of
// topic entry points that stays inside the Ask shell. Selecting a topic is view state only: it sends nothing, creates no execution and
// navigates nowhere. A starter is the only thing that launches, through the ordinary Ask path. Topics, order, starters and their
// availability are rendered exactly as the server returned them; nothing here infers an operation from a label.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ArrowRight, ChevronDown, ChevronRight, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskDiscoveryStarter, AskDiscoveryTopic, AskDiscoveryTopicId, AskTargetOption } from '@/features/ask/types';
import type { ExploreSelectorState } from './useExploreWithCozy';

export interface ExploreState {
  topics: AskDiscoveryTopic[];
  loading: boolean;
  failed: boolean;
}

const REASON_COPY: Record<string, string> = {
  ASK_PERMISSION_REQUIRED: 'Needs more access to this home.',
  GUIDE_SUPERSEDED: 'The reviewed guide for this project has changed.',
  GUIDE_WITHDRAWN: 'The reviewed guide for this project was withdrawn.',
};

/**
 * "3 need attention", "2 active", "72% complete". Shown only when the server vouches for it (CURRENT) and only when it says something: a
 * count of zero is left out so the rail stays quiet, while a percentage always shows. Absent never means zero.
 */
export function indicatorText(indicator: AskDiscoveryTopic['indicator']): string | null {
  if (!indicator || indicator.freshness !== 'CURRENT') return null;
  if (typeof indicator.value === 'number' && indicator.value === 0) return null;
  // The server owns the label ("need attention"); only the verb agrees with a count of one.
  const label = indicator.value === 1 && indicator.label === 'need attention' ? 'needs attention' : indicator.label;
  return `${indicator.value} ${label}`.trim();
}

function reasonCopy(item: { availability: string; reasonCodes: string[] }): string {
  if (item.availability === 'NEEDS_CONTEXT') return 'Needs a little more information first.';
  return item.reasonCodes.map((code) => REASON_COPY[code]).find(Boolean) ?? 'Not available right now.';
}

/**
 * Calls `onVisible` once per `key`, only after the element is actually on screen (IntersectionObserver). An element that is display:none, or
 * a panel that is collapsed, never fires. Without IntersectionObserver (old browsers, jsdom) a mounted element counts as visible.
 */
export function useVisibleOnce<T extends HTMLElement>(key: string, onVisible?: () => void) {
  const ref = useRef<T>(null);
  const latest = useRef(onVisible);
  latest.current = onVisible;
  const fired = useRef<string | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !latest.current || fired.current === key) return;
    const fire = () => {
      if (fired.current === key) return;
      fired.current = key;
      latest.current?.();
    };
    if (typeof IntersectionObserver === 'undefined') { fire(); return; }
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { fire(); observer.disconnect(); } });
    observer.observe(element);
    return () => observer.disconnect();
  }, [key]);
  return ref;
}

/**
 * Which topic's focused view is open (null = Ask home). Keeps the conversation mounted-but-hidden by the caller, and restores scroll and focus on return.
 * Opening a topic pushes ONE browser-history entry (same URL, so the session restore ignores it); Back closes the view and Forward reopens it.
 * Switching topics inside the view replaces that entry instead of stacking another, and a Forward entry from a different home is never reopened.
 */
export function useExploreFocus(scrollRef: RefObject<HTMLElement | null>, resetKey: string) {
  const [focus, setFocus] = useState<AskDiscoveryTopicId | null>(null);
  const savedScroll = useRef(0);
  const trigger = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const homeKey = useRef(resetKey);
  homeKey.current = resetKey;

  const open = (topicId: AskDiscoveryTopicId, from?: HTMLElement | null) => {
    const entry = { topicId, homeKey: resetKey };
    if (!wasOpen.current) {
      savedScroll.current = scrollRef.current?.scrollTop ?? 0;
      trigger.current = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      window.history.pushState({ ...window.history.state, askExploreFocus: entry }, '');
    } else if (window.history.state?.askExploreFocus) {
      window.history.replaceState({ ...window.history.state, askExploreFocus: entry }, '');
    }
    setFocus(topicId);
  };
  /**
   * "Not now" pops the entry this view pushed, so Back does not land on a closed view. A launch must not: `history.back()` is asynchronous and the
   * launch is about to write the conversation's own URL, so the entry is only stripped of the topic in place (one extra Back step, to the same Ask home).
   */
  const close = (options?: { launched?: boolean }) => {
    setFocus(null);
    const { askExploreFocus, ...rest } = window.history.state ?? {};
    if (!askExploreFocus) return;
    if (options?.launched) window.history.replaceState(rest, '');
    else window.history.back();
  };

  useEffect(() => {
    const restore = (event: PopStateEvent) => {
      const entry = event.state?.askExploreFocus;
      setFocus(entry && entry.homeKey === homeKey.current ? entry.topicId : null);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

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
export function ExploreRailGroup({ state, activeTopicId, onOpen, moreIdeas, onVisible }: {
  state: ExploreState;
  activeTopicId: AskDiscoveryTopicId | null;
  onOpen: (topicId: AskDiscoveryTopicId, from: HTMLElement) => void;
  moreIdeas?: ReactNode;
  /** Fired once, only after the topics are on screen. */
  onVisible?: () => void;
}) {
  const ref = useVisibleOnce<HTMLElement>(state.topics.length ? 'topics' : 'none', state.topics.length ? onVisible : undefined);
  return (
    <section ref={ref} className="mt-3 border-y border-stone-200 py-3" aria-labelledby="ask-explore-rail-title" data-ask-explore="rail">
      <h3 id="ask-explore-rail-title" className="px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Explore with Cozy</h3>
      <div className="mt-1">
        <ExploreStatus state={state} />
        {state.topics.length > 0 && <TopicButtons topics={state.topics} activeTopicId={activeTopicId} onOpen={onOpen} moreIdeas={moreIdeas} />}
      </div>
    </section>
  );
}

/** Narrow screens: one compact disclosure above the conversation. It is not a drawer and never overlays the page. */
export function ExploreDisclosure({ state, activeTopicId, onOpen, moreIdeas, onPanelVisible }: {
  state: ExploreState;
  activeTopicId: AskDiscoveryTopicId | null;
  onOpen: (topicId: AskDiscoveryTopicId, from: HTMLElement) => void;
  moreIdeas?: ReactNode;
  /** Fired once, only after the expanded panel's topics are on screen (a collapsed disclosure shows no topics). */
  onPanelVisible?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelRef = useVisibleOnce<HTMLDivElement>(expanded && state.topics.length ? 'topics' : 'none', expanded && state.topics.length ? onPanelVisible : undefined);
  const toggleRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="shrink-0 border-b border-slate-200 bg-[#f7f7f5] px-4 py-1.5 lg:hidden" data-ask-explore="disclosure">
      <button ref={toggleRef} type="button" aria-expanded={expanded} aria-controls="ask-explore-disclosure-panel" onClick={() => setExpanded((current) => !current)}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
        <span className="inline-flex items-center gap-2"><Compass className="h-4 w-4 text-teal-700" aria-hidden="true" />Explore with Cozy</span>
        <ChevronDown className={cn('h-4 w-4 text-slate-400 transition', expanded && 'rotate-180')} aria-hidden="true" />
      </button>
      {expanded && <div ref={panelRef} id="ask-explore-disclosure-panel" className="pb-2">
        <ExploreStatus state={state} />
        {state.topics.length > 0 && <TopicButtons topics={state.topics} activeTopicId={activeTopicId} moreIdeas={moreIdeas}
          onOpen={(topicId) => onOpen(topicId, toggleRef.current as HTMLElement)} onAfterOpen={() => setExpanded(false)} />}
      </div>}
    </div>
  );
}

/** The focused view: a small set of starters written as homeowner outcomes, and one quiet way back. It submits nothing until a starter is chosen. */
export function ExploreFocusedView({ topics, topicId, busy, onSelectTopic, onStart, onClose, onStartersVisible, selector = null, onChooseTarget, onCancelSelector, onRetrySelector }: {
  topics: AskDiscoveryTopic[];
  topicId: AskDiscoveryTopicId;
  busy: boolean;
  /** Fired once per topic, only after its starters are on screen. */
  onStartersVisible?: (topicId: AskDiscoveryTopicId, starters: AskDiscoveryStarter[]) => void;
  /** The target selector open for one of this topic's starters, if any (IW-SHELL-022). */
  selector?: ExploreSelectorState;
  onChooseTarget?: (option: AskTargetOption) => void;
  onCancelSelector?: () => void;
  onRetrySelector?: () => void;
  onSelectTopic: (topicId: AskDiscoveryTopicId) => void;
  onStart: (starter: AskDiscoveryStarter) => void;
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [topicId]);
  const ordered = [...topics].sort((a, b) => a.order - b.order);
  const topic = ordered.find((candidate) => candidate.id === topicId);
  const startersRef = useVisibleOnce<HTMLUListElement>(`starters:${topicId}`, topic?.starters.length ? () => onStartersVisible?.(topicId, topic.starters) : undefined);
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
      {selector && onChooseTarget && onCancelSelector && onRetrySelector
        ? <ExploreTargetPicker selector={selector} topicLabel={topic.label} busy={busy} onChoose={onChooseTarget} onCancel={onCancelSelector} onRetry={onRetrySelector} />
        : <>
      {topic.starters.length === 0
        ? <p className="mt-3 text-sm text-slate-600" role="status">Nothing to suggest here right now. You can still ask anything about your home.</p>
        : <ul ref={startersRef} className="mt-3 space-y-1.5">{topic.starters.map((starter) => {
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
        </>}
      <button type="button" onClick={onClose} className="mt-5 min-h-10 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">Not now</button>
    </section>
  );
}

/**
 * A domain-owned target selector shown inside the focused view (IW-SHELL-022). Opening it wrote nothing. Every option is an explicit choice, even a
 * single one; an option the caller cannot use is shown disabled with its reason; a list that could not be read says so and offers a retry, and is
 * never shown as "nothing to choose".
 */
export function ExploreTargetPicker({ selector, topicLabel, busy, onChoose, onCancel, onRetry }: {
  selector: NonNullable<ExploreSelectorState>;
  topicLabel: string;
  busy: boolean;
  onChoose: (option: AskTargetOption) => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const back = <button type="button" onClick={onCancel} className="mt-3 min-h-10 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">Back to {topicLabel}</button>;
  const heading = <h3 id="ask-explore-picker-title" className="mt-4 text-base font-semibold text-slate-900">{selector.status === 'ready' ? selector.selection.title : selector.starter.label}</h3>;
  if (selector.status === 'loading') return <section aria-labelledby="ask-explore-picker-title" data-ask-explore="picker">{heading}<p className="mt-2 text-sm text-slate-500" role="status">Checking your home…</p>{back}</section>;
  const unreadable = selector.status === 'failed' || selector.selection.state === 'UNAVAILABLE';
  if (unreadable) {
    return (
      <section aria-labelledby="ask-explore-picker-title" data-ask-explore="picker">
        {heading}
        <p className="mt-2 text-sm text-slate-600" role="status" data-explore-picker-state="unavailable">{selector.status === 'ready' ? selector.selection.explanation : 'We could not check that right now. Nothing has changed.'}</p>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={onRetry} className="mt-3 min-h-10 rounded-xl border border-slate-300 px-3.5 text-sm font-medium text-slate-800 hover:border-teal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">Try again</button>{back}</div>
      </section>
    );
  }
  const { selection } = selector;
  if (selection.state === 'NONE_ELIGIBLE') {
    return <section aria-labelledby="ask-explore-picker-title" data-ask-explore="picker">{heading}<p className="mt-2 text-sm text-slate-600" role="status" data-explore-picker-state="none">{selection.explanation}</p>{back}</section>;
  }
  return (
    <section aria-labelledby="ask-explore-picker-title" data-ask-explore="picker">
      {heading}
      <ul className="mt-2 space-y-1.5">{selection.options.map((option) => {
        const available = option.availability === 'AVAILABLE';
        return (
          <li key={option.targetId}>
            <button type="button" disabled={!available || busy} aria-describedby={`ask-explore-option-${option.targetId}`} onClick={() => onChoose(option)}
              className="group flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-800 shadow-sm transition hover:border-teal-300 hover:text-teal-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-slate-200 disabled:hover:text-slate-800">
              <span>{option.label}<span id={`ask-explore-option-${option.targetId}`} className="mt-0.5 block text-xs font-normal text-slate-500">{available ? option.summary : reasonCopy(option)}</span></span>
              {available && <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-teal-700" aria-hidden="true" />}
            </button>
          </li>
        );
      })}</ul>
      {selection.truncated && <p className="mt-2 text-xs text-slate-500">Showing the most recent ones.</p>}
      {back}
    </section>
  );
}
