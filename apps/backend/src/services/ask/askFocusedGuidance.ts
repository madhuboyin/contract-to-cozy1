import type { AskOperationResult } from './askOperationRegistry';
import type { AskOperationId } from './askOperationRegistry';
import type { RankedHomeAction } from '../homeActions.service';
import { resolveHealthFactorChecklist, urgencyLabel, type HealthFactorChecklistProperty } from './healthFactorChecklist';

export type HomeActionPriority = 'NOW' | 'SOON' | 'PLAN' | 'CONSIDER';

/** Keeps Ask landing section prompts aligned with the dashboard's canonical partitions. */
export function homeActionPriorityFilter(message: string): HomeActionPriority[] | null {
  if (/\bneeds? attention now or soon\b/i.test(message)) return ['NOW', 'SOON'];
  if (/\bplan ahead\b/i.test(message)) return ['PLAN', 'CONSIDER'];
  if (/\b(?:urgent|right now|immediately|priority now)\b/i.test(message)) return ['NOW'];
  if (/\bsoon\b/i.test(message)) return ['SOON'];
  if (/\b(?:should i plan|planning|plan for|later)\b/i.test(message)) return ['PLAN'];
  if (/\b(?:can wait|consider)\b/i.test(message)) return ['PLAN', 'CONSIDER'];
  return null;
}

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

// Home Action focused-guidance CTA fix, Group A (gap audit §17; FRD v1.156).
// `action.primaryCta.href` is taken verbatim from the governed Home Action
// feed (shared with the traditional dashboard), so a focused-guidance turn's
// only action used to navigate the whole browser out of Ask. These eight
// destinations already have a certified Ask operation that reads the same
// data the traditional page would show -- routing to it in-Ask (via the same
// START_WORKFLOW pattern warranties.handler.ts/homeEventRadar.handler.ts
// already use for their own declared actions) keeps the homeowner in the
// conversation instead. Matched on `primaryCta.href` (the only signal this
// module receives) against the exact destinations the audit traced per-site
// in homeActionSourcePromotion.service.ts -- not a guess from the label,
// which is homeowner-facing copy, not a stable routing key. Groups B/C/D
// (drawer candidates, whole stateful tools, and guided journeys) are
// deliberately untouched here and keep navigating.
function parseHomeActionHref(href: string): { pathname: string; params: URLSearchParams } | null {
  try {
    const url = new URL(href, 'https://internal.invalid');
    return { pathname: url.pathname, params: url.searchParams };
  } catch {
    return null;
  }
}

function propertyToolPath(tool: string): RegExp {
  return new RegExp(`^/dashboard/properties/[^/]+/tools/${tool}$`);
}

function resolveGroupAAskRouting(href: string | undefined): { operationId: AskOperationId; message: string } | null {
  if (!href) return null;
  const parsed = parseHomeActionHref(href);
  if (!parsed) return null;
  const { pathname, params } = parsed;

  if (pathname === '/dashboard/warranties') {
    return { operationId: 'WARRANTY_LOOKUP', message: 'Show my warranties' };
  }
  // Coverage-renewal's Warranty case (loadCoverageRenewalActions) links to the inventory
  // coverage tab, not /dashboard/warranties, but is the same underlying warranty record.
  if (/^\/dashboard\/properties\/[^/]+\/inventory$/.test(pathname) && params.get('tab') === 'coverage') {
    return { operationId: 'WARRANTY_LOOKUP', message: 'Show my warranties' };
  }
  if (propertyToolPath('coverage-intelligence').test(pathname) && params.get('stage') === 'questions') {
    return { operationId: 'COVERAGE_GAPS', message: 'What coverage gaps do I have?' };
  }
  if (pathname === '/dashboard/home-event-radar') {
    return { operationId: 'HOME_EVENT_RADAR_FEED', message: 'Show my Home Event Radar feed' };
  }
  if (propertyToolPath('sell-hold-rent').test(pathname)) {
    return { operationId: 'SELL_HOLD_RENT_ANALYSIS', message: 'Should I sell, hold, or rent this property?' };
  }
  if (propertyToolPath('mortgage-refinance-radar').test(pathname)) {
    return { operationId: 'REFINANCE_ANALYSIS', message: 'Should I refinance my mortgage?' };
  }
  // Excludes the in-progress ?section=in-progress&actionId=... resume case (Group C):
  // that is a specific, already-started benefit action, not the general opportunities list.
  if (propertyToolPath('savings-benefits').test(pathname) && !params.has('actionId')) {
    return { operationId: 'SAVINGS_OPPORTUNITIES', message: 'What savings opportunities are available for this home?' };
  }
  if (propertyToolPath('property-tax').test(pathname) && params.get('stage') === 'appeal') {
    return { operationId: 'PROPERTY_TAX_APPEAL_READINESS', message: 'What is the status of my property tax appeal?' };
  }
  // The seasonal-checklist branch inside MAINTENANCE_STATUS only activates on a seasonal
  // keyword in the message (maintenance.handler.ts); forcing the operation still requires it.
  if (pathname === '/dashboard/seasonal') {
    return { operationId: 'MAINTENANCE_STATUS', message: 'What is on my seasonal checklist?' };
  }
  return null;
}

