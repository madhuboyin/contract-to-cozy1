// apps/frontend/src/app/(dashboard)/dashboard/components/FinancialEfficiencyScoreCard.tsx
"use client";

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { DollarSign, Loader2, ArrowRight, Home, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { FinancialReportSummary, FinancialSummaryStatus } from '@/types'; 
import React from 'react';
import ScoreGauge from '@/components/ui/ScoreGauge';

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
}).format(amount);

const getEfficiencyDetails = (score: number) => {
    if (score >= 80) return { level: "Excellent", color: "text-emerald-600" };
    if (score >= 60) return { level: "Good", color: "text-teal-600" };
    if (score >= 40) return { level: "Fair", color: "text-amber-500" };
    return { level: "Poor", color: "text-red-500" };
};

interface FinancialEfficiencyScoreCardProps {
    propertyId?: string;
}

export const FinancialEfficiencyScoreCard: React.FC<FinancialEfficiencyScoreCardProps> = ({ propertyId }) => {
    const enabled = !!propertyId;
    
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
            const response = await api.getFinancialReportSummary(propertyId!) as FinancialReportSummary;
            return response;
        },
        retry: 1, 
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
        refetchInterval: (query) => {
            const currentStatus = (query.state.data as FinancialReportSummary)?.status;
            return currentStatus === 'QUEUED' ? 10000 : false;
        },
        staleTime: 60 * 1000, 
        gcTime: 10 * 60 * 1000,
        enabled: enabled,
    });

    const snapshotQuery = useQuery({
        queryKey: ['property-score-snapshot', propertyId, 'FINANCIAL'],
        queryFn: async () => {
            if (!propertyId) return null;
            return api.getPropertyScoreSnapshots(propertyId, 16);
        },
        enabled,
        staleTime: 10 * 60 * 1000,
    });
    
    const summary = efficiencyQuery.data || FALLBACK_SUMMARY; 
    const isInitialLoading = efficiencyQuery.isLoading && !summary.lastCalculatedAt; 

    const score = summary.financialEfficiencyScore || 0;
    const exposure = summary.financialExposureTotal || 0; 
    const { level, color } = getEfficiencyDetails(score);
    const scoreDelta = snapshotQuery.data?.scores?.FINANCIAL?.deltaFromPreviousWeek ?? null;
    const reportLink = `/dashboard/properties/${propertyId!}/financial-efficiency`; 

    // State 1: No property selected
    if (!propertyId) {
        return (
            <Card className="min-h-[230px] flex flex-col border-2 border-dashed border-gray-300">
                <CardContent className="flex-1 p-5 flex flex-col items-center justify-center">
                    <DollarSign className="h-8 w-8 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500 text-center mb-3">Select a property</p>
                    <Link href="/dashboard/properties" passHref>
                        <Button variant="secondary" size="sm" className="text-xs">
                            Manage Properties
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        );
    }

    // State 2: Loading or Queued
    if (isInitialLoading || summary.status === 'QUEUED') {
        return (
            <Card className="min-h-[230px] flex flex-col border border-gray-200">
                <CardContent className="flex-1 p-5 flex flex-col items-center justify-center">
                    <Loader2 className="h-8 w-8 text-blue-500 animate-spin mb-2" />
                    <p className="text-sm text-gray-500 text-center">
                        {summary.status === 'QUEUED' ? 'Calculating...' : 'Loading...'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Please wait</p>
                </CardContent>
            </Card>
        );
    }

    // State 3: Missing data
    if (summary.status === 'MISSING_DATA') {
        return (
            <Card className="min-h-[230px] flex flex-col border-2 border-gray-300">
                <CardContent className="flex-1 p-5 flex flex-col items-center justify-center">
                    <Home className="h-8 w-8 text-gray-400 mb-2" />
                    <p className="text-sm font-semibold text-gray-700 text-center mb-1">More Data Needed</p>
                    <p className="text-xs text-gray-500 text-center mb-3">Add cost information</p>
                    <Link href={reportLink} passHref>
                        <Button variant="secondary" size="sm" className="text-xs">
                            Update Costs
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        );
    }

    // State 4: Calculated Report (Happy path)
    return (
        <Link href={reportLink}>
            <Card className="min-h-[230px] flex flex-col border border-white/60 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all cursor-pointer hover:-translate-y-0.5">
                <CardContent className="flex-1 p-5 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-gray-600" />
                            <h3 className="text-base font-semibold text-gray-900">Financial</h3>
                        </div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                    </div>

                    <div className="mb-2 flex items-center justify-between gap-2">
                        <ScoreGauge
                            value={score}
                            label="Financial"
                            sublabel={level}
                            size="md"
                            animate
                        />
                        <div className="text-right">
                            <p className={`text-sm ${color}`}>{level}</p>
                            {scoreDelta === null ? (
                                <span className="text-xs text-gray-500 inline-flex items-center gap-1">
                                    <Minus className="h-3 w-3" />
                                    No weekly change
                                </span>
                            ) : (
                                <span
                                    className={`text-xs inline-flex items-center gap-1 ${
                                        scoreDelta > 0 ? 'text-emerald-600' : scoreDelta < 0 ? 'text-rose-600' : 'text-gray-500'
                                    }`}
                                >
                                    {scoreDelta > 0 ? (
                                        <TrendingUp className="h-3 w-3" />
                                    ) : scoreDelta < 0 ? (
                                        <TrendingDown className="h-3 w-3" />
                                    ) : (
                                        <Minus className="h-3 w-3" />
                                    )}
                                    {scoreDelta > 0 ? '+' : ''}
                                    {scoreDelta.toFixed(1)} vs last week
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="mt-auto">
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
                            <span className="truncate">Annual Cost</span>
                            <span className="ml-2 whitespace-nowrap">{formatCurrency(exposure)}</span>
                        </div>
                        <p className="text-sm text-gray-600">Score {score}/100</p>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
};
