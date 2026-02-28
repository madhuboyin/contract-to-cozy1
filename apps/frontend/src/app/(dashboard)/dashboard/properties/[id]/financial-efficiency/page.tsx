// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/financial-efficiency/page.tsx

"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FinancialEfficiencyReport, PropertyScoreSeries } from "@/types"; 
import { api } from "@/lib/api/client";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, PageHeaderHeading } from "@/components/page-header";
import { toast } from "@/components/ui/use-toast";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DollarSign, Shield, Loader2, Leaf, BarChart, ArrowLeft, RotateCw, CircleDashed, Info, Wrench, Zap, BookOpen, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import React, { useState } from "react";
import { ScoreDeltaIndicator, ScoreTrendChart } from "@/components/scores/ScoreTrendChart";


// --- Types for Query Data ---
// The API returns either the raw report object (FinancialEfficiencyReport) or the string 'QUEUED'
type FESQueryData = FinancialEfficiencyReport | 'QUEUED'; 

// --- Helper Functions ---
const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
}).format(amount);

const getEfficiencyDetails = (score: number) => {
    // Score > 100 is excellent, 75 means double the cost of benchmark (50).
    if (score >= 90) return { level: "HIGH", color: "text-green-500", progressClass: "bg-green-500", badgeVariant: "success" as const, icon: Leaf };
    if (score >= 70) return { level: "AVERAGE", color: "text-blue-500", progressClass: "bg-blue-500", badgeVariant: "secondary" as const, icon: BarChart };
    return { level: "LOW", color: "text-red-500", progressClass: "bg-red-500", badgeVariant: "destructive" as const, icon: DollarSign };
};

function toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function buildFinancialChangeItems(series: PropertyScoreSeries | undefined) {
    const changes: Array<{ title: string; detail: string; impact: 'positive' | 'negative' | 'neutral' }> = [];
    if (!series?.latest) {
        return [{
            title: 'Waiting for weekly history',
            detail: 'Trend details appear after weekly snapshots are collected.',
            impact: 'neutral' as const,
        }];
    }

    const delta = series.deltaFromPreviousWeek;
    if (delta !== null) {
        changes.push({
            title: 'Efficiency score movement',
            detail:
                delta > 0
                    ? `Efficiency score improved by ${delta.toFixed(1)} points versus last week.`
                    : delta < 0
                    ? `Efficiency score declined by ${Math.abs(delta).toFixed(1)} points versus last week.`
                    : 'Efficiency score was unchanged versus last week.',
            impact: delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral',
        });
    }

    const latestAnnual = toNumber(series.latest.snapshot?.annualCost);
    const previousAnnual = toNumber(series.previous?.snapshot?.annualCost);
    if (latestAnnual !== null && previousAnnual !== null) {
        const costDelta = latestAnnual - previousAnnual;
        changes.push({
            title: 'Annual home cost movement',
            detail:
                costDelta < 0
                    ? `Annual cost dropped by ${formatCurrency(Math.abs(costDelta))}.`
                    : costDelta > 0
                    ? `Annual cost increased by ${formatCurrency(costDelta)}.`
                    : 'Annual cost remained flat week over week.',
            impact: costDelta < 0 ? 'positive' : costDelta > 0 ? 'negative' : 'neutral',
        });
    }

    const latestMarket = toNumber(series.latest.snapshot?.marketAverageTotal);
    const previousMarket = toNumber(series.previous?.snapshot?.marketAverageTotal);
    if (latestAnnual !== null && previousAnnual !== null && latestMarket !== null && previousMarket !== null) {
        const latestGap = latestAnnual - latestMarket;
        const previousGap = previousAnnual - previousMarket;
        const gapDelta = latestGap - previousGap;
        changes.push({
            title: 'Gap vs market average',
            detail:
                gapDelta < 0
                    ? `You moved ${formatCurrency(Math.abs(gapDelta))} closer to market benchmark.`
                    : gapDelta > 0
                    ? `Gap widened by ${formatCurrency(gapDelta)} versus market benchmark.`
                    : 'Gap vs market benchmark is unchanged.',
            impact: gapDelta < 0 ? 'positive' : gapDelta > 0 ? 'negative' : 'neutral',
        });
    }

    if (changes.length === 0) {
        changes.push({
            title: 'No major cost-driver shifts',
            detail: 'No significant changes were captured in weekly cost drivers.',
            impact: 'neutral',
        });
    }

    return changes.slice(0, 4);
}

