'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Circle, CloudRain, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api/client';
import { DashboardShell } from '@/components/DashboardShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { WeatherPreparationItemStatus, WeatherPreparationPlan } from '@/types';

export default function WeatherPreparationPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const propertyId = params.id;
  const insightId = searchParams.get('insightId') ?? '';
  const reportHref = `/dashboard/properties/${propertyId}/environment-report`;

  const planQuery = useQuery({
    queryKey: ['weather-preparation', propertyId, insightId],
    queryFn: async () => {
      const response = await api.post<WeatherPreparationPlan>(
        `/api/environment/report/${propertyId}/preparations`,
        { insightId },
      );
      return response.data;
    },
    enabled: Boolean(propertyId && insightId),
    retry: 1,
    staleTime: 15_000,
  });

  const updateItem = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: WeatherPreparationItemStatus }) => {
      if (!planQuery.data) throw new Error('Preparation checklist is not ready.');
      const response = await api.patch<WeatherPreparationPlan>(
        `/api/environment/report/${propertyId}/preparations/${planQuery.data.id}/items/${itemId}`,
        { status },
      );
      return response.data;
    },
    onSuccess: (plan) => {
      queryClient.setQueryData(['weather-preparation', propertyId, insightId], plan);
    },
  });

  if (!insightId) {
    return (
      <DashboardShell>
        <Card><CardContent className="p-8 text-center">
          <p className="font-semibold">No active weather preparation was selected.</p>
          <Button asChild className="mt-4"><Link href={reportHref}>Return to Environment Report</Link></Button>
        </CardContent></Card>
      </DashboardShell>
    );
  }

  if (planQuery.isLoading) {
    return (
      <DashboardShell>
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          {[0, 1, 2].map(item => <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      </DashboardShell>
    );
  }

  if (planQuery.isError || !planQuery.data) {
    return (
      <DashboardShell>
        <Card className="mx-auto max-w-2xl"><CardContent className="p-8 text-center">
          <p className="text-lg font-semibold">This weather checklist is no longer available.</p>
          <p className="mt-2 text-sm text-slate-600">Return to the report for the latest forecast and recommendations.</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" onClick={() => planQuery.refetch()}><RotateCcw className="mr-2 h-4 w-4" />Try again</Button>
            <Button asChild><Link href={reportHref}>View latest outlook</Link></Button>
          </div>
        </CardContent></Card>
      </DashboardShell>
    );
  }

  const plan = planQuery.data;
  const percent = plan.progress.total ? Math.round((plan.progress.resolved / plan.progress.total) * 100) : 0;
  const complete = plan.progress.resolved === plan.progress.total && plan.progress.total > 0;

  return (
    <DashboardShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <Button asChild variant="ghost" className="-ml-3 text-slate-600">
          <Link href={reportHref}><ArrowLeft className="mr-2 h-4 w-4" />Back to Environment Report</Link>
        </Button>

        <div className="overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 shadow-sm">
          <div className="p-5 sm:p-7">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-sky-100 p-3 text-sky-700"><CloudRain className="h-6 w-6" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={complete ? 'secondary' : 'outline'}>{complete ? 'Ready' : 'Weather preparation'}</Badge>
                  <Badge variant="outline">{plan.timeframe}</Badge>
                </div>
                <h1 className="mt-3 text-2xl font-bold text-slate-950">{plan.title}</h1>
                <p className="mt-1 text-sm text-slate-600">{plan.summary}</p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-800">{plan.progress.resolved} of {plan.progress.total} steps addressed</span>
              <span className="text-slate-500">{percent}%</span>
            </div>
            <Progress className="mt-2 h-2" value={percent} />
          </div>
        </div>

        {complete ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            <div><p className="font-semibold">Preparation complete</p><p className="text-sm">You addressed every step for this forecast window.</p></div>
          </div>
        ) : null}

        <div className="space-y-3">
          {plan.items.map((item, index) => {
            const resolved = item.status !== 'CREATED';
            const saving = updateItem.isPending && updateItem.variables?.itemId === item.id;
            return (
              <Card key={item.id} className={resolved ? 'border-emerald-200 bg-emerald-50/40' : ''}>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    disabled={saving}
                    onClick={() => updateItem.mutate({ itemId: item.id, status: item.status === 'COMPLETED' ? 'CREATED' : 'COMPLETED' })}
                  >
                    <span className={item.status === 'COMPLETED' ? 'grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-white' : 'grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-300 bg-white text-slate-500'}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : item.status === 'COMPLETED' ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
                    </span>
                    <span>
                      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Step {index + 1}</span>
                      <span className={item.status === 'COMPLETED' ? 'text-sm font-medium text-slate-500 line-through' : 'text-sm font-semibold text-slate-900'}>{item.label}</span>
                      {item.status === 'CANCELED' ? <span className="mt-1 block text-xs text-slate-500">Marked not applicable</span> : null}
                    </span>
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => updateItem.mutate({ itemId: item.id, status: item.status === 'CANCELED' ? 'CREATED' : 'CANCELED' })}
                  >
                    {item.status === 'CANCELED' ? 'Restore step' : 'Not applicable'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-xs text-slate-500">Checklist based on {plan.source}. It is tied to this forecast and does not create recurring maintenance tasks.</p>
      </div>
    </DashboardShell>
  );
}
