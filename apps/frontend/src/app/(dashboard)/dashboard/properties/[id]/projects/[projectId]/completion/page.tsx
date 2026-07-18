'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { ProjectCompletionChecklist, ProjectRecord } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  MobileCard,
  MobilePageContainer,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { Spinner, ErrorBanner } from '../../ProjectTrackerHelpers';
import { ProjectProofUploader, type ProjectProof } from '@/components/projects/ProjectProofUploader';

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
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [proofDocuments, setProofDocuments] = useState<ProjectProof[]>([]);
  const [form, setForm] = useState({
    actualEndDate: new Date().toISOString().split('T')[0],
    warrantyPeriodMonths: '',
    contractorReviewText: '',
    ratingQuality: '',
    ratingTimeline: '',
    ratingComms: '',
    ratingBudget: '',
    outcomeStatus: 'VERIFIED_SUCCESS',
    commissioningResult: 'PASSED',
    functionalVerificationResult: 'PASSED',
    safetyCheckResult: 'PASSED',
    inspectionResult: 'NOT_REQUIRED',
    actualCost: '',
    providerOutcome: 'SUCCESS',
    modelNumber: '',
    serialNumber: '',
    exceptionSummary: '',
    nextMaintenanceDate: '',
    nextInspectionDate: '',
    replacementHorizonDate: '',
    followUpDate: '',
    recommendationOverridden: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [checklistData, projectData] = await Promise.all([
        api.getProjectCompletionChecklist(propertyId, projectId),
        api.getProject(propertyId, projectId),
      ]);
      setChecklist(checklistData);
      setProject(projectData);
      setForm(current => ({
        ...current,
        actualCost: current.actualCost || String((projectData.currentContractAmountCents ?? 0) / 100),
        providerOutcome: projectData.fulfillmentMode === 'DIY' ? 'NOT_APPLICABLE' : current.providerOutcome,
      }));
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load checklist');
    } finally {
      setLoading(false);
    }
  }, [propertyId, projectId]);

  useEffect(() => { load(); }, [load]);

  const allPassed = checklist?.allPassed ?? false;
  const verifiedSuccess = form.outcomeStatus === 'VERIFIED_SUCCESS';
  const ratingsComplete = project?.fulfillmentMode === 'DIY' || (form.ratingQuality && form.ratingTimeline && form.ratingComms && form.ratingBudget);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (verifiedSuccess && !ratingsComplete) { setError('All four provider ratings are required'); return; }
    if (verifiedSuccess && (!form.actualCost || Number(form.actualCost) < 0)) { setError('Final actual cost is required for verified closure'); return; }
    setConfirming(true);
    setError(null);
    try {
      await api.confirmProjectCompletion(propertyId, projectId, {
        actualEndDate: form.actualEndDate || undefined,
        outcomeStatus: form.outcomeStatus as 'VERIFIED_SUCCESS' | 'INCOMPLETE' | 'FAILED' | 'DISPUTED' | 'DELAYED' | 'UNSAFE',
        commissioningResult: form.commissioningResult as 'PASSED' | 'FAILED' | 'NOT_REQUIRED' | 'UNRESOLVED',
        functionalVerificationResult: form.functionalVerificationResult as 'PASSED' | 'FAILED' | 'NOT_REQUIRED' | 'UNRESOLVED',
        safetyCheckResult: form.safetyCheckResult as 'PASSED' | 'FAILED' | 'NOT_REQUIRED' | 'UNRESOLVED',
        inspectionResult: form.inspectionResult as 'PASSED' | 'FAILED' | 'NOT_REQUIRED' | 'UNRESOLVED',
        unresolvedExceptions: form.exceptionSummary.trim() ? [{ type: form.outcomeStatus === 'UNSAFE' ? 'SAFETY' : 'OTHER', summary: form.exceptionSummary.trim(), blocksClosure: true }] : [],
        actualCostCents: form.actualCost ? Math.round(Number(form.actualCost) * 100) : undefined,
        providerOutcome: form.providerOutcome as 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'NOT_APPLICABLE',
        recommendationOverridden: form.recommendationOverridden,
        modelNumber: form.modelNumber.trim() || undefined,
        serialNumber: form.serialNumber.trim() || undefined,
        proofDocuments,
        contractorRatingQuality: form.ratingQuality ? parseInt(form.ratingQuality) : undefined,
        contractorRatingTimeline: form.ratingTimeline ? parseInt(form.ratingTimeline) : undefined,
        contractorRatingComms: form.ratingComms ? parseInt(form.ratingComms) : undefined,
        contractorRatingBudget: form.ratingBudget ? parseInt(form.ratingBudget) : undefined,
        contractorReviewText: form.contractorReviewText.trim() || undefined,
        warrantyPeriodMonths: form.warrantyPeriodMonths ? parseInt(form.warrantyPeriodMonths) : undefined,
        nextMaintenanceDate: form.nextMaintenanceDate || undefined,
        nextInspectionDate: form.nextInspectionDate || undefined,
        replacementHorizonDate: form.replacementHorizonDate || undefined,
        followUpDate: form.followUpDate || undefined,
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
          Verify the outcome, capture proof, update the Living Home Record, and schedule future care in one closure.
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

          {!allPassed && verifiedSuccess && (
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
            <Label htmlFor="outcomeStatus">Outcome</Label>
            <select id="outcomeStatus" value={form.outcomeStatus} onChange={e => setForm(f => ({ ...f, outcomeStatus: e.target.value }))} className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="VERIFIED_SUCCESS">Verified success</option>
              <option value="INCOMPLETE">Incomplete</option>
              <option value="FAILED">Failed</option>
              <option value="DISPUTED">Disputed</option>
              <option value="DELAYED">Delayed</option>
              <option value="UNSAFE">Unsafe</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[['commissioningResult', 'Commissioning'], ['functionalVerificationResult', 'Functional test'], ['safetyCheckResult', 'Safety check'], ['inspectionResult', 'Inspection']].map(([field, label]) => (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={field}>{label}</Label>
                <select id={field} value={form[field as keyof typeof form] as string} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="PASSED">Passed</option><option value="FAILED">Failed</option><option value="NOT_REQUIRED">Not required</option><option value="UNRESOLVED">Unresolved</option>
                </select>
              </div>
            ))}
          </div>

          <div className="space-y-1.5"><Label htmlFor="actualCost">Final actual cost ($)</Label><Input id="actualCost" type="number" min="0" step="0.01" value={form.actualCost} onChange={e => setForm(f => ({ ...f, actualCost: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label htmlFor="providerOutcome">Provider result</Label><select id="providerOutcome" value={form.providerOutcome} onChange={e => setForm(f => ({ ...f, providerOutcome: e.target.value }))} className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="SUCCESS">Success</option><option value="PARTIAL">Partial</option><option value="FAILED">Failed</option><option value="NOT_APPLICABLE">Not applicable</option></select></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor="modelNumber">Model number</Label><Input id="modelNumber" value={form.modelNumber} onChange={e => setForm(f => ({ ...f, modelNumber: e.target.value }))} /></div><div className="space-y-1.5"><Label htmlFor="serialNumber">Serial number</Label><Input id="serialNumber" value={form.serialNumber} onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} /></div></div>
          <div className="space-y-1.5"><Label htmlFor="exceptionSummary">Unresolved exception</Label><Textarea id="exceptionSummary" value={form.exceptionSummary} onChange={e => setForm(f => ({ ...f, exceptionSummary: e.target.value }))} rows={2} placeholder="Required when work is incomplete, failed, disputed, delayed, or unsafe." /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.recommendationOverridden} onChange={e => setForm(f => ({ ...f, recommendationOverridden: e.target.checked }))} /> The final choice overrode the recommendation</label>

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

        <MobileCard className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Proof and home record</h2>
          <p className="text-xs text-slate-500">Upload invoice, warranty, permit, before/after photos, or a completion record. Files use the shared document vault and are linked transactionally at closure.</p>
          <ProjectProofUploader propertyId={propertyId} value={proofDocuments} onChange={setProofDocuments} />
        </MobileCard>

        <MobileCard className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Future care</h2>
          <div className="grid grid-cols-2 gap-3">
            {[['nextMaintenanceDate', 'Next maintenance'], ['nextInspectionDate', 'Next inspection'], ['replacementHorizonDate', 'Replacement horizon'], ['followUpDate', 'Outcome follow-up']].map(([field, label]) => <div key={field} className="space-y-1.5"><Label htmlFor={field}>{label}</Label><Input id={field} type="date" value={form[field as keyof typeof form] as string} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} /></div>)}
          </div>
        </MobileCard>

        {/* Contractor ratings */}
        <MobileCard className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Provider ratings {project?.fulfillmentMode === 'PROVIDER' && verifiedSuccess ? '(required)' : '(optional)'}</h2>
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
            <li>HomeEvent, expense, proof, inventory, warranty, and material records updated transactionally</li>
            <li>Maintenance, inspection, warranty, replacement, and follow-up actions scheduled</li>
            <li>Contractor ratings saved to project record</li>
          </ul>
        </div>

        <Button
          type="submit"
          disabled={confirming || loading || (verifiedSuccess && (!allPassed || !ratingsComplete))}
          className="w-full min-h-[48px] text-base"
        >
          {confirming ? 'Confirming…' : 'Confirm completion'}
        </Button>
      </form>
    </MobilePageContainer>
  );
}