// Group B, health-factor checklist slice (gap audit §17). A health-insight Home Action with no
// matched inventory item routes here (homeActionSourcePromotion.service.ts's buildInsightAction),
// e.g. the reported "See age-related checklist" case. Unlike Group A, no existing Ask operation
// covers this content, so it is rendered inline (see healthFactorChecklist.ts) rather than routed.
export function isHealthFactorFocusHref(href: string | undefined): boolean {
  if (!href) return false;
  const parsed = parseHomeActionHref(href);
  if (!parsed) return false;
  return /^\/dashboard\/properties\/[^/]+\/focus\/health\/[^/]+$/.test(parsed.pathname);
}

function focusedTitle(action: RankedHomeAction): string {
  return (action.presentation?.headline ?? action.recommendedAction)
    .trim()
    .replace(/\s+preparation$/i, '')
    .replace(/[.!?]+$/g, '');
}

export function focusedHomeActionQuestion(action: RankedHomeAction): string {
  const title = focusedTitle(action);
  if (
    (action.presentation?.variant === 'WEATHER_ALERT' || action.presentation?.variant === 'ENVIRONMENT_PREPARATION')
    && /multi-day heat risk/i.test(title)
  ) {
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
  contextVersion: string | null,
  propertyFacts?: HealthFactorChecklistProperty,
): AskOperationResult {
  const title = focusedTitle(action);
  const groupARouting = resolveGroupAAskRouting(action.primaryCta.href);
  const checklist = !groupARouting && propertyFacts && isHealthFactorFocusHref(action.primaryCta.href)
    ? resolveHealthFactorChecklist(action.signal, propertyFacts)
    : null;
  const primaryAction = groupARouting
    ? {
      id: `home-action-primary-${action.id}`,
      label: action.primaryCta.label,
      interactionType: 'START_WORKFLOW' as const,
      message: groupARouting.message,
      operationId: groupARouting.operationId,
      style: 'PRIMARY' as const,
    }
    : {
      id: `home-action-primary-${action.id}`,
      label: action.primaryCta.label,
      href: action.primaryCta.href,
      // The checklist is now answered inline (see the `checklist` section below), so the
      // traditional page becomes an optional escape hatch rather than the sole destination.
      style: checklist ? 'SECONDARY' as const : 'PRIMARY' as const,
    };

  const timing = action.timing.dueAt
    ? `Due ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(action.timing.dueAt))}`
    : action.timing.rationale;
  const keyFacts = (action.presentation?.keyFacts ?? []).filter((fact) =>
    !/^(?:source|execution|task|work state)$/i.test(fact.label.trim()),
  );
  const isPreparation = action.presentation?.variant === 'ENVIRONMENT_PREPARATION';
  const preparationFacts = isPreparation
    ? action.presentation?.factGroups
      .find((group) => /preparation|checklist/i.test(group.label))
      ?.facts ?? []
    : [];
  const preparationItems = preparationFacts.length
    ? preparationFacts.map((fact, index) => ({
      id: `${action.id}-preparation-${index + 1}`,
      title: fact.value,
      description: null,
      meta: [fact.label],
      status: null,
      href: null,
    }))
    : [{
      id: action.id,
      title: action.recommendedAction,
      description: action.expectedOutcome,
      meta: [timing, `${action.confidence.label.toLowerCase()} confidence`],
      status: action.state,
      href: null,
    }];
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
    actions: [],
  }, {
    type: 'GROUPED_LIST', filters: [],
    id: 'focused-home-action-guidance',
    title: isPreparation ? 'Prepare this home' : 'What to do next',
    description: isPreparation
      ? `${timing}. These steps come from the preparation plan for this home.`
      : 'Guidance for the Home Action you selected.',
    sections: [{
      id: 'next-step',
      title: isPreparation ? 'Preparation checklist' : 'Recommended next step',
      count: preparationItems.length,
      items: preparationItems,
    }, {
      id: 'why-it-matters',
      title: isPreparation ? 'Why this matters for this home' : 'Why this matters',
      count: 1,
      items: [{
        id: `${action.id}-why`,
        title: action.signal,
        description: action.whyItMatters,
        meta: [],
        status: null,
        href: null,
      }],
    }, ...(keyFacts.length ? [{
      id: 'known-details',
      title: isPreparation ? 'Forecast and home details' : 'Known details',
      count: keyFacts.filter((fact) => !isPreparation || fact.label !== 'Preparation').length,
      items: keyFacts.filter((fact) => !isPreparation || fact.label !== 'Preparation').map((fact, index) => ({
        id: `${action.id}-fact-${index}`,
        title: fact.label,
        description: fact.value,
        meta: [],
        status: null,
        href: null,
      })),
    }] : []), ...(checklist ? [{
      id: 'checklist',
      title: checklist.title,
      count: checklist.items.length,
      items: checklist.items.map((item) => ({
        id: `${action.id}-checklist-${item.id}`,
        title: item.system,
        description: `${item.ageNote} ${item.action}`,
        meta: [urgencyLabel(item.urgency)],
        status: null,
        href: null,
      })),
    }] : [])],
    actions: [primaryAction],
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
    suggestions: isPreparation ? [] : ['What else needs my attention?'],
  };
}
