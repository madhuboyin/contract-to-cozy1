// apps/frontend/src/app/(dashboard)/dashboard/components/PropertyRiskScoreCard.tsx
"use client";

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Loader2, Shield, Home, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { PrimaryRiskSummary, RiskSummaryStatus } from '@/types'; 
import React from 'react';

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
}).format(amount);

const RISK_EXPOSURE_CAP = 15000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getRiskDetails = (score: number) => {
    if (score >= 80) return { level: "Low Risk", color: "text-emerald-700", progressColor: "bg-emerald-500" };
    if (score >= 60) return { level: "Moderate Risk", color: "text-amber-600", progressColor: "bg-amber-500" };
    if (score >= 40) return { level: "Elevated Risk", color: "text-orange-600", progressColor: "bg-orange-400" };
    return { level: "High Risk", color: "text-rose-600", progressColor: "bg-rose-400" };
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
            if (!propertyId) {
                return FALLBACK_SUMMARY;
            }
            
            const reportOrStatus = await api.getRiskReportSummary(propertyId);
            
            if (typeof reportOrStatus === 'string') {
                return {
                    propertyId: propertyId,
                    propertyName: null,
                    riskScore: 0,
                    financialExposureTotal: 0,
                    lastCalculatedAt: null,
                    status: reportOrStatus as RiskSummaryStatus,
                } as PrimaryRiskSummary;
            }

            const report = reportOrStatus;
            
            return {
                propertyId: report.propertyId,
                propertyName: null,
                riskScore: report.riskScore,
                financialExposureTotal: typeof report.financialExposureTotal === 'number'
                    ? report.financialExposureTotal
                    : parseFloat(String(report.financialExposureTotal || 0)) || 0,
                lastCalculatedAt: report.lastCalculatedAt,
                status: 'CALCULATED' as RiskSummaryStatus,
            } as PrimaryRiskSummary;
        },
        retry: (failureCount, error: any) => (error?.message?.includes('No property') || error?.message?.includes('5000') ? false : failureCount < 2),
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
        refetchInterval: (query) => {
            const currentStatus = (query.state.data as PrimaryRiskSummary)?.status;
            return currentStatus === 'QUEUED' ? 10000 : false;
        },
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        enabled: enabled,
    });

    const riskSnapshotQuery = useQuery({
        queryKey: ['property-score-snapshot', propertyId, 'RISK'],
        queryFn: async () => {
            if (!propertyId) return null;
            return api.getPropertyScoreSnapshots(propertyId, 16);
        },
        enabled,
        staleTime: 10 * 60 * 1000,
    });
    
    const summary = riskQuery.data || FALLBACK_SUMMARY; 
    const isInitialLoading = riskQuery.isLoading && !summary.lastCalculatedAt; 

    const riskScore = summary.riskScore || 0;
    const exposure = summary.financialExposureTotal || 0;
    const { level, color, progressColor } = getRiskDetails(riskScore);
    const rawRiskProgress = clamp((exposure / RISK_EXPOSURE_CAP) * 100, 0, 100);
    const riskProgress = exposure > 0 ? Math.max(rawRiskProgress, 6) : 0;
    const riskDelta = riskSnapshotQuery.data?.scores?.RISK?.deltaFromPreviousWeek ?? null;
    const reportLink = `/dashboard/properties/${propertyId}/risk-assessment`; 

    // State 1: No property selected
    if (!propertyId || summary.status === 'NO_PROPERTY') {
        return (
            <Card className="h-[190px] flex flex-col border-2 border-dashed border-gray-300">
                <CardContent className="flex-1 p-5 flex flex-col items-center justify-center">
                    <Shield className="h-8 w-8 text-gray-400 mb-2" />
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
                    <p className="text-sm font-semibold text-gray-700 text-center mb-1">More Details Needed</p>
                    <p className="text-xs text-gray-500 text-center mb-3">Complete property info</p>
                    <Link href={reportLink} passHref>
                        <Button variant="secondary" size="sm" className="text-xs">
                            Update Details
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
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-gray-600" />
                            <h3 className="text-base font-semibold text-gray-900">Risk Assessment</h3>
                        </div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                    </div>

                    {/* Large Score - Number First */}
                    <div className="mb-2">
                        <div className="flex items-baseline gap-2">
                            <span className={`text-4xl font-bold leading-none ${color}`}>
                                {riskScore}
                            </span>
                            <span className="text-xl text-gray-400 font-normal">/100</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                            <p className="text-sm text-gray-600">{level}</p>
                            {riskDelta === null ? (
                                <span className="text-xs text-gray-500 inline-flex items-center gap-1">
                                    <Minus className="h-3 w-3" />
                                    No weekly change
                                </span>
                            ) : (
                                <span
                                    className={`text-xs inline-flex items-center gap-1 ${
                                        riskDelta > 0 ? 'text-emerald-600' : riskDelta < 0 ? 'text-rose-600' : 'text-gray-500'
                                    }`}
                                >
                                    {riskDelta > 0 ? (
                                        <TrendingUp className="h-3 w-3" />
                                    ) : riskDelta < 0 ? (
                                        <TrendingDown className="h-3 w-3" />
                                    ) : (
                                        <Minus className="h-3 w-3" />
                                    )}
                                    {riskDelta > 0 ? '+' : ''}
                                    {riskDelta.toFixed(1)} vs last week
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Thin Horizontal Progress Bar */}
                    <div className="mt-auto">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                            <span className="truncate">Exposure</span>
                            <span className="ml-2 whitespace-nowrap">{formatCurrency(exposure)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                                className={`h-full ${progressColor} transition-all duration-300`}
                                style={{ width: `${riskProgress}%` }}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
};
