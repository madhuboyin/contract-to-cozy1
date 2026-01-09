// apps/frontend/src/app/(dashboard)/dashboard/components/incidents/IncidentAckControls.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { acknowledgeIncident } from '@/app/(dashboard)/dashboard/properties/[id]/incidents/incidentsApi';

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function toLocalInputValue(d: Date) {
  // Format for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export default function IncidentAckControls({
  propertyId,
  incidentId,
  disabled,
  onDone,
}: {
  propertyId: string;
  incidentId: string;
  disabled?: boolean;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState<'ACK' | 'DISMISS' | 'SNOOZE' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [note, setNote] = useState('');
  const [showSnooze, setShowSnooze] = useState(false);

  const defaultSnooze = useMemo(() => addMinutes(new Date(), 24 * 60), []);
  const [snoozeUntilLocal, setSnoozeUntilLocal] = useState(toLocalInputValue(defaultSnooze));

  async function runAck(args: { type: 'ACKNOWLEDGED' | 'DISMISSED' | 'SNOOZED'; snoozeUntil?: string | null }) {
    setErr(null);
    setBusy(args.type === 'ACKNOWLEDGED' ? 'ACK' : args.type === 'DISMISSED' ? 'DISMISS' : 'SNOOZE');

    try {
      await acknowledgeIncident({
        propertyId,
        incidentId,
        input: {
          type: args.type,
          note: note?.trim() ? note.trim() : null,
          snoozeUntil: args.snoozeUntil ?? null,
        },
      });

      // Reset some UI state
      setShowSnooze(false);

      setNote('');
      onDone?.();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to update incident');
    } finally {
      setBusy(null);
    }
  }

  const commonBtn =
    'rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50';

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Noise controls</h3>
          <p className="mt-1 text-xs text-slate-600">
            Acknowledge to mark as seen, dismiss to suppress, or snooze to hide until a time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className={commonBtn}
            disabled={disabled || !!busy}
            onClick={() => runAck({ type: 'ACKNOWLEDGED', snoozeUntil: null })}
            title="Mark as acknowledged"
          >
            {busy === 'ACK' ? 'Acknowledging…' : 'Acknowledge'}
          </button>

          <button
            className={commonBtn}
            disabled={disabled || !!busy}
            onClick={() => setShowSnooze((v) => !v)}
            title="Temporarily suppress"
          >
            Snooze…
          </button>

          <button
            className="rounded-lg border bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            disabled={disabled || !!busy}
            onClick={() => runAck({ type: 'DISMISSED', snoozeUntil: null })}
            title="Dismiss and suppress this incident"
          >
            {busy === 'DISMISS' ? 'Dismissing…' : 'Dismiss'}
          </button>
        </div>
      </div>

      {err ? <div className="mt-3 rounded-lg border bg-red-50 p-2 text-sm text-red-700">{err}</div> : null}

      {/* Optional note */}
      <div className="mt-3">
        <label className="text-xs font-semibold text-slate-700">Note (optional)</label>
        <textarea
          className="mt-1 w-full rounded-lg border bg-white p-2 text-sm"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note for your future self…"
          disabled={disabled || !!busy}
        />
      </div>

      {/* Snooze panel */}
      {showSnooze ? (
        <div className="mt-3 rounded-lg border bg-slate-50 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-700">Snooze until</div>
              <div className="text-xs text-slate-600">Choose a quick duration or set a custom time.</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className={commonBtn}
                disabled={disabled || !!busy}
                onClick={() => {
                  const d = addMinutes(new Date(), 60);
                  setSnoozeUntilLocal(toLocalInputValue(d));
                }}
              >
                1h
              </button>
              <button
                className={commonBtn}
                disabled={disabled || !!busy}
                onClick={() => {
                  const d = addMinutes(new Date(), 6 * 60);
                  setSnoozeUntilLocal(toLocalInputValue(d));
                }}
              >
                6h
              </button>
              <button
                className={commonBtn}
                disabled={disabled || !!busy}
                onClick={() => {
                  const d = addMinutes(new Date(), 24 * 60);
                  setSnoozeUntilLocal(toLocalInputValue(d));
                }}
              >
                1d
              </button>
              <button
                className={commonBtn}
                disabled={disabled || !!busy}
                onClick={() => {
                  const d = addMinutes(new Date(), 7 * 24 * 60);
                  setSnoozeUntilLocal(toLocalInputValue(d));
                }}
              >
                7d
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-700">Custom date/time</label>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                value={snoozeUntilLocal}
                onChange={(e) => {setSnoozeUntilLocal(e.target.value); setErr(null);}}
                disabled={disabled || !!busy}
              />
              <div className="mt-1 text-xs text-slate-600">
                Uses your local timezone.
              </div>
            </div>

            <div className="flex gap-2">
              <button
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                disabled={disabled || !!busy}
                onClick={() => {
                  // datetime-local -> Date in local timezone
                  const dt = new Date(snoozeUntilLocal);
                  if (!Number.isFinite(dt.getTime())) {
                    setErr('Please choose a valid snooze time.');
                    return;
                  }
                  if (dt.getTime() <= Date.now() + 60_000) {
                    setErr('Snooze time must be at least 1 minute in the future.');
                    return;
                  }
                  runAck({ type: 'SNOOZED', snoozeUntil: dt.toISOString() });
                  
                }}
              >
                {busy === 'SNOOZE' ? 'Snoozing…' : 'Snooze'}
              </button>

              <button
                className={commonBtn}
                disabled={disabled || !!busy}
                onClick={() => setShowSnooze(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
