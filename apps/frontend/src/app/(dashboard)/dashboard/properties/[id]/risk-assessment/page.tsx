// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/risk-assessment/page.tsx

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Property, RiskAssessmentReport, AssetRiskDetail, RiskCategory, PropertyMaintenanceTask, RecurrenceFrequency, PropertyScoreSeries } from "@/types"; 
import { api } from "@/lib/api/client";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, PageHeaderHeading } from "@/components/page-header";
import { toast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Zap, Shield, Loader2, DollarSign, Download, ArrowLeft, Home, Zap as ZapIcon, Siren, CheckCircle, Calendar, AlertTriangle, ChevronRight, Clock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import React, { useState, useEffect, useMemo } from "react";
import { SEVERITY_CHIP } from "@/lib/utils/chipTokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { MaintenanceConfigModal } from "../../../maintenance-setup/MaintenanceConfigModal"; 
import { ScoreDeltaIndicator, ScoreTrendChart } from "@/components/scores/ScoreTrendChart";
import humanizeActionType from "@/lib/utils/humanize";
import {
    getMaintenanceServiceCategoryForSystemType,
    getProviderCategoryForSystemType,
    getSystemTypesForWarrantyCategory,
} from "@/lib/config/serviceCategoryMapping";
import {
    ActionPriorityRow,
    BottomSafeAreaReserve,
    CompactEntityRow,
    MobilePageIntro,
    MobileToolWorkspace,
    ReadOnlySummaryBlock,
    ResultHeroCard,
    ScenarioInputCard,
    StatusChip,
} from "@/components/mobile/dashboard/MobilePrimitives";
import { GuidanceInlinePanel } from "@/components/guidance/GuidanceInlinePanel";
import { useGuidance } from "@/features/guidance/hooks/useGuidance";
import type { GuidanceActionModel } from "@/features/guidance/utils/guidanceMappers";
import type { GuidanceIssueDomain } from "@/lib/api/guidanceApi";

import { navigateBackWithDashboardFallback } from '@/lib/navigation/backNavigation';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';
// --- Types for Query Data ---
type RiskReportFull = RiskAssessmentReport; 
// The API returns either the raw report object (RiskReportFull) or the string 'QUEUED'
type RiskQueryData = RiskAssessmentReport | 'QUEUED'; 

// --- Helper Functions ---
const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
}).format(amount);

const getRiskDetails = (score: number) => {
    if (score >= 80) return { level: "LOW", color: "text-green-500", progressClass: "bg-green-500", badgeVariant: "success" };
    if (score >= 60) return { level: "MODERATE", color: "text-yellow-500", progressClass: "bg-yellow-500", badgeVariant: "warning" };
    if (score >= 40) return { level: "ELEVATED", color: "text-orange-500", progressClass: "bg-orange-500", badgeVariant: "destructive" };
    return { level: "HIGH", color: "text-red-500", progressClass: "bg-red-500", badgeVariant: "destructive" };
};

function riskTone(level: string): "good" | "elevated" | "danger" {
    if (level === "LOW") return "good";
    if (level === "MODERATE") return "elevated";
    return "danger";
}

function toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function formatNumberDelta(value: number): string {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}

function buildRiskChangeItems(series: PropertyScoreSeries | undefined) {
    const changes: Array<{ title: string; detail: string; impact: 'positive' | 'negative' | 'neutral' }> = [];
    if (!series?.latest) {
        return [{
            title: 'Waiting for weekly history',
            detail: 'Trend details appear after weekly snapshots are collected.',
            impact: 'neutral' as const,
        }];
    }

    if (series.deltaFromPreviousWeek !== null) {
        const delta = series.deltaFromPreviousWeek;
        changes.push({
            title: 'Risk score movement',
            detail:
                delta > 0
                    ? `Risk score improved ${formatNumberDelta(delta)} points versus last week.`
                    : delta < 0
                    ? `Risk score declined ${Math.abs(delta).toFixed(1)} points versus last week.`
                    : 'Risk score was unchanged versus last week.',
            impact: delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral',
        });
    }

    const latestExposure = toNumber(series.latest.snapshot?.financialExposureTotal);
    const previousExposure = toNumber(series.previous?.snapshot?.financialExposureTotal);
    if (latestExposure !== null && previousExposure !== null) {
        const deltaExposure = latestExposure - previousExposure;
        changes.push({
            title: '5-year exposure change',
            detail:
                deltaExposure < 0
                    ? `Projected exposure dropped by ${formatCurrency(Math.abs(deltaExposure))}.`
                    : deltaExposure > 0
                    ? `Projected exposure increased by ${formatCurrency(deltaExposure)}.`
                    : 'Projected exposure remained flat.',
            impact: deltaExposure < 0 ? 'positive' : deltaExposure > 0 ? 'negative' : 'neutral',
        });
    }

    const latestHighRiskAssets = toNumber(series.latest.snapshot?.highRiskAssets);
    const previousHighRiskAssets = toNumber(series.previous?.snapshot?.highRiskAssets);
    if (latestHighRiskAssets !== null && previousHighRiskAssets !== null) {
        const deltaAssets = latestHighRiskAssets - previousHighRiskAssets;
        changes.push({
            title: 'High-risk assets',
            detail:
                deltaAssets < 0
                    ? `${Math.abs(deltaAssets)} fewer high-risk assets than last week.`
                    : deltaAssets > 0
                    ? `${deltaAssets} additional high-risk assets surfaced this week.`
                    : 'High-risk asset count stayed unchanged.',
            impact: deltaAssets < 0 ? 'positive' : deltaAssets > 0 ? 'negative' : 'neutral',
        });
    }

    if (changes.length === 0) {
        changes.push({
            title: 'No major risk drivers changed',
            detail: 'Score remained steady with no material weekly driver changes captured.',
            impact: 'neutral',
        });
    }

    return changes.slice(0, 4);
}

const displayLabel = (value?: string | null): string => humanizeActionType(value ?? "");

const RISK_MATRIX_GUIDANCE_DOMAINS: readonly GuidanceIssueDomain[] = [
    'ASSET_LIFECYCLE',
    'MAINTENANCE',
    'SAFETY',
    'INSURANCE',
];

const ASSET_CATEGORY_GUIDANCE_DOMAIN_PRIORITY: Record<RiskCategory, GuidanceIssueDomain[]> = {
    STRUCTURE: ['MAINTENANCE', 'SAFETY'],
    SYSTEMS: ['ASSET_LIFECYCLE', 'MAINTENANCE', 'INSURANCE'],
    SAFETY: ['SAFETY', 'MAINTENANCE'],
    FINANCIAL_GAP: ['FINANCIAL', 'INSURANCE'],
};

const ASSET_CATEGORY_SIGNAL_HINTS: Record<RiskCategory, string[]> = {
    STRUCTURE: ['maintenance', 'inspection', 'wind', 'flood', 'hurricane', 'wildfire'],
    SYSTEMS: ['lifecycle', 'maintenance', 'coverage', 'freeze', 'heat', 'energy'],
    SAFETY: ['recall', 'safety', 'inspection'],
    FINANCIAL_GAP: ['financial', 'coverage', 'cost', 'utility', 'energy'],
};

function buildAssetGuidanceHref(
    propertyId: string,
    asset: AssetRiskDetail,
    options?: {
        issueLabel?: string | null;
        issueType?: string | null;
    }
): string {
    return buildGuidanceOverviewHref({
        propertyId,
        inventoryItemId: asset.inventoryItemId ?? null,
        homeAssetId: asset.homeAssetId ?? null,
        assetName: asset.assetName,
        issueType: options?.issueType ?? null,
        customIssueLabel:
            options?.issueLabel || asset.actionCta || `${asset.assetName} needs attention`,
    });
}

function tokenizeForMatch(value: string | null | undefined): Set<string> {
    if (!value) return new Set();
    return new Set(
        value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .split(' ')
            .map((token) => token.trim())
            .filter((token) => token.length >= 3)
    );
}

function normalizeMatchId(value: string | null | undefined): string | null {
    if (!value) return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}

function scoreStableScopeMatch(item: AssetRiskDetail, action: GuidanceActionModel): number {
    const itemInventoryId = normalizeMatchId(item.inventoryItemId);
    const itemHomeAssetId = normalizeMatchId(item.homeAssetId);
    const actionInventoryId = normalizeMatchId(action.journey.inventoryItemId);
    const actionHomeAssetId = normalizeMatchId(action.journey.homeAssetId);

    let score = 0;

    if (itemInventoryId) {
        if (actionInventoryId === itemInventoryId) {
            score += 120;
        } else if (actionInventoryId) {
            score -= 80;
        }
    }

    if (itemHomeAssetId) {
        if (actionHomeAssetId === itemHomeAssetId) {
            score += 80;
        } else if (actionHomeAssetId) {
            score -= 60;
        }
    }

    return score;
}

