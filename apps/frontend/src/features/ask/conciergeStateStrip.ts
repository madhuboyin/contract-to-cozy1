import type { AskCapabilityPrompt, ConciergeHomeView } from './types';
import { resolveConciergeLandingSpotlight } from './conciergeLandingPolicy';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 slice D (FRD v1.111): the "state of your home" line on the Ask landing. Built only
// from the Concierge Home payload Ask already loads, so it is a second reading of the same governed sources and never a
// second source of truth. Unavailable sources are said to be unavailable; an empty strip never implies the home is safe.

export type StripTone = 'CRITICAL' | 'CAUTION' | 'DEFAULT';
/** ACUI-002: why an entry is on the launch, as short plain sentences built only from governed Concierge fields. */
export type StripExplanation = { reasons: string[] };
export type StripChip = { id: string; label: string; count?: number; /** One line of context: the top item behind the count. */ detail?: string | null; /** Absent when nothing meaningful can be derived; the launch then hides "Why this appeared". */ explanation?: StripExplanation | null; tone: StripTone; prompt: AskCapabilityPrompt; source: 'ATTENTION' | 'DECISION' | 'DISCOVERY' };
export interface ConciergeStateStrip {
  headline: string | null;
  /** ACUI-001: the launch headline, or null when the state is unknown (the launch then keeps its generic prompt). Never says "nothing" when a source is unavailable. */
  opening: string | null;
  chips: StripChip[];
  /** The single most urgent ranked item, when the landing spotlight is an attention item. */
  urgent: { title: string; priority: 'DO_NOW' | 'PLAN_SOON' | 'WATCH' | 'OPTIONAL'; prompt: AskCapabilityPrompt } | null;
  notes: string[];
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

const formatDay = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};
const words = (value: string) => value.toLowerCase().replace(/_/g, ' ');

// Only the codes that say something a homeowner can use; STABLE_TIE_BREAK and the like are not shown.
const REASON_CODE_TEXT: Record<string, string> = {
  SAFETY_FLOOR: 'Safety-related items are ranked first.',
  HIGHER_CONSEQUENCE: 'It matters more than the next item if left alone.',
  HIGHER_URGENCY: 'It is more urgent than the next item.',
  HIGHER_CONFIDENCE: 'Your home record supports it more strongly than the next item.',
  MORE_ACTIONABLE: 'You can act on it now.',
};
const CONFIDENCE_TEXT = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' } as const;

type PriorityItem = ConciergeHomeView['priorityList']['items'][number];
function explainPrioritySection(items: PriorityItem[], section: 'ATTENTION' | 'PLAN_AHEAD', generatedAt: string): StripExplanation | null {
  const top = items[0];
  if (!top) return null;
  const reasons: string[] = [];
  const label = section === 'ATTENTION' ? 'What needs attention' : 'Plan ahead';
  reasons.push(items.length === 1 ? `It is in “${label}” on your Home dashboard.` : `${items.length} items are in “${label}” on your Home dashboard.`);
  const due = formatDay(top.deadlineAt);
  if (due) {
    const overdue = top.deadlineAt && new Date(top.deadlineAt).getTime() < new Date(generatedAt).getTime();
    reasons.push(`“${top.title}” ${overdue ? 'was due' : 'is due'} ${due}.`);
  }
  for (const code of top.comparativeReasonCodes) {
    const text = REASON_CODE_TEXT[code];
    if (text && !reasons.includes(text) && reasons.length < 4) reasons.push(text);
  }
  if (reasons.length < 4 && CONFIDENCE_TEXT[top.confidenceLabel]) reasons.push(`Confidence in “${top.title}”: ${CONFIDENCE_TEXT[top.confidenceLabel]}.`);
  return { reasons };
}

const prompt = (
  id: string,
  question: string,
  categoryId: AskCapabilityPrompt['categoryId'],
  categoryLabel: string,
  operationId: string,
): AskCapabilityPrompt => ({ id, categoryId, categoryLabel, question, context: { operationId } });

