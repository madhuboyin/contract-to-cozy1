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
import { getAskOperationDefinition, type AskOperationId } from './askOperationRegistry';
import {
  ASK_DISCOVERY_TOPIC_IDS,
  type AskDiscoveryStarter,
  type AskDiscoveryTopic,
  type AskDiscoveryTopicId,
} from '../../productFramework/conciergeHome.contract';
import { explorerEntryById } from './askExplorerRegistry';

/** A topic starter is a REFERENCE to a reviewed explorer entry: label, message, operation and interaction come from the registry, so the topics never define the inventory. */
interface AskDiscoveryStarterDefinition {
  id: string;
  entryId: string;
}

interface AskDiscoveryTopicDefinition {
  id: AskDiscoveryTopicId;
  label: string;
  order: number;
  starters: readonly AskDiscoveryStarterDefinition[];
}

// Reviewed Ask-native starters only. The plan's example "Add a missing detail" is deliberately absent: PROPERTY_CONTEXT_AREA_CAPTURE needs a
// chosen area, and no reviewed generic launch exists.
export const ASK_DISCOVERY_TOPICS: readonly AskDiscoveryTopicDefinition[] = Object.freeze([
  {
    id: 'HOME_CARE', label: 'Home care', order: 1,
    starters: [
      { id: 'home-care-attention', entryId: 'maintain-attention' },
      { id: 'home-care-maintenance-due', entryId: 'maintain-due' },
      { id: 'home-care-seasonal', entryId: 'maintain-seasonal' },
      { id: 'home-care-next-season', entryId: 'maintain-next-season' },
    ],
  },
  {
    id: 'DIY_PROJECTS', label: 'DIY & Projects', order: 2,
    starters: [
      { id: 'diy-active', entryId: 'maintain-diy' },
      { id: 'diy-start', entryId: 'maintain-diy-start' },
    ],
  },
  {
    id: 'HOME_RECORD', label: 'My Home Record', order: 3,
    starters: [
      { id: 'home-record-summary', entryId: 'understand-summary' },
      { id: 'home-record-completeness', entryId: 'understand-completeness' },
    ],
  },
]);

interface ResolvedStarter { id: string; entryId: string; capabilityId: string; label: string; message: string; operationId: AskOperationId; interactionType: AskDiscoveryStarter['interactionType'] }

function resolveStarter(definition: AskDiscoveryStarterDefinition): ResolvedStarter | null {
  const entry = explorerEntryById(definition.entryId);
  return entry ? { id: definition.id, entryId: entry.id, capabilityId: entry.capabilityId, label: entry.label, message: entry.question, operationId: entry.operationId, interactionType: entry.interactionType } : null;
}

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
    for (const reference of topic.starters) {
      const where = `${topic.id}/${reference.id}`;
      if (starterIds.has(reference.id)) issues.push(`${where}: duplicate discovery starter id`);
      starterIds.add(reference.id);
      const starter = resolveStarter(reference);
      if (!starter) {
        issues.push(`${where}: unknown explorer entry ${reference.entryId}`);
        continue;
      }
      // Label, wording, operation, aliases, consequence and routing are validated once, on the entry (validateAskExplorerRegistry).
      const launchKey = `${starter.operationId}\u0000${starter.message.trim().toLowerCase()}`;
      if (starterLaunches.has(launchKey)) issues.push(`${where}: duplicate discovery starter launch`);
      starterLaunches.add(launchKey);
      const entry = explorerEntryById(reference.entryId)!;
      if (entry.kind !== 'READ') issues.push(`${where}: topic starters are reads; ${entry.id} is a governed workflow`);
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
  /** Owning-domain indicators (Phase 3); a topic with no entry, or null, renders without one. */
  indicators?: Partial<Record<AskDiscoveryTopicId, AskDiscoveryTopic['indicator']>>;
}

function projectStarter(definition: ResolvedStarter, input: AskDiscoveryProjectionInput): AskDiscoveryStarter | null {
  const operation = getAskOperationDefinition(definition.operationId);
  const base = {
    id: definition.id, entryId: definition.entryId, capabilityId: definition.capabilityId, label: definition.label, message: definition.message, operationId: definition.operationId,
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
      indicator: input.indicators?.[topic.id] ?? null,
      starters: topic.starters.flatMap((reference) => {
        const starter = resolveStarter(reference);
        const projected = starter ? projectStarter(starter, input) : null;
        return projected ? [projected] : [];
      }),
    }));
}
