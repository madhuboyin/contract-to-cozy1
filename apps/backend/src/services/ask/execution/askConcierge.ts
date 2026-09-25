// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { logger } from '../../../lib/logger';
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { composeSkillContext } from '../../skills/context/skillContextComposer';
import { skillContextProviderKey } from '../../skills/context/skillContextProviderRegistry';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../../skills/context/propertyJourneyContext.contract';
import { type AskAccountRole } from '../askAccountEligibility';
import { evaluateAskAudienceApplicability, getAskAudiencePolicy } from '../askAudiencePolicy';
import { buildCapabilityCatalog, canonicalCapabilityRegistry, type CapabilityCatalogItem } from '../../../productFramework/capabilities';
import { createToolDiscoveryCapabilityAvailabilityAdapter } from '../../toolDiscoveryAvailability.service';
import { getAskOperationDefinition, resolveAskOperation, type AskOperationId } from '../askOperationRegistry';
import { skillRuntimeUnavailableReason } from '../capabilityHandlerRegistry';
import { getHomeActionFeed } from '../../homeActions.service';
import { money } from '../askFormatting';
import { ensureAskServiceAccountEligibility, ensurePropertyAccess, HOME_CHANGE_SUMMARY_WINDOW_DAYS, journeyContextFrom } from '../askHandlerSupport';
import * as decisionThreadService from '../../decisionPlatform/decisionThreadService';
import { listPropertyChanges } from '../../../propertyChanges/propertyChange.service';
import { buildChangeSummaryText, sourceTypeLabel } from '../../decisionPlatform/homeChangeSummaryMapping';
import { buildPriorityListView } from '../../decisionPlatform/priorityListPolicy';
import { getSuppressedHomeActionIds } from '../../decisionPlatform/homeActionUsefulnessFeedback.service';
import type { ConciergeHomeView } from '../../../productFramework/conciergeHome.contract';
import { conciergeLandingSubjectKey, inventoryDecisionQuestion, selectConciergeLandingSpotlight, selectInventoryDecisionCandidate } from '../askConciergePromptPolicy';
import { getSkillDefinition } from '../../skills/skillRegistry';
import { focusedHomeActionCategory, focusedHomeActionQuestion } from '../askFocusedGuidance';
import { lifecyclePromptsFor } from '../askLifecyclePromptPolicy';

type ConciergeCapabilityGroupDefinition = Omit<ConciergeHomeView['capabilityGroups'][number], 'capabilityIds'> & {
  outcomeCategory: CapabilityCatalogItem['outcomeCategory'];
};

