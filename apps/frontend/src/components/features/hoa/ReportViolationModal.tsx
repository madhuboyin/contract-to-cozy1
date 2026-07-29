'use client';
import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import type { HoaWorkType } from '@/types';
import { WORK_TYPE_LABELS } from './HoaUtils';

interface Props {
  open: boolean;
  onClose: () => void;
  onReported?: () => void;
  propertyId: string;
}

const WORK_TYPES = Object.keys(WORK_TYPE_LABELS) as HoaWorkType[];

export default function ReportViolationModal({ open, onClose, onReported, propertyId }: Props) {
  const [workType, setWorkType] = useState<HoaWorkType | ''>('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [cureDeadline, setCureDeadline] = useState('');
  const [fineAmount, setFineAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function reset() {
    setWorkType('');
    setSummary('');
    setDescription('');
    setCureDeadline('');
    setFineAmount('');
    setError('');
    setSubmitted(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (!summary.trim()) {
      setError('Give the violation a short summary.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.reportHoaViolation(propertyId, {
        workType: workType || undefined,
        summary: summary.trim(),
        description: description.trim() || undefined,
        cureDeadline: cureDeadline ? new Date(cureDeadline).toISOString() : undefined,
        fineAmountCents: fineAmount ? Math.round(parseFloat(fineAmount) * 100) : undefined,
      });
      setSubmitted(true);
      onReported?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to report the violation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Report an HOA Violation</DialogTitle>
          <DialogDescription>
            Log a notice or violation from your HOA so it shows up as a next-step card with guidance on resolving it.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-sm font-medium">Violation logged</p>
            <p className="text-xs text-[hsl(var(--mobile-text-muted))]">
              Check your Guidance Overview for next steps on resolving it.
            </p>
            <Button onClick={handleClose} className="mt-2">Done</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <select
              value={workType}
              onChange={(e) => setWorkType(e.target.value as HoaWorkType)}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
            >
              <option value="">What&apos;s this about? (optional)</option>
              {WORK_TYPES.map((wt) => (
                <option key={wt} value={wt}>{WORK_TYPE_LABELS[wt]}</option>
              ))}
            </select>
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Short summary (e.g. Fence color notice)"
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did the notice say? (optional)"
              rows={3}
              className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-[hsl(var(--mobile-text-muted))]">Cure-by date (optional)</label>
                <input
                  type="date"
                  value={cureDeadline}
                  onChange={(e) => setCureDeadline(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[hsl(var(--mobile-text-muted))]">Fine amount (optional)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fineAmount}
                  onChange={(e) => setFineAmount(e.target.value)}
                  placeholder="$0.00"
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button onClick={handleSubmit} disabled={submitting || !summary.trim()} className="w-full">
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reporting…
                </>
              ) : (
                'Report Violation'
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
