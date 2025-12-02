// apps/frontend/src/app/(dashboard)/dashboard/components/FinancialEfficiencyScoreCard.tsx

"use client";

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Leaf, DollarSign, Loader2, BarChart, AlertTriangle, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api/client';
import { FinancialReportSummary, FinancialSummaryStatus } from '@/types'; 
import React from 'react';

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
}).format(amount);

const getEfficiencyDetails = (score: number) => {
    // Score of 100 is benchmark, 75 means spending double the average (less efficient).
    if (score >= 90) return { level: "HIGH", color: "text-green-500", badgeVariant: "success" as const, icon: Leaf };
    if (score >= 70) return { level: "AVERAGE", color: "text-yellow-500", badgeVariant: "secondary" as const, icon: BarChart };
    return { level: "LOW", color: "text-red-500", badgeVariant: "destructive" as const, icon: DollarSign };
};

interface FinancialEfficiencyScoreCardProps {
    propertyId?: string;
}

export const FinancialEfficiencyScoreCard: React.FC<FinancialEfficiencyScoreCardProps> = ({ propertyId }) => {
    const enabled = !!propertyId;
    
    // Fallback data structure
    const FALLBACK_SUMMARY: FinancialReportSummary = {
        propertyId: propertyId || '',
        financialEfficiencyScore: 0,
        financialExposureTotal: 0,
        lastCalculatedAt: null,
        status: 'NO_PROPERTY' as FinancialSummaryStatus,
    };
    
    const efficiencyQuery = useQuery({
        queryKey: ['financial-efficiency-summary', propertyId],
        queryFn: async () => {
            // This calls GET /api/v1/financial-efficiency/summary and relies on the backend to handle job queuing
            const response = await api.getFinancialReportSummary(propertyId!) as FinancialReportSummary;
            return response;
        },
        retry: 1, 
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
        
        // Refetch every 10 seconds only if the status is explicitly QUEUED
        refetchInterval: (query) => {
            const currentStatus = (query.state.data as FinancialReportSummary)?.status;
            return currentStatus === 'QUEUED' ? 10000 : false;
        },
        
        staleTime: 60 * 1000, 
        gcTime: 10 * 60 * 1000,
        enabled: enabled,
    });
    
    const summary = efficiencyQuery.data || FALLBACK_SUMMARY; 
    const isInitialLoading = efficiencyQuery.isLoading && !summary.lastCalculatedAt; 
    const isFetching = efficiencyQuery.isFetching;

    const score = summary.financialEfficiencyScore || 0;
    // financialExposureTotal is the AC_Total (Actual Annual Cost)
    const exposure = summary.financialExposureTotal || 0; 
    const { level, color, badgeVariant, icon: ScoreIcon } = getEfficiencyDetails(score);
    
    // FIX: Use non-null assertion (!) on propertyId to resolve the TypeScript error
    const reportLink = `/dashboard/properties/${propertyId!}/financial-efficiency`; 

    // State 1: No property selected
    if (!propertyId) {
        return (
            <Card className="h-full flex flex-col border-dashed border-2">
                <CardHeader>
                    <div className="space-y-1">
                        <CardTitle className="font-heading text-xl flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-gray-500" />
                            Financial Efficiency
                        </CardTitle>
                        <CardDescription className="font-body text-sm">
                            Annual cost vs. market benchmarks
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="flex-1">
                    <p className="font-body text-xl font-semibold mb-2">No Property Selected</p>
                    <p className="font-body text-sm text-muted-foreground mb-4">
                        Select a property to analyze spending on insurance, utilities, and warranties.
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
                            Financial Efficiency
                        </CardTitle>
                        <CardDescription className="font-body text-sm">
                            Loading financial data...
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
                            Financial Efficiency
                        </CardTitle>
                        <CardDescription className="font-body text-sm">
                            Calculating efficiency score...
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="flex-1">
                    <p className="font-body text-xl font-semibold mb-2 text-yellow-600">Calculation In Progress</p>
                    <p className="font-body text-sm text-muted-foreground mb-4">
                        Your efficiency report is being generated. Results will appear automatically.
                    </p>
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 flex items-center gap-1">
                        {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
                        {isFetching ? 'Checking Worker Status...' : 'Queued for Processing'}
                    </Badge>
                </CardContent>
            </Card>
        );
    }

    // State 4: Missing data - need more property/expense details
    if (summary.status === 'MISSING_DATA') {
        return (
            <Card className="h-full flex flex-col border-2 border-gray-300">
                <CardHeader>
                    <div className="space-y-1">
                        <CardTitle className="font-heading text-xl flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-gray-500" />
                            Financial Efficiency
                        </CardTitle>
                        <CardDescription className="font-body text-sm">
                            Incomplete cost data
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="flex-1">
                    <p className="font-body text-xl font-semibold mb-2 text-gray-700">More Cost Data Needed</p>
                    <p className="font-body text-sm text-muted-foreground mb-4">
                        Please enter your utility, insurance, and warranty expenses to calculate the score.
                    </p>
                    <Link href={reportLink} passHref>
                        <Button variant="secondary" size="sm" className="mt-3 w-full font-body">
                            View Report Details
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
                        <ScoreIcon className={`h-5 w-5 ${color}`} />
                        Financial Efficiency Score
                    </CardTitle>
                    <CardDescription className="font-body text-sm">
                        Annual spending vs. market benchmark
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent className="flex-1">
                <div className="text-4xl font-extrabold flex items-baseline">
                    <span className={color}>{score}</span>
                    <span className="text-xl font-semibold text-muted-foreground ml-1">/100</span>
                </div>
                <p className="font-body text-sm text-muted-foreground mt-2 flex items-center">
                    <DollarSign className="h-4 w-4 mr-1 text-gray-500" />
                    Your Annual Cost: <span className="font-bold ml-1">{formatCurrency(exposure)}</span>
                </p>
                <div className="mt-3">
                    <Badge variant={badgeVariant as any}>{level} Efficiency</Badge>
                    <span className="font-body text-xs text-muted-foreground ml-2">
                        Updated {new Date(summary.lastCalculatedAt as string || '').toLocaleDateString()}
                    </span>
                </div>
                <Link href={reportLink} passHref>
                    <Button variant="link" className="p-0 h-auto mt-3 font-body text-sm font-semibold">
                        View Efficiency Report <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                </Link>
            </CardContent>
        </Card>
    );
}