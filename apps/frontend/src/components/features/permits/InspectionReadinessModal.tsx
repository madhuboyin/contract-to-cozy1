'use client';

import { useEffect, useState } from 'react';
import { Camera, CheckCircle2, XCircle, HelpCircle, Loader2, Upload, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import type { InspectionMilestone, InspectionReadinessCheckResult, InspectionReadinessChecklistVerdict } from '@/types';
import {
  READINESS_VERDICT_LABELS,
  READINESS_VERDICT_COLOR,
  CHECKLIST_VERDICT_LABELS,
  CHECKLIST_VERDICT_COLOR,
  relativeTime,
} from './PermitUtils';

interface Props {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  permitId: string;
  milestone: InspectionMilestone | null;
}

function ChecklistVerdictIcon({ verdict }: { verdict: InspectionReadinessChecklistVerdict }) {
  if (verdict === 'MET') return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
  if (verdict === 'NOT_MET') return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
  return <HelpCircle className="h-4 w-4 text-amber-500 shrink-0" />;
}

export default function InspectionReadinessModal({ open, onClose, propertyId, permitId, milestone }: Props) {
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<InspectionReadinessCheckResult | null>(null);
  const [history, setHistory] = useState<InspectionReadinessCheckResult[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!open || !milestone) return;
    setPhotos([]);
    setResult(null);
    setError('');
    setLoadingHistory(true);
    api
      .listInspectionReadinessChecks(propertyId, permitId, milestone.id)
      .then((checks) => {
        setHistory(checks);
        if (checks[0]) setResult(checks[0]);
      })
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, milestone?.id]);

  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
    };
  }, [photos]);

  if (!milestone) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).slice(0, 12 - photos.length);
    const newPhotos = newFiles.map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setPhotos((prev) => [...prev, ...newPhotos]);
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const runCheck = async () => {
    if (photos.length === 0) {
      setError('Upload at least one photo of the completed work.');
      return;
    }
    setRunning(true);
    setError('');
    try {
      const check = await api.runInspectionReadinessCheck(
        propertyId,
        permitId,
        milestone.id,
        photos.map((p) => p.file),
      );
      setResult(check);
      setHistory((prev) => [check, ...prev]);
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPhotos([]);
    } catch (err: any) {
      setError(err?.message || 'Failed to run readiness check. Please try again.');
    } finally {
      setRunning(false);
    }
  };

  const notMetCount = result?.checklistResults.filter((r) => r.verdict === 'NOT_MET').length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Check Readiness — {milestone.stageName}</DialogTitle>
          <DialogDescription>
            Upload photos of the completed work. This reviews commonly checked items for this stage —
            it&apos;s general guidance, not authoritative code compliance, and doesn&apos;t replace the real inspector.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 p-6 text-center hover:border-neutral-400">
              <Upload className="h-6 w-6 text-neutral-400" />
              <span className="text-sm font-medium text-neutral-700">Upload photos of the completed work</span>
              <span className="text-xs text-neutral-500">JPEG, PNG, or WEBP · up to 12 photos</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                disabled={running || photos.length >= 12}
              />
            </label>

            {photos.length > 0 && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {photos.map((photo, index) => (
                  <div key={index} className="relative aspect-square overflow-hidden rounded-lg border">
                    <img src={photo.preview} alt="" className="h-full w-full object-cover" />
                    <button
                      onClick={() => removePhoto(index)}
                      disabled={running}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button onClick={runCheck} disabled={running || photos.length === 0} className="w-full">
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reviewing photos…
              </>
            ) : (
              <>
                <Camera className="mr-2 h-4 w-4" /> Run Readiness Check
              </>
            )}
          </Button>

          {loadingHistory && (
            <p className="text-center text-xs text-neutral-500">Loading previous checks…</p>
          )}

          {result && (
            <div className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${READINESS_VERDICT_COLOR[result.overallVerdict]}`}
                >
                  {READINESS_VERDICT_LABELS[result.overallVerdict]}
                </span>
                <span className="text-xs text-neutral-500">{relativeTime(result.createdAt)}</span>
              </div>

              {result.overallSummary && (
                <p className="text-sm text-neutral-700">{result.overallSummary}</p>
              )}

              <div className="space-y-2 border-t pt-3">
                {result.checklistResults.map((item) => (
                  <div key={item.itemKey} className="flex items-start gap-2">
                    <ChecklistVerdictIcon verdict={item.verdict} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight">{item.itemLabel}</p>
                      <p className="text-xs text-neutral-500">{item.aiNote}</p>
                    </div>
                    <span className={`shrink-0 text-xs font-medium ${CHECKLIST_VERDICT_COLOR[item.verdict]}`}>
                      {CHECKLIST_VERDICT_LABELS[item.verdict]}
                    </span>
                  </div>
                ))}
              </div>

              {notMetCount > 0 && (
                <p className="border-t pt-3 text-xs text-neutral-600">
                  {notMetCount} item{notMetCount > 1 ? 's' : ''} added to your{' '}
                  <a href="/dashboard/maintenance" className="font-medium text-primary hover:underline">
                    Maintenance Tasks
                  </a>{' '}
                  — fix them and re-run the check.
                </p>
              )}
            </div>
          )}

          {history.length > 1 && (
            <p className="text-center text-xs text-neutral-500">
              {history.length} readiness checks run for this stage
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
