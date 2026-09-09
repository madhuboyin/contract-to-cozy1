// apps/backend/src/services/mobileHome.service.ts
//
// Server-side composition for the mobile home screen (PWA audit remediation B3).
//
// The web dashboard builds its "urgent actions" list in the browser
// (apps/frontend/src/lib/dashboard/urgentActions.ts) by fanning out to five
// endpoints and merging the results. Any second client — a wrapped PWA view,
// the native iOS app, a watch complication — would otherwise have to re-do that
// merge. This module is the single server-side source of truth for it, exposed
// through GET /api/mobile/home.
//
// The desktop flow is untouched: the web client keeps its existing calls until
// it is migrated separately.

import { prisma } from '../lib/prisma';
import {
  getUserProperties,
  type ScoredProperty,
} from './property.service';
import { computeSetupStatus } from './propertyOnboarding.service';
import { getOrCreateActiveNarrativeRun } from './narrativeRun.service';
import { InventoryService } from './inventory.service';

const inventoryService = new InventoryService();

// Health-score insight statuses that warrant a home-screen action. Mirrors
// CRITICAL_STATUSES in apps/frontend/src/lib/dashboard/urgentActions.ts —
// keep the two lists in sync.
const CRITICAL_INSIGHT_STATUSES = [
  'Needs attention',
  'Needs Review',
  'Needs Inspection',
  'Missing Data',
  'Needs Warranty',
] as const;

const RENEWAL_WINDOW_DAYS = 90;

// Whole calendar days from `b` to `a` (matches date-fns differenceInCalendarDays;
// same UTC-midnight approach as diffDays in dailyHomePulse.service.ts).
function calendarDaysBetween(a: Date, b: Date): number {
  const aUtc = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bUtc = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((aUtc - bUtc) / 86_400_000);
}

export type MobileUrgentActionType =
  | 'INCIDENT'
  | 'HEALTH_INSIGHT'
  | 'MAINTENANCE_OVERDUE'
  | 'RENEWAL_EXPIRED'
  | 'RENEWAL_UPCOMING'
  | 'COVERAGE_GAP';

export interface MobileUrgentAction {
  id: string;
  type: MobileUrgentActionType;
  title: string;
  description: string;
  propertyId: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  status?: string;
  dueDate?: string | null;
  daysUntilDue?: number;
  entityType?: 'Warranty' | 'Insurance';
  itemId?: string;
  href: string;
}

export interface MobileHomePropertySummary {
  id: string;
  name: string | null;
  address: string;
  city: string;
  state: string;
  isPrimary: boolean;
}

export interface MobileHomeCounts {
  urgentActions: number;
  activeIncidents: number;
  activeBookings: number;
  overdueMaintenance: number;
  coverageGaps: number;
}

export interface MobileHomePayload {
  properties: MobileHomePropertySummary[];
  selectedPropertyId: string;
  property: ScoredProperty;
  onboarding: Awaited<ReturnType<typeof computeSetupStatus>>;
  narrativeRun: Awaited<ReturnType<typeof getOrCreateActiveNarrativeRun>>;
  urgentActions: MobileUrgentAction[];
  counts: MobileHomeCounts;
}

export class MobileHomeError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'MobileHomeError';
  }
}

// ---------------------------------------------------------------------------
// Deep-link resolution — ports resolveUrgentActionHref() from the frontend so
// a native client gets the same in-app destinations.
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function healthInsightSetupRoute(factorTitle: string, propertyId: string): string {
  const t = factorTitle.toLowerCase();
  if (t.includes('appliance')) return `/dashboard/properties/${propertyId}/inventory`;
  if (t.includes('document')) return `/dashboard/documents?propertyId=${propertyId}`;
  return `/dashboard/properties/${propertyId}/edit`;
}

function resolveHref(action: Omit<MobileUrgentAction, 'href'>): string {
  const propertyId = action.propertyId;

  if (action.type === 'HEALTH_INSIGHT') {
    if (action.status === 'Missing Data' || action.status === 'Incomplete') {
      return healthInsightSetupRoute(action.title, propertyId);
    }
    return `/dashboard/properties/${propertyId}/focus/health/${slugify(action.title)}`;
  }

  if (action.type === 'COVERAGE_GAP' && action.itemId) {
    return `/dashboard/properties/${propertyId}/inventory/items/${action.itemId}/coverage`;
  }

  if (action.type === 'RENEWAL_EXPIRED' || action.type === 'RENEWAL_UPCOMING') {
    const typeParam = action.entityType === 'Warranty' ? 'warranty' : 'insurance';
    return `/dashboard/properties/${propertyId}/focus/renewal/${action.id}?type=${typeParam}`;
  }

  if (action.type === 'MAINTENANCE_OVERDUE') {
    return `/dashboard/properties/${propertyId}/focus/maintenance/${action.id}`;
  }

  return `/dashboard/resolution-center?propertyId=${propertyId}`;
}

