'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
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

const STAGE_COPY: Record<BuyerJourneyStage, { label: string; step: number }> = {
  EXPLORING: { label: 'Contract and key dates', step: 0 },
  OFFER_CONTRACT: { label: 'Contract and key dates', step: 0 },
  DUE_DILIGENCE: { label: 'Inspection and decisions', step: 1 },
  CLOSING_PREP: { label: 'Loan, title and insurance', step: 2 },
  CLOSED: { label: 'Closing and keys', step: 4 },
  MOVE_IN: { label: 'Closing and keys', step: 4 },
  FIRST_30_DAYS: { label: 'Closing complete', step: 4 },
  DAYS_31_TO_90: { label: 'Closing complete', step: 4 },
  HANDED_OFF: { label: 'Closing complete', step: 4 },
};

const CLOSING_STEPS = [
  'Contract and key dates',
  'Inspection and decisions',
  'Loan, title and insurance',
  'Final review',
  'Closing and keys',
] as const;

function formatDate(value: string | null): string {
  if (!value) return 'Not confirmed yet';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function formatMonthDay(value: string): { month: string; day: string } {
  const date = new Date(value);
  return {
    month: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date).toUpperCase(),
    day: new Intl.DateTimeFormat('en-US', { day: 'numeric' }).format(date),
  };
}

