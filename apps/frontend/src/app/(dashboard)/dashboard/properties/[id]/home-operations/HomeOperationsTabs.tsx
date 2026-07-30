'use client';

import * as React from 'react';
import type { HomeActionEmptyStateReason, RankedHomeActionDTO } from '@/types';
import {
  ActionCard,
  CoverageCorrectionGroupCard,
  CriticalWeatherActionCard,
  EnvironmentActionCard,
  SeasonalChecklistActionCard,
  groupAttentionActions,
  type AttentionEntry,
} from '@/components/home/UnifiedHomeSurface';

export type HomeOperationsTabKey = 'today' | 'upcoming' | 'waiting' | 'projects' | 'routines' | 'completed';

export const HOME_OPERATIONS_TABS: ReadonlyArray<{ key: HomeOperationsTabKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'projects', label: 'Projects' },
  { key: 'routines', label: 'Routines' },
  { key: 'completed', label: 'Completed' },
];

function isDueTodayOrOverdue(dueAt: string | null): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return false;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return due <= endOfToday.getTime();
}

const COMPLETED_STATES = new Set(['REPORTED_COMPLETE', 'VERIFIED', 'CLOSED']);
const WAITING_STATES = new Set(['BLOCKED', 'DEFERRED']);

/**
 * Home Operations Slice 2 tab classifier. A work item's lifecycle state
 * takes precedence when one exists; actions without a work item (advisory
 * -only sources, or a same-request resolution failure) fall back to
 * priority/due-date, which is exactly what "Recommended for your home"
 * (not yet accepted) work looks like today.
 */
export function classifyHomeOperationsTab(action: RankedHomeActionDTO): HomeOperationsTabKey {
  const workItem = action.workItem;

  // Genuine completion is state ∈ {REPORTED_COMPLETE, VERIFIED, CLOSED} with
  // disposition null — a CLOSED item WITH a disposition was dismissed/not
  // relevant/a duplicate/expired, not completed (see Slice 1's disposition
  // design), so it does not belong here.
  if (workItem && COMPLETED_STATES.has(workItem.state) && !workItem.disposition) {
    return 'completed';
  }
  if (workItem?.state === 'IN_PROJECT' || action.source.kind === 'PROJECT') {
    return 'projects';
  }
  if (workItem && WAITING_STATES.has(workItem.state)) {
    return 'waiting';
  }
  if (workItem?.state === 'IN_PROGRESS' || isDueTodayOrOverdue(action.timing.dueAt) || action.priority === 'NOW') {
    return 'today';
  }
  return 'upcoming';
}

export function isAcceptedWorkItem(action: RankedHomeActionDTO): boolean {
  return action.workItem?.acceptanceState === 'ACCEPTED';
}

function entryActions(entry: AttentionEntry): RankedHomeActionDTO[] {
  return entry.kind === 'COVERAGE_CORRECTION_GROUP' ? entry.actions : [entry.action];
}

function entryKey(entry: AttentionEntry): string {
  return entry.kind === 'COVERAGE_CORRECTION_GROUP'
    ? `coverage-plan-group:${entry.actions.map((action) => action.id).join(':')}`
    : entry.action.id;
}

const TAB_EMPTY_STATE: Record<HomeOperationsTabKey, { title: string; body: string }> = {
  today: { title: 'Nothing needs attention today', body: 'Time-sensitive and in-progress work will show up here as soon as something needs you.' },
  upcoming: { title: 'Nothing scheduled yet', body: 'Accepted work with a future date, and new recommendations, will appear here.' },
  waiting: { title: 'Nothing is blocked or deferred', body: 'Work you’ve paused or that’s waiting on someone else shows up here.' },
  projects: { title: 'No active projects', body: 'Contractor projects and their milestones will appear here once one is underway.' },
  routines: { title: 'Routines aren’t available yet', body: 'This becomes the Home Habit Coach’s home in a later update — it isn’t wired into Home Operations yet.' },
  completed: { title: 'Nothing completed recently', body: 'Verified and reported-complete work from the last 30 days shows up here.' },
};

// Home Operations Item #12 (§5.16): shown instead of TAB_EMPTY_STATE only
// when the whole feed is empty (every tab, simultaneously, for the same
// reason) — never translate system silence into a home-health guarantee.
// Copy stays tab-agnostic since all non-routine tabs show the same reason.
const EMPTY_STATE_REASON_COPY: Record<HomeActionEmptyStateReason, { title: string; body: string }> = {
  DATA_UNAVAILABLE: {
    title: 'We couldn’t fully evaluate your home right now',
    body: 'Something went wrong while generating recommendations. This isn’t a clean bill of health — try refreshing, and contact support if it keeps happening.',
  },
  RECOMMENDATIONS_PAUSED: {
    title: 'Personalized recommendations are paused',
    body: 'This is a temporary, account-wide pause on generating new suggestions — not a sign your home is in good shape. Regular checks will resume once it’s lifted.',
  },
  SOURCE_EVALUATION_PENDING: {
    title: 'We haven’t evaluated your home yet',
    body: 'A risk assessment or maintenance checklist hasn’t run for this property yet, so there’s nothing to show — not because nothing needs attention.',
  },
  MISSING_FACTS: {
    title: 'We need more details to recommend anything',
    body: 'Key facts about your home’s systems and structure are still missing, so we can’t confidently suggest what needs attention. Add property details to unlock recommendations.',
  },
  NO_ACCEPTED_WORK: {
    title: 'No work has been accepted yet',
    body: 'Nothing showing up here just means nothing’s been added to your plan so far — not that your home has been thoroughly checked. Accept a recommendation to get started.',
  },
  ALL_CAUGHT_UP: {
    title: 'You’re caught up',
    body: 'Every recommendation has been addressed or is being tracked elsewhere, and nothing new has come up. We’ll let you know as soon as something does.',
  },
};

