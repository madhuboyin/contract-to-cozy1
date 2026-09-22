import { canonicalCapabilityRegistry } from '../../productFramework/capabilities/canonicalCapabilityRegistry';
import type { AskOperationId } from './askOperationRegistry';
import { ASK_OPERATION_DEFINITIONS } from './askOperationRegistry';

// These are entry reads, not claims that the corresponding tool journey is
// inline-complete. Keep this allowlist narrower than the capability registry.
const INLINE_ENTRY_READS = {
  maintenance: { operationId: 'MAINTENANCE_STATUS', message: 'Show maintenance tasks for this home' },
  documents: { operationId: 'DOCUMENT_LOOKUP', message: 'Show documents for this home' },
  'home-records': { operationId: 'PROPERTY_SUMMARY', message: 'Show this home’s records' },
  // Capability-card audit (FRD Appendix D), second reference journey
  // (2026-09-22). Deliberately points at HOME_EVENT_RADAR_FEED, a new
  // operation reading the real canonical radar feed/detail directly -- NOT
  // INTELLIGENCE_ENVELOPE_QUERY, which the audit already flagged as not
  // proof of this specific workflow.
  'home-event-radar': { operationId: 'HOME_EVENT_RADAR_FEED', message: 'Show my home event radar feed' },
} as const satisfies Record<string, { operationId: AskOperationId; message: string }>;

export function capabilityCardLaunch(capabilityId: string) {
  if (!canonicalCapabilityRegistry.getById(capabilityId)) throw new Error(`Unknown Ask capability: ${capabilityId}`);
  const entry = INLINE_ENTRY_READS[capabilityId as keyof typeof INLINE_ENTRY_READS];
  if (entry) {
    if (!ASK_OPERATION_DEFINITIONS[entry.operationId]) throw new Error(`Unregistered Ask operation: ${entry.operationId}`);
    return { inlineLaunch: { interactionType: 'CONVERSATION_CONTINUE' as const, operationId: entry.operationId, message: entry.message }, inlineBoundary: 'You can inspect current records here. Further tool actions may still require opening the full page.' };
  }
  return { inlineLaunch: null, inlineBoundary: 'This tool’s full journey is not available inside Ask Cozy yet.' };
}