const CONCIERGE_CAPABILITY_GROUPS: readonly ConciergeCapabilityGroupDefinition[] = [
  {
    id: 'UNDERSTAND', label: 'Understand your home', outcomeCategory: 'UNDERSTAND_HOME',
    description: 'Turn home records into a clear, useful picture.',
    prompts: [
      { id: 'understand-summary', categoryId: 'UNDERSTAND', categoryLabel: 'Understand', question: 'Give me a summary of my home record.' },
      { id: 'understand-completeness', categoryId: 'UNDERSTAND', categoryLabel: 'Understand', question: 'How complete is my home record?' },
    ],
  },
  {
    id: 'MAINTAIN', label: 'Maintain and prevent', outcomeCategory: 'MAINTAIN_PREVENT',
    description: 'Stay ahead of maintenance and prevent avoidable problems.',
    prompts: [
      { id: 'maintain-due', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', question: 'What maintenance tasks are due this month?' },
      { id: 'maintain-create', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', question: 'Create a maintenance task for changing my HVAC filter.' },
    ],
  },
  {
    id: 'PROTECT', label: 'Protect your home', outcomeCategory: 'PROTECT_MONITOR',
    description: 'Find coverage gaps, risks, and important changes.',
    prompts: [
      { id: 'protect-coverage', categoryId: 'PROTECT', categoryLabel: 'Protect', question: 'Which items are missing coverage?' },
      { id: 'protect-changes', categoryId: 'PROTECT', categoryLabel: 'Protect', question: 'What changed recently for this home?' },
    ],
  },
  {
    id: 'SAVE', label: 'Reduce costs', outcomeCategory: 'SAVE_OPTIMIZE',
    description: 'Understand spending and uncover relevant savings.',
    prompts: [
      { id: 'save-opportunities', categoryId: 'SAVE', categoryLabel: 'Save', question: 'Where could I save money on this home?' },
      { id: 'save-costs', categoryId: 'SAVE', categoryLabel: 'Save', question: 'What are my biggest ownership costs?' },
    ],
  },
  {
    id: 'DECIDE', label: 'Compare and decide', outcomeCategory: 'DECIDE_COMPARE',
    description: 'Compare options with the relevant home context.',
    prompts: [
      { id: 'decide-replace', categoryId: 'DECIDE', categoryLabel: 'Decide', question: 'Help me compare repair and replacement options for a home system or appliance.' },
      { id: 'decide-quotes', categoryId: 'DECIDE', categoryLabel: 'Decide', question: 'Help me compare contractor quotes.' },
    ],
  },
  {
    id: 'PLAN_MONITOR', label: 'Plan and monitor', outcomeCategory: 'PLAN_BUDGET',
    description: 'Build plans and keep watch on important deadlines.',
    prompts: [
      { id: 'plan-reserve', categoryId: 'PLAN_MONITOR', categoryLabel: 'Plan', question: 'Create a capital reserve plan for future replacements.' },
      { id: 'plan-deadlines', categoryId: 'PLAN_MONITOR', categoryLabel: 'Plan', question: 'Monitor my important home deadlines.' },
    ],
  },
] as const;

// Ask Intelligence FRD §18.4, Phase 9B "Concierge Home" deliverable. A
// read-only composition of three already-governed sources -- never a
// fourth ranking/change/decision system of its own (mirrors PRIORITY_LIST's
// "no second feed" discipline from §17.1). Each section fails independently
// and reports its own honest state rather than one section's outage taking
// down the whole panel or silently reading as "all clear".
export async function getConciergeHome(userId: string, propertyId: string, accountRole?: AskAccountRole): Promise<ConciergeHomeView> {
  await ensureAskServiceAccountEligibility(userId, accountRole);
  const conciergeAccess = await ensurePropertyAccess(userId, propertyId);
  const controls = readAskOperationalControls();
  const homeHref = `/dashboard?propertyId=${encodeURIComponent(propertyId)}`;
  const askHref = `/dashboard/ask?propertyId=${encodeURIComponent(propertyId)}`;
  const capabilityGroups: ConciergeHomeView['capabilityGroups'] = (() => {
    try {
      const capabilityCatalog = buildCapabilityCatalog({
        registry: canonicalCapabilityRegistry,
        availability: createToolDiscoveryCapabilityAvailabilityAdapter(canonicalCapabilityRegistry),
        userId,
        propertyId,
        includeWorkflowContext: false,
      });
      return CONCIERGE_CAPABILITY_GROUPS.flatMap((group) => {
        const capabilityIds = capabilityCatalog.capabilities
          .filter((capability) => capability.outcomeCategory === group.outcomeCategory)
          .map((capability) => capability.id);
        return capabilityIds.length ? [{
          id: group.id,
          label: group.label,
          description: group.description,
          capabilityIds,
          prompts: [...group.prompts],
        }] : [];
      });
    } catch (error) {
      logger.warn({ err: error, propertyId, userId }, 'Concierge Home capability discovery failed closed');
      return [];
    }
  })();

  const priorityListPromise = (async (): Promise<ConciergeHomeView['priorityList']> => {
    try {
      const feed = await getHomeActionFeed(propertyId, userId);
      const suppressedHomeActionIds = await getSuppressedHomeActionIds({
        userId, propertyId, homeActionIds: feed.actions.map((action) => action.id),
      }).catch(() => new Set<string>());
      const view = buildPriorityListView(feed, 'CONCIERGE_HOME', { suppressedHomeActionIds });
      const sourceActions = new Map(feed.actions.map((action) => [action.id, action]));
      return {
        state: view.items.length ? 'AVAILABLE' : 'NO_ACTION',
        rankingPolicyVersion: view.rankingPolicyVersion,
        generatedAt: view.generatedAt,
        items: view.items.map((item) => {
          const sourceAction = sourceActions.get(item.homeActionId);
          const category = sourceAction ? focusedHomeActionCategory(sourceAction) : { categoryId: 'MAINTAIN' as const, categoryLabel: 'Maintain' as const };
          return {
            homeActionId: item.homeActionId,
            title: item.title,
            askQuestion: sourceAction ? focusedHomeActionQuestion(sourceAction) : `What should I do next for “${item.title}”?`,
            askCategoryId: category.categoryId,
            askCategoryLabel: category.categoryLabel,
            subject: sourceAction?.presentation?.subject ?? null,
            consumerPriority: item.consumerPriority,
            comparativeReasonCodes: item.comparativeReasonCodes,
            confidenceLabel: item.confidenceLabel,
            deadlineAt: item.deadlineAt,
            cta: item.cta ? { label: item.cta.label, href: item.cta.href } : null,
            watchState: item.watchState,
            suppressed: item.suppressed,
            completed: item.completed,
            unavailable: item.unavailable,
            stale: item.stale,
          };
        }),
        truncated: view.truncated,
        href: homeHref,
      };
    } catch (error) {
      logger.warn({ err: error, propertyId, userId }, 'Concierge Home priority list section failed closed');
      return { state: 'UNAVAILABLE', rankingPolicyVersion: null, generatedAt: null, items: [], truncated: false, href: homeHref };
    }
  })();

  const changesPromise = (async (): Promise<ConciergeHomeView['changes']> => {
    try {
      const since = new Date(Date.now() - HOME_CHANGE_SUMMARY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const changes = await listPropertyChanges({ propertyId, userId, since });
      const seenSummaries = new Set<string>();
      const material = changes.filter((change) => {
        if (change.materiality === 'INFORMATIONAL') return false;
        const summaryKey = `${change.sourceType}:${change.changeType}`;
        if (seenSummaries.has(summaryKey)) return false;
        seenSummaries.add(summaryKey);
        return true;
      }).slice(0, 3);
      return {
        state: material.length ? 'AVAILABLE' : 'NO_CHANGE',
        windowDays: HOME_CHANGE_SUMMARY_WINDOW_DAYS,
        items: material.map((change) => ({
          id: change.id,
          source: sourceTypeLabel(change.sourceType),
          summary: buildChangeSummaryText({ sourceType: change.sourceType, changeType: change.changeType }),
          materiality: change.materiality,
          detectedAt: change.detectedAt.toISOString(),
          effectiveAt: change.occurredAt ? change.occurredAt.toISOString() : null,
        })),
        href: askHref,
      };
    } catch (error) {
      logger.warn({ err: error, propertyId, userId }, 'Concierge Home changed-recently section failed closed');
      return { state: 'UNAVAILABLE', windowDays: HOME_CHANGE_SUMMARY_WINDOW_DAYS, items: [], href: askHref };
    }
  })();

  const decisionsPromise = (async (): Promise<ConciergeHomeView['decisions']> => {
    try {
      const threads = await decisionThreadService.listActiveDecisionThreadsForProperty(propertyId);
      const supportedThreads = threads.filter((thread) => thread.decisionDefinitionId === 'HVAC_REPAIR_REPLACE');
      return {
        state: supportedThreads.length ? 'AVAILABLE' : 'NO_DECISIONS',
        items: supportedThreads.map((thread) => ({
          decisionThreadId: thread.id,
          title: thread.title,
          lifecycleStatus: thread.lifecycleStatus,
          contextStatus: thread.contextStatus,
          verdict: thread.currentRecommendationSnapshot?.verdictCode ?? null,
          confidenceLabel: (thread.currentRecommendationSnapshot?.confidenceBreakdown as { label?: 'HIGH' | 'MEDIUM' | 'LOW' } | null)?.label ?? null,
          subject: thread.primaryEntityType?.replace(/[^a-z]/gi, '').toUpperCase() === 'INVENTORYITEM' && thread.primaryEntityId
            ? { kind: 'INVENTORY_ITEM' as const, id: thread.primaryEntityId, label: thread.title.slice(0, 180) }
            : null,
          updatedAt: thread.updatedAt.toISOString(),
        })),
        href: askHref,
      };
    } catch (error) {
      logger.warn({ err: error, propertyId, userId }, 'Concierge Home decisions-in-progress section failed closed');
      return { state: 'UNAVAILABLE', items: [], href: askHref };
    }
  })();

  const inventoryDecisionCandidatePromise = (async () => {
    try {
      const select = { id: true, name: true, condition: true, expectedExpiryDate: true, updatedAt: true } as const;
      const [conditionItems, lifecycleItems] = await Promise.all([
        prisma.inventoryItem.findMany({
          where: { propertyId, condition: { in: ['FAIR', 'POOR'] } },
          select,
          orderBy: [{ condition: 'desc' }, { updatedAt: 'desc' }],
          take: 25,
        }),
        prisma.inventoryItem.findMany({
          where: { propertyId, expectedExpiryDate: { lte: new Date(Date.now() + 2 * 365.25 * 24 * 60 * 60 * 1000) } },
          select,
          orderBy: [{ expectedExpiryDate: 'asc' }, { updatedAt: 'desc' }],
          take: 25,
        }),
      ]);
      return selectInventoryDecisionCandidate([
        ...new Map([...conditionItems, ...lifecycleItems].map((item) => [item.id, item])).values(),
      ]);
    } catch (error) {
      logger.warn({ err: error, propertyId, userId }, 'Concierge Home inventory-aware prompt selection failed closed');
      return null;
    }
  })();

  const journeyContextPromise = (async (): Promise<ConciergeHomeView['journeyContext']> => {
    try {
      const skill = getSkillDefinition('property-record');
      if (!skill) throw new Error('Property Record Skill is not registered.');
      const composed = await composeSkillContext({
        skill,
        operationId: 'PROPERTY_SUMMARY',
        userId,
        propertyId,
      }, { providerEnabled: controls.contextProviderEnabled });
      const entry = composed.entries.find((candidate) => candidate.key === skillContextProviderKey(PROPERTY_JOURNEY_CONTEXT_PROVIDER));
      const context = journeyContextFrom(composed);
      if (entry?.status === 'UNKNOWN' || (entry?.status === 'AVAILABLE' && !context)) {
        return {
          state: 'UNKNOWN', ownershipState: null, operatingMode: 'UNKNOWN', entryPath: null,
          propertyOrigin: null, contextVersion: null, capturedAt: null,
        };
      }
      if (!context || entry?.status !== 'AVAILABLE') {
        return {
          state: 'UNAVAILABLE', ownershipState: null, operatingMode: 'UNKNOWN', entryPath: null,
          propertyOrigin: null, contextVersion: null, capturedAt: null,
        };
      }
      return {
        state: 'AVAILABLE',
        ownershipState: context.ownershipState,
        operatingMode: context.operatingMode,
        entryPath: context.entryPath,
        propertyOrigin: context.propertyOrigin,
        contextVersion: context.contextVersion,
        capturedAt: context.capturedAt,
      };
    } catch (error) {
      logger.warn({ err: error, propertyId, userId }, 'Concierge Home journey context failed closed');
      return {
        state: 'UNAVAILABLE', ownershipState: null, operatingMode: 'UNKNOWN', entryPath: null,
        propertyOrigin: null, contextVersion: null, capturedAt: null,
      };
    }
  })();

  const [priorityList, changes, decisions, inventoryDecisionCandidate, journeyContext] = await Promise.all([
    priorityListPromise,
    changesPromise,
    decisionsPromise,
    inventoryDecisionCandidatePromise,
    journeyContextPromise,
  ]);
  const audienceDiscoveryActive = controls.audienceDiscoveryEnabled && controls.audiencePolicyEnabled;
  const discoveryOperatingMode = audienceDiscoveryActive && journeyContext.state === 'AVAILABLE'
    ? journeyContext.operatingMode
    : 'UNKNOWN';
  const promptOperationId = (prompt: ConciergeHomeView['featuredPrompts'][number] | ConciergeHomeView['capabilityGroups'][number]['prompts'][number]): AskOperationId => {
    const contextualOperation: AskOperationId | null = prompt.context?.entityType === 'DECISION_THREAD'
      ? 'HVAC_DECISION_CONTINUE'
      : prompt.context?.entityType === 'INVENTORY_ITEM'
        ? 'REPLACEMENT_GUIDANCE'
        : prompt.context?.entityType === 'HOME_ACTION'
          ? 'HOME_ACTIONS'
        : null;
    return contextualOperation ?? resolveAskOperation(prompt.question).operationId;
  };
  const operationIsDiscoverable = (operationId: AskOperationId): boolean => {
    if (!controls.operationEnabled(operationId)) return false;
    if (skillRuntimeUnavailableReason(operationId, controls)) return false;
    const policy = getAskAudiencePolicy(operationId, getAskOperationDefinition(operationId).version);
    if (!policy) return true;
    return evaluateAskAudienceApplicability({
      policy,
      accountRole: 'HOMEOWNER',
      householdRole: conciergeAccess.role,
      operatingMode: discoveryOperatingMode,
      purpose: 'DISCOVERY',
    }).discoverable;
  };
  const promptIsDiscoverable = (prompt: ConciergeHomeView['featuredPrompts'][number] | ConciergeHomeView['capabilityGroups'][number]['prompts'][number]): boolean => (
    operationIsDiscoverable(promptOperationId(prompt))
  );
  const audienceCapabilityGroups: ConciergeHomeView['capabilityGroups'] = capabilityGroups
    .map((group) => ({ ...group, prompts: group.prompts.filter(promptIsDiscoverable) }))
    .filter((group) => group.prompts.length > 0);
  const eligiblePriorityItems = priorityList.items
    .filter((item) => !item.suppressed && !item.completed && !item.unavailable && !item.stale && item.consumerPriority !== 'NO_ACTION');
  const topPriority = eligiblePriorityItems[0];
  const topDecision = decisions.state === 'AVAILABLE' ? decisions.items[0] : undefined;
  const landingSpotlight = selectConciergeLandingSpotlight({ attention: topPriority, decision: topDecision });
  const spotlightSubject = landingSpotlight?.kind === 'ATTENTION'
    ? eligiblePriorityItems.find((item) => item.homeActionId === landingSpotlight.entityId)?.subject
    : landingSpotlight?.kind === 'DECISION'
      ? decisions.items.find((item) => item.decisionThreadId === landingSpotlight.entityId)?.subject
      : null;
  const reservedSubjectKeys = new Set<string>();
  const spotlightSubjectKey = conciergeLandingSubjectKey(spotlightSubject);
  if (spotlightSubjectKey) reservedSubjectKeys.add(spotlightSubjectKey);
  const featuredPrompts: ConciergeHomeView['featuredPrompts'] = [];
  const representedOperations = new Set<AskOperationId>();
  const representedSubjectKeys = new Set<string>();
  const addPrompt = (prompt: ConciergeHomeView['featuredPrompts'][number], boundOperationId?: AskOperationId): boolean => {
    const operationId = boundOperationId ?? promptOperationId(prompt);
    const subjectKey = conciergeLandingSubjectKey(prompt.subject);
    if (!operationIsDiscoverable(operationId)
      || representedOperations.has(operationId)
      || featuredPrompts.length >= 4
      || (subjectKey !== null && (reservedSubjectKeys.has(subjectKey) || representedSubjectKeys.has(subjectKey)))
      || featuredPrompts.some((existing) => existing.question.toLowerCase() === prompt.question.toLowerCase())) return false;
    featuredPrompts.push(prompt);
    representedOperations.add(operationId);
    if (subjectKey) representedSubjectKeys.add(subjectKey);
    return true;
  };
  if (topDecision && !(landingSpotlight?.kind === 'DECISION' && landingSpotlight.entityId === topDecision.decisionThreadId)) {
    addPrompt({
      id: `decision-${topDecision.decisionThreadId}`,
      categoryId: 'DECIDE',
      categoryLabel: 'Decide',
      question: `Help me continue this decision: ${topDecision.title}`,
      subject: topDecision.subject ?? undefined,
      context: { entityType: 'DECISION_THREAD', entityId: topDecision.decisionThreadId },
      source: 'PERSONALIZED',
    });
  }
  if (topPriority && !(landingSpotlight?.kind === 'ATTENTION' && landingSpotlight.entityId === topPriority.homeActionId)) {
    addPrompt({
      id: `attention-${topPriority.homeActionId}`,
      categoryId: topPriority.askCategoryId,
      categoryLabel: topPriority.askCategoryLabel,
      question: topPriority.askQuestion,
      subject: topPriority.subject ?? undefined,
      context: { entityType: 'HOME_ACTION', entityId: topPriority.homeActionId, actionId: topPriority.homeActionId, capabilityId: 'home-operations' },
      source: 'PERSONALIZED',
    });
  }
  if (inventoryDecisionCandidate && !featuredPrompts.some((prompt) => prompt.categoryId === 'DECIDE')) {
    addPrompt({
      id: `inventory-decision-${inventoryDecisionCandidate.id}`,
      categoryId: 'DECIDE',
      categoryLabel: 'Decide',
      question: inventoryDecisionQuestion(inventoryDecisionCandidate.name),
      subject: { kind: 'INVENTORY_ITEM', id: inventoryDecisionCandidate.id, label: inventoryDecisionCandidate.name.slice(0, 180) },
      context: { entityType: 'INVENTORY_ITEM', entityId: inventoryDecisionCandidate.id, capabilityId: 'replace-repair' },
      source: 'PERSONALIZED',
    });
  }
  const representedCategories = new Set(featuredPrompts.map((prompt) => prompt.categoryId));
  const lifecyclePrompts = lifecyclePromptsFor(
    audienceDiscoveryActive && journeyContext.state === 'AVAILABLE' ? journeyContext.ownershipState : null,
  );
  for (const prompt of lifecyclePrompts) {
    if (representedCategories.has(prompt.categoryId)) continue;
    const added = addPrompt({
      id: prompt.id,
      categoryId: prompt.categoryId,
      categoryLabel: prompt.categoryLabel,
      question: prompt.question,
      source: 'PERSONALIZED',
    }, prompt.operationId);
    if (added) representedCategories.add(prompt.categoryId);
  }
  for (const group of audienceCapabilityGroups) {
    if (representedCategories.has(group.id) || !group.prompts[0]) continue;
    if (addPrompt({ ...group.prompts[0], source: 'DISCOVERY' })) representedCategories.add(group.id);
  }
  for (const group of audienceCapabilityGroups) {
    for (const prompt of group.prompts) addPrompt({ ...prompt, source: 'DISCOVERY' });
  }

  return {
    propertyId,
    generatedAt: new Date().toISOString(),
    journeyContext,
    priorityList,
    changes,
    decisions,
    landingSpotlight,
    capabilityGroups: audienceCapabilityGroups,
    featuredPrompts,
    suggestedQuestions: featuredPrompts.map((prompt) => prompt.question),
  };
}
