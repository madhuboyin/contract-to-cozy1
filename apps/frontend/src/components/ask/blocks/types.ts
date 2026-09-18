import type { AskItemActionInteractionType, AskPresentationBlock } from '@/features/ask/types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.3: the block registry (./registry.tsx)
// registers one renderer per validated `AskPresentationBlock['type']`
// instead of branching inside one monolithic function. Every renderer,
// wherever its own file lives, takes this same prop shape so it can be
// registered interchangeably.
export type AskBlockType = AskPresentationBlock['type'];

export type AskBlockRendererProps<TBlock extends AskPresentationBlock = AskPresentationBlock> = {
  block: TBlock;
  executionId: string;
  propertyId?: string;
  onItemAction: (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType) => void;
  itemActionsDisabled: boolean;
  onFilterClick: (message: string) => void;
  onCollectionPage: (sectionId: string, direction: 'NEXT' | 'PREVIOUS') => void;
  onAccessLost: () => void;
  onOpenContext?: (trigger: HTMLButtonElement) => void;
};

export type AskBlockRenderer<T extends AskBlockType> = (
  props: AskBlockRendererProps<Extract<AskPresentationBlock, { type: T }>>
) => JSX.Element | null;
