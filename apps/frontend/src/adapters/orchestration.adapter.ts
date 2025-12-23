// apps/frontend/src/adapters/orchestration.adapter.ts

import {
    OrchestratedActionDTO,
    OrchestrationSummaryDTO,
    SuppressionReason,
    ServiceCategory,
  } from '../types';
  
  
  /**
   * UI-friendly action shape
   * (non-breaking: still matches backend semantics)
   */
  export type OrchestratedActionUI = OrchestratedActionDTO & {
    isSuppressed: boolean;
    suppressionReasonText?: string;
  };
  
  /**
   * Normalize a single action
   */
  function adaptAction(action: OrchestratedActionDTO): OrchestratedActionUI {
    const suppressed = Boolean(action.suppression?.suppressed);
  
    const suppressionReasonText = suppressed
      ? action.suppression?.reasons
          ?.map(r => r.message)
          .join(' • ')
      : undefined;
  
    return {
      ...action,
      isSuppressed: suppressed,
      suppressionReasonText,
    };
  }
  
  /**
   * Main adapter
   */
  export function adaptOrchestrationSummary(
    dto: OrchestrationSummaryDTO
  ): {
    propertyId: string;
    pendingActionCount: number;
  
    actions: OrchestratedActionUI[];
    suppressedActions: OrchestratedActionUI[];
  
    counts: OrchestrationSummaryDTO['counts'];
    derivedFrom: OrchestrationSummaryDTO['derivedFrom'];
  } {
    return {
      propertyId: dto.propertyId,
      pendingActionCount: dto.pendingActionCount,
  
      actions: dto.actions.map(adaptAction),
      suppressedActions: dto.suppressedActions.map(adaptAction),
  
      counts: dto.counts,
      derivedFrom: dto.derivedFrom,
    };
  }
  