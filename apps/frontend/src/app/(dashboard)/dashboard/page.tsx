// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import {
  CalendarClock,
  Gauge,
  Landmark,
  Sprout,
  TrendingUp,
  Zap,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Booking, HomeBuyerTask, HomeBuyerChecklist, Warranty, InsurancePolicy, LocalUpdate, InventoryItem } from '@/types';
import { ScoredProperty } from './types'; 
import { differenceInDays, formatDistanceToNowStrict, isPast, parseISO } from 'date-fns'; 

// NEW IMPORTS FOR SCORECARDS AND LAYOUT
import { DashboardShell } from '@/components/DashboardShell';
import { PropertyHealthScoreCard } from './components/PropertyHealthScoreCard'; 
import { PropertyRiskScoreCard } from './components/PropertyRiskScoreCard'; 
import { FinancialEfficiencyScoreCard } from './components/FinancialEfficiencyScoreCard'; 
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { WelcomeModal } from './components/WelcomeModal';

import { HomeBuyerDashboard } from './components/HomeBuyerDashboard';
import { ExistingOwnerDashboard } from './components/ExistingOwnerDashboard';
import { SeasonalBanner } from '@/components/seasonal/SeasonalBanner';
import { SeasonalWidget } from '@/components/seasonal/SeasonalWidget';
import { useHomeownerSegment } from '@/lib/hooks/useHomeownerSegment';
import AhaHero from './components/AhaHero';
import { RoomsSnapshotSection } from './components/RoomsSnapshotSection';
import { LocalUpdatesCarousel } from '@/components/localUpdates/LocalUpdatesCarousel';
import CoverageIntelligenceToolCard from './components/CoverageIntelligenceToolCard';
import RiskPremiumOptimizerToolCard from './components/RiskPremiumOptimizerToolCard';
import DoNothingSimulatorToolCard from './components/DoNothingSimulatorToolCard';
import HomeSavingsCheckToolCard from './components/HomeSavingsCheckToolCard';
import MorningHomePulseCard from './components/MorningHomePulseCard';
import { HomeScoreReportCard } from './components/HomeScoreReportCard';
import { ShareVaultButton } from './components/ShareVaultButton';
import PriorityAlertBanner from '@/components/dashboard/PriorityAlertBanner';
import { motion, useReducedMotion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import MobileDashboardHome from './components/MobileDashboardHome';
import MobileHomeBuyerDashboard from './components/MobileHomeBuyerDashboard';
import { useCelebration } from '@/hooks/useCelebration';
import { MilestoneCelebration } from '@/components/ui/MilestoneCelebration';
import { recordGuidanceToolStatus } from '@/lib/api/guidanceApi';
import { seasonalAPI } from '@/lib/api/seasonal.api';
import { getHomeSavingsSummary } from '@/lib/api/homeSavingsApi';
import { useQuery } from '@tanstack/react-query';
import CommandCenterTemplate from './components/CommandCenterTemplate';
import SupportingActionCard from './components/SupportingActionCard';
import DashboardRouteState from './components/DashboardRouteState';
import { MagicCaptureSheet } from '@/components/orchestration/MagicCaptureSheet';
import { WinCard } from '@/components/shared/WinCard';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';
import { adaptOrchestrationSummary } from '@/adapters/orchestration.adapter';
import { ConfidenceBadge as PremiumConfidenceBadge, MetricTile, PageHero, SmartCTA, TrustMetaRow } from '@/components/system/PremiumPrimitives';
import {
  appendGuidanceContinuityToHref,
  extractGuidanceContinuityContext,
  hasGuidanceContinuityContext,
} from '@/features/guidance/utils/guidanceContinuity';
import { buildPropertyAwareDashboardHref } from '@/lib/routes/dashboardPropertyAwareHref';
import { track } from '@/lib/analytics/events';

import { listIncidents } from './properties/[id]/incidents/incidentsApi';
import { listInventoryItems } from './inventory/inventoryApi';
import { getStatusBoard, StatusBoardItemDTO } from './properties/[id]/status-board/statusBoardApi';
import { IncidentDTO } from '@/types/incidents.types';
import { calculateStalenessStatus } from '@/lib/incidents/stalenessConfig';

const PROPERTY_SETUP_SKIPPED_KEY = 'propertySetupSkipped'; 
const DASHBOARD_AHA_SEEN_PREFIX = 'dashboardAhaSeen';
const DASHBOARD_AHA_VIEWED_PREFIX = 'dashboardAhaViewed';
const DASHBOARD_AHA_CELEBRATED_PREFIX = 'dashboardAhaCelebrated';

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function resolvePriorityAlertSavings(
  incident: IncidentDTO | undefined,
): number {
  const incidentDetails = incident?.details && typeof incident.details === 'object'
    ? (incident.details as Record<string, unknown>)
    : null;

  const candidateValues = [
    incidentDetails?.potentialSavingsUsd,
    incidentDetails?.estimatedSavingsUsd,
    incidentDetails?.recommendedSavingsUsd,
  ];

  for (const value of candidateValues) {
    const numericValue = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numericValue) && numericValue >= 0) {
      return Math.round(numericValue);
    }
  }

  return 0;
}

function buildTopCardActionMeta(
  actionMetaLabel: string,
  actionMetaValue: string,
  actionMetaSupportingText: string,
  actionProgressLabel?: string,
  actionProgressValue?: string,
  actionProgressPercent?: number,
): {
  actionMetaLabel: string;
  actionMetaValue: string;
  actionMetaSupportingText: string;
  actionProgressLabel?: string;
  actionProgressValue?: string;
  actionProgressPercent?: number;
  compactActionLayout: true;
} {
  return {
    actionMetaLabel,
    actionMetaValue,
    actionMetaSupportingText,
    actionProgressLabel,
    actionProgressValue,
    actionProgressPercent,
    compactActionLayout: true,
  };
}

function buildHealthInsightActionMeta(factorTitle: string, healthScore: number) {
  return buildTopCardActionMeta(
    `Health Score · ${factorTitle}`,
    'Open Health Score to review Current Health Focus and the factor ledger.',
    'This factor is currently the clearest health driver to review first.',
    'Current property health',
    `${healthScore} / 100`,
    healthScore,
  );
}

