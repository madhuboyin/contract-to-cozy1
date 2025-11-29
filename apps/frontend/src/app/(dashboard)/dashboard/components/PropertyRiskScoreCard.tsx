// apps/frontend/src/app/(dashboard)/dashboard/components/PropertyRiskScoreCard.tsx

"use client";

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Zap, Loader2, DollarSign, AlertTriangle, Shield, Home, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api/client';
// Import both types for transformation
import { PrimaryRiskSummary, RiskAssessmentReport, RiskSummaryStatus } from '@/types'; 
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
    
    // Define the fallback object as a constant conforming to PrimaryRiskSummary
    const FALLBACK_SUMMARY: PrimaryRiskSummary = { 
        propertyId: propertyId || '', // Must not be null for property-scoped operations
        propertyName: 'Property', 
        riskScore: 0, 
        financialExposureTotal: 0, 
        lastCalculatedAt: null, 
        status: 'MISSING_DATA' 
    };

    const riskQuery = useQuery<PrimaryRiskSummary | null>({
        queryKey: ["riskSummary", propertyId],
        queryFn: async () => {
            try {
                if (!propertyId) return null; 
                
                // The API call returns RiskAssessmentReport | "QUEUED" | null (or null on 404/error)
                const result = await api.getRiskReportSummary(propertyId); 

                if (!result) {
                    return FALLBACK_SUMMARY;
                }

                // Handle QUEUED string response
                if (typeof result === 'string') {
                    // Assume result is the status string "QUEUED"
                    return {
                        ...FALLBACK_SUMMARY,
                        propertyId,
                        status: result as RiskSummaryStatus, 
                    };
                }

                // Handle successful RiskAssessmentReport object response
                const report = result as RiskAssessmentReport;
                
                const status: RiskSummaryStatus = report.riskScore > 0 
                    ? 'CALCULATED' 
                    : 'MISSING_DATA'; 

                // FIX: Map RiskAssessmentReport fields to PrimaryRiskSummary fields
                return {
                    propertyId: report.propertyId,
                    propertyName: 'Property', // Placeholder: Must be derived from a separate source
                    riskScore: report.riskScore,
                    financialExposureTotal: report.financialExposureTotal,
                    lastCalculatedAt: report.lastCalculatedAt,
                    status: status,
                } as PrimaryRiskSummary;

            } catch (error) {
                 // Handle API request error (e.g., 404)
                return FALLBACK_SUMMARY;
            }
        },
        refetchInterval: (query) => (query.state.data?.status === 'QUEUED' ? 5000 : false),
        staleTime: 60 * 1000, 
        gcTime: 10 * 60 * 1000,
        enabled: enabled, // Use the boolean value
    });
    
    // Assign summary, leveraging the explicit type PrimaryRiskSummary
    const summary = riskQuery.data || FALLBACK_SUMMARY; 
    
    const isInitialLoading = riskQuery.isLoading && !summary.lastCalculatedAt; 
    const isFetching = riskQuery.isFetching;

    // Default values
    const riskScore = summary.riskScore || 0;
    const exposure = summary.financialExposureTotal || 0;
    const { level, color, badgeVariant } = getRiskDetails(riskScore);
    const reportLink = `/dashboard/properties/${propertyId}/risk-assessment`; 

    // --- State 1: No property selected ---
    if (!propertyId) {
        return (
            <Card className="border-dashed border-2">
                <CardHeader>
                    <div className="space-y-1">
                        <CardTitle className="font-heading text-xl flex items-center gap-2">
                            <Home className="h-5 w-5 text-gray-500" />
                            Risk Assessment
                        </CardTitle>
                        <CardDescription className="font-body text-sm">
                            Property financial exposure analysis
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <p className="font-body text-xl font-semibold mb-2">No Property Selected</p>
                    <p className="font-body text-sm text-muted-foreground mb-4">
                        Please add a property or select one to view the risk report.
                    </p>
                </CardContent>
            </Card>
        );
    }

    // --- State 2: Loading / Initial Fetch ---
    if (isInitialLoading) { 
        return (
            <Card className="animate-pulse">
                <CardHeader>
                    <div className="space-y-1">
                        <CardTitle className="font-heading text-xl flex items-center gap-2">
                            <Shield className="h-5 w-5 text-muted-foreground" />
                            Risk Score
                        </CardTitle>
                        <CardDescription className="font-body text-sm">
                            {summary.propertyName || 'Property'} risk analysis
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold flex items-center">
                        <Loader2 className="h-5 w-5 mr-3 animate-spin text-primary" />
                    </div>
                    <p className="font-body text-xs text-muted-foreground pt-1">Loading report data...</p>
                </CardContent>
            </Card>
        );
    }
    
    // Determine state based on calculated data fields, not just status string
    const isQueued = summary.status === 'QUEUED';
    // A report is calculated if the score is > 0 OR if a calculation timestamp exists
    const isCalculated = riskScore > 0 || !!summary.lastCalculatedAt; 

    // --- State 3: Queued ---
    if (isQueued) {
        const displayStatus = isFetching ? 'Calculating...' : 'Queued';
        const displayMessage = isFetching 
            ? 'Report calculation in progress. Refreshing soon...'
            : 'Report needs recalculation. Click below to view status.';
        
        return (
            <Card className="border-2 border-yellow-500">
                <CardHeader>
                    <div className="space-y-1">
                        <CardTitle className="font-heading text-xl flex items-center gap-2">
                            <Zap className="h-5 w-5 text-yellow-500" />
                            Risk Score
                        </CardTitle>
                        <CardDescription className="font-body text-sm">
                            {summary.propertyName || 'Property'} risk analysis
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center space-x-2 text-lg font-semibold text-yellow-600">
                        {isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
                        <span className="font-body">{displayStatus}</span>
                    </div>
                    <p className="font-body text-sm text-muted-foreground mt-2">{displayMessage}</p>
                    <Link href={reportLink} passHref>
                        <Button variant="secondary" size="sm" className="mt-3 w-full font-body">
                            View Risk Report
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        );
    }
    
    // --- State 4: Missing Data / Not Calculated ---
    // If not QUEUED, and not CALCULATED, display the missing data card.
    if (!isCalculated) {
        return (
            <Card className="border-2 border-gray-300">
                <CardHeader>
                    <div className="space-y-1">
                        <CardTitle className="font-heading text-xl flex items-center gap-2">
                            <Shield className="h-5 w-5 text-gray-500" />
                            Risk Score
                        </CardTitle>
                        <CardDescription className="font-body text-sm">
                            {summary.propertyName || 'Property'} risk analysis
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <p className="font-body text-xl font-semibold mb-2">Incomplete Data</p>
                    <p className="font-body text-sm text-muted-foreground mb-3">
                        Add property details to unlock your full risk report.
                    </p>
                    <Link href={reportLink} passHref>
                        <Button variant="secondary" size="sm" className="mt-3 w-full font-body">
                            Update Property Details
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        );
    }


    // --- State 5: Calculated Report (The happy path) ---
    return (
        <Card> 
            <CardHeader>
                <div className="space-y-1">
                    <CardTitle className="font-heading text-xl flex items-center gap-2">
                        <Zap className={`h-5 w-5 ${color}`} />
                        Risk Score
                    </CardTitle>
                    <CardDescription className="font-body text-sm">
                        {summary.propertyName || 'Property'} financial exposure
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-4xl font-extrabold flex items-baseline">
                    <span className={color}>{riskScore}</span>
                    <span className="text-xl font-semibold text-muted-foreground ml-1">/100</span>
                </div>
                <p className="font-body text-sm text-muted-foreground mt-2 flex items-center">
                    <DollarSign className="h-4 w-4 mr-1 text-red-600" />
                    Exposure: <span className="font-bold text-red-600 ml-1">{formatCurrency(exposure)}</span>
                </p>
                <div className="mt-3">
                    <Badge variant={badgeVariant as any}>{level}</Badge>
                    <span className="font-body text-xs text-muted-foreground ml-2">
                        Updated {new Date(summary.lastCalculatedAt as string || '').toLocaleDateString()}
                    </span>
                </div>
                <Link href={reportLink} passHref>
                    <Button variant="link" className="p-0 h-auto mt-3 font-body text-sm font-semibold">
                        View Risk Report <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                </Link>
            </CardContent>
        </Card>
    );
}