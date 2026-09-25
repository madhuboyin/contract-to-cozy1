// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { HouseholdRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { logger } from '../../../lib/logger';
import { type AskCaptureRequest, type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { buyerPlanContextProvider } from '../../skills/context/buyerPlanContext.provider';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { evaluateFeatureContext } from '../../../modules/propertyContext/application/evaluateFeatureContext';
import { getHomeActionFeed, type HomeActionEmptyStateReason } from '../../homeActions.service';
import { buildBuyerPlanHomeActionsResult } from '../askBuyerPlanPresentation';
import { humanDate } from '../askFormatting';
import { ensurePropertyAccess, MAX_RESULT_ITEMS, propertyLabel } from '../askHandlerSupport';
import { buildPriorityListView } from '../../decisionPlatform/priorityListPolicy';
import { getSuppressedHomeActionIds } from '../../decisionPlatform/homeActionUsefulnessFeedback.service';
import { buildFocusedHomeActionGuidance } from '../askFocusedGuidance';

function homeActionEmptyCopy(reason: HomeActionEmptyStateReason | null): { title: string; body: string; tone: 'DEFAULT' | 'POSITIVE' | 'CAUTION' } {
  switch (reason) {
    case 'DATA_UNAVAILABLE': return { title: 'Home Actions could not confirm what needs attention', body: 'One or more governed action sources are unavailable. An empty feed is not treated as an all-clear.', tone: 'CAUTION' };
    case 'RECOMMENDATIONS_PAUSED': return { title: 'Personalized Home Actions are paused', body: 'No eligible action is currently surfaced while personalization is paused. Existing home records remain available in their domain workspaces.', tone: 'DEFAULT' };
    case 'SOURCE_EVALUATION_PENDING': return { title: 'Home Action sources are still being evaluated', body: 'No eligible action is ready yet. Ask will not turn pending source evaluation into a recommendation.', tone: 'DEFAULT' };
    case 'MISSING_FACTS': return { title: 'The home record needs more context before actions can be prioritized', body: 'Foundational property facts are incomplete. Add the next detail below and Ask will reevaluate the governed feed.', tone: 'CAUTION' };
    case 'NO_ACCEPTED_WORK': return { title: 'No action is currently ready to surface', body: 'No eligible action or previously accepted operational work is available. This does not guarantee that the home needs nothing.', tone: 'DEFAULT' };
    case 'ALL_CAUGHT_UP': return { title: 'No active Home Action is currently surfaced', body: 'The governed feed found no eligible active action. This is a feed state, not a guarantee that every possible home issue has been ruled out.', tone: 'POSITIVE' };
    default: return { title: 'No Home Action is currently surfaced', body: 'The governed feed is empty. Ask will not interpret system silence as proof that the home needs nothing.', tone: 'DEFAULT' };
  }
}

// FRD ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md §14.2 ATT-104 / T03
// fix (docs/architecture/ASK_COZY_PHASE5_ATTENTION_ACCEPTANCE_VERIFICATION.md):
// no operation in the 77-operation registry supported an all-property
// attention view at all -- every attention operation is requiresProperty:
// true, and no all-property/portfolio concept existed anywhere in the ask
// services directory. Rather than changing HOME_ACTIONS's registry
// contract (a `requiresProperty: false` change would ripple through
// routing/execution creation and every other assumption that a Home
// Actions turn always has exactly one property), this keeps the anchor
// property required to invoke the operation at all, and adds an explicit,
// message-detected "all my properties" mode inside the handler itself that
// aggregates every property the homeowner can access -- additive and
// backward compatible; an ordinary single-property ask is unaffected.
const ALL_PROPERTY_ATTENTION_MAX_PROPERTIES = 10;

export function isAllPropertyAttentionRequest(message: string): boolean {
  return /\b(?:all (?:my |our )?(?:propert(?:y|ies)|homes)|across (?:all )?(?:my |our )?(?:propert(?:y|ies)|homes)|every propert(?:y|ies))\b/i.test(message);
}

// Deliberately the SAME owned+household-member access boundary
// property.service.ts's own getUserProperties uses, but without its heavy
// hydration (appliance/health-score/warranty enrichment this attention
// view has no use for) -- the query itself is the access check, so no
// separate per-property recheck is needed.
async function accessiblePropertiesForAllPropertyAttention(userId: string): Promise<{ properties: { id: string; label: string }[]; totalAccessibleCount: number }> {
  const homeownerProfile = await prisma.homeownerProfile.findFirst({ where: { userId }, select: { id: true } });
  const [owned, memberships] = await Promise.all([
    homeownerProfile
      ? prisma.property.findMany({ where: { homeownerProfileId: homeownerProfile.id }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }], select: { id: true, name: true, address: true, city: true, state: true } })
      : Promise.resolve([]),
    prisma.householdMember.findMany({
      where: { userId, ...(homeownerProfile ? { property: { homeownerProfileId: { not: homeownerProfile.id } } } : {}) },
      select: { property: { select: { id: true, name: true, address: true, city: true, state: true } } },
    }),
  ]);
  const all = [...owned, ...memberships.map((membership) => membership.property)];
  return {
    properties: all.slice(0, ALL_PROPERTY_ATTENTION_MAX_PROPERTIES).map((property) => ({ id: property.id, label: propertyLabel(property) })),
    totalAccessibleCount: all.length,
  };
}

