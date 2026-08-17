'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardCheck,
  HelpCircle,
  FileCheck2,
  Flag,
  Landmark,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { BuyerJourneyStage, BuyerNextActionGuidance, BuyerPlanOverviewTask } from '@/types';

export type BuyerPlanWorkspaceKey = 'CONTRACT' | 'DUE_DILIGENCE' | 'FINANCING_PROTECTION' | 'CLOSING_PREP' | 'CLOSE_MOVE_IN';

export const BUYER_PLAN_WORKSPACES: Array<{
  key: BuyerPlanWorkspaceKey;
  eyebrow: string;
  label: string;
  description: string;
  icon: typeof FileCheck2;
}> = [
  { key: 'CONTRACT', eyebrow: 'Phase 1', label: 'Understand your contract', description: 'Know the dates that protect you', icon: FileCheck2 },
  { key: 'DUE_DILIGENCE', eyebrow: 'Phase 2', label: 'Inspect the home', description: 'Learn what needs attention', icon: ClipboardCheck },
  { key: 'FINANCING_PROTECTION', eyebrow: 'Phase 3', label: 'Prepare to fund & protect', description: 'Keep your loan, title and coverage moving', icon: Landmark },
  { key: 'CLOSING_PREP', eyebrow: 'Phase 4', label: 'Get ready to close', description: 'Review the final numbers and home', icon: ShieldCheck },
  { key: 'CLOSE_MOVE_IN', eyebrow: 'Phase 5', label: 'Close & get the keys', description: 'Finish closing and take possession', icon: Flag },
];

const WORKSPACE_GUIDANCE: Record<BuyerPlanWorkspaceKey, {
  focus: string;
  explanation: string;
  questions: [string, string];
}> = {
  CONTRACT: {
    focus: 'Know the promises and deadlines in your signed contract',
    explanation: 'Start with the dates that may affect your deposit, inspection choices, financing and closing. Upload the signed contract when you have it so you do not have to retype everything.',
    questions: ['Which deadline needs my attention first?', 'Is there anything in my contract I should ask you to explain?'],
  },
  DUE_DILIGENCE: {
    focus: 'Understand the home before your inspection deadline passes',
    explanation: 'Use the home\'s age, type and location to prepare useful questions. After the inspection, bring the report back here to organize findings and decide what needs professional follow-up.',
    questions: ['What should be checked more closely for a home like this?', 'Which findings require a decision before my inspection deadline?'],
  },
  FINANCING_PROTECTION: {
    focus: 'Keep financing, ownership checks and insurance on track',
    explanation: 'Focus on requests that could delay closing. Your lender, closing professional and insurer remain the source of truth; this plan helps you see what to ask and what is still waiting.',
    questions: ['Is anything still needed from me to keep closing on schedule?', 'Which document or approval should I expect next?'],
  },
  CLOSING_PREP: {
    focus: 'Check the final numbers and make sure the home is ready',
    explanation: 'Review the final disclosure with the appropriate professional and use the walkthrough to look for meaningful changes—not to repeat the full inspection.',
    questions: ['Have the final numbers or terms changed from what I expected?', 'What should I do if the walkthrough reveals a new problem?'],
  },
  CLOSE_MOVE_IN: {
    focus: 'Complete closing safely and know when you can take possession',
    explanation: 'Confirm the appointment, independently verify any payment instructions, and rely on the closing professional to confirm when closing is complete and keys can be released.',
    questions: ['What must I bring or complete before the appointment?', 'Who will confirm that closing is complete and I can receive the keys?'],
  },
};

const SECTION_TO_WORKSPACE: Record<string, BuyerPlanWorkspaceKey> = {
  CONTRACT_CONTINGENCIES: 'CONTRACT',
  INSPECTION_DUE_DILIGENCE: 'DUE_DILIGENCE',
  FINANCING_APPRAISAL: 'FINANCING_PROTECTION',
  TITLE_ESCROW_HOA: 'FINANCING_PROTECTION',
  INSURANCE: 'FINANCING_PROTECTION',
  CLOSING_DISCLOSURE_FUNDS: 'CLOSING_PREP',
  FINAL_WALKTHROUGH: 'CLOSING_PREP',
  CLOSING_DAY: 'CLOSE_MOVE_IN',
  MOVE_POSSESSION: 'CLOSE_MOVE_IN',
  POST_CLOSE_SAVED: 'CLOSE_MOVE_IN',
};

