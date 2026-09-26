import type { AskCapabilityPrompt, ConciergeHomeView } from './types';
import { resolveConciergeLandingSpotlight } from './conciergeLandingPolicy';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 slice D (FRD v1.111): the "state of your home" line on the Ask landing. Built only
// from the Concierge Home payload Ask already loads, so it is a second reading of the same governed sources and never a
// second source of truth. Unavailable sources are said to be unavailable; an empty strip never implies the home is safe.

export type StripTone = 'CRITICAL' | 'CAUTION' | 'DEFAULT';
export type StripChip = { id: string; label: string; /** One line of context: the top item behind the count. */ detail?: string | null; tone: StripTone; prompt: AskCapabilityPrompt; source: 'ATTENTION' | 'DECISION' | 'DISCOVERY' };
export interface ConciergeStateStrip {
  headline: string | null;
  chips: StripChip[];
  /** The single most urgent ranked item, when the landing spotlight is an attention item. */
  urgent: { title: string; priority: 'DO_NOW' | 'PLAN_SOON' | 'WATCH' | 'OPTIONAL'; prompt: AskCapabilityPrompt } | null;
  notes: string[];
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

const prompt = (id: string, question: string, categoryId: AskCapabilityPrompt['categoryId'], categoryLabel: string): AskCapabilityPrompt => ({ id, categoryId, categoryLabel, question });

export function buildConciergeStateStrip(view: ConciergeHomeView): ConciergeStateStrip {
  const notes: string[] = [];
  const chips: StripChip[] = [];
  const usable = view.priorityList.items.filter((item) => !item.suppressed && !item.completed && !item.unavailable && !item.stale && item.consumerPriority !== 'NO_ACTION');
  const doNow = usable.filter((item) => item.consumerPriority === 'DO_NOW').length;
  const planSoon = usable.filter((item) => item.consumerPriority === 'PLAN_SOON').length;

  let headline: string | null = null;
  if (view.priorityList.state === 'UNAVAILABLE') {
    notes.push('Your priorities are temporarily unavailable.');
  } else if (doNow > 0 && planSoon > 0) {
    headline = `${doNow} ${plural(doNow, 'thing needs', 'things need')} attention now, and ${planSoon} more to plan soon.`;
  } else if (doNow > 0) {
    headline = `${doNow} ${plural(doNow, 'thing needs', 'things need')} attention now.`;
  } else if (planSoon > 0) {
    headline = `${planSoon} ${plural(planSoon, 'thing', 'things')} to plan soon.`;
  } else {
    headline = 'Nothing needs your attention right now.';
  }

  const topTitle = (priority: 'DO_NOW' | 'PLAN_SOON') => usable.find((item) => item.consumerPriority === priority)?.title ?? null;
  if (doNow > 0) chips.push({ id: 'strip-do-now', label: `${doNow} to do now`, detail: topTitle('DO_NOW'), tone: 'CRITICAL', source: 'ATTENTION', prompt: prompt('strip-do-now', 'What needs my attention right now?', 'PLAN_MONITOR', 'Plan') });
  if (planSoon > 0) chips.push({ id: 'strip-plan-soon', label: `${planSoon} to plan soon`, detail: topTitle('PLAN_SOON'), tone: 'CAUTION', source: 'ATTENTION', prompt: prompt('strip-plan-soon', 'Which home actions should I plan for next?', 'PLAN_MONITOR', 'Plan') });

  if (view.changes.state === 'UNAVAILABLE') {
    notes.push('Recent changes are temporarily unavailable.');
  } else if (view.changes.state === 'AVAILABLE') {
    const important = view.changes.items.filter((item) => item.materiality === 'IMPORTANT' || item.materiality === 'URGENT');
    if (important.length > 0) {
      const urgent = important.some((item) => item.materiality === 'URGENT');
      chips.push({
        id: 'strip-changes', label: `${important.length} important ${plural(important.length, 'change', 'changes')}`, detail: important[0].summary, tone: urgent ? 'CRITICAL' : 'CAUTION', source: 'DISCOVERY',
        prompt: prompt('strip-changes', 'What changed around my home lately?', 'UNDERSTAND', 'Understand'),
      });
    }
  }

  const decision = view.decisions.state === 'AVAILABLE' ? view.decisions.items[0] : undefined;
  if (decision) {
    chips.push({
      id: `strip-decision-${decision.decisionThreadId}`, label: `Continue: ${decision.title}`, tone: 'DEFAULT', source: 'DECISION',
      prompt: { id: `decision-${decision.decisionThreadId}`, categoryId: 'DECIDE', categoryLabel: 'Decide', question: `Help me continue this decision: ${decision.title}`, subject: decision.subject ?? undefined, context: { entityType: 'DECISION_THREAD', entityId: decision.decisionThreadId } },
    });
  }

  const spotlight = resolveConciergeLandingSpotlight(view);
  const item = spotlight?.kind === 'ATTENTION' ? view.priorityList.items.find((entry) => entry.homeActionId === spotlight.entityId) : undefined;
  const urgent = item && item.consumerPriority !== 'NO_ACTION' ? {
    title: item.title,
    priority: item.consumerPriority,
    prompt: { id: `attention-${item.homeActionId}`, categoryId: item.askCategoryId, categoryLabel: item.askCategoryLabel, question: item.askQuestion, subject: item.subject ?? undefined, context: { entityType: 'HOME_ACTION', entityId: item.homeActionId, actionId: item.homeActionId, capabilityId: 'home-operations' } } satisfies AskCapabilityPrompt,
  } : null;

  return { headline, chips, urgent, notes };
}