function scoreGuidanceActionForAsset(item: AssetRiskDetail, action: GuidanceActionModel): number {
    const stableScopeScore = scoreStableScopeMatch(item, action);
    if (stableScopeScore <= -80) {
        return stableScopeScore;
    }

    const family = action.journey.primarySignal?.signalIntentFamily?.toLowerCase() ?? '';
    const hintMatches = (ASSET_CATEGORY_SIGNAL_HINTS[item.category] ?? []).filter((hint) =>
        family.includes(hint)
    ).length;

    const domainPriority = ASSET_CATEGORY_GUIDANCE_DOMAIN_PRIORITY[item.category] ?? [];
    const domainRank = domainPriority.indexOf(action.issueDomain);
    const domainScore = domainRank >= 0 ? 12 - domainRank * 3 : 0;

    const itemTokens = new Set<string>([
        ...tokenizeForMatch(item.assetName),
        ...tokenizeForMatch(item.systemType),
        ...tokenizeForMatch(displayLabel(item.category)),
    ]);

    const actionText = [
        action.title,
        action.subtitle,
        action.nextStep?.label ?? '',
        action.currentStep?.label ?? '',
        action.journey.journeyTypeKey ?? '',
        action.journey.currentStepKey ?? '',
        action.journey.primarySignal?.signalIntentFamily ?? '',
        action.journey.primarySignal?.sourceFeatureKey ?? '',
        action.journey.primarySignal?.sourceToolKey ?? '',
        action.explanation?.what ?? '',
        action.explanation?.nextStep ?? '',
    ].join(' ');
    const actionTokens = tokenizeForMatch(actionText);
    let tokenOverlap = 0;
    for (const token of itemTokens) {
        if (actionTokens.has(token)) tokenOverlap += 1;
    }

    const hasScopedJourney = Boolean(action.journey.inventoryItemId || action.journey.homeAssetId);
    const pastLifeBoost =
        item.age > item.expectedLife && family.includes('lifecycle') ? 4 : 0;

    return (
        stableScopeScore +
        domainScore +
        hintMatches * 4 +
        tokenOverlap * 2 +
        (hasScopedJourney ? 1 : 0) +
        pastLifeBoost
    );
}

function buildGuidanceCtaText(action: GuidanceActionModel): string {
    const step = action.nextStep ?? action.currentStep;
    if (!step) return action.title;
    return `Step ${step.stepOrder}: ${step.label}`;
}

function pickGuidanceActionForAsset(
    item: AssetRiskDetail,
    actions: GuidanceActionModel[]
): GuidanceActionModel | null {
    if (!actions.length) return null;

    const scopedMatches = actions
        .map((action) => ({
            action,
            score: scoreStableScopeMatch(item, action),
        }))
        .filter((entry) => entry.score >= 80)
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return (b.action.priorityScore ?? 0) - (a.action.priorityScore ?? 0);
        });

    if (scopedMatches[0]) {
        return scopedMatches[0].action;
    }

    const ranked = actions
        .map((action) => ({
            action,
            score: scoreGuidanceActionForAsset(item, action),
        }))
        .sort((a, b) => b.score - a.score);

    if (ranked[0] && ranked[0].score > 0) {
        return ranked[0].action;
    }

    const domainPriority = ASSET_CATEGORY_GUIDANCE_DOMAIN_PRIORITY[item.category] ?? [];
    for (const domain of domainPriority) {
        const match = actions.find((action) => action.issueDomain === domain);
        if (match) return match;
    }

    return actions[0] ?? null;
}

// 🔑 NEW: Component to show scheduled status
const ScheduledBadge: React.FC<{ task: PropertyMaintenanceTask }> = ({ task }) => (
    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 border border-green-200">
        <CheckCircle className="h-3 w-3 text-green-600" />
        <span className="text-xs font-medium text-green-700">Scheduled</span>
    </div>
);


// --- Component for Phase 3.3: Risk Category Summary Card ---
/**
 * Category Health Summary Card
 * Shows overall risk status for a category (STRUCTURE, SYSTEMS, SAFETY, FINANCIAL_GAP)
 * No CTAs - this is a summary card only. Actions are in the table above.
 */
const RiskCategorySummaryCard = ({ 
    category, 
    details, 
    riskIcon: RiskIcon,
}: { 
    category: RiskCategory; 
    details: AssetRiskDetail[]; 
    riskIcon: React.ElementType;
}) => {
    
    // 🔑 SPECIAL HANDLING: FINANCIAL_GAP is cross-category analysis
    if (category === 'FINANCIAL_GAP') {
        // Analyze coverage gaps across ALL categories
        const allAssets = details; // All assets regardless of category
        
        // Assets with coverage factor < 0.5 (less than 50% covered) or high out-of-pocket costs
        const highExposureAssets = allAssets.filter(asset => {
            // High exposure = coverage factor is low (closer to 0) OR out-of-pocket > $500
            return asset.coverageFactor < 0.5 || asset.outOfPocketCost > 500;
        });
        
        // Calculate total unprotected exposure
        const totalGapExposure = highExposureAssets.reduce((sum, asset) => sum + asset.outOfPocketCost, 0);
        const formattedGapExposure = formatCurrency(totalGapExposure);
        
        let title: string;
        let description: string;
        let badgeStatus: string;
        let badgeColor: 'default' | 'success' | 'warning' | 'destructive' = 'default';
        
        if (allAssets.length === 0) {
            // No assets at all - need property data
            title = 'Financial gap data missing';
            description = 'Add property details to analyze coverage gaps.';
            badgeStatus = 'Info';
            badgeColor = 'default';
        } else if (highExposureAssets.length === 0) {
            // Great coverage!
            title = 'Financial gap analysis';
            description = 'Good warranty and insurance coverage detected.';
            badgeStatus = 'Good';
            badgeColor = 'success';
        } else if (highExposureAssets.length >= 3 || totalGapExposure > 5000) {
            // High exposure - multiple items or high dollar amount
            title = 'Financial gap analysis';
            description = `High unprotected exposure detected. Consider comprehensive warranty coverage.`;
            badgeStatus = 'High';
            badgeColor = 'destructive';
        } else {
            // Moderate exposure
            title = 'Financial gap analysis';
            description = `Some items lack adequate coverage. Review warranty options.`;
            badgeStatus = 'Moderate';
            badgeColor = 'warning';
        }
        
        return (
            <Card className="flex flex-col justify-between">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex justify-between items-start">
                        {title}
                        <RiskIcon className="h-5 w-5 text-muted-foreground ml-2" />
                    </CardTitle>
                    <CardDescription className="text-xs min-h-[30px]">
                        {description}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-sm text-muted-foreground">
                            {allAssets.length} {allAssets.length === 1 ? 'item' : 'items'} analyzed
                        </span>
                        <Badge variant={badgeColor as any}>
                            {badgeStatus.toUpperCase()}
                        </Badge>
                    </div>
                </CardContent>
            </Card>
        );
    }
    
    // 🔑 STANDARD CATEGORY LOGIC: STRUCTURE, SYSTEMS, SAFETY
    const relevantAssets = details.filter(item => item.category === category);
    
    const totalExposure = relevantAssets.reduce((sum, item) => sum + item.riskDollar, 0);
    const formattedExposure = formatCurrency(totalExposure);
    const itemCount = relevantAssets.length;

    // Determine overall category risk level
    const highRiskCount = relevantAssets.filter(a => a.riskLevel === 'HIGH').length;
    const moderateRiskCount = relevantAssets.filter(a => a.riskLevel === 'MODERATE' || a.riskLevel === 'ELEVATED').length;
    
    let title: string;
    let description: string;
    let badgeStatus: string;
    let badgeColor: 'default' | 'success' | 'warning' | 'destructive' = 'default';

    if (relevantAssets.length === 0) {
        // No data available
        title = `${displayLabel(category)} Data Missing`;
        description = `No component data available for this category.`;
        badgeStatus = 'INFO';
        badgeColor = 'default';
    } else if (highRiskCount > 0) {
        // Has high risk items
        title = `${displayLabel(category)} Risk`;
        description = `${highRiskCount} ${highRiskCount === 1 ? 'item requires' : 'items require'} attention. Total exposure: ${formattedExposure}.`;
        badgeStatus = 'HIGH';
        badgeColor = 'destructive';
    } else if (moderateRiskCount > 0) {
        // Has moderate risk items
        title = `${displayLabel(category)} Risk`;
        description = `${moderateRiskCount} ${moderateRiskCount === 1 ? 'item' : 'items'} with moderate risk. Total exposure: ${formattedExposure}.`;
        badgeStatus = 'MODERATE';
        badgeColor = 'warning';
    } else {
        // All low risk
        title = `${displayLabel(category)} Health`;
        description = `All components are currently low risk. Exposure: ${formattedExposure}.`;
        badgeStatus = 'GOOD';
        badgeColor = 'success';
    }
    
    return (
        <Card className="flex flex-col justify-between">
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex justify-between items-start">
                    {title}
                    <RiskIcon className="h-5 w-5 text-muted-foreground ml-2" />
                </CardTitle>
                <CardDescription className="text-xs min-h-[30px]">
                    {description}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-muted-foreground">
                        {itemCount} {itemCount === 1 ? 'item' : 'items'} monitored
                    </span>
                    <Badge variant={badgeColor as any}>
                        {badgeStatus.toUpperCase()}
                    </Badge>
                </div>
            </CardContent>
        </Card>
    );
}

// --- Snooze helpers (localStorage-backed, expires automatically) ---
const SNOOZE_KEY = 'ctc:risk-snoozed';

function loadSnoozed(): Map<string, Date> {
    if (typeof window === 'undefined') return new Map();
    try {
        const raw = localStorage.getItem(SNOOZE_KEY);
        if (!raw) return new Map();
        const now = Date.now();
        return new Map(
            (Object.entries(JSON.parse(raw) as Record<string, string>))
                .filter(([, v]) => new Date(v).getTime() > now)
                .map(([k, v]) => [k, new Date(v)])
        );
    } catch { return new Map(); }
}

function saveSnoozed(map: Map<string, Date>): void {
    const obj: Record<string, string> = {};
    map.forEach((date, key) => { obj[key] = date.toISOString(); });
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(obj));
}

function snoozeItemKey(item: AssetRiskDetail): string {
    return item.inventoryItemId ?? item.homeAssetId ?? `${item.systemType}:${item.assetName}`;
}

