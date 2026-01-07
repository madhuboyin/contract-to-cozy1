// apps/frontend/src/app/(dashboard)/dashboard/components/claims/ClaimTimeline.tsx
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

function typeBadge(type?: string) {
  const t = type || 'EVENT';
  const cls =
    t === 'NOTE'
      ? 'bg-gray-50 text-gray-700 border-gray-200'
      : t === 'STATUS_CHANGE'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : t === 'DOCUMENT_ADDED'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-gray-50 text-gray-700 border-gray-200';

  return (
    <span className={['rounded-full border px-2 py-0.5 text-[11px] font-semibold', cls].join(' ')}>
      {t}
    </span>
  );
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
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
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

  function onNoteKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl + Enter to submit
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      addNote();
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-white p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-gray-700">Add note</div>
          <div className="text-[11px] text-gray-500">Ctrl/⌘ + Enter to add</div>
        </div>

        <textarea
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={onNoteKeyDown}
          placeholder="Add claim update, phone call notes, next steps…"
          disabled={busy}
        />

        <div className="mt-2 flex justify-end">
          <button
            className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-800 disabled:opacity-60"
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
          {events.map((ev: ClaimTimelineEventDTO & any) => {
            // If your DTO includes nested claimDocument->document->fileUrl, we’ll render it.
            const fileUrl =
              ev?.claimDocument?.document?.fileUrl ||
              ev?.claimDocument?.document?.presignedUrl || // if you ever add it
              null;

            const docLabel =
              ev?.claimDocument?.title ||
              ev?.claimDocument?.document?.name ||
              ev?.title ||
              'Document';

            return (
              <div key={ev.id} className="rounded-lg border bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {typeBadge(ev.type)}
                      <div className="truncate text-sm font-semibold text-gray-900">
                        {ev.title || ev.type}
                      </div>
                    </div>

                    {ev.description ? (
                      <div className="mt-1 whitespace-pre-line text-sm text-gray-700">
                        {ev.description}
                      </div>
                    ) : null}

                    {fileUrl ? (
                      <div className="mt-2">
                        <a
                          className="text-xs font-medium text-emerald-700 hover:underline"
                          href={fileUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View: {docLabel}
                        </a>
                      </div>
                    ) : ev.claimDocumentId ? (
                      <div className="mt-2 text-xs text-gray-500">
                        Document attached
                      </div>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-xs text-gray-500">
                    {fmt(ev.occurredAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
