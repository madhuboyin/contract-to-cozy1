import { canonicalCapabilityRegistry } from '../../productFramework/capabilities/canonicalCapabilityRegistry';
import type { AskOperationId } from './askOperationRegistry';
import { ASK_OPERATION_DEFINITIONS } from './askOperationRegistry';
import { CARD_ENTRY_BINDINGS } from './askCapabilityBindings';

const INLINE_ENTRY_READS = CARD_ENTRY_BINDINGS;

// FRD v1.70 (product decision, option A): tools whose page runs a fresh AI analysis of something the user supplies and saves
// nothing, so there is no record for Ask to read. They stay on their pages by design, and the card says so rather than
// "not available yet".
const PAGE_ONLY_AI_ANALYZERS: Readonly<Record<string, string>> = {
  appreciation: 'Value Tracker runs a fresh AI value analysis from your purchase details on its own page.',
  energy: 'Energy Audit runs an AI review of the utility bills you upload on its own page.',
  'visual-inspector': 'Visual Inspector runs an AI review of the photos you upload on its own page.',
};

export function capabilityCardLaunch(capabilityId: string) {
  if (!canonicalCapabilityRegistry.getById(capabilityId)) throw new Error(`Unknown Ask capability: ${capabilityId}`);
  const entry = INLINE_ENTRY_READS[capabilityId as keyof typeof INLINE_ENTRY_READS];
  if (entry) {
    if (!ASK_OPERATION_DEFINITIONS[entry.operationId]) throw new Error(`Unregistered Ask operation: ${entry.operationId}`);
    return { inlineLaunch: { interactionType: 'CONVERSATION_CONTINUE' as const, operationId: entry.operationId, message: entry.message }, inlineBoundary: 'You can inspect current records here. Further tool actions may still require opening the full page.' };
  }
  const pageOnly = PAGE_ONLY_AI_ANALYZERS[capabilityId];
  if (pageOnly) return { inlineLaunch: null, inlineBoundary: pageOnly };
  return { inlineLaunch: null, inlineBoundary: 'This tool’s full journey is not available inside Ask Cozy yet.' };
}
