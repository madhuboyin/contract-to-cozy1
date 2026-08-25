import type { Booking, ResolutionCenterData } from '@/types';
import type { UrgentActionItem } from '@/lib/dashboard/urgentActions';
import { casePriorityForAction, mapUrgentActionsToResolutionCases } from '@/lib/dashboard/resolutionCases';
import {
  mapBookingsToExecutionItems,
  mapReplaceRepairAnalysesToDecisionInsights,
  type ReplaceRepairResolution,
} from '@/lib/dashboard/decisionInsights';

export type ResolutionCenterFilter = string | null;

export type ResolutionCenterViewModel = ResolutionCenterData & {
  filteredActions: UrgentActionItem[];
  filteredCases: ResolutionCenterData['cases'];
};

export function filterResolutionActions(
  actions: UrgentActionItem[],
  filterParam?: ResolutionCenterFilter,
  priorityParam?: ResolutionCenterFilter,
): UrgentActionItem[] {
  let result = actions;

  if (filterParam) {
    const filter = filterParam.toLowerCase();
    if (filter === 'urgent') {
      result = result.filter(
        (action) => action.type === 'INCIDENT' || action.type === 'RENEWAL_EXPIRED' || action.severity === 'CRITICAL',
      );
    } else if (filter === 'maintenance' || filter === 'preventive') {
      result = result.filter(
        (action) =>
          action.type === 'MAINTENANCE_OVERDUE' ||
          action.type === 'MAINTENANCE_UNSCHEDULED' ||
          action.type === 'HEALTH_INSIGHT',
      );
    } else if (filter === 'coverage') {
      result = result.filter(
        (action) =>
          action.type === 'RENEWAL_EXPIRED' ||
          action.type === 'RENEWAL_UPCOMING' ||
          action.type === 'COVERAGE_GAP' ||
          action.type === 'COVERAGE_PARTIAL',
      );
    }
  }

  if (priorityParam?.toLowerCase() === 'high') {
    result = result.filter((action) => {
      const priority = casePriorityForAction(action);
      return priority === 'critical' || priority === 'high';
    });
  }

  return result;
}

export function buildResolutionCenterViewModel(args: {
  actions: UrgentActionItem[];
  bookings: Booking[];
  resolutions: ReplaceRepairResolution[];
  propertyId?: string;
  fallbackPropertyId?: string;
  filterParam?: ResolutionCenterFilter;
}): ResolutionCenterViewModel {
  const scopedPropertyId = args.propertyId || args.fallbackPropertyId;
  const activeBookings = args.bookings.filter((booking) =>
    ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(booking.status),
  );
  const filteredActions = filterResolutionActions(args.actions, args.filterParam);
  const cases = mapUrgentActionsToResolutionCases(args.actions, scopedPropertyId);
  const filteredCases = mapUrgentActionsToResolutionCases(filteredActions, scopedPropertyId);
  const decisionInsights = mapReplaceRepairAnalysesToDecisionInsights(args.resolutions, scopedPropertyId);
  const executionItems = mapBookingsToExecutionItems(activeBookings);

  return {
    cases,
    filteredActions,
    filteredCases,
    decisionInsights,
    executionItems,
    counts: {
      openCases: cases.length,
      decisionsReady: decisionInsights.length,
      activeBookings: executionItems.length,
      activeIncidents: cases.filter((entry) => entry.kind === 'incident').length,
    },
  };
}
