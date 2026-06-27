'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { HouseholdActivityItem } from '@/types';
import { api } from '@/lib/api/client';
import ActivityFeedItem from './ActivityFeedItem';

interface Props {
  propertyId: string;
}

export default function ActivityFeed({ propertyId }: Props) {
  const [items, setItems] = useState<HouseholdActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (cursor?: string) => {
    try {
      const result = await api.getHouseholdActivity(propertyId, { limit: 25, cursor });
      setItems((prev) => cursor ? [...prev, ...result.items] : result.items);
      setNextCursor(result.nextCursor);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  const loadMore = () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    load(nextCursor);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-3 py-3 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-gray-200 rounded w-3/4" />
              <div className="h-2.5 bg-gray-100 rounded w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!items.length) {
    return <p className="text-sm text-gray-400 py-6 text-center">No activity yet.</p>;
  }

  return (
    <div>
      <div className="divide-y divide-gray-100">
        {items.map((item) => (
          <ActivityFeedItem key={item.id} item={item} />
        ))}
      </div>
      {nextCursor && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-4 w-full text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
