// apps/frontend/src/app/(dashboard)/dashboard/components/PropertyRiskScoreCard.tsx

"use client";

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Zap, Loader2, DollarSign, AlertTriangle, Shield, Home } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api/client';
import { PrimaryRiskSummary } from '@/types';
import React from 'react';


// Helper to format currency
const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
}).format(amount);

// Helper to determine risk colors. Mapped to available Badge variants.
const getRiskDetails = (score: number) => {
    // 100 is the best score (low risk)
    // CRITICAL FIX: Replaced "warning" with "secondary" to match allowed Badge variants.
    if (score >= 80) return { level: "LOW", color: "text-green-500", badgeVariant: "success" as const };
    if (score >= 60) return { level: "MODERATE", color: "text-yellow-500", badgeVariant: "secondary" as const }; // Using 'secondary'
    if (score >= 40) return { level: "ELEVATED", color: "text-orange-500", badgeVariant: "secondary" as const }; // Using 'secondary'
    return { level: "HIGH", color: "text-red-500", badgeVariant: "destructive" as const };
};

/**
 * Self-fetching component to display the Risk Assessment summary on the main dashboard.
 */
export function PropertyRiskScoreCard() {
    const riskQuery = useQuery<PrimaryRiskSummary | null>({
        queryKey: ["primaryRiskSummary"],
        queryFn: async () => {
            try {
                // Fetch data from the new lightweight endpoint
                const result = await api.getPrimaryRiskSummary();
                return result;
            } catch (error) {
                console.error("Failed to fetch primary risk summary:", error);
                return null;
            }
        },
        // Refetch every 5 seconds if status is QUEUED to update the dashboard immediately upon calculation
        refetchInterval: (query) => (query.state.data?.status === 'QUEUED' ? 5000 : false),
        staleTime: 60 * 1000, // 1 minute stale time for dashboard
        gcTime: 10 * 60 * 1000,
    });
    
    const summary = riskQuery.data;
    const isInitialLoading = riskQuery.isLoading && !summary;
    const isFetching = riskQuery.isFetching;

    // --- State 1: No Property Found ---
    if (summary?.status === 'NO_PROPERTY') {
        return (
            <Card className="hover:shadow-lg transition-shadow border-dashed border-2">
                <CardHeader>
                    <CardTitle className="flex items-center text-sm font-medium text-gray-500">
                        <Home className="h-4 w-4 mr-2" /> Risk Assessment
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xl font-semibold mb-2">No Primary Property</p>
                    <p className="text-sm text-muted-foreground mb-4">You need to add a home to start calculating risk.</p>
                    <Link href="/dashboard/properties/new" passHref>
                        <Button size="sm" className="w-full">Add Your First Property</Button>
                    </Link>
                </CardContent>
            </Card>
        );
    }

    // --- State 2: Loading / Initial Fetch Error ---
    if (isInitialLoading) {
        return (
            <Card className="animate-pulse">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Risk Score</CardTitle>
                    <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold flex items-center">
                        <Loader2 className="h-5 w-5 mr-3 animate-spin text-primary" />
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">Loading report data...</p>
                </CardContent>
            </Card>
        );
    }
    
    // Default values
    const riskScore = summary?.riskScore || 0;
    const exposure = summary?.financialExposureTotal || 0;
    const { level, color, badgeVariant } = getRiskDetails(riskScore);
    const reportLink = summary?.propertyId ? `/dashboard/properties/${summary.propertyId}/risk-assessment` : '/dashboard/properties';

    // --- State 3: Missing Data or Queued ---
    if (summary?.status === 'QUEUED') {
        const displayStatus = isFetching ? 'Calculating...' : 'Queued';
        const displayMessage = isFetching 
            ? 'Report calculation in progress. Refreshing soon...'
            : 'Report needs recalculation. Click below to view status.';
        
        return (
            <Card className="hover:shadow-lg transition-shadow border-2 border-primary/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
            <Card className="hover:shadow-lg transition-shadow border-2 border-yellow-500/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium flex items-center text-yellow-700">
                        <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
                        Risk Data Incomplete
                    </CardTitle>
                    {/* CRITICAL FIX: Replaced "warning" with "secondary" */}
                    <Badge variant="secondary">Setup</Badge>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">Needs Data</div>
                    <p className="text-sm text-muted-foreground mt-1 min-h-[20px]">
                        Add property details (e.g., HVAC age) to generate a score.
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
            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                        Risk Score: {summary?.propertyName || 'Primary Home'}
                    </CardTitle>
                    <Zap className={`h-4 w-4 ${color}`} />
                </CardHeader>
                <CardContent>
                    <div className="text-4xl font-extrabold flex items-baseline">
                        <span className={color}>{riskScore}</span>
                        <span className="text-xl font-semibold text-muted-foreground ml-1">/100</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 flex items-center">
                        <DollarSign className="h-4 w-4 mr-1 text-red-600" />
                        Exposure: <span className="font-bold text-red-600 ml-1">{formatCurrency(exposure)}</span>
                    </p>
                    <div className="mt-3">
                        <Badge variant={badgeVariant as any}>{level}</Badge>
                        <span className="text-xs text-muted-foreground ml-2">
                            Updated {new Date(summary?.lastCalculatedAt as string || '').toLocaleDateString()}
                        </span>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}