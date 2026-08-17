'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, CheckCircle2, Circle, FileSearch, History, Loader2, SlidersHorizontal, Users } from 'lucide-react';
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
  BuyerPlanOverviewTask,
  HomeBuyerTaskStatus,
} from '@/types';
import { appendBuyerPlanReturnContext } from '@/lib/navigation/buyerReturnContext';
import { startBuyerNegotiationCase } from '../tools/negotiation-shield/negotiationShieldApi';

const PHASES: Array<{ key: BuyerPlanPhase; label: string }> = [
  { key: 'EXPLORING', label: 'Exploring' },
  { key: 'OFFER_CONTRACT', label: 'Offer & contract' },
  { key: 'DUE_DILIGENCE', label: 'Due diligence' },
  { key: 'CLOSING_PREP', label: 'Closing preparation' },
  { key: 'MOVE_IN', label: 'Move-in' },
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const propertyId = (Array.isArray(params.id) ? params.id[0] : params.id) as string;
  const returnTaskId = searchParams.get('taskId');
  const returnSection = searchParams.get('section');
  const restoredPositionRef = useRef(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedNegotiationFindingIds, setSelectedNegotiationFindingIds] = useState<string[]>([]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['buyer-plan-overview', propertyId] }),
      queryClient.invalidateQueries({ queryKey: ['buyer-import-readiness', propertyId] }),
      queryClient.invalidateQueries({ queryKey: ['buyer-evidence-review', propertyId] }),
      queryClient.invalidateQueries({ queryKey: ['buyer-acceptance', propertyId] }),
      queryClient.invalidateQueries({ queryKey: ['buyer-checklist-composition', propertyId] }),
    ]);
  };

  const overviewQuery = useQuery({
    queryKey: ['buyer-plan-overview', propertyId],
    queryFn: async () => {
      const response = await api.getBuyerPlanOverview(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load the Buyer Plan overview.');
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
  const acceptanceQuery = useQuery({
    queryKey: ['buyer-acceptance', propertyId],
    queryFn: async () => {
      const response = await api.getBuyerAcceptanceStatus(propertyId);
      if (!response.success) throw new Error(response.message);
      return response.data;
    },
    enabled: Boolean(propertyId),
  });
  const compositionQuery = useQuery({
    queryKey: ['buyer-checklist-composition', propertyId],
    queryFn: async () => {
      const response = await api.getBuyerChecklistComposition(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to tailor the closing checklist.');
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
    mutationFn: ({ task, status, assignedToUserId }: { task: BuyerPlanOverviewTask; status?: HomeBuyerTaskStatus; assignedToUserId?: string | null }) =>
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
  const negotiationMutation = useMutation({
    mutationFn: ({ findingIds }: { findingIds: string[] }) => startBuyerNegotiationCase(propertyId, {
      findingIds,
      requestType: 'REPAIR_OR_CREDIT',
    }),
    onSuccess: (detail) => {
      const finding = detail.buyerFindings[0];
      router.push(appendBuyerPlanReturnContext(
        `/dashboard/properties/${propertyId}/tools/negotiation-shield?caseId=${detail.case.id}`,
        { taskId: finding?.buyerTaskId, section: 'INSPECTION_DUE_DILIGENCE' },
      ));
      setSelectedNegotiationFindingIds([]);
    },
    onError: (error) => toast({
      title: 'Unable to open buyer negotiation',
      description: error instanceof Error ? error.message : 'Try again after confirming the inspection finding.',
      variant: 'destructive',
    }),
  });
  const handoffMutation = useMutation({
    mutationFn: () => api.handoffBuyerPlan(propertyId),
    onSuccess: (response) => {
      void refresh();
      const result = response.success ? response.data : null;
      toast({ title: result?.handedOff ? 'Recurring Home handoff complete' : 'Handoff is not due yet', description: result?.handedOff ? `${result.taskCount} unresolved item(s) moved into recurring Home care.` : 'The plan will hand off on day 91 or when ownership becomes established.' });
    },
  });
  const compositionMutation = useMutation({
    mutationFn: () => api.applyBuyerChecklistComposition(propertyId),
    onSuccess: (response) => {
      void refresh();
      if (!response.success) return;
      toast({
        title: 'Closing checklist updated',
        description: `${response.data.delta.added} item(s) added and ${response.data.delta.removed} item(s) removed from active progress. Your existing work was preserved.`,
      });
    },
  });

  useEffect(() => {
    if (restoredPositionRef.current || (!returnTaskId && !returnSection) || !overviewQuery.data) return;
    const targetTaskId = returnTaskId
      ?? overviewQuery.data.tasks.find((task) => task.checklistSection === returnSection)?.id;
    const target = targetTaskId ? document.getElementById(`buyer-task-${targetTaskId}`) : null;
    if (!target) return;
    restoredPositionRef.current = true;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [overviewQuery.data, returnSection, returnTaskId]);

  if (overviewQuery.isLoading) return <DashboardShell><div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div></DashboardShell>;
  if (overviewQuery.isError || !overviewQuery.data) return <DashboardShell><Card><CardContent className="py-8 text-sm text-destructive">{overviewQuery.error instanceof Error ? overviewQuery.error.message : 'Unable to load the buyer plan.'}</CardContent></Card></DashboardShell>;

  const overview = overviewQuery.data;
  const plan = { ...overview.plan, tasks: overview.tasks };
  const readiness = readinessQuery.data;
  const evidence = evidenceQuery.data;
  const acceptance = acceptanceQuery.data;
  const composition = compositionQuery.data;
  const members = overview.workload;
  const completed = overview.summary.completed;
  const readOnly = overview.accessRole === 'VIEWER';
  const inspectionTask = plan.tasks.find((task) => task.actionKey === 'buyer:inspection:import');
  const documentsTask = plan.tasks.find((task) => task.actionKey === 'buyer:closing:documents');
  const restoredTaskId = returnTaskId
    ?? plan.tasks.find((task) => task.checklistSection === returnSection)?.id;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button asChild variant="ghost" className="mb-2 -ml-3"><Link href={`/dashboard/properties/${propertyId}`}><ArrowLeft className="mr-2 h-4 w-4" />Back to Home</Link></Button>
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-bold">Closing Plan</h1><Badge variant="outline">{plan.stage.replace(/_/g, ' ')}</Badge></div>
            <p className="mt-1 text-muted-foreground">{overview.property.address}, {overview.property.city}, {overview.property.state} · one canonical plan from contract through handoff.</p>
          </div>
          <Badge variant={plan.status === 'ACTIVE' ? 'default' : 'secondary'}>{plan.status === 'HANDED_OFF' ? 'Handed off to Home' : `${completed} of ${overview.summary.total} complete`}</Badge>
        </div>

        {readOnly && <Card className="border-blue-200 bg-blue-50/60"><CardContent className="py-4 text-sm text-blue-950"><strong>View-only access.</strong> You can review tasks, milestones, contacts, evidence, and history, but only an owner or contributor can change this plan.</CardContent></Card>}

        {composition && <Card className="border-violet-200 bg-violet-50/40">
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><SlidersHorizontal className="h-5 w-5" />Property-aware closing checklist</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm font-medium">Preview: {composition.delta.added} add, {composition.delta.removed} remove, {composition.delta.unchanged} unchanged</p><p className="text-xs text-muted-foreground">Based on canonical property facts · {composition.templateVersion}. Unknown details stay outside active progress.</p></div>
              <Button disabled={readOnly || compositionMutation.isPending || (composition.delta.added === 0 && composition.delta.removed === 0)} onClick={() => compositionMutation.mutate()}>{compositionMutation.isPending ? 'Updating…' : 'Apply checklist changes'}</Button>
            </div>
            {composition.delta.addedItems.length > 0 && <div className="rounded-lg border bg-background p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items this will add</p><ul className="mt-2 space-y-1 text-sm">{composition.delta.addedItems.slice(0, 5).map((item) => <li key={item.actionKey}>+ {item.title}</li>)}</ul>{composition.delta.addedItems.length > 5 && <p className="mt-2 text-xs text-muted-foreground">+ {composition.delta.addedItems.length - 5} more</p>}</div>}
            {composition.questions.length > 0 && <div><p className="text-sm font-medium">Details that could improve this checklist</p><div className="mt-2 grid gap-2 md:grid-cols-2">{composition.questions.slice(0, 4).map((question) => <div key={question.factKey} className="rounded-lg border bg-background p-3"><p className="text-sm font-medium">{question.prompt}</p><p className="mt-1 text-xs text-muted-foreground"><strong>Why we ask:</strong> {question.whyWeAsk}</p>{question.correctionPath && <Button asChild variant="link" className="h-auto p-0 pt-2 text-xs"><Link href={question.correctionPath}>Update property detail</Link></Button>}</div>)}</div></div>}
          </CardContent>
        </Card>}

        <div className="grid gap-3 sm:grid-cols-4">
          <Card><CardContent className="py-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Progress</p><p className="mt-1 text-2xl font-semibold">{overview.summary.progressPercent}%</p></CardContent></Card>
          <Card><CardContent className="py-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">In progress</p><p className="mt-1 text-2xl font-semibold">{overview.summary.inProgress}</p></CardContent></Card>
          <Card><CardContent className="py-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Blocked</p><p className="mt-1 text-2xl font-semibold">{overview.summary.blocked}</p></CardContent></Card>
          <Card><CardContent className="py-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Next move</p><p className="mt-1 line-clamp-2 text-sm font-semibold">{overview.nextAction?.title ?? 'Review closing readiness'}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-lg">Purchase and ownership timeline</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-3" onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              lifecycleMutation.mutate({ targetCloseDate: isoFromDateInput(String(form.get('targetCloseDate') ?? '')), ownershipStartedAt: isoFromDateInput(String(form.get('ownershipStartedAt') ?? '')) });
            }}>
              <label className="space-y-1 text-sm"><span>Target closing date</span><Input name="targetCloseDate" type="date" defaultValue={dateInputValue(plan.targetCloseDate)} disabled={readOnly} /></label>
              <label className="space-y-1 text-sm"><span>Ownership started</span><Input name="ownershipStartedAt" type="date" defaultValue={dateInputValue(plan.ownershipStartedAt)} disabled={readOnly} /></label>
              <div className="flex items-end"><Button type="submit" disabled={readOnly || lifecycleMutation.isPending}>Recalculate plan</Button></div>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5" />Milestones</CardTitle></CardHeader><CardContent className="space-y-2">{overview.milestones.slice(0, 6).map((milestone) => <div key={milestone.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><p className="text-sm font-medium">{milestone.label}</p><p className="text-xs text-muted-foreground">{milestone.dueAt ? new Date(milestone.dueAt).toLocaleDateString() : 'Date not set'}</p></div><Badge variant="outline">{milestone.status.replace(/_/g, ' ')}</Badge></div>)}{overview.milestones.length === 0 && <p className="text-sm text-muted-foreground">No milestones recorded yet.</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5" />Workload & contacts</CardTitle></CardHeader><CardContent className="space-y-3">{overview.workload.map((member) => <div key={member.userId} className="flex items-center justify-between text-sm"><span>{member.displayName || `${member.firstName} ${member.lastName}`}</span><Badge variant="secondary">{member.assignedTaskCount} assigned</Badge></div>)}<div className="border-t pt-3">{overview.contacts.map((contact) => <p key={contact.id} className="text-sm"><span className="font-medium">{contact.name}</span> <span className="text-muted-foreground">· {contact.role.replace(/_/g, ' ')}</span></p>)}{overview.contacts.length === 0 && <p className="text-sm text-muted-foreground">No transaction contacts saved yet.</p>}</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><History className="h-5 w-5" />Recent plan history</CardTitle></CardHeader><CardContent className="space-y-3">{overview.history.slice(0, 6).map((item) => <div key={item.id}><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.status.replace(/_/g, ' ')} · {new Date(item.occurredAt).toLocaleDateString()}</p></div>)}</CardContent></Card>
        </div>

        {readiness && <Card className="border-blue-200 bg-blue-50/60"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileSearch className="h-5 w-5" />Evidence readiness</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-4"><div className="text-sm"><p className="font-medium">Next: {NEXT_STEP_LABELS[readiness.nextRecommendedStep]}</p><p className="text-muted-foreground">{readiness.inspectionReports.total} report(s), {readiness.inspectionReports.openMaterialFindings} open material finding(s), {readiness.documents.verified}/{readiness.documents.total} documents verified</p></div><div className="flex gap-2"><Button asChild variant="outline"><Link href={appendBuyerPlanReturnContext(`/dashboard/properties/${propertyId}/inspection-hub`, { taskId: inspectionTask?.id, section: 'INSPECTION_DUE_DILIGENCE' })}>Import inspection</Link></Button><Button asChild variant="outline"><Link href={appendBuyerPlanReturnContext(`/dashboard/properties/${propertyId}/documents?action=upload`, { taskId: documentsTask?.id, section: 'CLOSING_DISCLOSURE_FUNDS' })}>Import documents</Link></Button></div></CardContent></Card>}

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5" />Evidence and decisions</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {selectedNegotiationFindingIds.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3"><p className="text-sm font-medium">{selectedNegotiationFindingIds.length} finding(s) selected for one negotiation request</p><Button disabled={negotiationMutation.isPending} onClick={() => negotiationMutation.mutate({ findingIds: selectedNegotiationFindingIds })}>{negotiationMutation.isPending ? 'Opening…' : 'Open grouped negotiation'}</Button></div>}
            {evidence?.reports.map((report) => <div key={report.id} className="space-y-3"><div className="flex items-center justify-between"><p className="font-semibold">{report.reportType.replace(/_/g, ' ')} · {new Date(report.inspectionDate).toLocaleDateString()}</p><Badge variant="outline">{report.status}</Badge></div>{report.findings.map((finding) => <div key={finding.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="max-w-3xl"><div className="flex gap-2"><Badge variant={finding.severity === 'SAFETY' ? 'destructive' : 'outline'}>{finding.severity}</Badge><Badge variant="secondary">{finding.buyerDisposition.replace(/_/g, ' ')}</Badge></div><p className="mt-2 font-medium">{finding.homeSystem.replace(/_/g, ' ')}</p><p className="mt-1 text-sm text-muted-foreground">{finding.inspectorDescription}</p>{finding.buyerOutcomeDocument && <p className="mt-2 text-xs text-muted-foreground">Outcome evidence: <span className="font-medium text-foreground">{finding.buyerOutcomeDocument.name}</span> · {finding.buyerOutcomeDocument.verificationStatus.replace(/_/g, ' ').toLowerCase()}</p>}<div className="flex flex-wrap gap-2">{finding.buyerDisposition === 'PRE_CLOSE_NEGOTIATION' && <Button variant="link" className="h-auto p-0 pt-2" disabled={negotiationMutation.isPending} onClick={() => setSelectedNegotiationFindingIds((current) => current.includes(finding.id) ? current.filter((id) => id !== finding.id) : [...current, finding.id])}>{selectedNegotiationFindingIds.includes(finding.id) ? 'Remove from negotiation' : 'Add to negotiation'}</Button>}{finding.buyerRepairJourneyId && <Button asChild variant="link" className="h-auto p-0 pt-2"><Link href={`/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${finding.buyerRepairJourneyId}`}>Open major-repair journey</Link></Button>}</div></div><div className="flex max-w-md flex-wrap gap-2">{FINDING_DECISIONS.map((decision) => <Button key={decision.value} size="sm" variant={finding.buyerDisposition === decision.value ? 'default' : 'outline'} disabled={readOnly || report.status !== 'CONFIRMED' || findingMutation.isPending} onClick={() => findingMutation.mutate({ findingId: finding.id, disposition: decision.value })}>{decision.label}</Button>)}</div></div></div>)}</div>)}
            {!evidence?.reports.length && <p className="text-sm text-muted-foreground">No inspection reports imported yet.</p>}
            <div className="border-t pt-4"><p className="mb-3 font-semibold">Property documents</p><div className="space-y-2">{evidence?.documents.map((document) => <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{document.name}</p><p className="text-xs text-muted-foreground">{document.type.replace(/_/g, ' ')} · {document.verificationStatus}</p></div><div className="flex gap-2"><Button size="sm" variant={document.verificationStatus === 'VERIFIED' ? 'default' : 'outline'} disabled={readOnly} onClick={() => documentMutation.mutate({ documentId: document.id, status: 'VERIFIED' })}>Verify</Button><Button size="sm" variant="outline" disabled={readOnly} onClick={() => documentMutation.mutate({ documentId: document.id, status: 'REJECTED' })}>Reject</Button></div></div>)}{!evidence?.documents.length && <p className="text-sm text-muted-foreground">No transaction, disclosure, or warranty documents imported yet.</p>}</div></div>
          </CardContent>
        </Card>

        {PHASES.map((phase) => <Card key={phase.key}><CardHeader><CardTitle>{phase.label}</CardTitle></CardHeader><CardContent className="space-y-3">{plan.tasks.filter((task) => task.phase === phase.key).map((task) => { const done = task.status === 'COMPLETED'; const restored = task.id === restoredTaskId; return <div id={`buyer-task-${task.id}`} key={task.id} className={`flex flex-col justify-between gap-4 rounded-lg border p-4 lg:flex-row ${restored ? 'border-blue-400 bg-blue-50/60 ring-2 ring-blue-100' : ''}`}><div className="flex gap-3">{done ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" /> : <Circle className="mt-0.5 h-5 w-5 text-muted-foreground" />}<div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{task.title}</p>{task.templateKey && <Badge variant="secondary">Plan template</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{task.description}</p><p className="mt-1 text-xs text-muted-foreground">{task.dueAt ? `Due ${new Date(task.dueAt).toLocaleDateString()}` : 'No due date'}{task.handedOffMaintenanceTaskId ? ' · In recurring Home feed' : ''}</p></div></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{task.priority}</Badge><select aria-label={`Assign ${task.title}`} className="h-9 rounded-md border bg-background px-2 text-sm" value={task.assignedToUserId ?? ''} disabled={readOnly} onChange={(event) => taskMutation.mutate({ task, assignedToUserId: event.target.value || null })}><option value="">Unassigned</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName || `${member.firstName} ${member.lastName}`}</option>)}</select><Button size="sm" variant={done ? 'outline' : 'default'} disabled={readOnly || taskMutation.isPending} onClick={() => taskMutation.mutate({ task, status: done ? 'PENDING' : 'COMPLETED' })}>{done ? 'Reopen' : 'Mark complete'}</Button></div></div>; })}</CardContent></Card>)}

        <Card className={acceptance?.acceptanceReady ? 'border-green-300' : ''}><CardHeader><CardTitle className="text-lg">Continuity status</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="grid gap-2 sm:grid-cols-4"><p>Findings reviewed: {acceptance?.findings.reviewed ?? 0}/{acceptance?.findings.total ?? 0}</p><p>Material journeys: {acceptance?.findings.materialBranched ?? 0}/{acceptance?.findings.material ?? 0}</p><p>Documents verified: {acceptance?.documents.verified ?? 0}/{acceptance?.documents.total ?? 0}</p><p>Tasks assigned: {acceptance?.tasks.assigned ?? 0}/{acceptance?.tasks.total ?? 0}</p></div><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-muted-foreground">Day-91 handoff is automatically checked whenever the recurring Home feed or this plan opens.</p><Button variant="outline" onClick={() => handoffMutation.mutate()} disabled={readOnly || handoffMutation.isPending || plan.status === 'HANDED_OFF'}>{plan.status === 'HANDED_OFF' ? 'Handoff complete' : 'Check handoff now'}</Button></div></CardContent></Card>
      </div>
    </DashboardShell>
  );
}
