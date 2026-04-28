import type { ResolutionCase } from '@/types';
import { resolveUrgentActionHref, type UrgentActionItem } from '@/lib/dashboard/urgentActions';

function caseKindForAction(action: UrgentActionItem): ResolutionCase['kind'] {
  switch (action.type) {
    case 'INCIDENT':
      return 'incident';
    case 'RENEWAL_EXPIRED':
    case 'RENEWAL_UPCOMING':
      return 'renewal';
    case 'COVERAGE_GAP':
    case 'COVERAGE_PARTIAL':
      return 'coverage_gap';
    case 'MAINTENANCE_OVERDUE':
    case 'MAINTENANCE_UNSCHEDULED':
      return 'maintenance';
    case 'HEALTH_INSIGHT':
      return 'health_insight';
    default:
      return 'maintenance';
  }
}

function caseSourceForAction(action: UrgentActionItem): ResolutionCase['source'] {
  switch (action.type) {
    case 'INCIDENT':
      return 'incident';
    case 'RENEWAL_EXPIRED':
    case 'RENEWAL_UPCOMING':
    case 'COVERAGE_GAP':
    case 'COVERAGE_PARTIAL':
      return 'coverage';
    case 'HEALTH_INSIGHT':
      return 'health_score';
    case 'MAINTENANCE_OVERDUE':
    case 'MAINTENANCE_UNSCHEDULED':
      return 'checklist';
    default:
      return 'inventory';
  }
}

function casePriorityForAction(action: UrgentActionItem): ResolutionCase['priority'] {
  if (action.type === 'INCIDENT' && action.severity === 'CRITICAL') return 'critical';
  if (action.type === 'INCIDENT') return 'high';
  if (action.type === 'RENEWAL_EXPIRED' || action.type === 'COVERAGE_GAP' || action.type === 'MAINTENANCE_OVERDUE') {
    return 'high';
  }
  if (action.type === 'RENEWAL_UPCOMING' || action.type === 'HEALTH_INSIGHT' || action.type === 'COVERAGE_PARTIAL') {
    return 'medium';
  }
  return 'low';
}

function caseBadgesForAction(action: UrgentActionItem): string[] {
  switch (action.type) {
    case 'INCIDENT':
      return [action.severity === 'CRITICAL' ? 'Critical' : 'Live Alert'];
    case 'RENEWAL_EXPIRED':
      return ['Expired'];
    case 'RENEWAL_UPCOMING':
      return ['Expiring Soon'];
    case 'COVERAGE_GAP':
      return ['No Coverage'];
    case 'COVERAGE_PARTIAL':
      return ['Partial Coverage'];
    case 'MAINTENANCE_OVERDUE':
      return ['Overdue'];
    case 'HEALTH_INSIGHT':
      return ['Needs Review'];
    default:
      return [];
  }
}

export function mapUrgentActionsToResolutionCases(
  actions: UrgentActionItem[],
  propertyId?: string,
): ResolutionCase[] {
  const normalizeDueDate = (value: UrgentActionItem['dueDate']): string | null => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  return actions.map((action) => ({
    id: action.id,
    propertyId: action.propertyId,
    kind: caseKindForAction(action),
    status: 'detected',
    priority: casePriorityForAction(action),
    title: action.title,
    summary: action.description,
    href: resolveUrgentActionHref(action, propertyId),
    itemId: action.itemId,
    dueDate: normalizeDueDate(action.dueDate),
    source: caseSourceForAction(action),
    badges: caseBadgesForAction(action),
    metadata: {
      actionType: action.type,
      severity: action.severity,
      entityType: action.entityType,
      daysUntilDue: action.daysUntilDue,
    },
  }));
}

export function filterResolutionCases(
  cases: ResolutionCase[],
  filterParam?: string | null,
): ResolutionCase[] {
  if (!filterParam) return cases;

  const filter = filterParam.toLowerCase();
  if (filter === 'urgent') {
    return cases.filter(
      (caseItem) =>
        caseItem.kind === 'incident' ||
        caseItem.kind === 'renewal' ||
        caseItem.priority === 'critical',
    );
  }
  if (filter === 'maintenance' || filter === 'preventive') {
    return cases.filter((caseItem) =>
      caseItem.kind === 'maintenance' ||
      caseItem.kind === 'health_insight' ||
      caseItem.kind === 'repair_replace',
    );
  }
  if (filter === 'coverage') {
    return cases.filter((caseItem) => caseItem.kind === 'coverage_gap' || caseItem.kind === 'renewal');
  }

  return cases;
}
