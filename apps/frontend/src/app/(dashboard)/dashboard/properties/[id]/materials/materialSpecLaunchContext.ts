import type { MaterialScopeLevel } from '@/types';
import type { ResolvedToolDestinationContext } from '@/features/tools/toolDestinationContext';

export type MaterialSpecLaunchPrefill = {
  initialValues: {
    scopeLevel: MaterialScopeLevel;
    roomId?: string;
    projectId?: string;
  };
  sourceLabel: string;
};

export function materialSpecLaunchPrefill(input: {
  toolId?: string | null;
  resolved?: ResolvedToolDestinationContext | null;
}): MaterialSpecLaunchPrefill | null {
  if (input.toolId !== 'material-specs' || !input.resolved) return null;

  const entityType = input.resolved.prefill.entityType?.trim().toUpperCase();
  const entityId = input.resolved.prefill.entityId;
  if (!entityId) return null;

  if (entityType === 'ROOM') {
    return {
      initialValues: {
        scopeLevel: 'ROOM',
        roomId: entityId,
      },
      sourceLabel: input.resolved.sourceTitle,
    };
  }

  if (entityType === 'PROJECT') {
    return {
      initialValues: {
        scopeLevel: 'PROPERTY',
        projectId: entityId,
      },
      sourceLabel: input.resolved.sourceTitle,
    };
  }

  return null;
}
