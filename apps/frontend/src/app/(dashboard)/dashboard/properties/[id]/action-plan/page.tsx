'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList, Wrench } from 'lucide-react';
import { api } from '@/lib/api/client';
import {
  ActionCard,
  CoverageCorrectionGroupCard,
  groupAttentionActions,
} from '@/components/home/UnifiedHomeSurface';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function PrioritizedActionPlanPage() {
  const params = useParams();
  const propertyId = (Array.isArray(params.id) ? params.id[0] : params.id) as string;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['home-action-plan', propertyId],
    queryFn: () => api.getHomeActions(propertyId),
    enabled: Boolean(propertyId),
    staleTime: 2 * 60 * 1000,
  });

  if (query.isLoading) {
    return <div className="mx-auto max-w-6xl py-16 text-center text-sm text-slate-500">Preparing your prioritized action plan…</div>;
  }

  if (query.isError || !query.data) {
    return (
      <div className="mx-auto max-w-6xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="font-semibold text-rose-800">The prioritized action plan is temporarily unavailable.</p>
        <Button variant="outline" className="mt-3 rounded-full" onClick={() => query.refetch()}>Try again</Button>
      </div>
    );
  }

  const feed = query.data;
  const entries = groupAttentionActions(feed.actions);
  const urgentCount = feed.actions.filter((action) => action.priority === 'NOW' || action.priority === 'SOON').length;
  const coverageHref = `/dashboard/properties/${propertyId}/inventory?tab=items&smart=gaps`;
  const refreshPlan = async () => {
    await query.refetch();
    await queryClient.invalidateQueries({ queryKey: ['unified-home', propertyId] });
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" className="rounded-full">
          <Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />Back to Home</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href={`/dashboard/properties/${propertyId}/fix`}><Wrench className="mr-2 h-4 w-4" />Open Resolution Center</Link>
        </Button>
      </div>

      <header className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white to-teal-50/50 p-6 shadow-sm md:p-8">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-teal-100 p-3 text-teal-700"><ClipboardList className="h-5 w-5" /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Plan & Projects</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">Prioritized Action Plan</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Your complete ranked next-action list. Actions that become managed repair, provider, incident, or execution cases continue in Resolution Center.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full bg-white">{feed.actions.length} ranked actions</Badge>
          <Badge variant="outline" className="rounded-full bg-white">{entries.length} grouped topics</Badge>
          <Badge variant="outline" className="rounded-full bg-white">{urgentCount} now or soon</Badge>
        </div>
      </header>

      <section aria-labelledby="ranked-actions-heading" className="space-y-3">
        <div>
          <h2 id="ranked-actions-heading" className="text-xl font-semibold text-slate-950">Ranked actions and supporting details</h2>
          <p className="text-sm text-slate-500">Priority, evidence, confidence, timing, and the next supported move.</p>
        </div>
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
            No action currently needs your attention.
          </div>
        ) : entries.map((entry) => entry.kind === 'ACTION' ? (
          <ActionCard
            key={entry.action.id}
            action={entry.action}
            propertyId={propertyId}
            showSupportingDetails
            onChanged={refreshPlan}
          />
        ) : (
          <CoverageCorrectionGroupCard
            key={`coverage-plan-group:${entry.actions.map((action) => action.id).join(':')}`}
            actions={entry.actions}
            subjects={entry.subjects}
            href={coverageHref}
            showSupportingDetails
          />
        ))}
      </section>
    </main>
  );
}
