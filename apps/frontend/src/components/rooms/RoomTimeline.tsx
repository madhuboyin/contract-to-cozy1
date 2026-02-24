// apps/frontend/src/components/rooms/RoomTimeline.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Camera, ClipboardCheck, Pencil, Plus, Wrench } from 'lucide-react';
import { motion } from 'framer-motion';

import { getRoomTimeline } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import { titleCase } from '@/lib/utils/string';

type RoomType =
  | 'KITCHEN'
  | 'LIVING'
  | 'BEDROOM'
  | 'BATHROOM'
  | 'DINING'
  | 'LAUNDRY'
  | 'GARAGE'
  | 'OFFICE'
  | 'BASEMENT'
  | 'OTHER';

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
  roomType: RoomType;
  onAddEvent: () => void;
}

const EVENT_TYPE_CONFIG: Record<
  string,
  {
    label: string;
    nodeColor: string;
    iconBg: string;
    iconColor: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  TASK: {
    label: 'Maintenance',
    nodeColor: 'bg-teal-500 border-teal-500',
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-600',
    icon: Wrench,
  },
  INCIDENT: {
    label: 'Repair',
    nodeColor: 'bg-amber-500 border-amber-500',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    icon: AlertTriangle,
  },
  DEFAULT: {
    label: 'Update',
    nodeColor: 'bg-blue-500 border-blue-500',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    icon: ClipboardCheck,
  },
};

function unwrapTimeline(resp: any): TimelineItem[] {
  if (Array.isArray(resp)) return resp as TimelineItem[];
  if (resp?.timeline && Array.isArray(resp.timeline)) return resp.timeline as TimelineItem[];
  if (resp?.data?.timeline && Array.isArray(resp.data.timeline)) return resp.data.timeline as TimelineItem[];
  return [];
}

function normalizeDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getEventPhotos(event: TimelineItem): { beforePhoto?: string; afterPhoto?: string } {
  const meta = event?.meta || {};

  const beforePhoto =
    meta.beforePhoto || meta.beforeImage || meta.beforePhotoUrl || meta.beforeUrl || meta.before?.url || undefined;
  const afterPhoto =
    meta.afterPhoto || meta.afterImage || meta.afterPhotoUrl || meta.afterUrl || meta.after?.url || undefined;

  return { beforePhoto, afterPhoto };
}

export default function RoomTimeline({ propertyId, roomId, roomType, onAddEvent }: Props) {
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
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, roomId]);

  const timelineEvents = useMemo(
    () =>
      items
        .slice()
        .sort((a, b) => {
          const aTime = normalizeDate(a.at)?.getTime() || 0;
          const bTime = normalizeDate(b.at)?.getTime() || 0;
          return bTime - aTime;
        }),
    [items],
  );

  const roomLabel = titleCase(roomType).toLowerCase();

  return (
    <div className="mt-4 space-y-5 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Maintenance History</h3>
          <p className="mt-0.5 text-xs text-gray-500">A record of care for your {roomLabel}.</p>
        </div>
        <button
          type="button"
          onClick={onAddEvent}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Add event
        </button>
      </div>

      {loading ? <div className="text-sm text-gray-500">Loading timeline...</div> : null}

      {!loading && timelineEvents.length === 0 ? (
        <div className="relative">
          <div className="absolute bottom-0 left-5 top-0 w-px border-l-2 border-dashed border-gray-200" />

          <button
            type="button"
            onClick={onAddEvent}
            className="group relative ml-12 flex w-full flex-col items-center rounded-xl border-2 border-dashed border-gray-200 p-6 text-center transition-all hover:border-teal-300 hover:bg-teal-50/20"
          >
            <div className="absolute left-[-34px] top-8 h-3 w-3 rounded-full border-2 border-white bg-gray-200 ring-2 ring-gray-200" />

            <div className="mb-3 rounded-full bg-gray-100 p-3 transition-colors group-hover:bg-teal-100">
              <Camera className="h-5 w-5 text-gray-400 transition-colors group-hover:text-teal-600" />
            </div>
            <p className="text-sm font-semibold text-gray-700 transition-colors group-hover:text-teal-700">
              Your {roomLabel}&apos;s first moment
            </p>
            <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-gray-400">
              Record a repair, renovation, or inspection to start your maintenance history.
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-teal-600 transition-colors group-hover:text-teal-700">
              <Plus className="h-3 w-3" />
              Add first event
            </span>
          </button>
        </div>
      ) : null}

      {!loading && timelineEvents.length > 0 ? (
        <div className="relative">
          <div className="absolute bottom-2 left-5 top-2 w-px bg-gray-200" />

          <div className="space-y-4">
            {timelineEvents.map((event, index) => {
              const eventConfig = EVENT_TYPE_CONFIG[event.type] || EVENT_TYPE_CONFIG.DEFAULT;
              const EventIcon = eventConfig.icon;
              const eventDate = normalizeDate(event.at);
              const eventLabel = eventConfig.label;
              const { beforePhoto, afterPhoto } = getEventPhotos(event);

              return (
                <motion.div
                  key={`${event.type}-${event.id}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.06 }}
                  className="flex items-start gap-4"
                >
                  <div className={`mt-4 h-3 w-3 flex-shrink-0 rounded-full border-2 ring-2 ring-white ${eventConfig.nodeColor}`} />

                  <div className="flex-1 rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`rounded-lg p-1.5 ${eventConfig.iconBg}`}>
                          <EventIcon className={`h-3.5 w-3.5 ${eventConfig.iconColor}`} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{event.title}</p>
                          <p className="text-[10px] text-gray-400">
                            {eventDate ? format(eventDate, 'MMM d, yyyy') : '-'} · {eventLabel}
                            {event.status ? ` · ${titleCase(String(event.status).replace(/_/g, ' '))}` : ''}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={onAddEvent}
                        className="text-gray-300 transition-colors hover:text-gray-500"
                        aria-label="Add another event"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {event?.meta?.notes ? <p className="mt-2 text-xs leading-relaxed text-gray-500">{String(event.meta.notes)}</p> : null}

                    {beforePhoto || afterPhoto ? (
                      <div className="mt-3 flex gap-2">
                        {beforePhoto ? (
                          <div className="relative">
                            <img src={beforePhoto} alt="Before" className="h-16 w-24 rounded-lg object-cover" />
                            <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-bold text-white">
                              Before
                            </span>
                          </div>
                        ) : null}

                        {afterPhoto ? (
                          <div className="relative">
                            <img src={afterPhoto} alt="After" className="h-16 w-24 rounded-lg object-cover" />
                            <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-bold text-white">
                              After
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onAddEvent}
            className="mt-4 ml-12 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 py-3 text-sm text-gray-400 transition-all hover:border-teal-300 hover:bg-teal-50/20 hover:text-teal-600"
          >
            <Plus className="h-4 w-4" />
            Add another event
          </button>
        </div>
      ) : null}
    </div>
  );
}