// ATT-104: "All-property mode must label property on every item and cannot
// merge records across properties." Each property's feed is computed via
// its OWN full governed getHomeActionFeed call (the same canonical
// pipeline the single-property view uses) and kept in its own GROUPED_LIST
// section -- never re-ranked, re-deduplicated, or combined with another
// property's items. Every item's href comes directly from that property's
// own primaryCta, already scoped to its originating propertyId by
// construction (confirmed true for the single-property view below), so no
// cross-property action retargeting is possible. Returns null when there's
// nothing distinct to aggregate (0 or 1 accessible property), letting the
// caller fall through to the ordinary single-property read.
// T03 fix (ATT-104 "labels property on every item"): every item below --
// including the unavailable/empty/degraded placeholders, not just real
// actions -- gets the property's own label as the FIRST entry of its own
// meta array, not only as the section's title. A section title is lost the
// moment an item is read or displayed independent of its GROUPED_LIST
// wrapper (a flattened list, a screen reader landing directly on a result);
// each item now carries its own property attribution regardless.
// T08 fix (all-property mode): the single-property path's
// diagnostics.unavailableProducers disclosure never got reached here
// because allPropertyHomeActionsResult is an early return, before that code
// runs. Each property's own feed.diagnostics.unavailableProducers is now
// read directly (same field, same formatUnavailableHomeActionProducers
// helper T08 already built) and surfaced as an explicit CAUTION item, so a
// property whose feed call SUCCEEDS but has a degraded producer no longer
// renders as indistinguishable from a fully healthy one.
// Extracted as a pure function (feed already fetched, no I/O) so this logic
// is directly unit-testable without DB mocking, same convention as
// mergeEvidence/isCapitalTimelineAnalysisStale/formatUnavailableHomeActionProducers.
export function buildAllPropertyHomeActionSection(
  property: { id: string; label: string },
  feed: Awaited<ReturnType<typeof getHomeActionFeed>> | null,
) {
  if (!feed) {
    return {
      id: `property-${property.id}`, title: property.label, count: 1,
      items: [{ id: `property-${property.id}-unavailable`, title: "This property's actions are temporarily unavailable", description: 'Ask about this property individually to try again.', meta: [property.label], status: 'UNAVAILABLE', href: `/dashboard?propertyId=${encodeURIComponent(property.id)}` }],
    };
  }
  const degradedItems = feed.diagnostics.unavailableProducers.length ? [{
    id: `property-${property.id}-degraded`,
    title: 'Some information for this property is temporarily limited',
    description: `${formatUnavailableHomeActionProducers(feed.diagnostics.unavailableProducers)} could not be checked for this property right now. The items below still reflect every other source.`,
    meta: [property.label],
    status: 'CAUTION',
    href: `/dashboard?propertyId=${encodeURIComponent(property.id)}`,
  }] : [];
  if (!feed.actions.length) {
    return {
      id: `property-${property.id}`, title: property.label, count: 1 + degradedItems.length,
      items: [...degradedItems, { id: `property-${property.id}-empty`, title: 'No governed actions are currently surfaced', description: null, meta: [property.label], status: 'NONE', href: `/dashboard?propertyId=${encodeURIComponent(property.id)}` }],
    };
  }
  return {
    id: `property-${property.id}`, title: property.label, count: feed.actions.length,
    items: [
      ...degradedItems,
      ...feed.actions.slice(0, MAX_RESULT_ITEMS).map((action) => ({
        id: action.id,
        title: action.presentation?.headline ?? action.recommendedAction,
        description: action.presentation?.summary ?? action.whyItMatters,
        meta: [
          property.label,
          action.priority === 'NOW' ? 'Now' : action.priority === 'SOON' ? 'Soon' : action.priority === 'PLAN' ? 'Plan' : 'Consider',
          action.timing.dueAt ? `Due ${humanDate(new Date(action.timing.dueAt))}` : action.timing.rationale,
          `${action.confidence.label.toLowerCase()} confidence`,
        ].filter((value): value is string => Boolean(value)),
        status: action.state,
        href: action.primaryCta.href,
      })),
    ],
  };
}

