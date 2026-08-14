import type { AskFeaturedPrompt, AskConciergeSubject, ConciergeHomeView } from './types';

export type ConciergeLandingSpotlight = NonNullable<ConciergeHomeView['landingSpotlight']>;

export function conciergeSubjectKey(subject?: AskConciergeSubject | null): string | null {
  const kind = subject?.kind.trim().toUpperCase();
  const id = subject?.id.trim();
  return kind && id ? `${kind}:${id}` : null;
}

/** Supports rolling frontend/backend deploys while keeping precedence deterministic. */
export function resolveConciergeLandingSpotlight(view: ConciergeHomeView): ConciergeLandingSpotlight | null {
  if (view.landingSpotlight) return view.landingSpotlight;
  const attention = view.priorityList.items.find((item) => (
    !item.suppressed && !item.completed && !item.unavailable && !item.stale && item.consumerPriority !== 'NO_ACTION'
  ));
  const decision = view.decisions.state === 'AVAILABLE' ? view.decisions.items[0] : undefined;
  if (attention && (attention.consumerPriority === 'DO_NOW' || attention.consumerPriority === 'PLAN_SOON')) {
    return { kind: 'ATTENTION', entityId: attention.homeActionId };
  }
  if (decision) return { kind: 'DECISION', entityId: decision.decisionThreadId };
  return attention ? { kind: 'ATTENTION', entityId: attention.homeActionId } : null;
}

function spotlightSubject(view: ConciergeHomeView, spotlight: ConciergeLandingSpotlight | null): AskConciergeSubject | null {
  if (spotlight?.kind === 'ATTENTION') {
    return view.priorityList.items.find((item) => item.homeActionId === spotlight.entityId)?.subject ?? null;
  }
  if (spotlight?.kind === 'DECISION') {
    return view.decisions.items.find((item) => item.decisionThreadId === spotlight.entityId)?.subject ?? null;
  }
  return null;
}

/**
 * Defense in depth for cached/rolling payloads: the spotlight and discovery
 * grid cannot repeat the same entity, exact question, or contextual prompt.
 */
export function visibleConciergeFeaturedPrompts(view: ConciergeHomeView): AskFeaturedPrompt[] {
  const spotlight = resolveConciergeLandingSpotlight(view);
  const reservedSubjectKey = conciergeSubjectKey(spotlightSubject(view, spotlight));
  const subjectKeys = new Set<string>();
  const questions = new Set<string>();
  const visible: AskFeaturedPrompt[] = [];

  const add = (prompt: AskFeaturedPrompt) => {
    if (visible.length >= 4) return;
    if (spotlight?.kind === 'ATTENTION' && (
      prompt.id === `attention-${spotlight.entityId}`
      || (prompt.context?.entityType === 'HOME_ACTION' && prompt.context.entityId === spotlight.entityId)
    )) return;
    if (spotlight?.kind === 'DECISION' && (
      prompt.id === `decision-${spotlight.entityId}`
      || (prompt.context?.entityType === 'DECISION_THREAD' && prompt.context.entityId === spotlight.entityId)
    )) return;

    const subjectKey = conciergeSubjectKey(prompt.subject);
    const questionKey = prompt.question.trim().toLowerCase();
    if ((subjectKey && (subjectKey === reservedSubjectKey || subjectKeys.has(subjectKey))) || questions.has(questionKey)) return;
    visible.push(prompt);
    if (subjectKey) subjectKeys.add(subjectKey);
    questions.add(questionKey);
  };

  for (const prompt of view.featuredPrompts) {
    if (visible.length >= 4) break;
    add(prompt);
  }
  const representedCategories = new Set(visible.map((prompt) => prompt.categoryId));
  for (const group of view.capabilityGroups) {
    if (visible.length >= 4) break;
    if (representedCategories.has(group.id) || !group.prompts[0]) continue;
    const before = visible.length;
    add({ ...group.prompts[0], source: 'DISCOVERY' });
    if (visible.length > before) representedCategories.add(group.id);
  }
  return visible;
}
