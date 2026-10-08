import type { SuggestedNextActionCandidate } from './suggestedNextActionCandidate';
import { DEFAULT_CANDIDATE_SIGNALS, DEFAULT_CANDIDATE_TRAITS } from './suggestedNextActionCandidate';

const boundedTitle = (title: string) => title.length > 48 ? `${title.slice(0, 47)}…` : title;

export function diyTemplateStartCandidate(input: {
  propertyId: string; templateId: string; revisionId: string; title: string;
}): SuggestedNextActionCandidate {
  return {
    source: 'OPERATION_RESULT', sourceOperationId: 'DIY_TEMPLATE_BROWSE',
    label: `Start ${boundedTitle(input.title)}`, message: 'Start this project.',
    operationId: 'DIY_PROJECT_START', interactionType: 'MUTATE_RECORD', outcomeKey: 'START_REVIEWED_PROJECT',
    entityContext: { propertyId: input.propertyId, entityType: 'DIY_TEMPLATE', entityId: input.templateId, contextVersion: input.revisionId },
    tier: 'RECORD_ACTION', slotClass: 'EXACT_RECORD', requiredFacts: [], reasonCodes: ['DIY_TEMPLATE_READY'],
    signals: { ...DEFAULT_CANDIDATE_SIGNALS, exactEntityMatch: true, currentResultOwnership: true, sourceConfidence: 1 },
    traits: { ...DEFAULT_CANDIDATE_TRAITS },
  };
}

export function diyProjectGuideCandidate(input: {
  propertyId: string; projectId: string; title: string; contextVersion?: string | null; sourceOperationId: 'DIY_PROJECTS' | 'DIY_TEMPLATE_BROWSE' | 'DIY_PROJECT_START';
}): SuggestedNextActionCandidate {
  return {
    source: 'OPERATION_RESULT', sourceOperationId: input.sourceOperationId,
    label: `Continue ${boundedTitle(input.title)}`, message: 'Guide me through this project.',
    operationId: 'DIY_PROJECT_GUIDE', interactionType: 'CONVERSATION_CONTINUE', outcomeKey: 'CONTINUE_REVIEWED_PROJECT',
    entityContext: { propertyId: input.propertyId, entityType: 'DIY_PROJECT', entityId: input.projectId, contextVersion: input.contextVersion ?? null },
    tier: 'CONTINUE', slotClass: 'CONTINUE_WORK', requiredFacts: [], reasonCodes: ['DIY_PROJECT_ACTIVE'],
    signals: { ...DEFAULT_CANDIDATE_SIGNALS, exactEntityMatch: true, currentResultOwnership: true, sourceConfidence: 1 },
    traits: { ...DEFAULT_CANDIDATE_TRAITS },
  };
}