async function allPropertyHomeActionsResult(userId: string, anchorPropertyId: string): Promise<AskOperationResult | null> {
  const { properties, totalAccessibleCount } = await accessiblePropertiesForAllPropertyAttention(userId);
  if (properties.length <= 1) return null;

  const perProperty = await Promise.all(properties.map(async (property) => {
    try {
      return { property, feed: await getHomeActionFeed(property.id, userId) };
    } catch (error) {
      logger.warn({ error, propertyId: property.id }, "[ask-orchestrator] all-property Home Actions: one property's feed failed, excluding it rather than failing the whole read");
      return { property, feed: null };
    }
  }));

  const sections = perProperty.map(({ property, feed }) => buildAllPropertyHomeActionSection(property, feed));

  const totalCount = perProperty.reduce((sum, { feed }) => sum + (feed?.actions.length ?? 0), 0);
  const unavailableCount = perProperty.filter(({ feed }) => !feed).length;
  const degradedCount = perProperty.filter(({ feed }) => feed && feed.diagnostics.unavailableProducers.length > 0).length;
  const truncated = totalAccessibleCount > properties.length;

  return {
    status: unavailableCount > 0 || degradedCount > 0 ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: unavailableCount > 0 ? 'HOME_ACTION_ALL_PROPERTY_PARTIAL' : degradedCount > 0 ? 'HOME_ACTION_ALL_PROPERTY_PRODUCER_UNAVAILABLE' : 'HOME_ACTION_ALL_PROPERTY_VIEW',
    contextVersion: createHash('sha256').update(JSON.stringify(perProperty.map(({ property, feed }) => ({ id: property.id, count: feed?.actions.length ?? null, generatedAt: feed?.generatedAt ?? null, unavailableProducers: feed?.diagnostics.unavailableProducers ?? null })))).digest('hex'),
    blocks: [{
      type: 'SUMMARY', id: 'home-actions-all-property-summary',
      title: totalCount > 0 ? `${totalCount} governed Home Action${totalCount === 1 ? '' : 's'} across ${properties.length} propert${properties.length === 1 ? 'y' : 'ies'}` : `No Home Actions are currently surfaced across your ${properties.length} properties`,
      body: [
        "Each property's actions come from that property's own governed feed and are never merged or reranked together.",
        unavailableCount ? `${unavailableCount} propert${unavailableCount === 1 ? 'y is' : 'ies are'} temporarily unavailable and excluded above.` : null,
        degradedCount ? `${degradedCount} propert${degradedCount === 1 ? 'y has' : 'ies have'} some information temporarily limited (see the notes in that property's own section).` : null,
        truncated ? `Showing the first ${properties.length} of ${totalAccessibleCount} accessible properties.` : null,
      ].filter(Boolean).join(' '),
      tone: unavailableCount > 0 || degradedCount > 0 ? 'CAUTION' : 'DEFAULT',
      actions: [{ id: 'open-home', label: 'Open Home', href: `/dashboard?propertyId=${encodeURIComponent(anchorPropertyId)}`, style: 'PRIMARY' }],
    }, {
      type: 'GROUPED_LIST', filters: [], id: 'home-actions-all-property-list', title: 'By property',
      description: 'Grouped strictly by property. Items from different properties are never combined, deduplicated together, or reranked against each other; opening or acting on an item always applies to the specific property it belongs to.',
      sections, actions: [],
    }, {
      type: 'BOUNDARY', id: 'home-actions-all-property-boundary', title: 'All-property view',
      body: "This combines each property's own governed action feed for display only. It does not create a new ranked view, merge records across properties, or change which property an action applies to.",
      severity: 'INFO', suggestions: [],
    }],
    suggestions: [],
  };
}

