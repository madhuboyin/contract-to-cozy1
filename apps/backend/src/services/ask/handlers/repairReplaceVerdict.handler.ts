// ITEM_REPAIR_REPLACE_VERDICT (reliability FRD D17, Phase 1c): the repair-or-replace verdict for one recorded item as a PURE read that can run inside a composed answer.
// It is REPLACEMENT_GUIDANCE with persistence removed: the analysis is computed in preview mode (nothing is written to ReplaceRepairAnalysis), no capture request is
// raised, and an HVAC item is named instead of starting its decision thread. Saving the analysis or starting the HVAC decision stays the job of the ordinary
// REPLACEMENT_GUIDANCE turn the homeowner asks for explicitly.
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { replacementGuidanceResult } from './miscHandlers.handler';

export async function repairReplaceVerdictResult(userId: string, propertyId: string, message: string, focusedInventoryItemId?: string | null): Promise<AskOperationResult> {
  return replacementGuidanceResult(userId, propertyId, message, focusedInventoryItemId ?? null, '', undefined, { pure: true });
}

registerCapabilityHandler('repair-replace-verdict.read', async (envelope) => repairReplaceVerdictResult(
  envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext?.entityType === 'INVENTORY_ITEM' ? envelope.launchContext.entityId : null,
));
