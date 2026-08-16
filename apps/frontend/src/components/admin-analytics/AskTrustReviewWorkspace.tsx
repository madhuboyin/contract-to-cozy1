'use client';

import { useState } from 'react';
import { Download, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import {
  useAdminAskTrustReviewCandidates,
  usePromoteAdminAskTrustCandidate,
  useReviewAdminAskTrustCandidate,
  useSyncAdminAskTrustReviewCandidates,
} from '@/hooks/useAdminAnalytics';
import {
  fetchAdminAskTrustCalibrationArtifact,
  fetchAdminAskTrustRegressionCorpus,
  type AdminAnalyticsFilters,
  type AdminAskTrustReviewCandidate,
  type AdminAskTrustReviewStatus,
} from '@/lib/api/adminAnalytics';

type FilterStatus = AdminAskTrustReviewStatus | 'ALL';
type CandidateDraft = { expectedOperationId: string; reviewedQuestion: string; reviewNotes: string };

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'The operation could not be completed.';
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

function initialDraft(candidate: AdminAskTrustReviewCandidate): CandidateDraft {
  return {
    expectedOperationId: candidate.expectedOperationId ?? candidate.operationId,
    reviewedQuestion: candidate.reviewedQuestion ?? '',
    reviewNotes: candidate.reviewNotes ?? '',
  };
}

export function AskTrustReviewWorkspace({
  filters,
  operationIds,
  enabled,
}: {
  filters: AdminAnalyticsFilters;
  operationIds: string[];
  enabled: boolean;
}) {
  const [status, setStatus] = useState<FilterStatus>('NEEDS_REVIEW');
  const [drafts, setDrafts] = useState<Record<string, CandidateDraft>>({});
  const [downloading, setDownloading] = useState<'corpus' | 'calibration' | null>(null);
  const candidates = useAdminAskTrustReviewCandidates(status === 'ALL' ? undefined : status, enabled);
  const sync = useSyncAdminAskTrustReviewCandidates(filters);
  const review = useReviewAdminAskTrustCandidate();
  const promote = usePromoteAdminAskTrustCandidate();

  const updateDraft = (candidate: AdminAskTrustReviewCandidate, patch: Partial<CandidateDraft>) => {
    setDrafts((current) => ({
      ...current,
      [candidate.fixtureKey]: { ...(current[candidate.fixtureKey] ?? initialDraft(candidate)), ...patch },
    }));
  };

  const approve = async (candidate: AdminAskTrustReviewCandidate) => {
    const draft = drafts[candidate.fixtureKey] ?? initialDraft(candidate);
    if (!draft.expectedOperationId || !draft.reviewedQuestion.trim()) {
      toast({ title: 'Label and wording required', description: 'Choose the expected operation and enter de-identified representative wording.', variant: 'destructive' });
      return;
    }
    try {
      await review.mutateAsync({
        fixtureKey: candidate.fixtureKey,
        disposition: 'APPROVE',
        expectedOperationId: draft.expectedOperationId,
        reviewedQuestion: draft.reviewedQuestion.trim(),
        reviewNotes: draft.reviewNotes.trim() || undefined,
      });
      toast({ title: 'Candidate approved', description: 'It is now eligible for explicit promotion.' });
    } catch (error) {
      toast({ title: 'Approval failed', description: message(error), variant: 'destructive' });
    }
  };

  const reject = async (candidate: AdminAskTrustReviewCandidate) => {
    const draft = drafts[candidate.fixtureKey] ?? initialDraft(candidate);
    try {
      await review.mutateAsync({
        fixtureKey: candidate.fixtureKey,
        disposition: 'REJECT',
        reviewNotes: draft.reviewNotes.trim() || undefined,
      });
      toast({ title: 'Candidate rejected', description: 'It will not enter the reviewed regression corpus.' });
    } catch (error) {
      toast({ title: 'Rejection failed', description: message(error), variant: 'destructive' });
    }
  };

  const promoteCandidate = async (candidate: AdminAskTrustReviewCandidate) => {
    try {
      await promote.mutateAsync(candidate.fixtureKey);
      toast({ title: 'Candidate promoted', description: 'The reviewed wording is now included in governed exports.' });
    } catch (error) {
      toast({ title: 'Promotion failed', description: message(error), variant: 'destructive' });
    }
  };

  const exportJson = async (kind: 'corpus' | 'calibration') => {
    setDownloading(kind);
    try {
      if (kind === 'corpus') {
        const data = await fetchAdminAskTrustRegressionCorpus();
        downloadJson(`${data.datasetVersion}.json`, data);
      } else {
        const data = await fetchAdminAskTrustCalibrationArtifact();
        downloadJson(`${data.artifactVersion}.json`, data);
      }
      toast({ title: kind === 'corpus' ? 'Regression corpus exported' : 'Calibration proposal exported' });
    } catch (error) {
      toast({ title: 'Export failed', description: message(error), variant: 'destructive' });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-violet-200 p-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <ShieldCheck className="h-4 w-4 text-violet-700" aria-hidden="true" />
            Reviewed correction promotion
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
            Synchronize bounded failure clusters, label only de-identified representative wording, approve or reject it, then promote it explicitly. Nothing changes active routing automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={sync.isPending}
            onClick={async () => {
              try {
                const result = await sync.mutateAsync();
                toast({ title: 'Candidates synchronized', description: `${result.synced} bounded candidates were synchronized.` });
              } catch (error) {
                toast({ title: 'Synchronization failed', description: message(error), variant: 'destructive' });
              }
            }}
          >
            {sync.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Sync candidates
          </Button>
          <Button size="sm" variant="outline" disabled={downloading !== null} onClick={() => exportJson('corpus')}>
            <Download className="mr-2 h-4 w-4" />Export corpus
          </Button>
          <Button size="sm" variant="outline" disabled={downloading !== null} onClick={() => exportJson('calibration')}>
            <Download className="mr-2 h-4 w-4" />Calibration proposal
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 border-b border-violet-100 px-4 py-3">
        <label htmlFor="ask-trust-review-status" className="text-xs font-medium text-slate-700">Review status</label>
        <select
          id="ask-trust-review-status"
          value={status}
          onChange={(event) => setStatus(event.target.value as FilterStatus)}
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
        >
          <option value="NEEDS_REVIEW">Needs review</option>
          <option value="APPROVED">Approved</option>
          <option value="PROMOTED">Promoted</option>
          <option value="REJECTED">Rejected</option>
          <option value="ALL">All</option>
        </select>
        <Badge variant="outline">{candidates.data?.length ?? 0} candidates</Badge>
      </div>

      {candidates.isLoading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading review candidates…</div>
      ) : candidates.isError ? (
        <div className="p-4 text-sm text-red-700">The review queue could not be loaded. Confirm that the Ask trust review-candidate database schema has been applied.</div>
      ) : !candidates.data?.length ? (
        <div className="p-4 text-sm text-slate-600">No candidates match this status. Synchronize current bounded clusters or choose another status.</div>
      ) : (
        <div className="divide-y divide-violet-100">
          {candidates.data.map((candidate) => {
            const draft = drafts[candidate.fixtureKey] ?? initialDraft(candidate);
            const editable = candidate.reviewStatus !== 'PROMOTED';
            return (
              <div key={candidate.fixtureKey} className="space-y-3 bg-white/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{candidate.reviewStatus.replaceAll('_', ' ')}</Badge>
                      <span className="text-sm font-semibold text-slate-900">{candidate.operationId}</span>
                      <span className="text-xs text-slate-500">{candidate.language} · {candidate.occurrences} occurrences</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{candidate.category} · {candidate.reasonCode} · {candidate.fixtureKey}</p>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Expected operation</label>
                    <select
                      value={draft.expectedOperationId}
                      disabled={!editable}
                      onChange={(event) => updateDraft(candidate, { expectedOperationId: event.target.value })}
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:bg-slate-100"
                    >
                      {operationIds.map((operationId) => <option key={operationId} value={operationId}>{operationId}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Review notes</label>
                    <Input
                      value={draft.reviewNotes}
                      disabled={!editable}
                      placeholder="Optional reviewer rationale"
                      onChange={(event) => updateDraft(candidate, { reviewNotes: event.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">De-identified representative wording</label>
                  <Textarea
                    value={draft.reviewedQuestion}
                    disabled={!editable}
                    rows={2}
                    maxLength={500}
                    placeholder="Enter representative wording with names, addresses, and other identifying details removed."
                    onChange={(event) => updateDraft(candidate, { reviewedQuestion: event.target.value })}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {editable && (
                    <>
                      <Button size="sm" disabled={review.isPending} onClick={() => approve(candidate)}>Approve label</Button>
                      <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => reject(candidate)}>Reject</Button>
                    </>
                  )}
                  {candidate.reviewStatus === 'APPROVED' && (
                    <Button size="sm" className="bg-violet-700 hover:bg-violet-800" disabled={promote.isPending} onClick={() => promoteCandidate(candidate)}>
                      Promote to governed corpus
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
