import { differenceInDays, isPast, parseISO } from 'date-fns';
import { HomeBuyerChecklist, InsurancePolicy, InventoryItem, ScoredProperty, Warranty } from '@/types';
import { IncidentDTO } from '@/types/incidents.types';

export interface UrgentActionItem {
  id: string;
  type:
    | 'MAINTENANCE_OVERDUE'
    | 'MAINTENANCE_UNSCHEDULED'
    | 'RENEWAL_EXPIRED'
    | 'RENEWAL_UPCOMING'
    | 'HEALTH_INSIGHT'
    | 'INCIDENT'
    | 'COVERAGE_GAP'
    | 'COVERAGE_PARTIAL';
  title: string;
  description: string;
  dueDate?: Date;
  daysUntilDue?: number;
  propertyId: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  entityType?: 'Warranty' | 'Insurance'; // Added to track renewal type
  itemId?: string;
}

type ChecklistEntry = {
  id: string;
  status: string;
  nextDueDate?: string | null;
  title: string;
  description?: string | null;
  propertyId?: string | null;
};

export function getChecklistEntries(checklist: HomeBuyerChecklist | null | undefined): ChecklistEntry[] {
  if (!checklist?.tasks) return [];

  return checklist.tasks.map((task) => {
    const runtimeTask = task as unknown as Record<string, unknown>;
    const nextDueDate =
      typeof runtimeTask.nextDueDate === 'string' ? runtimeTask.nextDueDate : null;
    const propertyId =
      typeof runtimeTask.propertyId === 'string' ? runtimeTask.propertyId : null;

    return {
    id: task.id,
    status: task.status,
    nextDueDate,
    title: task.title,
    description: task.description ?? null,
    propertyId,
  };
  });
}

export function consolidateUrgentActions(
  properties: ScoredProperty[],
  checklistItems: ChecklistEntry[],
  warranties: Warranty[],
  insurancePolicies: InsurancePolicy[],
  incidents: IncidentDTO[],
  inventoryItems?: InventoryItem[],
): UrgentActionItem[] {
  const actions: UrgentActionItem[] = [];
  const today = new Date();
  const ninetyDays = 90;

  incidents
    .filter((incident) => incident.status !== 'RESOLVED' && incident.status !== 'SUPPRESSED')
    .forEach((incident) => {
      actions.push({
        id: incident.id,
        type: 'INCIDENT',
        title: incident.title,
        description: incident.summary || 'Critical home event detected.',
        propertyId: incident.propertyId,
        severity: incident.severity || 'WARNING',
      });
    });

  const criticalStatuses = ['Needs attention', 'Needs Review', 'Needs Inspection', 'Missing Data', 'Needs Warranty'];

  properties.forEach((property) => {
    // Deduplicate insights by factor name, keeping the most severe (first in criticalStatuses array)
    const insightsByFactor = new Map<string, { insight: any; statusIndex: number }>();
    
    property.healthScore?.insights
      ?.filter((insight) => criticalStatuses.includes(insight.status))
      .forEach((insight) => {
        const factor = insight.factor;
        const statusIndex = criticalStatuses.indexOf(insight.status);
        const existing = insightsByFactor.get(factor);
        
        // Keep the insight with the most severe status (lower index = more severe)
        if (!existing || statusIndex < existing.statusIndex) {
          insightsByFactor.set(factor, { insight, statusIndex });
        }
      });

    // Create actions from deduplicated insights
    insightsByFactor.forEach(({ insight }) => {
      // Generate stable ID based on factor name instead of array index
      const factorId = insight.factor.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      actions.push({
        id: `${property.id}-INSIGHT-${factorId}`,
        type: 'HEALTH_INSIGHT',
        title: insight.factor,
        description: `Status: ${insight.status}. Requires resolution.`,
        propertyId: property.id,
      });
    });
  });

  checklistItems.forEach((item) => {
    if (item.status === 'COMPLETED' || item.status === 'NOT_NEEDED') return;

    if (item.nextDueDate && isPast(parseISO(item.nextDueDate))) {
      const dueDate = parseISO(item.nextDueDate);
      actions.push({
        id: item.id,
        type: 'MAINTENANCE_OVERDUE',
        title: `OVERDUE: ${item.title}`,
        description: item.description || `Overdue by ${differenceInDays(today, dueDate)} days.`,
        dueDate,
        daysUntilDue: differenceInDays(dueDate, today),
        propertyId: item.propertyId || 'N/A',
      });
    }
  });

  const renewals: (Warranty | InsurancePolicy)[] = [...warranties, ...insurancePolicies];
  renewals.forEach((item) => {
    if (!item.expiryDate) return;

    const dueDate = parseISO(item.expiryDate);
    const days = differenceInDays(dueDate, today);
    const itemType = 'providerName' in item ? 'Warranty' : 'Insurance';
    const title = `${itemType} Renewal: ${'providerName' in item ? item.providerName : item.carrierName}`;

    if (isPast(dueDate)) {
      actions.push({
        id: item.id,
        type: 'RENEWAL_EXPIRED',
        title: `EXPIRED: ${title}`,
        description: `Policy expired ${Math.abs(days)} days ago. Immediate action required.`,
        dueDate,
        daysUntilDue: days,
        propertyId: item.propertyId || 'N/A',
        entityType: itemType, // Track whether it's a Warranty or Insurance
      });
    } else if (days <= ninetyDays) {
      actions.push({
        id: item.id,
        type: 'RENEWAL_UPCOMING',
        title: `UPCOMING: ${title}`,
        description: `Expires in ${days} days.`,
        dueDate,
        daysUntilDue: days,
        propertyId: item.propertyId || 'N/A',
        entityType: itemType, // Track whether it's a Warranty or Insurance
      });
    }
  });

  if (inventoryItems) {
    inventoryItems.forEach((item) => {
      const hasWarranty = Boolean(item.warrantyId);
      const hasInsurance = Boolean(item.insurancePolicyId);
      const replacementValue = item.replacementCostCents ? item.replacementCostCents / 100 : 0;

      if (replacementValue < 100) return;

      if (!hasWarranty && !hasInsurance) {
        actions.push({
          id: `COVERAGE-GAP-${item.id}`,
          type: 'COVERAGE_GAP',
          title: `${item.name} needs coverage`,
          description: `No warranty or insurance coverage. Replacement value: $${replacementValue.toFixed(0)}.`,
          propertyId: item.propertyId || 'N/A',
          severity: 'WARNING',
          itemId: item.id,
        });
        return;
      }

      if (!hasWarranty || !hasInsurance) {
        actions.push({
          id: `COVERAGE-PARTIAL-${item.id}`,
          type: 'COVERAGE_PARTIAL',
          title: `${item.name} has partial coverage`,
          description: `Missing ${!hasWarranty ? 'warranty' : 'insurance'} coverage. Replacement value: $${replacementValue.toFixed(0)}.`,
          propertyId: item.propertyId || 'N/A',
          severity: 'INFO',
          itemId: item.id,
        });
      }
    });
  }

  return actions.sort((a, b) => {
    if (a.type === 'INCIDENT' && b.type !== 'INCIDENT') return -1;
    if (b.type === 'INCIDENT' && a.type !== 'INCIDENT') return 1;
    if (a.type === 'COVERAGE_GAP' && b.type !== 'COVERAGE_GAP' && b.type !== 'INCIDENT') return -1;
    if (b.type === 'COVERAGE_GAP' && a.type !== 'COVERAGE_GAP' && a.type !== 'INCIDENT') return 1;
    if (a.daysUntilDue === undefined) return 1;
    if (b.daysUntilDue === undefined) return -1;
    return a.daysUntilDue - b.daysUntilDue;
  });
}

