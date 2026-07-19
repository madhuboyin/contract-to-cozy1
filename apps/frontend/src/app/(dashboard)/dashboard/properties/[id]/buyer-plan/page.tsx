'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Circle, FileSearch, Loader2 } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { BuyerPlanPhase, HomeBuyerTask, HomeBuyerTaskStatus } from '@/types';

const PHASES: Array<{ key: BuyerPlanPhase; label: string }> = [
  { key: 'PRE_CLOSE', label: 'Before closing' },
  { key: 'FIRST_30_DAYS', label: 'First 30 days' },
  { key: 'DAYS_31_TO_90', label: 'Days 31–90' },
  { key: 'RECURRING_HOME', label: 'Recurring Home handoff' },
];

const NEXT_STEP_LABELS = {
  IMPORT_INSPECTION: 'Import an inspection report',
  REVIEW_EXTRACTION: 'Review extracted inspection findings',
  VERIFY_MATERIAL_FINDINGS: 'Verify material inspection findings',
  VERIFY_DOCUMENTS: 'Verify imported property documents',
  BUILD_90_DAY_PLAN: 'Continue the 90-day plan',
} as const;

export default function BuyerPlanPage() {
  const params = useParams();
  const propertyId = (Array.isArray(params.id) ? params.id[0] : params.id) as string;
  const queryClient = useQueryClient();

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
      if (!response.success) throw new Error(response.message || 'Unable to load import readiness.');
      return response.data;
    },
    enabled: Boolean(propertyId),
  });

  const statusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: HomeBuyerTaskStatus }) =>
      api.updateHomeBuyerTaskStatus(propertyId, taskId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['buyer-plan', propertyId] });
    },
  });

  if (planQuery.isLoading) {
    return <DashboardShell><div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div></DashboardShell>;
  }

  if (planQuery.isError || !planQuery.data) {
    return (
      <DashboardShell>
        <Card><CardContent className="py-8 text-sm text-destructive">{planQuery.error instanceof Error ? planQuery.error.message : 'Unable to load the buyer plan.'}</CardContent></Card>
      </DashboardShell>
    );
  }

  const plan = planQuery.data;
  const readiness = readinessQuery.data;
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

        {readiness && (
          <Card className="border-blue-200 bg-blue-50/60">
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileSearch className="h-5 w-5" />Evidence readiness</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm">
                <p className="font-medium">Next: {NEXT_STEP_LABELS[readiness.nextRecommendedStep]}</p>
                <p className="text-muted-foreground">{readiness.inspectionReports.total} inspection report(s), {readiness.inspectionReports.openMaterialFindings} open material finding(s), {readiness.documents.verified}/{readiness.documents.total} documents verified</p>
              </div>
              <Button asChild variant="outline"><Link href={`/dashboard/properties/${propertyId}/inspection-hub`}>Open inspection hub</Link></Button>
            </CardContent>
          </Card>
        )}

        {PHASES.map((phase) => {
          const tasks = plan.tasks.filter((task) => task.phase === phase.key);
          return (
            <Card key={phase.key}>
              <CardHeader><CardTitle>{phase.label}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {tasks.map((task: HomeBuyerTask) => {
                  const done = task.status === 'COMPLETED';
                  return (
                    <div key={task.id} className="flex items-start justify-between gap-4 rounded-lg border p-4">
                      <div className="flex gap-3">
                        {done ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" /> : <Circle className="mt-0.5 h-5 w-5 text-muted-foreground" />}
                        <div><p className="font-medium">{task.title}</p><p className="mt-1 text-sm text-muted-foreground">{task.description}</p></div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline">{task.priority}</Badge>
                        <Button size="sm" variant={done ? 'outline' : 'default'} disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ taskId: task.id, status: done ? 'PENDING' : 'COMPLETED' })}>{done ? 'Reopen' : 'Complete'}</Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </DashboardShell>
  );
}
