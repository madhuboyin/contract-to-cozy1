'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Clock3,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import type { BuyerClosingHomeOverview, BuyerJourneyStage } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MobileStickyActionBar } from '@/components/mobile/dashboard/MobilePrimitives';
import { GlossaryText } from '@/components/buyer/GlossaryText';

const STAGE_COPY: Record<BuyerJourneyStage, { label: string; summary: string }> = {
  EXPLORING: { label: 'Getting started', summary: 'You’re getting ready to buy' },
  OFFER_CONTRACT: { label: 'Contract and key dates', summary: 'You’re reviewing the contract and the dates that protect you' },
  DUE_DILIGENCE: { label: 'Inspection and decisions', summary: 'You’re inspecting and learning about the home' },
  CLOSING_PREP: { label: 'Final checks', summary: 'You’re getting ready to close' },
  CLOSED: { label: 'Closing complete', summary: 'Your purchase has closed' },
  MOVE_IN: { label: 'Moving in', summary: 'You’re getting settled in your new home' },
  FIRST_30_DAYS: { label: 'First month at home', summary: 'You’re settling in and learning how your home works' },
  DAYS_31_TO_90: { label: 'Getting settled', summary: 'You’re building a steady routine for your home' },
  HANDED_OFF: { label: 'Homeownership', summary: 'Your closing guide is complete' },
};