function daysFromNow(value: string | null): number | null {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

function dueLabel(value: string | null): string {
  const days = daysFromNow(value);
  if (days === null) return 'No confirmed deadline';
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  return `Due in ${days} day${days === 1 ? '' : 's'}`;
}

function closingCountdown(value: string | null): string {
  const days = daysFromNow(value);
  if (days === null) return 'Date not confirmed';
  if (days < 0) return 'Closing date needs review';
  if (days === 0) return 'Closing is today';
  return `${days} day${days === 1 ? '' : 's'} until closing`;
}

function deadlineUrgency(dueAt: string, targetCloseDate: string | null) {
  const days = daysFromNow(dueAt) ?? Number.POSITIVE_INFINITY;
  const fallsAfterClosing = Boolean(
    targetCloseDate && new Date(dueAt).getTime() > new Date(targetCloseDate).getTime(),
  );
  if (fallsAfterClosing) {
    return { label: 'Date needs review', tile: 'border-rose-200 bg-rose-50 text-rose-800', badge: 'bg-rose-100 text-rose-800 hover:bg-rose-100' };
  }
  if (days < 0) {
    return { label: dueLabel(dueAt), tile: 'border-rose-200 bg-rose-50 text-rose-800', badge: 'bg-rose-100 text-rose-800 hover:bg-rose-100' };
  }
  if (days <= 3) {
    return { label: dueLabel(dueAt), tile: 'border-rose-200 bg-rose-50 text-rose-800', badge: 'bg-rose-100 text-rose-800 hover:bg-rose-100' };
  }
  if (days <= 7) {
    return { label: dueLabel(dueAt), tile: 'border-amber-200 bg-amber-50 text-amber-800', badge: 'bg-amber-100 text-amber-900 hover:bg-amber-100' };
  }
  if (days <= 14) {
    return { label: dueLabel(dueAt), tile: 'border-teal-200 bg-teal-50 text-teal-800', badge: 'bg-teal-100 text-teal-900 hover:bg-teal-100' };
  }
  return { label: dueLabel(dueAt), tile: 'border-slate-200 bg-slate-50 text-slate-700', badge: 'bg-slate-100 text-slate-700 hover:bg-slate-100' };
}

function askHref(baseHref: string, question: string): string {
  return `${baseHref}${baseHref.includes('?') ? '&' : '?'}question=${encodeURIComponent(question)}`;
}

export function BuyerClosingHome({ overview }: { overview: BuyerClosingHomeOverview }) {
  const { journey, personalization, nextAction, nextActionGuidance, blockers, routes } = overview;
  const needsPersonalization = personalization.setupStatus === 'NEEDS_INPUT';
  const nextActionHref = needsPersonalization ? routes.plan : nextActionGuidance?.ctaHref ?? routes.plan;
  const paused = journey.status === 'PAUSED';
  const stage = paused ? { label: 'Closing guide paused', step: STAGE_COPY[journey.stage].step } : STAGE_COPY[journey.stage];
  const deadlineStream = overview.upcomingDeadlines?.length
    ? overview.upcomingDeadlines
    : overview.milestones
      .filter((milestone) => milestone.dueAt && !['COMPLETED', 'WAIVED', 'CANCELLED'].includes(milestone.status))
      .map((milestone) => ({
        id: `milestone:${milestone.id}`,
        source: 'MILESTONE' as const,
        sourceId: milestone.id,
        label: milestone.label,
        dueAt: milestone.dueAt!,
      }));
  const sortedDeadlines = [...deadlineStream].sort((left, right) =>
    new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime(),
  );
  const nextDeadline = sortedDeadlines[0] ?? null;
  const attentionItems = blockers.filter((task) => task.id !== nextAction?.id);
  const urgentNextAction = Boolean(nextAction?.dueAt && (daysFromNow(nextAction.dueAt) ?? 8) <= 7);
  const attentionCount = attentionItems.length + (urgentNextAction ? 1 : 0);
  const attentionIds = new Set(attentionItems.map((task) => task.id));
  const journeyComplete = ['HANDED_OFF', 'ARCHIVED'].includes(journey.status);
  const comingUp = sortedDeadlines
    .filter((deadline) => deadline.sourceId !== nextAction?.id && !attentionIds.has(deadline.sourceId))
    .slice(0, 3);
  const mobileActionLabel = paused
    ? 'Review paused Closing Guide'
    : needsPersonalization
      ? 'Make this guide fit my home'
      : nextAction
        ? `Continue: ${nextAction.title}`
        : 'Open Closing Guide';
  const mobileActionHelp = paused
    ? 'Your dates, documents, and completed work are preserved.'
    : needsPersonalization
      ? `${personalization.questionsRemaining} quick question${personalization.questionsRemaining === 1 ? '' : 's'} left to personalize your guidance`
      : nextAction
        ? `${nextAction.title} · ${dueLabel(nextAction.dueAt)}`
        : 'Your closing dates and completed work are organized here.';

  return (
    <main className="mx-auto w-full max-w-[1180px] space-y-6 px-4 py-6 sm:px-6 lg:py-8">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Your home closing</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Your closing at {overview.property.address}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {overview.property.city}, {overview.property.state} {overview.property.zipCode}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Badge className={paused ? 'bg-amber-100 text-amber-900 hover:bg-amber-100' : 'bg-teal-50 text-teal-800 hover:bg-teal-50'}>
                Current step: {stage.label}
              </Badge>
              <span className="text-sm font-medium text-slate-700">{closingCountdown(journey.targetCloseDate)}</span>
            </div>
          </div>
          <Button asChild size="lg" className="shrink-0">
            <Link href={routes.plan}>Open closing guide <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>

        <div className="grid border-t border-slate-100 bg-slate-50/70 sm:grid-cols-3">
          <div className="px-5 py-4 sm:px-7">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Current step</p>
            <p className="mt-1 font-semibold text-slate-950">{stage.label}</p>
          </div>
          <div className="border-t border-slate-200 px-5 py-4 sm:border-l sm:border-t-0 sm:px-7">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Target closing</p>
            <p className="mt-1 font-semibold text-slate-950">{formatDate(journey.targetCloseDate)}</p>
          </div>
          <div className="border-t border-slate-200 px-5 py-4 sm:border-l sm:border-t-0 sm:px-7">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Closing status</p>
            <p className={`mt-1 font-semibold ${attentionCount > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
              {paused ? 'Reminders paused' : attentionCount > 0 ? `${attentionCount} item${attentionCount === 1 ? '' : 's'} need attention` : 'No urgent issues recorded'}
            </p>
          </div>
        </div>

        <nav aria-label="Closing journey" className="border-t border-slate-200 px-5 py-5 sm:px-7">
          <ol className="grid gap-3 md:grid-cols-5">
            {CLOSING_STEPS.map((label, index) => {
              const complete = index < stage.step || journeyComplete;
              const current = index === stage.step && !journeyComplete;
              return (
                <li
                  key={label}
                  aria-current={current ? 'step' : undefined}
                  className={`rounded-2xl border px-4 py-3 ${current ? 'border-teal-300 bg-teal-50' : complete ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}
                >
                  <div className="flex items-center gap-2">
                    {complete ? <Check className="h-4 w-4 text-emerald-700" /> : current ? <Circle className="h-4 w-4 fill-teal-600 text-teal-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
                    <span className={`text-sm font-medium ${current ? 'text-teal-950' : complete ? 'text-emerald-950' : 'text-slate-500'}`}>{label}</span>
                  </div>
                  {current ? <p className="mt-1 pl-6 text-xs font-medium text-teal-700">You are here</p> : null}
                </li>
              );
            })}
          </ol>
        </nav>
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
              <Circle className="h-5 w-5" /> What matters now
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
                    <div className="rounded-2xl bg-amber-50 p-4 text-amber-950"><span className="font-semibold">Why timing matters: </span><GlossaryText text={nextActionGuidance.consequenceOfDelay} /></div>
                    <div className="rounded-2xl bg-teal-50 p-4 text-teal-950 sm:col-span-2"><span className="font-semibold">A useful question: </span>“<GlossaryText text={nextActionGuidance.suggestedQuestion} />”</div>
                  </div>
                ) : null}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
                  <p className="text-sm text-slate-500">Start here. We’ll keep the remaining steps organized.</p>
                  <Button asChild><Link href={nextActionHref}>{nextActionGuidance?.ctaLabel ?? 'Review this step'} <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                </div>
              </div>
            ) : (
              <div>
                <p className="flex items-center gap-2 text-xl font-semibold text-slate-950"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Nothing urgent right now</p>
                <p className="mt-2 text-sm text-slate-600">Your dates and completed work are organized. We’ll bring the next step forward when it is time.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-6">
          {attentionItems.length > 0 ? (
            <Card className="border-amber-200 bg-amber-50/70">
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><AlertTriangle className="h-5 w-5 text-amber-600" />Needs attention now</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {attentionItems.slice(0, 3).map((task) => (
                  <div key={task.id} className="border-b border-amber-200 pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-medium text-slate-950">{task.title}</p>
                    <p className="mt-1 text-xs text-slate-600">{dueLabel(task.dueAt)}</p>
                  </div>
                ))}
                {attentionItems.length > 3 ? <p className="text-xs font-medium text-amber-900">+ {attentionItems.length - 3} more in your closing guide</p> : null}
                <Button asChild size="sm" variant="outline" className="w-full bg-white"><Link href={routes.plan}>Review attention items</Link></Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-emerald-200 bg-emerald-50/60">
              <CardContent className="py-5">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                <p className="mt-3 font-semibold text-emerald-950">You’re clear to continue</p>
                <p className="mt-1 text-sm leading-6 text-emerald-900">Focus on the recommended step. We’ll flag a deadline or problem when it needs attention.</p>
              </CardContent>
            </Card>
          )}

          {nextDeadline ? (
            <Card>
              <CardContent className="py-5">
                <Clock3 className="h-6 w-6 text-teal-700" />
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Next confirmed deadline</p>
                <p className="mt-2 font-semibold text-slate-950">{nextDeadline.label}</p>
                <p className="mt-1 text-sm text-slate-600">{formatDate(nextDeadline.dueAt)} · {dueLabel(nextDeadline.dueAt)}</p>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.45fr_0.75fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
            <CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5 text-teal-700" />Coming up</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link href={routes.plan}>View full timeline <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </CardHeader>
          <CardContent>
            {comingUp.length > 0 ? (
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                {comingUp.map((deadline) => {
                  const date = formatMonthDay(deadline.dueAt);
                  const urgency = deadlineUrgency(deadline.dueAt, journey.targetCloseDate);
                  return (
                    <div key={deadline.id} className="grid gap-3 p-3 sm:grid-cols-[64px_1fr_auto] sm:items-center sm:p-4">
                      <div className={`flex h-14 w-16 flex-col items-center justify-center rounded-xl border ${urgency.tile}`}>
                        <span className="text-[10px] font-semibold tracking-[0.12em]">{date.month}</span>
                        <span className="text-xl font-semibold leading-5">{date.day}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-950">{deadline.label}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDate(deadline.dueAt)}</p>
                      </div>
                      <Badge className={`w-fit shrink-0 border-0 ${urgency.badge}`}>{urgency.label}</Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-600">No other confirmed dates are coming up.</div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <Clock3 className="h-4 w-4 text-teal-700" />
              <span>Target closing: <strong className="font-semibold text-slate-900">{formatDate(journey.targetCloseDate)}</strong></span>
              <span aria-hidden="true">·</span>
              <span>{closingCountdown(journey.targetCloseDate)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-teal-200 bg-teal-50/50">
          <CardContent className="py-5">
            <MessageCircle className="h-6 w-6 text-teal-700" />
            <p className="mt-3 font-semibold text-teal-950">Need help with your closing?</p>
            <p className="mt-1 text-sm text-teal-900">Ask Cozy already knows this home and where you are in the closing process.</p>
            <div className="mt-4 grid gap-2">
              <Button asChild size="sm" variant="outline" className="justify-start bg-white"><Link href={askHref(routes.ask, 'What should I focus on this week for my closing?')}>What should I focus on this week?</Link></Button>
              <Button asChild size="sm" variant="outline" className="justify-start bg-white"><Link href={askHref(routes.ask, 'Is anything putting my closing date at risk?')}>Is my closing date at risk?</Link></Button>
              <Button asChild size="sm" className="mt-1"><Link href={routes.ask}>Ask my own question</Link></Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <MobileStickyActionBar
        label={stage.label}
        helpText={mobileActionHelp}
        reserveSize="floatingAction"
        action={(
          <Button asChild size="lg" className="w-full shadow-xl">
            <Link href={nextActionHref} aria-label={mobileActionLabel}>
              {paused ? 'Review paused guide' : needsPersonalization ? 'Personalize my guide' : nextAction ? 'Continue next step' : 'Open closing guide'}
              <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        )}
      />
    </main>
  );
}
