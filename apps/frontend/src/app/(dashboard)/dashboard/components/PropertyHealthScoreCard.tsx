// apps/frontend/src/app/(dashboard)/dashboard/components/PropertyHealthScoreCard.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Activity, ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import Link from "next/link";
import { ScoredProperty } from "@/app/(dashboard)/dashboard/types";
import React from 'react';
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import ScoreGauge from '@/components/ui/ScoreGauge';

const getHealthDetails = (score: number) => {
    if (score >= 85) {
        return { level: "Excellent", color: "text-emerald-600" };
    } else if (score >= 70) {
        return { level: "Good", color: "text-teal-600" };
    } else if (score >= 50) {
        return { level: "Fair", color: "text-amber-500" };
    } else {
        return { level: "Poor", color: "text-red-500" };
    }
};

interface PropertyHealthScoreCardProps {
    property: ScoredProperty;
}

const HIGH_PRIORITY_STATUSES = ['Needs Attention', 'Needs Review', 'Needs Inspection', 'Missing Data'];

export function PropertyHealthScoreCard({ property }: PropertyHealthScoreCardProps) {
    const healthScore = property.healthScore?.totalScore || 0;
    const maxScore = property.healthScore?.maxPotentialScore || 100;
    const { level, color } = getHealthDetails(healthScore);
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
        <Link href={`/dashboard/properties/${property.id}/health-score`}>
            <Card className="h-[190px] flex flex-col border border-white/60 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all cursor-pointer hover:-translate-y-0.5">
                <CardContent className="flex-1 p-5 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Activity className="h-5 w-5 text-gray-600" />
                            <h3 className="text-base font-semibold text-gray-900">Health</h3>
                        </div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                    </div>

                    <div className="mb-2 flex items-center justify-between gap-2">
                        <ScoreGauge
                            value={healthScore}
                            label="Health"
                            sublabel={level}
                            size="md"
                            animate
                        />
                        <div className="text-right">
                            <p className={`text-sm ${color}`}>{level}</p>
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

                    <div className="mt-auto">
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
                            <span className="truncate">Maintenance Actions</span>
                            <span className="ml-2 whitespace-nowrap">{totalRequiredActions} Required</span>
                        </div>
                        <p className="text-sm text-gray-600">Score {healthScore}/{maxScore}</p>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
