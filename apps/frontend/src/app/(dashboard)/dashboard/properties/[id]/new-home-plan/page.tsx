'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, CalendarClock, CheckCircle2, Circle, FileCheck2, Home, Loader2, ShieldCheck } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api/client';
import { useToast } from '@/components/ui/use-toast';
import type { NewHomeDocumentAvailability, NewHomePlanPhase, NewHomeSetupTask } from '@/types';

const PHASES: Array<{ key: NewHomePlanPhase; label: string }> = [
  { key: 'WALKTHROUGH', label: 'Walkthrough and punch list' },
  { key: 'FIRST_30_DAYS', label: 'First 30 days' },
  { key: 'DAYS_31_TO_90', label: 'Days 31–90' },
  { key: 'FIRST_YEAR', label: 'First-year protection' },
  { key: 'RECURRING_HOME', label: 'Recurring Home handoff' },
];

function toIso(value: string) {
  return value ? new Date(`${value}T12:00:00.000Z`).toISOString() : null;
}

function scoreOptions() {
  return [1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>);
}

export default function NewHomePlanPage() {
  const params = useParams();
  const propertyId = (Array.isArray(params.id) ? params.id[0] : params.id) as string;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['new-home-setup', propertyId];

  const overviewQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await api.getNewHomeSetupOverview(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load the new-home plan.');
      return response.data;
    },
    enabled: Boolean(propertyId),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const assessmentMutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const values = new FormData(form);
      const response = await api.assessNewHomePilot(propertyId, {
        demandScore: Number(values.get('demandScore')),
        documentAvailability: values.get('documentAvailability') as NewHomeDocumentAvailability,
        builderFollowupPainScore: Number(values.get('builderFollowupPainScore')),
        engagementIntentScore: Number(values.get('engagementIntentScore')),
        channelSource: String(values.get('channelSource') || '').trim() || null,
        estimatedAcquisitionCents: values.get('estimatedAcquisitionDollars')
          ? Math.round(Number(values.get('estimatedAcquisitionDollars')) * 100)
          : null,
      });
      if (!response.success) throw new Error(response.message);
      return response.data;
    },
    onSuccess: async (assessment) => {
      await refresh();
      toast({
        title: assessment.decision === 'ELIGIBLE' ? 'Selective pilot enabled' : 'Pilot gate recorded',
        description: assessment.decision === 'ELIGIBLE'
          ? 'This property can now start its evidence-led new-home plan.'
          : 'The signals were saved. The specialized plan remains on hold.',
      });
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const response = await api.getNewHomeSetupPlan(propertyId);
      if (!response.success) throw new Error(response.message);
      return response.data;
    },
    onSuccess: async () => { await refresh(); },
  });

  const lifecycleMutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const values = new FormData(form);
      const response = await api.updateNewHomeLifecycle(propertyId, {
        targetMoveInDate: toIso(String(values.get('targetMoveInDate') || '')),
        ownershipStartedAt: toIso(String(values.get('ownershipStartedAt') || '')),
        builderWarrantyEndsAt: toIso(String(values.get('builderWarrantyEndsAt') || '')),
        oneYearInspectionDueAt: toIso(String(values.get('oneYearInspectionDueAt') || '')),
      });
      if (!response.success) throw new Error(response.message);
    },
    onSuccess: async () => { await refresh(); toast({ title: 'New-home deadlines updated' }); },
  });

  const taskMutation = useMutation({
    mutationFn: async (task: NewHomeSetupTask) => {
      const completing = task.status !== 'COMPLETED';
      const response = await api.updateNewHomeTask(propertyId, task.id, {
        status: completing ? 'COMPLETED' : 'IN_PROGRESS',
        completionEvidence: completing
          ? { proofType: 'USER_ATTESTATION', attestedAt: new Date().toISOString(), actionKey: task.actionKey }
          : null,
      });
      if (!response.success) throw new Error(response.message);
    },
    onSuccess: async () => { await refresh(); },
  });

  const punchMutation = useMutation({ mutationFn: async (form: HTMLFormElement) => { const values = new FormData(form); const evidenceDocumentId = String(values.get('evidenceDocumentId') || ''); const response = await api.createNewHomePunchListItem(propertyId, { title: String(values.get('title')), description: String(values.get('description') || '') || null, location: String(values.get('location') || '') || null, priority: String(values.get('priority')) as 'NOW' | 'SOON' | 'PLAN' | 'CONSIDER', promisedBy: toIso(String(values.get('promisedBy') || '')), evidenceDocumentIds: evidenceDocumentId ? [evidenceDocumentId] : [] }); if (!response.success) throw new Error(response.message); }, onSuccess: async () => { await refresh(); toast({ title: 'Punch-list item added' }); } });
  const warrantyMutation = useMutation({ mutationFn: async (form: HTMLFormElement) => { const values = new FormData(form); const response = await api.createNewHomeWarrantyRight(propertyId, { coverageTitle: String(values.get('coverageTitle')), coverageSummary: String(values.get('coverageSummary')), expiresAt: toIso(String(values.get('expiresAt')))!, noticeDeadlineAt: toIso(String(values.get('noticeDeadlineAt') || '')), sourceCitation: String(values.get('sourceCitation')), verified: values.get('verified') === 'on' }); if (!response.success) throw new Error(response.message); }, onSuccess: async () => { await refresh(); toast({ title: 'Warranty right recorded' }); } });
  const warrantyDocumentMutation = useMutation({ mutationFn: async (form: HTMLFormElement) => { const values = new FormData(form); const response = await api.promoteNewHomeWarrantyDocument(propertyId, { documentId: String(values.get('documentId')), sourceCitation: String(values.get('sourceCitation')) }); if (!response.success) throw new Error(response.message); }, onSuccess: async () => { await refresh(); toast({ title: 'Warranty terms extracted for review' }); } });
  const warrantyVerifyMutation = useMutation({ mutationFn: async (rightId: string) => { const response = await api.verifyNewHomeWarrantyRight(propertyId, rightId); if (!response.success) throw new Error(response.message); }, onSuccess: async () => { await refresh(); toast({ title: 'Warranty terms verified and deadline promoted' }); } });
  const evidenceMutation = useMutation({ mutationFn: async (form: HTMLFormElement) => { const values = new FormData(form); const response = await api.addNewHomeEvidence(propertyId, { evidenceType: String(values.get('evidenceType')) as 'PERMIT' | 'FINAL_INSPECTION' | 'COMMISSIONING' | 'MANUAL' | 'CERTIFICATE' | 'PHOTO' | 'OTHER', label: String(values.get('label')), sourceCitation: String(values.get('sourceCitation') || '') || null, verified: values.get('verified') === 'on' }); if (!response.success) throw new Error(response.message); }, onSuccess: async () => { await refresh(); toast({ title: 'Evidence recorded' }); } });
  const registrationMutation = useMutation({ mutationFn: async (form: HTMLFormElement) => { const values = new FormData(form); const response = await api.upsertNewHomeRegistration(propertyId, { inventoryItemId: String(values.get('inventoryItemId')), manufacturer: String(values.get('manufacturer')), modelNumber: String(values.get('modelNumber')), serialNumber: String(values.get('serialNumber')), status: String(values.get('status')) as 'NOT_STARTED' | 'SUBMITTED' | 'CONFIRMED' | 'NOT_REQUIRED' }); if (!response.success) throw new Error(response.message); }, onSuccess: async () => { await refresh(); toast({ title: 'System registration saved' }); } });
  const bundlesMutation = useMutation({ mutationFn: async () => { const response = await api.ensureNewHomeInspectionBundles(propertyId); if (!response.success) throw new Error(response.message); }, onSuccess: async () => { await refresh(); } });
  const builderResponseMutation = useMutation({ mutationFn: async ({ itemId, responseType, message, promisedBy, verifyClosure }: { itemId: string; responseType: 'COMMENT' | 'ACKNOWLEDGED' | 'SCHEDULED' | 'REJECTED' | 'RESOLVED'; message: string | null; promisedBy: string | null; verifyClosure: boolean }) => { const response = await api.addNewHomeBuilderResponse(propertyId, itemId, { responseType, verifyClosure, message, promisedBy }); if (!response.success) throw new Error(response.message); }, onSuccess: async () => { await refresh(); } });
  const bundleUpdateMutation = useMutation({ mutationFn: async ({ bundleId, status, inspectionReportId }: { bundleId: string; status: 'PREPARING' | 'READY' | 'COMPLETED'; inspectionReportId: string | null }) => { const response = await api.updateNewHomeInspectionBundle(propertyId, bundleId, { status, inspectionReportId }); if (!response.success) throw new Error(response.message); }, onSuccess: async () => { await refresh(); toast({ title: 'Inspection preparation updated' }); } });

  if (overviewQuery.isLoading) return <DashboardShell><div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div></DashboardShell>;
  if (overviewQuery.isError || !overviewQuery.data) return <DashboardShell><Card><CardContent className="p-6">{overviewQuery.error instanceof Error ? overviewQuery.error.message : 'Unable to load this plan.'}</CardContent></Card></DashboardShell>;

  const { assessment, plan, evidence } = overviewQuery.data;
  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        <div>
          <Button asChild variant="ghost" className="mb-2 px-0"><Link href={`/dashboard/properties/${propertyId}`}>← Property</Link></Button>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h1 className="text-3xl font-bold">New-home setup and warranty protection</h1><p className="mt-1 max-w-3xl text-muted-foreground">Protect builder rights, capture early evidence, register systems, and establish maintenance without inventing property history.</p></div>
            <Badge variant={assessment?.admissionDecision === 'ADMITTED' ? 'default' : 'outline'}>{assessment ? `${assessment.decision.replace(/_/g, ' ')} · ${assessment.admissionDecision.replace(/_/g, ' ')}` : 'PILOT GATE PENDING'}</Badge>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="p-4"><FileCheck2 className="mb-2 h-5 w-5" /><p className="text-2xl font-semibold">{evidence.documents.verified}/{evidence.documents.total}</p><p className="text-sm text-muted-foreground">Verified documents</p></CardContent></Card>
          <Card><CardContent className="p-4"><ShieldCheck className="mb-2 h-5 w-5" /><p className="text-2xl font-semibold">{evidence.warranties}</p><p className="text-sm text-muted-foreground">Warranty records</p></CardContent></Card>
          <Card><CardContent className="p-4"><BadgeCheck className="mb-2 h-5 w-5" /><p className="text-2xl font-semibold">{evidence.inventory.modelAndSerialCaptured}/{evidence.inventory.total}</p><p className="text-sm text-muted-foreground">Systems identified</p></CardContent></Card>
          <Card><CardContent className="p-4"><Home className="mb-2 h-5 w-5" /><p className="text-2xl font-semibold">{evidence.inspections}</p><p className="text-sm text-muted-foreground">Inspection records</p></CardContent></Card>
        </div>

        {!assessment || assessment.decision !== 'ELIGIBLE' || assessment.admissionDecision === 'REJECTED' ? (
          <Card>
            <CardHeader><CardTitle>Selective pilot gate</CardTitle></CardHeader>
            <CardContent>
              <p className="mb-5 text-sm text-muted-foreground">This validates demand, available evidence, builder follow-up pain, willingness to engage, and channel economics before activating the specialized path.</p>
              <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); assessmentMutation.mutate(event.currentTarget); }}>
                <Label>Need for this workflow (1–5)<select name="demandScore" defaultValue={assessment?.demandScore ?? 3} className="mt-1 h-10 w-full rounded-md border bg-background px-3">{scoreOptions()}</select></Label>
                <Label>Builder follow-up pain (1–5)<select name="builderFollowupPainScore" defaultValue={assessment?.builderFollowupPainScore ?? 3} className="mt-1 h-10 w-full rounded-md border bg-background px-3">{scoreOptions()}</select></Label>
                <Label>Willingness to use the plan (1–5)<select name="engagementIntentScore" defaultValue={assessment?.engagementIntentScore ?? 3} className="mt-1 h-10 w-full rounded-md border bg-background px-3">{scoreOptions()}</select></Label>
                <Label>Document availability<select name="documentAvailability" defaultValue={assessment?.documentAvailability ?? 'SOME'} className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="NONE">None</option><option value="SOME">Some</option><option value="COMPLETE">Complete handover package</option></select></Label>
                <Label>Channel/source<Input name="channelSource" defaultValue={assessment?.channelSource ?? ''} placeholder="Builder, realtor, direct, partner" /></Label>
                <Label>Estimated acquisition cost ($)<Input name="estimatedAcquisitionDollars" type="number" min="0" defaultValue={assessment?.estimatedAcquisitionCents ? assessment.estimatedAcquisitionCents / 100 : ''} /></Label>
                <div className="md:col-span-2"><Button type="submit" disabled={assessmentMutation.isPending}>{assessmentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Evaluate pilot fit</Button></div>
              </form>
              {assessment?.decisionReasons.length ? <p className="mt-4 text-sm text-amber-700">On hold: {assessment.decisionReasons.map((reason) => reason.toLowerCase().replace(/_/g, ' ')).join('; ')}.</p> : null}
            </CardContent>
          </Card>
        ) : assessment.admissionDecision !== 'ADMITTED' ? (
          <Card className="border-blue-200 bg-blue-50/60"><CardHeader><CardTitle>Qualified · awaiting controlled-cohort admission</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Your demand and evidence signals qualify for consideration. A pilot operator must assign this property to a named cohort before the specialized plan can start; qualification never self-enrolls a home.</p></CardContent></Card>
        ) : !plan ? (
          <Card><CardHeader><CardTitle>Pilot gate passed</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">Start the property-scoped plan with builder, household, evidence, and deadline responsibilities.</p><Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>Start new-home plan</Button></CardContent></Card>
        ) : (
          <>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" />Lifecycle and warranty anchors</CardTitle></CardHeader>
              <CardContent><form className="grid gap-4 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); lifecycleMutation.mutate(event.currentTarget); }}>
                {([['targetMoveInDate', 'Target move-in', plan.targetMoveInDate], ['ownershipStartedAt', 'Ownership started', plan.ownershipStartedAt], ['builderWarrantyEndsAt', 'Builder warranty ends', plan.builderWarrantyEndsAt], ['oneYearInspectionDueAt', 'One-year inspection due', plan.oneYearInspectionDueAt]] as const).map(([name, label, value]) => <Label key={name}>{label}<Input name={name} type="date" defaultValue={value?.slice(0, 10) ?? ''} /></Label>)}
                <div className="md:col-span-4"><Button type="submit" variant="outline">Save deadlines</Button></div>
              </form></CardContent>
            </Card>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card><CardHeader><CardTitle>Punch list and builder follow-up</CardTitle></CardHeader><CardContent className="space-y-4"><form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); punchMutation.mutate(event.currentTarget); }}><Input required name="title" placeholder="Defect or incomplete work" /><div className="grid gap-3 sm:grid-cols-2"><Input name="location" placeholder="Location" /><Input name="promisedBy" type="date" /></div><Input name="description" placeholder="Evidence and expected correction" /><select name="evidenceDocumentId" className="h-10 rounded-md border bg-background px-3"><option value="">No attached photo/document</option>{overviewQuery.data.documentCandidates.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}</select><select name="priority" defaultValue="SOON" className="h-10 rounded-md border bg-background px-3"><option>NOW</option><option>SOON</option><option>PLAN</option><option>CONSIDER</option></select><Button type="submit">Add punch-list item</Button></form>{overviewQuery.data.punchList.map((item) => <div key={item.id} className="space-y-3 rounded-md border p-3"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{item.title}</p><Badge variant="outline">{item.status}</Badge></div><p className="text-sm text-muted-foreground">{item.location || 'Location not recorded'}{item.promisedBy ? ` · promised ${new Date(item.promisedBy).toLocaleDateString()}` : ''}</p>{item.responses.length > 0 && <div className="space-y-2 border-l-2 pl-3">{item.responses.map((response) => <div key={response.id} className="text-xs"><p className="font-medium">{response.responseType.replace(/_/g, ' ')} · {new Date(response.createdAt).toLocaleDateString()}</p>{response.message && <p className="text-muted-foreground">{response.message}</p>}{response.promisedBy && <p className="text-muted-foreground">Promised by {new Date(response.promisedBy).toLocaleDateString()}</p>}</div>)}</div>}{item.status !== 'CLOSED' && <form className="grid gap-2 rounded-md bg-muted/40 p-2" onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); const responseType = String(values.get('responseType')) as 'COMMENT' | 'ACKNOWLEDGED' | 'SCHEDULED' | 'REJECTED' | 'RESOLVED'; builderResponseMutation.mutate({ itemId: item.id, responseType, message: String(values.get('message') || '') || null, promisedBy: toIso(String(values.get('promisedBy') || '')), verifyClosure: values.get('verifyClosure') === 'on' }); }}><select name="responseType" className="h-9 rounded-md border bg-background px-2"><option>COMMENT</option><option>ACKNOWLEDGED</option><option>SCHEDULED</option><option>REJECTED</option><option>RESOLVED</option></select><Input name="message" placeholder="Builder update, dispute, or resolution details" /><Input name="promisedBy" type="date" /><Label className="flex items-center gap-2 text-xs"><input name="verifyClosure" type="checkbox" />Homeowner verified closure (use with Resolved)</Label><Button size="sm" type="submit">Record response</Button></form>}</div>)}</CardContent></Card>
              <Card><CardHeader><CardTitle>Warranty rights and deadlines</CardTitle></CardHeader><CardContent className="space-y-4">{overviewQuery.data.documentCandidates.length > 0 && <form className="grid gap-3 rounded-md border p-3" onSubmit={(event) => { event.preventDefault(); warrantyDocumentMutation.mutate(event.currentTarget); }}><p className="text-sm font-medium">Extract from an analyzed document</p><select required name="documentId" className="h-10 rounded-md border bg-background px-3"><option value="">Select document</option>{overviewQuery.data.documentCandidates.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}</select><Input required name="sourceCitation" placeholder="Page/section containing the terms" /><Button type="submit" variant="outline">Extract terms for review</Button></form>}<form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); warrantyMutation.mutate(event.currentTarget); }}><Input required name="coverageTitle" placeholder="Coverage right" /><Input required name="coverageSummary" placeholder="Covered work and exclusions" /><div className="grid gap-3 sm:grid-cols-2"><Label>Expires<Input required name="expiresAt" type="date" /></Label><Label>Notice deadline<Input name="noticeDeadlineAt" type="date" /></Label></div><Input required name="sourceCitation" placeholder="Document and page/section citation" /><Label className="flex items-center gap-2"><input name="verified" type="checkbox" />Terms verified against source</Label><Button type="submit">Record warranty right</Button></form>{overviewQuery.data.warrantyRights.map((right) => <div key={right.id} className="rounded-md border p-3"><div className="flex justify-between gap-2"><p className="font-medium">{right.coverageTitle}</p><Badge>{right.status}</Badge></div><p className="text-sm text-muted-foreground">Expires {new Date(right.expiresAt).toLocaleDateString()} · {right.sourceCitation}</p>{right.status === 'DRAFT' && <Button className="mt-2" size="sm" onClick={() => warrantyVerifyMutation.mutate(right.id)}>Verify cited terms</Button>}</div>)}</CardContent></Card>
              <Card><CardHeader><CardTitle>System registration</CardTitle></CardHeader><CardContent className="space-y-4"><form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); registrationMutation.mutate(event.currentTarget); }}><select required name="inventoryItemId" className="h-10 rounded-md border bg-background px-3"><option value="">Select inventory item</option>{overviewQuery.data.inventoryCandidates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="grid gap-3 sm:grid-cols-3"><Input required name="manufacturer" placeholder="Manufacturer" /><Input required name="modelNumber" placeholder="Model" /><Input required name="serialNumber" placeholder="Serial" /></div><select name="status" defaultValue="CONFIRMED" className="h-10 rounded-md border bg-background px-3"><option>NOT_STARTED</option><option>SUBMITTED</option><option>CONFIRMED</option><option>NOT_REQUIRED</option></select><Button type="submit">Save registration</Button></form>{overviewQuery.data.registrations.map((item) => <p key={item.id} className="rounded-md border p-3 text-sm">{item.manufacturer} {item.modelNumber} · {item.status}</p>)}</CardContent></Card>
              <Card><CardHeader><CardTitle>Permit and commissioning evidence</CardTitle></CardHeader><CardContent className="space-y-4"><form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); evidenceMutation.mutate(event.currentTarget); }}><select name="evidenceType" className="h-10 rounded-md border bg-background px-3"><option>PERMIT</option><option>FINAL_INSPECTION</option><option>COMMISSIONING</option><option>MANUAL</option><option>CERTIFICATE</option><option>PHOTO</option><option>OTHER</option></select><Input required name="label" placeholder="Evidence label" /><Input name="sourceCitation" placeholder="Document/page or issuing authority" /><Label className="flex items-center gap-2"><input name="verified" type="checkbox" />Verified</Label><Button type="submit">Add evidence</Button></form>{overviewQuery.data.evidenceRecords.map((record) => <p key={record.id} className="rounded-md border p-3 text-sm">{record.evidenceType.replace(/_/g, ' ')} · {record.label} · {record.verifiedAt ? 'Verified' : 'Unverified'}</p>)}</CardContent></Card>
            </div>
            <Card><CardHeader><CardTitle>Inspection preparation bundles</CardTitle></CardHeader><CardContent className="space-y-3">{!overviewQuery.data.inspectionBundles.length && <Button onClick={() => bundlesMutation.mutate()}>Generate 30-day, 90-day, and one-year bundles</Button>}{overviewQuery.data.inspectionBundles.map((bundle) => <div key={bundle.id} className="rounded-md border p-4"><div className="flex justify-between"><p className="font-medium">{bundle.milestone.replace(/_/g, ' ')}</p><Badge variant="outline">{bundle.status}</Badge></div><p className="text-sm text-muted-foreground">Due {new Date(bundle.dueAt).toLocaleDateString()}</p><ul className="mt-2 list-disc pl-5 text-sm">{bundle.checklistJson.map((item) => <li key={item}>{item}</li>)}</ul><form className="mt-3 grid gap-2 sm:grid-cols-3" onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); bundleUpdateMutation.mutate({ bundleId: bundle.id, status: String(values.get('status')) as 'PREPARING' | 'READY' | 'COMPLETED', inspectionReportId: String(values.get('inspectionReportId') || '') || null }); }}><select name="status" defaultValue={bundle.status} className="h-9 rounded-md border bg-background px-2"><option>PREPARING</option><option>READY</option><option>COMPLETED</option></select><select name="inspectionReportId" defaultValue={bundle.inspectionReportId ?? ''} className="h-9 rounded-md border bg-background px-2"><option value="">No linked report</option>{overviewQuery.data.inspectionCandidates.map((report) => <option key={report.id} value={report.id}>{report.reportType.replace(/_/g, ' ')} · {new Date(report.inspectionDate).toLocaleDateString()}</option>)}</select><Button size="sm" type="submit">Update bundle</Button></form></div>)}</CardContent></Card>
            {PHASES.map((phase) => {
              const tasks = plan.tasks.filter((task) => task.phase === phase.key);
              return <Card key={phase.key}><CardHeader><CardTitle>{phase.label}</CardTitle></CardHeader><CardContent className="space-y-3">{tasks.map((task) => <div key={task.id} className="flex items-start gap-3 rounded-lg border p-4"><button aria-label={`Toggle ${task.title}`} onClick={() => taskMutation.mutate(task)} disabled={taskMutation.isPending}>{task.status === 'COMPLETED' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5" />}</button><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><p className="font-medium">{task.title}</p><Badge variant="outline">{task.priority}</Badge><Badge variant="secondary">{task.responsibility}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{task.description}</p><p className="mt-2 text-xs text-muted-foreground">{task.dueAt ? `Due ${new Date(task.dueAt).toLocaleDateString()}` : 'Deadline not set'} · {task.status.replace(/_/g, ' ')}</p></div></div>)}</CardContent></Card>;
            })}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
