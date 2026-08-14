import type { HouseholdRole, OnboardingOwnershipState } from '@prisma/client';
import type { AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import type { PropertyJourneyContext } from '../skills/context/propertyJourneyContext.contract';
import type { AskOperationResult } from './askOperationRegistry';

type AskAction = Extract<AskPresentationBlock, { type: 'SUMMARY' }>['actions'][number];

const MUTATION_ACTION_PATTERN = /^(?:add|archive|cancel|change|complete|confirm|create|delete|disable|edit|enable|forget|invite|mark|monitor|notify|recalculate|record|remove|report|reschedule|run|save|schedule|send|set|start|submit|unlink|update|upload)\b/i;
const MUTATION_SUGGESTION_PATTERN = /^(?:(?:can|could|would) you |please |help me |i want to )?(?:add|archive|cancel|change|complete|confirm|create|delete|disable|edit|enable|forget|invite|mark|monitor|notify|recalculate|record|remove|report|reschedule|run|save|schedule|send|set|start|submit|unlink|update|upload)\b/i;
const OWNER_ONLY_ACTION_PATTERN = /^(?:invite|manage household|add member|remove member|change owner|update shared profile)\b/i;

function actionAllowed(action: AskAction, householdRole: HouseholdRole): boolean {
  const actionId = action.id.replace(/[-_]/g, ' ');
  if (householdRole === 'VIEWER' && (MUTATION_ACTION_PATTERN.test(actionId) || MUTATION_ACTION_PATTERN.test(action.label))) return false;
  if (householdRole === 'CONTRIBUTOR' && (OWNER_ONLY_ACTION_PATTERN.test(actionId) || OWNER_ONLY_ACTION_PATTERN.test(action.label))) return false;
  return true;
}

function filterActions(actions: AskAction[], householdRole: HouseholdRole): AskAction[] {
  return actions.filter((action) => actionAllowed(action, householdRole));
}

function filterBlockActions(block: AskPresentationBlock, householdRole: HouseholdRole): AskPresentationBlock {
  switch (block.type) {
    case 'SUMMARY':
    case 'GROUPED_LIST':
    case 'TABLE':
    case 'MONITOR':
    case 'WORKFLOW_PROGRESS':
    case 'COMPARISON':
    case 'DECISION_PROGRESS':
    case 'SCENARIO_COMPARISON':
    case 'EMPTY_STATE':
    case 'ERROR_STATE':
      return { ...block, actions: filterActions(block.actions, householdRole) } as AskPresentationBlock;
    case 'BOUNDARY':
      return { ...block, actions: filterActions(block.actions ?? [], householdRole) } as AskPresentationBlock;
    case 'PRIORITY_LIST':
      return {
        ...block,
        items: block.items.map((item) => ({
          ...item,
          cta: item.cta && actionAllowed(item.cta, householdRole) ? item.cta : null,
        })),
      };
    default:
      return block;
  }
}

function lifecycleFraming(ownershipState: OnboardingOwnershipState | null): string {
  if (ownershipState === 'SHOPPING' || ownershipState === 'UNDER_CONTRACT') {
    return 'For a home you are buying, prioritize verified records, unresolved conditions, and costs that could matter before or shortly after closing.';
  }
  if (ownershipState === 'RECENT_OWNER') {
    return 'For a recently acquired home, prioritize safety, warranties, and recurring maintenance during the first months of ownership.';
  }
  if (ownershipState === 'ESTABLISHED_OWNER') {
    return 'For an established home, this guidance emphasizes current condition, upcoming work, and sustainable long-term costs.';
  }
  if (ownershipState === 'PREPARING_TRANSFER') {
    return 'For a home being prepared for transfer, prioritize record accuracy, unresolved work, and items that may affect sale readiness.';
  }
  return 'This is general home guidance because the ownership stage has not been confirmed.';
}

function suggestionAllowed(suggestion: string, householdRole: HouseholdRole): boolean {
  if (householdRole === 'VIEWER' && MUTATION_SUGGESTION_PATTERN.test(suggestion)) return false;
  if (householdRole === 'CONTRIBUTOR' && OWNER_ONLY_ACTION_PATTERN.test(suggestion)) return false;
  return true;
}

export function applyAskAudiencePresentation(input: {
  result: AskOperationResult;
  householdRole: HouseholdRole;
  journeyContext: PropertyJourneyContext | null;
  propertyId?: string | null;
  lifecycleFramingEnabled?: boolean;
}): AskOperationResult {
  const ownershipState = input.journeyContext?.ownershipState ?? null;
  const framing = input.lifecycleFramingEnabled === false ? '' : lifecycleFraming(ownershipState);
  const filteredBlocks = input.result.blocks.map((block) => filterBlockActions(block, input.householdRole));
  const actionsBefore = input.result.blocks.reduce((count, block) => {
    if ('actions' in block && Array.isArray(block.actions)) return count + block.actions.length;
    if (block.type === 'PRIORITY_LIST') return count + block.items.filter((item) => item.cta).length;
    return count;
  }, 0);
  const actionsAfter = filteredBlocks.reduce((count, block) => {
    if ('actions' in block && Array.isArray(block.actions)) return count + block.actions.length;
    if (block.type === 'PRIORITY_LIST') return count + block.items.filter((item) => item.cta).length;
    return count;
  }, 0);
  const filteredSuggestions = input.result.suggestions.filter((suggestion) => suggestionAllowed(suggestion, input.householdRole));
  const permissionFiltered = actionsAfter < actionsBefore
    || filteredSuggestions.length < input.result.suggestions.length
    || (input.householdRole === 'VIEWER' && Boolean(input.result.captureRequests?.length || input.result.confirmation));
  const permissionNotice = permissionFiltered
    ? input.householdRole === 'VIEWER'
      ? ' You can review this information, but a contributor or owner is required to make changes.'
      : ' An owner is required for household-administration changes.'
    : '';
  const framingText = `${framing}${permissionNotice}`.trim();
  const summaryIndex = filteredBlocks.findIndex((block) => block.type === 'SUMMARY');
  const blocks = [...filteredBlocks];
  const journeyCorrectionAction: AskAction | null = !ownershipState
    && input.propertyId
    && input.householdRole !== 'VIEWER'
    && input.lifecycleFramingEnabled !== false
    ? {
      id: 'review-home-journey',
      label: 'Confirm home journey',
      href: `/dashboard/properties/${encodeURIComponent(input.propertyId)}/onboarding#home-journey`,
      style: 'SECONDARY',
    }
    : null;
  if (summaryIndex >= 0 && framingText) {
    const summary = blocks[summaryIndex] as Extract<AskPresentationBlock, { type: 'SUMMARY' }>;
    blocks[summaryIndex] = {
      ...summary,
      body: `${framingText} ${summary.body}`,
      actions: journeyCorrectionAction && summary.actions.length < 3
        ? [...summary.actions, journeyCorrectionAction]
        : summary.actions,
    };
  } else if (framingText && ((input.lifecycleFramingEnabled !== false && !ownershipState) || permissionNotice)) {
    blocks.push({
      type: 'BOUNDARY',
      id: 'ask-audience-presentation',
      title: ownershipState ? 'Available actions reflect your household role' : 'General guidance',
      body: framingText,
      severity: 'INFO',
      suggestions: [],
      actions: journeyCorrectionAction ? [journeyCorrectionAction] : [],
    });
  }

  return {
    ...input.result,
    blocks,
    captureRequests: input.householdRole === 'VIEWER' ? [] : input.result.captureRequests,
    confirmation: input.householdRole === 'VIEWER' ? null : input.result.confirmation,
    suggestions: filteredSuggestions,
    parameters: {
      ...(input.result.parameters ?? {}),
      audiencePresentation: {
        ownershipState: ownershipState ?? 'UNKNOWN',
        operatingMode: input.journeyContext?.operatingMode ?? 'UNKNOWN',
        householdRole: input.householdRole,
        permissionFiltered,
        lifecycleFramingEnabled: input.lifecycleFramingEnabled !== false,
        journeyCorrectionOffered: Boolean(journeyCorrectionAction),
        framingText,
      },
    },
  };
}
