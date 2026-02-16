// apps/frontend/src/app/(dashboard)/dashboard/components/PropertyHealthScoreCard.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Activity, ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import Link from "next/link";
import { ScoredProperty } from "@/app/(dashboard)/dashboard/types";
import React from 'react';
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

const getHealthDetails = (score: number) => {
    if (score >= 85) {
        return { level: "Excellent", color: "text-green-600", progressColor: "bg-green-500" };
    } else if (score >= 70) {
        return { level: "Good", color: "text-blue-600", progressColor: "bg-blue-500" };
    } else if (score >= 50) {
        return { level: "Fair", color: "text-yellow-600", progressColor: "bg-yellow-500" };
    } else {
        return { level: "Needs Attention", color: "text-red-600", progressColor: "bg-red-500" };
    }
};

interface PropertyHealthScoreCardProps {
    property: ScoredProperty;
}

const HIGH_PRIORITY_STATUSES = ['Needs Attention', 'Needs Review', 'Needs Inspection', 'Missing Data'];

export function PropertyHealthScoreCard({ property }: PropertyHealthScoreCardProps) {
    const healthScore = property.healthScore?.totalScore || 0;
    const maxScore = property.healthScore?.maxPotentialScore || 100;
    const percentage = (healthScore / maxScore) * 100;
    const { level, color, progressColor } = getHealthDetails(healthScore);
    const snapshotQuery = useQuery({
        queryKey: ['property-score-snapshot', property.id, 'HEALTH'],
        queryFn: async () => api.getPropertyScoreSnapshots(property.id, 16),
        enabled: !!property.id,
        staleTime: 10 * 60 * 1000,
    });
    const healthDelta = snapshotQuery.data?.scores?.HEALTH?.deltaFromPreviousWeek ?? null;
    
    const totalRequiredActions = property.healthScore?.insights.filter(i => 
        HIGH_PRIORITY_STATUSES.includes(i.status)
    ).length || 0;

    return (
        <Link href={`/dashboard/properties/${property.id}/?tab=maintenance&view=insights`}>
            <Card className="h-[190px] flex flex-col border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer">
                <CardContent className="flex-1 p-5 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Activity className="h-5 w-5 text-gray-600" />
                            <h3 className="text-base font-semibold text-gray-900">Property Health</h3>
                        </div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                    </div>

                    {/* Large Score - Number First */}
                    <div className="mb-2">
                        <div className="flex items-baseline gap-2">
                            <span className={`text-4xl font-bold leading-none ${color}`}>
                                {healthScore}
                            </span>
                            <span className="text-xl text-gray-400 font-normal">/{maxScore}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                            <p className="text-sm text-gray-600">{level}</p>
                            {healthDelta === null ? (
                                <span className="text-xs text-gray-500 inline-flex items-center gap-1">
                                    <Minus className="h-3 w-3" />
                                    No weekly change
                                </span>
                            ) : (
                                <span
                                    className={`text-xs inline-flex items-center gap-1 ${
                                        healthDelta > 0 ? 'text-green-600' : healthDelta < 0 ? 'text-red-600' : 'text-gray-500'
                                    }`}
                                >
                                    {healthDelta > 0 ? (
                                        <TrendingUp className="h-3 w-3" />
                                    ) : healthDelta < 0 ? (
                                        <TrendingDown className="h-3 w-3" />
                                    ) : (
                                        <Minus className="h-3 w-3" />
                                    )}
                                    {healthDelta > 0 ? '+' : ''}
                                    {healthDelta.toFixed(1)} vs last week
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Thin Horizontal Progress Bar */}
                    <div className="mt-auto">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                            <span className="truncate">Maintenance Actions</span>
                            <span className="ml-2 whitespace-nowrap">{totalRequiredActions} Required</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                                className={`h-full ${progressColor} transition-all duration-300`}
                                style={{ width: `${Math.min(percentage, 100)}%` }}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
