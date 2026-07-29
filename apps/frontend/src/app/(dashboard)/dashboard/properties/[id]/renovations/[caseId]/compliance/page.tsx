'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, FileCheck2, Loader2, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MobilePageIntro, StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';
import type { HoaApprovalRecord, PermitSummary } from '@/types';

type ComplianceCondition = {
  id: string;
  subjectType: 'PERMIT' | 'HOA_APPROVAL';
  subjectId: string;
  title: string;
  description: string;
  sourceReference?: string | null;
  sourceDocumentId?: string | null;
  status: 'OPEN' | 'SATISFIED' | 'WAIVED_WITH_ACKNOWLEDGMENT' | 'EXPIRED';
  isBlocking: boolean;
  dueAt?: string | null;
  expiresAt?: string | null;
};

type Workflow = {
  permits: PermitSummary[];
  hoaApprovals: HoaApprovalRecord[];
  conditions: ComplianceCondition[];
  blockers: ComplianceCondition[];
  hoaDocumentReviews: Array<{
    id: string;
    documentId: string;
    extractedDecisionStatus?: string | null;
    extractedConditions: Array<{ title: string; description: string }>;
    extractedExpirationDate?: string | null;
    extractedReferenceNumber?: string | null;
    extractionMethod: string;
    status: 'NEEDS_REVIEW' | 'CONFIRMED' | 'REJECTED';
  }>;
  alerts: Array<{ type: string; subjectId: string; expiresAt: string; message: string }>;
  coverage: {
    permit: { state: string; message: string };
    hoa: { state: string; message: string };
  };
};

const emptyWorkflow: Workflow = {
  permits: [],
  hoaApprovals: [],
  conditions: [],
  blockers: [],
  hoaDocumentReviews: [],
  alerts: [],
  coverage: {
    permit: { state: 'NO_LINKED_RECORDS', message: 'No permit is linked.' },
    hoa: { state: 'NO_LINKED_RECORDS', message: 'No HOA approval is linked.' },
  },
};

function label(value?: string | null) {
  return value?.replace(/_/g, ' ').toLowerCase() || 'unknown';
}

