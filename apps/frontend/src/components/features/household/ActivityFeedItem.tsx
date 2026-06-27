'use client';

import type { HouseholdActivityItem } from '@/types';
import { formatRelativeTime } from './HouseholdUtils';

interface Props {
  item: HouseholdActivityItem;
}

export default function ActivityFeedItem({ item }: Props) {
  const actor = item.actorUser;
  const initials = `${actor.firstName[0]}${actor.lastName[0]}`.toUpperCase();

  return (
    <div className="flex gap-3 py-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
        {actor.avatar ? (
          <img src={actor.avatar} alt={actor.firstName} className="w-8 h-8 rounded-full object-cover" />
        ) : (
          initials
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800">{item.summaryText}</p>
        <p className="text-xs text-gray-400 mt-0.5">{formatRelativeTime(item.createdAt)}</p>
      </div>
    </div>
  );
}