export function workspaceForStage(stage: BuyerJourneyStage): BuyerPlanWorkspaceKey {
  if (stage === 'EXPLORING' || stage === 'OFFER_CONTRACT') return 'CONTRACT';
  if (stage === 'DUE_DILIGENCE') return 'DUE_DILIGENCE';
  if (stage === 'CLOSING_PREP') return 'CLOSING_PREP';
  return 'CLOSE_MOVE_IN';
}

export function workspaceForTask(task: Pick<BuyerPlanOverviewTask, 'checklistSection' | 'phase'>): BuyerPlanWorkspaceKey {
  if (task.checklistSection && SECTION_TO_WORKSPACE[task.checklistSection]) return SECTION_TO_WORKSPACE[task.checklistSection];
  if (task.phase === 'EXPLORING' || task.phase === 'OFFER_CONTRACT') return 'CONTRACT';
  if (task.phase === 'DUE_DILIGENCE') return 'DUE_DILIGENCE';
  if (task.phase === 'CLOSING_PREP') return 'CLOSING_PREP';
  return 'CLOSE_MOVE_IN';
}

const resolved = (task: BuyerPlanOverviewTask) => ['COMPLETED', 'NOT_NEEDED', 'CANCELLED'].includes(task.status);

export function BuyerPlanPhaseNavigation({
  active,
  current,
  tasks,
  onChange,
}: {
  active: BuyerPlanWorkspaceKey | null;
  current: BuyerPlanWorkspaceKey;
  tasks: BuyerPlanOverviewTask[];
  onChange: (workspace: BuyerPlanWorkspaceKey) => void;
}) {
  return (
    <nav aria-label="Closing phases" className="overflow-x-auto pb-1">
      <ol className="grid min-w-[780px] grid-cols-5 gap-2">
        {BUYER_PLAN_WORKSPACES.map((workspace, index) => {
          const phaseTasks = tasks.filter((task) => workspaceForTask(task) === workspace.key);
          const resolvedCount = phaseTasks.filter(resolved).length;
          const selected = active === workspace.key;
          const isCurrent = current === workspace.key;
          const Icon = workspace.icon;
          return (
            <li key={workspace.key}>
              <button
                type="button"
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => onChange(workspace.key)}
                className={`group h-full w-full rounded-2xl border px-4 py-4 text-left transition-all ${selected ? 'border-teal-500 bg-teal-950 text-white shadow-lg shadow-teal-950/10' : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-sm'}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${selected ? 'bg-white/15' : 'bg-slate-100 text-slate-600'}`}><Icon className="h-4 w-4" /></span>
                  {phaseTasks.length > 0 && resolvedCount === phaseTasks.length
                    ? <span className={`flex h-6 w-6 items-center justify-center rounded-full ${selected ? 'bg-emerald-300 text-teal-950' : 'bg-emerald-100 text-emerald-700'}`}><Check className="h-3.5 w-3.5" /></span>
                    : <span className={`text-xs ${selected ? 'text-white/70' : 'text-slate-400'}`}>{phaseTasks.length > 0 ? `${phaseTasks.length - resolvedCount} to do` : 'Later'}</span>}
                </span>
                <span className={`mt-3 block text-[11px] font-semibold uppercase tracking-[0.16em] ${selected ? 'text-teal-100' : 'text-slate-400'}`}>{workspace.eyebrow}{isCurrent ? ' · Current' : ''}</span>
                <span className="mt-1 block text-sm font-semibold">{workspace.label}</span>
                <span className={`mt-1 block text-xs ${selected ? 'text-white/70' : 'text-slate-500'}`}>{workspace.description}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function BuyerPlanOverviewPanel({
  targetCloseDate,
  nextAction,
  nextActionGuidance,
  milestones,
  blockedCount,
  currentWorkspace,
  onOpenWorkspace,
  onOpenTask,
}: {
  targetCloseDate: string | null;
  nextAction: BuyerPlanOverviewTask | null;
  nextActionGuidance: BuyerNextActionGuidance | null;
  milestones: Array<{ id: string; label: string; status: string; dueAt: string | null }>;
  blockedCount: number;
  currentWorkspace: BuyerPlanWorkspaceKey;
  onOpenWorkspace: (workspace: BuyerPlanWorkspaceKey) => void;
  onOpenTask: (task: BuyerPlanOverviewTask) => void;
}) {
  const upcoming = milestones
    .filter((milestone) => milestone.dueAt && !['COMPLETED', 'WAIVED', 'CANCELLED'].includes(milestone.status))
    .sort((left, right) => new Date(left.dueAt!).getTime() - new Date(right.dueAt!).getTime())
    .slice(0, 3);
  const closeDate = targetCloseDate ? new Date(targetCloseDate) : null;
  const daysToClose = closeDate ? Math.ceil((closeDate.getTime() - Date.now()) / 86_400_000) : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
      <section className="relative overflow-hidden rounded-3xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-6 shadow-sm sm:p-8">
        <div aria-hidden className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-teal-200/30 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-teal-700"><Sparkles className="h-4 w-4" />Your next move</p>
              <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{nextAction?.title ?? 'Review what matters in your current phase'}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{nextActionGuidance?.rationale ?? nextAction?.description ?? 'We will keep the detailed records out of the way and guide you to the next useful decision.'}</p>
            </div>
            {blockedCount > 0 && <Badge className="border border-amber-200 bg-amber-50 text-amber-800">{blockedCount} need help</Badge>}
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="bg-teal-700 text-white hover:bg-teal-800"
              onClick={() => nextAction ? onOpenTask(nextAction) : onOpenWorkspace(currentWorkspace)}
            >
              {nextActionGuidance?.ctaLabel ?? (nextAction ? 'Review next action' : 'Open current phase')}<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <div className="mt-8 grid gap-4 border-t border-teal-100 pt-5 sm:grid-cols-2">
            <div><p className="text-xs text-slate-500">Target closing</p><p className="mt-1 text-xl font-semibold text-slate-950">{closeDate ? closeDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Not set yet'}</p><p className="text-xs text-slate-500">{daysToClose === null ? 'Add it when the date is known' : daysToClose >= 0 ? `${daysToClose} days remaining` : `${Math.abs(daysToClose)} days past target`}</p></div>
            <div><p className="text-xs text-slate-500">Where you are now</p><p className="mt-1 text-xl font-semibold text-slate-950">{BUYER_PLAN_WORKSPACES.find((item) => item.key === currentWorkspace)?.label}</p><p className="text-xs text-slate-500">We will guide you one useful step at a time</p></div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Coming up</p><h2 className="mt-1 text-lg font-semibold text-slate-950">Important deadlines</h2></div><CalendarClock className="h-5 w-5 text-teal-600" /></div>
        <div className="mt-5 space-y-3">
          {upcoming.map((milestone) => {
            const due = new Date(milestone.dueAt!);
            const overdue = due.getTime() < Date.now();
            return <div key={milestone.id} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3"><div><p className="text-sm font-medium text-slate-900">{milestone.label}</p><p className={`mt-0.5 text-xs ${overdue ? 'font-medium text-rose-600' : 'text-slate-500'}`}>{overdue ? 'Past target · ' : ''}{due.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p></div><ChevronDown className="h-4 w-4 -rotate-90 text-slate-400" /></div>;
          })}
          {upcoming.length === 0 && <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">No upcoming dates are confirmed yet. Add them when you have the signed source.</div>}
        </div>
      </section>
    </div>
  );
}

export function BuyerPlanPhaseGuidance({
  workspace,
  tasks,
  nextAction,
  nextActionGuidance,
  milestones,
  targetCloseDate,
  onOpenTask,
}: {
  workspace: BuyerPlanWorkspaceKey;
  tasks: BuyerPlanOverviewTask[];
  nextAction: BuyerPlanOverviewTask | null;
  nextActionGuidance: BuyerNextActionGuidance | null;
  milestones: Array<{ id: string; label: string; status: string; dueAt: string | null }>;
  targetCloseDate: string | null;
  onOpenTask: (task: BuyerPlanOverviewTask) => void;
}) {
  const guidance = WORKSPACE_GUIDANCE[workspace];
  const openTasks = tasks.filter((task) => !resolved(task));
  const nextTask = nextAction;
  const canWait = openTasks.filter((task) => task.id !== nextTask?.id && ['PLAN', 'CONSIDER'].includes(task.priority)).slice(0, 2);
  const datedItems = [
    ...openTasks.filter((task) => task.dueAt).map((task) => ({ id: task.id, label: task.title, dueAt: task.dueAt! })),
    ...milestones.filter((milestone) => milestone.dueAt && !['COMPLETED', 'WAIVED', 'CANCELLED'].includes(milestone.status)).map((milestone) => ({ id: milestone.id, label: milestone.label, dueAt: milestone.dueAt! })),
  ].sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime());
  const nextDeadline = datedItems[0] ?? (targetCloseDate ? { id: 'target-close', label: 'Target closing', dueAt: targetCloseDate } : null);

  return (
    <section className="overflow-hidden rounded-3xl border border-teal-100 bg-gradient-to-br from-white via-white to-teal-50/60 shadow-sm">
      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.35fr_0.65fr]">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal-700"><Sparkles className="h-4 w-4" />What matters now</p>
          <h2 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight text-slate-950">{guidance.focus}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{guidance.explanation}</p>

          <div className="mt-6 rounded-2xl border border-teal-100 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Recommended next action</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">{nextTask?.title ?? 'No action is waiting for you in this phase'}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">{nextActionGuidance?.rationale ?? nextTask?.description ?? 'You can review the questions below or return to the current phase when something changes.'}</p>
            {nextTask && nextActionGuidance && <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-amber-50 p-3 text-amber-950"><span className="font-semibold">If you delay: </span>{nextActionGuidance.consequenceOfDelay}</div>
              <div className="rounded-xl bg-slate-50 p-3 text-slate-700"><span className="font-semibold">Who can help: </span>{nextActionGuidance.responsibleParty}</div>
            </div>}
            {nextTask && <Button type="button" className="mt-4" onClick={() => onOpenTask(nextTask)}>{nextActionGuidance?.ctaLabel ?? 'Do this next'}<ArrowRight className="ml-2 h-4 w-4" /></Button>}
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-slate-700"><CalendarClock className="h-5 w-5 text-teal-600" /><p className="text-sm font-semibold">Nearest known deadline</p></div>
          {nextDeadline ? <><p className="mt-4 text-2xl font-semibold text-slate-950">{new Date(nextDeadline.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p><p className="mt-1 text-sm text-slate-600">{nextDeadline.label}</p></> : <><p className="mt-4 text-lg font-semibold text-slate-950">No date confirmed yet</p><p className="mt-1 text-sm leading-6 text-slate-500">That is okay. Add a date only when you have a reliable source.</p></>}
        </aside>
      </div>

      <div className="border-t border-teal-100 bg-white/70 p-5 sm:p-7">
        <div className="flex items-center gap-2"><HelpCircle className="h-5 w-5 text-teal-600" /><h3 className="font-semibold text-slate-950">Helpful questions to ask</h3></div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {[nextActionGuidance?.suggestedQuestion, ...guidance.questions].filter((question, index, values): question is string => Boolean(question) && values.indexOf(question) === index).slice(0, 2).map((question) => <div key={question} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">“{question}”</div>)}
        </div>
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">What can safely wait</p>
          <p className="mt-1 text-sm text-slate-600">{canWait.length > 0 ? canWait.map((task) => task.title).join(' · ') : 'Administrative details and future-phase preparation can stay closed until they affect a recommendation.'}</p>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">Forms, history and advanced records remain below and collapsed by default. Open them only when they help complete this step or preserve something important.</p>
      </div>
    </section>
  );
}

export function BuyerPlanTool({
  title,
  description,
  meta,
  children,
  defaultOpen = false,
  openSignal = null,
}: {
  title: string;
  description: string;
  meta?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  openSignal?: string | null;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-950">{title}</h3>{meta && <Badge variant="secondary" className="font-normal">{meta}</Badge>}</div><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p></div>
        <Button type="button" variant={open ? 'secondary' : 'outline'} className="shrink-0" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{open ? 'Hide details' : 'Open details'}<ChevronDown className={`ml-2 h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} /></Button>
      </div>
      {open && <div className="border-t border-slate-100 bg-slate-50/50 p-3 sm:p-5">{children}</div>}
    </section>
  );
}
