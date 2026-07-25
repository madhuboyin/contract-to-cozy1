'use client';

import type { CapabilityContextType } from './capabilityTypes';
import { InlineCapabilitySuggestionSlot } from './InlineCapabilitySuggestionSlot';

export const CAPABILITY_DISCOVERY_ANCHORS = {
  INSPECTION_RESULT: 'DOCUMENT',
  INSPECTION_FINDING_COMPLETED: 'ISSUE',
  PROJECT_CREATED: 'PROJECT',
  PROJECT_COMPLETED: 'PROJECT',
  ROOM_SETUP_COMPLETED: 'ROOM',
  INVENTORY_ITEM_INGESTED: 'INVENTORY_ITEM',
  DOCUMENT_INGESTED: 'DOCUMENT',
  QUOTE_ANALYSIS_RESULT: 'SERVICE',
  SELLER_INTENT_ACTIVE: 'PROPERTY',
  CONTRACTOR_SELECTED: 'PROJECT',
  CONTRACT_UPLOADED: 'PROJECT',
} as const satisfies Record<string, CapabilityContextType>;

export type CapabilityDiscoveryAnchorName =
  keyof typeof CAPABILITY_DISCOVERY_ANCHORS;

export interface CapabilityDiscoveryAnchorProps {
  anchor: CapabilityDiscoveryAnchorName;
  propertyId: string;
  entityId: string;
  sourceActionId?: string | null;
  journeyId?: string | null;
  enabled?: boolean;
  className?: string;
}

/**
 * Named feature integration point. The mapping describes only canonical
 * source context; capability eligibility and selection remain server-owned.
 */
export function CapabilityDiscoveryAnchor({
  anchor,
  propertyId,
  entityId,
  sourceActionId,
  journeyId,
  enabled = true,
  className,
}: CapabilityDiscoveryAnchorProps) {
  return (
    <InlineCapabilitySuggestionSlot
      propertyId={propertyId}
      sourceEntityType={CAPABILITY_DISCOVERY_ANCHORS[anchor]}
      sourceEntityId={entityId}
      sourceActionId={sourceActionId}
      journeyId={journeyId}
      placementSurface="workflow"
      enabled={enabled}
      className={className}
    />
  );
}
