// Explore with Cozy (docs/product/ASK_COZY_LIGHTWEIGHT_CAPABILITY_DISCOVERY_IMPLEMENTATION_PLAN.md, Phase 1). The persistent
// discovery topics carried on the Concierge Home payload as `discoveryTopics`. Topic ids, labels and order are stable product
// configuration; which starters are offered, and whether each is available, is decided here on the server from the Ask operation
// registry, the audience policy and the caller's household role. The client renders this projection and never infers an operation
// from a label.
//
// A starter is launched through the ordinary Ask path: its `message` is sent as the turn and its `operationId` rides in
// `launchContext.operationId`, the same registered-operation hint a declared item action uses (createAskExecution validates it against
// ASK_OPERATION_DEFINITIONS and every downstream role/target check still runs). Selecting a topic creates no execution.
import type { HouseholdRole } from '@prisma/client';
import type { AskOperationalControls } from '../../config/askOperationalControls';
import { evaluateAskAudienceApplicability, getAskAudiencePolicy } from './askAudiencePolicy';
import { skillRuntimeUnavailableReason } from './capabilityHandlerRegistry';
import {
  ASK_OPERATION_DEFINITIONS,
  getAskOperationDefinition,
  resolveAskOperation,
  type AskOperationId,
} from './askOperationRegistry';
import {
  ASK_DISCOVERY_TOPIC_IDS,
  type AskDiscoveryStarter,
  type AskDiscoveryTopic,
  type AskDiscoveryTopicId,
} from '../../productFramework/conciergeHome.contract';
import { DIY_TEMPLATE_BROWSE_ACTION } from '../diy/projectGuide';
import { PROPERTY_SUMMARY_COMPLETENESS_STARTER_MESSAGE, PROPERTY_SUMMARY_STARTER_MESSAGE } from './suggestedActions/starterCandidates';
import { SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE, SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE } from './support/seasonalHomeCare';

interface AskDiscoveryStarterDefinition {
  id: string;
  label: string;
  message: string;
  operationId: AskOperationId;
  interactionType: AskDiscoveryStarter['interactionType'];
}

interface AskDiscoveryTopicDefinition {
  id: AskDiscoveryTopicId;
  label: string;
  order: number;
  starters: readonly AskDiscoveryStarterDefinition[];
}

// Reviewed Ask-native starters only. A message-routable operation's message must resolve to that operation (validated below); an
// internal operation (SEASONAL_HOME_CARE, DIY_TEMPLATE_BROWSE) is reached by the launch hint and the exact message. The plan's example
// "Add a missing detail" is deliberately absent: PROPERTY_CONTEXT_AREA_CAPTURE needs a chosen area, and no reviewed generic launch exists.
export const ASK_DISCOVERY_TOPICS: readonly AskDiscoveryTopicDefinition[] = Object.freeze([
  {
    id: 'HOME_CARE', label: 'Home care', order: 1,
    starters: [
      { id: 'home-care-attention', label: 'What needs attention?', message: 'What needs my attention at home?', operationId: 'HOME_ACTIONS', interactionType: 'CONVERSATION_CONTINUE' },
      { id: 'home-care-maintenance-due', label: 'What maintenance is coming due?', message: 'What maintenance tasks are due this month?', operationId: 'MAINTENANCE_STATUS', interactionType: 'CONVERSATION_CONTINUE' },
      { id: 'home-care-seasonal', label: 'Home care for this season', message: SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE, operationId: 'SEASONAL_HOME_CARE', interactionType: 'START_WORKFLOW' },
      { id: 'home-care-next-season', label: 'Get ready for next season', message: SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE, operationId: 'SEASONAL_HOME_CARE', interactionType: 'START_WORKFLOW' },
    ],
  },
  {
    id: 'DIY_PROJECTS', label: 'DIY & Projects', order: 2,
    starters: [
      { id: 'diy-active', label: 'Show my DIY projects', message: 'Show my DIY projects', operationId: 'DIY_PROJECTS', interactionType: 'CONVERSATION_CONTINUE' },
      { id: 'diy-start', label: 'Find a project I can start', message: DIY_TEMPLATE_BROWSE_ACTION.message, operationId: 'DIY_TEMPLATE_BROWSE', interactionType: 'START_WORKFLOW' },
    ],
  },
  {
    id: 'HOME_RECORD', label: 'My Home Record', order: 3,
    starters: [
      { id: 'home-record-summary', label: 'Summarize my home record', message: PROPERTY_SUMMARY_STARTER_MESSAGE, operationId: 'PROPERTY_SUMMARY', interactionType: 'CONVERSATION_CONTINUE' },
      { id: 'home-record-completeness', label: 'How complete is it?', message: PROPERTY_SUMMARY_COMPLETENESS_STARTER_MESSAGE, operationId: 'PROPERTY_SUMMARY', interactionType: 'CONVERSATION_CONTINUE' },
    ],
  },
]);

