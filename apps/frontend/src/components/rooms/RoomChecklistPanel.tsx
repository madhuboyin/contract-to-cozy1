// apps/frontend/src/components/rooms/RoomChecklistPanel.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  listRoomChecklistItems,
  createRoomChecklistItem,
  updateRoomChecklistItem,
  deleteRoomChecklistItem,
  type RoomChecklistItemDTO,
} from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, Plus, Trash2, Sparkles } from 'lucide-react';

interface Props {
  propertyId: string;
  roomId: string;
  roomType: 'KITCHEN' | 'LIVING' | 'BEDROOM' | 'DINING' | 'LAUNDRY' | 'GARAGE' | 'OFFICE' | 'OTHER';
  bedroomKind?: 'MASTER' | 'KIDS' | 'GUEST' | null;
}

function Divider() {
  return <div className="h-px bg-black/10" />;
}

type ChecklistSeed = { title: string; frequency: RoomChecklistItemDTO['frequency'] };

function uniqueByTitle(existing: RoomChecklistItemDTO[], seeds: ChecklistSeed[]) {
  const seen = new Set(existing.map((i) => i.title.trim().toLowerCase()));
  return seeds.filter((s) => !seen.has(s.title.trim().toLowerCase()));
}

export default function RoomChecklistPanel({ propertyId, roomId, roomType, bedroomKind }: Props) {
  const [items, setItems] = useState<RoomChecklistItemDTO[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await listRoomChecklistItems(propertyId, roomId);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, roomId]);

  async function addItem() {
    const title = newLabel.trim();
    if (!title) return;

    setMutating(true);
    try {
      const created = await createRoomChecklistItem(propertyId, roomId, {
        title,
        frequency: 'ONCE',
      });
      setItems((prev) => [created, ...prev]);
      setNewLabel('');
    } finally {
      setMutating(false);
    }
  }

  async function toggle(item: RoomChecklistItemDTO) {
    setMutating(true);
    try {
      const nextStatus = item.status === 'DONE' ? 'OPEN' : 'DONE';
      const updated = await updateRoomChecklistItem(propertyId, roomId, item.id, { status: nextStatus });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } finally {
      setMutating(false);
    }
  }

  async function removeItem(item: RoomChecklistItemDTO) {
    const ok = confirm(`Delete "${item.title}"?`);
    if (!ok) return;

    setMutating(true);
    try {
      await deleteRoomChecklistItem(propertyId, roomId, item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } finally {
      setMutating(false);
    }
  }

  const placeholder =
    roomType === 'KITCHEN'
      ? 'e.g., Clean hood filter'
      : roomType === 'LIVING'
        ? 'e.g., Vacuum under sofa'
        : roomType === 'DINING'
          ? 'e.g., Wipe table'
          : roomType === 'LAUNDRY'
            ? 'e.g., Clean lint trap'
            : roomType === 'GARAGE'
              ? 'e.g., Test garage door auto-reverse'
              : roomType === 'OFFICE'
                ? 'e.g., Cable tidy'
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
        { title: 'Wipe counters + backsplash', frequency: 'WEEKLY' },
        { title: 'Clean range hood filter', frequency: 'MONTHLY' },
        { title: 'Run dishwasher cleaner', frequency: 'MONTHLY' },
        { title: 'Check under-sink for leaks', frequency: 'MONTHLY' },
      ];
    }

    if (roomType === 'LIVING') {
      return [
        { title: 'Vacuum under sofa / chairs', frequency: 'WEEKLY' },
        { title: 'Dust vents + baseboards', frequency: 'MONTHLY' },
        { title: 'Check smoke/CO detector nearby', frequency: 'SEASONAL' },
      ];
    }

    if (roomType === 'DINING') {
      return [
        { title: 'Wipe table + chairs', frequency: 'WEEKLY' },
        { title: 'Check chair screws / wobble', frequency: 'SEASONAL' },
        { title: 'Clean chandelier / pendant', frequency: 'SEASONAL' },
        { title: 'Check smoke/CO detector nearby', frequency: 'SEASONAL' },
      ];
    }

    if (roomType === 'LAUNDRY') {
      return [
        { title: 'Clean lint trap (weekly / heavy loads)', frequency: 'WEEKLY' },
        { title: 'Run washer drum cleaning cycle', frequency: 'MONTHLY' },
        { title: 'Check washer hoses for bulges/leaks', frequency: 'SEASONAL' },
        { title: 'Clean dryer vent', frequency: 'SEASONAL' },
      ];
    }

    if (roomType === 'GARAGE') {
      return [
        { title: 'Test garage door auto-reverse', frequency: 'SEASONAL' },
        { title: 'Replace opener batteries (remotes/keypad)', frequency: 'SEASONAL' },
        { title: 'Check for leaks near water heater', frequency: 'MONTHLY' },
        { title: 'Organize chemicals safely', frequency: 'SEASONAL' },
      ];
    }

    if (roomType === 'OFFICE') {
      return [
        { title: 'Dust electronics (vents/fans)', frequency: 'MONTHLY' },
        { title: 'Cable tidy / re-route hazards', frequency: 'MONTHLY' },
        { title: 'Clean chair casters', frequency: 'SEASONAL' },
        { title: 'Check surge protector health', frequency: 'SEASONAL' },
      ];
    }

    if (roomType === 'BEDROOM') {
      if (bedroomKind === 'MASTER') {
        return [
          { title: 'Change sheets', frequency: 'WEEKLY' },
          { title: 'Flip/rotate mattress', frequency: 'SEASONAL' },
          { title: 'Dust ceiling fan + vents', frequency: 'MONTHLY' },
          { title: 'Review nightstand meds/first-aid', frequency: 'SEASONAL' },
        ];
      }
      if (bedroomKind === 'KIDS') {
        return [
          { title: 'Organize toys + donate 5 items', frequency: 'MONTHLY' },
          { title: 'Wash bedding', frequency: 'WEEKLY' },
          { title: 'Check outlet covers / cords', frequency: 'SEASONAL' },
          { title: 'Wipe high-touch surfaces', frequency: 'WEEKLY' },
        ];
      }
      if (bedroomKind === 'GUEST') {
        return [
          { title: 'Refresh linens + towels', frequency: 'SEASONAL' },
          { title: 'Dust surfaces + vents', frequency: 'MONTHLY' },
          { title: 'Run room for 10 mins (air out)', frequency: 'MONTHLY' },
        ];
      }
      return [
        { title: 'Make bed + quick reset', frequency: 'WEEKLY' },
        { title: 'Dust fan + vents', frequency: 'MONTHLY' },
        { title: 'Wash bedding', frequency: 'WEEKLY' },
      ];
    }

    return [
      { title: 'Dust vents', frequency: 'MONTHLY' },
      { title: 'Quick reset / declutter', frequency: 'WEEKLY' },
    ];
  }, [roomType, bedroomKind]);

  const recommendedToAdd = useMemo(() => uniqueByTitle(items, recommended), [items, recommended]);

  async function addRecommended() {
    if (recommendedToAdd.length === 0) return;

    setMutating(true);
    try {
      const created: RoomChecklistItemDTO[] = [];
      for (const seed of recommendedToAdd) {
        // eslint-disable-next-line no-await-in-loop
        const it = await createRoomChecklistItem(propertyId, roomId, {
          title: seed.title,
          frequency: seed.frequency,
        });
        created.push(it);
      }
      setItems((prev) => [...created, ...prev]);
    } finally {
      setMutating(false);
    }
  }

  const showSeedCallout = !loading && items.length === 0 && recommendedToAdd.length > 0;

  return (
    <div className="rounded-2xl border border-black/10 bg-white shadow-sm">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Micro-checklist</div>
            <div className="text-xs text-black/50 mt-0.5">Small recurring actions. No AI required.</div>
          </div>
        </div>

        {/* Seed defaults UX (only when empty) */}
        {showSeedCallout && (
          <div className="mt-4 rounded-xl border border-black/10 bg-black/[0.02] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-black/60" />
                  <div className="text-sm font-medium text-black/80">Add recommended checklist</div>
                </div>
                <div className="text-xs text-black/50 mt-1">
                  Starter set based on room type{roomType === 'BEDROOM' ? ' + bedroom kind' : ''}. You can edit anytime.
                </div>
              </div>

              <Button
                variant="outline"
                onClick={addRecommended}
                disabled={mutating || recommendedToAdd.length === 0}
                className="rounded-xl"
              >
                Add ({recommendedToAdd.length})
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {recommended.map((r) => (
                <span
                  key={`${r.frequency}:${r.title}`}
                  className="text-xs rounded-full border border-black/10 bg-white px-2 py-1 text-black/70"
                >
                  {r.title} · {r.frequency}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* If not empty, still allow “top-up” recommended items (compact) */}
        {!showSeedCallout && recommendedToAdd.length > 0 && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-3">
            <div className="text-xs text-black/60">
              {recommendedToAdd.length} recommended item{recommendedToAdd.length === 1 ? '' : 's'} available
            </div>
            <Button
              variant="outline"
              onClick={addRecommended}
              disabled={mutating}
              className="rounded-xl"
              title="Add recommended items not already in your checklist"
            >
              Add ({recommendedToAdd.length})
            </Button>
          </div>
        )}

        {/* Add row */}
        <div className="mt-4 flex gap-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={placeholder}
            className="h-10 rounded-xl border-black/10"
          />
          <Button onClick={addItem} disabled={!newLabel.trim() || mutating} className="rounded-xl" title="Add item">
            <Plus size={18} />
          </Button>
        </div>

        {/* Grouped list */}
        <div className="mt-4 rounded-xl border border-black/10 bg-black/[0.02]">
          {loading ? (
            <div className="p-4 text-sm text-black/60">Loading…</div>
          ) : items.length === 0 ? (
            <div className="p-4 text-sm text-black/60">No checklist items yet.</div>
          ) : (
            <div>
              {items.map((item, idx) => (
                <div key={item.id}>
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <button
                      onClick={() => toggle(item)}
                      disabled={mutating}
                      className="flex items-center gap-3 text-left disabled:opacity-60"
                    >
                      {item.status === 'DONE' ? (
                        <CheckCircle2 className="h-5 w-5 text-black/70" />
                      ) : (
                        <Circle className="h-5 w-5 text-black/40" />
                      )}

                      <div>
                        <div
                          className={`text-sm ${
                            item.status === 'DONE' ? 'line-through text-black/50' : 'text-black/80'
                          }`}
                        >
                          {item.title}
                        </div>
                        <div className="text-xs text-black/50">
                          {item.frequency || 'ONCE'}
                          {item.lastCompletedAt ? ` • last: ${new Date(item.lastCompletedAt).toLocaleDateString()}` : ''}
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => removeItem(item)}
                      disabled={mutating}
                      className="rounded-lg p-2 hover:bg-black/5 disabled:opacity-60"
                      title="Delete"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-black/50" />
                    </button>
                  </div>
                  {idx !== items.length - 1 && <Divider />}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 text-xs text-black/50">Tip: keep 3–6 items per room. Consistency beats volume.</div>
      </div>
    </div>
  );
}