function formatDate(value: string | null): string {
  if (!value) return 'Not confirmed yet';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function dueLabel(value: string | null): string {
  if (!value) return 'No confirmed deadline';
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  return `Due in ${days} day${days === 1 ? '' : 's'}`;
}

function askHref(baseHref: string, question: string): string {
  return `${baseHref}${baseHref.includes('?') ? '&' : '?'}question=${encodeURIComponent(question)}`;
}

export function BuyerClosingHome({ overview }: { overview: BuyerClosingHomeOverview }) {
  const { journey, personalization, nextAction, nextActionGuidance, blockers, routes } = overview;
  const needsPersonalization = personalization.setupStatus === 'NEEDS_INPUT';
  const nextActionHref = needsPersonalization ? routes.plan : nextActionGuidance?.ctaHref ?? routes.plan;
  const paused = journey.status === 'PAUSED';
  const stage = paused
    ? { label: 'Plan paused', summary: 'Your closing guide is paused' }
    : STAGE_COPY[journey.stage];
  const upcoming = overview.milestones
    .filter((milestone) => milestone.dueAt && !['COMPLETED', 'WAIVED', 'CANCELLED'].includes(milestone.status))
    .sort((left, right) => new Date(left.dueAt!).getTime() - new Date(right.dueAt!).getTime())
    .slice(0, 3);
  const nextDeadline = upcoming[0] ?? null;
  const visibleAttentionItems = blockers.slice(0, 3);
  const additionalAttentionCount = Math.max(0, blockers.length - visibleAttentionItems.length);
  const mobileActionLabel = paused
    ? 'Review paused Closing Guide'
    : needsPersonalization
      ? 'Make this guide fit my home'
      : nextAction
        ? `Continue: ${nextAction.title}`
        : 'Review Closing Guide';
  const mobileActionHelp = paused
    ? 'Your dates, documents, and completed work are preserved.'
    : needsPersonalization
      ? `${personalization.questionsRemaining} quick question${personalization.questionsRemaining === 1 ? '' : 's'} left to personalize your guidance`
      : nextAction
        ? `${nextAction.title} · ${dueLabel(nextAction.dueAt)}`
        : 'See what matters now and what can safely wait.';

  return (
    <main className="mx-auto w-full max-w-[1120px] space-y-6 px-4 py-6 sm:px-6 lg:py-8">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={paused ? 'bg-amber-100 text-amber-900 hover:bg-amber-100' : 'bg-teal-50 text-teal-800 hover:bg-teal-50'}>
                {stage.label}
              </Badge>
              {blockers.length === 0 && !paused ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> You’re on track
                </span>
              ) : null}
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{stage.summary}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {overview.property.address}, {overview.property.city}, {overview.property.state} {overview.property.zipCode}
            </p>
          </div>
          <div className="grid shrink-0 gap-2 text-sm sm:min-w-[270px]">
            <div className="flex items-center justify-between gap-5 rounded-2xl bg-slate-50 px-4 py-3">
              <span className="text-slate-500">Closing date</span>
              <span className="font-semibold text-slate-900">{formatDate(journey.targetCloseDate)}</span>
            </div>
            {nextDeadline ? (
              <div className="flex items-center justify-between gap-5 rounded-2xl bg-teal-50 px-4 py-3">
                <span className="text-teal-800">Next deadline</span>
                <span className="text-right font-semibold text-teal-950">{nextDeadline.label} · {formatDate(nextDeadline.dueAt)}</span>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {paused ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div>
              <p className="font-semibold text-amber-950">Take the time you need</p>
              <p className="text-sm text-amber-800">Reminders are paused. Your dates, documents, and completed work are safely preserved.</p>
            </div>
            <Button asChild variant="outline"><Link href={routes.plan}>Review or resume guide</Link></Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.45fr_0.75fr]">
        <Card className="overflow-hidden border-teal-200 shadow-sm">
          <CardHeader className="border-b border-teal-100 bg-gradient-to-r from-teal-50 to-white">
            <CardTitle className="flex items-center gap-2 text-base font-semibold uppercase tracking-[0.12em] text-teal-800">
              <CircleDashed className="h-5 w-5" /> What to do next
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 sm:p-7">
            {needsPersonalization ? (
              <div>
                <p className="flex items-center gap-2 text-2xl font-semibold text-slate-950">
                  <Sparkles className="h-5 w-5 text-teal-700" /> Make this guide fit my home
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Answer a few quick questions so your inspection, deadline, and closing guidance reflects this home. We only ask when an answer changes what we recommend.
                </p>
                <p className="mt-4 text-sm font-medium text-teal-800">
                  {personalization.questionsRemaining} quick question{personalization.questionsRemaining === 1 ? '' : 's'} left
                </p>
                <Button asChild className="mt-5"><Link href={routes.plan}>Personalize my guide <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              </div>
            ) : nextAction ? (
              <div>
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{nextAction.title}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600"><GlossaryText text={nextActionGuidance?.rationale ?? nextAction.description ?? ''} /></p>
                  </div>
                  <Badge className="w-fit shrink-0 bg-teal-50 text-teal-800 hover:bg-teal-50">{dueLabel(nextAction.dueAt)}</Badge>
                </div>
                {nextActionGuidance ? (
                  <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4 text-slate-700"><span className="font-semibold text-slate-900">Who can help: </span>{nextActionGuidance.responsibleParty}</div>
                    <div className="rounded-2xl bg-amber-50 p-4 text-amber-950"><span className="font-semibold">If you delay: </span><GlossaryText text={nextActionGuidance.consequenceOfDelay} /></div>
                    <div className="rounded-2xl bg-teal-50 p-4 text-teal-950 sm:col-span-2"><span className="font-semibold">A useful question: </span>“<GlossaryText text={nextActionGuidance.suggestedQuestion} />”</div>
                  </div>
                ) : null}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
                  <p className="text-sm text-slate-500">Everything else can wait until you finish this step.</p>
                  <Button asChild><Link href={nextActionHref}>{nextActionGuidance?.ctaLabel ?? 'Review this step'} <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                </div>
              </div>
            ) : (
              <div>
                <p className="flex items-center gap-2 text-xl font-semibold text-slate-950"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Nothing urgent right now</p>
                <p className="mt-2 text-sm text-slate-600">You can review what is coming next, or ask Cozy about this home whenever a question comes up.</p>
                <Button asChild className="mt-5" variant="outline"><Link href={routes.plan}>View closing guide</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-6">
          {blockers.length > 0 ? (
            <Card className="border-amber-200 bg-amber-50/70">
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><AlertTriangle className="h-5 w-5 text-amber-600" />Needs your attention</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {visibleAttentionItems.map((task) => (
                  <div key={task.id} className="border-b border-amber-200 pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-medium text-slate-950">{task.title}</p>
                    <p className="mt-1 text-xs text-slate-600">{dueLabel(task.dueAt)}</p>
                  </div>
                ))}
                {additionalAttentionCount > 0 ? <p className="text-xs font-medium text-amber-900">+ {additionalAttentionCount} more in your closing guide</p> : null}
                <Button asChild size="sm" variant="outline" className="w-full bg-white"><Link href={routes.plan}>Review attention items</Link></Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-emerald-200 bg-emerald-50/60">
              <CardContent className="py-5">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                <p className="mt-3 font-semibold text-emerald-950">No urgent issues recorded</p>
                <p className="mt-1 text-sm leading-6 text-emerald-900">Focus on the next step. We’ll bring something forward when it needs your attention.</p>
              </CardContent>
            </Card>
          )}

          <Card className="border-teal-200 bg-teal-50/50">
            <CardContent className="py-5">
              <MessageCircle className="h-6 w-6 text-teal-700" />
              <p className="mt-3 font-semibold text-teal-950">Need help with this step?</p>
              <p className="mt-1 text-sm text-teal-900">Ask Cozy already knows this home and where you are in the closing process.</p>
              <div className="mt-4 grid gap-2">
                <Button asChild size="sm" variant="outline" className="justify-start bg-white"><Link href={askHref(routes.ask, 'What should I focus on this week?')}>What should I focus on this week?</Link></Button>
                <Button asChild size="sm" variant="outline" className="justify-start bg-white"><Link href={askHref(routes.ask, 'What should I ask the professional helping with my next step?')}>What should I ask for help with?</Link></Button>
                <Button asChild size="sm" className="mt-1"><Link href={routes.ask}>Ask my own question</Link></Button>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5 text-teal-700" />Coming up</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-3">
              {upcoming.map((milestone, index) => (
                <div key={milestone.id} className="rounded-2xl border border-slate-200 p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"><Clock3 className="h-4 w-4" />{index === 0 ? 'Next' : index === 1 ? 'Soon' : 'Later'}</p>
                  <p className="mt-3 font-semibold text-slate-950">{milestone.label}</p>
                  <p className="mt-1 text-sm text-slate-600">{formatDate(milestone.dueAt)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-600">No upcoming dates are confirmed yet. You do not need to enter estimates—add a date when your signed contract or professional confirms it.</div>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <p className="text-sm text-slate-500">Need documents, contacts, history, or the complete timeline?</p>
            <Button asChild variant="outline"><Link href={routes.plan}>View full closing guide <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </div>
        </CardContent>
      </Card>

      <MobileStickyActionBar
        label={stage.label}
        helpText={mobileActionHelp}
        reserveSize="floatingAction"
        action={(
          <Button asChild size="lg" className="w-full shadow-xl">
            <Link href={nextActionHref} aria-label={mobileActionLabel}>
              {paused ? 'Review paused guide' : needsPersonalization ? 'Personalize my guide' : nextAction ? 'Continue next step' : 'View closing guide'}
              <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        )}
      />
    </main>
  );
}
