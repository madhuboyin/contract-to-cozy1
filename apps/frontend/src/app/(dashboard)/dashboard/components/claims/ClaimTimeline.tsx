'use client';

import React, { useMemo, useState } from 'react';
import type { ClaimDTO, ClaimTimelineEventDTO } from '@/types/claims.types';
import { addClaimTimelineEvent } from '@/app/(dashboard)/dashboard/properties/[id]/claims/claimsApi';
import { toast } from '@/components/ui/use-toast';

function fmt(ts?: string | null) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
}

export default function ClaimTimeline({
  propertyId,
  claim,
  onChanged,
}: {
  propertyId: string;
  claim: ClaimDTO;
  onChanged: () => Promise<void>;
}) {
  const events = useMemo(() => {
    return (claim.timelineEvents ?? [])
      .slice()
      .sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
      );
  }, [claim.timelineEvents]);

  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function addNote() {
    const text = note.trim();
    if (!text || busy) return;

    setBusy(true);
    try {
      await addClaimTimelineEvent(propertyId, claim.id, {
        type: 'NOTE',
        title: 'Note',
        description: text,
      });
      setNote('');
      await onChanged();
    } catch (e: any) {
      toast({
        title: 'Failed to add note',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-white p-3">
        <div className="text-xs font-semibold text-gray-700">Add note</div>
        <textarea
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add claim update, phone call notes, next steps…"
          disabled={busy}
        />
        <div className="mt-2 flex justify-end">
          <button
            className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-800"
            onClick={addNote}
            disabled={busy || !note.trim()}
          >
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="text-sm text-gray-600">No timeline events yet.</div>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => (
            <div key={ev.id} className="rounded-lg border bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">
                    {ev.title || ev.type}
                  </div>

                  {ev.description ? (
                    <div className="mt-1 whitespace-pre-line text-sm text-gray-700">
                      {ev.description}
                    </div>
                  ) : null}

                  {ev.claimDocumentId ? (
                    <div className="mt-2 text-xs text-gray-500">
                      Document ID: {ev.claimDocumentId}
                    </div>
                  ) : null}
                </div>

                <div className="shrink-0 text-xs text-gray-500">
                  {fmt(ev.occurredAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
