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
    if (score >= 80) return { level: "LOW", color: "text-green-500", badgeVariant: "success" as const };
    if (score >= 60) return { level: "MODERATE", color: "text-yellow-500", badgeVariant: "secondary" as const };
    if (score >= 40) return { level: "ELEVATED", color: "text-orange-500", badgeVariant: "secondary" as const };
    return { level: "HIGH", color: "text-red-500", badgeVariant: "destructive" as const };
};

// --- FIX: Make propertyId optional in the interface ---
interface PropertyRiskScoreCardProps {
    propertyId?: string; // Changed from string to string?
}

/**
 * Self-fetching component to display the Risk Assessment summary...
 */
// --- FIX: Use React.FC type definition for proper prop recognition ---
export const PropertyRiskScoreCard: React.FC<PropertyRiskScoreCardProps> = ({ propertyId }) => {
    // If no propertyId is provided (e.g., initial load, Home Buyer with no properties), skip query
    const enabled = !!propertyId;
    
    const riskQuery = useQuery<PrimaryRiskSummary | null>({
        queryKey: ["riskSummary", propertyId],
        queryFn: async () => {
            try {
                if (!propertyId) return null; 
                const result = await api.getRiskSummary(propertyId);
                return result;
            } catch (error) {
                console.error("Failed to fetch risk summary for property:", propertyId, error);
                return null;
            }
        },
        refetchInterval: (query) => (query.state.data?.status === 'QUEUED' ? 5000 : false),
        staleTime: 60 * 1000, 
        gcTime: 10 * 60 * 1000,
        enabled: enabled, // Use the boolean value
    });
    
    // --- State 1: No property selected or data is being loaded/fetched ---
    if (!propertyId) {
        return (
            <Card className="hover:shadow-lg transition-shadow border-dashed border-2">
                <CardHeader>
                    <CardTitle className="flex items-center text-sm font-medium text-gray-500">
                        <Home className="h-4 w-4 mr-2" /> Risk Assessment
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xl font-semibold mb-2">No Property Selected</p>
                    <p className="text-sm text-muted-foreground mb-4">Please add a property or select one to view the risk report.</p>
                </CardContent>
            </Card>
        );
    }
    
    // Use fallback for other states
    const summary = riskQuery.data || { propertyId: propertyId, propertyName: 'Property', riskScore: 0, financialExposureTotal: 0, lastCalculatedAt: null, status: 'MISSING_DATA' };
    
    const isInitialLoading = riskQuery.isLoading && !summary.lastCalculatedAt; 
    const isFetching = riskQuery.isFetching;

    // Default values
    const riskScore = summary.riskScore || 0;
    const exposure = summary.financialExposureTotal || 0;
    const { level, color, badgeVariant } = getRiskDetails(riskScore);
    const reportLink = `/dashboard/properties/${propertyId}/risk-assessment`; 

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
    
    // --- State 3: Queued (Unchanged logic) ---
    if (summary.status === 'QUEUED') {
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
    
    // Fallback for MISSING_DATA - Treat as a warning/setup reminder
    // FIX: Only show MISSING_DATA if the risk score is actually 0. This prevents showing "Needs Data"
    // when a score has been calculated, but the backend status is incorrectly labeled.
    if (summary.status === 'MISSING_DATA' && riskScore === 0) {
        return (
            <Card className="hover:shadow-lg transition-shadow border-2 border-yellow-500/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium flex items-center text-yellow-700">
                        <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
                        Risk Data Incomplete
                    </CardTitle>
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
        <Card className="hover:shadow-lg transition-shadow"> 
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                    Risk Score: {summary.propertyName || 'Property'}
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
                        Updated {new Date(summary.lastCalculatedAt as string || '').toLocaleDateString()}
                    </span>
                </div>
                {/* ADDED: Explicit link for the happy path */}
                <Link href={reportLink} passHref>
                    <Button variant="link" className="p-0 h-auto mt-3 text-sm font-semibold">
                        View Risk Report <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                </Link>
            </CardContent>
        </Card>
    );
}