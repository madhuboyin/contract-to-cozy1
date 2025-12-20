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

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
}).format(amount);

const getEfficiencyDetails = (score: number) => {
    if (score >= 90) return { level: "Excellent", color: "text-green-600", progressColor: "bg-green-500" };
    if (score >= 70) return { level: "Average", color: "text-yellow-600", progressColor: "bg-yellow-500" };
    return { level: "Below Average", color: "text-red-600", progressColor: "bg-red-500" };
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
    
    const summary = efficiencyQuery.data || FALLBACK_SUMMARY; 
    const isInitialLoading = efficiencyQuery.isLoading && !summary.lastCalculatedAt; 

    const score = summary.financialEfficiencyScore || 0;
    const exposure = summary.financialExposureTotal || 0; 
    const { level, color, progressColor } = getEfficiencyDetails(score);
    const reportLink = `/dashboard/properties/${propertyId!}/financial-efficiency`; 

    // State 1: No property selected
    if (!propertyId) {
        return (
            <Card className="h-[190px] flex flex-col border-2 border-dashed border-gray-300">
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
            <Card className="h-[190px] flex flex-col border border-gray-200">
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
            <Card className="h-[190px] flex flex-col border-2 border-gray-300">
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
            <Card className="h-[190px] flex flex-col border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer">
                <CardContent className="flex-1 p-5 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-gray-600" />
                            <h3 className="text-base font-semibold text-gray-900">Financial Health</h3>
                        </div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                    </div>

                    {/* Large Score - Number First */}
                    <div className="mb-2">
                        <div className="flex items-baseline gap-2">
                            <span className={`text-5xl font-bold leading-none ${color}`}>
                                {score}
                            </span>
                            <span className="text-2xl text-gray-400 font-normal">/100</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{level}</p>
                    </div>

                    {/* Thin Horizontal Progress Bar */}
                    <div className="mt-auto">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                            <span className="truncate">Annual Cost</span>
                            <span className="ml-2 whitespace-nowrap">{formatCurrency(exposure)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                                className={`h-full ${progressColor} transition-all duration-300`}
                                style={{ width: `${score}%` }}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
};