export function buildConciergeStateStrip(view: ConciergeHomeView): ConciergeStateStrip {
  const notes: string[] = [];
  const chips: StripChip[] = [];
  // This payload is already the server's dashboard projection. Do not apply
  // a second client-side eligibility filter or Ask's counts can diverge from
  // the Home cards even though both began with the same governed feed.
  const usable = view.priorityList.items;
  const doNow = usable.filter((item) => item.rawPriority === 'NOW').length;
  const planSoon = usable.filter((item) => item.rawPriority === 'SOON').length;
  // Preserve feed order within each dashboard band while ensuring the more immediate band leads its card.
  const attentionItems = [
    ...usable.filter((item) => item.rawPriority === 'NOW'),
    ...usable.filter((item) => item.rawPriority === 'SOON'),
  ];
  const planAheadItems = [
    ...usable.filter((item) => item.rawPriority === 'PLAN'),
    ...usable.filter((item) => item.rawPriority === 'CONSIDER'),
  ];

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

  if (view.priorityList.state !== 'UNAVAILABLE') {
    chips.push({
      id: 'strip-needs-attention', label: 'What needs attention', count: attentionItems.length,
      detail: attentionItems[0]?.title ?? 'Nothing needs attention right now.',
      explanation: explainPrioritySection(attentionItems, 'ATTENTION', view.generatedAt),
      tone: doNow > 0 ? 'CRITICAL' : attentionItems.length > 0 ? 'CAUTION' : 'DEFAULT', source: 'ATTENTION',
      prompt: prompt('strip-needs-attention', 'Show me what needs attention now or soon', 'PLAN_MONITOR', 'Plan', 'HOME_ACTIONS'),
    });
    chips.push({
      id: 'strip-plan-ahead', label: 'Plan ahead', count: planAheadItems.length,
      detail: planAheadItems[0]?.title ?? 'Nothing to plan right now.',
      explanation: explainPrioritySection(planAheadItems, 'PLAN_AHEAD', view.generatedAt),
      tone: 'DEFAULT', source: 'ATTENTION',
      prompt: prompt('strip-plan-ahead', 'Show me what I should plan ahead for', 'PLAN_MONITOR', 'Plan', 'HOME_ACTIONS'),
    });
  }

  if (view.changes.state === 'UNAVAILABLE') {
    notes.push('Recent changes are temporarily unavailable.');
  } else if (view.changes.state === 'AVAILABLE') {
    const important = view.changes.items.filter((item) => item.materiality === 'IMPORTANT' || item.materiality === 'URGENT');
    if (important.length > 0) {
      const urgent = important.some((item) => item.materiality === 'URGENT');
      const newest = important[0];
      const detected = formatDay(newest.detectedAt);
      const effective = formatDay(newest.effectiveAt);
      const reasons = [`${important.length === 1 ? 'A change' : `${important.length} changes`} in the last ${view.changes.windowDays} days ${important.length === 1 ? 'was' : 'were'} marked ${urgent ? 'urgent or important' : 'important'}.`];
      if (detected) reasons.push(`The latest was detected ${detected}${effective ? ` and takes effect ${effective}` : ''}.`);
      chips.push({
        id: 'strip-changes', label: `${important.length} important ${plural(important.length, 'change', 'changes')}`, detail: newest.summary, explanation: { reasons }, tone: urgent ? 'CRITICAL' : 'CAUTION', source: 'DISCOVERY',
        prompt: prompt('strip-changes', 'What changed around my home lately?', 'UNDERSTAND', 'Understand', 'HOME_CHANGE_SUMMARY'),
      });
    }
  }

  const decision = view.decisions.state === 'AVAILABLE' ? view.decisions.items[0] : undefined;
  if (decision) {
    chips.push({
      id: `strip-decision-${decision.decisionThreadId}`, label: `Continue: ${decision.title}`, explanation: { reasons: [`You have an open decision (${words(decision.lifecycleStatus)}).`, ...(formatDay(decision.updatedAt) ? [`It was last updated ${formatDay(decision.updatedAt)}.`] : [])] }, tone: 'DEFAULT', source: 'DECISION',
      prompt: { id: `decision-${decision.decisionThreadId}`, categoryId: 'DECIDE', categoryLabel: 'Decide', question: `Help me continue this decision: ${decision.title}`, subject: decision.subject ?? undefined, context: { entityType: 'DECISION_THREAD', entityId: decision.decisionThreadId } },
    });
  }

  const spotlight = resolveConciergeLandingSpotlight(view);
  const item = spotlight?.kind === 'ATTENTION' ? view.priorityList.items.find((entry) => entry.homeActionId === spotlight.entityId) : undefined;
  const urgent = item && item.consumerPriority !== 'NO_ACTION' ? {
    title: item.title,
    priority: item.consumerPriority,
    prompt: { id: `attention-${item.homeActionId}`, categoryId: item.askCategoryId, categoryLabel: item.askCategoryLabel, question: item.askQuestion, subject: item.subject ?? undefined, context: { entityType: 'HOME_ACTION', entityId: item.homeActionId, actionId: item.homeActionId, capabilityId: 'home-operations', operationId: 'HOME_ACTIONS' } } satisfies AskCapabilityPrompt,
  } : null;

  // ACUI-001: the launch headline. Unknown or unavailable state falls back to the generic prompt rather than claiming the home is fine.
  // The landing's one-line summary ("Nothing urgent · 4 to plan soon · 3 changes to review"), from the same counts as the entries. "Nothing
  // urgent" is said only when no source is unavailable, and an unknown state leaves the line null so the generic prompt stays.
  const importantChanges = chips.find((chip) => chip.id === 'strip-changes');
  const changeCount = view.changes.state === 'AVAILABLE' ? view.changes.items.filter((item) => item.materiality === 'IMPORTANT' || item.materiality === 'URGENT').length : 0;
  const lead = attentionItems.length > 0 ? `${attentionItems.length} ${plural(attentionItems.length, 'item needs', 'items need')} attention` : notes.length === 0 && view.priorityList.state !== 'UNAVAILABLE' ? 'Nothing needs attention' : null;
  const summaryParts = [lead, planAheadItems.length > 0 ? `${planAheadItems.length} to plan ahead` : null, changeCount > 0 ? `${changeCount} recent ${plural(changeCount, 'change', 'changes')}` : null].filter((part): part is string => Boolean(part));
  let opening: string | null = null;
  if (summaryParts.length > 0) opening = summaryParts.length === 1 && lead === 'Nothing needs attention' ? 'Nothing needs your attention right now' : summaryParts.join(' · ');

  return { headline, opening, chips, urgent, notes };
}
