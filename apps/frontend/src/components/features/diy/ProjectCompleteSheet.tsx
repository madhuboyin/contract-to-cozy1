'use client';
import { useState } from 'react';
import { X, PartyPopper } from 'lucide-react';
import { api } from '@/lib/api/client';

interface Props {
  propertyId: string;
  projectId: string;
  onCompleted: (homeEventId: string) => void;
  onClose: () => void;
}

export default function ProjectCompleteSheet({ propertyId, projectId, onCompleted, onClose }: Props) {
  const [minutes, setMinutes] = useState('');
  const [costDollars, setCostDollars] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.completeDiyProject(propertyId, projectId, {
        actualMinutes: minutes ? parseInt(minutes) : undefined,
        actualMaterialCostCents: costDollars ? Math.round(parseFloat(costDollars) * 100) : undefined,
        notes: notes || undefined,
      });
      onCompleted(result.homeEventId);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to complete project');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div className="w-full rounded-t-2xl bg-white p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-yellow-500" />
            <p className="font-semibold">Project Complete!</p>
          </div>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-neutral-500">
          Great work! Log the actual time and cost so your property record stays accurate.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-neutral-600">How long did it take? (minutes)</span>
            <input
              type="number"
              min="1"
              placeholder="e.g. 90"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-neutral-600">What did materials cost? ($)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 45.00"
              value={costDollars}
              onChange={(e) => setCostDollars(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-neutral-600">Any notes? (optional)</span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-none rounded-xl border px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-green-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Confirm Completion'}
          </button>
        </form>
      </div>
    </div>
  );
}