function getActionStatus(
    data: { hasBooking: boolean; hasTask: boolean; isPastLife: boolean },
    riskLevel: AssetRiskDetail['riskLevel']
): { label: string; className: string } {
    if (data.hasBooking) return { label: 'Service Booked', className: 'text-blue-600' };
    if (data.hasTask) return { label: 'Task Scheduled', className: 'text-green-600' };
    if (riskLevel === 'HIGH') return { label: 'Act Now', className: 'text-red-600 font-semibold' };
    if (riskLevel === 'ELEVATED') return { label: 'Review Soon', className: 'text-orange-600' };
    if (riskLevel === 'MODERATE') return { label: 'Monitor', className: 'text-yellow-600' };
    return { label: 'Healthy', className: 'text-green-600' };
}

const SNOOZE_OPTIONS = [
    { label: '7 days', days: 7 },
    { label: '30 days', days: 30 },
    { label: '90 days', days: 90 },
] as const;

// --- Component for Phase 3.2: Detailed Asset Matrix Table ---
const AssetMatrixTable = ({ 
    details, 
    tasksByHomeAssetId,
    tasksBySystemType,
    bookingsByInventoryItemId,
    bookingsByInsightFactor,
    warrantiesByHomeAssetId,
    warrantiesBySystemType,
    propertyId,
    onScheduleInspection, 
    onViewTask,
    onViewBooking,
}: { 
    details: AssetRiskDetail[];
    tasksByHomeAssetId: Map<string, PropertyMaintenanceTask>;
    tasksBySystemType: Map<string, PropertyMaintenanceTask>;
    bookingsByInventoryItemId: Map<string, any>;
    bookingsByInsightFactor: Map<string, any>;
    warrantiesByHomeAssetId: Map<string, any>;
    warrantiesBySystemType: Map<string, any>;
    propertyId: string;
    onScheduleInspection: (asset: AssetRiskDetail) => void;
    onViewTask: (task: PropertyMaintenanceTask) => void;
    onViewBooking: (booking: any) => void;
}) => {
    const guidance = useGuidance(propertyId, {
        enabled: Boolean(propertyId),
        issueDomains: RISK_MATRIX_GUIDANCE_DOMAINS,
    });

    const [filterCategory, setFilterCategory] = useState<string>('ALL');
    const [filterRisk, setFilterRisk] = useState<string>('ALL');
    const [sortBy, setSortBy] = useState<'risk' | 'exposure' | 'age'>('risk');

    const riskOrder: Record<string, number> = { HIGH: 0, ELEVATED: 1, MODERATE: 2, LOW: 3 };

    const [snoozedItems, setSnoozedItems] = useState<Map<string, Date>>(() => loadSnoozed());
    const [openSnoozeFor, setOpenSnoozeFor] = useState<string | null>(null);

    const filteredDetails = useMemo(() => {
        let items = [...details];
        if (filterCategory !== 'ALL') items = items.filter(d => d.category === filterCategory);
        if (filterRisk !== 'ALL') items = items.filter(d => d.riskLevel === filterRisk);
        items.sort((a, b) => {
            const aSnoozed = snoozedItems.has(snoozeItemKey(a)) ? 1 : 0;
            const bSnoozed = snoozedItems.has(snoozeItemKey(b)) ? 1 : 0;
            if (aSnoozed !== bSnoozed) return aSnoozed - bSnoozed;
            if (sortBy === 'risk') return (riskOrder[a.riskLevel] ?? 4) - (riskOrder[b.riskLevel] ?? 4);
            if (sortBy === 'exposure') return b.outOfPocketCost - a.outOfPocketCost;
            if (sortBy === 'age') return (b.age - b.expectedLife) - (a.age - a.expectedLife);
            return 0;
        });
        return items;
    }, [details, filterCategory, filterRisk, sortBy, snoozedItems]);

    const handleSnooze = (key: string, days: number) => {
        const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        const next = new Map(snoozedItems).set(key, until);
        setSnoozedItems(next);
        saveSnoozed(next);
        setOpenSnoozeFor(null);
    };

    const handleResume = (key: string) => {
        const next = new Map(snoozedItems);
        next.delete(key);
        setSnoozedItems(next);
        saveSnoozed(next);
    };

    useEffect(() => {
        if (!openSnoozeFor) return;
        const close = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest('[data-snooze-menu]')) setOpenSnoozeFor(null);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [openSnoozeFor]);

    const getRiskBadge = (level: AssetRiskDetail['riskLevel']) => {
        if (level === 'LOW') return <Badge variant="outline" className={SEVERITY_CHIP.good}>Low</Badge>;
        if (level === 'MODERATE') return <Badge variant="outline" className={SEVERITY_CHIP.medium}>Moderate</Badge>;
        if (level === 'ELEVATED') return <Badge variant="outline" className={SEVERITY_CHIP.elevated}>Elevated</Badge>;
        if (level === 'HIGH') return <Badge variant="outline" className={SEVERITY_CHIP.high}>High</Badge>;
        return <Badge variant="secondary">N/A</Badge>;
    };

    // Shared logic to derive CTA text/variant and status flags per asset
    const getAssetRowData = (item: AssetRiskDetail) => {
        const insightFactor = item.assetName.replace(/_/g, ' ');
        const existingBooking =
            (item.inventoryItemId
                ? bookingsByInventoryItemId.get(item.inventoryItemId)
                : undefined) ?? bookingsByInsightFactor.get(insightFactor);
        const hasBooking = !!existingBooking;
        const existingTask =
            (item.homeAssetId
                ? tasksByHomeAssetId.get(item.homeAssetId)
                : undefined) ?? tasksBySystemType.get(item.systemType);
        const hasTask = !!existingTask;
        const existingWarranty =
            (item.homeAssetId
                ? warrantiesByHomeAssetId.get(item.homeAssetId)
                : undefined) ?? warrantiesBySystemType.get(item.systemType);
        const hasWarranty = !!existingWarranty;
        const isPastLife = item.age > item.expectedLife;
        const guidanceAction = pickGuidanceActionForAsset(item, guidance.actions);
        let ctaText = '';
        let ctaVariant: 'default' | 'secondary' | 'destructive' | 'outline' = 'secondary';

        if (guidanceAction) {
            ctaText = buildGuidanceCtaText(guidanceAction);
            ctaVariant = guidanceAction.executionReadiness === 'READY' ? 'default' : 'outline';
        } else if (hasBooking) {
            ctaText = 'View Booking';
            ctaVariant = 'outline';
        } else if (hasTask) {
            ctaText = 'View Task';
            ctaVariant = 'outline';
        } else if (hasWarranty) {
            if (isPastLife) {
                ctaText = 'Schedule Replacement';
                ctaVariant = item.riskLevel === 'HIGH' ? 'destructive' : 'default';
            } else {
                ctaText = 'Schedule Inspection';
                ctaVariant = 'secondary';
            }
        } else {
            if (item.riskLevel === 'HIGH' && item.outOfPocketCost > 1000) {
                ctaText = 'Add Home Warranty';
                ctaVariant = 'destructive';
            } else if (item.actionCta) {
                ctaText = item.actionCta;
                ctaVariant = item.riskLevel === 'HIGH' ? 'destructive' : 'secondary';
            } else {
                ctaText = 'Schedule maintenance';
                ctaVariant = item.riskLevel === 'HIGH' ? 'destructive' : 'secondary';
            }
        }

        const guidanceHref = guidanceAction
            ? buildAssetGuidanceHref(propertyId, item, {
                issueLabel: ctaText.replace(/^Step \d+:\s*/i, ''),
                issueType: guidanceAction.journey.issueType ?? null,
            })
            : null;

        return {
            insightFactor,
            existingBooking,
            hasBooking,
            existingTask,
            hasTask,
            existingWarranty,
            hasWarranty,
            isPastLife,
            guidanceAction,
            guidanceHref,
            ctaText,
            ctaVariant,
        };
    };

    // Shared CTA button renderer
    const renderCtaButton = (item: AssetRiskDetail, data: ReturnType<typeof getAssetRowData>, fullWidth = false) => {
        const { ctaVariant, hasBooking, hasTask, existingBooking, existingTask, guidanceAction, guidanceHref } = data;
        // Strip "Step N: " prefix — ordering metadata that clutters short button labels
        const ctaText = data.ctaText.replace(/^Step \d+:\s*/i, '');
        const sizeClass = fullWidth ? 'w-full min-h-[44px]' : '';

        if (guidanceAction) {
            if (guidanceHref) {
                return (
                    <Button size="sm" variant={ctaVariant} asChild className={`gap-1 ${sizeClass}`}>
                        <Link href={guidanceHref}>
                            {ctaText}
                        </Link>
                    </Button>
                );
            }

            return (
                <Button
                    size="sm"
                    variant={ctaVariant}
                    className={`gap-1 ${sizeClass}`}
                    disabled
                    title={guidanceAction.blockedReason ?? 'Guidance step is currently unavailable.'}
                >
                    {ctaText}
                </Button>
            );
        }

        if (ctaText === 'Schedule Inspection' || ctaText === 'Schedule Replacement') {
            return (
                <Button 
                    size="sm" 
                    variant={ctaVariant}
                    asChild
                    className={`gap-1 ${sizeClass}`}
                >
                    <Link href={buildAssetGuidanceHref(propertyId, item, ctaText)}>
                        {ctaText}
                    </Link>
                </Button>
            );
        }

        return (
            <Button 
                size="sm" 
                variant={ctaVariant}
                onClick={() => {
                    if (hasBooking) {
                        onViewBooking(existingBooking);
                    } else if (hasTask && existingTask) {
                        window.location.href = buildAssetGuidanceHref(propertyId, item, existingTask.title || ctaText);
                    } else if (ctaText === 'Add Home Warranty') {
                        window.location.href = buildAssetGuidanceHref(propertyId, item, ctaText);
                    } else {
                        onScheduleInspection(item);
                    }
                }}
                className={`gap-1 ${sizeClass}`}
            >
                {(hasBooking || hasTask) && <Calendar className="h-3 w-3" />}
                {ctaText}
            </Button>
        );
    };

    // Shared status badges renderer
    const renderStatusBadges = (data: ReturnType<typeof getAssetRowData>) => {
        const { hasBooking, hasWarranty, hasTask, isPastLife, existingTask } = data;
        return (
            <div className="flex items-center gap-1.5 flex-wrap">
                {hasBooking && (
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 border border-blue-200">
                        <Calendar className="h-3 w-3 text-blue-600" />
                        <span className="text-xs font-medium text-blue-700">Booked</span>
                    </div>
                )}
                {hasWarranty && (
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-purple-50 border border-purple-200">
                        <svg className="h-3 w-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <span className="text-xs font-medium text-purple-700">
                            Warranty{isPastLife ? ' (won\'t cover)' : ''}
                        </span>
                    </div>
                )}
                {!hasBooking && !hasWarranty && hasTask && existingTask && <ScheduledBadge task={existingTask} />}
            </div>
        );
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Detailed Asset Risk Matrix</CardTitle>
                <CardDescription>A component-by-component breakdown of your home&apos;s risks, exposure, and potential actions.</CardDescription>
            </CardHeader>
            <CardContent>
                {/* Sort & filter controls — desktop only, segmented button groups */}
                <div className="hidden md:flex flex-col gap-2 mb-5">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-medium text-muted-foreground w-16 shrink-0">Category</span>
                        <div className="flex rounded-md border border-input overflow-hidden">
                            {[
                                { value: 'ALL', label: 'All' },
                                { value: 'STRUCTURE', label: 'Structure' },
                                { value: 'SYSTEMS', label: 'Systems' },
                                { value: 'SAFETY', label: 'Safety' },
                                { value: 'FINANCIAL_GAP', label: 'Financial' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setFilterCategory(opt.value)}
                                    aria-pressed={filterCategory === opt.value}
                                    className={`h-8 px-3 text-xs font-medium border-r border-input last:border-r-0 transition-colors ${
                                        filterCategory === opt.value
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-medium text-muted-foreground w-16 shrink-0">Risk</span>
                        <div className="flex rounded-md border border-input overflow-hidden">
                            {[
                                { value: 'ALL', label: 'All' },
                                { value: 'HIGH', label: 'High' },
                                { value: 'ELEVATED', label: 'Elevated' },
                                { value: 'MODERATE', label: 'Moderate' },
                                { value: 'LOW', label: 'Low' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setFilterRisk(opt.value)}
                                    aria-pressed={filterRisk === opt.value}
                                    className={`h-8 px-3 text-xs font-medium border-r border-input last:border-r-0 transition-colors ${
                                        filterRisk === opt.value
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-medium text-muted-foreground w-16 shrink-0">Sort</span>
                        <div className="flex rounded-md border border-input overflow-hidden">
                            {[
                                { value: 'risk', label: 'Risk level' },
                                { value: 'exposure', label: 'Exposure ↓' },
                                { value: 'age', label: 'Age vs. life' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setSortBy(opt.value as 'risk' | 'exposure' | 'age')}
                                    aria-pressed={sortBy === opt.value}
                                    className={`h-8 px-3 text-xs font-medium border-r border-input last:border-r-0 transition-colors ${
                                        sortBy === opt.value
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {filteredDetails.length} of {details.length} item{details.length !== 1 ? 's' : ''}
                        </span>
                        {(filterCategory !== 'ALL' || filterRisk !== 'ALL') && (
                            <>
                                <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">
                                    {[
                                        filterCategory !== 'ALL' ? filterCategory.charAt(0) + filterCategory.slice(1).toLowerCase().replace('_gap', '') : null,
                                        filterRisk !== 'ALL' ? filterRisk.charAt(0) + filterRisk.slice(1).toLowerCase() : null,
                                    ].filter(Boolean).join(' · ')}
                                </span>
                                <button
                                    onClick={() => { setFilterCategory('ALL'); setFilterRisk('ALL'); }}
                                    className="text-xs text-primary hover:underline"
                                >
                                    Clear
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* ===== MOBILE: Quick risk filter strip ===== */}
                <div className="md:hidden flex items-center gap-2 mb-4 flex-wrap">
                    {[
                        { value: 'ALL', label: 'All' },
                        { value: 'HIGH', label: 'High' },
                        { value: 'ELEVATED', label: 'Elevated' },
                        { value: 'MODERATE', label: 'Moderate' },
                    ].map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setFilterRisk(opt.value)}
                            aria-pressed={filterRisk === opt.value}
                            className={`h-7 px-3 text-xs font-medium rounded-full border transition-colors ${
                                filterRisk === opt.value
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'border-input bg-background text-muted-foreground hover:bg-accent'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                    <span className="text-xs text-muted-foreground ml-auto">
                        {filteredDetails.length} item{filteredDetails.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {/* ===== MOBILE: Card Layout (<md) ===== */}
                <div className="md:hidden space-y-4">
                    {filteredDetails.map((item, index) => {
                        const data = getAssetRowData(item);
                        const rowKey =
                            item.inventoryItemId ??
                            item.homeAssetId ??
                            `${item.systemType}-${item.assetName}-${index}`;
                        const itemKey = snoozeItemKey(item);
                        const isSnoozed = snoozedItems.has(itemKey);
                        const snoozeUntil = snoozedItems.get(itemKey);
                        const actionStatus = getActionStatus(data, item.riskLevel);
                        const mobileBorderColor =
                            isSnoozed ? 'border-border border-l-border opacity-60' :
                            item.riskLevel === 'HIGH' ? 'border-red-200 border-l-red-500 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10' :
                            item.riskLevel === 'ELEVATED' ? 'border-border border-l-orange-400' :
                            item.riskLevel === 'MODERATE' ? 'border-border border-l-yellow-400' :
                            'border-border border-l-green-500';
                        return (
                            <div
                                key={rowKey}
                                className={`rounded-lg border border-l-4 p-4 space-y-3 ${mobileBorderColor}`}
                            >
                                {/* Row 1: Asset name + risk badge + action status */}
                                <div className="flex justify-between items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <h4 className="font-semibold text-sm leading-tight">
                                            {displayLabel(item.assetName)}
                                        </h4>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {(() => {
                                                const name = displayLabel(item.assetName).toLowerCase();
                                                const sys = displayLabel(item.systemType).toLowerCase();
                                                const showSys = sys && sys !== name && !sys.includes(name) && !name.includes(sys);
                                                return showSys
                                                    ? `${displayLabel(item.category)} · ${displayLabel(item.systemType)}`
                                                    : displayLabel(item.category);
                                            })()}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                                        {getRiskBadge(item.riskLevel)}
                                        {(data.hasBooking || data.hasTask) && (
                                            <span className={`text-xs ${actionStatus.className}`}>{actionStatus.label}</span>
                                        )}
                                    </div>
                                </div>

                                {/* Row 2: Status badges */}
                                {(data.hasBooking || data.hasWarranty || data.hasTask) && (
                                    renderStatusBadges(data)
                                )}

                                {/* Row 3: Key metrics in 2-col grid */}
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <span className="text-xs text-muted-foreground block">Age / Life</span>
                                        <span className="font-semibold">{item.age} yrs</span>
                                        <span className="text-muted-foreground"> / {item.expectedLife} yrs</span>
                                        {data.isPastLife && (
                                            <span className="inline-flex items-center text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded px-1 py-0.5 mt-0.5">Past Life</span>
                                        )}
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted-foreground block">Out-of-Pocket</span>
                                        <span className="font-bold text-red-600">{formatCurrency(item.outOfPocketCost)}</span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted-foreground block">Failure Risk</span>
                                        <span className="font-medium">{(item.probability * 100).toFixed(0)}%</span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted-foreground block">Coverage</span>
                                        <span className="font-medium">{(item.coverageFactor * 100).toFixed(0)}%</span>
                                    </div>
                                </div>

                                {/* Row 4: CTA / Snoozed state */}
                                {isSnoozed ? (
                                    <div className="flex items-center justify-between pt-1">
                                        <span className="text-xs text-muted-foreground">
                                            Snoozed until {snoozeUntil!.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                        <button onClick={() => handleResume(itemKey)} className="text-xs text-primary hover:underline">
                                            Resume
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {renderCtaButton(item, data, true)}
                                        {openSnoozeFor === itemKey ? (
                                            <div className="flex items-center gap-2 flex-wrap pt-1">
                                                <span className="text-xs text-muted-foreground">Snooze for:</span>
                                                {SNOOZE_OPTIONS.map(opt => (
                                                    <button
                                                        key={opt.days}
                                                        onClick={() => handleSnooze(itemKey, opt.days)}
                                                        className="text-xs border border-border rounded px-2 py-1 hover:bg-muted"
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setOpenSnoozeFor(itemKey)}
                                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground pt-1"
                                            >
                                                <Clock className="h-3 w-3" /> I&apos;m aware, snooze this
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })}
                    {filteredDetails.length === 0 && (
                        <div className="text-center py-10 text-muted-foreground text-sm">
                            No items match your current filters.{' '}
                            <button
                                onClick={() => { setFilterCategory('ALL'); setFilterRisk('ALL'); }}
                                className="text-primary hover:underline"
                            >
                                Clear filters
                            </button>
                        </div>
                    )}
                </div>

                {/* ===== DESKTOP: Table Layout (md+) ===== */}
                <div className="hidden md:block w-full overflow-x-auto">
                    <Table className="w-full table-auto">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="whitespace-nowrap min-w-[200px]">Asset</TableHead>
                                <TableHead className="whitespace-nowrap">Category</TableHead>
                                <TableHead className="whitespace-nowrap">Age / Life</TableHead>
                                <TableHead className="whitespace-nowrap">Risk Level</TableHead>
                                <TableHead className="whitespace-nowrap">Out-of-Pocket Exposure</TableHead>
                                <TableHead className="whitespace-nowrap">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredDetails.map((item, index) => {
                                const data = getAssetRowData(item);
                                const rowKey =
                                    item.inventoryItemId ??
                                    item.homeAssetId ??
                                    `${item.systemType}-${item.assetName}-${index}`;
                                const itemKey = snoozeItemKey(item);
                                const isSnoozed = snoozedItems.has(itemKey);
                                const snoozeUntil = snoozedItems.get(itemKey);
                                const actionStatus = getActionStatus(data, item.riskLevel);
                                const borderColor =
                                    item.riskLevel === 'HIGH' ? 'border-l-red-500' :
                                    item.riskLevel === 'ELEVATED' ? 'border-l-orange-400' :
                                    item.riskLevel === 'MODERATE' ? 'border-l-yellow-400' :
                                    'border-l-green-500';

                                return (
                                    <TableRow
                                        key={rowKey}
                                        className={[
                                            item.riskLevel === 'HIGH' && !isSnoozed
                                                ? 'bg-red-50/50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20'
                                                : '',
                                            isSnoozed ? 'opacity-50' : '',
                                        ].filter(Boolean).join(' ')}
                                    >
                                        <TableCell className={`align-top py-3 font-medium whitespace-normal break-words border-l-4 ${borderColor}`}>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span>{displayLabel(item.assetName)}</span>
                                                {data.hasBooking && (
                                                    <Badge variant="outline" className="text-[10px] h-4 px-1 border-blue-400 text-blue-600 dark:text-blue-400 shrink-0">Booked</Badge>
                                                )}
                                                {data.hasWarranty && (
                                                    <Badge variant="outline" className="text-[10px] h-4 px-1 border-green-500 text-green-700 dark:text-green-400 shrink-0">Warranty</Badge>
                                                )}
                                                {data.hasTask && !data.hasBooking && (
                                                    <Badge variant="outline" className="text-[10px] h-4 px-1 border-purple-400 text-purple-600 dark:text-purple-400 shrink-0">Scheduled</Badge>
                                                )}
                                            </div>
                                            {(() => {
                                                const name = displayLabel(item.assetName).toLowerCase();
                                                const sys = displayLabel(item.systemType).toLowerCase();
                                                return sys && sys !== name && !sys.includes(name) && !name.includes(sys);
                                            })() && (
                                                <div className="text-xs text-muted-foreground mt-0.5">{displayLabel(item.systemType)}</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="align-top py-3 text-sm text-muted-foreground whitespace-nowrap">
                                            {displayLabel(item.category)}
                                        </TableCell>
                                        <TableCell className="align-top py-3 whitespace-nowrap">
                                            <span className="font-semibold">{item.age} yrs</span>
                                            <span className="text-muted-foreground"> / {item.expectedLife} yrs</span>
                                            <div className="mt-1.5 w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${
                                                        data.isPastLife ? 'bg-red-500' :
                                                        (item.age / item.expectedLife) >= 0.8 ? 'bg-orange-400' :
                                                        (item.age / item.expectedLife) >= 0.6 ? 'bg-yellow-400' :
                                                        'bg-green-500'
                                                    }`}
                                                    style={{ width: `${Math.min((item.age / item.expectedLife) * 100, 100)}%` }}
                                                />
                                            </div>
                                            {data.isPastLife && (
                                                <span className="mt-1 inline-flex items-center text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded px-1 py-0.5">Past Life</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="align-top py-3 whitespace-nowrap">
                                            {getRiskBadge(item.riskLevel)}
                                            {(data.hasBooking || data.hasTask) && (
                                                <div className={`text-xs mt-1 ${actionStatus.className}`}>{actionStatus.label}</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="align-top py-3 font-bold text-red-600 whitespace-nowrap">
                                            {formatCurrency(item.outOfPocketCost)}
                                            <div className="text-xs text-muted-foreground whitespace-normal">P: {(item.probability * 100).toFixed(0)}% / C: {(item.coverageFactor * 100).toFixed(0)}%</div>
                                        </TableCell>
                                        <TableCell className="align-top py-3 whitespace-nowrap">
                                            {isSnoozed ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">
                                                        Snoozed until {snoozeUntil!.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                    </span>
                                                    <button
                                                        onClick={() => handleResume(itemKey)}
                                                        className="text-xs text-primary hover:underline"
                                                    >
                                                        Resume
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1">
                                                    {renderCtaButton(item, data)}
                                                    <div className="relative border-l border-border ml-1 pl-1" data-snooze-menu>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                                            title="Snooze — I'm aware, not acting now"
                                                            onClick={() => setOpenSnoozeFor(openSnoozeFor === itemKey ? null : itemKey)}
                                                        >
                                                            <Clock className="h-3.5 w-3.5" />
                                                        </Button>
                                                        {openSnoozeFor === itemKey && (
                                                            <div className="absolute right-0 top-8 z-10 bg-background border border-border rounded-md shadow-md py-1 min-w-[120px]">
                                                                <p className="text-xs text-muted-foreground px-3 py-1 border-b">Snooze for...</p>
                                                                {SNOOZE_OPTIONS.map(opt => (
                                                                    <button
                                                                        key={opt.days}
                                                                        onClick={() => handleSnooze(itemKey, opt.days)}
                                                                        className="w-full text-left text-xs px-3 py-1.5 hover:bg-muted"
                                                                    >
                                                                        {opt.label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {filteredDetails.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                                        No items match your current filters.{' '}
                                        <button
                                            onClick={() => { setFilterCategory('ALL'); setFilterRisk('ALL'); }}
                                            className="text-primary hover:underline"
                                        >
                                            Clear filters
                                        </button>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                <p className="hidden md:block text-xs text-muted-foreground mt-3 pt-3 border-t">
                    P = probability of failure this year &nbsp;·&nbsp; C = coverage factor (% of repair costs covered by warranty or insurance)
                </p>
            </CardContent>
        </Card>
    );
}

// --- Main Page Component ---
export default function RiskAssessmentPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient(); // 🔑 NEW: For invalidating queries
    const propertyId = Array.isArray(params.id) ? (params.id[0] ?? '') : (params.id ?? '');
    const { user } = useAuth(); 

    // Mock Premium Check (REPLACE with actual logic)
    const isPremium = user?.role === 'ADMIN';
    
    // 🔑 NEW: Modal state for creating tasks
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState<AssetRiskDetail | null>(null);
    const [trendWeeks, setTrendWeeks] = useState<26 | 52>(26);

    // 🔑 NEW: Extract focus parameter for exposure highlighting
    const focusParam = searchParams.get('focus');
    const shouldFocusExposure = focusParam === 'exposure';

    // 🔑 NEW: Extract view parameter for trends highlighting
    const viewParam = searchParams.get('view');
    const shouldFocusTrends = viewParam === 'trends';

    // 🔑 NEW: Fetch existing maintenance tasks for this property
    const { data: maintenanceTasksData, refetch: refetchTasks } = useQuery({
        queryKey: ['maintenance-tasks', propertyId],
        enabled: !!propertyId,
        queryFn: async () => {
            const response = await api.getMaintenanceTasks(propertyId, {
                includeCompleted: false,
            });
            return response.success ? response.data : [];
        },
    });

    // 🔑 Fetch existing bookings for this property
    const { data: bookingsData, refetch: refetchBookings } = useQuery({
        queryKey: ['bookings', propertyId],
        enabled: !!propertyId,
        queryFn: async () => {
            try {
                const response = await api.listBookings({ propertyId });
                if (response.success && response.data?.bookings) {
                    const bookings = response.data.bookings;
                    if (Array.isArray(bookings)) {
                        return bookings.filter((b: any) => 
                            ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(b.status)
                        );
                    }
                }
                return [];
            } catch (error) {
                console.error('Error fetching bookings:', error);
                return [];
            }
        },
    });

    // 🔑 NEW: Fetch warranties for this property
    const { data: warrantiesData, refetch: refetchWarranties } = useQuery({
        queryKey: ['warranties', propertyId],
        enabled: !!propertyId,
        queryFn: async () => {
            try {
                const response = await api.listWarranties(propertyId);
                if (response.success && response.data?.warranties) {
                    const warranties = response.data.warranties;
                    if (Array.isArray(warranties)) {
                        // Filter for active warranties only (check expiry date)
                        const now = new Date();
                        return warranties.filter((w: any) => {
                            const expiryDate = new Date(w.expiryDate);
                            // Only filter by expiry date - status field may not exist in DB
                            return expiryDate > now;
                        });
                    }
                }
                return [];
            } catch (error) {
                console.error('Error fetching warranties:', error);
                return [];
            }
        },
    });

    const maintenanceTasks = Array.isArray(maintenanceTasksData) ? maintenanceTasksData : [];
    const activeBookings = Array.isArray(bookingsData) ? bookingsData : [];
    const activeWarranties = Array.isArray(warrantiesData) ? warrantiesData : [];

    // 🔑 Create lookup map: systemType -> task
    const tasksBySystemType = new Map<string, PropertyMaintenanceTask>();
    const tasksByHomeAssetId = new Map<string, PropertyMaintenanceTask>();
    if (Array.isArray(maintenanceTasks)) {
        maintenanceTasks.forEach(task => {
            if (task.assetType) {
                tasksBySystemType.set(task.assetType, task);
            }
            if (task.homeAssetId) {
                tasksByHomeAssetId.set(task.homeAssetId, task);
            }
        });
    }

    const bookingsByInventoryItemId = new Map<string, any>();
    // 🔑 Create lookup map: insightFactor -> booking
    const bookingsByInsightFactor = new Map<string, any>();
    if (Array.isArray(activeBookings)) {
        activeBookings.forEach((booking: any) => {
            if (booking.inventoryItemId) {
                bookingsByInventoryItemId.set(booking.inventoryItemId, booking);
            }
            if (booking.insightFactor) {
                bookingsByInsightFactor.set(booking.insightFactor, booking);
            }
        });
    }

    const warrantiesByHomeAssetId = new Map<string, any>();
    // 🔑 NEW: Create lookup map: systemType -> warranty (for badge display)
    const warrantiesBySystemType = new Map<string, any>();
    if (Array.isArray(activeWarranties)) {
        activeWarranties.forEach((warranty: any) => {
            getSystemTypesForWarrantyCategory(warranty.category).forEach((systemType) => {
                warrantiesBySystemType.set(systemType, warranty);
            });
            
            // If warranty is linked to specific asset, add that too
            if (warranty.linkedAssetId && warranty.linkedAsset?.assetType) {
                warrantiesBySystemType.set(warranty.linkedAsset.assetType, warranty);
                warrantiesByHomeAssetId.set(warranty.linkedAssetId, warranty);
            }
        });
    }
    
    
    // 🔑 Check for return from warranty/booking creation and refetch data
    React.useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('refreshed') === 'true') {
            // Invalidate queries to refetch with updated data
            queryClient.invalidateQueries({ queryKey: ['riskReport', propertyId] });
            queryClient.invalidateQueries({ queryKey: ['maintenance-tasks', propertyId] });
            queryClient.invalidateQueries({ queryKey: ['bookings', propertyId] });
            queryClient.invalidateQueries({ queryKey: ['warranties', propertyId] });
            
            // Clean up URL parameter
            const newUrl = window.location.pathname + window.location.search.replace(/[?&]refreshed=true/, '');
            window.history.replaceState({}, '', newUrl);
        }
    }, [propertyId, queryClient]); 

    // 1. Fetch Property Details (to get name/address for header)
    const { data: property, isLoading: isLoadingProperty } = useQuery({
        queryKey: ["property", propertyId],
        queryFn: async () => {
            const response = await api.getProperty(propertyId);
            if (response.success) return response.data;
            return null;
        },
        enabled: !!propertyId,
    });

    // 2. Fetch Detailed Risk Report
    const riskQuery = useQuery<RiskQueryData>({
        queryKey: ["riskReport", propertyId],
        queryFn: async () => {
            const result = await api.getRiskReportSummary(propertyId);
            if (result === 'QUEUED') {
                return 'QUEUED';
            }
            return result;
        },
        // The result of the queryFn is either RiskReportFull or 'QUEUED'
        refetchInterval: (query) => (query.state.data === 'QUEUED' ? 5000 : false),
        enabled: !!propertyId,
        staleTime: 0, // Always consider data stale
        gcTime: 0, // Don't cache results (renamed from cacheTime in v5+)
    });

    const scoreSnapshotQuery = useQuery({
        queryKey: ['property-score-snapshot-risk', propertyId, trendWeeks],
        queryFn: async () => api.getPropertyScoreSnapshots(propertyId, trendWeeks),
        enabled: !!propertyId,
        staleTime: 10 * 60 * 1000,
    });
    
    // --- Data Extraction and Status Determination ---
    const riskQueryPayload = riskQuery.data; 

    // Determine the status and safely extract the report object
    let currentStatus: 'QUEUED' | 'CALCULATED' | undefined = undefined;
    let report: RiskAssessmentReport | undefined;

    // Handle the two possible return values: 'QUEUED' or RiskAssessmentReport object
    if (riskQueryPayload === 'QUEUED') {
        currentStatus = 'QUEUED';
    } else if (typeof riskQueryPayload === 'object' && riskQueryPayload !== null) {
        // This is the RiskAssessmentReport object
        report = riskQueryPayload;
        currentStatus = 'CALCULATED';

        // CRITICAL: Validate and fix the details array
        if (report && report.details && !Array.isArray(report.details)) {
            // Try to convert from object to array
            if (typeof report.details === 'object' && report.details !== null) {
                const detailsArray = Object.values(report.details);
                if (Array.isArray(detailsArray) && detailsArray.length > 0) {
                    report = { ...report, details: detailsArray as AssetRiskDetail[] };
                }
            }
            // Try to parse from string
            else if (typeof report.details === 'string') {
                try {
                    const parsed = JSON.parse(report.details);
                    if (Array.isArray(parsed)) {
                        report = { ...report, details: parsed as AssetRiskDetail[] };
                    }
                } catch (e) {
                    console.error('Failed to parse risk details string:', e);
                }
            }
        }
    } else {
        // Handle initial undefined state or other unhandled types
        currentStatus = undefined;
    }

    const isQueued = currentStatus === 'QUEUED';
    const isLoadingReport = riskQuery.isLoading;
    
    // --- Loading and Error States ---
    if (isLoadingProperty || !propertyId) {
        return (
            <DashboardShell>
                <div className="h-64 rounded-lg bg-gray-100 animate-pulse flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </DashboardShell>
        );
    }
    
    const isCalculating = isLoadingReport && !report;

    // 🔑 NEW: Scroll to exposure section when focus parameter is present
    useEffect(() => {
        if (shouldFocusExposure && !isCalculating && !isQueued) {
            // Wait for DOM to render, then scroll to exposure section
            const timer = setTimeout(() => {
                const exposureElement = document.getElementById('exposure-summary');
                if (exposureElement) {
                    exposureElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [shouldFocusExposure, isCalculating, isQueued]);

    // 🔑 NEW: Scroll to trends section when view parameter is present
    useEffect(() => {
        if (shouldFocusTrends && !isCalculating && !isQueued) {
            // Wait for DOM to render, then scroll to trends section
            const timer = setTimeout(() => {
                const trendsElement = document.getElementById('risk-trends-section');
                if (trendsElement) {
                    trendsElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [shouldFocusTrends, isCalculating, isQueued]);

    const score = report?.riskScore || 0;
    const { level, color, progressClass } = getRiskDetails(score);
    const riskSeries = scoreSnapshotQuery.data?.scores?.RISK;
    const riskTrend = riskSeries?.trend || [];
    const riskChanges = buildRiskChangeItems(riskSeries);

    // FIX: Ensure financialExposureTotal is parsed as a number from the string API returns
    const exposureString = report?.financialExposureTotal;
    const exposure = (exposureString && typeof exposureString === 'string')
        ? Number(exposureString)
        : (typeof exposureString === 'number' ? exposureString : 0);
    
    const formattedExposure = formatCurrency(exposure);
    const riskProgressValue = 100 - score;
    const hasWeeklyHistory = !!riskSeries?.previous;
    const highRiskCount = report?.details?.filter(d => d.riskLevel === 'HIGH').length ?? 0;
    const pastLifeCount = report?.details?.filter(d => d.age > d.expectedLife).length ?? 0;
    const coverageGapCount = report?.details?.filter(d => d.coverageFactor < 0.3 && d.riskLevel !== 'LOW').length ?? 0;
    const top3HighRisk = report?.details
        ?.filter(d => d.riskLevel === 'HIGH' || d.riskLevel === 'ELEVATED')
        ?.sort((a, b) => b.outOfPocketCost - a.outOfPocketCost)
        ?.slice(0, 3) ?? [];
    const potentialSavings = top3HighRisk.reduce((sum, item) => sum + item.outOfPocketCost, 0);
    const reducedExposure = Math.max(0, exposure - potentialSavings);

    // --- PDF Download Handler (omitted for brevity) ---
    const handleDownloadPdf = async () => {
        // ... (PDF logic)
        
        if (!isPremium) {
            toast({
                title: "Premium Feature Required",
                description: "Downloading the full PDF report is a premium feature. Please upgrade your account.",
                variant: "destructive",
            });
            return;
        }
        
        if (!report) return;

        try {
            const pdfBlob = await api.downloadRiskReportPdf(propertyId);
            
            // Create a URL for the Blob and trigger download
            const url = window.URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `RiskAssessmentReport-${propertyId}-${new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            
            toast({
                title: "Download Started",
                description: "Your Risk Assessment PDF report is downloading.",
            });

        } catch (error: any) {
            console.error("PDF Download Error:", error);
            toast({
                title: "Download Failed",
                description: error.message || "Could not generate or download the PDF file.",
                variant: "destructive",
            });
        }
    };
    
    // 🔑 Handle CTA click - route based on action type and existing bookings/tasks
    const handleScheduleInspection = (asset: AssetRiskDetail) => {
        // Check if booking already exists for this asset
        const insightFactor = asset.assetName.replace(/_/g, ' ');
        const existingBooking =
            (asset.inventoryItemId
                ? bookingsByInventoryItemId.get(asset.inventoryItemId)
                : undefined) ?? bookingsByInsightFactor.get(insightFactor);
        
        if (existingBooking) {
            // Navigate to booking detail page
            router.push(`/dashboard/bookings/${existingBooking.id}`);
            return;
        }
        if (asset.actionCta === 'Add Home Warranty' || asset.actionCta?.includes('Schedule') || asset.actionCta?.includes('Book')) {
            router.push(buildAssetGuidanceHref(propertyId, asset, asset.actionCta || insightFactor));
            return;
        }
        
        // 3. Fallback: Open maintenance modal for creating reminders
        setSelectedAsset(asset);
        setIsModalOpen(true);
    };

    // 🔑 NEW: Handle viewing existing booking
    const handleViewBooking = (booking: any) => {
        router.push(`/dashboard/bookings/${booking.id}`);
    };

    // 🔑 NEW: Handle viewing existing task
    const handleViewTask = (task: PropertyMaintenanceTask) => {
        router.push(buildGuidanceOverviewHref({
            propertyId,
            customIssueLabel: task.title || 'Maintenance task needs review',
        }));
    };

    // 🔑 NEW: Handle successful task creation
    const handleTaskCreated = () => {
        toast({
            title: 'Task Created',
            description: 'Maintenance task added to your schedule.',
        });
        setIsModalOpen(false);
        setSelectedAsset(null);
        // Refetch maintenance tasks to update indicators
        refetchTasks();
    };
    
    // --- Detailed Section Rendering Logic ---
    const renderDetailedSections = () => {
        if (isCalculating || isQueued) {
            return (
                <Card className="col-span-full">
                    <CardHeader className="flex flex-row items-center justify-start space-y-0 pb-2">
                        <Loader2 className="h-5 w-5 animate-spin mr-3 text-primary" />
                        <CardTitle>Calculating Risks...</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <CardDescription>
                            {isQueued ? 'Your report is in the queue. We will update automatically.' : 'Fetching report details...'}
                        </CardDescription>
                    </CardContent>
                </Card>
            );
        }

        // Final check for calculated report with actual data
        if (report && Array.isArray(report.details) && report.details.length > 0) {
            return (
                <React.Fragment>
                    {/* Category breakdown first so users understand WHY before seeing the full matrix */}
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
                        <RiskCategorySummaryCard category={'STRUCTURE'} details={report.details} riskIcon={Home} />
                        <RiskCategorySummaryCard category={'SYSTEMS'} details={report.details} riskIcon={ZapIcon} />
                        <RiskCategorySummaryCard category={'SAFETY'} details={report.details} riskIcon={Siren} />
                        <RiskCategorySummaryCard category={'FINANCIAL_GAP'} details={report.details} riskIcon={DollarSign} />
                    </div>

                    <AssetMatrixTable
                        details={report.details}
                        tasksByHomeAssetId={tasksByHomeAssetId}
                        tasksBySystemType={tasksBySystemType}
                        bookingsByInventoryItemId={bookingsByInventoryItemId}
                        bookingsByInsightFactor={bookingsByInsightFactor}
                        warrantiesByHomeAssetId={warrantiesByHomeAssetId}
                        warrantiesBySystemType={warrantiesBySystemType}
                        propertyId={propertyId}
                        onScheduleInspection={handleScheduleInspection}
                        onViewTask={handleViewTask}
                        onViewBooking={handleViewBooking}
                    />

                    {top3HighRisk.length > 0 && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base font-medium">Top Actions to Reduce Risk</CardTitle>
                                <CardDescription>
                                    Highest-impact items to address. Full action plans are in{' '}
                                    <Link href="/dashboard/today" className="underline underline-offset-2">Today</Link>.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="divide-y">
                                    {top3HighRisk.map((item, idx) => (
                                        <div
                                            key={item.inventoryItemId ?? item.homeAssetId ?? `top3-${idx}`}
                                            className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <Badge variant={item.riskLevel === 'HIGH' ? 'destructive' : 'warning' as any} className="shrink-0">
                                                    {item.riskLevel}
                                                </Badge>
                                                <span className="text-sm font-medium truncate">{displayLabel(item.assetName)}</span>
                                                <span className="text-sm text-red-600 font-semibold shrink-0">{formatCurrency(item.outOfPocketCost)}</span>
                                            </div>
                                            <Link
                                                href={buildAssetGuidanceHref(propertyId, item, item.actionCta || displayLabel(item.assetName))}
                                                className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0 ml-4"
                                            >
                                                Start action <ChevronRight className="h-3 w-3" />
                                            </Link>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </React.Fragment>
            );
        }

        // Default fallback when not loading and no data found
        return (
            <Card className="col-span-full">
                <CardHeader><CardTitle>No Detailed Risk Data</CardTitle></CardHeader>
                <CardContent><CardDescription>Update your property details (like HVAC install year, roof type, appliance ages) to generate component risk summaries. The score displayed above (if any) is based on general property attributes and defaults.</CardDescription></CardContent>
            </Card>
        );
    };

    return (
        <DashboardShell>
            <div className="md:hidden">
                <MobileToolWorkspace
                    intro={
                        <div className="space-y-2">
                            <Button
                                variant="ghost"
                                className="min-h-[44px] w-fit px-0 text-sm text-muted-foreground"
                                onClick={() => navigateBackWithDashboardFallback(router)}
                            >
                                <ArrowLeft className="h-4 w-4 mr-1" /> Back
                            </Button>
                            <MobilePageIntro
                                eyebrow="Property Score"
                                title="Property Risk Report"
                                subtitle="Risk exposure, trend movement, and weekly change drivers."
                                action={
                                    <div className="rounded-xl border border-orange-200 bg-orange-50 p-2.5 text-orange-700">
                                        <Zap className="h-5 w-5" />
                                    </div>
                                }
                            />
                        </div>
                    }
                    summary={
                        <ResultHeroCard
                            title="Protection Score"
                            value={isCalculating || isQueued ? "..." : `${score}/100`}
                            status={<StatusChip tone={riskTone(level)}>{isQueued ? "Queued" : isCalculating ? "Calculating" : level}</StatusChip>}
                            summary="Projected 5-year exposure and weekly risk movement in one view."
                            actions={
                                <ActionPriorityRow
                                    primaryAction={
                                        <Button
                                            variant="default"
                                            onClick={() => riskQuery.refetch()}
                                            disabled={riskQuery.isFetching || isCalculating}
                                        >
                                            {isQueued ? "Check status" : "Generate new report"}
                                        </Button>
                                    }
                                    secondaryActions={
                                        <Button
                                            variant={isPremium ? "outline" : "secondary"}
                                            onClick={handleDownloadPdf}
                                            disabled={isCalculating || isQueued}
                                        >
                                            <Download className="h-4 w-4 mr-2" />
                                            {isPremium ? "Download PDF" : "Upgrade for PDF"}
                                        </Button>
                                    }
                                />
                            }
                        />
                    }
                    footer={<BottomSafeAreaReserve size="chatAware" />}
                >

                    <div 
                        id="exposure-summary" 
                        className={`transition-all duration-300 ${
                            shouldFocusExposure ? 'ring-2 ring-teal-400 rounded-lg shadow-lg' : ''
                        }`}
                    >
                        <ReadOnlySummaryBlock
                            title="Snapshot"
                            items={[
                                { label: "5-year exposure", value: formattedExposure, emphasize: true },
                                { label: "Week delta", value: <ScoreDeltaIndicator delta={riskSeries?.deltaFromPreviousWeek} /> },
                                { label: "Risk gauge", value: `${riskProgressValue}/100` },
                                { label: "Status", value: isQueued ? "Queued" : isCalculating ? "Calculating" : "Calculated" },
                            ]}
                            columns={2}
                        />
                    </div>

                    <div
                        id="risk-trends-section"
                        className={`transition-all duration-300 ${
                            shouldFocusTrends ? 'ring-2 ring-teal-400 rounded-lg shadow-lg' : ''
                        }`}
                    >
                        <ScenarioInputCard
                            title="Risk Trend"
                            subtitle="Weekly risk snapshots."
                            actions={
                                <ActionPriorityRow
                                    secondaryActions={
                                        <>
                                            <Button size="sm" variant={trendWeeks === 26 ? "default" : "outline"} onClick={() => setTrendWeeks(26)}>
                                                6 Months
                                            </Button>
                                            <Button size="sm" variant={trendWeeks === 52 ? "default" : "outline"} onClick={() => setTrendWeeks(52)}>
                                                1 Year
                                            </Button>
                                        </>
                                    }
                                />
                            }
                        >
                            <ScoreTrendChart points={riskTrend} ariaLabel="Property risk score trend" />
                        </ScenarioInputCard>
                    </div>

                    <ScenarioInputCard title="Changes Impacting Score" subtitle="Key weekly drivers behind risk movement.">
                        <div className="space-y-2">
                            {riskChanges.map((change, idx) => (
                                <CompactEntityRow
                                    key={`${change.title}-${idx}`}
                                    title={change.title}
                                    subtitle={change.detail}
                                    status={
                                        <StatusChip tone={change.impact === "positive" ? "good" : change.impact === "negative" ? "danger" : "info"}>
                                            {change.impact === "positive" ? "Positive" : change.impact === "negative" ? "Negative" : "Neutral"}
                                        </StatusChip>
                                    }
                                />
                            ))}
                        </div>
                    </ScenarioInputCard>

                    <details className="rounded-2xl border border-slate-200 bg-white p-4">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-800">Detailed matrix and categories</summary>
                        <div className="mt-3">{renderDetailedSections()}</div>
                    </details>
                </MobileToolWorkspace>
            </div>

            <PageHeader className="hidden md:block">
                <Button 
                    variant="link" 
                    className="p-0 h-auto mb-2 text-sm text-muted-foreground min-h-[44px] flex items-center"
                    onClick={() => navigateBackWithDashboardFallback(router)}
                >
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <PageHeaderHeading className="flex items-center gap-2">
                    <Zap className="h-8 w-8 text-primary" /> Risk Assessment
                </PageHeaderHeading>
            </PageHeader>

            <div className="hidden md:block">
            {report && !isCalculating && !isQueued && (
                <Card className="mb-6 border-l-4 border-l-primary/60 bg-muted/20">
                    <CardContent className="pt-5 pb-4">
                        <div className="flex gap-3">
                            <AlertTriangle className={`h-5 w-5 mt-0.5 shrink-0 ${level === 'LOW' ? 'text-green-500' : level === 'MODERATE' ? 'text-yellow-500' : 'text-red-500'}`} />
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-foreground">
                                    {level === 'LOW'
                                        ? 'Your home is well protected'
                                        : level === 'MODERATE'
                                        ? 'Your home has moderate risk exposure'
                                        : 'Your home has high financial exposure'}
                                </p>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    {highRiskCount > 0 && `${highRiskCount} asset${highRiskCount > 1 ? 's require' : ' requires'} immediate attention. `}
                                    {pastLifeCount > 0 && `${pastLifeCount} asset${pastLifeCount > 1 ? 's are' : ' is'} past expected lifespan. `}
                                    {coverageGapCount > 0 && `${coverageGapCount} item${coverageGapCount > 1 ? 's have' : ' has'} limited warranty or insurance coverage. `}
                                    {level === 'LOW'
                                        ? 'Continue maintaining your assets to keep risk low.'
                                        : `Addressing the top items below can reduce your ${formattedExposure} 5-year exposure.`}
                                </p>
                                {top3HighRisk.length > 0 && potentialSavings > 0 && (
                                    <p className="text-sm mt-1">
                                        Resolving your top {top3HighRisk.length} high-risk item{top3HighRisk.length > 1 ? 's' : ''} could save{' '}
                                        <span className="font-semibold text-green-600">{formatCurrency(potentialSavings)}</span>
                                        {' '}— reducing exposure to ~<span className="font-semibold">{formatCurrency(reducedExposure)}</span>.
                                    </p>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
            {/* --- Risk Summary Banner --- */}
            <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="sm:col-span-1 border-2 border-primary/50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-base font-medium">Protection Score</CardTitle>
                        <Shield className="h-5 w-5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isCalculating || isQueued ? (
                            <div className="flex items-center space-x-2 text-lg text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {isQueued ? 'Queued for Calculation' : 'Calculating...'}
                            </div>
                        ) : (
                            <React.Fragment>
                                <div className="text-4xl font-extrabold flex items-baseline">
                                    {score}
                                    <span className="text-xl font-semibold text-muted-foreground ml-1">/100</span>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Status: <Badge variant={getRiskDetails(score).badgeVariant as any}>{level}</Badge>
                                </p>
                                <p className="text-xs text-muted-foreground mt-2">100 = fully protected · 0 = maximum exposure</p>
                            </React.Fragment>
                        )}
                    </CardContent>
                </Card>

                <Card 
                    id="exposure-summary" 
                    className={`sm:col-span-2 lg:col-span-2 transition-all duration-300 ${
                        shouldFocusExposure ? 'ring-2 ring-teal-400 shadow-lg' : ''
                    }`}
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-base font-medium">Total Financial Exposure (5-Year)</CardTitle>
                        <DollarSign className="h-5 w-5 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        {isCalculating || isQueued ? (
                            <div className="flex items-center space-x-2 text-lg text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Awaiting data...
                            </div>
                        ) : (
                            <div className="text-4xl font-extrabold text-red-600">
                                {formattedExposure}
                            </div>
                        )}
                        <p className="text-sm text-muted-foreground mt-1">
                            Calculated worst-case, out-of-pocket costs based on age and lack of coverage.
                        </p>
                    </CardContent>
                </Card>
                
                <Card className="sm:col-span-2 lg:col-span-1 flex flex-col justify-between">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Tools & Export</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <Button 
                                className="w-full min-h-[44px]" 
                                disabled={isCalculating || isQueued}
                                onClick={handleDownloadPdf}
                                variant={isPremium ? 'default' : 'secondary'}
                            >
                                <Download className="h-4 w-4 mr-2" /> 
                                {isPremium ? 'Download Full PDF' : 'Upgrade for PDF'}
                            </Button>
                            
                            {/* FIX START: Replace conditional queue logic with explicit Generate/Check Status button */}
                            {isQueued ? (
                                <Button 
                                    variant="outline" 
                                    className="w-full min-h-[44px]" 
                                    onClick={() => riskQuery.refetch()} 
                                    disabled={riskQuery.isFetching}
                                >
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Checking Calculation Status...
                                </Button>
                            ) : (
                                <Button 
                                    variant="secondary" 
                                    className="w-full min-h-[44px]" 
                                    onClick={() => riskQuery.refetch()} 
                                    disabled={riskQuery.isFetching || isCalculating} // Disabled if initiating a fetch
                                >
                                    Generate New Report
                                </Button>
                            )}
                            {/* FIX END */}

                            {/* Display the timestamp if a report has been successfully calculated (not queued/calculating) */}
                            {!isQueued && !isCalculating && report?.lastCalculatedAt && (
                                <p className="text-xs text-muted-foreground">
                                    Last calculated: {new Date(report.lastCalculatedAt).toLocaleString()}
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            <div className="mt-8 space-y-6">

                {/* --- Risk Gauge Visualization --- */}
                <div className="space-y-2">
                    <h3 className="text-xl font-semibold">Overall Protection Level: {level}</h3>
                    <div className="flex justify-between text-xs font-medium text-muted-foreground">
                        <span>Unprotected (0)</span>
                        <span>Fully Protected (100)</span>
                    </div>
                    <Progress
                        value={riskProgressValue}
                        className={`h-4`}
                        indicatorClassName={progressClass}
                    />
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Card 
                        id="risk-trends-section"
                        className={`lg:col-span-2 transition-all duration-300 ${
                            shouldFocusTrends ? 'ring-2 ring-teal-400 shadow-lg' : ''
                        }`}
                    >
                        <CardHeader className="pb-2">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <CardTitle className="text-base font-medium">Protection Score Trend</CardTitle>
                                    <CardDescription>Weekly snapshots with week-over-week delta.</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button size="sm" variant={trendWeeks === 26 ? "default" : "outline"} onClick={() => setTrendWeeks(26)}>
                                        6 Months
                                    </Button>
                                    <Button size="sm" variant={trendWeeks === 52 ? "default" : "outline"} onClick={() => setTrendWeeks(52)}>
                                        1 Year
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {riskTrend.length <= 1 ? (
                                <div className="flex flex-col items-center justify-center h-32 text-center">
                                    <p className="text-sm font-medium text-muted-foreground">Not enough history yet</p>
                                    <p className="text-xs text-muted-foreground mt-1">Complete actions to build your score trend. Check back weekly.</p>
                                </div>
                            ) : (
                                <ScoreTrendChart points={riskTrend} ariaLabel="Property protection score trend" />
                            )}
                            <ScoreDeltaIndicator delta={riskSeries?.deltaFromPreviousWeek} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base font-medium">Changes Impacting Score</CardTitle>
                            <CardDescription>Key weekly drivers behind your risk movement.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {!hasWeeklyHistory ? (
                                <div className="py-4 text-center">
                                    <p className="text-sm font-medium text-muted-foreground">No weekly history yet</p>
                                    <p className="text-xs text-muted-foreground mt-1">Complete actions to start tracking weekly improvements here.</p>
                                </div>
                            ) : (
                                riskChanges.map((change, idx) => (
                                    <div key={`${change.title}-${idx}`} className="rounded-lg border border-black/10 px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-medium">{change.title}</p>
                                            <Badge
                                                variant={
                                                    change.impact === 'positive'
                                                        ? 'success'
                                                        : change.impact === 'negative'
                                                        ? 'destructive'
                                                        : 'secondary'
                                                }
                                            >
                                                {change.impact === 'positive' ? 'Positive' : change.impact === 'negative' ? 'Negative' : 'Neutral'}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">{change.detail}</p>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* --- Detailed Section Content --- */}
                {renderDetailedSections()}
            </div>
            </div>

            {/* 🔑 NEW: Modal for creating maintenance tasks */}
            {selectedAsset && (
                <MaintenanceConfigModal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setSelectedAsset(null);
                    }}
                    template={{
                        id: `risk:${selectedAsset.systemType}`,
                        title: displayLabel(selectedAsset.assetName),
                        description: selectedAsset.actionCta || 'Schedule Inspection/Replacement',
                        serviceCategory: getMaintenanceServiceCategoryForSystemType(selectedAsset.systemType) as any,
                        defaultFrequency: RecurrenceFrequency.ANNUALLY,
                        sortOrder: 0,
                    }}
                    properties={[]}
                    selectedPropertyId={propertyId}
                    onSuccess={handleTaskCreated}
                    existingConfig={{
                        templateId: `risk:${selectedAsset.systemType}`,
                        title: displayLabel(selectedAsset.assetName),
                        description: selectedAsset.actionCta || 'Schedule Inspection/Replacement',
                        isRecurring: false,
                        frequency: null,
                        nextDueDate: new Date(),
                        serviceCategory: getMaintenanceServiceCategoryForSystemType(selectedAsset.systemType) as any,
                        propertyId: propertyId,
                    }}
                />
            )}
            
        </DashboardShell>
    );
}
