// apps/frontend/src/components/rooms/RoomTimeline.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { getRoomTimeline } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';

interface TimelineItem {
  id: string;
  title: string;
  status?: string;
  at: string;
  type: 'TASK' | 'INCIDENT';
  meta?: any;
}

interface Props {
  propertyId: string;
  roomId: string;
}

function unwrapTimeline(resp: any): TimelineItem[] {
  if (Array.isArray(resp)) return resp as TimelineItem[];
  if (resp?.timeline && Array.isArray(resp.timeline)) return resp.timeline as TimelineItem[];
  if (resp?.data?.timeline && Array.isArray(resp.data.timeline)) return resp.data.timeline as TimelineItem[];
  return [];
}

export default function RoomTimeline({ propertyId, roomId }: Props) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!propertyId || !roomId) return;
    setLoading(true);
    try {
      const resp = await getRoomTimeline(propertyId, roomId);
      setItems(unwrapTimeline(resp));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, roomId]);

  const emptyText = useMemo(() => {
    return (
      <div className="mt-4 text-sm opacity-70">
        No timeline events yet. Once tasks/incidents are created with <span className="font-mono">roomId</span>, they’ll appear here.
      </div>
    );
  }, []);

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5">
      <div className="text-sm font-semibold">Before / After maintenance timeline</div>
      <div className="text-xs opacity-70 mt-1">Merged feed from tasks + incidents (room-linked).</div>

      {loading ? (
        <div className="mt-4 text-sm opacity-70">Loading…</div>
      ) : items.length === 0 ? (
        emptyText
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((e) => (
            <div key={`${e.type}-${e.id}`} className="flex items-start gap-3">
              <div className={`mt-1 h-2.5 w-2.5 rounded-full ${e.type === 'INCIDENT' ? 'bg-black/70' : 'bg-black/40'}`} />
              <div className="flex-1 rounded-xl border border-black/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{e.title}</div>
                  <div className="text-xs opacity-60">{new Date(e.at).toLocaleString()}</div>
                </div>
                <div className="text-xs opacity-70 mt-1">
                  {e.type}
                  {e.status ? ` • ${e.status}` : ''}
                  {e?.meta?.beforeAfter ? ` • ${e.meta.beforeAfter}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
