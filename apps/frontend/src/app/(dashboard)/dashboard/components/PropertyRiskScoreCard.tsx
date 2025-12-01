// apps/frontend/src/app/(dashboard)/dashboard/components/PropertyRiskScoreCard.tsx
// FIX: Added h-full flex flex-col to all Card states for equal height in grid

"use client";

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Zap, Loader2, DollarSign, AlertTriangle, Shield, Home, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api/client';
import { PrimaryRiskSummary, RiskAssessmentReport, RiskSummaryStatus } from '@/types'; 
import React from 'react';

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
}).format(amount);

const getRiskDetails = (score: number) => {
    if (score >= 80) return { level: "LOW", color: "text-green-500", badgeVariant: "success" as const };
    if (score >= 60) return { level: "MODERATE", color: "text-yellow-500", badgeVariant: "secondary" as const };
    if (score >= 40) return { level: "ELEVATED", color: "text-orange-500", badgeVariant: "secondary" as const };
    return { level: "HIGH", color: "text-red-500", badgeVariant: "destructive" as const };
};

interface PropertyRiskScoreCardProps {
    propertyId?: string;
}

export const PropertyRiskScoreCard: React.FC<PropertyRiskScoreCardProps> = ({ propertyId }) => {
    const enabled = !!propertyId;
    
    const FALLBACK_SUMMARY: PrimaryRiskSummary = {
        propertyId: propertyId || '',
        propertyName: null,
        riskScore: 0,
        financialExposureTotal: 0,
        lastCalculatedAt: null,
        status: 'NO_PROPERTY' as RiskSummaryStatus,
    };
    
    const riskQuery = useQuery({
        queryKey: ['primary-risk-summary', propertyId],
        queryFn: async () => {
            // NOTE: The backend service will handle re-queuing the job if the report is stale.
            const response = await api.getPrimaryRiskSummary() as PrimaryRiskSummary;
            return response;
        },
        retry: (failureCount, error: any) => (error?.message?.includes('No property') || error?.message?.includes('5000') ? false : failureCount < 2),
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
        
        // FIX START: Increase interval and only refetch if QUEUED status is confirmed
        refetchInterval: (query) => {
            const currentStatus = (query.state.data as PrimaryRiskSummary)?.status;
            // Refetch every 10 seconds only if the status is explicitly QUEUED
            return currentStatus === 'QUEUED' ? 10000 : false;
        },
        // FIX END
        
        staleTime: 60 * 1000, 
        gcTime: 10 * 60 * 1000,
        enabled: enabled,
    });
    
    const summary = riskQuery.data || FALLBACK_SUMMARY; 
    const isInitialLoading = riskQuery.isLoading && !summary.lastCalculatedAt; 
    const isFetching = riskQuery.isFetching;

    const riskScore = summary.riskScore || 0;
    const exposure = summary.financialExposureTotal || 0;
    const { level, color, badgeVariant } = getRiskDetails(riskScore);
    const reportLink = `/dashboard/properties/${propertyId}/risk-assessment`; 

    // State 1: No property selected
    if (!propertyId) {
        return (
            <Card className="h-full flex flex-col border-dashed border-2">
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
                <CardContent className="flex-1">
                    <p className="font-body text-xl font-semibold mb-2">No Property Selected</p>
                    <p className="font-body text-sm text-muted-foreground mb-4">
                        Please add a property or select one to view the risk report.
                    </p>
                    <Link href="/dashboard/properties" passHref>
                        <Button variant="secondary" size="sm" className="w-full font-body">
                            Manage Properties
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        );
    }

    // State 2: Loading
    if (isInitialLoading) {
        return (
            <Card className="h-full flex flex-col">
                <CardHeader>
                    <div className="space-y-1">
                        <CardTitle className="font-heading text-xl flex items-center gap-2">
                            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                            Risk Assessment
                        </CardTitle>
                        <CardDescription className="font-body text-sm">
                            Loading risk data...
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="flex-1">
                    <div className="space-y-3 pt-2">
                        <div className="h-4 w-1/2 rounded bg-gray-200 animate-pulse" />
                        <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
                        <div className="h-4 w-1/3 rounded bg-gray-200 animate-pulse" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    // State 3: Queued for calculation
    if (summary.status === 'QUEUED') {
        return (
            <Card className="h-full flex flex-col border-2 border-yellow-500">
                <CardHeader>
                    <div className="space-y-1">
                        <CardTitle className="font-heading text-xl flex items-center gap-2">
                            <Loader2 className="h-5 w-5 animate-spin text-yellow-600" />
                            Risk Assessment
                        </CardTitle>
                        <CardDescription className="font-body text-sm">
                            Calculating risk score...
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="flex-1">
                    <p className="font-body text-xl font-semibold mb-2 text-yellow-600">Calculation In Progress</p>
                    <p className="font-body text-sm text-muted-foreground mb-4">
                        Your property risk report is being generated. This typically takes 10-30 seconds. Results will appear automatically.
                    </p>
                    {/* Add visual feedback for refetching status */}
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 flex items-center gap-1">
                        {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
                        {isFetching ? 'Checking Worker Status...' : 'Queued for Processing'}
                    </Badge>
                </CardContent>
            </Card>
        );
    }

    // State 4: Missing data - need more property details
    if (summary.status === 'MISSING_DATA') {
        return (
            <Card className="h-full flex flex-col border-2 border-gray-300">
                <CardHeader>
                    <div className="space-y-1">
                        <CardTitle className="font-heading text-xl flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-gray-500" />
                            Risk Assessment
                        </CardTitle>
                        <CardDescription className="font-body text-sm">
                            Incomplete property data
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="flex-1">
                    <p className="font-body text-xl font-semibold mb-2 text-gray-700">More Details Needed</p>
                    <p className="font-body text-sm text-muted-foreground mb-4">
                        Please complete your property details to generate an accurate risk assessment.
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

    // State 5: Calculated Report (Happy path)
    return (
        <Card className="h-full flex flex-col"> 
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
            <CardContent className="flex-1">
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