function withHref(action: Omit<MobileUrgentAction, 'href'>): MobileUrgentAction {
  return { ...action, href: resolveHref(action) };
}

// ---------------------------------------------------------------------------
// Urgent-action consolidation — ports consolidateUrgentActions() from
// apps/frontend/src/lib/dashboard/urgentActions.ts. Same sources, same ordering.
// ---------------------------------------------------------------------------

function isActionableCoverageGap(item: {
  coverageState?: string;
  coverageActionable?: boolean;
  effectiveReplacementCostCents?: number | null;
  replacementCostCents?: number | null;
  category?: string;
}): boolean {
  if (item.coverageState !== 'MISSING' || item.coverageActionable !== true) return false;
  const exposureCents = item.effectiveReplacementCostCents ?? item.replacementCostCents ?? 0;
  const thresholdCents = item.category === 'APPLIANCE' ? 25000 : 50000;
  return exposureCents >= thresholdCents;
}

export async function consolidateUrgentActions(
  property: ScoredProperty,
  now: Date,
): Promise<{ actions: MobileUrgentAction[]; overdueMaintenance: number; coverageGaps: number }> {
  const propertyId = property.id;
  const raw: Array<Omit<MobileUrgentAction, 'href'>> = [];

  const [incidents, policies, overdueTasks, inventoryItems] = await Promise.all([
    prisma.incident.findMany({
      where: {
        propertyId,
        isSuppressed: false,
        status: { notIn: ['RESOLVED', 'SUPPRESSED', 'EXPIRED'] },
      },
      select: { id: true, title: true, summary: true, severity: true },
    }),
    prisma.insurancePolicy.findMany({
      where: { propertyId, expiryDate: { not: null } },
      select: { id: true, carrierName: true, expiryDate: true },
    }),
    prisma.propertyMaintenanceTask.findMany({
      where: {
        propertyId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'NEEDS_REVIEW'] },
        nextDueDate: { lt: now },
      },
      select: { id: true, title: true, description: true, nextDueDate: true },
    }),
    inventoryService.listItems(propertyId, {}).catch(() => [] as any[]),
  ]);

  // 1. Incidents (highest priority)
  for (const incident of incidents) {
    raw.push({
      id: incident.id,
      type: 'INCIDENT',
      title: incident.title,
      description: incident.summary || 'Critical home event detected.',
      propertyId,
      severity: (incident.severity as MobileUrgentAction['severity']) || 'WARNING',
    });
  }

  // 2. Health-score insights — dedupe by factor, keep the most severe status.
  const insightByFactor = new Map<string, { status: string; rank: number }>();
  for (const insight of property.healthScore?.insights ?? []) {
    const rank = CRITICAL_INSIGHT_STATUSES.indexOf(insight.status as never);
    if (rank === -1) continue;
    const existing = insightByFactor.get(insight.factor);
    if (!existing || rank < existing.rank) {
      insightByFactor.set(insight.factor, { status: insight.status, rank });
    }
  }
  for (const [factor, { status }] of insightByFactor) {
    raw.push({
      id: `${propertyId}-INSIGHT-${slugify(factor)}`,
      type: 'HEALTH_INSIGHT',
      title: factor,
      description: `Status: ${status}. Requires resolution.`,
      status,
      propertyId,
    });
  }

  // 3. Overdue maintenance
  for (const task of overdueTasks) {
    const due = task.nextDueDate as Date;
    raw.push({
      id: task.id,
      type: 'MAINTENANCE_OVERDUE',
      title: `OVERDUE: ${task.title}`,
      description:
        task.description || `Overdue by ${calendarDaysBetween(now, due)} days.`,
      propertyId,
      dueDate: due.toISOString(),
      daysUntilDue: calendarDaysBetween(due, now),
    });
  }

  // 4. Warranty + insurance renewals (property.warranties is included by
  //    getUserProperties; insurance is queried above).
  type Renewal = { id: string; label: string; expiry: Date; kind: 'Warranty' | 'Insurance' };
  const renewals: Renewal[] = [
    ...((property as unknown as { warranties?: Array<{ id: string; providerName: string; expiryDate: Date }> })
      .warranties ?? []
    ).map((w) => ({ id: w.id, label: w.providerName, expiry: new Date(w.expiryDate), kind: 'Warranty' as const })),
    ...policies.map((p) => ({
      id: p.id,
      label: p.carrierName,
      expiry: new Date(p.expiryDate as Date),
      kind: 'Insurance' as const,
    })),
  ];
  for (const renewal of renewals) {
    const days = calendarDaysBetween(renewal.expiry, now);
    const title = `${renewal.kind} Renewal: ${renewal.label}`;
    if (days < 0) {
      raw.push({
        id: renewal.id,
        type: 'RENEWAL_EXPIRED',
        title: `EXPIRED: ${title}`,
        description: `Policy expired ${Math.abs(days)} days ago. Immediate action required.`,
        propertyId,
        dueDate: renewal.expiry.toISOString(),
        daysUntilDue: days,
        entityType: renewal.kind,
      });
    } else if (days <= RENEWAL_WINDOW_DAYS) {
      raw.push({
        id: renewal.id,
        type: 'RENEWAL_UPCOMING',
        title: `UPCOMING: ${title}`,
        description: `Expires in ${days} days.`,
        propertyId,
        dueDate: renewal.expiry.toISOString(),
        daysUntilDue: days,
        entityType: renewal.kind,
      });
    }
  }

  // 5. Actionable coverage gaps
  let coverageGaps = 0;
  for (const item of inventoryItems as any[]) {
    if (!isActionableCoverageGap(item)) continue;
    coverageGaps += 1;
    const replacementValue = item.replacementCostCents ? item.replacementCostCents / 100 : 0;
    const valueText =
      replacementValue > 0
        ? `Replacement value: $${replacementValue.toFixed(0)}.`
        : 'Replacement value has not been added yet.';
    raw.push({
      id: `COVERAGE-GAP-${item.id}`,
      type: 'COVERAGE_GAP',
      title: `${item.name} needs coverage`,
      description: `${item.coverageStateDetail || 'Coverage is missing.'} ${valueText}`,
      propertyId,
      severity: 'WARNING',
      itemId: item.id,
    });
  }

  const rank = (t: MobileUrgentActionType): number => {
    if (t === 'INCIDENT') return 0;
    if (t === 'COVERAGE_GAP') return 1;
    return 2;
  };
  raw.sort((a, b) => {
    const byType = rank(a.type) - rank(b.type);
    if (byType !== 0) return byType;
    if (a.daysUntilDue === undefined) return 1;
    if (b.daysUntilDue === undefined) return -1;
    return a.daysUntilDue - b.daysUntilDue;
  });

  return {
    actions: raw.map(withHref),
    overdueMaintenance: overdueTasks.length,
    coverageGaps,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function buildMobileHome(
  userId: string,
  requestedPropertyId?: string,
): Promise<MobileHomePayload> {
  const properties = await getUserProperties(userId);

  if (properties.length === 0) {
    throw new MobileHomeError('No properties found for this account.', 404);
  }

  const selected = requestedPropertyId
    ? properties.find((p) => p.id === requestedPropertyId)
    : properties[0];

  if (!selected) {
    throw new MobileHomeError('Property not found or access denied.', 404);
  }

  const now = new Date();
  const [onboarding, narrativeRun, consolidated, activeBookings] = await Promise.all([
    computeSetupStatus(selected.id, userId),
    getOrCreateActiveNarrativeRun({ propertyId: selected.id, userId }),
    consolidateUrgentActions(selected, now),
    prisma.booking.count({
      where: { propertyId: selected.id, status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] } },
    }),
  ]);

  const activeIncidents = consolidated.actions.filter((a) => a.type === 'INCIDENT').length;

  return {
    properties: properties.map((p) => ({
      id: p.id,
      name: p.name ?? null,
      address: p.address,
      city: p.city,
      state: p.state,
      isPrimary: p.isPrimary,
    })),
    selectedPropertyId: selected.id,
    property: selected,
    onboarding,
    narrativeRun,
    urgentActions: consolidated.actions,
    counts: {
      urgentActions: consolidated.actions.length,
      activeIncidents,
      activeBookings,
      overdueMaintenance: consolidated.overdueMaintenance,
      coverageGaps: consolidated.coverageGaps,
    },
  };
}