// T08 fix, extracted as a pure function for direct unit testing (same
// convention as mergeEvidence/isCapitalTimelineAnalysisStale -- the DB-heavy
// orchestration around it, getHomeActionFeed, is not independently testable
// without a live database).
const HOME_ACTION_PRODUCER_LABELS: Record<string, string> = {
  ENVIRONMENT_REPORT: 'environment and severe-weather insight',
  PERSONALIZATION: 'personalized recommendation',
};

export function formatUnavailableHomeActionProducers(unavailableProducers: readonly string[]): string {
  return unavailableProducers.map((producer) => HOME_ACTION_PRODUCER_LABELS[producer] ?? producer.toLowerCase()).join(' and ');
}

// IW-PRES-014 (FRD v1.82): the shelf-card facts for one Home Action, from the same fields as its meta line. Only a
// "Now" action is coloured; the timing is the due date, else the feed's own timing rationale (no cost is recorded).
export function homeActionShelfFacts(action: {
  priority: string;
  timing: { dueAt?: string | Date | null; rationale?: string | null };
}, formatDate: (value: Date) => string): { tone: 'DEFAULT' | 'CAUTION'; timingLabel: string | null } {
  const raw = action.timing.dueAt ? `Due ${formatDate(new Date(action.timing.dueAt))}` : action.timing.rationale?.trim() || null;
  const timingLabel = raw && raw.length > 80 ? `${raw.slice(0, 79).trimEnd()}…` : raw;
  return { tone: action.priority === 'NOW' ? 'CAUTION' : 'DEFAULT', timingLabel };
}

