import type { AskOperationResult } from './askOperationRegistry';
import type { AskOperationId } from './askOperationRegistry';
import type { RankedHomeAction } from '../homeActions.service';

export function focusedOperationForLaunchContext(context?: {
  entityType?: string | null;
  entityId?: string | null;
  actionId?: string | null;
}): AskOperationId | null {
  if (context?.entityType === 'HOME_ACTION' && (context.actionId || context.entityId)) return 'HOME_ACTIONS';
  if (context?.entityType === 'DECISION_THREAD' && context.entityId) return 'HVAC_DECISION_CONTINUE';
  if (context?.entityType === 'INVENTORY_ITEM' && context.entityId) return 'REPLACEMENT_GUIDANCE';
  return null;
}

function sentence(value: string): string {
  const trimmed = value.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function focusedTitle(action: RankedHomeAction): string {
  return (action.presentation?.headline ?? action.recommendedAction)
    .trim()
    .replace(/\s+preparation$/i, '')
    .replace(/[.!?]+$/g, '');
}

export function focusedHomeActionQuestion(action: RankedHomeAction): string {
  const title = focusedTitle(action);
  if (action.presentation?.variant === 'WEATHER_ALERT' && /multi-day heat risk/i.test(title)) {
    return 'How should I prepare for the multi-day heat risk at this home?';
  }
  if (action.presentation?.variant === 'WEATHER_ALERT' || action.presentation?.variant === 'ENVIRONMENT_PREPARATION') {
    return `How should I prepare for the ${title.toLowerCase()} at this home?`;
  }
  return `What should I do next for “${title}”?`;
}

export function focusedHomeActionCategory(action: RankedHomeAction): {
  categoryId: 'MAINTAIN' | 'PROTECT' | 'SAVE' | 'PLAN_MONITOR';
  categoryLabel: 'Maintain' | 'Protect' | 'Save' | 'Plan';
} {
  if (['INCIDENT', 'RECALL', 'COVERAGE'].includes(action.source.kind)) return { categoryId: 'PROTECT', categoryLabel: 'Protect' };
  if (action.source.kind === 'SAVINGS_BENEFITS') return { categoryId: 'SAVE', categoryLabel: 'Save' };
  if (['PROJECT', 'SALE_PREP'].includes(action.source.kind)) return { categoryId: 'PLAN_MONITOR', categoryLabel: 'Plan' };
  return { categoryId: 'MAINTAIN', categoryLabel: 'Maintain' };
}

export function buildFocusedHomeActionGuidance(
  action: RankedHomeAction,
  homeHref: string,
  contextVersion: string | null,
): AskOperationResult {
  const title = focusedTitle(action);
  const primaryHref = action.primaryCta.href;
  const summaryActions: Array<{ id: string; label: string; href: string; style: 'PRIMARY' | 'SECONDARY' | 'QUIET' }> = [{
    id: `home-action-primary-${action.id}`,
    label: action.primaryCta.label,
    href: primaryHref,
    style: 'PRIMARY' as const,
  }];
  if (primaryHref !== homeHref) {
    summaryActions.push({
      id: `home-action-view-${action.id}`,
      label: 'View in Home Actions',
      href: homeHref,
      style: 'SECONDARY' as const,
    });
  }

  const timing = action.timing.dueAt
    ? `Due ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(action.timing.dueAt))}`
    : action.timing.rationale;
  const keyFacts = action.presentation?.keyFacts ?? [];
  const boundaryParts = [
    action.governance.emergencyEscalation,
    action.governance.conservativeFallback,
    action.governance.professionalBoundary,
    action.recommendationResponse.status === 'AVAILABLE' ? null : action.recommendationResponse.safeNextAction,
  ].filter((value): value is string => Boolean(value));

  const blocks: AskOperationResult['blocks'] = [{
    type: 'SUMMARY',
    id: 'focused-home-action-summary',
    title,
    body: sentence(action.presentation?.summary ?? action.whyItMatters),
    tone: action.governance.safetyTier === 'SAFETY_EMERGENCY' ? 'CRITICAL' : action.priority === 'NOW' ? 'CAUTION' : 'DEFAULT',
    actions: summaryActions,
  }, {
    type: 'GROUPED_LIST',
    id: 'focused-home-action-guidance',
    title: 'Focused guidance',
    description: 'This response is scoped to the Home Action you selected.',
    sections: [{
      id: 'next-step',
      title: 'What to do next',
      count: 1,
      items: [{
        id: action.id,
        title: action.recommendedAction,
        description: action.expectedOutcome,
        meta: [timing, `${action.confidence.label.toLowerCase()} confidence`],
        status: action.state,
        href: primaryHref,
      }],
    }, {
      id: 'why-it-matters',
      title: 'Why this matters',
      count: 1,
      items: [{
        id: `${action.id}-why`,
        title: action.signal,
        description: action.whyItMatters,
        meta: [action.ranking.explanation],
        status: null,
        href: null,
      }],
    }, ...(keyFacts.length ? [{
      id: 'known-details',
      title: 'Known details',
      count: keyFacts.length,
      items: keyFacts.map((fact, index) => ({
        id: `${action.id}-fact-${index}`,
        title: fact.label,
        description: fact.value,
        meta: [],
        status: null,
        href: null,
      })),
    }] : [])],
    actions: [],
  }, {
    type: 'EVIDENCE',
    id: 'focused-home-action-evidence',
    title: 'Evidence for this guidance',
    items: action.evidence.map((evidence) => ({
      label: evidence.label,
      source: evidence.source,
      observedAt: evidence.observedAt,
    })),
  }];

  if (boundaryParts.length) {
    blocks.push({
      type: 'BOUNDARY',
      id: 'focused-home-action-boundary',
      title: action.governance.safetyTier === 'SAFETY_EMERGENCY' ? 'Safety boundary' : 'Review before acting',
      body: boundaryParts.map(sentence).join(' '),
      severity: action.governance.safetyTier === 'SAFETY_EMERGENCY' ? 'EMERGENCY' : action.governance.safetyTier === 'LOW_CONSEQUENCE' ? 'INFO' : 'CAUTION',
      suggestions: [],
    });
  }

  const limited = action.confidence.label === 'LOW' || action.recommendationResponse.status !== 'AVAILABLE';
  return {
    status: limited ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: limited ? action.recommendationResponse.reasonCode : 'HOME_ACTION_FOCUSED_GUIDANCE',
    contextVersion,
    parameters: { focusedHomeActionId: action.id },
    blocks,
    suggestions: ['What else needs my attention?'],
  };
}