function EntryCard({
  entry,
  propertyId,
  onChanged,
}: {
  entry: AttentionEntry;
  propertyId: string;
  onChanged: () => Promise<unknown>;
}) {
  if (entry.kind === 'ACTION') {
    return <ActionCard action={entry.action} propertyId={propertyId} showSupportingDetails onChanged={onChanged} />;
  }
  if (entry.kind === 'CRITICAL_WEATHER') {
    return <CriticalWeatherActionCard action={entry.action} propertyId={propertyId} showSupportingDetails />;
  }
  if (entry.kind === 'ENVIRONMENT') {
    return <EnvironmentActionCard action={entry.action} propertyId={propertyId} onChanged={onChanged} />;
  }
  if (entry.kind === 'SEASONAL_CHECKLIST') {
    return <SeasonalChecklistActionCard action={entry.action} propertyId={propertyId} showSupportingDetails />;
  }
  return <CoverageCorrectionGroupCard actions={entry.actions} subjects={entry.subjects} propertyId={propertyId} showSupportingDetails onChanged={onChanged} />;
}

function EntryList({
  entries,
  propertyId,
  onChanged,
  focusActionId,
  focusWorkItemId,
}: {
  entries: AttentionEntry[];
  propertyId: string;
  onChanged: () => Promise<unknown>;
  focusActionId: string | null;
  focusWorkItemId: string | null;
}) {
  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const actions = entryActions(entry);
        const isFocused = Boolean(
          (focusWorkItemId && actions.some((action) => action.workItem?.id === focusWorkItemId)) ||
          (focusActionId && actions.some((action) =>
            action.id === focusActionId ||
            action.lineageId === focusActionId ||
            action.deduplication.mergedActionIds.includes(focusActionId),
          )),
        );
        const anchorId = focusWorkItemId && isFocused
          ? `home-action-work-${focusWorkItemId}`
          : focusActionId && isFocused
            ? `home-action-${focusActionId}`
            : `home-action-${actions[0]?.id ?? 'unknown'}`;

        return (
          <div
            id={anchorId}
            key={entryKey(entry)}
            className={`scroll-mt-28 rounded-2xl transition-shadow ${isFocused ? 'ring-2 ring-teal-500 ring-offset-4 ring-offset-white' : ''}`}
          >
            <EntryCard entry={entry} propertyId={propertyId} onChanged={onChanged} />
          </div>
        );
      })}
    </div>
  );
}

export function HomeOperationsTabPanel({
  tab,
  actions,
  propertyId,
  onChanged,
  focusActionId,
  focusWorkItemId,
  emptyStateReason,
}: {
  tab: HomeOperationsTabKey;
  actions: RankedHomeActionDTO[];
  propertyId: string;
  onChanged: () => Promise<unknown>;
  focusActionId: string | null;
  focusWorkItemId: string | null;
  emptyStateReason: HomeActionEmptyStateReason | null;
}) {
  if (tab === 'routines') {
    const empty = TAB_EMPTY_STATE.routines;
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
        <p className="font-semibold text-slate-800">{empty.title}</p>
        <p className="mt-1 text-sm text-slate-600">{empty.body}</p>
      </div>
    );
  }

  if (actions.length === 0) {
    // The whole feed is empty (every tab, simultaneously) — say why instead
    // of defaulting to this tab's "filtered empty" copy, which would imply
    // a clean bill of health even when recommendations are paused, failed,
    // or have simply never run for this property.
    if (emptyStateReason) {
      const empty = EMPTY_STATE_REASON_COPY[emptyStateReason];
      const isCaughtUp = emptyStateReason === 'ALL_CAUGHT_UP';
      return (
        <div className={`rounded-2xl border p-5 text-center ${isCaughtUp ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
          <p className={`font-semibold ${isCaughtUp ? 'text-emerald-900' : 'text-slate-800'}`}>{empty.title}</p>
          <p className={`mt-1 text-sm ${isCaughtUp ? 'text-emerald-800' : 'text-slate-600'}`}>{empty.body}</p>
        </div>
      );
    }

    const empty = TAB_EMPTY_STATE[tab];
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <p className="font-semibold text-emerald-900">{empty.title}</p>
        <p className="mt-1 text-sm text-emerald-800">{empty.body}</p>
      </div>
    );
  }

  // Recommended-vs-accepted separation (parent plan section 10.4) only
  // matters where both can plausibly coexist — Today/Upcoming. Waiting/
  // Projects/Completed are already accepted-or-further-along by
  // construction (their classification requires a work item in that state).
  if (tab === 'today' || tab === 'upcoming') {
    const recommended = actions.filter((action) => !isAcceptedWorkItem(action));
    const accepted = actions.filter(isAcceptedWorkItem);
    return (
      <div className="space-y-6">
        {accepted.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">In your plan</h3>
            <EntryList
              entries={groupAttentionActions(accepted)}
              propertyId={propertyId}
              onChanged={onChanged}
              focusActionId={focusActionId}
              focusWorkItemId={focusWorkItemId}
            />
          </div>
        )}
        {recommended.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recommended for your home</h3>
            <EntryList
              entries={groupAttentionActions(recommended)}
              propertyId={propertyId}
              onChanged={onChanged}
              focusActionId={focusActionId}
              focusWorkItemId={focusWorkItemId}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <EntryList
      entries={groupAttentionActions(actions)}
      propertyId={propertyId}
      onChanged={onChanged}
      focusActionId={focusActionId}
      focusWorkItemId={focusWorkItemId}
    />
  );
}
