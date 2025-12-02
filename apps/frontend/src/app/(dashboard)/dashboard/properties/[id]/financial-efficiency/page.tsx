// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/financial-efficiency/page.tsx

"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { FinancialEfficiencyReport, Property } from "@/types"; 
import { api } from "@/lib/api/client";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, PageHeaderHeading } from "@/components/page-header";
import { toast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DollarSign, Shield, Loader2, Leaf, BarChart, ArrowLeft, RotateCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import React from "react";


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
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[200px]">Cost Category</TableHead>
                            <TableHead>Your Actual Annual Cost</TableHead>
                            <TableHead>Market Average Annual Cost</TableHead>
                            <TableHead>Status</TableHead>
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
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell className="font-bold text-gray-800">
                                        {formatCurrency(item.actual)}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {formatCurrency(item.average)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={badgeColor as any}>{statusText}</Badge>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        <TableRow className="font-extrabold border-t-2">
                            <TableCell>Total Annual Cost</TableCell>
                            <TableCell className="text-lg">{formatCurrency(actualTotal)}</TableCell>
                            <TableCell className="text-lg">{formatCurrency(report.marketAverageTotal)}</TableCell>
                            <TableCell></TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}


// --- Main Page Component ---
export default function FinancialEfficiencyPage() {
    const params = useParams();
    const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;

    // 1. Fetch Property Details (to get name/address for header)
    const { data: property, isLoading: isLoadingProperty } = useQuery({
        queryKey: ["property", propertyId],
        queryFn: async () => {
            const response = await api.getProperty(propertyId as string);
            if (response.success) return response.data;
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

    const actualTotalCost = (report?.actualInsuranceCost || 0) + (report?.actualUtilityCost || 0) + (report?.actualWarrantyCost || 0);
    const marketAverageTotal = report?.marketAverageTotal || 0;
    
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
            <Card className="md:col-span-4">
                <CardHeader><CardTitle>No Financial Data Available</CardTitle></CardHeader>
                <CardContent><CardDescription>Please ensure you have entered your property's insurance, warranty, and utility expenses in the Home Management section to generate this report. You can trigger a calculation once the data is entered.</CardDescription></CardContent>
            </Card>
        );
    };

    return (
        <DashboardShell>
            <PageHeader>
                <Link href={`/dashboard/properties/${propertyId}`} passHref>
                    <Button variant="link" className="p-0 h-auto mb-2 text-sm text-muted-foreground">
                        <ArrowLeft className="h-4 w-4 mr-1" /> Back to {property?.name || 'Property'} Overview
                    </Button>
                </Link>
                <PageHeaderHeading className="flex items-center gap-2">
                    <ScoreIcon className="h-8 w-8 text-primary" /> Financial Efficiency Report
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
                                {isQueued ? 'Queued for Calculation' : 'Calculating...'}
                            </div>
                        ) : (
                            <React.Fragment>
                                <div className="text-4xl font-extrabold flex items-baseline">
                                    {score.toFixed(0)}
                                    <span className="text-xl font-semibold text-muted-foreground ml-1">/100</span>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Status: <Badge variant={getEfficiencyDetails(score).badgeVariant as any}>{level}</Badge>
                                </p>
                            </React.Fragment>
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
                        ) : (
                            <div className="text-4xl font-extrabold text-gray-600">
                                {formattedExposure}
                            </div>
                        )}
                        <p className="text-sm text-muted-foreground mt-1">
                            Calculated annual spending on insurance, utilities, and warranty.
                        </p>
                    </CardContent>
                </Card>
                
                {/* Tools Card */}
                <Card className="md:col-span-3 lg:col-span-1 flex flex-col justify-between">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Report Actions</CardTitle>
                    </CardHeader>
                    <CardContent>
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
                            
                            {/* Market Average Info */}
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
                    </CardContent>
                </Card>
            </div>
            
            <div className="mt-8 space-y-6">
                {/* --- FES Gauge Visualization --- */}
                <div className="space-y-2">
                    <h3 className="text-xl font-semibold">Overall Efficiency Gauge: {level}</h3>
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

                {/* --- Detailed Section Content --- */}
                {renderDetailedSections()}
            </div>
            
        </DashboardShell>
    );
}