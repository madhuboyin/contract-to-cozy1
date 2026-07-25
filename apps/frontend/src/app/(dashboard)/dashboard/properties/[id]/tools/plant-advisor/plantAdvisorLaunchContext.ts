import type { ResolvedToolDestinationContext } from '@/features/tools/toolDestinationContext';

export function plantAdvisorRoomPrefill(input: {
  toolId?: string | null;
  resolved?: ResolvedToolDestinationContext | null;
}): string | null {
  if (input.toolId !== 'plant-advisor' || !input.resolved) return null;
  return input.resolved.prefill.entityType?.trim().toUpperCase() === 'ROOM'
    ? input.resolved.prefill.entityId
    : null;
}

export function plantAdvisorGrowingContextState(lightLevel?: string | null) {
  return lightLevel
    ? { state: 'READY' as const, reason: null }
    : {
        state: 'NEEDS_CONTEXT' as const,
        reason: 'Choose this room’s light level before generating recommendations.',
      };
}
