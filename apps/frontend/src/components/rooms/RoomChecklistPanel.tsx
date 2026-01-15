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
import { CheckCircle2, Circle, Plus, X } from 'lucide-react';

interface Props {
  propertyId: string;
  roomId: string;
  roomType: 'KITCHEN' | 'LIVING' | 'OTHER';
}

function unwrapItems(resp: any): RoomChecklistItemDTO[] {
  if (Array.isArray(resp)) return resp;
  if (resp?.items && Array.isArray(resp.items)) return resp.items;
  if (resp?.data?.items && Array.isArray(resp.data.items)) return resp.data.items;
  return [];
}

function unwrapItem(resp: any): RoomChecklistItemDTO | null {
  if (!resp) return null;
  if (resp?.id) return resp as RoomChecklistItemDTO;
  if (resp?.item?.id) return resp.item as RoomChecklistItemDTO;
  if (resp?.data?.item?.id) return resp.data.item as RoomChecklistItemDTO;
  return null;
}

export default function RoomChecklistPanel({ propertyId, roomId, roomType }: Props) {
  const [items, setItems] = useState<RoomChecklistItemDTO[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(false);

  const placeholder = useMemo(() => {
    if (roomType === 'KITCHEN') return 'Add a checklist item… (e.g., Clean hood filter)';
    if (roomType === 'LIVING') return 'Add a checklist item… (e.g., Vacuum under sofa)';
    return 'Add a checklist item…';
  }, [roomType]);

  async function load() {
    setLoading(true);
    try {
      const resp = await listRoomChecklistItems(propertyId, roomId);
      setItems(unwrapItems(resp));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!propertyId || !roomId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, roomId]);

  async function addItem() {
    const title = newLabel.trim();
    if (!title) return;

    setNewLabel('');
    const resp = await createRoomChecklistItem(propertyId, roomId, {
      title,
      frequency: 'ONCE',
    });

    const created = unwrapItem(resp);
    if (!created) {
      await load(); // fallback to keep UI correct
      return;
    }

    setItems((prev) => [created, ...prev]);
  }

  async function toggle(item: RoomChecklistItemDTO) {
    const nextStatus = item.status === 'DONE' ? 'OPEN' : 'DONE';
    const resp = await updateRoomChecklistItem(propertyId, roomId, item.id, { status: nextStatus });

    const updated = unwrapItem(resp);
    if (!updated) {
      await load();
      return;
    }

    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
  }

  async function removeItem(item: RoomChecklistItemDTO) {
    const ok = confirm(`Delete "${item.title}"?`);
    if (!ok) return;

    await deleteRoomChecklistItem(propertyId, roomId, item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      addItem();
    }
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">Micro-checklist</div>
          <div className="text-xs opacity-70 mt-1">Small recurring actions. No AI required.</div>
        </div>
      </div>

      <div className="mt-4 flex gap-2" onKeyDown={onKeyDown}>
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button onClick={addItem} disabled={!newLabel.trim()} aria-label="Add checklist item">
          <Plus size={18} />
        </Button>
      </div>

      {loading ? (
        <div className="mt-4 text-sm opacity-70">Loading…</div>
      ) : items.length === 0 ? (
        <div className="mt-4 text-sm opacity-70">No checklist items yet.</div>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-black/10 p-3">
              <button onClick={() => toggle(item)} className="flex items-center gap-3 text-left">
                {item.status === 'DONE' ? (
                  <CheckCircle2 className="text-emerald-600" />
                ) : (
                  <Circle className="text-muted-foreground" />
                )}
                <div>
                  <div className={`text-sm ${item.status === 'DONE' ? 'line-through opacity-60' : ''}`}>
                    {item.title}
                  </div>
                  <div className="text-xs opacity-60">
                    {item.frequency || 'ONCE'}
                    {item.lastCompletedAt ? ` • last: ${new Date(item.lastCompletedAt).toLocaleDateString()}` : ''}
                  </div>
                </div>
              </button>

              <button
                onClick={() => removeItem(item)}
                className="opacity-60 hover:opacity-100"
                aria-label="Delete checklist item"
                title="Delete"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 text-xs opacity-60">Tip: Cmd/Ctrl + Enter to add.</div>
    </div>
  );
}