const ROLE_RANK: Record<HouseholdRole, number> = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 };
const NON_ASK_DESTINATION = /^(?:https?:|\/|#|mailto:)|\b(?:href|navigate to)\b/i;

/** Startup validator (index.ts refuses to boot on an issue): unknown operations, duplicate starters, non-Ask destinations, missing audience policy. */
export function validateAskDiscoveryTopics(): string[] {
  const issues: string[] = [];
  const topicIds = new Set<string>();
  const topicOrders = new Set<number>();
  const starterIds = new Set<string>();
  const starterLaunches = new Set<string>();
  for (const topic of ASK_DISCOVERY_TOPICS) {
    if (topicIds.has(topic.id)) issues.push(`${topic.id}: duplicate discovery topic`);
    topicIds.add(topic.id);
    if (topicOrders.has(topic.order)) issues.push(`${topic.id}: duplicate discovery topic order ${topic.order}`);
    topicOrders.add(topic.order);
    if (!(ASK_DISCOVERY_TOPIC_IDS as readonly string[]).includes(topic.id)) issues.push(`${topic.id}: unknown discovery topic id`);
    if (!topic.starters.length) issues.push(`${topic.id}: discovery topic has no starters`);
    for (const starter of topic.starters) {
      const where = `${topic.id}/${starter.id}`;
      if (starterIds.has(starter.id)) issues.push(`${where}: duplicate discovery starter id`);
      starterIds.add(starter.id);
      const launchKey = `${starter.operationId}\u0000${starter.message.trim().toLowerCase()}`;
      if (starterLaunches.has(launchKey)) issues.push(`${where}: duplicate discovery starter launch`);
      starterLaunches.add(launchKey);
      if (!(starter.operationId in ASK_OPERATION_DEFINITIONS)) {
        issues.push(`${where}: unknown operation ${starter.operationId}`);
        continue;
      }
      const definition = getAskOperationDefinition(starter.operationId);
      if (NON_ASK_DESTINATION.test(starter.message) || NON_ASK_DESTINATION.test(starter.label)) issues.push(`${where}: starter text reads as a non-Ask destination`);
      if (!definition.requiresProperty) issues.push(`${where}: discovery starters are property-scoped, ${starter.operationId} is not`);
      if (!getAskAudiencePolicy(starter.operationId, definition.version)) issues.push(`${where}: ${starter.operationId} has no audience policy`);
      // A message-routable operation must be what the message actually resolves to, otherwise the starter would drift to another answer
      // (or to the grounded-guidance fallback). An internal operation is only reachable through the launch hint, so there is nothing to resolve.
      if (definition.messageRoutable && resolveAskOperation(starter.message).operationId !== starter.operationId) {
        issues.push(`${where}: message does not resolve to ${starter.operationId}`);
      }
    }
  }
  return issues;
}

export interface AskDiscoveryProjectionInput {
  controls: AskOperationalControls;
  householdRole: HouseholdRole;
  /** Already resolved by Concierge Home: UNKNOWN unless audience discovery is active and the journey context is available. */
  operatingMode: Parameters<typeof evaluateAskAudienceApplicability>[0]['operatingMode'];
  propertyId: string;
}

function projectStarter(definition: AskDiscoveryStarterDefinition, input: AskDiscoveryProjectionInput): AskDiscoveryStarter | null {
  const operation = getAskOperationDefinition(definition.operationId);
  const base = {
    id: definition.id, label: definition.label, message: definition.message, operationId: definition.operationId,
    interactionType: definition.interactionType, entityContext: { propertyId: input.propertyId },
  };
  // Fail closed and quiet, like every other Concierge Home discovery surface: a disabled, runtime-unavailable or audience-hidden
  // operation is not advertised at all.
  if (!input.controls.operationEnabled(definition.operationId)) return null;
  if (skillRuntimeUnavailableReason(definition.operationId, input.controls)) return null;
  const policy = getAskAudiencePolicy(definition.operationId, operation.version);
  if (policy) {
    const decision = evaluateAskAudienceApplicability({
      policy, accountRole: 'HOMEOWNER', householdRole: input.householdRole, operatingMode: input.operatingMode, purpose: 'DISCOVERY',
    });
    if (!decision.discoverable) {
      // The caller's role is below the floor: say so honestly rather than offering something that will refuse.
      if (decision.reasonCode === 'ASK_PERMISSION_REQUIRED') return { ...base, availability: 'UNAVAILABLE', reasonCodes: [decision.reasonCode] };
      return null;
    }
  }
  if (operation.propertyRoleFloor && ROLE_RANK[input.householdRole] < ROLE_RANK[operation.propertyRoleFloor]) {
    return { ...base, availability: 'UNAVAILABLE', reasonCodes: ['ASK_PERMISSION_REQUIRED'] };
  }
  return { ...base, availability: 'AVAILABLE', reasonCodes: [] };
}

/** The `discoveryTopics` projection: every topic is always present, in stable order; only its starters vary with authorization and availability. */
export function buildAskDiscoveryTopics(input: AskDiscoveryProjectionInput): AskDiscoveryTopic[] {
  return [...ASK_DISCOVERY_TOPICS]
    .sort((a, b) => a.order - b.order)
    .map((topic) => ({
      id: topic.id,
      label: topic.label,
      order: topic.order,
      indicator: null,
      starters: topic.starters.flatMap((starter) => {
        const projected = projectStarter(starter, input);
        return projected ? [projected] : [];
      }),
    }));
}
