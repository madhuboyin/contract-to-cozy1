// apps/frontend/src/components/rooms/RoomChecklistPanel.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CheckCircle2, CheckSquare, ChevronDown, Plus, Sparkles, Trash2 } from 'lucide-react';

import {
  createRoomChecklistItem,
  deleteRoomChecklistItem,
  listRoomChecklistItems,
  updateRoomChecklistItem,
  type RoomChecklistItemDTO,
} from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Props {
  propertyId: string;
  roomId: string;
  roomType:
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
  bedroomKind?: 'MASTER' | 'KIDS' | 'GUEST' | null;
  onMutated?: () => Promise<void> | void;
}

type ChecklistSeed = {
  title: string;
  frequency: RoomChecklistItemDTO['frequency'];
};

const FREQUENCY_ORDER: RoomChecklistItemDTO['frequency'][] = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEASONAL', 'ONCE'];

const FREQUENCY_LABELS: Record<RoomChecklistItemDTO['frequency'], string> = {
  ONCE: 'One-time',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  SEASONAL: 'Seasonal',
};

function normTitle(text: string) {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function uniqueByTitle(existing: RoomChecklistItemDTO[], seeds: ChecklistSeed[]) {
  const seen = new Set(existing.filter((item) => item?.title).map((item) => normTitle(item.title)));
  return seeds.filter((seed) => !seen.has(normTitle(seed.title)));
}

export default function RoomChecklistPanel({ propertyId, roomId, roomType, bedroomKind, onMutated }: Props) {
  const [items, setItems] = useState<RoomChecklistItemDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);

  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskFrequency, setNewTaskFrequency] = useState<RoomChecklistItemDTO['frequency']>('ONCE');
  const [completedOpen, setCompletedOpen] = useState(false);

  async function notifyMutated() {
    await onMutated?.();
  }

  async function load() {
    setLoading(true);
    try {
      const raw = await listRoomChecklistItems(propertyId, roomId);
      const data = (raw as any)?.data ?? raw;
      setItems((Array.isArray(data) ? data : []).filter(Boolean));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, roomId]);

  const placeholder =
    roomType === 'KITCHEN'
      ? 'e.g., Clean hood filter'
      : roomType === 'LIVING'
        ? 'e.g., Vacuum under sofa'
        : roomType === 'DINING'
          ? 'e.g., Wipe table weekly'
          : roomType === 'LAUNDRY'
            ? 'e.g., Clean lint trap'
            : roomType === 'GARAGE'
              ? 'e.g., Test garage door reverse'
              : roomType === 'OFFICE'
                ? 'e.g., Cable tidy'
                : roomType === 'BATHROOM'
                  ? 'e.g., Clean exhaust fan cover'
                  : roomType === 'BASEMENT'
                    ? 'e.g., Check for damp spots'
                    : roomType === 'BEDROOM'
                      ? bedroomKind === 'MASTER'
                        ? 'e.g., Change sheets'
                        : bedroomKind === 'KIDS'
                          ? 'e.g., Organize toys'
                          : bedroomKind === 'GUEST'
                            ? 'e.g., Refresh linens'
                            : 'e.g., Make bed'
                      : 'e.g., Dust vents';

  const recommended: ChecklistSeed[] = useMemo(() => {
    if (roomType === 'KITCHEN') {
      return [
        { title: 'Wipe counters and backsplash', frequency: 'WEEKLY' },
        { title: 'Clean range hood filter', frequency: 'MONTHLY' },
        { title: 'Run dishwasher cleaner', frequency: 'MONTHLY' },
        { title: 'Check under-sink for leaks', frequency: 'MONTHLY' },
      ];
    }

    if (roomType === 'LIVING') {
      return [
        { title: 'Vacuum under sofa and chairs', frequency: 'WEEKLY' },
        { title: 'Dust vents and baseboards', frequency: 'MONTHLY' },
        { title: 'Check smoke/CO detector nearby', frequency: 'SEASONAL' },
      ];
    }

    if (roomType === 'DINING') {
      return [
        { title: 'Wipe table and chairs', frequency: 'WEEKLY' },
        { title: 'Check chair screws for wobble', frequency: 'SEASONAL' },
        { title: 'Clean light fixture', frequency: 'SEASONAL' },
      ];
    }

    if (roomType === 'LAUNDRY') {
      return [
        { title: 'Clean lint trap', frequency: 'WEEKLY' },
        { title: 'Run washer drum clean cycle', frequency: 'MONTHLY' },
        { title: 'Inspect washer hoses', frequency: 'SEASONAL' },
        { title: 'Check dryer vent airflow', frequency: 'SEASONAL' },
      ];
    }

    if (roomType === 'GARAGE') {
      return [
        { title: 'Test garage door auto-reverse', frequency: 'SEASONAL' },
        { title: 'Check for leaks near water heater', frequency: 'MONTHLY' },
        { title: 'Organize chemicals safely', frequency: 'SEASONAL' },
      ];
    }

    if (roomType === 'OFFICE') {
      return [
        { title: 'Dust electronics screens and vents', frequency: 'MONTHLY' },
        { title: 'Cable tidy and desk reset', frequency: 'MONTHLY' },
        { title: 'Check surge protector', frequency: 'SEASONAL' },
      ];
    }

    if (roomType === 'BATHROOM') {
      return [
        { title: 'Clean exhaust fan cover', frequency: 'SEASONAL' },
        { title: 'Check under-sink for leaks', frequency: 'MONTHLY' },
        { title: 'Test GFCI outlets', frequency: 'SEASONAL' },
      ];
    }

    if (roomType === 'BASEMENT') {
      return [
        { title: 'Check for damp spots and musty smell', frequency: 'MONTHLY' },
        { title: 'Test sump pump', frequency: 'SEASONAL' },
        { title: 'Inspect foundation cracks', frequency: 'SEASONAL' },
      ];
    }

    if (roomType === 'BEDROOM') {
      if (bedroomKind === 'MASTER') {
        return [
          { title: 'Change sheets', frequency: 'WEEKLY' },
          { title: 'Rotate mattress', frequency: 'SEASONAL' },
          { title: 'Dust fan and vents', frequency: 'MONTHLY' },
        ];
      }

      if (bedroomKind === 'KIDS') {
        return [
          { title: 'Organize toys', frequency: 'MONTHLY' },
          { title: 'Wash bedding', frequency: 'WEEKLY' },
          { title: 'Check outlet covers and cords', frequency: 'SEASONAL' },
        ];
      }

      if (bedroomKind === 'GUEST') {
        return [
          { title: 'Refresh linens and towels', frequency: 'SEASONAL' },
          { title: 'Dust surfaces and vents', frequency: 'MONTHLY' },
          { title: 'Air out room', frequency: 'MONTHLY' },
        ];
      }

      return [
        { title: 'Make bed and quick reset', frequency: 'WEEKLY' },
        { title: 'Wash bedding', frequency: 'WEEKLY' },
      ];
    }

    return [
      { title: 'Dust vents', frequency: 'MONTHLY' },
      { title: 'Quick reset and declutter', frequency: 'WEEKLY' },
    ];
  }, [roomType, bedroomKind]);

  const recommendedToAdd = useMemo(() => uniqueByTitle(items, recommended), [items, recommended]);

  const pendingTasks = useMemo(() => items.filter((item) => item.status !== 'DONE'), [items]);
  const completedTasks = useMemo(() => items.filter((item) => item.status === 'DONE'), [items]);

  const groupedPending = useMemo(() => {
    const groups: Partial<Record<RoomChecklistItemDTO['frequency'], RoomChecklistItemDTO[]>> = {};

    for (const item of pendingTasks) {
      const key = item.frequency || 'ONCE';
      groups[key] = groups[key] || [];
      groups[key]!.push(item);
    }

    for (const key of Object.keys(groups) as RoomChecklistItemDTO['frequency'][]) {
      groups[key] = (groups[key] || []).slice().sort((a, b) => a.title.localeCompare(b.title));
    }

    return groups;
  }, [pendingTasks]);

  const orderedGroups = useMemo(
    () => FREQUENCY_ORDER.filter((frequency) => (groupedPending[frequency] || []).length > 0),
    [groupedPending],
  );

  async function addTask() {
    const title = newTaskText.trim();
    if (!title) return;

    setMutating(true);
    try {
      const raw = await createRoomChecklistItem(propertyId, roomId, {
        title,
        frequency: newTaskFrequency,
      });
      const created = (raw as any)?.data ?? raw;
      if (created) {
        setItems((prev) => [created, ...prev].filter(Boolean));
        setNewTaskText('');
        setNewTaskFrequency('ONCE');
      }
      await notifyMutated();
    } finally {
      setMutating(false);
    }
  }

  async function addRecommendedTasks() {
    if (recommendedToAdd.length === 0) return;

    setMutating(true);
    try {
      const createdItems: RoomChecklistItemDTO[] = [];

      for (const seed of recommendedToAdd) {
        // eslint-disable-next-line no-await-in-loop
        const raw = await createRoomChecklistItem(propertyId, roomId, {
          title: seed.title,
          frequency: seed.frequency,
        });

        const created = (raw as any)?.data ?? raw;
        if (created) createdItems.push(created);
      }

      if (createdItems.length > 0) {
        setItems((prev) => [...createdItems, ...prev].filter(Boolean));
      }

      await notifyMutated();
    } finally {
      setMutating(false);
    }
  }

  async function toggleTask(item: RoomChecklistItemDTO) {
    setMutating(true);
    try {
      const nextStatus = item.status === 'DONE' ? 'OPEN' : 'DONE';
      const raw = await updateRoomChecklistItem(propertyId, roomId, item.id, { status: nextStatus });
      const updated = (raw as any)?.data ?? raw;
      if (updated) {
        setItems((prev) => prev.map((entry) => (entry.id === item.id ? updated : entry)));
      }
      await notifyMutated();
    } finally {
      setMutating(false);
    }
  }

  async function deleteTask(item: RoomChecklistItemDTO) {
    setMutating(true);
    try {
      await deleteRoomChecklistItem(propertyId, roomId, item.id);
      setItems((prev) => prev.filter((entry) => entry.id !== item.id));
      await notifyMutated();
    } finally {
      setMutating(false);
    }
  }

  return (
    <div className="mt-4 space-y-5 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder={placeholder}
          value={newTaskText}
          onChange={(event) => setNewTaskText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void addTask();
            }
          }}
          disabled={mutating}
          className="h-11 flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-teal-400 focus:ring-1 focus:ring-teal-300 disabled:opacity-60"
        />

        <select
          value={newTaskFrequency}
          onChange={(event) => setNewTaskFrequency(event.target.value as RoomChecklistItemDTO['frequency'])}
          disabled={mutating}
          className="h-11 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-600 outline-none transition-colors focus:border-teal-400"
        >
          {FREQUENCY_ORDER.map((frequency) => (
            <option key={frequency} value={frequency}>
              {FREQUENCY_LABELS[frequency]}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => {
            void addTask();
          }}
          disabled={mutating || !newTaskText.trim()}
          className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      {recommendedToAdd.length > 0 ? (
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-teal-200/60 bg-teal-50/50 px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-600" />
            <div>
              <p className="text-sm font-semibold text-teal-800">Recommended for this room</p>
              <p className="text-xs text-teal-600">Adds a starter set based on room type. You can edit anytime.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              void addRecommendedTasks();
            }}
            disabled={mutating}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-teal-300 px-3 py-1.5 text-sm font-semibold text-teal-700 transition-colors hover:bg-teal-100 disabled:opacity-50"
          >
            Add recommended
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-1 text-xs text-gray-400">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          Recommended tasks added
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">Loading checklist...</div>
      ) : orderedGroups.length === 0 && completedTasks.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <div className="mb-3 rounded-full bg-teal-50 p-3">
            <CheckSquare className="h-6 w-6 text-teal-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700">No tasks yet</p>
          <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-gray-400">
            Add your first task above or use recommended tasks to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {orderedGroups.map((frequency) => {
            const tasks = groupedPending[frequency] || [];

            return (
              <div key={frequency} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{FREQUENCY_LABELS[frequency]}</span>
                  <div className="h-px flex-1 bg-gray-100" />
                  <span className="text-[10px] text-gray-400">{tasks.length}</span>
                </div>

                <div className="space-y-1.5">
                  <AnimatePresence>
                    {tasks.map((task) => (
                      <motion.div
                        key={task.id}
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 transition-all hover:border-gray-300"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            void toggleTask(task);
                          }}
                          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 border-gray-300 transition-colors hover:border-teal-400"
                          aria-label="Mark task complete"
                        />

                        <span className="flex-1 text-sm text-gray-700">{task.title}</span>

                        <span className="text-[10px] font-medium text-gray-400">{FREQUENCY_LABELS[task.frequency]}</span>

                        <button
                          type="button"
                          onClick={() => {
                            void deleteTask(task);
                          }}
                          className="text-gray-300 transition-colors hover:text-red-400"
                          aria-label="Delete task"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}

          {completedTasks.length > 0 ? (
            <Collapsible open={completedOpen} onOpenChange={setCompletedOpen}>
              <CollapsibleTrigger className="flex w-full items-center gap-2 text-xs text-gray-400 transition-colors hover:text-gray-600">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                Completed ({completedTasks.length})
                <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${completedOpen ? 'rotate-180' : 'rotate-0'}`} />
              </CollapsibleTrigger>

              <CollapsibleContent className="mt-2 space-y-1.5">
                {completedTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5 opacity-70">
                    <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 border-teal-600 bg-teal-600">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                    <span className="flex-1 text-sm text-gray-500 line-through">{task.title}</span>
                    <button
                      type="button"
                      onClick={() => {
                        void toggleTask(task);
                      }}
                      className="text-xs text-teal-600 transition-colors hover:underline"
                    >
                      Undo
                    </button>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      )}
    </div>
  );
}
