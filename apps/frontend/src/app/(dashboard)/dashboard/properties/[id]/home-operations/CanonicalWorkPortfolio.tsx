'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CalendarClock, CheckCircle2, UserRound, Wrench } from 'lucide-react';
import type { WorkItemListEntryDTO } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorkItemManageDrawer } from '@/components/home/WorkItemManageDrawer';
import type { HomeOperationsTabKey } from './HomeOperationsTabs';

const COMPLETED = new Set(['REPORTED_COMPLETE', 'VERIFIED', 'CLOSED']);
const WAITING = new Set(['BLOCKED', 'DEFERRED']);

// Mirrors GRACE_PERIOD_MS in expireStaleWorkItemCandidates.usecase.ts.
const STALE_CANDIDATE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * A CANDIDATE (never-accepted) recommendation whose scheduling window has
 * fully elapsed is a forecast/season-anchored proposal that stopped being
 * regenerated — e.g. a passed "Multi-day heat risk ahead preparation"
 * checklist or a "Heavy rain expected Monday" insight. The backend sweep
 * (expireStaleWorkItemCandidates) closes these nightly; this mirrors its
 * grace period so a missed or lagging sweep cannot strand a dead proposal in
 * the homeowner's Today list. Accepted work that is merely overdue is
 * untouched — that is real tracked work, not an expired proposal.
 */
function isStaleWindowedCandidate(item: WorkItemListEntryDTO): boolean {
  if (item.state !== 'CANDIDATE' || item.acceptanceState === 'ACCEPTED') return false;
  const windowEndIso = item.dueWindowEnd ?? item.dueAt;
  if (!windowEndIso) return false;
  const windowEnd = new Date(windowEndIso).getTime();
  if (Number.isNaN(windowEnd)) return false;
  return windowEnd < Date.now() - STALE_CANDIDATE_GRACE_MS;
}

/**
 * Returns null for a work item that was dismissed/not relevant/a duplicate/
 * expired (state CLOSED with a disposition) — that's not "completed" (a
 * disposition is explicitly not the same thing as genuine completion), but
 * it's not live work either, so it must not fall through to the due-date
 * check below and get miscategorized as "Today" just because its stale due
 * date is in the past.
 */
export function classifyCanonicalWorkItem(item: WorkItemListEntryDTO): HomeOperationsTabKey | null {
  if (item.state === 'CLOSED' && item.disposition) return null;
  if (isStaleWindowedCandidate(item)) return null;
  if (item.supersededByWorkItemId) return 'completed';
  if (COMPLETED.has(item.state) && !item.disposition) return 'completed';
  if (item.state === 'IN_PROJECT' || item.obligationType === 'PROJECT_EXECUTION') return 'projects';
  if (item.isRoutine) return 'routines';
  if (WAITING.has(item.state)) return 'waiting';
  const due = item.dueAt ? new Date(item.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (item.state === 'IN_PROGRESS' || item.priority === 'NOW' || due <= endOfToday.getTime()) return 'today';
  return 'upcoming';
}

// dueAt is UTC midnight of the event date (see environmentBoundary in
// homeActionSourcePromotion.service.ts) — rendering it with the browser's
// local timezone via toLocaleDateString() shifts it back a calendar day for
// any timezone behind UTC. Read the UTC calendar date directly instead so
// this always matches the day named in the item's title.
function formatDueDate(dueAt: string): string {
  const parsed = new Date(dueAt);
  return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()).toLocaleDateString();
}

function executionHref(item: WorkItemListEntryDTO, propertyId: string): string | null {
  const primary = item.executions.find((entry) => entry.role === 'PRIMARY') ?? item.executions[0];
  if (!primary) return null;
  if (primary.executionType === 'MAINTENANCE_TASK') return `/dashboard/maintenance?propertyId=${propertyId}`;
  if (primary.executionType === 'GUIDANCE') return `/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${primary.executionEntityId}`;
  if (primary.executionType === 'PROJECT') return `/dashboard/properties/${propertyId}/projects/${primary.executionEntityId}`;
  return null;
}

export function CanonicalWorkPortfolio({
  items,
  tab,
  propertyId,
  onChanged,
  focusWorkItemId = null,
  autoOpenFocusedWorkItem = false,
}: {
  items: WorkItemListEntryDTO[];
  tab: HomeOperationsTabKey;
  propertyId: string;
  onChanged: () => Promise<unknown>;
  focusWorkItemId?: string | null;
  autoOpenFocusedWorkItem?: boolean;
}) {
  const [managedId, setManagedId] = useState<string | null>(null);
  const visible = useMemo(() => items.filter((item) => classifyCanonicalWorkItem(item) === tab), [items, tab]);

  useEffect(() => {
    if (!autoOpenFocusedWorkItem || !focusWorkItemId) return;
    if (visible.some((item) => item.id === focusWorkItemId)) setManagedId(focusWorkItemId);
  }, [autoOpenFocusedWorkItem, focusWorkItemId, visible]);

  if (visible.length === 0) return null;
  return (
    <div className="space-y-3">
      {visible.map((item) => {
        const href = executionHref(item, propertyId);
        return (
          <article id={`home-action-work-${item.id}`} key={item.id} className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-full">{item.state.toLowerCase().replaceAll('_', ' ')}</Badge>
                  <Badge variant="outline" className="rounded-full">{item.priority.toLowerCase()}</Badge>
                  {item.isRoutine ? <Badge className="rounded-full bg-teal-100 text-teal-800">Routine</Badge> : null}
                  {item.reconciliationPending ? (
                    <Badge className="rounded-full bg-amber-100 text-amber-900"><AlertCircle className="mr-1 h-3 w-3" />Record update pending</Badge>
                  ) : null}
                  {item.supersededByWorkItemId ? <Badge className="rounded-full bg-slate-200 text-slate-700">Duplicate</Badge> : null}
                </div>
                <h2 className="mt-3 text-lg font-semibold text-slate-950">{item.title}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">{item.homeownerReason}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  {item.dueAt ? <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />Due {formatDueDate(item.dueAt)}</span> : null}
                  <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{item.ownerUserId ? 'Assigned' : 'Unassigned'}</span>
                  {COMPLETED.has(item.state) && !item.disposition ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Outcome recorded</span> : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {href ? <Button asChild size="sm" className="rounded-full"><Link href={href}><Wrench className="mr-1.5 h-4 w-4" />Open work</Link></Button> : null}
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setManagedId(item.id)}>Manage</Button>
              </div>
            </div>
          </article>
        );
      })}
      {managedId ? (
        <WorkItemManageDrawer
          propertyId={propertyId}
          workItemId={managedId}
          open
          onOpenChange={(open) => { if (!open) setManagedId(null); }}
          onChanged={onChanged}
        />
      ) : null}
    </div>
  );
}
