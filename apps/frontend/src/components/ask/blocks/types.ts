import type { AskBatchDecision, AskItemActionInteractionType, AskPresentationBlock } from '@/features/ask/types';

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
  // documentId (optional 6th param) exists only for HomeEventResultList's bespoke "Attach evidence" control
  // (ASK_COZY_INLINE_WORKSPACE_FRD Phase 3, evidence upload design, approved 2026-09-22): every other caller
  // omits it, since every other item action dispatches immediately with no out-of-band upload step first.
  // actionId (optional 7th param) exists only for RadarEventDetail's "Plan this action" (FRD v1.41): the
  // recommended action's code, sent as launchContext.actionId.
  onItemAction: (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType, documentId?: string, actionId?: string) => void;
  // IW-PRES-015 (FRD v1.75): sends a card deck's collected decisions as one request, which returns one confirmation.
  // Optional: where a renderer is used without it, a deck that declares a batch falls back to the plain list.
  onBatchItemAction?: (batch: { operationId: string; entityType: string; message: string; decisions: AskBatchDecision[] }) => void;
  itemActionsDisabled: boolean;
  onFilterClick: (message: string) => void;
  onCollectionPage: (sectionId: string, direction: 'NEXT' | 'PREVIOUS') => void;
  onAccessLost: () => void;
  onOpenContext?: (trigger: HTMLButtonElement) => void;
};

export type AskBlockRenderer<T extends AskBlockType> = (
  props: AskBlockRendererProps<Extract<AskPresentationBlock, { type: T }>>
) => JSX.Element | null;
