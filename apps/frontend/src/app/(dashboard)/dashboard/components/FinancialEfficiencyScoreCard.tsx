// apps/frontend/src/app/(dashboard)/dashboard/components/FinancialEfficiencyScoreCard.tsx
"use client";

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { DollarSign, Loader2, ArrowRight, Home } from 'lucide-react';
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

const getFinancialCardTone = (score: number) => {
    if (score >= 80) return "bg-emerald-50/30 border-emerald-200/50";
    if (score >= 60) return "bg-teal-50/30 border-teal-200/50";
    return "bg-amber-50/30 border-amber-200/50";
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
            <Card className="flex h-full flex-col border-2 border-dashed border-gray-300">
                <CardContent className="flex flex-1 flex-col items-center justify-center p-4">
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
            <Card className="flex h-full flex-col border border-gray-200">
                <CardContent className="flex flex-1 flex-col items-center justify-center p-4">
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
            <Card className="flex h-full flex-col border-2 border-gray-300">
                <CardContent className="flex flex-1 flex-col items-center justify-center p-4">
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
            <Card className={`h-full border p-0 shadow-sm transition-all cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${getFinancialCardTone(score)}`}>
                <CardContent className="flex h-full flex-col p-4">
                    <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-gray-600" />
                            <h3 className="text-base font-semibold text-gray-900">Financial</h3>
                        </div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                    </div>

                    <div className="my-3 flex flex-col items-center gap-1.5">
                        <ScoreGauge
                            value={score}
                            label="Financial"
                            sublabel={level}
                            size="summary"
                            strokeWidth={7}
                            animate
                            showLabel={false}
                            showSublabel={false}
                        />
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">FINANCIAL</span>
                        <span className={`text-sm font-bold ${color}`}>{level}</span>
                    </div>

                    <div className="mt-auto border-t border-gray-100 pt-2 text-center">
                        <span className="text-xs text-gray-400">ANNUAL COST</span>
                        <span className="ml-2 text-xs font-semibold text-gray-700">{formatCurrency(exposure)}</span>
                    </div>
                    {scoreDelta !== null ? (
                        <p className="mt-1 text-center text-[11px] text-gray-500">
                            {scoreDelta > 0 ? "+" : ""}
                            {scoreDelta.toFixed(1)} vs last week
                        </p>
                    ) : null}
                </CardContent>
            </Card>
        </Link>
    );
};