async function homeActionsResult(userId: string, propertyId: string, message: string, focusedActionId?: string | null): Promise<AskOperationResult> {
  const homeHref = `/dashboard?propertyId=${encodeURIComponent(propertyId)}`;
  const [access, buyerContextValue] = await Promise.all([
    ensurePropertyAccess(userId, propertyId),
    buyerPlanContextProvider.load({
      userId,
      propertyId,
      operationId: 'HOME_ACTIONS',
      signal: new AbortController().signal,
    }),
  ]);
  const buyerResult = buyerContextValue.status === 'AVAILABLE' && buyerContextValue.data
    ? buildBuyerPlanHomeActionsResult(buyerContextValue.data)
    : null;
  if (buyerResult) return buyerResult;

  if (!focusedActionId && isAllPropertyAttentionRequest(message)) {
    const allPropertyResult = await allPropertyHomeActionsResult(userId, propertyId);
    if (allPropertyResult) return allPropertyResult;
  }

  const evaluation = await evaluateFeatureContext(propertyId, userId, { featureKey: 'HOME_ACTIONS', operationKey: 'VIEW_FEED' });
  const activeRequirement = evaluation.requirements[0];
  const canImproveContext = access.role !== HouseholdRole.VIEWER;
  const captureSupported = activeRequirement
    && canImproveContext
    && activeRequirement.capture.actionKey !== 'PERMISSION_REQUIRED'
    && activeRequirement.capture.inputSchema.type !== 'RELATIONAL_SELECT_CREATE';
  const captureRequests: AskCaptureRequest[] = captureSupported ? [{
    requirementId: activeRequirement.requirementId,
    captureKey: activeRequirement.capture.captureKey,
    classification: activeRequirement.classification,
    state: activeRequirement.state,
    title: activeRequirement.capture.title,
    question: activeRequirement.capture.question,
    helpText: activeRequirement.capture.helpText ?? null,
    inputSchema: activeRequirement.capture.inputSchema,
    ...(activeRequirement.currentAnswer === undefined ? {} : { currentAnswer: activeRequirement.currentAnswer }),
    allowNotSure: activeRequirement.capture.allowNotSure,
    sensitivity: activeRequirement.capture.sensitivity,
    destinationLabel: 'Saved to this home’s Property Context',
    confirmationText: null,
    expectedContextVersion: evaluation.contextVersion,
  }] : [];

  let feed: Awaited<ReturnType<typeof getHomeActionFeed>>;
  try {
    feed = await getHomeActionFeed(propertyId, userId);
  } catch {
    return {
      status: 'UNAVAILABLE', reasonCode: 'HOME_ACTION_FEED_UNAVAILABLE', contextVersion: evaluation.contextVersion,
      captureRequests,
      blocks: [{
        type: 'SUMMARY', id: 'home-actions-unavailable', title: 'Home Actions are temporarily unavailable',
        body: 'Ask could not load the final governed action feed. It will not substitute raw signals, model memory, or an unfiltered recommendation.',
        tone: 'CAUTION', actions: [{ id: 'open-home', label: 'Open Home', href: homeHref, style: 'PRIMARY' }],
      }],
      suggestions: ['Summarize my home record', 'What maintenance is pending?'],
    };
  }

  if (focusedActionId) {
    const focusedAction = feed.actions.find((action) => action.id === focusedActionId);
    if (!focusedAction) {
      return {
        status: 'NOT_APPLICABLE',
        reasonCode: 'HOME_ACTION_SUBJECT_NOT_ACTIVE',
        contextVersion: evaluation.contextVersion,
        blocks: [{
          type: 'SUMMARY',
          id: 'focused-home-action-not-active',
          title: 'This Home Action is no longer active',
          body: 'The selected action is no longer present in the current governed feed. Ask will not substitute another action or use a stale title match.',
          tone: 'DEFAULT',
          actions: [{ id: 'open-home-actions', label: 'View current Home Actions', href: homeHref, style: 'PRIMARY' }],
        }],
        suggestions: ['What else needs my attention?'],
      };
    }
    return buildFocusedHomeActionGuidance(focusedAction, evaluation.contextVersion);
  }

  const urgentFocus = /\b(?:urgent|right now|immediately|priority now)\b/i.test(message);
  const soonFocus = /\bsoon\b/i.test(message);
  const planFocus = /\b(?:should i plan|planning|plan for|later)\b/i.test(message);
  const waitFocus = /\b(?:can wait|consider)\b/i.test(message);
  const topFocus = /\b(?:what should i do next|next best action|highest priority|top priorit(?:y|ies)|where should i start)\b/i.test(message);
  const priorityFilter = urgentFocus ? ['NOW'] : soonFocus ? ['SOON'] : planFocus ? ['PLAN'] : waitFocus ? ['PLAN', 'CONSIDER'] : null;
  const selectedActions = (priorityFilter
    ? feed.actions.filter((action) => priorityFilter.includes(action.priority))
    : feed.actions).slice(0, topFocus ? 5 : MAX_RESULT_ITEMS);
  const empty = feed.actions.length === 0 ? homeActionEmptyCopy(feed.diagnostics.emptyStateReason) : null;
  const filteredEmpty = feed.actions.length > 0 && selectedActions.length === 0;
  const lowConfidence = selectedActions.some((action) => action.confidence.label === 'LOW');
  const permissionLimited = Boolean(activeRequirement && !canImproveContext);
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'home-actions-summary',
    title: empty?.title
      ?? (filteredEmpty
        ? `No ${priorityFilter?.map((value) => value.toLowerCase()).join(' or ')} Home Action is currently surfaced`
        : selectedActions.length === 1
          ? selectedActions[0].presentation?.headline ?? selectedActions[0].recommendedAction
          : `${selectedActions.length} governed Home Actions are ready to review`),
    body: empty?.body
      ?? (filteredEmpty
        ? `The full governed feed contains ${feed.actions.length} active action${feed.actions.length === 1 ? '' : 's'}, but none match this timing filter.`
        : `These are the final grounded, deduplicated, lifecycle-eligible actions from Unified Home. ${feed.buckets.NOW.length} need attention now, ${feed.buckets.SOON.length} are due soon, ${feed.buckets.PLAN.length} are for planning, and ${feed.buckets.CONSIDER.length} are optional considerations.`),
    tone: empty?.tone ?? (feed.diagnostics.unavailableProducers.length > 0 || selectedActions.some((action) => action.priority === 'NOW') ? 'CAUTION' : 'DEFAULT'),
    actions: [{ id: 'open-home-actions', label: 'Open Home Actions', href: homeHref, style: 'PRIMARY' }],
  }];

  // T08 fix (docs/architecture/ASK_COZY_PHASE5_ATTENTION_ACCEPTANCE_VERIFICATION.md):
  // a source producer this feed depends on can fail without throwing (the
  // feed itself degrades gracefully and still returns), but nothing here
  // used to disclose that -- feed.diagnostics.personalization.status was
  // tracked internally and never read by this function at all. Disclosed
  // the same way INTELLIGENCE_ENVELOPE_QUERY's page.diagnostics already is:
  // named per producer, never collapsed into a generic "something's wrong."
  // Pushed regardless of whether the feed is otherwise empty, mirroring
  // Envelope's own unconditional-on-diagnostics-presence placement.
  if (feed.diagnostics.unavailableProducers.length > 0) {
    blocks.push({
      type: 'BOUNDARY', id: 'home-actions-producer-unavailable',
      title: 'Some Home Action sources were unavailable',
      body: `${formatUnavailableHomeActionProducers(feed.diagnostics.unavailableProducers)} coverage was unavailable when this feed was generated. The actions below still reflect every other source; this is not a complete "nothing else needs attention" read.`,
      severity: 'INFO', suggestions: ['Ask again to retry'],
    });
  }

  // Phase 9B (FRD §17/§21.2): the versioned, explainable channel view of the
  // full governed feed -- independent of this message's ad hoc timing
  // filter (urgentFocus/soonFocus/etc.), since PRIORITY_LIST is meant to be
  // a stable "what matters now" view, not a query-shaped one. Omitted when
  // the feed itself is empty; the SUMMARY block above already carries the
  // honest empty-state copy, and an empty PRIORITY_LIST block risks reading
  // as "nothing needs attention" rather than "feed has no eligible items".
  if (feed.actions.length) {
    const suppressedHomeActionIds = await getSuppressedHomeActionIds({
      userId, propertyId, homeActionIds: feed.actions.map((action) => action.id),
    }).catch(() => new Set<string>());
    blocks.push({
      type: 'PRIORITY_LIST',
      id: 'home-actions-priority-list',
      title: 'What matters now',
      ...buildPriorityListView(feed, 'ASK', { suppressedHomeActionIds }),
    });
  }

  if (selectedActions.length) {
    const priorities = ['NOW', 'SOON', 'PLAN', 'CONSIDER'] as const;
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'home-actions-list', title: 'Prioritized actions',
      // IW-PRES-014 / IW-PRES-022: Home Actions render as shelves (FRD v1.82); the cards are read-only.
      presentation: { pattern: 'SHELVES' },
      description: 'Priority and order come from the canonical Home Action feed. Ask does not independently rerank them.',
      sections: priorities.map((priority) => {
        const actions = selectedActions.filter((action) => action.priority === priority);
        return {
          id: priority.toLowerCase(), title: priority === 'NOW' ? 'Now' : priority === 'SOON' ? 'Soon' : priority === 'PLAN' ? 'Plan' : 'Consider', count: actions.length,
          items: actions.map((action) => ({
            id: action.id,
            title: action.presentation?.headline ?? action.recommendedAction,
            description: action.presentation?.summary ?? action.whyItMatters,
            meta: [
              action.presentation?.eyebrow,
              action.timing.dueAt ? `Due ${humanDate(new Date(action.timing.dueAt))}` : action.timing.rationale,
              `${action.confidence.label.toLowerCase()} confidence`,
              action.source.kind.toLowerCase().replace(/_/g, ' '),
              action.workItem ? `Work ${action.workItem.state.toLowerCase().replace(/_/g, ' ')}` : null,
              action.ranking.explanation,
            ].filter((value): value is string => Boolean(value)),
            status: action.state,
            href: action.primaryCta.href,
            ...homeActionShelfFacts(action, (value) => humanDate(value) ?? ''),
          })),
        };
      }).filter((section) => section.count > 0),
      actions: [],
    });

    const evidenceById = new Map<string, { label: string; source: string | null; observedAt: string | null }>();
    for (const action of selectedActions) {
      for (const evidence of action.evidence) {
        if (!evidenceById.has(evidence.id)) evidenceById.set(evidence.id, { label: evidence.label, source: evidence.source, observedAt: evidence.observedAt });
        if (evidenceById.size >= 30) break;
      }
      if (evidenceById.size >= 30) break;
    }
    blocks.push({ type: 'EVIDENCE', id: 'home-actions-evidence', title: 'Evidence used by these actions', items: [...evidenceById.values()] });
    blocks.push({
      type: 'BOUNDARY', id: 'home-actions-boundary', title: 'Review before acting',
      body: 'Ask is showing governed recommendations, not performing the underlying work. Financial, coverage, provider, purchase, scheduling, and other material actions continue in their dedicated workflows with their required review and confirmation controls.',
      severity: 'INFO', suggestions: [],
    });
  }

  const producersUnavailable = feed.diagnostics.unavailableProducers.length > 0;
  const limited = captureRequests.length > 0 || permissionLimited || lowConfidence || producersUnavailable || feed.diagnostics.emptyStateReason === 'DATA_UNAVAILABLE' || feed.diagnostics.emptyStateReason === 'MISSING_FACTS';
  return {
    status: limited ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length
      ? 'HOME_ACTION_CONTEXT_OPTIONAL'
      : permissionLimited
        ? 'HOME_ACTION_CONTEXT_WRITE_PERMISSION_REQUIRED'
        : lowConfidence
          ? 'HOME_ACTION_LOW_CONFIDENCE'
          : producersUnavailable
            ? 'HOME_ACTION_PRODUCER_UNAVAILABLE'
            : feed.diagnostics.emptyStateReason ? `HOME_ACTION_${feed.diagnostics.emptyStateReason}` : undefined,
    contextVersion: evaluation.contextVersion,
    captureRequests,
    blocks,
    suggestions: ['Anything urgent?', 'What should I plan?', 'What can wait?'],
  };
}

registerCapabilityHandler('home-actions.feed', async (envelope) => homeActionsResult(
  envelope.userId,
  envelope.propertyId!,
  envelope.message,
  envelope.launchContext?.entityType === 'HOME_ACTION'
    ? envelope.launchContext.actionId ?? envelope.launchContext.entityId
    : null,
));
