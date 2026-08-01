'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CalendarClock, CheckCircle2, UserRound, Wrench } from 'lucide-react';
import type { WorkItemListEntryDTO } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorkItemManageDrawer } from '@/components/home/WorkItemManageDrawer';
import type { HomeOperationsTabKey } from './HomeOperationsTabs';

const COMPLETED = new Set(['REPORTED_COMPLETE', 'VERIFIED', 'CLOSED']);
const WAITING = new Set(['BLOCKED', 'DEFERRED']);

export function classifyCanonicalWorkItem(item: WorkItemListEntryDTO): HomeOperationsTabKey {
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
}: {
  items: WorkItemListEntryDTO[];
  tab: HomeOperationsTabKey;
  propertyId: string;
  onChanged: () => Promise<unknown>;
}) {
  const [managedId, setManagedId] = useState<string | null>(null);
  const visible = useMemo(() => items.filter((item) => classifyCanonicalWorkItem(item) === tab), [items, tab]);

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
                  {item.dueAt ? <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />Due {new Date(item.dueAt).toLocaleDateString()}</span> : null}
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