export function resolveUrgentActionHref(action: UrgentActionItem, propertyId?: string): string {
  const fallbackPropertyId = propertyId || undefined;
  const actionPropertyId =
    action.propertyId && action.propertyId !== 'N/A' ? action.propertyId : fallbackPropertyId;
  const propertyQuery = actionPropertyId ? `?propertyId=${encodeURIComponent(actionPropertyId)}` : '';

  if (action.type === 'INCIDENT' && actionPropertyId) {
    return `/dashboard/properties/${actionPropertyId}/incidents/${action.id}`;
  }
  if (action.type === 'HEALTH_INSIGHT' && actionPropertyId) {
    return `/dashboard/properties/${actionPropertyId}/health-score?focus=${encodeURIComponent(action.title.toLowerCase())}`;
  }
  if (action.type === 'MAINTENANCE_OVERDUE') {
    return `/dashboard/maintenance${propertyQuery ? `${propertyQuery}&filter=overdue` : '?filter=overdue'}`;
  }
  if (action.type === 'RENEWAL_EXPIRED' || action.type === 'RENEWAL_UPCOMING') {
    // Route based on entity type (Warranty vs Insurance)
    if (action.entityType === 'Warranty') {
      // Warranties are managed in the inventory/vault with coverage tab
      return actionPropertyId 
        ? `/dashboard/properties/${actionPropertyId}/inventory?tab=coverage&highlight=${action.id}`
        : `/dashboard/vault?tab=coverage`;
    }
    // Insurance policies go to insurance/protect page
    return `/dashboard/insurance${propertyQuery}`;
  }
  if (action.type === 'COVERAGE_GAP' || action.type === 'COVERAGE_PARTIAL') {
    if (actionPropertyId && action.itemId) {
      return `/dashboard/properties/${actionPropertyId}/inventory?tab=coverage&highlight=${action.itemId}`;
    }
    return '/dashboard/vault?tab=coverage';
  }
  if (actionPropertyId) {
    return `/dashboard/properties/${actionPropertyId}`;
  }
  return '/dashboard/actions';
}
