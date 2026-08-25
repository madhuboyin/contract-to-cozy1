/**
 * Phase 0 work item 3: code-owned inventory of every known calculation that
 * independently decides what deserves attention outside the canonical Home
 * Action rank. Phase 8 removed presentation-layer competitors from Home and
 * Fix. The entries that remain are bounded domain or delivery policies and
 * must not be used to re-rank the canonical Home Action feed.
 */
export interface AttentionPriorityOwner {
  ownerKey: string;
  sourceFiles: readonly string[];
  surface: string;
  calculation: string;
}

export const ATTENTION_PRIORITY_OWNERS: readonly AttentionPriorityOwner[] = [
  {
    ownerKey: 'status-board-backend',
    sourceFiles: ['apps/backend/src/services/homeStatusBoard.service.ts'],
    surface: 'Status Board backend',
    calculation: 'CONDITION_SEVERITY and CATEGORY_PRIORITY_WEIGHT weighted sorting.',
  },
  {
    ownerKey: 'status-board-frontend',
    sourceFiles: ['apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/status-board/utils/priorityUtils.ts'],
    surface: 'Status Board frontend',
    calculation: 'RECOMMENDATION_PRIORITY re-ranks the backend result client-side.',
  },
  {
    ownerKey: 'guidance-priority',
    sourceFiles: [
      'apps/backend/src/services/guidanceEngine/guidancePriority.service.ts',
      'apps/backend/src/services/guidanceEngine/guidanceSuppression.service.ts',
    ],
    surface: 'Guidance Overview and embedded Guidance panels',
    calculation:
      'GuidancePriorityService scores active journeys; GuidanceSuppressionService uses that score for Guidance-only deduplication, conflict resolution, suppression winners, and final portfolio ordering. It does not re-rank canonical Home Actions.',
  },
  {
    ownerKey: 'notification-fallback',
    sourceFiles: ['apps/backend/src/services/notification.service.ts'],
    surface: 'Notifications',
    calculation: 'resolveAttentionPriority supplies a separate fallback priority.',
  },
  {
    ownerKey: 'deadline-notifications',
    sourceFiles: [
      'apps/backend/src/services/maintenanceReminder.service.ts',
      'apps/backend/src/services/newHomeWarrantyDeadline.service.ts',
    ],
    surface: 'Maintenance and warranty notifications',
    calculation: 'Each service derives priority or urgency independently from days until due.',
  },
  {
    ownerKey: 'radar-notification-delivery',
    sourceFiles: ['apps/backend/src/modules/homeEventRadar/services/radarNotificationDelivery.service.ts'],
    surface: 'Radar notifications',
    calculation: 'Direct Notification writes use a Radar-specific urgency mapping.',
  },
  {
    ownerKey: 'home-briefing',
    sourceFiles: ['apps/backend/src/homeBriefing/homeBriefing.service.ts'],
    surface: 'Home Briefing',
    calculation: 'Independent briefing urgency and materiality calculation.',
  },
] as const;

export function validateAttentionPriorityOwners(entries: readonly AttentionPriorityOwner[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.ownerKey)) issues.push(`Duplicate attention-priority owner "${entry.ownerKey}".`);
    seen.add(entry.ownerKey);
    if (entry.sourceFiles.length === 0) issues.push(`Attention-priority owner "${entry.ownerKey}" declares no source files.`);
    if (!entry.surface.trim()) issues.push(`Attention-priority owner "${entry.ownerKey}" declares no surface.`);
    if (!entry.calculation.trim()) issues.push(`Attention-priority owner "${entry.ownerKey}" declares no calculation.`);
  }
  return issues;
}
