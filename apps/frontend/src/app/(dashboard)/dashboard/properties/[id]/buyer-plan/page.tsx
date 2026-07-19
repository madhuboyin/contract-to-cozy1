'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Circle, FileSearch, Loader2, Users } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import type {
  BuyerFindingDisposition,
  BuyerPlanPhase,
  HomeBuyerTask,
  HomeBuyerTaskStatus,
} from '@/types';

const PHASES: Array<{ key: BuyerPlanPhase; label: string }> = [
  { key: 'PRE_CLOSE', label: 'Before closing' },
  { key: 'FIRST_30_DAYS', label: 'First 30 days' },
  { key: 'DAYS_31_TO_90', label: 'Days 31–90' },
  { key: 'RECURRING_HOME', label: 'Recurring Home handoff' },
];

const FINDING_DECISIONS: Array<{ value: Exclude<BuyerFindingDisposition, 'PENDING_REVIEW'>; label: string }> = [
  { value: 'VERIFIED_FACT', label: 'Verified fact' },
  { value: 'PRE_CLOSE_NEGOTIATION', label: 'Negotiate pre-close' },
  { value: 'POST_CLOSE_ACTION', label: 'Add to ownership plan' },
  { value: 'DISMISSED', label: 'Dismiss' },
];

const NEXT_STEP_LABELS = {
  IMPORT_INSPECTION: 'Import an inspection report',
  REVIEW_EXTRACTION: 'Review extracted inspection findings',
  VERIFY_MATERIAL_FINDINGS: 'Verify material inspection findings',
  VERIFY_DOCUMENTS: 'Verify imported property documents',
  BUILD_90_DAY_PLAN: 'Continue the 90-day plan',
} as const;

function dateInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '';
}

function isoFromDateInput(value: string) {
  return value ? new Date(`${value}T12:00:00.000Z`).toISOString() : null;
}

