'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  FileCheck2,
  MessageCircle,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { BuyerClosingHomeOverview, BuyerJourneyStage } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { MobileStickyActionBar } from '@/components/mobile/dashboard/MobilePrimitives';

const STAGE_LABELS: Record<BuyerJourneyStage, string> = {
  EXPLORING: 'Exploring',
  OFFER_CONTRACT: 'Offer & contract',
  DUE_DILIGENCE: 'Due diligence',
  CLOSING_PREP: 'Closing preparation',
  CLOSED: 'Closed',
  MOVE_IN: 'Move-in',
  FIRST_30_DAYS: 'First 30 days',
  DAYS_31_TO_90: 'Days 31–90',
  HANDED_OFF: 'Home handoff',
};

function formatDate(value: string | null): string {
  if (!value) return 'Date not set';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function dueLabel(value: string | null): string {
  if (!value) return 'No deadline recorded';
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  return `Due in ${days} day${days === 1 ? '' : 's'}`;
}

export function BuyerClosingHome({ overview }: { overview: BuyerClosingHomeOverview }) {
  const { journey, nextAction, blockers, readinessLanes, evidence, people, routes } = overview;
  const paused = journey.status === 'PAUSED';
  const stageLabel = paused ? 'Paused' : STAGE_LABELS[journey.stage];
  const mobileActionLabel = paused
    ? 'Review paused Closing Plan'
    : nextAction
      ? `Continue Closing Plan: ${nextAction.title}`
      : 'Review Closing Plan';
  const mobileActionHelp = paused
    ? 'Your dates, evidence, and completed work are preserved.'
    : nextAction
      ? `${nextAction.title} · ${dueLabel(nextAction.dueAt)}`
      : 'Review milestones, evidence, and upcoming preparation.';

  return (
    <main className="mx-auto w-full max-w-[1180px] space-y-6 px-4 py-6 sm:px-6 lg:py-8">
      <section className="overflow-hidden rounded-[28px] border border-teal-200 bg-gradient-to-br from-teal-950 via-teal-900 to-slate-900 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">Closing journey</Badge>
              <Badge className={paused ? 'bg-amber-300 text-amber-950' : 'bg-teal-300 text-teal-950'}>
                {stageLabel}
              </Badge>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Your path to closing</h1>
            <p className="mt-2 text-sm text-teal-50 sm:text-base">
              {overview.property.address}, {overview.property.city}, {overview.property.state} {overview.property.zipCode}
            </p>
          </div>
          <Button asChild className="min-h-11 bg-white text-teal-950 hover:bg-teal-50">
            <Link href={routes.plan}>Open Closing Plan <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-teal-100">Target close</p>
            <p className="mt-1 font-semibold">{formatDate(journey.targetCloseDate)}</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-teal-100">Move-in</p>
            <p className="mt-1 font-semibold">{formatDate(journey.moveInDate)}</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-teal-100">Closing-plan progress</p>
            <p className="mt-1 font-semibold">{journey.progress.completed} of {journey.progress.total} ready</p>
            <Progress
              value={journey.progress.percent}
              aria-label="Closing Plan progress"
              aria-valuetext={`${journey.progress.completed} of ${journey.progress.total} ready`}
              className="mt-2 h-1.5 bg-white/15"
              indicatorClassName="bg-teal-300"
            />
          </div>
        </div>
      </section>

      {paused ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div><p className="font-semibold text-amber-950">This purchase journey is paused</p><p className="text-sm text-amber-800">Your dates, evidence, and work are preserved. Resume from the Closing Plan when you are ready.</p></div>
            <Button asChild variant="outline"><Link href={routes.plan}>Review paused plan</Link></Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <Card className="border-teal-200 shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><CircleDashed className="h-5 w-5 text-teal-700" />Next best move</CardTitle></CardHeader>
            <CardContent>
              {nextAction ? (
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div>
                    <p className="text-xl font-semibold text-slate-950">{nextAction.title}</p>
                    {nextAction.description ? <p className="mt-1 max-w-2xl text-sm text-slate-600">{nextAction.description}</p> : null}
                    <p className="mt-3 text-sm font-medium text-teal-800">{dueLabel(nextAction.dueAt)}</p>
                  </div>
                  <Button asChild><Link href={routes.plan}>Continue <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                </div>
              ) : (
                <div>
                  <p className="font-semibold text-slate-950">Review your closing preparation</p>
                  <p className="mt-1 text-sm text-slate-600">No executable task is currently ranked first. Your plan still keeps milestones and evidence visible.</p>
                  <Button asChild className="mt-4"><Link href={routes.plan}>Review Closing Plan</Link></Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Closing readiness</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {readinessLanes.map((lane) => (
                <div key={lane.key} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">{lane.label}</p>
                    {lane.blocked > 0 ? (
                      <Badge variant="destructive">{lane.blocked} blocked</Badge>
                    ) : lane.total === 0 ? (
                      <Badge variant="secondary">No actions yet</Badge>
                    ) : lane.completed >= lane.total ? (
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-teal-700">
                        <CheckCircle2 aria-hidden="true" className="h-5 w-5" /> Complete
                      </span>
                    ) : (
                      <Badge variant="secondary">{lane.total - lane.completed} open</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {lane.total === 0 ? 'No applicable actions are in this lane yet.' : `${lane.completed} of ${lane.total} complete`}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5 text-teal-700" />Upcoming milestones</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {overview.milestones.length > 0 ? overview.milestones.map((milestone) => (
                <div key={milestone.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
                  <div><p className="font-medium text-slate-900">{milestone.label}</p><p className="text-xs text-slate-500">{formatDate(milestone.dueAt)}</p></div>
                  <Badge variant={milestone.status === 'COMPLETED' ? 'default' : 'secondary'}>{milestone.status.replace(/_/g, ' ')}</Badge>
                </div>
              )) : <p className="text-sm text-slate-600">Add confirmed contract dates in your Closing Plan to build the timeline.</p>}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className={blockers.length > 0 ? 'border-amber-200 bg-amber-50/60' : ''}>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><AlertTriangle className="h-5 w-5 text-amber-600" />Blockers</CardTitle></CardHeader>
            <CardContent>
              {blockers.length > 0 ? <div className="space-y-3">{blockers.map((task) => <div key={task.id}><p className="text-sm font-medium text-slate-900">{task.title}</p><p className="text-xs text-slate-600">{dueLabel(task.dueAt)}</p></div>)}</div> : <p className="text-sm text-slate-600">No recorded blocker. Keep the next preparation action moving.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileCheck2 className="h-5 w-5 text-teal-700" />Evidence & documents</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              <p>{evidence.documentsNeedingReviewCount} document{evidence.documentsNeedingReviewCount === 1 ? '' : 's'} need review</p>
              <p>{evidence.openMaterialFindingCount} material inspection finding{evidence.openMaterialFindingCount === 1 ? '' : 's'} open</p>
              <div className="flex flex-wrap gap-2 pt-1"><Button asChild size="sm" variant="outline"><Link href={routes.documents}>Documents</Link></Button><Button asChild size="sm" variant="outline"><Link href={routes.inspection}>Inspection</Link></Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5 text-teal-700" />People & assignments</CardTitle></CardHeader>
            <CardContent className="text-sm text-slate-700"><p>{people.contactCount} transaction contact{people.contactCount === 1 ? '' : 's'} saved</p><p className="mt-1">{people.assignedTaskCount} assigned action{people.assignedTaskCount === 1 ? '' : 's'}</p></CardContent>
          </Card>

          <Card className="border-teal-200 bg-teal-50/60">
            <CardContent className="py-5"><ShieldCheck className="h-6 w-6 text-teal-700" /><p className="mt-3 font-semibold text-teal-950">Need help with the next step?</p><p className="mt-1 text-sm text-teal-900">Ask Cozy uses the closing context for this selected property.</p><Button asChild className="mt-4 w-full"><Link href={routes.ask}><MessageCircle className="mr-2 h-4 w-4" />Ask Cozy</Link></Button></CardContent>
          </Card>
        </aside>
      </div>

      <MobileStickyActionBar
        label={`Closing journey · ${stageLabel}`}
        helpText={mobileActionHelp}
        reserveSize="floatingAction"
        action={(
          <Button asChild size="lg" className="w-full shadow-xl">
            <Link href={routes.plan} aria-label={mobileActionLabel}>
              {paused ? 'Review paused plan' : nextAction ? 'Continue next action' : 'Review Closing Plan'}
              <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        )}
      />
    </main>
  );
}