export default function RenovationCompliancePage() {
  const { id: propertyId, caseId } = useParams<{ id: string; caseId: string }>();
  const [renovationCase, setRenovationCase] = useState<any>(null);
  const [workflow, setWorkflow] = useState<Workflow>(emptyWorkflow);
  const [availablePermits, setAvailablePermits] = useState<PermitSummary[]>([]);
  const [availableHoa, setAvailableHoa] = useState<HoaApprovalRecord[]>([]);
  const [selection, setSelection] = useState({ subjectType: 'PERMIT', subjectId: '' });
  const [evidenceByCondition, setEvidenceByCondition] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [caseResponse, workflowResponse, permitResponse, hoaResponse] = await Promise.all([
        api.getRenovationCase(propertyId, caseId),
        api.getRenovationComplianceWorkflow(propertyId, caseId),
        api.listPermits(propertyId, { limit: 100 }),
        api.listHoaApprovalRecords(propertyId),
      ]);
      if (!caseResponse.success || !caseResponse.data) {
        throw new Error(caseResponse.message || 'Renovation case not found');
      }
      if (!workflowResponse.success || !workflowResponse.data) {
        throw new Error(workflowResponse.message || 'Compliance workflow could not be loaded');
      }
      setRenovationCase(caseResponse.data);
      setWorkflow(workflowResponse.data as Workflow);
      setAvailablePermits(permitResponse.items);
      setAvailableHoa(hoaResponse);
    } catch (err: any) {
      setError(err.message || 'Failed to load the compliance workflow');
    } finally {
      setLoading(false);
    }
  }, [caseId, propertyId]);

  useEffect(() => { void load(); }, [load]);

  const linkedIds = useMemo(
    () => new Set([
      ...workflow.permits.map(record => record.id),
      ...workflow.hoaApprovals.map(record => record.id),
    ]),
    [workflow],
  );
  const choices = selection.subjectType === 'PERMIT' ? availablePermits : availableHoa;

  async function attachRecord() {
    if (!selection.subjectId) return;
    setWorking(true);
    setError('');
    try {
      const response = await api.attachRenovationComplianceRecord(
        propertyId,
        caseId,
        selection as { subjectType: 'PERMIT' | 'HOA_APPROVAL'; subjectId: string },
      );
      if (!response.success) throw new Error(response.message || 'Failed to attach record');
      setSelection(current => ({ ...current, subjectId: '' }));
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to attach record');
    } finally {
      setWorking(false);
    }
  }

  async function satisfyCondition(condition: ComplianceCondition) {
    const sourceDocumentId = evidenceByCondition[condition.id]?.trim();
    if (!sourceDocumentId) return;
    setWorking(true);
    setError('');
    try {
      const response = await api.updateRenovationComplianceCondition(
        propertyId,
        caseId,
        condition.id,
        {
          status: 'SATISFIED',
          verificationNotes: 'Verified against the attached property document.',
          sourceDocumentId,
        },
      );
      if (!response.success) throw new Error(response.message || 'Failed to verify condition');
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to verify condition');
    } finally {
      setWorking(false);
    }
  }

  async function reviewExtraction(reviewId: string, status: 'CONFIRMED' | 'REJECTED') {
    setWorking(true);
    setError('');
    try {
      const response = await api.reviewHoaDocumentExtraction(propertyId, caseId, reviewId, {
        status,
        reviewNotes: status === 'CONFIRMED'
          ? 'Homeowner reviewed and confirmed the extracted HOA decision and condition candidates.'
          : 'Homeowner reviewed and rejected the extraction candidates.',
      });
      if (!response.success) throw new Error(response.message || 'Failed to review extraction');
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to review extraction');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-28 sm:p-6">
      <MobilePageIntro
        title={renovationCase?.name ? `${renovationCase.name}: Compliance` : 'Permit and HOA workflow'}
        subtitle="Reported progress is kept separate from official authority or association decisions. Conditions remain blockers until evidence verifies completion."
        action={<StatusChip tone={workflow.blockers.length ? 'needsAction' : 'good'}>{workflow.blockers.length} blockers</StatusChip>}
      />

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={`/dashboard/properties/${propertyId}/renovations/${caseId}/requirements`}>
            Review requirements
          </Link>
        </Button>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : null}

      {!loading ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {[workflow.coverage.permit, workflow.coverage.hoa].map((coverage, index) => (
              <Card key={index} className={coverage.state === 'NO_LINKED_RECORDS' ? 'border-amber-200' : 'border-emerald-200'}>
                <CardContent className="flex gap-3 p-4 text-sm">
                  {coverage.state === 'NO_LINKED_RECORDS'
                    ? <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" />
                    : <FileCheck2 className="h-5 w-5 shrink-0 text-emerald-600" />}
                  <p>{coverage.message}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="font-semibold text-slate-900">Attach a property compliance record</h2>
                <p className="text-sm text-slate-600">A record may be attached to one renovation case and its current scope.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
                <div>
                  <Label>Record type</Label>
                  <select
                    className="h-10 w-full rounded-md border px-3"
                    value={selection.subjectType}
                    onChange={event => setSelection({ subjectType: event.target.value, subjectId: '' })}
                  >
                    <option value="PERMIT">Permit</option>
                    <option value="HOA_APPROVAL">HOA approval</option>
                  </select>
                </div>
                <div>
                  <Label>Available record</Label>
                  <select
                    className="h-10 w-full rounded-md border px-3"
                    value={selection.subjectId}
                    onChange={event => setSelection(current => ({ ...current, subjectId: event.target.value }))}
                  >
                    <option value="">Select a record</option>
                    {choices.filter(record => !linkedIds.has(record.id)).map(record => (
                      <option key={record.id} value={record.id}>
                        {selection.subjectType === 'PERMIT'
                          ? `${(record as PermitSummary).permitNumber || (record as PermitSummary).category} — official: ${label((record as PermitSummary).status)}`
                          : `${label((record as HoaApprovalRecord).workType)} — reported: ${label((record as HoaApprovalRecord).reportedStatus)}`}
                      </option>
                    ))}
                  </select>
                </div>
                <Button disabled={working || !selection.subjectId} onClick={attachRecord}>Attach</Button>
              </div>
            </CardContent>
          </Card>

          {workflow.alerts.map(alert => (
            <div key={`${alert.type}-${alert.subjectId}`} className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <div><p>{alert.message}</p><p className="mt-1 text-xs">Date: {new Date(alert.expiresAt).toLocaleDateString()}</p></div>
            </div>
          ))}

          {workflow.hoaDocumentReviews.length ? (
            <Card>
              <CardContent className="space-y-3 p-5">
                <div>
                  <h2 className="font-semibold">HOA document extraction review</h2>
                  <p className="text-sm text-slate-600">Extracted decisions and conditions are candidates only until a homeowner reviews them.</p>
                </div>
                {workflow.hoaDocumentReviews.map(review => (
                  <div key={review.id} className="rounded-lg border p-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">Document {review.documentId}</p>
                      <StatusChip tone={review.status === 'CONFIRMED' ? 'good' : review.status === 'REJECTED' ? 'danger' : 'needsAction'}>{review.status}</StatusChip>
                    </div>
                    <p className="mt-2">Candidate decision: {label(review.extractedDecisionStatus)}</p>
                    {review.extractedReferenceNumber ? <p>Reference: {review.extractedReferenceNumber}</p> : null}
                    {review.extractedExpirationDate ? <p>Candidate expiration: {new Date(review.extractedExpirationDate).toLocaleDateString()}</p> : null}
                    <div className="mt-2 space-y-1">
                      {Array.isArray(review.extractedConditions) && review.extractedConditions.map((condition, index) => (
                        <p key={`${review.id}-${index}`} className="rounded bg-slate-50 p-2">
                          <span className="font-medium">{condition.title}:</span> {condition.description}
                        </p>
                      ))}
                    </div>
                    {review.status === 'NEEDS_REVIEW' ? (
                      <div className="mt-3 flex gap-2">
                        <Button disabled={working} onClick={() => reviewExtraction(review.id, 'CONFIRMED')}>Confirm candidates</Button>
                        <Button disabled={working} variant="outline" onClick={() => reviewExtraction(review.id, 'REJECTED')}>Reject</Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="font-semibold">Permits</h2>
                {workflow.permits.map(record => (
                  <div key={record.id} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">{record.permitNumber || label(record.category)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusChip tone={record.officialTruthLayer ? 'good' : 'needsAction'}>Official: {label(record.status)}</StatusChip>
                      <StatusChip tone="info">Reported: {label(record.reportedStatus)}</StatusChip>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      {record.officialTruthLayer
                        ? `${label(record.officialTruthLayer)} · ${record.officialSourceReference || 'evidence attached'}`
                        : 'No authority-backed status has been recorded.'}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="font-semibold">HOA approvals</h2>
                {workflow.hoaApprovals.map(record => (
                  <div key={record.id} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">{label(record.workType)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusChip tone={record.decisionTruthLayer ? 'good' : 'needsAction'}>Decision: {label(record.decisionStatus)}</StatusChip>
                      <StatusChip tone="info">Reported: {label(record.reportedStatus)}</StatusChip>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      {record.decisionTruthLayer
                        ? `${label(record.decisionTruthLayer)} · ${record.decisionSourceReference || 'evidence attached'}`
                        : 'No association-backed decision has been recorded.'}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="space-y-3 p-5">
              <div>
                <h2 className="font-semibold">Conditions and closeout blockers</h2>
                <p className="text-sm text-slate-600">A condition can be satisfied only with a property document as verification evidence.</p>
              </div>
              {workflow.conditions.length === 0 ? <p className="text-sm text-slate-600">No sourced conditions are recorded.</p> : null}
              {workflow.conditions.map(condition => (
                <div key={condition.id} className="rounded-lg border p-4">
                  <div className="flex items-start gap-3">
                    {condition.status === 'SATISFIED'
                      ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{condition.title}</p>
                        <StatusChip tone={condition.status === 'SATISFIED' ? 'good' : condition.isBlocking ? 'needsAction' : 'info'}>{condition.status}</StatusChip>
                      </div>
                      <p className="mt-1 text-sm text-slate-700">{condition.description}</p>
                      {condition.sourceReference ? <p className="mt-1 text-xs text-slate-500">Source: {condition.sourceReference}</p> : null}
                    </div>
                  </div>
                  {condition.status === 'OPEN' ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div>
                        <Label>Verification document ID</Label>
                        <Input
                          value={evidenceByCondition[condition.id] || ''}
                          onChange={event => setEvidenceByCondition(current => ({ ...current, [condition.id]: event.target.value }))}
                          placeholder="Property document UUID"
                        />
                      </div>
                      <Button
                        variant="outline"
                        disabled={working || !evidenceByCondition[condition.id]?.trim()}
                        onClick={() => satisfyCondition(condition)}
                      >
                        Verify satisfied
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
