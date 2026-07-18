'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  FileCheck2,
  Home,
  MessageCircle,
  Milestone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import type { HomeActionCommand, RankedHomeActionDTO } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

function priorityTone(priority: RankedHomeActionDTO['priority']) {
  if (priority === 'NOW') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (priority === 'SOON') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (priority === 'PLAN') return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function ActionCard({
  action,
  propertyId,
  onChanged,
}: {
  action: RankedHomeActionDTO;
  propertyId: string;
  onChanged: () => Promise<unknown>;
}) {
  const { toast } = useToast();
  const [pending, setPending] = React.useState<HomeActionCommand | null>(null);

  const execute = async (command: HomeActionCommand) => {
    setPending(command);
    try {
      const nextTriggerAt = ['DEFER', 'SNOOZE'].includes(command)
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const response = await api.executeHomeActionCommand(propertyId, action.id, {
        command,
        nextTriggerAt,
        consequenceAcknowledged: ['DEFER', 'DISMISS', 'NOT_RELEVANT'].includes(command),
      });
      if (!response.success) throw new Error(response.message || 'Unable to update this action.');
      toast({ title: command === 'COMPLETE' ? 'Action completed' : 'Action updated' });
      await onChanged();
    } catch (error) {
      toast({
        title: 'Unable to update action',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setPending(null);
    }
  };

  const correctionHref = action.secondaryCtas.find((cta) => /correct|context/i.test(cta.label))?.href;
  const canDefer = action.governance.safetyTier !== 'SAFETY_EMERGENCY' &&
    (action.feedbackControls.includes('DEFER') || action.feedbackControls.includes('SNOOZE'));

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={priorityTone(action.priority)}>{action.priority}</Badge>
            <span className="text-xs text-slate-500">Priority #{action.ranking.rank}</span>
            <span className="text-xs text-slate-500">{action.confidence.label.toLowerCase()} confidence</span>
          </div>
          <h3 className="mt-3 text-base font-semibold text-slate-950">{action.recommendedAction}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{action.whyItMatters}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{action.ranking.explanation}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" className="rounded-full">
          <Link href={action.primaryCta.href} onClick={() => { void api.recordHomeActionOpened(propertyId, action.id); }}>{action.primaryCta.label}<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
        </Button>
        {action.feedbackControls.includes('COMPLETE') && (
          <Button size="sm" variant="outline" className="rounded-full" disabled={Boolean(pending)} onClick={() => execute('COMPLETE')}>
            <Check className="mr-1 h-3.5 w-3.5" />Complete
          </Button>
        )}
        {canDefer && (
          <Button size="sm" variant="outline" className="rounded-full" disabled={Boolean(pending)} onClick={() => execute(action.feedbackControls.includes('DEFER') ? 'DEFER' : 'SNOOZE')}>
            <Clock3 className="mr-1 h-3.5 w-3.5" />Remind in 7 days
          </Button>
        )}
        {action.feedbackControls.includes('NOT_RELEVANT') && (
          <Button size="sm" variant="ghost" className="rounded-full text-slate-500" disabled={Boolean(pending)} onClick={() => execute('NOT_RELEVANT')}>
            Not relevant
          </Button>
        )}
        {correctionHref && (
          <Button asChild size="sm" variant="ghost" className="rounded-full text-slate-500">
            <Link href={correctionHref}>Correct facts</Link>
          </Button>
        )}
      </div>
    </article>
  );
}

export function UnifiedHomeSurface({ propertyId }: { propertyId: string }) {
  const query = useQuery({
    queryKey: ['unified-home', propertyId],
    queryFn: () => api.getUnifiedHome(propertyId),
    staleTime: 2 * 60 * 1000,
  });

  if (query.isLoading) {
    return <div className="py-16 text-center text-sm text-slate-500">Preparing your Home…</div>;
  }
  if (query.isError || !query.data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="font-semibold text-rose-800">Home is temporarily unavailable.</p>
        <Button variant="outline" className="mt-3 rounded-full" onClick={() => query.refetch()}>Try again</Button>
      </div>
    );
  }

  const home = query.data;
  const openAsk = (question?: string) => {
    window.dispatchEvent(new CustomEvent('cozy-chat-open', { detail: { question } }));
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white to-teal-50/50 p-6 shadow-sm md:p-8">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-teal-100 p-3 text-teal-700"><Home className="h-5 w-5" /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Home</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">{home.property.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{home.property.address}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-600">
          <Badge variant="outline" className="rounded-full bg-white">{home.attention.totalCount} open actions</Badge>
          <Badge variant="outline" className="rounded-full bg-white">{home.glance.recordCompleteness}% record complete</Badge>
          <Badge variant="outline" className="rounded-full bg-white">{home.contractVersion}</Badge>
        </div>
      </header>

      <section aria-labelledby="attention-heading" className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div><h2 id="attention-heading" className="text-xl font-semibold text-slate-950">What needs attention</h2><p className="text-sm text-slate-500">A limited, ranked list with the reason and next move.</p></div>
          <Link href={home.attention.planHref} className="text-sm font-semibold text-teal-700 hover:text-teal-800">View full plan</Link>
        </div>
        {home.attention.actions.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">No action currently needs your attention.</div>
        ) : home.attention.actions.map((action) => (
          <ActionCard key={action.id} action={action} propertyId={propertyId} onChanged={() => query.refetch()} />
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-[24px] border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-teal-600" />Decisions to make</CardTitle><CardDescription>Material choices that need a deliberate answer.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {home.decisions.length === 0 ? <p className="text-sm text-slate-500">No material decision is waiting right now.</p> : home.decisions.map((decision) => (
              <Link key={decision.id} href={decision.primaryCta.href} className="block rounded-xl border border-slate-200 p-3 transition hover:border-teal-300 hover:bg-teal-50/40">
                <p className="font-semibold text-slate-900">{decision.recommendedAction}</p><p className="mt-1 text-xs text-slate-500">{decision.expectedOutcome}</p>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Milestone className="h-5 w-5 text-indigo-600" />Active major moment</CardTitle><CardDescription>Current stage, blocker, and next milestone.</CardDescription></CardHeader>
          <CardContent>
            {home.activeMajorMoment ? (
              <div className="space-y-3"><Badge variant="outline">{home.activeMajorMoment.stage.replace(/_/g, ' ')}</Badge><h3 className="font-semibold text-slate-950">{home.activeMajorMoment.title}</h3>{home.activeMajorMoment.blocker && <p className="flex gap-2 text-sm text-amber-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{home.activeMajorMoment.blocker}</p>}<p className="text-sm text-slate-600">Next: {home.activeMajorMoment.nextMilestone}</p><Button asChild size="sm" variant="outline" className="rounded-full"><Link href={home.activeMajorMoment.href}>Continue moment</Link></Button></div>
            ) : <p className="text-sm text-slate-500">No major project or guided journey is active.</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[24px] border-slate-200 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileCheck2 className="h-5 w-5 text-sky-600" />Home at a glance</CardTitle><CardDescription>Systems, coverage, work, and recent changes supporting your next action.</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['Record complete', `${home.glance.recordCompleteness}%`], ['Systems tracked', home.glance.trackedSystems], ['Coverage gaps', home.glance.coverageGapCount], ['Open work', home.glance.openWorkCount]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-slate-950">{value}</p></div>)}
          </div>
          {home.glance.recentChanges.length > 0 && <div className="mt-4 space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent changes</p>{home.glance.recentChanges.map((event) => <div key={event.id} className="flex items-start justify-between gap-3 border-t border-slate-100 py-2 text-sm"><span className="text-slate-700">{event.title}</span><span className="shrink-0 text-xs text-slate-400">{new Date(event.occurredAt).toLocaleDateString()}</span></div>)}</div>}
          <Button asChild variant="outline" size="sm" className="mt-4 rounded-full"><Link href={home.glance.recordHref}>Open Home Record</Link></Button>
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-teal-200 bg-teal-50/50 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-teal-700" />Ask ContractToCozy</CardTitle><CardDescription>Questions grounded in this property’s actions and recent record.</CardDescription></CardHeader>
        <CardContent className="space-y-2">{home.ask.suggestedQuestions.map((question) => <button key={question} type="button" onClick={() => openAsk(question)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-teal-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 transition hover:border-teal-400"><span>{question}</span><MessageCircle className="h-4 w-4 shrink-0 text-teal-600" /></button>)}<Button className="mt-2 rounded-full" onClick={() => openAsk()}><MessageCircle className="mr-2 h-4 w-4" />Ask another question</Button></CardContent>
      </Card>
    </div>
  );
}