export default function BuyerPlanPage() {
  const params = useParams();
  const propertyId = (Array.isArray(params.id) ? params.id[0] : params.id) as string;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['buyer-plan', propertyId] }),
      queryClient.invalidateQueries({ queryKey: ['buyer-import-readiness', propertyId] }),
      queryClient.invalidateQueries({ queryKey: ['buyer-evidence-review', propertyId] }),
      queryClient.invalidateQueries({ queryKey: ['buyer-acceptance', propertyId] }),
    ]);
  };

  const planQuery = useQuery({
    queryKey: ['buyer-plan', propertyId],
    queryFn: async () => {
      const response = await api.getHomeBuyerChecklist(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load the buyer plan.');
      return response.data;
    },
    enabled: Boolean(propertyId),
  });
  const readinessQuery = useQuery({
    queryKey: ['buyer-import-readiness', propertyId],
    queryFn: async () => {
      const response = await api.getBuyerImportReadiness(propertyId);
      if (!response.success) throw new Error(response.message);
      return response.data;
    },
    enabled: Boolean(propertyId),
  });
  const evidenceQuery = useQuery({
    queryKey: ['buyer-evidence-review', propertyId],
    queryFn: async () => {
      const response = await api.getBuyerEvidenceReview(propertyId);
      if (!response.success) throw new Error(response.message);
      return response.data;
    },
    enabled: Boolean(propertyId),
  });
  const membersQuery = useQuery({
    queryKey: ['buyer-household-members', propertyId],
    queryFn: () => api.listHouseholdMembers(propertyId),
    enabled: Boolean(propertyId),
  });
  const acceptanceQuery = useQuery({
    queryKey: ['buyer-acceptance', propertyId],
    queryFn: async () => {
      const response = await api.getBuyerAcceptanceStatus(propertyId);
      if (!response.success) throw new Error(response.message);
      return response.data;
    },
    enabled: Boolean(propertyId),
  });

  const lifecycleMutation = useMutation({
    mutationFn: (input: { targetCloseDate: string | null; ownershipStartedAt: string | null }) =>
      api.updateBuyerLifecycle(propertyId, input),
    onSuccess: () => { void refresh(); toast({ title: 'Timeline updated', description: 'Plan due dates were recalculated from the new lifecycle anchors.' }); },
  });
  const taskMutation = useMutation({
    mutationFn: ({ task, status, assignedToUserId }: { task: HomeBuyerTask; status?: HomeBuyerTaskStatus; assignedToUserId?: string | null }) =>
      api.updateHomeBuyerTask(propertyId, task.id, {
        ...(status ? { status } : {}),
        ...(assignedToUserId !== undefined ? { assignedToUserId } : {}),
        ...(status === 'COMPLETED' ? { completionEvidenceJson: { proofType: 'USER_ATTESTATION', confirmedAt: new Date().toISOString() } } : {}),
      }),
    onSuccess: () => void refresh(),
  });
  const findingMutation = useMutation({
    mutationFn: ({ findingId, disposition }: { findingId: string; disposition: Exclude<BuyerFindingDisposition, 'PENDING_REVIEW'> }) =>
      api.dispositionBuyerFinding(propertyId, findingId, { disposition }),
    onSuccess: (response) => {
      void refresh();
      toast({
        title: 'Finding classified',
        description: response.success && response.data.repairJourneyId ? 'The canonical major-repair journey and ownership-plan action were created.' : 'The finding decision and lineage were saved.',
      });
    },
  });
  const documentMutation = useMutation({
    mutationFn: ({ documentId, status }: { documentId: string; status: 'VERIFIED' | 'REJECTED' }) =>
      api.verifyBuyerDocument(propertyId, documentId, status),
    onSuccess: () => void refresh(),
  });
  const handoffMutation = useMutation({
    mutationFn: () => api.handoffBuyerPlan(propertyId),
    onSuccess: (response) => {
      void refresh();
      const result = response.success ? response.data : null;
      toast({ title: result?.handedOff ? 'Recurring Home handoff complete' : 'Handoff is not due yet', description: result?.handedOff ? `${result.taskCount} unresolved item(s) moved into recurring Home care.` : 'The plan will hand off on day 91 or when ownership becomes established.' });
    },
  });

  if (planQuery.isLoading) return <DashboardShell><div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div></DashboardShell>;
  if (planQuery.isError || !planQuery.data) return <DashboardShell><Card><CardContent className="py-8 text-sm text-destructive">{planQuery.error instanceof Error ? planQuery.error.message : 'Unable to load the buyer plan.'}</CardContent></Card></DashboardShell>;

  const plan = planQuery.data;
  const readiness = readinessQuery.data;
  const evidence = evidenceQuery.data;
  const acceptance = acceptanceQuery.data;
  const members = membersQuery.data ?? [];
  const completed = plan.tasks.filter((task) => task.status === 'COMPLETED').length;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button asChild variant="ghost" className="mb-2 -ml-3"><Link href={`/dashboard/properties/${propertyId}`}><ArrowLeft className="mr-2 h-4 w-4" />Back to Home</Link></Button>
            <h1 className="text-3xl font-bold">Your 90-day ownership plan</h1>
            <p className="mt-1 text-muted-foreground">Turn purchase evidence into owned, timed work for this home.</p>
          </div>
          <Badge variant={plan.status === 'ACTIVE' ? 'default' : 'secondary'}>{plan.status === 'HANDED_OFF' ? 'Handed off to Home' : `${completed} of ${plan.tasks.length} complete`}</Badge>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-lg">Purchase and ownership timeline</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-3" onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              lifecycleMutation.mutate({ targetCloseDate: isoFromDateInput(String(form.get('targetCloseDate') ?? '')), ownershipStartedAt: isoFromDateInput(String(form.get('ownershipStartedAt') ?? '')) });
            }}>
              <label className="space-y-1 text-sm"><span>Target closing date</span><Input name="targetCloseDate" type="date" defaultValue={dateInputValue(plan.targetCloseDate)} /></label>
              <label className="space-y-1 text-sm"><span>Ownership started</span><Input name="ownershipStartedAt" type="date" defaultValue={dateInputValue(plan.ownershipStartedAt)} /></label>
              <div className="flex items-end"><Button type="submit" disabled={lifecycleMutation.isPending}>Recalculate plan</Button></div>
            </form>
          </CardContent>
        </Card>

        {readiness && <Card className="border-blue-200 bg-blue-50/60"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileSearch className="h-5 w-5" />Evidence readiness</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-4"><div className="text-sm"><p className="font-medium">Next: {NEXT_STEP_LABELS[readiness.nextRecommendedStep]}</p><p className="text-muted-foreground">{readiness.inspectionReports.total} report(s), {readiness.inspectionReports.openMaterialFindings} open material finding(s), {readiness.documents.verified}/{readiness.documents.total} documents verified</p></div><div className="flex gap-2"><Button asChild variant="outline"><Link href={`/dashboard/properties/${propertyId}/inspection-hub`}>Import inspection</Link></Button><Button asChild variant="outline"><Link href={`/dashboard/vault?propertyId=${propertyId}`}>Import documents</Link></Button></div></CardContent></Card>}

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5" />Evidence and decisions</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {evidence?.reports.map((report) => <div key={report.id} className="space-y-3"><div className="flex items-center justify-between"><p className="font-semibold">{report.reportType.replace(/_/g, ' ')} · {new Date(report.inspectionDate).toLocaleDateString()}</p><Badge variant="outline">{report.status}</Badge></div>{report.findings.map((finding) => <div key={finding.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="max-w-3xl"><div className="flex gap-2"><Badge variant={finding.severity === 'SAFETY' ? 'destructive' : 'outline'}>{finding.severity}</Badge><Badge variant="secondary">{finding.buyerDisposition.replace(/_/g, ' ')}</Badge></div><p className="mt-2 font-medium">{finding.homeSystem.replace(/_/g, ' ')}</p><p className="mt-1 text-sm text-muted-foreground">{finding.inspectorDescription}</p>{finding.buyerRepairJourneyId && <Button asChild variant="link" className="h-auto p-0 pt-2"><Link href={`/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${finding.buyerRepairJourneyId}`}>Open major-repair journey</Link></Button>}</div><div className="flex max-w-md flex-wrap gap-2">{FINDING_DECISIONS.map((decision) => <Button key={decision.value} size="sm" variant={finding.buyerDisposition === decision.value ? 'default' : 'outline'} disabled={report.status !== 'CONFIRMED' || findingMutation.isPending} onClick={() => findingMutation.mutate({ findingId: finding.id, disposition: decision.value })}>{decision.label}</Button>)}</div></div></div>)}</div>)}
            {!evidence?.reports.length && <p className="text-sm text-muted-foreground">No inspection reports imported yet.</p>}
            <div className="border-t pt-4"><p className="mb-3 font-semibold">Property documents</p><div className="space-y-2">{evidence?.documents.map((document) => <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{document.name}</p><p className="text-xs text-muted-foreground">{document.type.replace(/_/g, ' ')} · {document.verificationStatus}</p></div><div className="flex gap-2"><Button size="sm" variant={document.verificationStatus === 'VERIFIED' ? 'default' : 'outline'} onClick={() => documentMutation.mutate({ documentId: document.id, status: 'VERIFIED' })}>Verify</Button><Button size="sm" variant="outline" onClick={() => documentMutation.mutate({ documentId: document.id, status: 'REJECTED' })}>Reject</Button></div></div>)}{!evidence?.documents.length && <p className="text-sm text-muted-foreground">No transaction, disclosure, or warranty documents imported yet.</p>}</div></div>
          </CardContent>
        </Card>

        {PHASES.map((phase) => <Card key={phase.key}><CardHeader><CardTitle>{phase.label}</CardTitle></CardHeader><CardContent className="space-y-3">{plan.tasks.filter((task) => task.phase === phase.key).map((task) => { const done = task.status === 'COMPLETED'; return <div key={task.id} className="flex flex-col justify-between gap-4 rounded-lg border p-4 lg:flex-row"><div className="flex gap-3">{done ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" /> : <Circle className="mt-0.5 h-5 w-5 text-muted-foreground" />}<div><p className="font-medium">{task.title}</p><p className="mt-1 text-sm text-muted-foreground">{task.description}</p><p className="mt-1 text-xs text-muted-foreground">{task.dueAt ? `Due ${new Date(task.dueAt).toLocaleDateString()}` : 'No due date'}{task.handedOffMaintenanceTaskId ? ' · In recurring Home feed' : ''}</p></div></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{task.priority}</Badge><select aria-label={`Assign ${task.title}`} className="h-9 rounded-md border bg-background px-2 text-sm" value={task.assignedToUserId ?? ''} onChange={(event) => taskMutation.mutate({ task, assignedToUserId: event.target.value || null })}><option value="">Unassigned</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName || `${member.user.firstName} ${member.user.lastName}`}</option>)}</select><Button size="sm" variant={done ? 'outline' : 'default'} disabled={taskMutation.isPending} onClick={() => taskMutation.mutate({ task, status: done ? 'PENDING' : 'COMPLETED' })}>{done ? 'Reopen' : 'Complete with evidence'}</Button></div></div>; })}</CardContent></Card>)}

        <Card className={acceptance?.acceptanceReady ? 'border-green-300' : ''}><CardHeader><CardTitle className="text-lg">Phase 5 continuity status</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="grid gap-2 sm:grid-cols-4"><p>Findings reviewed: {acceptance?.findings.reviewed ?? 0}/{acceptance?.findings.total ?? 0}</p><p>Material journeys: {acceptance?.findings.materialBranched ?? 0}/{acceptance?.findings.material ?? 0}</p><p>Documents verified: {acceptance?.documents.verified ?? 0}/{acceptance?.documents.total ?? 0}</p><p>Tasks assigned: {acceptance?.tasks.assigned ?? 0}/{acceptance?.tasks.total ?? 0}</p></div><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-muted-foreground">Day-91 handoff is automatically checked whenever the recurring Home feed or this plan opens.</p><Button variant="outline" onClick={() => handoffMutation.mutate()} disabled={handoffMutation.isPending || plan.status === 'HANDED_OFF'}>{plan.status === 'HANDED_OFF' ? 'Handoff complete' : 'Check handoff now'}</Button></div></CardContent></Card>
      </div>
    </DashboardShell>
  );
}
