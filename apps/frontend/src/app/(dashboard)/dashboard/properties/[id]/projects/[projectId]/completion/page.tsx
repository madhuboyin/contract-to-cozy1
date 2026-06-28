'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { ProjectCompletionChecklist } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  MobileCard,
  MobilePageContainer,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { Spinner, ErrorBanner } from '../../ProjectTrackerHelpers';

function RatingInput({ id, label, value, onChange }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
      >
        <option value="">—</option>
        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} star{n !== 1 ? 's' : ''}</option>)}
      </select>
    </div>
  );
}

export default function CompletionPage() {
  const params = useParams<{ id: string; projectId: string }>();
  const { id: propertyId, projectId } = params;
  const router = useRouter();

  const [checklist, setChecklist] = useState<ProjectCompletionChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [form, setForm] = useState({
    actualEndDate: new Date().toISOString().split('T')[0],
    warrantyPeriodMonths: '',
    contractorReviewText: '',
    ratingQuality: '',
    ratingTimeline: '',
    ratingComms: '',
    ratingBudget: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getProjectCompletionChecklist(propertyId, projectId);
      setChecklist(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load checklist');
    } finally {
      setLoading(false);
    }
  }, [propertyId, projectId]);

  useEffect(() => { load(); }, [load]);

  const allPassed = checklist?.allPassed ?? false;
  const ratingsComplete = form.ratingQuality && form.ratingTimeline && form.ratingComms && form.ratingBudget;

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!ratingsComplete) { setError('All four contractor ratings are required'); return; }
    setConfirming(true);
    setError(null);
    try {
      await api.confirmProjectCompletion(propertyId, projectId, {
        actualEndDate: form.actualEndDate || undefined,
        contractorRatingQuality: parseInt(form.ratingQuality),
        contractorRatingTimeline: parseInt(form.ratingTimeline),
        contractorRatingComms: parseInt(form.ratingComms),
        contractorRatingBudget: parseInt(form.ratingBudget),
        contractorReviewText: form.contractorReviewText.trim() || undefined,
        warrantyPeriodMonths: form.warrantyPeriodMonths ? parseInt(form.warrantyPeriodMonths) : undefined,
      });
      router.push(`/dashboard/properties/${propertyId}/projects/${projectId}`);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to confirm completion');
      setConfirming(false);
    }
  }

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-2xl lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}/projects/${projectId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to overview
        </Link>
      </Button>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">Confirm Completion</h1>
        <p className="text-sm text-slate-500">
          All checks must pass before closing the project. Completion writes audit records and finalizes project history.
        </p>
      </div>

      {error && <ErrorBanner msg={error} />}
      {loading ? <Spinner /> : null}

      {/* Checklist */}
      {checklist && (
        <MobileCard className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Pre-completion checklist</h2>
          <div className="space-y-2">
            {checklist.checks.map((check, i) => (
              <div key={i} className="flex items-start gap-2.5">
                {check.passed ? (
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 flex-shrink-0 text-rose-500 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <p className={`text-sm font-medium ${check.passed ? 'text-slate-800' : 'text-slate-700'}`}>
                    {check.label}
                  </p>
                  {!check.passed && check.blockers.length > 0 && (
                    <ul className="text-xs text-rose-700 list-disc list-inside">
                      {check.blockers.map((b, bi) => <li key={bi}>{b}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!allPassed && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Resolve all failing checks before confirming completion.
            </div>
          )}
        </MobileCard>
      )}

      {/* Completion form */}
      <form onSubmit={confirm} className="space-y-4">
        <MobileCard className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Completion details</h2>

          <div className="space-y-1.5">
            <Label htmlFor="actualEnd">Actual completion date</Label>
            <Input
              id="actualEnd"
              type="date"
              value={form.actualEndDate}
              onChange={e => setForm(f => ({ ...f, actualEndDate: e.target.value }))}
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="warrantyMonths">Warranty period (months)</Label>
            <Input
              id="warrantyMonths"
              type="number"
              min="0"
              value={form.warrantyPeriodMonths}
              onChange={e => setForm(f => ({ ...f, warrantyPeriodMonths: e.target.value }))}
              placeholder="e.g. 24 for 2-year warranty"
              className="h-11"
            />
          </div>
        </MobileCard>

        {/* Contractor ratings */}
        <MobileCard className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Contractor ratings (required)</h2>
          <div className="grid grid-cols-2 gap-3">
            <RatingInput id="rQuality" label="Quality of work" value={form.ratingQuality} onChange={v => setForm(f => ({ ...f, ratingQuality: v }))} />
            <RatingInput id="rTimeline" label="Timeline" value={form.ratingTimeline} onChange={v => setForm(f => ({ ...f, ratingTimeline: v }))} />
            <RatingInput id="rComms" label="Communication" value={form.ratingComms} onChange={v => setForm(f => ({ ...f, ratingComms: v }))} />
            <RatingInput id="rBudget" label="Budget adherence" value={form.ratingBudget} onChange={v => setForm(f => ({ ...f, ratingBudget: v }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="review">Review notes</Label>
            <Textarea
              id="review"
              value={form.contractorReviewText}
              onChange={e => setForm(f => ({ ...f, contractorReviewText: e.target.value }))}
              rows={3}
              placeholder="Any final feedback on the contractor…"
            />
          </div>
        </MobileCard>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
          <p className="text-xs font-semibold text-slate-700">What happens on confirmation:</p>
          <ul className="text-xs text-slate-600 space-y-0.5 list-disc list-inside">
            <li>Project status set to COMPLETED</li>
            <li>Inspection findings linked to this project marked resolved</li>
            <li>Write-back audit records created for property history</li>
            <li>Contractor ratings saved to project record</li>
          </ul>
        </div>

        <Button
          type="submit"
          disabled={confirming || !allPassed || loading || !ratingsComplete}
          className="w-full min-h-[48px] text-base"
        >
          {confirming ? 'Confirming…' : 'Confirm completion'}
        </Button>
      </form>
    </MobilePageContainer>
  );
}