// --- Component for Detailed Cost Breakdown Table ---
const CostBreakdownTable = ({ report }: { report: FinancialEfficiencyReport }) => {
    
    // Determine the total actual cost (AC_Total)
    const actualTotal = report.actualInsuranceCost + report.actualUtilityCost + report.actualWarrantyCost;

    const dataRows = [
        { 
            name: 'Insurance Premium', 
            actual: report.actualInsuranceCost, 
            average: report.marketAverageTotal * (report.actualInsuranceCost / actualTotal || 0.33), // Mock average breakdown
        },
        { 
            name: 'Utilities (12-Month)', 
            actual: report.actualUtilityCost, 
            average: report.marketAverageTotal * (report.actualUtilityCost / actualTotal || 0.33), // Mock average breakdown
        },
        { 
            name: 'Home Warranty Cost', 
            actual: report.actualWarrantyCost, 
            average: report.marketAverageTotal * (report.actualWarrantyCost / actualTotal || 0.33), // Mock average breakdown
        },
    ];
    
    // Fallback: If AC_Total is 0, use a generic distribution
    if (actualTotal === 0) {
        dataRows[0].average = report.marketAverageTotal * 0.33;
        dataRows[1].average = report.marketAverageTotal * 0.33;
        dataRows[2].average = report.marketAverageTotal * 0.33;
    }


    return (
        <Card>
            <CardHeader>
                <CardTitle>Annual Cost Breakdown</CardTitle>
                <CardDescription>Comparison of your actual annual expenses versus the calculated market average for your area and property type.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-3 md:hidden">
                    {dataRows.map((item, index) => {
                        const isEfficient = item.actual <= item.average * 1.1; // 10% tolerance
                        const badgeColor = isEfficient ? 'success' : 'destructive';
                        const statusText = isEfficient ? 'Efficient' : 'Overspending';
                        return (
                            <div key={index} className="rounded-xl border border-black/10 p-4 space-y-2">
                                <div className="text-sm font-medium">{item.name}</div>
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-muted-foreground">Your cost</span>
                                    <span className="font-bold text-gray-800">{formatCurrency(item.actual)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-muted-foreground">Market average</span>
                                    <span className="text-muted-foreground">{formatCurrency(item.average)}</span>
                                </div>
                                <div className="pt-1">
                                    <Badge variant={badgeColor as any}>{statusText}</Badge>
                                </div>
                            </div>
                        );
                    })}
                    <div className="rounded-xl border-2 border-black/10 p-4 space-y-1">
                        <div className="text-sm font-semibold">Total Annual Cost</div>
                        <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-muted-foreground">Your total</span>
                            <span className="text-base font-bold">{formatCurrency(actualTotal)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-muted-foreground">Market total</span>
                            <span className="text-base font-bold">{formatCurrency(report.marketAverageTotal)}</span>
                        </div>
                    </div>
                </div>

                <div className="hidden md:block">
                    <Table className="w-full table-auto">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="whitespace-nowrap">Cost Category</TableHead>
                                <TableHead className="whitespace-nowrap">Your Actual Annual Cost</TableHead>
                                <TableHead className="whitespace-nowrap">Market Average Annual Cost</TableHead>
                                <TableHead className="whitespace-nowrap">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {dataRows.map((item, index) => {
                                const isEfficient = item.actual <= item.average * 1.1; // 10% tolerance
                                const badgeColor = isEfficient ? 'success' : 'destructive';
                                const statusText = isEfficient ? 'Efficient' : 'Overspending';
                                
                                // Highlight row if significantly over average (more than 10% over market average)
                                const highlightClass = item.actual > item.average * 1.1 ? 'bg-red-50/50 dark:bg-red-900/10' : '';
                                
                                return (
                                    <TableRow key={index} className={highlightClass}>
                                        <TableCell className="font-medium whitespace-normal break-words">{item.name}</TableCell>
                                        <TableCell className="font-bold text-gray-800 whitespace-nowrap">
                                            {formatCurrency(item.actual)}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground whitespace-nowrap">
                                            {formatCurrency(item.average)}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            <Badge variant={badgeColor as any}>{statusText}</Badge>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            <TableRow className="font-extrabold border-t-2">
                                <TableCell className="whitespace-nowrap">Total Annual Cost</TableCell>
                                <TableCell className="text-lg whitespace-nowrap">{formatCurrency(actualTotal)}</TableCell>
                                <TableCell className="text-lg whitespace-nowrap">{formatCurrency(report.marketAverageTotal)}</TableCell>
                                <TableCell></TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

interface SetupStepProps {
    step: number;
    icon: React.ElementType;
    title: string;
    description: string;
    href: string;
    ctaLabel: string;
}

function SetupStep({ step, icon: Icon, title, description, href, ctaLabel }: SetupStepProps) {
    return (
        <div className="flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/30">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 border border-teal-200 dark:bg-teal-950/40 dark:border-teal-800/50">
                <span className="text-xs font-bold text-teal-600 dark:text-teal-400">{step}</span>
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-gray-500 dark:text-slate-400 shrink-0" />
                    <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">{title}</p>
                </div>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
                    {description}
                </p>
            </div>

            <Link href={href} className="shrink-0">
                <Button variant="outline" size="sm" className="text-teal-700 border-teal-200 hover:bg-teal-50 dark:text-teal-300 dark:border-teal-800/50 dark:hover:bg-teal-950/40">
                    {ctaLabel} →
                </Button>
            </Link>
        </div>
    );
}


// --- Main Page Component ---
export default function FinancialEfficiencyPage() {
    const params = useParams();
    const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
    const router = useRouter();
    const [trendWeeks, setTrendWeeks] = useState<26 | 52>(26);
    // 1. Fetch Property Details (to get name/address for header)
    const { data: property, isLoading: isLoadingProperty } = useQuery({
        queryKey: ["property", propertyId],
        queryFn: async () => {
            try {
                const response = await api.getProperty(propertyId as string);
                if (response.success) return response.data;
            } catch {
                return null;
            }
            return null;
        },
        enabled: !!propertyId,
    });

    // 2. Fetch Detailed Financial Efficiency Report
    const FESQuery = useQuery<FESQueryData>({
        queryKey: ["FESReport", propertyId],
        queryFn: async () => {
            // This calls GET /api/v1/properties/:propertyId/financial-efficiency
            return await api.getDetailedFESReport(propertyId as string);
        },
        // The result of the queryFn is either FinancialEfficiencyReport or 'QUEUED'
        refetchInterval: (query) => (query.state.data === 'QUEUED' ? 5000 : false), 
        enabled: !!propertyId,
        retry: 1, 
        staleTime: 0, 
        gcTime: 0, 
    });

    const scoreSnapshotQuery = useQuery({
        queryKey: ["property-score-snapshot-financial", propertyId, trendWeeks],
        queryFn: async () => {
            try {
                return await api.getPropertyScoreSnapshots(propertyId as string, trendWeeks);
            } catch {
                return null;
            }
        },
        enabled: !!propertyId,
        staleTime: 10 * 60 * 1000,
        retry: 1,
    });

    // --- Data Extraction and Status Determination ---
    const FESPayload = FESQuery.data; 
    
    let currentStatus: 'QUEUED' | 'CALCULATED' | undefined = undefined;
    let report: FinancialEfficiencyReport | undefined;

    if (FESPayload === 'QUEUED') {
        currentStatus = 'QUEUED';
    } else if (typeof FESPayload === 'object' && FESPayload !== null) {
        report = FESPayload;
        currentStatus = 'CALCULATED';
    } else {
        currentStatus = undefined;
    }
    
    const isQueued = currentStatus === 'QUEUED';
    const isLoadingReport = FESQuery.isLoading;
    
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
    const score = report?.financialEfficiencyScore || 0;
    const { level, color, progressClass, icon: ScoreIcon } = getEfficiencyDetails(score);
    const financialSeries = scoreSnapshotQuery.data?.scores?.FINANCIAL;
    const financialTrend = financialSeries?.trend || [];
    const financialChanges = buildFinancialChangeItems(financialSeries);

    const actualTotalCost = (report?.actualInsuranceCost || 0) + (report?.actualUtilityCost || 0) + (report?.actualWarrantyCost || 0);
    const marketAverageTotal = report?.marketAverageTotal || 0;
    const isZeroState = score === 0 && actualTotalCost === 0 && !isQueued && !isCalculating;
    
    const formattedExposure = formatCurrency(actualTotalCost);
    // Score is based on inverse of badness, so a score of 0 (worst efficiency) maps to 100 on the gauge (high risk)
    // Here, 100 score is excellent efficiency. We show 100 for best, 0 for worst.
    const efficiencyProgressValue = score; 

    // --- Recalculate Handler (Phase 3.4 Implementation) ---
    const handleRecalculate = async () => {
        if (isCalculating || isQueued) return;

        toast({
            title: "Recalculation Queued",
            description: "A new Financial Efficiency Score job has been added to the queue.",
        });
        
        try {
            // Calls the POST /recalculate endpoint
            await api.recalculateFES(propertyId as string); 
            // Manually refetch the query to update status immediately to 'QUEUED'
            FESQuery.refetch(); 
        } catch (error: any) {
             toast({
                title: "Recalculation Failed",
                description: error.message || "Could not queue the calculation job.",
                variant: "destructive",
            });
        }
    };
    
    // --- Detailed Section Rendering Logic ---
    const renderDetailedSections = () => {
        if (isCalculating || isQueued) {
            return (
                <Card className="md:col-span-3">
                    <CardHeader className="flex flex-row items-center justify-start space-y-0 pb-2">
                        <Loader2 className="h-5 w-5 animate-spin mr-3 text-primary" />
                        <CardTitle>Awaiting Detailed Financial Report</CardTitle>
                    </CardHeader>
                    <CardContent><CardDescription>{isQueued ? 'The calculation job is currently queued and will start shortly. This page will update automatically.' : 'Fetching detailed report breakdown...'}</CardDescription></CardContent>
                </Card>
            );
        }

        // Calculated Report (Happy path)
        if (report && report.financialEfficiencyScore > 0) {
            return (
                <CostBreakdownTable report={report} />
            );
        }
        
        // Fallback when not loading and no data found
        return (
            <div id="setup-checklist" className="space-y-4">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 dark:bg-blue-950/30 dark:border-blue-800/50">
                    <div className="flex items-start gap-3">
                        <Info className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
                        <div>
                            <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                                Your score is 0 because no financial data has been linked yet
                            </p>
                            <p className="mt-1 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                                The Financial Efficiency Score compares your actual home costs against regional benchmarks.
                                Link your three cost categories below, then generate your report.
                            </p>
                        </div>
                    </div>
                </div>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold">
                            3 steps to unlock your score
                        </CardTitle>
                        <CardDescription>
                            Complete all three to generate an accurate Financial Efficiency Score.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <SetupStep
                            step={1}
                            icon={Shield}
                            title="Link your insurance policy"
                            description="Your annual homeowners insurance premium — used to compare against regional averages."
                            href={`/dashboard/insurance?propertyId=${propertyId}&from=financial-efficiency`}
                            ctaLabel="Add Insurance"
                        />

                        <SetupStep
                            step={2}
                            icon={Wrench}
                            title="Add warranty costs"
                            description="Annual cost of any home warranty plans or extended appliance warranties."
                            href={`/dashboard/warranties?propertyId=${propertyId}&from=financial-efficiency`}
                            ctaLabel="Add Warranties"
                        />

                        <SetupStep
                            step={3}
                            icon={Zap}
                            title="Log utility expenses"
                            description="Annual electricity, gas, and water costs. Estimates are fine to start."
                            href={`/dashboard/expenses?propertyId=${propertyId}&from=financial-efficiency`}
                            ctaLabel="Add Utilities"
                        />
                    </CardContent>
                    <CardFooter className="border-t pt-4">
                        <div className="w-full">
                            <Button
                                className="w-full"
                                onClick={handleRecalculate}
                                disabled={isCalculating || isQueued}
                            >
                                <RotateCw className="h-4 w-4 mr-2" />
                                Generate Report
                            </Button>
                            <p className="mt-2 text-xs text-muted-foreground text-center w-full">
                                You can generate a partial report with any data you&apos;ve added so far.
                            </p>
                        </div>
                    </CardFooter>
                </Card>

                <details className="rounded-xl border border-gray-100 bg-gray-50 dark:border-slate-700 dark:bg-slate-900/40">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800/40 rounded-xl list-none flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4 text-gray-500" />
                            How the Financial Efficiency Score is calculated
                        </span>
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                    </summary>
                    <div className="px-4 pb-4 pt-2 space-y-2 text-xs text-gray-600 dark:text-slate-400">
                        <p>Your score (0–100) is calculated by comparing your <strong>actual annual home costs</strong> against the <strong>regional market average</strong> for similar properties.</p>
                        <ul className="space-y-1 pl-3 list-disc">
                            <li><strong>Insurance:</strong> Annual homeowners insurance premium</li>
                            <li><strong>Warranties:</strong> Home warranty plans and extended coverage</li>
                            <li><strong>Utilities:</strong> Electricity, gas, and water annual spend</li>
                        </ul>
                        <p>A score of <strong>100</strong> means your costs are at or below the market average. Scores below 75 indicate above-average spending with room to optimise.</p>
                    </div>
                </details>
            </div>
        );
    };

    return (
        <DashboardShell className="pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-8">
            <PageHeader className="pt-4 pb-4 md:pt-8 md:pb-8">
                <Button 
                    variant="link" 
                    className="p-0 h-auto mb-2 text-sm text-muted-foreground"
                    onClick={() => router.back()}
                >
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <PageHeaderHeading className="flex items-center gap-2">
                    <ScoreIcon className="h-6 w-6 md:h-8 md:w-8 text-primary" /> Financial Efficiency Report
                </PageHeaderHeading>
            </PageHeader>

            {/* --- FES Summary Banner --- */}
            <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4">
                
                {/* Score Card */}
                <Card className="md:col-span-1 border-2 border-primary/50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-base font-medium">Efficiency Score</CardTitle>
                        <Shield className="h-5 w-5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isCalculating || isQueued ? (
                            <div className="flex items-center space-x-2 text-lg text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>{isQueued ? 'Queued...' : 'Calculating...'}</span>
                            </div>
                        ) : isZeroState ? (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <p className="text-4xl font-bold text-slate-300 dark:text-slate-600">—</p>
                                </div>
                                <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 dark:bg-amber-950/30 dark:border-amber-800/50">
                                    <CircleDashed className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Setup needed</span>
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    Add your insurance, warranty, and utility costs to generate your score.
                                </p>
                            </div>
                        ) : (
                            <div>
                                <p className="text-4xl font-bold text-foreground">
                                    {score}
                                    <span className="text-sm font-normal text-muted-foreground">/100</span>
                                </p>
                                <div className="mt-2 flex items-center gap-2">
                                    <p className="text-xs text-muted-foreground">Status</p>
                                    <Badge variant={score >= 75 ? 'default' : score >= 50 ? 'outline' : 'destructive'}>
                                        {level}
                                    </Badge>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Actual Cost Card */}
                <Card className="md:col-span-2 lg:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-base font-medium">Your Actual Annual Cost</CardTitle>
                        <DollarSign className="h-5 w-5 text-gray-600" />
                    </CardHeader>
                    <CardContent>
                        {isCalculating || isQueued ? (
                            <div className="flex items-center space-x-2 text-lg text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Awaiting data...
                            </div>
                        ) : isZeroState ? (
                            <div className="space-y-2">
                                <p className="text-3xl font-bold text-slate-300 dark:text-slate-600">$—</p>
                                <p className="text-xs text-muted-foreground">
                                    No costs linked yet. Your actual annual spend will appear here once insurance, warranty, and utility data are added.
                                </p>
                            </div>
                        ) : (
                            <div>
                                <p className="text-3xl font-bold">{formattedExposure}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Calculated annual spending on insurance, utilities, and warranty.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
                
                {/* Tools Card */}
                <Card className="md:col-span-3 lg:col-span-1 flex flex-col justify-between">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Report Actions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isZeroState ? (
                            <div className="space-y-3">
                                <p className="text-xs text-muted-foreground">
                                    Complete the setup checklist below to generate your first report.
                                </p>
                                <Button
                                    variant="outline"
                                    className="w-full text-sm"
                                    onClick={() => {
                                        document.getElementById('setup-checklist')?.scrollIntoView({ behavior: 'smooth' });
                                    }}
                                >
                                    View Setup Steps ↓
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Button
                                    className="w-full"
                                    disabled={isCalculating || isQueued}
                                    onClick={handleRecalculate}
                                    variant='default'
                                >
                                    <RotateCw className="h-4 w-4 mr-2" />
                                    Generate New Report
                                </Button>
                                {marketAverageTotal > 0 && (
                                    <p className="text-xs text-muted-foreground font-medium text-center">
                                        Market Average: {formatCurrency(marketAverageTotal)}
                                    </p>
                                )}
                                {report?.lastCalculatedAt && (
                                    <p className="text-xs text-muted-foreground text-center">
                                        Last calculated: {new Date(report.lastCalculatedAt).toLocaleString()}
                                    </p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
            
            <div className="mt-8 space-y-6">
                {/* --- FES Gauge Visualization --- */}
                {!isZeroState && (
                    <div className="space-y-2">
                        <h3 className="text-lg md:text-xl font-semibold">Overall Efficiency Gauge: {level}</h3>
                        <div className="flex justify-between text-xs font-medium text-muted-foreground">
                            <span>Low Efficiency (0)</span>
                            <span>High Efficiency (100)</span>
                        </div>
                        <Progress
                            value={efficiencyProgressValue}
                            className={`h-4`}
                            indicatorClassName={progressClass}
                        />
                    </div>
                )}

                {!isZeroState && (
                    <div className="grid gap-4 lg:grid-cols-3">
                        <Card className="lg:col-span-2">
                            <CardHeader className="pb-2">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <CardTitle className="text-base font-medium">Efficiency Score Trend</CardTitle>
                                        <CardDescription>Weekly score snapshots over 6 months or 1 year.</CardDescription>
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
                                <ScoreTrendChart points={financialTrend} ariaLabel="Financial efficiency score trend" />
                                <ScoreDeltaIndicator delta={financialSeries?.deltaFromPreviousWeek} />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base font-medium">Changes Impacting Score</CardTitle>
                                <CardDescription>Top weekly factors that moved your efficiency.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {financialChanges.map((change, idx) => (
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
                                ))}
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* --- Detailed Section Content --- */}
                {renderDetailedSections()}
            </div>
            
        </DashboardShell>
    );
}
