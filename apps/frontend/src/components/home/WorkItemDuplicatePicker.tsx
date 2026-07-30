'use client';

import { useEffect, useState } from 'react';
import type { WorkItemListEntryDTO } from '@/types';
import { api } from '@/lib/api/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

/**
 * Home Operations Item #16: no "mark as duplicate" UI precedent exists
 * anywhere in this app — this is a low-tech filterable list (matching
 * AssignTaskSheet's approach elsewhere), not a command-palette component,
 * since none exists in this repo's ui/ primitives. Pure picker; the parent
 * (WorkItemManageDrawer) owns confirmation and the actual API call.
 */
export function WorkItemDuplicatePicker({
  propertyId,
  excludeWorkItemId,
  onSelect,
  pendingWorkItemId = null,
}: {
  propertyId: string;
  excludeWorkItemId: string;
  onSelect: (item: WorkItemListEntryDTO) => void;
  pendingWorkItemId?: string | null;
}) {
  const [items, setItems] = useState<WorkItemListEntryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.listWorkItems(propertyId)
      .then((res) => { if (!cancelled) setItems(res.success ? res.data.items : []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [propertyId]);

  const candidates = items
    .filter((item) => item.id !== excludeWorkItemId && item.state !== 'CLOSED')
    .filter((item) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || item.workKey.toLowerCase().includes(q);
    });

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />)}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input placeholder="Search work items…" value={query} onChange={(event) => setQuery(event.target.value)} />
      {candidates.length === 0 ? (
        <p className="text-sm text-slate-500">No other open work items found.</p>
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {candidates.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              disabled={pendingWorkItemId !== null}
              className="flex w-full items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-left transition-colors hover:bg-slate-100 disabled:opacity-60"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                <p className="truncate text-xs text-slate-500">{item.workKey}</p>
              </div>
              <Badge variant="outline" className="shrink-0 rounded-full text-[11px]">{item.state}</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
