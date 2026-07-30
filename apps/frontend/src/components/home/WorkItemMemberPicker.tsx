'use client';

import { useEffect, useState } from 'react';
import type { HouseholdMember } from '@/types';
import { api } from '@/lib/api/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getMemberDisplayName, ROLE_LABELS } from '@/components/features/household/HouseholdUtils';

/**
 * Home Operations Item #16: shared household-member list, reused for both
 * the owner picker and the watcher picker inside WorkItemManageDrawer.
 * Extracted from AssignTaskSheet.tsx's member-rendering pattern rather than
 * duplicating it a third time.
 */
export function WorkItemMemberPicker({
  propertyId,
  members: providedMembers,
  excludeUserIds = [],
  highlightUserId = null,
  pendingUserId = null,
  onSelect,
  emptyLabel = 'No household members found.',
}: {
  propertyId: string;
  /** Pre-fetched members, e.g. shared by a parent across owner + watcher sections. Falls back to a self-fetch if omitted. */
  members?: HouseholdMember[];
  excludeUserIds?: string[];
  highlightUserId?: string | null;
  pendingUserId?: string | null;
  onSelect: (userId: string) => void;
  emptyLabel?: string;
}) {
  const [fetchedMembers, setFetchedMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(providedMembers === undefined);

  useEffect(() => {
    if (providedMembers !== undefined) return;
    let cancelled = false;
    setLoading(true);
    api.listHouseholdMembers(propertyId)
      .then((result) => { if (!cancelled) setFetchedMembers(result); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [propertyId, providedMembers]);

  const members = providedMembers ?? fetchedMembers;
  const visibleMembers = members.filter((member) => !excludeUserIds.includes(member.userId));

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />)}
      </div>
    );
  }

  if (visibleMembers.length === 0) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {visibleMembers.map((member) => {
        const name = getMemberDisplayName(member);
        const isHighlighted = member.userId === highlightUserId;
        const isPending = member.userId === pendingUserId;
        const initials = `${member.user.firstName[0] ?? ''}${member.user.lastName[0] ?? ''}`.toUpperCase();
        return (
          <button
            key={member.id}
            type="button"
            onClick={() => onSelect(member.userId)}
            disabled={pendingUserId !== null}
            className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors disabled:opacity-60 ${
              isHighlighted ? 'border border-teal-200 bg-teal-50' : 'bg-slate-50 hover:bg-slate-100'
            }`}
          >
            <Avatar size="sm">
              {member.user.avatar ? <AvatarImage src={member.user.avatar} alt={name} /> : null}
              <AvatarFallback className="text-xs font-semibold text-slate-700">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{name}</p>
              <Badge variant="outline" className="mt-0.5 rounded-full text-[11px]">{ROLE_LABELS[member.role]}</Badge>
            </div>
            {isPending ? <span className="shrink-0 text-xs text-slate-400">Saving…</span> : null}
            {isHighlighted && !isPending ? <span className="shrink-0 text-xs font-medium text-teal-700">Current</span> : null}
          </button>
        );
      })}
    </div>
  );
}