function buildApplianceStatusActionMeta(itemName: string, healthScore: number, recommendation: string) {
  return buildTopCardActionMeta(
    `Status Board · ${itemName}`,
    `Open the Status Board to review why ${itemName.toLowerCase()} is flagged and take the next recommended step.`,
    `Current recommendation: ${recommendation}.`,
    'Current property health',
    `${healthScore} / 100`,
    healthScore,
  );
}

function isApplianceHealthInsightTitle(factorTitle: string | undefined): boolean {
  return String(factorTitle || '').toLowerCase().includes('appliance');
}

function getCompactHealthInsightTitle(factorTitle: string): string {
  if (factorTitle === 'Property Age (Year Built)' || factorTitle === 'Age Factor') {
    return 'Property Age';
  }
  if (isApplianceHealthInsightTitle(factorTitle)) {
    return 'Appliance Health';
  }
  return factorTitle;
}

function buildHealthInsightBadgeLabel() {
  return 'Top priority this week';
}

function buildIncidentBadgeLabel() {
  return 'Priority alert';
}

function buildSavingsBadgeLabel() {
  return 'Best savings move';
}

function buildVaultBadgeLabel() {
  return 'Unlock more intelligence';
}

function buildMaintenanceBadgeLabel() {
  return 'Action to take now';
}

function buildDefaultBadgeLabel() {
  return 'Next best move';
}

function buildIncidentActionMeta(incidentTitle: string, potentialSavings: number) {
  if (potentialSavings > 0) {
    return buildTopCardActionMeta(
      `Incident Detail · ${incidentTitle}`,
      'Open the incident detail to review the risk summary and next actions.',
      `Potential savings if handled now: ${formatUsd(potentialSavings)}`,
      'Savings if handled now',
      formatUsd(potentialSavings),
      Math.min(100, Math.max(18, Math.round((potentialSavings / 1000) * 100))),
    );
  }

  return buildTopCardActionMeta(
    `Incident Detail · ${incidentTitle}`,
    'Review the incident timeline and next recommended actions.',
    'Open the detail page to review the risk summary and mitigation steps.',
    'Review status',
    'Needs attention',
    62,
  );
}

function buildSavingsActionMeta(amount: number) {
  return buildTopCardActionMeta(
    'Home Savings',
    'Open Home Savings to review matched opportunities and compare next steps.',
    `Verified annual opportunity: ${formatUsd(amount)}/yr`,
    'Annual savings identified',
    `${formatUsd(amount)}/yr`,
    Math.min(100, Math.max(16, Math.round((amount / 1500) * 100))),
  );
}

function buildVaultActionMeta(count: number) {
  const itemLabel = count === 0 ? '0 items on file' : `${count} item${count === 1 ? '' : 's'} on file`;
  return buildTopCardActionMeta(
    'Home Vault',
    'Start with one receipt, appliance, or service record.',
    'Add one record to unlock better guidance and stronger home context.',
    'Records added',
    itemLabel,
    Math.min(100, Math.round((count / 3) * 100)),
  );
}

function buildMaintenanceActionMeta(overdueCount: number) {
  return buildTopCardActionMeta(
    'Fix · Priority actions',
    `Open the priority actions list to review ${overdueCount} overdue task${overdueCount === 1 ? '' : 's'}.`,
    'See what is overdue first and what to do next.',
    'Priority queue',
    `${overdueCount} item${overdueCount === 1 ? '' : 's'} need attention`,
    Math.min(100, Math.max(20, overdueCount * 24)),
  );
}

function buildCoverageGapActionMeta(gapCount: number, exposedValue: number) {
  const exposedText = exposedValue > 0 ? formatUsd(exposedValue) : `${gapCount} item${gapCount === 1 ? '' : 's'}`;
  return buildTopCardActionMeta(
    'Home Vault · Coverage gaps',
    `Open the inventory to review ${gapCount} item${gapCount === 1 ? '' : 's'} with missing coverage.`,
    `${exposedText} in unprotected replacement value.`,
    'Unprotected exposure',
    `${gapCount} item${gapCount === 1 ? '' : 's'} need coverage`,
    Math.min(100, Math.max(20, gapCount * 30)),
  );
}

function buildCoverageGapBadgeLabel() {
  return 'Coverage gap detected';
}

function buildCoveragePartialActionMeta(partialCount: number) {
  return buildTopCardActionMeta(
    'Home Vault · Partial coverage',
    `Open the inventory to review ${partialCount} item${partialCount === 1 ? '' : 's'} with incomplete coverage.`,
    `${partialCount === 1 ? 'This item has' : 'These items have'} either a warranty or insurance but not both.`,
    'Partial coverage',
    `${partialCount} item${partialCount === 1 ? '' : 's'} need review`,
    Math.min(100, Math.max(20, partialCount * 25)),
  );
}

function buildCoveragePartialBadgeLabel() {
  return 'Partial coverage detected';
}

type BackendSignalReasonCode = 'RISK_SPIKE' | 'COST_PRESSURE' | 'SCENARIO_CONTINUITY';

function buildBackendSignalBadgeLabel(reasonCode: BackendSignalReasonCode) {
  if (reasonCode === 'RISK_SPIKE') return 'Risk signal active';
  if (reasonCode === 'COST_PRESSURE') return 'Cost pressure detected';
  return 'Scenario in progress';
}

function buildBackendSignalActionMeta(reasonCode: BackendSignalReasonCode, detail: string) {
  const toolLabel = reasonCode === 'RISK_SPIKE' ? 'Home Risk Replay'
    : reasonCode === 'COST_PRESSURE' ? 'Break-Even Tool'
    : 'Financial Scenario';
  const supportingText = reasonCode === 'RISK_SPIKE'
    ? 'Open to replay recent conditions and understand what changed in your risk profile.'
    : reasonCode === 'COST_PRESSURE'
    ? 'Open to validate break-even timing with your current financial assumptions.'
    : 'Return to your in-progress financial scenario to continue where you left off.';
  const signalStrengthLabel = reasonCode === 'RISK_SPIKE' ? 'Elevated risk signal'
    : reasonCode === 'COST_PRESSURE' ? 'Cost shift detected'
    : 'Scenario active';
  return buildTopCardActionMeta(toolLabel, detail, supportingText, 'Signal strength', signalStrengthLabel, 72);
}

function buildDefaultActionMeta(healthScore: number) {
  return buildTopCardActionMeta(
    'Health Score overview',
    'Review score drivers, recent changes, and current health focus.',
    'Open Health Score to see what is helping, what is dragging the score down, and where to act next.',
    'Current property health',
    `${healthScore} / 100 overall`,
    healthScore,
  );
}

function isRateLimitedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as Error & { status?: number | string }).status;
  return status === 429 || error.message.toLowerCase().includes('too many requests');
}

function formatUsdFromCents(value: number): string {
  return formatUsd(value / 100);
}

function formatSignedPoints(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (Math.abs(value) < 0.05) return 'No change';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} pts`;
}

function formatSeasonLabel(rawSeason: string | null | undefined): string | null {
  if (!rawSeason) return null;
  return rawSeason
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

// --- START PHASE 1: DATA CONSOLIDATION TYPES ---

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
    entityType?: 'Warranty' | 'Insurance';
    itemId?: string;
    exposureCents?: number;
}

interface DashboardData {
    bookings: Booking[];
    properties: ScoredProperty[];
    checklist: HomeBuyerChecklist | null;
    urgentActions: UrgentActionItem[];
    inventoryCount: number;
    coverageGapExposure: number;
    activeIncidents: IncidentDTO[];
    isLoading: boolean;
    error: string | null;
}

type ChecklistEntry = {
    id: string;
    status: string;
    nextDueDate?: string | null;
    title: string;
    description?: string | null;
    propertyId?: string | null;
};

// Helper to consolidate data into a single, actionable list
const consolidateUrgentActions = (
    properties: ScoredProperty[],
    checklistItems: ChecklistEntry[],
    warranties: Warranty[],
    insurancePolicies: InsurancePolicy[],
    incidents: IncidentDTO[],
    inventoryItems?: InventoryItem[]
): UrgentActionItem[] => {
    const actions: UrgentActionItem[] = [];
    const today = new Date();
    const ninetyDays = 90;

    // 1. Process Active Incidents (Highest Priority)
    // Filter out resolved/suppressed/expired AND stale incidents using type-specific thresholds
    incidents
        .filter(inc => {
            // First filter: Only show incidents that are NOT in terminal states
            const isTerminalState = 
                inc.status === 'RESOLVED' || 
                inc.status === 'SUPPRESSED' || 
                inc.status === 'EXPIRED';
            
            if (isTerminalState) return false;
            
            // Second filter: Use type-specific staleness thresholds
            if (!inc.createdAt) return true; // Keep if no createdAt (shouldn't happen)
            
            const stalenessStatus = calculateStalenessStatus(inc);
            
            // Only show incidents that haven't reached their stale threshold
            // This means weather incidents disappear after 7 days, structural after 60 days, etc.
            return !stalenessStatus.isStale;
        })
        .forEach(inc => {
            actions.push({
                id: inc.id,
                type: 'INCIDENT',
                title: inc.title,
                description: inc.summary || 'Critical home event detected.',
                propertyId: inc.propertyId,
                severity: inc.severity || 'WARNING',
            });
        });

    // 2. Process Health score Insights (Critical items only, deduplicated by factor)
    const CRITICAL_INSIGHT_STATUSES = ['Needs attention', 'Needs Review', 'Needs Inspection', 'Missing Data', 'Needs Warranty'];

    properties.forEach(p => {
        const insightsByFactor = new Map<string, { insight: any; statusIndex: number }>();

        p.healthScore?.insights
            .filter(i => CRITICAL_INSIGHT_STATUSES.includes(i.status))
            .forEach(i => {
                const statusIndex = CRITICAL_INSIGHT_STATUSES.indexOf(i.status);
                const existing = insightsByFactor.get(i.factor);
                if (!existing || statusIndex < existing.statusIndex) {
                    insightsByFactor.set(i.factor, { insight: i, statusIndex });
                }
            });

        insightsByFactor.forEach(({ insight }) => {
            const factorId = insight.factor.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            actions.push({
                id: `${p.id}-INSIGHT-${factorId}`,
                type: 'HEALTH_INSIGHT',
                title: insight.factor,
                description: `Status: ${insight.status}. Requires resolution.`,
                propertyId: p.id,
            });
        });
    });
    
    // 3. Process Maintenance Checklist (Overdue/Unscheduled Tasks)
    checklistItems.forEach(item => {
        // Skip completed or cancelled items
        if (item.status === 'COMPLETED' || item.status === 'NOT_NEEDED') return;
        
        // Check for Overdue
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

    // 4. Process Renewals (Expired/Upcoming Warranties and Insurance)
    const renewals: (Warranty | InsurancePolicy)[] = [...warranties, ...insurancePolicies];
    
    renewals.forEach(item => {
        if (!item.expiryDate) return;
        
        const dueDate = parseISO(item.expiryDate);
        const days = differenceInDays(dueDate, today);
        const itemType = ('providerName' in item) ? 'Warranty' : 'Insurance';
        const title = `${itemType} Renewal: ${'providerName' in item ? item.providerName : item.carrierName}`;

        if (isPast(dueDate)) {
            // Expired (Critical)
            actions.push({
                id: item.id,
                type: 'RENEWAL_EXPIRED',
                title: `EXPIRED: ${title}`,
                description: `Policy expired ${Math.abs(days)} days ago. Immediate action required.`,
                dueDate,
                daysUntilDue: days,
                propertyId: item.propertyId || 'N/A',
            });
        } else if (days <= ninetyDays) {
            // Upcoming (Warning)
            actions.push({
                id: item.id,
                type: 'RENEWAL_UPCOMING',
                title: `UPCOMING: ${title}`,
                description: `Expires in ${days} days.`,
                dueDate,
                daysUntilDue: days,
                propertyId: item.propertyId || 'N/A',
            });
        }
    });

    // 5. Process Inventory Coverage Gaps
    if (inventoryItems) {
        inventoryItems.forEach(item => {
            if (item.coverageNotRequired) return;

            const hasWarranty = Boolean(item.warrantyId);
            const hasInsurance = Boolean(item.insurancePolicyId);
            const replacementValue = item.replacementCostCents ? item.replacementCostCents / 100 : 0;
            const replacementValueText = replacementValue > 0
                ? `Replacement value: $${replacementValue.toFixed(0)}.`
                : 'Replacement value has not been added yet.';

            if (!hasWarranty && !hasInsurance) {
                actions.push({
                    id: `COVERAGE-GAP-${item.id}`,
                    type: 'COVERAGE_GAP',
                    title: `${item.name} needs coverage`,
                    description: `No warranty or insurance coverage. ${replacementValueText}`,
                    propertyId: item.propertyId || 'N/A',
                    severity: 'WARNING',
                    itemId: item.id,
                    exposureCents: item.replacementCostCents ?? 0,
                });
            } else if (!hasWarranty || !hasInsurance) {
                const missing = !hasWarranty ? 'warranty' : 'insurance';
                actions.push({
                    id: `COVERAGE-PARTIAL-${item.id}`,
                    type: 'COVERAGE_PARTIAL',
                    title: `${item.name} has partial coverage`,
                    description: `Missing ${missing} coverage. ${replacementValueText}`,
                    propertyId: item.propertyId || 'N/A',
                    severity: 'INFO',
                    itemId: item.id,
                    exposureCents: item.replacementCostCents ?? 0,
                });
            }
        });
    }

    // Sort: Incidents > Coverage Gaps (by exposure desc) > Health > Urgent maintenance > Urgency (daysUntilDue)
    // Within COVERAGE_GAP and COVERAGE_PARTIAL groups, highest exposure surfaces first.
    return actions.sort((a, b) => {
        if (a.type === 'INCIDENT' && b.type !== 'INCIDENT') return -1;
        if (b.type === 'INCIDENT' && a.type !== 'INCIDENT') return 1;
        if (a.type === 'COVERAGE_GAP' && b.type !== 'COVERAGE_GAP' && b.type !== 'INCIDENT') return -1;
        if (b.type === 'COVERAGE_GAP' && a.type !== 'COVERAGE_GAP' && a.type !== 'INCIDENT') return 1;
        if (a.type === 'COVERAGE_GAP' && b.type === 'COVERAGE_GAP') {
            return (b.exposureCents ?? 0) - (a.exposureCents ?? 0);
        }
        if (a.type === 'COVERAGE_PARTIAL' && b.type === 'COVERAGE_PARTIAL') {
            return (b.exposureCents ?? 0) - (a.exposureCents ?? 0);
        }
        if (a.daysUntilDue === undefined) return 1;
        if (b.daysUntilDue === undefined) return -1;
        return a.daysUntilDue - b.daysUntilDue;
    });
};

function resolveUrgentActionHref(action: UrgentActionItem, propertyId?: string): string {
  const fallbackPropertyId = propertyId || undefined;
  const actionPropertyId =
    action.propertyId && action.propertyId !== 'N/A' ? action.propertyId : fallbackPropertyId;
  if (!actionPropertyId) return '/dashboard/resolution-center?filter=urgent';

  if (action.type === 'HEALTH_INSIGHT') {
    const factorSlug = action.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return `/dashboard/properties/${actionPropertyId}/focus/health/${factorSlug}`;
  }

  if (action.type === 'COVERAGE_GAP' || action.type === 'COVERAGE_PARTIAL') {
    if (action.itemId) {
      return `/dashboard/properties/${actionPropertyId}/focus/coverage/${action.itemId}`;
    }
  }

  if (action.type === 'RENEWAL_EXPIRED' || action.type === 'RENEWAL_UPCOMING') {
    const typeParam = action.entityType === 'Warranty' ? 'warranty' : 'insurance';
    return `/dashboard/properties/${actionPropertyId}/focus/renewal/${action.id}?type=${typeParam}`;
  }

  if (action.type === 'MAINTENANCE_OVERDUE') {
    return `/dashboard/properties/${actionPropertyId}/focus/maintenance/${action.id}`;
  }

  return buildGuidanceOverviewHref({
    propertyId: actionPropertyId,
    inventoryItemId: action.itemId ?? null,
    customIssueLabel: action.title?.trim() || action.description?.trim() || null,
  });
}

function urgentActionCtaLabel(action?: UrgentActionItem, isReturningVisitor = true): string {
  if (!action) return isReturningVisitor ? 'Take Priority Move' : 'Start First 2-Min Move';
  if (action.type === 'INCIDENT') return 'Review Incident';
  if (action.type === 'MAINTENANCE_OVERDUE') return 'Resolve Overdue Item';
  if (action.type === 'RENEWAL_EXPIRED') return 'Restore Coverage Now';
  if (action.type === 'RENEWAL_UPCOMING') return 'Lock Renewal Savings';
  return 'Run 2-Minute Risk Check';
}

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: userLoading } = useAuth();
  const { toast } = useToast();
  const [redirectChecked, setRedirectChecked] = useState(false);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isReturningVisitor, setIsReturningVisitor] = useState(false);
  const [localUpdates, setLocalUpdates] = useState<LocalUpdate[]>([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const guidanceContext = extractGuidanceContinuityContext(searchParams);
  const hasGuidanceContext = hasGuidanceContinuityContext(guidanceContext);
  
  const [data, setData] = useState<DashboardData>({
    bookings: [],
    properties: [],
    checklist: null,
    urgentActions: [],
    inventoryCount: 0,
    coverageGapExposure: 0,
    activeIncidents: [],
    isLoading: true,
    error: null,
  });
  const lastKnownPropertiesRef = React.useRef<ScoredProperty[]>([]);
  
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  const { celebration, celebrate, dismiss } = useCelebration(
    `dashboard-aha-${user?.id ?? 'anon'}-${selectedPropertyId ?? 'none'}`
  );
  const { data: homeownerSegment } = useHomeownerSegment();
  const properties = data.properties;
  const effectiveSelectedPropertyId =
    selectedPropertyId && properties.some((property) => property.id === selectedPropertyId)
      ? selectedPropertyId
      : properties[0]?.id;

  const scoreSnapshotQuery = useQuery({
    queryKey: ['property-score-snapshot', effectiveSelectedPropertyId],
    queryFn: async () => {
      if (!effectiveSelectedPropertyId) return null;
      return api.getPropertyScoreSnapshots(effectiveSelectedPropertyId, 16);
    },
    enabled: Boolean(effectiveSelectedPropertyId),
    staleTime: 10 * 60 * 1000,
  });

  const riskSummaryQuery = useQuery({
    queryKey: ['risk-report-summary', effectiveSelectedPropertyId],
    queryFn: async () => {
      if (!effectiveSelectedPropertyId) return null;
      const report = await api.getRiskReportSummary(effectiveSelectedPropertyId);
      return typeof report === 'string' ? null : report;
    },
    enabled: Boolean(effectiveSelectedPropertyId),
    staleTime: 5 * 60 * 1000,
  });

  const seasonalChecklistQuery = useQuery({
    queryKey: ['seasonal-checklist', effectiveSelectedPropertyId],
    queryFn: async () => {
      if (!effectiveSelectedPropertyId) return null;
      return seasonalAPI.getCurrentChecklist(effectiveSelectedPropertyId);
    },
    enabled: Boolean(effectiveSelectedPropertyId),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const homeSavingsSummaryQuery = useQuery({
    queryKey: ['home-savings-summary', effectiveSelectedPropertyId],
    queryFn: async () => {
      if (!effectiveSelectedPropertyId) return null;
      try {
        return await getHomeSavingsSummary(effectiveSelectedPropertyId);
      } catch {
        return null;
      }
    },
    enabled: Boolean(effectiveSelectedPropertyId),
    staleTime: 5 * 60 * 1000,
  });

  const applianceStatusBoardQuery = useQuery({
    queryKey: ['dashboard-appliance-priority', effectiveSelectedPropertyId],
    queryFn: async () => {
      if (!effectiveSelectedPropertyId) return null;
      return getStatusBoard(effectiveSelectedPropertyId, {
        categoryKey: 'APPLIANCE',
        condition: 'ACTION_NEEDED',
        limit: 10,
      });
    },
    enabled: Boolean(effectiveSelectedPropertyId),
    staleTime: 5 * 60 * 1000,
  });

  const orchestrationQuery = useQuery({
    queryKey: ['dashboard-orchestration-signals', effectiveSelectedPropertyId],
    queryFn: async () => {
      if (!effectiveSelectedPropertyId) return null;
      try {
        const summary = await api.getOrchestrationSummary(effectiveSelectedPropertyId);
        return adaptOrchestrationSummary(summary);
      } catch {
        return null;
      }
    },
    enabled: Boolean(effectiveSelectedPropertyId),
    staleTime: 3 * 60 * 1000,
  });

  const fetchDashboardData = useCallback(async () => {
    if (!user) return;
    
    setData(prev => ({ ...prev, isLoading: true, error: null }));
    setRedirectChecked(false);
    
    try {
      let scoredProperties = lastKnownPropertiesRef.current;
      let propertyLoadRateLimited = false;

      try {
        const propertiesRes = await api.getProperties();
        const properties = propertiesRes.success ? propertiesRes.data.properties : [];
        scoredProperties = properties.map(p => ({
          ...p,
          healthScore: (p as unknown as ScoredProperty).healthScore || {
            totalScore: 0,
            insights: [],
          },
        })) as ScoredProperty[];
        lastKnownPropertiesRef.current = scoredProperties;
      } catch (error) {
        if (isRateLimitedError(error)) {
          propertyLoadRateLimited = true;
        } else if (scoredProperties.length === 0) {
          throw error;
        }
      }

      const propId = (selectedPropertyId && scoredProperties.some(p => p.id === selectedPropertyId))
        ? selectedPropertyId
        : scoredProperties[0]?.id;

      const [bookingsRes, checklistRes, warrantiesRes, policiesRes, incidentsRes, inventoryRes] = await Promise.all([
        api.listBookings({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' })
          .catch(() => ({ success: false, data: { bookings: [] } })),
        api.getHomeBuyerChecklist()
          .then(res => (res.success && res.data ? { success: true, data: res.data } : { success: false, data: null }))
          .catch(() => ({ success: false, data: null })),
        api.listWarranties()
          .catch(() => ({ success: false, data: { warranties: [] } })),
        api.listInsurancePolicies()
          .catch(() => ({ success: false, data: { policies: [] } })),
        propId
          ? listIncidents({ propertyId: propId, limit: 10 }).catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] }),
        propId
          ? listInventoryItems(propId, {}).catch(() => [])
          : Promise.resolve([]),
      ]);
  
      const bookings = bookingsRes.success ? bookingsRes.data.bookings : [];
      const checklist = checklistRes.success ? checklistRes.data : null;
      const warranties = warrantiesRes.success ? warrantiesRes.data.warranties : [];
      const policies = policiesRes.success ? policiesRes.data.policies : [];
      const activeIncidents = (incidentsRes as any).items || [];
      const inventoryItems = inventoryRes || [];
  
      const urgentActions = consolidateUrgentActions(
        scoredProperties,
        checklist?.tasks || [],
        warranties,
        policies,
        activeIncidents,
        inventoryItems,
      );
  
      const coverageGapExposure = inventoryItems
        .filter((item: InventoryItem) => !item.coverageNotRequired && !item.warrantyId && !item.insurancePolicyId)
        .reduce((sum: number, item: InventoryItem) => sum + Number(item.replacementCostCents || 0) / 100, 0);

      setData({
        bookings,
        properties: scoredProperties,
        checklist,
        urgentActions,
        inventoryCount: inventoryItems.length,
        coverageGapExposure,
        activeIncidents,
        isLoading: false,
        error: null,
      });

      if (typeof window !== 'undefined') {
        const skipped = window.localStorage.getItem(PROPERTY_SETUP_SKIPPED_KEY);
        setShowWelcomeScreen(scoredProperties.length === 0 && !skipped && !propertyLoadRateLimited);
      }
  
    } catch (error) {
      console.error('❌ Dashboard: Error fetching data:', error);
      const message =
        isRateLimitedError(error)
          ? 'Too many requests right now. Please wait a minute and refresh.'
          : 'Failed to load dashboard data';
      setData(prev => ({ ...prev, isLoading: false, error: message }));
    } finally {
      setRedirectChecked(true);
    }
  }, [user, selectedPropertyId]);
  
  const hasTrackedFirstView = React.useRef(false);
  useEffect(() => {
    if (!userLoading && user && effectiveSelectedPropertyId && !hasTrackedFirstView.current) {
      hasTrackedFirstView.current = true;
      track('dashboard_first_view', { propertyId: effectiveSelectedPropertyId });
    }
  }, [userLoading, user, effectiveSelectedPropertyId]);

  useEffect(() => {
    if (!userLoading && user) {
      fetchDashboardData();
    }
  }, [userLoading, user, fetchDashboardData]);

  const safeFirstName = user?.firstName || 'there';
  const selectedProperty = properties.find(p => p.id === effectiveSelectedPropertyId); 
  const scopedUrgentActions = data.urgentActions.filter(
    (action) => action.propertyId === effectiveSelectedPropertyId
  );
  const scopedActiveIncidents = data.activeIncidents.filter(
    (incident) => incident.propertyId === effectiveSelectedPropertyId
  );

  const annualSavingsPotential = Math.max(0, Math.round(homeSavingsSummaryQuery.data?.potentialAnnualSavings ?? 0));
  const riskExposureGap = Math.max(0, Math.round(riskSummaryQuery.data?.financialExposureTotal ?? 0));
  const overdueMaintenanceCount = scopedUrgentActions.filter(a => a.type === 'MAINTENANCE_OVERDUE').length;
  const healthScore = typeof selectedProperty?.healthScore?.totalScore === 'number'
    ? selectedProperty.healthScore.totalScore
    : null;
  const topApplianceStatusItem: StatusBoardItemDTO | null =
    applianceStatusBoardQuery.data?.items?.[0] ?? null;
  const hasCompletionState =
    Boolean(selectedProperty) &&
    scopedUrgentActions.length === 0 &&
    scopedActiveIncidents.length === 0 &&
    overdueMaintenanceCount === 0;

  useEffect(() => {
    if (!data.isLoading && hasCompletionState) {
      celebrate('success');
    }
  }, [data.isLoading, hasCompletionState, celebrate]);

  const heroNarrative = (() => {
    // 1. Open Urgent Incident
    const highSeverityIncident =
      scopedActiveIncidents.find((incident) => incident.severity === 'CRITICAL' || incident.severity === 'WARNING');
    if (highSeverityIncident) {
      const potentialSavings = resolvePriorityAlertSavings(highSeverityIncident);
      return {
        badgeLabel: buildIncidentBadgeLabel(),
        title: highSeverityIncident.title,
        subtitle: highSeverityIncident.summary || 'A critical home event requires your review to prevent escalation.',
        ctaLabel: 'Review incident',
        href: `/dashboard/properties/${highSeverityIncident.propertyId}/incidents/${highSeverityIncident.id}`,
        impactLabel: 'Active home risk',
        etaLabel: 'ETA 2 min',
        ...buildIncidentActionMeta(highSeverityIncident.title, potentialSavings),
      };
    }

    // 2. Top health insight
    const topHealthInsight = scopedUrgentActions.find(a => a.type === 'HEALTH_INSIGHT');
    if (topHealthInsight) {
      const compactHealthInsightTitle = getCompactHealthInsightTitle(topHealthInsight.title);
      const isApplianceInsight = isApplianceHealthInsightTitle(topHealthInsight.title);
      const impactLabel = 'Top risk signal';
      const etaLabel = 'ETA 2 min';
      if (isApplianceInsight && topApplianceStatusItem && effectiveSelectedPropertyId) {
        const recommendationLabel =
          topApplianceStatusItem.recommendation === 'REPLACE_SOON'
            ? 'Replace Soon'
            : topApplianceStatusItem.recommendation === 'REPAIR'
            ? 'Repair'
            : 'Review';
        const statusBoardHref = `/dashboard/properties/${effectiveSelectedPropertyId}/status-board?category=APPLIANCE&condition=ACTION_NEEDED&q=${encodeURIComponent(
          topApplianceStatusItem.displayName,
        )}&expand=${encodeURIComponent(topApplianceStatusItem.id)}`;
        return {
          badgeLabel: buildHealthInsightBadgeLabel(),
          title: `${topApplianceStatusItem.displayName} needs review.`,
          subtitle: `Chosen because appliance status signals currently rank ${topApplianceStatusItem.displayName.toLowerCase()} as the clearest item to review first.`,
          ctaLabel: `Review ${topApplianceStatusItem.displayName}`,
          href: statusBoardHref,
          impactLabel,
          etaLabel,
          ...buildApplianceStatusActionMeta(
            topApplianceStatusItem.displayName,
            healthScore ?? 0,
            recommendationLabel,
          ),
        };
      }
      return {
        badgeLabel: buildHealthInsightBadgeLabel(),
        title: isApplianceInsight
          ? 'Appliance health needs review.'
          : `${compactHealthInsightTitle} needs attention.`,
        subtitle: isApplianceInsight
          ? 'One or more appliance signals may need review based on the latest property health data.'
          : 'Chosen because it best balances cost prevention, confidence, and effort.',
        ctaLabel: isApplianceInsight ? 'Review appliance health' : `Review ${compactHealthInsightTitle.toLowerCase()}`,
        href: resolveUrgentActionHref(topHealthInsight, effectiveSelectedPropertyId),
        impactLabel,
        etaLabel,
        ...buildHealthInsightActionMeta(compactHealthInsightTitle, healthScore ?? 0),
      };
    }

    // 3. Coverage gaps — show highest-exposure item; [0] is already sorted by exposureCents desc
    const coverageGapActions = scopedUrgentActions.filter(a => a.type === 'COVERAGE_GAP');
    if (coverageGapActions.length > 0) {
      const topGap = coverageGapActions[0];
      const gapCount = coverageGapActions.length;
      const remainingCount = gapCount - 1;
      const topItemName = topGap.title.replace(/ needs coverage$/, '');
      const topExposureCents = topGap.exposureCents ?? 0;
      const topExposureText = topExposureCents > 0 ? ` (${formatUsdFromCents(topExposureCents)})` : '';
      const impactLabel = topExposureCents > 0
        ? `${formatUsdFromCents(topExposureCents)} unprotected`
        : `${gapCount} item${gapCount === 1 ? '' : 's'} unprotected`;
      const subtitle = remainingCount > 0
        ? `${topItemName}${topExposureText} is fully exposed. ${remainingCount} other gap${remainingCount === 1 ? '' : 's'} also need coverage — ${formatUsd(data.coverageGapExposure)} total unprotected.`
        : `${topItemName}${topExposureText} has no warranty or insurance. Fully exposed if it fails or is damaged.`;
      const ctaLabel = remainingCount > 0 ? `Review ${topItemName} first` : `Review ${topItemName}`;
      const ctaHref = topGap.itemId && effectiveSelectedPropertyId
        ? `/dashboard/properties/${effectiveSelectedPropertyId}/focus/coverage/${topGap.itemId}`
        : buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, `/dashboard/properties/${effectiveSelectedPropertyId}/inventory?tab=items&smart=gaps`);
      const etaLabel = 'ETA 2 min';
      return {
        badgeLabel: buildCoverageGapBadgeLabel(),
        title: `Your ${topItemName} has no coverage.`,
        subtitle,
        ctaLabel,
        href: ctaHref,
        impactLabel,
        etaLabel,
        ...buildCoverageGapActionMeta(gapCount, data.coverageGapExposure),
      };
    }

    // 3b. Partial coverage (warranty XOR insurance) — show highest-exposure item; [0] sorted by exposureCents desc
    const coveragePartialActions = scopedUrgentActions.filter(a => a.type === 'COVERAGE_PARTIAL');
    if (coveragePartialActions.length > 0) {
      const topPartial = coveragePartialActions[0];
      const partialCount = coveragePartialActions.length;
      const remainingCount = partialCount - 1;
      const topItemName = topPartial.title.replace(/ has partial coverage$/, '');
      const topExposureCents = topPartial.exposureCents ?? 0;
      const topExposureText = topExposureCents > 0 ? ` (${formatUsdFromCents(topExposureCents)})` : '';
      const missingType = topPartial.description.includes('warranty') ? 'warranty' : 'insurance';
      const impactLabel = topExposureCents > 0
        ? `${formatUsdFromCents(topExposureCents)} partially exposed`
        : `${partialCount} item${partialCount === 1 ? '' : 's'} partially covered`;
      const subtitle = remainingCount > 0
        ? `${topItemName}${topExposureText} is missing ${missingType}. ${remainingCount} other item${remainingCount === 1 ? '' : 's'} also have partial coverage.`
        : `${topItemName}${topExposureText} has either a warranty or insurance but not both. One coverage type is missing.`;
      const ctaLabel = remainingCount > 0 ? `Review ${topItemName} first` : `Review ${topItemName}`;
      const ctaHref = topPartial.itemId && effectiveSelectedPropertyId
        ? `/dashboard/properties/${effectiveSelectedPropertyId}/focus/coverage/${topPartial.itemId}`
        : buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, `/dashboard/properties/${effectiveSelectedPropertyId}/inventory?tab=items&smart=gaps`);
      const etaLabel = 'ETA 2 min';
      return {
        badgeLabel: buildCoveragePartialBadgeLabel(),
        title: `Your ${topItemName} has partial coverage.`,
        subtitle,
        ctaLabel,
        href: ctaHref,
        impactLabel,
        etaLabel,
        ...buildCoveragePartialActionMeta(partialCount),
      };
    }

    // 4. Savings > $200
    if (annualSavingsPotential >= 200) {
      const impactLabel = `${formatUsd(annualSavingsPotential)}/yr potential`;
      const etaLabel = 'ETA 3 min';
      return {
        badgeLabel: buildSavingsBadgeLabel(),
        title: `${formatUsd(annualSavingsPotential)} in potential annual savings.`,
        subtitle: 'Chosen because this is the clearest verified savings opportunity right now.',
        ctaLabel: 'See your savings',
        href: buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, '/dashboard/home-savings'),
        impactLabel,
        etaLabel,
        ...buildSavingsActionMeta(annualSavingsPotential),
      };
    }

    // 4.5 Backend signal pressure: RISK_SPIKE or COST_PRESSURE from orchestration engine
    // Loaded async (non-blocking) — only surfaces when local signals are all clear
    const orchestrationMove = orchestrationQuery.data?.nextBestMove ?? null;
    if (
      orchestrationMove?.reasonCode === 'RISK_SPIKE' ||
      orchestrationMove?.reasonCode === 'COST_PRESSURE' ||
      orchestrationMove?.reasonCode === 'SCENARIO_CONTINUITY'
    ) {
      const rc = orchestrationMove.reasonCode as BackendSignalReasonCode;
      const impactLabel = rc === 'RISK_SPIKE' ? 'Risk signal active'
        : rc === 'COST_PRESSURE' ? 'Cost shift detected'
        : 'Scenario active';
      const ctaLabel = rc === 'RISK_SPIKE' ? 'Replay risk conditions'
        : rc === 'COST_PRESSURE' ? 'Review break-even assumptions'
        : 'Continue scenario';
      const etaLabel = 'ETA 3 min';
      return {
        badgeLabel: buildBackendSignalBadgeLabel(rc),
        title: orchestrationMove.title,
        subtitle: orchestrationMove.detail,
        ctaLabel,
        href: orchestrationMove.targetPath,
        impactLabel,
        etaLabel,
        ...buildBackendSignalActionMeta(rc, orchestrationMove.detail),
      };
    }

    // 5. Vault Onboarding (Empty state: < 3 items)
    if (data.inventoryCount < 3) {
      const impactLabel = 'Unlock intelligence';
      const etaLabel = 'ETA 90 sec';
      return {
        badgeLabel: buildVaultBadgeLabel(),
        title: 'Start building your Home Vault.',
        subtitle: 'Adding one core record unlocks stronger guidance across the dashboard.',
        ctaLabel: 'Add your first item',
        href: buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, '/dashboard/vault'),
        impactLabel,
        etaLabel,
        ...buildVaultActionMeta(data.inventoryCount),
      };
    }

    // 6. Maintenance Overdue — name the top task, count any remaining
    const primaryOverdueAction = scopedUrgentActions.find((action) => action.type === 'MAINTENANCE_OVERDUE');
    if (overdueMaintenanceCount > 0) {
      const topTaskName = primaryOverdueAction?.title.replace(/^OVERDUE:\s*/i, '') ?? null;
      const remainingOverdue = overdueMaintenanceCount - 1;
      const title = topTaskName
        ? remainingOverdue > 0
          ? `Your ${topTaskName} is overdue (+ ${remainingOverdue} more).`
          : `Your ${topTaskName} is overdue.`
        : `${overdueMaintenanceCount} maintenance task${overdueMaintenanceCount === 1 ? '' : 's'} need attention.`;
      const subtitle = remainingOverdue > 0
        ? `${topTaskName ?? 'This task'} is the highest-priority overdue item. ${remainingOverdue} other task${remainingOverdue === 1 ? '' : 's'} also need attention.`
        : 'Chosen because this task is overdue and ranked highest for review.';
      const impactLabel = 'Preventative win';
      const etaLabel = 'ETA 2 min';
      return {
        badgeLabel: buildMaintenanceBadgeLabel(),
        title,
        subtitle,
        ctaLabel: topTaskName ? `Review ${topTaskName}` : 'Fix overdue tasks',
        href: primaryOverdueAction
          ? resolveUrgentActionHref(primaryOverdueAction, effectiveSelectedPropertyId)
          : buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, '/dashboard/fix?focus=priority-actions'),
        impactLabel,
        etaLabel,
        ...buildMaintenanceActionMeta(overdueMaintenanceCount),
      };
    }

    // 7. Default: health-score-aware fallback
    const score = healthScore ?? 0;
    const isHealthy = score >= 75;
    const impactLabel = isHealthy ? 'HomeScore up to date' : `Score at ${score} / 100`;
    const etaLabel = 'ETA 1 min';
    return {
      badgeLabel: buildDefaultBadgeLabel(),
      title: isHealthy
        ? 'All systems healthy.'
        : `Home health at ${score} — review score drivers.`,
      subtitle: isHealthy
        ? 'Review your score drivers and current health focus to stay ahead of issues.'
        : 'Your health score has room to improve. Open the full report to see what is dragging it down and what to fix first.',
      ctaLabel: 'View full report',
      href: buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, '/dashboard/health-score'),
      impactLabel,
      etaLabel,
      ...buildDefaultActionMeta(score),
    };
  })();


  if (userLoading || data.isLoading || !redirectChecked) {
    return <DashboardRouteState state="loading" title="Preparing your command center" description="Syncing your latest home intelligence..." />;
  }

  if (data.error) {
    return <DashboardRouteState state="error" title="Could not load dashboard" description={data.error} />;
  }

  if (showWelcomeScreen && user) return <WelcomeModal userFirstName={user.firstName} />;

  const healthScoreHref = buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, '/dashboard/health-score');
  const priorityActionsHref = buildPropertyAwareDashboardHref(
    effectiveSelectedPropertyId,
    '/dashboard/fix?focus=priority-actions',
  );
  const protectedValueHref = buildPropertyAwareDashboardHref(
    effectiveSelectedPropertyId,
    '/dashboard/save?focus=annual-savings',
  );
  const primaryActionHero = (
    <div className="space-y-6">
      <PageHero
        eyebrow="Today"
        icon={<Zap className="h-5 w-5" />}
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user?.firstName || 'there'}.`}
        description={
          data.activeIncidents.length > 0
            ? 'A high-priority home signal changed overnight. One focused action can reduce avoidable cost exposure.'
            : 'Your home profile is synced. We are watching risk, savings, maintenance, and documents so the next move is clear.'
        }
        action={
          <SmartCTA
            onClick={() => setIsScannerOpen(true)}
            title="Refresh all home signals and re-rank your issues"
            className="h-12"
          >
            Run full scan
          </SmartCTA>
        }
        meta={
          <TrustMetaRow
            items={[
              'Verified just now from home signals',
              'Ranked by risk, financial upside, and confidence',
              'High confidence based on 12 signals',
            ]}
          />
        }
      >
        <div className="grid gap-3 md:grid-cols-4">
          <Link href={healthScoreHref} className="block rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2">
            <MetricTile
              label="Health score"
              value={healthScore !== null ? healthScore : '—'}
              hint="Current property signal"
              tone={healthScore !== null && healthScore >= 80 ? 'success' : healthScore !== null ? 'warning' : 'neutral'}
              className="h-full cursor-pointer"
            />
          </Link>
          <Link href={priorityActionsHref} className="block rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2">
            <MetricTile
              label="Priority actions"
              value={scopedUrgentActions.slice(0, 3).length}
              hint="Top 3 ranked moves"
              tone={scopedUrgentActions.length > 0 ? 'warning' : 'success'}
              className="h-full cursor-pointer"
            />
          </Link>
          <Link href={protectedValueHref} className="block rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2">
            <MetricTile
              label="Annual savings found"
              value={formatUsd(annualSavingsPotential)}
              hint="Verified savings opportunities"
              tone="brand"
              className="h-full cursor-pointer"
            />
          </Link>
          <Link href={buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, '/dashboard/risk-radar')} className="block rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2">
            <MetricTile
              label="Risk exposure"
              value={riskExposureGap > 0 ? formatUsd(riskExposureGap) : 'None found'}
              hint="Unhedged financial exposure"
              tone={riskExposureGap > 0 ? 'urgent' : 'success'}
              className="h-full cursor-pointer"
            />
          </Link>
        </div>
      </PageHero>

      <WinCard
        title={heroNarrative.badgeLabel}
        value={heroNarrative.title}
        description={heroNarrative.subtitle ?? 'Chosen because it best balances cost prevention, confidence, and effort.'}
        actionLabel={heroNarrative.ctaLabel}
        actionMetaLabel={heroNarrative.actionMetaLabel}
        actionMetaValue={heroNarrative.actionMetaValue}
        actionMetaSupportingText={heroNarrative.actionMetaSupportingText}
        actionProgressLabel={heroNarrative.actionProgressLabel}
        actionProgressValue={heroNarrative.actionProgressValue}
        actionProgressPercent={heroNarrative.actionProgressPercent}
        compactActionLayout={heroNarrative.compactActionLayout}
        onAction={() => router.push(heroNarrative.href)}
        isUrgent={data.activeIncidents.length > 0 || overdueMaintenanceCount > 0}
        trust={{
          confidenceLabel: 'High confidence',
          freshnessLabel: 'Verified from live signals',
          sourceLabel: 'Home signals',
          rationale: 'Ranked by financial upside, risk prevention, and data confidence.'
        }}
        className="border border-teal-200/70 shadow-[var(--ctc-shadow-card)]"
      />
      <PremiumConfidenceBadge label="Calm control: no duplicate actions, one best next move." />

      <MagicCaptureSheet isOpen={isScannerOpen} onOpenChange={setIsScannerOpen} />
    </div>
  );

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 md:px-6 w-full">
        <CommandCenterTemplate
          primaryAction={primaryActionHero}
          confidenceLabel="Verified"
          freshnessLabel="Updated today"
          sourceLabel="Home analysis"
          secondaryModules={
            <RoomsSnapshotSection propertyId={effectiveSelectedPropertyId} />
          }
        />
      </div>

      <MilestoneCelebration type={celebration.type} isOpen={celebration.isOpen} onClose={dismiss} />
    </>
  );
}
