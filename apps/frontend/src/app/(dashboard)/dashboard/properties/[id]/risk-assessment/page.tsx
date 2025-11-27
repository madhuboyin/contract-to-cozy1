// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/risk-assessment/page.tsx

"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Property, RiskAssessmentReport, AssetRiskDetail } from "@/types"; 
import { api } from "@/lib/api/client";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, PageHeaderHeading } from "@/components/page-header";
import { toast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, Shield, Loader2, DollarSign, Download, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import React from "react";

// --- Types for Query Data ---
type RiskReportFull = RiskAssessmentReport; 

interface QueuedData {
    status: 'QUEUED';
    report?: RiskReportFull;
}

interface CalculatedData {
    status: 'CALCULATED';
    report: RiskReportFull;
}

type RiskQueryData = QueuedData | CalculatedData;

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


// --- Placeholder Component for Phase 3.2 ---
const AssetMatrixTable = ({ details }: { details: AssetRiskDetail[] }) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Detailed Asset Risk Matrix (Phase 3.2)</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-sm text-muted-foreground">
                    This is where the sortable table will be displayed.
                </div>
            </CardContent>
        </Card>
    );
}

// --- Main Page Component ---
export default function RiskAssessmentPage() {
    const params = useParams();
    const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;

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
    // Use the simplest destructuring form to capture the data payload.
    const { data, isLoading: isLoadingReport, refetch } = useQuery<RiskQueryData>({
        queryKey: ["riskReport", propertyId],
        queryFn: async () => {
            const result = await api.getRiskReportSummary(propertyId); 

            if (result === 'QUEUED') {
                return { status: 'QUEUED' } as QueuedData;
            }
            
            return { status: 'CALCULATED', report: result } as CalculatedData;
        },
        refetchInterval: (query) => (query.state.data?.status === 'QUEUED' ? 5000 : false), 
        enabled: !!propertyId,
    });

    // --- Data Extraction and Status Determination (The Fix) ---
    // Safely access the custom 'status' property on the data payload.
    // FIX: Explicitly type the custom status field to resolve the ambiguity.
    const customStatus: RiskQueryData['status'] | undefined = data?.status;
    
    const isQueued = customStatus === 'QUEUED';
    const report: RiskReportFull | undefined = customStatus === 'CALCULATED' ? (data as CalculatedData).report : undefined;
    
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
    const score = report?.riskScore || 0;
    const { level, color, progressClass } = getRiskDetails(score);

    const exposure = report?.financialExposureTotal || 0;
    const formattedExposure = formatCurrency(exposure);
    const riskProgressValue = 100 - score;

    return (
        <DashboardShell>
            <PageHeader>
                <Link href={`/dashboard/properties/${propertyId}`} passHref>
                    <Button variant="link" className="p-0 h-auto mb-2 text-sm text-muted-foreground">
                        <ArrowLeft className="h-4 w-4 mr-1" /> Back to {property?.name || 'Property'} Overview
                    </Button>
                </Link>
                <PageHeaderHeading className="flex items-center gap-2">
                    <Zap className="h-8 w-8 text-primary" /> Property Risk Report
                </PageHeaderHeading>
            </PageHeader>

            {/* --- Risk Summary Banner --- */}
            <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4">
                <Card className="md:col-span-1 border-2 border-primary/50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-base font-medium">Risk Score</CardTitle>
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
                            </React.Fragment>
                        )}
                    </CardContent>
                </Card>

                <Card className="md:col-span-2 lg:col-span-2">
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
                
                <Card className="md:col-span-3 lg:col-span-1 flex flex-col justify-between">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Tools & Export</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <Button className="w-full" disabled={isCalculating || isQueued}>
                                <Download className="h-4 w-4 mr-2" /> Download Full PDF (P3.4)
                            </Button>
                            {isQueued && (
                                <Button variant="outline" className="w-full" onClick={() => refetch()}>
                                    Recalculate Now
                                </Button>
                            )}
                            {!isQueued && !isCalculating && (
                                <p className="text-xs text-muted-foreground">Last calculated: {new Date(report?.lastCalculatedAt || '').toLocaleString()}</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            <div className="mt-8 space-y-6">
                {/* --- Risk Gauge Visualization --- */}
                <div className="space-y-2">
                    <h3 className="text-xl font-semibold">Overall Risk Gauge: {level}</h3>
                    <div className="flex justify-between text-xs font-medium text-muted-foreground">
                        <span>High (0)</span>
                        <span>Low (100)</span>
                    </div>
                    <Progress 
                        value={riskProgressValue} 
                        className={`h-4`} 
                        indicatorClassName={progressClass} 
                    />
                </div>

                {/* --- Asset Breakdown (Phase 3.2 Target) --- */}
                {/* Ensure data is calculated and details array exists before rendering table */}
                {data && data.status === 'CALCULATED' && report?.details && <AssetMatrixTable details={report.details} />}
                
                {/* Placeholder for the risk category summary cards (e.g., STRUCTURE, SYSTEMS) */}
                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader><CardTitle className="text-lg">Structural Risk</CardTitle></CardHeader>
                        <CardContent>Summary Card Content (P3.3)</CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle className="text-lg">Systems Risk</CardTitle></CardHeader>
                        <CardContent>Summary Card Content (P3.3)</CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle className="text-lg">Safety Gaps</CardTitle></CardHeader>
                        <CardContent>Summary Card Content (P3.3)</CardContent>
                    </Card>
                </div>
            </div>
            
        </DashboardShell>
    );
}