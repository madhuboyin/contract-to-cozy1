/**
 * Phase 0 work item 3: code-owned inventory of every known calculation that
 * independently decides what deserves attention outside the canonical Home
 * Action rank. Phase 1 removes or converts these owners; until then this
 * registry makes additions/removals reviewable and report generation
 * deterministic instead of embedding a stale Markdown table in a script.
 */
export interface AttentionPriorityOwner {
  ownerKey: string;
  sourceFiles: readonly string[];
  surface: string;
  calculation: string;
}

export const ATTENTION_PRIORITY_OWNERS: readonly AttentionPriorityOwner[] = [
  {
    ownerKey: 'fix-backend-resolution-center',
    sourceFiles: ['apps/backend/src/services/resolutionCenter.service.ts'],
    surface: 'Fix backend',
    calculation: 'Own critical/high/medium/low scale, status model, and case/action sorting.',
  },
  {
    ownerKey: 'fix-frontend-resolution-center',
    sourceFiles: ['apps/frontend/src/lib/dashboard/resolutionCenterViewModel.ts'],
    surface: 'Fix frontend',
    calculation: 'ACTION_PRIORITY_RANK and casePriorityForAction re-sort the backend projection in the browser.',
  },
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
    sourceFiles: ['apps/backend/src/services/guidanceEngine/guidancePriority.service.ts'],
    surface: 'Dashboard hero and Morning Pulse backend',
    calculation: 'GuidancePriorityService independently scores severity, urgency, financial impact, safety, confidence, and readiness.',
  },
  {
    ownerKey: 'dashboard-hero-frontend',
    sourceFiles: ['apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/DashboardHeroSection.tsx'],
    surface: 'Dashboard hero frontend',
    calculation: 'estimateHeroStrength and rankHeroCandidates re-rank already-scored guidance.',
  },
  {
    ownerKey: 'morning-pulse-frontend',
    sourceFiles: ['apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/MorningPulseSection.tsx'],
    surface: 'Dashboard Morning Pulse frontend',
    calculation: 'PULSE_DOMAIN_ORDER and deriveUrgency independently order guidance.',
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
