// apps/frontend/src/app/(dashboard)/dashboard/components/PropertyRiskScoreCard.tsx

"use client";

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Zap, Loader2, DollarSign, AlertTriangle, Shield, Home, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api/client';
import { PrimaryRiskSummary } from '@/types';
import { Progress } from "@/components/ui/progress";
import React from 'react';


// Helper to format currency
const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
}).format(amount);

// Helper to determine risk colors (mapped to available Badge variants)
const getRiskDetails = (score: number) => {
    // 100 is the best score (low risk)
    if (score >= 80) return { level: "LOW", color: "text-green-500", progressClass: "bg-green-500", badgeVariant: "success" as const };
    if (score >= 60) return { level: "MODERATE", color: "text-yellow-500", progressClass: "bg-yellow-500", badgeVariant: "secondary" as const };
    if (score >= 40) return { level: "ELEVATED", color: "text-orange-500", progressClass: "bg-orange-500", badgeVariant: "secondary" as const };
    return { level: "HIGH", color: "text-red-500", progressClass: "bg-red-500", badgeVariant: "destructive" as const };
};

/**
 * Self-fetching component to display the Risk Assessment summary on the main dashboard.
 */
export function PropertyRiskScoreCard() {
    const riskQuery = useQuery<PrimaryRiskSummary | null>({
        queryKey: ["primaryRiskSummary"],
        queryFn: async () => {
            try {
                const result = await api.getPrimaryRiskSummary();
                return result;
            } catch (error) {
                console.error("Failed to fetch primary risk summary:", error);
                return null;
            }
        },
        refetchInterval: (query) => (query.state.data?.status === 'QUEUED' ? 5000 : false),
        staleTime: 60 * 1000,
        gcTime: 10 * 60 * 1000,
    });
    
    const summary = riskQuery.data;
    const isInitialLoading = riskQuery.isLoading && !summary;
    const isFetching = riskQuery.isFetching;

    const reportLink = summary?.propertyId ? `/dashboard/properties/${summary.propertyId}/risk-assessment` : '/dashboard/properties';
    
    // --- State 1: No Property Found ---
    if (summary?.status === 'NO_PROPERTY') {
        return (
            <Card className="hover:shadow-lg transition-shadow border-dashed border-2 flex flex-col justify-center h-full">
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center text-sm font-medium text-gray-500">
                        <Home className="h-4 w-4 mr-2" /> Risk Assessment
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xl font-semibold mb-2">No Home Setup</p>
                    <p className="text-sm text-muted-foreground mb-4">Add your home to start calculating risks.</p>
                    <Link href="/dashboard/properties/new" passHref>
                        <Button size="sm" className="w-full">Add Your Property</Button>
                    </Link>
                </CardContent>
            </Card>
        );
    }

    // --- State 2: Loading / Initial Fetch Error ---
    if (isInitialLoading) {
        return (
            <Card className="animate-pulse flex flex-col justify-center h-full">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Risk Score</CardTitle></CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold flex items-center">
                        <Loader2 className="h-5 w-5 mr-3 animate-spin text-primary" />
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">Loading report data...</p>
                </CardContent>
            </Card>
        );
    }
    
    // Core data extraction
    const riskScore = summary?.riskScore || 0;
    const exposure = summary?.financialExposureTotal || 0;
    const { level, color, progressClass, badgeVariant } = getRiskDetails(riskScore);
    const riskProgressValue = 100 - riskScore;

    // --- State 3: Missing Data or Queued ---
    if (summary?.status === 'QUEUED') {
        const displayStatus = isFetching ? 'Calculating...' : 'Queued';
        const displayMessage = isFetching 
            ? 'Report calculation in progress. Refreshing soon...'
            : 'Report needs recalculation.';
        
        return (
            <Card className="hover:shadow-lg transition-shadow border-2 border-primary/50 flex flex-col justify-center h-full">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center">
                        <Zap className="h-4 w-4 mr-2 text-primary" />
                        Risk Report
                    </CardTitle>
                    <Badge variant="outline" className="text-primary border-primary">
                        {displayStatus}
                    </Badge>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold flex items-center">
                        <Loader2 className="h-5 w-5 mr-3 animate-spin text-primary" />
                        {riskScore} / 100
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 min-h-[20px]">{displayMessage}</p>
                    <Link href={reportLink} passHref>
                        <Button variant="outline" size="sm" className="mt-3 w-full" disabled={isFetching}>
                            {isFetching ? 'Recalculating...' : 'View Status'}
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        );
    }
    
    // Fallback for MISSING_DATA (0 score) - Treat as a warning/setup reminder
    if (riskScore === 0 && summary?.propertyId) {
        return (
            <Card className="hover:shadow-lg transition-shadow border-2 border-yellow-500/50 flex flex-col justify-center h-full">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center text-yellow-700">
                        <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
                        Risk Data Incomplete
                    </CardTitle>
                    <Badge variant="secondary">Setup</Badge>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">Needs Data</div>
                    <p className="text-sm text-muted-foreground mt-1 min-h-[20px]">
                        Add property details to generate a score.
                    </p>
                    <Link href={reportLink} passHref>
                        <Button variant="secondary" size="sm" className="mt-3 w-full">
                            Update Property Details
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        );
    }


    // --- State 4: Calculated Report (The happy path) ---
    return (
        <Link href={reportLink} passHref legacyBehavior>
            <Card className="cursor-pointer hover:shadow-lg transition-shadow flex flex-col justify-between h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-sm font-medium">
                        Risk Score: {summary?.propertyName || 'Primary Home'}
                    </CardTitle>
                    <Zap className={`h-4 w-4 ${color}`} />
                </CardHeader>
                <CardContent className="pt-0 flex-grow flex flex-col justify-between">
                    <div>
                        <div className="text-4xl font-extrabold flex items-baseline">
                            <span className={color}>{riskScore}</span>
                            <span className="text-xl font-semibold text-muted-foreground ml-1">/100</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 flex items-center">
                            <DollarSign className="h-4 w-4 mr-1 text-red-600" />
                            Exposure: <span className="font-bold text-red-600 ml-1">{formatCurrency(exposure)}</span>
                        </p>
                    </div>
                    
                    <div className="mt-4">
                        <Progress 
                            value={riskProgressValue} 
                            className="h-2" 
                            indicatorClassName={progressClass} 
                        />
                        <div className="flex justify-between items-center mt-2">
                            <Badge variant={badgeVariant as any}>{level}</Badge>
                            <Link href={reportLink} passHref>
                                <Button variant="link" className="p-0 h-auto text-sm font-semibold">
                                    View Report <ArrowRight className="h-4 w-4 ml-1" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}