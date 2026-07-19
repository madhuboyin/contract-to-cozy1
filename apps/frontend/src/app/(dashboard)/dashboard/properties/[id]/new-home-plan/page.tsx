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
            <Badge variant={assessment?.decision === 'ELIGIBLE' ? 'default' : 'outline'}>{assessment?.decision?.replace(/_/g, ' ') || 'PILOT GATE PENDING'}</Badge>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="p-4"><FileCheck2 className="mb-2 h-5 w-5" /><p className="text-2xl font-semibold">{evidence.documents.verified}/{evidence.documents.total}</p><p className="text-sm text-muted-foreground">Verified documents</p></CardContent></Card>
          <Card><CardContent className="p-4"><ShieldCheck className="mb-2 h-5 w-5" /><p className="text-2xl font-semibold">{evidence.warranties}</p><p className="text-sm text-muted-foreground">Warranty records</p></CardContent></Card>
          <Card><CardContent className="p-4"><BadgeCheck className="mb-2 h-5 w-5" /><p className="text-2xl font-semibold">{evidence.inventory.modelAndSerialCaptured}/{evidence.inventory.total}</p><p className="text-sm text-muted-foreground">Systems identified</p></CardContent></Card>
          <Card><CardContent className="p-4"><Home className="mb-2 h-5 w-5" /><p className="text-2xl font-semibold">{evidence.inspections}</p><p className="text-sm text-muted-foreground">Inspection records</p></CardContent></Card>
        </div>

        {!assessment || assessment.decision !== 'ELIGIBLE' ? (
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
