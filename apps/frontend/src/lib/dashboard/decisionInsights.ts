import { formatDistanceToNowStrict } from 'date-fns';
import type { Booking, DecisionInsight, ExecutionItem } from '@/types';
import type { ReplaceRepairAnalysisDTO } from '@/lib/api/replaceRepairApi';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';

export type ReplaceRepairResolution = ReplaceRepairAnalysisDTO & {
  inventoryItem?: {
    id: string;
    name: string;
    category?: string | null;
  } | null;
};

export function mapReplaceRepairAnalysesToDecisionInsights(
  analyses: ReplaceRepairResolution[],
  propertyId?: string,
): DecisionInsight[] {
  return analyses.map((analysis) => ({
    id: analysis.id,
    propertyId: analysis.propertyId,
    kind: 'repair_replace',
    title: 'Repair vs Replace',
    subject: analysis.inventoryItem?.name || 'Inventory Item',
    summary: analysis.summary || 'Our AI has a recommendation for this item.',
    href: buildGuidanceOverviewHref({
      propertyId: propertyId || analysis.propertyId,
      inventoryItemId: analysis.inventoryItemId,
      assetName: analysis.inventoryItem?.name ?? null,
      customIssueLabel: analysis.summary || 'Repair vs replace guidance',
    }),
    itemId: analysis.inventoryItemId,
    trust: {
      confidenceLabel: `${analysis.confidence} Confidence`,
      freshnessLabel: `Calculated ${formatDistanceToNowStrict(new Date(analysis.computedAt))} ago`,
      sourceLabel: 'Lifespan Engine',
      rationale: `Verdict: ${analysis.verdict.replace('_', ' ')}`,
    },
    metadata: {
      verdict: analysis.verdict,
      computedAt: analysis.computedAt,
      impactLevel: analysis.impactLevel,
    },
  }));
}

export function mapBookingsToExecutionItems(bookings: Booking[]): ExecutionItem[] {
  return bookings.map((booking) => ({
    id: booking.id,
    propertyId: booking.property.id,
    kind: 'booking',
    title: booking.service?.name || 'Service Job',
    subtitle: booking.provider?.businessName || null,
    statusLabel: booking.status,
    href: `/dashboard/bookings/${booking.id}`,
    scheduledLabel: booking.scheduledDate ? new Date(booking.scheduledDate).toLocaleDateString() : 'TBD',
    priceLabel: `$${Number(booking.estimatedPrice || 0).toFixed(2)}`,
    metadata: {
      providerId: booking.provider?.id,
      serviceId: booking.service?.id,
    },
  }));
}
